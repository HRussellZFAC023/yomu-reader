# Subtitle ownership of the player layer

Status: implemented in lane/W1-63; integration and simulator acceptance pending.

## Context

A body-owned caption with a maximum page z-index paints through YouTube's dialogs. Mounting it in the player fixes that ordering, but the player clips captions moved outside its box. Native player button styles can also constrain the translation's height.

## Decision

`SubtitleLayer` owns caption mounting and coordinate projection. Normal captions share the player's isolated context. The YouTube Adapter derives their local tier from native chrome; the site's higher menu tiers remain above captions. The generic path uses the video frame.

A caption whose painted rows leave the frame uses the player's outer page tier. That portal survives empty cue gaps and preserves focus when moved. A focused caption control uses the same portal so it cannot hold the native player's focus-within state and keep its chrome awake. Its popup occlusion collaborator excludes site popup regions from the exceptional surface, including overlapping popup rectangles. It observes and samples only while the caption is portaled; ordinary playback uses native stacking.

The existing fullscreen resolver keeps ownership of browser and CSS fullscreen boundaries, including mobile YouTube's separately mounted video. The transcript remains a separate reader sheet. The settings intent ledger migrates carried-along transparent defaults to the readable backdrop, while a declared opacity (including zero) and non-default legacy values survive. Caption typography and intrinsic translation height belong to component CSS, since player styles can now reach the surface.

Viewport recovery measures a stable one-line caption anchor with its reserved translation clearance. Measuring the current cue height rebased the bottom offset on wrapping or reading updates; extra lines now grow upward from the same anchor.

## Verification

The built-product stability smoke checks both contexts against page dialogs, native menus and word lookup, plus pointer dragging, cue baselines, reading ink and rendered contrast. Simulator acceptance remains separate from Chromium and Playwright WebKit results.

### Pending cue continuity

`SubtitlePaintCommit` tracks each requested boundary separately from the painted primary/secondary pair. Several contiguous pending cues retain that pair; silence and backward jumps break continuity. Caption Copy and auto-copy read the committed pair, while indexed transcript Copy continues to address its selected row. The recorded-page smoke holds parsing across three boundaries and uses the trusted Copy shortcut to verify this contract.

### Lane verification update (2026-10-26)

Simulator acceptance now passes on the built lane in the specified iPadOS 27 device: 623 observed frames across ten cue windows, one- and two-line cues, no blank primary, one DOM baseline (309.515625 CSS px), and matching first-paint reading/base colours. The screen recording's pixel-row analysis reports one bottom row (758 physical px). Status underlines are disabled for that pixel measurement so decoration is not mistaken for a glyph-baseline change. The dialog screenshot shows the site surface obscuring the caption. These are recorded-page mechanism checks with generated tracks and mocked parsing, not live YouTube or physical-device evidence. Integration acceptance remains separate.

### Caption geometry correction (2026-10-26)

The one-line viewport recovery described above did not protect wrapped cues or their move handle at narrow widths. Recovery now measures every painted caption row and the handle, including translation overflow below the anchor. The preferred baseline remains unchanged while that complete area fits; at a viewport edge, reachability takes priority. Translation still occupies a zero-height grid track so its arrival does not move the Japanese line in ordinary layouts.

The YouTube Adapter uses the native caption size as its default reference and the saved font setting as a relative scale. Before the native caption node exists it derives the reference from player width. The rail excludes the caption rows and their move handle as well as native controls. If a short video has no room for both, the rail can use clear viewport space below it while retaining its player-relative attachment. Translation backdrop padding does not own pointer hits; a stable inline text child keeps the existing accessible blur toggle.

Recorded-page replay also found that page ruby-room repair descended into the subtitle root and pinned the primary and wrapper to stale inline heights. Generic page growth now excludes reader-owned surfaces before measuring candidate boxes; caption CSS retains ownership of its line heights. The geometry gate checks actual text ranges as well as backdrop bounds, including 200% large-text zoom.

The text-only translation hit target also exposed a delayed compatibility click after an expensive repaint. The shared tap guard still expires hover suppression after 750 ms, but retains the one trailing click until it arrives or a new physical pointer clears the guard. The caption geometry smoke includes an 850 ms repaint mechanism fixture and requires one blur toggle per trusted tap.

### Fix-round verification boundary (2026-10-26)

The saved pre-fix built product reproduces all three review findings: a 328 × 42.375 px rail/translation overlap at 834 × 1194, 28 px captions against native 22 px captions, a move handle at y = −34.71875 at 320 × 568, and a translation-padding tap that toggles blur with zero native-player clicks. The corrected built-product stability smoke passes in WebKit and Chromium at those two sizes, with 22 px Japanese / 18 px translation, no caption/control overlap, reachable move handles and click-through padding. It also passes ten cue windows with one stable baseline and zero blank frames (1,151 WebKit / 1,175 Chromium samples), first-paint reading colour, dialog/menu/lookup stacking, fullscreen, explicit background/outline choices and caption axe checks. Minimum measured contrast is 7.59:1. Evidence is in the ignored `artifacts/subtitle-stability/`; generated tracks and injected controls remain labelled mechanism fixtures.

The full viewport/theme matrix is deferred to independent review under the fix-round speed rule. `smoke:subtitle-caption-rotation` is a separate acceptance probe: its auto-mode rotation passes WebKit but exposes a Chromium popup extending to x = 906.52 after rotation to an 834 px viewport. The existing `scheduleActivePopoverViewportChange` guard in `app/main.ts` ignores viewport changes at page scale 1; that code is unchanged from the integration base. This popup issue is not covered by the focused caption pass. The current fixes have not received a new simulator recording or Userscripts-route pass because the shared iOS lock was occupied; the earlier simulator evidence above applies to the earlier build only. Store/extension installation is likewise not established by these browser checks.

### Pixel-size contract correction (2026-10-26)

Positive `subtitleFontSize` values retain their original CSS-pixel contract. The previous relative-size calculation rendered a saved 64 as 50.285714 px against a 22 px native caption. Automatic sizing is now the explicit zero default: the compact control displays Auto / 自動, and Settings labels zero as automatic. Retired Defaults migrates only an unchosen legacy 28; an intent-declared 28 and custom legacy pixel sizes remain exact. Auto uses the native YouTube reference (or the player-width fallback), and 28 px on generic players and the Settings preview.

The current built-product smoke passes in WebKit iPad and Chromium: Auto 22 px, selected 64 px exactly, Auto restored to 22 px; ten cue windows, one baseline per engine, no blank frames (1,109 / 1,176 samples), matching first-paint ink, minimum contrast 7.59:1, dialog/menu/lookup ordering, fullscreen mechanisms, backdrop choices, two focused viewport checks and caption axe checks. Typecheck, 81 focused tests, docs build/localization and verify pass. The built core is 1,892,466 bytes (+3,535 against 2.1.6). Generated products are restored before the source commit.

Device acceptance remains incomplete. The specified iPad simulator displayed this build's isolated recorded-page harness in landscape and portrait. Its landscape DOM probe collected 981 samples over all ten cue windows, one baseline (388.18 CSS px), no blank primary and matching first-paint ink. This is supplementary harness evidence, not the Userscripts route. A locally staged Userscripts candidate with only dependency/resource metadata origins changed did not establish functional initialization on the real YouTube page; the original installed file was restored. Screen recording could not be established: simctl reported `Resource busy: Host recording is already in progress`. No recording was stopped on that assumption. The required fresh recording/pixel-row analysis, Userscripts portrait/landscape/fullscreen, both lookup presentations and rotation with lookup open are still pending. No simulator reset, publication or deployment was performed.

### Generic player stacking and complete replay gate (2026-10-26)

The generic player path assigned captions tier zero inside the isolated frame. A positioned video at tier one covered the words. Captions now follow the video's outermost local tier, refreshed when native styles change; the YouTube chrome Adapter and the dragged caption's page tier retain their existing contracts. `smoke:subtitle-generic-layer` exercises the built companion and shipped CSS in a labelled generic-player mechanism fixture. Interactive caption words remain hit-testable above video tiers one, seven and auto, below a player dialog, and accessible again when it closes. The saved pre-fix build fails at tier one; the corrected build passes Chromium and WebKit iPad.

The prose-colour phase of `smoke:subtitle-stability` previously depended on incomplete recorded Jiten segmentation traffic: the saved lane build makes 50 unanswered requests. An isolated replay did produce readings, so the reported timeout is not deterministic, but that network gap is real. The phase now answers segmentation explicitly with unknown tokens while the JPDB mock supplies the reading under test. It requires the article's annotated 日本語, an exercised JPDB parse, and zero unanswered dictionary requests. The complete two-engine gate passes: 1,156 WebKit and 1,176 Chromium cue frames, ten cue windows, one baseline per engine, both line counts, zero blank frames, matching first-paint and prose reading ink, minimum contrast 7.59:1, dialog/menu/lookup ordering, fullscreen mechanisms, backdrop choices, control clearance and caption axe checks. The focused playback smoke and 246 tests also pass. The core remains 1,892,466 bytes (+3,535 against 2.1.6; zero growth in this fix round).

Device acceptance is still pending for this exact build. This round acquired the iOS lock, but the separate screen lock remained occupied; it released the iOS lock without changing the installed Userscripts candidate or driving the simulator. No fresh recording, pixel-row result, Userscripts portrait/landscape/fullscreen, both lookup presentations or rotation-while-open result is claimed. The earlier recordings remain evidence only for their earlier builds. The full viewport/orientation/theme matrix belongs to independent review under the fix-round speed rule.

Final lane gates: typecheck, build, docs build (including 34 locale tests and rendered EN/JA checks) and verify pass. The new CSS pin is not published yet; verify confirms the existing hosted fallback is complete. Publication remains the integration/release lane's responsibility. Generated products are restored before committing sources and tests.

### Device-acceptance audit (2026-10-26)

The blocking finding is confirmed: the earlier device evidence does not cover source `1eca5ab1d`. This audit changes no product behavior. Its fresh build has core SHA-256 `ebff76c6693130a4bdf1010a6719c9c44a0ef599cec635663810c8c2a875b934`, runtime `04f643bdef6c3b24c5a847b807fac2c662bfd82e0791d49bd22bba20a79c71e6`, and CSS `cca57ebeb3a1ab185492ce63f2b9dec992427827c5016f108b9ef90de4903f05`. Core size is 1,892,466 bytes (+3,535 against the supplied 2.1.6 reference; zero additional bytes in this audit).

| Acceptance | Fresh result |
| --- | --- |
| Built recorded-page stability in WebKit iPad and Chromium | Pass: 1,087 / 1,176 sampled frames, all ten cue windows, one baseline per engine, both line counts, no blank frames, matching first-paint and prose reading ink |
| Readable, native-sized captions; site-dialog/menu and lookup ordering | Pass: 22 px main / 18 px translation, minimum contrast 7.59:1, backdrop choices, control clearance, click-through padding and zero caption axe violations |
| Fullscreen and playback controls | Both engines pass the stability fullscreen mechanisms and `smoke:youtube-ipad-playback`; these are browser/mechanism checks, not native Userscripts fullscreen evidence |
| Generic player stacking | `smoke:subtitle-generic-layer` passes both engines at video tiers one, seven and auto, including dialog dismissal |
| Typecheck, focused tests, locked build and verify | Pass: 112 focused tests; verify ran after the generated hosted-asset sync |
| Rotation with lookup open | WebKit passes. Chromium's popup reaches x = 867 after returning to an 834 px viewport. The lane's scale-one viewport guard is unchanged; integration already fixes it in `86ca3dbb6`. Do not weaken the probe or duplicate that shared-app change here |
| Fresh simulator recording and pixel-row analysis | Pending device access; no result from an earlier build is substituted |
| Userscripts portrait, landscape, fullscreen, both popup presentations and rotation while open | Pending functional device verification; a staged candidate alone is insufficient |

The previous local HTTP dependency attempt had a concrete delivery problem: Userscripts' native `getRemoteFileContents` upgrades HTTP to HTTPS. The maintained `ios-qa/serve-candidate.mjs` supports loopback HTTPS. Started against this lane's built `dist/` at port 18763, normal TLS verification with the helper's public QA CA returned core SHA-256 `32404bbacf31a032acf197e2cdab20caaff9b6bf1bc919789a277602e556320f`; both dependency SRI checks passed and their runtime/CSS bytes equal the canonical build above. Only dependency/update/download metadata and the hosted CSS fallback origin differ. This route needs no publication. Foreground the Userscripts host and then Safari after copying the stable `yomu.user.js`, and verify the native dependency cache and matching CSS delivery rather than assuming the popup refresh rescanned them. Back up and restore the previous installation for isolated lane QA.

Current evidence is under ignored `artifacts/subtitle-stability/acceptance-current.json`, `acceptance-build-current.json`, `device-tls-integrity.json` and the `artifacts/w1-63-acceptance-*.log` files. The full viewport/theme matrix remains the independent tester's responsibility. No release, store or physical-device result is claimed.

Device access remained unavailable from the initial attempt at approximately 18:06 UTC until cancellation at 18:36 UTC. Other tasks held the device and screen locks throughout; the latest observed locks were created at 18:23:19 UTC. This audit acquired neither lock, issued no simulator commands, and did not change the installed Userscripts file or native cache. Its local replay server was self-tested in desktop Playwright WebKit only. No fresh native recording, pixel-row result, Userscripts orientation/fullscreen/presentation result or open-lookup rotation result can therefore be claimed. These device acceptance rows remain blocked, requiring a dedicated QA slot. The lane's pending lock waiter and its local servers were stopped without releasing another task's locks. The documentation build, including its locale and rendered-page checks, also passed; generated assets are restored before the documentation-only commit.
