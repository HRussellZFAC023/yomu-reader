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

    const page = await context.newPage();
    page.on('console', message => {
        if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1_000));
    });
    page.on('pageerror', error => report.pageErrors.push(error.message.slice(0, 1_000)));
    const navigationAt = Date.now();
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 70_000 });
    await page.waitForSelector('#jpdb-reader-installed-runtime', { state: 'attached', timeout: 20_000 });
    await page.waitForFunction(() => {
        const owner = document.querySelector('#jpdb-reader-runtime-owner');
        return owner?.getAttribute('data-yomu-runtime-health') === 'ready';
    }, null, { timeout: 35_000 });
    report.activationMs = Date.now() - navigationAt;
    report.state = await page.evaluate(() => {
        const installed = document.querySelector('#jpdb-reader-installed-runtime');
        const owner = document.querySelector('#jpdb-reader-runtime-owner');
        const attribute = (element, name) => element ? element.getAttribute(name) || '' : '';
        return {
            href: location.href,
            installedKind: attribute(installed, 'data-yomu-installed-runtime-kind'),
            runtimeKind: attribute(owner, 'data-yomu-runtime-kind'),
            runtimeHealth: attribute(owner, 'data-yomu-runtime-health'),
            runtimeServices: attribute(owner, 'data-yomu-runtime-services'),
            puckVisible: Boolean(document.querySelector('.jpdb-reader-fab')),
            onboardingVisible: Boolean(document.querySelector('.jpdb-reader-onboarding')),
        };
    });
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
