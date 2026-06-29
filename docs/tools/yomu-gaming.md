---
title: Yomu Gaming
description: Use Yomu on PC games with the first-party Yomu Gaming desktop app. Capture Japanese game text, read it in place, and open lookup in Yomu.
head:
  - - meta
    - name: keywords
      content: Yomu Gaming, Japanese games OCR, PC game Japanese reader, visual novel OCR, game text lookup
---

# Yomu Gaming

Use the first-party **Yomu Gaming** app for PC games. Press the capture shortcut to read the screen immediately with Yomu's default Google Lens-style OCR, or capture a smaller area when a game has lots of text on screen.

## Availability

Download the Yomu-owned file for your platform from [GitHub Releases](https://github.com/HRussellZFAC023/yomu-reader/releases/latest):

- Linux / Steam Deck desktop mode: `yomu-gaming-<version>-linux-x86_64.AppImage`
- Windows: `yomu-gaming-<version>-win-x64.exe`
- macOS Apple silicon: `yomu-gaming-<version>-mac-arm64.zip`
- macOS Intel: `yomu-gaming-<version>-mac-x64.zip`

Steam Deck note: the AppImage is the realistic free install path for Desktop Mode. Native Game Mode overlay behavior depends on SteamOS compositor permissions, so validate on hardware before promising a click-through Game Mode overlay.

## Setup

1. Install the Yomu Gaming package for your platform.
2. Open Yomu Gaming and finish the short first-run setup.
3. Set the capture shortcut. Use it like Print Screen for instant full-screen reading, or choose Capture area for noisy scenes.

Yomu Gaming starts with the same image-reading defaults as browser Yomu. Advanced local OCR is optional in **Image text (OCR)** when you want an offline endpoint. If you do not see a Yomu Gaming file for your platform on the latest release yet, use the repository's **Release Yomu Gaming** workflow artifact or wait for the next tagged release.

## Release artifacts

The release workflow builds and smokes the Yomu Gaming app on Linux, Windows, and macOS, then uploads platform artifacts plus `SHA256SUMS.txt`. Signing and notarization are still separate release steps.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest">Check Yomu releases</a>
  <a class="yomu-cta-button" href="/tools/japanese-ocr">OCR setup</a>
  <a class="yomu-cta-button" href="/getting-started">Install Yomu</a>
</div>
