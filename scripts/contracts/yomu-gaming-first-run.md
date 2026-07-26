# Yomu Gaming First-Run Contract

Owner: native Electron app implementation.

Public docs and release metadata expect the first-party Yomu Gaming app to open on a home
screen that answers two questions on one surface: what this app is, and what to press.

- One hero. The app name, one sentence saying what it does, one primary button, and the
  capture shortcut shown exactly once.
- The keyboard speaks once, from one fact. The line under the primary button names a key
  only while `hotkeyRegistered` is true; otherwise the same line offers the next step
  ("Pick a shortcut in Settings to read from any app."). Home never names a key the
  session refused, and a shortcut that did not register is never reported as saved.
- Say what it does, not how. The whole display is captured, so the copy stays about
  reading Japanese on screen — no game-only framing, and no OCR or provider mechanics.
- One primary action (`Read my screen`). Reading part of the screen and Settings are
  quiet secondary controls; every action appears once.
- Settings is a place you go from home, never the landing surface, and it opens on the
  capture shortcut — never on the reader's Media tab.
- Settings owns shortcut editing, and the chosen shortcut persists through the native app
  settings path.
- Keep local OCR endpoint setup out of home; Yomu Gaming starts from the same
  image-reading default as browser Yomu. Local OCR belongs in advanced OCR settings for
  native overlay builds that need it.
- Home is the app's resting surface, not a dismissible banner: every launch lands there,
  and the overlay's Settings button lands on Settings.

Smoke selectors:

- `[data-gaming-home]` with a single `h1` and `[data-action="instant-capture"]`
- `[data-action="area-capture"]`, `[data-action="open-settings"]`, `[data-action="close-settings"]`
- `[data-native-capture-shortcut] [data-capture-shortcut-input]`
- `[data-gaming-shortcut-line][data-shortcut-ready]` — the one line the keyboard owns
- `[data-action="overlay-settings"]` in the overlay window lands the app window on Settings

The release workflow packages the app after `npm run smoke:gaming`, which asserts these on
a fresh app profile.
