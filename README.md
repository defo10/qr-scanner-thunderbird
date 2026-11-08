# qr-scanner-thunderbird

A Thunderbird extension (TB 128 ESR+, Manifest V3) that finds and decodes 2D codes (Data Matrix, QR, Micro QR, rMQR, Aztec, PDF417) in the displayed email. Everything runs locally; the extension makes no network requests.

## Requirements

- Node.js 22.13 or newer
- Thunderbird 128 or newer

## Build

```sh
npm ci
npm run build      # bundles into dist/
npm run watch      # rebuilds on source changes (restart after editing static/)
npm run package    # dist/qr-scanner-<version>.xpi
```

Bundles are unminified and ship with sourcemaps.

## Load as a temporary add-on

1. Run `npm run build`.
2. In Thunderbird, open the menu ≡ → *Add-ons and Themes* → gear icon → *Debug Add-ons* (or go to `about:debugging#/runtime/this-firefox`).
3. Click *Load Temporary Add-on…* and select `dist/manifest.json`.
4. Click *Inspect* next to the add-on to see the background console. Open a message to see the `scan port` log line.

Temporary add-ons are removed when Thunderbird restarts. After rebuilding, click *Reload* on the add-on.

## Checks

```sh
npm run typecheck  # tsc, strict
npm run lint       # eslint, then build + web-ext lint
npm test           # vitest
```

`web-ext lint` checks against Firefox's schema, so it reports Thunderbird-only permissions (`messagesRead`, `accountsRead`) and the `data_collection_permissions` key as warnings. Those warnings are expected.
