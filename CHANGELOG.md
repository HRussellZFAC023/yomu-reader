# Changelog

## [1.8.7] - 2026-07-26

### Added

- Every dictionary Yomu mirrors is now listed in Settings, not just the handful it recommends. The catalogue holds 186 titles — Japanese monolingual dictionaries, all eight pitch-accent dictionaries, grammar, thesaurus, encyclopedia and frequency lists — but only fourteen of them had ever been reachable from the interface. They now appear grouped by kind, each installable in one press and each verified against a published checksum as it downloads.

### Fixed

- Buttons, chips, menu items and other interface controls now show their furigana readings all the time, exactly like body text. Two separate problems had left controls bare: a recent change deliberately hid readings on buttons until they were hovered, which made them unreachable on touch screens; and a longer-standing defect where a control's own hover and ripple layers were mistaken for a menu covering the word, so the reading was created and then immediately hidden. Controls keep their exact size, spacing and tap targets, and a real menu or dropdown opened over a control still hides the readings beneath it as before.
- Stray floating furigana no longer linger in odd corners of the page after the text they belonged to has gone. A reading kept at its last known position to bridge a brief relayout depended on some later page activity to be cleaned up; on a quiet page that cleanup never ran, so the stale reading floated indefinitely. The cleanup now schedules itself and the bridging tolerance is capped by time.
- Furigana no longer lags behind the page while scrolling through video feeds on tablets. Titles trimmed to a fixed number of lines and bylines shortened with an ellipsis were still being repositioned frame by frame during scrolling; they now travel with the page itself like ordinary text does.
- Long video descriptions are now annotated all the way through. Text past roughly the first two hundred and forty characters of a block was silently skipped by the local dictionary lookup, which left the middle of an expanded description completely bare while the top and bottom were annotated.
- Dragging the floating subtitle control rail on a phone or tablet now moves the rail instead of scrolling the page. The rail's drag handle asked to own its touch gesture, but a general touch-sizing rule for the rail's buttons overrode it, leaving the browser in charge of the gesture.
- Pressing Cancel in the settings dialog while it is open over a playing video now closes the dialog. A protective layer that stops stray taps on displaced subtitles from activating links underneath judged clicks purely by their position on screen, so it also swallowed clicks aimed at the reader's own dialogs and focused the player instead, which is why the site's player controls appeared rather than the dialog closing.
- The subtitle overlay now hides when scrolling down to read comments while the video keeps playing in a small docked mini player. Only pausing used to hide it, because the overlay judged visibility purely by where the player box sat on screen, and the docked box is fully on screen. A mini player opened deliberately keeps its overlay, and an overlay hidden this way returns if the page later puts the player back in the flow of the page.
- Kanji inside subtitle words no longer look darker than the rest of the word. The highlight was painted twice over the kanji run, once for the word and once for an inner wrapper, and the two translucent layers stacked.
- Some words on dark pages no longer show a noticeably darker highlight than their neighbours until hovered, with the same problem inverted on light pages. Words carrying no colour of their own were losing the sampled page background that every other word mixes its highlight against. Relatedly, a text colour changed by hovering now always reverts when the pointer leaves instead of occasionally sticking.
- The meaning section of the study card no longer gets stuck showing a translating message forever. When the translation request travelled through a transport that ignored its time limit, a lost message meant the request never finished; the reader now enforces its own deadline and moves on. Sections that finish empty now also hide reliably.
- Yomu now goes properly to sleep in background tabs. Several internal observers and timers kept working at full rate while a tab was hidden, which drained battery and warmed the device; they now pause when the tab is hidden and catch up once when it returns.
- The account menu on the Yomu website itself is now annotated like the rest of the page.
- Readings no longer stay behind when a page rewrites the text around an annotated word. Yomu ignores the page edits it makes itself, and the test for that was matching Yomu's own word wrappers, so a genuine edit by the site next to an annotated word looked like Yomu's own writing and was discarded — the reading stayed at the old position until something else moved it.
- Tapping a video's own subtitle line to blur it no longer unfolds the reader's control rail over the picture. The blur always worked; the rail woke on the same tap because the wake decided purely on where the finger landed, and the platform's caption sits inside the reader's own subtitle area. Tapping blank space in that area still wakes the rail, so a rail dragged out of reach stays recoverable.
- Sites that force their own colours, borders and shadows onto every element on the page no longer strip the reader's interface back to bare text. On such a site the floating button lost its circle, its background and its outline, leaving the label floating loose. The reader now re-asserts its own appearance in a way the page cannot outrank, without changing how the site itself looks anywhere.
- Subtitle annotations no longer vanish for a moment, or for good, as each line appears. A line whose readings had already been prepared was compared against the wrong record of what was last drawn, so the reader concluded it had nothing ready and repainted the line as plain text — annotations returned only if a second lookup happened to land, and the repaint also wiped the colours applied a moment earlier.
- The reader's own styling now survives a page load that cannot reach its stylesheet. Only two sources were tried, the second of which is blocked on a number of networks, so a reader that missed both rendered as unstyled native controls with no dialog frame. A third always-available source now sits between them, the last known-good stylesheet is kept across updates instead of being discarded on every release, and a load that still ends with no styling now says so in the console instead of failing silently.

## [1.8.6] - 2026-07-25

### Changed

- The providers bundled inside an audio source URL are now listed on their own, with no button to press. Yomu remembers which providers each URL hands out as you look words up, so the list fills itself in from audio you were playing anyway, and it appears straight away when you open Settings or press Preview. A URL Yomu has not heard from yet is checked once in the background when you finish typing or pasting it, switch a source to Custom URL, or switch one on — the moments you are actually asking about that source. Opening Settings never contacts an audio source by itself, so a private or company audio server is only ever reached when you ask for it. The per-provider checkboxes, the overlap markers, and the saved choices behave exactly as before; only the manual detection step is gone.

## [1.8.5] - 2026-07-25

### Added

- Audio source URLs that bundle several providers can now be inspected and controlled per provider. Aggregator endpoints such as the built-in hosted Yomu source answer a single lookup with clips from several named providers — Yomu's own hosted recordings plus a JapanesePod101 fallback, for example — and until now the whole URL could only be kept or dropped as one block. Every Custom URL row under Settings → Media → Audio sources now has a Detect included sources button that probes the URL with sample lookups and lists every provider it reports, each with its own checkbox. Clips from unticked providers are skipped during playback, and providers that appear later stay enabled until you switch them off, so nothing silently disappears.
- The provider list also marks entries that duplicate another enabled row in the audio source list, such as the JapanesePod101 provider inside the hosted source sitting next to the stand-alone JapanesePod101 row, so overlapping sources are visible at a glance and either the provider checkbox or the duplicate row can be switched off.

## [1.8.4] - 2026-07-25

### Fixed

- Your accent colour is now painted before the page appears, so yomureader.com no longer flashes its default green before switching to your colour. The accent used to be applied only once the page's scripts had downloaded and run, leaving the built-in green on screen for the first frames of every cold or slow load. The accent, and the light or dark theme it is derived against, are now resolved and applied while the page is still being parsed. The Study page, PDF reader, and video player were fixed the same way, from the one shared definition the rest of the interface already uses, so no surface can drift back to its own copy.

## [1.8.3] - 2026-07-25

### Fixed

- Furigana readings now stay glued to their words throughout a scroll on tablets and other touch devices, including the fast flings where the previous release could still leave them adrift. The readings are painted in a reader-owned layer floating above the page, and until now that layer was pinned to the screen rather than to the page, so every reading's position had to be rewritten by the reader on every single scroll frame. A touch device scrolls the page on its own without waiting for that work, so any frame where the rewrite arrived late showed the readings sitting where the words used to be. Readings belonging to ordinary page text are now placed in page coordinates instead of screen coordinates, so the device carries a reading and its word together as one, with no per-frame work to fall behind on. Readings inside a scrolling panel, a pinned header, or any other separately moving region keep the previous screen-anchored behaviour, which is correct for them.

## [1.8.2] - 2026-07-25

### Fixed

- Furigana annotations no longer detach or drift off words while scrolling on tablets and performance-constrained devices. The visible readings were being re-evaluated for page occlusion on every single scroll frame using expensive element inspection; during fast scrolling, main-thread slowdowns dropped refresh frames, temporarily hiding readings until scrolling stopped. Occlusion checks are now cached across frames during pure scrolling and degraded smoothly under heavy load, and transient measurement gaps retain the last painted position for several frames so readings stay glued to their text throughout continuous scrolling.
- Framework-driven web applications like YouTube, React, Vue, and Angular dashboards no longer experience heavy main-thread background thrashing from continuous furigana re-checks. Internal annotation changes and unrelated page updates previously triggered document-wide projection refreshes; environmental DOM updates are now filtered to ignore the reader's own annotation writes and unrelated page subtrees.
- Interface command buttons such as Reddit's 質問, 参加, 共有, and アワードを贈る now stay bare at rest, showing their furigana and pitch only on hover or keyboard focus. Tapping still opens the dictionary popup. Post titles, body text, community links, and metadata keep their annotations at rest.

## [1.8.1] - 2026-07-24

### Fixed

- The Firefox add-on package can be reviewed again. Its content script was a few hundred kilobytes over the size Mozilla is willing to parse, so every submission was rejected before a reviewer saw it; the packaged script no longer carries the wrapper indentation that pushed it over, which also restores the exact multi-line text the reader builds. The Chrome and Safari packages are unchanged.

## [1.8.0] - 2026-07-24

### Fixed

- Turning off Prefer Japanese site language now stays off on every site. The choice is stored once for the whole browser, but each site also kept its own copy of it, and that copy was read first: any site opened while the preference was on stayed pinned to on, so it had to be turned off again on every site, forever. The shared setting now wins everywhere, and a site that has not heard about the change yet corrects itself as soon as it loads.
- Turning the preference off now also leaves the Japanese URL it sent you to, instead of stranding you on a page that stays Japanese. Reddit's locale=ja-JP, YouTube's hl and gl, a leading /ja/ or /ja-jp/ path and the other Japanese locale markers are removed; when the page offers its own default-language link, that link is used instead.
- Unticking Prefer Japanese site language in Settings, or turning it off in another tab, now undoes the Japanese URL exactly like the puck's toggle already did. Saving any unrelated setting still leaves a Japanese page you opened yourself alone.
- Turning the preference back on redirects the site again in the same tab. The once-per-site guard that stops redirect loops was never cleared when the preference was switched off, so switching it on again quietly did nothing until the tab was closed.
- Embedded frames are no longer sent to their own Japanese URL. An embedded player, comment box or sign-in frame could navigate itself out from under the page it belongs to; Japanese locale hints still apply inside frames, only the redirect is now reserved for the tab you are looking at.

## [1.7.6] - 2026-07-24

### Fixed

- Furigana and other projected readings now stay anchored to their source text while scrolling inside YouTube and other dynamic web components. The shared viewport renderer follows the source's composed tree across nested and slotted shadow roots, and migrates its listeners when frameworks move existing text, so readings no longer follow the viewport after their source moves.

## [1.7.5] - 2026-07-24

### Fixed

- On iPad, the Meaning under a study Translation card no longer gets stuck on Translating forever. A local dictionary lookup that never returned on iPad Safari used to strand it; the Meaning now appears, or the section hides when there is nothing to translate, as soon as the translation is ready, and a stalled lookup can no longer freeze sentence parsing for reading, hover lookups, or page annotation.

## [1.7.4] - 2026-07-24

### Fixed

- Words with two pitch-accent readings no longer leave an empty band at the top of the dictionary popup. The compact two-graph pitch block now sits in the top-right beside the play button, the same place a single graph already used, instead of dropping to its own centred row; blocks that are genuinely too wide (three readings, long readings, or multi-part expressions) still move to a full-width row, and every block does so on very narrow popups so the headword is never squeezed.

## [1.7.3] - 2026-07-24

### Fixed

- On iPad, the settings puck now keeps its intended size and follows the finger after rotating portrait → landscape → portrait. Viewport scale is reconciled after orientation settles, and drag coordinates use the exact applied scale.

## [1.7.2] - 2026-07-24

### Added

- Reader language profiles now separate the learner's definition language, the English/Japanese interface, and the fixed Japanese Slice 1 target. Onboarding and Settings expose exactly 32 definition languages with explicit Simplified Chinese, Traditional Cantonese, Latin-script Serbo-Croatian, and Tagalog runtime identities.
- Settings recommends a native-language Japanese dictionary where the frozen catalogue has one and an explicit English fallback otherwise. The published catalogue contains 186 entries backed by 167 immutable SHA-256 objects, with a ready recommendation manifest for every Slice 1 language.
- Non-native local, Jiten, JPDB, Bunpro, and WaniKani definitions can be translated automatically per source. Translation is off by default, sends only selected definition or gloss text to Google Translate, appears before the untouched original, and fails without hiding the source definition. Personal WaniKani notes, mnemonics, readings, account state, and controls are excluded. Ancient Greek keeps its dictionaries and original definitions without offering Google's unavailable target.

### Changed

- Sentence translation now follows the active learner/definition language instead of treating the English/Japanese interface choice as the translation target. Subtitle translation respects the language chosen for the translated track instead of forcing English.

## [1.7.1] - 2026-07-23

### Changed

- Dynamic page text now uses one generic live-range projection path across YouTube, Reddit, consent pages, compact controls, and open web components. The previous site-specific clip opening and passive-control exceptions were removed; enabled furigana, pitch, status, and lookup annotations remain visible without reflowing or resizing page UI.

### Fixed

- Furigana is centred over its exact source characters, while pitch/status underlines and highlights follow the same measured word fragments with no detached gap. Opaque menus hide only the readings behind them, then restore the background cleanly after closing; compact labels no longer collapse into ellipses or bunch repeated readings together.
- Sparse late parses can no longer erase a complete compound reading or pitch pattern. Bounded public Jiten hydration finishes the current small annotation target, so multi-token labels retain complete facts without unbounded requests.
- A subtitle position saved below a shorter video remains usable there, but is temporarily rebased into the visible viewport when the next player is a full-height Short. The preferred position is preserved and returns when it is reachable again.

## [1.7.0] - 2026-07-23

### Changed

- Immersion Kit now mounts immediately in a centred, height-bounded 16:9 area on revealed JPDB, Jiten, and Bunpro review cards, with the same compact treatment on Study. Other dictionaries retain the full card width, and ordinary detail pages keep their established layout.
- Jiten prefetches one exact current-card Immersion Kit search without exposing it on the question side, reuses that in-flight request on reveal, and leaves fallback fan-out until it is needed. Local and provider definitions then hydrate progressively after the stable review shell mounts.
- After visible review media decodes, the carousel warms at most one adjacent image; ordinary reader lookups do not make speculative media requests.

### Fixed

- JPDB review questions no longer mistake sentence tokens for the reviewed headword, so definitions and Immersion media stay hidden until the answer is revealed.
- Review sites that replace the document body while revealing an answer now reattach Yomu's scanner, puck, and answer addon immediately instead of disappearing until a later card transition.
- Moving to the next Jiten card removes the previous answer immediately instead of waiting for a resettable 500 ms delay or rebuilding the whole addon after every provider finishes.
- Turning JPDB or Bunpro definitions off now persists and hides those definition panels; lookup and frequency pills remain independent.
- Immersion Kit review controls meet the 44 px mobile touch target, blurred translations remain revealed after one tap, and the carousel is no longer limited to two or three examples.

## [1.6.411] - 2026-07-23

### Fixed

- Multiline detached-furigana lanes now retain a visible interline gap across subpixel font rasterization differences in Chromium and WebKit, while single-line text and constrained controls keep their authored dimensions.

## [1.6.410] - 2026-07-23

### Added

- Yomu Academy account/profile deletion now returns a privacy-minimized 90-day receipt while retaining declared minimal payment/redemption audit records, and a credential-gated live proof can bind real Google recovery, two-device pairing, deployed-client export, deletion, hosted app bytes, Worker version, migrations, and reviewed git commit without forging provider callbacks.
- Reader-account devices and Academy profiles now share one bounded encrypted export without mixing their independent event cursors. The export freezes both logs, streams Academy then Reader history, includes revocable Reader credential metadata without bearer secrets, and counts both logs in deletion receipts.

### Changed

- Aakash's approved v009 anime-style sprite family is now the runtime source across Academy surfaces; the superseded v005 family is archived outside the repository rather than retained as an active candidate.
- The Academy production plan now treats the calendar as Day 1 through Day N. A day closes only after every required, optional, revisitable, one-off, social, study, exploration, minigame, and evening activity available on that date is implemented and verified; the 48 core chapters do not cap the calendar.

### Fixed

- Academy Google linking now rolls back paid-code redemption and every account/profile write on conflicts or later failures and logs only a fixed failure category. Signed session-bound export traversals terminate beyond 24,000 records without shared-NAT budget coupling, and account holders can delete encrypted profile data without deleting their identity.
- Academy lifecycle proof deletion now requires an expiring, single-use server grant bound to the authenticated production test account and run nonce. The supervised proof compares the active immutable Worker version and script digest with a locally reproduced reviewed bundle, exports large encrypted histories through a bounded stream, protects export creation as a same-origin POST, and prunes 90-day receipts on an observable scheduled retry path.
- Multiline framework-owned prose now reserves measured room for detached furigana, while clipped previews, titles, and compact controls retain the page's dimensions. The shared source-projection path also removes the duplicate pale underline and keeps late compound pitch such as `登録者数` continuous across wrapped fragments.
- Detached readings now clear rounded chip and tab edges instead of sitting flush with the clipping boundary. The geometry is shared across sites and verified in Chromium and WebKit.

## [1.6.409] - 2026-07-22

### Fixed

- Compact controls with nested layout wrappers or icons now count only real text lines when deciding whether detached furigana can safely escape authored clipping. This restores the complete furigana and pitch presentation on Reddit's `賛成票率順` sort button and the same control structure on other sites, without a Reddit selector or host-specific branch.
- Repeated provisional parses can no longer replace a complete non-destructive annotation with missing readings or pitch. Richer and authoritative updates still replace it normally, so dynamic controls remain complete without freezing legitimate dictionary corrections.
- Removed the v1.6.406 Jiten detail-limit overrun and restored the ordinary bounded hydration path. Completeness is now enforced in the generic render and clip path instead of requesting past the configured limit.

## [1.6.408] - 2026-07-22

### Fixed

- Framework-owned text now uses the normal Yomu highlight only on each measured word fragment. The redundant full-mirror highlight was removed, preventing large coloured rectangles across YouTube descriptions while preserving furigana, pitch underlines, and the same generic annotation path on other sites.

## [1.6.407] - 2026-07-22

### Changed

- Type practice now uses a balanced tablet and desktop control scale: the answer field is narrower with restrained text, Check has a normal action-label size, secondary controls share consistent touch targets, and Type/Write clearly shows which mode is selected.
- Handwriting now keeps kana visible as scaffolding and grades only the kanji in mixed words. 飲み物 appears as ＿み＿ and advances from 飲 directly to 物. Kana-only words stay in Type mode with the unavailable Write option disabled.

## [1.6.406] - 2026-07-22

### Fixed

- Short controls, menu rows, and other compact annotation targets now finish Jiten detail hydration when the normal request cap lands inside a multi-token label. Furigana and pitch underlines no longer stop partway through compounds such as `賛成票率順` or replace only the first half of `並べ替え基準`; the bounded fix applies to the same structure on every site.

## [1.6.405] - 2026-07-21

### Fixed

- Website account controls and Yomu Gaming's native backup controls now mount relative to their direct container even when the target UI is nested, preventing account setup from breaking alternate navbar and settings shells.

## [1.6.404] - 2026-07-21

### Added

- The Yomu website now offers Create account and Sign in controls, shows the current signed-in name, and links directly to Profile & sync. A free Reader account can pair the userscript or browser extension and keep the Academy/local Study deck encrypted and synchronized across devices; Academy curriculum access remains a separate entitlement.
- Reader Settings → Backup & sync can claim a one-time website pairing code, show the connected account and last-sync state, sync immediately, revoke the current Reader device, or create a recovery code that restores the website key from a surviving Reader.
- Academy cards now carry their local SRS state, due date, highlighting, and swatch through reading pages and Study, with cross-tab repainting after mining, grading, remote updates, and deletions.

### Changed

- Study's former Dictionary source is now Academy. JPDB appears in the source switcher only when a JPDB key is configured; a Jiten-only or keyless setup no longer advertises an unusable JPDB queue.
- Reader account sync uses client-side AES-256-GCM encryption. Yomu's Worker stores only hashed device credentials plus opaque encrypted card events and their delivery metadata; the 32-byte profile key remains on paired clients.

### Fixed

- Study lookup headers no longer repeat a bare frequency value such as `#400`, and Japanese readings are rendered as furigana on the word instead of as a trailing kana label.
- Cross-device deck reconciliation now preserves the newest schedule or deletion even when events arrive out of order, and startup performs a full comparison so a missed cross-tab notification cannot strand a local card.

## [1.6.403] - 2026-07-21

### Fixed

- Bunpro, Jiten, and JPDB example sentences now receive furigana across the full Japanese sentence instead of annotating only the highlighted lookup word. Every provider translation is blurred by default and can be revealed with a click, tap, Enter, or Space; when Jiten supplies no translation, よむ fills it with the existing cached sentence translator instead of showing source metadata or an empty row.

## [1.6.402] - 2026-07-21

### Fixed

- Late vocabulary detail now updates the exact word already on the page instead of only the popup. Jiten's confirmed reading is shared with pitch and provider-frequency enrichment, so a first lookup no longer says exact pitch is unavailable, JPDB no longer loses its frequency number in the identity race, and words such as 毎日, 使える, 漫画, 問わず, and 人気 gain their available furigana and pitch without a refresh or second click.
- Embedded controls that begin in English and localize later are now noticed on every site. A sign-in button such as “Continue with Google” can change to Japanese after the frame loads and is then parsed normally, while non-Japanese frames retain only a small mutation wake-up check instead of running the full reader.
- Safari and WebKit now paint mirrored controls and ordinary page words through one synthetic pitch-underline channel. Furigana stays aligned in compact controls, pitch lines remain visible under segmented ruby, and adjacent differently coloured words sit on the same vertical baseline.

## [1.6.401] - 2026-07-21

### Added

- The hosted Study page is now an installable offline-first Yomu app on iPhone, iPad, and Android, with native-style bottom navigation for Study, Library, Stats, and Connections, an explicit offline state, a stable app identity, and direct launch shortcuts. It keeps the same local cache and supported-provider grade outbox, so warmed reviews keep moving on the train and sync after reconnecting.

### Changed

- Every fresh card now starts at its first enabled learning step—Kanji 1 by default—instead of jumping to Word. The numbered step rail stays on one line on desktop and scrolls horizontally on phones, while the prompt, answer, and actions now read as one focused learning surface.
- Type practice now keeps the input and its action together, supports audio, accepts typed kana or the reading, gives retry feedback without revealing a missed answer, preserves the first-attempt grade, and turns Check into Continue after a correct response. The navigation label is now the clearer Previous.

### Fixed

- Incomplete subtitle and API sentence fragments, including continuative endings such as 「E組の全員に同じ説明をし」, are rejected before they can become Study clozes.

## [1.6.400] - 2026-07-21

### Fixed

- Source-projected annotations now keep their active underline and highlight colours inside shadow-root controls as well as ordinary page DOM. The projection layer passes the selected annotation paint to each exact source fragment, so web components no longer get correctly positioned but transparent pitch/status decoration.
- Layout regression coverage now enforces the new passive-annotation contract across Chromium and WebKit: furigana stays visible in buttons, metadata, clipped rows, and neighboring-text cases without changing the page's authored dimensions.

## [1.6.399] - 2026-07-21

### Fixed

- Removed an unused cache reset hook from the Jiten lookup performance work so the published source passes the repository dead-code gate.

## [1.6.301] - 2026-07-21

### Added

- Immersion Kit now appears inside Bunpro vocabulary and grammar pages, lesson cards, and revealed quiz or review answers, using the same in-page enhancement as jpdb and Jiten. It follows Bunpro's in-place SRS loop as the item changes, stays out of unrevealed question prompts, and removes the previous item's examples before the next question can appear.

## [1.6.300] - 2026-07-21

### Added

- Immersion example cards now include View on Immersion Kit and View on Nadeshiko links in popup lookup, Study, and enhanced jpdb/Jiten pages. Nadeshiko is also available as an optional Settings lookup pill, and its public website search needs no API key.

### Fixed

- Immersion Kit no longer stops at the old untouched three-example default. Existing installs using that default move to All, popup and Study surfaces can keep up to 12 examples, and deliberately configured limits stay unchanged.
- Blurred Immersion Kit translations now reveal reliably with one tap on phones and tablets, remain revealed after the finger lifts, and use a full-size touch target on coarse-pointer devices.

## [1.6.275] - 2026-07-21

### Changed

- Overlapping Jiten parsing work is now coalesced into bounded provider batches. Page scans, subtitle preparation, and popup fallbacks that start together share one `reader/parse` request per unique text row instead of each caller issuing its own lookup, while large payloads remain split and concurrency-limited.
- Repeated Jiten vocabulary details, searches, kanji facts, and kanji word pages now reuse a bounded session cache, including in-flight requests. Failed reads are evicted immediately so a transient outage can still heal on the next lookup.

## [1.6.274] - 2026-07-21

### Fixed

- Furigana, pitch underlines, and word highlights on framework-owned text now use the same source-range projection on every site. Yomu no longer injects wrap points or reflows a duplicate line, so annotations stay attached to their exact glyphs even when one Japanese word wraps across two lines; furigana sits directly above its kanji and the underline follows each real line fragment.
- Enabled annotations no longer disappear from buttons, navigation, metadata, or other passive chrome because a collision heuristic considered their lane unsafe. Passive now controls interaction only, never visibility. YouTube-specific scanning is also restricted to actual YouTube app hosts, so consent.youtube.com and other ordinary pages use the standard in-flow annotation path.

## [1.6.273] - 2026-07-21

### Added

- WaniKani is now a complete optional account integration alongside Jiten, JPDB, and Bunpro. A personal access token connects directly from the browser to WaniKani without a proxy; Yomu respects the account's available level, shows WaniKani meanings, readings, mnemonics, hints, components, visually similar kanji, related vocabulary, context sentences, audio, assignment stage and review accuracy, and adds currently due assignments to Study and My Cards. Submitted reviews use WaniKani's incorrect meaning/reading counts, are sent only while online, and cannot be accidentally replayed or locally undone.
- Uchisen kanji support is available throughout the reader, including normal popovers, the Study experience, and page enhancements, with its keyword, component groups, generated stroke image, and stroke-order carousel kept together as one coherent source.

### Security

- WaniKani tokens remain in browser storage, are masked in Settings, never appear in request URLs or logs, and are sent only as bearer credentials to `https://api.wanikani.com` with the official API revision header.

## [1.6.272] - 2026-07-21

### Changed

- Support contributions now use one production Checkout at support.yomureader.com, with a flexible amount in GBP, USD, EUR, CAD, AUD, or JPY. Academy no longer exposes its old test-mode Checkout; every verified contribution is delivered through the private support bridge as permanent Academy access.

### Fixed

- Test-mode Stripe sessions can no longer appear in the live monthly support total. The webhook and progress query both require live-mode sessions, and the banner now shows the genuine production total.
- The new-tab support banner follows Yomu's selected interface language instead of remote English copy. Japanese users now see Japanese progress text, labels, and call to action, with currency values formatted for the selected contribution currency.

## [1.6.271] - 2026-07-21

### Fixed

- Safari extension packages no longer claim they can inject into local `file://` pages, which Safari does not support, and Apple review notes are now generated from the final hardened manifest instead of carrying a stale new-tab warning. Yomu still packages Study as an ordinary page and never replaces Safari new tabs.
- Firefox packages no longer trigger Mozilla's three “unsafe assignment to innerHTML” warnings. Yomu's owned templates now pass through a local sanitizer before becoming DOM fragments, and the unused compatibility helper treats HTML-looking input as text, so AMO gets the same rendered interface without the ambiguous dynamic HTML assignments.

### Changed

- Feature releases such as `v1.7.0` can now flow from a protected GitHub Release to Chrome Web Store and Firefox Add-ons without rebuilding the reviewed package. Chrome supports a linked service account, fails closed on new store warnings, and publishes automatically only after approval; Firefox uses its official signed-add-on submission flow. Apple release automation is documented for activation after the developer account and signed container app are available.
- Yomu's GitHub page now offers the same three optional ways to support ongoing development—direct contribution, Patreon, and Ko-fi—and the browser-store listings make clear that every extension feature remains free.

## [1.6.270] - 2026-07-21

### Changed

- Anki-backed Study sessions now open faster and do less work: independent deck checks run together, duplicate note searches are gone, and card details are loaded only as far as the visible study queue needs them. Sparse or incompatible cards still advance through progressively larger bounded windows, so performance does not come at the cost of silently shortening a session.

### Fixed

- Reopening Settings after choosing an Anki note type now keeps that saved note type selected. An automatic Anki scan could replace the visible choice with its highest-scoring suggestion even though saving and card creation still used the original choice, making Settings misleading; scans now preserve any saved type that still exists in Anki.

## [1.6.269] - 2026-07-21

### Fixed

- Review card fronts no longer spoil the answer: the word you are being tested on stays a plain prompt on the question side, with no furigana and no pitch underline, and is annotated as usual once you reveal the answer. Yomu had been annotating the headword on the front of jiten study cards and jpdb reviews, showing the reading you were meant to recall; the hosted study page already behaved correctly and now the native sites match it.
- Moving to the next card in a jiten study session now scrolls back to the top, so each new card starts at its headword instead of wherever you had scrolled on the previous card. The page only scrolls on a genuinely new card, not when you reveal the answer to the one you are on.

## [1.6.268] - 2026-07-21

### Fixed

- Furigana and pitch underlines now stay attached to the right word on multi-line titles and descriptions. Where Yomu paints its readings over the page's own text, such as YouTube video titles, Shorts titles, and channel labels, the overlay re-flowed the Japanese text itself and could not reproduce where the page wrapped each line, so on the second and later lines the readings and underlines drifted away from the words they belonged to. Each overlaid word is now pinned to the exact position of the real text it annotates, so alignment stays correct on every line, and it is re-checked when the page reflows after a thumbnail finishes loading or an iPad rotates.

## [1.6.267] - 2026-07-21

### Fixed

- The Immersion Kit now refreshes when you move to another card on jiten.moe. Every card in an SRS study session lives at the same page address, so Yomu could not tell that the word had changed and left the previous card's video clip and example sentences in place; it now notices when the card on screen no longer matches the Immersion Kit already added to the page and rebuilds it for the new word.

## [1.6.266] - 2026-07-21

### Fixed

- An API key or theme set on the yomureader.com Settings page now reaches youtube.com and every other site. On iPad Safari the hosted-app settings live in that page's own storage while every other site's userscript reads the shared userscript store, so keys and the dark theme were stranded on yomureader.com and other sites fell back to defaults (light theme, no key). The userscript now promotes those stranded values into the shared store the instant it loads on yomureader.com, filling only values still at their default so a choice made on another site is never overwritten.

## [1.6.265] - 2026-07-21

### Fixed

- Safari (including iPad and iPhone) is no longer mistaken for Firefox. A Safari Web Extension exposes the same content-script API shape as a Firefox extension, so Yomu wrongly ran the Firefox data-consent flow and blocked API key entry with an open a Yomu page message. Safari is now told apart by its extension URL scheme, so you can enter your Jiten, JPDB, and other keys directly in Settings on any page, and the JPDB connection status and deck lists load again.

## [1.6.264] - 2026-07-21

### Fixed

- SRS status highlighting is visible again on framework controls such as YouTube titles, buttons, and labels. Those overlaid words now show a soft translucent status tint. The earlier solid-block fix had removed every background from overlay words, which left the SRS status with no way to show at all; the restored tint is light enough that the page's own text stays readable through it and the pitch underline is undisturbed.

## [1.6.263] - 2026-07-21

### Fixed

- On page-owned text such as site buttons, video titles, and labels, the pitch or status underline now runs under the whole word, including the kanji that carry furigana, instead of appearing only under trailing kana. The detached reading box was an atomic inline that swallowed the word's underline, so kanji that paired with a reading lost the line; the box now carries the word's own underline while the reading above it stays undecorated.

## [1.6.262] - 2026-07-21

### Fixed

- Status highlighting on site buttons, video titles, and other page controls no longer paints a solid coloured block that hides the text underneath. Those overlaid words now show a quiet status underline again instead of an opaque highlight that covered the page's own glyphs.

## [1.6.261] - 2026-07-21

### Fixed

- The floating button steps off an overlapping video immediately on rotation and viewport changes again, scroll flings keep the battery-saving settle delay, and reader boot no longer spends an extra page-wide layout pass.

## [1.6.260] - 2026-07-21

### Fixed

- Furigana on clamped title rows no longer appears and then disappears: the layout verdict is now measured after paint, demotes readings only on clear failure evidence, and recovers instead of hiding them permanently.
- Action labels and titles on YouTube no longer widen or truncate into ellipses: shrinkable single-line rows are detected generically and their readings route through the width-neutral detached lane.
- Words like 技術 no longer render with a gap between their kanji: furigana pairs per dictionary-attested segment, and the essential ruby styles now reach shadow roots and pages still waiting for the full stylesheet.
- Compound words paint their pitch underline as soon as any part's accent is known, colouring unknown parts neutrally instead of dropping the whole underline.
- Underlines and readings over page-owned text now align to the exact glyphs, correcting for leading icons and re-aligning after font swaps, image loads, and rotations.
- Visible Japanese inside aria-hidden containers such as badges, thumbnails, and metadata rows is now annotated based on what actually paints on screen.
- Jiten and jpdb status highlighting no longer vanishes when pitch enrichment repaints a word, and words that missed their status receive one batched authenticated backfill.
- Firefox pages that attach shadow roots no longer break: shadow discovery patches the page realm directly or through an injected page script instead of a cross-realm bridge.
- The annotation pipeline now reaches zero scheduled timers on hidden or videoless pages, cutting background battery drain.

## [1.6.259] - 2026-07-20

### Fixed

- Newly replicated local dictionaries now replace existing Jiten or fallback annotations immediately, so installed definitions become the page's parsing source without a reload.

## [1.6.258] - 2026-07-20

### Changed

- Every verified positive GBP Stripe support or Ko-fi donation now creates a permanent Yomu Academy entitlement, and a verified positive Patreon membership grant remains permanent after expiry, decline, deletion, or refund. Provider signatures, private-ingress authentication, HMAC-at-rest identifiers, and replay idempotency remain mandatory.
- Stripe support Checkout now binds an HttpOnly browser claim to the signed payment, giving the donor a secure self-claim path without making success redirects or transaction IDs into access credentials. PayPal.me remains link-only until a PayPal REST-app webhook can be cryptographically verified.

## [1.6.257] - 2026-07-20

### Added

- The documentation navbar and README now link to Stripe support, with Patreon and Ko-fi entries ready to appear only after their public pages are verified.
- Yomu Academy now has a canonical, verified-provider foundation for granting payment entitlements without duplicate events. Provider accounts still need to be connected and published, and ordinary Stripe support donations remain support-only unless Academy owns the checkout.

### Changed

- New-tab learning now uses one Study stepper for recall, kanji, and listening instead of parallel modes, while safely migrating existing listen, kanji, and recall sessions.

### Fixed

- Documentation and release delivery now retry only transient platform failures, and the CI gates cover the shipped layouts, dependencies, nightly smokes, and desktop release assets reliably.

## [1.6.256] - 2026-07-19

### Fixed

- Reddit no longer becomes progressively hot and sluggish after annotation on iPad Safari. A target-budget stop was walking up to 128 descendants in every untouched component branch to queue work that the already-full scan immediately discarded; bounded scans now stop at the budget and the normal continuation advances to later Japanese and open shadow roots without that repeated page-wide tail work.
- Settings changed on yomureader.com now survive refreshes, site changes, and browser storage resets without creating a competing local profile. The hosted Study runtime adopts a late userscript bridge, website-only changes are recorded as a field-level pending patch and merged once into the newest GM settings, and the resulting GM value is mirrored locally for fast standalone startup. Rapid website theme/language writes are serialized so an older write cannot finish last.
- The dictionary settings panel no longer claims a recommended local dictionary is installed merely because its cross-site preference exists. Installed and Update states now wait for the current origin's live IndexedDB summary, matching whether local entries can actually appear in popovers.

## [1.6.255] - 2026-07-19

### Changed

- Japanese in interactive chrome — buttons, tabs, sort chips, menu labels, timestamps, and other compact controls — now honours the configured word-state highlight at rest, exactly like content words. The previous bare-until-hover rule stripped the highlight channel from chrome behind a growing per-site exception list; the highlight setting is now the single switch, with no per-surface exceptions.

### Fixed

- Detached furigana that straddled the painted border of a compact control — half on the page background, half on the pill — now lifts fully clear of the control so the reading sits on one background and stays legible; the existing collision checks judge the lifted position.

## [1.6.254] - 2026-07-19

### Fixed

- Immersion Kit example sentences load again on the yomureader.com demo popup instead of sticking at the loading message forever. The example client and its popup controller ship in the kanji-study companion, but the homepage and docs demo never loaded that companion, so the open section had nothing to fetch with. The hosted docs demo now loads the kanji-study and Anki companions like the video player and PDF reader already do, and the reader resolves every kanji-study collaborator lazily so a companion that registers after the reader boots still works.
- The dictionary popup no longer shows a bottom mining-drawer handle that cannot open. The drawer's expand and collapse behaviour lives in the kanji-study companion, so when no companion is available the collapsed pill was dead weight; the drawer and its handle now only render when there are mining options that can actually be revealed.

## [1.6.253] - 2026-07-19

### Fixed

- Bunpro word frequency, pitch accent, and dictionary entries no longer require a fresh Bunpro login. This data is public, yet the popup silently dropped all of it whenever the stored Bunpro session token was missing or expired, which is why the Bunpro frequency evidence could vanish entirely on devices that had never captured a token. Public lookups now attach the login only when one is available and retry anonymously when Bunpro rejects a stale token; review state and grading still require the account.
- The Bunpro frequency rank now shows inline on the Bunpro pill, matching the Jiten and JPDB pills, instead of adding one pill per corpus to the row. The full per-corpus breakdown, such as General, Anime, Novels, Netflix, and Dictionary, moves into the pill tooltip.

## [1.6.252] - 2026-07-19

### Fixed

- The dictionary popover no longer jumps from one side of the word to the other while its entry loads. Placement is now planned for a full-size entry up front, and once the panel is shown it keeps its side as sections hydrate, so the content shift where a panel briefly appears above the word and then snaps below it is gone.
- The docs language toggle now switches the whole Getting Started page: the rewritten install, update, browser-extension, welcome-panel, and mobile sections all have Japanese copy again, so neither language shows leftover text from the other after toggling.
- Tapping the docs language toggle once is enough again. A reader install that finished booting just after the tap could save its older language preference over the new choice, forcing a second tap; the page now keeps the tapped choice and the reader adopts it instead.

## [1.6.251] - 2026-07-19

### Fixed

- Component controls whose visible Japanese label lives entirely inside their own shadow root — such as feed action-bar share buttons rendered as slot fallback behind a boxless wrapper — are now annotated with furigana and pitch like any other control. The scanner's boxless-wrapper pruning only read light-tree text, which cannot see across a shadow boundary, so the whole branch was dropped before the component was ever walked, registered, or observed; the pruning check now peeks through open shadow boundaries with the same bounded lookahead the shadow walk already uses, which also keeps the component's later re-renders observable.
- A fragment walk that stops on a full target budget now queues the un-walked elements that can host open shadow roots onto the deferred continuation rounds, so a large component tree can no longer permanently strand its trailing controls outside annotation coverage.

## [1.6.250] - 2026-07-19

### Fixed

- Settings saved on yomureader.com, such as the Jiten API key and the site theme, now reach the shared settings store the installed userscript reads on every other site: the storage bridge covers the whole yomureader.com site instead of only the app pages, and the site theme and language toggles write through it too.
- Settings that earlier versions stranded in yomureader.com's own browser storage are recovered on the next visit with the userscript active: values chosen there fill in wherever the shared store still holds its default, while choices made on other sites keep priority, and homepage demo staging values are never copied into real settings.
- When the userscript attaches late on yomureader.com, the page now switches to the shared settings as soon as its storage bridge connects instead of showing the site-local copy until the next reload.

## [1.6.249] - 2026-07-19

### Changed

- The Update button in Settings Help now sends browser-extension installs to the extension store for the current browser, with Firefox, Safari, and Chromium-family browsers each routed to their own store page. Userscript installs keep opening the hosted script or their manager's update flow as before.

## [1.6.248] - 2026-07-19

### Fixed

- On browsers that cannot make room for furigana inside a clamped snippet row, the readings now stay tucked away instead of pushing the row's own text out of view. Rows that can grow keep their always-visible furigana.

## [1.6.247] - 2026-07-19

### Fixed

- Word-status highlighting from a connected Jiten, JPDB, or Anki source now shows by default on every content word, including words wrapped in links such as the cards and guides on yomureader.com. Previously linked words revealed their status colour only while hovered and otherwise looked like plain page links; interface chrome such as navigation bars, buttons, and tabs still stays uncoloured until hover.
- The homepage Try me sample no longer fakes account word-status colours for visitors without a connected dictionary account: in a fresh or incognito browser it now shows exactly what a keyless install renders, furigana and pitch underlines, and the known/due/new status boxes appear only when the viewer really has a status source connected.

## [1.6.246] - 2026-07-19

### Fixed

- Userscript updates no longer install a version that is hours out of date. The script now declares explicit update and download endpoints that always revalidate, so a manager that had cached the hosted copy for several hours stops re-offering an older release such as 1.6.241 while a newer one is published.

## [1.6.245] - 2026-07-19

### Fixed

- Yomu popovers, sheets, settings, notices, and the floating puck now keep their intended physical size under real iPad Safari full-page zoom. The previous browser-surface signal never fires on an actual device because iOS answers outerWidth from the web view itself, so the zoom is now inferred from the physical screen against the layout viewport: both axes must shrink together and the ratio must land on one of Safari's zoom steps, so Split View, Slide Over, and Stage Manager window shapes are never misread as zoom.
- The page-zoom compensation is no longer Reddit-specific. The same adapter now protects every Yomu overlay on every site in Apple touch browsers, replacing the reddit.com-gated code path with one generic mechanism.
- Popup headwords whose stored reading brackets interleave kana between annotated kanji now anchor each bracket reading to its own trailing kanji run. Furigana lands over the correct glyph, the pitch underline no longer paints twice across a mis-spanned ruby base, and the plain kana duplicate beside an already ruby-annotated headword is suppressed instead of repeating the same reading.
- Furigana returns to tall flex-centred controls such as padded pill buttons and banner chips: a clipped control whose base text is proven to be a single untruncated line may open its clip for the reading lane regardless of padding-driven box height, while genuinely tall panels and multi-line clamps stay closed.

### Changed

- Slightly larger default popup typography for readability, especially on iPad: popup and dialog base text moves from 14 to 15 pixels, definitions and example sentences from 13 to 14 pixels, the headword from 24 to 26 pixels, the kana reading row from 15 to 16 pixels, and the default popup Japanese font weight from 400 to 450. Settings body text and in-page content sizes are unchanged, so existing layouts keep their geometry.

## [1.6.244] - 2026-07-19

### Changed

- Clamped multi-line text rows that can grow in place, such as search-result snippets and description rows on many sites, now keep their furigana visible at rest: each line makes room for the reading naturally instead of hiding it until hover.

### Fixed

- Words that wrap across a line break now keep their pitch or word-state underline on every line, not only the first.
- A word that the parser recognised but the page renderer had to drop, for example when other page content interrupts its text, is now re-annotated by the built-in segmenter instead of being left as plain unmarked text between annotated neighbours.

## [1.6.243] - 2026-07-19

### Fixed

- Tapping anywhere inside the open dictionary popover now pins it in sticky mode, so interacting with it no longer lets it close as a transient hover popup; it stays open until a tap outside dismisses it.

## [1.6.242] - 2026-07-19

### Fixed

- On Safari, hover audio no longer stays silent until a word is clicked: the first tap anywhere on the page now unlocks the gesture-authorized audio channel that hover playback reuses.

## [1.6.241] - 2026-07-19

### Changed

- The browser extension now leaves the browser's new-tab page completely alone. Study opens deliberately from Yomu instead, and a fresh standalone Study session begins at the Word step for a more recognition-first flow before returning to the learner's configured sequence.
- Extension settings now describe webpage scanning in plain language: leave pages unchanged, scan Japanese automatically, or scan only when asked.
- Chrome and Firefox store copy now describes Yomu as providing "a study page," and the extension icon has been re-centred at every generated size.
- The hosted Study page metadata now describes a deliberate study session instead of implying that Yomu belongs on every browser new tab.

### Fixed

- The published privacy policy now uses a real `/privacy/` directory route, so browser-store reviewers and users reach the policy instead of a trailing-slash 404.
- Firefox now asks for its built-in website-content and optional account-data consent in the correct extension-owned context before reading or storing account credentials, and fails closed when that consent cannot be requested.
- Store packages now carry their reader CSS and third-party notices locally, while the Firefox source bundle and browser archives build reproducibly for review. Major-version publishing is prepared automatically but remains behind a protected human release checkpoint.

## [1.6.240] - 2026-07-19

### Fixed

- The yomu wordmark in the Study and new-tab navigation now leaves enough line-box space for the lowercase y, so its descender is no longer clipped.

## [1.6.239] - 2026-07-19

### Fixed

- In Japanese mode the hosted docs now annotate the site chrome as reading material: the top navigation, mobile local nav, and sidebar labels such as 学ぶ, 学習, and アカデミー receive furigana and pitch underlines like the content column, while menu links keep their normal navigation clicks. English mode keeps the chrome out of scope.

## [1.6.238] - 2026-07-19

### Changed

- The Japanese-site-language preference (locale spoofing, preference cookies, and redirects to Japanese site versions) now ships in the Yomu Video companion, freeing core userscript space under Greasy Fork's 2 MB limit. Installs without the companion simply leave the preference inactive.

## [1.6.237] - 2026-07-19

### Changed

- Moved the Bunpro provider suite, including the API client, SRS adapter, word-state colouring, token importer, and the popup definition section, into a new Yomu Bunpro companion script. Together with the Immersion Kit move this restores the intended safety margin under Greasy Fork's 2 MB core-script limit. Behavior is unchanged: the companion is always required by the userscript, bundled into hosted builds, and loaded by the Academy reader runtime.
## [1.6.236] - 2026-07-19

### Changed

- Moved the Bunpro provider suite, including the API client, SRS adapter, word-state colouring, token importer, and the popup definition section, into a new Yomu Bunpro companion script. Together with the Immersion Kit move this restores the intended safety margin under Greasy Fork's 2 MB core-script limit. Behavior is unchanged: the companion is always required by the userscript, bundled into hosted builds, and loaded by the Academy reader runtime.

## [1.6.235] - 2026-07-19

### Fixed

- Words whose dictionary entry is itself an inflected form, such as 問わず, no longer sit without a pitch underline. When the exact form is missing from the pitch dictionary, the reader deinflects it and projects the base verb's accent onto the surface — only for flat heiban bases, whose contour stays exact in every conjugation, so no word is painted with a guessed accent.
- Pitch enrichment that resolves a word in place now records the resolved accent pattern on the rendered word together with its colour class, so the popup, mining data, and the underline can no longer disagree about a word such as 役に立つ or 学習用.
- Bunpro lookups no longer refire a doomed cross-origin request for every hovered word on pages where the network path is blocked. A transport failure now opens a five-minute circuit breaker, and Bunpro requests may travel through the user's own configured CORS proxy, while the shared public proxy stays off-limits for authenticated calls.
- Hover and modal word cards no longer time out their local dictionary, pitch, and frequency sections while a busy page scan is running: interactive card loads now take priority over the background pitch scan between its chunks, and a blocked dictionary-database upgrade fails fast and retries instead of hanging every local lookup forever.
- On Firefox, the reader no longer logs Not allowed to define cross-origin object errors at page load. Values that cannot be cloned into the page world are skipped instead of written raw, and the OCR frame-request event goes through the shared cross-realm event factory.
- Status lines in the settings dialog — the version check, live connection results, and the Bunpro token line — now receive furigana and pitch annotation like the rest of the dialog, and re-annotate whenever their text is updated.
- Hovering an annotated word inside the settings dialog now opens the dictionary popover exactly like on ordinary pages, while buttons, links, and other interactive controls keep their native behaviour.
- With the theme set to Auto, the reader now resolves light or dark from the page's actual paint on every site instead of trusting the operating-system colour scheme, so the popup and settings chrome no longer render white on dark apps whose shell reports a light scheme.

### Changed

- Grammatical particles are now deliberately accent-neutral everywhere. Previously は, に, and と could wear an underline borrowed from a same-sounding noun while を and の had none; since a particle's pitch depends on the word it attaches to, no particle carries a lexical pitch underline anymore.

## [1.6.234] - 2026-07-19

### Changed

- Moved the Immersion Kit example-sentence client and its popup section controller into the Yomu Kanji/Study companion script, restoring real headroom under Greasy Fork's 2 MB core-script limit; the previous release had crossed the limit, which blocked publishing. Behavior is unchanged: the companion is always required by the userscript and bundled into hosted builds.

## [1.6.233] - 2026-07-19

### Fixed

- Importing a newer revision of an installed dictionary, such as Jitendex.org [2026-06-06] over [2026-05-05], now upgrades it in place: the old revision's settings row retires together with its data and hands its position, alias, and enabled state to the new revision. Previously the old row stayed listed as an enabled definition source that could never render again, so settings promised more popup sources than any lookup could show.
- Installs already carrying such stale dictionary rows heal themselves the next time the dictionary list refreshes: rows whose data was replaced by a newer revision are removed, while rows are never dropped merely because the current site has no imported data.

## [1.6.232] - 2026-07-19

### Fixed

- The homepage Try me demo no longer draws every underline twice: the pre-baked sample keeps its single demo underline and the reader runtime's second underline is suppressed inside it.
- Words the runtime annotates inside demo blocks no longer receive word-state highlight colours as if an API source were connected. Demo status colours are confined to the pre-baked sample sentence, and live annotated words follow your real decoration settings.
- Dictionary source titles in the word popup, such as the Immersion Kit section and Japanese dictionary names, are now annotated with furigana, pitch, and lookup like the rest of the Japanese interface. Clicking the annotated title looks the word up, while the rest of the header still opens and closes the section.
- Katakana compound words are no longer shattered into phonetic fragments by the keyless fallback segmenter, which could even start a fragment on a small kana. A contiguous katakana run such as イマージョンキット now stays one word.

## [1.6.231] - 2026-07-19

### Changed

- The word popup header now uses one consistent layout everywhere: the pitch-accent graph sits along the top next to the play button, and the dictionary and frequency pills always occupy a full-width row beneath the headword instead of wrapping inside a squeezed column. Genuinely narrow popups move multi-graph pitch evidence to its own full-width row under the title so nothing crushes the headword.
- The Bunpro section no longer renders a word-audio button on a line of its own. Bunpro word pronunciation now plays through the shared audio pipeline like Jiten and JPDB: enable the Bunpro source under Settings → Audio to include its recordings in the popup's main play button. Example-sentence audio buttons are unchanged.

## [1.6.230] - 2026-07-19

### Added

- Kanji drilldown keyword pills now add Kanji Alive's official primary gloss alongside Jiten or JPDB, RTK, and imported dictionaries. Matching glosses merge under one source badge; distinct glosses stay separate across reader popups, Study reveals, and kanji search. The compact hosted extract is pinned to Kanji Alive's CC BY 4.0 data and loads only when the optional Kanji Map origin source is enabled.

## [1.6.229] - 2026-07-19

### Fixed

- Enabling both Jiten and JPDB definitions now shows both dictionary sources even without a JPDB API key. JPDB vocabulary details use the existing cached, backoff-protected public lookup, and cards owned by Jiten or a local dictionary no longer send their provider-specific ids as false JPDB vocabulary ids.
- JPDB frequency pills no longer disappear when the public search returns duplicate records for the same exact spelling and reading, such as 今日（きょう）. The first ranked exact-identity result is used while differently read homographs remain excluded, so Jiten and JPDB ranks can appear side by side without borrowing evidence from another word.

## [1.6.228] - 2026-07-19

### Fixed

- Inflected verbs that a remote parse skipped, such as 使って and 行います, no longer render without furigana or pitch while their neighbours annotate. When local dictionaries are enabled, remote coverage gaps are filled with deinflected dictionary tokens that carry reading, furigana, and pitch, and only ranges the dictionary also misses fall back to plain segmenter fragments.
- Dictionary popup sections with nothing to show are hidden entirely: example-sentence groups no longer render a count-zero header or a no-examples placeholder, grammar and translation sections remove themselves when the sentence has no hints or no translation, and the Immersion Kit section disappears instead of announcing that no examples exist.
- The Japanese settings dialog now annotates a whole panel in one pass, so furigana no longer trickles in only after clicking around, and rewriting a label can no longer duplicate its text next to a still-annotated copy.
- Clicking an annotated word inside the settings dialog now runs a full dictionary lookup instead of showing an empty popup that contained only search links.

### Added

- Select-like dropdown triggers, such as language pickers built as role=combobox listbox buttons, are now annotated through the passive control channel, while genuinely editable comboboxes stay untouched. A native select whose only Japanese option is not the selected one now still surfaces that option in its annotated mirror.

## [1.6.227] - 2026-07-19

### Fixed

- The Academy courtyard notebook now grows with its task instead of trapping the word-order exercise behind an internal scroll panel, on desktop and phones alike, so the chips and the start control are always on the paper.
- Word-order chips on the courtyard notebook are readable paper slips with ink borders instead of grey app chrome, the answer line reads as a ruled handwriting line, and the reset control is a quiet inline link.
- Rie-sensei stands beside the courtyard notice board instead of behind it, so her clickable name tag is no longer buried under the pinned journal card at narrower windows.

## [1.6.226] - 2026-07-19

### Added

- Bunpro grammar entries now list vocabulary that uses the grammar point in a new Used in section; a small bounded set of Bunpro's coverage vocabulary is resolved with caching, so reopening an entry adds no extra requests.

## [1.6.225] - 2026-07-19

### Fixed

- Switching the yomureader.com interface language to Japanese now annotates the site's own text. The whole content column becomes a declared reading surface, so furigana, pitch colours, and word lookups work on the hero, install steps, and link cards exactly like on any other Japanese website, with an installed userscript or with the built-in page runtime. Navigation chrome stays unannotated, and English mode keeps the demo-only scope introduced in 1.6.220.
- Hosted docs localization no longer rewrites unchanged text nodes on every pass, which previously queued needless mutation records for the annotating reader to re-inspect in Japanese mode.

### Testing

- The Japanese-docs performance smoke now proves the content column annotates at volume while long tasks stay under 200ms and the first Try-me hover stays under one second, and unit coverage pins that a declared content column scans while navigation chrome does not.

## [1.6.224] - 2026-07-19

### Fixed

- Payment and wallet buttons, such as Apple Pay on Stripe-powered checkouts, no longer disappear or fail on Firefox while Yomu is enabled. The open shadow root discovery bridge previously replaced the page's attachShadow with a sandboxed function that page scripts were not permitted to call, so any web component attaching its UI crashed; the bridge now only patches the page realm with a function the page can actually call and otherwise falls back to bounded polling.

## [1.6.223] - 2026-07-19

### Fixed

- Dynamic Japanese inside open web components no longer develops random annotation gaps when a component starts empty, hydrates after the first scan, nests behind another component, upgrades after page load, or attaches its shadow root in a later task. Furigana, pitch decoration, and vocabulary status now wake through one globally bounded composed-DOM lifecycle instead of waiting for an unrelated click, scroll, or text mutation.
- Detached furigana no longer disappears when an opaque menu covers unrelated page text or when a long reading harmlessly overhangs adjacent words or punctuation on the same authored line. Collision checks now respect visible paint order; genuine clipping and cross-row collisions remain protected, while readings resolved after the first render stay in the compact detached channel and restore its containment correctly when removed.
- Kana-only component labels such as フィード now keep their pitch and vocabulary-status decoration even though their reading correctly produces no redundant furigana overlay. Additive mirror paint also follows pitch or vocabulary state resolved after the mirror mounts and inherits late page-theme colour changes.
- Semantic disclosure and sort controls are distinguished from the expandable content they control, so a safe detached-reading lane can open without changing height or click behaviour while actual panels remain clipped.

### Testing

- Added deterministic Reddit-shaped Chromium and WebKit coverage for nested, initially empty, late-hydrating, and late-upgrading open shadow roots, along with kana-only decoration, opaque-overlay paint order, safe same-line overhang, semantic disclosure controls, asynchronous reading/state repaint, and bounded mutation deliveries.

## [1.6.222] - 2026-07-19

### Fixed

- Fixed apparently random bare words, sentence fragments, and paragraph tails on dynamic pages such as Reddit. Hover and mutation activity now coalesce behind the active annotation pass instead of cancelling it, provider failures retry locally without dropping later batches, and capped scans continue past a failed head.
- Made parser output lossless and renderer-safe: short provider responses preserve one result per input, malformed or overlapping spans cannot claim coverage the renderer rejects, and uncovered Japanese—including half-width katakana—is repaired even when provider offsets drift across Latin text or punctuation.
- Registered open web-component roots before and during hydration, including roots attached after their host entered the page, and included them in delayed furigana, pitch, and word-status updates. Compact rows still hide only furigana that cannot fit safely; their base word and pitch/status annotation remain intact.

## [1.6.221] - 2026-07-19

### Fixed

- Furigana now stays visible on compact buttons, chips, menu labels, metadata rows, and nested clipped controls whenever its measured lane is unclipped and clear of nearby text. Only a reading proven unsafe is hidden; its base word, lookup target, and pitch annotation remain intact.
- Opening a menu or rescanning a nested control no longer closes an already-safe furigana lane. Clip reclassification is now performed only beside the geometry settle that commits the next visibility verdict, and remains reversible when the page reflows.

### Testing

- Expanded the Chromium and WebKit layout gates to require painted furigana on known-safe controls and nested metadata, explicit safety verdicts for every hidden reading, preservation of real expandable-panel clipping, and safe-to-unsafe-to-safe reflow recovery.

## [1.6.220] - 2026-07-19

### Changed

- On yomureader.com, よむ now annotates only declared demos and reading surfaces instead of translated navigation and documentation copy. Japanese interface mode stays responsive while the Try Me and other intentional reader surfaces retain furigana, pitch, and lookups.
## [1.6.219] - 2026-07-19

### Fixed

- Repaired partial remote token boundaries before subtitle and popup-example rendering, so `訪れた` is resolved as the inflected verb `訪れる` instead of the surname `訪` (`ほう`), restoring the correct furigana and pitch underline.
- Continued pitch enrichment when Jiten resolves a word but has no accent of its own: exact JPDB pitch now reaches words such as `浜面`, while aligned compounds such as `王子様` keep one lookup target and show honest per-component pitch segments rather than borrowing a false whole-word accent.
- Kept multi-accent and component pitch graphs in the otherwise-unused upper-right header space on wide iPad sheets; narrow phone and desktop-hover popups still use the readable full-width row.
- Fixed the remaining double-size Yomu interface on Reddit in iPad Safari by compensating Safari's per-site full-page view scale across popovers, sheets, settings, notices, and the puck menu. Anchors, nested lookups, dragging, video avoidance, and screen-edge placement now share one coherent coordinate space, while inline readings, subtitles, OCR, normal-scale Reddit, other browsers, and other sites remain unchanged.

## [1.6.218] - 2026-07-19

### Changed

- Bunpro dictionary entries now use the same compact example-sentence layout as Jiten and JPDB. Bunpro's inline full-width kana brackets are removed before display so よむ can add its own furigana and pitch annotations to the Japanese text.
- Bunpro frequency now shows every available corpus rank as a visible labelled pill, including General, Anime, Novels, Netflix, and Dictionary, while Bunpro pitch variants supplement rather than replace local or JPDB pitch evidence.
- Bunpro pronunciation recordings are available as a new opt-in audio source. It is added disabled to both new and existing audio-source lists, so the configured pronunciation source makes no requests until enabled; explicit Bunpro audio buttons fetch only when pressed. Recordings are fetched at runtime from Bunpro's public CDN; hosted/browser playback may use よむ's narrow public proxy.

## [1.6.217] - 2026-07-19

### Fixed

- Rendered exact one-mora pitch accents as a valid single-point graph instead of rejecting graphs with fewer than two morae, so 自（じ） now shows its high atamadaka point and one-mora heiban words show their low point.

## [1.6.216] - 2026-07-19

### Fixed

- Reused the matching visible Study card for parsed-word popovers when a portable card has neither a provider lookup target nor a parser cache entry, preventing 自（じ） from falling through to a fresh pitchless text lookup.

## [1.6.215] - 2026-07-19

### Fixed

- Restored the exact rendered pitch contour onto the provider source card selected for a Study popover, closing the final path where 自（じ） could show Listen/Speak but still report “Exact pitch unavailable”.

## [1.6.214] - 2026-07-19

### Fixed

- Kept short annotated labels inside their native ellipsis boxes, fixing the stray `…` that appeared on YouTube navigation and shelf labels on iPad. Reading-free annotation mirrors now remain clipped to the page's authored box, while labels that actually show furigana retain room for it.

## [1.6.213] - 2026-07-19

### Fixed

- Preserved exact pitch contours across the rendered Study-word lookup boundary, so clicking 自（じ） reuses the pitch already resolved for Listen/Speak instead of reopening a pitch-empty cached card and claiming “Exact pitch unavailable”.

## [1.6.212] - 2026-07-19

### Fixed

- Pitchless compound popup headwords such as 利用料金 now underline each fully aligned component with that component's own sourced pitch colour. Exact whole-word pitch still takes priority, partial or misaligned component evidence stays undecorated, and Yomu never combines component contours into a guessed whole-word accent. A stale popup rule that also hid valid exact-pitch headword underlines has been removed.

## [1.6.211] - 2026-07-19

### Fixed

- Kept pitch-accent underlines attached to their words while Yomu's compact fallback stylesheet is active. Mirrored text with furigana now uses a glyph-anchored native underline immediately instead of positioning the line at the bottom of a taller host box, so YouTube descriptions and multi-line homepage titles no longer draw pitch lines through the row below; the same fix covers equivalent mirrored layouts on other sites.

## [1.6.210] - 2026-07-19

### Fixed

- Hover lookups no longer flicker open and closed over Japanese words rendered by reactive sites. The popover watchdog now accepts an exact live word hit from Yomu's pointer geometry while still closing after the pointer moves away.

## [1.6.209] - 2026-07-19

### Fixed

- Fixed the hosted docs homepage language toggle from Japanese to English leaving most page copy blank on iPad Safari: language changes now remove the reader's Japanese annotations and overlay mirrors, restore hidden native text, and re-canonicalize reconstructed text instead of replacing it with stale pre-annotation fragments.

## [1.6.208] - 2026-07-19

### Fixed

- Treated a shared Study card with exact enriched pitch as authoritative for its own word popover even when the share source has no standard review-provider label, preventing the final fallback text lookup from recreating `自（じ）` without pitch.

## [1.6.207] - 2026-07-19

### Fixed

- Fixed shared Study cards losing late-resolved pitch when their word popover reopened the provider source card, which made `自（じ）` offer Listen/Speak but still claim “Exact pitch unavailable” in the popover.

## [1.6.206] - 2026-07-18

### Fixed

- Restored furigana, pitch, and word-state annotations across Japanese Settings Help copy, including version guidance, useful links, and support text; the Help card had retained a legacy surface-ignore marker that bypassed the newer settings annotation path.
- Kept Japanese Settings responsive while annotations start: the selected tab now paints first, hidden panels are skipped, and the active panel is enhanced in bounded slices instead of one large main-thread pass.

## [1.6.205] - 2026-07-18

### Fixed

- Fixed one-mora pitch accents such as 自（じ） across Study and popovers: Yomu now accepts exact single-level JPDB graphs, adds Listen/Speak when local, Jiten, or public JPDB enrichment resolves classifiable pitch, and omits those dead steps when no exact pitch exists.

## [1.6.204] - 2026-07-18

### Changed

- Kanji keyword pills are easier to scan: JPDB or Jiten, RTK, and installed kanji dictionaries that agree now merge into one pill with a combined source badge; the primary source is highlighted, and a +N pill summarises any overflow instead of silently dropping it.

## [1.6.203] - 2026-07-18

### Fixed

- Card headwords now always show their reading as furigana when furigana is enabled: page-level furigana modes such as known-status and difficult-kanji no longer strip the ruby off popover, study, and search headwords, which previously made the reading fall back to a plain kana chip beside the word.
- Kana-only headwords no longer repeat the identical kana reading beside the word; katakana headwords keep their hiragana reading.
- The study-page search detail header now renders the headword with furigana instead of plain text with the reading underneath.

## [1.6.202] - 2026-07-18

### Fixed

- Reused the browser-authorized media element for repeated Apple Pencil and mouse hover audio, so leaving a word and hovering again no longer shows the active speaker state while Safari silently blocks a newly created audio element; stale hover fetches also cannot retarget the shared channel after a newer lookup starts. The speaker now keeps its green accent for the full playback instead of only while audio is loading.
- Made installed Yomu userscripts and extensions announce themselves at document-start on yomureader.com. The website now keeps its hosted reader strictly as the no-install fallback, so an installed copy remains the runtime owner and retains its own language, Jiten key, and learning progress.

## [1.6.201] - 2026-07-18

### Fixed

- Kept Yomu's floating puck and radial controls at their intended size on Reddit mobile and tablet layouts by isolating them from Reddit's broad control zoom rules; other sites keep their existing sizing.

## [1.6.200] - 2026-07-18

### Fixed

- Stabilized the popup font-stack check in the priority smoke suite: it now waits for the configured Japanese font stack to actually be applied to the popup before reading styles, instead of racing the font application on a loaded machine; this removes an intermittent false failure in CI with no change to what is verified.

## [1.6.199] - 2026-07-18

### Changed

- Tidied internal test-fixture and subtitle helper modules so that helpers used only within their own module are no longer exported or re-exported, clearing the dead-code checker warnings introduced by the recent test and controller refactors; no change to behavior or test coverage.

## [1.6.198] - 2026-07-18

### Fixed

- Aligned the Academy character art records with the shipped sprite sets: Rie's completed glasses performances and Aakash's refreshed portraits are now consistently registered across the runtime, ledgers, and offline manifest, so the character book, journal unlocks, and asset audits all reference art that actually exists.

## [1.6.197] - 2026-07-18

### Changed

- Split the three remaining oversized reader test files (JPDB, New Tab review, settings form) into focused per-topic test modules with shared fixtures, and deleted the bespoke test-shard code-generator entirely; the test runner now shards ordinary files, cutting hundreds of lines of brittle harness code with no change to what is tested.

## [1.6.196] - 2026-07-18

### Fixed

- Word-plus-particle entries such as 実際は no longer show "Exact pitch unavailable": the reader now infers the pitch from the content word (実際) and also lists it as a navigable component, and expressions whose parts are joined by particles, such as 為すがまま, now show per-component pitch graphs (為す + まま) instead of no pitch at all.

## [1.6.195] - 2026-07-18

### Fixed

- Kanji popovers now show each provider's own kanji frequency on the lookup pills, for example Jiten #516 next to JPDB Top 300-400, instead of showing no rank at all.
- Jiten kanji details (keyword, readings, facts, and the new pill rank) no longer require a Jiten API key; keyless lookups ride the built-in Yomu edge proxy.

## [1.6.194] - 2026-07-18

### Changed

- Removed a redundant per-word furigana colour measurement from the reader's contrast pass. Since 1.6.192 furigana inherits its base word's already-adjusted colour, so the separate measurement no longer affected anything on screen. No behavior changes.

## [1.6.193] - 2026-07-18

### Fixed

- Lookup pills now show each provider's own frequency rank (for example Jiten #1250 and JPDB #1400 side by side) on hosted pages: keyless Jiten lookups can use the built-in Yomu edge proxy again instead of failing silently, which previously left only one provider's rank visible.

## [1.6.192] - 2026-07-18

### Fixed

- Furigana readings now use the same colour as the base word they annotate rather than a muted grey, including in pitch-accent and word-status colour modes and in Firefox, where the reading previously stayed grey even when the base word was coloured.

## [1.6.191] - 2026-07-18

### Fixed

- Yomu popovers, sheets, and other overlay panels no longer render double-sized on mobile and iPad on sites like reddit.com; every Yomu surface now pins its declared text size so mobile-browser font boosting cannot inflate it.

## [1.6.190] - 2026-07-18

### Changed

- Split the large subtitles-controller test file into focused per-topic test modules with a shared fixtures helper, and removed its bespoke shard-generator hook so the tests now run as ordinary files; no product behavior changes.

## [1.6.189] - 2026-07-18

### Changed

- Unified the New Tab review-submission code so every study provider (JPDB, Jiten, Anki, Bunpro, local Yomu deck) is graded through one table-driven adapter with a uniform credential/review/refresh/undo contract, replacing two near-duplicate provider ladders; grading behavior is unchanged.
- Extracted the subtitle transcript drawer into a dedicated collaborator module, isolating its row rendering and interaction handling; no behavior changes.

## [1.6.188] - 2026-07-18

### Changed

- Extracted the New Tab word-search surface into a dedicated search controller module, moving search state, query handling, suggestions, handwriting recognition, and result rendering behind a narrow interface; the New Tab controller shrinks by roughly 1,200 lines with no behavior changes.

## [1.6.187] - 2026-07-18

### Changed

- Extracted the subtitle parsed-content caches into a dedicated collaborator module, so cache keys, provisional entries, and enrichment retries live behind one narrow interface instead of ten loose fields on the subtitles controller; no behavior changes.
- Extracted the fullscreen top-layer host handling for subtitles into a dedicated collaborator module, isolating host discovery, caching, and reader-root reparenting; no behavior changes.
- Extracted the karaoke word-highlight sampling for subtitles into a dedicated collaborator module; no behavior changes.
- Internal working notes under the academy docs folder are now excluded from the documentation site build, so unsanitized note files can no longer break releases.

## [1.6.186] - 2026-07-18

### Changed

- The release quality gate now runs its independent stages in parallel and reuses test workers, cutting a full check from roughly twenty minutes to a few minutes without dropping any test, build, or verification coverage.
- Added a sub-minute advisory quick gate for everyday development that typechecks incrementally and runs only the tests affected by the current change.

## [1.6.185] - 2026-07-18

### Fixed

- Restored reliable furigana and pitch annotation across the homepage and every site in keyless mode. Jiten hydration now matches the correct entry key so fetched readings are applied instead of dropped, the background /info lookup timeout was raised from 1.5s to 4s so slower details still arrive, and transient network failures are cached with bounded TTLs plus limited retries and a backoff-aware deferred lane so a single hiccup no longer starves annotation.
- Aligned furigana for conjugated and okurigana-suffixed kanji-only surfaces (e.g. 接続して, 練習し, 理想的な, 追加する, 開始します), which previously rendered with no reading, and added re-resolution for misaligned public vocabulary words.

## [1.6.184] - 2026-07-18

### Changed

- Extracted the New Tab statistics surface into a dedicated stats controller module, shrinking the New Tab controller and isolating stats rendering, source selection, and activity metrics behind a narrow interface; no behavior changes.

## [1.6.183] - 2026-07-18

### Fixed

- Tampermonkey installs no longer stop running everywhere after a new release: companion libraries and the reader stylesheet are now published at immutable content-addressed URLs, so the integrity hashes pinned in the userscript header can never mismatch the served files. Previously each release changed the bytes behind the already-pinned companion URLs, and Tampermonkey silently disabled the whole script on every site; affected installs heal automatically on their next script-update check.

## [1.6.182] - 2026-07-17

### Fixed

- Replaced the oversized rule beneath Academy's “Get a class code” action with a normal text underline that follows the label on desktop and mobile.

## [1.6.181] - 2026-07-17

### Fixed

- Unified the hosted PDF, Video, Study, and Academy navigation chrome with the main site, including consistent language/theme controls, Academy links, and a compact accessible theme switch.
- Restored keyless homepage furigana and pitch enrichment after transient public Jiten failures, with bounded recovery for misaligned surface lookups.
- Refined Academy utility navigation and destination-labelled presentation controls.


## [1.6.180] - 2026-07-17

### Fixed

- Bunpro word-state colouring now follows the Bunpro token alone, matching how JPDB and Jiten colour words from their credentials: turning off Allow Bunpro review/mining no longer silently disables the state colours and hover status for a configured account.

## [1.6.179] - 2026-07-17

### Changed

- Study pool selection (which cards enter the word, recall, kanji, and listen queues, including kanji card synthesis and the pitch-eligibility filter) moved out of the new-tab controller into its own module with an explicit dependency surface, unchanged behavior, and the recent pitch seeding fix carried along.

## [1.6.178] - 2026-07-17

### Fixed

- Dictionary lookups on the hosted pages (homepage demo, new-tab study) work again without any configured proxy: keyless Jiten parse and detail requests may once more ride the built-in Yomu edge proxy, which an old blanket flag from the third-party-proxy era had been blocking, leaving every lookup dead with "No configured proxy." on browsers without the userscript bridge (e.g. iPad Safari).
- Users with a Jiten API key on those same proxy-less hosted pages now degrade gracefully: when the keyed transport has no route at all, word-card and pitch fallback lookups fall back to the capped keyless public path instead of silently returning nothing.

## [1.6.177] - 2026-07-17

### Fixed

- Opening the Speak (or Listen) study step no longer freezes the tab when a word's fetched pitch contour cannot be matched to its reading: the card re-rendered on every resolution of the cached pitch lookup in an endless loop, and now re-renders only when the enriched pitch actually yields a drillable item.

## [1.6.176] - 2026-07-17

### Fixed

- The new-tab study support banner now localizes its donation goal and monthly-progress line: the cost and goal meta text follows the interface language instead of always rendering the English fallback while the banner message and donate button around it were already translated.

## [1.6.175] - 2026-07-17

### Fixed

- Truncating labels that receive their clipping styles late (mobile YouTube renders its chrome in stages) are now re-examined once the page settles, so detached furigana can no longer sit inside a freshly clipped label and squeeze its text into an ellipsis, and readings anchored before a late layout shift no longer float away from their word.

## [1.6.174] - 2026-07-17

### Fixed

- The settings dialog now paints in your interface language on the first frame instead of flashing English and rewriting itself: every option list and label is sourced from one shared table used by both initial render and live language switching, and a third stray copy of the colour-source list was removed.

## [1.6.173] - 2026-07-17

### Changed

- The OCR engine's supporting machinery (Google Lens request encoding, image preprocessing, overlay geometry, page signatures, and the recognizer transports) now lives in five focused modules instead of one 6,000-line file, with byte-identical behavior.
- New-tab study bookkeeping was consolidated: the per-step answer and outcome state for each card lives in one structure instead of eight parallel maps, async staleness guards started migrating to a shared latest-wins helper, and eight session caches that previously grew without limit are now bounded (one of them was never cleared at all).

## [1.6.172] - 2026-07-17

### Changed

- The smoke-test harness was fully triaged: 21 verified headless regression guards now run nightly in CI as one aggregate, 38 live-site/manual harnesses moved to a documented manual directory, and 10 scripts whose scenarios are covered by unit tests were removed. Regressions those scripts guarded can no longer slip through silently.
- The jpdb.io proxy-candidate policy now has a single owner module, with tests pinning the candidate order per environment; five verbatim policy copies were removed from the API client without touching its rate-limit and backoff behavior.

## [1.6.171] - 2026-07-17

### Changed

- Consolidated duplicated internal helpers into shared modules: the YouTube configuration scraper, string/async/object utilities, abort-error detection (now also recognizing DOMException-based aborts), fullscreen detection, and the new-tab immersion carousel now each live in one place instead of up to seven copies. Behavior is unchanged and the core script shrank slightly.

## [1.6.170] - 2026-07-17

### Fixed

- Detached furigana no longer widens truncating labels or floats away from its word: readings inside a clipped row that cannot safely grow are now rest-hidden on every channel (they remain available on hover and in the popover), fixing the mobile YouTube Shorts action labels rendering as 共… / 高く評… and the floating reading over the watch-page view counter. The clip detection also looks through web-component boundaries so component-based sites resolve the same rows.

## [1.6.169] - 2026-07-17

### Fixed

- Immersion example audio now plays on strict-CSP hosts such as claude.ai and chatgpt.com: example playback goes through the shared audio player, whose Web Audio fallback decodes the pre-fetched audio bytes when the page refuses media-element URLs.

### Changed

- The kanji-study companion and the study new-tab app each shed ~69KB by moving an embedded grammar example table into the test suite; the table was only ever consumed by tests while real examples load from the remote grammar data.
- Removed dead code and styles accumulated across releases: the unused gaming capture/lookup IPC surface, superseded CSS selector clusters, and no-op wrappers. A new automated check keeps translation copy keys from going orphaned, and restored regression tests re-pin two long-standing double-image protections.

## [1.6.168] - 2026-07-17

### Fixed

- Duration words stay whole after numbers on the keyless segmentation path: 3時間前 no longer shatters into per-character words with mismatched colours even when no local dictionary is installed (complementing the dictionary-evidence boundary repair, which needs an enabled dictionary), and 年間/分間/日間/月間 are covered by the same counter+間 class rule.
- Yomu popovers and settings are no longer inflated on sites that ship global element resets (Reddit): the reader interface rolls host margins back on every sectioning element it builds from, including during the brief window before the full stylesheet loads.
- Updating a revisioned local dictionary such as Jitendex now replaces the previous copy instead of installing a second one, and existing duplicate copies are cleaned up automatically, keeping the newest import. Duplicates doubled the stored entries and slowed every lookup.
- A slow local dictionary lookup now fills its popover section late instead of never: the initial render stays fast, and the full result hydrates in when it arrives instead of being discarded at the render deadline.

## [1.6.167] - 2026-07-16

### Changed

- Academy's first Lesson 0 task now records one learner-owned journal line, schedules exactly one Yomu review, and shows both rewards with an immediate answer-concealed replay. On narrow phones, the Yomu puck moves clear of the portrait-selection action strip.
- Academy Lesson 0 now enters through the sourced Genki greeting and class-present moment before teaching the Moodle hiragana A-row. Its multimodal kana route uses Yomu pronunciation instead of browser speech, accepts romaji or kana with IME-safe feedback, and requeues any supported mastery item before completion.
- The Academy N5 placement mock now plays its two byte-verified Soya recordings through the shared listening registry. N4–N1 remain clearly labelled exact-text browser speech until their specific recordings are reviewed and packaged, and changing placement level still preserves story progress.
- N3 Academy entry now uses the exact Moodle-owned Minna 074 listening task and packaged recording. The existing adaptive learner model chooses guided, placement-backed test-out, repair, or independent support while keeping all story and encounter progress untouched.

### Fixed

- Remote parser fragments are now replaced only when an enabled local dictionary supplies an exact longer expression and reading across their boundary. This repairs evidence-backed splits such as `2時` + `間` without a `時間` exception, adjacent-kanji guessing, full rescans, or synthesized compound pitch.
- Boundary evidence is capped at eight left-to-right candidates per paragraph and four IndexedDB lookups across all concurrent parser instances. Ambiguous expression/reading identities stay split, and transient lookup failures are retried on the next scan instead of being cached as permanent misses.
- Local pitch metadata now requires the same normalized expression and reading as the displayed word. Yomu no longer falls back to a reading-key row or reshapes a lone mismatched reading into a misleading whole-word contour.
- Pitch accent now uses the four positional Tokyo classes—heiban, atamadaka, nakadaka, and odaka—consistently across reader words, popups, subtitles, and study. Malformed contours are treated as unknown, multiple sourced variants remain distinct, and the obsolete “Kifuku (variable)” fifth colour setting is removed while old settings payloads still load safely.

## [1.6.166] - 2026-07-16

### Fixed

- Web-component sites now annotate correctly end to end: Yomu's stylesheet reaches open shadow roots (fixing doubled text such as Reddit's join button and sort menu), component re-renders schedule rescans so buttons no longer wait for a tap to gain their annotations, and Japanese nested more than four component layers deep (Reddit's sort order and pinned labels) is covered by a bounded continuation instead of silently dropped.
- Short chrome labels that truncate sideways, such as the mobile YouTube share button, keep their full text: horizontally clipped ellipsis rows now route readings to the detached channel instead of stretching the label into its ellipsis.
- Subtitle and reading annotations over video controls disappear together with the controls: overlay mirrors inherit the page's own visibility instead of forcing themselves visible, so no stray underline floats over the video after YouTube fades its control bar.
- Yomu subtitles now bind on mobile YouTube Shorts: the player-frame resolver understands the mobile reel cells, so the recycled off-screen video element no longer fails the visibility gates.

## [1.6.165] - 2026-07-16

### Fixed

- The hosted docs homepage now annotates its own Japanese chrome: the hero headline and tagline, the navigation bar, the install panel, and the next-step grid receive the same passive residual coverage as every other site, so no visible Japanese text stays bare in Japanese mode. Link navigation is preserved and decoration stays bounded by the per-element layout guards.
- The audio service kill-switch now also disables the raw audio object route, so disabling the service stops serving audio bytes instead of only hiding lookups.
- Defined the missing success, warning, muted-text, and muted-surface colour tokens, restoring the green confidence badges, the active Anki deck toggle accent, and dictionary card backgrounds that undefined token references silently dropped.

## [1.6.164] - 2026-07-16

### Fixed

- Bunpro definitions now normalize raw JLPT and part-of-speech metadata, avoid repeating vocabulary meanings as accepted answers, and rely on the popup's existing Bunpro action instead of showing a second link.
- Bunpro detail examples now use the same collapsible sentence presentation as Jiten and JPDB while preserving each provider's own sentence identity and highlighting. An authoritative empty example list remains distinct from authentication, network, and response-schema failures, and Yomu does not invent Bunpro composition or usage relations.

## [1.6.163] - 2026-07-16

### Fixed

- Jiten and JPDB lookup pills now keep independently verified frequency ranks for the exact spelling and reading, so late provider responses cannot overwrite one another and ambiguous matches do not show a misleading rank.
- Exact local Yomitan entries, including Jitendex dictionaries, no longer disappear when another enabled dictionary fills the shared result cap. Bunpro source loading also retains distinct disabled, authentication, no-match, timeout, and error states instead of collapsing them into a missing result.

## [1.6.162] - 2026-07-16

### Fixed

- Furigana no longer writes height or padding into grid and table track sizing, preventing annotated results, fixtures, schedules, and other structured cards from stretching into oversized blank rows while keeping their readings visible.
- Pitch resolved after a cold popup opens now updates that same connected popup's graph and headword underline without requiring another hover or a page rescan. Exact canonical inflection matches refresh the popup automatically; unresolved fragments show a localized “Exact pitch unavailable” status instead of a silent blank. Late results cannot repaint a superseded popup, cross an unproven expression-and-reading identity, or synthesize compound pitch.

## [1.6.161] - 2026-07-16

### Fixed

- Restored the GitHub Release gate after the annotation architecture changed: release smoke tests now verify source-preserving additive mirrors and no longer block publishing on an invented mini-guide shape that was not backed by live-page evidence.

## [1.6.160] - 2026-07-16

### Fixed

- Compound words now show a whole-word pitch contour only when the dictionary provides an exact whole-word expression-and-reading match. Yomu no longer invents a compound accent by concatenating component contours; independently sourced component pitch remains available as explicitly labelled component evidence.

## [1.6.159] - 2026-07-16

### Fixed

- Tapping or clicking a visible subtitle now briefly reveals its move handle, even when the caption was dragged below the video and the player controls have faded. Transparent space around captions remains click-through, so Yomu does not cover native player controls.

## [1.6.156] - 2026-07-16

### Fixed

- Added the hosted Japanese release-note copy for the resilient subtitle loading update, so the newest changelog remains localized when readers switch the documentation language.

## [1.6.155] - 2026-07-15

### Fixed

- Subtitle files and YouTube captions now recover from a brief connection drop, interrupted or partial response, rate limit, server error, or timeout with one bounded retry. Permanent client errors still fail immediately, slowly delivered responses are not duplicated, and already loaded cues remain available without another network request.

## [1.6.154] - 2026-07-15

### Fixed

- Turning annotations off now immediately removes ruby, pitch colouring, and parsed word markup from video captions and the open subtitle transcript while preserving the minimum plain subtitle display. Caption parsing, enrichment, cache updates, and late parse-result repainting remain inert until annotations are turned back on.

## [1.6.153] - 2026-07-15

### Fixed

- Subtitles now freeze at the last presented media time while a video is genuinely buffering or stalled, then resume on actual playback. Ordinary pause, ended, seeking, and background network stalls remain distinct so transcript, karaoke, and shadowing timing stay aligned with the player.

## [1.6.152] - 2026-07-14

### Fixed

- Reactive pages such as YouTube, Reddit, Twitch, and live chats now keep their native text intact while Yomu paints a source-preserving annotation layer. Hovering, recycling, or rerendering can no longer leave only coloured bars, and tapping a word resolves from that word's original text range instead of opening a neighbour.
- Late-loaded menus, comments, dropdown choices, and content beyond the initial scan budget continue through the generic scanner. Compact controls keep pitch and lookup even when there is no safe lane for furigana; only the unsafe reading is omitted, preventing adjacent readings and previous lines from overlapping.
- Composite words retain their per-component pitch colours in source-preserving mirrors, while passive and shadow-root content receives an at-rest pitch signal instead of waiting for a press.
- YouTube Shorts now expose the movable, persistent subtitle rail. Subtitle annotations return hit testing to overlapping native Share and fullscreen controls, and annotating Share no longer corrupts its label.
- The canonical homepage install link opens the named `yomu.user.js` userscript directly, avoiding generic attachment downloads that some userscript managers fail to recognise.

## [1.6.151] - 2026-07-14

### Fixed

- The subtitle control rail no longer flickers over videos that autoplay on hover: a rapidly changing player-chrome fade signal is now debounced, so the rail stays steady instead of strobing in and out.
- The subtitle control rail now fully disappears when idle on players without a native fade signal, instead of leaving a minimised grip stub visible forever.
- The subtitle rail pin and move grip is easier to tap: a small amount of finger jitter is treated as a tap so the pin toggle fires reliably instead of being mistaken for a drag.
- A pinned subtitle control rail now stays fully visible and never auto-hides or auto-collapses, even as the pointer moves across the video or the player goes idle.
- The installed userscript no longer decorates the yomureader.com homepage's own nav, hero marketing copy, CTA pills, install panel, or "what to do next" link grid with ruby/pitch furigana, which was destroying the tablet layout. The pre-rendered "Try me" sample stays annotated and interactive, and real docs prose is unaffected. As defence in depth, the site itself now strips any annotation an older installed copy already added to that chrome and marks it off-limits, so a not-yet-updated userscript can no longer break the layout.
- The Install buttons and getting-started steps point at the v1.6.151 release asset so a fresh install pulls the current build.
- YouTube action chips and controls — the 質問する ask button, the 視聴 view count, subscribe, and live-chat notices — now render their furigana in a detached lane that never resizes the control, so the button/notice height, width, and baseline stay exactly as YouTube drew them; their pitch underline is anchored to the glyphs instead of dropping to the bottom edge of the chip. Reading content around them (chat messages, descriptions) keeps inline ruby.
- A truncated, expandable video description keeps its annotation inside the authored clip height instead of spilling the extra lines over the summary block below it.
- Local-provider pitch accent (Jiten and JPDB) is now taken only from each word's own dictionary entry. A word with no listed accent stays uncoloured instead of borrowing the previous word's pattern, and the pitch-colour settings row for those words now reads simply "Unknown" rather than "Unknown / inherited".
- When a word has several accepted pitch patterns, the variant cards now share one footprint with each contour and percentage centred, so the first (source-preferred) reading no longer looks larger or more authoritative than the other legitimate readings; source order stays visible through the first card's accent-coloured percentage.
- A word's direct whole-word pitch now remains the primary top-right graph even when Jiten also exposes navigable inner components; for example 間違い keeps its pitch-3 contour while 間 and 違い remain available as secondary lookups.
- All five review-grade buttons use the same slightly smaller font on narrow phones, so the longer “Something” label fits without crowding its button.

## [1.6.150] - 2026-07-14

### Fixed

- Popup audio controls stay pinned to the top-right when a word has multiple pitch-accent graphs. Two or three variants now share a compact full-width row with balanced spacing and wrap cleanly on narrow screens.
- Repeated compound words keep their constituent pitch-accent segments, so proper compound underlines no longer degrade to one flattened pattern after the first occurrence.
- Long compounds with both whole-word and constituent pitch data now keep one authoritative component view, so inline underlines and popup graphs agree for terms such as 双子座流星群.
- Discord and other framework-managed chats immediately preserve newly appended message text while Yomu refreshes annotations, preventing suffixes such as `プラチナ` from briefly disappearing.
- Help now shows the installed Yomu version in split userscript builds instead of `dev`. On Chromium with Tampermonkey, Update opens the dashboard update-check instructions instead of triggering Chrome’s blocked website-install banner; release verification also rejects a settings companion that loses its version or canonical Study update endpoint.
- Popup grammar tags such as `uk`, `abbr`, and `arch` are expanded into readable labels instead of exposing dictionary shorthand.
- Multiple accepted pitch patterns now show compact percentages instead of "Most common" and "Also used". Source-order-only data is displayed as relative shares that total 100%, while measured commonality will take precedence when a source supplies it.
- Furigana in compact single-line tabs and “show more” rows now opens every safe ancestor clip, so readings are no longer cut off even when both the label and its fixed-height parent hide overflow.
- On touch/coarse-pointer layouts, clipped multi-line mirrors now keep individually safe detached readings visible at rest while continuing to hide any reading that would clip or overlap another line.
## [1.6.149] - 2026-07-13

### Added

- The Study page now asks what to do when the connection is lost mid-review — Stop Reviewing, Continue Offline, or Retry — and grades made offline queue and sync when you are back online.
- The writing step shows the full example sentence as a copy-and-fill exercise right after the word step: words you have not graded out keep furigana, the studied word is blanked, and the whole typed sentence is checked with the filled word deciding correct versus accepted.
- Study example sentences are now chosen n+1 style: candidates from the card, JPDB, and Immersion Kit are scored against your known words, and the sentence introducing at most one new word wins so you always read just above your level.

### Fixed

- Study no longer exposes an unrevealed card's provider id, spelling, reading, or answer in the address bar. It uses a local opaque history token until reveal, creates a portable link only after reveal, and leaves Academy's embedded Study URL untouched.
- Furigana no longer paints over the line above inside multi-line clamped rows (Google-style result snippets, feed previews): such rows keep pitch underlines and hover lookup but hide at-rest readings, single-line rows keep their reading lane even when padded, and late-enriched readings obey the same rule instead of flickering in.
- A rail button left focused after a tap no longer blocks YouTube's own player controls from fading, in every rail mode including the new stays-expanded one.
- Grades queued offline can no longer be silently lost when a reconnect sync overlaps a new offline grade: queue writes are serialized, a landed grade re-arms the connection-lost prompt, and partial multi-provider failures keep the silent queue instead of offering a retry that could double-grade.
- Discord and other dark app shells whose computed colors use formats outside Yomu's analytic parsers no longer render annotated text as solid dark bars: every CSS color now normalises through a canvas probe, and an unparseable painted backdrop falls back to the dark page surface instead of white.
- Tapping the studied word on the study reveal opens the word's own popover again instead of a per-kanji popup; kanji drilldown stays available through the popover's composed-of chips.
- The study reveal no longer repeats the pitch graph after the pitch step — the headword keeps its pitch-coloured underline — and the Immersion Kit example always renders above the dictionary sources.
- Compound words whose pitch is composed from constituent accents now paint both colours on the one word: the page underline splits per constituent and the popover graph draws each constituent's contour in its own colour, while the composed-of chips keep linking the sub-words.

### Changed

- The subtitle control rail lost its pin button: the drag grip itself toggles between stays-expanded and minimised, the rail hides entirely while the player chrome is hidden, starts minimised and less prominent, and no longer appears when you tap subtitle words or move the subtitle line.

## [1.6.148] - 2026-07-12

### Fixed

- YouTube and Reddit now share the generic visible-page and web-component scanner: component boundaries, late menus, comments, navigation labels, and residual text no longer disappear behind profile budgets or shared-node deduplication.
- Compact controls keep their native geometry while showing detached furigana and pitch, and pressed words can enrich missing pitch on every site. Composite cards also expose their loaded Jiten subwords when local dictionary segmentation is unavailable.
- Subtitle transcript tracking pauses only after direct wheel, touch-drag, native-scrollbar, or scroll-key input; automatic player updates no longer desynchronise the mobile panel, and Locate always restores tracking.
- The subtitle control rail starts on the left, can be moved and keyboard-positioned, can be pinned open or collapsed, stays clear of YouTube's settings control, and no longer duplicates playback with a play button. Transparent subtitle line space is click-through, restoring the native mobile fullscreen button while visible words remain tappable.
- Short functional headings in mirrored app panels are now annotated through the shared residual scanner, including YouTube transcript and engagement surfaces, without reintroducing a panel-specific parser.

### Changed

- Removed the separate YouTube guide, engagement-panel, and chrome parsers. YouTube-specific media adapters remain only where the platform API requires them; ordinary page text and controls follow the shared annotation pipeline.

## [1.6.147] - 2026-07-12

### Fixed

- YouTube buttons, tabs, and filter chips keep their native vertically centred labels while remaining lookupable and pitch-annotated; compact controls no longer reserve or overlay a furigana lane.
- Lazy-loaded YouTube comments and other text revealed near the bottom of long pages are discovered through the generic visible-page scanner instead of being starved by offscreen virtualized cards.
- Expanding annotated descriptions and other collapsible panels preserves the page's authored clipping, preventing annotation paint from escaping underneath neighbouring video content.

## [1.6.146] - 2026-07-12

### Fixed

- Furigana and pitch accents in compact page chrome—buttons, chips, menus, badges, metadata rows, and fixed-height labels—now use detached, glyph-anchored decoration that preserves the site's native spacing, wrapping, centring, and clipping.
- Controls and dynamically revealed panels are rescanned through the same generic decoration policy, so their readings remain visible and passive without stealing taps from the page or opening the dictionary.
- Compound words and entries with multiple pitch patterns retain every pitch-accent pattern instead of losing later alternatives.

- On tablets, long subtitle side panels now keep scrolling through one continuous touch gesture instead of stopping after a few centimetres and requiring another swipe.
- Subtitle auto-follow now keeps its place through gaps, glides between nearby lines, and adds newly loaded lines without flashing a large blank spacer in the panel.
- Hosted reader pages now detect a stale userscript network bridge before a request hangs and safely fall back to browser fetch or Yomu's public proxy, restoring passive pitch decoration for compounds such as もう一度 and KanjiVG stroke diagrams.

### Testing

- Added Chromium and WebKit release gates for chip fidelity, constrained metadata rows, and Reddit-style compact chrome, including checks for growth, overlap, clipping, and click-through behavior.

## [1.6.144] - 2026-07-11

### Fixed

- The hidden-video notice's Hide button now dismisses the notice for the current session only instead of silently turning the notice off forever; anyone who previously hid it this way gets it back once.
- Searching for a non-Japanese term no longer spins a filtering loop that hides every result while YouTube keeps loading more: a search whose results are all non-Japanese is shown as searched, with filtering resuming on the next page.
- Toggling the immersion filter from the puck responds immediately: the filter refreshes before settings are persisted, annotation readings on compact controls no longer distort chips or hide their labels, and the mirror visibility heal no longer re-walks hidden sections on every scan.
## [1.6.143] - 2026-07-11

### Fixed

- BookWalker pages on iPad no longer flip to "Could not read text" after the first few pages and stay failed until a page reload. The scan deadline reused the 6-second audio timeout, which killed healthy-but-slow scans on iPad userscript managers and remembered each page as permanently failed; OCR now gets a 30-second attempt floor and a timed-out attempt retries once before showing the tappable retry state.
- BookWalker storefront banners and cover images now scan reliably on iPad instead of failing or timing out: ordinary image OCR shares the same corrected 30-second scan deadline.

## [1.6.142] - 2026-07-11

### Changed

- The video subtitle rail shows previous-line and next-line buttons again, but only while the subtitle side panel is closed. When the panel is open its own transport controls take over and the rail hides its copies to avoid duplicate controls.

## [1.6.140] - 2026-07-11

### Added

- The Bunpro dictionary card now shows Bunpro's own example sentences with hot-linked audio, matching the Jiten and JPDB sources: each sentence plays its Bunpro recording on tap (with text-to-speech as a fallback), renders furigana as ruby, highlights the looked-up word, and includes the English translation.

### Fixed

- JPDB, Jiten, and Bunpro dictionaries all stay enabled by default for new users instead of depending on a single chosen provider; each can still be turned off individually in settings.

## [1.6.139] - 2026-07-11

### Fixed

- Annotated text no longer goes blank after moving between pages on YouTube and other single-page apps. A text mirror hidden while its page section was momentarily concealed is re-shown as soon as the section is visible again, so titles, channel names, and feed chips keep painting.
- Furigana readings are back on mirrored buttons, chips, and menu labels. The overlay mirror keeps readings without changing the control's own layout, and clipped rows still reveal their readings on hover only.
- The YouTube immersion filter now hides in-feed ads and no longer counts Japanese interface metadata (view counts, upload age, watch labels) as Japanese content, so English videos in shelves and ad slots are hidden as intended.

## [1.6.138] - 2026-07-11

### Fixed

- BookWalker OCR no longer stays on "Scanning..." for several minutes when Safari or an iPad userscript manager stalls while preparing the image or times out against Google Lens. The whole scan and both Lens transports now share one request deadline, and an exhausted deadline ends in the tappable retry state instead of automatically repeating the same long wait; the reconstructed page image remains in place when it is rescuing BookWalker's blank mobile canvas.

## [1.6.137] - 2026-07-11

### Fixed

- Yomu no longer annotates rapidly rotating marketing headlines or nests a second annotation layer inside a site's own Japanese demo words, preventing shifting duplicate text and overlapping elements while ordinary Japanese prose remains lookupable.

## [1.6.136] - 2026-07-11

### Fixed

- iPad annotations no longer shift or disappear in fixed-height controls, menus, compact card titles, and web components. Mirrored text now follows the page's own padding and vertical centring, and touch layouts use a stable non-ruby line instead of a sticky-hover swap that could clip or reflow the row.
- Compact YouTube and Reddit titles keep their native wrapping and visible word annotations without overflowing their cards, including content inside open shadow roots.
- Pitch-accent component diagrams are centred consistently in the lookup sheet.

## [1.6.135] - 2026-07-11

### Fixed

- Pitch-accent marks and furigana now appear on Japanese text without selecting or clicking it when the local dictionary database is slow or blocked. Yomu moves on to its bounded public fallback after 500 ms, still tries the direct pitch source when exact vocabulary hydration misses, and retains local-first behavior once the local check finishes.

## [1.6.133] - 2026-07-11

### Changed

- The word lookup popup now lists Yomu first in its row of dictionary links, before Jiten, JPDB, and Bunpro. If you never re-ordered these pills yourself they follow the new order automatically, and a custom order you set is kept.
- The support status banner now explains that the monthly goal keeps fast audio playback and shadowing running, instead of warning that Ultimate Audio will switch off next month.

### Fixed

- The Jiten frequency number and Jiten dictionary entry now load reliably in the word lookup popup, including on a slow connection: a slow Jiten reply is no longer thrown away, so the Jiten reading, meanings, and rank fill in once they arrive instead of leaving the Jiten pill blank.

## [1.6.132] - 2026-07-11

### Fixed

- Immersion Kit example sentences now load reliably instead of showing "No examples" for common words such as 見る: each lookup was downloading the entire example set — one to two megabytes — and timing out before it arrived, and now fetches a small batch that loads in about a second.

## [1.6.131] - 2026-07-11

### Fixed

- The hosted homepage now loads its reader runtime and companion scripts with the release version in their URLs, so browsers cannot keep executing an older cached OCR build after the site deploys a geometry fix.

## [1.6.130] - 2026-07-11

### Fixed

- The legacy persistent OCR cache is cleared once during upgrade, so the removed three-box homepage demo geometry cannot survive an update and keep manga text offset from the image.

## [1.6.129] - 2026-07-11

### Fixed

- Manga OCR on the Yomu homepage uses the OCR provider's real image coordinates again instead of three hand-authored boxes that drifted away from the printed text. The overlay follows the rendered image through page scroll, browser scaling, and object-fit layouts, and recognised text stays transparent until you hover it.
- BookWalker OCR now waits through Firefox's blank-but-readable startup canvas, retries an empty response on the stable captured page instead of rebuilding it, and cancels a capture when the recycled canvas turns to different content. This removes false failures, repeated screenshots, stale previous-page text, and scanning/status flicker.
- BookWalker zoom no longer changes page identity just because the viewer rewrites raster size or draw destination coordinates, so a recognised page stays aligned and comes back from cache without another OCR request. Extension screenshot fallback also refuses to capture while the reader tab is not active.
- Batched public Jiten lookups keep parser results inside their original term boundary, preventing one word in a batch from borrowing another word's vocabulary result.

## [1.6.128] - 2026-07-11

### Removed

- Selecting Japanese text on a page no longer opens a lookup pop-up. The panel that used to appear on every selection — often unwanted, and covering most of the screen on phones — is gone, so selecting text just selects it. To look up a word, hover or tap it as before: Yomu still shows its reading, meaning, pitch accent, and dictionary links on the words it has parsed.
- Removed the "Selection popups" and "Show translation in selection popovers" settings, which no longer had anything to control.

## [1.6.127] - 2026-07-11

### Fixed

- BookWalker manga OCR is reliable across a whole book again, in both the page-turn and vertical continuous-scroll modes: recognition no longer stalls on "Scanning…", stops working after a few pages, or only covers the first page.
- Pages you have already read are no longer re-scanned on every scroll or page turn, which removes the BookWalker lag and the flicker between "Scanning…" and "No text found".
- BookWalker pages no longer flash "Could not read text" from the hidden raw page image: on Firefox the page is rebuilt from BookWalker's own signed images so recognition matches other browsers.
- Hovering recognised manga text now reliably shows its reading and lookup, instead of the highlight sometimes vanishing when the lookup sheet opens.
- Zooming a BookWalker page keeps the text it already recognised instead of discarding it and scanning again, and switching away from the tab and back keeps the recognised text.

## [1.6.126] - 2026-07-11

### Fixed

- The Japanese homepage hero pills now centre their labels: plain pills such as インストール and ゲーム no longer sit bottom-heavy inside the capsule, while furigana readings stay tucked inside the pill above the label.

## [1.6.125] - 2026-07-10

### Fixed

- Collapsing a dictionary section while hovering a word no longer closes the lookup popup: it stays open when the popup resizes under the pointer, and still dismisses once you move the pointer away.

## [1.6.124] - 2026-07-10

### Fixed

- Google Search on iPad no longer develops large empty gaps or clipped/missing result text. Tight headings and snippets keep their original line geometry and visible base text while still supporting Yomu word highlighting and tap lookup.
- Reddit controls and compact metadata are annotated again without growing or hiding them, including nested web-component buttons such as 参加, sort labels, post age, share, announcement flair, and vote/comment rows.
- Parser offset mistakes can no longer turn Latin labels or punctuation into stray Japanese annotations, fixing floating dots and accidental decoration of text such as r/singularity.

## [1.6.123] - 2026-07-10

### Fixed

- Intermittently missing annotations are fixed: the scanner now detects content revealed by observers, continues where its per-frame budget stopped, and caps how long it waits before scanning, so text no longer slips through unannotated.
- Readings on clamped content rows (Google search snippets and similar) show at rest again, and a new setting lets you choose whether readings on clamped rows are always shown or shown on hover.
- Pitch accents now appear on the initial parse everywhere, not just after later lookups: enrichment is paced instead of dropped.
- Turning annotations off now applies instantly instead of waiting for the next scan.
- Live-stream chat no longer flickers or churns through re-renders: annotated messages replay from cache, and scrolling no longer shifts content.
- Live-chat replay on regular videos (VOD) is now annotated like live chat.
- The comments sort menu no longer grows when annotated.
- YouTube uses noticeably less CPU and generates less heat: fullscreen checks are cached, subtitle timing work is on a diet, OCR machinery is fully inert on non-reader pages, and hover-preview players are excluded from scanning.
- Homepage: pills, navigation and cards are aligned again, the page no longer jumps while scrolling, and changing the interface language updates the page correctly.

## [1.6.122] - 2026-07-10

### Fixed

- The automated dead-code gate is green again: helpers used only inside their own modules are no longer exported, and the NHK mirror-overlap smoke test is registered as a runnable script.
- Releases no longer fail on busy build machines: the YouTube-comment scanner test now waits long enough for slow runners, so a finished release publishes instead of stopping at the final check.

## [1.6.121] - 2026-07-10

### Added

- Bunpro is now a first-class dictionary source beside Jiten and JPDB in the popup and Study search/reveal surfaces. With a Bunpro frontend token, Yomu shows Bunpro vocabulary or grammar meanings, nuance, accepted answers, JLPT/part-of-speech tags, and a direct source link. The source can be enabled, renamed, and reordered with the other dictionaries.
- Fresh installs now show a Bunpro lookup pill beside Jiten and JPDB, with the same per-pill ordering and enable/disable controls.

### Fixed

- Bunpro Study grading now follows the active quiz session instead of pretending Bunpro has JPDB's five-point scale: regular self-graded reveal cards use **Hard / Good**, while FSRS cards use **Again / Hard / Good / Easy**. Ordinary, ghost, and self-study reviews route to their correct Bunpro endpoints, and each Bunpro obligation stays separate from matching Jiten/JPDB/Anki cards.
- Bunpro writes are now session-safe: Yomu sends the current review-session context, refuses unsessioned popup writes, refreshes after every Bunpro grade instead of reusing stale failed-review ids, and does not queue Bunpro grades offline. The frontend token is the only Bunpro credential Yomu uses; saved legacy keys remain preserved for backward compatibility.
- Bunpro definition/mining matching is now exact and id/type-aware, so fuzzy search results or grammar/vocabulary collisions cannot display or add the wrong item. Offline cache warming no longer fans out private Bunpro searches, and definition searches no longer request private notes or bookmarks.
- Bunpro live QA now exercises the actual quiz queue endpoint, verifies required definition fields, and can opt in to one session-aware grade.
- Release preflight now runs the same browser-smoke set as GitHub before a tag is published. Its YouTube ruby proof follows the current paint-invariant contract for clipped rows: native text stays visible without layout growth, the complete annotated mirror stays hidden at rest, and real hover interaction reveals the mirror and readings without changing row height.

## [1.6.118] - 2026-07-10

### Fixed

- Feed, watch-page and Shorts rows no longer blow up into giant tiles: rows that clamp their text never grow for hidden readings and never hide the page's own text — at rest an annotated row paints exactly as it would without Yomu.
- Vanished text on annotated rows — video titles collapsing to empty tiles, the subscriber count turning invisible — is fixed: the original text always keeps painting.
- Cramped rows that clip their text now keep readings hidden at rest and reveal them on hover, instead of painting cropped readings outside the row.
- Mirrored text no longer invents spaces the page never showed, so Discord messages and similar layouts stop splitting Japanese words with stray gaps.
- Long unbroken annotated lines can wrap again instead of forcing the page to scroll sideways.
- Style updates now actually reach existing installs: the stylesheet ships as a versioned, integrity-pinned resource, so each release reliably delivers its matching styles instead of serving a stale cached sheet.
- Text hidden inside closed menus and dropdowns no longer paints into mirrored annotations.
- A page's own furigana (native ruby) is no longer flattened into the surrounding text when mirrored, so readings stay readings instead of merging into the sentence.

### Added

- Hardened the release pipeline so the live site and stylesheet deploy can no longer be silently skipped by a release push.

## [1.6.117] - 2026-07-10

### Fixed

- Tapping or moving the pointer over the subtitle line now reveals its compact controls and move handle even after the line has been dragged below the video. Blank subtitle space acts as the video focus surface instead of activating links or buttons underneath it. The reveal works while YouTube's own chrome is hidden and still hides after a short idle delay instead of becoming permanent.

### Improved

- The subtitle move handle now has a 44 × 44 px mobile touch target, an explicit keyboard focus ring, and screen-reader instructions for its drag, arrow/Page Up/Page Down, and reset controls. Idle controls stay out of sight without becoming keyboard- or screen-reader-inaccessible: tabbing to the move handle or rail reveals it immediately, deliberate hardware-keyboard focus stays visible on touch devices, and the controls fade again after focus leaves.

## [1.6.116] - 2026-07-10

### Fixed

- Pausing Yomu from the puck now silences image, canvas and video-frame reading (OCR) too, matching what "paused" promises: no overlays appear and existing ones are cleared while paused, including scans that were already queued or captures still in flight when the pause landed. Everything resumes per your OCR mode when you unpause, and the puck's radial OCR button now shows as off while Yomu is paused instead of claiming OCR is on.

## [1.6.115] - 2026-07-10

### Fixed

- Interactive controls — buttons, tabs, menu items and other clickable chrome — never receive layout-affecting furigana anymore, so oversized "giant" buttons no longer appear on sites where readings used to inflate a control's height.
- Search boxes and editable fields are now skipped deterministically by the decoration policy, so typing surfaces are never annotated or disturbed.
- Rows that clip their text now hide furigana at rest and reveal it on hover, so tight single-line labels stay intact instead of showing cropped readings.
- The extra room Yomu reserves for readings (ruby room) is now owned by Yomu and fully reverted when decoration is removed, so pages return to their original layout when Yomu turns off.
- The video player's native subtitle line is no longer clipped in fullscreen: Yomu reserves a slot for it instead of letting its own subtitle overlay push it out of view.
- A player stuck in inline fullscreen (after an interrupted fullscreen transition) now recovers automatically instead of leaving the page in a broken layout.
- On iPhone, entering the native fullscreen video player keeps Yomu subtitles visible instead of dropping them.

### Added

- Settings now have a Backup & sync section for exporting, importing and syncing your Yomu data.
- Settings now show the installed version and a working update check with install steps matched to how you run Yomu, fixing the "Apps, extensions, and user scripts cannot be added" dead-end some users hit when trying to update.
- When a video-frame scan finds no text, the OCR pill now says "No text found · Scan again" so you can retry immediately instead of wondering whether anything happened.

## [1.6.114] - 2026-07-10

### Changed

- The scan button on the video subtitle rail is now a toggle for reading paused video frames. Tapping it still reads the current frame immediately, and also keeps frame reading on so every pause is read automatically; tapping it again turns automatic frame reading off. The button shows its state (highlighted while on) and stays in sync with the same setting in the settings panel.

## [1.6.113] - 2026-07-09

### Added

- Yomu now reads Japanese text inside web components (open shadow DOM), so readings appear on parts of a site Yomu previously couldn't reach — for example Reddit's sort dropdown (賛成票率順) and community header. It only reads open shadow roots, renders the readings through the same non-destructive overlay it uses elsewhere (so a site's own components are never disturbed), and skips shadow trees with no Japanese, so pages that don't use them are unaffected.

## [1.6.112] - 2026-07-09

### Fixed

- Yomu no longer slowly leaks memory when it restarts on the same page (single-page-app navigation, embedded video players, or switching between the userscript and the browser extension on one tab). Several page-wide event listeners, an image load handler, the scroll helper used inside Yomu's own panels, and the jpdb.io review bridge (its page watcher, heartbeat and cross-tab channel) were not always released when Yomu tore itself down and started again, so they piled up over a long session; every one of them is now cleaned up on teardown.

## [1.6.111] - 2026-07-09

### Fixed

- Furigana readings added later during a scan of a busy page (such as a long YouTube comment thread or a fast-updating feed) no longer stay clipped. A recent speed-up reserved space for readings only once per page scan, so rows that were annotated in a later pass could remain cut off until a delayed cleanup ran; Yomu now reserves room for every newly-annotated row as it lands, including in video subtitles, so readings are never left cropped.

## [1.6.110] - 2026-07-08

### Fixed

- Furigana no longer breaks the layout of compact rows on sites like YouTube. On the watch page the channel subscriber count, view count, comment count and sort, individual comments, and the sidebar recommendation details were wrapping onto extra lines or overlapping the line below once readings were added; Yomu now reserves space for the reading in any short, clipped row generally, rather than relying on a hand-maintained list of elements, so the rows grow just enough to fit instead of breaking.

### Improved

- Yomu uses much less CPU on busy, constantly-updating pages such as the YouTube watch page, which had been making iPads run hot. It now reserves furigana room once per scan instead of once per batch, briefly caches layout measurements, and throttles rescans on pages that mutate many times a second — roughly halving style recalculations during heavy scrolling, while still annotating new content as it loads.

## [1.6.109] - 2026-07-08

### Fixed

- Yomu no longer slowly leaks memory and crashes the browser tab during long reading sessions (reported on iOS Safari reading novels on Narou and in the ttsu reader, where the tab would run out of memory roughly every few minutes). The hidden text overlays Yomu uses on some sites kept their page-change watchers, timers, and duplicate copies alive even after the underlying text was gone, and could also keep re-scanning their own edits; Yomu now releases each overlay's watchers and timers as soon as its text is detached and no longer re-scans the changes it makes itself.
- Copying text from a page Yomu has annotated no longer produces doubled or garbled text. The hidden overlay Yomu adds for some layouts was being included in the selection, so copying picked up two copies of the words (and sometimes the furigana readings); the overlay is now excluded from selection and the clipboard, leaving the original page text clean.
- The welcome/onboarding overlay no longer appears on every website when Yomu is installed as a browser extension. It was showing over ordinary pages because the check that should have limited it to Yomu's own new-tab page was inverted for the extension; it now appears only on the Yomu new-tab/study page.
- YouTube fullscreen on iPad now behaves like it does without Yomu: the top search bar is hidden, and the player controls fade out on their own instead of staying up permanently. Yomu was dispatching a page resize that YouTube reads as constant activity (which kept the controls awake), and its inline fullscreen wasn't hiding YouTube's top bar; both are now fixed.

## [1.6.108] - 2026-07-08

### Fixed

- Discord and other constantly-re-rendering apps no longer slowly break their own layout ("the spaces get bigger and bigger"). When such an app reshuffled a message's elements, Yomu could lose track of the hidden text overlay it had added and stack a fresh one on top each time, and each extra copy added height until rows grew unbounded. Yomu now finds and reuses the overlay it already owns no matter where the app moves it, so only one is ever present.
- YouTube Shorts video titles no longer occasionally vanish. When Shorts recycled a title element and swapped in new text, Yomu's hidden overlay was cleared without asking for a fresh pass, leaving the title blank; it now re-scans immediately so the new title always appears.
- The channel/title pill on YouTube Shorts no longer shows furigana readings floating with the word text missing beneath them. The at-rest style for buttons and chrome was overriding the word's readable text colour so the base glyphs blended into the pill; the base text now keeps its computed contrast colour.
- Buttons such as Subscribe (チャンネル登録) now keep their pitch-accent underline at rest, matching subtitles and body text. The bare-until-hover treatment for chrome now only removes the background highlight; the pitch/state underline, text colour, and furigana stay visible.
- Browser-extension users can now actually turn off Yomu Study as the new-tab page. The "Set Study as the new tab" setting was silently switching itself back on every time a new tab opened; it now stays exactly as you set it, turning it off shows a plain new tab instead of Study, and the choice is offered during onboarding.

## [1.6.107] - 2026-07-07

### Fixed

- Japanese readings (furigana) inside narrow site chrome — such as the buttons in Reddit's community header — no longer wrap onto two lines or get cut off on Safari and other WebKit browsers. A reading longer than its kanji (for example しょうさい over 詳細) was stacking onto a second line that a short button then clipped away, which looked like the reading was missing entirely; the annotation now always stays on a single line.

## [1.6.106] - 2026-07-07

### Added

- The study session has a new optional "Type the word" step after Speaking: the example sentence appears with the target word blanked out and you fill it in — either by typing, or by handwriting it one kanji at a time (each kanji is graded against its stroke shape, while kana and reference-less characters advance on their own). It grades your first attempt instantly and shows the correct answer, and you can turn it off or skip it per session. Your keyboard/handwriting choice is remembered.
- The final reveal now shows a per-step results strip — a compact row of ✓ / ✗ / — marks for each step you did this card (Kanji, Recall, Listen, Speak, Type) — and gently highlights a suggested grade based on how those steps went. It is only a suggestion: your own grade always wins, and skipped steps never count against you.

### Improved

- The Listen pitch step now tells you immediately whether your pick was right instead of waiting until the reveal, and it keeps the picker live so you can explore the other contours afterwards — your recorded result is fixed to your first pick, so exploring never changes your grade. Words that legitimately have more than one accent now accept any of their valid patterns as correct.
- Pitch accents on the reveal and the Listen feedback now label how common each variant is — the primary reading is marked "Most common" and the others "Also used" — and the variant graphs sit in one compact wrapping row that uses space far better on a phone, with the primary pattern emphasised first.
- You can now swipe left and right to move between study steps, not just to grade on the last step: a horizontal swipe on an earlier step steps forward or back, while the final-reveal swipe still grades (left again, right good). Swipes are ignored when they start on the handwriting canvas, a text box, or the pitch buttons, and vertical scrolling is untouched.

### Fixed

- Tapping a "composed of" kanji chip on the reveal page no longer freezes the page or navigates away. The chip now opens the standard kanji popover — with its stroke diagram, meaning, and mnemonic — right next to the word, instead of swapping the whole card into a separate kanji queue.
- Clicking the headword on an unrevealed study card now opens the word's dictionary entry, as intended, instead of a single-kanji popup.
- Compound words built from an okurigana stem, such as 食べ物, no longer lose their pitch-accent underline on the reveal page: their component pitches are now composed correctly instead of being dropped.
- Pitch variants that differ only by their downstep position (for example the heiban and odaka readings of a word) are no longer collapsed into a single graph, so every distinct accent a word can take is shown.
- The homepage "Try me" demo text now responds to the very first hover even when the page is still loading: a hover that lands during start-up is replayed once the reader is ready, so the popover no longer needs a second pass to appear.
## [1.6.105] - 2026-07-06

### Improved

- The "Hide furigana for" and "Hide color for" appearance controls and their word-category labels (New, Learning, Known, Due, Failed) are now translated when the interface language is Japanese, instead of always appearing in English.

## [1.6.104] - 2026-07-06

### Added

- Colour settings now let you switch off highlighting for specific word categories while keeping the rest coloured — for example, stop colouring words you already know but keep new and due words marked. A new "Hide color for" set of checkboxes in the appearance settings covers New, Learning, Known, Due, and Failed, mirroring the existing per-category furigana control. It works across every colour source (JPDB, Jiten, and Anki states).

## [1.6.103] - 2026-07-06

### Fixed

- Text on framework-driven articles that live-update (such as NHK news) no longer turns into an unreadable double image. When such a site re-rendered a paragraph, its fresh copy of the text painted on top of Yomu's already-annotated words, leaving two overlapping copies. Yomu now detects that duplicate re-insert, drops its stale annotations for that paragraph, and switches it to the non-destructive overlay so later re-renders stay clean. Verified on both Chromium and WebKit.

## [1.6.102] - 2026-07-06

### Fixed

- The pause icon on the puck is now centred in its badge instead of sitting slightly to the left.

### Improved

- Each word and subtitle colour channel (highlight, underline, text) now offers a "None" option — previously labelled "Off" — so it is clear you can turn that channel's colour off entirely (for example no underline colour, or no word highlight at all).

## [1.6.101] - 2026-07-06

### Fixed

- Jiten parsing no longer sends tiny single-word requests to jiten.moe: short text now parses with your local offline dictionaries (when installed) while longer batched lines still use the Jiten endpoint, cutting request volume and giving better boundaries on long passages.

### Improved

- The floating puck is far less distracting at rest — it fades back into the page and only brightens to a crisp, clearly-coloured state when you hover or focus it. The three power states stay distinguishable by their colour, ring, and badge.
- Local (offline) parsing is significantly faster: word deinflection — the single biggest cost in the local parser's per-line work — is now cached, so re-scanning a page or a live subtitle no longer recomputes the same candidates hundreds of times.

## [1.6.100] - 2026-07-06

### Fixed

- The puck's power button now cycles through all three states — annotations on, furigana hidden (colours and lookups stay active), and paused — instead of collapsing to a pause/resume toggle. Resuming from paused always restores furigana, so a furigana-off preference or a mid-session reload can no longer strand you between two states.
- Compound words such as 国内向け now show their "Composed of" breakdown into component chips (国内 + 向け) in the lookup popover; kanji-stem compounds with an okurigana or kana tail used to be skipped before segmentation. (Requires imported offline dictionaries.)
- Compound headwords now show a pitch-accent graph composed from their parts even when only a component's reading is in the pitch bank (向け resolves through its reading むけ) instead of staying grey; ambiguous readings are still left uncoloured so a homograph is never mismarked. (Requires an imported pitch bank.)

### Improved

- The puck's three power states are now unmistakable at a glance: everything on is a green ring with a solid dot, furigana hidden is a distinct amber ring with a crossed-through ふ badge, and paused is greyed with a dashed ring and a pause badge — so on and furigana-off are no longer both green and easy to confuse.

## [1.6.99] - 2026-07-06

### Fixed

- Mining into a custom JPDB deck no longer fails with "JPDB request failed (400)": numeric deck ids are now sent to the deck add/remove API as numbers instead of strings, so grading a word that is not yet in your selected deck adds it and grades it in one tap. Special decks such as the priority list were unaffected.
- The Grammar and Translation sections that Yomu adds to dictionary sites such as jpdb.io now actually load: they used to sit on "Finding grammar..." or "Open this section to translate." forever because their lazy loaders were only wired up inside Yomu's own popover, not on dictionary-page panels.
- The YouTube subtitle side panel no longer turns unusable on long videos: word-state colouring passes used to re-measure contrast across every transcript row on every cue (a forced layout over hundreds of rows per second), and now only refresh the lines whose words actually changed.
- Deep-scrolling a long transcript no longer runs into blank rows: the virtualized list calibrated its row height from a fixed 80px guess, so furigana-tall rows accumulated thousands of pixels of drift; the estimate is now measured from the rows on screen.
- Bunpro-only setups (no JPDB or Jiten key, no Anki) now get word-state colouring on scanned pages and subtitles: the scan pipeline gated all word-state enrichment behind Anki being enabled, so the Bunpro colouring pass never ran for users who only have a Bunpro token.

### Improved

- The puck now shows all three power states unmistakably: annotations on gets an accent ring with a small accent dot, furigana hidden keeps its colour with a larger crossed-ふ badge, and paused stays greyed with a dashed border and pause badge but no longer fades so far that the state is hard to read.
- The "Composed of" breakdown on lookup cards is now an always-visible inline row of tappable component chips joined by middle dots, dropping the collapsible panel and its heading: each part keeps its furigana, pitch colouring, and one-tap lookup while the whole breakdown wraps cleanly and lines up with the rest of the card.
- Words whose reading carries more than one attested pitch accent now show every distinct accent graph instead of silently presenting the first one as the only accent, since the correct pattern often depends on the sentence; multi-graph rows (accent variants and per-component graphs) also break onto their own full-width line under the headword instead of stacking in the narrow corner next to the audio button, and component chips align with the headword text and show a visible keyboard focus ring.

## [1.6.98] - 2026-07-06

### Fixed

- Unknown pitch words no longer paint the neutral grey pitch underline in page annotations or YouTube subtitle/transcript rows; pitch underlines now appear only after a real pitch class is known.
- Local pitch resolution now shares the same whole-word, kana-keyed, and component-composed fallback path across parser annotations, page enrichment, popup cards, and study/search cards, so compound words behave consistently wherever Yomu renders them.

## [1.6.97] - 2026-07-06

### Fixed

- Compound dictionary cards now compose a whole-word pitch graph from local component pitch entries when no whole-word pitch row exists, so the popup graph and pitch underline no longer stay unknown for words such as 登録者数.

### Improved

- The "Composed of" panel is more compact and scannable: parts render as wrapped lookup chips with furigana, pitch colouring, and clear separators, so two-part expressions and longer compounds use the popup space without the old loose row layout.

## [1.6.96] - 2026-07-06

### Improved

- The puck now makes its power-cycle state visible: furigana-hidden mode gets its own small furigana badge and partial-tone power action, while fully paused annotations show a pause badge, so the intermediate "readings hidden but lookups still active" state no longer looks the same as turning annotations off.

## [1.6.95] - 2026-07-06

### Fixed

- Large wrapped YouTube titles now reserve a small post-measurement cushion after the ruby-room sweep, so Linux/CI Chrome font metrics no longer leave watch titles a few pixels clipped even after the title grows for furigana.

## [1.6.94] - 2026-07-06

### Added

- The puck power button now steps through three states: everything on, furigana hidden, and annotations paused. One press hides readings while the reader stays active for colours, lookups, and mining; a second press pauses everything; a third brings it all back, restoring the furigana mode you were on when the same cycle hid it.

### Fixed

- Settings are now stored reliably on userscript managers that hand back copies of saved values instead of the values themselves, such as the Safari and Firefox userscript apps, so preferences and the welcome screen no longer reappear from scratch on each new site. A failed storage write also falls back to local storage now instead of being silently dropped.
- An immediate rescan requested right after annotations change, for example from the puck power button, is no longer postponed by the slow rescan throttle that live-updating pages use, so the page re-annotates instantly instead of up to ten seconds later.

## [1.6.93] - 2026-07-06

### Fixed

- Styled chat-app and framework-managed rows keep their look when annotated: instead of hiding the whole row (which erased its background, border, and icons) the row's own text is made transparent while the annotated overlay paints on top — the box, its icons, and its decorations keep rendering, and icons drawn with the text colour keep their colour.
- Titles that wrap differently once they grow for furigana no longer stay clipped: the cropped-row sweep re-measures after applying room and grows again when the new wrap needs it (this depended on the system's fonts, so some devices saw clipped watch titles that others did not).

## [1.6.92] - 2026-07-06

### Fixed

- Subtitle transcript rows paint their readings and pitch colouring as soon as each line is parsed, instead of leaving a line bare until every word on it resolved — no more patchwork of coloured and uncoloured lines in the drawer.
- Subtitle transcript rows are more compact: cue rows no longer waste vertical space (a two-line cue is roughly 25% shorter) while keeping furigana fully readable.
- Furigana readings no longer show gaps between words in overlay chips (for example a sort control reading "新しい順"): the annotation overhang is measured and tightened so words sit together the way they do in body text.
- Furigana readings are no longer shaved at the top edge of short fixed-height chips and labels (for example "さらに表示"): those rows now reserve a little clearance above the reading.
- Pitch-accent colouring now covers compounds whose whole-word reading is not in the pitch dictionary (for example 登録者数): the pattern is composed from the pitch of the individual parts, so the word colours and underlines instead of staying grey.

## [1.6.91] - 2026-07-06

### Fixed

- Kaa and similar custom video players now load subtitle files declared inside player config payloads, including Astro-style `props` data, and cross-origin page-file subtitles try anonymous browser CORS before falling back to the userscript bridge. This keeps tracks such as Kaa's `subst.krussdomi.com` VTT files from getting stuck at "waiting for captions."
- Furigana layout stays enabled without clipping or overflowing compact ecommerce rows: Google Search chips, Bloomee product cards, drawer/menu rows, and similar clipped controls now reserve ruby room on the actual control container as well as the mirrored text row.
- YouTube live chat/card text is parsed at the message/control level instead of as whole live panels, reducing live-page churn while preserving furigana and pitch underlines on readable YouTube chrome.
- The lookup panel's sentence breakdown now reads as a sentence: tokens flow inline and wrap naturally instead of stacking one word per line, numbers and Latin text between words are kept in place, and each word carries the same pitch accent and study-state colouring as words on the page.
- Composed of polish: the section gained breathing room above its header, components render as annotated ruby chips in a wrapping row, chips can be activated by keyboard (Enter and Space) as well as tap, and component pitch colouring survives kana-variant reading differences.

## [1.6.90] - 2026-07-06

### Fixed

- YouTube live streams and live chat no longer trigger continuous full-page rescans: overlay-decorated surfaces that update constantly (chat messages, live view counters) now refresh at most once every few seconds after the first fast refresh, instead of forcing a rescan for every update.
- Furigana mode "All words" no longer forces in-place readings into rows the browser engine distorts (fixed-height and clamped rows where the base text would shift out of view): those rows keep their reading via the overlay on plain rows and suppress it on styled rows, exactly like other modes. Yomu's own panels still always show readings.
- Less jank while annotating large pages: the cropped-row furigana sweep now measures everything before applying any size change (no more one forced reflow per annotated word), and the short-row overflow check no longer scans whole subtrees from every ancestor.

## [1.6.89] - 2026-07-05

### Fixed

- Furigana stays readable without breaking compact ecommerce layouts: short product price rows, breadcrumbs, review links, drawer menus, and similar fixed-height sections now grow only enough for readings instead of clipping, overlapping, or dropping annotated text.
- YouTube live chat is lighter and parses subscriber-only notices correctly: live chat scans are scoped to message/control text instead of whole chat containers, `/live_chat` frames get the same ruby-safe YouTube handling as watch pages, and split notice text such as 登録者 still receives furigana and pitch underlines.
- YouTube transcript rows keep phrase context across adjacent cue fragments without bloating the drawer labels, so words split by transcript row boundaries parse consistently while the panel remains compact.
- Compound lookup component links now keep their ruby and pitch styling, so composed-of entries remain readable without losing pronunciation detail.

## [1.6.88] - 2026-07-05

### Fixed

- Placeholder caption tracks no longer render as subtitles: metadata cues such as "Captions not needed: There is no dialogue" (Amazon product videos) are dropped everywhere cues are read, and tracks whose entire payload is a single line are no longer auto-selected, so silent videos stay clean while manual track selection keeps working.
- The subtitle overlay on generic sites now anchors to the actual video frame instead of a wider page section containing it: wrappers that extend far past one side of the video (player plus a "more videos" sidebar) are rejected, so subtitles centre on the picture and hide when the video scrolls out of view, and scrolling inside nested containers re-anchors the overlay too.
- Dragging the subtitle line upwards is no longer capped at 40% of the video frame: the line can ride as high as the screen allows, matching the freedom the downward direction already had.
- The subtitle style popover no longer duplicates the bottom-offset slider — drag the line itself to reposition it — and the drag handle now appears only while the video's rail controls are visible instead of hovering permanently over idle videos.

## [1.6.87] - 2026-07-05

### Fixed

- Styled clipped rows keep their look: a pill chip, dark section bar, row with an icon, or row with CSS decorations is no longer hidden behind a text overlay when its text is annotated — only visually bare rows (plain clipped titles and labels) use the overlay for furigana, and styled rows render in place with the reading suppressed instead. This fixes chips losing their background and border, dark bars and separators vanishing, icons disappearing, and doubled overlapping text on decorated sites.
- Smoother annotation on iPhone and iPad: the clipped-row layout check is now memoized per element, so large pages no longer pay a forced layout reflow for every annotated word.

## [1.6.86] - 2026-07-05

### Fixed

- Overlay-decorated text no longer flickers or tears down on rows with hidden duplicate labels: the mirror staleness check now reads the host through the same visible-text extractor it was seeded with, and hidden or script-only text can no longer be painted into the mirror.
- Live-updating mirrored rows (view counts, subscriber counts) refresh in place instead of flapping between decorated and bare: the stale-mirror rescan is no longer debounced past the mirror's removal grace window.
- Safari/WebKit constrained-row handling can no longer lock in a wrong verdict when the reader stylesheet loads late: the ruby layout probe verifies Yomu's own styles are applied before caching its result, so healthy engines keep in-place furigana.
- Clipped single-line rows now also grow when furigana clips at the top of the row (Google search chips and similar fixed-height labels), and removing a mirror no longer overwrites styles the page changed while the mirror was up.
- Bunpro colouring hardening: the review index is cached per account so switching tokens can never colour words from the previous account, a failed fetch backs off for five minutes instead of retrying on every scan, and words that leave the Bunpro index restore their original provider state and classes.
- Smoother scrolling: scroll-triggered rescans are debounced on every site, and scrolling inside Yomu's own panels and popovers no longer triggers page rescans.
- Rare supplementary-plane kanji (such as 𠮟) are now treated as CJK when collapsing soft line breaks, so words containing them no longer gain a stray space.

## [1.6.85] - 2026-07-05

### Added

- Bunpro word colouring on pages: with a Bunpro API token connected, scanned words that match your Bunpro vocab reviews now colour with the same state tiers as JPDB and Jiten words (new, learning, known for Master items, due, and ghost reviews as failed), so underline, highlight, and text colour sources reflect your Bunpro progress on every site. Bunpro fills in only words your dictionary provider does not already track, and the review index is cached for six hours to keep page loads light.

## [1.6.84] - 2026-07-05

### Fixed

- Word lookups no longer fail with a "No configured proxy." toast when nothing is configured: the built-in Cloudflare proxy (edge.yomureader.com) now serves allowlisted read-only dictionary and audio requests on every site, not just yomureader.com, so hover lookups, pitch, and audio work out of the box when a direct or userscript request is unavailable.

## [1.6.83] - 2026-07-05

### Fixed

- Pitch underlines are visible again on overlay-decorated buttons and chips (subscribe and membership buttons, sort chips): the rule that keeps resting decoration off native page buttons no longer applies to Yomu's own overlay mirrors, which are always decorated surfaces.

## [1.6.82] - 2026-07-05

### Changed

- Moved the homepage Study CTA directly after Install and made the Study pill label bold.

## [1.6.81] - 2026-07-05

### Fixed

- Desktop-layout YouTube chrome that starved behind the video grid is now decorated: the left mini-guide rail entries, the search filter row, search channel cards, and shelf "+other N" expanders are collected with the high-value watch text instead of trailing the grids at the scan cap.
- Subscriber counts and subscribe buttons are decorated at last: those rows re-render constantly, which used to exclude them entirely; they now ride the passive overlay mirror, which absorbs the re-renders, so チャンネル登録者数 rows get furigana and pitch everywhere.
- A line break inside a Japanese word no longer renders as a space: YouTube wraps metadata like 視聴 across source line breaks, and the overlay used to show "視 聴" with the word split for the tokenizer too; line breaks between Japanese characters now collapse to nothing while Latin text keeps its single space.

## [1.6.80] - 2026-07-05

### Fixed

- Removed the homepage hero Guide CTA so the primary action row stays focused on Install, Watch, Read, Study, and Game.

## [1.6.79] - 2026-07-05

### Fixed

- Clipped rows get their furigana back without any layout risk: Shorts titles, shelf headings, and line-clamped post bodies now render through the overlay text mirror, which draws the reading on its own line above the row, instead of suppressing the reading on browsers where in-place ruby would collapse or grow the clip window.
- A recycled element no longer keeps showing its old overlay: when YouTube reuses an element for different text (the comments header turning into the comment composer on iPad), the stale overlay used to keep painting the old text over the new content while hiding it. The overlay is now removed the moment the underlying text changes, and the new text is re-decorated on the next scan.

## [1.6.78] - 2026-07-05

### Fixed

- Compound lookups such as 跳梁跋扈 now show a "Composed of" section with clickable component lookups for parts such as 跳梁 and 跋扈, while keeping the full compound as the main card.
- Compound-style pitch accent is more reliable: local component pitch segmentation no longer mistakes the whole compound for its only component, and Yomitan pitch metadata that stores raw H/L patterns now loads correctly.
- Pitch underlines no longer get stuck grey or hover-only on Discord-style message prose: readable chat/message bodies inside clickable app containers stay active text, and underline contrast refreshes from Yomu's actual painted underline rather than a transparent native fallback.

## [1.6.77] - 2026-07-05

### Fixed

- Hover dictionary popovers stay open while the pointer remains inside the same hyperlink or link-card control, preventing link-wrapped Japanese text from flashing the popover open and closed as the cursor crosses padding or sibling inline text.

## [1.6.76] - 2026-07-05

### Fixed

- The Yomu Gaming desktop app icon no longer degrades into a corrupted blue square at small sizes (window titles, Finder lists, the Dock at small scale): the packager derived the 16px and 32px macOS icon representations from the 512px raster with a broken downscaler, so every rebuild reintroduced the garbled icon. All icon sizes are now rendered directly from the canonical vector artwork and shipped as a prebuilt icon file the packager uses as-is.

## [1.6.75] - 2026-07-05

### Fixed

- Base text no longer disappears from clipped single-line rows when furigana is added: Shorts titles and shelf headings could shift out of their fixed-height clip window leaving only the reading visible. Words inside sub-one-line clipped or ellipsis rows now keep colour and pitch underlines without an in-place reading, so the text itself always stays visible on every engine and layout.

## [1.6.74] - 2026-07-05

### Fixed

- Mobile YouTube comment bodies and author handles are now decorated: the comment bottom sheet's current markup (comment threads without the legacy content-text id) is scanned directly, and scrolling inside any panel or bottom sheet now triggers the settle re-scan that previously only ran for whole-page scrolls.
- On iPhone and iPad, community-post and description texts are no longer clipped to a sliver of one line: Safari collapses a line-clamped box as soon as a furigana annotation is inserted into it, so on affected browsers those boxes keep colour and pitch underlines while the reading is left off.
- Dense feeds no longer leave later rows undecorated or stuck on the grey unknown-pitch underline: the per-scan collection cap and the per-page pitch lookup budget were raised so long subscription and channel feeds are covered.

## [1.6.73] - 2026-07-05

### Changed

- Immersion Kit example cards now share one set of styles across the popover dictionary, the new-tab study card, the kanji-study card, and dictionary-page add-ons: the caption overlay, target-word highlight, and translation-blur rules live in a single place instead of four diverging copies, so every surface gets the same behaviour and future fixes land everywhere at once.

### Fixed

- The caption clamp that keeps Immersion Kit subtitles inside the picture now also applies to popover dictionary examples, whose media box has a minimum width that could exceed a narrow screenshot.

## [1.6.72] - 2026-07-05

### Fixed

- jiten.moe search pages no longer break: a no-results parse page (for example jiten.moe/parse with an unknown word) previously treated its "Search …" page title as a dictionary headword and mounted an Immersion Kit media panel above the whole site, pushing the header and search box down the page. The title fallback now refuses page chrome, and the panel only mounts once the real vocabulary column exists.
- Dictionary-page add-ons can no longer attach to the top of the page body on any site: if no real anchor element exists yet (for example before a single-page app finishes rendering), the add-on now waits and mounts in place once the content appears.

## [1.6.71] - 2026-07-05

### Fixed

- Immersion Kit example subtitles no longer spill past the sides of the screenshot: the sentence overlay is now capped to the painted width of the letterboxed image on the new-tab study card, and the kanji-study and in-page example frames shrink-wrap the picture so the caption anchors to the image instead of a wider invisible box.

## [1.6.70] - 2026-07-05

### Changed

- The on-video control rail was slimmed from eight buttons to at most four (frame OCR, subtitle visibility, panel, and style): the previous/next/play-pause cluster and the fullscreen button were removed, so the rail covers far less of the video and has room for future controls.
- Subtitle transport (previous/next/play-pause) now lives only in the subtitle drawer, beside the Lines/Shadow/Mine/Tracks tabs, so the drawer title row shows the full track name instead of truncating it behind the buttons.
- While a paused-frame OCR overlay is up, a dedicated play control joins the rail just for the duration of the overlay, replacing the always-present play/pause button that existed only for that conflict.

### Fixed

- Subtitle lines are now mirrored into a native track whenever the video enters native fullscreen, including via the site's own fullscreen button — previously the mirror only engaged through Yomu's rail toggle.

## [1.6.69] - 2026-07-05

### Fixed

- Japanese text that no site profile covers is now always decorated: pages with a curated parser (like YouTube) run a residual scan over any remaining visible Japanese, so surfaces such as the mobile watch page's view-count line, hashtag row, and もっと見る expander get furigana and pitch instead of staying bare.
- The mobile YouTube watch metadata section and channel row are now scanned directly (view count, date, hashtags, description expander), not just the video title.
- Yomu's video control rail no longer covers YouTube's own CC and settings buttons on phones and tablets: the rail measures the player's native top control row and moves below it.
- Furigana readings no longer wrap onto two lines inside narrow menus and chips, so 標準 no longer renders its reading as stacked fragments; a reading always stays on one line.
- Adding furigana no longer shifts or breaks compact UI layouts: words in menus, chips, and slider labels keep the host's original line height and draw the reading above it, so the playback-speed 倍 label no longer rides onto the slider handle.

## [1.6.68] - 2026-07-05

### Fixed

- Hovering a word in the homepage "Try me" sample now opens the dictionary popover immediately: the reader runtime previously only started loading after the pointer crossed the manga or video demo, so hovers over the sample text did nothing until then. Demo pages now boot the already-preloaded runtime as soon as the browser is idle, and hovering or touching any demo surface (including the Try me text) starts it on the spot.

### Changed

- The Parsing source setting now offers explicit Jiten API and JPDB API choices alongside Local dictionaries and Automatic, so you can pin one provider instead of relying on the automatic preference order. A pinned provider never silently switches to the other API; if it is unavailable the reader falls back to local parsing.
- When a local pitch-accent dictionary (such as Kanjium from the offline setup) is installed, background pitch enrichment now stays fully local instead of sending paced public jpdb.io lookups, so pitch colouring works offline and pages stop trickling network requests. Word popovers keep the bounded public fallback for terms the local bank misses.

## [1.6.67] - 2026-07-05

### Fixed

- The study page now loads the real Bunpro review queue: Bunpro serves its queue from the reviews quiz endpoint, so the previously used endpoint only returned deck settings and the page silently fell back to other sources.
- Bunpro grading requests now include the same correct flag Bunpro's own quiz sends, so graded reviews advance reliably.
- Tightened the homepage install-step cards so the manager step no longer wraps awkwardly and the buttons stay compact on desktop.

## [1.6.66] - 2026-07-05

### Fixed

- Fullscreen on mobile is now true fullscreen: on iPhone Safari, where the page fullscreen API does not exist, the fullscreen button and site fullscreen requests fall back to the video's native fullscreen instead of the CSS overlay mode that kept the browser bars on screen.
- While the iPhone system player is showing, Yomu mirrors the loaded subtitle lines into a native subtitle track, so the current line stays visible in native fullscreen.
- The subtitle line can now be dragged below the video frame: the drag stops at the bottom of the screen instead of at the frame edge, so letterboxed and inset players no longer trap the line inside the picture.

## [1.6.65] - 2026-07-05

### Fixed

- Offline review caching no longer stalls at "Cached 1": each card's warm-up is now raced against a hard timeout, so one hung lookup (for example an unreachable AnkiConnect) can no longer freeze the whole cache queue.
- The offline warm-up now runs a few cards in parallel and covers your full configured offline review cache limit (up to 500 cards), so a long train-ride session is ready much sooner.
- Cards whose warm-up fails are retried automatically after half a minute instead of being skipped for the rest of the session.
- Once warming finishes, the enriched cards (including fetched pitch accents) are re-saved to the offline review cache, so they survive reloads without a network.

### Changed

- The study session's cache indicator now shows live progress as "Cached N/M" while warming, collapsing to "Cached N" once the whole session is ready for offline use.

## [1.6.64] - 2026-07-04

### Changed

- The new-tab study source switcher is now a proper dropdown: the status pill's cycle toggle (⇄) was replaced by a select listing Yomu, JPDB/Jiten, Bunpro, Anki, and Dictionary, with the provider colour dot on the dropdown face.

### Fixed

- Switching review source no longer looks like flipping between two identical Yomu modes: the dropdown always shows the source you chose, while the status pill reflects the cards actually on screen, so an empty queue falling back to practice words is visible instead of silently re-showing the same cards.

## [1.6.63] - 2026-07-04

### Fixed

- Listen and Speak study steps now appear for every review source (JPDB, Jiten, Bunpro, Anki and the local Yomu deck): pitch accent loads from the local dictionary on demand and the steps run inside the card session, so toggling the review source no longer swaps the study flow between a Kanji/Word variant and a Listen/Speak variant.
- The kanji drawing prompt no longer prints the word meaning next to the blanked word, which gave away the answer to the later Word step; the meaning now sits behind the first tier of the Hint button instead.
- The local Yomu review queue keeps serving cards ahead of schedule once the due cards run out, so the study tab offers every mined word instead of stopping at the handful currently due.

## [1.6.62] - 2026-07-04

### Fixed

- Firefox: the hosted study page no longer loses pitch accents and dictionary lookups when the userscript request bridge is dead — a bridge request that fails at the transport level (timeout or Xray failure, not a real HTTP status) now retries through the hosted proxy fetch path instead of surfacing CORS errors and empty cards.
- Firefox: "Not allowed to define cross-origin object as property" console errors are fixed at the source — the companion registry is cloned into the page compartment before being published on the page window (and skipped when the clone is refused), and a bridge event payload the page compartment refuses to clone now falls back to a JSON string instead of dispatching a sandbox object that Firefox silently drops.

## [1.6.61] - 2026-07-04

### Changed

- Tapping a "Composed of" kanji chip on the new-tab study reveal now switches the study card to that kanji's own step in place — the dictionary sections below swap to the kanji's details — instead of opening a lookup popover over the card.

## [1.6.60] - 2026-07-04

### Fixed

- Furigana and pitch-accent decorations now render at rest on every page, including store and video tile grids (BookWalker home, hanime1, and similar catalog layouts) that previously showed decorations only while hovering a word.
- Cropped furigana never disappears or truncates: any site's clamped or clipped text row now grows just enough for its ruby line, a repair that was previously limited to YouTube and Google Search.
- Words no longer stay on a grey unknown-pitch underline until clicked: every site now gets the same paced background pitch and reading enrichment budget that YouTube used, including for keyless users.
- Automatic image OCR now triggers on ordinary pages with large images, such as the BookWalker storefront, which was hard-excluded before.

### Changed

- Removed the BookWalker-specific ruby suppression and scan gates in favour of generic layout guards, so store pages keep furigana while buttons and menus stay undecorated.

## [1.6.59] - 2026-07-04

### Fixed

- The kanji drawing brush now matches the trace template's stroke width and renders smoothed curves, so mouse and Apple Pencil strokes look like the underlying glyph instead of a thin jagged line.
- Kanji stroke grading is more lenient: a correctly written character with one slightly wobbly stroke now passes instead of failing on "check stroke shape/order".
- Advancing between kanji steps in a multi-kanji word no longer shows the previous kanji's trace: a late-loading template can no longer overwrite the active step's ghost or prompt.

## [1.6.58] - 2026-07-04

### Fixed

- Restored word audio for Jiten-backed kana words such as `よむ`: when the hosted audio source has no playable clip, よむ now falls back to the exact Jiten TTS word reference already attached to the rendered word, so hover autoplay and the popover speaker button play real audio.
- Refreshed the Cloudflare-hosted audio corpus from the local Rust audio server and uploaded the sharded R2 index, so the default hosted source now covers the full available Japanese local collection instead of only earlier seeded clips.

## [1.6.57] - 2026-07-04

### Fixed

- Updated the release smoke for paused-frame video OCR to use the manual Read video frame (OCR) action, matching the current manual-first video player behavior before publishing.

## [1.6.56] - 2026-07-04

### Fixed

- Centered the Listen mode pitch-pattern graphs inside each answer tile, so the mora labels and contour line sit visually under the tile number instead of leaning left.

## [1.6.55] - 2026-07-04

### Fixed

- Clicking the headword on an unrevealed study word card now opens the word's own lookup instead of a component kanji card; per-kanji drilldown appears only after the answer is revealed.

## [1.6.54] - 2026-07-04

### Fixed

- Video players hosted in third-party iframes (such as the kaa.lt player) are now detected: Yomu boots inside an embedded frame as soon as a video element appears, instead of only inside YouTube frames.
- OCR now works inside embedded video frames: the subtitle rail's Read video frame (OCR) button and paused-frame capture are initialized in player iframes, where they previously did nothing.

## [1.6.53] - 2026-07-04

### Fixed

- Added balanced padding to new-tab search suggestions, so wrapped dictionary details no longer sit against the card edge.

## [1.6.52] - 2026-07-04

### Fixed

- The subtitle drawer's previous/next/play cluster moved into the head's top row beside the options and close buttons, so it no longer wraps onto its own line over the transcript on narrow panels, and it now shares the same bordered button chrome as its neighbours.
- Every subtitle rail button, the drawer transport, and the panel position selector now respond to hover and keyboard focus with the shared accent highlight.

## [1.6.51] - 2026-07-04

### Fixed

- Vertical OCR text no longer spills past its highlight box: the frame now grows to the re-typeset column height, so long vertical lines stay wrapped instead of getting clipped at the overlay edge.
- Restored the compact side-panel transport controls: the drawer's previous/next/pause cluster keeps its 32px chrome on touch devices (the 42px iPad sizing applies to the on-video rail only) and now matches the rail's ‹ › pause order.

### Changed

- Paused-video OCR is now manual-first: a new Read video frame (OCR) button in the subtitle rail scans the current frame on demand, and the settings checkbox now controls automatic pause scanning, which is off by default.

## [1.6.50] - 2026-07-04

### Changed

- Added hover, focus, active, and reduced-motion-aware transition coverage across Yomu's popover, settings, new-tab, subtitle, YouTube-filter, and gaming overlay controls, including details summaries and large study-card hit targets that previously felt static.

## [1.6.49] - 2026-07-04

### Changed

- The Greasy Fork listing is findable by name: the userscript description now leads with "Yomu (よむ)" and names its features (popup dictionary, furigana, pitch accent, manga OCR, video subtitles, Anki/JPDB/Jiten mining) so a search for "yomu" surfaces it, instead of the bare "Japanese reader." that matched nothing.

## [1.6.48] - 2026-07-04

### Fixed

- New-tab accent text now follows custom theme colors. The Search button, active source chips, and selected browser controls no longer fall back to the default green readable-accent token when the userscript theme is set to another color, such as red.

## [1.6.47] - 2026-07-04

### Changed

- Made the donation/support banners quieter: new users get their first eligible visits banner-free, later impressions are sampled by visit cadence, shown banners cool down for two weeks, and manual dismissal hides the banner for a month.

## [1.6.46] - 2026-07-04

### Fixed

- Grading no longer re-fetches the whole provider queue after every single card: the study page now refreshes when the local pool runs low, every ten grades, or after a minute — a 500-due jpdb/Jiten session previously meant ~500 full-queue API round-trips with the cache invalidated each time, the same request-storm class that once overloaded jiten.moe.

## [1.6.45] - 2026-07-04

### Fixed

- The study page's Previous word and Continue controls now split the navigation row 50/50 during two-button study steps instead of leaving an empty third column.

## [1.6.44] - 2026-07-04

### Fixed

- Keyless installs can start studying for real: the built-in starter cards (labeled "Yomu") now offer grade buttons that record into the local Yomu SRS — the deck is created on the first grade, so reviews begin from the starter carousel instead of only after mining words from pages.

### Changed

- The study personas smoke gained a keyless-grading scenario that reveals a starter card, grades it, and asserts the local deck recorded the review on the real built study page.
- The YouTube ruby-coverage proof records video only outside CI: the recording needs Playwright's downloaded ffmpeg, which the channel-Chrome runners don't have — this was the remaining red step in the 1.6.42 CI and Release runs (verified passing in CI mode locally).

## [1.6.43] - 2026-07-04

### Fixed

- Study, Search, and Stats now divide the new-tab mode switcher evenly on desktop, mobile, first paint, and the Stats page, removing the invisible extra grid columns that left the tabs looking lopsided.

## [1.6.42] - 2026-07-04

### Fixed

- Playlists are annotated: the watch-page queue panel, /playlist rows and their legacy header, and search-page channel cards (name plus description) are all scanned, with furigana room in their clamped titles — 1.6.40 underlined the 再生リスト tab while everything behind the click stayed bare.
- Search-result description snippets no longer clip furigana: .metadata-snippet-text joined the ruby-room whitelist alongside the playlist and channel-card rows.

### Changed

- The YouTube ruby-coverage proof gained a desktop-playlist page plus queue-panel and channel-card fixtures, pinning the new coverage in real Chromium.
- The feed-title recycler smoke serves its synthetic youtube.com via route interception instead of a loopback HTTP server: system Chrome's HSTS preload force-upgrades www.youtube.com to https, which failed the 1.6.41 CI and Release runs on their first execution of the new gate (verified green on both bundled Chromium and channel Chrome).

## [1.6.41] - 2026-07-04

### Fixed

- Swiping a study card no longer submits a grade while the answer is hidden: swipe reviews obey the same gate as the grade buttons and shortcuts (final-reveal step, answer revealed), so a drag mid Kanji/Recall/Listen step can't silently mark a card "okay" on your SRS provider.
- Pressing A while a lookup popover is open now replays the word audio instead of seeking the subtitle: the subtitle shortcuts yield to the reader while a lookup is on screen (Play audio and Previous subtitle both default to A), and a/d subtitle seeking is unchanged when no popover is open.
- Removed the dead "Image highlight background" color picker from settings: the OCR highlight background is derived from the accent color, so the picker's choice was silently discarded — the control lied.

### Changed

- CI and the release gate now run the three hermetic regression smokes (study-flow stability, YouTube feed-title recycler, YouTube ruby coverage), so their changelog guard claims are enforced, not aspirational; the smokes now honor the CI browser channel.

## [1.6.40] - 2026-07-04

### Fixed

- YouTube channel pages are now annotated end to end: the tab strip (ホーム/動画/ショートなど), shelf headings like 人気の動画, the channel header with its description preview (さらに表示), and legacy grid cards are all scanned — and the guide rail no longer needs a watch page to get furigana and pitch.
- Words in the channel tab strip keep their pitch underline at rest: the bare-until-hover chrome rule now carves out yt-tab-shape the same way it does chips, the guide, and the watch action row.
- Cropped channel-page rows no longer clip furigana: clamped grid titles, 10万回視聴 metadata lines, and the channel description preview reserve ruby room like the watch title does.

### Changed

- The YouTube ruby-coverage proof gained a desktop-channel page that pins all of the above (scan coverage, at-rest underlines, ruby room) against the built stylesheet in real Chromium.

## [1.6.39] - 2026-07-04

### Fixed

- The study session's step chips are pinned per card: late pitch and sentence enrichment no longer reshapes an on-screen review (four chips silently became six and Recall vanished mid-session).
- The Kanji 2 chip drills the word's second kanji inside the same session — it previously jumped to the kanji queue's synthetic card and the second doodle never appeared.
- The kanji draw prompt blanks every kanji in the word: 図鑑's first step showed ＿鑑, handing the answer to the second draw step.
- One source switcher: while a card is shown the status pill's ⇄ toggle cycles every source and the select no longer stacks under it — the duplicate control is gone (the select still serves the card-less empty state).

### Changed

- A new study-flow stability smoke pins all four behaviours against the real built study page.

## [1.6.38] - 2026-07-04

### Changed

- Shortened the hosted homepage action pills to "Guide" and "Game" so the first row stays readable and consistent on iPad.
- Made the subtitle rail and drawer playback controls visibly larger on iPad and other touch screens, while keeping the controls aligned with the rest of the drawer chrome.

## [1.6.37] - 2026-07-03

### Changed

- Internal: the pure lookup, nested-parse, and pitch-enrichment helper functions at the tail of the reader's main module moved into their own main-lookup-helpers module — no behaviour change, just a smaller main file and a testable home for the helpers.

## [1.6.36] - 2026-07-03

### Changed

- The getting-started guide now describes the real first-run welcome panel (quick setup plus the two choice buttons), points manga readers at the BookWalker/mokuro guide, and spells out what a mined Anki card carries; the features page documents that YouTube's Subscribe and Join buttons are intentionally left un-annotated to avoid re-render flicker.
- Hardening: the two remaining unguarded document.elementFromPoint call sites use optional calls, matching their already-guarded siblings.

## [1.6.35] - 2026-07-03

### Changed

- Canvas page identity has a single home: the OCR controller's per-canvas content-identity helpers moved into a dedicated canvas-page-identity module with an eleven-test invariant suite covering paged, continuous-scroll, and node-reuse modes — a refactor and test hardening of the shipped BookWalker fix, with surface tokens now consistently excluded from real-content comparisons.

## [1.6.34] - 2026-07-03

### Fixed

- Offline keyless first paint no longer waits for a doomed public-Jiten parse round-trip: with no API keys and no local dictionaries, parsing goes straight to segmentation when the browser reports itself offline, and still prefers Jiten's dictionary-correct word boundaries when online.
- The onboarding welcome now matches the documented recommendation: Use without API key is the emphasised first button, with Add API key beside it.

### Changed

- The hover shortcut placeholder is short enough for the onboarding grid column, so it no longer clips on desktop.

## [1.6.33] - 2026-07-03

### Fixed

- The hosted audio worker's v2 sharded-index source is now committed to the repository: production has served shard lookups (index/v2/shards) since 2026-07-02, but the source only existed in the deployed Cloudflare version, so any redeploy from the repo would have silently reverted audio.yomureader.com to the legacy seed manifest.

### Changed

- The audio export script gained a --full mode that streams the local Yomitan audio database into the v2 shard index (with per-file existence verification and generated rclone/aws upload plans), and the worker README documents the three serving modes.

## [1.6.32] - 2026-07-03

### Fixed

- The transcript drawer's play/pause and previous/next buttons meet the 44px touch floor on phones: they get the same hit-slop as the on-video rail, and the mobile smoke now measures every drawer-head control so a new control cannot ship under-sized again.
- Modifier hover mode always has a modifier: settings payloads with popupActivationMode 'modifier' but no stored hover shortcut now backfill the legacy scan modifier (or Shift) instead of firing hover lookups with no key held.

### Changed

- New regression guards: legacy furigana migrations (hideKnownFurigana/showFurigana), the subtitleControlsMode sanitizer, and a foreign-script anomaly gate that fails if Hangul or Cyrillic ever leaks into localized copy.

## [1.6.31] - 2026-07-03

### Fixed

- Scrolling the YouTube feed no longer re-parses every annotated title: silent auto-scans skip hosts whose mirror already renders the same text and defer the document-wide ruby sweep, cutting scroll-stress main-thread blocking from seconds to a single sub-100ms task.
- The watch page's action row and description expander are scanned reliably, and pitch underlines stay visible at rest across the watch metadata, masthead, and guide — the subscribe and join buttons stay unannotated deliberately, since re-rendering them fought YouTube's own updates.

### Changed

- Internal: the subtitle drawer-head helpers are module-private again, clearing the dead-export findings that turned CI red on 1.6.30.

## [1.6.30] - 2026-07-03

### Changed

- The subtitle drawer head is two rows: the placement options and close button sit beside the title, and the tabs row regained the previous/next cluster plus a new play/pause button — line-by-line review happens in the drawer, so its transport controls live there again.

## [1.6.29] - 2026-07-03

### Changed

- Remediation for 1.6.28, which was tagged with two style unit tests still asserting the old bare-until-hover selector: the tests now assert the chip and engagement-panel carve-out. No product changes beyond 1.6.28.

## [1.6.28] - 2026-07-03

### Fixed

- YouTube's feed filter chips and engagement panels (description, transcript, the ask-AI panel) keep their pitch underlines visible at rest instead of hiding them until hover, and the ask-AI panel's centered heading now gets furigana like the panel body.
- Subtitle words whose pitch has not resolved show the same neutral grey underline as the reader instead of rendering bare next to coloured neighbours.
- Local pitch lookups now match katakana surfaces against hiragana dictionary readings, retry kana-keyed rows by reading, and accept a bank's single stored reading when the parsed one disagrees — resolving pitch for words that silently dropped before.
- Keyless YouTube feed words outside the local pitch dictionary get pitch from the paced public lane again within the existing page budgets, so titles no longer render a wall of uniform grey.
- Furigana lines no longer crowd the previous line on tight layouts like YouTube titles.
- The video pause pill sticks: a competing play() is re-paused for a short window, pause/play/seek route through YouTube's own player API when available, subtitle seek shortcuts run in capture phase so the site cannot swallow them, and the control rail's first paint lands in the right place instead of correcting a frame later.
- The performance profiler measures the local dictionary path end to end instead of reporting the local popover metric as always-null.

## [1.6.27] - 2026-07-03

### Fixed

- The Recall step's answer box is visible again on the hosted study page: the inline first-paint stylesheet carried a stale copy of the answer-hiding rule without the kanji and recall exceptions and clobbered them, leaving the typed input at opacity zero.

### Changed

- The docs' study screenshots are captured from the real study page by one hardened script that asserts the answer input is actually opaque, replacing the jsdom skeleton renderer that had been misrepresenting the shipped layout.

## [1.6.26] - 2026-07-03

### Added

- The first-run welcome grew a sixth Game feature card and clearer defaults: page scanning and image OCR are now three-way choices, with hover-lookup and manual-scan shortcut fields alongside the existing offline dictionary download.

### Fixed

- Clicking a highlighted word inside the welcome panel's action buttons now presses the button instead of opening a dictionary popover over it.
- The performance profiler seeds its local dictionary database at the real store version and full schema again (read from the store source with a drift guard), so it measures the local parse path instead of silently falling back to the network.

## [1.6.25] - 2026-07-03

### Changed

- Factory reset now derives its key list solely from the managed-state registry: the two legacy hand-maintained enumerations are gone (net minus thirty lines), with the registry proven a strict superset before deletion and the unregistered-key warning kept as the safety net.

## [1.6.24] - 2026-07-03

### Fixed

- Touch targets across the reader now meet the 44px accessibility floor on phones and tablets: the study grade buttons (previously occluded to an effective 41px), every reader button on touch surfaces (a base style with !important had been silently defeating the responsive sizing, leaving onboarding CTAs at 38px), and the subtitle drawer close button (36px). Verified across iPhone, small-Android, and iPad viewports under 6x CPU throttling.

## [1.6.23] - 2026-07-03

### Changed

- Refreshed the documentation to match the shipped product: the study page docs and screenshots now show the real seven-step flow with the cloze recall, hints, and pitch question; a new extension section in Getting Started covers installing the Chrome and Firefox packages with the toolbar popup pictured; and the footer no longer claims store packages are "being prepared".

## [1.6.22] - 2026-07-03

### Fixed

- Factory reset now clears every store the reader writes, driven by a central managed-state registry: an invariant test seeds all 44 registered stores plus any future yomu-prefixed keys and fails if anything survives, and debounced writers (pitch progress, the OCR cache) are suppressed during reset so they cannot re-create keys they just cleared.

## [1.6.21] - 2026-07-03

### Added

- The kanji drawing step always fronts the word meaning with a blanked cloze ("drink - one kanji blanked"), so an ambiguous blank never leaves you guessing which word you are drawing, and a keyword that would just repeat that meaning no longer renders below it.
- Progressive hints on the ambiguous study steps: kanji drawing and typed recall gain a Hint control that reveals one tier at a time (meaning, then a kana cue) without giving the answer away before the reveal, which notes how many hints you used.
- The listen step pitch-accent check now shows the word and asks which pitch you heard above the contour choices, your pick is remembered while you move between steps, and the speaking step is labeled as shadowing with its scoring intact.
- Every study step visibility condition is spelled out in its settings help, so it is clear why a step is present or absent for a given card.

### Fixed

- Registered the study-flow screenshot harnesses with the dead-code gate, which had been failing CI since the study enrichment landed.

## [1.6.19] - 2026-07-03

### Fixed

- The Yomu Gaming gamepad poller now stops when the capture overlay is dismissed and resumes when it reopens; the hidden-and-reused overlay window previously kept polling every frame, wasting battery on handhelds.

## [1.6.18] - 2026-07-03

### Added

- The homepage donation bar now shows a live goal computed from the real monthly operating costs (with a 10 GBP floor), converts it to your local currency, tracks month-to-date progress across providers, and offers Ko-fi, Buy Me a Coffee, PayPal, and Patreon alongside the card checkout. Provider buttons appear as each account goes live.
- Yomu Gaming is now playable with a controller: the capture overlay gains gamepad navigation (d-pad or stick moves between recognized words, A opens the full in-overlay dictionary popover, B backs out, Y re-captures), shows Steam Deck-specific guidance when it detects one, and ships a manual Steam Deck test checklist.
- An extension boot smoke (npm run smoke:extension-boot) drives the freshly packaged Chrome extension in a real browser: service worker, content-script reader boot, first-run onboarding, scanning, popover, popup, and new tab must all pass with zero console errors.

## [1.6.17] - 2026-07-03

### Fixed

- The browser extension now works end to end: the reader crashed at startup because the extension GM shim returns its CSS resource as a promise where userscript managers return a string, so no page ever scanned. First-run onboarding now also shows in the extension, and the extension pages carry no inline scripts, which manifest v3 forbids.
- The extension action popup is a real popup — open Study, open settings on the current page, and documentation — instead of the compiler's developer stub.
- The keyless kanji drawing step now shows a word-with-blank prompt instead of the "No kanji keyword found." error heading, the step chips read Kanji 1 and Kanji 2 instead of printing the answer glyph, and the drawing grid is sized to sit under its prompt.
- The typed recall step appears whenever a card carries an example sentence: availability was accidentally tied to the separate front-sentence display toggle, so recall almost never ran. Each study step's visibility condition is now stated in its settings help.
- Keyless study no longer offers both Yomu and Dictionary as review sources for the same starter deck, and starter cards report Yomu as their source.
- Keyless word audio no longer fires a doomed direct request to languagepod101 before trying the working proxy path, removing the console errors and broken playback on hosted pages.

## [1.6.16] - 2026-07-03

### Fixed

- Restored the subtitle panel's "open by default" behavior that 1.6.15 broke: the cross-tab leak fix removed the load-time trigger entirely, so the drawer never auto-opened for users who keep it visible. The persisted preference now applies once per page from the track-load path, a manual close still sticks, and opening still never writes the setting back.

## [1.6.15] - 2026-07-03

### Fixed

- The subtitle side panel gained a one-tap X close button in its header, matching the other side panels, and the close action left the panel-options menu.
- Opening the subtitle panel no longer flips a persisted setting, so a panel opened on one video no longer auto-opens on every other tab and page; the open-by-default preference still applies once per page and a manual close now sticks.
- The docked subtitle panel keeps a stable height when the video scrolls out of view instead of collapsing into a sliver pinned to the bottom of the screen.
- Docking the subtitle panel to the left no longer stretches bounded page embeds to the full leftover column width, which was blowing the homepage demo video wide and cropping it.
- Tapping a BookWalker page in manual scan mode no longer randomly fails to show the OCR overlay: the background page-turn poll could discard the in-flight tap snapshot mid-capture, and the capture now survives unless a genuinely newer snapshot replaced it.
- Completed the interface-copy extraction: five same-directory imports still pulled the full Japanese UI copy tables into the core userscript, which now sits about 288 KB under the Greasy Fork limit.

## [1.6.14] - 2026-07-03

### Fixed

- The popover's Never forget and Blacklist buttons now appear only when a connected service can actually set that state for the word (JPDB or Jiten backing the card); on Bunpro-only cards they previously rendered but could only produce an error toast.
- The CI dead-code gate understands the companion build aliases again, so it stops flagging the alias-substituted companion facades and blocking CI.

### Changed

- Converged the keyless public-lookup fallback used by the reader and the new tab into one lookup module, removing the duplicated implementation that had started drifting.

## [1.6.13] - 2026-07-03

### Fixed

- OCR no longer strips the spaces out of Latin text when a line happens to contain a Japanese character (code screenshots turned into space-less soup); whitespace is now removed only between Japanese characters, where it is recognition noise.
- The popover no longer presents machine-translation garbage for text that is not actually Japanese: sentence translation now requires the text to be meaningfully Japanese, the translation section hides itself when there is nothing translatable, and a missing study companion returns no translation instead of echoing the input back as one.

## [1.6.12] - 2026-07-03

### Fixed

- Restored paused-video OCR on the hosted video player and PDF reader: the 1.6.10 companion extraction moved OCR into the yomu-ocr-manga companion, but the hosted pages, their service-worker precache, and the docs hosted runtime still loaded the old companion list, so the hosted OCR overlay never appeared. All hosted companion lists now include yomu-ocr-manga and yomu-ui-copy.
- The CI dead-code job now verifies the fallow platform binary after install and restores it when npm silently drops the optional dependency on a cold cache, which had been failing CI since 1.6.10.

## [1.6.11] - 2026-07-03

### Changed

- Moved the local (Yomitan) dictionary engine and its ZIP/Dexie import machinery into the Yomu Settings Surface companion, dropping the core userscript to roughly 1.79 MB and growing Greasy Fork headroom from about 39 KB to over 200 KB. Behavior is unchanged: the companion is always required by the userscript and bundled into hosted, extension, new-tab, and gaming builds, and if it ever failed to load, local dictionary lookups would fall through to the online providers instead of breaking.

## [1.6.10] - 2026-07-03

### Changed

- Moved the OCR/manga reader into a new yomu-ocr-manga companion, the interface copy into a new yomu-ui-copy companion, and the study mining context and sources into the Kanji/Study companion, so the core userscript sits about 39 KB under the Greasy Fork 2 MB limit instead of 143 bytes. Behavior is unchanged: companions are always required by the userscript and bundled into hosted builds.

## [1.6.9] - 2026-07-03

### Fixed

- Release-gate test waits now scale their polling budget on CI runners, so four-shard event-loop starvation no longer fails waits that pass in milliseconds locally. This is what blocked the 1.6.8 release build twice.
- The furigana-local-default smoke now opens settings by re-dispatching until the settings surface has registered its listener, instead of losing a single early dispatch on slow runners.

## [1.6.8] - 2026-07-03

### Added

- Added two release gates: a YouTube controls-wake smoke (npm run smoke:youtube-controls-wake) proving Yomu never keeps the player controls awake during idle playback, and a keyless local-dictionary furigana smoke (npm run smoke:furigana-local-default) proving a fresh offline install still decorates difficult kanji with furigana and pitch colours. Both run in CI and the release workflow.

### Fixed

- Keeps the YouTube Shorts player at its native size when the subtitle transcript drawer is open, instead of stretching the portrait video far past the viewport and cropping it.
- Watching YouTube with a JPDB or Jiten API key no longer fires redundant keyless public jpdb.io/jiten.moe lookups for every caption line: the DOM-caption warm parse now routes through the same authoritative provider request the renderer uses, halving idle-playback API traffic.
- Mutation batches that stay inside Yomu's own overlay now skip the per-mutation fullscreen scan, trimming main-thread work during subtitle playback.
- Fixed the flaky release-gating BookWalker OCR test: the OCR result cache persisted to localStorage mid-file on slow CI runners, so an earlier test's cached scan short-circuited the next test's recognizer and failed the release build. Unit tests now reset the persisted OCR cache between tests.
- Updated the subtitle player smoke's rail expectation to include the 1.6.7 visibility (eye) button, so npm run smoke:subtitles is green again on main.
- The hosted donation endpoint now refuses Stripe test-mode secrets and validates checkout URLs, returning a clear service error instead of ever redirecting supporters to a sandbox payment page.

## [1.6.7] - 2026-07-02

### Added

- The puck's radial menu now offers an "auto subtitles" toggle on video pages, so automatic subtitle injection can be switched on or off without opening settings.
- The subtitle rail gained a show/hide (eye) button to hide the subtitle overlay for the video being watched and bring it back mid-playback.

## [1.6.6] - 2026-07-02

### Fixed

- Advances new-tab study steps immediately on every Continue studying click, instead of letting the rapid-click guard meant for word navigation swallow quick step advances through kanji doodle, recall, and listen stages.
- Stops the new-tab study fallback from re-querying a local dictionary that the primary source load already found empty, removing repeated dictionary probes on every new-tab render.
- Cleared the dead-code gate by removing two unused kanji-study facade wrappers left behind by the companion import-severing.

## [1.6.5] - 2026-07-02

### Fixed

- Restored the Greasy Fork listing sync. Since 1.4.82 the build stripped the subresource-integrity hashes from the companion `@require` URLs, so Greasy Fork rejected every new version as "unapproved external script" and the listing stayed pinned to 1.4.78 (whose hashes had since drifted). Companion `@require` URLs are now hashed as the final build step — after the indent-trimming pass that was silently rewriting the companion files post-hashing — and `npm run verify` fails if a build ever drops or mismatches those hashes.
- Added install troubleshooting for the Chrome/Edge "Apps, extensions, and user scripts cannot be added from this website" popup and for userscript managers that download the `.js` file instead of opening an install screen.

## [1.6.4] - 2026-07-02

### Changed

- Merged the subtitle drawer dock position controls, the auto open-on-pause toggle, and the close action into one panel-options menu in the drawer header, so phone screens keep a single tidy row of controls instead of a wrapped strip.
- Removed the duplicate previous/next subtitle buttons from the drawer header; the player rail now keeps line navigation and playback visible while the panel is open.
- Removed the redundant subtitle rail tracks shortcut, which opened the same drawer as the panel toggle; the Tracks tab inside the drawer remains the way to manage tracks.

### Fixed

- The closed subtitle panel toggle now shows the bottom-sheet icon on phone-width screens where the drawer always opens below the video, instead of the remembered side-dock icon.
- Drawer header controls keep 44px touch targets on touch devices, and the merged panel-options menu closes on Escape, on outside taps, and after choosing a dock position.

## [1.6.3] - 2026-07-02

### Added

- Bunpro grading parity across the popover and study page. The popover's ⇄ provider toggle now cycles through every service that can grade the word — JPDB, Jiten, and Bunpro when the card carries a Bunpro identity — instead of being hardcoded to the jpdb/jiten pair, and the switch shows which service comes next. Bunpro-backed cards can be switched to another connected service per word without flipping the global preference.
- A "Preferred grading service" select in Settings → API, so the Jiten/JPDB grading choice is discoverable outside the popover toggle.
- The study-page lookup popover now shows the same provider status indicator as the main popover ("Jiten/JPDB/Bunpro + state" with the state dot) instead of a JPDB-only label, so it is always clear which SRS a grade goes to.

### Fixed

- The study page's review-source dropdown no longer disappears when the current queue is empty — finishing your Bunpro (or any) reviews keeps one-tap switching to the other connected SRS sources.
- Auto study-source selection now treats a Bunpro token as a configured review source instead of forcing Bunpro-only users onto Anki.
- Bunpro card state now refreshes from the review response after grading, so the popover status dot recolors like JPDB/Jiten instead of staying stale.
- Selecting the Bunpro study source without a usable token now explains what is missing ("No Bunpro token…" / "Bunpro token expired…") instead of the generic "Could not load words."
- A stored Bunpro grading preference can no longer route words without a Bunpro identity to the Bunpro API (that path previously produced doomed review calls with synthetic ids).
- "Allow Bunpro review/mining" now defaults on, matching the JPDB setting — the imported token remains the real gate.

### Changed

- Moved the study-tool result rendering and mining drawer/deck-picker DOM helpers into the Yomu Kanji/Study companion (ADR-0003 core import-severing), keeping the core userscript under the Greasy Fork 2 MB limit. Behavior is unchanged: the companion is always required by the userscript and bundled into hosted builds.

## [1.6.2] - 2026-07-02

### Fixed

- Kept word highlights hover-only on passive link text so busy pages such as search results are not repainted wall-to-wall, while the pitch underlines and text colours restored in 1.6.1 stay visible at rest.

## [1.6.1] - 2026-07-02

### Fixed

- Restored pitch-accent underlines, state colours, and furigana on link-wrapped content (news headlines, Wikipedia-style prose links, forum titles) at rest. Since 1.5.4 every passive word was stripped of decoration until hovered, which made pitch underlines flicker in on hover and vanish on mouse-out across link-heavy sites; the bare-until-hover treatment now applies only to real chrome (buttons, tabs, menus, nav links, compact controls the scanner marks, and YouTube chip/renderer chrome).
- Annotated words now wrap with overflow-wrap break-word instead of anywhere, so flex/grid/table cells sized by min-content no longer collapse annotated mixed-script text into one-character-per-line stacks, while keeping identical emergency wrapping in constrained boxes.
- Added a passive-decoration browser smoke (npm run smoke:passive-decoration) that locks in: content links keep underline and furigana at rest and after hover-away, while nav/button chrome stays bare until hover.

## [1.6.0] - 2026-07-02

### Added

- Made fully local parsing the default parsing source for new installs: with term dictionaries imported, text parsing (segmentation, deinflection, furigana, pitch) runs against local Yomitan dictionaries without contacting Jiten or JPDB, working offline and skipping remote parse latency. A new Settings → Sources → Parsing control switches between Local dictionaries (offline) and the Jiten/JPDB APIs. Existing installs keep API-first parsing until they opt in, so provider-backed word colors and known states do not change underneath them.
- Added an Offline setup step to the onboarding welcome screen (checked by default) that downloads Jitendex and Kanjium pitch accents in the background, so local parsing, definitions, furigana, and pitch colors work out of the box without an API key. Already-imported dictionaries are detected and skipped, and failures leave a toast pointing at Settings → Sources for retry.

## [1.5.22] - 2026-07-02

### Fixed

- The YouTube hidden-video notice now dismisses itself after 10 seconds instead of sitting over the feed until "Hide notice" is tapped; it still reappears on the next route so the filter stays discoverable.
- Hardened the notice pill's mobile layout: pinned text size against mobile font inflation (which pushed the "Hide notice" button outside the pill), let the action buttons wrap inside the container, and gave them comfortable touch heights.

## [1.5.21] - 2026-07-02

### Changed

- Treats words inside real links as passive lookup targets: clicking or tapping a link now navigates it, with the dictionary popover available on hover (or modifier+click) on desktop.
- Adds a stationary long-press (~450ms) lookup for link words on touch devices, which opens the popover and suppresses the link navigation and native context menu for that gesture, so mobile lookup stays available without hijacking taps.

## [1.5.20] - 2026-07-02

### Added

- Batch Mine candidates in the subtitle sidebar can now be graded immediately from each row or batch-graded with the active review scale, including two-button Pass/Fail review setups.

### Fixed

- Keeps the Batch Mine header and controls in the sticky top area of the mobile subtitle drawer, so the scan/add/copy/review controls no longer overlap the first mined words on YouTube.

## [1.5.19] - 2026-07-02

### Fixed

- Recognises JapanesePod101 `audiomp3.php` URLs as playable audio when parsing hosted/custom JSON audio sources. Without this the 1.5.18 hosted fallback URL was silently discarded by the client's likely-audio-URL filter, so hosted-source playback still produced no candidates.

## [1.5.18] - 2026-07-02

### Fixed

- Restored word audio when the Yomu-hosted ("Ultimate") source is the only enabled audio source. The 1.5 default flip to hosted-only audio shipped while the hosted bucket held just 11 seeded words, so nearly every popover play ended in `No playable audio found` with an empty error list (the settings demo kept working because its preview word, 読む, was one of the 11). The hosted audio Worker now falls back to the matching JapanesePod101 clip URL for any word missing from the R2 manifest — the Worker cannot vet the clip itself because JapanesePod101's CDN rejects Cloudflare Worker requests, so the client filters that endpoint's fixed "not available" placeholder clip instead, now on every source type by forcing JapanesePod101 URLs through the blob playback path.
- Audio sources that produce zero candidates now record a per-source diagnostic, so `No playable audio found` reports which sources came up empty instead of an empty `errors` list.
## [1.5.17] - 2026-07-02

### Fixed

- Keeps vertical BookWalker OCR hover targets anchored to the OCR box instead of expanding their Y position from rendered ruby/pitch markup, fixing the case where X alignment was correct but the active text strip appeared too high or low.
- Repositions existing BookWalker reader OCR on scroll without kicking the broad page-image scanner, reducing repeated scanning and layout churn while moving through a page.
- Caches BookWalker clean mirror source bitmaps by canonical asset URL so retrying or repositioning a page can reuse the already-fetched image instead of re-requesting expired signed URLs and falling into intermittent `Could not read text` failures.

## [1.5.16] - 2026-07-01

### Fixed

- Recomputes BookWalker OCR hit-target placement immediately after hover/focus expands ruby or pitch markup, fixing the case where the X hit column was correct but the active text strip appeared at the wrong Y position.
- Clips BookWalker manual/visible-region OCR captures to the actual reader viewport instead of the full browser window, fixing Y-only overlay drift when the viewer toolbar covers the top of the canvas.
- Keeps manually cropped BookWalker OCR frames aligned during ordinary scroll without rescanning, while re-capturing them when the underlying canvas scale changes so old crop coordinates are not stretched over a reflowed page.
- Drops stale BookWalker vertical-scroll OCR frames when the painted page content changes inside a reused stable canvas surface, preventing previous-page OCR from surviving after BookWalker repaints.

## [1.5.14] - 2026-07-01

### Fixed

- Re-captures ready BookWalker OCR frames after viewer zoom/reflow so hover hit targets do not keep a stale vertical coordinate map while the page is resized.
- Treats parsed BookWalker OCR frames as ready for reflow recapture even if the status pill was replaced, fixing Y-axis hover drift after zoom or viewer rerender.
- Clears offscreen failed BookWalker scan pills together with their pending capture state, preventing repeated Scanning/Could not read text churn from blocking a clean retry.

## [1.5.13] - 2026-07-01

### Fixed

- Keeps OCR image hit targets visually passive during pointer focus and text selection, so recognized manga text only appears on hover, keyboard focus, or explicit tap pinning instead of staying painted over BookWalker pages.

## [1.5.12] - 2026-07-01

### Fixed

- Keeps automatic BookWalker Firefox OCR aligned to the full page canvas while scrolling, instead of shrinking full-page OCR coordinates into the visible crop and re-scanning the same page on every half-screen movement.
- Keeps settled BookWalker OCR frames mounted through same-page scroll and size drift, so vertical readers do not replace a ready page with a fresh failed scan while the user moves around the page.
- Adds the Google Search and hosted Yomu data hosts used by OCR/study fallbacks to userscript connection metadata, preventing Firefox/Tampermonkey from pausing BookWalker OCR behind cross-origin permission prompts.

## [1.5.8] - 2026-07-01

### Fixed

- Re-scans tall/zoomed BookWalker canvases when the visible crop moves to a new half-screen bucket, so continuous scroll pages no longer keep stale OCR text from the previous visible slice while still avoiding per-pixel rescans.

## [1.5.7] - 2026-07-01

### Fixed

- Stopped BookWalker storefront/product pages from auto-OCRing cover art and carousel images when native page text is already available, preventing Yomu from stretching card grids, sidebars, and login/product panels.
- Kept OCR text overlays hidden until the user hovers or focuses OCR hit targets, including automatic reader-raster OCR, so recognized text no longer remains visibly painted over pages.
- Stabilized BookWalker Firefox canvas OCR across DOM swaps and same-page scrolling by reusing completed OCR frames for equivalent canvases, dropping stale status pills when the painted page changes, and keeping capped empty/failed pages terminal until the user retries.
- Reduced BookWalker continuous/vertical scroll lag by scanning the dominant visible page surface instead of repeatedly OCRing previous-page slivers during scroll.
- Kept tapped partial-page OCR retry regions aligned through BookWalker scroll and zoom changes instead of discarding and rescanning them.
- Declared the Jiten, JPDB, Google Lens, and BookWalker image hosts explicitly in userscript metadata so Firefox/Tampermonkey upgrades do not pause OCR behind repeated cross-origin prompts.

## [1.5.6] - 2026-07-01

### Fixed

- Reworked Study settings spacing so review source controls, toggles, and the reorderable study-step list align with the rest of the settings panels on desktop and mobile.
- Kept parsed settings tabs and action buttons visible and clickable while preserving Japanese ruby/pitch enhancement.

## [1.5.5] - 2026-07-01

### Fixed

- Kept video subtitle panel controls visible after transcript scans by letting rail and drawer actions wrap instead of clipping inside narrow panels.
- Blurred the Shadow mode native/English translation until learners reveal it, matching the overlay translation reveal behavior.
- Made Shadow Record and Play yours line-aware: recording pauses the source video, auto-stops near the subtitle duration, restarts playback cleanly, and clears the take when moving to another line.
- Added a Shadow auto-pause toggle so sentence-by-sentence practice can pause automatically after each subtitle cue.

## [1.5.4] - 2026-07-01

### Fixed

- Kept passive page annotations layout-neutral by default so BookWalker and other storefront cards, carousels, sidebars, and compact controls stay lookupable without Yomu changing wrapping, sizing, or permanent highlights.
- Stabilized BookWalker continuous/vertical OCR so capped empty scans stop re-running until the user retries, same-page scroll keeps the current OCR state, and the mostly visible page is scanned ahead of tiny previous-page slivers.
- Kept BookWalker OCR provider failures terminal until the user retries, preventing repeated scrolling from flashing between Scanning and Could not read text on the same page.
- Kept automatic reader-raster OCR text hidden until hover/focus, while adding a Scan again retry affordance to BookWalker canvas status pills and recapturing only useful ready pages after zoom changes.
- Declared BookWalker viewer and image CDN access explicitly in the userscript metadata so Firefox/Tampermonkey reinstalls do not prompt on every signed page image.

## [1.5.3] - 2026-06-30

### Fixed

- Streamlined Study/New Tab into one merged review flow with kanji, word, recall, listen, speak, and final reveal steps, plus cleaner provider grading, speaker audio controls, final-only dictionary reveal, and improved offline/provider smoke coverage.
- Fixed Bunpro API-page token import on SPA navigation and made the helper retry token reads without requiring users to inspect cookies manually.
- Kept the hosted video subtitle panel open as an upload surface before a video is detected, so the Subtitles button exposes the manual Japanese/native subtitle loaders instead of bouncing users back to the file picker.
- Fixed manual subtitle uploads from mobile/iPad file pickers by accepting common subtitle MIME types, allowing multi-file selection, and keeping the hidden input alive until .ass, .ssa, .srt, and .vtt reads finish.
- Mirrored Netflix-style DOM captions while the subtitle panel is open, even when the persistent subtitle overlay is off.

## [1.5.2] - 2026-06-30

### Fixed

- Kept the homepage hero action pills on one row by removing VitePress' extra action padding, preventing text wrapping inside pills, and letting narrow screens scroll the row without widening the page.

## [1.5.1] - 2026-06-30

### Fixed

- Merged the BookWalker Firefox OCR repair so tainted reader canvases can replay reused source buffers, recover late source-image records, and keep continuous/vertical scrolling from getting stuck on the first page.
- Split wide non-continuous BookWalker spreads into per-page OCR passes and versioned their OCR cache keys so sparse old single-pass spread results are not reused after page turns.
- Kept BookWalker reader chrome/settings text lookupable with passive annotations while preserving compact controls, and kept storefront annotations contained so product/carousel/sidebar layout is not resized by Yomu.

## [1.5.0] - 2026-06-29

### Added

- Added the merged visual Study flow with reorderable/skippable kanji drawing, word meaning, cloze recall, listening, speaking, reveal, and final grading steps.
- Added local-first Yomu SRS, Bunpro queue/mining/lookups, study stats, SRS import groundwork, and local queued grading for users without connected accounts.
- Added Yomu-hosted audio/support worker scaffolding, donation budget status UI, and hosted audio as the first default audio source.

### Changed

- Consolidated Study/New Tab settings into a dedicated Study tab and kept no-account learners unblocked by default.
- Simplified review UI by moving frequency into dictionary pills, replacing the large replay button with a speaker control, and removing redundant listen prompts/buttons.

### Fixed

- Made Yomu Gaming in-place OCR words readable over captured screens while keeping the detached OCR result panel out of the main flow.
- Hardened proxy fetch rules and factory reset coverage so account, source, pill, and local SRS settings are reset consistently.

## [1.4.246] - 2026-06-29

### Fixed

- Derived OCR and Immersion Kit image-caption backgrounds from the user's accent color while keeping the rendered backdrop readable with white OCR/caption text.

## [1.4.245] - 2026-06-29

### Changed

- Simplified the Batch Mine panel on video subtitles: the idle panel now shows only the Scan action, review actions appear after candidates are found, compact drawer controls scroll cleanly inside narrow side panels, and the redundant rail Tracks shortcut hides while the side panel already exposes a Tracks tab.

## [1.4.244] - 2026-06-29

### Fixed

- Removed the Study menu's Local Audio trailing slash so local and published link checks resolve to the page instead of a docs 404.

## [1.4.242] - 2026-06-29

### Added

- Added a Batch Mine tab to the video subtitle side panel. It scans the loaded transcript, compares parsed words against existing Jiten/JPDB/Anki states, ranks i+1 candidates first, preselects useful not-in-deck words, and lets you add or copy the selected batch after watching.

## [1.4.241] - 2026-06-29

### Fixed

- Re-published the hosted overflow menu and New Tab caption readability release after syncing the video player smoke check with the current drop-video-plus-subtitles copy.
- Pointed hosted PDF Reader menu/docs links at the explicit index.html route so local and published link checks resolve to the reader instead of a docs 404.

## [1.4.240] - 2026-06-29

### Fixed

- Matched the Study, PDF Reader, and Video Player overflow menus to the homepage menu, including compact ellipsis styling, localized labels, and the same working tool/support links.
- Kept New Tab Immersion Kit image captions in white caption text with the video-style fallback/shadow treatment in light mode, matching the readable dark-mode and popup implementations.

## [1.4.239] - 2026-06-29

### Fixed

- Restored settings saved under previous storage keys during update/reinstall recovery, including theme and accent color, while preserving any newer settings already changed after the update.

## [1.4.238] - 2026-06-29

### Fixed

- Fixed the study mode tab row so all six study tabs including Listen fit on one row instead of pushing the Listen tab onto a second line.

## [1.4.237] - 2026-06-29

### Fixed

- Made the YouTube subtitle Tracks tab open and resize smoothly on videos with many auto-translated caption tracks by rendering only the rows in view.

## [1.4.236] - 2026-06-29

### Changed

- Removed the note that said nothing uploads from the video player start screen in English and Japanese.

## [1.4.235] - 2026-06-29

### Added

- Added a session stats panel to Listen mode that shows how many pitch items are due and your accuracy for each pitch pattern, and ordered the Listen queue to review due items first.

## [1.4.234] - 2026-06-29

### Fixed

- Kept the new tab study mode switcher on a single row that fits evenly across the available width on phones, tablets, and desktop, instead of wrapping the last tab onto its own line or scrolling it out of view.

## [1.4.233] - 2026-06-29

### Added

- Added a Listen pitch-accent mode to the Study page with Perceive, Recall, and Shadow practice over a local spaced-repetition deck that grows automatically from the words you review.
- Added an audio-first downstep picker that plays a word and asks which pitch pattern you heard, and replays both words of a minimal pair when you miss.
- Added optional local microphone recording and playback to Shadow practice so you can compare your pronunciation with the model without uploading any audio.

## [1.4.232] - 2026-06-29

### Fixed

- Rendered Jiten vocabulary-detail pitch accents in the popup header graph instead of dropping them after the Jiten detail lookup.

## [1.4.231] - 2026-06-29

### Fixed

- Restored mobile YouTube subtitle control parity by keeping Play/Pause visible while the side panel is open during playback, adding a direct Tracks shortcut to the rail, and keeping Lines, Shadow, Tracks, navigation, placement, and Auto controls compact in one accessible drawer row.
- Improved narrow mobile subtitle wrapping with balanced overlay lines and tidier transcript/shadow wrapping.
- Let keyless YouTube subtitle pre-rendering fetch urgent public JPDB pitch accents outside the shared background page budget, so live-video pitch colors can arrive before the word is tapped.
- Kept YouTube homepage section headings and feed title mirrors from clipping or overlapping when furigana makes the rendered mirror taller than YouTube's original text row.

## [1.4.230] - 2026-06-29

### Fixed

- Fixed Yomu Gaming so full-screen and area captures render recognized Japanese in place over the frozen screen instead of opening the old detached OCR panel.
- Kept the Gaming lookup flow secure and native-feeling by moving dictionary lookup back through the Electron main process, preserving renderer sandboxing, and opening a compact in-place lookup popover from invisible OCR line targets.
- Guarded broken stdout/stderr pipes in the packaged app so launching Yomu Gaming from a closed terminal or external process does not crash with `write EPIPE`.
- Made paused-frame OCR overlays on dark video surfaces lighter and more readable by replacing the opaque accent block with a translucent caption-style treatment, visible keyboard focus, and Enter/Space activation for OCR line targets.

## [1.4.229] - 2026-06-29

### Fixed

- Made the YouTube subtitle drawer open and resize smoothly on videos with many auto-translated caption tracks by skipping layout for off-screen track rows.

## [1.4.228] - 2026-06-29

### Added

- Added previous and next context lines to the YouTube shadowing drawer, each tappable to move shadowing practice onto that line.
- Added local microphone self-recording and playback to the YouTube shadowing drawer so you can compare your pronunciation with the model without uploading any audio.

### Fixed

- Fixed the YouTube shadowing drawer loop control so it repeats the focused line reliably instead of playing on to the next one.
- Fixed the YouTube shadowing drawer hide control so a hidden line is fully blurred over its word highlights instead of staying readable.

## [1.4.227] - 2026-06-29

### Added

- Added Recall mode to the Study page: it shows the meaning first, accepts typed or Apple Pencil/Scribble Japanese answers, then reveals the word before submitting the user's chosen JPDB, Jiten, or Anki review grade.

### Changed

- Added browser smoke coverage for Recall reviews across JPDB, Jiten, and AnkiConnect, including empty-answer, reading-accepted, wrong-answer, and provider payload checks.

## [1.4.226] - 2026-06-29

### Fixed

- Fixed the Yomu Gaming release workflow so CI prepares the Electron runtime before smoke-testing packaged desktop builds.

## [1.4.225] - 2026-06-29

### Added

- Added a Shadow tab to the YouTube subtitle drawer with current-line replay, cue looping, hide/reveal text, parsed Japanese, and secondary subtitle support for speaking practice.

## [1.4.224] - 2026-06-29

### Fixed

- Stabilized Yomu Video on YouTube and embedded demos: fullscreen now rehosts subtitles and controls immediately on desktop, iPad, and phone; the sidebar no longer stretches the player or leaves the control rail stuck; and subtitle settings stay open while sliders and toggles are used.
- Kept YouTube subtitle sizing more consistent across short and long captions, hid subtitle overlays once the video has scrolled out of view, and made the subtitle panel's current-line tracking and jump-back behavior less fragile.
- Fixed Study/newtab audio replay and reverse-side context so word/kanji backing audio uses the right card, repeated speaker clicks play reliably, and furigana, pitch, and frequency details stay available without the extra lookup card clutter.
- Hardened generic page scanning around compact controls and app chrome so search boxes, Discord-style names, Wikibooks controls, BookWalker galleries, and composer help text stay readable and do not get pushed out by ruby or highlights.
- Rechecked BookWalker and Yomu PDF smoke coverage for spread/continuous manga modes, stale OCR prevention, text-backed PDFs, and scanned PDFs using readable OCR targets instead of dense unreadable PDF text overlays.
- Made Yomu Gaming's first-party desktop app default to browser image OCR, open as a full-size Yomu settings experience, and ship through the release workflow with Linux AppImage, Windows portable, and macOS zip artifacts.

## [1.4.223] - 2026-06-29

### Fixed

- Made Yomu PDF detect image-backed scanned pages with embedded/invisible OCR text and show readable in-place OCR line targets instead of dense word overlays, while keeping real text PDFs on the selectable PDF text layer.
- Tightened the generic layout guard so compact app controls, storefront cards, carousels, and composer mirrors stay lookupable without furigana or highlight styling pushing page UI out of place.
- Kept Yomu Gaming on the browser image-OCR default and left local OCR as an advanced opt-in path, so the desktop app no longer opens with a tiny forced localhost endpoint as the main setup.

## [1.4.222] - 2026-06-29

### Fixed

- Kept BookWalker-style storefront, gallery, and compact media card text lookupable without letting Yomu highlights or furigana resize carousels, cards, or side login panels.
- Restored cleaner Study reverse-side word context for Jiten kanji cards: backing words now show inline furigana and the audio button, and Immersion Kit audio replay works on every speaker click.

## [1.4.221] - 2026-06-29

### Fixed

- Removed the experimental subtitle Shadow drawer from the release branch so Yomu Video stays lean and publishable.

## [1.4.220] - 2026-06-29

### Added

- Made study reviews work fully offline: every due card is warmed into the cache up front, grades are queued locally and sync back automatically when you reconnect, and a cached-card count plus a sync status now sit next to the session timer.

### Changed

- Cleaned up the study card front: the audio button now sits inline next to the word, the headword block is centered, the source pills are hidden on the front (they stay in the lookup view), and the landscape layout on iPad is tidier.

## [1.4.219] - 2026-06-28

### Fixed

- Suppressed furigana on compact stacked app notices and helper rows that sit above action chips, including mobile YouTube AI question prompts, while keeping readable prose and media titles annotated. This keeps ruby from overlapping nearby controls on narrow layouts.

## [1.4.218] - 2026-06-28

### Fixed

- Made YomuYomu lesson support native-first: よむ now leaves the site's canvas reader, translation panel, and reading controls visible, uses an invisible passive lookup layer over the canvas fallback text, and lets clicks continue to YomuYomu while still opening よむ lookups.

## [1.4.217] - 2026-06-28

### Fixed

- Kept a number bound to the counter or unit that follows it when Japanese text wraps, so labels such as the Google video key-moments row no longer leave a digit stranded at the end of a line.

## [1.4.216] - 2026-06-28

### Fixed

- Fixed surrounding words disappearing when a block that mixes non-Japanese prose with an inline CJK run is annotated on framework-managed sites such as React, Vue, Svelte, and custom-element apps like Reddit, where the page overlay now keeps the full host text visible instead of only the scanned CJK fragment.

## [1.4.215] - 2026-06-28

### Fixed

- Loaded pitch accent for Jiten-only and no-API-key users. The public pitch source needs no API key, but three paths — study and search word pitch, the lookup-card pitch graph, and reading-view pitch enrichment — had hidden it behind a JPDB key, so Jiten and keyless study sessions showed no pitch. It now loads from the keyless source whenever pitch accent is turned on.

### Changed

- Merged the live Jiten/JPDB site frequency rank inline into the matching lookup pill (e.g. "Jiten #18447") instead of a separate "Jiten live" pill, controlled by a new "Show site frequency in pills" setting that is on by default. The JPDB frequency rank now shows by default too.

## [1.4.214] - 2026-06-28

### Fixed

- Stopped surrounding text from vanishing when a mixed-script block (non-Japanese prose with an inline CJK run, e.g. an English Reddit comment quoting 中文) is annotated on a framework-managed app shell (React/Vue/Angular/Svelte/Next/Nuxt/Astro and custom-element apps such as Reddit's shreddit). Such sites render non-destructively via an overlay mirror that hides the whole host element; the scan only targets the CJK-bearing text node, so the mirror used to show just that fragment and hide every surrounding English word and inline link. The mirror now reproduces the host's complete text — remapping the scanned tokens into it — so nothing disappears while furigana still lands on the Japanese.

## [1.4.213] - 2026-06-28

### Fixed

- Recovered BookWalker Firefox OCR when a page-image mirror fetch stalls: pending canvas captures now time out, stale async captures cannot suppress newer retries, and the same visible manga page retries without needing a refresh.
- Kept BookWalker canvas scan status visible when capture attempts exhaust, so the indicator no longer silently disappears while the next poll remains able to recover.

## [1.4.212] - 2026-06-28

### Fixed

- Kept a number welded to the counter or unit that follows it so labels such as Google's "この動画の7件の重要なパート" no longer wrap with the digit stranded at the end of a line ("…の7" / "件の…"). A zero-width word joiner now binds a trailing number to the next reader word.

## [1.4.211] - 2026-06-28

### Fixed

- Restored bounded public pitch hydration for keyless generic pages such as Google results, so fallback words can pick up Jiten pitch coloring before they are selected.

## [1.4.210] - 2026-06-28

### Fixed

- Aligned local-dictionary furigana to the specific kanji inside kana-suffixed words such as 質問する, so mixed terms render as 質[しつ]問[もん]する instead of centering the reading over the whole word.

## [1.4.209] - 2026-06-28

### Fixed

- Uploaded the Yomu Gaming Linux AppImage from the release workflow using electron-builder's `linux-x86_64` artifact name, and updated the download docs to match.

## [1.4.208] - 2026-06-28

### Fixed

- Built Yomu Gaming release packages without rerunning the smoke outside xvfb, keeping the explicit xvfb smoke gate before packaging.

## [1.4.207] - 2026-06-28

### Fixed

- Removed the duplicate study-answer dictionary card on New Tab review words and kept reading, pitch, frequency, dictionary links, and audio in the compact prompt tool row.
- Restored local-dictionary furigana and pitch recovery for New Tab study prompts such as 映画, 図鑑, and 混浴, while preserving clean fallback when pitch is unavailable.
- Fixed Jiten text-to-speech and localhost local-audio playback so GM-capable requests avoid the public proxy/CORS path, and replay clicks restart native audio instead of falling through to browser TTS too early.
- Stopped New Tab reveal from repeating the same front sentence above Immersion Kit examples, so the prompt stays focused on the word and compact tools.

## [1.4.206] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.
- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Verified Electron's runtime executable before the Yomu Gaming smoke and release packaging, then downloaded the Electron runtime with curl, checked its SHA-256, and extracted it synchronously when GitHub Actions left a stale or skipped binary behind.
- Launched the Yomu Gaming smoke with Linux Electron sandbox flags under GitHub Actions so xvfb release runners can start the desktop app.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.205] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.
- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Verified Electron's runtime executable before the Yomu Gaming smoke and release packaging, then downloaded the Electron runtime with curl, checked its SHA-256, and extracted it synchronously when GitHub Actions left a stale or skipped binary behind.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.204] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.
- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Verified Electron's runtime executable before the Yomu Gaming smoke and release packaging, then downloaded the Electron runtime with curl, checked its SHA-256, and extracted it synchronously when GitHub Actions left a stale or skipped binary behind.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.203] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.
- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Verified Electron's runtime executable before the Yomu Gaming smoke and release packaging, then directly downloaded and extracted the Electron runtime when GitHub Actions left a stale or skipped binary behind.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.202] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.
- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Verified Electron's runtime executable before the Yomu Gaming smoke and release packaging, then directly downloaded and extracted the Electron runtime when GitHub Actions left a stale or skipped binary behind.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.201] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.
- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Kept OCR status cards and overlays aligned to canvas/background raster sources when reader pages mirror images through a different visible surface.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Verified Electron's runtime executable before the Yomu Gaming smoke and release packaging, retrying one clean runtime install when GitHub Actions leaves a stale or skipped Electron binary behind.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.200] - 2026-06-28

### Fixed

- Stabilized BookWalker continuous/vertical Firefox OCR while mirror records are still warming up: persistent `wideScreen` canvases now keep a per-surface identity instead of falling back to the global mirror epoch, and late-arriving mirrored source images are still associated with the visible page so the scanning pill can settle to a usable OCR layer after scroll/page-turn/refocus churn.

## [1.4.199] - 2026-06-28

### Fixed

- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Installed Electron directly before the Yomu Gaming smoke so GitHub Actions release runners have the Electron runtime binary before launching and packaging the desktop app.
- Kept the Yomu Gaming artifact workflow from racing the main release publisher, so userscript and browser-extension release assets land before the desktop downloads attach.

## [1.4.198] - 2026-06-28

### Fixed

- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.
- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.
- Fixed the Yomu Gaming desktop artifact workflow to rebuild Electron through npm before smoke testing, so GitHub Actions installs the Electron runtime binary before packaging AppImage, Windows, and macOS downloads.

## [1.4.197] - 2026-06-28

### Fixed

- Fixed the Yomu Gaming onboarding page-scan controls and release asset checksum job so Manual mode persists through the current settings form and desktop downloads publish to GitHub Releases.

## [1.4.196] - 2026-06-28

### Fixed

- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.
- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.
- Fixed the hosted PDF Reader's initial page navigation state so multi-page PDFs enable Next/Previous immediately after opening, and hardened the scanned-PDF smoke around deterministic page-turn OCR checks.

## [1.4.195] - 2026-06-28

### Fixed

- Smoothed the YouTube transcript sidebar so the green current-line highlight no longer flickers when playback advances between lines on long transcripts; the virtualized list now keeps its window steady while auto-following instead of re-rendering and recreating the highlighted row each line.

## [1.4.194] - 2026-06-28

### Fixed

- Collapsed the Help tab's long AnkiConnect setup guidance behind an accessible disclosure so the Help section stays compact until setup details are needed.
- Moved Help's current version, latest-version check, duplicate-script status, and update link into a compact top strip with shorter copy.
- Repaired Study/Newtab reveal so the answer keeps furigana, pitch, frequency, dictionary links, and the study audio button inline without rendering the old duplicate lookup card; local audio clips play/restart without localhost fetch/CORS spam, and optional lookup failures keep their debug logging without surfacing noisy console errors.

## [1.4.193] - 2026-06-28

### Fixed

- Fixed the Yomu Gaming desktop artifact workflow to build and package release downloads without depending on a hosted-runner Electron binary launch, which keeps AppImage, Windows, and macOS artifact publishing aligned with the local Electron smoke test.

## [1.4.192] - 2026-06-28

### Fixed

- Fixed the Yomu Gaming desktop artifact workflow to rebuild Electron through npm before smoke testing, so GitHub Actions installs the Electron runtime binary before packaging AppImage, Windows, and macOS downloads.

## [1.4.191] - 2026-06-28

### Fixed

- Fixed the Yomu Gaming release gates so CI recognizes the Electron app entrypoints and the desktop artifact workflow verifies Electron before smoke testing and packaging release downloads.

## [1.4.190] - 2026-06-28

### Fixed

- Kept Yomu annotations from breaking compact controls, composer/editable placeholders, and carousel/card layouts by skipping placeholder-like surfaces, suppressing ruby in constrained chrome, and preserving native form-control text.
- Added regression coverage for ChatGPT/Claude-like composers, account-picker controls, form placeholders, visible-page scanning, and BookWalker-style carousel overflow.

## [1.4.180] - 2026-06-28

### Fixed

- Extended the Japanese site-language redirect to rewrite existing generic English locale query hints, so multilingual sites that use `locale`, `language`, `region`, `mkt`, or similar parameters request Japanese without needing a site-specific rule.

## [1.4.179] - 2026-06-28

### Fixed

- Fixed BookWalker single-viewport vertical reading (cty=2) where OCR re-scanned on every small scroll and never settled past the first page: scroll position and mirror-epoch churn no longer count as a page turn, so the OCR overlay and its hover lookup survive within-page scrolling while genuine page turns still re-OCR the new page.

## [1.4.178] - 2026-06-28

### Added

- Added the first-party Yomu Gaming desktop app with branded onboarding/settings, configurable whole-screen capture shortcuts, optional area capture, local OCR handoff, in-place OCR overlay lookup, smoke coverage, packaging scripts, and a GitHub Actions workflow for release artifacts.

### Changed

- Replaced the public third-party gaming guide and public ADR/comparison pages with first-party Yomu Gaming install docs and guarded docs builds so public pages do not publish internal strategy or competitor-first app guidance.

### Fixed

- Kept compact control text and passive footer/navigation links eligible for safe lookup while continuing to skip editable composer surfaces during visible-page scans.

## [1.4.177] - 2026-06-28

### Fixed

- Repaired scanned/image-backed PDFs in the hosted PDF reader so broken embedded OCR text layers are hidden, Yomu image OCR is used for lookup, and passive OCR text/furigana stay invisible until hover or focus.

## [1.4.176] - 2026-06-28

### Fixed

- Sized the YouTube transcript "jump to current line" button to match the other subtitle panel toolbar buttons under touch/coarse-pointer and narrow layouts (e.g. iPad), where it was rendering noticeably smaller than its neighbours. It still collapses away while auto-follow is active.

## [1.4.175] - 2026-06-28

### Fixed

- Kept generated page-word highlights light on NHK Easy and other bright pages while still measuring them for readable text contrast, so hover no longer appears to fix an overly dark normal highlight.
- Let active scanned page text wrap normally in narrow prose, card, and sidebar containers while keeping passive controls and text mirrors on their compact wrapping rules.

## [1.4.174] - 2026-06-28

### Fixed

- Fixed YouTube subtitle side-panel resizing so left-docked panels reserve space immediately, the video frame shrinks with the panel instead of being overlaid, and transcript current-line/programmatic scrolling no longer disables auto-follow.
- Reduced YouTube transcript lookup churn by enriching subtitle parse batches together before rendering rows, so furigana, pitch, and word status apply line-by-line instead of trickling in word-by-word.
- Kept paused-frame OCR hitboxes above YouTube's native control strip so native controls remain usable while OCR is visible.
- Fixed Jiten/dictionary furigana rendering so ruby readings align to their matching kanji instead of spanning the whole referenced word.
- Kept BookWalker and other reader-raster OCR status accurate while canvas captures prepare, and handed the scanning pill off to the ready OCR layer without leaving stale loading UI.
- Kept automatic dark-mode OCR word highlights accent-tinted by default, avoiding the unreadable white-text-on-light-highlight combination while preserving the custom color option.

## [1.4.173] - 2026-06-28

### Fixed

- Treated image-backed PDF OCR text layers as scanned pages, hiding the broken embedded text layer and routing lookup through Yomu image OCR without visible passive overlays.

## [1.4.172] - 2026-06-28

### Fixed

- Published the Reddit Japanese locale fix with the OCR release regression focused on rendered text instead of runner-specific provider timing.
- Fixed BookWalker raster OCR rescans on real reader pages by auto-scanning canvas-only viewers, dropping poisoned empty raster cache entries, retrying transient empty captures, reporting OCR transport failures as failures, and releasing collapsed recycled canvases instead of leaving stale Text ready or No text found pills.

## [1.4.171] - 2026-06-28

### Fixed

- Published the Reddit Japanese locale fix with a deterministic OCR release regression test across CI runners.

## [1.4.170] - 2026-06-28

### Fixed

- Published the Reddit Japanese locale fix after hardening the release OCR regression test against jsdom image-load timing.

## [1.4.169] - 2026-06-28

### Fixed

- Fixed the docs navbar overflow ("…") menu showing a stray "GitHub" text label next to both the GitHub and Discord icons. The social links are now rendered icon-only, as two separate, evenly spaced links.

## [1.4.168] - 2026-06-28

### Fixed

- Released the Reddit Japanese site-language fix on a fresh version, using Reddit's working Japanese locale URL hint instead of the stripped translation hint.

## [1.4.167] - 2026-06-28

### Fixed

- Fixed BookWalker continuous/vertical (`cty=2`) OCR leaving empty overlays — no hover/tap lookup — and dropping OCR after the window was defocused and refocused. The tainted DRM page canvases keyed their per-page identity on a single global mirror epoch that churns on every composite, so each asynchronous page capture was invalidated before it could land and every epoch tick read as a page turn that wiped the overlay. Each tainted page canvas now derives its own stable source-image fingerprint, so captures land and overlays survive the churn while genuine page turns still refresh.

## [1.4.166] - 2026-06-28

### Fixed

- Replaced Reddit's stripped Japanese translation URL hint with Reddit's working Japanese locale URL hint, so the Japanese site-language preference can load Reddit's Japanese shell instead of normalizing back to the English feed URL.

## [1.4.164] - 2026-06-28

### Fixed

- Stabilized BookWalker manga OCR in normal and continuous-scroll modes by ignoring hidden canvas buffers, fingerprinting the whole visible page instead of one corner, keeping readiness through equivalent canvas swaps, and preserving the current OCR layer/status through same-page blank or hidden-buffer flicker.

## [1.4.161] - 2026-06-27

### Fixed

- Hover lookup now follows a moving mouse pointer across parsed words instead of restarting the open delay on every word, so the popup opens without requiring the cursor to stop.

## [1.4.160] - 2026-06-27

### Fixed

- Kept Reddit's web-component app shell on non-destructive page-text mirrors, so scrolling feeds and sidebars keep their native DOM while Yomu annotations remain visible.
- Added Reddit's Japanese translation parameter to the Japanese site-language preference.

## [1.4.159] - 2026-06-27

### Fixed

- Fixed hosted Japanese localization coverage for the homepage hero, Read CTA, support cards, updated game-text metadata, media labels, and latest release notes.

## [1.4.158] - 2026-06-27

### Fixed

- Fixed Discord and other modern dark app shells whose computed colors use OKLab, so Yomu uses the real dark surface instead of falling back to white and turning passive highlights or text black.

## [1.4.157] - 2026-06-27

### Fixed

- Fixed same-tab Google Drive authorization on Chrome by returning the OAuth token through the URL fragment instead of window.name, so Sync and Restore resume after Google sign-in.

## [1.4.156] - 2026-06-27

### Fixed

- Refreshed fast reader popups after fallback words resolve through the API, so first-load lookups immediately show JPDB/Jiten status and pitch accent details instead of needing repeated taps.
- Preserved kanji popup back navigation when dictionary lookup links wrap an already parsed Yomu word.

## [1.4.155] - 2026-06-27

### Fixed

- Reworked Google Drive settings sync/restore in userscript contexts to use same-tab OAuth redirects instead of popups, with automatic resume after returning from Google.

## [1.4.154] - 2026-06-27

### Fixed

- Kept BookWalker product and storefront text native while adding passive lookup spans, so enabling Yomu no longer hides titles, descriptions, cart buttons, registration cards, or sidebar text behind broken mirrors.
- Kept BookWalker reader OCR status pills visible after a page finishes scanning, removing the Scanning → disappear → reappear flicker while the OCR layer is still current.
- Reduced common BookWalker manga page scans to one OCR provider request when the normal pass already found text, while still retrying the inverted dark-panel pass for empty pages.

## [1.4.153] - 2026-06-27

### Fixed

- Aligned review grading shortcuts in Settings > Shortcuts so grade controls start together instead of sharing the row with Study navigation keys.

## [1.4.152] - 2026-06-27

### Fixed

- Restored continuous side-panel resizing for Yomu Video and YouTube subtitles: hosted videos now use the generic video inset again, while YouTube stable side panels can grow past existing free space by shrinking the player width during resize.

## [1.4.151] - 2026-06-27

### Fixed

- Kept the settings puck clickable when it overlaps the YouTube/Yomu Video transcript side panel.

## [1.4.150] - 2026-06-27

### Fixed

- Contained BookWalker storefront annotations in passive, ruby-free text mirrors so enabling Yomu no longer shifts homepage carousels, product grids, clamped titles, or sidebar cards.
- Dropped stale OCR status/results when BookWalker swaps a canvas frame to a new page, preventing previous-page “Text ready” overlays from surviving page turns.

## [1.4.149] - 2026-06-27

### Fixed

- Kept signed-in YouTube comment bodies on non-destructive text mirrors so comments remain annotated without inline reader spans, preventing YouTube DOM churn from duplicating or rewriting comment text.
- Guarded early YouTube userscript startup before `document.documentElement`, `document.head`, or `document.body` exists, removing page-load theme/runtime errors during signed-in live/watch smoke runs.

## [1.4.148] - 2026-06-27

### Fixed

- Repaired BookWalker continuous-scroll OCR in Firefox, WebKit, and Chromium so visible vertical pages show scanning/status feedback and ready OCR words stay selectable.
- Kept normal BookWalker page taps working outside OCR text while routing taps on OCR words to lookup instead of page turns.
- Restored BookWalker title and description annotation with furigana and pitch while keeping reader settings/menu controls passive.
- Aligned dictionary furigana for mixed kana/kanji headwords such as `あなた達[たち]`, so kana outside the annotated kanji no longer pulls ruby out of position.
- Kept the default dark-mode OCR word highlight on an accent-tinted background while preserving the explicit dark overlay setting.
- Stabilized YouTube/Yomu Video side-panel resizing and native fullscreen control hit-testing after transcript rows are rendered.

## [1.4.147] - 2026-06-27

### Fixed

- Kept compact media carousels, absolute-positioned slides, product cards, and sidebar cards from growing or overflowing when page annotations render, while normal article text still keeps furigana.
- Collapsed framework formatting whitespace in YouTube owner/subscriber mirrors so channel rows do not gain visible newline gaps during annotation refreshes.
- Rendered JPDB frequency ranks in popup headers as frequency metadata pills instead of bare #rank text, matching lookup pill wrapping, contrast, and accessibility labels.

## [1.4.146] - 2026-06-27

### Changed

- Renamed the root installable docs PWA manifest to visible よむ branding and added the compat live-site smoke command for YomuYomu and current anime player targets.

## [1.4.145] - 2026-06-27

### Fixed

- Study Pass/Fail grading now uses a dedicated two-button mobile layout, so Fail and Pass stay wide, centered, and inside the viewport.
- Revealed Study answers recover kana readings from annotated card text such as `前方[ぜんぽう]`, while keeping the front side unspoiled.
- Hosted/accountless Study search can fetch JPDB public vocabulary pages again, restoring public definitions and keeping recorded audio ahead of browser text-to-speech.
- Study term pitch underlines render through the pseudo underline without stacking native underlines, text shadows, or box shadows.
- Settings now puts the review rating scale directly in Study and clarifies Jiten/JPDB credential separation, provider-scoped Study decks, and AnkiConnect setup/CORS guidance.

## [1.4.144] - 2026-06-27

### Added

- Added a Steam Deck and PC gaming guide that replaces the YomiNinja-only workflow, explains the current PWA/no-install boundary, and compares Decky/native OCR helpers for game text handoff.
- Recorded ADR 0004 for the gaming distribution strategy and the first Gaming Text Bridge contract sketch.

## [1.4.143] - 2026-06-27

### Fixed

- Hid Yomu Video subtitles sooner when the tracked video is mostly scrolled away so captions do not follow the user into comments.
- Kept native/secondary captions on a stable smaller font while Japanese subtitles retain the configured size/readable floor.

## [1.4.142] - 2026-06-27

### Fixed

- Retried active hover audio with the current hover lookup generation so returning to the same hover card keeps real audio eligible instead of treating it as stale duplicate autoplay.
- Shared Apple Pencil/stylus control activation across reader popovers and the hosted Study surface so kanji buttons, links, toggles, and trace controls respond on the first pen tap without duplicate clicks.

## [1.4.141] - 2026-06-27

### Fixed

- Repaired Yomu Video and YouTube subtitle layout regressions: left/right transcript panels now stay flush without covering the player, subtitles stay anchored to the player or hide while scrolling into comments, and fullscreen geometry updates immediately while video is playing.
- Restored direct subtitle height dragging, stabilized subtitle font sizing, added a Reset defaults button to subtitle style controls, and contained style popover pointer events so controls no longer activate subtitles underneath.
- Made the compact subtitle rail buttons consistent and highlighted active fullscreen/zoom state with the accent color.

## [1.4.140] - 2026-06-27

### Added

- Made the docs homepage installable as the root Yomu PWA shell, with offline navigation fallback and shortcuts into Study, Video, PDF, and setup docs.
- Added a YomuYomu reader parser for canvas-backed story pages, using the page's Japanese fallback text to provide popup lookup/mining without fighting the site's own custom reader controls.

### Fixed

- Broadened generic subtitle language inference so Japanese, JP/JPN, native, English, and Japanese-language labels are classified consistently across page tracks, local subtitle files, and Jimaku-style anime subtitle lookup flows.

## [1.4.139] - 2026-06-27

### Fixed

- BookWalker OCR now treats visible two-page spreads and vertical continuous-scroll page runs as active surfaces instead of collapsing to a stale currentScreen marker, so tapping either page in horizontal mode or the visible page in continuous mode triggers OCR.
- Reduced BookWalker continuous-scroll churn by keeping scroll offset out of the page signature for persistent page stacks, preventing repeated OCR frame teardown while scrolling on iPad.
- Stopped Yomu from annotating BookWalker reader settings and menu chrome, so native labels like page movement direction remain compact and furigana no longer wraps controls.

## [1.4.138] - 2026-06-27

### Fixed

- Kept compact app chrome labels and action buttons readable and tappable by suppressing furigana and hover highlight paint only inside short fixed-height navigation/control labels, while preserving ruby on normal prose links and ruby-capable content chips.

## [1.4.137] - 2026-06-27

### Added

- Help now shows the current Yomu version, latest available version status, duplicate-script status, and an Update/Reinstall userscript link, with AnkiConnect CORS, mobile, and Brave setup guidance in the same panel.
- Study answer backs now surface furigana, pitch accents, frequency pills, and audio controls at the top of the revealed word card, matching the popup dictionary layout more closely.
- Sources settings now includes local pitch and frequency dictionary guidance, a Kanjium pitch guide row, and a JPDBv2 Kana frequency install button so pitch/frequency can be local instead of fetched every time.

### Changed

- Two-point Study grading is available in Study settings, and Pass/Fail review controls use the available width with a centered mobile layout.
- Homepage CTAs now say Install and link directly to Watch and Read tools.
- Dictionary empty states and recommended dictionary copy now explain that term dictionaries add definitions, while pitch and frequency dictionaries add accents and badges.

### Fixed

- Hosted Study now degrades gracefully when userscript bridge, CORS, audio, pitch, or furigana requests are unavailable, including browser coverage for the no-userscript Study reveal path.
- Offline Study status now makes cached cards and queued grade sync visible after a prior visit.

## [1.4.136] - 2026-06-26

### Fixed

- BookWalker canvas OCR now supports both page movement directions, retries manual taps when WebKit only delivers touchstart, and clears stale page captures after turns, reloads, or viewer signature changes.
- Reduced BookWalker OCR churn and moved translation/status overlays away from the bottom edge so page text remains tappable and visible near the end of the viewport.
- Made OCR overlays easier to read on scanned and dark pages with a softer status pill, stronger dark-mode highlight contrast, and a setting to force light, dark, or app-matched overlay styling.
- Centered the Yomu PDF empty drop area, distinguished text PDFs from scanned PDFs, used parsed PDF text where available, and limited OCR canvas overlays to scanned pages so text PDFs stay readable.

## [1.4.135] - 2026-06-26

### Added

- Made Yomu Study, Yomu Video, and Yomu PDF installable with web app manifests and offline service-worker shells.
- Documented the Cloudflare/Wrangler blocker for a default public Ultimate audio source, including the safe deployment plan and free-tier limits to check before opting in.

### Fixed

- Improved compatibility with modern anime and app-style sites by treating Vite/Svelte/Astro-style shells as non-destructive scan targets and recognizing more custom video player frames such as Vidstack, Artplayer, XGPlayer, Clappr, and MediaElement wrappers.
- Cleaned streaming-site title noise from Jimaku anime subtitle searches and gave subtitle furigana extra line height to avoid overlap on player overlays.
- Hardened Netflix-shaped reactive DOM captions so Yomu keeps its subtitle foreground stable through brief host caption layer refreshes without repeatedly toggling the site's caption controls.

## [1.4.134] - 2026-06-26

### Fixed

- Stabilized Yomu Video and YouTube subtitle side panels so left/right/bottom placement no longer resizes the player, leaves giant gaps, or keeps the rail visible after the player chrome hides.
- Added fullscreen to the themed subtitle rail with mobile inline fallback, kept fullscreen subtitles visible, and made the subtitle style popover stable while sliders are dragged.
- Restored transcript auto-follow for long virtualized subtitle lists, added a jump-back-to-current-line control after manual scrolling, and kept hidden-video notice dismissal persistent.
- Standardized compact subtitle typography controls with Settings font presets, added subtitle weight to the popover, and made subtitle dragging update the same bottom-offset setting shown in Settings.
- Kept paused-frame OCR inside the active fullscreen player host, including mobile fullscreen shells, so OCR words remain tappable after pausing fullscreen video.
- Stabilized native and loaded subtitle cue selection at adjacent boundaries so the open sidebar current line no longer flickers between neighboring rows.

## [1.4.133] - 2026-06-26

### Fixed

- Speaker replays now restart single-source term audio deterministically, including Jiten-only audio setups, instead of sometimes leaving the previous clip unmanaged and producing silence until repeated clicks.
- Hover autoplay now keeps playing across consecutive word hovers instead of letting earlier audio state dead-end later eligible words.
- Apple Pencil/stylus taps now activate reader popup controls on the first tap, including dictionary links, kanji buttons, and Show trace / Hide trace toggles, without double-firing follow-up clicks.

## [1.4.132] - 2026-06-26

### Fixed

- Kept generic reader highlights readable on first hover across light/dark site surfaces, custom word colors, Anki colors, and furigana.
- Tightened parsed word wrapping and compact furigana layout so app labels, names, messages, YouTube channel rows, and modern YouTube shelves do not develop gaps or broken one-character stacks.
- Hover autoplay now waits briefly for fallback lookup cards to resolve before falling through to text-to-speech, so recorded audio that arrives on the first hover can play immediately.

## [1.4.131] - 2026-06-26

### Added

- Shipped Google Drive settings sync live for hosted and userscript settings surfaces with the public web OAuth client configured; hosted reader auth runs on Yomu directly, userscripts authenticate through the hosted broker from arbitrary pages, and extension builds keep the extension bridge.

## [1.4.130] - 2026-06-26

### Fixed

- Source-order audio no longer repeats browser text-to-speech on replay when a recorded source has resolved in the meantime; the same word now advances from quick TTS fallback to real audio instead of sounding stuck.

## [1.4.129] - 2026-06-26

### Fixed

- Played vocabulary term audio during subtitle hover lookups if the video is paused (due to "Pause video on subtitle hover" being enabled or general playback states), avoiding clashing audio while allowing standard lookup pronunciations.

## [1.4.128] - 2026-06-26

### Fixed

- Simplified the YouTube hidden-video notice so it visually shows only the reveal and dismiss buttons while keeping the hidden count and visible-item summary available to assistive tech; the YouTube Playwright smoke now verifies the summary is visually clipped in-browser.

## [1.4.127] - 2026-06-26

### Fixed

- Kept compact host UI labels such as author names, usernames, metadata, and headers passive without making dark-site annotations unreadable; passive content highlights now remain stable on hover, transparent dark app shells no longer get treated as white pages, and normal chat/message prose still receives ruby.

## [1.4.126] - 2026-06-26

### Fixed

- Prevented stale BookWalker OCR captures from rendering after a page turn, and expanded the BookWalker Playwright smoke so previous-page OCR must clear before the new page re-OCRs.

## [1.4.125] - 2026-06-26

### Fixed

- Renamed the subtitle mining pause control to "Pause video on subtitle click" and strengthened Yomu Video Playwright coverage so the compact subtitle popover must expose click pause, hover pause, the full font preset set, themed styling, and Settings-page sync.

## [1.4.124] - 2026-06-26

### Added
- Added a clearer hosted Yomu Video empty state for dropping anime and subtitle files together, with desktop and mobile Playwright screenshots.
- Added "Pause video when mining subtitle" setting option.
- Added Hiragino/Yu Gothic and System UI font family preset settings options.

### Changed
- Themed the subtitle style popover panel to match user theme and accent settings instead of being static dark mode.

### Fixed
- Fixed settings synchronization: updating settings from the subtitle popover now updates the main settings page dialog in real-time.
- Fixed a stale cache-invalidation issue on Chrome (TK's bug) by adding version-specific cache keys for reader CSS.

## [1.4.123] - 2026-06-26

### Changed

- Updated default "New and in deck" card/word color to white (#ffffff) to match Canna's suggestion.

## [1.4.122] - 2026-06-26

### Added

- Added a hosted Yomu Video fullscreen button that fullscreen-targets the video frame instead of the bare video, with mobile inline fallback coverage so Yomu subtitles stay visible while watching.

## [1.4.121] - 2026-06-26

### Added

- Added compact Yomu Video subtitle style controls beside the player for font preset, background opacity, position, size, and hover-pause behavior, with desktop and mobile Playwright coverage.

## [1.4.120] - 2026-06-26

### Fixed

- The hosted Yomu Video player now resets stale drawer inset sizing after subtitle panel close/auto-hide, so the video frame and native progress bar stretch back across the full player.

## [1.4.119] - 2026-06-26

### Fixed

- Added the missing hosted Japanese changelog localization for the 1.4.118 Yomu Video release notes, allowing the release check to publish the video improvements cleanly.

## [1.4.118] - 2026-06-26

### Added

- The hosted Yomu Video player now accepts a video file and subtitle files in the same picker/drop action. Japanese/native subtitle files are inferred from their names, loaded automatically, and the transcript opens directly to the lines view.
- Added a separate Video setting for pausing on subtitle hover lookup. Clicked/tapped subtitle lookups still pause by default, while hover pause can now be turned off independently.

### Fixed

- Caption clicks on the homepage "Read captions in any player" demo and Yomu Video now use the fast lookup shell path, so the video pauses immediately and the popover appears without waiting on heavier dictionary/enrichment work. The docs Playwright audit now profiles this path on desktop, iPad, and iPhone.

## [1.4.117] - 2026-06-25

### Fixed

- Restored the OCR "Scanning…/Text ready" loading pill on canvas readers (BookWalker, ComicWalker) and the corner status dot on ordinary images. The indicator was removed in 1.4.114 but its absence left users with no feedback that OCR was in progress, which was confusing on slower scans or double-page spreads.

## [1.4.116] - 2026-06-25

### Fixed

- On the hosted reader (the homepage demo, the video player, and the New Tab page) Yomu now routes cross-origin dictionary requests through its public CORS proxy when no userscript is installed. Those pages run without the userscript bridge, so they could not reach the jiten and jpdb APIs directly (the browser blocked the requests with no CORS header). As a result the demo video captions fell back to tokens with no reading or pitch, so furigana and pitch accent did not show, and the parse that kept failing re-rendered the caption over and over, which made tapping a word miss and the video keep playing instead of pausing. Routing through the proxy restores readings, pitch, and reliable tap-to-pause.

## [1.4.115] - 2026-06-25

### Added

- Google Drive settings sync now works outside the browser extension: the userscript and the hosted reader can sign in to Google and back up/restore your Yomu settings (stored privately in the Drive app-data folder; dictionaries stay local). Authorization uses Google Identity Services on the hosted reader and a small consent popup on `yomureader.com` for the userscript — no tokens to paste. Activates once the public OAuth client id is configured; ships inert otherwise.

## [1.4.114] - 2026-06-25

### Fixed

- Scrolling now works inside the settings panel and the dictionary popover on BookWalker (and other fullscreen readers that lock page scrolling) on mobile. These viewers `preventDefault()` every touch/wheel scroll to freeze the page under their reader, which also killed scrolling inside Yomu's overlays — and the earlier attempt (stopping the host's listener) couldn't beat a viewer that locks earlier than Yomu loads, via `touchstart`, or from a different realm. Yomu now drives the overlay's scroll itself (setting `scrollTop` directly in response to a touch drag or wheel), which works no matter how the host locks scrolling. Scoped to overlay scroll bodies — and to non-editable areas — so page-turn, sheet-drag, and text-field gestures are unaffected, and the non-passive listeners are attached only while an overlay is open.

### Changed

- Removed the OCR "Scanning…/Text ready" pill (and the small loading dot on inline images) on all sites. Now that OCR is reliable, the indicator was just noise — the overlay simply appears, mokuro-style. (The paused-video frame OCR keeps its status, since it doubles as the resume control.)

## [1.4.113] - 2026-06-25

### Fixed

- Pausing a video in the Yomu player (the homepage demo and the hosted video player) now runs OCR on the paused frame, so on-screen text that is not in the subtitles can be read. Paused-frame OCR was previously suppressed on the Yomu player and now behaves like every other video, while a dictionary or mining pause still skips OCR so a lookup popover is never covered.
- Tapping a subtitle caption now pauses the video even when the tap lands just off an exact word, such as on the line padding, the furigana, or the gap in a wrapped line. Japanese captions have no spaces between words, so a near-miss tap previously did nothing while the caption kept scrolling, and it now pauses so the word can be tapped cleanly.

## [1.4.112] - 2026-06-25

### Changed

- The userscript now publishes an `@author` (Henry Russell) in its metadata, so userscript managers display the author instead of "not set".

## [1.4.111] - 2026-06-25

### Added

- Built-in definition and kanji source display names are now editable in Settings, and the custom names flow through the source panels, definition renderers, study/Anki sections, and the newtab/kanji views.
- The newtab My Cards browser has a fourth **History** sort that orders Jiten cards newest-reviewed first, mirroring Jiten's `/srs/history`, and keeps unreviewed cards after reviewed ones.
- Jiten retention and average speed now come from Jiten review-history ratings and durations instead of showing as unavailable.

### Fixed

- Immersion Kit media captions are now readable in light mode (they kept the dark caption backdrop/shadow/stroke treatment that already looked good in dark mode) instead of being forced onto transparent backgrounds with plain page text.
- Unknown-pitch words keep a visible underline (neutral unknown-pitch colour) instead of rendering with a transparent decoration that made the underline disappear.
- The paused-frame OCR "Text ready" status pill now has readable contrast in light mode.
- Settings source/dictionary rows align on shared order/remove tool columns so the reorder arrow and remove button no longer collide.
- Kanji furigana is split against local readings (e.g. 認証する → 認[にん]証[しょう]する) so ruby aligns to each kanji.
- Text-input and textarea selections are preserved when a selection lookup is dismissed by clicking away, so selected words stay selected after the Yomu panel closes.
- Updated the hosted homepage video demo caption copy.

## [1.4.110] - 2026-06-25

### Fixed

- Furigana, reader-word colour, and pitch underlines now render on chat assistant responses (ChatGPT, Claude, Gemini, Grok, and similar) without breaking the page. React/Vue/Angular keep a live reference to each message's text node and re-render it while streaming; Yomu's destructive paint replaced that node, so the framework's next re-render hit a node that was no longer there and threw — which is why a streaming/thinking message collapsed into ChatGPT's own "このメッセージを表示できません" error, the composer grew tall, and the send button drifted off (a page refresh only cleared it until the next response streamed). Yomu now detects framework-owned conversation surfaces and annotates them with the non-destructive overlay mirror (the same path already used for YouTube), which never mutates the framework's own nodes — so the app keeps full ownership and re-renders safely. The fix is generic across chat/message UIs, so other framework-driven chat apps cannot break the same way; static framework article pages keep the higher-fidelity inline rendering, and the rich-text composer is never overlaid.

## [1.4.109] - 2026-06-25

### Fixed

- The settings panel (and other Yomu overlays) can now be scrolled on mobile on top of fullscreen readers that lock page scrolling. BookWalker/NFBR and similar viewers register a non-passive `touchmove`/`wheel` listener that `preventDefault()`s every scroll to freeze the page under their viewer — which also killed scrolling inside Yomu's settings dialog, so it couldn't be scrolled at all on touch. Yomu now stops a scroll that originates inside its own overlay scroll body from reaching the host's lock (at window-capture, without `preventDefault`), so the panel scrolls natively while the host's lock stays intact everywhere else. Scoped to overlay scroll bodies (settings, popover, onboarding) so the popover sheet-drag and panel-drag gestures are untouched.

## [1.4.108] - 2026-06-25

### Fixed

- On a phone, tapping the "—" drag handle at the top of the lookup drawer to close it no longer instantly reopens the drawer on whatever word was sitting behind it. The drawer closes on touch‑release, so the browser's trailing "ghost" click landed on the page text the drawer had been covering and opened a fresh lookup; that one orphaned click is now swallowed so the handle just closes the drawer.

## [1.4.107] - 2026-06-25

### Fixed

- Hovering or clicking a subtitle word on a video now pauses the video while the dictionary popover is open, on the homepage demo player and every video site. The default lookup trigger is hover, but only pinned (clicked) lookups paused before — so with the default settings the caption kept scrolling, the popover chased the moving word and never settled, and the wrong word kept getting hit. A hover lookup over a real subtitle/caption surface now pauses too (and resumes when you move off the captions); the popover re-anchors across words while paused, so there is no play/pause flicker. Hover previews over ordinary page text are unchanged.

## [1.4.106] - 2026-06-25

### Fixed

- A BookWalker manga page would sometimes show no OCR at all — no "Scanning…"/"Text ready" pill — most often on a page you had already visited. In tap/manual mode only a tap captures the page, and a tap whose capture wasn't ready yet (the tainted-canvas mirror couldn't rebuild because the origin-clean page image was still loading, or the viewer repainted the page a beat late) was silently dropped, leaving the page blank until you tapped again. A tap now opens a short, self-bounding recapture window that keeps retrying — and survives the page repaint that previously cancelled it — so the page OCRs on its own without a second tap.

## [1.4.105] - 2026-06-25

### Fixed

- Revisiting an already-scanned manga page (turn forward then back) no longer re-runs OCR: canvas-reader OCR results are now cached by a stable per-page content key (the page's rendered pixel hash / source image URL) instead of the re-encoded snapshot data-URL, so the page renders from cache instead of calling the OCR service again.
- The first tap on OCR text now opens the full dictionary entry instead of a single-sense placeholder that only filled in after a second tap. On touch, Yomu was showing a fast fallback card for uncached words; OCR overlay text is already tokenized Japanese, so it now resolves the complete entry on the first tap.

## [1.4.104] - 2026-06-25

### Fixed

- A local audio server configured by its bare URL (e.g. `http://localhost:9090/`) now plays instead of failing with "Audio request failed (400)". The yomidevs/Yomitan "Ultimate" local audio server requires `?term=&reading=` query parameters and rejects a bare URL, so Yomu now appends the standard `term`/`reading` markers to a custom JSON audio source URL when none are present.

## [1.4.103] - 2026-06-25

### Fixed

- Tapping OCR text on BookWalker now looks the word up instead of turning the page. On touch, Safari can target the underlying viewer canvas even when the OCR word is painted on top, so a text tap leaked through to the viewer's tap-to-turn; the gesture is now swallowed when its point is over Yomu's overlay, while bare-page taps still turn the page and auto-scan.
- The previous page's OCR overlay no longer sticks on the next page. Page-turn detection now also advances when the viewer paints a new source image (some BookWalker modes redraw page tiles directly with no canvas composite, which the old turn signal missed), while staying stable when the same page is merely repainted.
- The "Scanning…/Text ready" loading pill is now a dark chip with white text, legible in light mode (it was white-on-white).
- Added a reload-loop circuit breaker: if a page reloads rapidly in a loop, Yomu stops injecting the OCR recorder for that load so the page stays usable (mitigates a reported loop on the Safari "Userscripts" extension).
- A tap on existing OCR text no longer triggers a re-scan that briefly tore the overlay down mid-tap.

## [1.4.102] - 2026-06-24

### Fixed

- Loaded full Jiten study deck vocabulary in the newtab Search/My Cards browser, so source chips and state filters see every card in decks such as Vocab 2k instead of only the current study batch.
- Removed the standalone Undo study button; Previous now owns recent-review undo and otherwise no-ops on the first card.

## [1.4.101] - 2026-06-24

### Fixed

- iPhone and iPad YouTube caption selections now pause the playing video when the dictionary popover opens, including native YouTube caption text selected through iOS text selection rather than a direct Yomu word tap.

## [1.4.98] - 2026-06-24

### Fixed

- Unknown React/Next/Vue/Angular app shells now use Yomu's non-destructive text mirrors for generic page scans, preventing framework reconciliation crashes such as MCP Market's Critical Application Error while preserving page-text coverage.
- Clicking a subtitle word on a video now reliably keeps the video paused while the lookup popover is open. Yomu's pause is now self-healing: if the player or a competing extension re-plays the video immediately after the pause, Yomu re-asserts it for a short window (and stands down the moment you close the popover or deliberately resume), so the subtitle no longer keeps advancing past the word you clicked.

## [1.4.97] - 2026-06-24

### Fixed

- Selection lookups now take ownership over hover lookups: dragging across rendered text cancels pending hover work, dismisses active hover popovers, and opens the resulting selection popup as a modal instead of inheriting hover state.

## [1.4.96] - 2026-06-24

### Fixed

- BookWalker manga OCR now works in every userscript manager, not just Tampermonkey. The Safari "Userscripts" extension runs scripts in an isolated content world with no `unsafeWindow`, so the canvas-mirror recorder previously patched the wrong realm and recorded none of the DRM viewer's draws — OCR was silently dead there. The recorder is now always injected into the page world and the reader pulls its records back over a shared-DOM bridge, so OCR works on Tampermonkey, Violentmonkey, Greasemonkey and the Safari "Userscripts" extension alike.
- BookWalker page turns now reliably re-OCR the new page. Turn detection no longer depends on the page counter alone (which NFBR can leave unchanged across a turn); a per-page content/turn token is folded into the page signature, so a turn is detected even when the counter, scroll and surface count are identical. This fixes pages getting stuck showing the previous page's overlay (or no overlay) with no way to recover short of a reload.
- A canvas capture that races the viewer's repaint now retries with backoff and recovers on its own instead of leaving the page un-OCR'd until a reload; stale per-page readiness state is cleared on every turn.
- Tap/manual OCR mode now detects page turns (clearing the stale overlay) and reliably re-scans on a tap — including touch taps on iPad/iPhone, where there is no keyboard shortcut. A background poll no longer wipes a page you tapped to scan.
- The OCR loading indicator on full-page canvas readers (BookWalker/ComicWalker) is now a clear labelled pill instead of an easy-to-miss corner dot, so the multi-second scan reads as "working" rather than frozen.
- Cross-origin OCR requests now also resolve through a manager's promise-based `GM.xmlHttpRequest`, and a one-time warning is logged when no userscript HTTP request is available, so a missing grant is diagnosable instead of a silent blank page.

## [1.4.95] - 2026-06-24

### Fixed

- Hover auto-play term audio (Auto-play trigger set to "Hover only" or "Hover and tap/click") now fires on pages that merely contain a video. Auto-audio suppression on video now only applies while a video is actually producing sound, so a paused, muted, or silent embedded clip no longer silently blocks hover playback — clicking already worked because a click bypasses the suppression.

## [1.4.94] - 2026-06-24

### Fixed

- Audio on strict-CSP sites such as ChatGPT and Claude now decodes the already-fetched clip in memory instead of re-fetching its blob URL (which the page CSP blocked), so the dictionary popup and the settings audio preview play the real audio instead of the fallback chime.

## [1.4.93] - 2026-06-24

### Fixed

- Restored status highlights on passive link text such as Discord channel names, while keeping compact native controls highlight-free, so pitch underlines no longer leave dark-page text without a readable backing.

## [1.4.92] - 2026-06-24

### Fixed

- Repainted page words immediately after JPDB/Jiten review actions, including hiding furigana for newly known words and clearing stale mining banners.

## [1.4.91] - 2026-06-24

### Fixed

- Stopped paused-frame OCR from adding a second play button to the subtitle rail when the subtitle playback control is already visible; resuming through that control still clears the OCR overlay.

## [1.4.90] - 2026-06-24

### Changed

- Expanded the hosted homepage and localized metadata copy to describe SRS practice, Japanese site versions, and YouTube Japanese-content filtering as part of Yomu's immersion environment.

## [1.4.89] - 2026-06-24

### Fixed

- Kept the video play/pause control visible beside the previous/next subtitle buttons while subtitle navigation is showing, and moved the mobile subtitle height drag handle back to the centered subtitle line position now that it no longer conflicts with that control.

## [1.4.88] - 2026-06-24

### Fixed

- Replaced the placeholder cloud settings section with extension-only Google Drive settings sync in Settings -> Sources, using Google Drive app data for settings backup and restore while keeping dictionaries local.

## [1.4.87] - 2026-06-24

### Fixed

- iPhone YouTube fullscreen now keeps Yomu subtitles in the page overlay by intercepting WebKit's native video fullscreen entry points and falling back to an inline fullscreen player host when Safari cannot fullscreen the player container.

## [1.4.85] - 2026-06-24

### Fixed

- Rendered OCR and subtitle words now carry their reading and pitch metadata into the dictionary popup, so clicking a word such as 鯛 keeps the furigana and pitch accent already shown in the overlay instead of falling back to a bare card.
- Furigana-only subtitle enrichment now still resolves fallback vocabulary when pitch-accent display is disabled, preventing parsed long/keyless YouTube subtitles from losing ruby.
- Jiten only reports "rejected API key" for authenticated reader/SRS 401/403 responses, so public lookup outages and rate limits no longer look like bad keys.
- Mobile YouTube bottom-sheet detection no longer depends on fragile `:has()`/`:is()` selector parsing while expanded descriptions still hide the subtitle overlay and rail.

## [1.4.84] - 2026-06-24

### Fixed

- Added a visible Cloud settings synchronization section in Settings -> Sources, beside the settings and dictionary import/export controls, explaining how to use the existing settings JSON export/import as a portable cloud backup.

## [1.4.83] - 2026-06-24

### Fixed

- YouTube subtitle panels no longer shrink or crop the player when the panel is docked below the video, while left and right panels still reserve player space.
- Mobile subtitle playback is less cramped: long phone-width caption lines wrap inside the screen, the move handle sits out of the central play/pause lane, and tapping the bottom drawer handle closes the subtitle panel.
- Tapping a subtitle word now reliably pauses the playing video for dictionary lookup and resumes that same video when the entry closes, even after YouTube swaps or stales the bound video element.
- Mobile YouTube bottom sheets, including expanded descriptions, now hide Yomu's player subtitles and rail while they cover the watch page.

## [1.4.82] - 2026-06-24

### Fixed

- Added the radial-menu quick actions for pausing annotations, muting term audio, cycling OCR mode, and toggling Japanese site language to the userscript browser icon/context-menu shortcuts.

## [1.4.81] - 2026-06-24

### Fixed

- Selecting a paragraph that contains a Japanese word no longer collapses the selection back onto that word. The annotated-word auto-lookup popup was hijacking ordinary copy gestures and re-anchoring the live selection, so predominantly non-Japanese passages now stay fully selectable while genuine Japanese selections still open the lookup.

## [1.4.79] - 2026-06-23

### Fixed

- Refined the hosted docs homepage copy, install CTAs, section spacing, and mobile hero actions so the first screen is clearer, slimmer, centered on small screens, and points directly at the userscript install.
- Reworked the homepage demos: the phone demo keeps the clean autoplay loop with click and keyboard pause controls, the manga sample uses the real hosted OCR runtime on the image itself, the video block uses the real subtitle runtime on a controlled player, and the Try me fixture shows the full sample sentence.
- Improved docs accessibility and mobile behavior across the homepage, hosted video/PDF/study tools, and docs audits with stronger focus rings, larger coarse-pointer targets, reduced-motion handling, darker pitch underlines, and broader guide/tool page audit coverage.
- Cleaned up docs copy across setup, features, tools, and guides so lookup behavior is explained with clearer device-neutral wording instead of defaulting everything to "tap."

## [1.4.78] - 2026-06-23

### Fixed

- Mobile Google Search annotations no longer hide the base text inside compact rounded result controls, and passive result snippets no longer paint pale highlight blocks on dark-mode search results before or after hover.
- The hosted homepage now uses a tighter “Read Japanese without leaving the page” flow, a compact setup path, native demo video controls, a static pitch-accent demo fallback, and the real manga OCR sample image instead of the temporary illustrated panel.
- Hosted docs now emit normal stylesheet links and load the root-hosted userscript assets, so the deployed homepage does not fall back to an unstyled or stale-looking page.

## [1.4.77] - 2026-06-23

### Fixed

- BookWalker OCR now works on the main bookwalker.jp address, not only the viewer subdomains. The browser reader is also served there, and iOS Safari hides the subdomain in its address bar, but the tainted-canvas reader was only recognised on viewer hosts, so on iPad the comic page was detected yet no text overlay appeared and only the page title could be looked up. The reader-host check now covers the whole bookwalker.jp site, and a duplicated host check was removed.

## [1.4.76] - 2026-06-23

### Fixed

- Latest changelog entries are now covered by Japanese hosted-docs localization, so the language toggle does not leave fresh release notes in English.

## [1.4.75] - 2026-06-22

### Fixed

- Compact BookWalker-style carousel titles now suppress furigana only when a clipped media rail would overflow, while ordinary scrollable article text keeps ruby and lookup behavior.
- The hosted homepage and docs language toggle now localize page titles, meta descriptions, navigation chrome, and the current homepage Try Me/OCR sections without stale route metadata or broken image references.
- The hosted Yomu video player no longer creates paused-frame OCR overlays, so pausing a local video cannot put a captured frame over subtitles or the native progress bar.
- Hosted overflow menu links now use the current `yomureader.com` root paths instead of the old GitHub Pages `/yomu-reader/` prefix.
- The Greasy Fork userscript build is back under the 2 MB limit after compacting emitted selector scaffolding without changing reader behavior.

## [1.4.74] - 2026-06-22

### Fixed

- Image OCR overlays no longer widen a vertical column's highlight box to wrap its furigana reading. The reading sits in a strip beside the column and overflows the box as designed, so the highlight now matches the size of the scanned text instead of ballooning when furigana is shown.
- Image OCR no longer drops a short all-kana column that sits next to a longer kanji column (for example それにしても beside こんなに若くて可愛い). It was being misread as a standalone furigana reading strip and removed, so it could not be hovered or looked up; the furigana-strip test now keys off the reading's thinness rather than its length.
- Pitch-accent marks now appear on vertical OCR columns. The colored rule renders down the side of the highlighted column on hover or tap; it previously relied on a native underline that cannot paint through the overlay's inline-flex text layout, so nothing showed.

## [1.4.73] - 2026-06-22

### Fixed

- The preferred Japanese site-language feature now waits for page locale metadata before making generic `/en` to `/ja` URL guesses, and skips the guess when a page declares supported alternates without Japanese. Japanese locale/cookie/browser hints and explicit `hreflang="ja"` or known-site redirects still apply, but multilingual sites without Japanese pages no longer get sent to broken guessed routes such as `/en/ja`.
- Selection popovers now close on outside click without clearing the native page text selection, and the same selected text stays dismissed instead of immediately reopening the modal.
- The selected-text lookup feature is now exposed clearly as **Selection popups** in Reader settings, so users can turn it off while keeping click, hover, annotations, and study tools enabled.

## [1.4.71] - 2026-06-22

### Changed

- Updated every Discord invite link to the new server invite.

## [1.4.70] - 2026-06-22

### Changed

- Default settings now open in English again, the homepage next-steps grid no longer includes the support card, and the docs header includes a Discord link beside GitHub.

## [1.4.69] - 2026-06-22

### Fixed

- Compact carousel and storefront media-card labels now suppress furigana when a narrow title link sits beside a sibling cover link, and direct text inside flex/grid controls is wrapped as one inline run. This keeps book shelves, icon menus, and product carousels from expanding, stacking, or overlapping after page annotation.

## [1.4.68] - 2026-06-22

### Fixed

- BookWalker canvas OCR now re-snapshots the current page after page turns when image OCR is set to tap/hover instead of automatic, so hovering or tapping the reused viewer canvas triggers OCR for the new page instead of reusing the previous snapshot.

## [1.4.66] - 2026-06-22

### Fixed

- The play/resume control on a paused video now appears immediately instead of waiting for OCR to finish, so you can always unpause right away. The captured frame snapshot and scanning indicator still stay hidden until OCR has text, keeping the player's own comment/like/scrubber controls reachable while it runs.

## [1.4.65] - 2026-06-22

### Fixed

- Compact image/navigation labels now keep their original inline layout and suppress furigana, preventing sites with icon menu links such as Travel Donkey from stacking labels or stretching header/sidebar rows.

## [1.4.64] - 2026-06-22

### Fixed

- Page-word highlights now refresh contrast before scan chunks yield and mirrored hosts hide before their overlay is attached, preventing dark first-paint highlights that only corrected after hover.

## [1.4.63] - 2026-06-22

### Fixed

- Mirrored input and textarea placeholders now hide the native placeholder while the annotated overlay is visible, preventing double-rendered text in compact controls such as Google/Gemini voice/search inputs. Placeholder mirrors suppress furigana in the 24px control line and clean up their temporary styles as soon as the field changes.
- YouTube title mirrors with furigana now use ruby-friendly line-height and the crop sweep detects absolute mirror overflow, so modern lockup/card titles reserve enough height instead of clipping or packing ruby into broken-looking line breaks.

## [1.4.62] - 2026-06-22

### Fixed

- Furigana-bearing reader words now reserve more vertical line-height on tight mobile Safari layouts such as the hosted よむ homepage, and page-word highlights stay bounded to the text glyph height instead of expanding into chunky blocks across the taller ruby line.
- Text mirrors now keep their host overflow visible while annotations are active, preventing mirrored ruby from being clipped by compact page chrome.
- YouTube feed continuations now load under YouTube's own scroll observer instead of being programmatically pulled into view by Yomu, fixing homepage jumps to the Shorts/continuation area on iPhone and avoiding stuck desktop/mobile skeleton rows while scrolling.
- The "Prefer Japanese site language and location" feature no longer wraps page `fetch` or `XMLHttpRequest` calls. Sites still receive Japanese URL/cookie/locale hints, but fragile app request pipelines such as YouTube continuations and Reddit Shreddit APIs are left untouched, fixing `ReferenceError: isSameOriginRequestUrl is not defined`, "Request failed" banners, and stuck infinite-scroll hydration.

## [1.4.61] - 2026-06-22

### Fixed

- Mobile YouTube reload loop ("A problem repeatedly occurred on https://m.youtube.com/?ra=m&hl=ja&gl=JP"). Root cause was the **preferred Japanese site language** feature (pre-existing, unrelated to the 1.4.58 work): (1) its `Accept-Language` `fetch`/`XHR` wrapper added the header to — and re-derived — *cross-origin* requests, breaking YouTube's gstatic icon/script loads in WebKit/Safari ("access control checks"); and (2) its alternate-URL redirect watcher re-fired on every m.youtube SPA navigation, full-reloading back to the Japanese URL forever. The header is now only added to same-origin requests, and the redirect runs at most once per host per tab session (the language cookie keeps the site Japanese afterward). Reproduced and verified in WebKit + a Japanese locale.
- Keyboard shortcuts no longer swallow normal typing (e.g. Shift+H) in inputs that live inside a shadow root, such as YouTube's search box — the keydown gate now checks the event's composed path, not just the retargeted shadow host.

### Changed

- Re-introduced the 1.4.58 YouTube/mobile UX improvements (they were not the cause of the reload loop): portrait/Shorts subtitle sizing + position, frame-synced subtitle timing, paused-frame OCR overlay gating, reliable pause-on-lookup, snappier taps with fewer mispresses, iPad/Apple-Pencil touch targets, bounded comment pitch retry, and broader in-player YouTube text coverage.

## [1.4.60] - 2026-06-22

### Fixed

- Full rollback of the 1.4.58/1.4.59 YouTube-mobile-UX changes: they broke mobile YouTube page loading and the 1.4.59 partial revert did not fix it. This release restores the exact known-good 1.4.57 reader/page-scan/subtitle/OCR behavior. The reverted work (mobile subtitle sizing/sync, paused-frame OCR gating, pause-on-lookup, tap reliability, iPad touch targets, comment pitch, broader YouTube text coverage) will be re-introduced one change at a time only after on-device mobile validation, since the regression could not be reproduced in the headless test harness.

## [1.4.59] - 2026-06-22

### Fixed

- Hotfix: revert the 1.4.58 change that parsed Japanese inside YouTube's player/overlay wrappers (and added end-screen/pause-overlay scan roots). On real mobile YouTube (`m.youtube.com`) the broadened whole-page scan over the large, continuously-hydrating player subtree could freeze the page so it never finished loading. The page-scan/parsing behavior is restored to the known-good pre-1.4.58 state (the native-caption exclusion was always kept). Broader in-player text coverage will return only after on-device mobile validation.
- All other 1.4.58 fixes are unaffected and remain: mobile subtitle sizing/position, frame-synced subtitle timing, paused-frame OCR overlay gating, reliable pause-on-lookup, snappier taps with fewer mispresses, iPad/Apple-Pencil touch targets, and the bounded comment pitch-accent retry.

## [1.4.58] - 2026-06-22

### Fixed

- Mobile/Shorts subtitles are larger and sit higher by default so they clear the Shorts action rail and scrubber. Font scaling is now portrait-aware (it no longer collapses to ~17px on a phone), and the size/position settings stay authoritative — an explicit value always wins.
- Subtitle timing follows the video frame-by-frame (via `requestVideoFrameCallback`, with a `requestAnimationFrame` fallback) instead of a ~250 ms sampler, so cue changes and karaoke highlighting stay in sync, including at 1.5–2× speed. The per-frame sampler runs only while playing and is cancelled on pause, tab-hide, and teardown to protect battery.
- Paused-frame OCR no longer covers the player before it finishes: the captured frame, scan status, and resume button stay hidden until OCR produces text, so the native player and its comment/like/scrubber controls remain reachable while scanning. A dictionary lookup that pauses the video no longer spawns an OCR overlay over the player, and the overlay re-aligns on rotate/fullscreen/pinch-zoom.
- Opening the dictionary reliably pauses the exact video the subtitles track (instead of guessing the largest video on the page), keeps it paused while drilling into nested lookups, and resumes it on close.
- Tapping a word is snappier with fewer mispresses: a tap that lands just off a word is now resolved at finger-up instead of waiting for the delayed synthetic click, and word hit targets no longer overlap their neighbours.
- iPad with an Apple Pencil now gets the touch-sized tap targets, hit-slop, and 44 px controls (touch ergonomics key off `any-pointer: coarse` instead of the primary pointer, which a Pencil reports as fine).
- YouTube comments receive pitch-accent underlines more reliably on keyless setups: budget-denied words are retried through a bounded, paced public-pitch lane instead of being abandoned, without exceeding a per-page lookup cap.

### Changed

- More YouTube text is parsed: Japanese inside the player/overlay wrappers, end-screen cards, and pause-overlay titles now receives furigana and pitch coloring. The native caption overlay stays excluded so it is never double-rendered, and the reader never re-ingests its own annotations.

## [1.4.57] - 2026-06-22

### Fixed

- YouTube and Google search Japanese text coverage is stricter: comments, metadata, action labels, AI/result cards, related chips, and compact video rows keep base text visible while receiving furigana, pitch coloring, and pitch underlines instead of being clipped or skipped.
- Touch lookup on mobile is more reliable: normal page/subtitle reader words now open on a tap-only pointer release, cancel cleanly during scroll drags, and have a slightly larger coarse-pointer hit target without moving page layout.
- Hover lookup audio now reuses a fresh tap/click-time media reservation for automatic playback, so iPad/Safari hover flows can play term audio after a recent reader gesture instead of being blocked as delayed non-gesture media.

## [1.4.56] - 2026-06-22

### Fixed

- YouTube watch titles and channel metadata no longer go missing, duplicate, or misalign after the page re-renders. The non-destructive furigana mirror hides the host text and overlays an annotated copy; a YouTube re-render that rewrote the host's `style`/`class` without changing its text used to strip the mirror's `visibility:hidden`/`position:relative` (so the native title reappeared beside the mirror, or the overlay drifted out of place). The mirror now watches the host's own attribute changes and re-pins those styles.

## [1.4.55] - 2026-06-22

### Changed

- Internal: extracted the new-tab immersion-example audio playback engine into a dedicated, unit-tested `NewTabImmersionAudioPlayer` module (request-id invalidation so a slow load never plays over a newer card), and converged a duplicated URL-dedupe helper onto the shared `uniqueTrimmedStrings` util. No change to behavior.

## [1.4.54] - 2026-06-22

### Fixed

- Parser-disabled/native site profiles now still run the final visible-Japanese sweep, so storefront chrome, buttons, nav, comments, and other visible Japanese text remain readable instead of silently opting out.
- YouTube guide and mini-guide labels are no longer excluded from the residual scan path; visible Japanese YouTube chrome keeps ruby, source coloring, and pitch underlines unless it is an actual native player control.
- YouTube desktop and mobile comments now stay in the inline parser path even after host re-renders, avoiding text mirrors, unwanted "詳細" expansion buttons, and missing furigana/pitch on comment text.
- The YouTube subtitle transcript resize interaction now clears cleanly on pointer cancellation, lost capture, and mouseup fallbacks, fixing stuck resize states, manual-scroll glitches, and highlight jumps during live playback.
- The YouTube mobile/fullscreen smoke harness now retries transient navigation races while installing userscript CSS, making the fullscreen sidebar regression check stable against YouTube page refreshes.

## [1.4.53] - 2026-06-22

### Changed

- Internal: extracted the new-tab offline grade write-behind queue (persist failed grades, dedupe, retry on reconnect) into a dedicated, unit-tested `NewTabGradeQueue` module, further shrinking the new-tab controller. No change to behavior.

## [1.4.52] - 2026-06-22

### Fixed

- The Japanese-site request now catches more generic multilingual URL patterns (`en` subdomains and `/en` or `/en-US` path segments) and the Yomu puck can toggle it on or off. Turning it off after Yomu redirects the page returns to the remembered original URL.

## [1.4.51] - 2026-06-22

### Changed

- Internal: extracted the new-tab kanji-detail multi-source fetch/cache subsystem into a dedicated, unit-tested `KanjiDetailSource` module (load/invalidate/clear) and lifted the shared `promiseWithTimeout` helper into `core/async-utils`, shrinking the new-tab controller. No change to behavior.
- Internal: moved pointer hit-testing geometry out of the new-tab controller into a focused `dom/pointer-geometry` module, converging duplicated rect math onto the shared `dom/rect` primitives. No change to behavior.

## [1.4.50] - 2026-06-21

### Fixed

- Hover lookup audio now attempts and preloads immediately even before the page has browser-level user activation, fixing hover cards that stayed in the audio loading state while clicked cards played.
- YouTube comments now render ruby/pitch inline without falling back to text mirrors that make every short comment look overflowed and show "詳細".
- YouTube chrome text, mobile controls, guide labels, and comment buttons stay in the ruby/pitch scan path while native caption windows remain reserved for YouTube itself.
- Generic page scanning now does a final visible-Japanese sweep across comments, nav, buttons, tabs, and other UI text on ordinary pages, while BookWalker storefront chrome and other parser-disabled/native profiles keep their DOM opt-outs.
- Subtitle primary text no longer flashes unparsed while parser enrichment is pending; lines render only after parsed furigana/pitch-ready HTML is available.

## [1.4.49] - 2026-06-21

### Changed

- Internal: extracted the live JPDB review bridge → card adapter and the live-card identity helper into a dedicated, unit-tested `jpdb-live-card` module, shrinking the new-tab controller and giving the live-review card model a single owner. No change to behavior.

## [1.4.47] - 2026-06-21

### Fixed

- ChatGPT, Claude, Gemini, and Grok-style markdown/message responses now scan as normal readable prose, so furigana, reader word color, and pitch underlines render on Japanese chatbot answers.
- Click lookup now resolves passive/message words from rendered geometry when the page reports a wrapper as the click target, opening the sticky dictionary while keeping native buttons and controls click-through.
- Hover lookup audio now attempts and preloads immediately even before the page has browser-level user activation, fixing hover cards that stayed in the audio loading state while clicked cards played.
- Reader ruby/furigana CSS now wins against more aggressive host markdown resets.
- YouTube Shorts subtitles now keep visible primary text while parser enrichment is pending, then rebake cached cue and transcript HTML with furigana/pitch when enrichment completes.
- Paused-video OCR snapshots now keep the native player visible until OCR text is ready, then reveal the still frame together with the parsed OCR overlay.
- YouTube mini-guide navigation stays native, while comments, buttons, mobile controls, and compact titles remain in the ruby/pitch annotation path.

## [1.4.46] - 2026-06-21

### Fixed

- The "Prefer Japanese site language and location" setting now actively redirects common multilingual sites to their Japanese URL variants instead of relying only on browser-language hints. YouTube, Google, Google News, MDN, GitHub Docs, Microsoft Learn, Apple Support, Wikipedia alternates, and other pages that expose Japanese alternate links now move to Japanese reliably when the setting is enabled.

## [1.4.45] - 2026-06-21

### Added

- The puck radial menu now has an OCR mode toggle that cycles Auto -> Tap/Hover -> Off. Tap/Hover keeps image OCR available on intentional pointer activation and keeps paused-video frame OCR available, since videos do not have a still image to tap.

### Fixed

- Turning OCR fully off now releases any paused-video OCR frame overlay as well as image/canvas OCR overlays.

## [1.4.44] - 2026-06-21

### Changed

- Folded the remaining upstream release heads and current local topic branches into main as superseded integration merges, leaving no unmerged remote branches.

### Fixed

- YouTube and Yomu-hosted video frames that request fullscreen on the bare video element now redirect fullscreen to the player container, so the subtitle overlay remains visible above the video in mobile/narrow fullscreen layouts.

## [1.4.43] - 2026-06-20

### Changed

- Removed Yomu's bundled public proxy fallback. Cross-origin requests now use direct/browser-readable paths, the userscript bridge, or a proxy URL the user explicitly configures.

### Fixed

- JPDB vocabulary detail pages no longer re-render JPDB's native large headword, fixing malformed furigana/layout on entries such as `表示`.
- Japanese Settings parsing now replaces overbroad fallback tokens with curated settings words, so labels such as `ポップアップ表示` click and underline as `表示` instead of opening a broad synthetic selection.
- Settings lookup-link rows now keep the label, URL template, order controls, and remove controls aligned on wider layouts.
- Opening Settings no longer toggles `inert` on the host page, avoiding long modal-open pauses on large sites while preserving the dialog backdrop and focus trap.

## [1.4.42] - 2026-06-20

### Fixed

- Keyless public Jiten parsing now hydrates visible words with cached detail records so furigana and pitch accents appear without an API key while public requests stay capped and paced.
- Welcome splash reader words now open the dictionary popover on click or keyboard activation without stealing onboarding action button clicks.
- Japanese Settings no longer repeats every dropdown option below each select. Settings now keep only the parsed selected-value mirror where native controls need it, ignore stale option-list metadata, and apply furigana/pitch rendering from the current form controls in both hosted and userscript settings.

## [1.4.41] - 2026-06-20

### Fixed

- Not-in-deck words now use a quieter default slate-blue state and a softer highlight mix, so pages where most parsed words are outside the deck no longer turn into a bright wall of blue. Actual new and in-deck words keep the existing stronger blue.
- Headword furigana tests now compare the visible word surface instead of raw ruby text, matching the 1.4.40 popup headword rendering.

## [1.4.40] - 2026-06-20

### Fixed

- Popup headwords can now render furigana while keeping each kanji as a clickable drilldown button, so annotated spellings such as `大[たい]変[へん]` show ruby instead of bare kanji-only buttons.

## [1.4.39] - 2026-06-20

### Fixed

- Apple Pencil handwriting on the Search tab no longer drops live strokes when Safari loses pointer capture mid-stroke. The shared kanji doodle canvas now keeps listening through document/window pointer events until the real pointerup/cancel, so Search handwriting, new-tab kanji practice, and popup kanji practice all use the same patched path.
- Search results now include the kanji reading/inline-word metadata and hidden canonical spellings that the current result cards expect, so ruby-rendered words still expose their plain surface text.

## [1.4.38] - 2026-06-20

### Added

- Added ASB-style subtitle timing controls under Tracks so loaded primary/native subtitle files can be nudged by 100 ms, aligned to the previous or next subtitle at the current playhead, and reset without reloading the track.

### Fixed

- YouTube Shorts subtitle rows now wrap long parsed/ruby cues instead of clipping after the first visible segment, and native YouTube translation overlays recover when the translated timedtext response is empty by translating from the source captions.

## [1.4.37] - 2026-06-20

### Fixed

- Installed frequency dictionaries, including the Jiten frequency dictionary, now live under Settings -> Sources -> Lookup pills and render their popup frequency badges from the same enabled/order controls instead of a separate frequency-dictionary subsection.
- Hover term audio now treats a fresh hover as a new auto-play attempt for the same word, so re-hovering or reopening a hover popup is no longer skipped by duplicate-render guards while repeated renders from one hover still stay quiet.
- Fullscreen subtitle fallback now ignores ordinary page metadata such as title links, category chips, navigation labels, and centered text just below the player. This prevents fake one-line subtitles like `生成 フルボイス` from appearing after fullscreen on sites without real subtitle tracks, while preserving real custom caption overlays.
- Clicking subtitle words in ASB and other subtitle-style overlays now pauses the playing video again, then resumes it when the lookup closes.
- Tapping parsed words inside popup dictionary prose now opens a nested lookup instead of leaving those words render-only; dictionary links and source summaries still keep their native click behavior.

## [1.4.35] - 2026-06-20

### Added

- Added a Reader setting to turn off Yomu's own lookup popup when using jpdb reader, Jiten Reader, or Yomitan for popups, while keeping Yomu annotations, media tools, mining, and study features available.

## [1.4.34] - 2026-06-20

### Changed

- Imported dictionary sources now render directly in the definition stack instead of sitting behind a combined "Dictionaries" wrapper panel.

### Fixed

- Settings now keep furigana parsing and pitch underline styling in the API, furigana, and underline controls after tab changes and late status refreshes, including hosted settings text that only has local fallback readings.

## [1.4.33] - 2026-06-20

### Fixed

- Recommended dictionary buttons in Settings now say "Update" immediately when the matching dictionary is already installed, including saved/imported title variants such as Jitendex.org and JPDB frequency dictionaries.
- Historical lookup-link settings now migrate cleanly after retiring the goo lookup link, preserving the intended Jiten, JPDB, then Yomu order.
- The Help tab Donate button now keeps its accent fill, border, and readable text instead of inheriting the dark base button background.

## [1.4.32] - 2026-06-20

### Fixed

- Pitch accent now loads for every word on a page at once instead of trickling in a few words at a time. On non-YouTube pages, local-dictionary pitch lookups (which use no network) were capped at 12 words per scan and the rest were silently dropped, so dense pages only ever showed pitch on a handful of words until you scrolled or clicked each one. The whole visible batch is now enriched together — in idle-paced chunks that keep the page responsive — while public/online lookups stay throttled exactly as before.

## [1.4.31] - 2026-06-20

### Fixed

- The Media → Audio sources list is now authoritative again. Playback follows the order you configure (the first enabled source that has audio wins) instead of picking a source at random or racing to whichever responds fastest. Custom sources — including a local audio server such as `http://localhost:9090/?term={term}&reading={reading}` — now play from the position you place them in the list. "Shuffle audio" continues to vary the individual clips a single source offers, but no longer reshuffles the source priority list itself.
- Hover audio no longer lags behind clicking. Any word that auto-plays on hover now prefetches its audio while the popup loads — matching the always-warm click/modal path — so playback starts promptly. This especially fixes common single-character words (火, 水, 人 …), whose audio was previously fetched cold on hover.

## [1.4.30] - 2026-06-20

### Fixed

- Discord and other page-word surfaces now keep highlights, underlines, and text colors on particle and short-token spans by preserving the shared state and pitch classes instead of leaving those tokens visually inert.
- Strict or stale-CSS pages now get the same critical fallback for status, JPDB/Jiten, Anki, and pitch word-color channels while the full `yomu.css` resource is unavailable.

## [1.4.29] - 2026-06-20

### Changed

- Internal: separate the embedded grammar dataset (`GRAMMAR_PATTERN_DATA`, `GRAMMAR_RULE_EXAMPLES`) from the grammar-detection logic in `study/tools.ts`, moving ~2.85k lines of data into `study/grammar-data.ts`. The logic file drops from 3197 to 736 lines. No behavior change; the 635-case grammar suite stays green.

## [1.4.28] - 2026-06-20

### Fixed

- Rolled the direct recommended dictionary installs onto the latest release line so WTY JA-JA, Pixiv Light, and JPDB Kanji remain available from direct ZIP install buttons alongside the Anki module refactor.

## [1.4.27] - 2026-06-20

### Changed

- Internal: split the oversized Anki integration module (`anki/client.ts`, ~2.9k lines) into focused modules — mobile handoff, card templates, media files, model/field mapping, field rendering — and removed duplicated cache and array helpers (one shared `core/public-cache` and `core/array-utils`). No user-facing behavior change; the userscript bundle is ~1.8 KB smaller and gains regression tests for the deep-link, cache, and array utilities. Also realigned settings/JPDB test copy that had drifted from the shipped i18n.

## [1.4.26] - 2026-06-20

### Fixed

- Recommended local dictionaries now publish with direct Yomitan ZIP install links, including WTY JA-JA, Pixiv Light, and JPDB Kanji, while dropping the homepage-only MarvNC collection card.
- Mobile YouTube comment text keeps its reader parsing and scan coverage while preserving the settings copy required by the generated form checks.

## [1.4.18] - 2026-06-20

### Fixed

- Discord and other strict or stale-CSS pages now keep the default reader word highlight, pitch underline, and pitch text-color fallback when the full `yomu.css` resource is unavailable; the inline critical fallback now carries those shared word visual channels instead of only base pitch underline styling.

## [1.4.17] - 2026-06-20

### Fixed

- Recommended local dictionaries now install directly from usable Yomitan ZIP links, with WTY JA-JA fixed, generic homepage-only MarvNC removed, and Pixiv Light plus JPDB Kanji added from the local export.

## [1.4.16] - 2026-06-19

### Fixed

- Recommended local dictionaries no longer show homepage-only cards for monolingual entries: WTY JA-JA now installs from its documented Yomitan zip, the generic MarvNC collection card was replaced with direct Pixiv Light, and JPDB Kanji was added from the local dictionary export because it has a usable direct zip.

## [1.4.15] - 2026-06-19

### Fixed

- The JPDB/Jiten grading-provider switcher now sits in the review-target gutter, stays available for users with both API keys, and uses the provider label itself as part of the tap target.
- Single-provider setups no longer show redundant "JPDB" or "Jiten" review-target text next to the grade buttons.

## [1.4.14] - 2026-06-19

### Fixed

- On YouTube, the Japanese subtitle line no longer goes missing while the English (native) line shows alone. Auto-generated captions and their auto-translated Japanese track are segmented independently, so the Japanese cue can start a beat after — or fall into a gap relative to — the English line that's already on screen; the pair now appears together by surfacing the Japanese cue aligned to the active English one. This also steadies the transcript side panel, which flickered when the active line momentarily had no Japanese cue.

## [1.4.13] - 2026-06-19

### Fixed

- Jiten speaker buttons embedded in JPDB page add-ons now play audio again, matching the same Jiten audio behavior already available inside lookup popovers.

## [1.4.11] - 2026-06-19

### Fixed

- Opening Settings on YouTube no longer makes the immersion filter rescan the page just because よむ mounted its own dialog, so the panel appears much faster on busy YouTube pages.

## [1.4.10] - 2026-06-19

### Fixed

- BookWalker (and any cross-origin "tainted" image) OCR now works again on iPad/Safari. The clean source image fetched for the canvas mirror was wrapped in a Blob with no MIME type, and WebKit refuses to decode an `<img>` from such a blob URL — so on iPad the rebuild produced nothing and no OCR overlay, highlights, or spinner ever appeared (Chrome content-sniffs and was unaffected). The fetched image now carries an image MIME type, detected from its magic bytes and falling back to the URL extension.

## [1.4.9] - 2026-06-19

### Fixed

- Clicking a hovered page word now pins the lookup popover immediately, so it stays open while the clicked lookup renders instead of being removed by the hover close timer.

## [1.4.8] - 2026-06-19

### Fixed

- Generic chat and comment prose now keeps furigana even when nearby avatars or thumbnails make the row look like compact media metadata, fixing missing ruby on Discord without adding a Discord-specific parser.
- Reader word underlines are thinner and sit closer to the text across normal page text, OCR, and hosted reader surfaces.

## [1.4.7] - 2026-06-19

### Fixed

- YouTube channel suggestions no longer show subscribe rows from preview metadata that lacks a current subscription state, preventing already-subscribed channels from reappearing as "Subscribe" recommendations.
- The channel suggestion shelf now has a single opt-out action, "Hide"; the route-only "Dismiss" button was removed.

## [1.4.6] - 2026-06-18

### Changed

- Jiten now comes before JPDB in fresh installs, migrated default installs, definition-source rows, Study combined source labels, settings copy, docs copy, and dictionary/source ordering surfaces. Custom source priorities are preserved.
- The homepage now focuses on よむ itself: lookup, local dictionaries, study cards, audio, OCR, PDFs, subtitles, and video, without promoting JPDB in the landing-page copy.
- The hosted Settings menu warms the よむ runtime on hover, focus, touch, and pointer down, then retries immediately when the runtime script finishes loading so opening settings feels snappier on mobile.
- The hosted video player now includes a localized Jimaku subtitle-search link next to the Subtitles button.

### Fixed

- The subtitle overlay no longer latches onto page chrome posted next to a video — e.g. a Discord message author's handle that contains Japanese (such as "Canna波蘭") no longer gets stuck as the subtitle while scrolling past the clip. The generic page-caption scan now only accepts text that is centered on the player and overlaid within the video frame, instead of any nearby Japanese text.
- OCR no longer resurrects overlays for images that are removed before idle scanning runs, preventing stale page-turn scans from painting old or missing content.
- Hosted docs Japanese mode now localizes the Tools/Guides nav, theme-toggle labels, and home-page Next Steps cards, including the PDF reader card.
- Hosted light/dark switching now treats the stored よむ theme as authoritative and cleans up Greasemonkey storage listeners, avoiding flashes when settings or multiple tabs change theme.
- Keyless public JPDB search, vocabulary, and pitch lookups now persist successful results in a local browser cache, reducing repeat public/proxy requests for hosted visitors.

## [1.4.5] - 2026-06-18

### Changed

- PDF reader is now more native to よむ and far smoother to read:
  - **No more competing OCR overlay.** PDF.js exposes an accurate selectable text layer, so the runtime reads it natively (popups, furigana, mining) and no longer also runs image-OCR over the same page — the chaotic double-painted OCR boxes are gone. Manual OCR still works for genuinely scanned pages with no text layer.
  - **Native page scrolling with a sticky toolbar.** The document scrolls with the page (mouse wheel / trackpad / keyboard just work) instead of an inner scroll box, and the brand bar + page/zoom controls stay pinned at the top.
  - **Sensible default zoom.** Fit-width is capped to a readable column so a small page no longer balloons to 300%+ on wide monitors.
  - **No black flash when zooming.** Pages are re-rendered into an off-screen canvas and swapped in only when ready, so the visible page never blanks to black mid-zoom.

## [1.4.4] - 2026-06-18

### Added

- When both a JPDB and a Jiten API key are set, the lookup popover shows a small ⇄ toggle next to the Jiten/JPDB status. It switches which SRS the deck and grade buttons act on (persisted), so a word present in both services can be graded into either. The settings connection check now reports "Connected to Jiten and JPDB." when both keys are configured.
- The kanji card now shows Jiten and JPDB kanji facts side by side (when both are available) instead of only the active provider.

### Changed

- Kanji-fact sources are labelled simply "JPDB" and "Jiten" instead of "Readings and components" / "Jiten kanji facts".
- Jiten words now use the same Add to deck / Never forget / Blacklist actions as JPDB; the separate Mining / Suspended / Forget row was removed.

### Fixed

- Grading a word in the toggled-to service no longer reads the other service's deck state: the chosen provider's card state is refreshed on switch, and a JPDB word that also exists in Jiten is only treated as gradable in Jiten on an exact spelling+reading match.

## [1.4.3] - 2026-06-18

### Fixed

- PDF reader: large and scanned PDFs (e.g. 90–130 MB image-heavy workbooks) could crash the tab and render upside-down with the page stuck in a black corner. The renderer now bakes device-pixel scaling into the page viewport instead of a canvas transform (fixes the orientation/black-corner artifact), **caps each canvas to a safe pixel budget and maximum dimension** so it never exceeds the browser's canvas limit, **cancels in-flight renders** when you zoom/fit/resize (fixes the "Cannot use the same canvas during multiple render() operations" crash), **evicts off-screen pages** and **limits render concurrency** so memory stays bounded on 200+ page books, and renders the first page immediately instead of a batch. Opening, zooming, and scrolling large PDFs are now fast and stable.

## [1.4.2] - 2026-06-18

### Fixed

- The Jiten and JPDB definition panels are no longer shown on their own sites — on `jiten.moe` the redundant **Jiten** panel (definitions + "used in vocabulary") is suppressed, and on `jpdb.io` the **JPDB** panel is suppressed, since the native page already shows that source. Other added sources (your dictionaries, Immersion Kit, kanji practice, study tools) still appear, and both panels remain available everywhere else. The native-page addon no longer leaves an empty "No definitions" box when the self-site source was its only content.

## [1.4.1] - 2026-06-18

### Added

- Traffic-funnel content for SEO: a new `/guides/` hub plus four how-to guides — read manga in Japanese (free OCR setup), mine sentences from anime & YouTube to Anki, comprehensible-input YouTube (with a levelled N5–N1 channel list drawn from the in-app starter guide), and Yomitan vs JPDB vs Anki — and a `/compare/migaku-alternative` page. Each targets a distinct search intent, ships matching `FAQPage` structured data, and links down to the relevant tool page and install. Added a `Guides` nav entry and sidebar group, plus "Related guide" cross-links from the OCR, subtitle, YouTube, and JPDB tool pages and a guides card on the home page.

## [1.4.0] - 2026-06-18

### Added

- **Hosted PDF reader** (`/pdf-reader/`): open or drop any PDF and read it with よむ — no userscript install required. Pages render fully client-side with [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0, vendored), drawing each page to a canvas for full fidelity (images, figures, multi-column layouts, CJK fonts via cMaps, and scanned-image codecs JBIG2/JPEG2000) with a selectable text layer over it that the よむ runtime scans for popup lookup, mining, and furigana. Image-only/scanned pages are flagged and fall through to よむ's OCR. Files are opened locally in the browser tab and never uploaded. Includes page navigation, zoom/fit-width, continuous lazy rendering for large documents, per-document reading-position memory, and theme/accent/interface-language synced with your よむ settings.
- New `yomu-pdf-reader` site-parser and `/pdf-reader/` route so the runtime recognises and enhances the hosted reader's text layer, plus a `PDF Reader` link in the docs navbar, the in-app overflow menus, the Settings help links, and the docs home/support pages.

## [1.3.30] - 2026-06-18

### Changed

- SEO overhaul for the docs site and hosted apps. Every page now emits a correct per-page canonical URL and `og:url` (previously every page declared itself the home page, a duplicate-content signal and wrong social card), plus per-page titles, meta descriptions, and Open Graph / Twitter tags. Added an auto-generated `sitemap.xml`, a `robots.txt`, and JSON-LD structured data (`SoftwareApplication` + `WebSite` on the home page, `FAQPage` + `BreadcrumbList` on the tool pages). Internal planning/research docs (ADRs, backlogs) are now `noindex` and excluded from the sitemap.
- New `/tools/` hub plus six keyword-targeted free-tool landing pages (Japanese OCR & manga reader, furigana reader, kanji stroke order, subtitle miner & video reader, JPDB study, YouTube immersion filter), each with its own FAQ schema and cross-links, so individual tools can rank on their own.
- The hosted new-tab study page and video player now carry descriptive titles, meta descriptions, canonical URLs, and Open Graph tags so those standalone tool URLs are indexable.

## [1.3.29] - 2026-06-18

### Fixed

- The YouTube subtitle transcript panel no longer overlaps the video when docked to the left on the single-column watch layout (narrow windows / iPad). YouTube hoists the player out of `#primary` into an absolutely-positioned full-bleed container in that layout, so shifting only the metadata column left the player covering the panel; the full-bleed player container now gets the same side inset and slides clear of the panel.

## [1.3.28] - 2026-06-17

### Fixed

- Furigana for inflected words now stays aligned to the kanji when the reader falls back to a dictionary-form card reading. For example, `読んで` now shows `よ` over `読` instead of centering `よむ` over the full surface.

## [1.3.27] - 2026-06-17

### Fixed

- Selection token-choice popovers now show a compact translation by default and no longer show the redundant parsed-source line. Added an Appearance setting to turn selection-popover translations off.
- Mokuro catalog card titles are scan targets again, keeping line-clamped titles lookupable with ruby annotations.
- The OCR concurrency regression test now matches the current behavior restored in 1.3.21: iPad follows the configured OCR concurrency instead of forcing serial scanning.
- The visible-page scanner batching regression test now waits deterministically for continuation scans under slower CI runners.

## [1.3.26] - 2026-06-17

### Fixed

- Selection token-choice popovers now show a compact translation by default and no longer show the redundant parsed-source line. Added an Appearance setting to turn selection-popover translations off.
- Mokuro catalog card titles are scan targets again, keeping line-clamped titles lookupable with ruby annotations.
- The OCR concurrency regression test now matches the current behavior restored in 1.3.21: iPad follows the configured OCR concurrency instead of forcing serial scanning.

## [1.3.25] - 2026-06-17

### Fixed

- Selection token-choice popovers now show a compact translation by default and no longer show the redundant parsed-source line. Added an Appearance setting to turn selection-popover translations off.
- The OCR concurrency regression test now matches the current behavior restored in 1.3.21: iPad follows the configured OCR concurrency instead of forcing serial scanning.

## [1.3.24] - 2026-06-17

### Fixed

- Support-page cards now use relative links for the video player, study page, and docs home instead of hard-coded `/yomu-reader/` production paths. This keeps the generated video-player link working across deploy contexts.

## [1.3.23] - 2026-06-17

### Fixed

- Selection token-choice popovers now show a compact translation by default and no longer show the redundant parsed-source line. Added an Appearance setting to turn selection-popover translations off.
- Closing a selection popover continues to keep the highlighted text without immediately reopening the same selection lookup.

## [1.3.22] - 2026-06-17

### Fixed

- BookWalker/iPad bottom-sheet lookups now keep their own vertical scroll gestures instead of letting the host viewer's page-level touch handlers swallow them. This restores scrolling inside long dictionary sheets while keeping the sticky sheet modeless.

## [1.3.21] - 2026-06-17

### Fixed

- Mokuro continuous/autoscroll readers no longer keep OCR frames and overlays for old offscreen CSS-background pages. Yomu now keeps only the active viewport-near raster surfaces, so long manga strips do not accumulate hundreds of hidden frame images while scrolling.
- Mokuro native `.textBox` scanning is now viewport-near and bounded, with visible boxes prioritized over old offscreen pages. This keeps Yomu responsive even when image OCR is disabled and mokuro has mounted hundreds of text boxes.
- Reverted the previous iPad-only OCR budget throttle: OCR concurrency, image-reader prefetch, and dark-panel second-pass behavior again follow the user's settings.

## [1.3.20] - 2026-06-17

### Fixed

- Greasy Fork companion `@require` URLs now include the Yomu package version as a query parameter before the SRI hash. This forces userscript managers to refetch the matching companion bundle when the main script updates, avoiding stale-cache SRI failures such as Firefox loading an older `yomu-video.user.js` against a newer `yomu.user.js`.

## [1.3.19] - 2026-06-17

### Fixed

- BookWalker Firefox/iPad mirror replay now fetches clean source images through the same `GM_xmlhttpRequest` `arraybuffer` path proven by the mirror probe, then wraps the bytes in a `Blob` locally. This avoids userscript-manager differences around `responseType: "blob"` that could leave the tainted canvas path with no rebuilt OCR frame and no spinner.

## [1.3.18] - 2026-06-17

### Fixed

- BookWalker Firefox/iPad clean-source mirror replay is now used when clicking or tapping a tainted viewer canvas: the manual pointer path waits for the async mirror snapshot before enqueuing OCR, so the hidden OCR frame can be created and the loading spinner can start instead of the click returning before any frame exists. Added focused coverage for clean-source mirror replay and manual tainted-canvas activation.

## [1.3.17] - 2026-06-17

### Fixed

- iPad OCR now uses a lighter automatic budget: serial OCR, no extra manga-page lookahead beyond the normal margin, and no automatic dark-panel second pass. This keeps mokuro/BookWalker OCR from monopolizing Safari's main thread and makes tap-to-open dictionary popovers responsive again.
- The puck radial menu spaces actions farther apart and places the audio toggle immediately after the power toggle, keeping the green controls together.
- Closing a text-selection lookup now keeps the page selection without immediately reopening the same selection popover.

## [1.3.16] - 2026-06-17

### Fixed

- Video, OCR, and other Greasy Fork companion libraries now publish their registry on both the userscript sandbox global and `window` when those objects differ. This keeps the main reader from falling back to “Video companion is missing; related features are disabled.” in userscript managers that split `@require` companion code and the main script across globals.

## [1.3.15] - 2026-06-17

### Fixed

- BookWalker OCR never started on Firefox (no spinner): the recorder installer called `state()` before injecting the page-world recorder, which created a sandbox-compartment state object on the page window; the injected page recorder then reused that object, so its recorded ops lived in the sandbox compartment and the main-world reader read an empty map. The Firefox/different-realm path no longer touches `state()` before injection — the injected page script creates the page-compartment state itself, so the reader can read the recorded descramble ops. iPad/Chrome (same realm) are unchanged.

## [1.3.14] - 2026-06-17

### Added

- The puck radial menu gains a mute toggle for auto-play term audio. The node swaps between a speaker and a muted-speaker icon (accent when on, grey when muted) and pauses/restores `Auto-play term audio` without opening settings; unmuting from a fully-off auto-play mode restores playback.

### Fixed

- Hosted docs runtime now appends the settings/video companion scripts before its early-return, so the companions stay available when the core reader runtime already exists (e.g. an installed userscript). A refactor had moved the append after the early-return, dropping companions in that case.
- The new-tab study "No cards." empty state no longer splits its wordmark and message into opposite corners on coarse-pointer landscape tablets.

### Verified

- Full typecheck/test/build suite (the hosted-companion regression test now passes), plus a live browser check of the puck audio toggle on the docs runtime.

## [1.3.13] - 2026-06-17

### Fixed

- BookWalker OCR still didn't fire on Firefox (it works on iPad): the canvas-mirror recorder ran in the Tampermonkey content sandbox while the OCR reader runs in the page main world, and Firefox won't let a sandbox-created state object be defined on / read from the page window (Xray compartments). The recorder is now injected into the page main world when the realms differ (via a Trusted-Types-safe `<script>`), so its state and recorded ops are page-compartment objects the reader can read directly; the same-realm direct patch is kept for iPad/Chrome. Fixed an arity bug in the injected recorder (it reads `arguments`, which includes the source image, so the 9/5/3-arg drawImage forms map coordinates from index 1).

## [1.3.12] - 2026-06-17

### Fixed

- Hosted docs cold starts no longer wait several seconds on optional public Jiten enrichment before pitch/furigana classes can land. Profiling the live homepage showed the Try Me sample hitting public Jiten `vocabulary/parse` through the proxy and receiving upstream 5xx responses; that route now uses a short 1.5s background timeout, shared parse backoff, and abort-aware transient detection so fallback rendering and JPDB pitch enrichment can continue promptly.
- The hosted docs loader now preloads the core reader script and lets normal docs load it before optional settings/video companions, reducing contention before the first visible annotations.
- The hosted Try Me samples now opt into visible furigana for demo text, so the landing page shows the reading aid clearly even though the default reader setting still hides ruby on easier kanji elsewhere.

## [1.3.11] - 2026-06-17

### Fixed

- BookWalker two-page spreads only OCR'd the right page on Firefox/iPad. A spread is composited from one reused buffer (render right → composite right → render left → composite left), so the rebuild visits that buffer twice at different sequence bounds. The source-image URL collector used a shared "seen" set and skipped the second visit, so the left page's image was never fetched and rendered blank. The collector now uses per-path "seen" copies (matching the rebuild), so both pages' source images are fetched and both halves OCR.

## [1.3.10] - 2026-06-17

### Fixed

- BookWalker OCR still didn't fire on Firefox/iPad after 1.3.8: the canvas-mirror recorder is installed from the Tampermonkey content sandbox while the OCR reader runs in the page main world — different JS realms with different `globalThis`, so the "shared" recorder state wasn't actually shared (`recorded: false`). The recorder state is now anchored on the page window (`unsafeWindow`/`window`, the same object from both realms) and records are keyed by a DOM-attribute id (the DOM is shared across realms) instead of per-realm object references. `captureCanvasMirror` also lazily installs the recorder as a safety net. A diagnostic probe confirmed the sandbox/main-world hooks all capture the viewer's descramble ops and the rebuild is readable on Firefox.

## [1.3.9] - 2026-06-17

### Added

- The settings puck now opens a radial menu of context actions instead of jumping straight to settings. It blooms out of the puck with the kanji-map visual language — accent-haloed circular nodes, soft elevation, a springy staggered reveal, and a faint page scrim — and always fans into the open screen quadrant so a corner puck never throws nodes off-screen. Actions: a power toggle that pauses/resumes all annotations (the puck colour goes grey when paused and the page reads natively until resumed), open settings, scan the page, open the study page, and — only on YouTube — toggle the immersion filter. Each node shows its label as a pill above it on hover/focus.
- A new "Manual scan only" option (Settings → Reader, and the welcome page) stops automatic scanning so a page is read only when you tap the puck's Scan action or press the scan shortcut.

### Verified

- Full typecheck/test/build suite, plus a live browser check on the docs runtime: open, pause (annotations stripped, puck greyed, scan disabled), resume (page re-scanned), and the tooltip-above-node layout.

## [1.3.8] - 2026-06-17

### Fixed

- BookWalker OCR on Firefox/iPad (1.3.7's canvas mirror) did nothing because the document-start recorder ships in the main userscript bundle while the capture path ships in the OCR companion bundle — separate module instances, so the reader queried an empty op map. The recorder state now lives on a shared global, so the companion sees the recorded descramble ops. Added an opt-in diagnostic (`localStorage['yomu.canvasMirrorDebug'] = '1'`) that logs `[Yomu][canvas-mirror]` capture metrics.
- Favicons (`apple-touch-icon`, `favicon-32x32`, `favicon-16x16`) are now rasterized from the canonical `yomu-icon.svg` via a new `scripts/generate-favicons.mjs`, replacing stale art that no longer matched the logo.

### Verified

- canvas-mirror unit tests plus the full typecheck/test/build/verify suite.

## [1.3.7] - 2026-06-17

### Fixed

- BookWalker OCR now works in userscript managers on Firefox and iPad/Safari, where the DRM page canvas is cross-origin "tainted" and cannot be read. A document-start recorder captures the viewer's own descramble `drawImage` tile-copies, then rebuilds the current page onto a fresh, untainted canvas by replaying those copies from an origin-clean image fetched via `GM_xmlhttpRequest`. No descramble keys or crypto are reimplemented — it mirrors whatever the engine actually draws, so it survives viewer updates and reconstructs two-page spreads correctly. The path is gated to BookWalker hosts and only runs when the canvas is tainted, so Chrome and the Yomu extension are unaffected.

### Verified

- New canvas-mirror unit tests (op selection, recursive buffer reconstruction, recorder hook) plus the full typecheck/test/build/verify suite.

## [1.3.6] - 2026-06-17

### Fixed

- Auto-translated subtitle tracks now update primary and secondary cue state in the same tick, and the primary line stays visible while its aligned translation is still active.
- The generated extension build keeps the BookWalker visible-tab screenshot bridge available while avoiding an unused exported helper in the userscript bundle.

### Verified

- Focused subtitle-controller, OCR raster, extension hardening, and typecheck gates.

## [1.3.5] - 2026-06-17

### Fixed

- BookWalker Firefox/iPad extension OCR now captures protected rendered canvases through a visible-tab screenshot bridge instead of falling back to fetched NFBR source images, because those source assets can be scrambled before the viewer composites the real page. Readable rendered canvases still wait for stable page pixels before OCR, avoiding stale transition captures.
- Compact media tiles outside YouTube now suppress furigana only through generic layout/media heuristics, not custom site parsers or URL/class-name allowlists, so clipped grids keep pitch colouring and dictionary lookup without ruby breaking the card height.
- Yomu floating controls, settings tabs, and settings buttons now keep their own colours and layout against aggressive host-page CSS.

### Verified

- Focused canvas-reader, OCR raster, extension hardening, settings CSS, and compact media/YouTube target tests.

## [1.3.4] - 2026-06-17

### Fixed

- BookWalker/iPad OCR: tainted canvas readers now fall back to the GM-fetchable source page image when Firefox/WebKit cannot read canvas pixels, page turns release stale OCR frames, and storefront pages opt out of generic DOM scanning so Yomu no longer breaks the carousel/navigation layout.
- OCR interactions: tapping an OCR word on iPad opens the lookup immediately, OCR hover popovers no longer flicker when the pointer crosses non-Japanese text inside the same OCR line, and fallback parsing keeps single-kanji godan-s verbs such as `騙した` in dictionary form with pitch/furigana.
- YouTube stability: non-destructive mirrors wait until replacement text is ready before hiding native text, reuse stable attributed-string hosts, restore hidden titles if YouTube rerenders the host, and reduce no-key parsing contention on live/comment-heavy pages.
- Settings dialog Japanese: passive parsed settings copy can open dictionary popovers without stealing or clearing the user's selection, command/tab labels still activate the settings UI, and the settings-dialog tests now mock the slow form/deck seams correctly.
- Site scanning: Bloomee landing-page headings such as `季節のお花を、かんたんに飾れる` are now eligible for furigana/pitch annotation, while image-only copy still requires OCR.

### Added

- Release probes/tests for BookWalker live canvas diagnostics, source-image fallback OCR, BookWalker storefront scan suppression, repeated mirror rescans, YouTube no-key/keyed parsing behavior, Bloomee styled headings, and settings passive lookup/selection preservation.

## [1.3.3] - 2026-06-17

### Added

- Welcome/onboarding panel: its Japanese (eyebrow, intro copy, the five feature descriptions, option labels, and action buttons) is now annotated with furigana and pitch-accent colouring through the same nested-parse path used for popovers and the settings dialog. The panel is a reader root (excluded from page scanning), so it now opts in explicitly via `jpdb-reader-parseable` and re-annotates after a settings-language switch. Only runs when the interface language resolves to Japanese; English copy is left untouched.

## [1.3.2] - 2026-06-17

### Fixed

- BookWalker (NetFront/NFBR viewer): the on-screen page-buffer marker (`.currentScreen`) is now matched on the page’s own `#viewport` container rather than any ancestor, so a `.currentScreen` that ever lands on a shared ancestor such as `#renderer` can no longer select both double-buffered pages at once (a duplicate, shared-quota Google Lens call plus a stale overlay for the off-screen page). Composes with the rendered-content preference and still falls back to all page canvases before any buffer is marked current (e.g. the cover).
- YouTube kana-only titles and metadata now keep contiguous hiragana words together during fallback parsing, avoiding over-segmentation such as `にほんご` becoming separate mini-tokens while preserving real particle and inflection boundaries.
- Hover popovers now re-anchor to the equivalent refreshed word node when YouTube replaces a mirrored title/metadata node under a stationary cursor, preventing reactive page updates from auto-dismissing the popup.

### Verified

- Live injected-userscript probe on the real `viewer.bookwalker.jp` viewer (opened via the free read flow) and the trial viewer, single page and landscape double-page spread: one canvas captured per visible screen, OCR text + clickable words render, the dictionary popover opens on click, and the per-page OCR loading spinner shows during the scan.

## [1.3.1] - 2026-06-17

### Fixed

- Hosted-page image OCR cache hits now render immediately after refresh and pending OCR cache writes flush on pagehide/visibility changes, so stable docs screenshots do not wait for another recognizer pass before their overlays come back.
- OCR cache persistence now ignores volatile `data:` and `blob:` frame keys, keeping refresh-ready cached OCR focused on stable page images.
- BookWalker canvas OCR now falls back from a blank `.currentScreen` buffer to a painted sibling page buffer, recovering OCR on NFBR viewer pages where the visible buffer marker changes before the page is drawn.
- OCR furigana now anchors to each normalized base span instead of the wider word/line wrapper, so readings such as `いばしょ` stay over the specific kanji/base text they annotate.
- YouTube home no longer shows the curated channel subscription shelf, and failed/unknown channel preview probes no longer count as unsubscribed channels that can flash the shelf back into view.
- YouTube channel shelf refreshes are now structurally stable: preview hydration updates a row in place without rebuilding the action bar or replacing the full list.
- Compact YouTube feed/search/suggested titles keep lookup/color styling without furigana, preventing title clipping and the add/remove furigana churn caused by YouTube's frequent title rerenders.

## [1.3.0] - 2026-06-17

### Fixed

- YouTube attributed-string UI text no longer collapses mirrored furigana/underline rendering into narrow vertical stacks after YouTube re-renders feed titles, watch metadata, buttons, or comments. Inline hosts are promoted to a stable inline-block mirror container, then restored when the mirror is removed.
- Mokuro native OCR toggle changes are now handled at runtime: when Mokuro OCR/text boxes turn on, Yomu clears auto-painted image/canvas/background OCR overlays and suppresses cached or in-flight auto OCR results from repainting stale layers; when Mokuro OCR turns off, Yomu auto OCR resumes.
- Mokuro canvas/background reader frames now preserve the difference between automatic scans and user-requested scans, so automatic raster OCR is cleared when the native text layer takes over while manual scans remain visible.
- OCR async cleanup now quietly ignores stale scan state after toggle/destroy timing gaps instead of surfacing stale-state errors during cleanup.
- Image OCR highlight panels are a little more transparent by default, letting the page artwork show through more while keeping the active line readable.
- Jiten kanji facts now load in kanji dictionary popovers even when a JPDB key is configured alongside the Jiten key, so the Jiten frequency/readings/vocabulary panel appears on kanji drilldowns.
- Release/CI stability: the generated probe scripts are registered as fallow entry points, and the previously failing OCR stale-state test shard is covered by focused regressions.

### Verified

- Re-checked the bundled release against live signed-in YouTube home/search/watch/comment surfaces, ComicWalker canvas OCR, blank-canvas controls, status-dot/subtitle behavior, vertical OCR/pitch fixtures, and mobile docs hero breakpoints.

## [1.2.3] - 2026-06-17

### Fixed

- OCR interaction unit tests: mocked `getBoundingClientRect` on word spans in `hover-lookup.test.ts` to cover the hover/click coordinates `(40, 24)` and satisfy the new strict hit-testing.
- Test state leakage: added `localStorage.clear()` to the global `beforeEach` in `jpdb.test.ts` to prevent cached OCR data from bleeding between tests.

## [1.2.2] - 2026-06-17

### Fixed

- OCR hover interaction: restricted OCR line hover/click popovers to strictly trigger when pointer is over the actual text bounding box, rather than anywhere inside the line frame wrapper.
- Dark mode background parity: adjusted the light-mode OCR active background to be semi-transparent, aligning with the dark-mode layout.
- Removed unwanted text-shadow/glow styling from furigana elements inside OCR layers.

## [1.2.1] - 2026-06-17

### Fixed

- Landing page hero: shortened the Japanese action-button labels (よむをインストール → インストール, 学習アプリを開く → 学習) so the pills no longer wrap onto extra rows on mobile, and added breathing room between the よむ wordmark and the headline so the wordmark's underline (and its tap/hover target) no longer crowds the first line of the headline.
- Reverted the forced line break in the Japanese hero headline. Inserting a hard newline switched the headline to `white-space: pre-wrap`, which broke the in-place furigana rendering (readings went missing / misaligned until the line was re-selected). The headline now wraps with the reader's default behaviour so furigana renders consistently with the rest of the page.

## [1.2.0] - 2026-06-17

### Added

- Light-on-dark manga text is now read on mixed pages. A page often mixes black-on-white speech bubbles with white-on-black caption boxes/panels; inverting the whole page would just swap which half fails. Instead, when a page has a dark region that the normal recognition pass left unread, a second inverted pass runs and only its lines that fall over genuinely dark areas are merged in. So a dark caption box (e.g. 「嘘だろ……！！」) is recognized alongside the normal bubbles, with no extra request or latency on ordinary pages or dark panels the recognizer already read, and no spurious lines on light pages. Toggle: "Read light text on dark panels".
- Persistent OCR cache: recognized text for stable-`src` reader/article images is mirrored to `localStorage` (bounded by entry count and total size) so a page refresh re-renders recognized text instantly instead of re-running every recognizer request. Volatile `data:` frames (paused-video / canvas snapshots) are excluded.
- Image-based manga readers (Mokuro, MangaDex, etc.) now prefetch a sliding window of upcoming pages and raise the per-page image budget on reader-like pages — the same look-ahead canvas readers already get — so the next pages are recognized in the background before you reach them. Ordinary pages, where auto-OCR stays near the viewport, are unaffected.

### Changed

- Google Lens recognition falls through to the cookie-authenticated `lens.google.com` upload endpoint (per-user quota, sent with the Lens web client's `Origin`/`Referer`) when the shared keyless endpoint is throttled or returns nothing — reducing rate-limiting and recovering more text. The extra request only fires when the primary endpoint comes back empty, so request volume on pages that already read is unchanged.
- Furigana now uses a single tight outline instead of the word contrast glow, which was bleeding into the thin reading strokes and hurting legibility on busy manga backgrounds (tunable via `--jpdb-reader-furigana-shadow`).

### Fixed

- The YouTube channel shelf now clears its pending refresh when every channel is confirmed subscribed, so it doesn't keep re-testing/re-rendering after the shelf is removed.

## [1.1.2] - 2026-06-17

### Fixed

- Landing page hero now reads correctly on phones and tablets. The よむ wordmark is left-aligned (and sized as a label rather than the oversized display text it used to inherit on every breakpoint); the app-icon logo stays centered on phones; the headline and the action buttons hug the left edge instead of being centered/stacked as full-width blocks. On tablet widths the layout switches to the desktop-style two-column form (copy on the left, logo on the right) instead of stacking the logo on top with empty space beside it.
- The Japanese hero headline now breaks at the clause boundary — 好きなものを読んで / 日本語を学ぶ — instead of splitting a word (e.g. 読んで) across the line break. Keeping the word whole also restores its pitch-accent underline, which a mid-word wrap had been hiding.

## [1.1.1] - 2026-06-17

### Fixed

- Keyless parser no longer glues numeric episode/volume counters onto the following title words: a run like `1〜5話おまとめ版` now keeps `話` as its own counter token instead of merging into `話おまとめ` / `話おまとめ版`. The split is driven by the number-then-counter boundary, not a per-title list.
- Names such as `紫音` are no longer split into kanji component readings (`紫`=むらさき + `音`=おと) by a hand-coded reading table. Readings now come only from a dictionary the user has loaded: when a name dictionary (e.g. JMnedict) supplies `紫音`, the whole compound is kept with the dictionary's verified reading; when no dictionary knows the name, the parser faithfully reflects the single-kanji lookups instead of inventing a reading. (A single baked-in reading is wrong as often as right — `紫音` alone reads しおん / しいん / しのん / むらさき depending on the person.) Regression tests pin both behaviours.

## [1.1.0] - 2026-06-17

### Added

- Image and manga OCR now runs in parallel. A small concurrency pool (new "Parallel OCR requests" setting, default 3) replaces the old strictly one-at-a-time queue, so a reader page full of page images or canvases is read far faster. Work is deduplicated by image content, so a re-snapshotted canvas frame (canvas readers poll for page turns) never fires a redundant OCR call — the cache fills the duplicate in once the first scan resolves.
- Canvas and CSS-background manga readers (BookWalker, comic-walker / カドコミ, Mokuro, and other viewers) prefetch a sliding window of upcoming pages. A new "Canvas prefetch pages" setting (default 2) snapshots and OCRs the next few spreads in the background — extending the look-ahead to `ocrPrefetchPages` viewport-heights — so a page's text is ready by the time you scroll to it. Combined with parallel OCR, several spreads are read at once.
- New "Read light text on dark panels" setting (default on): dark panels (white text on a black background) are inverted once before OCR so polarity-sensitive recognizers (a local MangaOCR/PaddleOCR/Apple Vision server, etc.) can read them. The check is conservative — only dark-dominant panels with a minority of bright pixels are inverted, so normal pages are never touched and OCR is never run twice. It is a no-op for Google Lens, which already reads light-on-dark text.

### Verified

- Live on comic-walker.com (カドコミ): canvas-reader detection snapshots only the rendered page canvases (skipping the viewer's not-yet-painted blank placeholders), the sliding-window prefetch captures upcoming spreads while scrolling, and the parallel pool reads them concurrently — 70+ text lines recognized across several pages of a chapter.

### Fixed

- YouTube channel recommendations now cancel queued shelf refreshes when the shelf is removed and pause background preview probes during subscribe-all writes, preventing all-subscribed or dismissed shelves from briefly reappearing while YouTube subscription checks are still settling.
- YouTube channel shelf tests now wait for stable row/subscription states, keeping the release gate deterministic under GitHub's Node 24 runners.

## [1.0.5] - 2026-06-17

### Fixed

- JPDB review and search page enhancements now keep Immersion Kit examples stable, position example subtitles over the image correctly, show kanji doodle practice on unrevealed kanji fronts with the trace hidden by default, remember the native examples toggle state, and preserve native JPDB audio links.
- JPDB passive link-style words now open Yomu hover dictionaries reliably, while Jiten and JPDB study prompts suppress Yomu-added furigana for the word being quizzed.
- JPDB word-card backs now render the full local/Jiten/JPDB definition information, matching kanji cards and Jiten word pages.

## [1.0.4] - 2026-06-17

### Fixed

- YouTube channel recommendations now hide cleanly when the signed-in account is already subscribed to every curated channel, and the shelf no longer shows stale Subscribe rows or the "Previews load from YouTube on this page." footer copy.
- YouTube text mirrors no longer let ruby-room sizing write height onto YouTube description expanders, metadata rows, or action buttons, preventing watch descriptions from growing, metadata from stacking vertically, and action labels/channel metadata from flickering or clipping.

## [1.0.3] - 2026-06-17

### Fixed

- Jiten definition headwords no longer render the bracketed furigana annotation (e.g. `以[い]前[ぜん]`) as base text under the reading. The annotated `mainReading` is now stripped to clean base text and distributed as per-kanji ruby, matching the related-words rendering.

## [1.0.2] - 2026-06-17

### Fixed

- Image OCR text now reveals its pitch-accent underline and furigana on hover, not only when focused or pinned — matching how normal reader words behave on hover.
- Tapping an OCR text line on touch/pointer devices reliably activates its markup (pitch and furigana) before the dictionary popup's lookup handlers run, and a short post-tap guard keeps the follow-up click from immediately toggling the line back off. Previously the first tap could open the popup without the line ever showing its prepared pitch/furigana.

## [1.0.1] - 2026-06-17

### Fixed

- Audio-source rows in settings now keep the source dropdown and voice/URL box top-aligned, including Japanese option helper text.

## [1.0.0] - 2026-06-16

### Added

- Image OCR now treats manga reader raster pages as first-class scan surfaces: BookWalker/ComicWalker-style `<canvas>` pages and Mokuro CSS `background-image` pages are converted into invisible OCR anchors and aligned with the existing overlay pipeline.

### Fixed

- Mokuro pages now trigger Yomu OCR when Mokuro's own OCR layer is turned off, including installed-library reader pages that render each page as a CSS background image instead of an `<img>` or `<canvas>`.
- BookWalker and ComicWalker OCR now wakes up reliably when canvases mount after startup, waits until a canvas has real page pixels before scanning, and captures every visible spread canvas instead of only the first readable side.
- Hosted Yomu docs no longer annotate the oversized hero brand text, avoiding the huge/shifted ruby and pitch overlay on the main logo.

## [0.7.90] - 2026-06-16

### Changed

- Image OCR now uses the compact spinner indicator only: no expanded scanning card and no dismiss control. The same compact indicator covers normal images and paused-video frames.
- OCR image/video loading copy is consistently "Scanning..." in accessible labels.

### Fixed

- OCR text keeps pitch and furigana prepared as soon as it renders, so tapping an image text segment reveals the furigana and pitch underline instantly; clicking away hides both again without rebuilding the line.
- Brand/logo/icon images, including the hosted Yomu logo, are skipped by image OCR, and images that return no OCR text are remembered so repeat hovers do not rescan them.

## [0.7.89] - 2026-06-16

### Added

- Settings now sync between the hosted reader (`hrussellzfac023.github.io/yomu-reader/newtab/`) and the userscript. The hosted page runs in the page's main world, which has no `GM_*` APIs — those live only in the userscript's content world — so settings saved on the hosted page previously stayed in that origin's `localStorage` and never reached the shared GM storage the userscript reads on jpdb.io and everywhere else. A new GM storage event-bridge (mirroring the existing HTTP bridge) lets the hosted page route `gmStorageGet`/`set`/`delete`/`listValues` to the userscript's GM storage, scoped to Yomu-owned keys. Edits on the hosted page now reach the userscript, and if the userscript is installed *after* settings were already saved on the hosted page, the existing localStorage→GM migration seeds them into GM on the next hosted load.

### Fixed

- Audio sources (Jisho, JapanesePod101, jiten, etc.) now play on the hosted reader with the userscript installed. The reader was routing cross-origin audio fetches through the userscript HTTP bridge even on the hosted page, but that bridge serialises responses as JSON and cannot carry binary audio Blobs across the content/page world boundary — the Blob arrived empty, playback failed, and the error was swallowed (`No playable audio found` with an empty `errors` list). On the hosted (newtab) runtime the reader now prefers a direct fetch through the public worker proxy, which serves that same media with CORS headers and returns a real Blob; the bridge remains a fallback. Off the hosted runtime (a real userscript on jpdb.io etc.) the bridge is still preferred, since its `GM_xmlhttpRequest` is exempt from the page's CSP.
- The audio settings preview no longer shows a "Playing よむ…" toast when nothing audible actually plays. The toast was shown optimistically before playback resolved, and `play()`'s boolean result was ignored — so a silent miss (no source resolved and the chime fallback disabled) still claimed playback. The toast now appears only when playback succeeds; otherwise an "Audio preview failed" toast is shown.
- `No playable audio found` now reports the underlying error(s) instead of an empty list. Candidate-preparation failures (CORS, non-audio responses, blob fetch failures) were being swallowed in two code paths, so genuine audio failures looked like "nothing found" with no diagnosis. Those errors are now collected and logged.

## [0.7.88] - 2026-06-16

### Fixed

- YouTube page furigana no longer duplicates text or thrashes (a word repeatedly "flashing" while it re-rendered), which had also degraded watch-page performance. The non-destructive furigana text-mirror was being re-ingested by the passive-interaction scan path (used for every site-profile root, including YouTube): a rescan of a mirror host re-collected the mirror's bare gap text nodes — punctuation/ASCII such as `（Googleによる翻訳）` — *alongside* the still-present (hidden) original host text, doubling the collected text (e.g. `原文を見る（Googleによる翻訳）` rendered twice) and self-perpetuating into a rebuild loop on YouTube's constantly-mutating DOM (caption/translation strip, chrome). `PASSIVE_AWARE_FRAGMENT_SKIP_SELECTOR` now skips `.jpdb-reader-text-mirror` (matching the base skip list), so the reader's own mirror is never re-scanned — the chrome is still annotated, just not doubled. The mirror host's `visibility:hidden`/`position:relative` are also re-asserted when YouTube re-renders and strips our inline styles, preventing the original text from reappearing beside the mirror (duplication) or the mirror anchoring to the wrong ancestor (misalignment).

## [0.7.87] - 2026-06-16

### Changed

- On mokuro readers, mokuro's own "OCR enabled" overlay now defaults off (once, before mokuro loads its settings) so the reader's sharper OCR runs on the page by default; turning mokuro's toggle back on is respected and the reader defers to mokuro's text boxes again. The "OCR enabled" toggle label is annotated to make clear it now switches between Yomu OCR (off) and mokuro OCR (on).

## [0.7.86] - 2026-06-16

### Changed

- Canvas-based manga readers are now detected generically, not just on a host allowlist. Any reader that paints page images onto a `<canvas>` qualifies when the canvas is large and page-shaped, prominent in the viewport, and carries a rendered raster image (the decoded page) — verified live on Shonen Jump+ (shonenjumpplus.com) in addition to BookWalker and ComicWalker. The rendered-image test keeps the path off WebGL games, charts, vector/UI canvases and blank buffers, and skips cross-origin-tainted canvases that can't be read; known reader hosts and reader page-counters keep a lenient size/shape-only fast-path.

## [0.7.85] - 2026-06-16

### Changed

- On mokuro readers the image OCR now follows mokuro's own "OCR enabled" (displayOCR) setting: when mokuro OCR is off, the reader runs its own sharper, more touch-friendly image OCR on the page instead of deferring to mokuro's built-in engine; when it is on, the reader keeps using mokuro's native text boxes.
- The OCR loading/ready status card (with the dismiss-to-compact spinner) now appears on every OCR'd image, not just paused video frames, so slower image OCR shows progress.

### Fixed

- The "title flips between plain and annotated" loop on reconciling single-page apps (e.g. the mokuro.moe catalog): a host whose annotation is repeatedly reverted now switches to the non-destructive text mirror, which overlays the annotation without mutating the app's own node, ending the loop for any such site.

## [0.7.84] - 2026-06-16

### Fixed

- The word-card headword now shows the pitch-accent underline (matching words on the page) when a pitch pattern is known. The headword was rendered as `.jpdb-reader-spelling` without a pitch class, so it only showed the pitch graph and never the colored underline. It now carries its `jpdb-pitch-*` class and reuses the same per-pattern pitch colors (e.g. odaka teal, heiban blue); words without a known pitch are left undecorated.

## [0.7.83] - 2026-06-16

### Fixed

- Jiten related-words / used-in lists now distribute furigana per kanji using the annotated reading (e.g. 読み取る renders 読(よ)み取(と)る) instead of placing the whole reading (よみとる) over the whole word. Okurigana stays as plain base text and is no longer shown as if it were a kanji reading.

## [0.7.82] - 2026-06-16

### Added

- YouTube channel shelf now records when every curated channel is subscribed (or can no longer be resolved) and stops re-testing subscription status on each render. The flag is keyed by a signature of the channel list, so editing the curated list automatically re-tests against the new set. Channels that were deleted, moved, or renamed are treated as unresolvable and never block the all-subscribed state or raise errors.

## [0.7.81] - 2026-06-16

### Fixed

- A Jiten API key (starts with `ak_`) pasted into the JPDB API key box now moves to the Jiten API key box once the field is committed, instead of staying displayed in the JPDB box. The key was already routed to the Jiten credential internally; now the visible inputs match where each key belongs (a genuine JPDB key stays put).

## [0.7.80] - 2026-06-16

### Fixed

- Jisho.org audio now works on the hosted reader. Without a userscript, jisho.org cannot be fetched directly (CORS) and the public proxy fails its TLS handshake with jisho (525), so the fallback scraped the text proxy's markdown rendering — which drops the audio `<source>`, leaving jisho silent. The reader now requests the raw jisho HTML from the text proxy and parses the `<audio id="audio_{word}:{reading}"><source>` element with the same logic as the userscript path and yomitan, so the pronunciation resolves and plays.
- Guarded toast cleanup against a torn-down document so a toast's exit timer can no longer throw an unhandled "document is not defined".

## [0.7.79] - 2026-06-16

### Changed

- Moved the text-selection popover's action pills (Jiten/JPDB/Jisho/Copy/Yomu) to the top, directly under the title, so they are reachable without scrolling past a long parsed token list.
- Compacted the Japanese docs hero: the in-place parsed tagline now uses a smaller display size with balanced wrapping, so furigana no longer pushes it into a tall, sparse column (less wasted space).

### Fixed

- Selection popover word buttons no longer fall through to the page word underneath the popover. Because the popover overlaps page text, clicking a parsed token could resolve the underlying word by point geometry and open *its* dictionary at the wrong location (shifting the popover); document click handling now ignores clicks on the popover's own controls.
- Text selection now opens the lookup popover consistently once the selection settles, including iPad selection-handle and loupe adjustments that do not emit a fresh `mouseup`/`touchend` — a debounced `selectionchange` trigger covers them.

## [0.7.78] - 2026-06-16

### Fixed

- Showed the subtitle control rail on tall portrait video players (e.g. iPad reels/shorts-style pages) that fill most of the viewport height. The player-frame resolver previously treated any viewport-sized wrapper as a page container, so on portrait players the frame collapsed to the bare `<video>`, player affordances were not detected, and the rail was hidden (`display:none`); landscape players were unaffected. Tight wrappers that hug the video now resolve as the player frame, while oversized page containers that leave room for other content are still ignored.
- Isolated keyless YouTube subtitle pitch enrichment from the shared visible-page lookup budget, bounding public fallback pitch lookups through Jiten's batched `lookupMany` so long transcripts do not starve visible page text.
- Rebuilt visible keyless YouTube transcript rows after cheap provisional parsing, and kept provisional subtitle cache entries out of session storage until they have been enriched with furigana/pitch.
- Tightened Jiten public batch parsing so ambiguous short terms are separated during unauthenticated lookup, preventing missing characters in Jiten-derived words.
- Split leading particles from Segmenter particle+noun compounds such as `日本語の森`, preserving the expected word boundaries for hover and pitch/furigana enrichment.

## [0.7.77] - 2026-06-16

### Added

- Automatic OCR for canvas-based manga readers (notably the BookWalker browser viewer at `viewer.bookwalker.jp` / `viewer-trial.bookwalker.jp`): each page `<canvas>` is snapshotted to a pointer-transparent, invisible overlay and read by the existing OCR pipeline, re-snapshotting automatically on page turns. The snapshot lets the host's own page-turn taps/swipes pass straight through.

### Fixed

- Remove duplicate clearTranscriptVirtualRender method implementation to resolve typescript compilation errors.
- Adapted Playwright QA integration test assertions and locators to support ruby/furigana text nodes in the DOM.
- Prevented userscript network globals leakage by resetting GM_xmlhttpRequest and GM in Vitest beforeEach setup.
- Mokuro readers (`reader.mokuro.app`, opened from `mokuro.moe`) now read mokuro's accurate native text boxes instead of *also* re-running image OCR (Google Lens) on the same artwork. The redundant pass dropped characters the native layer already had (e.g. 事) and painted a competing overlay over the page. Manual scanning is still available for panels mokuro itself missed.

### Changed

- Clearer OCR provider settings so setup is obvious: "Google Lens — free, no setup (recommended)", "Google Cloud Vision — needs API key", and "Local OCR server — advanced", each with provider-specific help; the local engine list labels MangaOCR (best for manga) and Apple Vision (macOS).
- Larger tap targets for manga words on touch devices, making lookups easier to hit without a stylus.

## [0.7.76] - 2026-06-16

### Fixed

- Fixed YouTube DOM instability on real watch pages where decorated title, channel, viewer-count, and live-chat text could disappear, reappear, or duplicate after YouTube/Polymer rerendered managed text nodes.
- YouTube watch metadata now uses DOM-safe mirrors for ruby and pitch, avoids hidden rolling-number text in watch-info rows, prevents nested enhancement wrappers, and covers current live-chat teaser and `/live_chat` iframe surfaces.
- Added real-YouTube smoke coverage for the target watch page, a normal watch page, the home feed, and a live-chat watch page, including sustained rerender/scroll/hover checks, duplicate-wrapper checks, missing-parsing checks, and idle reparse sanity.

## [0.7.75] - 2026-06-16

### Fixed

- Kept YouTube transcript resize/orientation responsive by aborting transcript row hydration and background parse warmup during drag, then resuming it after the panel settles; this removes the parse/DOM work that could fight the resize loop on iPad.
- Added a Playwright resize profiler for iPad landscape/portrait, iPhone, and desktop that measures open, drag, page scroll while the panel is open, and orientation changes for right/left/bottom transcript placements.
- Revalidated iPad YouTube left/right/bottom placement with screenshot-backed DOM evidence: left and right shift the video plus title/actions/description beside the panel, while bottom overlays without resizing the player.

## [0.7.73] - 2026-06-16

### Fixed

- Initial YouTube DOM-safe text decoration release for watch/home surfaces; superseded by 0.7.76 after real-site verification found YouTube watch-info rolling-number and live-chat iframe coverage needed the additional hardening above.

## [0.7.72] - 2026-06-16

### Fixed

- YouTube bottom transcript mode no longer mutates YouTube player dimensions or dispatches resize nudges while opening or resizing the drawer, removing the expensive reflow path that made panel open/resize feel slow and keeping the video frame stable as the drawer moves.
- iPad/tablet YouTube left/right transcript placements now stay side-docked when explicitly selected, including the `m.youtube.com` tablet DOM, shifting the player and watch metadata beside the panel instead of falling back to bottom or covering the video.
- YouTube bottom mode now caps its default drawer height to the space below the video when possible, stays flush with the visual viewport, and keeps title/metadata/action/description widths normal; the Playwright matrix now proves iPad/mobile/desktop bottom resizing does not call YouTube `setSize` or touch player sizing.

## [0.7.71] - 2026-06-16

### Fixed

- Repaired the 0.7.70 release lane CI failures by aligning YouTube safe-DOM expectations with the scanner behavior, rerunning the previously failing shards, and restoring the missing smoke script entries used by CI.
- Cleared the remaining dead-code finding in the kanji study companion registry without suppressions.
- Tightened Jiten public vocabulary cache invalidation when runtime stores are reset or rescanned, and restored OCR word hover lookup coverage for active image text.

## [0.7.70] - 2026-06-16

### Fixed

- Integrated the remaining P0 worker fixes into one release lane with proof-backed coverage for YouTube text enhancement, fullscreen subtitle rails, iPad sidebar layout, settings self-enhancement/alignment, Jiten/JPDB dictionary coexistence, keyless Jiten definitions, popover action pills, study cards, and batched fallback enrichment.
- YouTube text enhancement now skips only internal ripple/icon chrome instead of whole renderer subtrees, restoring ruby and pitch on titles, chips, guide labels, comments, transcripts, watch chrome, and video metadata while keeping framework internals untouched.
- Added and strengthened Playwright smoke coverage for hosted settings without userscript injection, desktop/tablet/mobile settings layout, Jiten keyless definitions, Jiten+JPDB source matrices, popover pill navigation, YouTube fullscreen/subtitle rails, YouTube sidebar layout, YouTube ruby coverage, popover/new-tab audio, and concurrent enrichment.

## [0.7.69] - 2026-06-16

### Fixed

- Rebased and republished the iPad/tablet YouTube transcript sidebar performance and layout fixes on top of the latest dictionary-source release, keeping the preview-first panel open path covered by CI so full transcript hydration stays deferred instead of blocking panel open.
- Current Immersion Kit example-target clicks now use explicit active-popover and ancestor checks, avoiding redundant popup navigation when the active example word is clicked inside dictionary details.

## [0.7.68] - 2026-06-16

### Fixed

- JPDB public dictionary details now render alongside Jiten details even when the clicked/search result card came from Jiten parsing, so keyless, Jiten-key-only, JPDB-key-only, and dual-key lookups can all show the real Jiten and JPDB source panels together.
- Definition source toggles now persist through settings normalization, so turning off Jiten or JPDB removes that source from both popover dictionary cards and the `/search` detail page.

## [0.7.67] - 2026-06-15

### Fixed

- YouTube transcript sidebars now open with a lightweight preview first and defer the full transcript render/hydration, removing the long synchronous panel-open pause on iPad/tablet watch pages while keeping Auto pause-panel reopening immediate.
- Left-side YouTube transcript placement now anchors YouTube's flex watch columns to the viewport start and shifts only the primary watch column, so the video, title, and actions sit against the panel instead of sliding too far left or underneath it. The Playwright iPad/mobile/desktop layout matrix now asserts this flex anchoring, preview render path, resize behavior, Auto behavior, and bottom safe-area alignment.

## [0.7.66] - 2026-06-15

### Fixed

- Corrected keyless Jiten dictionary rendering so the Jiten source uses the same real vocabulary-detail renderer as API-key mode, including readings, meanings, example sentences, composed-of / used-in words, and speech-bubble audio buttons. The keyless path no longer renders the local Jitendex inner substitute card or the `Jitenで開く` / `Open in Jiten` button inside the Jiten source.
- New-tab search detail fallback loading now fetches Jiten vocabulary details when the full card-render data loader is unavailable, so keyless dictionary searches still hydrate the real Jiten panel.

## [0.7.65] - 2026-06-15

### Fixed

- Tapping the video transcript side/bottom panel resize handle now closes the panel instead of resizing it, similar to the popover dictionary's sheet handle behavior.

## [0.7.64] - 2026-06-15

### Fixed

- Enabled Jiten dictionary definitions to work fully without a configured Jiten API key, including meanings, readings, example sentences, related words (composite / used in), and speech bubble TTS buttons. The card spelling is resolved using a public search fallback when a key is absent, and public Jiten endpoints are successfully queried without the Authorization header.
- Coexisted the external open button as a pill link rather than replacement content when keyless definitions are rendered.
- Fixed a potential JSDOM TypeError where `location.pathname` is missing or undefined under test environments.

## [0.7.63] - 2026-06-15

### Fixed

- Dictionary, kanji, study, popup, JPDB-page, new-tab, and docs Immersion Kit players now share the same example toolbar/action renderer, so audio, next, and previous controls update the active example in place without reparsing or reloading the page.
- Immersion Kit controls now wrap within their toolbar in light and dark layouts, preventing the action backdrop from overflowing narrow dictionary/study cards.

## [0.7.62] - 2026-06-15

### Fixed

- Tapping the video transcript side/bottom panel resize handle now closes the panel instead of resizing it, similar to the popover dictionary's sheet handle behavior.

## [0.7.61] - 2026-06-15

### Fixed

- YouTube watch-page transcript sidebars now keep iPad/tablet left placement from covering the video, title, or action area by shifting the watch content column alongside the player inset. Right placement keeps the existing side-dock behavior, while bottom placement is flush with the visible viewport and only resizes YouTube player nodes so metadata, descriptions, actions, chips, and recommendations do not stretch or clip.
- YouTube transcript layout changes now debounce the private player resize nudge during drag/keyboard resize interactions, avoiding repeated synchronous resize work while still settling the player dimensions after the panel changes. Added a Playwright iPad/mobile/desktop sidebar-layout matrix with screenshots and timing/DOM evidence.

## [0.7.60] - 2026-06-15

### Fixed

- YouTube Shorts now skips non-Japanese reels on the desktop player too (iPad's "Request Desktop Website" serves `ytd-shorts`, not m.youtube.com). The active short is classified by its URL video id + original (oEmbed/tab) title instead of the per-reel title, which on a non-English UI locale is auto-translated into Japanese and made every English short look Japanese. A dropped first nav-click no longer parks the player on a short forever.
- YouTube Shorts subtitles now appear on autoplay without needing a manual pause/resume. Swiping between reels reuses one `<video>` element and emits no navigation event, so the overlay used to latch "out of view"; the player now re-detects the active reel and self-heals the overlay when the video becomes visible again.
- The reader now starts with a disabled Anki client when the Anki companion library is missing, so dictionary popovers and action pills still initialize instead of failing the whole page with "Yomu Anki companion is unavailable."
- Removed an accidentally tracked `node_modules` symlink from the repository so fresh worktrees and worker setup are not blocked by a self-referential dependency path.

## [0.7.59] - 2026-06-15

### Fixed

- OCR image text now keeps furigana and pitch markup inactive until the user activates an OCR line or word, and clears that rich markup when selection moves or the lookup closes so docs/image OCR surfaces do not leave stale ruby or underline overlays.
- Expanded search word details now omit fetched-empty Jiten panels while preserving the generic keyless Jiten fallback link elsewhere.

## [0.7.58] - 2026-06-15

### Fixed

- No-key Jiten definition panels now render real imported Jitendex/Jiten term entries, including readings and structured example text, instead of replacing the section with only an external Jiten button. The same Jiten source renderer is used for API-backed details and local no-key entries, while the external Jiten link remains an extra action when real content is available.

## [0.7.57] - 2026-06-15

### Fixed

- Restored green CI by reconciling two contradictory JPDB definition-source tests. Example sentences render the headword occurrence as a rich passive JPDB word (ruby/pitch + identity for accurate lookup), and `renderedJpdbRelatedWords` scopes example headwords out so only used-in vocabulary is enriched/counted as related words.

## [0.7.56] - 2026-06-15

### Fixed

- Keyless Jiten dictionary sources stay visible in new-tab/search definition stacks when Jiten is enabled, rendering the passive headword and an external Jiten lookup link instead of disappearing while still avoiding duplicated JPDB meanings.

## [0.7.55] - 2026-06-15

### Fixed

- JPDB definition example sentences no longer double-count the headword as a "used-in" related word. The example sentence is parsed in place (nested, clickable) and highlights the headword inline, instead of also emitting a passive related-word token that inflated the related-word list.
- Integrated the in-progress P0 end-to-end fixes (action-pill navigation handlers, Jiten/JPDB definition source rendering, scanner coverage, and nested-parse refinements) onto the latest upstream `main`.

## [0.7.54] - 2026-06-15

### Fixed

- Supersedes 0.7.53 with the deferred YouTube public-vocabulary hydration release validation fixed, so live YouTube titles and chrome regain ruby/pitch without blocking first paint.

## [0.7.53] - 2026-06-15

### Fixed

- YouTube visible-page enhancement now hydrates fallback text with deferred public vocabulary lookups instead of disabling public lookup entirely, restoring ruby/pitch on live YouTube titles and chrome without blocking first paint.
- Visible-page scans now await async pre-render enrichment for fallback tokens that need readings, so resolved ruby is present before the DOM is wrapped instead of racing behind the initial render.

## [0.7.52] - 2026-06-15

### Fixed

- Japanese settings helper text inside audio source rows is now parsed for furigana and pitch while leaving the adjacent preview audio button untouched.

## [0.7.51] - 2026-06-15

### Fixed

- Hosted new-tab Settings now rebinds parsed Japanese labels to the current settings DOM before rendering, so relocalized labels such as 設定 and 設定の表示言語 keep furigana and pitch underlines instead of only enhancing preview/sample words.

## [0.7.50] - 2026-06-15

### Fixed

- Hosted new-tab settings now self-enhance Japanese settings chrome and appearance controls with furigana and pitch underlines, including stable labels such as 設定, 外観, 表示言語, 自動, and 日本語.
- Public JPDB fallback enrichment now re-applies furigana when a hosted new-tab fallback word resolves to a public vocabulary card, so no-key/settings UI parses gain readings instead of only updating hidden card metadata.
- Settings parsing now prioritizes visible settings controls before inactive panels while still covering hidden panels up front, so broad self-enhancement does not starve the current view.

## [0.7.49] - 2026-06-15

### Fixed

- Settings self-enhancement now skips transient status lines while preserving settings panel text, keeping hosted/new-tab parsing aligned with the concurrent enrichment release gates.

## [0.7.48] - 2026-06-15

### Fixed

- Japanese settings in ruby mode now use compact, grouped media controls so audio, Immersion Kit, OCR, video, and YouTube settings align cleanly without the large empty gaps and scattered checkbox/select rows seen in the reopened layout report.
- Added a responsive browser smoke for Japanese ruby settings at desktop, tablet, and mobile widths to catch control overlap, overflow, and excessive row gaps.

## [0.7.47] - 2026-06-15

### Fixed

- Compact stats chart gap taps now route through the resolved nearest day element, restoring coarse-pointer day selection and keeping the generated release shard aligned with the shipped interaction.

## [0.7.46] - 2026-06-15

### Fixed

- Hosted new-tab Settings now finishes self-enhancing Japanese settings panels without the userscript bridge by parsing hidden panels up front, using the runtime JPDB parser with timeout fallback, and avoiding redundant tab-switch reparses while keeping status notices and native controls untouched.

## [0.7.45] - 2026-06-15

### Fixed

- Hosted settings chrome enhancement now uses the local/segmented parser fallback instead of hitting JPDB, keeping parsed settings labels responsive while preserving the concurrent visible-page enrichment release.

## [0.7.44] - 2026-06-15

### Fixed

- Hosted new-tab searches such as `読み取る` and `よむ` load keyless Word and Kanji study cards when switching from Search into Study, instead of getting stuck on "Looking for more words...".
- Empty study sources show actionable Starter words, Settings, and Search controls instead of inactive review navigation buttons.

## [0.7.43] - 2026-06-15

### Fixed

- Hosted new-tab searches such as `読み取る` and `よむ` now load keyless Word and Kanji study cards when switching from Search into Study, instead of getting stuck on "Looking for more words...".
- Empty study sources now show actionable Starter words, Settings, and Search controls instead of inactive review navigation buttons.

## [0.7.42] - 2026-06-15

### Fixed

- Large visible furigana/pitch parse batches now fetch with bounded concurrency instead of waiting strictly one JPDB batch at a time, so big pages such as YouTube feeds, hosted settings/search chrome, and Immersion Kit reparses can progressively enhance without serial enrichment stalls.

## [0.7.41] - 2026-06-15

### Fixed

- Hosted new-tab Settings now enhances its own Japanese title, tabs, search label/results, panel labels/helper text, and Cancel/Save footer controls with reader parsing when the userscript is not active on the hosted page. Settings tabs, inputs, selects, checkboxes, links, and footer buttons remain native while passive reader words can still be hovered where appropriate.

## [0.7.40] - 2026-06-15

### Fixed

- Japanese new-tab chrome keeps native actions after reader ruby/pitch parsing. Clicking the parsed `設定` overflow item now opens settings instead of searching for nested parsed text, while stats chart gap taps still select the nearest day.

## [0.7.39] - 2026-06-15

### Fixed

- Dictionary popover source headers now keep enhanced Japanese labels such as `イマージョンキット` compact after ruby and pitch parsing, instead of stretching each parsed token across the accordion row.

## [0.7.38] - 2026-06-15

### Fixed

- YouTube feed and watch page scanning now covers signed-in feed channel names, metadata, watch titles/descriptions, sidebar recommendations, and transcript rows with reader color, pitch underline, and ruby where lookup data is available. Native caption overlays remain untouched to avoid disrupting YouTube playback timing and caption styling, while Yomu transcript rows continue to be enhanced.

## [0.7.37] - 2026-06-15

### Fixed

- Parsed Japanese new-tab chrome now preserves the original button action before nested word lookup. The Settings menu item can render reader ruby/pitch markup without turning clicks on `設定` into a search for parsed inner text such as `統計`.

## [0.7.36] - 2026-06-15

### Fixed

- Jiten now appears as its own source panel in popover dictionaries and expanded new-tab search results whenever the Jiten definition source is enabled. If no Jiten detail result is available, the panel shows a clear empty state instead of disappearing behind JPDB, Anki, or local-dictionary availability.

## [0.7.35] - 2026-06-15

### Fixed

- New-tab Immersion Kit example navigation now swaps the visible sentence, count, translation, media URL, and controls before sentence parsing finishes, so next/previous clicks no longer feel frozen while ruby/pitch work catches up.
- New-tab Immersion Kit audio now tries the streamable media URL before waiting on slower blob/proxy hydration, so pressing play gives immediate playback feedback on hosted search pages while retaining the fallback path.

## [0.7.34] - 2026-06-15

### Fixed

- Hosted new-tab search now applies reader parsing and pitch enrichment to Japanese search chrome, autocomplete suggestions, kanji result cards, word result cards, and the Japanese settings dialog opened from search. Searches such as `学習能力` now hydrate from unknown pitch to concrete pitch underline/color classes when local or public pitch data is available, and settings chrome such as `よむ 設定` can render furigana/pitch via the same bounded parser.

## [0.7.33] - 2026-06-15

### Fixed

- Dictionary popover action pills remain live in hover popovers, so Jiten, JPDB, Jisho, Yomu, and Copy actions open or provide feedback instead of rendering as disabled pill-shaped controls.
- YouTube dictionary popovers now have smoke coverage that clicks configured action pills and verifies the userscript tab-opening path without leaking the click to the page.

## [0.7.32] - 2026-06-15

### Fixed

- YouTube filter chips, mini-guide labels, and topbar controls such as 作成 now use the passive reader scan path, so stable Japanese control text can show ruby, pitch underlines, and source colors while native YouTube clicks still pass through.

## [0.7.31] - 2026-06-15

### Fixed

- Lookup popovers and expanded search detail headers now use the same duplicate-reading suppression as new-tab search results, so a kanji headword with visible furigana no longer repeats the identical kana reading beside the title while alternate readings remain visible.

## [0.7.30] - 2026-06-15

### Fixed

- New-tab search results no longer repeat the same kana reading in the metadata when that reading is already visible as furigana on the result term, while still showing the plain reading when furigana is disabled or suppressed by settings.

## [0.7.29] - 2026-06-15

### Fixed

- Twitter/X no longer shows a paused-frame OCR card on videos. Twitter plays every clip inline in the timeline and keeps the same markup on the tweet detail page, so there is no separate "watch" player to distinguish from a feed preview; all Twitter/X videos now opt out of paused-frame OCR. Posted photos still flow through the normal image OCR path.

## [0.7.28] - 2026-06-15

### Fixed

- YouTube no longer runs OCR on feed thumbnails. The inline hover preview (`ytd-video-preview`) reuses the real player markup, so it was being treated as the main player and snapshotted — leaving a "No text found" card pinned over a thumbnail; it is now classified as a thumbnail and skipped. Static feed/Shorts thumbnail images are likewise excluded from image OCR, so the extension no longer auto-sends YouTube thumbnails to the OCR provider. Paused-frame OCR on the actual watch-page player is unaffected.

## [0.7.27] - 2026-06-15

### Fixed

- Immersion Kit next/previous controls on the new tab now update the sentence, count, translation, parsed text, image, and audio source immediately while media finishes hydrating in the background.
- Immersion Kit cards now use a compact subtitle overlay across popovers, hosted search/new-tab views, and JPDB page addons instead of stretching a large floating caption box over screenshots.
- Mixed-script Immersion Kit fallback searches now keep useful compound verb fragments such as `読み取` and `取る`, improving examples for terms like `読み取る`.

## [0.7.26] - 2026-06-15

### Changed

- Recommended local dictionary downloads now include Japanese monolingual homepage entries for WTY JA-JA and the MarvNC monolingual collection.
- Local kanji-only dictionaries now stay scoped to kanji drilldowns and kanji-oriented study/detail cards instead of appearing on ordinary word definition cards.

### Fixed

- Yomitan structured-content dictionary images are imported as inline image data and rendered with alt/fallback text when available.
- Monolingual structured Japanese glossary content remains parseable by the reader scanner without turning dictionary image fallback labels into nested lookup targets.

## [0.7.25] - 2026-06-15

### Fixed

- Japanese parsing now repairs incomplete kana spans inside continuous text, preventing dangling stems like `やや さし` and keeping context words such as `読んで` and `読み取る` coherent across Jiten, JPDB, local dictionary, and fallback parses.
- Selected sentence lookup now reparses long or fragmented rendered selections with sentence context, so large selections still open a popup and sentences like `好きなものを読んで日本語を学ぶ` keep coherent token choices.

## [0.7.24] - 2026-06-14

### Fixed

- Page-reader scanning now uses one active/passive interaction model across supported sites, so links, tabs, summaries, buttons, and compact controls can render color, pitch underline, and ruby while native clicks still pass through.
- JPDB search links, dictionary-site controls, settings/new-tab controls, and hosted-docs chrome now stay passive for click/tap while hover lookup remains available outside Yomu's own dictionary popover.
- Dictionary popover summaries such as translation headings now get visual parsing but remain render-only, preserving details toggles and preventing nested popover lookup loops.

## [0.7.23] - 2026-06-14

### Fixed

- Settings changes now propagate across userscript, hosted docs, and new-tab contexts so open reader pages stay in sync after a save.
- Removed obsolete dictionary source toggles and result-limit controls from Settings; stale saved values no longer disable JPDB or local dictionary results.
- Furigana settings now show concrete selected modes instead of the vague automatic option, and legacy automatic values migrate to the effective behavior.
- Japanese settings labels, including parsed ruby labels, align cleanly with their controls, and the Appearance preview is centered.
- Empty local dictionary status no longer warns about Safari evicting data from the GM-backed store.

## [0.7.22] - 2026-06-14

### Fixed

- Study mode now falls back to usable word and kanji practice material based on the active tab, preventing keyless or degraded queues from staying stuck while looking for more cards.
- The Anki Study deck selector's "All vocabulary" option now loads the whole enabled collection instead of querying a literal deck named `all`.
- Connected Anki cards now render through the split Anki companion during the release smoke, covering existing-card popovers and new-tab review actions.
- The in-page Study deck selector now has Jiten deck scoping coverage alongside JPDB and Anki so the source selector behavior stays consistent.

## [0.7.21] - 2026-06-14

### Fixed

- YouTube channel recommendations now disappear entirely once every curated channel is already subscribed, instead of showing an empty/all-subscribed shelf.

## [0.7.20] - 2026-06-14

### Fixed

- Hosted new-tab searches now keep the `q` query parameter in sync for typed searches, nested modal lookups, handwriting candidates, and cleared searches, so browser back/forward restores the searched term and rendered results.
- New-tab search results no longer render the redundant global external-search link row when each expanded dictionary entry already has its own lookup pills.
- Search-result entry pills now dispatch Copy, Yomu, Jiten/JPDB, and Anki actions through the shared card-action path; the Anki pill now gives the same success/error feedback in new-tab search details as it does in lookup popovers.

## [0.7.19] - 2026-06-14

### Fixed

- YouTube feed, Shorts gallery, watch title, sidebar, transcript, caption, comment, and live-chat text now keep Yomu ruby, pitch underlines, and source colors on signed-in-style surfaces while preserving YouTube title/ruby layout protections.
- YouTube thumbnail images are excluded from automatic and hover OCR scheduling, preventing thumbnail OCR status overlays and reducing feed-scroll work.
- YouTube virtualized feed filtering no longer blanks visible pending cards or collapses filtered cards immediately, reducing black rows and scroll content-shift while still hiding offscreen pending items.
- YouTube comment and live-chat controls stay unwrapped while surrounding Japanese text remains parseable.

## [0.7.18] - 2026-06-14

### Fixed

- Large Japanese text selections now keep the selection popover open, remain sentence-aware, and show the configured Yomu/Jiten/JPDB/copy action pills on desktop and mobile.

## [0.7.17] - 2026-06-14

### Fixed

- YouTube channel recommendations now continue checking subscribed state through the expanded 100-channel shelf in small batches, so already-subscribed channels past the first visible preview rows are removed instead of being recommended again.

## [0.7.16] - 2026-06-14

### Fixed

- New-tab review now keeps Jiten available anywhere it is enabled, including auto-source review queues and Jiten-only source labels without requiring an unrelated JPDB API key.
- Hosted docs/newtab settings now mirror managed userscript settings back to same-origin app storage, keeping source settings and local dictionary preferences coherent where the hosted store can be shared.
- Hosted search now checks the actual local dictionary store before searching it, so imported Yomitan dictionaries appear when present and empty installs show the add-dictionary state instead of stale local results.

## [0.7.15] - 2026-06-14

### Fixed

- Hosted docs and new-tab Japanese UI text now receive ruby, pitch colorization, and pitch underlines across hero text, cards, install links, buttons, headings, and settings controls.
- Pitch accent underlines now use a consistent baseline across inline text, cards, buttons, headings, and settings surfaces, including words that render without furigana.
- Furigana settings are now respected exactly in hosted new-tab search terms, and default/difficult-kanji modes no longer inflate line spacing when ruby is suppressed.
- Added smoke coverage for enhancement coverage and underline baselines on hosted docs and new-tab fixtures.

## [0.7.14] - 2026-06-14

### Fixed

- YouTube popover action pills now own their clicks and open Jiten, JPDB, Yomu, and custom lookup links through userscript-safe tab APIs without leaking the click to YouTube's native navigation handlers.
- Firefox/Tampermonkey no longer needs to define the companion registry on YouTube page globals, avoiding XrayWrapper console errors from Yomu's own startup path.
- YouTube filter channel-subscription and mobile Shorts tests now clean up failed retries and wait for deterministic action completion, keeping release CI from inheriting async work across retries.

## [0.7.13] - 2026-06-14

### Fixed

- New-tab search kanji cards are now compact while staying touch-friendly, so kanji results no longer dominate the result grid.
- Expanded new-tab kanji details now use clearer section headers, compact component buttons, and per-kanji grouping for multi-kanji words so readings/components, RTK, component graph, Uchisen, and Immersion Kit sections remain scannable.

## [0.7.12] - 2026-06-14

### Fixed

- YouTube popover action pills now own their clicks and open Jiten, JPDB, Yomu, and custom lookup links through userscript-safe tab APIs without leaking the click to YouTube's native navigation handlers.
- Firefox/Tampermonkey no longer needs to define the companion registry on YouTube page globals, avoiding XrayWrapper console errors from Yomu's own startup path.

## [0.7.11] - 2026-06-14

### Fixed

- Hosted docs links now stay under the `/yomu-reader/` GitHub Pages base, including the Getting Started and study-app paths that were escaping to root-level 404s.
- The docs landing hero has stronger responsive spacing on desktop, tablet, and mobile so the icon, copy, actions, and following install panel remain readable.
- The hosted new-tab fallback shell now opens in Japanese by default, localizes its document title and visible chrome, and keeps fallback card meanings localized before the full app hydrates.

### Changed

- New-tab Japanese localization now has a parity test so future visible study-page copy cannot silently fall back to English.

## [0.7.10] - 2026-06-14

### Changed

- Page-reader kanji drilldowns now use the Kanji/Study companion for the heavier JPDB, RTK, stroke, and origin renderers, trimming the core userscript bundle while keeping local dictionary kanji details available.
- Reader page parsing now treats visible interactive labels across supported sites as passive targets instead of excluding them, so hover lookup, ruby, pitch underlines, and color classes can render while native clicks still pass through.
- Hosted docs hero and card links keep the same active/passive scan rendering path as other sites, including ruby and pitch underline coverage for stable headings and passive links.
- Project package metadata now uses the MIT license.

### Fixed

- Audio fallback mode now keeps playable recorded/custom audio ahead of browser/API text-to-speech, including random replay, duplicate resolved media URLs, and nested custom JSON source pools.
- Hosted Yomu new-tab audio works without a userscript HTTP bridge, fetching custom JSON/audio through page `fetch`, playing via blob URLs, and keeping fallback text-to-speech out while recorded clips are playable.
- iPad blob playback, Wikipedia hover/tap replay, and YouTube hover playback now have source-backed smoke coverage for the randomized no-immediate-repeat pool.
- Passive words inside native buttons no longer start press lookup, keeping button taps and clicks native while hover lookup remains available.
- Page-reader kanji drilldowns no longer crash when the Kanji/Study companion is absent; they now show a dictionary-only fallback instead of an install notice.
- Hosted Yomu docs settings surfaces now follow the visible docs light/dark theme, preventing a dark settings panel over a light docs page.

## [0.7.9] - 2026-06-14

### Changed

- The default lookup pills now open Yomu search instead of Jisho, while Jisho remains available as an optional disabled pill.
- The hosted search page reads `q`, `query`, and `search` URL parameters and renders search links from the user's enabled lookup pills, excluding the redundant Yomu self-search link.

### Fixed

- Hosted search results load again from query-param searches, including public JPDB fallback results when no local dictionary result matches.

## [0.7.8] - 2026-06-14

### Fixed

- Subtitle overlay text now uses the vivid status/source color on dark video surfaces instead of the UI-readable tint, keeping colored subtitles legible while preserving transcript panel readability.

## [0.7.7] - 2026-06-14

### Fixed

- YouTube watch titles, descriptions, comments, OCR text, and subtitles keep ruby/pitch rendering while virtualized homepage, sidebar, and Shorts gallery title chrome stays native to prevent the "only furigana remains" DOM corruption.
- YouTube comment "more" buttons, live-chat reply buttons, and recommendation chrome are no longer parsed as hover dictionary targets.
- Paused-frame OCR overlays, status cards, and rail resume buttons are torn down on YouTube SPA navigation so homepage preview frames cannot stick over the next watch page or add duplicate play controls.
- Subtitle detection is retried immediately on YouTube video load/metadata changes and the first cue renders during the initial lead-in, reducing blank overlay/sidebar time on short-form clips.
- YouTube Shorts filtering now recognizes reel overlay/card video ids more reliably and keeps non-Japanese Shorts out of desktop and mobile galleries.
- The YouTube smoke suite now covers homepage-to-watch OCR cleanup, side-panel rail/toggle visibility, player resizing, mobile feed filtering, Shorts filtering, and iPad-sized touch playback layouts.

### Changed

- Native subtitle blur now uses transparent text fill plus text-shadow instead of a CSS blur filter, keeping hover reveal responsive on mobile/tablet GPUs.
- Reader underline alignment now uses a consistent line-height for non-passive reading surfaces so words with and without furigana share the same underline baseline.

## [0.7.6] - 2026-06-14

### Fixed

- The settings dialog on the documentation page now respects the pink accent color setting on startup and during subsequent mode transitions instead of overriding it to the default green.
- JPDB pointer candidate generation now resolves deinflected dictionary terms correctly when performing public dictionary lookups.

## [0.7.5] - 2026-06-14

### Fixed

- Word highlights and underlines now leave a visible break between adjacent same-status words across page text, ruby-enhanced text, subtitle overlays/transcripts, settings previews, and OCR active lines.

## [0.7.4] - 2026-06-14

### Changed

- Merged the verified 0.7.3 onboarding, host-style isolation, parser coverage, accent picker, passive contrast, and audio-source fixes back onto `main`.
- Anki mining is opt-in on first run while existing migrated Anki setups stay deliberate and preserved.

### Fixed

- Audio replay selection now skips duplicated resolved media URLs and repeated browser text-to-speech voices before falling back to another available source.
- Hosted docs hero text keeps Yomu pitch underlines aligned when words render without furigana.
- Page-reader kanji drilldown popovers now hydrate enabled Uchisen mnemonic cards instead of leaving the source mount empty.

## [0.7.3] - 2026-06-14

### Changed

- The first-run welcome screen copy is shorter: image OCR now says to tap any image, and the built-in study page description is a single concise sentence.

### Fixed

- The welcome screen no longer shows an internal scrollbar on tall desktop viewports just because of the old 720px height cap.
- Host-page heading styles, including Wikipedia-style borders, no longer add a horizontal rule under the `よむ` title on the welcome screen.
- The welcome screen now leaves a clearer gap between the immersion default checkboxes and the action divider.
- The custom accent color picker now previews rapid drags once per animation frame and only publishes the selected color when the picker commits, preventing preset/custom color churn and sluggishness while trying many colors quickly.
- Host-page styles can no longer force Yomu settings inputs, number fields, selects, textareas, checkboxes, or onboarding checkboxes into site colors such as Discourse's dark controls or blue checkmarks.
- Reader-owned settings chrome, including the theme label and settings tabs, now receives the same nested ruby and colorized word rendering as settings labels and help text.
- Passive site UI chrome coverage now includes role tabs, checkbox/radio/switch controls, titled controls, and Wikipedia Vector pinnable buttons so visible Japanese labels keep ruby, underlines, highlights, and text-color classes without stealing native clicks.

## [0.7.2] - 2026-06-14

### Fixed

- Hover dictionary autoplay now ignores stale hover lookups before they start playback or mark the popover as loading. Moving quickly between words no longer leaves old audio work competing with the current card.
- Immediate autoplay de-duplication now uses the full card identity instead of only the visible spelling, so distinct same-spelling lookup cards can still play their own hover audio.
- The performance profiler now includes word-to-word hover timing while the current popover's inner sections are expanded, covering the laggy dictionary case that does not show up when sections stay collapsed.

## [0.7.1] - 2026-06-14

### Fixed

- Re-published the Discord strict-content-security-policy pitch accent stylesheet fallback on the `0.7.x` release line. The userscript version now reflects the current release train while preserving the fix that keeps pitch accent colorization and pitch underlines available when full reader CSS has to load through the fallback path.

## [0.6.201] - 2026-06-14

### Fixed

- Discord and other strict-content-security-policy pages now keep pitch accent colorization and pitch underlines when the full reader stylesheet has to be loaded through the fallback path. Yomu now asks the userscript HTTP bridge for the hosted stylesheet before trying page `fetch`, and the critical inline stylesheet includes the minimal pitch word paint rules needed while the full CSS is unavailable.

## [0.6.200] - 2026-06-14

### Fixed

- Hosted documentation pages now honor the configured accent color for dark-mode brand buttons. Setting the accent to pink no longer leaves the "Install よむ" button on the old green hover/active CSS path.

## [0.6.199] - 2026-06-14

### Fixed

- AnkiConnect is no longer contacted by a direct cross-origin `fetch` when the userscript/extension request bridge is absent. Opening the hosted yomu site (or any content page) without the userscript installed used to fire a doomed request to the default `http://127.0.0.1:8765`, which the browser blocks and logs as "Cross-Origin Request Blocked" on every attempt. Yomu now skips that request and reports Anki as needing the bridge instead. Same-origin endpoints and bridge-backed requests (Tampermonkey/Violentmonkey and the browser extension) are unchanged, so configured Anki setups keep working on hosted pages.

## [0.6.198] - 2026-06-14

### Changed

- The YouTube channel recommendation shelf is now hidden entirely when every compact-view channel is already subscribed, instead of showing an empty list with a "browse all channels for more" message.

### Performance

- YouTube feed/search/description scans no longer fan out background public JPDB pitch lookups while the page is mutating. Ruby/text rendering stays first, hover lookups remain urgent, and desktop/mobile profiles now keep public pitch requests to the hovered words instead of hundreds of background scans.
- The YouTube homepage performance profiler now records thumbnail readiness, scroll stress, OCR frame counts, and word-to-word hover popover latency with a 250 ms near-instant SLA across JPDB, Anki, Jiten, combined, and no-key settings.

### Fixed

- YouTube hover-preview videos in feed cards are no longer treated like the main paused player for OCR, preventing preview loops and useless OCR work on homepage thumbnails.
- Paused-frame OCR overlays now have regression coverage for rendered ruby and pitch/color classes, matching the parsed subtitle/text rendering path.

## [0.6.197] - 2026-06-14

### Performance

- YouTube homepage, feed, watch-page, description, and comment rescans now use the narrow YouTube site parser with a shorter mutation/initial delay while the broad generic fallback stays disabled for YouTube chrome. This restores fast ruby coverage for newly loaded video cards without re-attaching to player controls.
- Hover lookups now interrupt in-flight visible-page scans before doing dictionary work, and stale scans stop before applying DOM tokens. This keeps word-to-word popovers responsive while long descriptions/comments continue annotating in the background.
- Hover popover shells yield one animation frame before heavier dictionary hydration, so the card can appear promptly under scan stress instead of waiting behind rendering work.
- Term-audio hover playback now coalesces duplicate in-flight requests and suppresses only successful immediate duplicate autoplay attempts. Manual replay still works, and random audio selection keeps rotating through shuffled candidates instead of always using the first returned clip.

### Fixed

- YouTube OCR/status text and subtitles remain eligible for ruby/pitch colorization while avoiding repeated raw-text removal/addition loops from stale parser output.

## [0.6.196] - 2026-06-13

### Performance

- YouTube visible-page scanning now splits long text targets safely and applies chunks from the end of each text node back toward the start, so expanded descriptions and comment churn no longer corrupt text offsets or force giant apply turns.
- Mobile YouTube scanning uses smaller cooperative batches when running without a JPDB API key, while API-backed parsing keeps larger mobile batches to avoid excessive continuation work. The stress harness now covers expanded descriptions, comment scrolling, play/pause, side-panel state, desktop hover, and a throttled mobile viewport.
- YouTube page parsing now avoids player controls, chip tabs, and other button chrome while still scanning titles, descriptions, comments, recommendations, chat, subtitles, and OCR text. This keeps native YouTube controls responsive and prevents lookup/ruby work from attaching to "Auto" and similar UI labels.
- Hover popovers defer study/Immersion loader setup until after the initial shell paints, and hover-card hydration repositions are coalesced into animation frames to reduce first-hover and word-to-word latency.
- Hover/audio warmup no longer prepares the same lookup audio repeatedly for a card; candidate-only warmups can still upgrade to playable audio once.
- Repeated YouTube render-rejection rescans are debounced, reducing remove/add loops when the host rehydrates scanned description/comment text.

### Fixed

- JPDB API reads now retry transient connection resets and back off briefly when jpdb.io keeps closing connections, while the all-decks scan spaces per-deck requests instead of firing a burst that can trip Firefox `PR_END_OF_FILE_ERROR` failures on the same network.
- Partial-fragment rendering preserves the untouched prefix/suffix text around long scanned chunks, preventing the "raw text, ruby, then only ruby remains" failure mode in YouTube panels.

## [0.6.195] - 2026-06-13

### Added

- The first-run welcome splash now includes the same dark/light theme toggle used elsewhere, so new users can switch appearance before finishing setup.

### Changed

- Settings now opens with Appearance first, followed by API, Sources, Media, Mining, Study, Shortcuts, and Help.
- The welcome splash layout now matches the rest of Yomu's UI more closely: setup controls are grouped as form rows, the decorative gradient is gone, and the feature cards have been replaced with a compact feature list.

## [0.6.194] - 2026-06-13

### Added

- OCR on paused video frames is now a user-facing toggle ("Read paused video frames") in the OCR settings panel. Previously it was always enabled with no way to turn it off without disabling OCR entirely.

### Fixed

- YouTube Shorts and other portrait YouTube videos on desktop keep their native player size when the side transcript panel is open, instead of being stretched/cropped by the transcript layout resize.
- Fixed CI: the pitch-underline smoke script was not wired into `package.json`, causing the `fallow:dead-code` check to fail.

## [0.6.193] - 2026-06-13

### Performance

- Hovering words is snappier (live-profiled on a signed-in YouTube watch page). The dictionary popover no longer re-scans the whole popover for native `title` tooltips on every reposition (it's set up once at mount and kept current by its observer) — repositioning got dramatically cheaper. The page-word contrast pass memoizes the page-background computation per parent instead of walking each word's ancestors with `getComputedStyle`, so hovering words in dense text no longer recomputes the same background per sibling.
- The dictionary popover fades in with a subtle ~110ms opacity animation (opacity only — no layout shift; respects `prefers-reduced-motion`).

### Fixed

- ImmersionKit examples now load in the popover even when the immersion section sits below the visible popover fold. Loading was gated on the section scrolling into view, so on tall cards the examples often never appeared until you scrolled; the open section for the looked-up word now loads on a short debounce regardless of fold position (in-view sections load faster, and abort-on-close still prevents redundant requests while moving between words).

## [0.6.192] - 2026-06-13

### Fixed

- Mobile YouTube Shorts filtering keeps advancing through adjacent non-Japanese Shorts until it reaches a Japanese-looking Short again, instead of stopping after the first auto-advance throttle window.

## [0.6.191] - 2026-06-13

### Fixed

- YouTube watch titles, mobile watch titles, home/search/sidebar/Shorts titles, metadata, and visible button labels are parsed for JPDB ruby, color, and pitch again instead of being excluded or stripped by the YouTube filter. Decorative hidden touch-feedback chrome stays ignored generically through `aria-hidden`.
- Long YouTube titles and other cropped text rows now keep furigana visible by growing every clipped ancestor that needs ruby room, including stale or nested clipped rows.

## [0.6.190] - 2026-06-13

### Performance

- Keyless (no API key) subtitle parsing no longer floods IndexedDB. Each cue's pitch + per-kanji reading lookups now run through a shared concurrency gate, so warming several cues at once can't fire thousands of simultaneous IndexedDB requests that starved the main thread and left lines half-annotated as they played. Live-profiled on a signed-in YouTube watch page: dense 12-word ASR cues now get full ruby/pitch in time.
- Hovering to look up a word is skipped while a mouse button is held (i.e. while dragging). Live profiling showed the hover probe (`elementFromPoint` + a `querySelectorAll`/`getClientRects` sweep over every transcript word) was a dominant cost of subtitle-sidebar resize lag; it no longer runs during a drag.
- The subtitle sidebar resize drag reuses the latched player rect instead of re-measuring it every frame (which toggled inset styles and forced two synchronous layouts). Measured `getBoundingClientRect` cost during a resize drag dropped ~60%.
- The page text-scan target dedup is no longer O(n²): outermost-match filtering uses an ancestor-membership walk instead of a nested native `contains()` scan, which dominated the auto-scan on YouTube's churning DOM during playback.
- Pointer-move hover probing is coalesced to once per animation frame instead of running on every raw pointer event.

## [0.6.189] - 2026-06-13

### Fixed

- Opening the popup dictionary now temporarily suppresses native browser `title` tooltips on the active lookup word's page ancestor path, so host-page title tooltips no longer cover the dictionary. Unrelated page titles are left alone and every suppressed title is restored when the popup closes.
- Keyless YouTube subtitle warmup now enriches future cached lines with public/local vocabulary and pitch before they can be reused during playback, so background transcript parsing no longer locks in plain half-ready subtitle HTML ahead of the active cue.

## [0.6.188] - 2026-06-13

### Added

- The transcript auto-scroll resume window is now configurable in Settings → Media ("Resume transcript auto-scroll after manual scroll (s)", default 4s). After you manually scroll the Lines panel, auto-follow stays paused for this many seconds before snapping back to the active line.

### Fixed

- Jiten and JPDB now stay as separate dictionary definition sources in settings and popup ordering. Both source rows are enabled by default even before API keys are added, and adding a Jiten key no longer relabels or replaces the JPDB source.

## [0.6.187] - 2026-06-13

### Fixed

- Apple Pencil / pen hover once again opens hover lookups on iPad when hover lookup is enabled. Pen contact still suppresses immediate hover re-open briefly, so a real tap or touch-down does not produce the old rapid open/close behavior.

## [0.6.186] - 2026-06-13

### Fixed

- Manually scrolling the subtitle Lines panel no longer gets yanked back to the active line when the video advances to the next cue. Auto-follow pauses for a few seconds after a manual scroll and resumes on its own (or immediately when you click a line or use Previous/Next). The list's own snap-to-active scroll is no longer mistaken for a manual scroll.

## [0.6.185] - 2026-06-13

### Fixed

- Pausing a YouTube video on mobile now captures the OCR snapshot again. The main player on m.youtube.com is wrapped in a generic `/watch` link, which a v0.6.182 thumbnail guard mistook for a hover-preview tile and skipped the snapshot ("the auto doesn't work on pause"). Real feed/preview tiles are still ignored; the guard now only treats link-wrapped videos as thumbnails when they are not player-sized.
- Dragging the subtitle sidebar resize handle is smooth again: the layout-heavy panel reposition now runs at most once per animation frame instead of on every raw pointer-move event.
- The per-tick asbplayer move-handle sync (added in v0.6.176, running every ~250ms on every video on every site) now takes a fast early-out when no asbplayer subtitle overlay is present, instead of doing a document-wide drag-handle scan each tick.
- Resolving the generic (non-YouTube) video layout target during resizes no longer re-scans each candidate frame's whole subtree for player controls on every pointer move — the result is memoized per element with a short TTL.

### Notes

- Exact-cue subtitle caching: the cache keying and identical-render guard were verified intact since 0.6.175; the "caching looks broken" reports trace to the render/layout jank fixed above, not to re-parsing or cache-key churn.

## [0.6.184] - 2026-06-13

### Fixed

- Hardened the settings dialog import-queue regression test so the release workflow can publish the verified YouTube, ASB-player, JPDB, and settings fixes without CI timing out under load.

## [0.6.183] - 2026-06-13

### Fixed

- YouTube watch controls, player settings submenus, suggested videos, and view/count metadata are parsed for ruby, color, and pitch styling again, while native clicks stay intact and hover popover lookup CTAs remain visible but inert.
- ASB-player style subtitles are enriched with ruby and deck/pitch color before cue HTML is displayed, so pre-rendered cues keep their styling when moved onscreen instead of visibly loading in afterward.
- Video subtitle/control rails now render only inside an actual visible video frame and stay hidden on no-video pages.
- JPDB native ruby headwords such as `発行` stay as one lookup word, kanji-used links receive furigana, and Yomu-injected JPDB panels fit the host column width.
- Appearance settings are simplified: the confusing default preset is gone, the old phone/tablet copy is removed, and the larger colorized preview now lives in the Appearance panel.

## [0.6.182] - 2026-06-13

### Added

- Playwright smoke coverage for YouTube auto-translated caption tracks whose translated timedtext endpoint returns no rows.

### Fixed

- YouTube auto-translated subtitle tracks no longer leave the Lines panel stuck at "0 lines" / "Loading subtitle lines" when the translated timedtext response is empty: Yomu now translates usable source captions itself, and preserves YouTube's native `translationLanguage` when falling back to DOM captions.
- Jiten/example sentences with a highlighted word split across inline elements now keep the ruby/furigana render instead of dropping into plain text.
- Paused-video OCR controls now live in the subtitle rail when available, use a compact play icon fallback elsewhere, and ignore YouTube hover-preview thumbnail videos.

## [0.6.181] - 2026-06-13

### Changed

- Furigana in cramped rows is never stripped anymore: when ruby makes a clamped or fixed-height row overflow, the row gets room instead (line-clamp boxes keep their line count and lose only the plain-text height cap; other clipped boxes grow to their content height). Verified end-to-end — furigana stays and the full base text shows.
- The jpdb/jiten page add-on (Immersion Kit, dictionary entries) uses the width the page actually has instead of inheriting a narrow host column, and example media can render up to ~480px tall.

### Fixed

- Words Jiten doesn't track were silently treated as "mature" — coloring them as known and hiding their furigana on jiten.moe pages. They are now neutral (not-in-deck), so untracked words keep honest colors and visible furigana.

## [0.6.180] - 2026-06-13

### Changed

- The clamp sweep is now evidence-based instead of list-based: it strips furigana only from rows whose container measurably overflows (any site, no per-site whitelists), so ruby that fits stays — including inside expandable descriptions and comments — and ruby that actually crops is removed wherever it happens. Verified across YouTube watch, jpdb.io, and NHK News Easy with zero measurably-cropped ruby rows.

## [0.6.179] - 2026-06-13

### Fixed

- Paused-video OCR usability: a floating "Resume video" pill now sits on the snapshot (recognized text swallows clicks for lookups, so text-dense frames made the player hard to unpause — the pill always works and also clears the overlay when playback is blocked), and stepping next/previous subtitle line while paused re-captures the snapshot instead of showing the stale frame.
- Restored pieces dropped in a release rebase: all-variant pitch patterns from imported dictionaries, the persistent-storage request + eviction notice for imported dictionaries, and the aligned grammar-row label column.

## [0.6.178] - 2026-06-12

### Added

- Subtitle player Playwright coverage now includes BBC-style article video, Video.js, JW Player, Plyr, Vimeo-style, Wistia-style, Mux/Kaltura-style, CIJ, mobile YouTube, desktop YouTube placements, and a live-site player discovery smoke.

### Fixed

- Subtitle overlays and transcript drawers now anchor to the player frame/chrome instead of the centered raw video or surrounding article body on generic video sites.
- Generic player frames now resize with side/bottom transcript drawers on all non-YouTube sites, not only CIJ, and dispatch resize events so embedded players can refit themselves.
- Subtitle move handles are actually hit-testable and draggable above the subtitle text, with a mouse fallback for environments that do not deliver pointer events.
- ASBPlayer subtitle dragging now composes with the player’s existing transform instead of relying on the individual `translate` property, and the default move handle no longer paints a shadow bar.
## [0.6.177] - 2026-06-12

### Fixed

- Mobile YouTube watch metadata, action chips, descriptions, and transcript controls now keep furigana after late hydration instead of briefly showing ruby and then losing it to the compact-row clamp cleanup.

## [0.6.176] - 2026-06-12

### Added

- Lookup pitch graphs now show every accepted accent variant from imported pitch dictionaries, and append imported dictionary variants to the one jpdb supplies.

### Fixed

- YouTube channel suggestions now keep Yomu's short level/topic summaries after YouTube preview hydration, instead of replacing them with long channel bios in compact suggestion rows.
- YouTube filtering now continues loading mobile homepage cards when the visible continuation item is reached, avoids annotating recommendation-grid titles as page text, and keeps the current Shorts watch item visible while hiding non-Japanese neighboring Shorts.
- Keyless subtitle playback now treats provisional parses as warm for lookahead and transcript warmups, shares in-flight parses across tiers, caches empty parses in the retry TTL, and re-anchors warmup after long seeks into cue gaps.
- YouTube native-caption fallback now warms the normalized text that actually renders, renews captions the page keeps showing, and can re-apply identical captions after a seek.
- Late pitch/vocabulary enrichment now re-bakes cached subtitle cue HTML and hydrated transcript rows, so stepping back keeps pitch colors.
- Public jpdb pitch lookups now run four-wide, so keyless pitch underlines fill in faster during subtitle bursts.
- ASBPlayer subtitle overlays no longer inherit Yomu subtitle underline color channels, avoiding dark shadow underlines when API-backed status/pitch styling is enabled.
- ASBPlayer subtitle overlays now get the same deliberate temporary move handle as Yomu subtitles, so their position can be nudged per video without dragging ordinary subtitle text.
- Deck membership styling now applies across Jiten, JPDB, and Anki rendered words, with provider-specific deck classes and merged Anki metadata preserved.
- Word lookups now resolve the real pointer target through shadow-DOM event retargeting, so framework re-renders that replace annotated nodes are re-annotated by the next scan.
- Imported dictionaries on iPad now request persistent storage on import, and the Dictionaries panel explains when Safari has cleared remembered IndexedDB data.
- Grammar rows in the lookup sheet now indent consistently across alternate forms.

## [0.6.175] - 2026-06-12

### Fixed

- Yomu-owned roots now inherit Yomu text color through their descendants as part of the host-page reset, so broad site CSS cannot tint settings sections while the floating puck and panel surfaces stay correctly sized and themed on Reddit, mobile Reddit, and other aggressive CSS hosts.

## [0.6.174] - 2026-06-12

### Added

- Subtitle overlays can now be temporarily repositioned per video with a dedicated move handle, with keyboard nudging from the focused handle for deliberate adjustments.
- Added a configurable subtitle-overlay shortcut, defaulting to Shift+H, to toggle Yomu/ASB-style subtitle lines without opening settings.

### Fixed

- Unsetting primary/secondary subtitle tracks now clears the current rendered Yomu/ASB-style subtitle line instead of leaving the previous line in the player.
- Apple Pencil hover no longer rapidly opens and closes dictionary popovers over OCR/image-reader words; pen hover can scan, while lookup popovers require mouse hover or an explicit tap/click.
- Native page ruby is preserved when a scanned word fully covers the ruby base text, avoiding split or duplicated furigana in annotated pages.
- Kanji/Study companion features now degrade to no-op clients with a visible notice when the companion bundle is missing, instead of importing companion-only modules into the base runtime.

## [0.6.174] - 2026-06-12

### Added

- Copying a subtitle line now flashes a small check on the copy button, "Include the translation when copying a line" is a Media setting (default on, matching the old behavior), and rows with an aligned translation get an eye toggle to peek it while the list stays Japanese-only.

### Fixed

- Blank bands in the subtitle Lines panel: auto-translated tracks ship literal HTML entities, and a cue containing only `&nbsp;` rendered as an empty full-height row. Entities are now decoded, so empty cues are dropped.
- The hosted video-player page called an undefined hook on every language/theme application; the error aborted page setup. The subtitle player smoke also injects the companion scripts now (the player moved into the video companion long ago, so the smoke could never mount it).

## [0.6.173] - 2026-06-12

### Fixed

- The extension-only "Set Study as the new tab" toggle no longer drags the boot module into the settings form (an import cycle that broke runtime detection in 0.6.172); the runtime probe lives in its own dependency-free module and the toggle labels are localized (en/ja).

## [0.6.172] - 2026-06-12

### Fixed

- Image OCR now starts on large image-reader surfaces even when the page has no Japanese DOM text, covering image feeds and manga/gallery viewers rather than only standalone image documents.
- OCR overlays now refresh when an inner scrolling container moves, so image-feed pages that keep `window.scrollY` fixed still keep text regions aligned.

## [0.6.172] - 2026-06-12

### Fixed

- Disappearing/clipped text on YouTube (feed titles ending in bare "…", channel rows clipping mid-glyph, comment bodies vanishing, end-screen tiles): hosts that hydrate progressively apply their line-clamp/ellipsis styles after Yomu annotated the text, and rescans never revisit already-annotated words — so the grown furigana line stayed and the crop swallowed the base text. A clamp sweep now runs after every scan (and again once hydration settles) and strips ruby from rows that became layout-sensitive, keeping the colors and lookups. Verified end-to-end with a Playwright reproduction of the late-clamp race.

### Changed

- "Set Study as the new tab" is back as a real toggle in extension builds (extensions can override the new tab); userscript installs keep the guidance text instead of a checkbox that can't work.

## [0.6.171] - 2026-06-12

### Fixed

- jpdb.io "Kanji used" glyphs and the pitch-accent diagram are no longer word-annotated — the kanji link was matching rare alt-form words (穏 rendered a しずか reading under the glyph).
- The paused-video OCR snapshot now pins to the video's real content box instead of stretching across the letterbox bars.
- Clicking OCR'd text on a video thumbnail no longer navigates to the video — the click stays with the lookup.
- The study-address help ("set as your browser's start/new-tab page…") is no longer overwritten by the offline-cache help; both texts are now accurate and live in their own spots.

### Changed

- Removed the "Enable Yomu study page" checkbox — it had no effect (a userscript cannot override the browser's new tab); the address guidance now explains the real options.
- The Shortcuts panel now lists the fixed Study-page keys (Space/Enter reveal, 1–9 grades, U undo, ←/P previous-undo, →/N next) so every shortcut is documented in one place.

## [0.6.170] - 2026-06-12

### Added

- Words that live in both the Jiten and JPDB review queues now keep both identities after merging, so the study grade-target selector offers Both / Jiten / JPDB (and Anki) per card — grading just one provider works exactly like the jpdb+anki pairing always has.

### Changed

- Triaged the 15-screenshot iPad feedback wave into the backlog (UT-64…UT-78): jpdb kanji-used furigana position, lookup pitch gaps, keyless subtitle completeness, lines-panel gap, copy-subtitle UX, end-screen clipping, disappearing feed/comment text, shortcuts-settings completeness, jitendex regression, study-settings copy, sidebar-left player void, unannotated chrome, paused-OCR stretch, reddit styling.

## [0.6.169] - 2026-06-12

### Fixed

- Removed the remaining "one credential or the other" assumptions: with both Jiten and JPDB keys, Jiten features no longer pretend JPDB is absent, settings labels read "Jiten + JPDB" where both apply, and an open jpdb.io review tab no longer hijacks the merged study queue in Auto mode — the explicit "Live JPDB review session" mode is the only thing that preempts, exactly as chosen.

## [0.6.168] - 2026-06-12

### Added

- With both Jiten and JPDB connected, the study page's deck picker now has one-tap "JPDB" and "Jiten" entries to study a single provider's queue — "All vocabulary" keeps mixing both, and individual decks keep scoping further.

## [0.6.167] - 2026-06-12

### Added

- Undo now works after every grade, on every provider: Jiten reviews reverse server-side as before, while JPDB and Anki grades — which cannot be reversed upstream — return the card to the front of the queue with an honest note that the recorded review still counts. The U key and the undo button appear for all of them.
- Pressing Previous (or the browser Back button) right after grading performs that undo — stepping back across a grade boundary is the natural undo gesture.
- Every study card has a stable URL (#card=…): advancing pushes browser history, so back/forward walk the session, a reload lands on the same card, and links to a specific card can be shared or bookmarked.

## [0.6.166] - 2026-06-12

### Changed

- Rendered Anki card headings no longer show raw database card ids: a multi-card note reads "Deck · Template" (or "Deck · Card 2"), while grade-target labels keep the #id where it genuinely disambiguates duplicate cards.

## [0.6.165] - 2026-06-12

### Added

- The study page's due summary now includes kanji reviews waiting on jpdb.io ("+N kanji on jpdb.io") whenever a jpdb.io learn or review tab is open: kanji reviews only exist on jpdb.io itself (the API has no access to them), so the page previously under-reported dues compared to jpdb Learn without saying why. The bridge that powers live reviews now also reads the Learn page's due composition.

## [0.6.164] - 2026-06-12

### Added

- Jiten study decks appear in the study page's deck picker (labelled "Jiten · deck name") when a Jiten key is connected. Picking one scopes the queue to that deck's words — Jiten's API has no per-deck review call, so Yomu intersects the global batch with the deck's word list. Picking a JPDB deck now scopes to JPDB only, and "All vocabulary" merges both providers as before.

## [0.6.163] - 2026-06-12

### Fixed

- Filtering no longer shifts the feed under your finger on mobile: the scroll compensation that keeps the viewport steady when cards hide now finds the actual scrolling container (m.youtube.com scrolls inside one, not the window), so it engages on phone and tablet layouts where it previously never fired.

## [0.6.162] - 2026-06-12

### Changed

- Grading with the buttons now advances with the same brief card-enter motion as a committed swipe, so the two grading paths feel identical (disabled under reduced-motion preferences). The failed-card requeue uses it too.
- The appearance preset and "Color words" options are now localized in Japanese.

## [0.6.161] - 2026-06-12

### Added

- First-run guidance on the study page: when no SRS source is connected, the practice-words view now shows a "Connect Jiten / JPDB / Anki" button that opens settings directly — instead of silently showing random practice words.

### Verified

- Live queue-mirroring check against Jiten with a seeded account: the study page's card order matched the Jiten API's own study batch exactly (due cards first, then the server's new-card order), and the count line matched the API's due summary.

## [0.6.160] - 2026-06-12

### Added

- Press U on the study page to undo the last review where an undo exists (Jiten), matching the on-screen undo button — keyboard-only reviewing no longer needs the mouse for corrections.
- The Anki deck picker on the study page now shows each deck's waiting count (reviews + learning) straight from Anki's scheduler, refreshed at most once a minute.

## [0.6.159] - 2026-06-12

### Changed

- Loading Anki reviews on the study page is substantially faster: candidates from disabled decks are dropped with one cheap call before any card rendering, and card details now stream in small batches that stop as soon as the queue is full — instead of rendering an entire overfetched window up front (AnkiConnect renders every card's templates at ~110ms per card, so this cuts seconds to tens of seconds off study startup on large collections).

## [0.6.158] - 2026-06-12

### Fixed

- Anki kanji cards (RTK-style decks) no longer show the same kanji repeated several times: those templates render the glyph in multiple decorative fonts that cannot load outside Anki, so the repeats collapsed into identical copies. Yomu now keeps one glyph per card side and drops the duplicates (verified against a real RRTK deck), along with dead text-to-speech placeholders.

### Changed

- The Anki status index rebuild is dramatically faster on large collections: it now derives note, deck and state information from three fast bulk queries instead of asking Anki to render every card's templates (~110ms per card — about 20 minutes for a 12k-card collection, now seconds). Classification verified identical against a live collection; the old path remains as a fallback for older AnkiConnect versions.

## [0.6.157] - 2026-06-12

### Fixed

- Compact UI text is no longer excluded from annotation: tight rows, small headings and media-bearing text links (like YouTube channel names next to avatars) now get colour/state annotation without furigana, instead of being skipped entirely. Ruby still stays off those rows so it can never crop or reflow them; true icon buttons and UI chrome remain untouched.

## [0.6.156] - 2026-06-12

### Fixed

- Jiten and JPDB API keys now coexist: settings has separate fields for each, and the study queue mixes both providers' reviews in one session. Previously saving a Jiten key silently erased the JPDB key, which made the study page mirror only Jiten while jpdb.io Learn kept counting dues — the main source of "my queue doesn't match jpdb" reports. A Jiten-format key pasted into the JPDB field still routes to the right place.

## [0.6.155] - 2026-06-12

### Fixed

- The Shorts shelf now fills its visible row properly after filtering: Yomu pages the shelf until it has as many Japanese items as the row advertises (or the paging cap is reached), and a shelf whose hydrated items are all non-Japanese collapses entirely instead of stranding one or two cards. Fully-filtered shelves are paged too — previously they froze empty because hiding happened before backfilling.
- Keyboard hint pills are no longer rendered at all on touch-only devices (previously they were only hidden with CSS).

## [0.6.154] - 2026-06-12

### Fixed

- Refreshing a video page no longer loses subtitle ruby and colouring: parsed cue annotations now persist for the browser session (six-hour cap) and restore instantly on reload instead of waiting for a fresh parse. This also covers keyless use, where the local parse result is the final one — it is persisted and reused the same way.

## [0.6.153] - 2026-06-12

### Added

- Appearance presets with a live preview (user request): one-click configurations covering the popular jpdb CSS recipes without writing CSS — don't color words, only color new words, underline new words instead of coloring, show all furigana, hide furigana for chosen card states, furigana on hover only, or no furigana. A sample annotated sentence in Settings → Reading restyles instantly as you change options.
- Furigana hiding is now per state group: choose any combination of Known, Due, Failed, Learning and New under "Hide for chosen states". A new "Show on hover only" furigana mode renders ruby invisibly until the word is hovered.
- New "Color words" option: keep Yomu's coloring on every card state, or only on new/not-in-deck words (everything you're already studying inherits the page's own text style).

### Changed

- The default furigana mode is now Automatic: with a Jiten/JPDB key or Anki connected it hides furigana for words you know (known, due and failed states by default — your request), and falls back to difficult-kanji-only furigana otherwise. An explicitly chosen mode is never changed.

## [0.6.152] - 2026-06-12

### Fixed

- Mix and playlist stacks no longer clutter the filtered YouTube feed: the modern lockup-style cards (stacked collection thumbnails linking to watch?v=…&list=RD…) evaded the playlist detection because their links look like ordinary videos and their Japanese titles (ミックスリスト …) passed the language filter. They are now always treated as non-video items and hidden while filtering. (Live-verified on a signed-in feed: visible mix stacks went from several to zero.)

## [0.6.151] - 2026-06-12

### Added

- Swipe-to-grade on the study page can now be turned off: Settings → Study → "Swipe cards to grade (left = fail, right = pass)".

### Fixed

- Study-page keyboard shortcuts (Space to reveal, 1-9 to grade) now work from a fresh page load and after every button press. They previously only worked while focus happened to sit inside the page content, which broke after each re-render — most visits had effectively dead shortcuts.
- The inline keyboard hint pills (like "Space" under the Reveal button) disappear permanently after the first time a shortcut is used — shortcuts stay discoverable in settings. Touch-only devices never see them (already the case).

## [0.6.150] - 2026-06-12

### Fixed

- Sparse YouTube shelves after filtering: when the Japanese-content filter leaves a shelf (e.g. the Shorts row) with fewer than three visible items, Yomu now pages the shelf forward (its own "show more" / next control) so YouTube hydrates more items for the filter to keep — instead of the shelf shrinking to one or two cards. Capped at four pages per shelf and throttled so a genuinely non-Japanese shelf is not paged forever. (The shelf "show more" hydration was verified live on a signed-in feed: 5 → 9 rendered items per click.)

## [0.6.149] - 2026-06-12

### Fixed

- YouTube feed gaps: shelf carousels (Shorts, news and similar rows) render their items lazily, so when the Japanese-content filter collapsed the rendered neighbours, YouTube's still-unrendered slots slid into view as blank full-height boxes. Those unhydrated slots now stay out of the flow until YouTube fills them, removing the empty holes in filtered feeds. (Verified on a signed-in feed: blank shelf boxes collapsed, grid reflows cleanly.)

## [0.6.148] - 2026-06-12

### Added

- Pausing a video now OCRs the paused frame (user request): the frame is snapshotted over the player and read with the same OCR pipeline as images, so on-screen Japanese (captions burned into the video, slides, signs) becomes readable words while paused. The overlay disappears the moment playback resumes or the video changes. Respects the OCR provider/enabled settings, skips small players, and can be turned off with the new `ocrVideoPauseFrames` setting. DRM-protected frames that cannot be captured are silently skipped.

## [0.6.147] - 2026-06-12

### Fixed

- Study-page sentences no longer show furigana over words you already know (known, mature, never-forget and similar states), even when the global furigana mode is "all" — the study page is a review surface, so readings only appear for words still being learned. Explicit stricter modes (off, difficult kanji, known status) behave exactly as before.

## [0.6.146] - 2026-06-12

### Fixed

- Study page swipe-to-grade works on iOS Safari: the card now declares `touch-action: pan-y`, so Safari no longer claims horizontal pans (which cancelled the gesture before the grade threshold), and the active pointer is captured once a drag starts so fast flicks cannot drop their release.
- The swipe edge glows are now real grading affordances: red on the left (fail) and green on the right (pass), visible only while dragging and scaling with drag distance. The old always-on green glows on both edges of review mode and the static green strip at the top of the page (which read as a stuck swipe indicator) are gone, including the first-paint copy in the page template.
- The study session clock stops itself if its environment disappears mid-tick instead of throwing from the timer.

## [0.6.145] - 2026-06-12

### Changed

- Study page internals: the search detail-expansion renderers (header, definitions, loading state, fallback definition sources, inline kanji section shell) moved out of the controller hotspot into the search view module as pure helpers — no behavior change.

### Fixed

- The study-page Playwright smoke harness works again (it had silently drifted after the session-progress, grade-target and stop-at-batch reworks): it now also pins the failed-card requeue loop, the undo-review button after a Jiten grade, the JPDB all-decks union with due-time lookups, and the "Batch complete" breather, browser-level. Its API mocks are stateful (a reviewed card leaves the due pool) and the impossible combined JPDB+Jiten credential scenario was replaced with a JPDB-only one (by design, a Jiten key takes over the single API credential slot).

## [0.6.144] - 2026-06-12

### Changed

- Page scanning: a new scan now cancels the previous one between batches (fast scrolling or navigating no longer wastes time parsing regions that already left the screen), removed or changed text is skipped before parsing, and very long paragraphs no longer stall a scan turn.

## [0.6.143] - 2026-06-12

### Changed

- Anki setup: the status line now shows an explicit state badge (Off / Probing / Unreachable / Connected / Scanning / Mapped / Ready) and, after a library scan, lists each suggested field mapping with how confident the match is (high match / fuzzy match / unmapped) — no more guessing what the automatic setup concluded.

## [0.6.142] - 2026-06-12

### Added

- Failed cards now loop within your study session, jpdb-style: grading Nothing/Something (or Fail in two-button mode) puts the card at the back of the current queue so it comes around again until you pass it. Hard still advances the card.

## [0.6.141] - 2026-06-12

### Added

- Stop at the end of each batch (optional, off by default): when your loaded review batch runs out, the study page now shows a 'Batch complete' summary with your review count and session time, and waits for you to press Continue instead of silently fetching more cards.

## [0.6.140] - 2026-06-12

### Added

- Undo review (Jiten): after grading a Jiten card on the study page, an Undo button appears for a few minutes — it reverses the review on Jiten and puts the word back in front of you, unrevealed. (JPDB's API and AnkiConnect expose no review-undo, so this is Jiten-only for now.)

## [0.6.139] - 2026-06-12

### Changed

- Internal hygiene: dead-code analysis is back to zero findings (post-refactor internals privatized, companion-seam types documented as intentional).

## [0.6.138] - 2026-06-12

### Changed

- Anki card audio: media files are now cached after the first play, so replaying a card's audio (or revisiting the same note) no longer re-downloads it from AnkiConnect each time.

## [0.6.137] - 2026-06-12

### Fixed

- Study page: the session clock now stops when you leave the Word tab, and daily-goal time only counts seconds actually spent studying words (it previously kept ticking on the Stats/Search tabs and while idling).

## [0.6.136] - 2026-06-12

### Changed

- Internal: study-page search result rendering moved into its own module (smaller controller, no behavior change). Jisho audio source-selection verified to already match Yomitan's exactly (live-checked against jisho.org); Jiten deck-based word styling parked pending observable study-deck data.

## [0.6.135] - 2026-06-12

### Changed

- Toasts redesigned: multiple notifications now stack neatly instead of overlapping, fade in and out (animations respect reduced-motion preferences), and repeated identical messages extend the visible toast rather than piling up duplicates.

## [0.6.134] - 2026-06-12

### Added

- Mass review (Jiten): use the mining mark shortcut (`Shift+M` by default, configurable under Settings → Shortcuts) to review every visible due/learning Jiten word on screen as Good in a single batch — the same 'review everything on screen' flow JitenReader users know. Word colors refresh right after.

## [0.6.133] - 2026-06-12

### Changed

- Internal cleanup: learner-glossary summarization is now a single shared helper used by both the dictionary grouping and study-page meaning cleanup; the two remaining cross-boundary duplications (build scripts vs runtime) are documented as intentional with keep-in-sync notes.

## [0.6.132] - 2026-06-12

### Added

- Study page Search tab (user-requested '2D reviews'): pick a deck from the dropdown to browse its full word list in your actual review-queue order; typing then narrows within it, with words starting with your input ranked first. State chips are now multi-selectable, a compact sort row offers queue order / A→Z / frequency with an ascending/descending toggle, and bulk-select checkboxes only appear after tapping Select. Plain dictionary search stays the default when nothing is selected.

## [0.6.131] - 2026-06-12

### Added

- Study page (user-requested): jpdb-style combined kanji+word queue — locked words now serve their kanji card first, and the word unlocks once the kanji is learned. A new setting, 'Study kanji before unlocking words' (on by default), lets kanji-skippers turn this off and study locked words directly; the Kanji tab stays available for isolated kanji study, and toggling never affects your progression.
- The welcome screen now mentions the built-in study page.

## [0.6.130] - 2026-06-12

### Fixed

- Study page, JPDB (user-reported): 'No reviews ready — showing practice words' with due cards waiting, and endless 'searching for words', are fixed — the all-decks listing no longer scans your decks in tiny sequential chunks (it unions every deck in parallel and resolves them in one bulk request) and gets a longer time budget.

### Changed

- Study page, JPDB: the review queue now sorts by jpdb's own due_at timestamp, so the order matches jpdb Learn exactly — the next word on jpdb is the next word here. Cards without a due time (new/locked) follow in deck order.

## [0.6.129] - 2026-06-12

### Added

- Study page (user-requested): a live session timer now ticks during study in every mode, and a daily study goal setting (default 60 minutes, set 0 to disable) shows your progress next to it ('12/60 min', with a checkmark when reached). Time only counts while the study tab is visible.

## [0.6.128] - 2026-06-12

### Fixed

- Study page (user-reported): the front of a card no longer spoils the answer — the target word's furigana in the example sentence stays hidden until you reveal (other words keep theirs, like jpdb's Learn).
- Study page (user-reported): Immersion Kit controls are compact — the 'IMMERSION KIT' label is gone (clip title is enough; provider shown on hover), and prev/audio/next sit inline with the title instead of on their own oversized row.
- Stats (user-reported): the last bar of the daily activity chart no longer looks permanently 'selected'; the outline now only appears when you actually pick a day.
- Study page (user-reported): without any API key the Show-only state filter dropdown is hidden — keyless dictionary study has no card states to filter.

## [0.6.127] - 2026-06-12

### Fixed

- YouTube channel shelf (user-reported): the one-line channel description no longer flashes into the full multi-line bio after parsing (newlines became <br> and escaped the ellipsis clamp); this also removes the furigana-overlap seen inside expanded bios.
- YouTube feed (user-reported): community posts from non-Japanese channels are now filtered by their post text on desktop and mobile; a channel's own Posts page stays unfiltered, and the mobile 'read more' (続きを読む) button no longer counts as Japanese content.
- Subtitles (user-reported): foreign-language captions (e.g. Arabic) are no longer mirrored while the selected Japanese track is still loading — no more wrong-language flash before Japanese subs appear.

## [0.6.126] - 2026-06-12

### Fixed

- Mobile YouTube (user-reported): scroll position no longer jumps as videos load in — iOS Safari has no scroll anchoring, so filtering a card above the viewport shifted the page; the filter now keeps the element you are looking at stationary by compensating the scroll position.
- Subtitle player (user-reported): rerender loop fixed — identical render ticks no longer rebuild the subtitle DOM, which was wiping pitch-accent and word-state highlights moments after they appeared and causing flicker and page lag.

## [0.6.125] - 2026-06-12

### Fixed

- YouTube channel shelf (user-reported): Subscribe said 'Subscribed' but the account was never subscribed — InnerTube write calls now carry the signed-in SAPISIDHASH authorization (YouTube silently applied unauthorized writes to the anonymous visitor session). When signed out, the shelf now says 'Sign in to YouTube to subscribe to channels.' instead of faking success.
- Subtitle popover (user-reported): the track-status line ('2 subtitle tracks detected') could be appended to the sentence sent to translation when a cue ends without punctuation; subtitle player chrome is now excluded from sentence context.

## [0.6.124] - 2026-06-11

### Fixed

- AnkiMobile handoff (user-reported): adding a card from iOS failed with 'no such note type id よむ+Japanese' — the handoff URL encoded spaces as '+', which AnkiMobile does not decode. The x-callback URL now uses %20 encoding for the note type, deck, tags, and every field. AnkiDroid was unaffected.

## [0.6.123] - 2026-06-11

### Added

- When AnkiConnect can't be reached, the settings status now diagnoses WHICH step failed instead of a generic 'not connected': if AnkiConnect is running but rejecting this site (the usual Firefox case), the message names the exact origin to add to webCorsOriginList in the add-on's config — with the matching Japanese copy; only a genuine network failure keeps the 'open desktop Anki' guidance.

## [0.6.122] - 2026-06-11

### Fixed

- Reviews or edits done inside Anki itself no longer leave stale word colors when the collection's card count happens to stay the same: the status index's count check now also sweeps recently-edited cards by modification time (AnkiConnect cardsModTime) and refreshes when anything changed since the last sync. Older AnkiConnect versions without cardsModTime keep the previous behavior.

## [0.6.121] - 2026-06-11

### Changed

- JPDB review-order audit (last open P0): live-review mode mirrors jpdb.io's own session exactly — including locked-kanji interleave — and the default auto mode prefers it whenever a review tab is connected. The API cannot reproduce that order (it exposes deck order only, no due data), so the 'API vocabulary only' setting now says so in its label instead of implying parity.

## [0.6.120] - 2026-06-11

### Added

- Kana-run word identity (the last piece of the kana-run parity P0): when tapping part of a kana-only word like にほんご resolves the full word, every rendered fragment in the run now takes on the resolved word's identity — so grading, mining, or a cross-tab state change recolors the whole word everywhere, not just the fragment you tapped. Surface-mismatch fails closed; ruby annotations are handled.

## [0.6.119] - 2026-06-11

### Added

- Live JPDB reviews now complete the cross-tab card-state bus: after grading through the review bridge, Yomu reads the card's true post-grade state back via the API (the bridge card id carries the real vid/sid from the review URL) and broadcasts it, so the same word recolors in every open tab — exactly like API-graded and Anki-graded cards have since 0.6.82. Without an API key the live grade still lands; no state is guessed.

## [0.6.118] - 2026-06-11

### Changed

- Kanji study mode's extraction from Anki cards is now pinned by tests (word cards contribute their kanji with the Anki note linkage but stay ungradeable as kanji; standalone RTK-style kanji notes win dedup and keep their keyword) — closing the 'unverified/partial' backlog ticket.
- Removed the vite-plugin-monkey client runtime import: the document-mounted monkey windows it exposed are already discovered by the existing scan (P4 backlog cleanup).

## [0.6.117] - 2026-06-11

### Fixed

- Example sentences (Immersion Kit examples in popovers and study-card sentences) no longer leave words without pitch accent when you have a JPDB API key: local-dictionary pitch now fills in wherever the API returns none, in both surfaces — it was already fallback-only, so API pitch is never overridden. Closes the example-sentence pitch-gap ticket.

## [0.6.116] - 2026-06-11

### Changed

- Anki status lookups now search your mapped expression/reading fields first (e.g. Word:読む OR Kana:よむ), so text in sentence or definition fields can never create a false 'in Anki' match. The old whole-note search still runs, but only as a low-confidence final pass for words the field-scoped search couldn't find — keeping nonstandard and unmapped decks discoverable. Closes the last slice of the field-scoped lookup ticket (rest shipped 0.6.76).

## [0.6.115] - 2026-06-11

### Added

- My Cards browser: Anki rows now show a due-in bucket (Due / ≤1d / ≤7d / ≤30d) answered by Anki's own scheduler search — the last open study-hub parity ticket. Jiten and JPDB rows stay blank rather than guessing: their APIs expose no per-card due timestamps.

## [0.6.114] - 2026-06-11

### Fixed

- Mobile: on sites with their own bottom action dock — Jiten's study page with its grade bar and Blacklist/Master/More row — the よむ puck no longer overlaps the native controls; it rises above the dock (live-verified on an iPhone-size viewport with the split build).

## [0.6.113] - 2026-06-11

### Changed

- ADR-0003 phase 2 complete: the kanji drilldown surface (origin graphs, KanjiVG stroke data, RTK keywords, JPDB kanji pages, practice doodle, and their render layer) now lives entirely in the Yomu Kanji/Study companion. The core userscript drops from 1,961,982 to 1,825,206 bytes — 136,776 freed, headroom up from 38 KB to 175 KB — via a single registry seam in popup/render.ts, so no call sites changed. Extension/self-contained builds and the study page register the companion modules at build time and behave identically; on Greasy Fork the companion is @require'd with an SRI hash, and if it ever fails to load, kanji drilldowns degrade to dictionary-only sections instead of breaking.

## [0.6.112] - 2026-06-11

### Changed

- ADR-0003 phase 1: a third Greasy Fork companion library, Yomu Kanji/Study (kanji origin graphs, KanjiVG stroke data, RTK keywords, JPDB kanji pages), now builds and ships alongside the Settings Surface and Video companions, with its registry slot wired into the core. Phase 2 (severing the core's direct imports, freeing ~147 KB toward the 2 MB Greasy Fork limit) follows; behavior is unchanged in this release.

## [0.6.111] - 2026-06-11

### Added

- The in-page study-deck selector now works for the Anki source too: pick All decks or any single deck (subdecks included, disabled-deck toggles still honored) and the Anki review queue rescopes immediately — completing per-deck study for both providers that support it (JPDB shipped in 0.6.97; Jiten is parked until its API exposes study decks to scope).

## [0.6.110] - 2026-06-11

### Added

- New (unseen) Anki cards now show due-in previews too: Again/Hard/Good/Easy derive from your deck's actual learning steps via getDeckConfig ('<1m', '<6m', '<10m', '4d') — the same numbers Anki shows on a fresh card, one config fetch per distinct deck. With 0.6.108/0.6.109 this completes the due-in story across study queue and popover for every provider that has the data.

## [0.6.109] - 2026-06-11

### Added

- Due-in previews now appear on the popover grade row too — the buttons you grade page words with — matching the study page and Jiten's 1m/10m/16d/28d pattern. Anki existing-note grade rows get the same computed Hard/Good/Easy previews as the study queue.

## [0.6.108] - 2026-06-11

### Added

- Anki review cards in the study page now show due-in previews on the grade buttons (Hard/Good/Easy — '12d', '25d', '1.1mo'), computed the same way Anki's own answer buttons are: current interval x hard factor / x ease / x easy bonus. AnkiConnect only exposes the real strings inside its GUI reviewer, so queue cards never had them. Learning and new cards stay blank instead of guessing your deck's step config — no invented numbers on a trust surface.

## [0.6.107] - 2026-06-11

### Fixed

- jiten.moe/srs/study: Yomu's Immersion Kit and dictionary sections now appear inside the revealed study card — right after Jiten's own Kanji breakdown / Composed of — instead of detached at the top of the page. They also no longer mount during the question phase, where showing dictionary entries spoiled the answer. Live-verified on a signed-in study session.

## [0.6.106] - 2026-06-11

### Added

- Stats: the Anki Due-now metric now carries a real upcoming-review forecast — 'Next 7d / Next 30d' — answered by Anki's own scheduler (prop:due search), scoped to your enabled decks, suspended cards excluded. No client-side guessing at Anki's queue encodings.
- Study card backs now show the 'Part of the X deck' line for every provider: JPDB (deck-scoped queues and the live bridge's scraped line), Anki (the card's owning deck), and Jiten (the study batch's source deck).

## [0.6.105] - 2026-06-11

### Added

- When the study queue is scoped to a specific JPDB deck, every card's back now carries jpdb.io's 'Part of the X deck' membership line (localized). Live-bridge cards keep the line scraped from jpdb.io itself when present.

## [0.6.104] - 2026-06-11

### Added

- iPad/tablet landscape: the study card now uses the width — word and sentence on the left, revealed answer (reading, meanings, Composed-of, Immersion Kit) on the right, with session and grade controls spanning below. Applies on coarse-pointer landscape viewports 1000px and wider; verified against a real 1180x820 render.

## [0.6.103] - 2026-06-11

### Added

- The study-deck selector now shows each JPDB deck's progress like jpdb.io's Learn page: vocabulary count and known-coverage percentage ('誕生日 · 39 · 65%'), fetched through the same list-user-decks call (no extra requests).

## [0.6.102] - 2026-06-11

### Added

- My Cards browser now has Jiten-style bulk actions: a select-page checkbox plus per-row checkboxes, with Blacklist and Never forget acting on everything selected. Each card goes through the same action path as the popover buttons, so provider behavior is identical (JPDB deck moves, Jiten local workaround, Anki suspend/tag) and the list reloads with the new states afterwards.

### Fixed

- Stats learning-progress total now reads 'Total known non-redundant vocabulary', matching jpdb.io's Learn page word for word (the count already excluded redundant/blacklisted cards).

## [0.6.101] - 2026-06-11

### Added

- The Word tab now has jpdb.io's 'Show only' filter controls as a compact select beside the study-deck scope: Study (the scheduled queue), All, or any single state — New, Learning, Due, Failed, Known, Never forget, Suspended, Locked, Blacklisted, Redundant. Picking a settled state merges the full card pool in (the scheduled loader intentionally drops known/blacklisted cards), so filters like Known and Blacklisted really browse everything — matching the deck-browse filters on jpdb.io. The choice persists per device.

## [0.6.100] - 2026-06-11

### Added

- The My Cards browser on the idle Search tab now includes your Anki cards alongside Jiten and JPDB — state chips, search, and rows span all three providers (study-hub parity SH-3 v2). Anki joins only the browser pool; the stats page keeps its dedicated Anki source so nothing double-counts.

## [0.6.99] - 2026-06-11

### Added

- Study controls now advertise their keyboard shortcuts the way jpdb.io and Jiten do: the reveal button shows Space and each grade button shows its digit (1..5 in rendered order). Hints are decorative (aria-hidden) and disappear on touch devices. Discovered by running the live Jiten study journey with the userscript injected — Jiten's own 'Show Answer — Space' hint set the bar.

## [0.6.98] - 2026-06-11

### Added

- Revealed word cards in the study page now show a 'Composed of' line — the word's component kanji as chips with their RTK/JPDB keywords, tappable to open the full kanji drilldown — matching the back of jpdb.io's review cards (study-hub parity SH-4). Kana-only words skip the line.

## [0.6.97] - 2026-06-11

### Added

- Word tab now has an in-page JPDB study-deck selector (study-hub parity SH-6): pick All vocabulary or any of your JPDB decks right where you study — mirroring jpdb.io's per-deck Learn — and the review queue rescopes immediately through the same scheduled-cards loader. The choice persists per device alongside the other study-page state; the settings default still applies until you pick something. Mobile-safe (16px select, no iOS zoom).

## [0.6.96] - 2026-06-11

### Fixed

- Mobile (m.youtube.com) Shorts: swiping no longer lands on non-Japanese shorts. The 2026 mobile player is a JS carousel (shorts-page > shorts-carousel) with no per-item card elements, so the card filter could never classify the active reel — the active short's title is now read from the player overlay, classified through the same rules as feed cards, and non-Japanese actives are skipped by clicking the carousel's hidden accessibility 'next video' button (locale-independent, verified against the live mobile player).

## [0.6.95] - 2026-06-11

### Added

- Stats tab Today parity (Jiten shape): a 'Due now' tile with the estimated clear time, and the reviews-today tile now shows '+N new' for cards introduced today. (SH-7 core.)
- My Cards browser: with a state chip active, typing in the search box now searches your own cards (spelling or reading) instead of the dictionaries — pick the All chip to return to dictionary search. (SH-3 v2.)

## [0.6.94] - 2026-06-11

### Added

- jpdb.io keyboard parity in the study tab: with the answer revealed, the 1–5 digit keys press the grade buttons in order (1=Nothing … 5=Easy on JPDB-style bars; 1=Fail 2=Pass on two-button bars). Space/Enter reveal and arrow-key navigation were already there. Digits never fire on the card front or while typing in a field. (Study-hub parity SH-8.)

## [0.6.93] - 2026-06-11

### Added

- Live JPDB review cards in the study tab now show jpdb.io's own deck-membership line ('Part of the Persona 5 deck (3x)') on the back, scraped from the review page through the bridge — the back of the card reads the same as on jpdb.io. (Study-hub parity SH-4, first slice.)

## [0.6.92] - 2026-06-11

### Added

- The study page's Search tab now opens as a 'My Cards' browser when Jiten or JPDB is connected: your whole SRS pool with state filter chips in JPDB's Show-only order (All/New/Learning/Due/Failed/Known/Never forget/Blacklisted/…) including live counts, 50-per-page rows showing the word, reading, first meaning, state badge, and frequency rank — and tapping a row opens Yomu's full lookup (dictionaries, Immersion Kit, mining) for that card. Typing still searches dictionaries as before. Touch-sized rows; meanings column folds away on narrow screens. (Study-hub parity SH-3 v1.)

## [0.6.91] - 2026-06-11

### Fixed

- Study cards backed by JPDB now front JPDB's own example sentence — exactly what jpdb.io shows on its review front — with Immersion Kit sentences as the fallback for cards the provider gives no sentence, instead of replacing JPDB's content. Non-JPDB cards keep the Immersion-Kit-first behavior. (Study-hub parity SH-5.)

## [0.6.90] - 2026-06-11

### Added

- Study session label now mirrors JPDB's Learn summary: when the due pile mixes vocabulary and kanji it shows the split ('20 words · 92 kanji'), and unseen items add an 'N new' count — alongside the existing Done/Left/Due session progress. Second slice of the study-hub parity plan.

## [0.6.89] - 2026-06-11

### Added

- Stats tab now opens with a JPDB-style learning-progress table — 'Learning | You know' columns with the Words row (total, learning count, known count and percentage) and a 'Total known vocabulary' line — for whichever provider is selected (Jiten, JPDB, Anki, or combined).

## [0.6.88] - 2026-06-11

### Added

- New mobile option: 'Mobile sheet: close button on the left' — parks the lookup sheet's close button on the left edge for one-handed reach (Jiten Reader parity). Off by default; localized.

## [0.6.87] - 2026-06-11

### Added

- New reading option: 'Hide styling on JPDB-redundant words' (Jiten Reader parity). When enabled, words JPDB marks redundant keep tap/hover lookup but render as plain page text — no state color, underline, or highlight. Off by default; localized.

## [0.6.86] - 2026-06-11

### Fixed

- Mining a card with a captured context image or audio into a Jiten or JPDB deck no longer drops the media silently: when no Anki note is created alongside (Anki co-mining off), the success toast now adds 'Captured image/audio stays in Yomu — this service has no media API.' (localized). Jiten and JPDB deck APIs cannot store media; now the UI says so.

## [0.6.85] - 2026-06-11

### Fixed

- Live JPDB review bridge: reveal and grade clicks now target jpdb.io's stable control ids (#show-answer, #grade-1…#grade-5) first, falling back to text matching — verified against a signed-in jpdb.io/review session, whose buttons carry ✘/✔ prefixes that pure text matching could trip over. Investigated next-review intervals for the live bridge and closed it as not possible: jpdb.io renders no interval data on the review page and has no setting to enable it.

## [0.6.84] - 2026-06-11

### Fixed

- Faster first colorization on busy pages: local pitch-accent lookups (IndexedDB, no network) now run 8 at a time instead of 2 during the cold-start backlog, and the first Anki status scan sends its findNotes batches as 50-term requests with three in flight instead of one big 120-term request — Anki stays responsive and page words color sooner.

## [0.6.83] - 2026-06-11

### Fixed

- YouTube channel suggestions shelf: being subscribed to every curated channel is now an explicit, celebratory state — the subscribe-all button reads "All 100 subscribed ✓" and disables, the subscribe-visible button hides when the compact view is empty, and the status line distinguishes "all shown channels subscribed — browse all for more" from "subscribed to all 100". The shelf no longer offers Subscribe all 100 against an empty list.

## [0.6.82] - 2026-06-11

### Added

- Cross-tab card-state propagation: grading, mining, or changing a card's deck state in any Yomu surface — the study new tab or a page popover — now recolors the same word in every other open tab immediately (GM storage change signals across origins, BroadcastChannel within an origin). Previously only the acting tab updated and other tabs waited for a rescan.

## [0.6.81] - 2026-06-11

### Fixed

- Anki notes tagged `yomu-never-forget` (the popover's never-forget action) now rank as never-forget everywhere Yomu colors words — popover lookups and the background status index — instead of flipping back to due/new whenever the card's queue state changed. JPDB parity: a word you marked as always-known stays that color.

## [0.6.80] - 2026-06-11

### Fixed

- New-tab Kanji tab: when the same kanji appears both as a real JPDB locked kanji card and as a candidate derived from a word, the study queue now keeps the locked card instead of whichever duplicate was seen first — locked kanji are scheduled SRS items in JPDB's own review flow, so the Kanji tab now reflects JPDB's selection.

## [0.6.79] - 2026-06-11

### Fixed

- asbplayer subtitle lines now appear already colorized instead of visibly recoloring after display: asbplayer pre-renders the whole track's cue HTML into its offscreen cache and moves the same DOM node onscreen when the cue is current, so Yomu now drains that cache in paced 12-cue batches (80ms apart) the moment it appears — every cue is parsed and colorized before it is shown, with or without a JPDB API key. The currently visible cue is prioritized into the first batch so it can never be starved by a long unprocessed backlog.

## [0.6.78] - 2026-06-11

### Fixed

- The video subtitle rail (previous/next subtitle, panel toggle) now appears and disappears in lockstep with the video player's own controls: when YouTube's chrome fades out during playback the rail hides with it, and it returns when the controls come back. On touch screens the old "always discoverable" overrides kept the rail pinned at 72% opacity through playback — those are gone, and sticky tap hover/focus can no longer hold the rail open (the stuck button is blurred when the chrome hides). Verified live on a real watch page.
- (Shipped in 0.6.77's artifacts, documenting here.) Logged-in YouTube home feed: filtered rows no longer leave gaps where videos could fit — the row-start margin compensation predated YouTube's 2026 lockup CSS (the gutter moved onto the grid container), so it overflowed and wrapped rows early; the grid rebalance also re-runs when YouTube re-asserts its row flags, and the loading skeleton (ghost cards) now takes a full-width row at true card size instead of squeezing into the leftover space of a partial row. Verified live on the signed-in feed.

## [0.6.77] - 2026-06-11

### Fixed

- Live JPDB reviews no longer trust a vanished review tab: the jpdb.io/review page now heartbeats over the bridge and announces when it closes, and the study tab marks a silent bridge as stale within 30 seconds — clearing the lingering card so jpdb-live drops out of the source list instead of letting grades post into the void. Returning to the study tab re-requests the current card automatically.

## [0.6.76] - 2026-06-11

### Fixed

- The popover's new-card Anki preview now shows the exact fields a mining write will target when the configured note type is an existing non-Yomu model (e.g. Kaishi/Core decks): the preview runs the same field retargeting as the write path (saved mappings, then field-name aliases against the live model), so values are listed under the real field names — Word/Kana/Definition — instead of Yomu field names that would have been silently remapped at write time.
- Anki searches now match literally: deck names and lookup terms are escaped through one shared helper (`*` and `_` act as wildcards even inside Anki's double quotes, so decks like Core_2k previously single-char-wildcard-matched and terms containing `*` over-matched). Nested-deck `::` stays unescaped so subdecks remain included. This replaces two divergent escaping copies used by status probes, model queries, and new-tab deck queries.

## [0.6.75] - 2026-06-10

### Fixed

- New-tab Jiten reviews now refresh the graded card's state from Jiten after submitting (the JPDB path already did this internally), so the review summary and any later renders of the card reflect the real post-review state.

## [0.6.74] - 2026-06-10

### Fixed

- Grading, mining, or blacklisting a Jiten-backed word now recolors that word everywhere on the page immediately, matching JPDB and Anki: Jiten card state is refreshed from a self-parse after each SRS action (Jiten only exposes state through /parse), and a new action-controller hook re-styles all rendered occurrences of the card for every API provider — no rescan or reload needed.

## [0.6.73] - 2026-06-10

### Added

- Multi-word expressions (気合いを入れる) now show pitch accent in the popover as one labelled mini graph per component: the expression is segmented against your local dictionaries (greedy longest match, particles skipped) and each component's own accent is rendered side by side — a single component's pitch is never presented as the whole expression's. Appears when the expression itself has no pitch entry, pitch accent display is on, and local dictionaries are enabled.

## [0.6.72] - 2026-06-10

### Fixed

- CI dead-code check: `JpdbClient.ping` is reached through the settings dialog's dependency interface, which the static analyzer cannot trace — marked with the same used-via-interface pragma as `parse()` (the 0.6.71 CI run flagged it).

## [0.6.71] - 2026-06-10

### Added

- The settings dialog now shows a live JPDB connection status: the static "JPDB key set" line upgrades to "Connected to JPDB" or "JPDB did not accept the key" via the jpdb `/ping` endpoint, probed when the dialog opens and whenever the key changes — matching the live probes Anki and Jiten already had.

## [0.6.70] - 2026-06-10

### Fixed

- youtube.com/feed/channels no longer renders empty with the feed filter on: the page wraps every subscribed channel in one shelf, which the filter classified as a hideable "non-video container" and removed as a single item. Containers holding channel listings are never treated as feed noise now (applies to channel shelves anywhere, not just /feed/channels).
- YouTube home feed gaps after filtering (the user-visible holes and full-width empty bands): the rowless lockup grid keys row-start margins off per-item `is-in-first-column` flags that YouTube computes for the unfiltered feed and never recomputes. After each filter pass the scan now strips the stale flags and re-marks the first visible item of each row with a margin-compensation class (the NihongoTube technique), and rich sections whose entire content is filtered are hidden with their wrapper so they stop leaving full-width bands. Scrolling stays natural — filtered cards still leave the flow with zero content-shift animation.
- Firefox: "Not allowed to define cross-origin object as property" console errors from the site-language preference are gone, and the Japanese-language spoof now actually applies on Firefox — property descriptors (getters and values) are cloned into the page compartment before being defined on Xray-wrapped objects.
- Restored the scan-word CSS regression assertion that broke the 0.6.69 CI run (the chip nowrap fix changed the selector; the older test still expected the unscoped rule).

## [0.6.69] - 2026-06-10

### Fixed

- m.youtube action chips (共有/保存/報告/チャンネル登録) no longer collapse into stacked, overlapping characters that spilled into the description area: scanned words inside passive UI controls now respect the host's nowrap contract instead of re-enabling per-character wrapping (the prose-wrapping rule from 0.4.47 now excludes `.jpdb-reader-passive-word`).
- New-tab auto review no longer shows the same word twice when providers disagree on kana script (JPDB ベッド vs Anki べっど): the cross-provider dedupe key is now kana-insensitive.

## [0.6.68] - 2026-06-10

### Fixed

- Hovering Japanese text on buttons, chips, tabs, and other clickable controls now shows the dictionary popover. Hover lookups treat interactive elements as readable text (a hover popover does not steal the click); click-driven lookups still leave controls alone so clicking a button performs its action. Structural content (form fields, furigana annotations, SVG, editable areas) stays excluded everywhere.

## [0.6.67] - 2026-06-10

### Fixed

- YouTube native-caption fallback (the "YouTube native captions" track) now parses each caption during its 180ms stability window instead of after it, so captions appear colorized with furigana the moment they render instead of flashing plain first.
- Immersion Kit translations no longer render ALL-CAPS on pages whose styles set text-transform on ancestors: example sentences and translations now pin `text-transform: none`.

### Added

- Playback-simulation regression tests pinning the just-in-time subtitle contract: continuous playback never displays a cue that is not already parsed and cached (40-cue walk under realistic parse latency), and a long seek re-warms the active cue plus its 10-cue lookahead within one warmup turn. These tests reproduce display-time parse misses if the warmup pipeline ever regresses.

## [0.6.66] - 2026-06-10

### Fixed

- Videos with only English subtitles now reliably offer (and auto-select) the auto-generated Japanese translation everywhere, not just on YouTube: native `<track>` subtitles (the Sky News-style player) now synthesize the translated track too, and the synthetic option no longer vanishes from the subtitle panel after the next track rescan — stale-track culling previously mistook it for a dead native/page track because it carries no TextTrack or page source of its own. The translation is removed together with its source track (orphan cascade) instead.
- A real Japanese track appearing after the machine translation was auto-selected now takes over as primary on all paths (native, page files, YouTube); the synthetic stays listed but never outranks the real thing.

## [0.6.65] - 2026-06-10

### Added

- Per-kanji furigana on all-kanji compounds: when the user's imported kanji dictionaries allow exactly one alignment of the whole-word reading (琉球藍 → 琉=りゅう・球=きゅう・藍=あい, including rendaku ぐみ and sokuon がっ surface forms), local-dictionary tokens now carry per-kanji ruby segments instead of one ruby spanning the compound. Ambiguous or unalignable readings keep the whole-word ruby — no guessing.

### Fixed

- m.youtube rows (video titles, channel bylines) no longer show only furigana with the base text clipped away: single-line ellipsis rows (overflow hidden + text-overflow: ellipsis on nowrap text) are now treated as layout-sensitive on every site regardless of measured height, so words stay lookupable and colored but ruby that would grow the line is suppressed. Wrapping prose with an inert text-overflow declaration keeps its furigana.

### Notes

- Restored a subtitle-CSS regression test that had drifted from the intentional 0.6.62 change (pitch underlines stay transparent until enrichment): the assertion now covers the transparent-by-default declaration, closing a gap where the full jpdb test shard had not been re-run to completion since.

## [0.6.64] - 2026-06-10

### Changed

- YouTube feed filtering now uses offscreen absolute positioning to hide non-Japanese cards (the technique used by NihongoTube) instead of display:none with max-height collapse animations. Filtered cards leave the layout instantly with no content-shift transition, YouTube's virtualized grid bookkeeping stays intact, and scrolling mostly-English feeds is dramatically smoother with fewer gaps.

### Notes

- Expression pitch (e.g. 気合いを入れる): showing a single component's pitch as the whole expression would be misleading, so the correct fix is a per-component multi-graph popover — designed and queued in the backlog rather than faked.

## [0.6.63] - 2026-06-10

### Fixed

- Pitch underline colors now show during video playback instead of arriving "just in time" (or only when pausing): local pitch accent is included at subtitle parse time, so the colors are baked into each cue's HTML before it is displayed; the per-word pitch lookup is cached.
- Audio now plays even on pages whose CSP blocks blob/data media entirely (claude.ai): when the media element refuses the source, playback falls back to Web Audio decoding (AudioContext), which media-src does not govern.
- jiten.moe direct loads (e.g. /parse?text=…) no longer leave the Immersion Kit / dictionary addons stranded in the wrong place with no examples: when the SPA hands us only a coarse pre-hydration anchor, the mount is marked and automatically re-anchored once the real content exists (previously only a manual refresh fixed it).

### Added

- `smoke:late-content` regression harness proving late-streamed SPA text (the Google Maps / claude.ai pattern) is parsed by the auto-scan observer; the live-site gap is narrowed to shadow-DOM/injection-timing suspects recorded in the backlog.

## [0.6.62] - 2026-06-10

### Fixed

- Audio on CSP-strict sites (e.g. claude.ai): fetched audio blobs were created without a MIME type, so media elements refused them ("Content-Type application/octet-stream is not supported", "No decoders"). Blob types are now inferred from the source URL (mp3/ogg/m4a/…), fixing word/sentence/Immersion Kit playback wherever blob URLs are permitted. (A Web Audio fallback for pages whose CSP blocks blob media entirely is tracked in the backlog.)
- Subtitles no longer render punctuation-only cues (a lone 。 or ?) as their own rows: sentence splitting merges trailing punctuation into the preceding line and contentless cues are dropped.
- Pitch-underline mode no longer flashes a colorless underline before the pitch class arrives — undetermined words keep a transparent underline.
- The channel-suggestions shelf now says "You are subscribed to all of these channels" when there is nothing left to suggest, instead of showing an empty list (or appearing broken).

## [0.6.61] - 2026-06-10

### Added

- Auto-mine on review (Jiten Reader parity, off by default — settings > Anki & mining): grading a word that isn't in your deck adds it to the mining deck automatically, so reviewing doubles as collecting.

### Changed

- Battery: the subtitle player's internal clock now adapts — 250ms only while a video is actually playing, slower while paused, and 1.5s (with no per-tick work) when the tab is hidden or the page has no video; it snaps back instantly when the tab becomes visible.

### Notes

- Jiten's API exposes no per-word deck-membership lookup (only per-deck word lists), so the "decks this word belongs to" popup list can't be built without N expensive requests; recorded as an upstream limitation in the backlog. Anki deck names already show on existing-note titles; JPDB membership already feeds the in-deck state dot.

## [0.6.60] - 2026-06-10

### Fixed

- Fixed "Subscribe all 100" (and "Subscribe visible") doing nothing: the already-subscribed detection scanned the whole channel payload, where unrelated shelves can carry subscribed flags, so every suggestion could be wrongly marked subscribed and the action list came out empty. Detection is now scoped to the channel's own header, and when everything genuinely is subscribed the shelf says so instead of silently ignoring the click.

### Changed

- Further fallow code-health work (high-complexity findings 17 → 16): the reader-word click handler's guard chain extracted into `readerWordClickSurfaces`, and the per-word contrast variable application decomposed out of one large closure (word-contrast CRAP 71.3 → 26.5).

## [0.6.59] - 2026-06-10

### Added

- Anki deck-state parity: blacklisting an Anki-backed word now suspends its cards natively (suspended cards never come up for review and already have their own state color), and never-forget tags the note `yomu-never-forget` — both toggle on re-press and can be managed from inside Anki too.
- Jiten review history: Jiten exposes only per-day counters, so each study-batch load now snapshots them locally (up to ~400 days) and merges them into the stats page's activity/heatmap like the Anki history source.

### Fixed

- Anki status colors now load in parallel with page rendering: the cached status lookup starts as soon as a parse finishes (overlapping the DOM work) instead of after it, removing most of the gray→color pop-in after a scan.

## [0.6.58] - 2026-06-10

### Fixed

- Furigana and word colors now appear much closer to instantly instead of loading in waves, from a root-cause audit of the latency chain:
  - Subtitle transcript warmup no longer paces the priority head of the queue — the visible rows and the lookahead window parse immediately, with the 120ms YouTube pacing applied only to the background tail (was ~1s before lookahead rows were ready).
  - Subtitle word-state colorisation retries every 1s instead of every 5s, so JPDB/Anki state colors land on cues during playback instead of lagging multiple lines behind.
  - Page scans apply parsed ruby in chunks of 48 targets (was 16), so the first paint covers the whole parsed batch instead of arriving in three visible waves.
  - The word-contrast pass runs once per container after a scan completes instead of once per 16-item chunk, removing repeated style recalcs (layout thrash) during page parsing.

### Notes

- Remaining items from the latency audit (pre-warmed Anki status during render, persistent IntersectionObserver re-prioritisation, parallel cold-start pitch lookups) are recorded in the Snow Leopard backlog task with file:line evidence.

## [0.6.57] - 2026-06-10

### Changed

- Code-health pass driving the worst fallow CRAP findings down (high-complexity findings 26 → 17): the subtitle video-inset measurement now uses small style-snapshot helpers instead of one 100-line save/clear/restore function (was CRAP 299.6), and the Jiten kanji "words using this kanji" reading-filter/paging logic — previously triplicated across the popover, new tab, and hosted runtime — is now one shared module (`jiten-kanji-words-actions.ts`) so the three surfaces cannot drift.

### Notes

- Live-verified with the corrected Jiten test credentials that the study-page addon mounts (Immersion Kit + imported dictionaries) work on jiten.moe/srs/study.
- Added the "Snow Leopard" quality-release task to the backlog: latent re-render/battery bugs, instant ruby/colorisation (page + subtitles), YouTube seamlessness, fallow health to zero.

## [0.6.56] - 2026-06-10

### Fixed

- Fixed furigana ruby disappearing from ordinary prose on sites whose page shell clips overflow (e.g. example sentences on jiten.moe): layout-sensitivity is now judged by the box's actual height — only short fixed boxes (under ~3 lines) that would really clip the taller ruby line suppress furigana, while tall clipped containers (page shells, scroll regions) keep ruby. One uniform rule across all sites, no per-site parsing.

### Added

- Yomu enhancements (Immersion Kit examples, imported dictionaries, kanji tools) now also mount on the Jiten SRS study page (jiten.moe/srs/study), like the vocabulary/kanji/parse pages. Live verification pending — the Jiten test account is temporarily locked.
- Verified and pinned with a test that Jiten per-grade intervals from study-batch responses reach the new-tab grade buttons (data-grade-interval, aria/title labels).

## [0.6.55] - 2026-06-10

### Added

- New `smoke:study-personas` Playwright harness that simulates users on the study page across environments — keyless beginner (desktop + 390x844 mobile) and a reviewer whose Jiten API is unreachable — gathering timing/labeling/console feedback. All personas pass; the degraded-reviewer run verifies end-to-end that the "No reviews ready — showing practice words" notice appears exactly when configured review sources fail and never for keyless users.
### Fixed

- Built-in starter study words are now labeled "Starter words" (入門単語) instead of "Dictionary", which confused keyless users who had never imported a dictionary.

## [0.6.54] - 2026-06-10

### Fixed

- Fixed Firefox extension errors "Not allowed to define cross-origin object as property" (XrayWrapper, content-script.js): restoring a page-shadowed `window.dispatchEvent`/`addEventListener` now clones the property descriptor into the page compartment via `cloneInto`. This also left window events broken afterwards, which is why popover sections such as Immersion Kit examples could hang on "Loading examples..." in the Firefox extension.

## [0.6.53] - 2026-06-10

### Fixed

- YouTube Shorts: with the immersion filter active, landing on a non-Japanese short now steps the player forward automatically so scrolling continues to the next Japanese short instead of parking on an English one.
- YouTube feed: filtered-out cards no longer leave the feed starved — the continuation loader is triggered earlier (within reach of the viewport, not only at the absolute page bottom, with the visible-video target raised and the throttle halved), and when triggering it requires a scroll the page position is restored, fixing the blank "scrolling in" gaps.

## [0.6.52] - 2026-06-10

### Fixed

- The subtitle rail no longer appears next to decorative or ad videos (e.g. Discord promos): our controls now follow the same rule as the player's own — they only show for videos that offer playback controls (native or a known player chrome) or that have subtitle data loaded.
- Removed the half-viewport cap on the bottom transcript drawer: it can now be pulled up to nearly the full window height.
- JPDB-redundant words can no longer be reviewed (parity with Jiten Reader); attempting it explains why instead of silently grading a card JPDB considers covered elsewhere.

### Added

- New `smoke:reader-sites` Playwright smoke that injects the built userscript into live Ttsu Reader, Yatsu Reader, and a YouTube watch page, asserting clean install (no console errors), the reader FAB, and no stray subtitle rail. All three pass.
- Jiten stats coverage: new unit tests verify the stats page renders Jiten card-state breakdowns across SRS states and shows an explicit error (not a blank page) when the Jiten API fails.

## [0.6.51] - 2026-06-10

### Fixed

- The new tab now says so when it substitutes practice words for an empty or unreachable review queue ("No reviews ready — showing practice words") instead of silently showing non-review words as if they were your JPDB/Anki feed.
- Anki word colors no longer stay stale after reviewing in Anki itself: returning to the tab expires the count-validated status index (throttled to once per 2 minutes), so state changes that don't alter deck counts get picked up immediately instead of after up to 30 minutes.

### Notes

- Verified the new-tab grade control already exposes an explicit JPDB/Anki/Both target whose label propagates onto the grade buttons — no silent dual-grading. Updated the trust-audit backlog accordingly.

## [0.6.50] - 2026-06-10

### Fixed

- Fixed clipped/invisible text in YouTube chrome: line-clamped and fixed-height boxes (video metadata rows, subscribe buttons) no longer receive furigana ruby — the taller ruby line was clipping the base text so only the furigana stayed visible, or wrapping fixed-height buttons. These words stay colorised and lookupable, just without ruby.
- Fixed subtitle word colorisation disappearing when stepping back to a previous line: cache-hit renders now re-apply JPDB/Anki state colors to the freshly inserted nodes, and the parse warm-up window keeps more history behind the active cue (6 behind / 10 ahead) so back-navigation always hits the cache.
- Fixed the subtitle rail and panel opener staying permanently visible on mobile: the controls now auto-hide after the idle delay (touch devices get no mouse movement to trigger it) and follow m.youtube.com's own player-controls overlay, so tapping the video reveals them together with YouTube's controls.

## [0.6.49] - 2026-06-10

### Fixed

- Fixed unreadable channel-suggestion text on mobile YouTube dark mode: m.youtube.com does not set the desktop `html[dark]` attribute, so channel names and Subscribe buttons fell back to light-theme colors (invisible on the dark background). The shelf now detects the page theme from the rendered background and applies the matching palette.
- Channel-suggestion descriptions are now parsed by Yomu like the rest of the page, so Japanese text in the shelf gets furigana ruby and dictionary lookups instead of being plain text.

### Added

- Frequency dictionaries now have their own settings group with enable/disable, drag/button reorder, rename, and remove — the order controls which frequency badge shows first on cards.
- Added a keyless word-popover Playwright smoke (`smoke:keyless-popover`).

### Fixed

- Fixed subtitle overlays and transcript rows blocking dictionary popover lookups on Japanese words (such as katakana `ハグ`) and particles (`と`/`を`).
- Fixed transcript panel drawer layout: prevented `jpdb-subtitle-drawer-title` and `jpdb-subtitle-drawer-meta` from being cut off on narrow screens by wrapping them and adding ellipsis truncation.
- Fixed an infinite requestAnimationFrame loop when aligning layout insets by checking if the inset metrics actually changed.
- Pitch accent now picks the variant that fits the word's contextual reading instead of always the first stored pattern, and falls back to the public JPDB pitch lookup when a Jiten/local pattern belongs to a different reading (e.g. dictionary form).
- Keyless mode: player-overlay subtitles are parsed and colorised through the same fast provisional tier as the transcript panel — previously cues without an API key waited on a slow JPDB-timeout path and loaded visibly late. Both surfaces share one cache, so no parse work is repeated.
- Keyless mode: tapping a kana word that exactly matches its card (e.g. タップ) opens the popover again instead of being swallowed by the kana-fragment suppression.
- Anki popover preview: dictionary definitions are spaced and sectioned again (the mined-note styles only existed in the Anki model CSS), and Anki bracket furigana (漢字[かんじ]) no longer shows raw brackets — the base text is re-parsed so ruby matches Yomu's kanji-only furigana everywhere else.
- The subtitle overlay rail (panel toggle) no longer appears on pages whose video is hidden via visibility or opacity.
- JPDB vocabulary payload parsing is now defensive against malformed rows.
- YouTube channel suggestions: already-subscribed channels are excluded (detected from YouTube page data), subscribing flips the row to an accessible "Subscribed ✓" state announced by the live status and then backfills it with a fresh suggestion, the compact shelf fills its rows, and the shelf follows YouTube's own dark/light theme so a light extension theme on dark YouTube stays readable.

### Changed

- The default interface language for fresh installs is now Japanese; existing users' stored language preference is unchanged.
- The settings dictionary panel shows an expandable select-options summary instead of clipped text.

## [0.6.47] - 2026-06-09

### Fixed

- Fixed the player-overlay subtitle lagging behind the transcript panel: the overlay's parse warm-up refused the fast provisional parse tier the panel already used, so the overlay showed unparsed text until the slow authoritative batch returned. Both surfaces now share the same two-tier parse pipeline (provisional immediately, authoritative upgrade in place) with deduplicated in-flight requests.
- Fixed furigana covering whole words instead of just the kanji (e.g. 話す showed はなす over the full word); explicit readings over mixed kanji-kana bases are now trimmed so ruby only sits above the kanji.
- Fixed the transcript panel docked to the left sitting flush against the player; left docking now keeps the same gap as right docking.
- Removed the phantom "YouTube native captions" track from the track selector on videos that have no captions at all.
- Pressing the placement button for the currently active dock position now closes the transcript panel instead of doing nothing.
- Hid the left/right placement buttons on small screens, where the panel always uses the bottom drawer layout and the side buttons were inert.

### Changed

- Pausing and resuming the video no longer rebuilds the pause transcript panel synchronously inside the media event; the work is deferred past the next paint so play/pause stays responsive on desktop and iPhone.

## [0.6.46] - 2026-06-09

### Fixed

- Fixed the browser-extension / self-contained build throwing `ReferenceError: System is not defined` (a code-split SystemJS chunk with no loader) which broke subtitle track loading; the subtitle translator is now statically bundled.
- Fixed the transcript panel's left/right placement toggle doing nothing on smaller screens: docking left was measured against the player's pre-shift right edge (so it always fell back to the bottom layout). Left and right now use the same available-width calculation, and the side layout stays available on narrower screens.

### Changed

- The whole YouTube transcript is now parsed in the background ahead of playback (prioritising the lines around the current position) so furigana/ruby is ready in advance instead of appearing line-by-line as each cue becomes active.

## [0.6.45] - 2026-06-09

### Fixed

- Fixed YouTube watch page elements (such as the video player, description, owner, actions, comments, and playlist header) failing to display (appearing as blank spaces) by explicitly ignoring them in the YouTube immersion filter so they are never hidden or marked as pending.
- Fixed a TypeError (`window.dispatchEvent is not a function`) that occurred when closing or cancelling the settings dialog by routing all settings-related theme and dialog events through the unshadowed, hardened event dispatcher (`dispatchWindowEvent`).

## [0.6.44] - 2026-06-09

### Fixed

- Fixed YouTube page elements (such as the video player and description) failing to load by implementing a Trusted Types policy (`yomu-reader-script`) for injecting global language preferences, resolving CSP script blocks (`This document requires 'TrustedScript' assignment`).

## [0.6.43] - 2026-06-09

### Changed

- YouTube text scanning no longer excludes the page chrome, masthead, sidebar, and recommendation feeds. Interactive elements (the subscribe button, video-title links, chips, menu items, etc.) are now parsed with the passive-interaction pattern: hovering their Japanese text opens the dictionary while the click still triggers the native control. The video player chrome and the SPA watch title remain untouched.

## [0.6.42] - 2026-06-09

### Added

- Auto-generate a Japanese subtitle track by translating the English track when a video has no Japanese track available.

### Fixed

- Lookup pills (dictionary links, copy, and frequency badges) now wrap onto multiple lines instead of overflowing/clipping off the edge of the popover.

## [0.6.41] - 2026-06-09

### Fixed

- Fixed the YouTube (and other video sites') player not resizing the video to match its frame after the subtitle panel closed or switched sides: the video kept the old inset size until a manual fullscreen toggle. The relayout nudge is now dispatched when the inset is cleared as well as when it is applied.
- Fixed the subtitle panel toggle being unable to close the panel when "Open side panel when paused" was enabled and the video was paused: an explicit close now sticks until the video plays again.
- The closed subtitle rail toggle now shows the remembered transcript placement icon instead of always showing the right-dock icon.
- Anki deck collapse state now persists across word lookups (the Anki section and each deck card remember whether you collapsed them).

## [0.6.40] - 2026-06-09

### Fixed

- Stopped uncaught errors from keyboard events that arrive without a key (seen on YouTube), which were aborting reader and subtitle keydown handling.
- Routed cross-origin requests (sentence translation, grammar data, jiten lookups/audio, and kanji radical images) through the userscript bridge so a strict page Content-Security-Policy such as jpdb.io's no longer blocks them.
- Moved jiten.moe kanji-page enhancements to the top of the page (just below the kanji header) instead of the bottom.
- Made Anki card furigana match the reader's ruby everywhere by re-parsing from base text; this also fixes single-kanji (RTK-style) cards that were rendering the character several times.
- Clicking a word inside the lookup popover now dives into that word so the Back button returns to the previous card.
- Hardened the YouTube subtitle side-panel layout: switching the panel between left and right no longer leaves a gap, exiting fullscreen restores the video, and a transient zero-size player no longer shrinks the video away.

### Changed

- Improved test stability by cancelling the audio source-race timer when a source wins, resetting fake timers between tests, and retrying the few timing-sensitive audio/bridge tests.

## [0.6.39] - 2026-06-09

### Added

- Brought jiten.moe to parity with jpdb.io page enhancements: your dictionaries, Immersion Kit, kanji stroke practice, RTK/Heisig/Koohii, the component graph, uchisen, and the other sources now inject onto jiten vocabulary, kanji, and parse pages, including across in-app (SPA) navigation.

### Fixed

- Stopped browsers and password managers from autofilling saved site credentials over the API-key field (and spilling the username into the settings search box) with a decoy credential trap, per-field opt-outs, and readonly-until-focus inputs.
- Synced the reader theme with jpdb.io and jiten.moe light/dark mode: an explicit theme is pushed to the host, auto follows the site, and toggling the site's own theme updates the reader to match.
- Let a click on a scanned word inside a native link (such as jpdb's clickable kanji) follow the link; hover and modifier+click still open the lookup popup.
- Kept the centered settings dialog in place when an Immersion Kit image finishes loading behind it, instead of flinging the panel into the top-left corner.

## [0.6.38] - 2026-06-08

### Fixed

- Removed the hosted userscript-bridge requirement for AnkiConnect so hosted study pages can use local AnkiConnect directly when CORS is configured.
- Kept the optional userscript bridge as a preferred transport when present, without showing bridge-only setup guidance.
- Added expanded/collapsed state to the new-tab mining target drawer handle so review controls expose the same state as the popover drawer.

## [0.6.37] - 2026-06-08

### Fixed

- Collapsed a word lookup stacked over the settings dialog back to settings when the settings panel is tapped, instead of trapping the lookup open (notably on iPad/touch).
- Kept the settings dialog footer pinned to the bottom of the drawer after an iPad rotation that grows the viewport; the scroll area now fills the drawer so the Save/Factory-reset row no longer detaches in Safari/WebKit.
- Stopped the YouTube immersion filter from hiding YouTube's virtualized active Shorts player, and added a script-tag fallback for reading the InnerTube client config when `ytcfg` is unavailable (Firefox userscript isolation).

### Changed

- Showed six stable-randomized starter channels in the compact YouTube channel shelf instead of the same first five.
- Added a Google Search site-parser profile and excluded furigana ruby from hosted-reader surface text extraction.

## [0.6.36] - 2026-06-07

### Changed

- Moved verbose Anki/JPDB grade target details into the mining drawer gutter so review controls stay on one row without repeated labels or target pills.
- Loaded hosted docs companion userscript surfaces alongside the main runtime so settings/video features stay available on the docs install surface.

### Fixed

- Kept generated API text-to-speech sources behind recorded audio in fallback mode and out of fallback preloads.

## [0.6.35] - 2026-06-07

### Fixed

- Kept JPDB and Anki new-tab fallback tests aligned with the current Jiten-first lookup order and smaller Immersion Kit sentence limits, restoring the GitHub CI shards.
- Preserved all playable Jisho audio sources from the exact matching audio element instead of dropping alternate formats.
- Let JPDB audio voice selection target explicit voices such as Female 1, Female 2, Male 1, and Male 2 without falling back to the wrong voice.

## [0.6.34] - 2026-06-07

### Fixed

- Refreshed stale Anki status-index hits through exact AnkiConnect lookups after review, add, merge, or update actions, avoiding broad deck rescans while keeping word colors and popover status current.
- Preserved custom Anki field mappings during automatic library scans when the live model still has those fields, replacing only stale roles with scanned suggestions.
- Fixed smoke-test path resolution after the script helper refactor, restoring hosted Chromium and Firefox Anki bridge verification.
- Rebuilt the docs, new-tab, and userscript release artifacts for the current Anki/JPDB integration fixes.

## [0.6.33] - 2026-06-07

### Changed

- Reused shared smoke-test cleanup and dictionary ranking helpers, keeping live/mobile smoke scripts and local dictionary lookup paths smaller and easier to maintain.
- Shared kanji source mount rendering and progressive similar-kanji loading between the reader and new tab, reducing duplicated popover code.
- Reused JPDB vocabulary URL generation and Anki lookup hydration helpers across dictionary and new-tab popovers.

### Fixed

- Kept ruby visible inside Yomu-owned popovers, settings, and docs even when reader CSS is already installed, while still suppressing ruby on external clipped titles that would otherwise shift page layout.

## [0.6.32] - 2026-06-07

### Changed

- Deduplicated JPDB vocabulary URL parsing, pointer-rectangle helpers, popover height stabilization, Anki review targets, audio cache pruning, and rendered-word expansion display paths without changing lookup behavior.
- Kept the userscript release gate on Vite builds with readable Greasy Fork output under the 2 MB script limit.

## [0.6.30] - 2026-06-07

### Fixed

- Rechecked hosted AnkiConnect automatically when the userscript bridge becomes ready, avoiding stale "needs setup" status after the page bridge loads.
- Kept the new-tab JPDB/Anki source switch from reusing unreachable Anki cache entries, restoring fallback study words instead of "No review cards ready."
- Sped up the CI suite by sharding long generated settings, new-tab, subtitles, and JPDB tests with stable generated imports.

## [0.6.29] - 2026-06-07

### Fixed

- Restored full-word kana lookup on mobile and split inline text, so taps inside words like `にほんご` resolve the full Jiten/JPDB candidate instead of fragment entries.
- Kept hosted AnkiConnect on the userscript bridge for local Anki while allowing detailed clicked-word card hydration to retry past stale availability cooldowns.
- Restored new-tab fallback study words when no JPDB or Anki review cards are ready, and made JPDB/Anki source switching deterministic.
- Refined mobile new-tab layout, Anki card audio controls, and Anki opt-in defaults so fresh installs do not show loud mobile handoff actions by default.
- Added one compact popover review target selector for mixed JPDB plus Anki and duplicate Anki-card grading, with exact deck/card targets and one clear grade row.

## [0.6.28] - 2026-06-06

### Changed

- Simplified the settings API panel to one JPDB-or-Jiten key field, routing `ak_` keys to Jiten and other keys to JPDB.
- Removed the separate Jiten connection test button and split API-key fields from the settings UI.

## [0.6.27] - 2026-06-06

### Fixed

- Kept stale Anki new-tab selections from showing an empty review queue after Anki is turned off, falling back to study words instead.
- Rechecked local AnkiConnect transport, exact Anki status hydration, no-key kana lookup, new-tab source toggling, and Jiten/Anki queue smokes against the current package.
- Kept the generated userscript self-contained and readable while preserving Greasy Fork size headroom.

## [0.6.26] - 2026-06-06

### Fixed

- Removed the transcript drawer header close button so the player rail icon is the single open/close control.
- Added in-drawer left, below, and right docking controls for transcript and track panels.
- Kept oversized side-panel resizing from falling back below when the player can remain usable, and capped below-panel height so wide layouts do not shrink the video too far.
- Kept Japanese-learning YouTube searches usable by preserving English-titled comprehensible-input videos and Shorts, while moving the channel starter guide to a gentler home-feed-only trigger.
- Kept iPad kana taps falling back to the full tapped surface when JPDB/pitch lookup is disabled, instead of replacing kana-only lookups with kanji spellings.

## [0.6.25] - 2026-06-06

### Fixed

- Keep Send to Anki off after fresh installs and factory resets so Anki stays opt-in and mobile popups do not reserve space for an app the user may not have.
- Show Anki setup guidance on the new-tab page when AnkiConnect is unavailable, instead of making the JPDB/Anki source toggle look like it did nothing.
- Refresh new-tab popup Anki status and cached card details after Anki add, merge, update, or grade actions.
- Prefer Kaishi-style word audio fields over sentence audio when automatically mapping existing Anki note types.
- Check Anki duplicates before attaching audio or images to a new desktop Anki note, keeping duplicate mining failures cleaner and avoiding unnecessary media writes.

## [0.6.24] - 2026-06-06

### Fixed

- Kept Anki truly off on fresh installs and factory resets by ignoring Anki/status color channels unless Anki mining or the Anki dictionary section is explicitly enabled.

## [0.6.23] - 2026-06-06

### Fixed

- Fixed rendered kana fragment lookups without a JPDB API key, so tapping split text like `に`, `ほん`, or `ご` in `にほんご` resolves the full JPDB word instead of opening misleading shorter entries.
- Hydrated Anki card details in the popup when AnkiConnect returns matching notes without a single primary note, and kept Anki status cache entries fresh after card updates or grading.
- Kept new-tab Anki card audio on the same icon-button pattern as dictionary audio and updated the Anki smoke test to cover the current JPDB locked/due review flow.

## [0.6.22] - 2026-06-06

### Fixed

- Made raw page taps build lookup context across split inline kana nodes, so tapping any character in text like `にほんご` opens the full JPDB dictionary entry instead of fragment lookups like `ほん`.
- Removed unused refactor leftovers and private-only exports so the CI dead-code gate passes again.

## [0.6.21] - 2026-06-06

### Fixed

- Kept Anki fully opt-in on fresh installs and factory resets, including Anki mining, the Anki dictionary section, new-tab Anki reviews, Anki+JPDB dual mining, and mobile Anki handoff.
- Made the mobile AnkiMobile/AnkiDroid handoff respect the main Anki toggle so turning Anki off removes the send-to-Anki route.
- Restored the mobile YouTube subtitle sidebar control when compact video controls idle, keeping the panel button visible and tappable.
- Rendered cached provisional subtitle ruby and pitch styling on the first primary subtitle paint while full JPDB parsing finishes.
- Tightened JPDB page Immersion Kit spacing so image controls sit with the title row, captions use the same subtitle styling as dictionary cards, and ruby captions are not clipped.
- Kept JPDB page alternate forms and compounds atomic after Yomu ruby is injected, so forms like `おつかれさま` and `疲れ` stay full-word lookup targets without duplicate furigana loops.
- Fixed kana-only lookup without a JPDB API key by trying JPDB span candidates before fragment fallbacks, so tapping fragments like `に`, `ほん`, or `ご` resolves the full word `にほんご`.

## [0.6.19] - 2026-06-05

### Fixed

- Made Mokuro scans parse each manga text box as one target, preserving full words across OCR line fragments without adding ruby that changes the page layout.
- Fixed Mokuro vertical-text clicks so rendered Yomu word geometry is used before raw text fallback, preventing neighboring suffixes from opening instead of the clicked word.
- Allowed locked JPDB cards to be graded in the popup and new-tab reviewer while keeping blacklisted and never-forget cards blocked.

## [0.6.18] - 2026-06-05

### Fixed

- Kept scanned card titles, clipped text, and fixed-size overlay text lookupable without injecting furigana that can change the host page layout and cause blinking or swapping.

## [0.6.17] - 2026-06-05

### Changed

- Refactored Anki status/detail, JPDB, audio, settings-form, and userscript build helpers to reduce duplication while keeping the userscript self-contained for offline installs and extension packaging.
- Kept the generated userscript release checks shared and stricter so bundle-size, readable-code, and no-remote-executable-code constraints are enforced from one path.

### Fixed

- Fixed Anki rendered-card audio on the new-tab page so card media buttons use the same icon control pattern as dictionary audio and route through AnkiConnect media playback instead of doing nothing.
- Fixed the mobile new-tab header so Word/Kanji/Search/Stats stays in a compact single row; the two-column rule now applies only to Stats mode.

## [0.6.16] - 2026-06-05

### Changed

- Made Anki status lookups scale by using cached status hits plus exact lazy lookups for visible words instead of broad routine collection scans.
- Refined the new-tab Anki/JPDB review flow with clearer Anki setup states, compact grade-target controls, and safer multi-card Anki grading.
- Improved Anki card rendering in the popup and new tab with original card content, clearer multi-entry separation, capped card typography, and separate lookup-vs-card audio handling.

### Fixed

- Fixed Anki-disabled coloring so page highlights stay untrusted and silent when the Anki section is off.
- Fixed Jisho audio matching for exact term/reading audio and ambiguous homophones.
- Normalized saved settings so stale pitch highlight/underline combinations cannot leak across page scans or subtitles.
- Made the CI suite faster and less flaky by sharding generated settings tests and assigning deterministic Vitest API ports.

## [0.6.15] - 2026-06-04

### Fixed

- Restored first-run Anki mining to enabled by default so Anki status and the Anki dictionary section appear without extra setup when Anki is available.

## [0.6.14] - 2026-06-04

### Fixed

- Made AnkiMobile handoff use Anki's built-in Default deck for Yomu's built-in deck names when AnkiConnect is unavailable, avoiding missing-deck errors on iPad.
- Kept Default available in the Anki deck picker even before the desktop Anki library can be scanned.

## [0.6.13] - 2026-06-04

### Fixed

- Let settings saves close the dialog immediately instead of waiting on dictionary-style refreshes, avoiding apparent freezes after changing settings.
- Prevented pitch accent underline styling from leaking onto OCR and subtitle words that do not have pitch accent classes, including stale mobile settings states.

## [0.6.12] - 2026-06-04

### Added

- Added a live browser smoke check for hosted cache-busting, userscript bridge Jisho audio, local AnkiConnect, and hosted Anki bridge requests.
- Added compact new-tab grade target controls so cards present in both JPDB and Anki can grade both by default, or just JPDB / a specific Anki card when needed.

### Changed

- New-tab Anki reviews now render the selected Anki card's original front and back HTML, with sanitized media/audio controls and capped card styling instead of oversized generated labels.
- Mobile Anki setup guidance now lives in the docs, including beginner-friendly Tailscale instructions for reaching desktop AnkiConnect from a phone or tablet.
- Local CI now prepares generated JPDB shards once and reuses them across bounded parallel shard runs, with deterministic Vitest API ports.

### Fixed

- Preserved existing Anki word color on hover while allowing trusted modal misses and post-grade refreshes to repaint stale status.
- Made Jisho audio bridge QA deterministic and verified blob playback without relying on live Jisho or CloudFront during the smoke.
- Kept mobile settings inputs at no-zoom size after shared input styling, and removed the crowded mobile-handoff disclaimer from the Mining drawer.
- Kept first-run Anki mining and the Anki popover section enabled by default while removing the manual scan button from settings.

## [0.6.11] - 2026-06-04

### Changed

- Split the Anki, audio, settings, new-tab review, subtitle, and reader-runtime code paths into smaller modules so the mining and review experience has room to grow without one-file bottlenecks.
- Kept the userscript offline/self-contained for executed code by bundling ZIP support locally, removing remote `@require` JavaScript, and loading reader CSS through a userscript `@resource`.
- Added readable generated-whitespace compaction plus stricter release verification so the userscript stays under Greasy Fork's 2 MB limit without identifier or syntax minification.

### Fixed

- Fixed Jisho audio fallback so hosted/no-bridge pages do not try the broken default public-proxy Jisho path before browser speech.
- Fixed dictionary preference saving after the settings-form split by routing dictionary priorities through the shared form reader.
- Preserved hover/status coloring, stale nested-parse guards, and generic page scanning across the parser/CSS refactor.

## [0.6.10] - 2026-06-04

### Fixed

- Fixed stale hosted userscript bridge markers so the live page retries AnkiConnect bridge setup instead of staying in a confusing disconnected state.
- Fixed hosted settings guidance so both automatic and manual AnkiConnect checks show the userscript setup path when the live page cannot reach local Anki.
- Fixed kana-only page terms such as `よむ` matching existing kanji Anki notes by reading, while keeping homophone guards for kanji terms.
- Fixed partial stale pitch-highlight settings that could leave mobile page words both highlighted and underlined by pitch after updating.
- Made Anki status-cache warmup prompt and scalable by indexing note fields plus review-state card sets instead of hydrating every card detail up front.
- Kept the settings puck reachable on coarse-pointer mobile devices even when stale saved settings had hidden it.
- Registered settings menu commands through both classic `GM_registerMenuCommand` and modern `GM.registerMenuCommand` userscript APIs.
- Narrowed new-tab service-worker cache cleanup to Yomu newtab caches only.
- Pointed docs install links at the stable hosted userscript URL so userscript managers keep normal install/update behavior.
- Rebuilt generated userscript/docs assets so mobile cache-busting metadata and the shorter mobile Anki handoff copy ship with the release.

## [0.6.9] - 2026-06-04

### Fixed

- Cleaned up stale saved color-channel settings from earlier builds that could leave mobile users seeing pitch accent as both a highlight and an underline after updating.

## [0.6.8] - 2026-06-04

### Added

- Added beginner-friendly desktop AnkiConnect/Tailscale setup guidance for using a home computer's Anki library from mobile devices.
- Added Anki tag chips in settings, with inline add/remove controls instead of a confusing free-form tags field.
- Added beginner-facing update and stale-cache guidance for the hosted new-tab page, mobile shortcuts, and userscript updates.

### Changed

- Made the release test path use the same sharded JPDB runner as CI, avoiding the long single-file JPDB test stall.
- Shortened AnkiConnect setup messages in settings and moved advanced hosted/CORS guidance out of the crowded drawer copy.
- Let new-tab Anki reviews work independently from the reader's Anki mining toggle.

### Fixed

- Fixed hosted Firefox userscript bridge event details so live AnkiConnect status can cross the page/userscript boundary.
- Fixed kana-only Anki status cache hits such as `よむ` matching existing cards whose expression is kanji and reading is kana.
- Fixed explicit popover Anki card hydration being skipped by an overly short background availability probe.
- Fixed Jisho audio lookup through the public proxy and matched Jisho audio by the requested reading instead of the first same-spelling source.
- Fixed automatic Anki library scans in settings, removed the manual scan button, and guarded stale scans from overwriting newer connection status.
- Fixed confusing new-tab JPDB to Anki source toggles when Anki is unavailable by showing Anki connection guidance.
- Fixed mobile/settings polish around no-zoom text inputs, full-width color swatches, donate accent styling, puck restoration, legacy pitch-highlight migration, and stale Yomitan import test isolation.

## [0.6.7] - 2026-06-04

### Fixed

- Retried hosted-page Anki bridge installation when userscript request APIs appear shortly after document start, so local AnkiConnect status can show up without a manual refresh.
- Guarded hosted Anki bridge refresh events so settings and popovers do not recheck Anki repeatedly after a successful bridge install.

## [0.6.6] - 2026-06-04

### Fixed

- Show hosted-page AnkiConnect setup as a normal setup state when the よむ userscript bridge is missing, instead of surfacing raw request-bridge errors.
- Exclude generated JPDB shard files from default Vitest discovery while keeping explicit CI JPDB shards runnable.

## [0.6.5] - 2026-06-04

### Fixed

- Re-render cached Anki matches as "details unavailable" when full AnkiConnect card-detail hydration fails, instead of leaving popovers stuck on a loading message.
- Added Jlab-style rendered-card QA coverage for Anki template HTML, media controls, font caps, and fallback-field hiding.

## [0.6.4] - 2026-06-04

### Added

- Added Anki review deck toggles in New tab settings after an existing-deck scan, with newly scanned decks included automatically and saved exclusions preserved.

### Fixed

- Made settings relocalization faster by using direct form-control lookups and avoiding repeated select metadata rebuilds in large settings forms.

## [0.6.3] - 2026-06-04

### Fixed

- Kept failed AnkiConnect checks in the settings setup tone instead of presenting normal hosted-page connection setup as a hard error.
- Clarified desktop AnkiConnect versus mobile Anki handoff behavior across settings, docs, and smoke checks so users know which features require local Anki access.

## [0.6.2] - 2026-06-03

### Fixed

- Made the AnkiConnect settings error shorter and more actionable, moving hosted userscript bridge/CORS guidance into the normal setup help with the AnkiConnect add-on link.
- Reworded mobile Anki handoff limitations around the current desktop AnkiConnect requirement instead of speculative future bridge copy.
- Split CI tests across eight Vitest shards with an explicit timeout so large JPDB/new-tab coverage no longer leaves one long-running shard looking stuck.

## [0.6.1] - 2026-06-03

### Fixed

- Kept the hosted app on the userscript request bridge for local AnkiConnect, with clearer Anki setup guidance and a direct AnkiConnect add-on link in settings.
- Restored a readable Greasy Fork build by using a pinned fflate `@require` instead of post-build compaction/minification.
- Opened mobile Anki handoff immediately from card actions instead of waiting on hosted AnkiConnect/detail-provider probes.
- Improved existing Anki card rendering for RRTK/Core/Yomu-style templates by removing nested card scroll traps, capping imported template fonts, separating Anki media controls, and avoiding duplicated Anki fronts when the answer already contains the question.
- Added realistic Anki template QA fixtures and a Chromium smoke check for dark/light popover rendering.
- Split CI into typecheck, sharded Vitest, and build/docs jobs, and stopped the generated-userscript workflow from rerunning the full test suite after CI.

## [0.6.0] - 2026-06-03

### Added

- Added explicit lookup grading targets for JPDB and individual Anki cards so words that exist in both systems, or in multiple Anki notes/cards, can be graded deliberately.
- Added Anki scan confidence chips in settings field mapping so nonstandard decks make it clearer which fields were auto-detected with high, medium, or low confidence.
- Added many more local grammar rules, with rule explanations and examples now loaded from hosted grammar-rule data (English and Japanese) instead of being embedded in the script.
- Added passive scan coverage for dictionary hyperlink text, UI chrome labels after prose, compact onclick controls in whole-page fallback scans, and hosted video-player empty-state and control text, keeping links clickable while words stay tappable.

### Changed

- Existing Anki rendered cards now keep multiple card sides separated behind collapsible Anki card headers, preserve Anki card bodies without extra Yomu labels, and cap oversized template fonts.
- The userscript now ships as a single self-contained file: fflate is bundled inline, no code is downloaded at install time, and compact-readable formatting keeps the build inside Greasy Fork's 2 MB limit with identifiers intact.
- The sticky bottom-sheet option now only renders enabled in sheet-capable popup modes, and saved popover-mode settings stay usable with Japanese interface copy.
- Explicit furigana over kanji-containing words is preserved verbatim during scans, while kana-only words no longer repeat their reading as ruby.

### Fixed

- Fixed word lookup popover grade buttons so selected JPDB/Anki/card targets submit from ordinary word popovers as well as kanji popovers.
- Fixed the bundled script failing to load in pages without a userscript manager (browser extension builds and test harnesses) when fflate was externalized.

## [0.5.0] - 2026-06-02

### Added

- Added a scalable Anki status index backed by browser storage so large Anki libraries can color parsed page words from cached lookup keys, with detailed AnkiConnect hydration deferred until interaction.
- Added Anki review support on the new-tab study page, including merged due/new queues across enabled decks and deck-disable settings for users with multiple decks.
- Added existing-library adaptation for Anki notes, including scanned note fields, per-note-type field mappings, existing-card content in popovers, and merge/update actions when a word is already in Anki.
- Added automatic Anki deck-shape handling for Core 2k/6k, Jlab, Kaishi, RRTK, Vocab 2k, Yomu, and よむ-style note fields, including RTK keyword-only kanji cards.
- Added Anki smoke coverage for reader mining, Japanese Wikipedia coloring, new-tab source toggling, multi-deck review order, and JPDB/Anki popover hydration.
- Added expanded hosted-docs setup guidance for desktop, iPhone, iPad, mobile handoff, local services, reading-site recommendations, and localized hosted navigation.

### Changed

- New tab no longer shows the "Start with a dictionary" setup screen. When no local dictionary is installed, both the Dictionary source and the Auto fallback skip straight to public JPDB lookup, which works without an API key. Add Yomitan dictionaries any time from Settings → Dictionaries.
- Hosted docs now use the same generic page parser as normal websites, including the Try Me sample, current VitePress hero text, and route-mounted docs content.
- Anki and JPDB status labels in popovers and new-tab lookup metadata now show actual review state more consistently, while JPDB status is hidden when no JPDB API key is configured.
- Existing Anki cards in dictionary popovers and new-tab lookup now use Anki-rendered card HTML without Yomu-added front/back or raw field labels, keep multiple matching notes collapsible, and expose Anki as a reorderable popover source.
- Review controls now show whether they will grade JPDB, Anki, or a specific Anki card so same-reading words and multiple Anki entries are less ambiguous.
- Reader page scanning is now core behavior rather than a pair of user-facing toggles; obsolete saved scan settings are ignored and stripped on settings save.
- The settings Anki area now emphasizes connection/status, deck/model choices, field mapping, and library scanning instead of free-form fields and duplicated setup prose.
- Hosted docs localization now preserves research links and updates visible route content without leaving stale parsed spans behind.

### Removed

- Removed the dedicated new-tab dictionary-setup screen along with its now-unused rendering, cached-setup state, `load-dictionary` action, and setup-only copy.
- Removed the old "auto-scan Japanese" and "scan visible page on load" settings because parsing Japanese text is the point of the app and should not be presented as optional duplicate behavior.
- Removed demo-specific reader paths, including `isDemo`/Try Me special cases and ruby suppression hooks, so docs samples are treated like ordinary page text.

### Fixed

- Fixed Anki-colored words losing their Anki state/color on hover or click.
- Fixed slow Anki parsing on large pages by avoiding eager detailed card hydration during initial coloring and relying on cached status data first.
- Fixed known Anki words incorrectly showing "Add to Anki" in popovers when an existing card is present in a non-standard deck or note shape.
- Fixed Anki rendered-card previews trapping scroll, oversized card fonts, confusing raw all-caps fallback labels, and card audio playback buttons that did not clearly use Anki media.
- Fixed existing Anki detail hydration so slow or empty AnkiConnect card-detail responses fall back to cached status instead of leaving the popover stuck on a loading message.
- Fixed long rendered-card Anki audio files blocking card details by hydrating image media immediately while leaving Anki audio lazy and playable from its own Anki media button.
- Fixed public JPDB vocabulary furigana on hosted docs when automatic furigana mode resolves through JPDB/API settings.
- Fixed hosted docs text that failed to receive ruby, pitch/status coloring, or click targets after VitePress route changes.
- Fixed settings help/status rows being parsed into awkward ruby text, including the JPDB API status message.
- Fixed new-tab source toggling so JPDB and Anki review modes switch promptly and preserve the intended target.

## [0.4.62] - 2026-05-31

### Added

- Added previous/next word lookup shortcuts that can move through parsed words without mouse hover and stay inside selected text when a selection is active.
- Added popup Japanese font family and weight settings with a jpdb.io-matched default font stack.
- Added a pause-only subtitle side panel option and a visible Subtitles button on the hosted local video player for adding tracks.

### Changed

- Routed popup, kanji, new-tab, example sentence, grammar, and local dictionary Japanese text surfaces through the popup Japanese font settings.
- Renamed the hosted subtitle track action from primary subtitles to Japanese subtitles so new users know where to load external Japanese subtitle files.

### Fixed

- Sent Jisho search-page lookups through the Jina text fallback instead of the hosted worker, avoiding visible Cloudflare 525 failures during audio discovery.
- Cloned userscript bridge event payloads in Firefox so hosted-app requests do not trip XrayWrapper cross-origin object errors.
- Pointed local VitePress new-tab guidance at `/yomu-reader/newtab/index.html` so local docs do not accidentally load the VitePress shell at `/yomu-reader/newtab/`.
- Kept the keyboard-selected lookup word visibly highlighted while its popup finishes loading.

## [0.4.61] - 2026-05-31

### Changed

- Removed stale demo, new-tab, JPDB-page, popup, settings, OCR, and kanji-graph helper code to keep the userscript under the hosted size limit.
- Reused resolved new-tab navigation sources when loading boundary batches, avoiding duplicated source checks during card navigation.

## [0.4.60] - 2026-05-31

### Changed

- Shared the public-proxy route classification used by direct-fetch skipping and fallback ordering, keeping Jisho's special fallback order explicit while reducing userscript size.
- Simplified legacy lookup-link migration matching and removed a dead KanjiVG cache branch.

## [0.4.59] - 2026-05-30

### Fixed

- Restored hosted Try Me word targets when JPDB/local dictionary data is unavailable, including one-character words such as `下`.
- Kept hosted Try Me scanning scoped to the demo text so surrounding docs copy is not accidentally turned into lookup targets.
- Restored YouTube subtitle sidebar controls while the transcript panel is open.
- Unwrapped YouTube watch titles before filtering so SPA navigation cannot leave stale reader spans in the title.
- Prevented low-value short particles in Immersion Kit/example sentences from opening noisy dictionary cards while preserving them when they are the actual target word.
- Added back-navigation context for nested example-sentence lookups opened from a word card.
- Reverted unrelated Uchisen prompt wording drift from the regression branch.

## [0.4.58] - 2026-05-26

### Fixed

- Let explicit Anki/status underline and color settings read existing Anki card status without enabling Anki mining.
- Batched Anki existing-card lookups across all decks and recognized common imported vocabulary fields, so cards in non-mining decks can show status, edit, and grading controls instead of “Add to Anki”.
- Kept JPDB vocabulary details, pitch accent, and Anki status loading independently so popovers settle faster and do not wait sequentially on slow Anki responses.
- Rebound translation, grammar, and Immersion Kit loaders after deferred popup rerenders so cards cannot get stuck on “Finding grammar...” or “Loading dictionary details...”.
- Kept hosted runtime and QA audio enabled by default while preserving explicit disabled-audio behavior for tests and user settings.
- Ignored VitePress's check-only home `--vp-offset` hydration warning in the docs audit while continuing to fail real console and page errors.

## [0.4.57] - 2026-05-26

### Fixed

- Replanned partially parsed Immersion Kit and example sentences from their full visible text so existing highlighted words no longer fragment later parsing passes.
- Routed pointer, selection, Immersion Kit, and new-tab parsing through the same JPDB-first path so inflected words keep JPDB readings and pitch instead of falling back to single-character cards.
- Made subtitle and image-backed Immersion Kit highlights more legible and prevented target highlights from stacking with stray underline decoration.
- Avoided caching all-fallback sentence parses as final Immersion Kit/new-tab results so transient JPDB timeouts do not poison later renders.
- Sent Jisho lookup fallbacks through alternate public proxies before the hosted worker so transient worker 525s no longer block dictionary audio discovery.

## [0.4.56] - 2026-05-26

### Fixed

- Re-enabled manual audio on the hosted docs demo while keeping autoplay suppressed.
- Routed term and Immersion Kit example audio through blob/proxy playback before media elements touch remote URLs, avoiding page CSP `media-src` blocks on sites such as Wiktionary.
- Kept dictionary glossary hyperlinks clickable after nested parsing while still allowing their visible Japanese text to be inspected with hover lookup.

## [0.4.55] - 2026-05-26

### Fixed

- Highlighted the word under review consistently in popover dictionary sources, JPDB examples, and JPDB page Immersion Kit examples.

## [0.4.54] - 2026-05-26

### Fixed

- Kept playing videos running after transcript timestamp seeks, including sites that briefly pause the media while `currentTime` changes.
- Added a default-on video-safe autoplay guard so automatic lookup/example audio does not interrupt visible video playback, with a setting to turn it off.
- Added a popover setting to disable the dimmed page backdrop for sticky click-opened popovers.
- Timed out hung popup and new-tab Immersion Kit example loads so iPad/Safari requests no longer leave the section stuck on “Loading examples...”.
- Paused repeated local OCR requests briefly after an unreachable local endpoint so iPad and desktop sessions do not keep hammering a down OCR server.
- Narrowed JPDB-page enhancement refreshes around dynamic Immersion Kit content while still detecting real text and anchor changes.

## [0.4.53] - 2026-05-26

### Fixed

- Kept scanned native page controls clickable across websites by rendering Japanese text inside links, buttons, summaries, and compact click handlers as passive lookup spans.
- Prevented press-drag lookup and injected furigana from hijacking passive control text while preserving hover lookup on those words.

## [0.4.52] - 2026-05-26

### Fixed

- Normalized JPDB pitch accent patterns against Japanese morae before cards render, fixing small-kana readings such as `今日`/`きょう` whose pitch graph could appear flat.
- Avoided recreating JPDB page add-ons for unrelated JPDB-page mutations, preventing noisy refreshes from dynamic sections such as Immersion Kit examples.
- Replaced the GitHub Pages social preview image with a full-size PNG card so WhatsApp no longer enlarges the small touch icon.

## [0.4.51] - 2026-05-26

### Changed

- Subtitle parsing now batches the active cue warmup and uses two background transcript parse workers, so YouTube lines are prepared sooner while playback advances.

### Fixed

- Kept YouTube comment and description controls such as "続きを読む", links, and buttons clickable while preserving passive hover lookup on their Japanese text.
- Unwrapped object-shaped YouTube caption labels for localized and auto-translated tracks, preventing `[object Object]` from appearing in the subtitle drawer title.

## [0.4.50] - 2026-05-25

### Changed

- Subtitle track selection now stays on Tracks and tells users to click Lines next, with updated English and Japanese copy.

### Fixed

- Restored full timed transcript loading for YouTube videos whose page caption URL is empty by merging Android player caption tracks and matching equivalent Japanese streams across localized labels.
- Prevented YouTube hover-preview videos from becoming Yomu subtitle sources or leaking stale `.jpdb-subtitle-primary` overlays onto feed pages.
- Tightened YouTube feed filtering so playlist/mix cards and filtered videos collapse without blank grid gaps, while kanji/katakana Japanese titles remain visible and sparse feeds nudge YouTube continuation loading.

## [0.4.49] - 2026-05-25

### Added

- Added YouTube auto-translated caption choices for preferred languages such as Japanese, so English videos can be watched with YouTube-provided Japanese translated subtitles when available.

### Changed

- After choosing a subtitle track, the sidebar now moves directly back to Lines when transcript lines are available, with a small Tracks hint explaining the flow.
- YouTube caption discovery now keeps creator captions, auto-generated captions, and auto-translated captions as separate track choices instead of collapsing same-language options together.

### Fixed

- Made transcript row clicks and keyboard activation seek to the exact subtitle timestamp, while keeping the configured seek padding for previous/next controls.
- Reduced the YouTube DOM-caption fallback delay and preserved full transcript rendering when timed YouTube tracks are available, avoiding the one-line-only sidebar state.
- Kept the transcript drawer visible when subtitle controls are hidden and tightened current YouTube player insets so the side drawer does not overlap the video after layout settles.
- Refreshed transcript JPDB parsing when parse-affecting settings change, keeping sidebar subtitle words colorized, hoverable, and clickable like player subtitles.

## [0.4.48] - 2026-05-25

### Fixed

- Smoothed YouTube immersion filtering by avoiding repeated oEmbed retries, batching rescans, and keeping translated-looking titles visible until the original title check finishes.
- Hid playlist, mix, radio, and shelf items without treating normal videos whose title contains "mix" as playlists.
- Stopped the YouTube hidden-items notice from reappearing on every count change, left Shorts scrolling untouched, and prevented よむ spans from leaving stale YouTube watch titles after SPA navigation.

## [0.4.47] - 2026-05-25

### Fixed

- Allowed scanned page words with furigana to wrap normally, preventing long annotated Japanese lines from overflowing into adjacent page columns.
- Added passive no-furigana scanning for safe page UI labels such as navigation links and buttons, so labels can be recognized without hijacking the controls' normal clicks.

## [0.4.46] - 2026-05-25

### Fixed

- Restored iOS tap/click lookup behavior for OCR text regions so tapping an OCR line opens the same sticky/modal lookup state as tapping normal scanned text.

## [0.4.45] - 2026-05-25

### Changed

- Refined the iPhone/iPad install guide for current Userscripts behavior, including the automatic scripts folder and Safari AA/extensions menu flow.

### Fixed

- Kept image OCR quiet when a scanned image has no Japanese text, instead of showing a "No Japanese text found" banner on ordinary non-Japanese images.
- Changed Immersion Kit rate-limit backoff to start at 1 s (was 100 ms) and double on each consecutive 429, capping at 30 s, then reset after a successful search.

## [0.4.44] - 2026-05-25

### Fixed

- Fixed OCR pronunciation cleanup and Japanese translation quote parsing in popup results.

## [0.4.43] - 2026-05-25

### Fixed

- Fixed hosted Try Me furigana alignment by keeping parsed words on native inline ruby layout instead of flex layout.

## [0.4.42] - 2026-05-25

### Added

- OCR now triggers automatically when hovering or moving the pointer over a manga/image panel, so you no longer need to click to start a scan on a new image.
- Immersion Kit searches now respect a 2-minute rate-limit cooldown after receiving a 429 response, preventing repeated failed requests from hammering the API.

### Fixed

- Fixed a bug where `ImmersionPopoverController.loadExamples` resolved to `false` instead of resolving cleanly when a popover load was aborted mid-flight, which could incorrectly suppress a follow-up load on a new popover.
- Fixed the Immersion Kit `<details>` mount starting open when it should start closed on both the reader and new-tab pages.
- Fixed the docs navigation "more" button icon rendering incorrectly in some browsers.

### Internal

- Removed an empty `else {}` branch from `LruCache.get` that had no effect.
- Added dedicated test suites for `LruCache`, `runLimited`, card-state normalization, and immersion query utilities (60 new tests).

## [0.4.41] - 2026-05-25

### Changed

- Made the YouTube immersion filter enabled by default and updated its settings/docs copy to match the new default.
- Aligned YouTube card filtering with NihongoTube by checking original YouTube oEmbed titles when video ids are available and using kana-based Japanese detection instead of localized title text alone.

### Fixed

- Replaced the persistent YouTube hidden-video bar with a temporary toast-style notice and clearer controls for showing hidden videos or hiding future notices without turning off the filter.

## [0.4.40] - 2026-05-25

### Fixed

- Restored the known-good Yomu icon and regenerated every shipped icon asset from the same source visual.
- Fixed hosted/iOS reader styling when userscript `GM_*` resource APIs are unavailable, restoring lookup drawers, word colors, and OCR overlays on the main site.
- Published the reader CSS asset with the hosted docs so the main site can load the full stylesheet without userscript manager APIs.

## [0.4.39] - 2026-05-24

### Fixed

- Restored the pre-0.4.38 raster Yomu app icons while keeping the hosted share metadata pointed at the SVG icon.

## [0.4.38] - 2026-05-24

### Fixed

- Made hosted social metadata point at the live Yomu SVG icon and regenerated fallback raster assets from that SVG.

## [0.4.37] - 2026-05-24

### Added

- Added a development userscript launcher and shipped readable reader CSS as a Greasy Fork `@resource`, with release verification for the external CSS asset and userscript metadata.

### Changed

- Refined settings, hosted new-tab, subtitle, and nested lookup behavior, including stacked settings popups and subtitle-player click lookup handling.
- Refreshed the Yomu icon assets and tightened hosted docs/new-tab styling.

### Fixed

- Hardened subtitle parsing, native-track handling, JPDB source parsing, performance caches, and settings form behavior with broader regression coverage.

## [0.4.36] - 2026-05-24

### Fixed

- Added an iOS/Safari-safe idle scheduling fallback so OCR and deferred dictionary lookups no longer crash when `window.requestIdleCallback` is missing or not callable.

## [0.4.35] - 2026-05-24

### Fixed

- Removed the duplicate over-video subtitle file loader buttons; local subtitle files are now chosen from the subtitle tracks side panel.

## [0.4.34] - 2026-05-24

### Added

- Restored JPDB.io page enhancements for JPDB word/search and kanji surfaces, using the same ordered source-card styling as the popup and hosted new-tab dictionary.
- Added Immersion Kit as a reorderable kanji source for popup, hosted new-tab, and JPDB kanji pages.

### Fixed

- Suppressed native browser title tooltips while a dictionary popup is open, preventing OCR sentence/status tooltips from covering the lookup card.

## [0.4.33] - 2026-05-24

### Fixed

- Disabled hover lookup and hover-close behavior while a click/tap-opened popup is active, so iPad mouse, trackpad, and Apple Pencil hover surfaces no longer replace or close the sticky lookup when the pointer moves away.

## [0.4.32] - 2026-05-24

### Changed

- Moved the hosted new-tab Stats and Settings actions into a compact more menu, refreshed new-tab source switching, and tightened responsive/new-tab styling.
- Improved Japanese UI parsing for settings and nested reader text while preserving click-first lookup behavior inside Yomu-controlled surfaces.

### Fixed

- Hardened pointer lookup edge cases around low-value kana tokens, JPDB reading matches, theme/settings controls, and new-tab review flows.

## [0.4.30] - 2026-05-24

### Fixed

- Fixed iPhone/touch OCR image interaction so tapping an OCR line reveals and pins the sentence first, while tapping parsed words inside the revealed line still opens the normal lookup popup.

## [0.4.29] - 2026-05-24

### Added

- Added richer hosted new-tab review flows for study cards, including expanded lookup/review behavior and stronger regression coverage.
- Added media activation handling and broader Uchisen publishing/validation utilities for kanji study assets.

### Changed

- Improved JPDB, Anki, Immersion Kit, audio, settings, stats, and study-tool runtime behavior across popup and hosted new-tab surfaces.
- Refined responsive styling for new-tab, stats, settings, kanji, and immersion study views.

### Fixed

- Hardened dictionary source ordering, JPDB parsing, proxy fetches, performance caches, study grammar handling, and stats tests around the latest study flows.

## [0.4.28] - 2026-05-23

### Added

- Added beginner-facing reading-site recommendations to the getting started guide, including graded readers, easy news, ebook readers, web novels, and subtitle-based YouTube practice.
- Added hosted-page copy that explains よむ as a reading-first immersion system across JPDB, Yomitan dictionaries, Anki, OCR, subtitles, and example sources.

### Changed

- Made shuffled audio behave like a deck, trying available clips for a word before reshuffling, and updated the README and audio docs to describe the new behavior.
- Improved hosted new-tab and stats behavior around JPDB/Anki study cards, dictionary-backed study words, and cached runtime data.

### Fixed

- Hardened lookup, audio, OCR, proxy fetches, and local dictionary paths with broader regression coverage for JPDB pages, new-tab review, performance caches, and stats.

## [0.4.27] - 2026-05-23

### Fixed

- Kept the back arrow available when clicking parsed study-source words inside an already-open popup, including hover-opened popovers and fallback/local parsed sentence spans.

## [0.4.26] - 2026-05-23

### Added

- Added a hosted New Tab Stats view that combines JPDB and Anki progress, including daily review activity, study minutes, new-card charts, retention, streaks, card distribution, average review speed, and due-time estimates.
- Added JPDB `reviews.json` import support for historical review graphs while still using the JPDB API key for current card-state stats.
- Added AnkiConnect stats loading for daily review counts, retention sampling, and deck card breakdowns.

### Changed

- Added a Stats nav mode alongside Word, Kanji, and Search, with a matching docs nav link and Yomu-themed responsive styling.
- Let the Stats card distribution jump back into the study deck focused on due or failed cards.

## [0.4.25] - 2026-05-22

### Changed

- Made popup, subtitle, YouTube, and hosted new-tab work prioritize the current word more aggressively while moving background parsing, card data, grammar, translation, audio, and Immersion Kit preloads onto shorter waits and bounded caches.
- Batched visible-page DOM updates and transcript hydration work so long pages and YouTube transcripts stay responsive on iPhone-class devices.
- Added outbound-link icons to hosted Settings help links so external destinations match the Video Player affordance.

### Fixed

- Prevented disabled YouTube filtering from attaching observers or scanning video cards until the filter is enabled.
- Kept subtitle transcript cue parsing from dropping rows that were already pending in another hydration batch.
- Reused fallback Japanese word segmentation and cleared in-flight JPDB parses on reset to avoid stale parser work.
- Stopped userscript HTTP timeouts from starting a second fetch fallback, avoiding extra waits on slow requests.

## [0.4.24] - 2026-05-21

### Fixed

- Made hosted new-tab search include already-loaded JPDB and Anki review cards, so English glossary searches can find study cards even before a local dictionary is installed.
- Limited the userscript HTTP bridge to Yomu-hosted app pages while keeping direct GM requests available inside the userscript on normal websites.

## [0.4.23] - 2026-05-19

### Changed

- Extension releases now use the generated popup menu instead of an options/reviewer page, and release assets include one consolidated submission guide instead of separate review markdown files.
- Extension new-tab builds now load the cache/version helper from an external script so Firefox and other strict extension pages do not block startup with inline-script policy errors.

### Fixed

- Fixed extension new-tab branding so the よむ icon resolves from the packaged extension instead of a broken hosted-page relative path.
- Hardened Firefox/userscript page injection against cross-origin property descriptors and Trusted Types/CSP-protected parsing, restoring raw userscript installs on strict pages such as Google, YouTube, and NHK.
- Restored YouTube subtitle discovery fallback behavior when native caption tracks are not exposed immediately, while keeping DOM caption fallback available for currently visible captions.
- Let NHK Easy pages fall back to whole-page parsing when the site-specific parser finds no article targets, so visible Japanese can still be colored and looked up.
- Made OCR lookup hit targets larger, kept pinned OCR lines stable during hover, and kept lookup popovers from opening directly under the pointer.
- Kept words inside an open popup click-driven instead of hover-driven, and preserved pinned/modal popup mode while moving through nested lookup content.

## [0.4.15] - 2026-05-19

### Added

- Added GitHub Release assets for the compiled userscript, Chrome extension ZIP, Firefox XPI, Safari Web Extension ZIP, compiler project bundle, and review notes.
- Added an Audio setting for whether JPDB/browser text-to-speech is fallback-only or participates in the configured source order/random pool.
- Replaced the Help-panel Help link with a Factory Reset action that clears settings, API keys, preferences, cached cards, local dictionary storage, and other よむ local data before reloading defaults.
- Hardened Factory Reset so settings storage is cleared even if dictionary database cleanup is blocked, including userscript managers that expose modern `GM.*` storage APIs.
- Added capped JPDB "used in vocabulary" and public example rows to popup JPDB definitions, including compact buttons for JPDB-provided example audio.
- Added Anki card front controls for hiding the reading, sentence, or image on word-first cards.
- Added Immersion Kit audio to Anki-mined notes when the selected Immersion Kit example is used as the card context.

### Changed

- Made GitHub Pages deploys rebuild and sync the hosted userscript and new-tab assets before publishing.
- Made `/newtab` keep JPDB and Anki SRS queue order, alternate JPDB/Anki cards in Auto mode, and only fall back to random dictionary words after both review queues are empty.
- Made the hosted new tab paint cached cards immediately while JPDB, Anki, or dictionary sources refresh in the background, and sped up deck/dictionary refresh work so a card appears sooner after reload.
- Moved the shared cross-origin proxy URL control into Audio settings so proxy-dependent audio sources are easier to diagnose.
- Moved existing Anki note actions into the Anki preview, simplified the header, removed the default Status row from Yomu Anki cards, and refreshed Anki lookup state immediately after adding a note.

### Fixed

- Fixed raw userscript installs on pages that shadow window event methods by routing the userscript HTTP bridge through hardened event helpers.
- Let the hosted new-tab page attempt direct AnkiConnect requests and show the CORS/userscript bridge setup hint when standalone Anki tests fail.
- Made recommended dictionary installs visibly queue/import on their buttons and kept Settings Save unavailable until dictionary imports finish, so new-tab setup no longer looks broken while dictionaries are still loading.
- Restored LanguagePod101 lookups through the configured/public proxy path in browser-fetch contexts.
- Made Escape close the Settings dialog even when focus is inside a normal settings field.
- Made hosted new-tab bottom-sheet lookups modeless so sentence-mining taps can update the open drawer, and hid the sticky bottom-sheet option when Popover mode is forced.
- Restored JPDB-status word highlights and pitch underlines across hosted new-tab prompt sentences and Immersion Kit example cards.

## [0.4.14] - 2026-05-16

### Added

- Added hosted new-tab search as a first-class Word / Kanji / Search mode, with JPDB/local word results, kanji drilldown results, external lookup links, and autocomplete suggestions.

### Changed

- Renamed the homepage hero CTA to `Try Out` and removed the duplicate `See Features` hero pill while keeping the nav Features link.
- Widened mobile sheet and mining-drawer drag targets so the handle bands are easier to grab on touch devices.
- Spaced kanji origin graph nodes more aggressively to reduce overlap in crowded component maps.

### Fixed

- Kept the new-tab word answer layout from bunching or overlapping on small screens.

### Fixed

- Restored hosted new-tab kanji drill-down back navigation and kept the current lookup sheet height while moving through components.
- Made mobile lookup sheets resize continuously by dragging the handle, remember the chosen height for the next popup, and close when the handle is tapped.
- Added the same pull-to-resize affordance to the mobile Settings drawer, with an independent remembered height.
- Kept Translation and Grammar as separate popup sources that follow the Dictionaries settings order and remember collapsed state across rerenders.
- Removed duplicate Immersion Kit source labels and spaced parsed example captions so furigana, Japanese text, and translations do not overlap.

## [0.4.11] - 2026-05-16

### Fixed

- Routed public page/media requests through the shared CORS fallback stack, including hosted-page audio, Uchisen, JPDB public kanji/vocabulary pages, RTK, KanjiVG, pitch, and Immersion Kit media.
- Routed hosted JPDB API review/deck calls through the restricted Cloudflare Worker fallback on iPad and GitHub Pages, while keeping direct localhost calls available for development.
- Made JPDB API deck cards load deterministically in the hosted new tab so the review total no longer changes randomly on refresh.
- Matched new-tab kanji source ordering to Settings, with JPDB kanji first, RTK immediately after it, kanji facts/graph next, and every section open by default.
- Flattened nested new-tab kanji detail cards while keeping useful component and similar-word cards, and centered Uchisen controls, image, and story text.
- Tightened the new-tab kanji reveal layout so the reference and drawing panels align cleanly, and removed the repeated lower JPDB detail card stack.
- Kept JPDB kanji fact items on one line when space allows.
- Repaired prompt tapping in word mode so tapping the displayed word opens the dictionary popover instead of doing nothing.
- Cleared stale parse markers across progressive popup renders so JPDB, Immersion Kit, and local sentences remain tokenized and clickable after details finish loading.
- Made kanji taps inside the hosted new-tab popup open the full kanji panel with Settings-ordered sections instead of falling back to a plain one-character word lookup.
- Tightened iPhone word-review spacing so the prompt, answer, Immersion Kit media, and five grading buttons no longer overlap or wrap awkwardly.
- Reworked touch settings layout so phone and tablet use a bottom drawer, source rows do not overlap controls, and inactive tabs do not look selected after tapping.
- Restored hosted mobile popup behavior: Add to Anki now uses the iOS/Android handoff without AnkiConnect preflights, popup sections collapse/expand normally, and bottom sheets recover their size after rotation.

## [0.4.10] - 2026-05-15

### Fixed

- Added a Cloudflare-hosted public-resource proxy fallback for hosted-page JPDB kanji/vocabulary, pitch, audio, and dictionary downloads without sending logged-in JPDB actions through public proxies.
- Reworked the hosted new-tab iPad flow so missing dictionaries send users to Settings, dictionary downloads do not open surprise tabs, new-tab word taps open the lookup popover, kanji graph nodes drag, and the bottom controls stay fixed.
- Kept the Dictionaries settings source-order table compact on iPad when no imported dictionaries exist, removing the empty Display name and Remove columns until they are useful.
- Added hosted-page userscript coverage back for the new-tab page so JPDB kanji, Uchisen, RTK, and remote dictionary downloads can use the userscript request bridge on iPad.
- Improved the settings Help and tablet layout, including visible donation/support links and better wrapping for settings rows.
- Treat mobile Anki handoff as a valid iPad/Android path instead of reporting mobile-only setups as broken AnkiConnect.
- Let the standalone hosted new-tab page use normal browser CORS for Immersion Kit examples/media, so Chrome, Safari/WebKit, Firefox, and mobile browsers do not need an installed userscript just to load examples.
- Kept compressed Yomitan ZIP imports working when `DecompressionStream` is unavailable or unreliable.

## [0.4.9] - 2026-05-14

### Fixed

- Restored the hosted new-tab demo so local dictionary cards, nested popup dictionary links, kanji drilldowns, and similar-word lookups work even before the userscript is installed.
- Preserved Immersion Kit context when mining from nested example lookups, including the active example image in Anki notes.
- Restored explicit transcript and track-picker subtitle controls, kept the transcript drawer closed by default, and tightened transcript accessibility contrast/target sizing.
- Reworked release QA coverage for the hosted docs/new-tab page, JPDB add-ons, OCR, Immersion Kit, subtitles, and userscript bundle verification.

## [0.4.8] - 2026-05-14

### Added

- Added karaoke-style subtitle word timing, smarter transcript layout fallback, and a resizable transcript panel that stays usable across ordinary video pages, YouTube, and Comprehensible Japanese layouts.
- Added JPDB vocabulary compounds/examples inside popup JPDB sections and JPDB page side panels, with better Immersion Kit fallback queries for compound terms.
- Added userscript menu actions to open the hosted new-tab page and reset all local よむ data, plus subtitle smoke/e2e scripts for release QA.

### Changed

- Improved subtitle sentence recovery, transcript hydration, OCR/site parser handling, and audio preview matching so mining and playback stay more reliable around transcript-heavy pages.
- Updated popup and kanji navigation so nested kanji drilldowns can return through prior kanji cards or back to the source word without losing position.
- Made the support/donation copy more transparent about the AI/API token costs behind よむ development.

### Fixed

- Prevented side transcript layouts from shrinking videos too aggressively by falling back below the player when space gets too tight.
- Tightened JPDB page parsing and popup rendering so compounds, examples, and kana-backed audio behave more consistently on compound-heavy entries.
- Restored no-key JPDB public lookup data so popup JPDB definitions/examples, public pitch accent, and JPDB kanji details load from public pages while mining stays API-key gated.
- Made the reset-all command refresh back into first-run onboarding and tell other open よむ tabs to drop stale stores before reloading.

## [0.4.7] - 2026-05-13

### Changed

- Tuned Help-card spacing and Add button accent color so settings and kanji controls feel calmer and more consistent.

## [0.4.6] - 2026-05-13

### Changed

- Polished shared settings/action button styling so support and settings controls read as one quieter system.

## [0.4.5] - 2026-05-13

### Fixed

- Aligned the settings light/dark switch so it sits cleanly in the settings control row.

## [0.4.4] - 2026-05-13

### Changed

- Added a visible light/dark theme switch in settings and refreshed the new-tab theme switch without the old logo halo treatment.
- Removed the stale hosted screenshot gallery and old public reader/video/OCR test pages from the docs deployment.
- Tightened popup action styling so kanji-card lookup pills and mining/review buttons sit more quietly in the layout.

### Fixed

- Locked mining controls to the bottom of fixed-height popups, with the expand/minimize control in a slim gutter instead of floating over action buttons.
- Replaced the cramped icon plus on Add to deck with the plain text label `Add to deck +`.
- Restored reliable JPDB kanji drilldown, review doodle preview carryover, OCR parsing, subtitle transcript layout, and new-tab fallback coverage in the Playwright QA pass.
- Stopped the docs site from self-injecting the userscript bundle, removing misleading CORS and lookup noise on GitHub Pages.

## [0.4.3] - 2026-05-13

### Changed

- Simplified the hosted video page into a single native video host so Yomu's normal subtitle overlay, track picker, transcript sidebar, and mining controls own the full subtitle workflow.
- Reworked YouTube/local subtitle sidebars around a transcript-first Lines surface, with left/bottom/right placement, auto-scroll, and fullscreen behavior that hides page chrome while keeping Yomu subtitles visible.
- Pre-warmed parsed subtitle styling and dynamically fit subtitle font size to the actual video bounds to avoid unstyled flashes and overflow.

### Fixed

- Removed the hosted video page's custom file queue, layout sidebar, and Clear button so it no longer behaves like a second video player.
- Prevented Yomu and YouTube/native captions from displaying at the same time, with a hidden fallback for current-line YouTube captions when timedtext returns no cue list.
- Stopped idle subtitle/sidebar layout loops from repeatedly writing player styles, and kept the floating puck away from unfocused video surfaces.

## [0.4.2] - 2026-05-12

### Added

- Added richer learner grammar cues for common particles, polite forms, conditionals, negatives, and verb endings, with matched sentence context and guide links.
- Added local dictionary/new-tab and source-order improvements from the current workspace changes.
- Added a hosted video-player page for local browser-supported media and subtitle files.
- Added Uchisen as an ordered kanji-popup source and brought Uchisen, RTK, and stroke practice into JPDB kanji/review surfaces.
- Added JPDB review reveal word-audio autoplay using よむ's configured Yomitan-compatible audio sources.

### Changed

- Bumped the package and userscript version to `0.4.2`.
- Reworked translation and grammar study panels into compact learner rows instead of nested cards, with smaller typography and better ruby/furigana spacing.
- Moved reader styles into the bundled stylesheet path while keeping the userscript self-contained.
- Tuned default subtitle appearance to be smaller, lighter, and closer to ASB-style captions.
- Replaced the legacy subtitle-bridge menu action with an Open Video Player action that launches the GitHub Pages player.
- Renamed the JPDB review sentence toggle to "Auto-reveal review example sentences" and made Immersion Kit reveal audio mutually exclusive with よむ word reveal audio.

### Fixed

- Removed the misleading “Pattern hints are best guesses from the full sentence shape.” note and the redundant grammar cue count.
- Tightened grammar matching so forms such as `読みました` and `確認できます` show cleaner “Found in” text and `できます` is not mistaken for the particle `で`.
- Prevented detected page captions from stacking artificial DOM line breaks, and expanded the subtitle backing/shadow so furigana stays visually covered.
- Cleared JPDB Immersion Kit reveal audio automatically when the global or JPDB Immersion Kit add-ons are disabled.

## [0.4.1] - 2026-05-12

### Fixed

- Completed the furigana/highlight settings UI so the existing furigana modes, hidden-known behavior, and highlight-off mode are exposed consistently in settings.
- Updated subtitle/transcript parsing cache keys so furigana and word-highlight mode changes refresh parsed subtitle lines correctly.

## [0.4.0] - 2026-05-12

### Added

- Added a transcript panel for video subtitle mining, with active-line highlighting, auto-scroll, responsive left/right/below placement, and tappable lookup on visible transcript lines.
- Added a Local Audio docs page covering hosted Ultimate Yomitan Audio, self-hosted audio files, local server setup, startup tasks, custom ports, and Tailscale access.
- Added optional one-time Immersion Kit hover audio on desktop, with a setting to turn it off and manual replay kept available on every device.
- Added deterministic Playwright plus axe/WCAG audits for product fixtures and GitHub Pages docs, a complexity audit, a local `.env.example`, and a live JPDB smoke test that reads secrets only from local `.env`.
- Added the GitHub Actions release workflow for tagged releases with `dist/yomu.user.js` attached.

### Changed

- Bumped the package version to `0.4.0`.
- Added automatic word highlight mode: status colors stay tied to JPDB/Anki mining, while pitch-accent colors become the default when mining status is not configured.
- Made JPDB mining actions independently configurable so users can keep a JPDB API key for popup lookup without showing add/Never Forget/blacklist actions.
- Reworked video subtitle controls into compact icon buttons; transcript and track panels now share the same side-panel surface instead of competing popovers.
- Reworked Immersion Kit example controls so navigation, audio, and count alignment stay compact inside the existing card instead of looking like separate panels.
- Expanded the docs and README with fuller feature descriptions, iPhone/iPad limitations, beginner-friendly local audio guidance, release links, and source credits.
- Refreshed screenshots, docs contrast, new-tab accent theming, donation/support copy, and the homepage/new-tab assets.
- Improved new-tab fallback behavior so the page can use Anki, JPDB, then top-ranked local dictionary words without showing a dead setup warning.

### Fixed

- Improved page scanning on JPDB, Jisho, and ruby-heavy NHK-style pages so split Japanese text, one-kanji terms, and inline furigana are wrapped for lookup more reliably.
- Fixed the new-tab loading path so static placeholder markup is replaced by the live study UI.
- Fixed duplicate/old userscript menu-command wiring from earlier subtitle actions.
- Fixed cramped subtitle controls, oversized hide button styling, and broken/low-contrast docs imagery.
- Fixed native-page CSS collisions that could stretch よむ popup action buttons on JPDB search/review pages.
- Prevented local JPDB keys from leaking into source scans by documenting and ignoring local `.env` files.

## [0.3.0] - 2026-05-11

### Added

- Added the GitHub Pages documentation site with beginner-friendly install instructions, feature docs, support links, and Playwright screenshots.
- Added GitHub Actions deployment for the docs site.
- Added the optional よむ new-tab study page for browser home pages, new tabs, and iPad Home Screen shortcuts.
- Added clearer iPhone/iPad guidance, including Tampermonkey and the free open-source Userscripts app.
- Added documentation for upcoming native Chrome, Firefox, and Safari extensions.
- Added this changelog as the canonical release-notes source for the website.
- Added a copy button to word and kanji lookup pills.
- Added public JPDB pitch-accent fallback for words that do not include pitch data in the parsed card.

### Changed

- Bumped the package version to `0.3.0`.
- Updated the settings Help area to link to the documentation site.
- Expanded support documentation for GitHub issues, Discord, and optional donations.
- Improved JPDB add-on example audio handling so repeat taps do not stack duplicate playback or leak temporary blob URLs.

### Fixed

- Made the first-run mobile onboarding choices clearer.
- Prevented mobile audio-source controls from clipping in settings.
- Fixed the kanji drilldown JPDB button so it opens the matching JPDB kanji page.
- Made the hover lookup QA screenshot deterministic by drilling into the seeded `今日` kanji fixture before continuing hover and press-drag checks.

## [0.2.0] - 2026-05-10

### Added

- Released the initial よむ userscript baseline with JPDB popup lookup, JPDB mining, Yomitan dictionary imports, OCR, subtitles, YouTube filtering, kanji drilldown, Anki support, and browser QA fixtures.
