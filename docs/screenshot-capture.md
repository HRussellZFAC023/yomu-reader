# Screenshot Capture Guide

This guide is for documentation and store-page screenshots. Screenshots are evidence of the real product, so they must show real pages, real data, and real feature states.

## Hard Rules

- Capture with Playwright only.
- Use the running userscript or extension package. Do not screenshot design files, generated mockups, local regression fixtures, or hand-built HTML states.
- Do not use generated images, AI images, placeholder manga, fake subtitles, fake JPDB data, fake dictionary entries, or fake Anki cards.
- Do not edit screenshots to add UI, text, panels, examples, subtitles, or manga content that was not visible in the browser.
- Do not capture secrets, API keys, account emails, private deck names, private browser history, or paid/private media you cannot publish.
- Record the source URL, capture date, browser, viewport, build identifier, and enabled settings in the PR or release notes.
- If a real feature cannot be captured safely, leave the old screenshot in place or document the blocker. Do not invent a replacement.

## Playwright Capture Requirements

Use a clean browser profile with only the tested よむ install and the minimum required permissions. Before calling `page.screenshot`, assert that the visible state is real:

- the よむ root or popup is visible,
- the relevant panel is expanded,
- loading spinners are gone,
- generated translations/examples/subtitles/OCR results are visible,
- the source page is the real public page being claimed,
- no API keys or private account details are visible.

## Store Size Targets

Check the store dashboard again before final upload, but use these targets when planning captures:

| Target | Screenshot size to prepare | Notes |
| --- | --- | --- |
| Chrome Web Store | `1280x800` preferred, `640x400` accepted | Chrome asks for 1 to 5 screenshots, square corners, no padding, and full-bleed images. Source: [Chrome Web Store image guide](https://developer.chrome.com/docs/webstore/images). |
| Firefox Add-ons | `1280x800` or another `1.6:1` image | Mozilla recommends `1280x800` because AMO can display screenshots up to that size. Source: [Mozilla Add-ons blog](https://blog.mozilla.org/addons/2018/07/02/larger-image-support/). |
| Safari / Mac App Store | `1280x800`, `1440x900`, `2560x1600`, or `2880x1800` | Apple's Mac screenshots are 16:10. For iPhone or iPad screenshots, use Apple's current device-specific table before capturing. Source: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). |
| Documentation | Prefer `1280x800` for desktop feature shots; use real mobile viewports for mobile-only behavior | Keep docs screenshots readable in the page, but do not crop away the context needed to prove the feature is real. |

For store screenshots, start with a `1280x800` desktop viewport at `deviceScaleFactor: 1`. Capture mobile or iPad screenshots separately only when the target store listing needs those device classes.

## Capture Helper

The repo includes a strict Playwright helper for the real docs and store screenshot set:

```bash
cd /Users/heru/Documents/yomu/yomu-reader
npm run build
node scripts/capture-real-screenshots.mjs --list
node scripts/capture-real-screenshots.mjs --scenario docs-popup-lookup
```

Useful options:

- `--list` prints every supported docs/store scenario, viewport, output file, and default public URL.
- `--scenario <id>` or positional scenario ids capture only the screenshots you are refreshing.
- `--userscript <file>` injects a specific built userscript. The default is `dist/yomu.user.js`.
- `--out-dir <dir>` writes the same basenames somewhere else for review before replacing docs assets.
- `--auto` validates and captures without the operator prompt. Use it only when the page state is already scripted.
- `--headless` runs without a visible browser. This is usually not helpful for real operator capture.

The helper validates that よむ UI and the expected real page state are visible before saving. It refuses common false evidence such as fixture markers, localhost regression pages, generated placeholders, and missing product UI.

## Manual Playwright Recipe

Build the current product first:

```bash
cd /Users/heru/Documents/yomu/yomu-reader
npm ci
npm run build
```

For extension store screenshots, prefer the built extension package over direct script injection:

```bash
npm run build:extension
```

Use the helper above for normal docs and store refreshes. A one-off Playwright script is still fine for an unusual screenshot that the helper does not cover yet.
Keep temporary scripts outside the repo unless the task is to add permanent capture tooling.

```ts
import { chromium } from 'playwright';

const profileDir = '/tmp/yomu-store-screenshot-profile';
const extensionDir = '/Users/heru/Documents/yomu/yomu-reader/dist/extension/packages/extension/chrome';

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
  ],
});

const page = await context.newPage();
await page.goto('https://example.com/real-public-japanese-page', { waitUntil: 'domcontentloaded' });

// Interact like a user here: open settings, click a real word, wait for examples,
// start the video, select a real subtitle track, or trigger OCR on a real image.

const popup = page.locator('.jpdb-reader-popover');
await popup.waitFor({ state: 'visible', timeout: 15000 });
await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'));

await page.screenshot({
  path: '/Users/heru/Documents/yomu/yomu-reader/docs/public/screenshots/real-popup-lookup.png',
  fullPage: false,
  animations: 'disabled',
});

await context.close();
```

If the final target is the userscript rather than the extension package, install the userscript manager and よむ into a clean persistent profile, then reuse that profile for capture. Direct `page.addScriptTag()` injection is acceptable for debugging layout, but not for final store screenshots because it does not prove the installed product path.

Use Playwright screenshots directly, for example:

```ts
await expect(page.locator('.jpdb-reader-popover')).toBeVisible();
await expect(page.getByText('Translation')).toBeVisible();
await page.screenshot({
  path: 'docs/public/screenshots/real-popup-lookup.png',
  fullPage: false,
  animations: 'disabled',
});
```

One-off capture scripts are fine, but do not commit temporary scripts unless the main task asks for tooling. Keep final PNGs under `docs/public/screenshots/`.

## Capture Notes Template

Paste this into the PR or release notes for every refreshed screenshot set:

```md
## Screenshot Capture Notes

- Capture date:
- よむ build or commit:
- Browser and version:
- Install path: userscript manager / Chrome extension / Firefox extension / Safari extension
- Screenshot files:
- Source URLs:
- Viewports:
- Enabled settings:
- Services used: JPDB / local dictionaries / Immersion Kit / Nadeshiko / Anki / OCR / audio
- Privacy check: no API keys, usernames, private decks, private media, or private browser data visible
- Blockers or skipped screenshots:
```

## Required Documentation Shots

Use existing filenames when refreshing current docs screenshots. Add new filenames only when the docs are ready to reference them.

| Screenshot | Required real state |
| --- | --- |
| `real-popup-lookup.png` | Real Japanese webpage, popup open on a real lookup, JPDB or local dictionary content visible, translation section opened after translation loads, grammar section or controls visible, mining controls visible. |
| `real-dictionaries.png` | Settings > Dictionaries with real imported or downloaded dictionaries, source ordering visible, no fake dictionary names. |
| `real-kanji-drilldown.png` | Real lookup word, kanji detail panel open, KanjiVG/stroke or drawing controls visible, facts/components/related words loaded from real sources. |
| `real-ocr-settings.png` | Settings > Images with real OCR provider settings visible. Keep until a real manga OCR action screenshot is captured. |
| `real-ocr-manga.png` | Real manga or image page, OCR enabled, recognized Japanese regions visible over a real panel, popup or tappable OCR state visible. Do not use a fixture manga image. |
| `real-video-player.png` | Real video surface with subtitles active, transcript side panel open, a current active line visible, controls expanded enough to show tracks or transcript tools. |
| `real-youtube-cij.png` | Real YouTube page, ideally a Comprehensible Japanese video or real YouTube results page, YouTube-specific よむ feature visible on YouTube itself. |
| `real-immersion-popover.png` | Real lookup with Immersion Kit or Nadeshiko examples loaded, image/audio/translation state visible according to settings. Translations must be actually returned by the provider. |
| `real-newtab.png` | Hosted new-tab page with a real JPDB, Anki, or imported-dictionary study card. No seeded fixture card. |
| `real-help-settings.png` | Settings > Help with actual links and reset controls visible. Do not change support or donation copy for the screenshot. |

## Store Screenshot Set

A store page should show the product breadth without pretending any state is synthetic. Capture at least these five real states at `1280x800` unless the store dashboard requires a different device size:

1. Popup lookup on a real Japanese article with definitions, translation, grammar, and mining controls visible.
2. YouTube feature on YouTube with the relevant よむ panel or controls visible.
3. Subtitles on a real Comprehensible Japanese video while the video is playing, with the transcript side panel open and an active line visible.
4. OCR on a real manga panel or image page with recognized Japanese text visible and tappable.
5. Settings or dictionary management with real dictionaries/features visible, plus one mobile-sized capture if preparing iOS/Safari material.

Optional extras:

- New-tab study page with a real card.
- Kanji drilldown with stroke order or drawing controls.
- Immersion Kit or Nadeshiko examples with real loaded translations.

## Real Context Checklist

Before capturing, confirm each item:

- [ ] The page is a real public page or legally publishable owned media.
- [ ] The feature is enabled through normal よむ settings.
- [ ] The screenshot shows the feature on the surface where users actually use it.
- [ ] For YouTube, the screenshot is on `youtube.com`.
- [ ] For CIJ subtitles, a real Comprehensible Japanese video is playing.
- [ ] For OCR, the image is a real manga/image panel, not a QA fixture.
- [ ] For translations, the translation has actually been generated or fetched.
- [ ] For dictionaries, imported dictionaries are real Yomitan/JMdict data.
- [ ] For Anki or JPDB, no private keys, usernames, deck names, or account details are visible.
- [ ] The capture notes include URL, date, browser, viewport, build, and relevant settings.
- [ ] The image size matches the target store or docs slot before upload.
- [ ] The screenshot was captured by Playwright from the browser, not exported from a design tool.

## Review Checklist

Before committing screenshots:

- [ ] File names match docs references.
- [ ] Image dimensions are appropriate for docs or the target store.
- [ ] Text is readable at normal store thumbnail size.
- [ ] Panels are expanded enough to show the actual feature, not just a closed settings tab.
- [ ] Browser chrome is included only when it helps prove context, such as YouTube on YouTube.
- [ ] No local fixture URL, localhost regression page, devtools panel, or fake test page is visible.
- [ ] No support/donation copy was changed just to improve the screenshot.
- [ ] Old screenshots are replaced only when the new capture is more truthful and equally or more useful.
