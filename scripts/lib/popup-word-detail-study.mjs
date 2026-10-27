// The built Study app's Library detail, using recorded Jiten evidence and a
// held /info response so the loading and completed header can be compared.
import path from 'node:path';
import { addGmStorageBridgeInitScript, serveFile, startLoopbackServer, YOMU_SETTINGS_KEY } from './smoke-harness.mjs';

export async function studyWordDetailLayout({ browser, product, engine, width, height = 844, language, answerJiten, largeText = false }) {
    const server = await startLoopbackServer((request, response) => {
        const name = new URL(request.url, 'http://localhost').pathname.replace(/^\/newtab\//u, '');
        const type = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'styles.css': 'text/css', 'sw.js': 'text/javascript' }[name];
        if (type) return serveFile(response, path.join(product.root, 'dist/newtab', name), type);
        response.writeHead(404);
        response.end();
    });
    const context = await browser.newContext({ viewport: { width, height } });
    const result = { engine, press: 'click', scenario: `study-layout-${width}x${height}-${language}${largeText ? '-large-text' : ''}`, layout: true, failures: [], samples: [] };
    let releaseDetail;
    const detailReady = new Promise(resolve => { releaseDetail = resolve; });
    try {
        const page = await context.newPage();
        await page.exposeFunction('__studyWordDetailRequest', async request => {
            if (new URL(request.url).hostname !== 'api.jiten.moe') return { status: 503, responseText: '' };
            if (new URL(request.url).pathname.endsWith('/info')) await detailReady;
            const answer = await answerJiten({ ...request, bodyText: request.data }, () => false);
            return { status: answer?.status ?? 503, responseText: answer?.body ?? '' };
        });
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: { interfaceLanguage: language, onboardingSeen: true, learningTargetChosen: true },
            requestBridgeName: '__studyWordDetailRequest',
        });
        await page.route('https://**/*', route => route.fulfill({ status: 503, body: '' }));
        await page.goto(`${server.origin}/newtab/index.html`);
        if (largeText) await page.addStyleTag({ content: '.jpdb-reader-newtab-search-detail { font-size: 30px !important; } .jpdb-reader-header .jpdb-reader-spelling { font-size: 52px !important; }' });
        await page.locator('[data-newtab-action="mode"][data-mode="search"]:visible').first().click({ timeout: 30_000 });
        await page.locator('[data-newtab-search-input]').fill('先生');
        await page.locator('[data-newtab-search]').evaluate(form => form.requestSubmit());
        await page.locator('[data-newtab-action="search-result-word"]', { hasText: '先生' }).first().click();
        await page.waitForSelector('.jpdb-reader-newtab-search-detail-header');
        result.samples.push(await page.evaluate(measureStudyHeader));
        if (largeText && result.samples[0].headwordFontSize !== '52px') result.failures.push('The headword did not render at 200% text size.');
        releaseDetail();
        await page.waitForFunction(() => document.querySelector('.jpdb-reader-newtab-search-detail-header .jpdb-reader-pitch polyline'));
        for (let sample = 0; sample < 10; sample++) {
            result.samples.push(await page.evaluate(measureStudyHeader));
            await page.waitForTimeout(100);
        }
        for (const key of ['height', 'actionsTop', 'actionsLeft', 'pillsTop']) {
            const values = result.samples.map(sample => sample[key]);
            if (Math.max(...values) - Math.min(...values) > 1) result.failures.push(`${key} shifted: ${Math.min(...values)} → ${Math.max(...values)} px`);
        }
        if (result.samples.some(sample => sample.overflow)) result.failures.push('Study header overflowed.');
        if (result.samples.some(sample => /未翻訳|In context|文脈内|Exact pitch unavailable/u.test(sample.text))) result.failures.push('Removed or untranslated copy appeared.');
        result.headerHeights = [...new Set(result.samples.map(sample => Math.round(sample.height)))];
        result.pillOffsets = [...new Set(result.samples.map(sample => Math.round(sample.pillsTop)))];
        const oldHeader = await page.locator('.jpdb-reader-newtab-search-detail-header').elementHandle();
        await page.locator('.jpdb-reader-newtab-search-detail-header .jpdb-reader-word[data-expression="先生"]').click();
        // Library word taps search within Library rather than opening a
        // second popup. Require a fresh results render, not just a click.
        await page.waitForFunction(header => !header.isConnected, oldHeader);
        await page.locator('[data-newtab-action="search-result-word"]', { hasText: '先生' }).first().waitFor({ state: 'visible' });
        result.headwordSearchOpened = true;
    } catch (error) {
        result.failures.push(String(error?.message ?? error).split('\n')[0]);
    } finally {
        releaseDetail();
        await context.close();
        await server.close();
    }
    return result;
}

function measureStudyHeader() {
    const header = document.querySelector('.jpdb-reader-newtab-search-detail-header');
    const box = header.getBoundingClientRect();
    const audio = header.querySelector('.jpdb-reader-audio-control').getBoundingClientRect();
    const pills = header.querySelector('.jpdb-reader-word-pills').getBoundingClientRect();
    return {
        height: box.height,
        actionsTop: audio.top - box.top,
        actionsLeft: audio.left - box.left,
        pillsTop: pills.top - box.top,
        pitch: Boolean(header.querySelector('.jpdb-reader-pitch polyline')),
        headwordFontSize: getComputedStyle(header.querySelector('.jpdb-reader-spelling')).fontSize,
        headwordHeight: header.querySelector('.jpdb-reader-spelling').getBoundingClientRect().height,
        headwordLineHeight: getComputedStyle(header.querySelector('.jpdb-reader-spelling')).lineHeight,
        text: header.textContent,
        overflow: header.scrollWidth > header.clientWidth + 1 || box.left < -1 || box.right > innerWidth + 1,
    };
}
