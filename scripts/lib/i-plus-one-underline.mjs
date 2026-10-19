// M-02: a recorded Wikipedia page, the built userscript graph and built Study
// quick row. JPDB and the GM settings transport are mocked; no live account or
// network is used. This is DOM/CSS evidence, not visual acceptance.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openRecordedPage, worktreeProduct } from './recorded-page.mjs';
import { assert, mockJpdbParseFromVocabulary, YOMU_SETTINGS_KEY } from './smoke-harness.mjs';

const INSIGHT = '.jpdb-reader-word[data-mining-insight="i-plus-one"]';
const UNKNOWN = '国外移民'; // Occurs once in the recorded article.


export async function checkIPlusOneUnderline(browser, root, cssPath, scriptPath) {
    const cards = new Map();
    const contextOptions = { viewport: { width: 820, height: 1180 }, hasTouch: true, serviceWorkers: 'block' };
    const product = { ...worktreeProduct(root), cssPath, scriptPath };
    const settings = {
        onboardingSeen: true, learningTargetChosen: true,
        interfaceLanguage: browser.browserType().name() === 'webkit' ? 'ja' : 'en',
        apiKey: 'mock-jpdb-token', parserProvider: 'jpdb', furiganaMode: 'known-status',
        wordUnderlineColorSource: 'status', wordHighlightColorSource: 'off',
        audioEnabled: false, autoPlayAudio: false, ankiEnabled: false,
        immersionKitEnabled: false, ocrEnabled: false, showFloatingButton: true,
        manualScanEnabled: true,
        lookupOnHover: false,
        localDictionariesEnabled: false, jpdbDefinitionsEnabled: false,
    };
    const run = await openRecordedPage({
        browser, slug: 'ja-wikipedia-nihongo', product, settings, contextOptions,
        gmNetwork: 'offline', navigate: false,
        gmInitProgram: `(${installGmValueChanges.toString()})();`,
        onGmRequest(request) {
            const url = new URL(request.url);
            if (url.origin !== 'https://jpdb.io' || url.pathname !== '/api/v1/parse') {
                return { status: 200, contentType: 'application/json', body: '{}' };
            }
            const body = JSON.parse(request.bodyText);
            const texts = Array.isArray(body.text) ? body.text : [body.text];
            const parsed = mockRecordedParse(texts, cards);
            return { status: 200, contentType: 'application/json', body: JSON.stringify(parsed) };
        },
    });
    let studyContext;
    try {
        const page = run.page;
        await page.goto(run.recording.manifest.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        studyContext = await browser.newContext(contextOptions);
        await page.locator('#mwJw').scrollIntoViewIfNeeded();
        await page.waitForSelector('.jpdb-reader-fab', { state: 'attached', timeout: 30_000 });
        await pressScanShortcut(page);
        await page.waitForSelector(INSIGHT, { state: 'attached', timeout: 30_000 });
        await page.mouse.move(0, 0);
        const initial = await page.evaluate(measureWash);
        assert(initial.insights === 1 && initial.images[0]?.includes('linear-gradient'), 'Status must keep the single i+1 wash', initial);
        await page.locator(INSIGHT).hover();
        const hovered = await page.evaluate(measureWash);
        assert(hovered.images[0] !== initial.images[0], 'Status wash overrides the existing hover tint', hovered);
        await page.mouse.move(0, 0);
        let coverageError;
        const statusCoverage = await coverageToast(page).catch(error => {
            coverageError = `${error.message}\n${JSON.stringify(run.pageErrors)}`;
            return null;
        });

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
        // settings controls; deliver the saved choice through the built
        // settings Module and mocked GM notifications on the recording.
        const wordHtml = await page.locator(INSIGHT).evaluate(word => word.outerHTML);
        await study.evaluate(`window.__yomuMeasureWash = ${measureWash.toString()}`);
        await study.evaluate(wordHtml => {
            const sample = document.createElement('div');
            sample.style.cssText = 'position:fixed;top:-9999px;pointer-events:none';
            sample.innerHTML = wordHtml;
            document.body.append(sample);
            document.addEventListener('change', event => {
                if (!event.target.matches('[data-underline-quick] input')) return;
                const choice = event.target.value;
                requestAnimationFrame(() => {
                    window.__yomuWashFrame = { choice, ...window.__yomuMeasureWash() };
                });
            }, true);
        }, wordHtml);
        const choices = {};
        for (const choice of ['off', 'status', 'pitch', 'status']) {
            await study.bringToFront();
            await study.locator(`[data-underline-quick] input[value="${choice}"]`).tap();
            const preview = await (await study.waitForFunction(choice => window.__yomuWashFrame?.choice === choice && window.__yomuWashFrame, choice)).jsonValue();
            assert(preview.insights === 1 && (choice === 'status'
                ? preview.images[0]?.includes('linear-gradient')
                : preview.images.every(image => image === 'none')),
            'The built quick row did not update the recorded word in one frame', preview);
            await study.locator('.jpdb-reader-settings button[type="submit"]').click();
            const saved = await (await study.waitForFunction(({ key, choice }) => {
                const settings = JSON.parse(localStorage.getItem(key) || '{}');
                return settings.wordUnderlineColorSource === choice && settings.subtitleUnderlineColorSource === choice
                    ? { wordUnderlineColorSource: choice, subtitleUnderlineColorSource: choice } : null;
            }, { key: YOMU_SETTINGS_KEY, choice })).jsonValue();
            const frame = await deliverChannel(page, saved);
            assert(frame.insights === 1, 'Changing underline removed the mining insight', { choice, frame });
            if (choice === 'status') assert(frame.images[0]?.includes('linear-gradient'), 'Status did not restore the i+1 wash', frame);
            else assert(frame.images.every(image => image === 'none') && frame.paintedWords === 0,
                `${choice} left a page-word background in the first frame`, frame);
            choices[choice] = { ...frame, quickRowFrame: preview };
            if (choice === 'off' && statusCoverage !== null) {
                try {
                    const offCoverage = await coverageToast(page);
                    assert(offCoverage === statusCoverage && /1 i\+1|i\+1 1/.test(offCoverage), 'Underline Off changed the coverage toast', { statusCoverage, offCoverage });
                    choices.offCoverage = offCoverage;
                } catch (error) { coverageError = `${error.message}\n${JSON.stringify(run.pageErrors)}`; }
            }
        }
        return {
            page: run.recording.slug, viewport: contextOptions.viewport, touch: true,
            settingsInteraction: 'Built Study quick row and Save; built settings Module with mocked GM notifications on the recorded page',
            statusCoverage, choices, coverageError,
        };
    } finally {
        await studyContext?.close();
        await run.close();
    }
}

function mockRecordedParse(texts, cards) {
    const vocabulary = [];
    const indices = new Map();
    const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
    const tokens = texts.map(text => {
        let covered = 0;
        return [...segmenter.segment(text)].filter(part => part.isWordLike && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part.segment)).flatMap(({ segment, index }) => {
            if (index < covered) return [];
            if (text.startsWith(UNKNOWN, index)) {
                segment = UNKNOWN;
                covered = index + UNKNOWN.length;
            }
            // Fill every Japanese span so the parser does not fall back to
            // unknown local tokens in the gaps. One word is new; stable mock
            // identities keep every card's state consistent across requests.
            const state = segment === UNKNOWN ? 'new' : 'known';
            const key = segment;
            const row = [segment, segment, state === 'new' ? 'こくがいいみん' : segment, 'mocked word', ['n'], 100, [state], []];
            if (!cards.has(key)) cards.set(key, 1000 + cards.size);
            const parsed = mockJpdbParseFromVocabulary({ text: segment }, [row], { vocabularyIdBase: cards.get(key), spellingIdBase: 10_000 + cards.get(key) });
            if (!indices.has(key)) {
                indices.set(key, vocabulary.length);
                vocabulary.push(parsed.vocabulary[0]);
            }
            const token = parsed.tokens[0][0];
            return [[indices.get(key), index, token[2], token[3]]];
        });
    });
    return { vocabulary, tokens };
}

function installGmValueChanges() {
    let sequence = 0;
    const listeners = new Map();
    const set = window.GM_setValue;
    window.GM_addValueChangeListener = (key, listener) => {
        listeners.set(++sequence, { key, listener });
        return sequence;
    };
    window.GM_removeValueChangeListener = id => listeners.delete(id);
    window.GM_setValue = (key, value) => {
        const previous = window.GM_getValue(key);
        const result = set(key, value);
        if (JSON.stringify(previous) === JSON.stringify(value)) return result;
        for (const entry of listeners.values()) {
            if (entry.key === key) queueMicrotask(() => entry.listener(key, previous, value, false));
        }
        return result;
    };
    window.GM.setValue = window.GM_setValue;
}

async function deliverChannel(page, saved) {
    await page.bringToFront();
    await page.evaluate(`window.__yomuMeasureWash = ${measureWash.toString()}`);
    await page.evaluate(async saved => {
        const api = globalThis[Symbol.for('yomu.aggregate-runtime-modules.v1')].settings;
        await api.saveSettings({ ...await api.loadSettings(), ...saved }, { explicitUserChoiceKeys: Object.keys(saved) });
    }, saved);
    await page.waitForFunction(choice => {
        const channel = choice === 'status' ? 'jpdb' : choice;
        return document.documentElement.classList.contains(`jpdb-reader-word-underline-${channel}`);
    }, saved.wordUnderlineColorSource);
    return page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => resolve(window.__yomuMeasureWash()));
    }));
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
    await page.bringToFront();
    const safeCorner = await page.evaluate(() => {
        const target = document.elementFromPoint(1, 1);
        return target && !target.closest('a, button, input, select, textarea, label, summary, [role="button"], [data-jpdb-reader-root], .jpdb-reader-word');
    });
    if (safeCorner) await page.mouse.click(1, 1);
    await page.locator('.jpdb-reader-toast').evaluateAll(toasts => toasts.forEach(toast => toast.remove()));
    // A fully annotated page has no work for a manual scan and reports that
    // instead of coverage. Restore one known word's native text, as a host
    // re-render does, so this exercises the real non-silent scan/toast path.
    await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const word = [...document.querySelectorAll('.jpdb-reader-word.jpdb-known')]
            .find(word => {
                const rect = word.getBoundingClientRect();
                return !word.closest('[data-jpdb-reader-root], .jpdb-reader-text-mirror, #mwJw')
                    && rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
            });
        if (!word) throw new Error('No known native word to rescan');
        const base = word.cloneNode(true);
        base.querySelectorAll('rt, rp').forEach(reading => reading.remove());
        word.replaceWith(document.createTextNode(word.dataset.expression || base.textContent));
    });
    await pressScanShortcut(page);
    const toast = page.locator('.jpdb-reader-toast').filter({ hasText: /i\+1/ }).last();
    await toast.waitFor({ state: 'visible', timeout: 30_000 }).catch(async error => {
        throw new Error(`${error.message}\n${JSON.stringify(await page.evaluate(() => ({ active: document.activeElement?.tagName, toasts: [...document.querySelectorAll('.jpdb-reader-toast')].map(toast => toast.textContent) })))}`);
    });
    return toast.innerText();
}

async function pressScanShortcut(page) {
    const shortcut = await page.evaluate(async () => {
        const api = globalThis[Symbol.for('yomu.aggregate-runtime-modules.v1')].settings;
        return (await api.loadSettings()).shortcuts.scanPage;
    });
    assert(shortcut, 'No manual scan shortcut is configured');
    await page.keyboard.press(shortcut);
}
