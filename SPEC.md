# QR / Data Matrix Scanner for Thunderbird — Specification

A Thunderbird extension that scans the displayed email automatically for 2D codes, Data Matrix first. It looks at image attachments, inline body images and PDF attachments. Decoded codes appear in an overlay panel at the top left of the message, and each code has a copy button. Everything runs locally and offline.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Decoder | **zxing-wasm** (zxing-cpp → WASM), `.wasm` bundled in the XPI and never fetched from a CDN |
| Thunderbird target | **TB 128 ESR+**, **Manifest V3** (non-persistent event-page background) |
| Message access | **Thunderbird APIs**: `messages.listAttachments`, `messages.getAttachmentFile`, `messages.getFull` |
| Sources | Image attachments, inline body images (`cid:` parts and `data:` URIs), PDF attachments. Remote `http(s)` images are **never** fetched |
| Runtime split | Background does the orchestration; a dedicated **Web Worker** does all CPU work (rasterizing, WASM decoding) |
| PDF strategy | **Single pass per page at about 200 DPI**, no escalation (decided in chunk 9: zxing rarely reports a "candidate" for codes too small to decode, so candidate-gated escalation would miss them; dense text pages also produce false QR candidates) |
| Photo strategy | **Single pass at native resolution**, capped at the megapixel limit (decided in chunk 9: a low-resolution first pass gated on candidates silently misses small codes; one full pass is also cheaper than a low-res pass plus fallback for code-free photos) |
| Worker warm-up | WASM is **compiled once** in the background and the compiled `WebAssembly.Module` is passed to each new worker. A worker is terminated only when a job is actually running, never just because the user moved to another message |
| Performance verification | A **benchmark script** (chunks 2 and 10) measures code-free and code-bearing fixtures, and its numbers are used to tune these defaults |
| Trigger | **Scan only when a message is displayed** (preview pane, tab or window). **Never** on mail arrival, never in the background, never for messages that are not on screen. Junk is skipped. Auto-scan can be switched off in settings; a toolbar button then triggers the scan |
| Formats | All 2D: Data Matrix, QR, Micro QR, rMQR, Aztec, PDF417. Each can be toggled |
| Overlay | **Always-expanded panel, fixed in the viewport** at the top left, with **minimize** (to a badge) and **close** (for this message) |
| Copy semantics | **Raw copy** keeps the exact text, including `\x1D`. Display is readable: GS1 as `(01)…(17)…`, control characters as `␝`. GS1 codes also get **Copy as HRI** |
| Binary payloads | Displayed and copied as **Base64**, marked "binary" |
| URLs | **Text only**, never clickable, with the domain highlighted (anti-quishing) |
| Result list | **Deduplicated** across sources. **Scan errors are shown** as subtle notes. No thumbnails, no "copy all", no rescan button |
| Concurrency | **Cancel stale scans**; results **stream** into the overlay one source at a time |
| Cache | **`storage.session` only**, so nothing decoded is written to disk |
| Encryption | **Best effort**: whatever the TB APIs return, with unreadable parts reported as scan errors |
| Limits (defaults, configurable) | Attachment ≤ **10 MB**, image ≤ 40 MP (larger ones are downscaled), PDF ≤ 20 pages, 30 s per attachment |
| Settings page | Size and other limits, format toggles, source toggles, auto-scan on/off |
| Language / build | **TypeScript (strict) + esbuild**, `web-ext` for lint and packaging, unminified with sourcemaps (ATN-ready) |
| Tests | **Vitest**: decoder golden tests on generated, committed fixtures; orchestration tests against a fake `messenger`; unit/integration tests for formatting, dedup and the overlay state and DOM. No E2E; a manual QA checklist covers that |
| i18n | `_locales/en` and `_locales/de` |
| Module layout | **Feature folders** (`src/features/*`), thin `src/platform/*` adapters, composition roots in `src/entries/*` |

---

## 1. Architecture

### 1.1 Runtime components

```
┌──────────────────────────── Thunderbird ─────────────────────────────┐
│                                                                      │
│  Message pane (per displayed message)                                │
│  ┌───────────────────────────────┐                                   │
│  │ display.js (message display   │   runtime.connect({name:"scan"})  │
│  │ script, closed shadow DOM     │◀──────── Port (streaming) ──────┐ │
│  │ overlay)                      │                                 │ │
│  └───────────────────────────────┘                                 │ │
│                                                                    │ │
│  Background (MV3 event page)                                       │ │
│  ┌─────────────────────────────────────────────────────────────────┴┐│
│  │ background.js: scan-pipeline orchestrator                         ││
│  │  - resolves displayed message for port.sender.tab                 ││
│  │  - plans sources (attachments, inline parts, data: URIs)          ││
│  │  - applies limits, session cache, dedup                           ││
│  │  - forwards per-source jobs to the worker                         ││
│  └───────────────┬──────────────────────────────────────────────────┘│
│                  │ postMessage (ArrayBuffer transferred)             │
│  ┌───────────────▼──────────────────────────────────────────────────┐│
│  │ scanner-worker.js (dedicated Worker)                              ││
│  │  - image → ImageData (createImageBitmap + OffscreenCanvas)        ││
│  │  - PDF → pages → ImageData (pdf.js on OffscreenCanvas)            ││
│  │  - zxing-wasm readBarcodes()                                      ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

The rules:
- **The port is the scan's lifetime.** A display script connecting starts a scan for that tab's displayed message. The port disconnecting (the user navigated to another message, closed the tab or selected several messages) cancels it. The open port also keeps the MV3 event page alive for the duration of the scan.
- **Scanning happens only on display (performance).** The extension registers **no** `messages.onNewMailReceived` listener, does no folder or background pre-scanning, and does no prefetching of neighbouring messages. A scan exists only while a message is on screen and its display script holds a port.
- **One worker, sequential jobs.** Cancellation and timeouts **terminate** the worker **only if a job is running**, because terminating is the only reliable way to stop a WASM call mid-flight. An idle worker survives message switches. The next job spawns a fresh worker lazily. The worker is also terminated after 60 s idle to free memory.
- **The WASM is compiled once per background lifetime.** The background compiles `zxing_reader.wasm` with `WebAssembly.compile` and sends the `WebAssembly.Module` (structured-cloneable) to each new worker. The worker instantiates it through the Emscripten `instantiateWasm` override, so a respawn costs instantiation only, not compilation.
- **The code-free case must be cheap.** Most attachments contain no code, and a code-free search is zxing's slowest path. Each source therefore gets exactly one decode pass (native resolution for images, about 200 DPI for PDF pages); the benchmark keeps these costs visible.
- **Decoded content never reaches `innerHTML`.** The overlay renders with `textContent` only.
- **No network.** No remote fetches anywhere. pdf.js gets local `cMapUrl` and `standardFontDataUrl`, and `isEvalSupported: false`.

### 1.2 Module layout (feature folders)

```
src/
  entries/                     # composition roots only: wiring, no logic
    background.ts
    scanner-worker.ts
    display.ts
    options.ts
  features/
    decode/                    # zxing-wasm wrapper → normalized DecodedCode
    image-scan/                # image attachment discovery + image rasterizing
    inline-images/             # cid: parts + data: URIs from HTML body
    pdf-scan/                  # PDF discovery + adaptive pdf.js rasterizing
    scan-pipeline/             # orchestrator, source planning, worker client,
                               # cancellation, limits, session cache, dedup
    readable-text/             # GS1 HRI, control pictures, Base64, URL domain split
    overlay/                   # panel state reducer + DOM view + copy
    settings/                  # schema, defaults, validation, options page, auto-scan toggle
  platform/
    tb-api.ts                  # the only file touching messenger.* (typed, version-hedged)
    worker-host.ts             # spawn / post / terminate Worker
    clipboard.ts               # navigator.clipboard wrapper
  shared/
    types.ts                   # DecodedCode, SourceRef, ScanEvent, ErrorReason …
    port-protocol.ts           # background ⇄ display messages
    worker-protocol.ts         # background ⇄ worker messages
    i18n.ts                    # t(key, subs) over messenger.i18n
static/
  manifest.json
  _locales/{en,de}/messages.json
  options.html
  icons/
scripts/
  build.ts                     # esbuild + static asset copy (wasm, pdf.js worker, cmaps, fonts)
  gen-fixtures.ts              # deterministic fixture generator (bwip-js, pdf-lib, @napi-rs/canvas)
tests/
  fixtures/                    # committed outputs of gen-fixtures + a few hand-added "realistic" ones
  fakes/fake-messenger.ts      # in-memory fake of the messenger.* subset we use
  helpers/                     # builders: aMessage(), anImageAttachment(), …
```

Tests are **colocated** as `*.test.ts` next to the feature code. Cross-feature integration tests live in `tests/integration/`.

### 1.3 Core types (`src/shared/types.ts`)

```ts
type CodeFormat = 'DataMatrix' | 'QRCode' | 'MicroQRCode' | 'rMQRCode' | 'Aztec' | 'PDF417';
type ContentKind = 'Text' | 'Binary' | 'GS1' | 'ISO15434' | 'URI' | 'Mixed' | 'UnknownECI';

interface DecodedCode {
  format: CodeFormat;
  text: string;          // raw decoded text, keeps \x1D etc.
  bytesB64: string;      // raw payload bytes (dedup key + binary display)
  contentKind: ContentKind;
  symbologyId: string;   // e.g. "]d2" = GS1 DataMatrix
}

type SourceRef =
  | { kind: 'attachment'; name: string; partName: string; page?: number }
  | { kind: 'inline'; name: string; partName?: string; dataUriIndex?: number };

interface ScanEntry extends DecodedCode { sources: SourceRef[] }

type ErrorReason =
  | 'too-large' | 'page-limit' | 'timeout' | 'unreadable'
  | 'encrypted-pdf' | 'unsupported-type';
interface SourceError { source: SourceRef; reason: ErrorReason; detail?: Record<string, number> }
```

---

## 2. Implementation chunks

Each chunk is one reviewable, independently committed change. Chunks are ordered so that every commit builds, passes its tests and leaves the extension loadable.

**Conventions (applies to all chunks):** follow `CLAUDE.md` from chunk 0: minimal comments, state-free and functional code, deep modules, DAMP tests.

**Test style (applies to all chunks).** Tests are DAMP: each test reads top to bottom on its own. Use builder helpers (`aMessageWith(anImageAttachment('label.png', fixture('datamatrix-gs1.png')))`) and avoid shared mutable `beforeEach` state. Test names describe behavior ("reports a timeout and continues with the next attachment"). Every assertion is about observable output: port events, overlay text, clipboard contents.

---

### Chunk 0 — Project initialization: repository hygiene and engineering conventions

**Why:** Fixes the ground rules before any code exists, so every later chunk (and every AI-assisted change) follows the same conventions, and reviewers can point at them.

Constraints / changes:
- `.gitignore`: `node_modules/`, `dist/`, `*.xpi`, `coverage/`, `.vitest-cache/`, `*.log`, `.DS_Store`, editor folders (`.idea/`, `.vscode/` except a shared `extensions.json` if one is added later), `.env*`. Generated fixtures are **not** ignored, because they are committed on purpose.
- `CLAUDE.md`: short and imperative, in the form of rules rather than an essay. It links to `SPEC.md` as the source of truth for scope and chunk order. Sections:
  - **Comments:** keep them to a minimum. Comment only non-obvious implications, trade-offs or constraints (e.g. "terminate is the only way to stop a running WASM call", "TB 128 returns X for inline parts"). No comments that restate the code, no JSDoc for self-explanatory signatures, no commented-out code, no change-log comments.
  - **State-free, functional style:** prefer pure functions over classes and mutable state. Push side effects (`messenger.*`, Worker, clipboard, storage, DOM) to the edges: `src/platform/*` and the `src/entries/*` composition roots. Pass dependencies in explicitly instead of importing singletons. Use immutable data and return new values rather than mutating arguments. State that must exist, such as the overlay state or the cancellation of a scan, lives in one place and is changed only through pure reducers or explicit signals.
  - **Deep modules:** each feature folder exposes a **small interface** (one `index.ts` with a few functions and types) that hides substantial implementation. Feature internals are never imported from outside the feature, and lint enforces this. Prefer fewer, more capable functions over many shallow pass-through layers. No interfaces with a single implementation unless a test or platform seam needs one, and seams belong in `platform/`.
  - **Tests:**
    - Tests are **DAMP**, optimized for readability over deduplication. Each test reads top to bottom on its own and states its arrange, act and assert visibly.
    - Shared setup goes through descriptive builders (`aMessageWith(anImageAttachment(...))`) instead of shared mutable `beforeEach` state.
    - Test names describe behavior in plain language.
    - Assert on observable outcomes (port events, rendered text, clipboard contents), not on internals. Use fakes over mocks, and keep the fakes in `tests/fakes`.
    - Cover the important paths, not every line.
  - **Workflow:** one spec chunk per commit; `npm run typecheck && npm run lint && npm test` must pass before each commit; no new dependency without pinning an exact version and stating why in the commit message.
  - **Hard constraints, repeated from the spec because they are easy to violate accidentally:**
    - No network access, and no remote fetches of any kind.
    - Decoded content never goes into `innerHTML`.
    - Only `platform/tb-api.ts` touches `messenger.*`.
    - Nothing decoded is persisted to disk.
- No code and no `package.json` yet. Those come in chunk 1.

Files: `.gitignore`, `CLAUDE.md`.

Tests: none.

---

### Chunk 1 — Project skeleton: a loadable MV3 extension

**Why:** Sets up the build, lint, test and packaging once, so the feature chunks contain only feature code.

Constraints / changes:
- `package.json` with pinned exact versions (no `^`) and a committed lockfile. Scripts: `build`, `watch`, `test`, `lint`, `typecheck`, `package` (web-ext build → `dist/*.xpi`), `fixtures`.
- TypeScript `strict`, `noUncheckedIndexedAccess`. Thunderbird WebExtension types come from `@types/thunderbird-webext-browser` or a local `messenger.d.ts`; only `platform/tb-api.ts` may reference the global `messenger`, and an ESLint `no-restricted-globals` rule enforces this.
- esbuild bundles 4 entries (background, scanner-worker, display, options) as ESM, **unminified, with sourcemaps** (ATN reviewability). `scripts/build.ts` copies the static assets into `dist/`.
- Manifest V3: `browser_specific_settings.gecko.strict_min_version: "128.0"`, background `{ scripts: ["background.js"], type: "module" }`, `default_locale: "en"`, CSP `extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'"`, permissions `messagesRead`, `accountsRead` (for `folder.specialUse`), `storage`, `clipboardWrite`, plus whatever display-script registration needs (see `tb-api.ts`).
- `platform/tb-api.ts`: registers the display script via `messenger.scripting.messageDisplay.registerScripts` when available, falling back to `messenger.messageDisplayScripts.register`. **Verify against TB 128 during implementation and document the result in a code comment.**
- The display script at this stage only connects a port and logs. The background accepts the port. This is a smoke test that the plumbing works.
- `README.md`: how to build and load a temporary add-on in TB (`about:debugging`), and how to run the tests.

Gist:
```ts
// src/entries/background.ts
registerDisplayScript({ js: ['display.js'] });
onScanPortConnected(port => console.debug('scan port', port.sender?.tab?.id));
```

Files: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `scripts/build.ts`, `static/manifest.json`, `static/_locales/en/messages.json`, `static/icons/*`, `src/entries/{background,display}.ts`, `src/platform/tb-api.ts`, `README.md`.

Tests: none beyond `typecheck`, `lint` and `web-ext lint` in CI (`npm test` runs vitest with `--passWithNoTests`).

---

### Chunk 2 — Decode 2D codes from pixels (Data Matrix first)

**Why:** This is the core capability. It is isolated from Thunderbird so decoding quality can be proven with golden tests.

Constraints / changes:
- `features/decode/decode.ts`: `decodePixels(img: {data, width, height}, opts): Promise<DecodeResult>`, where `DecodeResult = { codes: DecodedCode[]; candidates: number }`.
- zxing-wasm `readBarcodes` with `formats` from the options (default: all six 2D formats), `tryHarder: true`, `tryRotate: true`, `tryInvert: true`, `tryDownscale: true`, `maxNumberOfSymbols: 255`, `textMode: 'Plain'`, `returnErrors: true`. `isValid` results become `codes`. Invalid results that carry a detected position are counted as `candidates`, which drives the escalation decisions in chunks 9 and 10.
- **Verify** with the small-DM fixture (chunk 10) that zxing reports a candidate for a Data Matrix that is too small to decode at 150 DPI. If it does not, the documented fallback is a single PDF pass at about 200 DPI with no escalation (see chunk 10).
- WASM loading is injectable: `prepareZXingModule({ overrides: { instantiateWasm } })` takes a precompiled `WebAssembly.Module`. The extension compiles from `runtime.getURL('zxing_reader.wasm')` in the background (chunk 8), and Node tests compile from `node_modules`. It is never fetched remotely.
- Results are normalized to `DecodedCode` (`bytesB64` from the result bytes, `contentKind` from zxing's `contentType`, `symbologyId`).
- **Verify with a fixture** that for GS1 Data Matrix, Plain `text` contains `\x1D` as the separator. If it does not, rebuild `text` from bytes. The finding is recorded in a comment.
- `scripts/gen-fixtures.ts` deterministically generates fixtures with bwip-js plus @napi-rs/canvas: plain DM, GS1 DM (pharma-style `01/17/10/21`), small DM (10×10 modules at 2 px/module), DM rotated 30°, multiple DMs in one image, DM inverted, QR URL, binary-payload DM, an image without any code, and a noisy photo-like DM (blur plus perspective). Outputs go to `tests/fixtures/images/`.

- `scripts/bench.ts` (`npm run bench`, not part of `npm test`) decodes each fixture N times in Node and prints the median and p95 times. It runs code-free fixtures (a 12 MP photo-like image, a 4 MP screenshot, a small logo) next to code-bearing ones. The results go into the PR description and are used to tune the defaults: the 4 MP first pass, the try* options, and the candidate gating.

Gist:
```ts
export async function decodePixels(img: Pixels, o: DecodeOptions): Promise<DecodeResult> {
  const results = await readBarcodes(toImageData(img), toZxingOptions(o));
  return {
    codes: results.filter(r => r.isValid).map(toDecodedCode),
    candidates: results.filter(r => !r.isValid && hasPosition(r)).length,
  };
}
```

Files: `src/features/decode/{decode.ts,zxing-options.ts,decode.test.ts}`, `src/shared/types.ts`, `scripts/gen-fixtures.ts`, `scripts/bench.ts`, `tests/fixtures/images/*`, `tests/helpers/load-fixture.ts`, `package.json` (zxing-wasm, dev: bwip-js, @napi-rs/canvas).

Tests (golden): for each fixture, the expected `format`, `text` and `contentKind`. That multiple codes are all found. That a code-less image returns no codes **and 0 candidates** (otherwise the gating would escalate on every photo). That disabled formats are not reported.

---

### Chunk 3 — Scan image attachments of the displayed message

**Why:** This is the first end-to-end behavior: open a mail with an image attachment and the background produces decoded codes on the port. The overlay comes in chunk 4.

Constraints / changes:
- **Trigger:** a display-script port connects → `tb-api.getDisplayedMessage(tabId)` → skip if it is not exactly one message, if `message.junk`, or if `folder.specialUse` includes `junk` → plan → scan.
- **Source planning** (`scan-pipeline/plan-sources.ts`, pure): from `listAttachments()`, take parts with `contentType` `image/png|jpeg|gif|webp|bmp` (case-insensitive). If the content type is generic (`application/octet-stream`), sniff the extension. SVG and TIFF are `unsupported-type`, and are silently ignored (not shown as an error).
- **Worker** (`entries/scanner-worker.ts` + `features/image-scan/raster-image.ts`): `createImageBitmap(blob)` (first frame for GIF) → `OffscreenCanvas` → `ImageData` → `decodePixels`.
- **Worker protocol** (`shared/worker-protocol.ts`): request `{ jobId, kind: 'image', bytes: ArrayBuffer (transferred), mime, decode: DecodeOptions }` → responses `{ jobId, type: 'codes', codes, page? }`, `{ jobId, type: 'done' }`, `{ jobId, type: 'error', reason }`.
- **Port protocol** (`shared/port-protocol.ts`) is streaming: `scan-started { sourceCount }`, `codes { source, codes }`, `source-error { source, reason, detail? }`, `scan-finished`, and `idle` (nothing to scan).
- Sources are scanned sequentially, in attachment order. Events are posted to the port as soon as each source finishes.
- The `platform/worker-host.ts` abstraction (`spawn`, `post`, `onMessage`, `terminate`) lets the orchestrator tests swap in an in-process fake worker that calls `decodePixels` directly.

Gist:
```ts
// scan-pipeline/orchestrator.ts
export async function runScan(ctx: ScanContext, emit: (e: ScanEvent) => void) {
  const msg = await ctx.tb.getDisplayedMessage(ctx.tabId);
  if (!msg || isJunk(msg)) return emit({ type: 'idle' });
  const sources = planSources(await ctx.tb.listAttachments(msg.id), ctx.settings);
  emit({ type: 'scan-started', sourceCount: sources.length });
  for (const s of sources) await scanSource(ctx, msg, s, emit);
  emit({ type: 'scan-finished' });
}
```

Files: `src/features/scan-pipeline/{orchestrator.ts,plan-sources.ts,worker-client.ts,*.test.ts}`, `src/features/image-scan/{raster-image.ts,image-types.ts}`, `src/entries/{background.ts,scanner-worker.ts}`, `src/platform/{tb-api.ts,worker-host.ts}`, `src/shared/{port-protocol.ts,worker-protocol.ts}`, `tests/fakes/fake-messenger.ts`, `tests/helpers/builders.ts`.

Tests:
- A displayed message with a DM PNG attachment emits `scan-started(1)`, `codes(label.png, [DM…])` and `scan-finished`, in that order.
- A message with a PDF and a `.txt` attachment, no images, emits `idle` or `scan-started(0)` (decide one in the implementation and assert it).
- A junk message (flag) and a message in the Junk folder are both skipped.
- An `application/octet-stream` file named `scan.JPG` is scanned.
- A corrupt PNG emits `source-error(unreadable)` and the next attachment is still scanned.
- New mail arriving in the fake messenger triggers no attachment download and no worker spawn; only a display port does.

---

### Chunk 4 — Overlay panel with copy

**Why:** Makes the results visible and usable, which is the user-facing core.

Constraints / changes:
- Host element appended to `document.documentElement`, **closed shadow root**, `position: fixed; top: 8px; left: 8px; z-index: 2147483647`. All styles live inside the shadow, so the mail's CSS can't break the panel and the panel doesn't leak styles into the mail.
- **Always expanded** while results exist. Header: icon, "N codes", a scanning spinner while running, a **minimize** button (`–`) and a **close** button (`✕`).
  - Minimize collapses to a small badge (`▦ N`), and clicking the badge restores the panel. This is per message, not persisted.
  - Close removes the panel for this message display. The next message shows the panel again.
- `max-height: 40vh`, with the list scrolling inside. `max-width: min(480px, 90vw)`. Long values wrap (`overflow-wrap: anywhere`).
- **Visibility:** the panel stays hidden until the first `codes` or `source-error` event, with no flicker for mails without codes. While scanning with ≥1 result, it shows the spinner. Once finished with 0 codes and 0 errors, nothing is ever shown.
- Each entry has a format label (`Data Matrix`, `QR`…), the source label (`label.pdf · p.2` or `inline image`), the value and a **Copy** button.
- Copy writes the **raw `text`** via `navigator.clipboard.writeText` in the click handler (a user gesture). The button shows "Copied ✓" for 1.5 s. Failures show "Copy failed".
- **URLs** (`contentKind === 'URI'` or a `^https?://` match) are rendered as plain text, never as `<a>`, with the host part in bold. No click handling.
- All decoded content goes through `textContent`. **No `innerHTML` anywhere in the overlay** (enforced by an ESLint `no-restricted-properties` rule).
- **State is a pure reducer** (`overlay/state.ts`): `(state, PortEvent | UiAction) → state`. The view is a thin `render(state, root)`, which makes both easy to test.
- All strings go through `shared/i18n.ts` (`_locales/en` only at this point).

Gist:
```ts
type OverlayState = {
  phase: 'waiting' | 'scanning' | 'done' | 'idle';
  entries: ScanEntry[]; errors: SourceError[];
  minimized: boolean; closed: boolean;
};
export function reduce(s: OverlayState, e: PortEvent | UiAction): OverlayState;
export function isVisible(s: OverlayState): boolean; // !closed && (entries.length || errors.length)
```

Files: `src/features/overlay/{state.ts,view.ts,overlay.css,copy-button.ts,state.test.ts,view.test.ts}`, `src/entries/display.ts`, `src/platform/clipboard.ts`, `src/shared/i18n.ts`, `static/_locales/en/messages.json`, `build.ts` (CSS inlined as text into the display bundle), `eslint.config.js`.

Tests (happy-dom):
- When codes stream in, the panel appears after the first `codes` event and lists them in arrival order.
- No panel is ever rendered for `scan-started` → `scan-finished` with nothing in between.
- Clicking Copy on a GS1 entry writes the exact raw string, including `\x1D`, to the (faked) clipboard.
- A URL code renders with no anchor element, and the host `evil.example` is in a bold element.
- A code containing `<img src=x onerror=…>` is rendered as literal text.
- Minimize shows the badge with the count, and clicking the badge restores the panel. Close removes the host.

---

### Chunk 5 — Readable display: GS1 HRI, control characters, binary as Base64

**Why:** The main use case is Data Matrix, which frequently carries GS1 data (pharma, UDI, logistics) or binary data. Raw strings with invisible separators are unreadable.

Constraints / changes:
- `readable-text/gs1.ts`: `toHri(raw: string): string | null` parses the GS1 element string. It uses a table of AIs with predefined fixed lengths (00, 01, 02, 11–17, 20, 31xx–36xx, 41x, …); variable-length AIs end at `\x1D` or end of string. It returns `null` if parsing fails, and the UI then falls back to the control-picture display.
- GS1 is detected when `contentKind === 'GS1'` or `symbologyId` is `]d2`, `]Q3`, `]C1` or `]e0`.
- `readable-text/display-text.ts`: `toDisplay(code): { text: string; kind: 'gs1' | 'binary' | 'url' | 'text' }`.
  - GS1 → HRI `(01)04012345678901(17)251231(10)ABC`.
  - Binary (`contentKind === 'Binary'`) → **Base64** of the bytes, with a "binary" tag.
  - Otherwise, C0 control characters are mapped to Unicode control pictures (`\x1D` → `␝`, `\x1E` → `␞`, `\x04` → `␄`). This also covers ISO 15434 `[)>␞06␝…`.
- Copy behavior:
  - The default **Copy** puts **raw `text`** on the clipboard for text, GS1 and URLs, and **the Base64 string** for binary.
  - GS1 entries get an additional **Copy as HRI** button.

Files: `src/features/readable-text/{gs1.ts,gs1-ai-table.ts,display-text.ts,gs1.test.ts,display-text.test.ts}`, `src/features/overlay/{view.ts,view.test.ts}`, `static/_locales/en/messages.json`.

Tests:
- A pharma GS1 string `01…17…10…␝21…` is converted to the bracketed HRI.
- A variable-length AI at the end of the string is handled without a trailing GS.
- An unknown AI makes `toHri` return `null`, and the display falls back to `␝` pictures.
- The binary fixture from chunk 2 is displayed and copied as the same Base64 string.
- An ISO 15434 string shows control pictures, while Copy still yields the raw control characters.

---

### Chunk 6 — Deduplicate codes across sources

**Why:** Mails often embed the same image inline and as an attachment, and PDFs repeat a code on several pages. Without dedup the list fills with duplicates.

Constraints / changes:
- `scan-pipeline/dedupe.ts` (pure): `mergeCodes(entries: ScanEntry[], incoming: DecodedCode[], source: SourceRef): ScanEntry[]`. The key is `format + bytesB64`. A match appends the source (no duplicate `SourceRef`); first-seen order is kept.
- Merging happens **in the overlay reducer**, so streaming stays incremental, and the background stays stateless per event.
- The source line shows the first source plus "+N more". Its `title` attribute lists all of them.

Files: `src/features/scan-pipeline/{dedupe.ts,dedupe.test.ts}`, `src/features/overlay/{state.ts,view.ts,state.test.ts}`.

Tests:
- The same DM in `scan.png` and on PDF page 3 gives one entry with two sources.
- The same text in QR and in Data Matrix gives two entries, because the formats differ.
- The same code twice in one image gives one entry with one source.

---

### Chunk 7 — Inline body images (`cid:` parts and `data:` URIs)

**Why:** Codes are often embedded in the HTML body rather than attached.

Constraints / changes:
- `inline-images/find-inline-parts.ts` (pure): walks the `messages.getFull()` part tree and collects `image/*` parts that have a `Content-ID` or `Content-Disposition: inline`. The scan then fetches their bytes via `getAttachmentFile(messageId, partName)`. **Verify in TB 128 that `getAttachmentFile` accepts inline part names; if it does not, document the fallback** (e.g. `getFull` with decoded content where available).
- Parts already returned by `listAttachments` are de-duplicated **by `partName`** at planning time, so the same part is never scanned twice.
- `inline-images/find-data-uris.ts`: for `text/html` body parts, parse with `DOMParser` (available in the event page) and collect `img[src^="data:image/"]`. The Base64 is decoded to bytes. Each data URI counts against the size limit. At most 50 data URIs are scanned per message.
- Remote `http(s)` image references are **ignored, never fetched**.
- The source label is "inline image" (plus the filename if the part has one).
- A new source toggle, `scanInlineImages`, is read from settings defaults (the setting is wired to the UI in chunk 11).

Files: `src/features/inline-images/{find-inline-parts.ts,find-data-uris.ts,*.test.ts}`, `src/features/scan-pipeline/plan-sources.ts`, `src/platform/tb-api.ts`, `tests/fakes/fake-messenger.ts`, `tests/fixtures/mime/*` (part trees as JSON).

Tests:
- A multipart/related HTML mail with a `cid:` DM image yields a code with an inline source.
- An image part that is both inline and listed as an attachment is scanned once.
- An HTML body with a `data:image/png;base64,…` QR is decoded.
- An HTML body with `<img src="https://tracker…">` makes no fetch call (asserted on a spy `fetch`).

---

### Chunk 8 — Cancel stale scans and cache results per session

**Why:** Users scroll through their inbox. Scans of messages that are no longer visible must stop wasting CPU, and re-opening a message should be instant.

Constraints / changes:
- The orchestrator receives an `AbortSignal` tied to `port.onDisconnect`. The signal is checked between sources and between PDF pages. On abort, the client calls `worker.terminate()` **only if a job is in flight**, so a running WASM or pdf.js call stops immediately. An idle worker is kept for the next scan.
- **Warm respawn:** `worker-client.ts` compiles the WASM once per background lifetime (`WebAssembly.compile(await fetch(runtime.getURL('zxing_reader.wasm')))`, a local extension URL) and posts the resulting `WebAssembly.Module` in each new worker's `init` message. The worker passes it to `prepareZXingModule({ overrides: { instantiateWasm } })`. pdf.js is imported lazily inside the worker on the first PDF job only.
- Every message display gets a fresh scan context. A new port from the same tab implicitly cancels any previous scan for that tab.
- **Session cache** (`scan-pipeline/session-cache.ts`) uses `storage.session`. The key is `scan:v1:${messageId}:${settingsHash}`, and the value is `{ entries, errors }`, the final deduped result.
  - Only **completed** scans are written; aborted or partial ones never are.
  - A cache hit replays as `scan-started` → `codes` (per entry) → `scan-finished`, so the overlay code path is identical.
  - `settingsHash` covers every setting that affects results (formats, sources, limits), so changing settings naturally invalidates the cache.
  - Nothing is written to `storage.local` or anywhere persistent.
- The worker is terminated after 60 s idle.

Files: `src/features/scan-pipeline/{orchestrator.ts,worker-client.ts,session-cache.ts,settings-hash.ts,*.test.ts}`, `src/entries/background.ts`, `src/platform/tb-api.ts`.

Tests:
- Disconnecting the port during the 2nd of 3 attachments terminates the worker, emits nothing more and writes nothing to the cache.
- Re-displaying a completed message replays the cached result without any `getAttachmentFile` call.
- A changed format setting results in a cache miss and a rescan.
- After a cancel, the next scan works, using a fresh worker, and the WASM is **not compiled again** (asserted on a compile spy: exactly one compile across both scans).
- Disconnecting the port while no job is running does not terminate the worker.

---

### Chunk 9 — Limits and scan-error reporting

**Why:** Protects against huge or malicious attachments (decompression bombs, giant images), and tells the user when something could not be scanned rather than failing silently.

Constraints / changes:
- `features/settings/schema.ts` introduces typed settings with defaults and clamping validation:
  - `maxAttachmentMB` = **10** (1–100)
  - `maxImageMegapixels` = 40 (5–200)
  - `maxPdfPages` = 20 (1–200)
  - `perAttachmentTimeoutSec` = 30 (5–300)

  `loadSettings()` reads `storage.local` and merges it with the defaults.
- **Size:** attachments whose `size` exceeds the limit are skipped **before download** and reported with `source-error(too-large, { sizeMB, limitMB })`. Data URIs are checked after Base64 decode.
- **Megapixels:** images above the limit are **downscaled** to the limit (aspect ratio kept) before decoding. This is not an error, but it is logged.
- **Single pass for images:** every image is decoded once at native resolution, downscaled only to `maxImageMegapixels`. (Originally a 4 MP first pass with candidate-gated escalation; dropped because zxing almost never reports a candidate for a code that is too small at reduced resolution.)
- **Timeout:** each source runs under a timer. On expiry the worker is terminated, `source-error(timeout)` is emitted, and the next source continues on a fresh worker.
- **Unreadable:** decode or parse failures, and parts the TB API returns as encrypted or unreadable (best-effort encryption support), are reported as `source-error(unreadable)`.
- **Overlay:** errors appear below the codes as a muted, compact list, e.g. "big-scan.pdf — skipped (14 MB > 10 MB limit)" or "label.pdf — timed out after 30 s". If there are only errors and no codes, the panel still shows (the user should know something wasn't scanned).
- All limit numbers come from the settings object passed into the scan context and are never hardcoded in the features.

Files: `src/features/settings/{schema.ts,load-settings.ts,schema.test.ts}`, `src/features/scan-pipeline/{limits.ts,orchestrator.ts,worker-client.ts,*.test.ts}`, `src/features/image-scan/raster-image.ts`, `src/features/overlay/{view.ts,state.ts,view.test.ts}`, `static/_locales/en/messages.json`.

Tests:
- A 12 MB attachment with the default settings is never downloaded (spy) and is reported as too large. With `maxAttachmentMB: 20` it is scanned.
- An attachment that hangs the fake worker reports a timeout, and the following attachment's codes still arrive.
- A 60 MP image fixture (generated) with a DM still decodes after downscaling to 40 MP.
- A code-free 12 MP image is decoded exactly once, at native resolution (spy on `decodePixels` calls and the dimensions they receive).
- A 12 MP image whose DM is too small to decode at 4 MP is decoded.
- An errors-only result still shows the panel, with the error line text.
- Out-of-range stored settings are clamped (e.g. `maxAttachmentMB: 0` becomes 1).

---

### Chunk 10 — PDF attachments (single 200 DPI pass)

**Why:** Data Matrix codes very often appear in PDFs (labels, prescriptions, invoices), and are frequently drawn as vectors.

Constraints / changes:
- PDFs are planned by `application/pdf` or a `.pdf` extension. The `scanPdfs` source toggle defaults to on.
- `pdf-scan/raster-pdf.ts` runs in the worker. It uses **pdfjs-dist** (exact version pinned) inside our dedicated worker, either with its own worker as a nested module worker or via `workerPort`; pick whichever works in TB 128 and document it. Options: `isEvalSupported: false`, local `cMapUrl`/`standardFontDataUrl` (copied into `dist/pdfjs/` by the build), and no network.
- **One pass per page:** render at a scale equivalent to **200 DPI** and decode. The pixel cap `maxImageMegapixels` applies to each render, and DPI is lowered to fit.
- (Originally candidate-gated 150 → 300 DPI; replaced by the single pass in chunk 9, see the decisions table.)
- `scripts/bench.ts` is extended with PDF fixtures: a code-free 10-page text invoice, the 3-page mixed PDF and the small-DM PDF. It reports time per page and the peak canvas size.
- Codes stream **per page**: the worker posts `codes { page }` after each page, the background forwards them, and the source label shows `file.pdf · p.N`.
- Only the first `maxPdfPages` pages are scanned. If the document has more, the result also includes `source-error(page-limit, { scanned, total })`, shown as "only first 20 of 57 pages scanned".
- Password-protected or encrypted PDFs → `source-error(encrypted-pdf)`. Malformed PDFs → `unreadable`.
- Abort and timeout checks run between pages (in addition to worker termination).
- Each page canvas is released after decoding (`page.cleanup()`, zeroing the canvas size) to bound memory.
- The Node tests use the pdfjs-dist Node build with a `@napi-rs/canvas` canvas factory, injected through the same `RasterTarget` interface the worker uses with `OffscreenCanvas`.

Gist:
```ts
for (let p = 1; p <= Math.min(doc.numPages, limits.maxPdfPages); p++) {
  signal.throwIfAborted();
  const r = await decodePixels(await renderPage(doc, p, dpiFor(200, limits)), opts);
  post({ type: 'codes', page: p, codes: r.codes });
}
```

Files: `src/features/pdf-scan/{raster-pdf.ts,render-target.ts,raster-pdf.test.ts}`, `src/entries/scanner-worker.ts`, `src/features/scan-pipeline/plan-sources.ts`, `src/shared/worker-protocol.ts`, `scripts/build.ts`, `scripts/gen-fixtures.ts`, `tests/fixtures/pdf/*`, `package.json` (pdfjs-dist, dev: pdf-lib).

Fixtures (generated with pdf-lib): a vector DM (bwip-js SVG path drawn with `drawSvgPath`), a raster DM (embedded PNG), a small DM that is only readable at about 200 DPI, a 3-page PDF with codes on pages 1 and 3, a 25-page PDF, an encrypted PDF and a truncated PDF.

Tests:
- A vector DM in a PDF is decoded, and its source is labeled with the page number.
- The small DM is found at the 200 DPI pass.
- The code-free 10-page invoice is rendered exactly 10 times, all at 200 DPI.
- In the 25-page PDF with default settings, only 20 pages are rendered and a page-limit note is emitted.
- The encrypted PDF reports `encrypted-pdf`, and the truncated one reports `unreadable`. Neither throws out of the scan.

---

### Chunk 11 — Settings page, format/source toggles, manual scan when auto-scan is off

**Why:** Users can tune limits, formats and sources, or switch to on-demand scanning.

Constraints / changes:
- `options_ui` page (`static/options.html` + `entries/options.ts`), plain HTML/CSS, with all strings localized.
  - **Auto-scan** on/off (default on).
  - **Sources:** image attachments, inline images, PDFs (all default on).
  - **Formats:** Data Matrix, QR, Micro QR, rMQR, Aztec, PDF417 (all default on). At least one must remain enabled, which the UI and validation enforce.
  - **Limits:** the four numeric fields from chunk 9, with the min/max values from the schema and inline validation messages.
  - Saving is automatic on change, with a "Saved" indicator. "Reset to defaults" is available.
- **Auto-scan off:** the display script still connects. The background replies `manual-available` and does nothing else. A `message_display_action` toolbar button ("Scan for codes") is enabled only while auto-scan is off. Clicking it runs the normal scan over the existing port of that tab. When auto-scan is on, the button is disabled or hidden (`messageDisplayAction.disable()`).
- `storage.onChanged` → the background reloads settings. Because the `settingsHash` changes, the cache invalidates automatically.
- The toggles flow into `plan-sources` (sources) and `DecodeOptions.formats` (formats).

Files: `static/options.html`, `src/entries/options.ts`, `src/features/settings/{options-view.ts,schema.ts,options-view.test.ts}`, `src/features/scan-pipeline/{orchestrator.ts,plan-sources.ts,orchestrator.test.ts}`, `src/entries/background.ts`, `src/platform/tb-api.ts`, `static/manifest.json` (`options_ui`, `message_display_action`), `static/_locales/en/messages.json`.

Tests:
- With PDFs disabled, a message with a PDF and a PNG scans only the PNG.
- With QR disabled, a QR-only image yields no entries.
- With auto-scan off, connecting a port does not download anything. Triggering the toolbar action scans and streams the results.
- The options view rejects disabling the last format and clamps out-of-range numbers on blur.

---

### Chunk 12 — German localization

**Why:** en + de UI as agreed.

Constraints / changes:
- `static/_locales/de/messages.json` holds a complete translation of every key, including plural-aware strings via separate keys (`codesCountOne` / `codesCountOther`). The same applies to the manifest `name` and `description` (`__MSG_…__`).
- A test asserts that the `de` and `en` key sets are identical and that every `t('…')` key used in `src/` exists. The used keys are extracted with a simple regex.

Files: `static/_locales/de/messages.json`, `static/_locales/en/messages.json`, `static/manifest.json`, `tests/integration/locales.test.ts`.

---

### Chunk 13 — Release readiness (ATN)

**Why:** A reproducible, reviewable XPI.

Constraints / changes:
- `npm run package` performs a clean build, runs `web-ext lint` and `web-ext build`, and writes `dist/qr-scanner-<version>.xpi`.
- The build is reproducible: pinned versions, lockfile, no timestamps in bundles. The README documents the exact build commands for ATN reviewers, plus the provenance of `zxing_reader.wasm` and the pdf.js assets (npm package plus version, copied verbatim).
- The build size budget is checked (warn when the XPI exceeds 6 MB).
- `docs/manual-qa.md` holds the manual QA checklist (section 3).
- CI (GitHub Actions) runs typecheck, lint, test and package on Node LTS.

Files: `scripts/build.ts`, `package.json`, `README.md`, `docs/manual-qa.md`, `.github/workflows/ci.yml`.

---

## 3. Manual QA checklist (no automated E2E)

Run these in TB 128 ESR and the current release, on macOS, Windows and Linux where possible:
1. A mail with a PNG DM attachment shows the panel at the top left within about 1 s. Copy pastes the exact string.
2. A GS1 DM shows HRI. Copy pastes the raw string with GS (check in a hex-aware editor). Copy as HRI pastes the bracketed form.
3. An HTML mail with an inline `cid:` QR, and one with a `data:` URI QR, are both decoded. A mail with a remote image triggers no network request (check with the network monitor or offline mode).
4. A multi-page PDF label (vector DM) shows codes per page as they stream in.
5. A 15 MB attachment shows "skipped (> 10 MB)". After raising the limit to 20 in settings and reopening the mail, it is scanned.
6. Switching quickly between 10 messages with PDFs causes no CPU spike after the switching stops, and the panel shows only the current mail's codes.
6a. Arrowing through 10 mails that have photo and PDF attachments but no codes: no visible lag in the thread pane, and the CPU in Activity Monitor or Task Manager settles within a second of stopping.
7. Minimize, then restore, then close. The next mail shows the panel again.
8. With auto-scan off, nothing happens on display, and the toolbar button scans.
9. Junk-folder mails show no panel.
10. An OpenPGP-encrypted mail with an image attachment is either scanned or shows "could not be read", and never errors silently.
11. Dark theme: the panel is legible in both light and dark TB themes (use `prefers-color-scheme` inside the shadow).
12. Offline mode (airplane mode): every scenario above still works.

---

## 4. Out of scope

- Images inside nested `.eml` attachments, ZIP archives, TIFF, HEIC and SVG.
- 1D barcodes (EAN, Code128, …).
- Scanning in the compose window, and scanning multiple selected messages.
- Code thumbnails, "copy all", a rescan button, and clickable or openable URLs.
- Persistent (on-disk) result caching.

## 5. Open items to verify during implementation

These are decisions made by default that need confirming against TB 128:
1. Message display script registration API in MV3 (`scripting.messageDisplay` vs `messageDisplayScripts`), and the exact permission name. (Chunk 1)
2. Whether `messages.getAttachmentFile` accepts inline (non-attachment) part names. (Chunk 7)
3. How pdf.js's own worker can run nested inside our dedicated worker under the extension CSP. (Chunk 10)
4. Whether zxing-wasm with `returnErrors: true` reports a positioned candidate for Data Matrix codes that are too small or blurry to decode, and reports **none** on code-free photos and pages. This decides between candidate gating and the single 200 DPI fallback. (Chunks 2 and 10, settled by the benchmark) **Resolved in chunk 9: it mostly does not; candidate gating was dropped.**
5. Whether a `WebAssembly.Module` can be posted to a dedicated worker under the extension CSP in TB 128. If not, each new worker compiles the WASM itself, which costs a little more after each cancel. (Chunk 8) **Resolved: it can (confirmed in TB after chunk 4).**
6. What the TB APIs return for OpenPGP and S/MIME messages (decrypted parts, or not). This only affects the error messages, since support is best effort.
7. The gecko extension `id` (e.g. `qr-scanner@<your-domain>`), which is needed before the first ATN upload.
