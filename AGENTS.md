# AGENTS.md

## Project

よむ is a self-contained Tampermonkey/Greasemonkey userscript for Japanese popup lookup, JPDB mining, local Yomitan dictionaries, OCR, subtitles, YouTube filtering, kanji drilldown, and optional AnkiConnect mining.

## Setup

```bash
npm ci
npm run check
```

Use the browser QA audit when a JPDB test key is available:

```bash
YOMU_TEST_API_KEY=YOUR_JPDB_API_KEY npm run qa:audit
```

If the key is unavailable, run the non-live checks and list the skipped live JPDB/browser checks explicitly.

## Constraints

- Keep the userscript self-contained; do not add `@require`.
- Do not add a backend service for default functionality.
- Do not hardcode API keys, Tailnet URLs, or user secrets.
- Preserve iPhone/iPad Tampermonkey friendliness.
- Prefer local/imported data and optional runtime lookups over bundling large datasets.
- Treat external kanji/etymology sources as license-sensitive. Check `docs/kanji-source-research.md` before adding a source.
- Keep visible product naming as `よむ` and the built userscript as `dist/yomu.user.js`.
- Update `dist/yomu.user.js` by running the build when source changes affect the bundle.

## Definition of Done

- Relevant tests are added or updated for any behavior change.
- `npm run check` passes.
- Browser-impacting changes have screenshot or DOM evidence from `scripts/qa-audit.mjs`, a local fixture, or a clearly described manual/browser flow.
- README claims match implemented behavior.
- New external data/source usage is documented with license and attribution.
