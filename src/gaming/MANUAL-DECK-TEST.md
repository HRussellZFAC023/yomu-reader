# Yomu Gaming — Steam Deck manual test checklist

Everything below needs **real Steam Deck hardware** (or a SteamOS / gamescope VM).
The automated `smoke:gaming` covers the settings shell, capture→OCR→inline-reader
flow, and vertical/horizontal rendering with a *simulated* screen grab; it cannot
validate global desktop capture over a real game, gamescope/Wayland capture, or
gamepad input. Run these by hand before claiming Deck support.

Build the artifact first:

```
npm run release:gaming:linux   # -> dist-gaming/packages/yomu-gaming-<version>-linux-x64.AppImage
```

Copy the AppImage to the Deck (`~/Applications` or `~/Downloads`), `chmod +x`, and
add it to Steam as a non-Steam game so it can launch from Game Mode.

---

## A. Install & launch

| # | Step | Expected |
|---|------|----------|
| A1 | In Desktop Mode, `chmod +x` the AppImage and double-click it. | The Yomu Gaming home screen opens, titled "Yomu Gaming", filling the 1280×800 screen. |
| A2 | Check the session note under the hero. | A note reads **"Steam Deck detected…"**. If SteamOS reports Wayland it warns about the capture portal. (Driven by `isSteamDeckSession` / `displayServer` in `environmentStatus()`.) |
| A3 | Add the AppImage to Steam → switch to **Game Mode** → launch it from the library. | App launches full-screen in Game Mode without a desktop-session error. |
| A4 | Read the home screen. | One hero: "Read Japanese anywhere on your screen", one primary "Read my screen", the capture shortcut shown once, then "Read part of the screen" and "Settings". Fits without vertical scroll at 800px. |
| A5 | Read the line under **Read my screen**. | If gamescope kept the chord (`globalShortcut.register` returned false), that line reads **"Pick a shortcut in Settings to read from any app."** instead of naming a key — the home screen never tells you to press something the session did not hand over. Setting a shortcut that the session also keeps answers "… is taken here. Try another key." and stays on that line, never a green "saved". |

## B. Capture shortcut via Steam Input (controller-only)

| # | Step | Expected |
|---|------|----------|
| B1 | In Game Mode, open the Steam overlay → Controller Settings → map a Deck button (e.g. **L4/R4 back paddle** or a **radial menu** entry) to send the capture chord (default `Ctrl+Shift+Y`). | Steam Input sends the chord to the focused app. |
| B2 | Launch a Japanese game (or any window with Japanese text). Press the mapped button. | The Yomu overlay appears **over the game** within ~1s, showing a frozen frame of the screen. |
| B3 | Press the mapped button again while the overlay is open. | Overlay closes (the global shortcut toggles show/hide — `registerGlobalShortcuts`). |

> If B2 shows a **blank/black** frozen frame, this is the gamescope/Wayland capture
> gap. `desktopCapturer.getSources({types:['screen']})` may return an empty or black
> thumbnail under gamescope. Record: SteamOS version, `XDG_SESSION_TYPE`,
> whether a portal permission dialog appeared. See "Known risks" below.

## C. Controller navigation of the overlay (the new gamepad driver)

Do this with **no keyboard/mouse attached** — just the Deck's built-in controls.

| # | Step | Expected |
|---|------|----------|
| C1 | With the overlay open on a screen containing Japanese, press **D-pad right/left/up/down** (or use the **left stick**). | A bright accent **focus ring** appears on an OCR'd word and moves between words in the pressed direction. First press focuses the first word. |
| C2 | Move the focus ring onto a known word and press **A** (south button) — **R2** also works. | The **real Yomu popover** opens for that word (definition, pitch, SRS grade buttons), exactly like a mouse click. |
| C3 | With the popover open, press **B** (east button). | The popover closes; the overlay stays open. |
| C4 | With no popover open, press **B**. | The whole overlay closes. |
| C5 | Press **Y** (north). | The screen is re-captured (frozen frame refreshes). |
| C6 | Press **Start** (or **L2**). | The Yomu Gaming window comes forward on Settings and the overlay hides. |
| C7 | Hold a D-pad direction. | Focus auto-repeats (~360ms to first repeat, then ~140ms) — it should feel like key-repeat, not one-step-per-press. |

> Deck built-in buttons report through the standard Gamepad mapping, so C1–C7 should
> work with **no Steam Input remap**. If they don't, confirm `navigator.getGamepads()`
> returns the Deck controller inside the Electron renderer (Chromium sometimes gates
> the Gamepad API until the first button event — press any button first).

## D. Capture → OCR → read (end to end)

| # | Step | Expected |
|---|------|----------|
| D1 | Instant capture (mapped button or "Read my screen") over a dialogue box. | Recognized lines render **in place** over the game text with furigana; no ellipsis truncation. |
| D2 | Vertical text (VN/manga column). | Renders as an upright **vertical-rl** column, not a clipped horizontal pill. |
| D3 | "Read part of the screen" then drag a box (touchscreen or trackpad) around a smaller region. | Only that region is OCR'd; the crop rectangle disappears once results render. |
| D4 | Confirm the frozen frame does **not** contain Yomu's own toolbar/selection box. | Capture is the game only — the overlay chrome is excluded (frame is grabbed while our windows are hidden). |
| D5 | Open a word popover and grade it (Nothing…Easy) if signed into jpdb/jiten. | Grade submits through the bundled reader; no browser tab opens. |

## E. Performance on Deck-class hardware

| # | Step | Expected |
|---|------|----------|
| E1 | Time from capture trigger to inline results over a busy 1280×800 scene. | Should feel responsive (a few seconds for cloud Lens; local OCR depends on the endpoint). Note the wall-clock time. |
| E2 | Watch battery/thermals during a 10-minute reading session. | No runaway CPU. The gamepad poll runs on rAF only while the overlay is up; the frozen-frame model means we capture once per trigger, not continuously. |
| E3 | Capture edge cap. | 1280×800 is well under `MAX_CAPTURE_EDGE` (3840), so no downscale on the Deck's own panel. On an external 4K display the long edge caps at 3840. |

---

## Known risks to confirm on hardware

1. **gamescope/Wayland global capture (highest risk).** Electron's `desktopCapturer`
   relies on the display server exposing the screen. On X11 this is fine; under
   gamescope (Game Mode's Wayland compositor) it may return black/empty or require a
   `xdg-desktop-portal` ScreenCast grant. YomiNinja — the closest reference tool —
   explicitly does **not** support Wayland "due to its limitations with global
   shortcuts and window positioning". Confirm whether Yomu hits the same wall in Game
   Mode, and whether Desktop Mode (KDE/X11 via XWayland) is the reliable path.
2. **Global shortcut registration in Game Mode.** `globalShortcut.register` may not
   receive the chord under gamescope; the Steam-Input→button mapping (section B) is
   the intended workaround. Confirm the shortcut path and, if it fails, that Steam
   Input delivery still reaches the app.
3. **AppImage sandbox.** Electron's `chrome-sandbox` sometimes needs
   `--no-sandbox` on SteamOS. If the AppImage refuses to launch, try launching with
   `--no-sandbox` and note it (the packaging may need `--appimage-extract-and-run`).
4. **Overlay always-on-top vs. Game Mode top layer.** The overlay uses
   `setAlwaysOnTop(true, 'screen-saver')` + `setVisibleOnAllWorkspaces`. Confirm it
   actually paints above the game in Game Mode (gamescope owns the top layer).

Record results (SteamOS version, session type, pass/fail per row) alongside this file.
