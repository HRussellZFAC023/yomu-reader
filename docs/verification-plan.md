# よむ verification plan

This document is the release checklist for making よむ feel deliberate instead of "vibe coded".
Every shipped feature should have a visible user story, a deterministic test, and at least one
manual journey that asks: "what would the user see, try, misunderstand, or want to undo?"

## Product principles to verify

- Works without ritual: a fresh install should show one clear welcome flow, then useful lookup
  behavior with minimal configuration.
- Settings disclose only relevant controls: changing a dropdown should hide irrelevant fields,
  and every setting label should be plain-language rather than implementation-language.
- Touch first, keyboard optional: iPhone/iPad users must be able to read, play audio, mine, and
  dismiss popups without relying on hotkeys.
- No pointless chrome: no toasts, buttons, pucks, badges, or overlays that do not change what the
  user can do right now.
- One popup at a time: button clicks, hover lookups, OCR taps, and subtitle taps must not create
  duplicate modals or duplicate audio.
- Non-invasive rendering: furigana, underlines, OCR overlays, and subtitle overlays must not break
  host page layout, clipping, scrolling, or page controls.
- Modular sources: JPDB, imported dictionaries, Anki, OCR engines, kanji sources, and video tools
  must be independently enableable, orderable, and understandable.
- Privacy is obvious: settings and onboarding must say when text/images/audio terms leave the page.

## Research anchors

- Yomitan sets the core lookup expectation: hold a modifier key, hover text, optionally set "No Key",
  and on mobile touch the word directly. It also treats dictionaries, audio sources, and Anki as
  configurable modules. See https://yomitan.wiki/getting-started/ and
  https://yomitan.wiki/advanced/.
- Yomitan dictionary management expects recommended downloads, bulk import/export, and local
  dictionary storage. See https://yomitan.wiki/dictionaries/.
- ASBPlayer sets the video-mining expectation: auto-detected or user-loaded subtitle tracks,
  selectable subtitles, dual tracks, subtitle styling, keyboard shortcuts, Anki export, and
  screenshot/audio capture. See https://docs.asbplayer.dev/docs/intro,
  https://docs.asbplayer.dev/docs/reference/settings/, and
  https://docs.asbplayer.dev/docs/guides/mining-in-depth/.
- YomiNinja sets the OCR expectation: text extraction from visual content, auto OCR, overlays that
  can be scanned by popup dictionaries, and support for Google Lens, Cloud Vision, MangaOCR,
  PaddleOCR, and Apple Vision style engines. See https://github.com/matt-m-o/YomiNinja.
- AnkiConnect sets the Anki integration boundary: desktop Anki exposes deck/model/note/media actions
  over a local HTTP API; mobile support needs a reachable bridge or fallback export path. See
  https://foosoft.net/projects/anki-connect/ and the AnkiConnect API ecosystem.

## Feature checklist

### Install, update, and publishing

- [ ] `dist/yomu.user.js` is the only script users need; no old `kotoba` naming remains in metadata,
  docs, UI, storage labels, or generated filenames.
- [ ] Userscript metadata includes the correct `@match`, `@exclude`, `@grant`, `@connect`, name,
  description, version, icon, homepage, support URL, update URL, and download URL.
- [ ] JPDB API keys and local audio URLs used in testing are never committed or bundled.
- [ ] Production build works on pages with strict CSP/Trusted Types, especially YouTube.
- [ ] GreasyFork copy is current: summary, description, support links, privacy notes, screenshots,
  and update instructions.
- [ ] GitHub Actions run typecheck, unit tests, build, userscript verification, and QA audit.

### First-run onboarding

- [ ] Appears once on first install, never nags after dismissal.
- [ ] App name is written as `よむ`.
- [ ] Explains in simple terms: tap/hover words, read images, mine subtitles, optional JPDB/Anki,
  imported dictionaries, and where to turn features off.
- [ ] Lets the user choose interface language immediately, with all visible UI updating live.
- [ ] Offers sensible presets: "Just read words", "JPDB mining", "Video mining", "Manga/images",
  and "Local dictionaries only".
- [ ] Links to JPDB API key settings beside the API key field.
- [ ] Avoids unexplained names like "YomiNinja", "Tailnet", "endpoint", or "engine" unless an
  advanced mode is selected.

### Settings architecture

- [ ] Settings are grouped by task, not implementation: Reading, Dictionaries, Mining, Audio,
  Images, Video, YouTube, Anki, Shortcuts, Appearance, Support.
- [ ] Irrelevant fields are hidden based on dropdowns; for example Cloud Vision key appears only in
  Cloud Vision mode, local OCR URL appears only in local OCR mode, and pass/fail shortcuts appear
  only in pass/fail review mode.
- [ ] Accent color previews and applied UI update live before Save.
- [ ] Cancel reverts unsaved changes and updates live preview back.
- [ ] Save/Cancel are always visible with safe spacing on desktop, iPhone, and iPad.
- [ ] Radio, checkbox, and selected dropdown states are clearly visible in dark and light themes.
- [ ] Import/export buttons are singular and clear: settings import, settings export, dictionary
  import, dictionary export.
- [ ] Support area includes GitHub issues, Discord handle, PayPal donation, and the "free alternative
  to paid study suites" message without sounding pushy.
- [ ] Settings can be exported/imported with secrets redacted when using "copy diagnostic report".

### Text detection and lookup triggers

- [ ] Japanese text is detected automatically on page load when enabled.
- [ ] No "scan complete" toast appears for normal automatic work.
- [ ] Manual scan button appears only when auto scan is disabled or in a diagnostic menu.
- [ ] Lookup can be configured as click/tap, hover, hover while holding any captured key combo, or
  any combination of those.
- [ ] Shortcut fields capture key combos from real keypresses rather than requiring typed strings.
- [ ] Holding the scan key while hovering plays audio if auto-audio is enabled, same as click/tap.
- [ ] Escape closes the active popup or settings modal with one press.
- [ ] Page rescans after navigation, infinite scroll, dynamic content, or SPA route changes without
  creating duplicate wrappers.
- [ ] Existing site ruby/furigana, such as NHK Easy, is preserved and not wrapped twice.
- [ ] Furigana and underlines do not alter line-height, force vertical one-character wrapping, or
  break form/button layouts.

### Popup dictionary

- [ ] Opens one popup for one lookup, positioned sensibly on desktop and as a sheet on small screens.
- [ ] Sheet handle drags to useful states: compact, half, full, dismiss.
- [ ] Header shows term, reading, pitch, status, frequency, and source without repetition.
- [ ] The JPDB pill opens JPDB; the term itself is not a hyperlink.
- [ ] Speaker is an icon in the top-right; it never triggers double audio.
- [ ] Autoplay happens once per lookup when enabled; manual speaker replay is possible.
- [ ] Buttons do not wrap awkwardly, especially `SOMETHING`.
- [ ] Review buttons show `NOTHING`, `SOMETHING`, `HARD`, `OKAY`, `EASY`; pass/fail mode shows only
  pass/fail controls.
- [ ] Mining actions use available JPDB deck names from the API, with dropdowns disabled/explained
  when no API key is set.
- [ ] Clicking inside popup content does not trigger a second page lookup popup.
- [ ] Local dictionary cards appear below or beside JPDB according to source priority.
- [ ] Long definitions remain scrollable and readable without clipping action buttons.

### JPDB and mining

- [ ] API key can be set, validated, saved, removed, and never shown in diagnostics.
- [ ] JPDB parse, card state, add, never-forget, blacklist, unlist, and review endpoints handle
  success, auth failure, rate limit, network failure, and empty result.
- [ ] Underline colors reflect word status, including new, learning, known, never forget, due,
  failed, blacklisted, suspended, and unknown/not-in-deck.
- [ ] `never-forget`, `forq`, and blacklist deck choices come from the JPDB API where possible.
- [ ] Mining to JPDB and Anki simultaneously has explicit behavior and visible status.
- [ ] Review shortcut numbers update the currently open card only.
- [ ] Current sentence/source URL are captured for JPDB/Anki mining.

### Imported dictionaries

- [ ] Yomitan settings JSON imports without destroying unrelated よむ settings.
- [ ] Yomitan dictionary ZIP import supports term, kanji, term meta, kanji meta, pitch, frequency,
  structured glossary content, tags, and dictionary metadata.
- [ ] Dexie/Yomitan dictionary collection import/export works after a page refresh.
- [ ] Recommended downloads include Jitendex, JMnedict, KANJIDIC, BCCWJ, JPDBv2㋕, and Jiten with
  install/update status.
- [ ] Multiple dictionary downloads show per-dictionary progress and final success/failure.
- [ ] Installed dictionaries can be enabled/disabled, updated/refreshed, reordered, renamed, and
  removed.
- [ ] Definition-source priority can put JPDB first, later, or disabled entirely.
- [ ] Sorting uses JPDB frequency when present and falls back predictably for local dictionaries.
- [ ] Native-language dictionaries are supported without assuming English.
- [ ] Imported dictionaries persist in IndexedDB/GM storage and do not require reimport.

### Audio

- [ ] Defaults are JapanesePod101, LanguagePod101, and Jisho; no custom URL row is preselected by
  default.
- [ ] Users can add N sources, reorder them, enable/disable each, and choose source types.
- [ ] Custom URL and Custom URL JSON support `{term}`, `{reading}`, and `{language}`.
- [ ] Source-level "audio unavailable" is silent unless the user explicitly requests audio.
- [ ] Random mode picks a random clip from the returned `audioSources` list inside one source, not
  merely a random source row.
- [ ] iOS/Tampermonkey blob playback works for same-origin, CORS, and GM-requested audio.
- [ ] Audio timeout and network errors do not block the popup.
- [ ] Autoplay is on by default only after a user gesture where the browser allows it; otherwise the
  speaker icon reflects that playback was blocked.

### OCR and images

- [ ] Default image reading is Google Lens/recommended mode; no endpoint required.
- [ ] Page text/alt text is not shown as OCR unless a page provides explicit OCR metadata.
- [ ] Auto image scan is quiet, near-viewport, cached, throttled, and cancelled when images leave view.
- [ ] Manual per-image toggle exists for users who want control; global scan appears only when useful.
- [ ] OCR overlays do not cover images by default; recognized regions become transparent, tappable,
  selectable text targets.
- [ ] Every recognized word is individually addressable and can open a normal popup.
- [ ] OCR text can be copied by drag/select when the user intentionally selects it.
- [ ] OCR overlay text uses JPDB status coloring and furigana when enabled.
- [ ] Horizontal and vertical Japanese, manga panels, rotated/scaled images, responsive images, lazy
  images, and long pages are handled.
- [ ] Font size is computed from OCR box size and device viewport, with clamps that prevent clipping.
- [ ] Cloud Vision mode works with a key; local OCR mode works with MangaOCR, PaddleOCR, Apple Vision,
  and YomiNinja-shaped responses.
- [ ] iPhone/iPad path avoids heavy work: low image count, lazy queue, and clear fallback if OCR cannot
  run.

### Video subtitles and ASB-style mining

- [ ] Detects video elements on YouTube, CI Japanese, local fixture pages, and ordinary HTML videos.
- [ ] Detects page captions where possible and can load `.srt`, `.vtt`, `.ass`/`.ssa` when provided.
- [ ] Japanese primary and native-language secondary subtitles can show together.
- [ ] Subtitle words are tokenized, colored by JPDB status, and tappable.
- [ ] Controls do not cover the video unless opened; compact rail is discoverable but quiet.
- [ ] Users can hide controls, show lines list, choose tracks, adjust offset, seek previous/next cue,
  copy subtitle, pause on mining, and toggle overlay.
- [ ] Subtitle appearance supports color, size, outline, shadow, background, opacity, font family,
  weight, bottom offset, and presets.
- [ ] Defaults are readable on anime, live-action, dark, light, mobile portrait, and mobile landscape.
- [ ] Mining captures current subtitle, source URL, timestamp, and best-effort screenshot/audio clip.
- [ ] Protected/cross-origin videos fail gracefully with copy-only or screenshot-unavailable status.
- [ ] YouTube Trusted Types/CSP errors do not occur in production userscript mode.

### YouTube immersion filter

- [ ] Off by default.
- [ ] When enabled, filters non-Japanese-looking recommendations without breaking YouTube navigation.
- [ ] Shows per-item "Show anyway" and global "Turn off" escape hatches.
- [ ] Has a shortcut and settings toggle.
- [ ] Handles Shorts, search results, home, watch page sidebars, channel pages, and live streams.
- [ ] Does not hide YouTube controls, subtitles, or よむ UI.
- [ ] Explains what was hidden without nagging.

### Kanji details

- [ ] Clicking a kanji inside a headword opens kanji details instead of the term page.
- [ ] Back/forward controls move between term and kanji cards without losing context.
- [ ] Top row shows kanji, key meanings/keywords, readings, stroke count, JLPT, grade/type, frequency,
  and the open-on-JPDB pill.
- [ ] JPDB labels are shown only where they add source clarity; repeated `JPDB` text is removed.
- [ ] KanjiVG stroke order renders inline; no external KanjiVG link is shown.
- [ ] Doodle/tracing mode transitions smoothly from stroke diagram to drawing pad and back.
- [ ] Drawing works with mouse, touch, and Apple Pencil; clear/ghost controls are useful on iPad.
- [ ] RTK info is on by default but togglable; keywords appear near the top.
- [ ] RTK components and JPDB components are clickable and visually grouped.
- [ ] Component split is shown compactly and explains function/form where data supports it.
- [ ] Related words exclude the current word, are not arbitrarily capped at 3, and can be opened.
- [ ] Local KANJIDIC/imported kanji dictionaries appear according to priority.
- [ ] Optional origins panel shows compact, attributed Kanji Map/Kanji Alive facts, Wiktionary notes,
  radical images, and a 2D component graph without overwhelming the popup.
- [ ] Unsupported/proprietary sources such as Outlier, Genetic Kanji, and Okjiten are not scraped or
  copied without a clear license/API path.

### Anki integration

- [ ] Off by default and hidden until selected.
- [ ] Detects AnkiConnect availability and shows helpful setup/error states.
- [ ] Deck and note type dropdowns come from AnkiConnect, not free-text by default.
- [ ] Creates or updates a `よむ` note type with fields for expression, reading, sentence, source,
  definitions, glossary HTML, audio, screenshot, pitch, frequency, JPDB status, kanji facts, RTK,
  and tags.
- [ ] Supports add note, preview/edit note, update last note with media, and duplicate detection.
- [ ] Adds media via AnkiConnect-supported mechanisms and sanitizes filenames.
- [ ] Card HTML is readable in Anki desktop, AnkiMobile, and AnkiDroid.
- [ ] If desktop Anki is unavailable on mobile, copy/export fallback is clear.
- [ ] If both JPDB and Anki are enabled, buttons and setting names explain whether mining mirrors,
  adds separately, or only uses one target.

### Accessibility and mobile

- [ ] All buttons have accessible names and tooltips where icons are used.
- [ ] Focus trap works in settings/onboarding; Escape/backdrop closes once.
- [ ] Touch targets are at least 44px on mobile.
- [ ] Keyboard users can reach and operate every control.
- [ ] Reduced motion, high contrast, and system light/dark themes are respected.
- [ ] Text does not overflow buttons or fields in English/Japanese UI.
- [ ] Popup/sheet never covers the selected word without a way to move/dismiss it.
- [ ] iPad split screen and iPhone portrait are first-class layouts.

### Performance, storage, and privacy

- [ ] Page scan is incremental and avoids wrapping massive pages all at once.
- [ ] OCR queue is bounded; dictionary search and JPDB calls are cached/debounced.
- [ ] IndexedDB storage errors and quota issues have clear recovery paths.
- [ ] Imported dictionaries can be large without freezing the main thread for long periods.
- [ ] No untrusted dictionary HTML is injected unsafely; strict CSP/Trusted Types pages keep working.
- [ ] External requests are documented and can be disabled by module.
- [ ] Diagnostics can export settings/state with secrets removed.

## Rigorous verification approach

### 1. Spec-first inventory

Keep this document as the source of truth. Any new feature must add:

- one checklist entry,
- one unit or contract test,
- one browser fixture assertion, and
- one manual script when the behavior depends on real browsers/services/devices.

### 2. Automated test layers

- Unit tests: parsing, dictionary normalization, JPDB response mapping, RTK/KanjiVG/KanjiMap/Wiktionary
  parsing, audio source selection, OCR box normalization, subtitle parsing, Anki field generation.
- Contract tests: mocked JPDB, mocked AnkiConnect, mocked Google Lens/Cloud Vision/local OCR, mocked
  dictionary downloads, mocked YouTube cards/caption metadata.
- Browser fixture tests: local pages for article text, NHK-style ruby, forms/buttons, manga images,
  vertical OCR, video with dual subtitles, YouTube-like recommendations, strict Trusted Types page.
- Visual regression: Playwright screenshots for desktop, iPad, iPhone portrait/landscape, dark/light,
  and major settings tabs. Compare layout metrics, not just pixels: no clipped furigana, no one-char
  vertical wrapping, one popup, visible selected states, action bar not cramped.
- Real smoke tests: current production userscript on Bloomee, NHK Easy, YouTube, CI Japanese, and one
  generic news/blog page.

### 3. Manual QA scripts

For each release candidate, run these as written and save screenshots:

1. Fresh install: install `dist/yomu.user.js`, open a Japanese article, finish onboarding, set API key,
   confirm the page reads automatically and no toast appears.
2. Trigger matrix: test click/tap, hover, Shift-hover, no-key hover, Escape close, settings shortcut,
   grade shortcuts, audio shortcut, and mobile touch.
3. Popup/mining: open a new word, known word, never-forget word, blacklisted word, verb with long
   definitions, and kanji word; mine to JPDB and verify state/underline changes.
4. Dictionaries: import the supplied Yomitan settings and dictionary exports, download recommended
   dictionaries, reorder sources, disable JPDB definitions, refresh, and confirm local results remain.
5. Audio: JapanesePod101 hit, JapanesePod101 miss, Jisho fallback, LanguagePod101 fallback, custom JSON
   list with random clip, iOS blob path, autoplay once.
6. OCR: Bloomee default Google Lens path, embedded OCR fixture, local OCR fixture, Cloud Vision mock,
   per-image toggle, vertical text, copy/select OCR text, popup from individual OCR word.
7. Video: local dual-subtitle fixture, YouTube test video, CI Japanese video, load own subtitle file,
   toggle secondary track, seek cues, copy subtitle, tap subtitle word, mine with screenshot.
8. Kanji: click each kanji in a multi-kanji word, inspect JPDB facts, imported KANJIDIC, stroke order,
   doodle pad, RTK components, origins graph, related words, back/forward.
9. Anki: start Anki + AnkiConnect, load deck/model dropdowns, create note type, add term card, add
   subtitle card with screenshot, update last card, confirm rendered card in Anki.
10. YouTube filter: enable, inspect hidden cards, Show anyway, Turn off, shortcut toggle, navigation
    between Home/Search/Watch/Shorts.

### 4. Release gate

A build should not be published until:

- `npm run check` passes.
- `YOMU_TEST_API_KEY=<test key> npm run qa:audit` passes.
- A production-userscript smoke run passes on at least Bloomee, NHK Easy, YouTube, and CI Japanese.
- The manual QA scripts above are checked for any feature touched in the release.
- Any failed source integration has a clear disabled/fallback state rather than a broken UI.

## Likely unfinished or fragile areas

- Real Anki end-to-end needs stronger coverage than mocks, including note type creation and media.
- OCR needs the strictest UX audit: word-level selection, overlay positioning, Google Lens fallback,
  and mobile throttling are where regressions are most likely.
- Video support should be described honestly as "ASB-style subtitle mining" unless/until it matches
  ASBPlayer's fuller playback modes.
- Dictionary download/update status needs multi-download progress and installed/updated/disabled states.
- YouTube must be tested with the production bundle, not Vite monkey dev injection, because Trusted
  Types errors were previously seen in dev mode.
- Settings need another simplification pass so beginners see presets and normal language, while advanced
  users can still reach OCR endpoints, custom audio JSON, and source ordering.

## Back-and-forth reducers

- Add a visible "Diagnostics" button that copies a redacted report: version, URL, enabled modules,
  dictionary counts, active settings, last error, and browser.
- Add a tiny debug overlay only in QA mode that counts wrapped words, OCR regions, subtitle cues,
  and duplicate popup/audio attempts.
- Save all QA screenshots under `qa-artifacts/` with stable names and include them in PR/release notes.
- Track every user-reported screenshot pattern as a fixture: cramped buttons, double popup, clipped
  furigana, broken native ruby, OCR text covering images, subtitle hard-to-read, settings fields
  visible in the wrong mode.
- Prefer presets over more toggles: beginner mode should show fewer settings; advanced mode can reveal
  the full modular controls.

