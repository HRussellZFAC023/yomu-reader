// M-02: a recorded Wikipedia page, the built userscript graph and built Study
// quick row. JPDB is mocked and quick-row classes are projected onto the replay; no live
// account or network is used. This is DOM/CSS evidence, not visual acceptance.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openRecordedPage, worktreeProduct } from './recorded-page.mjs';
import { assert, mockJpdbParseFromVocabulary, YOMU_SETTINGS_KEY } from './smoke-harness.mjs';

const INSIGHT = '.jpdb-reader-word[data-mining-insight="i-plus-one"]';
const VOCABULARY = [
    ['同士', '同士', 'どうし', 'fellow', ['n'], 100, ['known'], ['HLL']],
    ['間', '間', 'あいだ', 'between', ['n'], 100, ['known'], ['LHH']],
    ['使用', '使用', 'しよう', 'use', ['n'], 100, ['new'], ['LHH']],
];

export async function checkIPlusOneUnderline(browser, root, cssPath, scriptPath) {
    const contextOptions = { viewport: { width: 820, height: 1180 }, hasTouch: true, serviceWorkers: 'block' };
    const product = { ...worktreeProduct(root), cssPath, scriptPath };
    const settings = {
        onboardingSeen: true, learningTargetChosen: true,
        interfaceLanguage: browser.browserType().name() === 'webkit' ? 'ja' : 'en',
        apiKey: 'mock-jpdb-token', parserProvider: 'jpdb', furiganaMode: 'all',
        wordUnderlineColorSource: 'status', wordHighlightColorSource: 'off',
        audioEnabled: false, autoPlayAudio: false, ankiEnabled: false,
        immersionKitEnabled: false, ocrEnabled: false, showFloatingButton: false,
    };
    const run = await openRecordedPage({
        browser, slug: 'ja-wikipedia-nihongo', product, settings, contextOptions,
        gmNetwork: 'offline', waitUntil: 'domcontentloaded',
        onGmRequest(request) {
            const url = new URL(request.url);
            if (url.origin !== 'https://jpdb.io' || url.pathname !== '/api/v1/parse') {
                return { status: 200, contentType: 'application/json', body: '{}' };
            }
            const body = JSON.parse(request.bodyText);
            const texts = Array.isArray(body.text) ? body.text : [body.text];
            // Three non-particle cards in one native text run of the recorded
            // lead paragraph. Other page text is left unannotated by this mock.
            const parsed = mockJpdbParseFromVocabulary({ ...body, text: texts.map(text =>
                text.includes('同士の間で使用されている') ? text : '') }, VOCABULARY);
            return { status: 200, contentType: 'application/json', body: JSON.stringify(parsed) };
        },
    });
    const studyContext = await browser.newContext(contextOptions);
    try {
        const page = run.page;
        await page.locator('#mwJw').scrollIntoViewIfNeeded();
        await page.keyboard.press('Shift+J');
        await page.waitForSelector(INSIGHT, { state: 'attached', timeout: 30_000 });
        await page.mouse.move(0, 0);
        const initial = await page.evaluate(measureWash);
        assert(initial.insights === 1 && initial.images[0]?.includes('linear-gradient'), 'Status must keep the single i+1 wash', initial);
        const statusCoverage = await coverageToast(page);

        const study = await studyContext.newPage();
        await study.addInitScript(({ key, settings }) => localStorage.setItem(key, JSON.stringify(settings)), { key: YOMU_SETTINGS_KEY, settings });
        await study.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== 'https://yomureader.com' || !url.pathname.startsWith('/study/')) return route.abort();
            const relative = url.pathname.slice('/study/'.length) || 'index.html';
            const file = path.resolve(root, 'dist/newtab', relative);
            if (!file.startsWith(`${path.resolve(root, 'dist/newtab')}/`)) return route.abort();
            const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] ?? 'application/octet-stream';
            try { return route.fulfill({ contentType, body: readFileSync(file) }); }
            catch { return route.fulfill({ status: 404, body: '' }); }
        });
        await study.goto('https://yomureader.com/study/#settings=appearance', { waitUntil: 'domcontentloaded' });
        await study.waitForSelector('[data-underline-quick]');
        assert(!(await study.locator('.jpdb-reader-settings').innerText()).includes('未翻訳'), 'Appearance contains untranslated copy');
        // The owned Study surface previews the recorded word itself. Capture
        // its first frame after a real quick-row tap. External pages do not host
        // settings controls; project the resulting channel classes back onto
        // the recording to exercise the identical built CSS there as well.
        const wordHtml = await page.locator(INSIGHT).evaluate(word => word.outerHTML);
        await study.evaluate(({ wordHtml, measure }) => {
            const sample = document.createElement('div');
            sample.style.cssText = 'position:fixed;top:-9999px;pointer-events:none';
            sample.innerHTML = wordHtml;
            document.body.append(sample);
            window.__yomuMeasureWash = (0, eval)(`(${measure})`);
            document.addEventListener('change', event => {
                if (!event.target.matches('[data-underline-quick] input')) return;
                const choice = event.target.value;
                requestAnimationFrame(() => {
                    window.__yomuWashFrame = { choice, ...window.__yomuMeasureWash() };
                });
            }, true);
        }, { wordHtml, measure: measureWash.toString() });
        const choices = {};
        for (const choice of ['off', 'status', 'pitch', 'status']) {
            await study.bringToFront();
            await study.locator(`[data-underline-quick] input[value="${choice}"]`).tap();
            const preview = await (await study.waitForFunction(choice => window.__yomuWashFrame?.choice === choice && window.__yomuWashFrame, choice)).jsonValue();
            assert(preview.insights === 1 && (choice === 'status'
                ? preview.images[0]?.includes('linear-gradient')
                : preview.images.every(image => image === 'none')),
            'The built quick row did not update the recorded word in one frame', preview);
            const frame = await projectChannel(page, choice);
            assert(frame.insights === 1, 'Changing underline removed the mining insight', { choice, frame });
            if (choice === 'status') assert(frame.images[0]?.includes('linear-gradient'), 'Status did not restore the i+1 wash', frame);
            else assert(frame.images.every(image => image === 'none') && frame.paintedWords === 0,
                `${choice} left a page-word background in the first frame`, frame);
            choices[choice] = { ...frame, quickRowFrame: preview };
            if (choice === 'off') {
                const offCoverage = await coverageToast(page);
                assert(offCoverage === statusCoverage && /1 i\+1|i\+1 1/.test(offCoverage), 'Underline Off changed the coverage toast', { statusCoverage, offCoverage });
                choices.offCoverage = offCoverage;
            }
        }
        for (const choice of ['jpdb', 'review']) {
            const frame = await projectChannel(page, choice);
            assert(frame.images[0]?.includes('linear-gradient'), `${choice} must keep the status wash`, frame);
            choices[choice] = frame;
        }
        return {
            page: run.recording.slug, viewport: contextOptions.viewport, touch: true,
            settingsInteraction: 'Built Study quick row; channel classes projected onto the recorded page',
            statusCoverage, choices,
        };
    } finally {
        await studyContext.close();
        await run.close();
    }
}

async function projectChannel(page, choice) {
    await page.bringToFront();
    await page.evaluate(`window.__yomuMeasureWash = ${measureWash.toString()}`);
    return page.evaluate(choice => new Promise(resolve => {
        const root = document.documentElement;
        root.classList.remove(...[...root.classList].filter(name => name.startsWith('jpdb-reader-word-underline-')));
        root.classList.add(`jpdb-reader-word-underline-${choice}`);
        requestAnimationFrame(() => resolve(window.__yomuMeasureWash()));
    }), choice);
}

function measureWash() {
    const insights = [...document.querySelectorAll('.jpdb-reader-word[data-mining-insight="i-plus-one"]')];
    const words = [...document.querySelectorAll('.jpdb-reader-word')];
    return {
        insights: insights.length,
        images: insights.map(word => getComputedStyle(word).backgroundImage),
        paintedWords: words.filter(word => {
            const css = getComputedStyle(word);
            return css.backgroundImage !== 'none' || !['rgba(0, 0, 0, 0)', 'transparent'].includes(css.backgroundColor);
        }).length,
    };
}

async function coverageToast(page) {
    await page.locator('.jpdb-reader-toast').evaluateAll(toasts => toasts.forEach(toast => toast.remove()));
    await page.keyboard.press('Shift+J');
    const toast = page.locator('.jpdb-reader-toast').filter({ hasText: /i\+1/ }).last();
    await toast.waitFor({ state: 'visible', timeout: 15_000 });
    return toast.innerText();
}
