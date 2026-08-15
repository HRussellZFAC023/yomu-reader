#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    addGmStorageBridgeInitScript,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    installGmStorageBridgeOnCurrentPage,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    routeMockedHttpRequests,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    addUserscriptGraphInitScripts,
    userscriptCompanionPaths,
} from './lib/smoke-test-helpers.mjs';

const {
    root: ROOT,
    newTabDir: NEWTAB_DIR,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
} = createSmokePaths(import.meta.dirname);
const INJECT_USERSCRIPT = process.env.YOMU_HOSTED_SETTINGS_INJECT_USERSCRIPT === '1';
const CONTENT_TYPES_BY_EXTENSION = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.webmanifest', 'application/manifest+json'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
]);

assertBuiltArtifacts([
    SCRIPT_PATH,
    CSS_PATH,
    ...userscriptCompanionPaths(SCRIPT_PATH),
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
    learningTargetChosen: true,
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
const GM_STORAGE_PREFIX = '__yomu_hosted_settings_smoke_gm__:';
const GM_SETTINGS_STORAGE_KEY = `${GM_STORAGE_PREFIX}${YOMU_SETTINGS_KEY}`;
const STORAGE_BRIDGE_READY_EVENT = 'yomu-userscript-storage-bridge-ready';
const STORAGE_BRIDGE_REQUEST_EVENT = 'yomu-userscript-storage-request';
const HOSTED_STUDY_URL = 'https://yomureader.com/study/';
const HOSTED_STUDY_ORIGIN = new URL(HOSTED_STUDY_URL).origin;
const HOSTED_STUDY_DOCUMENT_PATHS = new Set(['/study', '/study/', '/study/index.html']);
const LATE_AUTHORITY_ACCENT = '#3f8d66';
const IMPORTED_AUTHORITY_ACCENT = '#c25d2c';
const LATE_AUTHORITY_SETTINGS = {
    ...SETTINGS,
    apiKey: '',
    jitenApiKey: '',
    bunproApiKey: '',
    bunproFrontendApiToken: '',
    wanikaniApiToken: '',
    nadeshikoApiKey: '',
    ocrCloudVisionApiKey: '',
    onboardingSeen: true,
    learningTargetChosen: true,
    interfaceLanguage: 'ja',
    theme: 'dark',
    accentColor: LATE_AUTHORITY_ACCENT,
    languageProfiles: [{
        schemaVersion: 2,
        id: 'late-authority-ja',
        outputLanguage: 'en',
        learnerLanguage: 'en',
        targetLanguage: 'ja',
        uiLocale: 'ja',
        parserProvider: 'auto',
        dictionaries: { installed: [], enabled: [], order: [] },
        definitionTranslationProviderIds: [],
    }],
    activeLanguageProfileId: 'late-authority-ja',
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
        serviceWorkers: 'block',
    });
    await context.addInitScript(({ key, settings, gmKey }) => {
        const seedMarker = '__yomuHostedSettingsSmokeSeeded';
        if (sessionStorage.getItem(seedMarker) === 'true') return;
        sessionStorage.setItem(seedMarker, 'true');
        localStorage.setItem(key, JSON.stringify(settings));
        localStorage.removeItem(gmKey);
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
    }, { key: YOMU_SETTINGS_KEY, settings: SETTINGS, gmKey: GM_SETTINGS_STORAGE_KEY });

    const page = await context.newPage();
    if (INJECT_USERSCRIPT) {
        await page.exposeFunction('__yomuHostedSettingsSmokeRequest', request => mockedUserscriptRequest(request, requests));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: SETTINGS,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: '__yomuHostedSettingsSmokeRequest',
            storagePrefix: GM_STORAGE_PREFIX,
            initialize: 'ifMissing',
        });
        await addUserscriptGraphInitScripts(page, SCRIPT_PATH);
    }
    await routeMockedHttpRequests(page, {
        requests,
        isMockedApiOrigin: url => {
            const target = proxiedTargetUrl(url) ?? url;
            return url.hostname === 'yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev'
                || target.hostname === 'jpdb.io'
                || target.hostname === 'api.jiten.moe';
        },
        mockHttpRequest: request => mockedVocabularyRequest(request, requests),
    });
    await page.route(`${HOSTED_STUDY_ORIGIN}/**`, route => {
        const url = new URL(route.request().url());
        return fulfillHostedStudyAsset(route, url.pathname);
    });
    page.on('console', message => {
        if (process.env.SMOKE_DEBUG) console.error('[hosted-settings]', message.type(), message.text());
    });
    page.on('pageerror', error => {
        if (process.env.SMOKE_DEBUG) console.error('[hosted-settings pageerror]', error.message);
    });

    const targetUrl = `${HOSTED_STUDY_URL}?q=%E8%AA%AD%E3%81%BF%E5%8F%96%E3%82%8B`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { state: 'attached', timeout: 15_000 });
    await page.waitForSelector('.jpdb-reader-newtab-more summary', { timeout: 15_000 });
    await page.locator('.jpdb-reader-newtab-more summary').click();
    if (INJECT_USERSCRIPT) {
        await page.locator('.jpdb-reader-newtab-more [data-newtab-action="settings"]').evaluate(button => {
            if (!(button instanceof HTMLButtonElement)) throw new Error('Settings menu item is not a button.');
            button.click();
        });
    } else {
        await page.locator('.jpdb-reader-newtab-more [data-newtab-action="settings"]').click();
    }
    await page.waitForSelector('.jpdb-reader-settings', { state: 'visible', timeout: 20_000 });
    const immediateHelpClick = await page.evaluate(() => new Promise(resolve => {
        const tab = document.querySelector('[data-action="settings-panel"][data-panel="help"]');
        if (!(tab instanceof HTMLButtonElement)) throw new Error('Help settings tab is unavailable.');
        const startedAt = performance.now();
        tab.click();
        requestAnimationFrame(() => resolve({
            latencyMs: Math.round(performance.now() - startedAt),
            active: tab.getAttribute('aria-selected') === 'true',
            panelVisible: !document.querySelector('[data-settings-panel="help"]')?.hasAttribute('hidden'),
        }));
    }));
    assert(immediateHelpClick.active && immediateHelpClick.panelVisible && immediateHelpClick.latencyMs < 100,
        'Help tab did not paint promptly before Japanese settings annotations started', immediateHelpClick);
    await waitForSettingsSelector(page, requests, '[data-help-links-title] .jpdb-reader-word[data-expression="便利"]');
    await waitForSettingsSelector(page, requests, '[data-help-support-copy] .jpdb-reader-word[data-expression="検索"]');
    if (INJECT_USERSCRIPT) {
        await page.waitForFunction(() => document.querySelectorAll('.jpdb-reader-settings .jpdb-reader-word').length > 0, { timeout: 60_000 })
            .catch(async error => {
                throw new Error(`${error.message}\n${JSON.stringify({
                    selector: '.jpdb-reader-settings .jpdb-reader-word',
                    snapshot: await settingsSnapshot(page),
                    parseRequests: requests
                        .filter(request => request.endpoint === 'parse')
                        .map(request => ({ chars: request.text.length, hasSettingsText: request.text.includes('設定'), preview: request.text.slice(0, 160) })),
                }, null, 2)}`);
            });
    } else {
        await waitForSettingsSelector(page, requests, '.jpdb-reader-settings h2 .jpdb-reader-word[data-expression="設定"].jpdb-pitch-heiban');
        await waitForSettingsSelector(page, requests, '.jpdb-reader-settings-search .jpdb-reader-word[data-expression="検索"].jpdb-pitch-heiban');
        await waitForSettingsSelector(page, requests, '.jpdb-reader-settings-tabs [data-panel="appearance"] .jpdb-reader-word[data-expression="外観"].jpdb-pitch-heiban');
        await waitForSettingsSelector(page, requests, '.jpdb-reader-settings > .footer [data-action="cancel"] .jpdb-reader-word[data-expression="キャンセル"]');
        await waitForSettingsSelector(page, requests, '.jpdb-reader-settings > .footer button[type="submit"] .jpdb-reader-word[data-expression="保存"]');
    }

    const initial = await settingsSnapshot(page);
    assert(initial.noUserscriptBridge === !INJECT_USERSCRIPT, INJECT_USERSCRIPT
        ? 'Hosted settings smoke did not find the injected userscript bridge'
        : 'Hosted settings smoke unexpectedly found a userscript bridge',
    initial);
    assert(initial.runtimeMarker === 'newtab', 'Hosted newtab runtime marker missing', initial);
    assert(initial.wordCount >= 8, 'Hosted settings did not enhance enough Japanese labels', initial);
    if (!INJECT_USERSCRIPT) {
        assert(initial.rubyCount >= 4, 'Hosted settings did not render ruby without userscript injection', initial);
        assert(initial.pitchCount >= 5, 'Hosted settings did not render pitch classes without userscript injection', initial);
        assert(initial.exact.title.reading && initial.exact.title.pitch, 'Settings title did not get reading and pitch metadata', { initial, requests });
        assert(initial.exact.searchLabel.hasRuby && initial.exact.searchLabel.pitch, 'Settings search label did not get ruby and pitch', initial);
        assert(initial.exact.appearanceTab.hasRuby && initial.exact.appearanceTab.pitch, 'Appearance tab did not get ruby and pitch', initial);
        assert(initial.exact.cancel.found && initial.exact.cancel.passive, 'Cancel button text did not stay passively enhanced', initial);
        assert(initial.exact.save.hasRuby && initial.exact.save.pitch && initial.exact.save.passive, 'Save button text did not get passive ruby and pitch', initial);
    }
    assert(initial.searchInputNative, 'Settings search input was not left as a native input', initial);
    assert(initial.cancelNative, 'Settings Cancel button was not left as a native button', initial);
    assert(initial.saveNative, 'Settings Save button was not left as a native submit button', initial);
    if (!INJECT_USERSCRIPT) {
        assert(initial.surfaces.some(surface => surface.text === '設定' && surface.hasRuby && surface.pitch),
            'Hosted settings title/search text was not rendered from the hosted parser path', initial);
        assert(initial.surfaces.some(surface => surface.text === '外観' && surface.hasRuby && surface.pitch),
            'Hosted settings tab text was not rendered from the hosted parser path', initial);
    }

    const tabClicks = [];
    for (const tab of [
        { panel: 'help', label: 'ヘルプ' },
        { panel: 'newTab', label: '学習' },
        { panel: 'media', label: 'メディア' },
        { panel: 'appearance', label: '外観' },
    ]) {
        tabClicks.push(await clickSettingsTab(page, tab.panel, tab.label));
    }
    await page.waitForSelector('[data-settings-panel="appearance"]:not([hidden]) .jpdb-reader-word', { timeout: 20_000 });

    const settingsSearch = page.locator('[data-settings-search]');
    await settingsSearch.click();
    await settingsSearch.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await settingsSearch.press('Backspace');
    await settingsSearch.pressSequentially('外観');
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-settings')?.getAttribute('data-settings-searching') === 'true');
    if (!INJECT_USERSCRIPT) {
        await page.waitForSelector('.jpdb-reader-settings-tabs [data-panel="appearance"] .jpdb-reader-word[data-expression="外観"]', { timeout: 20_000 });
    }
    await page.waitForTimeout(800);

    const afterSearch = await settingsSnapshot(page);
    assert(afterSearch.activePanel === 'appearance', 'Parsed settings tab click did not switch panels natively', afterSearch);
    assert(afterSearch.searchValue === '外観', 'Settings search field did not keep native input value', afterSearch);
    assert(afterSearch.visiblePanels >= 1, 'Settings search hid all matching panels', afterSearch);
    if (!INJECT_USERSCRIPT) {
        assert(afterSearch.exact.appearanceTab.hasRuby && afterSearch.exact.appearanceTab.pitch, 'Settings search did not keep the matching Japanese tab text enhanced', { afterSearch, requests });
    }
    assert(afterSearch.wordCount >= 8, 'Settings search dropped enhanced settings labels', { initial, afterSearch });

    await page.locator('.jpdb-reader-settings [data-action="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'));

    const durableStorage = INJECT_USERSCRIPT
        ? { coveredBy: 'preinstalled userscript bridge mode' }
        : await verifyDurableHostedSettings({ page, requests });
    await context.close();

    // This is intentionally a second context and a literal production origin.
    // The general self-enhancement flow above starts with a healthy local copy;
    // this one reproduces the reported failure boundary: Study starts with no
    // website settings while the installed runtime's prefixed authority exists
    // but arrives only after provisional onboarding has painted.
    const lateAuthorityRecovery = await verifyLateHostedAuthorityRegression({ browser });

    console.log(JSON.stringify({
        ok: true,
        source: INJECT_USERSCRIPT ? 'dist/newtab with dist/yomu.user.js injected' : 'dist/newtab without userscript injection',
        browser: 'chromium headless',
        url: targetUrl,
        initial: summarizeSnapshot(initial),
        afterSearch: summarizeSnapshot(afterSearch),
        tabClicks,
        immediateHelpLatencyMs: immediateHelpClick.latencyMs,
        durableStorage,
        lateAuthorityRecovery,
        parseRequests: requests
            .filter(request => request.endpoint === 'parse')
            .map(request => ({ chars: request.text.length, hasSettingsText: request.text.includes('設定') })),
    }, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function verifyLateHostedAuthorityRegression({ browser }) {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
    });
    const requests = [];
    const authoritativeRaw = JSON.stringify(LATE_AUTHORITY_SETTINGS);
    try {
        await context.addInitScript(({ origin, key, gmKey, raw }) => {
            if (location.origin !== origin) return;
            const seedMarker = '__yomuLateAuthorityRegressionSeeded';
            if (sessionStorage.getItem(seedMarker) === 'true') return;
            sessionStorage.setItem(seedMarker, 'true');
            localStorage.removeItem(key);
            window.__yomuLateAuthorityLocalSettingsAbsentAtSeed = localStorage.getItem(key) === null;
            localStorage.setItem(gmKey, raw);
        }, {
            origin: HOSTED_STUDY_ORIGIN,
            key: YOMU_SETTINGS_KEY,
            gmKey: GM_SETTINGS_STORAGE_KEY,
            raw: authoritativeRaw,
        });

        const page = await context.newPage();
        page.on('console', message => {
            if (process.env.SMOKE_DEBUG) console.error('[hosted-settings late-authority]', message.type(), message.text());
        });
        page.on('pageerror', error => {
            if (process.env.SMOKE_DEBUG) console.error('[hosted-settings late-authority pageerror]', error.message);
        });
        await page.exposeFunction('__yomuLateAuthoritySmokeRequest', request => mockedUserscriptRequest(request, requests));
        await page.route('**/*', route => fulfillLateAuthorityRequest(route, requests));
        await page.goto(HOSTED_STUDY_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.jpdb-reader-onboarding', { state: 'visible', timeout: 20_000 });

        const beforeBridge = await page.evaluate(({ key, gmKey }) => {
            window.__yomuLateAuthorityChooserClicks = 0;
            window.addEventListener('click', event => {
                if (event.target instanceof Element && event.target.closest('[data-onboarding-action]')) {
                    window.__yomuLateAuthorityChooserClicks += 1;
                }
            }, { capture: true });
            return {
                url: location.href,
                runtimeMarker: window.__YOMU_READER_RUNTIME__,
                chooserVisible: Boolean(document.querySelector('.jpdb-reader-onboarding')),
                localSettingsAbsentAtSeed: window.__yomuLateAuthorityLocalSettingsAbsentAtSeed === true,
                provisionalLocalRaw: localStorage.getItem(key),
                authoritativeRaw: localStorage.getItem(gmKey),
            };
        }, { key: YOMU_SETTINGS_KEY, gmKey: GM_SETTINGS_STORAGE_KEY });
        assert(beforeBridge.url === HOSTED_STUDY_URL,
            'Late-authority regression did not run on the exact intercepted hosted Study URL', beforeBridge);
        assert([beforeBridge.runtimeMarker === 'newtab', beforeBridge.chooserVisible].every(Boolean),
            'Hosted Study did not reach provisional onboarding before the bridge arrived', beforeBridge);
        assert(beforeBridge.localSettingsAbsentAtSeed,
            'Late-authority regression was contaminated by a website-local settings copy', beforeBridge);
        assert(beforeBridge.authoritativeRaw === authoritativeRaw,
            'Prefixed fake-GM authority was not seeded byte-for-byte before Study started', beforeBridge);

        await installHostedStorageBridge(page, '__yomuLateAuthoritySmokeRequest');

        await page.waitForFunction(() => !document.querySelector('.jpdb-reader-onboarding')
            && Boolean(document.querySelector('.jpdb-reader-newtab-shell')), undefined, { timeout: 20_000 });
        await page.waitForFunction(() => document.documentElement.classList.contains('jpdb-reader-theme-dark'), undefined, { timeout: 10_000 });
        const afterBridge = await lateAuthoritySnapshot(page);
        const chooserRetired = [afterBridge.chooserClicks === 0, !afterBridge.chooserVisible].every(Boolean);
        assert(chooserRetired,
            'Authoritative settings did not retire provisional onboarding without a chooser click', afterBridge);
        assert([afterBridge.studyRendered, afterBridge.appliedTheme === 'dark'].every(Boolean),
            'Hosted Study did not render with the authoritative dark sentinel', afterBridge);
        assert([afterBridge.activeTarget === 'ja', afterBridge.profileSchemaVersion === 2].every(Boolean),
            'Hosted Study did not recover the explicit schema-v2 Japanese target', afterBridge);
        assert(afterBridge.authoritativeRaw === authoritativeRaw,
            'Initial late-bridge reconciliation overwrote the authoritative settings blob', afterBridge);

        const backupImport = await verifyCredentialFreeBackupImport({ page, authoritativeRaw });
        return {
            url: beforeBridge.url,
            exactHostedOriginIntercepted: beforeBridge.url === HOSTED_STUDY_URL,
            localSettingsAbsentBeforeBridge: beforeBridge.localSettingsAbsentAtSeed,
            provisionalLocalBaselineObserved: beforeBridge.provisionalLocalRaw !== null,
            provisionalOnboardingObserved: beforeBridge.chooserVisible,
            chooserRetiredWithoutClick: chooserRetired,
            studyRendered: afterBridge.studyRendered,
            recoveredProfileSchemaVersion: afterBridge.profileSchemaVersion,
            recoveredTarget: afterBridge.activeTarget,
            darkSentinelApplied: afterBridge.appliedTheme === 'dark',
            authorityPreservedBeforeUserImport: afterBridge.authoritativeRaw === authoritativeRaw,
            backupImport,
        };
    } finally {
        await context.close();
    }
}

async function verifyCredentialFreeBackupImport({ page, authoritativeRaw }) {
    await openSettings(page);
    await page.locator('[data-action="settings-panel"][data-panel="backup"]').evaluate(button => {
        if (!(button instanceof HTMLButtonElement)) throw new Error('Backup settings tab is unavailable.');
        button.click();
    });
    await page.waitForSelector('[data-settings-panel="backup"]:not([hidden])', { timeout: 10_000 });
    await page.evaluate(() => {
        window.__yomuSettingsImportSaveStates = [];
        const record = () => {
            const save = document.querySelector('.jpdb-reader-settings button[type="submit"]');
            if (!(save instanceof HTMLButtonElement)) return;
            const state = {
                disabled: save.disabled,
                ariaDisabled: save.getAttribute('aria-disabled'),
                blocked: save.dataset.saveBlocked || '',
            };
            const previous = window.__yomuSettingsImportSaveStates.at(-1);
            if (JSON.stringify(previous) !== JSON.stringify(state)) window.__yomuSettingsImportSaveStates.push(state);
        };
        record();
        new MutationObserver(record).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'data-save-blocked'],
        });
    });

    const importedSettings = {
        ...LATE_AUTHORITY_SETTINGS,
        accentColor: IMPORTED_AUTHORITY_ACCENT,
    };
    const fileChooserReady = page.waitForEvent('filechooser');
    await page.locator('[data-action="import-yomitan-settings"]').click();
    const fileChooser = await fileChooserReady;
    await fileChooser.setFiles({
        name: 'yomu-credential-free-settings.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
            formatName: 'yomu-reader-settings',
            formatVersion: 3,
            exportedAt: '2026-08-15T00:00:00.000Z',
            settings: importedSettings,
        }), 'utf8'),
    });

    await page.waitForFunction(importedSettingsSaveReady, {
        gmKey: GM_SETTINGS_STORAGE_KEY,
        accent: IMPORTED_AUTHORITY_ACCENT,
    }, { timeout: 20_000 });

    const afterImport = await page.evaluate(gmKey => ({
        authoritativeRaw: localStorage.getItem(gmKey),
        saveStates: window.__yomuSettingsImportSaveStates,
        saveEnabled: document.querySelector('.jpdb-reader-settings button[type="submit"]') instanceof HTMLButtonElement
            && !document.querySelector('.jpdb-reader-settings button[type="submit"]').disabled,
    }), GM_SETTINGS_STORAGE_KEY);
    assert(afterImport.authoritativeRaw !== authoritativeRaw,
        'Credential-free backup import did not update the shared authority', afterImport);
    const saveLockObserved = settingsImportSaveLockObserved(afterImport.saveStates);
    assert(saveLockObserved,
        'Backup import did not expose its temporary Save lock to the real browser', afterImport);
    assert(afterImport.saveEnabled,
        'Save did not unlock after credential-free backup import completed', afterImport);

    await page.locator('.jpdb-reader-settings button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'), undefined, { timeout: 15_000 });
    const afterSaveRaw = await page.evaluate(gmKey => localStorage.getItem(gmKey), GM_SETTINGS_STORAGE_KEY);
    const afterSave = storedSettings(afterSaveRaw);
    assert(importedAppearanceMatches(afterSave),
        'Save did not persist the credential-free imported settings', { afterSave });

    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: {},
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuLateAuthoritySmokeRequest',
        storagePrefix: GM_STORAGE_PREFIX,
        initialize: 'ifMissing',
    });
    await addUserscriptGraphInitScripts(page, SCRIPT_PATH);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.jpdb-reader-newtab-shell', { timeout: 20_000 });
    await page.waitForFunction(importedSettingsStudyReady, {
        gmKey: GM_SETTINGS_STORAGE_KEY,
        accent: IMPORTED_AUTHORITY_ACCENT,
    }, { timeout: 20_000 });
    const afterReload = await lateAuthoritySnapshot(page);
    const reloadedSettings = storedSettings(afterReload.authoritativeRaw);
    assert(importedAppearanceMatches(reloadedSettings),
        'Credential-free import and Save did not survive a hosted Study reload', { afterReload });

    return {
        realFileChooser: true,
        credentialFieldsEmpty: importedCredentialFieldsEmpty(importedSettings),
        saveLockObserved,
        saveUnlocked: afterImport.saveEnabled,
        saveClosedDialog: true,
        importedAccent: reloadedSettings.accentColor,
        darkThemeAfterReload: afterReload.appliedTheme === 'dark',
        chooserAbsentAfterReload: !afterReload.chooserVisible,
    };
}

function settingsImportSaveLockObserved(states) {
    return states.some(state => [state.disabled, state.blocked === 'settings-import'].every(Boolean));
}

function importedCredentialFieldsEmpty(settings) {
    return [
        'apiKey',
        'jitenApiKey',
        'bunproApiKey',
        'bunproFrontendApiToken',
        'wanikaniApiToken',
        'nadeshikoApiKey',
        'ocrCloudVisionApiKey',
    ].every(key => settings[key] === '');
}

function storedSettings(raw) {
    return JSON.parse(raw || 'null');
}

function importedAppearanceMatches(settings) {
    return [
        settings?.accentColor === IMPORTED_AUTHORITY_ACCENT,
        settings?.theme === 'dark',
    ].every(Boolean);
}

async function lateAuthoritySnapshot(page) {
    return await page.evaluate(captureLateAuthoritySnapshotInPage, GM_SETTINGS_STORAGE_KEY);
}

function captureLateAuthoritySnapshotInPage(gmKey) {
    const parseStoredSettings = key => {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    };
    const activeProfile = settings => {
        if (!settings || !Array.isArray(settings.languageProfiles)) return undefined;
        const selected = settings.languageProfiles.find(item => item && item.id === settings.activeLanguageProfileId);
        return selected ?? settings.languageProfiles[0];
    };
    const profileValue = (profile, key, fallback) => {
        if (!profile) return fallback;
        const value = profile[key];
        return value == null ? fallback : value;
    };
    const appliedTheme = () => {
        if (document.documentElement.classList.contains('jpdb-reader-theme-dark')) return 'dark';
        if (document.documentElement.classList.contains('jpdb-reader-theme-light')) return 'light';
        return '';
    };
    const settings = parseStoredSettings(gmKey);
    const profile = activeProfile(settings);
    return {
        authoritativeRaw: localStorage.getItem(gmKey),
        chooserClicks: window.__yomuLateAuthorityChooserClicks || 0,
        chooserVisible: Boolean(document.querySelector('.jpdb-reader-onboarding')),
        studyRendered: Boolean(document.querySelector('.jpdb-reader-newtab-shell')),
        appliedTheme: appliedTheme(),
        activeTarget: profileValue(profile, 'targetLanguage', ''),
        profileSchemaVersion: profile?.schemaVersion ?? null,
        storageBridge: document.documentElement.dataset.yomuUserscriptStorageBridge === 'true',
    };
}

function importedSettingsSaveReady({ gmKey, accent }) {
    const stored = JSON.parse(localStorage.getItem(gmKey) || 'null');
    const save = document.querySelector('.jpdb-reader-settings button[type="submit"]');
    return [
        stored?.accentColor === accent,
        save instanceof HTMLButtonElement,
        save?.disabled === false,
        save?.getAttribute('aria-disabled') !== 'true',
    ].every(Boolean);
}

function importedSettingsStudyReady({ gmKey, accent }) {
    const stored = JSON.parse(localStorage.getItem(gmKey) || 'null');
    return [
        stored?.accentColor === accent,
        stored?.theme === 'dark',
        document.documentElement.classList.contains('jpdb-reader-theme-dark'),
        !document.querySelector('.jpdb-reader-onboarding'),
    ].every(Boolean);
}

async function installHostedStorageBridge(page, requestBridgeName) {
    await installGmStorageBridgeOnCurrentPage(page, {
        key: YOMU_SETTINGS_KEY,
        value: {},
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName,
        storagePrefix: GM_STORAGE_PREFIX,
        initialize: 'ifMissing',
    });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.evaluate(readyEvent => {
        // After the content-world bridge captures its accessors, page code must
        // consume the DOM bridge rather than reaching fake GM globals directly.
        delete window.GM;
        delete window.GM_getValue;
        delete window.GM_setValue;
        delete window.GM_deleteValue;
        delete window.GM_listValues;
        window.dispatchEvent(new CustomEvent(readyEvent));
    }, STORAGE_BRIDGE_READY_EVENT);
}

async function fulfillLateAuthorityRequest(route, requests) {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === HOSTED_STUDY_ORIGIN) return fulfillHostedStudyAsset(route, url.pathname);
    return fulfillLateAuthorityExternalRequest(route, request, requests);
}

async function fulfillHostedStudyAsset(route, pathname) {
    const filePath = hostedStudyAssetPath(pathname);
    if (!filePath) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return route.fulfill({
        status: 200,
        contentType: contentTypeForFile(filePath),
        body: readFileSync(filePath),
    });
}

async function fulfillLateAuthorityExternalRequest(route, request, requests) {
    if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: lateAuthorityCorsHeaders() });
    }
    const payload = {
        method: request.method(),
        url: request.url(),
        data: request.postData(),
    };
    const mocked = Object.assign(jsonHttpResponse({}), mockedVocabularyRequest(payload, requests));
    return route.fulfill({
        status: mocked.status,
        headers: Object.assign(lateAuthorityCorsHeaders(), mocked.headers),
        contentType: mocked.contentType,
        body: mocked.responseText,
    });
}

function hostedStudyAssetPath(pathname) {
    if (HOSTED_STUDY_DOCUMENT_PATHS.has(pathname)) return path.join(NEWTAB_DIR, 'index.html');
    if (pathname.startsWith('/study/')) return resolvedHostedAsset(NEWTAB_DIR, pathname.slice('/study/'.length));
    return resolvedHostedAsset(path.join(ROOT, 'dist'), pathname.replace(/^\//u, ''));
}

function resolvedHostedAsset(base, relative) {
    const candidate = path.resolve(base, relative);
    const safePrefix = `${path.resolve(base)}${path.sep}`;
    if (!candidate.startsWith(safePrefix)) return null;
    return existsSync(candidate) ? candidate : null;
}

function lateAuthorityCorsHeaders() {
    return {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
}

async function verifyDurableHostedSettings({ page, requests }) {
    const startedAt = Date.now();
    const { localSave, localOnly } = await verifyLocalOnlyHostedSettings(page);
    const { afterPromotion, runtimeBridgeRequests } = await verifyLateBridgePromotion(
        page,
        requests,
        localSave,
    );
    const afterLocalReset = await verifyGmSettingsSurviveLocalReset(page, localSave);
    return {
        elapsedMs: Date.now() - startedAt,
        savedTheme: localSave.savedTheme,
        pendingBeforeInstall: pendingHostedTheme(localOnly.local) === localSave.savedTheme,
        gmSeparatedFromWebsiteKey: GM_SETTINGS_STORAGE_KEY !== YOMU_SETTINGS_KEY,
        runtimeBridgeGetRequests: runtimeBridgeRequests,
        promotedToGm: storedTheme(afterPromotion.gm) === localSave.savedTheme,
        restoredAfterLocalStorageClear: afterLocalReset.appliedTheme === localSave.savedTheme,
        storageBridgeAfterReload: afterLocalReset.storageBridge,
    };
}

async function verifyLocalOnlyHostedSettings(page) {
    await openSettings(page);
    const localSave = await page.evaluate(() => {
        const input = document.querySelector('[data-theme-value]');
        const toggle = document.querySelector('[data-theme-switch]');
        const form = document.querySelector('.jpdb-reader-settings');
        if (!(input instanceof HTMLInputElement) || !(toggle instanceof HTMLButtonElement) || !(form instanceof HTMLFormElement)) {
            throw new Error('Theme controls were unavailable for the local-only save.');
        }
        const previousTheme = input.value;
        toggle.click();
        const savedTheme = input.value;
        return { previousTheme, savedTheme };
    });
    await page.locator('.jpdb-reader-settings button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'));
    const localOnly = await readStorageState(page);
    assert(storedTheme(localOnly.local) === localSave.savedTheme,
        'Hosted settings save did not persist to website localStorage before installation', { localSave, localOnly });
    assert(pendingHostedTheme(localOnly.local) === localSave.savedTheme,
        'Bridge-less hosted save was not marked for later GM promotion', { localSave, localOnly });
    assert(localOnly.gm === null, 'Local-only settings leaked into the isolated GM namespace before installation', localOnly);
    return { localSave, localOnly };
}

async function verifyLateBridgePromotion(page, requests, localSave) {
    await page.evaluate(requestEvent => {
        const objectDetail = detail => {
            if (!detail || typeof detail !== 'object') return null;
            return detail;
        };
        const normalizedDetail = detail => {
            if (typeof detail !== 'string') return objectDetail(detail);
            try { return objectDetail(JSON.parse(detail)); } catch { return null; }
        };
        window.__yomuHostedSettingsBridgeRequests = [];
        window.addEventListener(requestEvent, event => {
            const detail = normalizedDetail(event.detail);
            if (detail) window.__yomuHostedSettingsBridgeRequests.push(detail);
        });
    }, STORAGE_BRIDGE_REQUEST_EVENT);
    if (!INJECT_USERSCRIPT) {
        await page.exposeFunction('__yomuHostedSettingsSmokeRequest', request => mockedUserscriptRequest(request, requests));
    }
    await installHostedStorageBridge(page, '__yomuHostedSettingsSmokeRequest');
    await page.waitForFunction(({ key, gmKey }) => {
        const parse = raw => {
            try { return JSON.parse(raw || 'null'); } catch { return null; }
        };
        const theme = settings => settings && settings.theme;
        const pending = settings => settings && settings.__yomuHostedPendingGmPatch;
        if (document.documentElement.dataset.yomuUserscriptStorageBridge !== 'true') return false;
        const gm = parse(localStorage.getItem(gmKey));
        const local = parse(localStorage.getItem(key));
        return Boolean(theme(gm)) && theme(gm) === theme(local) && pending(local) == null;
    }, { key: YOMU_SETTINGS_KEY, gmKey: GM_SETTINGS_STORAGE_KEY });
    const afterPromotion = await readStorageState(page);
    assert(storedTheme(afterPromotion.gm) === localSave.savedTheme,
        'Late userscript bridge did not promote the local-only website save into GM storage', { localSave, afterPromotion });
    assert(pendingHostedPatch(afterPromotion.local) == null,
        'Successful GM promotion left the website copy marked pending', afterPromotion);
    const runtimeBridgeRequests = await page.evaluate(key => window.__yomuHostedSettingsBridgeRequests
        .filter(request => request?.op === 'get' && request?.key === key).length, YOMU_SETTINGS_KEY);
    assert(runtimeBridgeRequests >= 1,
        'Late storage bridge did not trigger a settings reload in the running NewTabRuntime', {
            runtimeBridgeRequests,
            runtimeMarker: afterPromotion.runtimeMarker,
            storageBridge: afterPromotion.storageBridge,
        });
    return { afterPromotion, runtimeBridgeRequests };
}

async function verifyGmSettingsSurviveLocalReset(page, localSave) {
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: {},
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuHostedSettingsSmokeRequest',
        storagePrefix: GM_STORAGE_PREFIX,
        initialize: 'ifMissing',
    });
    await addUserscriptGraphInitScripts(page, SCRIPT_PATH);
    await page.evaluate(key => localStorage.removeItem(key), YOMU_SETTINGS_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { state: 'attached', timeout: 15_000 });
    await page.waitForFunction(theme => document.documentElement.classList.contains(`jpdb-reader-theme-${theme}`), localSave.savedTheme);
    const afterLocalReset = await readStorageState(page);
    assert(afterLocalReset.appliedTheme === localSave.savedTheme && afterLocalReset.gm?.theme === localSave.savedTheme,
        'Clearing website localStorage lost settings that should survive in GM storage', { localSave, afterLocalReset });
    assert(afterLocalReset.runtimeMarker === 'newtab' && afterLocalReset.storageBridge,
        'Reloaded hosted NewTabRuntime did not use the userscript storage bridge', afterLocalReset);
    return afterLocalReset;
}

function storedTheme(settings) {
    return settings ? settings.theme : undefined;
}

function pendingHostedPatch(settings) {
    return settings ? settings.__yomuHostedPendingGmPatch : undefined;
}

function pendingHostedTheme(settings) {
    return storedTheme(pendingHostedPatch(settings));
}

async function openSettings(page) {
    await page.locator('.jpdb-reader-newtab-more summary').click();
    await page.locator('.jpdb-reader-newtab-more [data-newtab-action="settings"]').evaluate(button => {
        if (!(button instanceof HTMLButtonElement)) throw new Error('Settings menu item is not a button.');
        button.click();
    });
    await page.waitForSelector('.jpdb-reader-settings', { state: 'visible', timeout: 20_000 });
}

async function readStorageState(page) {
    return await page.evaluate(({ key, gmKey }) => {
        const parse = raw => {
            try { return JSON.parse(raw || 'null'); } catch { return null; }
        };
        return {
            local: parse(localStorage.getItem(key)),
            gm: parse(localStorage.getItem(gmKey)),
            runtimeMarker: window.__YOMU_READER_RUNTIME__,
            storageBridge: document.documentElement.dataset.yomuUserscriptStorageBridge === 'true',
            appliedTheme: document.documentElement.classList.contains('jpdb-reader-theme-dark')
                ? 'dark'
                : document.documentElement.classList.contains('jpdb-reader-theme-light') ? 'light' : '',
        };
    }, { key: YOMU_SETTINGS_KEY, gmKey: GM_SETTINGS_STORAGE_KEY });
}

function mockedUserscriptRequest(request, requestsLog) {
    const url = new URL(request.url);
    if (url.origin !== 'https://jpdb.io') {
        return {
            status: 200,
            responseText: '',
        };
    }
    if (!url.pathname.startsWith('/api/v1/')) {
        return {
            status: 200,
            responseText: '<!doctype html><html><body></body></html>',
        };
    }
    const endpoint = url.pathname.slice('/api/v1/'.length);
    const body = readJsonBody(request.data);
    requestsLog.push({ kind: 'userscript-jpdb', endpoint, text: jpdbParseText(body) });
    const payload = endpoint === 'parse'
        ? mockJpdbParseFromVocabulary(body, VOCABULARY)
        : endpoint === 'ping'
            ? {}
            : endpoint === 'list-user-decks'
                ? { decks: [[1, 'Smoke deck', 0, 0]] }
                : endpoint === 'deck/list-vocabulary'
                    ? { vocabulary: [] }
                    : endpoint === 'lookup-vocabulary'
                        ? { vocabulary_info: [] }
                        : {};
    return {
        status: 200,
        responseText: JSON.stringify(payload),
    };
}

function mockedVocabularyRequest(request, requestsLog) {
    const jiten = mockedJitenPublicRequest(request, requestsLog);
    if (jiten) return jiten;
    return mockedJpdbRequest(request, requestsLog);
}

function mockedJitenPublicRequest(request, requestsLog) {
    const url = proxiedTargetUrl(new URL(request.url)) ?? new URL(request.url);
    if (url.origin !== 'https://api.jiten.moe') return null;
    requestsLog.push({ kind: 'jiten-public', endpoint: url.pathname, text: url.searchParams.get('text') ?? '' });
    if (url.pathname === '/api/vocabulary/parse') {
        const text = url.searchParams.get('text') ?? '';
        return jsonHttpResponse(jitenPublicParse(text));
    }
    const match = url.pathname.match(/^\/api\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (match) return jsonHttpResponse(jitenPublicInfo(Number(match[1]), Number(match[2])));
    return jsonHttpResponse({});
}

function mockedJpdbRequest(request, requestsLog) {
    const url = proxiedTargetUrl(new URL(request.url)) ?? new URL(request.url);
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

function proxiedTargetUrl(url) {
    const target = url.searchParams.get('url');
    if (!target) return null;
    try {
        return new URL(target);
    } catch {
        return null;
    }
}

function jitenPublicParse(text) {
    return VOCABULARY
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => text.includes(row[1]) || text.includes(row[0]))
        .map(({ row, index }) => ({
            wordId: 700000 + index,
            originalText: row[1],
            readingIndex: 0,
            conjugations: [],
        }));
}

function jitenPublicInfo(wordId, readingIndex) {
    const row = VOCABULARY[wordId - 700000];
    if (!row) return {};
    const [, spelling, reading, meaning, partOfSpeech, frequencyRank, , pitchAccent] = row;
    return {
        wordId,
        mainReading: {
            text: annotatedJitenReading(spelling, reading),
            readingIndex,
            frequencyRank,
            usedInMediaAmount: 1,
        },
        alternativeReadings: [],
        partsOfSpeech: partOfSpeech,
        definitions: [{ index: 1, meanings: [meaning], partsOfSpeech: partOfSpeech }],
        pitchAccents: [pitchPositionFromPattern(pitchAccent[0] ?? '')],
        knownStates: [],
        composedOf: [],
        usedIn: [],
        usedInTotal: 0,
    };
}

function annotatedJitenReading(spelling, reading) {
    return spelling === reading ? spelling : `${spelling}[${reading}]`;
}

function pitchPositionFromPattern(pattern) {
    const drop = Array.from(pattern).findIndex((level, index, levels) => level === 'H' && levels[index + 1] === 'L');
    return drop >= 0 ? drop + 1 : 0;
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

async function clickSettingsTab(page, panel, label) {
    const selector = `[data-action="settings-panel"][data-panel="${panel}"]`;
    const tab = page.locator(selector);
    await tab.waitFor({ state: 'visible', timeout: 20_000 }).catch(async error => {
        throw new Error(`Settings ${label} tab was not visible before click.\n${JSON.stringify(await settingsSnapshot(page), null, 2)}\n${error.message}`);
    });
    await tab.click();
    await page.waitForFunction(
        expectedPanel => document.querySelector(`[data-action="settings-panel"][data-panel="${expectedPanel}"]`)?.getAttribute('aria-selected') === 'true',
        panel,
    ).catch(async error => {
        throw new Error(`Settings ${label} tab did not activate after user click.\n${JSON.stringify(await settingsSnapshot(page), null, 2)}\n${error.message}`);
    });
    await page.waitForTimeout(120);
    const snapshot = await settingsSnapshot(page);
    assert(snapshot.activePanel === panel, `Settings ${label} tab did not become the active panel`, snapshot);
    assert(snapshot.popoverCount === 0, `Settings ${label} tab click opened a reader lookup popover`, snapshot);
    return {
        panel,
        label,
        activePanel: snapshot.activePanel,
        popoverCount: snapshot.popoverCount,
    };
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
        popoverCount: snapshot.popoverCount,
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
        const tabs = [...document.querySelectorAll('.jpdb-reader-settings [data-action="settings-panel"]')]
            .filter(tab => tab instanceof HTMLElement)
            .map(tab => {
                const rect = tab.getBoundingClientRect();
                const style = getComputedStyle(tab);
                return {
                    panel: tab.dataset.panel ?? '',
                    text: tab.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                    hidden: tab.hidden,
                    ariaSelected: tab.getAttribute('aria-selected'),
                    display: style.display,
                    visibility: style.visibility,
                    opacity: style.opacity,
                    rect: {
                        left: Math.round(rect.left),
                        top: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    },
                    offsetParent: Boolean(tab.offsetParent),
                };
            });
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
            pitchCount: words.filter(word => /\bjpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka)\b/u.test(word.className)).length,
            passiveCount: words.filter(word => word.dataset.jpdbReaderPassive === 'true').length,
            searchInputNative: document.querySelector('[data-settings-search]') instanceof HTMLInputElement
                && !document.querySelector('[data-settings-search] .jpdb-reader-word'),
            cancelNative: document.querySelector('.jpdb-reader-settings [data-action="cancel"]') instanceof HTMLButtonElement,
            saveNative: document.querySelector('.jpdb-reader-settings button[type="submit"]') instanceof HTMLButtonElement,
            activePanel: selectedTab instanceof HTMLElement ? selectedTab.dataset.panel : '',
            tabs,
            visiblePanels: visiblePanels.length,
            searchValue: document.querySelector('[data-settings-search]') instanceof HTMLInputElement
                ? document.querySelector('[data-settings-search]').value
                : '',
            popoverCount: document.querySelectorAll('.jpdb-reader-popover').length,
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
    return CONTENT_TYPES_BY_EXTENSION.get(path.extname(filePath)) ?? 'application/octet-stream';
}
