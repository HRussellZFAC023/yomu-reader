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

The current single userscript has therefore reached the point where normal maintenance can consume the remaining Greasy Fork headroom. Minifying, compressing executable code, or turning the userscript into a loader would violate the project constraints and likely the distribution rules.

## Decision

Adopt a multi-surface, multi-script architecture:

1. Keep extension builds full-featured and offline-capable. All executable extension logic must be packaged locally with the extension.
2. Keep the Greasy Fork core script readable, self-contained, and focused on the default lookup experience: popup lookup, base parser glue, JPDB/Yomitan/local dictionary support, audio lookup, and settings needed to operate the core.
3. Split optional Greasy Fork functionality into separate readable, self-contained companion userscripts by feature domain. Initial candidates:
   - Yomu Video: YouTube, subtitles, transcript, and video inset behavior.
   - Yomu Anki: Anki mining, AnkiConnect/AnkiMobile handoff, card status, and card rendering extensions.
   - Yomu OCR/Manga: OCR, Mokuro, image-text overlays, and related settings.
   - Yomu Kanji/Study: kanji origin graph, RTK, drills, and study extras.
   - Yomu Settings Surface: heavy settings UI if the core script cannot keep it inside the cap.
4. Allow scripts to communicate only through stable, documented browser events, DOM state, storage keys, and shared non-executable data contracts. A companion script must enhance the core when present and degrade cleanly when absent.
5. Move non-code data out of executable bundles when policy-safe. JSON, CSS, images, screenshots, and public datasets may be hosted or cached, but they must not encode executable logic or instruction interpreters.
6. Continue to reject size workarounds based on minification, executable string compression, `eval`, remote executable chunks, or loader scripts that fetch the real app.

## Consequences

- Greasy Fork users may install only the capabilities they need, which creates real byte headroom without sacrificing reviewability.
- Extension users keep the full offline-capable product as one packaged install.
- Feature boundaries become release boundaries. Cross-feature imports must be replaced with explicit contracts before a feature can become a companion script.
- Shared code must stay small and stable. If a helper grows large, prefer duplicating a tiny stable adapter over forcing every companion script to include a large shared module.
- Settings must become feature-aware. The core can show only installed/available companion settings, or the dedicated settings surface can manage feature-specific options.
- Verification must expand from one bundle to a matrix: core-only, core plus each companion, extension full build, and upgrade/missing-companion behavior.
- Size budgeting becomes per surface. Each Greasy Fork script needs its own readable-size ceiling and CI report, while the extension build keeps its packaged-offline audit.

## Implementation Plan

1. Define feature boundaries and public contracts for video, Anki, OCR, kanji/study, and settings.
2. Add bundle-size reporting by feature bucket and by planned userscript entry point.
3. Extract the first companion script from the largest optional bucket with the least core coupling, likely Video or Anki.
4. Add integration tests for core-only behavior and core-plus-companion behavior.
5. Update release tooling so Greasy Fork prefill can publish each script independently and block any script over its readable byte budget.
6. Keep extension builds on the existing full-featured path, using packaged chunks only.

## Rejected Alternatives

- Minify the userscript to fit Greasy Fork: rejected because Greasy Fork requires readable, non-minified code.
- Ship a tiny Greasy Fork loader that fetches Yomu from GitHub or the docs site: rejected because primary functionality would not be in the posted script.
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
