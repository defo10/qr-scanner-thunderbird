# qr-scanner-thunderbird

A Thunderbird extension (Thunderbird 128 ESR or newer, Manifest V3) that finds and decodes 2D codes — Data Matrix, QR, Micro QR, rMQR, Aztec and PDF417 — in the email you are reading. It looks at image attachments, images embedded in the message body (`cid:` parts and `data:` URIs) and PDF attachments, and lists the codes in a small panel at the top left of the message, each with a Copy button.

- **Local and offline.** Decoding runs in a WebAssembly build of zxing-cpp inside the extension. The extension makes no network requests; remote images in a message are never loaded.
- **Only what you look at.** A message is scanned only while it is displayed. Nothing is scanned when mail arrives, and junk is skipped.
- **Nothing on disk.** Results are cached for the Thunderbird session only (`storage.session`). Settings are the only thing stored (`storage.local`).
- **Readable output.** GS1 codes are shown in bracketed form, e.g. `(01)04012345678901(17)251231`, with "Copy" for the raw string (group separators included) and "Copy as HRI". Binary payloads are shown and copied as Base64. URLs are plain text with the host in bold, never clickable.

## Settings

Add-ons Manager → QR & Data Matrix Scanner → Preferences:

- **Automatic scanning** on or off. When off, use the "Scan for codes" button in the message toolbar.
- **Sources:** image attachments, images in the message body, PDF attachments.
- **Formats:** each of the six formats can be switched off (at least one stays on).
- **Limits:** largest attachment (default 10 MB), largest image (40 megapixels, larger images are scaled down), PDF pages (20), time per attachment (30 s).

## Requirements

- Node.js 22.13 or newer (CI uses the current LTS)
- npm 10
- Thunderbird 128 or newer

## Build (for add-on reviewers)

From a clean checkout:

```sh
npm ci
npm run package
```

This builds into `dist/`, runs `web-ext lint`, and writes `dist/qr-scanner-<version>.xpi`. All dependency versions are pinned exactly and locked in `package-lock.json`; two builds from the same commit produce byte-identical bundles.

The bundles (`background.js`, `scanner-worker.js`, `display.js`, `options.js`) are produced by esbuild from `src/`, **unminified, with sourcemaps**. They contain this project's TypeScript and the JavaScript glue of `zxing-wasm`.

### Third-party files shipped verbatim

These are copied unchanged from npm packages by `scripts/build.ts`:

| File(s) in the XPI | Package | Path in the package |
|---|---|---|
| `zxing_reader.wasm` | `zxing-wasm@3.1.6` | `dist/reader/zxing_reader.wasm` |
| `pdfjs/pdf.mjs`, `pdfjs/pdf.worker.mjs` | `pdfjs-dist@6.4.299` | `legacy/build/` |
| `pdfjs/cmaps/`, `pdfjs/standard_fonts/`, `pdfjs/wasm/`, `pdfjs/iccs/` | `pdfjs-dist@6.4.299` | same directory names |

To check them, compare with the installed packages, e.g. `cmp dist/zxing_reader.wasm node_modules/zxing-wasm/dist/reader/zxing_reader.wasm`. The *legacy* pdf.js build is used because it includes polyfills for JavaScript features that Thunderbird 128's engine lacks.

### Expected `web-ext lint` warnings

`web-ext lint` validates against Firefox, so it reports:

- `messagesRead` and `accountsRead` as unknown permissions (they are Thunderbird permissions);
- `data_collection_permissions` as newer than the minimum version (older versions ignore it);
- `Function` constructor and `document.write` in `pdfjs/*.mjs`: these are in core-js polyfills bundled by pdf.js and never run in the extension's worker; pdf.js 6 itself does not evaluate code;
- dynamic `import()` with a non-literal argument in `scanner-worker.js` and `pdfjs/*.mjs`: the worker loads the shipped pdf.js files from the extension's own URL on the first PDF.

## Load as a temporary add-on

1. Run `npm run build`.
2. In Thunderbird, open ≡ → Add-ons and Themes → gear icon → *Debug Add-ons*.
3. Click *Load Temporary Add-on…* and select `dist/manifest.json`.
4. *Inspect* next to the add-on opens the background console.

After rebuilding, click *Reload* on the add-on and select a message again.

## Development

```sh
npm run watch      # rebuild on source changes (restart after editing static/)
npm run typecheck  # tsc, strict
npm run lint       # eslint, then build + web-ext lint
npm test           # vitest
npm run fixtures   # regenerate tests/fixtures (deterministic; outputs are committed)
npm run bench      # decode timings for images and PDFs (not part of npm test)
```

There are no automated end-to-end tests; see [docs/manual-qa.md](docs/manual-qa.md) for the manual checklist. [SPEC.md](SPEC.md) describes the design, and [CLAUDE.md](CLAUDE.md) the coding conventions.
