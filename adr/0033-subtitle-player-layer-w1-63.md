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
