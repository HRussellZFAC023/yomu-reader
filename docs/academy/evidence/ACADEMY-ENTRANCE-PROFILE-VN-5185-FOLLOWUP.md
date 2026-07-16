# Academy Entrance/Profile/VN Follow-up - 5185

Date: 2026-07-16

## Scope

- Live Chromium at `http://127.0.0.1:5185/academy/`.
- Entrance, profile onboarding, and starting-route VN surfaces only.
- Viewports: 1440x900, 390x844, and the shorter 390x667 regression case.
- Lesson content was not inspected or changed.

## Live Evidence

- Entrance, 390x844: paper bounds `12,458.25 -> 378,832`; visible input/actions are 50px, 48px, and 48px high. No horizontal or vertical document overflow. The focused class-code input has a 3px outline.
- Entrance, 1440x900: paper bounds `57.59,266.51 -> 487.59,679.89`; all visible controls remain inside it. No document overflow.
- Profile, 390x667: name dialogue/action bounds are `304.98..659` / `510..640`; reason bounds are `249..659` / `402..582`. Both inline actions are fully contained by the dialogue, the separate object slot is empty, and document overflow is zero.
- Profile, 390x844: name dialogue/action bounds are `481.98..836` / `687..817`; reason bounds are `426..836` / `579..759`. Both remain contained with zero document overflow.
- Portrait focus, 390x844: the selected radio receives focus and its visible label has a 3px outline with 3px offset. The focused label (`21,111 -> 191,413`) remains inside the viewport.
- Dialogue tooltip, 390x844: `Dialogue log` is portalled below its trigger at `291.73,59 -> 382,85.44`, wholly inside the viewport.
- Start route, 1440x900: title resolves to 57.6px, the documented 3.6rem cap. Focused JLPT copy is `From N5 basics to N1 advanced.`; dark ink on the green focus surface measures 5.59:1, with a 3px focus outline.
- Start route, 390x844: title, lede, and all three route slips remain within `12..378` horizontally and `465.5..828` vertically, with zero document overflow.

## Verification

```text
npx vitest run --config config/vite/academy.config.ts \
  tests/academy/human-ui.test.ts \
  tests/academy/i18n.test.ts \
  tests/academy/tooltip.test.ts \
  tests/academy/vn-stage.test.ts

4 files passed; 42 tests passed.

npm run typecheck
passed.
```

The backlog's compact-tooltip clipping and profile-overlap claims do not reproduce on the current shared tree. Compact-control tooltips are viewport-constrained, and name/reason inputs now participate in the VN dialogue flow instead of floating in a separate object paper.
