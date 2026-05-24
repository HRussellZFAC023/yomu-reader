# AGENTS.md

## Project

よむ is a self-contained Tampermonkey/Greasemonkey userscript for Japanese popup lookup, JPDB mining, local Yomitan dictionaries, OCR, subtitles, YouTube filtering, kanji drilldown, and optional AnkiConnect mining.

## Setup

```bash
npm ci
npm run check
```

Use the browser QA audit for regression coverage:

```bash
npm run qa
```

The audit uses deterministic local network responses for repeatable regression runs. Use `.env` for local-only API keys; it is ignored by Git. This workspace has a local Nadeshiko key stored as `NADESHIKO_API_KEY` in `.env` for live example-source QA. `npm run qa:live` is the narrow live JPDB key smoke test. Any script that needs live JPDB or third-party data must load `.env` through `scripts/qa-env.mjs` before reading env vars.

For look-and-feel acceptance, do not use mocked fixture screenshots as proof. Fixture pages are only for deterministic behavior assertions and must be labelled as fixtures; visual QA should use the Browser plugin against the actual app or target page, such as `http://127.0.0.1:5174/newtab/`, and interact with visible controls like a user.

## Constraints

- Keep the userscript self-contained; do not add `@require`.
- Do not add a backend service for default functionality.
- Do not hardcode API keys, Tailnet URLs, or user secrets.
- Always push completed changes and trigger the relevant redeploy before finishing, unless the user explicitly says not to.
- Preserve iPhone/iPad Tampermonkey friendliness.
- Prefer local/imported data and optional runtime lookups over bundling large datasets.
- Treat external kanji/etymology sources as license-sensitive. Check `docs/kanji-source-research.md` before adding a source.
- Keep visible product naming as `よむ` and the built userscript as `dist/yomu.user.js`.
- When adding user-visible app or website copy, add both English and Japanese entries in `src/reader/i18n.ts`, verify Japanese mode does not show `未翻訳`, and rebuild/sync hosted assets so `docs/public/newtab/app.js` carries the new copy.
- Update `dist/yomu.user.js` by running the build when source changes affect the bundle.
- Greasy Fork limits scripts to 2 MB. Keep `dist/yomu.user.js` under 2,000,000 bytes and rely on `npm run verify` as the guardrail. Do not minify, compress, pack, or obfuscate the userscript to fit the limit; Greasy Fork forbids that. If size gets tight, remove duplication, purge unused CSS, prefer runtime/hosted assets for nonessential media such as icons, and avoid bundling large datasets.
- Treat bundle size as architecture, not bookkeeping. Ask: what is the smallest amount of code needed to preserve the feature? Keep common reader behavior generic, and do not add page-specific layout handling unless usage evidence shows it is needed. When code handles a special website shape, isolate it behind a named Adapter and keep the generic path simple.
- Fight long-files syndrome. Prefer focused Modules with explicit Interfaces over files that accumulate unrelated behavior. If a file grows because it owns several jobs, split by responsibility before adding more branches.
- Remove dead or stale code only after confirming with usage search. For verbose code, prefer deleting duplication, debug-only chatter, unused edge-case branches, and over-specific guards before adding helpers. Every cleanup should make the Implementation smaller, deeper, or easier to reason about.
- For every task, improve nearby code quality when it helps the requested work. Keep cleanup in verified vertical slices: one behavior, one Module, or one clear architectural story at a time. Prefer deep Modules with small Interfaces over shallow helper sprawl, and stop each slice with tests or a documented verification command.
- Use `CONTEXT.md` for domain vocabulary and `docs/adr/` for load-bearing architectural decisions. If a cleanup introduces or sharpens a domain term, update `CONTEXT.md`. If a decision blocks an otherwise plausible refactor, record or reference an ADR.

## Definition of Done

- Relevant tests are added or updated for any behavior change.
- `npm run check` passes.
- Browser-impacting changes have DOM evidence from `scripts/qa-audit.mjs` or a clearly described manual/browser flow.
- README claims match implemented behavior.
- Main README and GitHub Pages docs are updated together for user-facing behavior, install steps, credits, and limitations.
- New external data/source usage is documented with license and attribution.

## Changelog and Docs

- Keep `CHANGELOG.md` up to date for every user-facing release. The website changelog includes this file directly through `docs/changelog.md`, so do not duplicate release notes elsewhere.
- Always publish user-facing versions through the GitHub Releases tab: create/push a `v*` tag or run the `Release` workflow, verify with `gh release view <tag>` that the release is non-draft, marked as the latest when appropriate, and includes the built `yomu.user.js` asset.
- Before finishing user-facing work, check that `README.md`, the relevant `docs/` page, and credits/license notes all describe the same behavior.
- Before finishing large UI work, run the Playwright DOM checks plus axe/docs accessibility and complexity checks, or record why a check could not run.
- Put beginner-facing docs in `docs/` and keep install guidance plain enough for someone who has never used a userscript manager.
- Do not add docs/product screenshots unless they are captured from the current real app in Browser and explicitly approved.
- Run `npm run docs:build` after documentation or VitePress theme changes.
