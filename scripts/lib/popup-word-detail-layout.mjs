// Behavioral fixture: run the built userscript and its real lookup path at an
// exact viewport width. Recorded Wikipedia can retain a desktop visual viewport
// on phones, so it cannot by itself catch a 390px popup's container breakpoints.
import { readFileSync } from 'node:fs';
import { gmStorageBridgeInitProgram, YOMU_SETTINGS_KEY } from './smoke-harness.mjs';
import { addUserscriptGraphInitScripts } from './smoke-test-helpers.mjs';
import { hostedFile, hostedAnswer } from './recorded-products.mjs';

export async function popupWordDetailLayout({ browser, product, engine, width, language, answerJiten }) {
    let ready = false;
    const context = await browser.newContext({
        viewport: { width, height: 844 }, hasTouch: width === 390, isMobile: width === 390,
    });
    const requests = [];
    await context.route('https://yomureader.com/**', route => {
        const file = hostedFile(product, route.request().url());
        return file ? route.fulfill(hostedAnswer(file)) : route.abort();
    });
    await context.exposeFunction('__popupLayoutRequest', async request => {
        requests.push(request.url);
        const response = await answerJiten({ ...request, bodyText: request.data }, () => !ready);
        return { status: response?.status ?? 404, responseText: response?.body ?? '', contentType: response?.contentType ?? 'text/plain' };
    });
    await addUserscriptGraphInitScripts(context, product.scriptPath, {
        prefixContent: gmStorageBridgeInitProgram({
            key: YOMU_SETTINGS_KEY, value: { interfaceLanguage: language }, initialize: 'always',
            css: readFileSync(product.cssPath, 'utf8'), requestBridgeName: '__popupLayoutRequest',
        }),
    });
    const page = await context.newPage();
    const result = { engine, press: width === 390 ? 'tap' : 'hover', scenario: `layout-${width}-${language}`, fixture: true, failures: [], samples: [] };
    try {
        await context.route('https://popup-layout.test/**', route => route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Popup layout behavioral fixture</title><body style="font:22px/2 system-ui;margin:24px"><p>先生。</p></body></html>',
        }));
        await page.goto('https://popup-layout.test/');
        const word = page.locator('.jpdb-reader-word[data-expression="先生"]').first();
        await word.waitFor({ timeout: 30_000 });
        if (width === 390) await word.tap();
        else await word.hover();
        const initial = await page.waitForFunction(measureHeader, null, { timeout: 15_000 });
        result.samples.push(await initial.jsonValue());
        ready = true;
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
            const sample = await page.evaluate(measureHeader);
            if (sample) result.samples.push(sample);
            if (sample?.pitch && sample.hasRank) break;
            await page.waitForTimeout(100);
        }
        const first = result.samples[0];
        const last = result.samples.at(-1);
        if (first.pitch) result.failures.push('Pitch arrived before the loading header was measured.');
        if (!last.pitch || !last.hasRank) result.failures.push('Late Jiten detail did not render pitch and #330.');
        if (!requests.some(url => url.endsWith('/vocabulary/1387990/0/info'))) result.failures.push('The popup never requested its Jiten detail.');
        for (const key of ['height', 'pillsTop', 'actionsTop']) {
            const values = result.samples.map(sample => sample[key]);
            if (Math.max(...values) - Math.min(...values) > 1) result.failures.push(`${key} shifted: ${first[key]} → ${last[key]} px`);
        }
        if (result.samples.some(sample => sample.overflow)) result.failures.push('Header overflowed its popup or viewport.');
        if (result.samples.some(sample => /未翻訳|In context|文脈内|Exact pitch unavailable/u.test(sample.text))) result.failures.push('Removed or untranslated copy appeared.');
        result.headerHeights = [...new Set(result.samples.map(sample => sample.height))];
        result.pillOffsets = [...new Set(result.samples.map(sample => sample.pillsTop))];
        result.samples = result.samples.filter((sample, index, all) => !index || JSON.stringify(sample) !== JSON.stringify(all[index - 1]));
    } catch (error) {
        result.failures.push(String(error?.message ?? error).split('\n')[0]);
    } finally {
        result.requests = requests;
        await context.close();
    }
    return result;
}

function measureHeader() {
    const popover = [...document.querySelectorAll('.jpdb-reader-popover')].find(node => node.getBoundingClientRect().width && getComputedStyle(node).visibility !== 'hidden');
    const header = popover?.querySelector('[data-card-popover] .jpdb-reader-header');
    if (!header) return null;
    const box = header.getBoundingClientRect();
    const pills = header.querySelector('.jpdb-reader-word-pills');
    const actions = header.querySelector('.jpdb-reader-word-actions');
    return {
        height: Math.round(box.height),
        pillsTop: Math.round(pills.getBoundingClientRect().top - box.top),
        actionsTop: Math.round(actions.getBoundingClientRect().top - box.top),
        pitch: Boolean(header.querySelector('.jpdb-reader-pitch polyline')),
        hasRank: /Jiten\s*#330/u.test(pills.textContent),
        text: header.textContent.replace(/\s+/gu, ' ').trim(),
        overflow: header.scrollWidth > header.clientWidth + 1 || box.left < -1 || box.right > innerWidth + 1,
    };
}
