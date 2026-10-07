---
title: Desktop app
description: Read Japanese anywhere on your computer, in games, apps and videos, with the free よむ desktop app for Windows, macOS and Linux.
---

<!--
  The desktop app's name lives on this page only. The site links here as "the
  desktop app", and the route is name-neutral, so a rename is an edit to this
  file plus the release asset names in the download table.
-->

# Desktop app

Read Japanese anywhere on your computer: games, apps, videos and anything else on your screen. Press a shortcut and the Japanese text becomes words you can press, with the same popup as the browser add-on.

The desktop app is free for Windows, macOS and Linux. For now it is called Yomu Gaming.

## Download the app

Go to the [latest release on GitHub](https://github.com/HRussellZFAC023/yomu-reader/releases/latest). Under Assets, download the file for your computer:

| Computer | File to download |
| --- | --- |
| Windows | the file ending in `win-x64.exe` |
| Mac with Apple silicon (M1 or newer) | the file ending in `mac-arm64.zip` |
| Mac with an Intel processor | the file ending in `mac-x64.zip` |
| Linux or Steam Deck | the file ending in `linux-x86_64.AppImage` |

To check which Mac you have, open the Apple menu → About This Mac. The other files on that page are for the browser add-on and for developers.

## Install on Windows

1. Double-click the `.exe` file. The app runs straight away; there is nothing to install.
2. If Windows shows "Windows protected your PC", choose More info, then Run anyway. The app is not code-signed yet, so Windows does not recognise it.

## Install on macOS

1. If your browser has not unpacked the `.zip` file already, double-click it. Then drag the app into your Applications folder.
2. Open the app. macOS says it cannot check the app for malware, because the app is not signed by Apple yet. Choose Done.
3. Open System Settings → Privacy & Security, scroll down and choose Open Anyway next to the app's name. Confirm with your password.
4. The first time you read the screen, macOS asks for Screen Recording permission. Allow it under Privacy & Security → Screen & System Audio Recording, then quit and reopen the app.

If macOS instead says the app "is damaged and can't be opened", open Terminal and run this command, then open the app again:

```sh
xattr -dr com.apple.quarantine "/Applications/Yomu Gaming.app"
```

## Install on Linux

1. Make the file executable: right-click it, open Properties → Permissions and allow it to run as a program. In a terminal, `chmod +x` followed by the file name does the same.
2. Double-click the file to start the app.
3. If nothing happens, your system may be missing FUSE 2, which AppImage files need. On Ubuntu 22.04, run `sudo apt install libfuse2` in a terminal. On Ubuntu 24.04 and newer, run `sudo apt install libfuse2t64` instead.

On Steam Deck, switch to Desktop Mode first.

## Read your screen

Press Ctrl+Shift+Y (Cmd+Shift+Y on a Mac) to read the whole screen, or choose Read part of the screen and drag around a dialogue box or subtitle. You can change the shortcut in the app's Settings.

The app finds the Japanese text in the picture, and every word opens the usual popup. Busy screens are easier when you read only the part with the text.

To find text, the app sends the screenshot to Google Lens by default, so it needs a connection. In Settings you can switch to Google Cloud Vision with your own key, or to an OCR server on your own computer.

## What it does not do yet

The desktop app keeps its own settings and does not sync with the browser add-on yet. There is nothing to buy: the app is free, and so is everything else in よむ.
