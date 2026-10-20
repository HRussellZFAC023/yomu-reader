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
