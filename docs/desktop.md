---
title: よむ Desktop
description: Read the Japanese in games and apps on Windows, macOS and Linux. Press one shortcut, then hover a word. Free.
---

# よむ Desktop

Read the Japanese in games and apps. Press one shortcut, then hover a word. Free.

<div class="yomu-desktop-download">
  <a class="yomu-desktop-button" data-yomu-desktop-file="mac-arm64" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-mac-arm64.zip">Download よむ Desktop</a>
  <a class="yomu-desktop-button" data-yomu-desktop-file="mac-x64" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-mac-x64.zip">Download よむ Desktop</a>
  <a class="yomu-desktop-button" data-yomu-desktop-file="win-x64" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-win-x64.exe">Download よむ Desktop</a>
  <a class="yomu-desktop-button" data-yomu-desktop-file="linux-x86_64" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-linux-x86_64.AppImage">Download よむ Desktop</a>
  <p class="yomu-desktop-hint" data-yomu-desktop-hint="mac">For Mac. First launch: System Settings → Privacy &amp; Security → Open Anyway.</p>
  <p class="yomu-desktop-hint" data-yomu-desktop-hint="win">For Windows. If Windows protects your PC: More info → Run anyway.</p>
  <p class="yomu-desktop-hint" data-yomu-desktop-hint="linux">For Linux and Steam Deck. Make the file executable, then open it.</p>
  <a class="yomu-desktop-other" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-mac-arm64.zip">Mac (Apple silicon)</a>
  <a class="yomu-desktop-other" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-mac-x64.zip">Mac (Intel)</a>
  <a class="yomu-desktop-other" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-win-x64.exe">Windows</a>
  <a class="yomu-desktop-other" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/yomu-desktop-linux-x86_64.AppImage">Linux</a>
  <a class="yomu-desktop-other" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest">All downloads</a>
</div>

## Use it

1. Open よむ Desktop. It waits in the tray, or the menu bar on a Mac.
2. With Japanese on screen, press Ctrl+Shift+Y (Cmd+Shift+Y on a Mac).
3. Hover a word.

Press the shortcut again when the text changes. Settings are in the tray menu.

## Look up selected text

In Settings → Shortcuts, enable Selected-text shortcut and choose keys that are free in your other apps. The shortcut starts disabled, so an upgrade keeps your existing app shortcuts. Then select Japanese text in Word, a PDF with a text layer, or another app and press your chosen keys. The exact selection opens in a compact lookup window with the usual readings, definitions, and deck actions. This works with Image OCR turned off.

Change or disable the selected-text shortcut in Settings → Shortcuts. The screen-reading shortcut stays separate. The tray also offers **Look up selected text (in 3 seconds)**: choose it, then return to your source app and select text within 3 seconds.

Direct selection works in compatible apps on Windows, macOS, and Linux X11. The source app must expose its selected text. On macOS, allow Accessibility and System Events automation for よむ Desktop when asked. Screen Recording permission is only needed for screen OCR.

If selection access is unavailable, copy the text yourself and use **Paste text** in the lookup window. Wayland uses this fallback too. よむ does not press Copy, change your clipboard, or watch it in the background. Selections are limited to 20,000 characters and are discarded when the lookup window closes.

## First launch

- **Mac:** move the app to Applications and open it. If macOS blocks it, go to System Settings → Privacy & Security → Open Anyway. Allow Screen Recording when asked, then reopen the app.
- **Windows:** if you see "Windows protected your PC", choose More info → Run anyway. There is nothing to install.
- **Linux:** make the file executable (Properties → Permissions), then open it. On Steam Deck, switch to Desktop Mode first.

Mac says the app is damaged? Run this in Terminal: `xattr -dr com.apple.quarantine "/Applications/よむ Desktop.app"`

## Good to know

- Screen reading uses Google Lens and needs a connection. Settings can switch to your own Cloud Vision key or a local OCR server. Selected-text lookup skips OCR; dictionary services follow your saved settings.
- Settings don't sync with the browser. Move them with Export and Import under Backup & sync.
