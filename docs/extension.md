# Browser Extension Packages

よむ can now be packaged as Chrome, Firefox, and Safari extension projects from the same userscript bundle. The userscript remains the public install path until store review is complete, but the extension artifacts are ready for local testing and submission prep.

## Build Locally

Build よむ and generate extension packages:

```bash
cd yomu-reader
npm ci
npm run build:extension
```

`npm run build:extension` runs the normal userscript/new-tab build first, then runs `scripts/build-extension.mjs`.
The script uses `UserScript-Compiler` to generate the extension projects. If the compiler is not already available,
clone it beside this repo or point `USERSCRIPT_COMPILER_CLI` at another checkout:

```bash
cd ..
gh repo clone HRussellZFAC023/UserScript-Compiler
```

The output is written to:

```text
dist/extension/
```

Important folders:

- `packages/extension/chrome`
- `packages/extension/firefox`
- `packages/extension/safari`
- `packages/standalone`
- `packages/userscript`
- `release/chrome/yomu-reader-chrome.zip`
- `release/firefox/yomu-reader-firefox.xpi`
- `release/safari/README.md`
- `review`
- `audit`

## Load Unpacked

Chrome or Edge:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `dist/extension/packages/extension/chrome`.
5. Open a Japanese page and verify lookup, settings, and the new-tab page.

Firefox desktop:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click Load Temporary Add-on.
3. Select `dist/extension/packages/extension/firefox/manifest.json`.
4. Open a Japanese page and verify lookup, settings, and the new-tab page.

Safari:

1. Use Apple's Safari Web Extension tooling to package `dist/extension/packages/extension/safari`.
2. Test on macOS Safari and iOS/iPadOS Safari before submission.
3. Pay special attention to website access prompts, file URLs, downloads, local network endpoints, and background behavior.

## Review Notes

The compiler generates review drafts in `dist/extension/review/`:

- `chrome-web-store.md`
- `mozilla-amo.md`
- `safari-app-store.md`
- `firefox-android.md`
- `package-validation.md`
- `release-artifacts.md`
- `troubleshooting.md`

It also writes machine-readable audit evidence in `dist/extension/audit/`, including `compiler-audit.json` and `package-validation.json`.
Read the review drafts before pasting them into a store dashboard. They are generated from the userscript metadata and build output, but still need a human check for truthfulness.

Current expected review friction:

- よむ runs on all websites so it can read Japanese wherever the user studies.
- よむ uses broad network access because users can enable JPDB, Immersion Kit, Nadeshiko, dictionaries, audio sources, OCR, AnkiConnect, local OCR, and local audio endpoints.
- Mozilla lint warns about dynamic HTML and dynamic code patterns in the bundled app. The review notes should explain the sanitization paths and why dynamic parsing exists.
- Chrome and Firefox may require extra reviewer notes for file URL access and local endpoints.
- Safari packaging still needs Apple's local tooling and device testing before submission.

## Store Screenshots

Store-page screenshots must come from the running product, captured with Playwright. Do not use generated images, design mockups, local fixtures, or fake data. Use real public pages and real feature states: YouTube screenshots on YouTube, subtitle screenshots on a real Comprehensible Japanese video while it is playing, OCR screenshots on a real manga panel, and translation/example screenshots only after the content has actually loaded.

Use the [Screenshot Capture Guide](/screenshot-capture) as the source of truth before replacing or adding files in `docs/public/screenshots/`. Start with `1280x800` Playwright captures for Chrome and Firefox review assets, then check the target store dashboard before uploading final Safari, iPhone, or iPad screenshots.

## Automation

GitHub Actions includes `Build Extension Packages`. It checks out `UserScript-Compiler`, builds よむ, compiles the extension packages, verifies the generated project, and uploads `dist/extension` as a workflow artifact.

Run it manually from the Actions tab when you want a fresh bundle for review testing.
