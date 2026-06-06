# ADR 0003: Multi-Surface Userscript Strategy

## Status

Proposed 2026-06-06.

## Context

Yomu must remain reviewable and offline-capable while fitting multiple distribution surfaces:

- Greasy Fork requires primary userscript functionality to live in the posted script, rejects obfuscated or minified code, and limits posted scripts to 2 MB.
- Greasy Fork allows non-executable external data such as JSON or CSS, and allows external executable code only in narrow cases such as recognized CDNs, SRI-pinned resources, Greasy Fork libraries, or same-origin injection.
- Chrome Manifest V3 requires extension logic to be self-contained in the submitted extension package. Remote data, configuration, and images are allowed only when they do not contain executable logic.
- Firefox AMO continues to require reviewable source and reviewable dependency provenance for add-on submissions.
- Safari extensions are distributed as packaged, reviewable extensions through Xcode/App Store Connect workflows.

The `v0.6.25` Greasy Fork-ready build was 1,997,697 bytes, leaving only 3,003 bytes under the 2,000,000 byte cap. The measured size pressure is overwhelmingly first-party Yomu feature code rather than third-party libraries. The largest buckets are subtitles/YouTube, settings UI, DOM/popup/i18n, main/bootstrap, Anki, local dictionaries/Yomitan, kanji/origin graph, JPDB/parser/API, immersion/study, OCR, and audio. Third-party dependencies were roughly 13 KB rendered, mostly `fflate`.

The current single userscript has therefore reached the point where normal maintenance can consume the remaining Greasy Fork headroom. A post-build whitespace/syntax compactor could squeeze the `v0.6.27` artifact to roughly 1,999 KB, but the policy-readable Vite output is now 2,499,442 bytes. Identifier minification, obfuscation, executable-code compression, whitespace/syntax compaction, or turning the userscript into a loader would violate the project constraints or leave too little durable headroom. This is evidence for splitting the architecture rather than treating the build step as a size workaround.

## Decision

Adopt a multi-surface, multi-script architecture:

1. Keep extension builds full-featured and offline-capable. All executable extension logic must be packaged locally with the extension.
2. Keep the Greasy Fork core script readable, self-contained, and focused on the default lookup experience: popup lookup, base parser glue, JPDB/Yomitan/local dictionary support, audio lookup, and settings needed to operate the core.
3. Split optional Greasy Fork functionality into separate readable first-party Greasy Fork library scripts by feature domain and load them from the main userscript with explicit `@require` allowlisting. Initial candidates:
   - Yomu Video: YouTube, subtitles, transcript, and video inset behavior.
   - Yomu Anki: Anki mining, AnkiConnect/AnkiMobile handoff, card status, and card rendering extensions.
   - Yomu OCR/Manga: OCR, Mokuro, image-text overlays, and related settings.
   - Yomu Kanji/Study: kanji origin graph, RTK, drills, and study extras.
   - Yomu Settings Surface: heavy settings UI if the core script cannot keep it inside the cap.
4. Allow the core and libraries to communicate only through stable, documented browser events, DOM state, storage keys, and shared non-executable data contracts. A library-backed feature must enhance the core when present and degrade cleanly when absent.
5. Move non-code data out of executable bundles when policy-safe. JSON, CSS, images, screenshots, and public datasets may be hosted or cached, but they must not encode executable logic or instruction interpreters.
6. Introduce versioned remote data/style packs for the largest inert data surfaces, starting with localization copy, default/config metadata, and non-critical CSS. Each pack must have a packaged fallback, a schema/version field or content hash, cache metadata, and a stale-while-revalidate loader so normal use reads from local cache and offline use still works.
7. Continue to reject size workarounds based on minification, executable string compression, `eval`, remote executable chunks, or loader scripts that fetch the real app.

## Consequences

- Greasy Fork users get real byte headroom without sacrificing reviewability because first-party libraries remain visible Greasy Fork code and are cached by userscript managers.
- Extension users keep the full offline-capable product as one packaged install.
- Feature boundaries become release boundaries. Cross-feature imports must be replaced with explicit contracts before a feature can become a library script.
- Shared code must stay small and stable. If a helper grows large, prefer duplicating a tiny stable adapter over forcing every companion script to include a large shared module.
- Remote JSON and CSS can reduce userscript byte pressure without becoming remote code, but they create versioning and rendering obligations. JSON loaders must validate shape, ignore unknown executable-looking fields, and fall back to packaged defaults on network, parse, schema, or integrity failure. CSS loaders must ship a minimal packaged critical stylesheet, cache fetched CSS locally, and avoid remote `@import`, remote script URLs, or behavior encoded through generated content.
- Settings must become feature-aware. The core can show only installed/available companion settings, or the dedicated settings surface can manage feature-specific options.
- Verification must expand from one bundle to a matrix: core-only, core plus each library, extension full build, and upgrade/missing-library behavior.
- Size budgeting becomes per surface. Each Greasy Fork script needs its own readable-size ceiling and CI report, while the extension build keeps its packaged-offline audit.

## Implementation Plan

1. Define feature boundaries and public contracts for video, Anki, OCR, kanji/study, and settings.
2. Add bundle-size reporting by feature bucket and by planned userscript entry point. `npm run size:greasyfork-plan` is the first concrete gate: it refreshes rendered module sizes and writes `dist/greasyfork-size-plan.json` with conservative remaining-core estimates for companion scripts and inert data packs.
3. Build the remote JSON/CSS asset-pack path for localization/config/style:
   - publish immutable files such as `i18n.en.<hash>.json`, `i18n.ja.<hash>.json`, and `defaults.<hash>.json`;
   - publish immutable stylesheet packs such as `reader-core.<hash>.css`, `settings.<hash>.css`, and `subtitles.<hash>.css`;
   - ship a tiny manifest or embed the current data-pack URLs and expected schema versions;
   - cache packs in extension storage/IndexedDB with `version`, `fetchedAt`, content type, and optional digest metadata;
   - load packaged defaults/critical CSS first, then hydrate from cache, then refresh in the background.
4. Extract the first Greasy Fork library from the largest optional bucket with the least core coupling, likely Video or Anki.
5. Add integration tests for core-only behavior, cached-data behavior, offline fallback behavior, and core-plus-library behavior.
6. Update release tooling so Greasy Fork prefill can publish/update each library independently, write exact approved `@require` URLs into the allowlist, and block any script over its readable byte budget.
7. Keep extension builds on the existing full-featured path, using packaged chunks only.

## Rejected Alternatives

- Rely on minification or post-build compaction as the size strategy: rejected because Greasy Fork requires readable, non-minified code with retained whitespace and variable names, and compaction did not create durable headroom.
- Ship a tiny Greasy Fork loader that fetches Yomu from GitHub or the docs site: rejected because primary functionality would not be in posted Greasy Fork code. First-party Greasy Fork libraries are different because they are posted, reviewable library scripts.
- Put executable behavior into remote JSON: rejected because data packs must remain inert data, not a rules engine or instruction interpreter.
- Depend on remote CSS for core readability: rejected because core UI must keep a packaged critical stylesheet and continue working offline.
- Use compressed executable strings or runtime code generation: rejected because it harms reviewability and conflicts with remote-code/eval policy expectations.
- Replace third-party dependencies first: deferred because measured third-party code is tiny compared with first-party feature code.
- Drop offline extension support: rejected because packaged offline behavior is a core product constraint and aligns with extension-store review requirements.

## References

- Greasy Fork code rules: <https://greasyfork.org/en/help/code-rules>
- Greasy Fork external scripts policy: <https://greasyfork.org/en/help/external-scripts>
- Chrome remote hosted code guidance: <https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code>
- Chrome Manifest V3 additional requirements: <https://developer.chrome.google.cn/docs/webstore/program-policies/mv3-requirements?authuser=1>
- Mozilla add-on policy update: <https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/>
- Safari extensions overview: <https://developer.apple.com/safari/extensions/>
