# Desktop interaction contract

The app runs in the tray. Read screen and the global shortcut start a fresh full-display capture. There is no home, introduction, drag selector or capture-mode choice.

Settings is the only ordinary app window. It opens on request, stays within 920×780 logical pixels and closes back to the tray. If no tray is available it remains reachable as an ordinary window. Language/permission problems route to the relevant settings or operating-system action rather than capturing without consent.

The layer must not take keyboard focus. Outside recognized words, controls and popups, pointer input passes to the underlying application. The full-screen screenshot is retained for OCR coordinates but not painted over the live app. Repeating the shortcut captures the current screen again.

Settings has one portable Export/Import JSON flow. Desktop backups restore capture settings; browser exports preserve desktop capture choices. Existing app identity and profile paths remain stable.

`gaming-app-smoke.mjs` uses deterministic capture and OCR fixtures. Its normal CDP pointer tests do not prove operating-system pass-through. Real application and cross-platform checks remain separate.
