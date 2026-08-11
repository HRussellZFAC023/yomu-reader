# Yomu Gaming First-Run Contract

Owner: native Electron app implementation.

Public docs and release metadata expect the first-party Yomu Gaming app to open on a
language-neutral home screen. A fresh profile must choose what it is reading before any
capture path becomes active.

- Before a target is chosen, the one hero names Yomu Gaming and asks the player to choose
  a language. It does not name Japanese, show capture actions, or advertise the global
  shortcut. The choice opens Settings on Appearance > Language profile with an empty,
  required target control; the compatibility Japanese profile is not rendered as intent.
- `learningTargetChosen` becomes true only on a valid target-select change. Unrelated
  settings saves preserve false. The selected target is adopted in the renderer before
  the next OCR request or inline-reader boot.
- A global shortcut can still be delivered by the operating system before first-run is
  complete. The Electron main-process gate routes it to the required target control before
  sampling the display or creating an overlay. The renderer repeats the guard before OCR,
  reader boot, selection, and re-capture as defense in depth.
- After target choice, one hero shows the app name, one sentence saying what it does, one
  primary capture button, and the capture shortcut exactly once.
- The keyboard speaks once, from one fact. The line under the primary button names a key
  only while `hotkeyRegistered` is true; otherwise the same line offers the next step
  ("Pick a shortcut in Settings to read from any app."). Home never names a key the
  session refused, and a shortcut that did not register is never reported as saved.
- Say what it does, not how. The whole display is captured, so the chosen-target copy stays
  about reading that language on screen — no game-only framing, and no OCR or provider
  mechanics.
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

- chosen `[data-gaming-home]` with a single `h1` and `[data-action="instant-capture"]`
- `[data-gaming-home][data-target-choice-required="true"] [data-action="choose-target"]`
- `select[name="targetLanguage"] [data-gaming-target-placeholder]` before choice
- `[data-action="area-capture"]`, `[data-action="open-settings"]`, `[data-action="close-settings"]`
- `[data-native-capture-shortcut] [data-capture-shortcut-input]`
- `[data-gaming-shortcut-line][data-shortcut-ready]` — the one line the keyboard owns
- `[data-action="overlay-settings"]` in the overlay window lands the app window on Settings
- `[data-action="overlay-choose-target"]` lands on the Appearance target control before choice

The release workflow packages the app after `npm run smoke:gaming`, which asserts these on
a fresh app profile.
