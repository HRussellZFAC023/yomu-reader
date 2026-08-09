import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CUSTOM_CHANNEL_KEY = 'YOMU_LIVE_YOUTUBE_CHROMIUM_CHANNEL';
const CUSTOM_EXECUTABLE_KEY = 'YOMU_LIVE_YOUTUBE_CHROMIUM_EXECUTABLE';

/**
 * Owns the machine-facing seams of a live profile run. The live driver supplies
 * Playwright objects and observations; this Module binds them to durable
 * evidence without exposing filesystem or environment branching to the driver.
 */
export function createLiveProfileRunSupport({ environment = process.env, headed = false } = {}) {
    const executableIdentities = new Map();
    return Object.freeze({
        launchPlan: (run, browserType, browserRegistry) => browserLaunchPlan(
            run,
            browserType,
            browserRegistry,
            environment,
            headed,
            executableIdentities,
        ),
        fatalRequestLedger: classify => createFatalRequestLedger(classify),
        ambientWindow: (started, ended) => ambientWindowEvidence(started, ended),
        writeTerminalFailure: (outputRoot, report, terminal) => writeTerminalFailureArtifacts(
            outputRoot,
            report,
            terminal,
        ),
    });
}

function browserLaunchPlan(run, browserType, browserRegistry, environment, headed, executableIdentities) {
    if (run.engine === 'chromium') {
        return chromiumLaunchPlan(browserType, browserRegistry, environment, headed, executableIdentities);
    }
    return bundledLaunchPlan('webkit', browserType, browserRegistry, headed, [], executableIdentities);
}

function chromiumLaunchPlan(browserType, browserRegistry, environment, headed, executableIdentities) {
    const channel = environmentText(environment, CUSTOM_CHANNEL_KEY);
    const executable = environmentText(environment, CUSTOM_EXECUTABLE_KEY);
    assertCustomBrowserPair(channel, executable);
    const args = ['--autoplay-policy=no-user-gesture-required'];
    if (channel) return customLaunchPlan(channel, executable, headed, args, executableIdentities);
    return bundledLaunchPlan('chromium', browserType, browserRegistry, headed, args, executableIdentities);
}

function bundledLaunchPlan(engine, browserType, browserRegistry, headed, args, executableIdentities) {
    const registry = registryBrowserIdentity(browserRegistry, engine);
    return launchPlan('playwright-bundled', browserType.executablePath(), headed, args, registry, false, executableIdentities);
}

function customLaunchPlan(channel, executablePath, headed, args, executableIdentities) {
    return launchPlan(channel, executablePath, headed, args, null, true, executableIdentities);
}

function launchPlan(channel, executablePath, headed, args, registry, custom, executableIdentities) {
    const executable = cachedExecutableIdentity(executablePath, executableIdentities);
    return Object.freeze({
        descriptor: Object.freeze({
            channel,
            custom,
            headed,
            headless: !headed,
            executable,
            registry,
        }),
        options: Object.freeze({
            headless: !headed,
            executablePath: executable.path,
            args: Object.freeze([...args]),
        }),
    });
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
        classify(rawUrl) {
            try {
                return classify(rawUrl);
            } catch (error) {
                entries.push(fatalRequestEntry(rawUrl, error));
                throw error;
            }
        },
        assertEmpty() {
            if (entries.length > 0) throw new LiveProfileFatalRequestError(entries);
        },
        snapshot: () => entries.map(entry => ({ ...entry })),
    });
}

function fatalRequestEntry(rawUrl, error) {
    return Object.freeze({
        url: String(rawUrl),
        error: {
            name: errorValue(error, 'name', 'Error'),
            message: String(errorValue(error, 'message', error)),
            code: errorValue(error, 'code', null),
        },
    });
}

function ambientWindowEvidence(started, ended) {
    const startTime = playbackTime(started);
    const endTime = playbackTime(ended);
    const deltaSeconds = playbackDelta(startTime, endTime);
    const progressed = playbackProgressed(deltaSeconds);
    const unpaused = playbackUnpaused(ended);
    const hasFutureData = playbackHasFutureData(ended);
    return Object.freeze({
        started,
        ended,
        deltaSeconds,
        progressed,
        unpaused,
        nonStalled: [progressed, unpaused, hasFutureData].every(Boolean),
    });
}

function playbackProgressed(deltaSeconds) {
    return deltaSeconds !== null && deltaSeconds > 0.05;
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

function playbackDelta(startTime, endTime) {
    if (startTime === null) return null;
    if (endTime === null) return null;
    return Math.round((endTime - startTime) * 1000) / 1000;
}

function writeTerminalFailureArtifacts(outputRoot, report, terminal) {
    mkdirSync(outputRoot, { recursive: true });
    const failedReport = {
        ...report,
        status: 'failed',
        completedAt: terminal.generatedAt,
        failure: terminal.failure,
    };
    writeJson(join(outputRoot, 'report.json'), failedReport);
    writeJson(join(outputRoot, 'failure.json'), terminal);
    writeJson(join(outputRoot, 'report.partial.json'), failedReport);
    return failedReport;
}

function writeJson(path, value) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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
