# ADR 0002: Userscript Size Budget

## Status

Amended 2026-06-03.

## Context

Greasy Fork limits scripts to 2 MB, and build verification already warns as the bundle approaches that ceiling.

The readable hosted build can exceed Greasy Fork's 2 MB upload limit while staying non-minified. `npm run verify` warns loudly near the cap and fails while Greasy Fork upload would be over budget.

## Decision

Treat 2,000,000 bytes as a hard budget for Greasy Fork upload. Do not minify, compress, pack, or obfuscate the userscript to fit the limit. Hosted releases may ship a readable build above the limit only when the release notes and verifier warning make that tradeoff explicit.

## Consequences

- Cleanup should remove duplicate rendering, CSS, parsing, and provider logic before adding dependencies.
- Large datasets, heavy media, and nonessential assets should stay hosted, user-imported, or optional.
- `npm run verify` is the guardrail for hosted release readiness; Greasy Fork upload remains blocked while the built userscript is over 2 MB.
