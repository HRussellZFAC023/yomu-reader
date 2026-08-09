import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { userscriptCompanionPaths } from './smoke-test-helpers.mjs';

const EXPECTED_ICU_BY_NODE = new Map([
    ['24.16.0', '78.3'],
]);
const REQUIRED_TOOL_NAMES = Object.freeze(['playwright', 'playwright-core', 'typescript']);
const ALLOWED_RUNS = new Map([
    ['chromium:none', Object.freeze({ key: 'chromium:none', engine: 'chromium', mode: 'none' })],
    ['chromium:cpu', Object.freeze({ key: 'chromium:cpu', engine: 'chromium', mode: 'cpu' })],
    ['chromium:coverage', Object.freeze({ key: 'chromium:coverage', engine: 'chromium', mode: 'coverage' })],
    ['webkit:none', Object.freeze({ key: 'webkit:none', engine: 'webkit', mode: 'none' })],
]);
const TRANSPORT_SCOPE = Object.freeze({
    gmApi: 'page-realm emulation',
    timedText: 'same-origin browser-session fetch',
    timedTextCredentials: 'include',
    timedTextAbortable: true,
    authoritativeFor: Object.freeze([
        'YouTube response status and body observed with the watch-page browser session',
        'Yomu handling of callback-style GM responses and cancellation',
    ]),
    nonAuthoritativeFor: Object.freeze([
        'Tampermonkey, Greasemonkey, or extension network scheduling',
        'physical iPad temperature or power draw',
    ]),
});
const BROWSER_FETCH_ROUTES = Object.freeze([
    Object.freeze({ origin: 'https://www.youtube.com', pathname: '/api/timedtext' }),
]);
const BRIDGE_ROUTES = Object.freeze([
    Object.freeze({ kind: 'youtube-timedtext', matches: url => url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext' }),
    Object.freeze({ kind: 'jpdb-parse', matches: url => url.href.startsWith('https://jpdb.io/api/v1/parse') }),
    Object.freeze({ kind: 'ocr', matches: url => url.hostname === '127.0.0.1' && url.port === '7331' && url.pathname === '/ocr' }),
    Object.freeze({ kind: 'jpdb-search', matches: url => url.hostname === 'jpdb.io' && url.pathname === '/search' }),
]);
const WORKLOAD_BUILDERS = new Map([
    ['interaction', () => Object.freeze({
        kind: 'interaction',
        durationMs: null,
        comparable: false,
        scope: 'whole live YouTube watch page',
        limitation: 'Live interaction timing depends on YouTube, media, and network state and is diagnostic rather than a benchmark.',
    })],
    ['ambient', durationMs => Object.freeze({
        kind: 'ambient',
        durationMs,
        comparable: false,
        scope: 'whole live YouTube watch page',
        limitation: 'Time-boxed playback has no fixed operation ledger and is not comparable across replays or artifacts.',
    })],
]);
const REPLAY_CHECKS = Object.freeze([
    replayErrorFailures,
    youtubeEvidenceFailures,
    runtimeEvidenceFailures,
    playbackEvidenceFailures,
    browserEvidenceFailures,
    workloadScopeFailures,
    instrumentationFailures,
]);
const CHROMIUM_EVIDENCE_CHECKS = new Map([
    ['none', () => []],
    ['cpu', cpuEvidenceFailures],
    ['coverage', coverageEvidenceFailures],
]);

/**
 * Owns the evidence invariants for the live YouTube profiler. The driver supplies
 * paths and observations; this Module decides whether they are authoritative.
 */
export function createLiveProfileEvidenceContract(config) {
    return Object.freeze({
        browserFetchRoutes: BROWSER_FETCH_ROUTES,
        transport: TRANSPORT_SCOPE,
        preflight: input => liveProfilePreflight(config, input),
        classifyBridgeRequest,
        complete: results => completeLiveProfile(config, results),
        failure: (error, details = {}) => liveProfileFailure(error, details),
    });
}

function liveProfilePreflight(config, input) {
    const requestedRuns = parseRequestedRuns(config.requestedRuns);
    const workload = workloadDescriptor(config.workloadKind, config.ambientDurationMs);
    assertProfilerDriverProvenance(input.profilerDriver);
    const artifacts = validatedArtifactGraph(input.repositoryRoot, input.userscriptPath, input.cssPath);
    return {
        requestedRuns,
        workload,
        transport: TRANSPORT_SCOPE,
        artifacts,
        profilerDriver: input.profilerDriver,
    };
}

function assertProfilerDriverProvenance(provenance) {
    const descriptor = requiredRecord(provenance, 'Profiler driver provenance is missing.');
    assertRuntimeProvenance(descriptor.runtime);
    assertToolLockParity(descriptor.tools);
    assertCleanPaths(descriptor.dirtyPaths, 'Profiler driver or tool inputs are dirty.');
}

function assertRuntimeProvenance(runtime) {
    const descriptor = requiredRecord(runtime, 'Profiler runtime provenance is missing.');
    const expectedNode = canonicalNodeVersion(requiredText(descriptor.expectedNode, 'Expected Node runtime is missing.'));
    const actualNode = canonicalNodeVersion(requiredText(descriptor.node, 'Actual Node runtime is missing.'));
    assertEqual(actualNode, expectedNode, 'Profiler Node runtime does not match .nvmrc.', {
        expectedNode: descriptor.expectedNode,
        actualNode: descriptor.node,
    });
    const expectedIcu = expectedIcuForNode(expectedNode);
    assertEqual(descriptor.icu, expectedIcu, 'Profiler ICU runtime does not match the pinned Node release.', {
        expectedIcu,
        actualIcu: descriptor.icu,
        expectedNode,
    });
}

function assertToolLockParity(tools) {
    const descriptors = requiredRecord(tools, 'Profiler tool provenance is missing.');
    for (const name of REQUIRED_TOOL_NAMES) {
        assertToolDescriptor(name, descriptors[name]);
    }
}

function assertToolDescriptor(name, tool) {
    const descriptor = requiredRecord(tool, `Profiler tool is not installed: ${name}.`);
    const installed = requiredText(descriptor.version, `Installed profiler tool version is missing: ${name}.`);
    const locked = requiredText(descriptor.lockedVersion, `Locked profiler tool version is missing: ${name}.`);
    assertEqual(installed, locked, `Profiler tool does not match package-lock.json: ${name}.`, { installed, locked });
    requiredText(descriptor.integrity, `Profiler tool lock integrity is missing: ${name}.`);
    requiredText(descriptor.manifestSha256, `Profiler tool manifest hash is missing: ${name}.`);
}

function expectedIcuForNode(nodeVersion) {
    const expectedIcu = EXPECTED_ICU_BY_NODE.get(nodeVersion);
    if (!expectedIcu) fail('Profiler ICU policy has not been defined for the .nvmrc Node release.', { nodeVersion });
    return expectedIcu;
}

function assertCleanPaths(value, message) {
    if (!Array.isArray(value)) fail('Profiler dirty-path provenance is missing.');
    if (value.length > 0) fail(message, { dirtyPaths: value });
}

function validatedArtifactGraph(repositoryRoot, userscriptPath, cssPath) {
    const root = resolve(repositoryRoot);
    const corePath = assertInsideRoot(resolve(userscriptPath), root);
    const resourcePath = assertInsideRoot(resolve(cssPath), root);
    assertExistingFile(corePath, 'userscript');
    assertExistingFile(resourcePath, 'stylesheet');

    const coreText = readFileSync(corePath, 'utf8');
    const requirements = declaredRequirements(coreText);
    const companionPaths = userscriptCompanionPaths(corePath).map(path => assertInsideRoot(resolve(path), root));
    assertValidatedCompanions(requirements, companionPaths);
    const css = validatedCssResource(coreText, resourcePath, root);
    const graphPaths = [...companionPaths, corePath];
    const graphFiles = graphPaths.map(path => artifactFile(path, root));
    const content = graphFiles.map(file => file.content).join('\n;\n');
    const graphSha256 = sha256(content);
    const dirtyPaths = gitDirtyPaths(root, [...graphPaths, resourcePath]);
    if (dirtyPaths.length > 0) fail('Profiler product artifacts are dirty.', { dirtyPaths });

    return {
        content,
        cssText: css.content,
        descriptor: {
            validated: true,
            splitGraph: true,
            sourceUrl: `yomu-profile://artifact-graph/${graphSha256}.js`,
            sha256: graphSha256,
            version: userscriptVersion(coreText),
            files: graphFiles.map(publicArtifactFile),
            css: publicArtifactFile(css),
            dirtyPaths,
        },
    };
}

function declaredRequirements(coreText) {
    const declared = coreText.split(/\r?\n/u)
        .flatMap(line => line.match(/^\/\/ @require\s+([^\s]+)$/u)?.[1] ?? []);
    const supported = declared.flatMap(raw => {
        const match = raw.match(/^https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)#sha256=([^\s]+)$/u);
        return match ? [{ fileName: match[1], sri: match[2] }] : [];
    });
    if (declared.length === 0) fail('Live profiler requires a split userscript with declared companions.');
    if (supported.length !== declared.length) {
        fail('Userscript contains an unsupported or non-content-addressed @require.', { declared });
    }
    return supported;
}

function assertValidatedCompanions(requirements, companionPaths) {
    if (requirements.length !== companionPaths.length) {
        fail('Resolved userscript companion count does not match the declared graph.', {
            declared: requirements.length,
            resolved: companionPaths.length,
        });
    }
    requirements.forEach((requirement, index) => {
        const path = companionPaths[index];
        assertExistingFile(path, `companion ${requirement.fileName}`);
        const contents = readFileSync(path);
        assertContentAddress(requirement.fileName, requirement.sri, contents, 'companion');
    });
}

function validatedCssResource(coreText, cssPath, root) {
    const declarations = coreText.split(/\r?\n/u).flatMap(line => {
        const match = line.match(/^\/\/ @resource\s+yomuCss\s+https:\/\/yomureader\.com\/([^#\s]+)#sha256=([^\s]+)$/u);
        return match ? [{ fileName: match[1], sri: match[2] }] : [];
    });
    if (declarations.length !== 1) fail('Userscript must declare exactly one content-addressed yomuCss resource.');
    const contents = readFileSync(cssPath);
    assertContentAddress(declarations[0].fileName, declarations[0].sri, contents, 'stylesheet');
    return artifactFile(cssPath, root, contents);
}

function assertContentAddress(fileName, expectedSri, contents, kind) {
    const digestHex = sha256(contents);
    const digestBase64 = createHash('sha256').update(contents).digest('base64');
    assertFilenameDigest(fileName, digestHex, kind);
    assertEqual(digestBase64, expectedSri, `Profiler ${kind} SRI mismatch: ${fileName}.`);
}

function assertFilenameDigest(fileName, digestHex, kind) {
    const match = fileName.match(/\.([a-f0-9]{12})(?=\.(?:user\.js|css)$)/u);
    if (!match) fail(`Profiler ${kind} filename hash mismatch: ${fileName}.`);
    if (!digestHex.startsWith(match[1])) fail(`Profiler ${kind} filename hash mismatch: ${fileName}.`);
}

function artifactFile(path, root, suppliedContents) {
    const contents = suppliedContents ?? readFileSync(path);
    return {
        path: relative(root, path),
        name: basename(path),
        sha256: sha256(contents),
        bytes: contents.length,
        gitRevision: gitLastChangeRevision(root, path),
        content: contents.toString('utf8'),
    };
}

function publicArtifactFile({ content: _content, ...file }) {
    return file;
}

function gitDirtyPaths(root, paths) {
    const pathspecs = paths.map(path => relative(root, assertInsideRoot(path, root)));
    return gitOutput(root, ['status', '--short', '--', ...pathspecs])
        .split(/\r?\n/u)
        .filter(Boolean);
}

function gitLastChangeRevision(root, path) {
    return gitOutput(root, ['log', '-1', '--format=%H', '--', relative(root, path)]);
}

function parseRequestedRuns(rawRuns) {
    const raw = rawRuns ?? 'chromium:none,chromium:cpu,chromium:coverage,webkit:none';
    const runs = String(raw).split(',').map(value => {
        const key = value.trim();
        const run = ALLOWED_RUNS.get(key);
        if (!run) fail(`Unsupported live YouTube replay: ${key}.`);
        return run;
    });
    if (!runs.length) fail('At least one live YouTube replay is required.');
    const keys = runs.map(run => run.key);
    if (new Set(keys).size !== keys.length) fail('Live YouTube replays must be unique.', { keys });
    return runs;
}

function workloadDescriptor(kind = 'interaction', ambientDurationMs = 30_000) {
    const builder = WORKLOAD_BUILDERS.get(kind);
    if (!builder) fail(`Unsupported live YouTube workload: ${kind}.`);
    return builder(positiveDuration(ambientDurationMs));
}

function positiveDuration(value) {
    const durationMs = Number(value);
    if (!Number.isFinite(durationMs)) fail(`Live YouTube ambient duration must be positive; received ${value}.`);
    if (durationMs <= 0) fail(`Live YouTube ambient duration must be positive; received ${value}.`);
    return durationMs;
}

function classifyBridgeRequest(rawUrl) {
    const url = parseBridgeUrl(rawUrl);
    const route = BRIDGE_ROUTES.find(candidate => candidate.matches(url));
    if (route) return route.kind;
    fail('Live profiler received an unrecognized GM request.', { url: `${url.origin}${url.pathname}` });
}

function parseBridgeUrl(rawUrl) {
    try {
        return new URL(rawUrl);
    } catch {
        fail('Live profiler received an invalid GM request URL.', { rawUrl });
    }
}

function completeLiveProfile(config, results) {
    const requestedRuns = parseRequestedRuns(config.requestedRuns);
    const failures = requestedRunFailures(requestedRuns, results);
    if (failures.length > 0) fail('Live YouTube evidence is incomplete.', { failures });
    const byKey = new Map(results.map(result => [runKey(result), result]));
    const chromiumNone = byKey.get('chromium:none');
    const chromiumCpu = byKey.get('chromium:cpu');
    const chromiumCoverage = byKey.get('chromium:coverage');
    const webkitRun = byKey.get('webkit:none');
    return {
        requestedRunsComplete: true,
        actualYoutubeDom: results.every(hasActualYoutubeEvidence),
        runtimeHealthy: results.every(hasHealthyRuntime),
        playbackProgressed: results.every(result => nestedValue(result, 'interaction.playback.progressed') === true),
        chromiumNativeControlsAutoHide: nestedValue(chromiumNone, 'interaction.nativeControls.autoHideObserved'),
        chromiumYomuReleasedFocus: nestedValue(chromiumNone, 'interaction.nativeControls.yomuDidNotRetainFocus'),
        chromiumSubtitleHover: nestedValue(chromiumNone, 'interaction.subtitles.hover.opened'),
        chromiumOcrHover: nestedValue(chromiumNone, 'interaction.ocr.hover.opened'),
        chromiumCpuSamples: nestedValue(chromiumCpu, 'functionEvidence.sampled.sampleCount'),
        chromiumCoverageFunctionsCalled: nestedValue(chromiumCoverage, 'functionEvidence.calls.functionsCalled'),
        webkitRuntimeHealthy: nestedValue(webkitRun, 'final.yomu.runtimeHealth') === 'ready',
        webkitNativeControlsAutoHide: nestedValue(webkitRun, 'interaction.nativeControls.autoHideObserved'),
        webkitSubtitleHover: nestedValue(webkitRun, 'interaction.subtitles.hover.opened'),
        webkitOcrHover: nestedValue(webkitRun, 'interaction.ocr.hover.opened'),
    };
}

function requestedRunFailures(requestedRuns, results) {
    if (!Array.isArray(results)) return [{ reason: 'results are missing' }];
    const expectedKeys = requestedRuns.map(run => run.key);
    const actualKeys = results.map(runKey);
    const byKey = new Map(results.map(result => [runKey(result), result]));
    return [
        ...resultCardinalityFailures(requestedRuns.length, results.length, expectedKeys, actualKeys),
        ...duplicateResultFailures(actualKeys),
        ...requestedReplayFailures(requestedRuns, byKey),
        ...unexpectedReplayFailures(expectedKeys, actualKeys),
    ];
}

function resultCardinalityFailures(expected, actual, expectedKeys, actualKeys) {
    return expected === actual ? [] : [{ reason: 'result count mismatch', expectedKeys, actualKeys }];
}

function duplicateResultFailures(actualKeys) {
    return new Set(actualKeys).size === actualKeys.length ? [] : [{ reason: 'duplicate replay results', actualKeys }];
}

function requestedReplayFailures(requestedRuns, byKey) {
    return requestedRuns.flatMap(run => replayFailures(run, byKey.get(run.key)));
}

function unexpectedReplayFailures(expectedKeys, actualKeys) {
    return actualKeys
        .filter(key => !expectedKeys.includes(key))
        .map(run => ({ run, reason: 'unexpected replay result' }));
}

function replayFailures(run, result) {
    if (!result) return [{ run: run.key, reason: 'missing replay result' }];
    return [
        ...REPLAY_CHECKS.flatMap(check => check(run, result)),
        ...functionEvidenceFailures(run, result.functionEvidence),
    ];
}

function functionEvidenceFailures(run, evidence) {
    if (run.engine === 'webkit') return failureUnless(evidence === null, run, 'WebKit carried CDP function evidence');
    if (nestedValue(evidence, 'mode') !== run.mode) return [{ run: run.key, reason: `missing ${run.mode} function evidence` }];
    const check = CHROMIUM_EVIDENCE_CHECKS.get(run.mode);
    if (!check) return [{ run: run.key, reason: `unsupported ${run.mode} function evidence` }];
    return check(run, evidence);
}

function liveProfileFailure(error, details) {
    return {
        status: 'failed',
        generatedAt: new Date().toISOString(),
        failure: {
            name: errorProperty(error, 'name', 'Error'),
            message: String(errorProperty(error, 'message', error)),
            stack: String(errorProperty(error, 'stack', '')),
            code: errorProperty(error, 'code', null),
            details: errorProperty(error, 'details', null),
        },
        ...details,
    };
}

function replayErrorFailures(run, result) {
    if (!result.error) return [];
    return [{ run: run.key, reason: 'replay failed', error: errorProperty(result.error, 'message', String(result.error)) }];
}

function youtubeEvidenceFailures(run, result) {
    return failureUnless(hasActualYoutubeEvidence(result), run, 'real YouTube evidence missing');
}

function runtimeEvidenceFailures(run, result) {
    return failureUnless(hasHealthyRuntime(result), run, 'Yomu runtime was not healthy');
}

function playbackEvidenceFailures(run, result) {
    return failureUnless(nestedValue(result, 'interaction.playback.progressed') === true, run, 'playback did not progress');
}

function browserEvidenceFailures(run, result) {
    const fields = ['browser.executablePath', 'browser.channel', 'browser.version'];
    return failureUnless(fields.every(path => Boolean(nestedValue(result, path))), run, 'actual browser provenance is incomplete');
}

function workloadScopeFailures(run, result) {
    const actual = nestedValue(result, 'workload.scope');
    return failureUnless(actual === 'whole live YouTube watch page', run, 'whole-page workload scope is missing');
}

function instrumentationFailures(run, result) {
    const instrumented = new Set(['cpu', 'coverage']).has(run.mode);
    return failureUnless(nestedValue(result, 'workload.instrumented') === instrumented, run, 'instrumentation scope is incorrect');
}

function cpuEvidenceFailures(run, evidence) {
    const failures = artifactSummaryScopeFailures(run, evidence);
    const hasSamples = Number(nestedValue(evidence, 'sampled.totalSampleCount')) > 0;
    return [...failures, ...failureUnless(hasSamples, run, 'CPU profile contains no samples')];
}

function coverageEvidenceFailures(run, evidence) {
    const failures = artifactSummaryScopeFailures(run, evidence);
    const hasFunctions = Number(nestedValue(evidence, 'calls.functionsPresent')) > 0;
    return [...failures, ...failureUnless(hasFunctions, run, 'coverage matched no artifact-graph functions')];
}

function artifactSummaryScopeFailures(run, evidence) {
    const kind = nestedValue(evidence, 'summaryScope.kind');
    return failureUnless(kind === 'yomu-artifact-graph', run, 'function summary is not artifact-graph scoped');
}

function failureUnless(condition, run, reason) {
    return condition ? [] : [{ run: run.key, reason }];
}

function errorProperty(error, key, fallback) {
    if (error === null) return fallback;
    if (typeof error !== 'object') return fallback;
    return error[key] === undefined ? fallback : error[key];
}

function hasActualYoutubeEvidence(result) {
    return nestedValue(result, 'final.youtube.app') === true
        && nestedValue(result, 'final.youtube.player') === true
        && Number(nestedValue(result, 'network.actualYoutubeRequests')) > 0;
}

function hasHealthyRuntime(result) {
    return nestedValue(result, 'final.yomu.runtimeHealth') === 'ready';
}

function runKey(result) {
    return `${recordText(result, 'engine')}:${recordText(result, 'mode')}`;
}

function nestedValue(root, path) {
    let current = root;
    for (const key of path.split('.')) {
        if (current == null) return null;
        if (typeof current !== 'object') return null;
        current = current[key];
    }
    return valueOrNull(current);
}

function valueOrNull(value) {
    return value === undefined ? null : value;
}

function userscriptVersion(source) {
    return source.match(/^\/\/ @version\s+([^\s]+)$/mu)?.[1] ?? '';
}

function canonicalNodeVersion(value) {
    return String(value).trim().replace(/^v/u, '');
}

function recordText(value, key) {
    const result = nestedValue(value, key);
    return typeof result === 'string' ? result : '';
}

function requiredRecord(value, message) {
    if (value === null) fail(message);
    if (typeof value !== 'object') fail(message);
    return value;
}

function requiredText(value, message) {
    if (typeof value !== 'string') fail(message);
    if (!value) fail(message);
    return value;
}

function assertEqual(actual, expected, message, details = {}) {
    if (actual !== expected) fail(message, details);
}

function assertExistingFile(path, label) {
    if (!existsSync(path)) fail(`Missing profiler ${label}: ${path}.`);
}

function assertInsideRoot(path, root) {
    const relativePath = relative(root, path);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
        fail(`Profiler artifact escapes repository root: ${path}.`);
    }
    return path;
}

function gitOutput(root, args) {
    try {
        return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    } catch (error) {
        throw new LiveProfileEvidenceError(`Unable to record live profiler Git evidence: git ${args.join(' ')}`, {}, error);
    }
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function fail(message, details = {}) {
    throw new LiveProfileEvidenceError(message, details);
}

class LiveProfileEvidenceError extends Error {
    constructor(message, details = {}, cause) {
        super(message, cause ? { cause } : undefined);
        this.name = 'LiveProfileEvidenceError';
        this.code = 'LIVE_PROFILE_EVIDENCE_INVALID';
        this.details = details;
    }
}
