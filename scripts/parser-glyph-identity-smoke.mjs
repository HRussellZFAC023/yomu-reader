#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    installUserscriptCssResource,
} from './lib/smoke-test-helpers.mjs';
import { yomitanZipBuffer } from './lib/yomitan-zip.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
} = createSmokePaths(import.meta.dirname);
const PAGE_PATH = '/parser-glyph-identity.html';
const DICTIONARY_TITLE = 'Yomu Parser Glyph Identity [2026-08-04]';
const LOOKUP_GLYPH = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヵヶ]/u;
const ENGINE_MATRIX = [
    { name: 'chromium', browserType: chromium },
    { name: 'firefox', browserType: firefox },
];
const requestedEngineNames = new Set(process.argv.slice(2));
const ENGINES = requestedEngineNames.size
    ? ENGINE_MATRIX.filter(engine => requestedEngineNames.has(engine.name))
    : ENGINE_MATRIX;
const FURIGANA_MODES = ['all', 'off'];
const INTERACTIONS = ['hover', 'click'];
const SENTENCES = fixtureSentences();
const EXPECTED_TOKENS = SENTENCES.flatMap(sentence => sentence.tokens.map(token => ({
    sentenceId: sentence.id,
    selector: `[data-parser-sentence="${sentence.id}"]`,
    ...token,
})));
const GLYPH_PROBES = glyphProbes(SENTENCES);

const BASE_SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    parserProvider: 'local',
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    bunproDefinitionsEnabled: false,
    wanikaniDefinitionsEnabled: false,
    localDictionariesEnabled: true,
    annotationsPaused: false,
    manualScanEnabled: false,
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    showFloatingButton: false,
    showPitchAccent: false,
    showFurigana: true,
    furiganaMode: 'all',
    lookupOnClick: true,
    lookupOnHover: false,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 40,
    popupActivationMode: 'click',
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'off',
    wordTextColorSource: 'off',
    enableLogging: false,
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');
assert(ENGINES.length > 0 && ENGINES.length === (requestedEngineNames.size || ENGINE_MATRIX.length),
    'Parser glyph identity engine must be chromium or firefox.', {
        requested: [...requestedEngineNames],
    });
assert(GLYPH_PROBES.length === 36, 'Fixture no longer covers the expected 36 Japanese glyphs.', {
    glyphCount: GLYPH_PROBES.length,
});

const server = await startLoopbackServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <title>Yomu parser glyph identity</title>
</head>
<body>
    <main style="max-width: 900px; margin: 48px auto; padding: 24px; font: 28px/2.4 system-ui, sans-serif;">
        ${SENTENCES.map(sentence => `<p data-parser-sentence="${sentence.id}">${sentence.text}</p>`).join('\n        ')}
    </main>
</body>
</html>`);
}, 'Could not bind parser glyph identity smoke server');

const reportPath = path.join(ARTIFACTS, 'parser-glyph-identity-smoke.json');
const report = {
    ok: false,
    fixture: SENTENCES.map(({ id, text, tokens }) => ({ id, text, tokens })),
    expectedGlyphsPerScenario: GLYPH_PROBES.length,
    scenarios: [],
};

try {
    for (const engine of ENGINES) {
        await runEngine(engine, report.scenarios);
    }
    report.ok = true;
    report.totalAssertions = report.scenarios.reduce(
        (sum, scenario) => sum + scenario.probes.length,
        0,
    );
    writeReport();
    console.log(JSON.stringify({
        ok: true,
        engines: ENGINES.map(engine => engine.name),
        scenarios: report.scenarios.length,
        glyphAssertions: report.totalAssertions,
        reportPath,
    }, null, 2));
    console.log('parser glyph identity smoke passed');
} catch (error) {
    report.failure = String(error?.stack ?? error);
    writeReport();
    throw error;
} finally {
    await closeServer(server.server);
}

async function runEngine(engine, scenarios) {
    const browser = await launchSmokeBrowser(engine.browserType, engine.name, { headless: true });
    try {
        const context = await browser.newContext({
            bypassCSP: true,
            viewport: { width: 1280, height: 900 },
            locale: 'ja-JP',
        });
        const page = await context.newPage();
        if (process.env.SMOKE_DEBUG) {
            page.on('console', message => console.error(`[${engine.name}:console]`, message.type(), message.text().slice(0, 400)));
            page.on('pageerror', error => console.error(`[${engine.name}:pageerror]`, error.message.slice(0, 400)));
        }
        await page.exposeFunction('__yomuParserGlyphRequest', () => ({
            status: 503,
            statusText: 'Deterministic parser glyph identity fixture',
            responseText: '',
            responseHeaders: '',
        }));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: BASE_SETTINGS,
            requestBridgeName: '__yomuParserGlyphRequest',
            initialize: 'ifMissing',
        });

        await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
        await injectReader(page);
        await importFixtureDictionary(page);
        await waitForImportedDictionaryStore(page);

        for (const furiganaMode of FURIGANA_MODES) {
            for (const interaction of INTERACTIONS) {
                await configureScenario(page, furiganaMode, interaction);
                const scenario = await exerciseScenario(page, {
                    engine: engine.name,
                    furiganaMode,
                    interaction,
                });
                scenarios.push(scenario);
            }
        }
        await context.close();
    } finally {
        await browser.close();
    }
}

async function injectReader(page) {
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(
        () => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
        null,
        { timeout: 20_000 },
    );
}

async function importFixtureDictionary(page) {
    await page.waitForFunction(() => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent('yomu-open-settings', { detail: { panel: 'backup' } }));
        return false;
    }, null, { timeout: 30_000, polling: 250 });

    const importButton = page.locator('[data-action="import-yomitan-dictionary"]');
    await importButton.scrollIntoViewIfNeeded();
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await importButton.click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
        name: `${DICTIONARY_TITLE}.zip`,
        mimeType: 'application/zip',
        buffer: fixtureDictionaryArchive(),
    });
    await page.waitForFunction(({ settingsKey, dictionaryTitle }) => {
        const raw = localStorage.getItem(settingsKey);
        const settings = raw == null ? null : JSON.parse(raw);
        return Boolean(settings?.dictionaryPreferences?.some(row => row.name === dictionaryTitle));
    }, {
        settingsKey: YOMU_SETTINGS_KEY,
        dictionaryTitle: DICTIONARY_TITLE,
    }, { timeout: 30_000, polling: 250 });
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.locator('.jpdb-reader-settings').waitFor({ state: 'detached', timeout: 3000 })
        .catch(() => page.evaluate(() => document.querySelector('.jpdb-reader-settings')?.remove()));
}

async function waitForImportedDictionaryStore(page) {
    await page.waitForFunction(dictionaryTitle => new Promise(resolve => {
        const request = indexedDB.open('jpdb-popup-reader-yomitan');
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('dictionaryInfo')
                || !database.objectStoreNames.contains('terms')) {
                database.close();
                resolve(false);
                return;
            }
            const transaction = database.transaction(['dictionaryInfo', 'terms'], 'readonly');
            const dictionary = transaction.objectStore('dictionaryInfo').get(dictionaryTitle);
            const terms = transaction.objectStore('terms').count();
            transaction.oncomplete = () => {
                database.close();
                resolve(Boolean(dictionary.result) && Number(terms.result) > 0);
            };
            transaction.onerror = () => {
                database.close();
                resolve(false);
            };
            transaction.onabort = () => {
                database.close();
                resolve(false);
            };
        };
    }), DICTIONARY_TITLE, { timeout: 30_000, polling: 250 });
}

async function configureScenario(page, furiganaMode, interaction) {
    await page.evaluate(({ settingsKey, mode, trigger }) => {
        const current = window.GM_getValue(settingsKey, {});
        window.GM_setValue(settingsKey, {
            ...current,
            showFurigana: mode !== 'off',
            furiganaMode: mode,
            lookupOnHover: trigger === 'hover',
            lookupOnClick: trigger === 'click',
            popupActivationMode: trigger,
            hoverOpenDelayMs: 0,
        });
    }, {
        settingsKey: YOMU_SETTINGS_KEY,
        mode: furiganaMode,
        trigger: interaction,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await injectReader(page);
    // Make every matrix row start from an explicit, observable scan instead
    // of depending on the page-start work detector's per-navigation timing.
    await page.keyboard.press('Shift+J');
    await waitForFixtureReady(page, furiganaMode);
}

async function waitForFixtureReady(page, furiganaMode) {
    if (furiganaMode === 'off') {
        await page.waitForFunction(sentenceIds => sentenceIds.every(id => {
            const sentence = document.querySelector(`[data-parser-sentence="${id}"]`);
            return sentence && (sentence.textContent ?? '').trim().length > 0;
        }), SENTENCES.map(sentence => sentence.id), { timeout: 20_000, polling: 100 });
        await page.waitForTimeout(250);
        return;
    }
    try {
        await page.waitForFunction(sentenceIds => sentenceIds.every(id =>
            [...document.querySelectorAll(`[data-parser-sentence="${id}"] .jpdb-reader-word`)]
                .some(word => word.getAttribute('data-card-source') === 'local')),
        SENTENCES.map(sentence => sentence.id), {
            timeout: 90_000,
            polling: 250,
        });
    } catch (error) {
        const diagnostics = await page.evaluate(async settingsKey => {
            const settings = window.GM_getValue?.(settingsKey, null) ?? null;
            return {
                settings: settings ? {
                    parserProvider: settings.parserProvider,
                    localDictionariesEnabled: settings.localDictionariesEnabled,
                    manualScanEnabled: settings.manualScanEnabled,
                    annotationsPaused: settings.annotationsPaused,
                    furiganaMode: settings.furiganaMode,
                    lookupOnHover: settings.lookupOnHover,
                    lookupOnClick: settings.lookupOnClick,
                    dictionaryPreferences: settings.dictionaryPreferences,
                    activeLanguageProfile: settings.languageProfiles?.find(
                        profile => profile.id === settings.activeLanguageProfileId,
                    ),
                } : null,
                storedSettingsLength: localStorage.getItem(settingsKey)?.length ?? 0,
                databases: (await indexedDB.databases?.() ?? []).map(database => ({
                    name: database.name ?? '',
                    version: database.version ?? 0,
                })),
                sentences: [...document.querySelectorAll('[data-parser-sentence]')].map(container => ({
                    id: container.getAttribute('data-parser-sentence') ?? '',
                    text: container.textContent?.replace(/\s+/gu, '') ?? '',
                    words: [...container.querySelectorAll('.jpdb-reader-word')].map(word => ({
                        surface: word.getAttribute('data-surface') ?? '',
                        expression: word.getAttribute('data-expression') ?? '',
                        source: word.getAttribute('data-card-source') ?? '',
                        start: word.getAttribute('data-token-start') ?? '',
                        end: word.getAttribute('data-token-end') ?? '',
                    })),
                })),
            };
        }, YOMU_SETTINGS_KEY);
        throw new Error(`Local dictionary never became the fixture's paint source.\n${JSON.stringify(diagnostics, null, 2)}`, {
            cause: error,
        });
    }
    // One local parse applies a paragraph batch synchronously. The short quiet
    // window lets any queued late-card restamp finish before span evidence is
    // captured, without waiting on disabled network providers.
    await page.waitForTimeout(250);
}

async function exerciseScenario(page, scenario) {
    const rubyCount = await page.locator('[data-parser-sentence] rt.jpdb-reader-furi').count();
    if (scenario.furiganaMode === 'all') {
        assert(rubyCount > 0, 'furiganaMode=all painted no ruby annotations.', { ...scenario, rubyCount });
    } else {
        assert(rubyCount === 0, 'furiganaMode=off still painted ruby annotations.', { ...scenario, rubyCount });
    }

    const painted = await paintedTokenSnapshot(page);
    if (scenario.furiganaMode === 'all') assertPaintedTokens(painted, scenario);
    const probes = [];
    for (const probe of GLYPH_PROBES) {
        await dismissPopover(page);
        await page.locator(probe.selector).scrollIntoViewIfNeeded();
        const point = await glyphPointAndPaint(page, probe);
        assertGlyphPaint(point, probe, scenario);

        if (scenario.interaction === 'hover') await page.mouse.move(point.x, point.y);
        else await page.mouse.click(point.x, point.y);

        const popover = await visiblePopoverSnapshot(page);
        assert(popover.headword === probe.headword, 'Popover headword did not match the glyph under the pointer.', {
            ...scenario,
            probe,
            point,
            popover,
        });
        probes.push({
            sentenceId: probe.sentenceId,
            offset: probe.offset,
            glyph: probe.glyph,
            expectedSurface: probe.surface,
            expectedHeadword: probe.headword,
            paintedSurface: point.paintedSurface,
            headword: popover.headword,
        });
    }

    const screenshot = path.join(
        ARTIFACTS,
        `parser-glyph-identity-${scenario.engine}-${scenario.furiganaMode}-${scenario.interaction}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: false });
    return { ...scenario, rubyCount, painted, probes, screenshot };
}

async function paintedTokenSnapshot(page) {
    return await page.evaluate(() => [...document.querySelectorAll('[data-parser-sentence]')].map(container => ({
        sentenceId: container.getAttribute('data-parser-sentence') ?? '',
        words: [...container.querySelectorAll('.jpdb-reader-word')].map(word => ({
            surface: word.getAttribute('data-surface') ?? '',
            expression: word.getAttribute('data-expression') ?? '',
            start: Number(word.getAttribute('data-token-start')),
            end: Number(word.getAttribute('data-token-end')),
            source: word.getAttribute('data-card-source') ?? '',
        })),
    })));
}

function assertPaintedTokens(painted, scenario) {
    for (const expected of EXPECTED_TOKENS) {
        const sentence = painted.find(row => row.sentenceId === expected.sentenceId);
        const matches = sentence?.words.filter(word => word.start === expected.start && word.end === expected.end) ?? [];
        assert(matches.length === 1, 'Expected source range was not painted by exactly one word span.', {
            ...scenario,
            expected,
            sentence,
        });
        assert(matches[0].surface === expected.surface, 'Painted span surface disagreed with its source range.', {
            ...scenario,
            expected,
            painted: matches[0],
        });
        assert(matches[0].expression === expected.headword, 'Painted card identity disagreed with its source span.', {
            ...scenario,
            expected,
            painted: matches[0],
        });
        assert(matches[0].source === 'local', 'Acceptance fixture was not resolved by the local dictionary.', {
            ...scenario,
            expected,
            painted: matches[0],
        });
    }
}

async function glyphPointAndPaint(page, probe) {
    return await page.evaluate(({ selector, sourceOffset }) => {
        const container = document.querySelector(selector);
        if (!container) return null;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let logicalOffset = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.parentElement?.closest('rt, rp, .jpdb-reader-furi')) continue;
            const text = node.nodeValue ?? '';
            if (sourceOffset < logicalOffset + text.length) {
                const nodeOffset = sourceOffset - logicalOffset;
                const codePoint = text.codePointAt(nodeOffset);
                if (codePoint === undefined) return null;
                const glyph = String.fromCodePoint(codePoint);
                const range = document.createRange();
                range.setStart(node, nodeOffset);
                range.setEnd(node, nodeOffset + glyph.length);
                const rect = range.getBoundingClientRect();
                const word = node.parentElement?.closest('.jpdb-reader-word');
                return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    width: rect.width,
                    height: rect.height,
                    glyph,
                    paintedSurface: word?.getAttribute('data-surface') ?? '',
                    paintedExpression: word?.getAttribute('data-expression') ?? '',
                    paintedStart: Number(word?.getAttribute('data-token-start')),
                    paintedEnd: Number(word?.getAttribute('data-token-end')),
                    paintedBaseText: word ? baseText(word) : '',
                };
            }
            logicalOffset += text.length;
        }
        return null;

        function baseText(root) {
            const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let value = '';
            for (let textNode = textWalker.nextNode(); textNode; textNode = textWalker.nextNode()) {
                if (textNode.parentElement?.closest('rt, rp, .jpdb-reader-furi')) continue;
                value += textNode.nodeValue ?? '';
            }
            return value;
        }
    }, { selector: probe.selector, sourceOffset: probe.offset });
}

function assertGlyphPaint(point, probe, scenario) {
    assert(point && point.width > 0 && point.height > 0, 'Could not resolve a real glyph rectangle.', {
        ...scenario,
        probe,
        point,
    });
    assert(point.glyph === probe.glyph, 'DOM source offset resolved to a different glyph.', {
        ...scenario,
        probe,
        point,
    });
    if (scenario.furiganaMode === 'off') return;
    assert(point.paintedSurface === probe.surface
        && point.paintedBaseText === probe.surface
        && point.paintedStart === probe.start
        && point.paintedEnd === probe.end,
    'Glyph was enclosed by the wrong painted source span.', {
        ...scenario,
        probe,
        point,
    });
    assert(point.paintedExpression === probe.headword, 'Glyph span carried the wrong painted card identity.', {
        ...scenario,
        probe,
        point,
    });
}

async function visiblePopoverSnapshot(page) {
    const handle = await page.waitForFunction(() => {
        const visible = [...document.querySelectorAll('.jpdb-reader-popover')].filter(popover => {
            const style = getComputedStyle(popover);
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0
                && popover.getClientRects().length > 0;
        });
        const popover = visible.at(-1);
        const headwordNode = popover?.querySelector('[data-yomu-headword], .jpdb-reader-spelling');
        if (!popover || !headwordNode) return null;
        const headword = baseText(headwordNode).replace(/\s+/gu, '');
        if (!headword) return null;
        return {
            headword,
            text: (popover.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 240),
            localDictionaries: [...popover.querySelectorAll('[data-source="local-dictionary"]')]
                .map(node => node.getAttribute('data-dictionary') ?? ''),
            focused: document.activeElement === popover,
        };

        function baseText(root) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let value = '';
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (node.parentElement?.closest('rt, rp, .jpdb-reader-furi')) continue;
                value += node.nodeValue ?? '';
            }
            return value;
        }
    }, null, { timeout: 10_000, polling: 25 });
    return await handle.jsonValue();
}

async function dismissPopover(page) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.mouse.move(8, 8).catch(() => undefined);
    await page.waitForFunction(() => [...document.querySelectorAll('.jpdb-reader-popover')].every(popover => {
        const style = getComputedStyle(popover);
        return style.display === 'none'
            || style.visibility === 'hidden'
            || Number(style.opacity || 1) === 0
            || popover.getClientRects().length === 0;
    }), null, { timeout: 2000, polling: 25 }).catch(() => undefined);
}

function fixtureDictionaryArchive() {
    return yomitanZipBuffer({
        'index.json': {
            title: DICTIONARY_TITLE,
            format: 3,
            revision: 'glyph-identity-1',
        },
        'term_bank_1.json': [
            ['やさしい', 'やさしい', '', 'adj-i', 100, ['easy; gentle'], 1, ''],
            ['ことば', 'ことば', '', 'n', 100, ['word; language'], 2, ''],
            ['で', 'で', '', 'prt', 100, ['at; by'], 3, ''],
            ['書く', 'かく', '', 'v5k', 100, ['to write'], 4, ''],
            ['ニュース', 'ニュース', '', 'n', 100, ['news'], 5, ''],
            ['です', 'です', '', 'cop', 100, ['polite copula'], 6, ''],
            ['優しい', 'やさしい', '', 'adj-i', 100, ['kind; gentle'], 7, ''],
            ['言葉', 'ことば', '', 'n', 100, ['word; language'], 8, ''],
            ['を', 'を', '', 'prt', 100, ['object marker'], 9, ''],
            ['かける', 'かける', '', 'v1', 100, ['to address; to call out'], 10, ''],
            ['台風', 'たいふう', '', 'n', 100, ['typhoon'], 11, ''],
            ['の', 'の', '', 'prt', 100, ['possessive marker'], 12, ''],
            ['被害', 'ひがい', '', 'n', 100, ['damage'], 13, ''],
            ['が', 'が', '', 'prt', 100, ['subject marker'], 14, ''],
            ['出る', 'でる', '', 'v1', 100, ['to come out'], 15, ''],
        ],
    });
}

function fixtureSentences() {
    return [
        sentenceFixture('a', 'やさしいことばで書いたニュースです。', [
            ['やさしい', 'やさしい'],
            ['ことば', 'ことば'],
            ['で', 'で'],
            ['書いた', '書く'],
            ['ニュース', 'ニュース'],
            ['です', 'です'],
        ]),
        sentenceFixture('b', '優しい言葉をかけた。', [
            ['優しい', '優しい'],
            ['言葉', '言葉'],
            ['を', 'を'],
            ['かけた', 'かける'],
        ]),
        sentenceFixture('c', '台風の被害が出ている', [
            ['台風', '台風'],
            ['の', 'の'],
            ['被害', '被害'],
            ['が', 'が'],
            ['出ている', '出る'],
        ]),
    ];
}

function sentenceFixture(id, text, tokenDefinitions) {
    let cursor = 0;
    const tokens = tokenDefinitions.map(([surface, headword]) => {
        const start = text.indexOf(surface, cursor);
        assert(start === cursor, 'Fixture token definitions must cover the sentence in source order.', {
            id,
            text,
            cursor,
            surface,
        });
        const end = start + surface.length;
        cursor = end;
        return { surface, headword, start, end };
    });
    for (let offset = 0; offset < text.length;) {
        const codePoint = text.codePointAt(offset);
        const glyph = String.fromCodePoint(codePoint);
        if (LOOKUP_GLYPH.test(glyph)) {
            assert(tokens.some(token => token.start <= offset && offset < token.end),
                'Every Japanese fixture glyph must belong to an expected token.', {
                    id,
                    text,
                    offset,
                    glyph,
                });
        }
        offset += glyph.length;
    }
    return { id, text, tokens };
}

function glyphProbes(sentences) {
    return sentences.flatMap(sentence => sentence.tokens.flatMap(token => {
        const probes = [];
        for (let offset = token.start; offset < token.end;) {
            const codePoint = sentence.text.codePointAt(offset);
            const glyph = String.fromCodePoint(codePoint);
            probes.push({
                sentenceId: sentence.id,
                selector: `[data-parser-sentence="${sentence.id}"]`,
                offset,
                glyph,
                ...token,
            });
            offset += glyph.length;
        }
        return probes;
    }));
}

function writeReport() {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
