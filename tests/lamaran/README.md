# Bounded Lamaran acceptance (local only)

Requirements: Node >=22, npm, network access to the production pinned CDNs, Playwright 1.65.0 and Chromium.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

`npm test` fails fast and runs resource unit tests, the complete original 26-case acceptance plus two edge cases, then five browser resource tests. It does not deploy anything. Headless mobile viewports are not physical devices. Browser suites are bounded to 240 seconds each by default. No random boundary-fixture search.

Optional environment:
- `LAMARAN_CHROME`: absolute executable path to an existing compatible Chrome instead of Playwright Chromium.
- `NODE_PATH`: explicit external node_modules fallback for constrained environments; normal `npm ci` needs no machine-specific path.
- `LAMARAN_ARTIFACTS`: fresh output directory for a **single** browser-suite invocation. Do not reuse it for `npm test` (two suites), or overwrite evidence. Default is `.artifacts/<timestamp>` under the checkout.
- `LAMARAN_TIMEOUT_MS`: whole browser-suite deadline (default 240000).
- `LAMARAN_FILTER`: optional regex selecting known test IDs for targeted repro only; invalid/no-match filters are BLOCKED, never pass. Main acceptance always includes dependency/source T01. Clear the filter for the full gate.
- `LAMARAN_SUITE`: `acceptance` (default) or `budgets`; alternatively `npm run test:budgets`.

Exit codes: **0** actual selected assertions pass and result IDs match the manifest; **1** product/assertion/evidence failure; **2** blocked/inconclusive infrastructure/configuration/deadline. Missing browser/dependencies are blocked. A failed assertion or absent/incomplete results can never become PASS. Artifacts include actual downloads, render details, request records, snapshots, JSON and logs. `run.json` prevents reuse of completed directories. Remote clean-install/CI has not been verified.

Fixtures: `fixtures/exact-2002-input.pdf` is the persisted previous audit reproduction (2000-byte input; fixed-clock merged output 2002 bytes). E02 verifies exact `2.002` KB and one-byte-under `2.001` KB using actual rendered downloads, avoiding floating-point `2.002 * 1000` roundoff. T05 uses fixed clock and deterministic text for byte boundaries. E01 creates deterministic red/blue JPEG with EXIF Orientation=6 and renders the downloaded PDF.

Resource policy (also disclosed in the UI): 30 files / 40 MiB input, 25 MP/image, 30 MP total decoded image pixels, 100 total pages including images, 512 MiB accounted allowance. Accounting charges input ×2, image pixels ×12 bytes (decode/canvas/embed workspaces), normalized PNG ×2, PDF pages ×64 KiB, indirect objects ×1 KiB, plus retained stream bytes. Reservations are atomic; limits are policy estimates, **not measured peak heap**. Native decoders, PDF parsing/object stream expansion, library internals, concurrent retired jobs and GC can allocate beyond this estimate. Header preflight rejects unsupported/malformed PNG/JPEG dimensions before decode; real decoding still validates payload. This does not guarantee resistance to every decompression bomb or OOM; do not run uncontrolled stress inputs.
