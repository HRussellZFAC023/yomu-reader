// Best-effort Firefox load probe. Playwright's Firefox (Nightly/juggler) does not
// expose Chromium-style --load-extension; we try installTemporaryAddon via the
// remote agent. If unsupported, the script reports that clearly so the reviewer
// falls back to the documented manual about:debugging flow.
import http from 'node:http';
import { firefox } from 'playwright';

const XPI = process.env.XPI || '/Users/heru/Documents/Projects/yomu/release-worktrees/ext-fix/dist/extension/release/firefox/yomureader.com-firefox.xpi';
const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>probe</title></head>
<body><main><p id="target">日本語を読む練習です。図書館で勉強します。</p></main></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(resolve => server.listen(8987, '127.0.0.1', resolve));

let browser;
try {
    browser = await firefox.launch({
        headless: true,
        firefoxUserPrefs: {
            'xpinstall.signatures.required': false,
            'extensions.autoDisableScopes': 0,
            'extensions.langpacks.signatures.required': false,
        },
    });
    // Playwright's public API has no installTemporaryAddon. Reach the internal
    // Juggler session if present; otherwise report unsupported.
    const canInstall = typeof browser._channel?.installAddon === 'function'
        || typeof browser.installAddon === 'function';
    console.log(JSON.stringify({
        firefoxLaunched: true,
        installAddonApiAvailable: canInstall,
        note: canInstall
            ? 'installAddon API present — attempt full boot'
            : 'Playwright Firefox has no public installTemporaryAddon; use manual about:debugging flow.',
    }, null, 2));
} catch (error) {
    console.log(JSON.stringify({ firefoxLaunched: false, error: String(error).slice(0, 200) }, null, 2));
} finally {
    await browser?.close();
    server.close();
}
