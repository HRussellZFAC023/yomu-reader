# Yomu Gaming First-Run Contract

Owner: native Electron app implementation.

Public docs and release metadata expect the first-party Yomu Gaming app to expose this first-run flow:

- Show capture shortcut setup before the user has to browse the full settings form.
- Describe the action as Print Screen style: press the shortcut, drag over Japanese game text, then choose a lookup.
- Include a quick test action that opens the capture overlay from the first-run surface.
- Keep the local OCR endpoint visible near the shortcut setup.
- Persist the selected shortcut through the native app settings path.

Suggested smoke selectors:

- `[data-yomu-gaming-first-run]`
- `[data-capture-shortcut-input]`
- `[data-action="test-capture-overlay"]`
- `[data-action="start-overlay"]`

The current release workflow packages the app after `npm run smoke:gaming`; once the native flow lands, the smoke should assert those selectors on a fresh app profile.
