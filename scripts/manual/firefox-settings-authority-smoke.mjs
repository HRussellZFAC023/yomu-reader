#!/usr/bin/env node
/**
 * Real Firefox proof for the packaged Study/settings authority boundary.
 *
 * Playwright's Firefox build cannot install WebExtensions. This probe instead
 * runs a disposable copy of the final Firefox package with Mozilla's web-ext
 * runner. The copy gets observation-only content scripts plus a storage-fault
 * wrapper; the original XPI/unpacked package is hashed and never modified.
 *
 * Automated phases prove namespace migration and bidirectional live transport.
 * The remaining phases deliberately require trusted Firefox UI interaction so
 * a synthetic click cannot turn the acceptance run green.
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_PACKAGE = path.join(
    ROOT,
    'dist',
    'extension',
    'release',
    'firefox',
    'yomureader.com-firefox.xpi',
);
const DEFAULT_FIREFOX = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const DEFAULT_EXPECTED_VERSION = '1.9.3';
const WEB_EXT_VERSION = '10.5.0';
const ADDON_ID = 'yomu@yomureader.com';
const FIXED_EXTENSION_UUID = '6cf192a5-a8f2-4b2d-9863-8fb1b3454a93';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const INTENT_KEY = 'yomu:settings-intent:v2';
const PRIVATE_KEY = 'yomu:private:academy-device:v1';
const PRIVATE_VALUE = 'non-secret-firefox-smoke-device';
const UNRELATED_KEY = 'firefox-settings-authority-smoke-unrelated';
const UNRELATED_VALUE = 'keep-unrelated-v1';
const SCENARIO_KEY = 'firefox-settings-authority-smoke.scenario';
const SEEDED_KEY_PREFIX = 'firefox-settings-authority-smoke.seeded.';
const FAULT_KEY = 'firefox-settings-authority-smoke.fail-next-settings-write';
const ARTICLE_OPENED_KEY = 'firefox-settings-authority-smoke.article-opened';
const LIVE_WRITE_KEY = 'firefox-settings-authority-smoke.live-write-issued';
const REQUESTED_PANEL_KEY = 'firefox-settings-authority-smoke.requested-panel';
const LAUNCHER_PROOF_KEY = 'firefox-settings-authority-smoke.launcher-proof';
const REQUIRED_AUTOMATED_EVENTS = Object.freeze([
    'migration-raw-only',
    'migration-prefixed-only',
    'migration-divergent',
    'reader-ready',
    'study-write-issued',
    'reader-observed-study-write',
    'reader-write-issued',
    'reader-final-state',
    'study-observed-reader-write',
    'study-final-state',
]);
const VALUE_ARGUMENT_FIELDS = Object.freeze({
    '--package': 'packagePath',
    '--expected-version': 'expectedVersion',
    '--firefox': 'firefoxBinary',
    '--timeout-ms': 'timeoutMs',
});
const PROBE_ROUTE_HANDLERS = Object.freeze({
    OPTIONS: serveProbeOptions,
    'POST /probe/event': serveProbeEvent,
    'GET /probe/state': serveProbeState,
    'GET /article/': serveProbeArticle,
    'GET /status/': serveProbeStatus,
});
const args = parseArgs(process.argv.slice(2));
const runId = `firefox-settings-authority-${Date.now()}-${randomUUID().slice(0, 8)}`;
const probeToken = randomUUID();
const packagePath = path.resolve(args.packagePath ?? process.env.YOMU_FIREFOX_EXTENSION ?? DEFAULT_PACKAGE);
const expectedVersion = args.expectedVersion
    ?? process.env.YOMU_EXPECTED_EXTENSION_VERSION
    ?? DEFAULT_EXPECTED_VERSION;
const firefoxBinary = path.resolve(args.firefoxBinary ?? process.env.YOMU_FIREFOX_BINARY ?? DEFAULT_FIREFOX);
const firefoxProduct = firefoxProductFromBinary(firefoxBinary);
const timeoutMs = positiveNumber(args.timeoutMs ?? process.env.YOMU_FIREFOX_SMOKE_TIMEOUT_MS, 15 * 60_000);
const automatedOnly = args.automatedOnly || process.env.YOMU_FIREFOX_SMOKE_AUTOMATED_ONLY === '1';
const keepScope = process.env.YOMU_FIREFOX_SMOKE_KEEP === '1';
const artifactDirectory = path.resolve(
    process.env.ART_DIR ?? path.join(ROOT, 'artifacts', 'firefox-settings-authority'),
);

const scope = await mkdtemp(path.join(tmpdir(), 'yomu-firefox-settings-authority-'));
const extensionDirectory = path.join(scope, 'extension');
const profileDirectory = path.join(scope, 'profile');
const events = [];
const studyInstanceLiveness = new Map();
let webExtProcess;
let server;
let serverOrigin = '';
let manualPhase = 'automated';
let phaseStartedAt = 0;
let storageFailureStudyInstanceId = '';
let storageFailureTargetSelectedAt = 0;
let runFailure = null;
let finishRun;
const runFinished = new Promise(resolve => { finishRun = resolve; });

try {
    await mkdir(artifactDirectory, { recursive: true });
    await assertReadableFileOrDirectory(packagePath, 'Firefox extension package');
    await assertReadableFileOrDirectory(firefoxBinary, `${firefoxProduct} binary`);
    const sourceEvidence = await packageEvidence(packagePath);
    await materializeExtension(packagePath, extensionDirectory);
    const originalManifest = await readJson(path.join(extensionDirectory, 'manifest.json'));
    assertOriginalPackageContract(originalManifest, expectedVersion);
    const storageAdapterSource = await readFile(
        path.join(extensionDirectory, 'newtab', 'study-storage-runtime.js'),
        'utf8',
    );
    const storagePrefix = storagePrefixFromAdapter(storageAdapterSource);
    const studyIndexPath = path.join(extensionDirectory, 'newtab', 'index.html');
    const originalStudyIndex = await readFile(studyIndexPath, 'utf8');
    const studyAppUrl = studyAppUrlFromIndex(originalStudyIndex);
    assertStudyStorageOrder(originalStudyIndex);

    const backupPath = path.join(artifactDirectory, `${runId}-backup.json`);
    await writeFile(backupPath, `${JSON.stringify(settingsBackup(), null, 2)}\n`);

    server = createProbeServer(event => receiveEvent(event), { probeToken, storagePrefix });
    await listen(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Firefox smoke server did not bind TCP.');
    serverOrigin = `http://127.0.0.1:${address.port}`;

    await instrumentDisposablePackage({
        extensionDirectory,
        originalManifest,
        originalStudyIndex,
        serverOrigin,
        storagePrefix,
        studyAppUrl,
        probeToken,
    });
    await prepareFirefoxProfile(profileDirectory);

    const reportPath = path.join(artifactDirectory, `${runId}-report.json`);
    const runbookPath = path.join(artifactDirectory, `${runId}-runbook.md`);
    await writeFile(runbookPath, manualRunbook({ backupPath, reportPath, serverOrigin }));

    console.log(`Firefox settings-authority smoke: ${runId}`);
    console.log(`Original package: ${packagePath}`);
    console.log(`Original package SHA-256: ${sourceEvidence.sha256}`);
    console.log(`Expected and observed extension version: ${expectedVersion}`);
    console.log(`Manual runbook: ${runbookPath}`);
    console.log(`Starting ${firefoxProduct} with a disposable profile: ${firefoxBinary}`);

    webExtProcess = launchWebExt({
        extensionDirectory,
        firefoxBinary,
        profileDirectory,
        startUrl: `moz-extension://${FIXED_EXTENSION_UUID}/newtab/index.html`,
    });
    const timeout = setTimeout(() => {
        failRun(new Error(`Firefox settings-authority smoke timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timeout.unref?.();

    await runFinished;
    clearTimeout(timeout);
    if (runFailure) throw runFailure;
    const finalSourceEvidence = await packageEvidence(packagePath);
    if (finalSourceEvidence.kind !== sourceEvidence.kind
        || finalSourceEvidence.sha256 !== sourceEvidence.sha256) {
        throw new Error('Firefox package changed while the acceptance run was in progress.');
    }

    const acceptancePassed = !automatedOnly;
    const report = {
        runId,
        passed: acceptancePassed,
        status: acceptancePassed ? 'passed' : 'automated-only-diagnostic',
        package: {
            path: packagePath,
            sha256: sourceEvidence.sha256,
            kind: sourceEvidence.kind,
            version: originalManifest.version,
            addonId: manifestAddonId(originalManifest),
        },
        browser: {
            product: firefoxProduct,
            executable: firefoxBinary,
            runner: `web-ext@${WEB_EXT_VERSION}`,
            profile: 'disposable',
        },
        evidence: {
            valuePayloadsLogged: false,
            keyNamesOnly: true,
            automatedOnly,
            events,
        },
        instrumentation: [
            'bootstrap waits for deterministic namespace seed before loading the unmodified Study adapter/app',
            'observer posts allowlisted booleans, enums, and physical key names only',
            'trusted Save proof observes the exact button activation and durable outcome, never DOM submit trust',
            'content probe uses the compiler background channel and observes real Reader DOM',
            'one-shot GM_setValue rejection is armed only by the exact trusted failure-phase Save',
            'temporary tabs permission opens the deterministic ordinary-page fixture after migration sweeps',
        ],
    };
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    assertReportContainsNoValuePayloads(reportJson);
    await writeFile(reportPath, reportJson);
    console.log(acceptancePassed
        ? `PASS Firefox settings-authority smoke: ${reportPath}`
        : `AUTOMATED-ONLY diagnostic complete (not release acceptance): ${reportPath}`);
} catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const reportPath = path.join(artifactDirectory, `${runId}-failure.json`);
    await writeFile(reportPath, `${JSON.stringify({
        runId,
        passed: false,
        error: firstLine(failure),
        phase: manualPhase,
        browser: {
            product: firefoxProduct,
            executable: firefoxBinary,
        },
        valuePayloadsLogged: false,
        events,
    }, null, 2)}\n`).catch(() => undefined);
    console.error(`FAIL Firefox settings-authority smoke: ${firstLine(failure)}`);
    console.error(`Failure evidence: ${reportPath}`);
    process.exitCode = 1;
} finally {
    await stopWebExt(webExtProcess);
    await closeServer(server);
    if (keepScope) console.log(`Kept disposable Firefox scope: ${scope}`);
    else await rm(scope, { recursive: true, force: true });
}

function parseArgs(argv) {
    const parsed = {};
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--automated-only') {
            parsed.automatedOnly = true;
            continue;
        }
        const field = VALUE_ARGUMENT_FIELDS[argument];
        if (!field) throw new Error(`Unknown argument: ${argument}`);
        parsed[field] = requiredArgValue(argv, ++index, argument);
    }
    return parsed;
}

function requiredArgValue(argv, index, flag) {
    const value = argv[index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    return value;
}

function positiveNumber(value, fallback) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Expected a positive number, received: ${value}`);
    return parsed;
}

function firefoxProductFromBinary(binary) {
    const appBundle = binary.split(/[\\/]/u).find(segment => segment.endsWith('.app'));
    if (appBundle) return appBundle.slice(0, -'.app'.length);
    const executable = binary.split(/[\\/]/u).filter(Boolean).at(-1) ?? 'firefox';
    return executable.toLowerCase() === 'firefox' ? 'Firefox' : executable;
}

async function assertReadableFileOrDirectory(target, label) {
    await stat(target).catch(error => {
        throw new Error(`${label} is missing: ${target}`, { cause: error });
    });
}

async function packageEvidence(source) {
    const sourceStat = await stat(source);
    if (sourceStat.isFile()) {
        return {
            kind: 'xpi',
            sha256: createHash('sha256').update(await readFile(source)).digest('hex'),
        };
    }
    if (!sourceStat.isDirectory()) throw new Error(`Unsupported Firefox extension package: ${source}`);
    const hash = createHash('sha256');
    for (const file of await directoryFiles(source)) {
        const relative = path.relative(source, file).split(path.sep).join('/');
        hash.update(relative).update('\0').update(await readFile(file)).update('\0');
    }
    return { kind: 'unpacked-directory', sha256: hash.digest('hex') };
}

async function directoryFiles(root) {
    const files = [];
    async function visit(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(target);
            else if (entry.isFile()) files.push(target);
        }
    }
    await visit(root);
    return files;
}

async function materializeExtension(source, destination) {
    const sourceStat = await stat(source);
    if (sourceStat.isDirectory()) {
        await cp(source, destination, { recursive: true, force: false });
        return;
    }
    await mkdir(destination, { recursive: true });
    const entries = unzipSync(new Uint8Array(await readFile(source)));
    for (const [name, bytes] of Object.entries(entries)) {
        const output = safeArchiveOutput(destination, name);
        if (name.endsWith('/')) await mkdir(output, { recursive: true });
        else {
            await mkdir(path.dirname(output), { recursive: true });
            await writeFile(output, bytes);
        }
    }
}

function safeArchiveOutput(root, name) {
    const output = path.resolve(root, name);
    if (!output.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe XPI path: ${name}`);
    return output;
}

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

function manifestAddonId(manifest) {
    const settingsBlocks = [manifest.browser_specific_settings, manifest.applications];
    const id = settingsBlocks.map(settings => settings?.gecko?.id)
        .find(candidate => typeof candidate === 'string');
    return id ?? '';
}

function assertOriginalPackageContract(manifest, version) {
    assertOriginalPackageAddonId(manifest);
    assertOriginalPackageVersion(manifest, version);
    assertOriginalPackageDoesNotOverrideBrowserPages(manifest);
    assertOriginalPackageDoesNotRequestTabs(manifest);
}

function assertOriginalPackageAddonId(manifest) {
    if (manifestAddonId(manifest) !== ADDON_ID) {
        throw new Error(`Firefox package add-on ID is not ${ADDON_ID}.`);
    }
}

function assertOriginalPackageVersion(manifest, version) {
    if (String(manifest.version) !== version) {
        throw new Error(
            `Refusing stale Firefox bytes: expected ${version}, package contains ${manifest.version ?? '<missing>'}.`,
        );
    }
}

function assertOriginalPackageDoesNotOverrideBrowserPages(manifest) {
    if (manifest.chrome_url_overrides || manifest.browser_url_overrides || manifest.chrome_settings_overrides) {
        throw new Error('Original Firefox package unexpectedly overrides a browser page.');
    }
}

function assertOriginalPackageDoesNotRequestTabs(manifest) {
    if ((manifest.permissions ?? []).includes('tabs')) {
        throw new Error('Original Firefox package unexpectedly requests tabs permission.');
    }
}

function storagePrefixFromAdapter(source) {
    assertStudyStorageAdapterMarker(source);
    const prefix = JSON.parse(studyStoragePrefixLiteral(source));
    assertCompilerStoragePrefix(prefix);
    return prefix;
}

function assertStudyStorageAdapterMarker(source) {
    if (!source.includes('yomu-extension-study-storage-runtime')) {
        throw new Error('Firefox package is missing the Study storage adapter marker.');
    }
}

function studyStoragePrefixLiteral(source) {
    const match = source.match(/\bconst prefix = ("(?:[^"\\]|\\.)*");/);
    if (!match) throw new Error('Could not extract the compiler storage prefix from Study adapter.');
    return match[1];
}

function assertCompilerStoragePrefix(prefix) {
    if (typeof prefix !== 'string') throw new Error('Study adapter compiler storage prefix is invalid.');
    if (!prefix.startsWith('usc_')) throw new Error('Study adapter compiler storage prefix is invalid.');
}

function studyAppUrlFromIndex(index) {
    const match = index.match(/<script\s+type="module"\s+src="(\.\/app\.js\?v=[a-f0-9]+)"><\/script>/);
    if (!match) throw new Error('Packaged Study app module was not found in index.html.');
    return `./newtab/${match[1].slice(2)}`;
}

function assertStudyStorageOrder(index) {
    const adapter = index.indexOf('<script src="./study-storage-runtime.js"></script>');
    const app = index.search(/<script\s+type="module"\s+src="\.\/app\.js\?v=[a-f0-9]+"><\/script>/);
    if (adapter < 0 || app < 0 || adapter > app) {
        throw new Error('Packaged Study does not load shared storage before its app module.');
    }
}

function packagedStudyScriptPair() {
    return /<script\s+src="\.\/study-storage-runtime\.js"><\/script>\s*<script\s+type="module"\s+src="\.\/app\.js\?v=[a-f0-9]+"><\/script>/;
}

function settingsBackup() {
    return {
        formatName: 'yomu-reader-settings',
        formatVersion: 3,
        exportedAt: '2026-08-15T12:00:00.000Z',
        settings: safeSettings('dark', 43, 'backup-import'),
    };
}

function safeSettings(theme, subtitleFontSize, sentinel) {
    return {
        learningTargetChosen: true,
        onboardingSeen: true,
        interfaceLanguage: 'en',
        theme,
        subtitleFontSize,
        accentColor: '#315d8c',
        showFloatingButton: true,
        annotationsPaused: false,
        manualScanEnabled: false,
        popupMode: 'auto',
        apiKey: '',
        jitenApiKey: '',
        wanikaniApiToken: '',
        bunproFrontendApiToken: '',
        bunproApiKey: '',
        enableLogging: false,
        firefoxSettingsAuthoritySmokeSentinel: sentinel,
    };
}

function safeIntent(theme, subtitleFontSize, revision) {
    return {
        revision,
        records: {
            theme: { seq: revision - 1, value: theme },
            subtitleFontSize: { seq: revision, value: subtitleFontSize },
        },
    };
}

async function instrumentDisposablePackage(options) {
    const manifest = structuredClone(options.originalManifest);
    const scenarios = scenarioSeeds(options.storagePrefix);
    const studyLiveIntent = safeIntent('dark', 37, 8);
    const readerLiveIntent = safeIntent('light', 39, 10);
    manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'tabs'])];
    manifest.content_scripts = [
        ...(manifest.content_scripts ?? []),
        {
            matches: ['http://127.0.0.1/*'],
            js: ['firefox-settings-authority-content-probe.js'],
            run_at: 'document_idle',
        },
    ];
    await writeFile(
        path.join(options.extensionDirectory, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const bootstrapConfig = {
        serverOrigin: options.serverOrigin,
        probeToken: options.probeToken,
        storagePrefix: options.storagePrefix,
        storageRuntimeUrl: './newtab/study-storage-runtime.js',
        studyObserverUrl: './firefox-settings-authority-study-observer.mjs',
        studyAppUrl: options.studyAppUrl,
        settingsKey: SETTINGS_KEY,
        intentKey: INTENT_KEY,
        privateKey: PRIVATE_KEY,
        unrelatedKey: UNRELATED_KEY,
        unrelatedValue: UNRELATED_VALUE,
        scenarioKey: SCENARIO_KEY,
        seededKeyPrefix: SEEDED_KEY_PREFIX,
        faultKey: FAULT_KEY,
        requestedPanelKey: REQUESTED_PANEL_KEY,
        scenarios,
    };
    const observerConfig = {
        serverOrigin: options.serverOrigin,
        probeToken: options.probeToken,
        storagePrefix: options.storagePrefix,
        settingsKey: SETTINGS_KEY,
        intentKey: INTENT_KEY,
        privateKey: PRIVATE_KEY,
        unrelatedKey: UNRELATED_KEY,
        scenarioKey: SCENARIO_KEY,
        faultKey: FAULT_KEY,
        articleOpenedKey: ARTICLE_OPENED_KEY,
        liveWriteKey: LIVE_WRITE_KEY,
        requestedPanelKey: REQUESTED_PANEL_KEY,
        launcherProofKey: LAUNCHER_PROOF_KEY,
        articleUrl: `${options.serverOrigin}/article/`,
        scenarios,
        studyLiveIntent,
        readerLiveIntent,
    };
    const contentConfig = {
        serverOrigin: options.serverOrigin,
        probeToken: options.probeToken,
        storagePrefix: options.storagePrefix,
        settingsKey: SETTINGS_KEY,
        intentKey: INTENT_KEY,
        privateKey: PRIVATE_KEY,
        launcherProofKey: LAUNCHER_PROOF_KEY,
        studyLiveIntent,
        readerLiveIntent,
    };
    await writeFile(
        path.join(options.extensionDirectory, 'firefox-settings-authority-bootstrap.mjs'),
        injectedScript(bootstrapConfig, browserBootstrap, [
            seedDisposableStorage,
            activeDisposableScenario,
            disposableScenarioSeeded,
            replaceDisposableScenario,
            disposableManagedStorageKey,
            rememberRequestedSettingsPanel,
            requestedSettingsPanel,
            installDisposableStorageWriteFault,
            guardedDisposableSetValue,
            armedStorageFaultAttempt,
            settingsAuthorityWrite,
            postBrowserProbeEvent,
        ]),
    );
    await writeFile(
        path.join(options.extensionDirectory, 'firefox-settings-authority-study-observer.mjs'),
        injectedScript(observerConfig, studyObserver, studyObserverHelpers()),
    );
    await writeFile(
        path.join(options.extensionDirectory, 'firefox-settings-authority-content-probe.js'),
        injectedScript(contentConfig, contentProbe, contentProbeHelpers()),
    );

    const pair = packagedStudyScriptPair();
    if (!pair.test(options.originalStudyIndex)) {
        throw new Error('Packaged Study script pair changed before smoke instrumentation.');
    }
    const instrumentedIndex = options.originalStudyIndex.replace(
        pair,
        '<script type="module" src="../firefox-settings-authority-bootstrap.mjs"></script>',
    );
    await writeFile(path.join(options.extensionDirectory, 'newtab', 'index.html'), instrumentedIndex);
}

function injectedScript(config, entrypoint, helpers) {
    const declarations = helpers.map(helper => helper.toString()).join('\n\n');
    return `(() => {\nconst CONFIG = ${JSON.stringify(config)};\n${declarations}\n\n(${entrypoint.toString()})(CONFIG);\n})();\n`;
}

function scenarioSeeds(prefix) {
    const rawChosen = safeSettings('dark', 47, 'v1.9.2-raw-only');
    const canonicalChosen = safeSettings('light', 31, 'v1.9.2-canonical');
    const rawIntent = safeIntent('dark', 47, 2);
    const canonicalIntent = safeIntent('light', 31, 4);
    return {
        'raw-only': {
            [SETTINGS_KEY]: rawChosen,
            [INTENT_KEY]: rawIntent,
            [PRIVATE_KEY]: `${PRIVATE_VALUE}-raw`,
            [UNRELATED_KEY]: UNRELATED_VALUE,
        },
        'prefixed-only': {
            [`${prefix}${SETTINGS_KEY}`]: canonicalChosen,
            [`${prefix}${INTENT_KEY}`]: canonicalIntent,
            [`${prefix}${PRIVATE_KEY}`]: `${PRIVATE_VALUE}-canonical`,
            [UNRELATED_KEY]: UNRELATED_VALUE,
        },
        divergent: {
            [SETTINGS_KEY]: { ...rawChosen, firefoxSettingsAuthoritySmokeSentinel: 'v1.9.2-divergent-raw' },
            [INTENT_KEY]: rawIntent,
            [PRIVATE_KEY]: `${PRIVATE_VALUE}-divergent-raw`,
            [`${prefix}${SETTINGS_KEY}`]: { ...canonicalChosen, firefoxSettingsAuthoritySmokeSentinel: 'v1.9.2-divergent-canonical' },
            [`${prefix}${INTENT_KEY}`]: canonicalIntent,
            [`${prefix}${PRIVATE_KEY}`]: `${PRIVATE_VALUE}-divergent-canonical`,
            [UNRELATED_KEY]: UNRELATED_VALUE,
        },
        live: {
            [SETTINGS_KEY]: { ...rawChosen, firefoxSettingsAuthoritySmokeSentinel: 'v1.9.2-live-raw-retained' },
            [INTENT_KEY]: rawIntent,
            [PRIVATE_KEY]: `${PRIVATE_VALUE}-live-raw`,
            [`${prefix}${SETTINGS_KEY}`]: { ...canonicalChosen, firefoxSettingsAuthoritySmokeSentinel: 'live-baseline' },
            [`${prefix}${INTENT_KEY}`]: canonicalIntent,
            [`${prefix}${PRIVATE_KEY}`]: `${PRIVATE_VALUE}-live-canonical`,
            [UNRELATED_KEY]: UNRELATED_VALUE,
        },
    };
}

async function prepareFirefoxProfile(profile) {
    await mkdir(profile, { recursive: true });
    const uuidMap = JSON.stringify({ [ADDON_ID]: FIXED_EXTENSION_UUID });
    const userJs = [
        `user_pref("extensions.webextensions.uuids", ${JSON.stringify(uuidMap)});`,
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        'user_pref("browser.startup.homepage_override.mstone", "ignore");',
        'user_pref("browser.startup.page", 0);',
    ].join('\n');
    await writeFile(path.join(profile, 'user.js'), `${userJs}\n`);
}

function launchWebExt({ extensionDirectory: sourceDir, firefoxBinary: binary, profileDirectory: profile, startUrl }) {
    const commandArgs = [
        '--yes',
        `web-ext@${WEB_EXT_VERSION}`,
        'run',
        '--source-dir', sourceDir,
        '--firefox', binary,
        '--firefox-profile', profile,
        '--profile-create-if-missing',
        '--keep-profile-changes',
        // Current Firefox builds support debugger-installed temporary add-ons.
        // The legacy pre-install path detaches web-ext from the launched browser
        // on macOS, which would make this fail-closed supervisor report an early
        // exit while Firefox keeps running.
        '--no-reload',
        '--no-input',
        '--start-url', startUrl,
    ];
    const child = spawn('npx', commandArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', bytes => process.stdout.write(`[web-ext] ${String(bytes)}`));
    child.stderr.on('data', bytes => process.stderr.write(`[web-ext] ${String(bytes)}`));
    child.once('error', failRun);
    child.once('exit', (code, signal) => {
        if (manualPhase !== 'complete' && !runFailure) {
            failRun(new Error(`web-ext exited before proof completed (code ${code}, signal ${signal ?? 'none'}).`));
        }
    });
    return child;
}

function createProbeServer(onEvent, proof) {
    return createServer((request, response) => {
        void serveProbeRequest(request, response, onEvent, proof);
    });
}

async function serveProbeRequest(request, response, onEvent, proof) {
    setCors(response);
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const route = request.method === 'OPTIONS' ? 'OPTIONS' : `${request.method} ${pathname}`;
    const handler = PROBE_ROUTE_HANDLERS[route];
    if (!handler) {
        redirectToProbeStatus(response);
        return;
    }
    await handler(request, response, onEvent, proof);
}

function serveProbeOptions(_request, response) {
    response.writeHead(204);
    response.end();
}

async function serveProbeEvent(request, response, onEvent, proof) {
    try {
        const payload = JSON.parse(await requestBody(request));
        assertProbeToken(payload, proof);
        onEvent(normalizeProbeEvent(payload, proof.storagePrefix));
        json(response, 200, { ok: true, phase: manualPhase });
    } catch (error) {
        json(response, 400, { ok: false, error: firstLine(error) });
    }
}

function assertProbeToken(payload, proof) {
    if (payload?.probeToken !== proof.probeToken) throw new Error('Probe event authentication failed.');
}

function serveProbeState(_request, response) {
    json(response, 200, {
        phase: manualPhase,
        storageFailureStudyInstanceId,
        readerReady: hasEvent('reader-ready'),
        studyWriteAcknowledged: successfulStudyWriteAcknowledged(events),
        automatedComplete: automatedPhasesComplete(),
    });
}

function successfulStudyWriteAcknowledged(eventList) {
    return eventList.some(event => event.type === 'study-write-issued' && successfulStudyWriteEvent(event));
}

function serveProbeArticle(_request, response) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(articleFixture());
}

function serveProbeStatus(_request, response) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(statusPage());
}

function redirectToProbeStatus(response) {
    response.writeHead(302, { location: '/status/' });
    response.end();
}

function setCors(response) {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
}

function json(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(value));
}

async function requestBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 64 * 1024) throw new Error('Probe event body is too large.');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

function normalizeProbeEvent(value, storagePrefix) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Probe event must be an object.');
    const event = {
        at: new Date().toISOString(),
        type: shortString(value.type, 'event type'),
        surface: optionalEnum(value.surface, ['study', 'reader']),
        scenario: optionalEnum(value.scenario, ['raw-only', 'prefixed-only', 'divergent', 'live']),
        ok: optionalBoolean(value.ok),
        theme: optionalEnum(value.theme, ['light', 'dark', 'auto']),
        subtitleFontSize: optionalNumber(value.subtitleFontSize),
        darkClass: optionalBoolean(value.darkClass),
        formOpen: optionalBoolean(value.formOpen),
        saveDisabled: optionalBoolean(value.saveDisabled),
        importDisabled: optionalBoolean(value.importDisabled),
        saveBlocked: optionalEnum(value.saveBlocked, [
            '',
            'settings-import',
            'dictionary-import',
            'settings-save',
            'settings-action',
        ]),
        statusVisible: optionalBoolean(value.statusVisible),
        successToastVisible: optionalBoolean(value.successToastVisible),
        successToastObserved: optionalBoolean(value.successToastObserved),
        failureToastVisible: optionalBoolean(value.failureToastVisible),
        durableUnchanged: optionalBoolean(value.durableUnchanged),
        authorityPairValid: optionalBoolean(value.authorityPairValid),
        trusted: optionalBoolean(value.trusted),
        exactSave: optionalBoolean(value.exactSave),
        attemptId: optionalAttemptId(value.attemptId),
        studyInstanceId: optionalStudyInstanceId(value.studyInstanceId),
        unrelatedPresent: optionalBoolean(value.unrelatedPresent),
        launcherVisible: optionalBoolean(value.launcherVisible),
        writableInputsPresent: optionalBoolean(value.writableInputsPresent),
        launcherActionPresent: optionalBoolean(value.launcherActionPresent),
        panel: optionalEnum(value.panel, ['appearance']),
        sentinel: optionalEnum(value.sentinel, [
            'v1.9.2-raw-only',
            'v1.9.2-canonical',
            'v1.9.2-divergent-raw',
            'v1.9.2-divergent-canonical',
            'v1.9.2-live-raw-retained',
            'live-baseline',
            'study-live-write',
            'reader-live-write',
            'backup-import',
        ]),
        keyNames: optionalKeyNames(value.keyNames, storagePrefix),
    };
    return Object.fromEntries(Object.entries(event).filter(([, field]) => field !== undefined));
}

function shortString(value, label) {
    if (typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value)) throw new Error(`Invalid ${label}.`);
    return value;
}

function optionalEnum(value, allowed) {
    if (value === undefined) return undefined;
    if (!allowed.includes(value)) throw new Error('Probe event enum is invalid.');
    return value;
}

function optionalBoolean(value) {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new Error('Probe event boolean is invalid.');
    return value;
}

function optionalNumber(value) {
    if (value === undefined) return undefined;
    if (!validProbeNumber(value)) throw new Error('Probe event number is invalid.');
    return value;
}

function optionalAttemptId(value) {
    return optionalUuid(value, 'save-attempt');
}

function optionalStudyInstanceId(value) {
    return optionalUuid(value, 'Study instance');
}

function optionalUuid(value, label) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error(`Probe ${label} ID is invalid.`);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(value)) throw new Error(`Probe ${label} ID is invalid.`);
    return value;
}

function validProbeNumber(value) {
    if (!Number.isFinite(value)) return false;
    return [value >= 0, value <= 1000].every(Boolean);
}

function optionalKeyNames(value, storagePrefix) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > 100) throw new Error('Probe key-name list is invalid.');
    const allowlist = probeKeyNameAllowlist(storagePrefix);
    return value.map(key => normalizedProbeKeyName(key, allowlist)).sort();
}

function probeKeyNameAllowlist(storagePrefix) {
    const logicalNames = [SETTINGS_KEY, INTENT_KEY, PRIVATE_KEY];
    return {
        logicalNames,
        exactNames: new Set([
            ...logicalNames,
            ...logicalNames.map(name => `${storagePrefix}${name}`),
            UNRELATED_KEY,
        ]),
        slotPrefixes: ['yomu:state-slot:v1:', `${storagePrefix}yomu:state-slot:v1:`],
    };
}

function normalizedProbeKeyName(key, allowlist) {
    if (typeof key !== 'string') throw new Error('Probe key name is invalid.');
    if (key.length > 240) throw new Error('Probe key name is invalid.');
    if (!probeKeyNameAllowed(key, allowlist)) throw new Error('Probe key name is outside the allowlist.');
    return key;
}

function probeKeyNameAllowed(key, allowlist) {
    if (allowlist.exactNames.has(key)) return true;
    return allowlist.logicalNames.some(name => probeManagedSlotMatches(key, name, allowlist.slotPrefixes));
}

function probeManagedSlotMatches(key, logicalName, slotPrefixes) {
    return slotPrefixes.some(prefix => [
        key.startsWith(prefix),
        key.endsWith(`:${encodeURIComponent(logicalName)}`),
    ].every(Boolean));
}

function receiveEvent(event) {
    events.push(event);
    recordStudyInstanceLiveness(event);
    console.log(evidenceLogLine(event));
    if (rejectFailedProbeEvent(event)) return;
    if (advanceCompletedAutomatedRun()) return;
    evaluateManualPhase();
}

function evidenceLogLine(event) {
    const surface = event.surface ? ` [${event.surface}]` : '';
    const failure = event.ok === false ? ' — FAIL' : '';
    return `EVIDENCE ${event.type}${surface}${failure}`;
}

function rejectFailedProbeEvent(event) {
    if (event.ok !== false) return false;
    failRun(new Error(`Firefox probe reported failure in ${event.type}.`));
    return true;
}

function advanceCompletedAutomatedRun() {
    if (manualPhase !== 'automated') return false;
    if (!automatedPhasesComplete()) return false;
    finishAutomatedRun();
    return true;
}

function finishAutomatedRun() {
    if (automatedOnly) {
        manualPhase = 'complete';
        finishRun();
        return;
    }
    startPhase('study-ui-to-reader');
}

function automatedPhasesComplete() {
    return REQUIRED_AUTOMATED_EVENTS.every(type => hasEvent(type, automatedEventPredicate(type)));
}

function automatedEventPredicate(type) {
    const predicates = {
        'migration-raw-only': successfulMigrationEvent,
        'migration-prefixed-only': successfulMigrationEvent,
        'migration-divergent': successfulMigrationEvent,
        'study-write-issued': successfulStudyWriteEvent,
        'reader-observed-study-write': successfulReaderObservedStudyWriteEvent,
        'reader-write-issued': successfulReaderWriteIssuedEvent,
        'reader-final-state': successfulReaderFinalStateEvent,
        'study-observed-reader-write': successfulStudyFinalStateEvent,
        'study-final-state': successfulStudyFinalStateEvent,
    };
    return predicates[type] ?? successfulProbeEvent;
}

function hasEvent(type, predicate = () => true, since = 0) {
    return events.slice(since).some(event => event.type === type && predicate(event));
}

function evaluateManualPhase() {
    const recent = events.slice(phaseStartedAt);
    const recentHas = (type, predicate = () => true) => recent.some(event => event.type === type && predicate(event));
    const evaluator = manualPhaseEvaluators()[manualPhase];
    evaluator?.(recentHas, recent);
}

function manualPhaseEvaluators() {
    return {
        'study-ui-to-reader': evaluateStudyUiToReader,
        'reader-launcher-to-study': evaluateReaderLauncherToStudy,
        'backup-import': evaluateBackupImport,
        'backup-save': evaluateBackupSave,
        'backup-reload': evaluateBackupReload,
        'storage-failure-preparing': evaluateStorageFailurePreparation,
        'storage-failure': evaluateStorageFailure,
        'factory-reset': evaluateFactoryReset,
    };
}

function evaluateStudyUiToReader(recentHas, recent) {
    const complete = [
        trustedStudySaveCompleted(recent),
        recentHas('settings-observed', readerDark39Event),
    ].every(Boolean);
    if (complete) startPhase('reader-launcher-to-study');
}

function evaluateReaderLauncherToStudy(recentHas, recent) {
    const proof = {
        launcherVisible: recentHas('settings-launcher-visible', successfulReaderLauncherEvent),
        launcherActivated: recentHas('settings-launcher-activate', trustedReaderLauncherActivation),
        requestedPanelOpen: recentHas('requested-settings-panel-open', successfulStudyAppearancePanel),
        trustedStudySaveCompleted: trustedStudySaveCompleted(recent),
        readerApplied: recentHas('settings-observed', readerLight39Event),
    };
    if (readerLauncherToStudyComplete(proof)) startPhase('backup-import');
}

function readerLauncherToStudyComplete(proof) {
    return [
        proof.launcherVisible,
        proof.launcherActivated,
        proof.requestedPanelOpen,
        proof.trustedStudySaveCompleted,
        proof.readerApplied,
    ].every(Boolean);
}

function evaluateBackupImport(recentHas) {
    const complete = [
        recentHas('import-lock', successfulStudyEvent),
        recentHas('import-result', successfulStudyEvent),
        recentHas('import-complete', importedStudySettingsEvent),
    ].every(Boolean);
    if (complete) startPhase('backup-save');
}

function evaluateBackupSave(_recentHas, recent) {
    if (trustedStudySaveCompleted(recent)) startPhase('backup-reload');
}

function evaluateBackupReload(_recentHas, recent) {
    const targetBoot = recent.find(event => [
        event.type === 'surface-boot',
        importedStudySettingsEvent(event),
        typeof event.studyInstanceId === 'string',
    ].every(Boolean));
    if (!targetBoot) return;
    storageFailureStudyInstanceId = targetBoot.studyInstanceId;
    storageFailureTargetSelectedAt = Date.now();
    studyInstanceLiveness.clear();
    startPreparationPhase('storage-failure-preparing');
}

function evaluateStorageFailurePreparation(recentHas) {
    if (recentHas('fault-ready', event => successfulStudyInstanceEvent(
        event,
        storageFailureStudyInstanceId,
    ))) startPhase('storage-failure');
}

function evaluateStorageFailure(_recentHas, recent) {
    if (trustedStudySaveFailed(recent, storageFailureStudyInstanceId)) startPhase('factory-reset');
}

function evaluateFactoryReset(recentHas) {
    if (!recentHas('factory-reset-result', successfulFactoryResetEvent)) return;
    if (!twoDistinctStudyInstancesLive(
        studyInstanceLiveness,
        storageFailureStudyInstanceId,
        storageFailureTargetSelectedAt,
    )) return;
    manualPhase = 'complete';
    console.log('All trusted Firefox UI phases passed.');
    finishRun();
}

function trustedStudySaveActivation(event) {
    return [
        event.type === 'settings-save-activate',
        event.surface === 'study',
        event.trusted === true,
        event.exactSave === true,
        typeof event.attemptId === 'string',
        typeof event.studyInstanceId === 'string',
    ].every(Boolean);
}

function trustedStudySaveCompleted(eventList) {
    return correlatedTrustedStudySave(eventList, 'settings-save-durable-close');
}

function trustedStudySaveFailed(eventList, studyInstanceId = '') {
    return correlatedTrustedStudySave(eventList, 'fault-result', studyInstanceId);
}

function correlatedTrustedStudySave(eventList, outcomeType, requiredStudyInstanceId = '') {
    return eventList.some((activation, index) => {
        if (!trustedStudySaveActivation(activation)) return false;
        if (requiredStudyInstanceId && activation.studyInstanceId !== requiredStudyInstanceId) return false;
        return eventList.slice(index + 1).some(outcome => [
            outcome.type === outcomeType,
            outcome.surface === 'study',
            outcome.ok === true,
            outcome.attemptId === activation.attemptId,
            outcome.studyInstanceId === activation.studyInstanceId,
            outcomeType !== 'settings-save-durable-close' || outcome.successToastVisible === true,
            outcomeType !== 'fault-result' || [
                outcome.formOpen === true,
                outcome.saveDisabled === false,
                outcome.importDisabled === false,
                outcome.saveBlocked === '',
                outcome.successToastVisible === false,
                outcome.successToastObserved === false,
                outcome.failureToastVisible === true,
                outcome.durableUnchanged === true,
            ].every(Boolean),
        ].every(Boolean));
    });
}

function successfulStudyEvent(event) {
    return event.surface === 'study' && event.ok === true;
}

function successfulStudyInstanceEvent(event, studyInstanceId) {
    return Boolean(studyInstanceId)
        && successfulStudyEvent(event)
        && event.studyInstanceId === studyInstanceId;
}

function recordStudyInstanceLiveness(event, observedAt = Date.now()) {
    if (!successfulStudyLivenessEvent(event)) return;
    const previous = studyInstanceLiveness.get(event.studyInstanceId);
    studyInstanceLiveness.set(event.studyInstanceId, {
        firstSeen: previous ? previous.firstSeen : observedAt,
        lastSeen: observedAt,
        count: (previous ? previous.count : 0) + 1,
    });
}

function successfulStudyLivenessEvent(event) {
    return [
        event.type === 'study-instance-live',
        event.surface === 'study',
        event.ok === true,
        typeof event.studyInstanceId === 'string',
    ].every(Boolean);
}

function twoDistinctStudyInstancesLive(
    lastSeen,
    targetStudyInstanceId,
    selectedAt,
    now = Date.now(),
    liveWindowMs = 6_000,
) {
    if (![Boolean(targetStudyInstanceId), Number.isFinite(selectedAt), selectedAt > 0].every(Boolean)) return false;
    const live = liveStudyInstanceObservations(lastSeen, selectedAt, now, liveWindowMs);
    const target = live.find(([studyInstanceId]) => studyInstanceId === targetStudyInstanceId);
    return target ? overlappingStudyInstanceObserved(live, target, targetStudyInstanceId) : false;
}

function liveStudyInstanceObservations(lastSeen, selectedAt, now, liveWindowMs) {
    return [...lastSeen.entries()].filter(([, observation]) => [
        observation.firstSeen >= selectedAt,
        observation.count >= 2,
        now - observation.lastSeen <= liveWindowMs,
    ].every(Boolean));
}

function overlappingStudyInstanceObserved(live, target, targetStudyInstanceId) {
    return live.some(([studyInstanceId, observation]) => [
        studyInstanceId !== targetStudyInstanceId,
        Math.max(target[1].firstSeen, observation.firstSeen)
            <= Math.min(target[1].lastSeen, observation.lastSeen),
    ].every(Boolean));
}

function successfulProbeEvent(event) {
    return event.ok === true;
}

function successfulMigrationEvent(event) {
    return event.surface === 'study'
        && event.ok === true
        && event.authorityPairValid === true;
}

function successfulStudyWriteEvent(event) {
    return [
        event.surface === 'study',
        event.ok === true,
        event.authorityPairValid === true,
        event.theme === 'dark',
        event.subtitleFontSize === 37,
        event.darkClass === true,
    ].every(Boolean);
}

function successfulReaderObservedStudyWriteEvent(event) {
    return [
        event.surface === 'reader',
        event.ok === true,
        event.authorityPairValid === true,
        event.theme === 'dark',
        event.subtitleFontSize === 37,
        event.sentinel === 'study-live-write',
        event.darkClass === true,
    ].every(Boolean);
}

function successfulReaderWriteIssuedEvent(event) {
    return [
        event.surface === 'reader',
        event.ok === true,
        event.authorityPairValid === true,
        event.theme === 'light',
        event.subtitleFontSize === 39,
        event.sentinel === 'reader-live-write',
    ].every(Boolean);
}

function successfulReaderFinalStateEvent(event) {
    return successfulReaderWriteIssuedEvent(event) && event.darkClass === false;
}

function successfulStudyFinalStateEvent(event) {
    return [
        event.surface === 'study',
        event.ok === true,
        event.authorityPairValid === true,
        event.theme === 'light',
        event.subtitleFontSize === 39,
        event.sentinel === 'reader-live-write',
        event.darkClass === false,
    ].every(Boolean);
}

function readerDark39Event(event) {
    return [
        event.surface === 'reader',
        event.theme === 'dark',
        event.subtitleFontSize === 39,
        event.darkClass === true,
    ].every(Boolean);
}

function readerLight39Event(event) {
    return [
        event.surface === 'reader',
        event.theme === 'light',
        event.subtitleFontSize === 39,
        event.darkClass === false,
    ].every(Boolean);
}

function successfulReaderLauncherEvent(event) {
    return [
        event.surface === 'reader',
        event.ok === true,
        event.launcherVisible === true,
        event.formOpen === false,
        event.writableInputsPresent === false,
        event.launcherActionPresent === true,
    ].every(Boolean);
}

function trustedReaderLauncherActivation(event) {
    return event.surface === 'reader' && event.ok === true && event.trusted === true;
}

function successfulStudyAppearancePanel(event) {
    return [
        event.surface === 'study',
        event.ok === true,
        event.panel === 'appearance',
        event.formOpen === true,
    ].every(Boolean);
}

function importedStudySettingsEvent(event) {
    return [
        event.surface === 'study',
        event.ok !== false,
        event.theme === 'dark',
        event.subtitleFontSize === 43,
    ].every(Boolean);
}

function successfulFactoryResetEvent(event) {
    return [
        event.surface === 'study',
        event.ok === true,
        event.unrelatedPresent === true,
    ].every(Boolean);
}

function startPhase(phase) {
    manualPhase = phase;
    phaseStartedAt = events.length;
    console.log('');
    console.log(`MANUAL PHASE: ${phase}`);
    console.log(manualInstruction(phase));
    console.log('');
}

function startPreparationPhase(phase) {
    manualPhase = phase;
    phaseStartedAt = events.length;
    console.log('');
    console.log(`PREPARING PHASE: ${phase}`);
    console.log('Waiting for the target authority bytes to settle; no user action yet.');
    console.log('');
}

function manualInstruction(phase) {
    const instructions = {
        'study-ui-to-reader': [
            'In the moz-extension Study tab, open Connections & settings (use the overflow menu on a narrow window).',
            'Choose Appearance, switch Light to Dark, then press Save. The already-open ordinary Reader tab must turn dark.',
        ].join('\n'),
        'reader-launcher-to-study': [
            'Switch to the ordinary 127.0.0.1 Reader tab. Open the floating よ puck, then the gear Settings action.',
            'Verify that the handoff dialog has no settings inputs, then press its Open settings button.',
            'Firefox must open a packaged moz-extension Study tab directly on Appearance. Switch Dark to Light and press Save there.',
            'The already-open ordinary Reader tab must turn light; do not close or reload it.',
        ].join('\n'),
        'backup-import': [
            'In Study Settings choose Backup & sync, press Import settings, and use Firefox\'s native file chooser.',
            `Select exactly: ${path.join(artifactDirectory, `${runId}-backup.json`)}`,
            'Do not press Save during import. The probe requires visible Save/import locking, a result, and an unlocked reopened form.',
        ].join('\n'),
        'backup-save': 'Press the exact Save button once in the reopened imported-settings form. Its trusted activation and the durable form close are required.',
        'backup-reload': 'Reload the same Study tab with Firefox Reload (not a scripted reload). Imported Dark / 43px settings must survive.',
        'storage-failure': [
            'The observer is ready to fail the next exact Save. In Study Appearance, switch Dark to Light and press Save once.',
            'Pass requires the form to stay open, the imported Dark / 43px canonical state to remain, and no success toast.',
        ].join('\n'),
        'factory-reset': [
            'In the still-open Study Settings choose Help, press Factory Reset, and accept the Firefox confirmation.',
            'Pass requires raw legacy and canonical settings bytes to disappear while the unrelated extension key remains.',
        ].join('\n'),
    };
    return instructions[phase] ?? phase;
}

function failRun(error) {
    if (runFailure || manualPhase === 'complete') return;
    runFailure = error instanceof Error ? error : new Error(String(error));
    finishRun();
}

function listen(httpServer) {
    return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', () => {
            httpServer.off('error', reject);
            resolve();
        });
    });
}

async function stopWebExt(child) {
    if (!webExtChildRunning(child)) return;
    child.kill('SIGINT');
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 5_000)),
    ]);
    if (webExtChildRunning(child)) child.kill('SIGKILL');
}

function webExtChildRunning(child) {
    if (!child) return false;
    return [child.exitCode === null, child.signalCode === null].every(Boolean);
}

async function closeServer(httpServer) {
    if (!httpServer?.listening) return;
    await new Promise(resolve => httpServer.close(resolve));
}

function firstLine(error) {
    return String(error instanceof Error ? error.message : error).split('\n')[0].slice(0, 500);
}

function assertReportContainsNoValuePayloads(report) {
    const forbiddenValues = ['jpdb-private-', 'ak_jiten-', 'Bearer ', `stranded-private-${'secret'}`];
    if (forbiddenValues.some(forbidden => report.includes(forbidden))) {
        throw new Error('Firefox smoke report contains a credential-like value.');
    }
    const valueFields = ['"value":', '"newValue":', '"oldValue":'];
    if (valueFields.some(field => report.includes(field))) {
        throw new Error('Firefox smoke report contains an unapproved storage value field.');
    }
}

function articleFixture() {
    return `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>よむ Firefox settings authority proof</title>
<style>body{font:20px/1.7 system-ui;margin:48px;max-width:760px}code{font-size:15px}</style>
<main>
  <h1>Firefox ordinary-page Reader</h1>
  <p id="target">日本語を読む設定の確認です。図書館で本を読みます。</p>
  <p>This deterministic loopback page is an ordinary website, not hosted Study.</p>
</main>`;
}

function statusPage() {
    return `<!doctype html><html><meta charset="utf-8"><title>Firefox proof status</title>
<style>body{font:16px/1.5 system-ui;margin:32px}code{background:#eee;padding:2px 5px}</style>
<h1>Firefox settings-authority proof</h1><p>Current phase: <code id="phase">loading</code></p>
<script>setInterval(async()=>{const r=await fetch('/probe/state');const s=await r.json();document.querySelector('#phase').textContent=s.phase},500)</script>`;
}

function manualRunbook({ backupPath, reportPath, serverOrigin: origin }) {
    return `# Firefox settings-authority acceptance run

- Final package: \`${packagePath}\`
- Required package version: \`${expectedVersion}\`
- Browser product: ${firefoxProduct}
- Firefox executable: \`${firefoxBinary}\`
- Backup fixture: \`${backupPath}\`
- Report: \`${reportPath}\`
- Live status: ${origin}/status/

The script first runs raw-only, prefixed-only, divergent, and two-way live
storage/DOM phases. Follow each terminal MANUAL PHASE exactly. Use Firefox UI;
do not substitute console calls or synthetic DOM clicks. Do not perform any
numbered action before the terminal prints its matching MANUAL PHASE; automated
writer tasks may still be settling.

1. Packaged Study UI -> already-open ordinary Reader.
2. Ordinary Reader no-input launcher -> requested packaged Study panel -> already-open ordinary Reader.
3. Native file chooser backup import, Save/import lock, result, unlock.
4. Trusted Save after import; the reopened form must close.
5. Firefox reload and imported-setting persistence.
6. Wait for the terminal's fault-ready manual phase, then follow its one-shot
   storage-failure instructions. The form must remain open with no false success.
7. Factory Reset: raw/prefixed SETTINGS, INTENT, and private bytes gone; unrelated key retained.

The report records only allowlisted booleans, enum sentinels, and storage key
names. It never records settings objects, storage values, credentials, tokens,
or file contents.
`;
}

function sharedProbeHelpers() {
    return [
        postBrowserProbeEvent,
        browserWaitFor,
        settingsSummary,
        settingsObject,
        knownTheme,
        finiteSettingNumber,
        stringSettingValue,
        settingsSummariesMatch,
        exactCanonicalAuthorityPair,
        waitForExpectedCanonicalAuthorityPair,
        exactCanonicalAuthoritySurface,
        waitForExpectedCanonicalAuthoritySurface,
        physicalAuthorityPairMatches,
        authorityPayloadPair,
        compatibleManagedAuthorityPayloads,
        authorityRecord,
        managedAuthorityPayload,
        physicalAuthorityValue,
        settingsAuthorityObject,
        requireProbeResult,
        committedAuthorityPayloadPair,
        authorityCommitWitness,
        withoutAuthorityCommit,
        probeValuesMatch,
        canonicalProbeValue,
        darkThemeClass,
        exactSettingsSurface,
        waitForExpectedSettingsSurface,
        surfaceObservationReadiness,
        observeSettingsSurface,
        createSettingsFormTracker,
        latestSettingsForm,
        eventSubmitButton,
        isExactSettingsSaveButton,
        reportSettingsSaveActivation,
        trackedSettingsForm,
        reportFormClosed,
        noteTrackedFormClose,
        pendingClosedSaveAttempt,
        completePendingFormClose,
        reportFormCloseOnce,
        takePendingFormClose,
        durableSaveClose,
        settingsSaveSuccessToasts,
        newSettingsSaveSuccessVisible,
        waitForNewSettingsSaveSuccess,
        successToastVisible,
        reportFormOpened,
        reportChangedFormState,
        formSaveButton,
        buttonDisabled,
        saveBlockedValue,
        storageLocalSettingsChange,
        fetchProbeState,
    ];
}

function studyObserverHelpers() {
    return [
        ...sharedProbeHelpers(),
        createStudyProbeContext,
        studyCanonicalSummary,
        studyRelevantKeyNames,
        studyRelevantKey,
        studyScenario,
        waitForStudyBoot,
        completeMigrationScenario,
        waitForMigrationScenarioProof,
        migrationScenarioProof,
        migrationPhysicalObservation,
        migrationKeyPresence,
        migrationScenarioMatches,
        migrationAuthorityMatches,
        migrationAuthorityPlan,
        rawMigrationMatches,
        prefixedMigrationMatches,
        divergentMigrationMatches,
        advanceMigrationScenario,
        installStudyStorageObserver,
        handleStudyStorageChange,
        reportStudyReaderWrite,
        reportStudyFinalState,
        installStudyFormObserver,
        inspectStudySettingsForm,
        observeRequestedStudyPanel,
        requestedStudyPanelRequest,
        requestedStudyPanelAccepted,
        requestedStudyPanelState,
        launcherProofAuthorized,
        requestedStudyPanelProof,
        studyFormState,
        importStatusElement,
        visibleImportStatus,
        nonEmptyText,
        observeStudyImportLock,
        observeStudyImportComplete,
        observeStudyImportResult,
        importStatusFromMutationRecord,
        mutationRecordElement,
        disposableFlagSet,
        claimDisposableFlag,
        openReaderArticleOnce,
        issueStudyLiveWriteOnce,
        performStudyLiveWrite,
        readerSurfaceReady,
        writeStudyLiveSettings,
        installStudyPhasePolling,
        pollStudyPhase,
        maybeReportStudyInstanceLive,
        shouldPrepareStorageFault,
        stableStorageFaultSnapshot,
        maybePrepareStorageFault,
        armPreparedStorageFault,
        storageFaultReportReady,
        maybeReportStorageFault,
        completedStorageFaultResult,
        storageFaultEvent,
        waitForDurableStorageFault,
        storageFaultResult,
        studySettingsAuthoritySnapshot,
        studySettingsAuthorityKey,
        observeStudySuccessToast,
        failureToastVisible,
        maybeReportFactoryReset,
        logicalManagedValues,
        factoryResetComplete,
    ];
}

function contentProbeHelpers() {
    return [
        ...sharedProbeHelpers(),
        createContentProbeContext,
        compilerMessage,
        validatedCompilerResponse,
        contentSettings,
        readerSurfaceInitialized,
        installContentStorageObserver,
        handleContentStorageChange,
        shouldIssueReaderWrite,
        issueReaderWrite,
        waitForStudyWriteAcknowledgement,
        reportReaderWriteFailure,
        installContentLauncherObserver,
        inspectContentSettingsLauncher,
        contentSettingsLauncherState,
        launcherSurfaceProof,
        reportContentLauncherActivation,
        contentLauncherFromEvent,
        authorizeContentLauncher,
        contentSettingsLauncher,
        writableSettingsInput,
    ];
}

/** Runs inside the disposable packaged Study page before the real app module. */
async function browserBootstrap(config) {
    await seedDisposableStorage(config);
    rememberRequestedSettingsPanel(config);
    await import(config.storageRuntimeUrl);
    installDisposableStorageWriteFault(config);
    await import(config.studyAppUrl);
    await import(config.studyObserverUrl);
}

async function seedDisposableStorage(config) {
    const scenario = await activeDisposableScenario(config);
    sessionStorage.setItem(config.scenarioKey, scenario);
    const seededKey = `${config.seededKeyPrefix}${scenario}`;
    if (await disposableScenarioSeeded(seededKey)) return;
    await replaceDisposableScenario(config, scenario, seededKey);
}

async function activeDisposableScenario(config) {
    const globalState = await browser.storage.local.get(config.scenarioKey);
    return globalState[config.scenarioKey]
        ?? sessionStorage.getItem(config.scenarioKey)
        ?? 'raw-only';
}

async function disposableScenarioSeeded(seededKey) {
    const seededState = await browser.storage.local.get(seededKey);
    return seededState[seededKey] === true;
}

async function replaceDisposableScenario(config, scenario, seededKey) {
    const all = await browser.storage.local.get(null);
    const managed = Object.keys(all).filter(key => disposableManagedStorageKey(key, config));
    if (managed.length) await browser.storage.local.remove(managed);
    await browser.storage.local.set({
        ...config.scenarios[scenario],
        [config.scenarioKey]: scenario,
        [seededKey]: true,
    });
}

function rememberRequestedSettingsPanel(config) {
    const panel = requestedSettingsPanel(location.hash);
    if (panel) sessionStorage.setItem(config.requestedPanelKey, panel);
}

function requestedSettingsPanel(hash) {
    return hash === '#settings=appearance' ? 'appearance' : '';
}

function disposableManagedStorageKey(key, config) {
    return [
        key === config.settingsKey,
        key.startsWith('yomu:'),
        key.startsWith('jpdb-reader-'),
        key.startsWith('jpdb-popup-reader-'),
        key === `${config.storagePrefix}${config.settingsKey}`,
        key.startsWith(`${config.storagePrefix}yomu:`),
        key.startsWith(`${config.storagePrefix}jpdb-reader-`),
        key.startsWith(`${config.storagePrefix}jpdb-popup-reader-`),
    ].some(Boolean);
}

function installDisposableStorageWriteFault(config) {
    const realSetValue = globalThis.GM_setValue;
    globalThis.GM_setValue = (key, value) => guardedDisposableSetValue(config, realSetValue, key, value);
}

async function guardedDisposableSetValue(config, realSetValue, key, value) {
    const name = String(key);
    if (!settingsAuthorityWrite(name, config)) return realSetValue(key, value);
    const attemptId = armedStorageFaultAttempt(config);
    if (!attemptId) return realSetValue(key, value);
    sessionStorage.setItem(config.faultKey, `consumed:${attemptId}`);
    void postBrowserProbeEvent(config, 'study', { type: 'fault-consumed', attemptId });
    throw new Error('Firefox settings-authority smoke injected storage failure.');
}

function armedStorageFaultAttempt(config) {
    const prefix = 'armed:';
    const state = sessionStorage.getItem(config.faultKey) ?? '';
    return state.startsWith(prefix) ? state.slice(prefix.length) : '';
}

function settingsAuthorityWrite(name, config) {
    return [
        name.includes(config.settingsKey),
        name.includes(config.intentKey),
        name.includes('reader-settings-persistence'),
    ].some(Boolean);
}

function postBrowserProbeEvent(config, surface, event) {
    return fetch(`${config.serverOrigin}/probe/event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ probeToken: config.probeToken, surface, ...event }),
    });
}

async function browserWaitFor(predicate, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
}

function settingsSummary(value) {
    const settings = settingsObject(value);
    return {
        theme: knownTheme(settings.theme),
        subtitleFontSize: finiteSettingNumber(settings.subtitleFontSize),
        sentinel: stringSettingValue(settings.firefoxSettingsAuthoritySmokeSentinel),
    };
}

function settingsObject(value) {
    if (!value) return {};
    if (typeof value !== 'object') return {};
    return value;
}

function knownTheme(value) {
    return ['light', 'dark', 'auto'].includes(value) ? value : undefined;
}

function finiteSettingNumber(value) {
    return Number.isFinite(value) ? value : undefined;
}

function stringSettingValue(value) {
    return typeof value === 'string' ? value : undefined;
}

function darkThemeClass(theme) {
    const darkClassPresent = document.documentElement.classList.contains('jpdb-reader-theme-dark');
    return darkClassPresent === (theme === 'dark');
}

function settingsSummariesMatch(left, right) {
    return [
        left.theme === right.theme,
        left.subtitleFontSize === right.subtitleFontSize,
        left.sentinel === right.sentinel,
    ].every(Boolean);
}

async function exactCanonicalAuthorityPair(config, expectedSettings, expectedIntent) {
    const values = await browser.storage.local.get(null);
    return physicalAuthorityPairMatches(
        values,
        `${config.storagePrefix}${config.settingsKey}`,
        `${config.storagePrefix}${config.intentKey}`,
        expectedSettings,
        expectedIntent,
    );
}

function waitForExpectedCanonicalAuthorityPair(config, expectedSettings, expectedIntent, timeout = 10_000) {
    return browserWaitFor(async () => {
        if (!await exactCanonicalAuthorityPair(config, expectedSettings, expectedIntent)) return null;
        await new Promise(resolve => setTimeout(resolve, 500));
        return await exactCanonicalAuthorityPair(config, expectedSettings, expectedIntent) || null;
    }, timeout);
}

async function exactCanonicalAuthoritySurface(context, expectedSettings, expectedIntent) {
    const { config } = context;
    const values = await browser.storage.local.get(null);
    const settingsKey = `${config.storagePrefix}${config.settingsKey}`;
    const intentKey = `${config.storagePrefix}${config.intentKey}`;
    if (!physicalAuthorityPairMatches(
        values,
        settingsKey,
        intentKey,
        expectedSettings,
        expectedIntent,
    )) return null;
    const pair = authorityPayloadPair(values[settingsKey], values[intentKey]);
    if (!pair) return null;
    const expected = settingsSummary(expectedSettings);
    const current = settingsSummary(pair.settings);
    if (![settingsSummariesMatch(current, expected), darkThemeClass(expected.theme)].every(Boolean)) return null;
    return {
        ...current,
        darkClass: document.documentElement.classList.contains('jpdb-reader-theme-dark'),
        authorityPairValid: true,
    };
}

function waitForExpectedCanonicalAuthoritySurface(
    context,
    expectedSettings,
    expectedIntent,
    timeout = 10_000,
) {
    return browserWaitFor(async () => {
        const before = await exactCanonicalAuthoritySurface(context, expectedSettings, expectedIntent);
        if (!before) return null;
        await new Promise(resolve => setTimeout(resolve, 500));
        return exactCanonicalAuthoritySurface(context, expectedSettings, expectedIntent);
    }, timeout);
}

function physicalAuthorityPairMatches(
    values,
    settingsKey,
    intentKey,
    expectedSettings,
    expectedIntent,
) {
    if (![Object.hasOwn(values, settingsKey), Object.hasOwn(values, intentKey)].every(Boolean)) return false;
    const pair = authorityPayloadPair(values[settingsKey], values[intentKey]);
    if (!pair) return false;
    return [
        probeValuesMatch(pair.settings, withoutAuthorityCommit(expectedSettings)),
        probeValuesMatch(pair.intent, withoutAuthorityCommit(expectedIntent)),
    ].every(Boolean);
}

function authorityPayloadPair(storedSettings, storedIntent) {
    const settings = managedAuthorityPayload(storedSettings);
    const intent = managedAuthorityPayload(storedIntent);
    if (!compatibleManagedAuthorityPayloads(settings, intent)) return null;
    return committedAuthorityPayloadPair(settings.value, intent.value);
}

function compatibleManagedAuthorityPayloads(settings, intent) {
    if (![settings, intent].every(Boolean)) return false;
    return [
        settings.wrapped === intent.wrapped,
        !settings.wrapped || settings.epoch === intent.epoch,
    ].every(Boolean);
}

function authorityRecord(value) {
    return [Boolean(value), typeof value === 'object', !Array.isArray(value)].every(Boolean)
        ? value
        : null;
}

function managedAuthorityPayload(stored) {
    const record = authorityRecord(stored);
    if (!record) return { wrapped: false, epoch: '', value: stored };
    if (!Object.hasOwn(record, '__yomuManagedStateEnvelope')) {
        return { wrapped: false, epoch: '', value: stored };
    }
    const valid = [
        record.__yomuManagedStateEnvelope === 1,
        typeof record.epoch === 'string',
        Boolean(record.epoch),
        Object.hasOwn(record, 'value'),
    ].every(Boolean);
    if (!valid) return null;
    return { wrapped: true, epoch: record.epoch, value: record.value };
}

function physicalAuthorityValue(stored) {
    const managed = managedAuthorityPayload(stored);
    return managed ? withoutAuthorityCommit(managed.value) : null;
}

function settingsAuthorityObject(value, message) {
    const settings = physicalAuthorityValue(value);
    if (![Boolean(settings), typeof settings === 'object', !Array.isArray(settings)].every(Boolean)) {
        throw new Error(message);
    }
    return settings;
}

function requireProbeResult(value, message) {
    if (!value) throw new Error(message);
    return value;
}

function committedAuthorityPayloadPair(settings, intent) {
    const settingsRecord = authorityRecord(settings);
    const intentRecord = authorityRecord(intent);
    if (![settingsRecord, intentRecord].every(Boolean)) return null;
    const field = '__yomuSettingsPersistenceCommitV1';
    if (!authorityCommitWitness(settingsRecord, intentRecord, field)) return null;
    return {
        settings: withoutAuthorityCommit(settingsRecord),
        intent: withoutAuthorityCommit(intentRecord),
    };
}

function authorityCommitWitness(settings, intent, field) {
    const settingsHasCommit = Object.hasOwn(settings, field);
    const intentHasCommit = Object.hasOwn(intent, field);
    if (settingsHasCommit !== intentHasCommit) return false;
    if (!settingsHasCommit) return true;
    const settingsCommit = settings[field];
    const intentCommit = intent[field];
    return [
        typeof settingsCommit === 'string',
        Boolean(settingsCommit),
        settingsCommit === intentCommit,
    ].every(Boolean);
}

function withoutAuthorityCommit(value) {
    const record = authorityRecord(value);
    if (!record) return value;
    if (!Object.hasOwn(record, '__yomuSettingsPersistenceCommitV1')) return value;
    const clean = { ...record };
    delete clean.__yomuSettingsPersistenceCommitV1;
    return clean;
}

function probeValuesMatch(left, right) {
    return JSON.stringify(canonicalProbeValue(left)) === JSON.stringify(canonicalProbeValue(right));
}

function canonicalProbeValue(value) {
    if (Array.isArray(value)) return value.map(canonicalProbeValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, canonicalProbeValue(value[key])]),
    );
}

async function waitForExpectedSettingsSurface(context, expected, timeout = 10_000) {
    return browserWaitFor(async () => {
        const before = await exactSettingsSurface(context, expected);
        if (!before) return null;
        await new Promise(resolve => setTimeout(resolve, 500));
        return exactSettingsSurface(context, expected);
    }, timeout);
}

async function exactSettingsSurface(context, expected) {
    const current = settingsSummary(await context.readSettings());
    if (!settingsSummariesMatch(current, expected)) return null;
    if (!darkThemeClass(expected.theme)) return null;
    return {
        ...current,
        darkClass: document.documentElement.classList.contains('jpdb-reader-theme-dark'),
    };
}

async function observeSettingsSurface(context, observedValue) {
    const expected = settingsSummary(observedValue);
    if (!expected.theme) return;
    const readiness = await browserWaitFor(() => surfaceObservationReadiness(context, expected), 5_000);
    if (readiness !== 'ready') return;
    const current = await waitForExpectedSettingsSurface(context, expected, 5_000);
    if (!current) return;
    await context.post({ type: 'settings-observed', ...current });
}

async function surfaceObservationReadiness(context, expected) {
    const current = settingsSummary(await context.readSettings());
    if (!settingsSummariesMatch(current, expected)) return 'superseded';
    if (!darkThemeClass(expected.theme)) return null;
    return 'ready';
}

function createSettingsFormTracker() {
    return {
        formWasOpen: false,
        formSignature: '',
        importLockSeen: false,
        importResultSeen: false,
        requestedPanelReported: false,
        pendingSaveAttempt: null,
        pendingFormCloseAttemptId: '',
        pendingFormCloseReported: false,
        closeReportInFlight: false,
    };
}

function latestSettingsForm() {
    return [...document.querySelectorAll('form.jpdb-reader-settings')].at(-1) ?? null;
}

function reportSettingsSaveActivation(context, tracker, event) {
    if (!event.isTrusted) return;
    const target = eventSubmitButton(event);
    if (!isExactSettingsSaveButton(target)) return;
    const attemptId = crypto.randomUUID();
    context.activeSaveAttemptId = attemptId;
    const faultArmed = armPreparedStorageFault(context, attemptId);
    context.activeSaveActivation = context.post({
        type: 'settings-save-activate',
        trusted: true,
        exactSave: true,
        attemptId,
    });
    if (faultArmed !== null) {
        void context.post({ type: 'fault-armed', ok: faultArmed, attemptId });
    }
    tracker.pendingSaveAttempt = {
        attemptId,
        activation: context.activeSaveActivation,
        priorSuccessToasts: settingsSaveSuccessToasts(),
    };
    tracker.pendingFormCloseAttemptId = '';
    tracker.pendingFormCloseReported = false;
}

function eventSubmitButton(event) {
    const target = event.target instanceof Element
        ? event.target.closest('button[type="submit"]')
        : null;
    return target instanceof HTMLButtonElement ? target : null;
}

function isExactSettingsSaveButton(target) {
    if (!target) return false;
    const form = target.form;
    return form instanceof HTMLFormElement
        && form.matches('form.jpdb-reader-settings')
        && formSaveButton(form) === target;
}

async function trackedSettingsForm(context, tracker) {
    const form = latestSettingsForm();
    if (!form) {
        await reportFormClosed(context, tracker);
        return null;
    }
    await reportFormOpened(context, tracker);
    return form;
}

async function reportFormClosed(context, tracker) {
    noteTrackedFormClose(tracker);
    const pending = pendingClosedSaveAttempt(tracker);
    if (!pending) return;
    tracker.closeReportInFlight = true;
    let durable = false;
    try {
        durable = await completePendingFormClose(context, tracker, pending);
    } finally {
        tracker.closeReportInFlight = false;
    }
    if (!durable) return;
    await context.post({
        type: 'settings-save-durable-close',
        ok: true,
        attemptId: pending.attemptId,
        successToastVisible: true,
    });
}

function noteTrackedFormClose(tracker) {
    if (!tracker.formWasOpen) return;
    tracker.formWasOpen = false;
    tracker.formSignature = '';
    tracker.pendingFormCloseAttemptId = tracker.pendingSaveAttempt?.attemptId ?? '';
}

function pendingClosedSaveAttempt(tracker) {
    const pending = tracker.pendingSaveAttempt;
    const eligible = [
        Boolean(pending),
        tracker.pendingFormCloseAttemptId === pending?.attemptId,
        !tracker.closeReportInFlight,
    ].every(Boolean);
    return eligible ? pending : null;
}

async function completePendingFormClose(context, tracker, pending) {
    await Promise.resolve(pending.activation);
    await reportFormCloseOnce(context, tracker);
    if (pending.attemptId === context.failedSaveAttemptId) {
        takePendingFormClose(tracker, pending);
        return false;
    }
    const successVisible = await waitForNewSettingsSaveSuccess(pending.priorSuccessToasts);
    if (!durableSaveClose(context, pending, successVisible)) return false;
    return takePendingFormClose(tracker, pending);
}

async function reportFormCloseOnce(context, tracker) {
    if (tracker.pendingFormCloseReported) return;
    tracker.pendingFormCloseReported = true;
    await context.post({ type: 'settings-form-closed' });
}

function durableSaveClose(context, pending, successVisible) {
    return Boolean(pending.attemptId)
        && pending.attemptId !== context.failedSaveAttemptId
        && successVisible === true;
}

function takePendingFormClose(tracker, pending) {
    if (tracker.pendingSaveAttempt !== pending) return false;
    tracker.pendingSaveAttempt = null;
    tracker.pendingFormCloseAttemptId = '';
    tracker.pendingFormCloseReported = false;
    return true;
}

async function reportFormOpened(context, tracker) {
    if (!tracker.formWasOpen) await context.post({ type: 'settings-form-open' });
    tracker.formWasOpen = true;
}

async function reportChangedFormState(context, tracker, state) {
    const signature = JSON.stringify(state);
    if (signature === tracker.formSignature) return;
    tracker.formSignature = signature;
    await context.post({ type: 'settings-form-state', formOpen: true, ...state });
}

function formSaveButton(form) {
    return form.querySelector('button[type="submit"]');
}

function buttonDisabled(button) {
    if (!button) return false;
    return button.matches(':disabled');
}

function saveBlockedValue(save) {
    if (!save) return '';
    return save.dataset.saveBlocked ?? '';
}

function storageLocalSettingsChange(changes, areaName, config) {
    if (areaName !== 'local') return null;
    return changes[`${config.storagePrefix}${config.settingsKey}`] ?? null;
}

/** Runs after the unmodified Study app in the disposable extension page. */
async function studyObserver(config) {
    const context = createStudyProbeContext(config);
    const scenario = studyScenario(config);
    await waitForStudyBoot(context, scenario);
    if (await completeMigrationScenario(context, scenario)) return;
    installStudyStorageObserver(context);
    await installStudyFormObserver(context);
    await openReaderArticleOnce(context);
    if (!await issueStudyLiveWriteOnce(context)) return;
    installStudyPhasePolling(context);
}

function createStudyProbeContext(config) {
    const studyInstanceId = crypto.randomUUID();
    return {
        config,
        studyInstanceId,
        post: event => postBrowserProbeEvent(config, 'study', { ...event, studyInstanceId }).catch(() => undefined),
        readSettings: () => globalThis.GM_getValue(config.settingsKey, null),
        relevantKeyNames: () => studyRelevantKeyNames(config),
        activeSaveAttemptId: '',
        activeSaveActivation: null,
        failedSaveAttemptId: '',
        faultReady: false,
        faultAuthoritySnapshot: '',
        successToastObserved: false,
        studyFinalStateReported: false,
    };
}

async function studyCanonicalSummary(config) {
    return settingsSummary(await globalThis.GM_getValue(config.settingsKey, null));
}

async function studyRelevantKeyNames(config) {
    const values = await browser.storage.local.get(null);
    return Object.keys(values).filter(key => studyRelevantKey(key, config)).sort();
}

function studyRelevantKey(key, config) {
    return [
        key === config.settingsKey,
        key === config.intentKey,
        key === config.privateKey,
        key === `${config.storagePrefix}${config.settingsKey}`,
        key === `${config.storagePrefix}${config.intentKey}`,
        key === `${config.storagePrefix}${config.privateKey}`,
        key.includes(encodeURIComponent(config.settingsKey)),
        key.includes(encodeURIComponent(config.intentKey)),
        key.includes(encodeURIComponent(config.privateKey)),
        key === config.unrelatedKey,
    ].some(Boolean);
}

function studyScenario(config) {
    return sessionStorage.getItem(config.scenarioKey) ?? 'raw-only';
}

async function waitForStudyBoot(context, scenario) {
    await browserWaitFor(() => document.body.childElementCount > 0);
    await browserWaitFor(async () => (await studyCanonicalSummary(context.config)).theme);
    const current = await studyCanonicalSummary(context.config);
    await context.post({
        type: 'surface-boot',
        scenario,
        ...current,
        darkClass: document.documentElement.classList.contains('jpdb-reader-theme-dark'),
    });
    return current;
}

async function completeMigrationScenario(context, scenario) {
    if (scenario === 'live') return false;
    const proof = await waitForMigrationScenarioProof(context, scenario);
    if (!proof) {
        await context.post({
            type: `migration-${scenario}`,
            scenario,
            ok: false,
            keyNames: await context.relevantKeyNames(),
        });
        return true;
    }
    await context.post({
        type: `migration-${scenario}`,
        scenario,
        ok: true,
        authorityPairValid: true,
        ...proof.current,
        keyNames: proof.keyNames,
    });
    await advanceMigrationScenario(context.config, scenario);
    return true;
}

function waitForMigrationScenarioProof(context, scenario, timeout = 10_000) {
    return browserWaitFor(async () => {
        const before = await migrationScenarioProof(context, scenario);
        if (!before) return null;
        await new Promise(resolve => setTimeout(resolve, 500));
        return migrationScenarioProof(context, scenario);
    }, timeout);
}

async function migrationScenarioProof(context, scenario) {
    const { config } = context;
    const values = await browser.storage.local.get(null);
    const observation = migrationPhysicalObservation(values, config);
    if (!observation) return null;
    const current = settingsSummary(observation.settings);
    const keyNames = Object.keys(values).filter(key => studyRelevantKey(key, config)).sort();
    const presence = migrationKeyPresence(keyNames, config);
    const valid = [
        migrationScenarioMatches(scenario, current, presence),
        migrationAuthorityMatches(scenario, values, config),
        darkThemeClass(current.theme),
    ].every(Boolean);
    return valid ? { current, keyNames } : null;
}

function migrationPhysicalObservation(values, config) {
    const settingsKey = `${config.storagePrefix}${config.settingsKey}`;
    const intentKey = `${config.storagePrefix}${config.intentKey}`;
    if (![Object.hasOwn(values, settingsKey), Object.hasOwn(values, intentKey)].every(Boolean)) return null;
    const pair = authorityPayloadPair(values[settingsKey], values[intentKey]);
    return pair ? { settings: pair.settings, intent: pair.intent } : null;
}

function migrationKeyPresence(keys, config) {
    return {
        rawSettings: keys.includes(config.settingsKey),
        rawIntent: keys.includes(config.intentKey),
        canonicalSettings: keys.includes(`${config.storagePrefix}${config.settingsKey}`),
        canonicalIntent: keys.includes(`${config.storagePrefix}${config.intentKey}`),
    };
}

function migrationScenarioMatches(scenario, current, presence) {
    const evaluators = {
        'raw-only': rawMigrationMatches,
        'prefixed-only': prefixedMigrationMatches,
        divergent: divergentMigrationMatches,
    };
    return evaluators[scenario](current, presence);
}

function migrationAuthorityMatches(scenario, values, config) {
    const plan = migrationAuthorityPlan(scenario, config);
    const actualNames = Object.keys(values).filter(key => studySettingsAuthorityKey(key, config)).sort();
    if (!probeValuesMatch(actualNames, plan.expectedNames)) return false;
    const canonicalMatches = physicalAuthorityPairMatches(
        values,
        plan.canonicalSettingsKey,
        plan.canonicalIntentKey,
        plan.canonicalSettings,
        plan.canonicalIntent,
    );
    if (!canonicalMatches) return false;
    return plan.rawRequired ? physicalAuthorityPairMatches(
        values,
        plan.rawSettingsKey,
        plan.rawIntentKey,
        plan.rawSettings,
        plan.rawIntent,
    ) : true;
}

function migrationAuthorityPlan(scenario, config) {
    const rawSettingsKey = config.settingsKey;
    const rawIntentKey = config.intentKey;
    const canonicalSettingsKey = `${config.storagePrefix}${config.settingsKey}`;
    const canonicalIntentKey = `${config.storagePrefix}${config.intentKey}`;
    const rawRequired = scenario !== 'prefixed-only';
    const canonicalSeed = config.scenarios[scenario];
    const rawSeed = config.scenarios[scenario];
    const canonicalSourceKeys = {
        'raw-only': [rawSettingsKey, rawIntentKey],
        'prefixed-only': [canonicalSettingsKey, canonicalIntentKey],
        divergent: [canonicalSettingsKey, canonicalIntentKey],
    }[scenario];
    const expectedNames = [canonicalSettingsKey, canonicalIntentKey];
    if (rawRequired) expectedNames.push(rawSettingsKey, rawIntentKey);
    return {
        rawRequired,
        rawSettingsKey,
        rawIntentKey,
        rawSettings: rawSeed[rawSettingsKey],
        rawIntent: rawSeed[rawIntentKey],
        canonicalSettingsKey,
        canonicalIntentKey,
        canonicalSettings: canonicalSeed[canonicalSourceKeys[0]],
        canonicalIntent: canonicalSeed[canonicalSourceKeys[1]],
        expectedNames: expectedNames.sort(),
    };
}

function rawMigrationMatches(current, presence) {
    const { rawSettings, rawIntent, canonicalSettings, canonicalIntent } = presence;
    // Namespace contract: rawSettings && rawIntent && canonicalSettings && canonicalIntent
    return [
        current.theme === 'dark',
        current.subtitleFontSize === 47,
        current.sentinel === 'v1.9.2-raw-only',
        rawSettings,
        rawIntent,
        canonicalSettings,
        canonicalIntent,
    ].every(Boolean);
}

function prefixedMigrationMatches(current, presence) {
    const { rawSettings, rawIntent, canonicalSettings, canonicalIntent } = presence;
    // Namespace contract: !rawSettings && !rawIntent && canonicalSettings && canonicalIntent
    return [
        current.theme === 'light',
        current.subtitleFontSize === 31,
        current.sentinel === 'v1.9.2-canonical',
        !rawSettings,
        !rawIntent,
        canonicalSettings,
        canonicalIntent,
    ].every(Boolean);
}

function divergentMigrationMatches(current, presence) {
    const { rawSettings, rawIntent, canonicalSettings, canonicalIntent } = presence;
    return [
        current.theme === 'light',
        current.subtitleFontSize === 31,
        current.sentinel === 'v1.9.2-divergent-canonical',
        rawSettings,
        rawIntent,
        canonicalSettings,
        canonicalIntent,
    ].every(Boolean);
}

async function advanceMigrationScenario(config, scenario) {
    const nextScenarios = { 'raw-only': 'prefixed-only', 'prefixed-only': 'divergent', divergent: 'live' };
    const nextScenario = nextScenarios[scenario];
    sessionStorage.setItem(config.scenarioKey, nextScenario);
    await browser.storage.local.set({ [config.scenarioKey]: nextScenario });
    location.reload();
}

function installStudyStorageObserver(context) {
    browser.storage.onChanged.addListener((changes, areaName) => {
        void handleStudyStorageChange(context, changes, areaName);
    });
}

async function handleStudyStorageChange(context, changes, areaName) {
    const change = storageLocalSettingsChange(changes, areaName, context.config);
    if (!change) return;
    void observeSettingsSurface(context, change.newValue);
    await reportStudyReaderWrite(context, change.newValue);
}

async function reportStudyReaderWrite(context, observedValue) {
    if (context.studyFinalStateReported) return;
    const expectedSettings = physicalAuthorityValue(observedValue);
    if (!expectedSettings) return;
    const expected = settingsSummary(expectedSettings);
    const readerWrite = [
        expected.theme === 'light',
        expected.subtitleFontSize === 39,
        expected.sentinel === 'reader-live-write',
    ].every(Boolean);
    if (!readerWrite) return;
    await reportStudyFinalState(context, expectedSettings, expected);
}

async function reportStudyFinalState(context, expectedSettings, expected) {
    const finalState = await waitForExpectedCanonicalAuthoritySurface(
        context,
        expectedSettings,
        context.config.readerLiveIntent,
    );
    if (!finalState) {
        await context.post({
            type: 'study-final-state',
            ok: false,
            authorityPairValid: false,
            ...expected,
        });
        return;
    }
    context.studyFinalStateReported = true;
    await context.post({
        type: 'study-observed-reader-write',
        ok: true,
        ...finalState,
    });
    await context.post({ type: 'study-final-state', ok: true, ...finalState });
}

async function installStudyFormObserver(context) {
    const tracker = createSettingsFormTracker();
    document.addEventListener('click', event => reportSettingsSaveActivation(context, tracker, event), true);
    new MutationObserver(records => {
        observeStudySuccessToast(context);
        observeStudyImportResult(context, tracker, records);
        void inspectStudySettingsForm(context, tracker);
    }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'data-save-blocked', 'hidden', 'class'],
    });
    await inspectStudySettingsForm(context, tracker);
}

async function inspectStudySettingsForm(context, tracker) {
    const form = await trackedSettingsForm(context, tracker);
    if (!form) return;
    await observeRequestedStudyPanel(context, tracker, form);
    const state = studyFormState(form);
    await reportChangedFormState(context, tracker, state);
    await observeStudyImportLock(context, tracker, state);
    await observeStudyImportComplete(context, tracker, state);
}

async function observeRequestedStudyPanel(context, tracker, form) {
    const { config } = context;
    const panel = requestedStudyPanelRequest(config, tracker);
    if (!panel) return;
    const proof = await requestedStudyPanelState(config, form, panel);
    if (!requestedStudyPanelAccepted(tracker, proof)) return;
    tracker.requestedPanelReported = true;
    sessionStorage.removeItem(config.requestedPanelKey);
    await browser.storage.local.remove(config.launcherProofKey);
    await context.post({ type: 'requested-settings-panel-open', ok: true, panel: proof.panel, formOpen: true });
}

function requestedStudyPanelRequest(config, tracker) {
    if (tracker.requestedPanelReported) return '';
    return sessionStorage.getItem(config.requestedPanelKey) || '';
}

function requestedStudyPanelAccepted(tracker, proof) {
    return !tracker.requestedPanelReported && requestedStudyPanelProof(proof);
}

async function requestedStudyPanelState(config, form, panel) {
    const launcherAuthorized = await browserWaitFor(() => launcherProofAuthorized(config), 5_000);
    const panelElement = form.querySelector('[data-settings-panel="appearance"]');
    return {
        launcherAuthorized: launcherAuthorized === true,
        panel,
        formOpen: form.isConnected,
        panelVisible: panelElement?.hidden === false,
    };
}

async function launcherProofAuthorized(config) {
    const launcherState = await browser.storage.local.get(config.launcherProofKey);
    return launcherState[config.launcherProofKey] === true;
}

function requestedStudyPanelProof(proof) {
    return [
        proof.launcherAuthorized,
        proof.panel === 'appearance',
        proof.formOpen,
        proof.panelVisible,
    ].every(Boolean);
}

function studyFormState(form) {
    const save = formSaveButton(form);
    const importButton = form.querySelector('[data-action="import-yomitan-settings"]');
    return {
        saveDisabled: buttonDisabled(save),
        importDisabled: buttonDisabled(importButton),
        saveBlocked: saveBlockedValue(save),
        statusVisible: visibleImportStatus(importStatusElement(form)),
    };
}

function importStatusElement(form) {
    return form.querySelector('#jpdb-reader-settings-panel-backup [data-import-status]')
        ?? form.querySelector('[data-import-status]');
}

function visibleImportStatus(status) {
    if (!status) return false;
    return [!status.hidden, nonEmptyText(status.textContent)].every(Boolean);
}

function nonEmptyText(value) {
    if (typeof value !== 'string') return false;
    return Boolean(value.trim());
}

async function observeStudyImportLock(context, tracker, state) {
    const locked = [state.saveDisabled, state.importDisabled, state.saveBlocked === 'settings-import'].every(Boolean);
    if (!locked) return;
    tracker.importLockSeen = true;
    await context.post({ type: 'import-lock', ok: true, formOpen: true, ...state });
}

async function observeStudyImportComplete(context, tracker, state) {
    const unlocked = [tracker.importLockSeen, tracker.importResultSeen, !state.saveDisabled, !state.importDisabled]
        .every(Boolean);
    if (!unlocked) return;
    const imported = await studyCanonicalSummary(context.config);
    if (![imported.theme === 'dark', imported.subtitleFontSize === 43].every(Boolean)) return;
    tracker.importLockSeen = false;
    await context.post({ type: 'import-complete', ok: true, formOpen: true, ...state, ...imported });
}

function observeStudyImportResult(context, tracker, records) {
    if (![tracker.importLockSeen, !tracker.importResultSeen].every(Boolean)) return;
    const status = records.map(importStatusFromMutationRecord).find(candidate => visibleImportStatus(candidate));
    if (!status) return;
    tracker.importResultSeen = true;
    void context.post({ type: 'import-result', ok: true, statusVisible: true });
}

function importStatusFromMutationRecord(record) {
    const target = mutationRecordElement(record);
    if (!target) return null;
    if (target.matches('[data-import-status]')) return target;
    return target.closest('[data-import-status]');
}

function mutationRecordElement(record) {
    if (record.target instanceof Element) return record.target;
    if (record.target.parentElement instanceof Element) return record.target.parentElement;
    return null;
}

async function openReaderArticleOnce(context) {
    const { config } = context;
    if (!await claimDisposableFlag(config.articleOpenedKey)) return;
    await browser.tabs.create({ url: config.articleUrl, active: true });
}

async function issueStudyLiveWriteOnce(context) {
    const { config } = context;
    if (await disposableFlagSet(config.liveWriteKey)) return true;
    if (!await readerSurfaceReady(config)) {
        await context.post({ type: 'study-live-prerequisite', ok: false });
        return false;
    }
    if (!await claimDisposableFlag(config.liveWriteKey)) return true;
    return performStudyLiveWrite(context);
}

async function performStudyLiveWrite(context) {
    const { config } = context;
    const written = await writeStudyLiveSettings(config);
    const expected = { theme: 'dark', subtitleFontSize: 37, sentinel: 'study-live-write' };
    const finalState = await waitForExpectedCanonicalAuthoritySurface(
        context,
        written.settings,
        written.intent,
    );
    const proof = finalState ?? expected;
    await context.post({
        type: 'study-write-issued',
        ok: Boolean(finalState),
        authorityPairValid: Boolean(finalState),
        ...proof,
    });
    return Boolean(finalState);
}

async function disposableFlagSet(key) {
    const state = await browser.storage.local.get(key);
    return state[key] === true;
}

async function claimDisposableFlag(key) {
    if (await disposableFlagSet(key)) return false;
    await browser.storage.local.set({ [key]: true });
    return true;
}

async function readerSurfaceReady(config) {
    return browserWaitFor(async () => {
        const state = await fetch(`${config.serverOrigin}/probe/state`).then(response => response.json());
        return state.readerReady;
    }, 20_000);
}

async function writeStudyLiveSettings(config) {
    const current = await globalThis.GM_getValue(config.settingsKey, {});
    const currentSettings = settingsAuthorityObject(
        current,
        'Study live write could not read the complete physical settings value.',
    );
    const settings = {
        ...settingsObject(currentSettings),
        theme: 'dark',
        subtitleFontSize: 37,
        firefoxSettingsAuthoritySmokeSentinel: 'study-live-write',
    };
    const intent = config.studyLiveIntent;
    await globalThis.GM_setValue(config.intentKey, intent);
    await globalThis.GM_setValue(config.settingsKey, settings);
    return { settings, intent };
}

function installStudyPhasePolling(context) {
    const posted = {
        faultReady: false,
        faultResult: false,
        factoryReset: false,
        studyLiveAt: 0,
        faultSnapshotCandidate: '',
        faultSnapshotCandidateAt: 0,
    };
    void pollStudyPhase(context, posted);
    setInterval(() => { void pollStudyPhase(context, posted); }, 400);
}

async function pollStudyPhase(context, posted) {
    const state = await fetchProbeState(context.config);
    if (!state) return;
    await maybeReportStudyInstanceLive(context, posted);
    await maybePrepareStorageFault(context, state, posted);
    await maybeReportStorageFault(context, state, posted);
    await maybeReportFactoryReset(context, state, posted);
}

async function maybeReportStudyInstanceLive(context, posted) {
    const now = Date.now();
    if (now - posted.studyLiveAt < 2_000) return;
    posted.studyLiveAt = now;
    await context.post({ type: 'study-instance-live', ok: true });
}

function fetchProbeState(config) {
    return fetch(`${config.serverOrigin}/probe/state`)
        .then(response => response.json())
        .catch(() => null);
}

function shouldPrepareStorageFault(context, state, posted) {
    return [
        state.phase === 'storage-failure-preparing',
        state.storageFailureStudyInstanceId === context.studyInstanceId,
        !posted.faultReady,
    ].every(Boolean);
}

async function stableStorageFaultSnapshot(context, posted, observedAt = Date.now()) {
    const snapshot = await studySettingsAuthoritySnapshot(context.config);
    if (snapshot !== posted.faultSnapshotCandidate) {
        posted.faultSnapshotCandidate = snapshot;
        posted.faultSnapshotCandidateAt = observedAt;
        return '';
    }
    if (observedAt - posted.faultSnapshotCandidateAt < 800) return '';
    return snapshot;
}

async function maybePrepareStorageFault(context, state, posted) {
    if (!shouldPrepareStorageFault(context, state, posted)) return;
    const snapshot = await stableStorageFaultSnapshot(context, posted);
    if (!snapshot) return;
    context.faultAuthoritySnapshot = snapshot;
    context.faultReady = true;
    sessionStorage.setItem(context.config.faultKey, 'ready');
    posted.faultReady = true;
    await context.post({ type: 'fault-ready', ok: true });
}

function armPreparedStorageFault(context, attemptId) {
    if (!context.faultReady) return null;
    context.faultReady = false;
    if (sessionStorage.getItem(context.config.faultKey) !== 'ready') return false;
    sessionStorage.setItem(context.config.faultKey, `armed:${attemptId}`);
    return true;
}

function storageFaultReportReady(context, state, posted) {
    return [
        state.phase === 'storage-failure',
        state.storageFailureStudyInstanceId === context.studyInstanceId,
        Boolean(context.activeSaveAttemptId),
        sessionStorage.getItem(context.config.faultKey) === `consumed:${context.activeSaveAttemptId}`,
        !posted.faultResult,
    ].every(Boolean);
}

async function maybeReportStorageFault(context, state, posted) {
    if (!storageFaultReportReady(context, state, posted)) return;
    posted.faultResult = true;
    const result = await completedStorageFaultResult(context);
    await context.activeSaveActivation;
    context.failedSaveAttemptId = context.activeSaveAttemptId;
    await context.post(storageFaultEvent(context, result));
}

async function completedStorageFaultResult(context) {
    const durable = await waitForDurableStorageFault(context);
    if (durable) return durable;
    return { ...await storageFaultResult(context), ok: false };
}

function storageFaultEvent(context, result) {
    if (!context.activeSaveAttemptId) return { type: 'fault-result', ...result, ok: false };
    return { type: 'fault-result', ...result, attemptId: context.activeSaveAttemptId };
}

function waitForDurableStorageFault(context) {
    return browserWaitFor(async () => {
        const before = await storageFaultResult(context);
        if (!before.ok) return null;
        await new Promise(resolve => setTimeout(resolve, 750));
        const after = await storageFaultResult(context);
        return after.ok ? after : null;
    }, 10_000);
}

async function storageFaultResult(context) {
    const stored = await studyCanonicalSummary(context.config);
    const durableUnchanged = context.faultAuthoritySnapshot !== ''
        && context.faultAuthoritySnapshot === await studySettingsAuthoritySnapshot(context.config);
    const form = latestSettingsForm();
    const formOpen = Boolean(form);
    const formState = form
        ? studyFormState(form)
        : { saveDisabled: true, importDisabled: true, saveBlocked: '' };
    const toastVisible = successToastVisible();
    const failureVisible = failureToastVisible();
    const ok = [
        formOpen,
        !formState.saveDisabled,
        !formState.importDisabled,
        formState.saveBlocked === '',
        !toastVisible,
        !context.successToastObserved,
        failureVisible,
        durableUnchanged,
        stored.theme === 'dark',
        stored.subtitleFontSize === 43,
        stored.sentinel === 'backup-import',
    ].every(Boolean);
    return {
        ok,
        formOpen,
        successToastVisible: toastVisible,
        successToastObserved: context.successToastObserved,
        failureToastVisible: failureVisible,
        durableUnchanged,
        saveDisabled: formState.saveDisabled,
        importDisabled: formState.importDisabled,
        saveBlocked: formState.saveBlocked,
        ...stored,
    };
}

async function studySettingsAuthoritySnapshot(config) {
    const values = await browser.storage.local.get(null);
    const entries = Object.entries(values)
        .filter(([key]) => studySettingsAuthorityKey(key, config))
        .sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify(entries);
}

function studySettingsAuthorityKey(key, config) {
    return [
        key === config.settingsKey,
        key === config.intentKey,
        key === `${config.storagePrefix}${config.settingsKey}`,
        key === `${config.storagePrefix}${config.intentKey}`,
        key.includes(encodeURIComponent(config.settingsKey)),
        key.includes(encodeURIComponent(config.intentKey)),
    ].some(Boolean);
}

function observeStudySuccessToast(context) {
    if (successToastVisible()) context.successToastObserved = true;
}

function settingsSaveSuccessToasts() {
    return [...document.querySelectorAll('.jpdb-reader-toast')]
        .filter(toast => toast.textContent?.trim() === 'Settings saved.');
}

function newSettingsSaveSuccessVisible(priorToasts) {
    return settingsSaveSuccessToasts().some(toast => [
        !priorToasts.includes(toast),
        toast.classList.contains('is-visible'),
    ].every(Boolean));
}

function waitForNewSettingsSaveSuccess(priorToasts) {
    return browserWaitFor(() => newSettingsSaveSuccessVisible(priorToasts), 4_000);
}

function successToastVisible() {
    return settingsSaveSuccessToasts().some(toast => toast.classList.contains('is-visible'));
}

function failureToastVisible() {
    return [...document.querySelectorAll('.jpdb-reader-toast.is-visible')]
        .some(toast => toast.textContent?.trim() === 'Settings save failed.');
}

async function maybeReportFactoryReset(context, state, posted) {
    if (state.phase !== 'factory-reset') return;
    if (posted.factoryReset) return;
    const { config } = context;
    const keys = await context.relevantKeyNames();
    const logicalValues = await logicalManagedValues(config);
    const managedAuthorityKeys = keys.filter(key => key !== config.unrelatedKey);
    const unrelatedPresent = keys.includes(config.unrelatedKey);
    const logicalAuthorityAbsent = logicalValues.every(value => value === null);
    if (!factoryResetComplete(logicalAuthorityAbsent, managedAuthorityKeys, unrelatedPresent)) return;
    posted.factoryReset = true;
    await context.post({ type: 'factory-reset-result', ok: true, unrelatedPresent, keyNames: keys });
}

function logicalManagedValues(config) {
    return Promise.all([
        config.settingsKey,
                config.intentKey,
                config.privateKey,
    ].map(key => globalThis.GM_getValue(key, null).catch(() => null)));
}

function factoryResetComplete(logicalAuthorityAbsent, managedAuthorityKeys, unrelatedPresent) {
    return logicalAuthorityAbsent && managedAuthorityKeys.length === 0 && unrelatedPresent;
}

/** Runs as a final content script on the deterministic ordinary website. */
async function contentProbe(config) {
    if (location.pathname !== '/article/') return;
    const context = createContentProbeContext(config);
    await browserWaitFor(readerSurfaceInitialized);
    await context.post({ type: 'reader-ready', ok: true });
    installContentStorageObserver(context);
    installContentLauncherObserver(context);
}

function createContentProbeContext(config) {
    return {
        config,
        post: event => postBrowserProbeEvent(config, 'reader', event).catch(() => undefined),
        readSettings: () => contentSettings(config),
        readerWriteIssued: false,
        launcherVisibleReported: false,
    };
}

async function compilerMessage(type, payload = {}) {
    const response = await browser.runtime.sendMessage({ channel: 'userscript-compiler', type, payload });
    return validatedCompilerResponse(response);
}

function validatedCompilerResponse(response) {
    if (!response) throw new Error('Compiler background did not respond.');
    if (response.error) throw new Error(response.error);
    return response;
}

async function contentSettings(config) {
    const response = await compilerMessage('GM_getValue', { name: config.settingsKey, defaultValue: null });
    return response.value;
}

function readerSurfaceInitialized() {
    return [
        globalThis.__yomuReaderAppInitialized,
        document.querySelector('.jpdb-reader-fab'),
        document.querySelector('#target .jpdb-reader-word'),
    ].some(Boolean);
}

function installContentStorageObserver(context) {
    browser.storage.onChanged.addListener((changes, areaName) => {
        void handleContentStorageChange(context, changes, areaName);
    });
}

async function handleContentStorageChange(context, changes, areaName) {
    const change = storageLocalSettingsChange(changes, areaName, context.config);
    if (!change) return;
    void observeSettingsSurface(context, change.newValue);
    const nextSettings = physicalAuthorityValue(change.newValue);
    if (!nextSettings) return;
    const next = settingsSummary(nextSettings);
    if (!shouldIssueReaderWrite(context, next)) return;
    context.readerWriteIssued = true;
    void issueReaderWrite(context, nextSettings).catch(() => reportReaderWriteFailure(context));
}

function shouldIssueReaderWrite(context, next) {
    return [
        next.theme === 'dark',
        next.subtitleFontSize === 37,
        next.sentinel === 'study-live-write',
        !context.readerWriteIssued,
    ].every(Boolean);
}

async function issueReaderWrite(context, observedSettings) {
    const { config } = context;
    const observedStudyState = requireProbeResult(await waitForExpectedCanonicalAuthoritySurface(
        context,
        observedSettings,
        config.studyLiveIntent,
    ), 'Reader did not settle on the Study live-write state.');
    await context.post({
        type: 'reader-observed-study-write',
        ok: true,
        ...observedStudyState,
    });
    requireProbeResult(
        await waitForStudyWriteAcknowledgement(config),
        'Study live-write acknowledgement did not reach the probe server.',
    );
    const current = await contentSettings(config);
    const currentSettings = settingsAuthorityObject(
        current,
        'Reader live write could not read the complete physical settings value.',
    );
    const settings = {
        ...settingsObject(currentSettings),
        theme: 'light',
        subtitleFontSize: 39,
        firefoxSettingsAuthoritySmokeSentinel: 'reader-live-write',
    };
    const intent = config.readerLiveIntent;
    await compilerMessage('GM_setValue', {
        name: config.intentKey,
        value: intent,
    });
    await compilerMessage('GM_setValue', {
        name: config.settingsKey,
        value: settings,
    });
    const expected = { theme: 'light', subtitleFontSize: 39, sentinel: 'reader-live-write' };
    requireProbeResult(
        await waitForExpectedCanonicalAuthorityPair(config, settings, intent),
        'Reader physical authority pair did not settle after its live write.',
    );
    await context.post({ type: 'reader-write-issued', ok: true, authorityPairValid: true, ...expected });
    const finalState = requireProbeResult(
        await waitForExpectedCanonicalAuthoritySurface(context, settings, intent),
        'Reader final live-write state did not settle.',
    );
    await context.post({ type: 'reader-final-state', ok: true, ...finalState });
}

function waitForStudyWriteAcknowledgement(config) {
    return browserWaitFor(async () => {
        const state = await fetchProbeState(config);
        return state?.studyWriteAcknowledged === true;
    }, 20_000);
}

function reportReaderWriteFailure(context) {
    return context.post({ type: 'reader-live-write', ok: false });
}

function installContentLauncherObserver(context) {
    document.addEventListener('click', event => {
        void reportContentLauncherActivation(context, event);
    }, true);
    new MutationObserver(() => { void inspectContentSettingsLauncher(context); })
        .observe(document.documentElement, { subtree: true, childList: true });
    void inspectContentSettingsLauncher(context);
}

async function inspectContentSettingsLauncher(context) {
    if (context.launcherVisibleReported) return;
    const launcher = contentSettingsLauncher();
    if (!launcher) return;
    const state = contentSettingsLauncherState(launcher);
    context.launcherVisibleReported = true;
    await context.post({ type: 'settings-launcher-visible', ok: launcherSurfaceProof(state), ...state });
}

function contentSettingsLauncherState(launcher) {
    return {
        launcherVisible: launcher.isConnected,
        formOpen: Boolean(latestSettingsForm()),
        writableInputsPresent: Boolean(writableSettingsInput(launcher)),
        launcherActionPresent: Boolean(launcher.querySelector('[data-trusted-settings-launcher]')),
    };
}

function launcherSurfaceProof(state) {
    return [
        state.launcherVisible,
        state.formOpen === false,
        state.writableInputsPresent === false,
        state.launcherActionPresent,
    ].every(Boolean);
}

async function reportContentLauncherActivation(context, event) {
    const launcher = contentLauncherFromEvent(event);
    if (!launcher) return;
    const state = contentSettingsLauncherState(launcher);
    const ok = launcherSurfaceProof(state);
    await authorizeContentLauncher(context.config, event.isTrusted, ok);
    await context.post({ type: 'settings-launcher-activate', ok, trusted: event.isTrusted });
}

function contentLauncherFromEvent(event) {
    if (!(event.target instanceof Element)) return null;
    const action = event.target.closest('[data-trusted-settings-launcher]');
    return action?.closest('[data-sensitive-settings-launcher="true"]') ?? null;
}

async function authorizeContentLauncher(config, trusted, valid) {
    if (!trusted || !valid) return;
    await browser.storage.local.set({ [config.launcherProofKey]: true });
}

function contentSettingsLauncher() {
    return document.querySelector('[data-sensitive-settings-launcher="true"]');
}

function writableSettingsInput(launcher) {
    return launcher.querySelector('input, select, textarea, [contenteditable]:not([contenteditable="false"])');
}
