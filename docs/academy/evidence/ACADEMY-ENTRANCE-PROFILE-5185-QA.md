# Academy Entrance/Profile QA - 5185

Date: 2026-07-16

## Scope

- Academy entrance and profile only.
- Chromium against `http://127.0.0.1:5185/academy/` at 1440x900 and 390x844.

## Verified

- Entrance has no horizontal overflow at either viewport; the visible code input and both entrance actions are at least 48px high.
- The one-time-support dialog remains inside the phone viewport and explains that checkout generates the class code.
- Profile name, reason, and portrait steps keep their foreground paper and action areas within the viewport. The portrait grid is contained and its 44px controls meet the target size.
- The compact dialogue controls expose names through focus/hover tooltips and accessible labels.

## Fixed

Empty code submission on the 390px entrance used native required-field validation. Its browser bubble was painted over "Open the doors". The access screen now opts out of that bubble, shows the existing in-panel live-region error, marks the field invalid, and returns focus to it.

## Blocker For Main

On a loaded 390px profile name or reason step, the Reader floating support control can occupy the lower-right edge of the primary Continue action. `src/academy/styles/vn-stage.css` only relocates `.jpdb-reader-fab` for `[data-profile-step='portrait']` at lines 722-727. Extend the profile-specific placement to the name and reason steps, or reserve a non-overlapping Reader control position there. This file is main-owned and was intentionally left unchanged.
