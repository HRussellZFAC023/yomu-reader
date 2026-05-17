# ADR 0002: Userscript Size Budget

## Status

Accepted.

## Context

Greasy Fork limits scripts to 2 MB. The build verification already warns as the bundle approaches that ceiling.

Current release state: the built `dist/yomu.user.js` is under the budget without minification. The latest size report measured
`dist/yomu.user.js` at 1874.3 KiB raw, 399.3 KiB gzip, and 303.6 KiB brotli.

## Decision

Treat 2,000,000 bytes as a hard budget for `dist/yomu.user.js`. Do not minify, compress, pack, or obfuscate the userscript to fit the limit.

## Consequences

- Cleanup should remove duplicate rendering, CSS, parsing, and provider logic before adding dependencies.
- Large datasets, heavy media, and nonessential assets should stay hosted, user-imported, or optional.
- `npm run verify` is the guardrail for release readiness.
