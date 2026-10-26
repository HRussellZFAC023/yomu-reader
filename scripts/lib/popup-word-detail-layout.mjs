// Built-product geometry on recorded Wikipedia. A narrow desktop viewport
// exercises the 390px card without Mobile Safari's desktop-page zoom-out;
// the main smoke separately covers native iPad touch and its visual viewport.
import { openRecordedPage } from './recorded-page.mjs';

export async function popupWordDetailLayout({ browser, product, engine, width, height = 844, language, answerJiten, contextOptions = {}, mode = 'auto', rotate = false, largeText = false }) {
    const touch = contextOptions.hasTouch || width === 390;
    let ready = false;
    const requests = [];
    const run = await openRecordedPage({
        browser, product, engine, slug: 'ja-wikipedia-nihongo',
        settings: { interfaceLanguage: language, popupMode: mode, hoverPopupMode: mode },
        contextOptions: { hasTouch: touch, isMobile: false, ...contextOptions, viewport: { width, height } },
        onGmRequest: request => {
            requests.push(request.url);
            return answerJiten(request, () => !ready);
        },
    });
    const { page } = run;
    const result = { engine, press: touch ? 'tap' : 'hover', scenario: `layout-${width}x${height}-${language}-${mode}${largeText ? '-large-text' : ''}`, layout: true, recording: 'ja-wikipedia-nihongo', failures: [], samples: [] };
    try {
        const word = await visibleSensei(page);
        await page.evaluate(() => document.addEventListener('pointerdown', event => {
            window.__popupLayoutPress = { word: event.target?.closest?.('[data-expression]')?.getAttribute('data-expression'), x: event.clientX, y: event.clientY };
        }, { once: true, capture: true, passive: true }));
        if (largeText) await page.addStyleTag({ content: '.jpdb-reader-popover { font-size: 30px !important; } .jpdb-reader-header .jpdb-reader-spelling { font-size: 52px !important; }' });
        await page.evaluate(() => {
            const renderer = window.__yomuRealApp.cardPopoverRenderer;
            const render = renderer.render;
            renderer.render = function (...args) {
                window.__popupLayoutRender = args;
                return render.apply(this, args);
            };
        });
        if (touch) {
            if (engine === 'webkit' && contextOptions.isMobile) {
                const box = await word.boundingBox();
                const viewport = await page.evaluate(() => ({ scale: visualViewport?.scale ?? 1, left: visualViewport?.offsetLeft ?? 0, top: visualViewport?.offsetTop ?? 0 }));
                await page.touchscreen.tap((box.x + box.width / 2 - viewport.left) * viewport.scale, (box.y + box.height / 2 - viewport.top) * viewport.scale);
            } else await word.tap();
            result.pressTarget = await page.evaluate(() => window.__popupLayoutPress);
            if (result.pressTarget?.word !== '先生') throw new Error(`Native touch landed on ${result.pressTarget?.word ?? 'no word'}, not 先生.`);
        } else await word.hover();
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
        if (largeText && first.headwordFontSize !== '52px') result.failures.push('The headword did not render at 200% text size.');
        if (first.pitch) result.failures.push('Pitch arrived before the loading header was measured.');
        if (!last.pitch || !last.hasRank) result.failures.push('Late Jiten detail did not render pitch and #330.');
        if (!requests.some(url => url.endsWith('/vocabulary/1387990/0/info'))) result.failures.push('The popup never requested its Jiten detail.');
        for (const key of ['height', 'pillsTop', 'actionsTop', 'actionsLeft']) {
            const values = result.samples.map(sample => sample[key]);
            if (Math.max(...values) - Math.min(...values) > 1) result.failures.push(`${key} shifted: ${first[key]} → ${last[key]} px`);
        }
        if (result.samples.some(sample => sample.overflow)) result.failures.push('Header overflowed its popup or viewport.');
        if (mode !== 'auto' && last.presentation !== mode) result.failures.push(`Expected ${mode}; got ${last.presentation}.`);
        if (result.samples.some(sample => /未翻訳|In context|文脈内|Exact pitch unavailable/u.test(sample.text))) result.failures.push('Removed or untranslated copy appeared.');
        result.headerHeights = [...new Set(result.samples.map(sample => sample.height))];
        result.pillOffsets = [...new Set(result.samples.map(sample => sample.pillsTop))];
        result.samples = result.samples.filter((sample, index, all) => !index || JSON.stringify(sample) !== JSON.stringify(all[index - 1]));
        // A frozen page cannot capture each late-arriving accent/component
        // combination. These labelled mechanisms use the BUILT renderer and
        // its actual render data, changing only the pronunciation evidence.
        result.mechanismFixtures = await page.evaluate(pitchLaneMechanismFixtures);
        for (const fixture of result.mechanismFixtures) result.failures.push(...fixture.failures.map(failure => `${fixture.name}: ${failure}`));
        if (rotate) {
            await page.setViewportSize({ width: height, height: width });
            await page.waitForTimeout(400);
            result.rotatedHeader = await page.evaluate(measureHeader);
            if (!result.rotatedHeader || result.rotatedHeader.overflow || !result.rotatedHeader.pitch) result.failures.push('Open popup lost pitch or overflowed after rotation.');
        }
    } catch (error) {
        result.failures.push(String(error?.message ?? error).split('\n')[0]);
    } finally {
        result.requests = requests;
        await run.close();
    }
    return result;
}

function pitchLaneMechanismFixtures() {
    const app = window.__yomuRealApp;
    const [originalCard, , trigger, originalData] = window.__popupLayoutRender;
    const selector = '[data-card-popover] .jpdb-reader-header';
    const originalHeader = document.querySelector(selector);
    const results = [];
    for (const example of [
        { name: 'two-accents', spelling: '双子', reading: 'ふたご', pitches: ['LHHH', 'LHHL'], graphs: 2 },
        { name: 'kana', spelling: 'ありがとう', reading: 'ありがとう', pitches: ['LHLLLL'], graphs: 1 },
        // The spoken surface is 食べた; its lexical card/graph is 食べる.
        { name: 'dictionary-form', spelling: '食べる', reading: 'たべる', pitches: ['LHLL'], graphs: 1 },
        { name: 'components', spelling: '気合いを入れる', reading: 'きあいをいれる', pitches: [], graphs: 2,
            components: [{ text: '気合い', reading: 'きあい', pitch: 'LHLL' }, { text: '入れる', reading: 'いれる', pitch: 'LHLL' }] },
        // Force more graphs than a narrow card can fit. This is geometry
        // evidence only, not a claim about the word's legitimate accents.
        { name: 'overflow', spelling: 'ありがとう', reading: 'ありがとう', pitches: ['LHHHHH', 'HLLLLL', 'LHLLLL'], graphs: 3 },
    ]) {
        const fixture = { name: `${example.name}-mechanism-fixture`, failures: [], samples: [] };
        for (const loading of [true, false]) {
            const card = { ...originalCard, spelling: example.spelling, reading: loading ? '' : example.reading,
                wordWithReading: null, pitchAccent: loading ? [] : example.pitches };
            const data = { ...originalData, loading, metaEntries: [],
                expressionComponents: example.components ?? [], componentPitches: example.components ?? [] };
            const template = document.createElement('template');
            template.innerHTML = app.cardPopoverRenderer.render(card, '食べた。', trigger, data);
            const header = template.content.querySelector('.jpdb-reader-header');
            document.querySelector(selector).replaceWith(header);
            const box = header.getBoundingClientRect();
            const lane = header.querySelector('.jpdb-reader-pronunciation');
            fixture.samples.push({ height: box.height, pillsTop: header.querySelector('.jpdb-reader-word-pills').getBoundingClientRect().top - box.top });
            if (loading) continue;
            const graphs = [...header.querySelectorAll('.jpdb-reader-pitch svg')];
            if (graphs.length !== example.graphs) fixture.failures.push(`Expected ${example.graphs} graphs; saw ${graphs.length}.`);
            if (!lane || graphs.some(graph => graph.getBoundingClientRect().bottom > lane.getBoundingClientRect().bottom + 1)) fixture.failures.push('Pitch graph clipped vertically.');
            if (header.scrollWidth > header.clientWidth + 1) fixture.failures.push('Pitch escaped its scroll lane.');
            if (example.name === 'dictionary-form') {
                const headword = header.querySelector('[data-yomu-headword]')?.cloneNode(true);
                headword?.querySelectorAll('rt, rp').forEach(node => node.remove());
                if (headword?.textContent.trim() !== '食べる') fixture.failures.push('Graph lost its dictionary-form headword.');
            }
        }
        if (['height', 'pillsTop'].some(key => Math.abs(fixture.samples[0][key] - fixture.samples[1][key]) > 1)) fixture.failures.push('Loading pronunciation moved the header.');
        results.push(fixture);
    }
    document.querySelector(selector).replaceWith(originalHeader);
    return results;
}

function measureHeader() {
    const popover = [...document.querySelectorAll('.jpdb-reader-popover')].find(node => node.getBoundingClientRect().width && getComputedStyle(node).visibility !== 'hidden');
    const header = popover?.querySelector('[data-card-popover] .jpdb-reader-header');
    if (!header) return null;
    const box = header.getBoundingClientRect();
    const pills = header.querySelector('.jpdb-reader-word-pills');
    const actions = header.querySelector('.jpdb-reader-word-actions');
    const spelling = header.querySelector('.jpdb-reader-spelling');
    const spellingStyle = getComputedStyle(spelling);
    const button = spelling.querySelector('.jpdb-reader-kanji-inline');
    const buttonStyle = button && getComputedStyle(button);
    // A desktop page on Mobile Safari can keep a 1120px layout viewport
    // while the rotated visual viewport is 1180px wide. Judge visible bounds
    // in the same CSS coordinates as the native tap and the popup shell.
    // The Apple page-scale adapter reports fixed chrome in screen space;
    // its viewport bounds use this same scale (ui/page-scale.ts).
    const overlayScale = Number(popover.dataset.jpdbReaderPageScale) || 1;
    const viewportLeft = (visualViewport?.offsetLeft ?? 0) * overlayScale;
    const viewportRight = viewportLeft + (visualViewport?.width ?? innerWidth) * overlayScale;
    const viewportTop = (visualViewport?.offsetTop ?? 0) * overlayScale;
    const viewportBottom = viewportTop + (visualViewport?.height ?? innerHeight) * overlayScale;
    const controlBounds = [...popover.querySelectorAll('[data-jpdb-reader-sheet-close], [data-action="word-history-back"], .jpdb-reader-word-actions button')].map(control => {
        const bounds = control.getBoundingClientRect();
        return { class: control.className, left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, clipped: bounds.width > 0 && bounds.height > 0 && (bounds.left < viewportLeft - 1 || bounds.right > viewportRight + 1 || bounds.top < viewportTop - 1 || bounds.bottom > viewportBottom + 1) };
    });
    const clippedControls = controlBounds.some(control => control.clipped);
    return {
        height: Math.round(box.height),
        pillsTop: Math.round(pills.getBoundingClientRect().top - box.top),
        actionsTop: Math.round(actions.getBoundingClientRect().top - box.top),
        actionsLeft: Math.round(actions.getBoundingClientRect().left - box.left),
        pitch: Boolean(header.querySelector('.jpdb-reader-pitch polyline')),
        hasRank: /Jiten\s*#330/u.test(pills.textContent),
        text: header.textContent.replace(/\s+/gu, ' ').trim(),
        overflow: popover.scrollWidth > popover.clientWidth + 1 || box.left < viewportLeft - 1 || box.right > viewportRight + 1 || clippedControls,
        bounds: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, headerClient: header.clientWidth, headerScroll: header.scrollWidth, popupClient: popover.clientWidth, popupScroll: popover.scrollWidth, viewportLeft, viewportRight, viewportTop, viewportBottom },
        controlBounds,
        presentation: popover.classList.contains('jpdb-reader-sheet') ? 'sheet' : 'popover',
        headwordFontSize: getComputedStyle(header.querySelector('.jpdb-reader-spelling')).fontSize,
        typography: { height: spelling.getBoundingClientRect().height, lineHeight: spellingStyle.lineHeight, border: buttonStyle?.borderBottomWidth, buttonLineHeight: buttonStyle?.lineHeight, buttonFont: buttonStyle?.fontSize, scale: visualViewport?.scale, zoom: getComputedStyle(popover).zoom, rtFont: spelling.querySelector('rt') && getComputedStyle(spelling.querySelector('rt')).fontSize },
    };
}

// The first 先生 in running text, brought into view so the page scan annotates it.
export async function visibleSensei(page) {
    await page.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector('#mw-content-text') ?? document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeValue?.includes('先生に')) return node.parentElement?.scrollIntoView({ block: 'center' });
        }
        return undefined;
    });
    const word = page.locator('.jpdb-reader-word[data-expression="先生"]:visible').first();
    await word.waitFor({ timeout: 60_000 });
    await word.scrollIntoViewIfNeeded();
    return word;
}
