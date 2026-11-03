#!/usr/bin/env node
// The GM fixture lives in Chromium's isolated content world. Study is the
// production page bundle in the main world, with no GM APIs or shared JS bus.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { assert, launchSmokeBrowser } from './lib/smoke-harness.mjs';
import { fulfillHostedStudyAsset, HOSTED_STUDY_URL } from './lib/hosted-study-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const settingsKey = 'jpdb-popup-reader-settings';
const settings = {
    interfaceLanguage: 'en', theme: 'light', audioEnabled: false,
    ankiEnabled: false, ankiSectionEnabled: false, newTabAnkiEnabled: false,
    localDictionariesEnabled: false, jpdbDefinitionsEnabled: false,
    studyTranslationEnabled: false, studyGrammarEnabled: false,
};
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/*', route => {
        if (!route.request().url().startsWith('https://yomureader.com/')) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
        if (route.request().url() === HOSTED_STUDY_URL) {
            const html = readFileSync(path.join(root, 'dist/newtab/index.html'), 'utf8')
                .replace(/<script\b[^>]*src="[^"]*app\.js[^"]*"[^>]*><\/script>/gu, '');
            return route.fulfill({ contentType: 'text/html', body: html });
        }
        return fulfillHostedStudyAsset(route);
    });
    await page.goto(HOSTED_STUDY_URL);
    const session = await page.context().newCDPSession(page);
    const { frameTree } = await session.send('Page.getFrameTree');
    const { executionContextId } = await session.send('Page.createIsolatedWorld', {
        frameId: frameTree.frame.id, worldName: 'yomu-installed-reader', grantUniveralAccess: true,
    });
    const installed = async expression => {
        const result = await session.send('Runtime.evaluate', {
            contextId: executionContextId, expression, awaitPromise: true, returnByValue: true,
        });
        assert(!result.exceptionDetails, 'Installed-world execution failed', result.exceptionDetails);
        return result.result.value;
    };
    await installed(`(() => {
        const values = new Map([[${JSON.stringify(settingsKey)}, ${JSON.stringify(settings)}]]);
        const listeners = new Map();
        let next = 1;
        globalThis.GM_getValue = (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : fallback;
        globalThis.GM_setValue = async (key, value) => {
            const before = values.get(key);
            values.set(key, structuredClone(value));
            for (const item of listeners.values()) if (item.key === key) item.listener(key, before, value, true);
        };
        globalThis.GM_deleteValue = async key => values.delete(key);
        globalThis.GM_listValues = () => [...values.keys()];
        globalThis.GM_addValueChangeListener = (key, listener) => {
            const id = next++; listeners.set(id, { key, listener }); return id;
        };
        globalThis.GM_removeValueChangeListener = id => listeners.delete(id);
    })()`);
    await installed(readFileSync(path.join(root, 'dist/greasyfork/yomu-runtime.user.js'), 'utf8'));
    await installed(readFileSync(path.join(root, 'dist/yomu.user.js'), 'utf8'));
    await page.addScriptTag({ path: path.join(root, 'dist/newtab/app.js') });
    await page.waitForSelector('.jpdb-reader-newtab-shell', { timeout: 20_000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('jpdb-reader-theme-light'));
    assert(await page.evaluate(() => typeof window.GM_getValue === 'undefined'),
        'Study accidentally has access to the content-world GM fixture');
    await page.evaluate(() => {
        window.__yomuLiveSettingsHints = [];
        window.addEventListener('yomu-userscript-settings-changed', event => {
            window.__yomuLiveSettingsHints.push(event.detail ?? null);
        });
    });

    // Another website's extension/userscript settings save changes the durable
    // GM record. No storage event or private JS bus is shared with Study.
    await installed(`GM_setValue(${JSON.stringify(settingsKey)}, {
        ...GM_getValue(${JSON.stringify(settingsKey)}, {}), theme: 'dark',
    })`);
    await page.waitForFunction(() => document.documentElement.classList.contains('jpdb-reader-theme-dark'),
        undefined, { timeout: 5_000 });
    const hints = await page.evaluate(() => window.__yomuLiveSettingsHints);
    assert(hints.length > 0 && hints.every(value => value === null),
        'Settings invalidation must carry no values or storage keys', { hints });
    const durable = await installed(`GM_getValue(${JSON.stringify(settingsKey)}, null)`);
    assert(durable.theme === 'dark', 'Live adoption changed the durable settings authority', durable);
    console.log(JSON.stringify({ ok: true, isolatedWorlds: true, noPageGmApi: true,
        remoteThemeApplied: true, noPayloadHints: hints.length }, null, 2));
} finally {
    await browser.close();
}
