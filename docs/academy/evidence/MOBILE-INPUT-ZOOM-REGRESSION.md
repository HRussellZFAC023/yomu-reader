# Academy mobile input zoom regression evidence

## Backlog risk

The adversarial QA backlog identifies the mobile profile flow as a fragile layout area, including the name prompt colliding with the dialogue region. A focused text control can compound that failure on iOS when its computed font size is below 16px: Safari may zoom the visual viewport and leave the prompt/dialogue composition clipped or overlapping.

## Deterministic guard

`scripts/academy-release-gate.mjs` now runs its 390x844 journey in a mobile, touch-enabled Chromium context at 2x device scale. At every audited milestone it inspects every visible zoom-sensitive `input`, `select`, `textarea`, and editable surface and fails with the control name, type, and computed font size when any control is below 16px.

The profile reason step is now an explicit audited milestone. This closes the previous gap where the name input was checked, the flow advanced, and the textarea was filled before another layout audit ran. The deterministic journey therefore covers the access code input, profile name input, profile reason textarea, and later reachable form controls rather than one hand-picked field.

This is a computed-style regression proxy, not a claim that Chromium reproduces Safari's native focus-zoom animation. Physical iPhone/iPad acceptance remains the owner gate recorded in `docs/academy/STATUS.md`.

## Verification

Run:

```sh
ACADEMY_GATE_VIEWPORT=mobile npm run gate:academy-release
```

Expected result: the mobile release journey passes, including the new `profile-reason` milestone and zero visible zoom-sensitive controls below 16px.

Observed on 2026-07-17 against `bd0ab9d4d` plus this test-only diff:

- mobile release gate: pass;
- desktop release gate with the same build: pass;
- `node --check scripts/academy-release-gate.mjs`: pass;
- `git diff --check` for the two owned files: pass.

The repository-wide complexity audit still exits non-zero on inherited functions over the threshold. It does not list `scripts/academy-release-gate.mjs`; this change adds no new reported complexity offender.
