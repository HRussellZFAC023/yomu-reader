#!/usr/bin/env node
// Packaging boundary: execute exactly the immutable @requires named by the
// built header, then the userscript, on a plain page and a YouTube-shaped URL.
// These are deterministic fixtures for boot behavior, not visual QA evidence.
import { chromium } from 'playwright';
import {
    YOMU_SETTINGS_KEY,
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    installUserscriptCssResource,
} from './lib/smoke-test-helpers.mjs';

const { cssPath: CSS_PATH, root: ROOT, scriptPath: SCRIPT_PATH } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    localDictionariesEnabled: false,
    preferJapaneseSiteLanguage: false,
    showFloatingButton: true,
    enableLogging: false,
};

function settingsForTarget(targetLanguage) {
    return {
        ...settings,
        activeLanguageProfileId: 'boot-smoke',
        languageProfiles: [{
            schemaVersion: 2,
            id: 'boot-smoke',
            outputLanguage: 'en',
            learnerLanguage: 'en',
            targetLanguage,
            uiLocale: 'en',
            parserProvider: 'auto',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: [],
        }],
    };
}

const fixture = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>Plain boot fixture</title></head><body><main>Plain page</main></body></html>');
});
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const reports = [
        await bootScenario('plain', fixture.origin, 'ja'),
        await bootScenario('youtube', 'https://www.youtube.com/watch?v=yomu-runtime-boot', 'ko'),
    ];
    console.log(JSON.stringify({ fixture: true, reports }, null, 2));
    console.log('userscript boot smoke passed');
} finally {
    await closeSmokeBrowserAndServer(browser, fixture.server);
}

async function bootScenario(name, url, targetLanguage) {
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /\bYomu\b/i.test(message.text())) errors.push(message.text());
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settingsForTarget(targetLanguage),
    });
    if (name === 'youtube') {
        await page.route('https://www.youtube.com/**', route => route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><html><head><title>YouTube boot fixture</title></head><body><main id="movie_player"><video></video></main></body></html>',
        }));
    }
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH);
        // Reads the built header and injects its content-addressed @requires in
        // metadata order before executing the main userscript.
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForSelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]', {
            state: 'attached',
            timeout: 15_000,
        });
        await page.waitForSelector('.jpdb-reader-fab', { timeout: 15_000 });
        const snapshot = await page.evaluate(() => {
            const marker = document.querySelector('#jpdb-reader-runtime-owner');
            return {
                href: location.href,
                runtimeKind: marker?.getAttribute('data-yomu-runtime-kind') ?? '',
                runtimeHealth: marker?.getAttribute('data-yomu-runtime-health') ?? '',
                missingServices: marker?.getAttribute('data-yomu-runtime-missing-services') ?? '',
                companionSlots: Object.keys(globalThis.__yomuCompanions ?? {}).sort(),
                targetLanguage: globalThis.__yomuCompanions?.learningTargets?.activeLearningTargetLanguage?.() ?? '',
                fab: Boolean(document.querySelector('.jpdb-reader-fab')),
                video: Boolean(document.querySelector('video')),
            };
        });
        assert(snapshot.runtimeKind === 'userscript', `${name}: built artifact did not claim userscript runtime`, snapshot);
        assert(snapshot.runtimeHealth === 'ready', `${name}: runtime health is not ready`, snapshot);
        assert(snapshot.missingServices === '', `${name}: consolidated runtime missed companion services`, snapshot);
        assert(snapshot.targetLanguage === targetLanguage, `${name}: core and runtime disagree on the active learning target`, snapshot);
        assert(snapshot.fab, `${name}: reader FAB did not boot`, snapshot);
        assert(errors.length === 0, `${name}: userscript boot emitted errors`, { errors, snapshot });
        return { name, ...snapshot };
    } finally {
        await context.close();
    }
}
