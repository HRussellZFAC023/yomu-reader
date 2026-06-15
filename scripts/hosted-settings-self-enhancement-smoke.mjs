#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    routeMockedHttpRequests,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const {
    root: ROOT,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);

assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], ROOT, 'Run npm run build first.');

const VOCABULARY = [
    ['設定', '設定', 'せってい', 'settings', ['n'], 650, ['not-in-deck'], ['LHHH']],
    ['検索', '検索', 'けんさく', 'search', ['n'], 500, ['not-in-deck'], ['LHHH']],
    ['外観', '外観', 'がいかん', 'appearance', ['n'], 1200, ['not-in-deck'], ['LHHH']],
    ['ソース', 'ソース', 'ソース', 'source', ['n'], 1300, ['not-in-deck'], ['LHHH']],
    ['メディア', 'メディア', 'メディア', 'media', ['n'], 1301, ['not-in-deck'], ['LHHH']],
    ['採掘', '採掘', 'さいくつ', 'mining', ['n'], 1302, ['not-in-deck'], ['LHHH']],
    ['辞書', '辞書', 'じしょ', 'dictionary', ['n'], 900, ['not-in-deck'], ['LHH']],
    ['学習', '学習', 'がくしゅう', 'study', ['n'], 700, ['not-in-deck'], ['LHHH']],
    ['ショートカット', 'ショートカット', 'ショートカット', 'shortcut', ['n'], 1303, ['not-in-deck'], ['LHHH']],
    ['ヘルプ', 'ヘルプ', 'ヘルプ', 'help', ['n'], 1304, ['not-in-deck'], ['LHHH']],
    ['キャンセル', 'キャンセル', 'キャンセル', 'cancel', ['n'], 1305, ['not-in-deck'], ['LHHH']],
    ['保存', '保存', 'ほぞん', 'save', ['n'], 1306, ['not-in-deck'], ['LHHH']],
    ['能力', '能力', 'のうりょく', 'ability', ['n'], 800, ['not-in-deck'], ['LHHH']],
    ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['not-in-deck'], ['LHHH']],
    ['読む', '読む', 'よむ', 'to read', ['v5m'], 400, ['not-in-deck'], ['LH']],
];

const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabEnabled: true,
    newTabAnkiEnabled: false,
    newTabSource: 'auto',
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 80,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

const server = await startLoopbackServer(serveNewTab, 'Could not bind hosted settings smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const requests = [];

try {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 1,
    });
    await context.addInitScript(({ key, settings }) => {
        localStorage.setItem(key, JSON.stringify(settings));
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'search',
            sort: 'random',
            filter: 'study',
            source: 'auto',
            revealAnswer: false,
            jpdbDeck: '',
            ankiDeck: '',
            keyHintsDismissed: false,
        }));
    }, { key: YOMU_SETTINGS_KEY, settings: SETTINGS });

    const page = await context.newPage();
    await routeMockedHttpRequests(page, {
        requests,
        isMockedApiOrigin: url => url.hostname === 'jpdb.io',
        mockHttpRequest: request => mockedJpdbRequest(request, requests),
    });
    page.on('console', message => {
        if (process.env.SMOKE_DEBUG) console.error('[hosted-settings]', message.type(), message.text());
    });
    page.on('pageerror', error => {
        if (process.env.SMOKE_DEBUG) console.error('[hosted-settings pageerror]', error.message);
    });

    await page.goto(`${server.origin}/newtab/index.html?q=%E8%AA%AD%E3%81%BF%E5%8F%96%E3%82%8B`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { state: 'attached', timeout: 15_000 });
    await page.waitForSelector('.jpdb-reader-newtab-more summary', { timeout: 15_000 });
    await page.locator('.jpdb-reader-newtab-more summary').click();
    await page.locator('[data-newtab-action="settings"]').click();
    await waitForSettingsSelector(page, requests, '.jpdb-reader-settings h2 .jpdb-reader-word[data-expression="設定"].jpdb-pitch-heiban');
    await waitForSettingsSelector(page, requests, '.jpdb-reader-settings-search .jpdb-reader-word[data-expression="検索"].jpdb-pitch-heiban');
    await waitForSettingsSelector(page, requests, '.jpdb-reader-settings-tabs [data-panel="appearance"] .jpdb-reader-word[data-expression="外観"].jpdb-pitch-heiban');
    await waitForSettingsSelector(page, requests, '.jpdb-reader-settings > .footer [data-action="cancel"] .jpdb-reader-word[data-expression="キャンセル"]');
    await waitForSettingsSelector(page, requests, '.jpdb-reader-settings > .footer button[type="submit"] .jpdb-reader-word[data-expression="保存"]');

    const initial = await settingsSnapshot(page);
    assert(initial.noUserscriptBridge, 'Hosted settings smoke unexpectedly found a userscript bridge', initial);
    assert(initial.runtimeMarker === 'newtab', 'Hosted newtab runtime marker missing', initial);
    assert(initial.wordCount >= 8, 'Hosted settings did not enhance enough Japanese labels', initial);
    assert(initial.rubyCount >= 4, 'Hosted settings did not render ruby without userscript injection', initial);
    assert(initial.pitchCount >= 5, 'Hosted settings did not render pitch classes without userscript injection', initial);
    assert(initial.exact.title.hasRuby && initial.exact.title.pitch, 'Settings title did not get ruby and pitch', { initial, requests });
    assert(initial.exact.searchLabel.hasRuby && initial.exact.searchLabel.pitch, 'Settings search label did not get ruby and pitch', initial);
    assert(initial.exact.appearanceTab.hasRuby && initial.exact.appearanceTab.pitch, 'Appearance tab did not get ruby and pitch', initial);
    assert(initial.exact.cancel.found && initial.exact.cancel.passive, 'Cancel button text did not stay passively enhanced', initial);
    assert(initial.exact.save.hasRuby && initial.exact.save.pitch && initial.exact.save.passive, 'Save button text did not get passive ruby and pitch', initial);
    assert(initial.searchInputNative, 'Settings search input was not left as a native input', initial);
    assert(initial.cancelNative, 'Settings Cancel button was not left as a native button', initial);
    assert(initial.saveNative, 'Settings Save button was not left as a native submit button', initial);
    assert(requests.some(request => request.endpoint === 'parse' && request.text.includes('設定') && request.text.includes('外観')),
        'Hosted settings text was not sent through the JPDB parser', { requests });

    await page.locator('[data-action="settings-panel"][data-panel="media"]').evaluate(button => {
        if (!(button instanceof HTMLButtonElement)) throw new Error('Media settings tab is not a button.');
        button.click();
    });
    await page.waitForFunction(() => document.querySelector('[data-action="settings-panel"][data-panel="media"]')?.getAttribute('aria-selected') === 'true')
        .catch(async error => {
            throw new Error(`Settings media tab did not activate after click.\n${JSON.stringify(await settingsSnapshot(page), null, 2)}\n${error.message}`);
        });
    await page.waitForSelector('[data-settings-panel="media"]:not([hidden]) .jpdb-reader-word', { timeout: 20_000 });

    const settingsSearch = page.locator('[data-settings-search]');
    await settingsSearch.click();
    await settingsSearch.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await settingsSearch.press('Backspace');
    await settingsSearch.pressSequentially('外観');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-settings')?.getAttribute('data-settings-searching') === 'true');
    await page.waitForSelector('[data-settings-panel="appearance"]:not([hidden]) .jpdb-reader-word[data-expression="外観"]', { timeout: 20_000 });
    await page.waitForTimeout(800);

    const afterSearch = await settingsSnapshot(page);
    assert(afterSearch.activePanel === 'media', 'Parsed settings tab click did not switch panels natively', afterSearch);
    assert(afterSearch.searchValue === '外観', 'Settings search field did not keep native input value', afterSearch);
    assert(afterSearch.visiblePanels >= 1, 'Settings search hid all matching panels', afterSearch);
    assert(afterSearch.exact.appearancePanel.hasRuby && afterSearch.exact.appearancePanel.pitch, 'Settings search results did not keep matching Japanese panel text enhanced', { afterSearch, requests });
    assert(afterSearch.wordCount >= 8, 'Settings search dropped enhanced settings labels', { initial, afterSearch });

    await page.locator('.jpdb-reader-settings [data-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'));

    console.log(JSON.stringify({
        ok: true,
        initial: summarizeSnapshot(initial),
        afterSearch: summarizeSnapshot(afterSearch),
        parseRequests: requests
            .filter(request => request.endpoint === 'parse')
            .map(request => ({ chars: request.text.length, hasSettingsText: request.text.includes('設定') })),
    }, null, 2));
    await context.close();
} finally {
    await browser.close().catch(() => undefined);
    server.server.closeAllConnections?.();
    server.server.closeIdleConnections?.();
    await closeServer(server.server);
}

function mockedJpdbRequest(request, requestsLog) {
    const url = new URL(request.url);
    if (url.origin !== 'https://jpdb.io') return null;
    if (!url.pathname.startsWith('/api/v1/')) {
        return {
            responseText: '<!doctype html><html><body></body></html>',
            contentType: 'text/html; charset=utf-8',
        };
    }
    const endpoint = url.pathname.slice('/api/v1/'.length);
    const body = readJsonBody(request.data);
    requestsLog.push({ kind: 'jpdb', endpoint, text: jpdbParseText(body) });
    if (endpoint === 'parse') return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    if (endpoint === 'ping') return jsonHttpResponse({});
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [[1, 'Smoke deck', 0, 0]] });
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [] });
    if (endpoint === 'lookup-vocabulary') return jsonHttpResponse({ vocabulary_info: [] });
    return jsonHttpResponse({});
}

async function waitForSettingsSelector(page, requests, selector) {
    try {
        await page.waitForSelector(selector, { timeout: 60_000 });
    } catch (error) {
        throw new Error(`${error.message}\n${JSON.stringify({
            selector,
            snapshot: await settingsSnapshot(page),
            parseRequests: requests
                .filter(request => request.endpoint === 'parse')
                .map(request => ({ chars: request.text.length, hasSettingsText: request.text.includes('設定'), preview: request.text.slice(0, 160) })),
        }, null, 2)}`);
    }
}

function jpdbParseText(body) {
    if (typeof body.text === 'string') return body.text;
    if (Array.isArray(body.text)) return body.text.filter(item => typeof item === 'string').join('\n');
    if (Array.isArray(body.paragraphs)) return body.paragraphs.filter(item => typeof item === 'string').join('\n');
    return '';
}

function summarizeSnapshot(snapshot) {
    return {
        noUserscriptBridge: snapshot.noUserscriptBridge,
        wordCount: snapshot.wordCount,
        rubyCount: snapshot.rubyCount,
        pitchCount: snapshot.pitchCount,
        passiveCount: snapshot.passiveCount,
        searchInputNative: snapshot.searchInputNative,
        cancelNative: snapshot.cancelNative,
        saveNative: snapshot.saveNative,
        activePanel: snapshot.activePanel,
        visiblePanels: snapshot.visiblePanels,
        searchValue: snapshot.searchValue,
        exact: snapshot.exact,
    };
}

async function settingsSnapshot(page) {
    return await page.evaluate(() => {
        const form = document.querySelector('.jpdb-reader-settings');
        const words = [...document.querySelectorAll('.jpdb-reader-settings .jpdb-reader-word')].filter(word => word instanceof HTMLElement);
        const selectedTab = document.querySelector('.jpdb-reader-settings [data-action="settings-panel"][aria-selected="true"]');
        const visiblePanels = [...document.querySelectorAll('.jpdb-reader-settings [data-settings-panel]')].filter(panel => panel instanceof HTMLElement && !panel.hidden);
        const storedSettings = (() => {
            try {
                return JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') || '{}');
            } catch {
                return {};
            }
        })();
        const stateFor = selector => {
            const word = document.querySelector(selector);
            if (!(word instanceof HTMLElement)) {
                return { found: false, passive: false, hasRuby: false, pitch: '', text: '' };
            }
            const pitch = word.dataset.pitchClass || (/\bjpdb-pitch-([a-z]+)\b/u.exec(word.className)?.[1] ?? '');
            return {
                found: true,
                passive: word.dataset.jpdbReaderPassive === 'true',
                hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
                pitch,
                text: word.dataset.expression || word.textContent?.trim() || '',
                reading: word.dataset.reading || '',
            };
        };
        return {
            runtimeMarker: window.__YOMU_READER_RUNTIME__,
            storedFuriganaMode: storedSettings.furiganaMode || '',
            storedShowFurigana: storedSettings.showFurigana,
            formFuriganaMode: document.querySelector('select[name="furiganaMode"]') instanceof HTMLSelectElement
                ? document.querySelector('select[name="furiganaMode"]').value
                : '',
            noUserscriptBridge: typeof window.GM_xmlhttpRequest === 'undefined'
                && document.documentElement.dataset.yomuUserscriptHttpBridge !== 'true',
            wordCount: words.length,
            rubyCount: words.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
            pitchCount: words.filter(word => /\bjpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka|kifuku)\b/u.test(word.className)).length,
            passiveCount: words.filter(word => word.dataset.jpdbReaderPassive === 'true').length,
            searchInputNative: document.querySelector('[data-settings-search]') instanceof HTMLInputElement
                && !document.querySelector('[data-settings-search] .jpdb-reader-word'),
            cancelNative: document.querySelector('.jpdb-reader-settings [data-action="cancel"]') instanceof HTMLButtonElement,
            saveNative: document.querySelector('.jpdb-reader-settings button[type="submit"]') instanceof HTMLButtonElement,
            activePanel: selectedTab instanceof HTMLElement ? selectedTab.dataset.panel : '',
            visiblePanels: visiblePanels.length,
            searchValue: document.querySelector('[data-settings-search]') instanceof HTMLInputElement
                ? document.querySelector('[data-settings-search]').value
                : '',
            exact: {
                title: stateFor('.jpdb-reader-settings h2 .jpdb-reader-word[data-expression="設定"]'),
                searchLabel: stateFor('.jpdb-reader-settings-search .jpdb-reader-word[data-expression="検索"]'),
                appearanceTab: stateFor('.jpdb-reader-settings-tabs [data-panel="appearance"] .jpdb-reader-word[data-expression="外観"]'),
                cancel: stateFor('.jpdb-reader-settings > .footer [data-action="cancel"] .jpdb-reader-word[data-expression="キャンセル"]'),
                save: stateFor('.jpdb-reader-settings > .footer button[type="submit"] .jpdb-reader-word[data-expression="保存"]'),
                appearancePanel: stateFor('[data-settings-panel="appearance"] .jpdb-reader-word[data-expression="外観"]'),
            },
            surfaces: words.map(word => ({
                text: word.dataset.expression || word.textContent?.trim() || '',
                passive: word.dataset.jpdbReaderPassive === 'true',
                hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
                pitch: word.dataset.pitchClass || '',
            })).slice(0, 80),
            connected: Boolean(form),
        };
    });
}

function serveNewTab(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/newtab' || url.pathname === '/newtab/' || url.pathname === '/newtab/index.html') {
        serveFile(response, path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8', request.method);
        return;
    }
    if (url.pathname.startsWith('/newtab/')) {
        const filePath = path.join(NEWTAB_DIR, url.pathname.slice('/newtab/'.length));
        if (existsSync(filePath)) {
            serveFile(response, filePath, contentTypeForFile(filePath), request.method);
            return;
        }
    }
    const rootAssetPath = path.join(ROOT, 'dist', url.pathname.replace(/^\//u, ''));
    if (existsSync(rootAssetPath)) {
        serveFile(response, rootAssetPath, contentTypeForFile(rootAssetPath), request.method);
        return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function contentTypeForFile(filePath) {
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
    if (filePath.endsWith('.svg')) return 'image/svg+xml';
    if (filePath.endsWith('.png')) return 'image/png';
    return 'application/octet-stream';
}
