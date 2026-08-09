import { createHash, randomUUID } from 'node:crypto';
import {
    closeSync,
    existsSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readSync,
    realpathSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const CUSTOM_CHANNEL_KEY = 'YOMU_LIVE_YOUTUBE_CHROMIUM_CHANNEL';
const CUSTOM_EXECUTABLE_KEY = 'YOMU_LIVE_YOUTUBE_CHROMIUM_EXECUTABLE';
const AMBIENT_PROGRESS_RATIO = 0.8;
const AMBIENT_WINDOW_RATIO = 0.95;
const MAX_AMBIENT_SAMPLE_GAP_MS = 2_000;
const TERMINAL_FILE_SYSTEM = Object.freeze({ mkdirSync, renameSync, rmSync, writeFileSync });
const KNOWN_WEBKIT_WRAPPER_SHA256 = Object.freeze([
    'a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b',
]);
const LINUX_WEBKIT_VARIANTS = new Map([
    [true, Object.freeze({ build: 'GTK', minibrowser: 'minibrowser-gtk' })],
    [false, Object.freeze({ build: 'WPE', minibrowser: 'minibrowser-wpe' })],
]);
let atomicWriteSequence = 0;

/**
 * Owns the machine-facing seams of a live profile run. The live driver supplies
 * Playwright objects and observations; this Module binds them to durable
 * evidence without exposing filesystem or environment branching to the driver.
 */
export function createLiveProfileRunSupport({
    environment = process.env,
    headed = false,
    platform = process.platform,
    terminalFileSystem = TERMINAL_FILE_SYSTEM,
    webkitWrapperSha256Allowlist = KNOWN_WEBKIT_WRAPPER_SHA256,
} = {}) {
    const executableIdentities = new Map();
    return Object.freeze({
        launchPlan: (run, browserType, browserRegistry) => browserLaunchPlan(
            run,
            browserType,
            browserRegistry,
            environment,
            headed,
            platform,
            webkitWrapperSha256Allowlist,
            executableIdentities,
        ),
        fatalRequestLedger: classify => createFatalRequestLedger(classify),
        browserDiagnostics: () => createBrowserDiagnostics(),
        ambientWindow: (samples, boundary) => ambientWindowEvidence(samples, boundary),
        captureWorkloadEnd: collectors => captureWorkloadEnd(collectors),
        prepareOutputDirectory: options => prepareLiveProfileOutputDirectory(options),
        verifyLaunchIdentity: descriptor => verifyLaunchIdentity(descriptor),
        writeTerminalSuccess: (outputRoot, report) => writeTerminalSuccessArtifact(
            outputRoot,
            report,
            terminalFileSystem,
        ),
        writeTerminalFailure: (outputRoot, report, terminal) => writeTerminalFailureArtifacts(
            outputRoot,
            report,
            terminal,
            terminalFileSystem,
        ),
    });
}

/**
 * Creates one fresh, owned run directory. Validation is deliberately complete
 * before mkdir touches the filesystem: callers may only name a strict child of
 * the live-watch artifact root, and existing symlink aliases below the QA root
 * are rejected instead of being followed.
 */
function prepareLiveProfileOutputDirectory({
    requestedPath,
    qaArtifactsRoot,
} = {}) {
    const qaRoot = resolve(requiredText(qaArtifactsRoot, 'Live profiler QA artifact root is missing.'));
    const profileRoot = join(qaRoot, 'youtube-live-watch-performance');
    const outputRoot = requestedPath === undefined
        ? join(profileRoot, freshRunDirectoryName())
        : resolve(requiredText(requestedPath, 'Live profiler output directory is missing.'));
    assertPathIsNotSymlink(qaRoot);
    assertFreshProfileOutput(outputRoot, qaRoot, profileRoot);

    const outputParent = dirname(outputRoot);
    mkdirSync(outputParent, { recursive: true });
    assertPhysicalProfileContainment(outputParent, qaRoot, profileRoot);
    assertNoSymlinkComponents(qaRoot, outputParent);
    assertPathMissing(outputRoot);
    mkdirSync(outputRoot, { recursive: false });
    assertPhysicalProfileContainment(outputRoot, qaRoot, profileRoot);
    return realpathSync(outputRoot);
}

function freshRunDirectoryName() {
    const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
    return `run-${timestamp}-${randomUUID()}`;
}

function assertFreshProfileOutput(outputRoot, qaRoot, profileRoot) {
    assertStrictProfileChild(outputRoot, profileRoot);
    assertPhysicalProfileContainment(outputRoot, qaRoot, profileRoot);
    assertNoSymlinkComponents(qaRoot, dirname(outputRoot));
    assertPathMissing(outputRoot);
}

function assertStrictProfileChild(outputRoot, profileRoot) {
    if (!isStrictDescendant(profileRoot, outputRoot)) {
        throw new Error(`Live profiler output must be a fresh directory below ${profileRoot}: ${outputRoot}.`);
    }
}

function assertPhysicalProfileContainment(path, qaRoot, profileRoot) {
    const canonicalQaRoot = prospectiveRealPath(qaRoot);
    const canonicalProfileRoot = prospectiveRealPath(profileRoot);
    const canonicalPath = prospectiveRealPath(path);
    if (!isStrictDescendant(canonicalQaRoot, canonicalProfileRoot)) {
        throw new Error(`Live profiler artifact root escapes the QA artifact root: ${profileRoot}.`);
    }
    if (canonicalPath !== canonicalProfileRoot && !isStrictDescendant(canonicalProfileRoot, canonicalPath)) {
        throw new Error(`Live profiler output escapes its artifact root: ${path}.`);
    }
}

function assertNoSymlinkComponents(qaRoot, path) {
    const symlink = descendantPaths(qaRoot, path).find(candidate => pathEntryStat(candidate)?.isSymbolicLink());
    if (symlink) {
        throw new Error(`Live profiler output path contains a symbolic-link ancestor: ${symlink}.`);
    }
}

function descendantPaths(parent, child) {
    const relativePath = relative(parent, child);
    if (relativePath === '') return [];
    if (isOutsidePath(relativePath)) throw new Error(`Live profiler path is outside its trusted ancestor: ${child}.`);
    const segments = relativePath.split(sep);
    return segments.map((_segment, index) => join(parent, ...segments.slice(0, index + 1)));
}

function prospectiveRealPath(path) {
    let existing = resolve(path);
    const missingSegments = [];
    let stat = pathEntryStat(existing);
    while (stat === null) {
        const parent = dirname(existing);
        if (parent === existing) throw new Error(`Live profiler cannot resolve output path: ${path}.`);
        missingSegments.unshift(basename(existing));
        existing = parent;
        stat = pathEntryStat(existing);
    }
    return resolve(realpathSync(existing), ...missingSegments);
}

function pathEntryStat(path) {
    try {
        return lstatSync(path);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

function assertPathMissing(path) {
    if (pathEntryStat(path) !== null) {
        throw new Error(`Live profiler output directory already exists: ${path}.`);
    }
}

function assertPathIsNotSymlink(path) {
    const stat = pathEntryStat(path);
    if (stat?.isSymbolicLink()) {
        throw new Error(`Live profiler output path contains a symbolic-link ancestor: ${path}.`);
    }
}

function isStrictDescendant(parent, child) {
    const candidate = relative(parent, child);
    return candidate !== '' && !isOutsidePath(candidate);
}

function isOutsidePath(path) {
    return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function browserLaunchPlan(
    run,
    browserType,
    browserRegistry,
    environment,
    headed,
    platform,
    webkitWrapperSha256Allowlist,
    executableIdentities,
) {
    if (run.engine === 'chromium') {
        return chromiumLaunchPlan(browserType, browserRegistry, environment, headed, executableIdentities);
    }
    return bundledLaunchPlan(
        'webkit',
        browserType,
        browserRegistry,
        environment,
        headed,
        platform,
        [],
        webkitWrapperSha256Allowlist,
        executableIdentities,
    );
}

function chromiumLaunchPlan(browserType, browserRegistry, environment, headed, executableIdentities) {
    const channel = environmentText(environment, CUSTOM_CHANNEL_KEY);
    const executable = environmentText(environment, CUSTOM_EXECUTABLE_KEY);
    assertCustomBrowserPair(channel, executable);
    const args = ['--autoplay-policy=no-user-gesture-required'];
    if (channel) return customLaunchPlan(channel, executable, headed, args, executableIdentities);
    return bundledLaunchPlan('chromium', browserType, browserRegistry, environment, headed, process.platform, args, [], executableIdentities);
}

function bundledLaunchPlan(
    engine,
    browserType,
    browserRegistry,
    environment,
    headed,
    platform,
    args,
    webkitWrapperSha256Allowlist,
    executableIdentities,
) {
    const registry = registryBrowserIdentity(browserRegistry, engine);
    const launcherPath = realpathSync(resolve(requiredText(browserType.executablePath(), 'Browser executable path is missing.')));
    assertBundledLauncherRevision(engine, launcherPath, registry.revision);
    const payload = bundledPayload(
        engine,
        launcherPath,
        environment,
        headed,
        platform,
        webkitWrapperSha256Allowlist,
    );
    return launchPlan('playwright-bundled', launcherPath, payload, headed, args, registry, false, executableIdentities);
}

function assertBundledLauncherRevision(engine, launcherPath, revision) {
    const segments = resolve(launcherPath).split(/[\\/]/u);
    const exact = new RegExp(`^${engine}-${escapeRegExp(revision)}$`, 'u');
    if (!segments.some(segment => exact.test(segment))) {
        throw new Error(`Playwright ${engine} launcher path does not match registry revision ${revision}: ${launcherPath}.`);
    }
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function customLaunchPlan(channel, executablePath, headed, args, executableIdentities) {
    return launchPlan(channel, executablePath, { path: executablePath, resolution: 'direct' }, headed, args, null, true, executableIdentities);
}

function launchPlan(channel, launcherPath, payload, headed, args, registry, custom, executableIdentities) {
    const launcher = cachedExecutableIdentity(launcherPath, executableIdentities);
    const executable = cachedExecutableIdentity(payload.path, executableIdentities);
    return Object.freeze({
        descriptor: Object.freeze({
            channel,
            custom,
            headed,
            headless: !headed,
            payloadResolution: payload.resolution,
            launcher: launcher.path === executable.path ? null : launcher,
            executable,
            registry,
        }),
        options: Object.freeze({
            headless: !headed,
            executablePath: launcher.path,
            args: Object.freeze([...args]),
            ...(payload.launchEnvironment ? { env: Object.freeze({ ...payload.launchEnvironment }) } : {}),
        }),
    });
}

function bundledPayload(engine, launcherPath, environment, headed, platform, webkitWrapperSha256Allowlist) {
    if (engine !== 'webkit') return { path: launcherPath, resolution: 'direct' };
    return resolveWebKitPayload(
        launcherPath,
        environment,
        headed,
        platform,
        webkitWrapperSha256Allowlist,
    );
}

function resolveWebKitPayload(rawLauncherPath, environment, headed, platform, webkitWrapperSha256Allowlist) {
    const launcherPath = realpathSync(resolve(requiredText(rawLauncherPath, 'Browser executable path is missing.')));
    if (extname(launcherPath) !== '.sh') {
        throw new Error(`Playwright WebKit executable is not a supported wrapper: ${launcherPath}.`);
    }
    if (basename(launcherPath) !== 'pw_run.sh') throw new Error(`Unsupported Playwright WebKit wrapper: ${launcherPath}.`);
    assertKnownWebKitWrapper(launcherPath, platform, webkitWrapperSha256Allowlist);
    const launchEnvironment = bundledWebKitEnvironment(launcherPath, environment);
    const payloadPath = platform === 'darwin'
        ? darwinWebKitPayload(launcherPath)
        : linuxWebKitPayload(launcherPath, headed, platform);
    return {
        path: payloadPath,
        resolution: 'playwright-webkit-wrapper',
        launchEnvironment,
    };
}

function assertKnownWebKitWrapper(launcherPath, platform, sha256Allowlist) {
    const source = readFileSync(launcherPath, 'utf8');
    const marker = platform === 'darwin' ? 'Playwright.app/Contents/MacOS/Playwright' : 'MINIBROWSER';
    const allowed = new Set(requiredArray(sha256Allowlist, 'WebKit wrapper hash allowlist is missing.'));
    const accepted = [
        allowed.has(sha256File(launcherPath)),
        source.includes('SCRIPT_PATH='),
        source.includes(marker),
    ].every(Boolean);
    if (!accepted) {
        throw new Error(`Playwright WebKit wrapper format is unsupported: ${launcherPath}.`);
    }
}

function bundledWebKitEnvironment(launcherPath, environment) {
    const disabledCheckout = join(dirname(launcherPath), '.yomu-disabled-webkit-checkout');
    if (existsSync(disabledCheckout)) {
        throw new Error(`Reserved WebKit checkout guard path exists: ${disabledCheckout}.`);
    }
    return { ...environment, WK_CHECKOUT_PATH: disabledCheckout };
}

function darwinWebKitPayload(launcherPath) {
    const root = dirname(launcherPath);
    const bundledApp = join(root, 'Playwright.app');
    if (isDirectory(bundledApp)) return requiredPayload(join(bundledApp, 'Contents/MacOS/Playwright'), launcherPath);
    const nestedApp = join(root, 'WebKitBuild/Release/Playwright.app');
    if (isDirectory(nestedApp)) return requiredPayload(join(nestedApp, 'Contents/MacOS/Playwright'), launcherPath);
    throw new Error(`Playwright WebKit wrapper payload is missing for ${launcherPath}.`);
}

function linuxWebKitPayload(launcherPath, headed, platform) {
    assertLinuxWebKitPlatform(platform);
    const root = dirname(launcherPath);
    const variant = LINUX_WEBKIT_VARIANTS.get(Boolean(headed));
    const branch = [
        directoryPayload(join(root, variant.minibrowser), 'MiniBrowser'),
        filePayload(join(root, 'MiniBrowser')),
        directoryPayload(join(root, `WebKitBuild/${variant.build}`), 'Release/bin/MiniBrowser'),
    ].find(candidate => candidate.selected());
    return selectedPayload(branch, launcherPath);
}

function assertLinuxWebKitPlatform(platform) {
    if (platform !== 'linux') throw new Error(`Playwright WebKit wrapper is unsupported on ${platform}.`);
}

function selectedPayload(branch, launcherPath) {
    if (!branch) throw new Error(`Playwright WebKit wrapper payload is missing for ${launcherPath}.`);
    return requiredPayload(branch.path, launcherPath);
}

function directoryPayload(directory, child) {
    return { selected: () => isDirectory(directory), path: join(directory, child) };
}

function filePayload(path) {
    return { selected: () => isFile(path), path };
}

function requiredPayload(path, launcherPath) {
    if (!isFile(path)) throw new Error(`Playwright WebKit wrapper payload is missing for ${launcherPath}.`);
    return realpathSync(path);
}

function isFile(path) {
    return existsSync(path) && statSync(path).isFile();
}

function isDirectory(path) {
    return existsSync(path) && statSync(path).isDirectory();
}

function cachedExecutableIdentity(executablePath, identities) {
    const path = realpathSync(resolve(requiredText(executablePath, 'Browser executable path is missing.')));
    if (!identities.has(path)) identities.set(path, executableIdentity(path));
    return identities.get(path);
}

function registryBrowserIdentity(browserRegistry, engine) {
    const registry = requiredRecord(browserRegistry, 'Playwright browser registry provenance is missing.');
    const browsers = requiredArray(registry.browsers, 'Playwright browser registry entries are missing.');
    const browser = browsers.find(candidate => candidate.name === engine);
    if (!browser) throw new Error(`Playwright browser registry has no ${engine} entry.`);
    return Object.freeze({
        manifestSha256: requiredSha256(registry.sha256, 'Playwright browser registry hash is missing or invalid.'),
        name: engine,
        revision: requiredText(browser.revision, `Playwright ${engine} registry revision is missing.`),
        browserVersion: requiredText(browser.browserVersion, `Playwright ${engine} registry version is missing.`),
    });
}

function executableIdentity(rawPath) {
    const path = realpathSync(resolve(requiredText(rawPath, 'Browser executable path is missing.')));
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error(`Browser executable is not a file: ${path}.`);
    if ((stat.mode & 0o111) === 0) throw new Error(`Browser executable is not executable: ${path}.`);
    return Object.freeze({
        path,
        sha256: sha256File(path),
        stat: Object.freeze({
            bytes: stat.size,
            mode: stat.mode,
            mtimeMs: stat.mtimeMs,
            device: stat.dev,
            inode: stat.ino,
        }),
    });
}

function verifyLaunchIdentity(descriptor) {
    const expected = requiredRecord(descriptor, 'Browser launch descriptor is missing.');
    assertIdentityUnchanged(expected.executable, 'browser payload');
    if (expected.launcher) assertIdentityUnchanged(expected.launcher, 'browser launcher');
    return true;
}

function assertIdentityUnchanged(expected, label) {
    const current = executableIdentity(expected?.path);
    const fields = ['sha256', 'path', 'stat.bytes', 'stat.mode', 'stat.mtimeMs', 'stat.device', 'stat.inode'];
    const matches = fields.every(field => nestedValue(current, field) === nestedValue(expected, field));
    if (!matches) throw new Error(`Live profiler ${label} changed between resolution and launch.`);
}

function sha256File(path) {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    const descriptor = openSync(path, 'r');
    try {
        readFileChunks(descriptor, buffer, hash);
        return hash.digest('hex');
    } finally {
        closeSync(descriptor);
    }
}

function readFileChunks(descriptor, buffer, hash) {
    let bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
    while (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
        bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
    }
}

function assertCustomBrowserPair(channel, executable) {
    if (Boolean(channel) !== Boolean(executable)) {
        throw new Error(`${CUSTOM_CHANNEL_KEY} and ${CUSTOM_EXECUTABLE_KEY} must be supplied together.`);
    }
}

function environmentText(environment, key) {
    const value = environment[key];
    return typeof value === 'string' ? value.trim() : '';
}

function createFatalRequestLedger(classify) {
    const entries = [];
    return Object.freeze({
        classify(request) {
            try {
                return classify(request);
            } catch (error) {
                entries.push(fatalRequestEntry(request, error));
                throw error;
            }
        },
        assertEmpty() {
            if (entries.length > 0) throw new LiveProfileFatalRequestError(entries);
        },
        snapshot: () => entries.map(entry => ({ ...entry })),
    });
}

function createBrowserDiagnostics() {
    const consoleErrors = [];
    const pageErrors = [];
    return Object.freeze({
        install(page) {
            page.on('console', message => {
                if (message.type() !== 'error') return;
                appendBoundedDiagnostic(consoleErrors, message.text());
            });
            page.on('pageerror', error => appendBoundedDiagnostic(pageErrors, diagnosticError(error)));
        },
        summary(state) {
            return {
                bootstrap: state?.bootstrap ?? null,
                consoleErrors: consoleErrors.map(entry => entry.slice(0, 2_000)),
                pageErrors: pageErrors.map(entry => ({
                    ...entry,
                    message: entry.message.slice(0, 2_000),
                    stack: entry.stack.slice(0, 4_000),
                })),
            };
        },
    });
}

function appendBoundedDiagnostic(entries, entry) {
    entries.push(entry);
    if (entries.length > 20) entries.shift();
}

function fatalRequestEntry(request, error) {
    const descriptor = requestDescriptor(request);
    return Object.freeze({
        method: descriptor.method,
        url: descriptor.url,
        error: diagnosticRequestError(error),
    });
}

function diagnosticError(error) {
    return {
        name: String(errorValue(error, 'name', 'Error')),
        message: String(errorValue(error, 'message', error)),
        stack: String(errorValue(error, 'stack', '')),
    };
}

function requestDescriptor(request) {
    if (typeof request === 'string') return { method: 'GET', url: request };
    return {
        method: String(errorValue(request, 'method', 'GET')).toUpperCase(),
        url: String(errorValue(request, 'url', '')),
    };
}

function diagnosticRequestError(error) {
    return {
        name: errorValue(error, 'name', 'Error'),
        message: String(errorValue(error, 'message', error)),
        code: errorValue(error, 'code', null),
    };
}

function ambientWindowEvidence(samples, boundary) {
    const observations = requiredArray(samples, 'Ambient playback samples are missing.');
    const started = observations.at(0);
    const ended = observations.at(-1);
    const startTime = playbackTime(started);
    const endTime = playbackTime(ended);
    const elapsedWallMs = roundedPositiveDelta(boundary?.startedAtMs, boundary?.endedAtMs);
    const requestedDurationMs = positiveNumber(boundary?.requestedDurationMs);
    const deltaSeconds = playbackDelta(startTime, endTime);
    const expectedDeltaSeconds = expectedPlaybackDelta(elapsedWallMs, started);
    const progressRatio = ratio(deltaSeconds, expectedDeltaSeconds);
    const intervals = ambientIntervals(observations);
    const maxSampleGapMs = maxIntervalValue(intervals, 'wallMs');
    const stalledIntervalCount = intervals.filter(interval => interval.stalled).length;
    const sampleCadenceHealthy = [
        maxSampleGapMs !== null,
        maxSampleGapMs <= MAX_AMBIENT_SAMPLE_GAP_MS,
    ].every(Boolean);
    const fullWindow = [
        requestedDurationMs !== null,
        elapsedWallMs !== null,
        elapsedWallMs >= requestedDurationMs * AMBIENT_WINDOW_RATIO,
    ].every(Boolean);
    const progressed = [
        fullWindow,
        progressRatio !== null,
        progressRatio >= AMBIENT_PROGRESS_RATIO,
    ].every(Boolean);
    const unpaused = playbackUnpaused(ended);
    const hasFutureData = playbackHasFutureData(ended);
    return Object.freeze({
        started,
        ended,
        requestedDurationMs,
        elapsedWallMs,
        sampleCount: observations.length,
        maxSampleGapMs,
        sampleCadenceHealthy,
        deltaSeconds,
        expectedDeltaSeconds,
        progressRatio,
        stalledIntervalCount,
        fullWindow,
        progressed,
        unpaused,
        nonStalled: [progressed, unpaused, hasFutureData, sampleCadenceHealthy, stalledIntervalCount === 0].every(Boolean),
    });
}

function ambientIntervals(observations) {
    return observations.slice(1).map((ended, index) => ambientInterval(observations[index], ended));
}

function ambientInterval(started, ended) {
    const wallMs = roundedPositiveDelta(started?.observedAtMs, ended?.observedAtMs);
    const mediaSeconds = playbackDelta(playbackTime(started), playbackTime(ended));
    const expectedSeconds = expectedPlaybackDelta(wallMs, started);
    const intervalRatio = ratio(mediaSeconds, expectedSeconds);
    const healthyState = [
        playbackUnpaused(started),
        playbackUnpaused(ended),
        playbackHasFutureData(ended),
    ].every(Boolean);
    const stalled = [
        !healthyState,
        intervalRatio === null,
        intervalRatio < AMBIENT_PROGRESS_RATIO,
    ].some(Boolean);
    return Object.freeze({
        wallMs,
        mediaSeconds,
        progressRatio: intervalRatio,
        stalled,
    });
}

function playbackUnpaused(state) {
    if (!state) return false;
    return state.found === true && state.paused === false;
}

function playbackHasFutureData(state) {
    if (!state) return false;
    return Number(state.readyState) >= 3;
}

function playbackTime(state) {
    return typeof state?.currentTime === 'number' ? state.currentTime : null;
}

function playbackRate(state) {
    const value = Number(state?.playbackRate);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function playbackDelta(startTime, endTime) {
    if (startTime === null) return null;
    if (endTime === null) return null;
    return Math.round((endTime - startTime) * 1000) / 1000;
}

function expectedPlaybackDelta(elapsedWallMs, state) {
    const rate = playbackRate(state);
    if (elapsedWallMs === null || rate === null) return null;
    return Math.round(elapsedWallMs * rate) / 1000;
}

function roundedPositiveDelta(startedAtMs, endedAtMs) {
    const start = Number(startedAtMs);
    const end = Number(endedAtMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) * 10) / 10;
}

function ratio(value, expected) {
    if (!Number.isFinite(value) || !Number.isFinite(expected) || expected <= 0) return null;
    return Math.round((value / expected) * 1000) / 1000;
}

function maxIntervalValue(intervals, field) {
    const values = intervals.map(interval => interval[field]).filter(Number.isFinite);
    return values.length > 0 ? Math.max(...values) : null;
}

function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

async function captureWorkloadEnd(collectors) {
    const cdp = collectAtBoundary(collectors, 'cdp');
    const page = collectAtBoundary(collectors, 'page');
    const [cdpMetrics, pageMetrics] = await Promise.all([cdp, page]);
    return Object.freeze({ cdpMetrics, pageMetrics });
}

function collectAtBoundary(collectors, name) {
    const collector = collectors?.[name];
    return typeof collector === 'function' ? collector() : Promise.resolve(null);
}

function writeTerminalFailureArtifacts(outputRoot, report, terminal, fileSystem) {
    fileSystem.mkdirSync(outputRoot, { recursive: true });
    const failedReport = {
        ...report,
        status: 'failed',
        completedAt: terminal.generatedAt,
        failure: terminal.failure,
    };
    writeJsonAtomically(join(outputRoot, 'failure.json'), terminal, fileSystem);
    writeJsonAtomically(join(outputRoot, 'report.partial.json'), failedReport, fileSystem);
    writeJsonAtomically(join(outputRoot, 'report.json'), failedReport, fileSystem);
    return failedReport;
}

function writeTerminalSuccessArtifact(outputRoot, report, fileSystem) {
    fileSystem.mkdirSync(outputRoot, { recursive: true });
    fileSystem.rmSync(join(outputRoot, 'report.partial.json'), { force: true });
    writeJsonAtomically(join(outputRoot, 'report.json'), report, fileSystem);
    return report;
}

function writeJsonAtomically(path, value, fileSystem) {
    const temporaryPath = `${path}.${process.pid}.${atomicWriteSequence += 1}.tmp`;
    try {
        fileSystem.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
        fileSystem.renameSync(temporaryPath, path);
    } finally {
        fileSystem.rmSync(temporaryPath, { force: true });
    }
}

function requiredRecord(value, message) {
    if (value === null) throw new Error(message);
    if (typeof value !== 'object') throw new Error(message);
    return value;
}

function requiredArray(value, message) {
    if (!Array.isArray(value)) throw new Error(message);
    return value;
}

function requiredText(value, message) {
    if (typeof value !== 'string') throw new Error(message);
    if (!value) throw new Error(message);
    return value;
}

function requiredSha256(value, message) {
    const sha256 = requiredText(value, message);
    if (!/^[a-f0-9]{64}$/u.test(sha256)) throw new Error(message);
    return sha256;
}

function nestedValue(root, path) {
    let current = root;
    for (const key of path.split('.')) {
        if (current == null) return null;
        current = current[key];
    }
    return current;
}

function errorValue(error, key, fallback) {
    if (error === null) return fallback;
    if (typeof error !== 'object') return fallback;
    return error[key] === undefined ? fallback : error[key];
}

class LiveProfileFatalRequestError extends Error {
    constructor(entries) {
        super(`Live profiler observed ${entries.length} unrecognized GM request(s).`);
        this.name = 'LiveProfileFatalRequestError';
        this.code = 'LIVE_PROFILE_UNKNOWN_GM_REQUEST';
        this.details = { fatalBridgeRequests: entries.map(entry => ({ ...entry })) };
    }
}
