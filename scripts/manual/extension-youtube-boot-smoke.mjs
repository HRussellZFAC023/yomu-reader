// Real-browser boundary probe for the packaged Chromium extension on YouTube.
// This deliberately loads the built extension in an isolated content-script
// world: injecting dist/yomu.user.js into the page cannot catch extension-only
// globals such as YouTube exposing `customElements` as null there.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    chromiumExtensionSmokeConfig,
    createChromiumExtensionSmokeScope,
} from '../lib/chromium-extension-smoke.mjs';
import { createReaderSmokeSettings, YOMU_SETTINGS_KEY } from '../lib/smoke-harness.mjs';

const smokeConfig = chromiumExtensionSmokeConfig(import.meta.url, 'manual-extension-youtube-boot');
const EXT_PACKAGE = smokeConfig.extensionPackage;
const TARGET_URL = process.env.YOMU_EXTENSION_YOUTUBE_URL
    || 'https://www.youtube.com/watch?v=TAorfFcb8_g&hl=ja&gl=JP';
const ARTIFACT_DIR = smokeConfig.artifactDirectory;
const EXPECTED_RUNTIME_SERVICES = [
    'localization',
    'local-dictionary',
    'jiten',
    'yomu-srs',
    'jpdb',
    'bunpro',
    'translation',
    'grammar',
    'mining',
    'anki',
    'annotation-layout',
    'pitch',
    'audio',
    'nested-lookup',
];
const temporaryDirectories = createChromiumExtensionSmokeScope();
mkdirSync(ARTIFACT_DIR, { recursive: true });

const startedAt = Date.now();
const report = {
    targetUrl: TARGET_URL,
    extensionDirectory: '',
    consoleErrors: [],
    pageErrors: [],
    firstRunState: null,
    settingsSeeded: false,
    state: null,
};
let context;

try {
    const extensionDir = temporaryDirectories.extensionDirectory(EXT_PACKAGE, 'yomu-chrome-youtube-package-');
    const profile = temporaryDirectories.createDirectory('yomu-extension-youtube-profile-');
    report.extensionDirectory = extensionDir;
    context = await chromium.launchPersistentContext(profile, {
        headless: false,
        viewport: { width: 1_280, height: 800 },
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
            '--no-first-run',
            '--window-size=1280,900',
        ],
    });
    let worker = context.serviceWorkers().find(candidate => candidate.url().startsWith('chrome-extension://'));
    while (!worker) {
        const candidate = await context.waitForEvent('serviceworker', { timeout: 15_000 });
        if (candidate.url().startsWith('chrome-extension://')) worker = candidate;
    }
    report.serviceWorkerUrl = worker.url();
    report.serviceWorkerReadyMs = Date.now() - startedAt;

    const firstRunPage = await context.newPage();
    recordPageFailures(firstRunPage, report);
    await firstRunPage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 70_000 });
    await firstRunPage.waitForSelector('#jpdb-reader-installed-runtime', { state: 'attached', timeout: 20_000 });
    await firstRunPage.locator('.jpdb-reader-onboarding-trusted-launcher')
        .waitFor({ state: 'visible', timeout: 35_000 });
    report.firstRunState = await firstRunPage.evaluate(() => {
        const installed = document.querySelector('#jpdb-reader-installed-runtime');
        const owner = document.querySelector('#jpdb-reader-runtime-owner');
        const attribute = (element, name) => element ? element.getAttribute(name) || '' : '';
        const launcher = document.querySelector('.jpdb-reader-onboarding-trusted-launcher');
        return {
            installedKind: attribute(installed, 'data-yomu-installed-runtime-kind'),
            runtimeKind: attribute(owner, 'data-yomu-runtime-kind'),
            runtimeHealth: attribute(owner, 'data-yomu-runtime-health'),
            launcherVisible: Boolean(launcher),
            openActionVisible: Boolean(launcher?.querySelector('[data-onboarding-action="open-trusted-setup"]')),
            sensitiveControlCount: launcher?.querySelectorAll('form, input, select, textarea, output').length ?? 0,
        };
    });
    assertPrivateFirstRunLauncher(report.firstRunState);
    await firstRunPage.screenshot({ path: path.join(ARTIFACT_DIR, 'youtube-extension-first-run.png') });
    await firstRunPage.close();

    const extensionSettingsPage = await context.newPage();
    await extensionSettingsPage.goto(`${worker.url().replace(/\/background\.js.*$/, '')}/popup.html`);
    await extensionSettingsPage.evaluate(async ({ name, value }) => chrome.runtime.sendMessage({
        channel: 'userscript-compiler',
        type: 'GM_setValue',
        payload: { name, value },
    }), {
        name: YOMU_SETTINGS_KEY,
        value: createReaderSmokeSettings({
            onboardingSeen: true,
            learningTargetChosen: true,
            showFloatingButton: true,
            activeLanguageProfileId: 'extension-youtube-smoke',
            languageProfiles: [{
                schemaVersion: 2,
                id: 'extension-youtube-smoke',
                outputLanguage: 'en',
                learnerLanguage: 'en',
                targetLanguage: 'ja',
                uiLocale: 'en',
                parserProvider: 'auto',
                dictionaries: { installed: [], enabled: [], order: [] },
                definitionTranslationProviderIds: [],
            }],
        }),
    });
    report.settingsSeeded = true;
    await extensionSettingsPage.close();

    const page = await context.newPage();
    recordPageFailures(page, report);
    const navigationAt = Date.now();
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 70_000 });
    await page.waitForSelector('#jpdb-reader-installed-runtime', { state: 'attached', timeout: 20_000 });
    await page.waitForFunction(() => {
        const owner = document.querySelector('#jpdb-reader-runtime-owner');
        return owner?.getAttribute('data-yomu-runtime-health') === 'ready';
    }, null, { timeout: 35_000 });
    report.activationMs = Date.now() - navigationAt;
    const runtimeState = await page.evaluate(() => {
        const installed = document.querySelector('#jpdb-reader-installed-runtime');
        const owner = document.querySelector('#jpdb-reader-runtime-owner');
        const attribute = (element, name) => element ? element.getAttribute(name) || '' : '';
        return {
            href: location.href,
            installedKind: attribute(installed, 'data-yomu-installed-runtime-kind'),
            runtimeKind: attribute(owner, 'data-yomu-runtime-kind'),
            runtimeHealth: attribute(owner, 'data-yomu-runtime-health'),
            runtimeServices: attribute(owner, 'data-yomu-runtime-services'),
        };
    });
    await page.locator('.jpdb-reader-fab:visible, .jpdb-reader-onboarding:visible')
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 });
    report.state = {
        ...runtimeState,
        puckVisible: await page.locator('.jpdb-reader-fab').isVisible(),
        onboardingVisible: await page.locator('.jpdb-reader-onboarding').isVisible(),
    };
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'youtube-extension-boot.png') });

    const initializationErrors = [...report.consoleErrors, ...report.pageErrors]
        .filter(message => /\[Yomu Reader\] Failed to initialize|whenDefined/i.test(message));
    const runtimeServices = report.state.runtimeServices.split(',').filter(Boolean);
    const missingServices = EXPECTED_RUNTIME_SERVICES.filter(service => !runtimeServices.includes(service));
    const unexpectedServices = runtimeServices.filter(service => !EXPECTED_RUNTIME_SERVICES.includes(service));
    if (report.state.installedKind !== 'extension') throw new Error('Installed runtime marker did not identify the extension.');
    if (report.state.runtimeKind !== 'extension') throw new Error('The extension did not retain Reader ownership on YouTube.');
    if (report.state.runtimeHealth !== 'ready') throw new Error(`Reader health was ${report.state.runtimeHealth || 'missing'}.`);
    if (runtimeServices.length !== EXPECTED_RUNTIME_SERVICES.length || missingServices.length || unexpectedServices.length) {
        throw new Error(`Reader service contract mismatch: missing [${missingServices.join(', ')}], unexpected [${unexpectedServices.join(', ')}].`);
    }
    if (!report.state.puckVisible && !report.state.onboardingVisible) throw new Error('Neither the puck nor first-run welcome was visible.');
    if (initializationErrors.length) throw new Error(`Reader initialization errors: ${initializationErrors.join('\n')}`);
} finally {
    try {
        writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    } finally {
        await context?.close().catch(() => undefined);
        temporaryDirectories.cleanup();
    }
}

console.log(JSON.stringify(report, null, 2));

function recordPageFailures(page, targetReport) {
    page.on('console', message => {
        if (message.type() === 'error') targetReport.consoleErrors.push(message.text().slice(0, 1_000));
    });
    page.on('pageerror', error => targetReport.pageErrors.push(error.message.slice(0, 1_000)));
}

function assertPrivateFirstRunLauncher(state) {
    assertSmoke(state.installedKind === 'extension', 'Fresh-profile installed runtime mismatch', state);
    assertSmoke(state.runtimeKind === 'extension', 'Fresh-profile runtime ownership mismatch', state);
    assertSmoke(state.launcherVisible, 'Fresh-profile Study launcher was unavailable', state);
    assertSmoke(state.openActionVisible, 'Fresh-profile Study launcher action was unavailable', state);
    assertSmoke(state.sensitiveControlCount === 0, 'Fresh-profile off-host launcher exposed sensitive controls', state);
    assertSmoke(!state.runtimeHealth, 'Fresh-profile runtime reported ready before target choice', state);
}

function assertSmoke(condition, message, state) {
    if (!condition) throw new Error(`${message}: ${JSON.stringify(state)}`);
}
