import { chromium, firefox, webkit } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { createSmokePaths } from './smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './smoke-test-helpers.mjs';

export function bookwalkerSmokePaths(scriptDir, scenario) {
    const paths = createSmokePaths(scriptDir);
    const artifactDir = path.join(paths.artifacts, scenario);
    mkdirSync(artifactDir, { recursive: true });
    return { ...paths, artifactDir };
}

export async function openBookwalkerSmoke(engineName, options) {
    const engine = { chromium, firefox, webkit }[engineName] ?? chromium;
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ locale: 'ja-JP', bypassCSP: true, ...options });
    return { browser, context, page: await context.newPage() };
}

export async function bootBookwalkerSmoke(page, paths, { ignoreCssFailure = false } = {}) {
    await installUserscriptCssResource(page, paths.cssPath).catch(async () => {
        try {
            await page.addStyleTag({ path: paths.cssPath });
        } catch (error) {
            if (!ignoreCssFailure) throw error;
        }
    });
    for (const name of ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga']) {
        const script = path.join(paths.dist, 'greasyfork', `${name}.user.js`);
        await addScriptTagWithCspFallback(page, script).catch(() => {});
    }
    await addScriptTagWithCspFallback(page, paths.scriptPath);
    await page.waitForTimeout(900);
}

export async function routeBookwalkerFixture(context, images, html) {
    await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
        return fulfillBookwalkerFixture(route, new URL(url), images, html);
    });
}

function fulfillBookwalkerFixture(route, url, images, html) {
    const image = images.get(url.href);
    if (image) return route.fulfill({ status: 200, contentType: 'image/png', body: image });
    if (url.hostname === 'viewer.bookwalker.jp') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.fulfill({ status: 404, body: '' });
}
