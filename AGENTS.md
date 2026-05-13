# AGENTS.md

## Project

よむ is a self-contained Tampermonkey/Greasemonkey userscript for Japanese popup lookup, JPDB mining, local Yomitan dictionaries, OCR, subtitles, YouTube filtering, kanji drilldown, and optional AnkiConnect mining.

## Setup

```bash
npm ci
npm run check
```

Use the browser QA audit for fixture coverage:

```bash
npm run qa
```

The audit mocks JPDB and kanji-source network calls for deterministic local runs. Use `.env` for local-only API keys; it is ignored by Git. `npm run qa:live` is the narrow live JPDB key smoke test.

## Constraints

- Keep the userscript self-contained; do not add `@require`.
- Do not add a backend service for default functionality.
- Do not hardcode API keys, Tailnet URLs, or user secrets.
- Preserve iPhone/iPad Tampermonkey friendliness.
- Prefer local/imported data and optional runtime lookups over bundling large datasets.
- Treat external kanji/etymology sources as license-sensitive. Check `docs/kanji-source-research.md` before adding a source.
- Keep visible product naming as `よむ` and the built userscript as `dist/yomu.user.js`.
- Update `dist/yomu.user.js` by running the build when source changes affect the bundle.
- Greasy Fork limits scripts to 2 MB. Keep `dist/yomu.user.js` under 2,000,000 bytes and rely on `npm run verify` as the guardrail. Do not compress, pack, or obfuscate the userscript to fit the limit; Greasy Fork forbids that. If size gets tight, remove duplication, purge unused CSS, prefer runtime/hosted assets for nonessential media such as icons, and avoid bundling large datasets.
- For every task, boldly refactor and cleanup the codebase, fixing techdebt even when not asked, doing so eagerly and vigorosly, no scope is to big. You care about code quality and modularity and structure above all else.

## Definition of Done

- Relevant tests are added or updated for any behavior change.
- `npm run check` passes.
- Browser-impacting changes have screenshot or DOM evidence from `scripts/qa-audit.mjs`, a local fixture, or a clearly described manual/browser flow.
- README claims match implemented behavior.
- Main README and GitHub Pages docs are updated together for user-facing behavior, install steps, credits, and limitations.
- New external data/source usage is documented with license and attribution.

## Changelog and Docs

- Keep `CHANGELOG.md` up to date for every user-facing release. The website changelog includes this file directly through `docs/changelog.md`, so do not duplicate release notes elsewhere.
- Always publish user-facing versions through the GitHub Releases tab: create/push a `v*` tag or run the `Release` workflow, verify with `gh release view <tag>` that the release is non-draft, marked as the latest when appropriate, and includes the built `yomu.user.js` asset.
- Before finishing user-facing work, check that `README.md`, the relevant `docs/` page, and credits/license notes all describe the same behavior.
- Before finishing large UI work, run the Playwright screenshots plus axe/docs accessibility and complexity checks, or record why a check could not run.
- Put beginner-facing docs in `docs/` and keep install guidance plain enough for someone who has never used a userscript manager.
- When screenshots need refreshing, run `npm run qa` and copy the relevant Playwright screenshots from `qa-artifacts/` into `docs/assets/screenshots/`.
- Run `npm run docs:build` after documentation or VitePress theme changes.
