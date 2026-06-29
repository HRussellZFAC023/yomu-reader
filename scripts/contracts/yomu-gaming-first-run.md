# Yomu Gaming First-Run Contract

Owner: native Electron app implementation.

Public docs and release metadata expect the first-party Yomu Gaming app to expose this first-run flow:

- Show capture shortcut setup before the user has to browse the full settings form.
- Describe the action as Print Screen style: press the shortcut to read the whole screen, or use Capture area for noisy scenes.
- Include a quick test action that opens the capture overlay from the first-run surface.
- Keep local OCR endpoint setup out of first-run; Yomu Gaming should start from the same image-reading default as browser Yomu. Local OCR belongs in advanced OCR settings for native overlay builds that need it.
- Include the Game capability slot: "Install the Yomu app to use in games or anywhere on the PC."
- Persist the selected shortcut through the native app settings path.
- Keep the first-run surface compact. It should feel like native setup, not a permanent dashboard.
- Remove the first-run surface after dismissal so the app returns to a clean settings/control window.

Suggested smoke selectors:

- `[data-yomu-gaming-first-run]`
- `[data-capture-shortcut-input]`
- `[data-action="test-capture-overlay"]`
- `[data-action="start-overlay"]`

The current release workflow packages the app after `npm run smoke:gaming`; once the native flow lands, the smoke should assert those selectors on a fresh app profile.
