import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { userscriptCompanionPaths } from './smoke-test-helpers.mjs';

const EXPECTED_ICU_BY_NODE = new Map([
    ['24.16.0', '78.3'],
]);
const REQUIRED_TOOL_NAMES = Object.freeze(['playwright', 'playwright-core', 'typescript']);
const REQUIRED_BROWSER_NAMES = Object.freeze(['chromium', 'webkit']);
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
    Object.freeze({ kind: 'youtube-timedtext', method: 'GET', origin: 'https://www.youtube.com', pathname: '/api/timedtext' }),
    Object.freeze({ kind: 'jpdb-parse', method: 'POST', origin: 'https://jpdb.io', pathname: '/api/v1/parse' }),
    Object.freeze({ kind: 'ocr', method: 'POST', origin: 'http://127.0.0.1:7331', pathname: '/ocr' }),
    Object.freeze({ kind: 'jpdb-search', method: 'GET', origin: 'https://jpdb.io', pathname: '/search' }),
    Object.freeze({ kind: 'jiten-public-parse', method: 'GET', origin: 'https://api.jiten.moe', pathname: '/api/vocabulary/parse' }),
    Object.freeze({ kind: 'jiten-vocabulary-search', method: 'GET', origin: 'https://api.jiten.moe', pathname: '/api/vocabulary/search' }),
    Object.freeze({ kind: 'bunpro-reviewables-search', method: 'POST', origin: 'https://api.bunpro.jp', pathname: '/api/frontend/search/reviewables_v1_1' }),
    Object.freeze({ kind: 'jpdb-list-user-decks', method: 'POST', origin: 'https://jpdb.io', pathname: '/api/v1/list-user-decks' }),
]);
const BOOTSTRAP_STATE_KEY = '__yomuLiveProfileBootstrap';
const DETERMINISTIC_PROVIDER_RESPONSES = new Map([
    ['jiten-public-parse', Object.freeze([])],
    ['jiten-vocabulary-search', Object.freeze({ results: Object.freeze([]) })],
    ['bunpro-reviewables-search', Object.freeze({
        grammar_points: Object.freeze({ data: Object.freeze([]) }),
        vocabs: Object.freeze({ data: Object.freeze([]) }),
    })],
    ['jpdb-list-user-decks', Object.freeze({ decks: Object.freeze([]) })],
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
    interactionEvidenceFailures,
    browserEvidenceFailures,
    workloadScopeFailures,
    instrumentationFailures,
    chromiumNoneMetricsFailures,
    fatalBridgeLedgerFailures,
    ambientWindowFailures,
]);
const REQUIRED_CDP_DELTA_FIELDS = Object.freeze([
    'TaskDuration',
    'ScriptDuration',
    'LayoutDuration',
    'RecalcStyleDuration',
    'LayoutCount',
    'RecalcStyleCount',
    'JSHeapUsedSize',
    'Nodes',
]);
const REQUIRED_PAGE_COUNTER_FIELDS = Object.freeze([
    'longTasks',
    'longTaskMs',
    'maxLongTaskMs',
    'animationFrames',
    'over50MsFrameGaps',
    'maxFrameGapMs',
]);
const MIN_AMBIENT_PROGRESS_RATIO = 0.8;
const MIN_AMBIENT_WINDOW_RATIO = 0.95;
const MAX_AMBIENT_SAMPLE_GAP_MS = 2_000;
const BROWSER_PAYLOAD_CHECKS = new Map([
    ['direct', (_run, result) => nestedValue(result, 'browser.launcher') === null],
    ['playwright-webkit-wrapper', webKitWrapperPayloadComplete],
]);
const LONG_TASK_CONSISTENCY = new Map([
    [true, metrics => [metrics.longTaskMs === 0, metrics.maxLongTaskMs === 0].every(Boolean)],
    [false, metrics => [
        metrics.longTaskMs > 0,
        metrics.maxLongTaskMs > 0,
        metrics.maxLongTaskMs <= metrics.longTaskMs,
    ].every(Boolean)],
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
        deterministicProviderResponse,
        failure: (error, details = {}) => liveProfileFailure(error, details),
    });
}

function liveProfilePreflight(config, input) {
    const requestedRuns = parseRequestedRuns(config.requestedRuns);
    const workload = workloadDescriptor(config.workloadKind, config.ambientDurationMs);
    assertProfilerDriverProvenance(input.profilerDriver);
    const artifacts = validatedArtifactGraph(input.repositoryRoot, input.userscriptPath, input.cssPath);
    const browserRegistry = snapshotBrowserRegistry(input.profilerDriver.browserRegistry);
    const artifactIdentity = Object.freeze({
        sourceUrl: artifacts.descriptor.sourceUrl,
        sha256: artifacts.descriptor.sha256,
    });
    return {
        requestedRuns,
        workload,
        transport: TRANSPORT_SCOPE,
        artifacts,
        profilerDriver: input.profilerDriver,
        browserRegistry,
        bootstrap: programs => createProfileBootstrap(artifactIdentity, artifacts.content, programs),
        complete: results => completeLiveProfile(config, workload, artifactIdentity, browserRegistry, results),
    };
}

function assertProfilerDriverProvenance(provenance) {
    const descriptor = requiredRecord(provenance, 'Profiler driver provenance is missing.');
    assertRuntimeProvenance(descriptor.runtime);
    assertToolLockParity(descriptor.tools);
    assertBrowserRegistry(descriptor.browserRegistry);
    assertCleanPaths(descriptor.dirtyPaths, 'Profiler driver or tool inputs are dirty.');
}

function assertBrowserRegistry(browserRegistry) {
    const registry = requiredRecord(browserRegistry, 'Playwright browser registry provenance is missing.');
    requiredSha256(registry.sha256, 'Playwright browser registry hash is missing or invalid.');
    if (!Array.isArray(registry.browsers)) fail('Playwright browser registry entries are missing.');
    for (const name of REQUIRED_BROWSER_NAMES) assertBrowserRegistryEntry(registry.browsers, name);
}

function assertBrowserRegistryEntry(browsers, name) {
    const browser = browsers.find(candidate => candidate.name === name);
    const descriptor = requiredRecord(browser, `Playwright browser registry entry is missing: ${name}.`);
    requiredText(descriptor.revision, `Playwright browser registry revision is missing: ${name}.`);
    requiredText(descriptor.browserVersion, `Playwright browser registry version is missing: ${name}.`);
}

function snapshotBrowserRegistry(browserRegistry) {
    const browsers = browserRegistry.browsers
        .filter(browser => REQUIRED_BROWSER_NAMES.includes(browser.name))
        .map(browser => Object.freeze({
            name: browser.name,
            revision: browser.revision,
            browserVersion: browser.browserVersion,
        }));
    return Object.freeze({ sha256: browserRegistry.sha256, browsers: Object.freeze(browsers) });
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
    requiredSha256(descriptor.manifestSha256, `Profiler tool manifest hash is missing or invalid: ${name}.`);
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
    const declarations = coreText.split(/\r?\n/u).filter(line => /^\/\/ @resource\s+yomuCss(?:\s|$)/u.test(line));
    if (declarations.length !== 1) fail('Userscript must declare exactly one yomuCss resource.', { declarations });
    const match = declarations[0].match(/^\/\/ @resource\s+yomuCss\s+https:\/\/yomureader\.com\/([^#\s]+)#sha256=([^\s]+)$/u);
    if (!match) fail('Userscript yomuCss resource must be content-addressed on yomureader.com.');
    const contents = readFileSync(cssPath);
    assertContentAddress(match[1], match[2], contents, 'stylesheet');
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

function classifyBridgeRequest(rawRequest) {
    const request = bridgeRequestDescriptor(rawRequest);
    const url = parseBridgeUrl(request.url);
    const route = BRIDGE_ROUTES.find(candidate => routeMatches(candidate, request.method, url));
    if (route) return route.kind;
    fail('Live profiler received an unrecognized GM request.', {
        method: request.method,
        url: `${url.origin}${url.pathname}`,
    });
}

function bridgeRequestDescriptor(rawRequest) {
    if (typeof rawRequest === 'string') return { method: 'GET', url: rawRequest };
    const request = requiredRecord(rawRequest, 'Live profiler received an invalid GM request.');
    return {
        method: requiredText(String(request.method ?? 'GET'), 'Live profiler received an invalid GM request method.').toUpperCase(),
        url: requiredText(String(request.url ?? ''), 'Live profiler received an invalid GM request URL.'),
    };
}

function routeMatches(route, method, url) {
    return route.method === method && route.origin === url.origin && route.pathname === url.pathname;
}

function parseBridgeUrl(rawUrl) {
    try {
        return new URL(rawUrl);
    } catch {
        fail('Live profiler received an invalid GM request URL.', { rawUrl });
    }
}

function deterministicProviderResponse(kind) {
    if (!DETERMINISTIC_PROVIDER_RESPONSES.has(kind)) return null;
    return jsonHttpResponse(DETERMINISTIC_PROVIDER_RESPONSES.get(kind));
}

function jsonHttpResponse(value) {
    return Object.freeze({
        status: 200,
        responseText: JSON.stringify(value),
        contentType: 'application/json; charset=utf-8',
    });
}

function createProfileBootstrap(artifacts, productProgram, programs) {
    const inputs = requiredRecord(programs, 'Live profiler bootstrap programs are missing.');
    const sources = profileBootstrapSources(artifacts.sha256, artifacts.sourceUrl);
    const staged = [
        stagedProgram('gm', [], requiredText(inputs.gmProgram, 'Live profiler GM bootstrap is missing.')),
        stagedProgram('instrumentation', ['gm'], requiredText(inputs.instrumentationProgram, 'Live profiler instrumentation is missing.')),
        stagedProgram('product', ['gm', 'instrumentation'], requiredText(productProgram, 'Live profiler product graph is missing.')),
    ];
    const chromium = staged
        .map((entry, index) => evaluatedProgram(entry, [sources.gm, sources.instrumentation, sources.product][index]))
        .concat(`//# sourceURL=${sources.bootstrap}`)
        .join('\n;\n');
    const webkit = [...staged, `//# sourceURL=${sources.bootstrap}`].join('\n;\n');
    return Object.freeze({
        content: Object.freeze({ chromium, webkit }),
        sources,
        stateKey: BOOTSTRAP_STATE_KEY,
    });
}

function profileBootstrapSources(graphSha256, product) {
    const root = `yomu-profile://harness/${graphSha256}`;
    return Object.freeze({
        bootstrap: `${root}/bootstrap.js`,
        gm: `${root}/gm.js`,
        instrumentation: `${root}/instrumentation.js`,
        product,
    });
}

function evaluatedProgram(program, sourceUrl) {
    return `(0, eval)(${JSON.stringify(`${program}\n//# sourceURL=${sourceUrl}`)});`;
}

function stagedProgram(stage, expectedCompleted, program) {
    return [
        bootstrapStageProgram(stage, 'start', expectedCompleted),
        program,
        bootstrapStageProgram(stage, 'complete', expectedCompleted),
    ].join('\n;\n');
}

function bootstrapStageProgram(stage, phase, expectedCompleted) {
    const expected = JSON.stringify(expectedCompleted);
    const nextCompleted = JSON.stringify([...expectedCompleted, stage]);
    return `(() => {
        const key = ${JSON.stringify(BOOTSTRAP_STATE_KEY)};
        const state = globalThis[key] ??= { current: '', completed: [], events: [] };
        const expected = ${expected};
        if (JSON.stringify(state.completed) !== JSON.stringify(expected)) {
            throw new Error(${JSON.stringify(`Live profiler bootstrap order failed at ${stage}:${phase}.`)});
        }
        state.current = ${JSON.stringify(`${stage}:${phase}`)};
        state.events.push({ stage: ${JSON.stringify(stage)}, phase: ${JSON.stringify(phase)} });
        ${phase === 'complete' ? `state.completed = ${nextCompleted};` : ''}
    })();`;
}

function completeLiveProfile(config, workload, artifacts, browserRegistry, results) {
    const requestedRuns = parseRequestedRuns(config.requestedRuns);
    const context = { workload, artifacts, browserRegistry };
    const failures = requestedRunFailures(requestedRuns, results, context);
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
        ambientWindowProgressed: workload.kind === 'ambient'
            ? results.every(result => nestedValue(result, 'interaction.ambientWindow.progressed') === true)
            : null,
        chromiumNativeControlsAutoHide: nestedValue(chromiumNone, 'interaction.nativeControls.autoHideObserved'),
        chromiumYomuReleasedFocus: nestedValue(chromiumNone, 'interaction.nativeControls.yomuDidNotRetainFocus'),
        chromiumSubtitleHover: nestedValue(chromiumNone, 'interaction.subtitles.hover.opened'),
        chromiumSubtitleHoverClosed: nestedValue(chromiumNone, 'interaction.subtitles.hover.closed'),
        chromiumOcrHover: nestedValue(chromiumNone, 'interaction.ocr.hover.opened'),
        chromiumOcrHoverClosed: nestedValue(chromiumNone, 'interaction.ocr.hover.closed'),
        chromiumCpuSamples: nestedValue(chromiumCpu, 'functionEvidence.sampled.sampleCount'),
        chromiumCoverageFunctionsCalled: nestedValue(chromiumCoverage, 'functionEvidence.calls.functionsCalled'),
        webkitRuntimeHealthy: nestedValue(webkitRun, 'final.yomu.runtimeHealth') === 'ready',
        webkitNativeControlsAutoHide: nestedValue(webkitRun, 'interaction.nativeControls.autoHideObserved'),
        webkitSubtitleHover: nestedValue(webkitRun, 'interaction.subtitles.hover.opened'),
        webkitSubtitleHoverClosed: nestedValue(webkitRun, 'interaction.subtitles.hover.closed'),
        webkitOcrHover: nestedValue(webkitRun, 'interaction.ocr.hover.opened'),
        webkitOcrHoverClosed: nestedValue(webkitRun, 'interaction.ocr.hover.closed'),
    };
}

function requestedRunFailures(requestedRuns, results, context) {
    if (!Array.isArray(results)) return [{ reason: 'results are missing' }];
    const expectedKeys = requestedRuns.map(run => run.key);
    const actualKeys = results.map(runKey);
    const byKey = new Map(results.map(result => [runKey(result), result]));
    return [
        ...resultCardinalityFailures(requestedRuns.length, results.length, expectedKeys, actualKeys),
        ...duplicateResultFailures(actualKeys),
        ...requestedReplayFailures(requestedRuns, byKey, context),
        ...unexpectedReplayFailures(expectedKeys, actualKeys),
    ];
}

function resultCardinalityFailures(expected, actual, expectedKeys, actualKeys) {
    return expected === actual ? [] : [{ reason: 'result count mismatch', expectedKeys, actualKeys }];
}

function duplicateResultFailures(actualKeys) {
    return new Set(actualKeys).size === actualKeys.length ? [] : [{ reason: 'duplicate replay results', actualKeys }];
}

function requestedReplayFailures(requestedRuns, byKey, context) {
    return requestedRuns.flatMap(run => replayFailures(run, byKey.get(run.key), context));
}

function unexpectedReplayFailures(expectedKeys, actualKeys) {
    return actualKeys
        .filter(key => !expectedKeys.includes(key))
        .map(run => ({ run, reason: 'unexpected replay result' }));
}

function replayFailures(run, result, context) {
    if (!result) return [{ run: run.key, reason: 'missing replay result' }];
    return [
        ...REPLAY_CHECKS.flatMap(check => check(context, run, result)),
        ...functionEvidenceFailures(context, run, result.functionEvidence),
    ];
}

function functionEvidenceFailures(context, run, evidence) {
    if (run.engine === 'webkit') return failureUnless(evidence === null, run, 'WebKit carried CDP function evidence');
    if (nestedValue(evidence, 'mode') !== run.mode) return [{ run: run.key, reason: `missing ${run.mode} function evidence` }];
    const check = CHROMIUM_EVIDENCE_CHECKS.get(run.mode);
    if (!check) return [{ run: run.key, reason: `unsupported ${run.mode} function evidence` }];
    return check(context, run, evidence);
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

function replayErrorFailures(_context, run, result) {
    if (!result.error) return [];
    return [{ run: run.key, reason: 'replay failed', error: errorProperty(result.error, 'message', String(result.error)) }];
}

function youtubeEvidenceFailures(_context, run, result) {
    return failureUnless(hasActualYoutubeEvidence(result), run, 'real YouTube evidence missing');
}

function runtimeEvidenceFailures(_context, run, result) {
    return failureUnless(hasHealthyRuntime(result), run, 'Yomu runtime was not healthy');
}

function playbackEvidenceFailures(_context, run, result) {
    return failureUnless(nestedValue(result, 'interaction.playback.progressed') === true, run, 'playback did not progress');
}

function interactionEvidenceFailures(context, run, result) {
    if (context.workload.kind !== 'interaction') return [];
    const timedText = nestedValue(result, 'yomuBridgeRequests.timedText');
    const subtitle = nestedValue(result, 'interaction.subtitles');
    const ocr = nestedValue(result, 'interaction.ocr');
    const controls = nestedValue(result, 'interaction.nativeControls');
    return [
        ...failureUnless(hasSuccessfulTimedText(timedText), run, 'real non-empty timedtext response was not observed'),
        ...failureUnless(hoverEvidenceComplete(subtitle), run, 'subtitle hover open/close evidence is incomplete'),
        ...failureUnless(ocrEvidenceComplete(ocr), run, 'OCR hover open/close evidence is incomplete'),
        ...failureUnless(nativeControlsEvidenceComplete(controls), run, 'native controls auto-hide or focus-release evidence is incomplete'),
    ];
}

function hasSuccessfulTimedText(entries) {
    if (!Array.isArray(entries)) return false;
    return entries.some(timedTextObservationComplete);
}

function timedTextObservationComplete(entry) {
    const response = nestedValue(entry, 'response');
    const status = Number(nestedValue(response, 'status'));
    const bytes = Number(nestedValue(response, 'bytes'));
    return [
        nestedValue(entry, 'endpoint') === 'https://www.youtube.com/api/timedtext',
        nestedValue(entry, 'transport') === 'browser-session-fetch',
        Number.isInteger(status),
        status >= 200,
        status < 300,
        Number.isInteger(bytes),
        bytes > 0,
        new Set(['json', 'xml', 'text']).has(nestedValue(response, 'format')),
        Boolean(nestedValue(response, 'contentType')),
    ].every(Boolean);
}

function hoverEvidenceComplete(surface) {
    const hover = nestedValue(surface, 'hover');
    return [
        nestedValue(surface, 'rootPresent') === true,
        nestedValue(surface, 'wordPresent') === true,
        nestedValue(hover, 'opened') === true,
        nestedValue(hover, 'closed') === true,
        Boolean(nestedValue(hover, 'text')),
        finiteNonNegative(nestedValue(hover, 'openMs')),
        finiteNonNegative(nestedValue(hover, 'closeMs')),
    ].every(Boolean);
}

function ocrEvidenceComplete(surface) {
    const hoverComplete = hoverEvidenceComplete({
            rootPresent: nestedValue(surface, 'framePresent'),
            wordPresent: nestedValue(surface, 'wordPresent'),
            hover: nestedValue(surface, 'hover'),
        });
    return [
        nestedValue(surface, 'videoState.found') === true,
        nestedValue(surface, 'videoState.paused') === true,
        nestedValue(surface, 'framePresent') === true,
        nestedValue(surface, 'linePresent') === true,
        hoverComplete,
    ].every(Boolean);
}

function nativeControlsEvidenceComplete(controls) {
    const awake = nestedValue(controls, 'awake');
    const idle = nestedValue(controls, 'idle');
    const awakeVisible = [
        nestedValue(awake, 'playerAutohide') === false,
        Number(nestedValue(awake, 'chromeOpacity')) > 0.1,
    ].every(Boolean);
    const idleHidden = [
        nestedValue(idle, 'playerAutohide') === true,
        Number(nestedValue(idle, 'chromeOpacity')) <= 0.1,
    ].some(Boolean);
    return [
        nestedValue(controls, 'found') === true,
        awakeVisible,
        idleHidden,
        nestedValue(controls, 'autoHideObserved') === true,
        nestedValue(controls, 'yomuDidNotRetainFocus') === true,
        nestedValue(idle, 'activeInsideYomu') === false,
        Number(nestedValue(idle, 'yomuFocused')) === 0,
        Number(nestedValue(idle, 'yomuHovered')) === 0,
    ].every(Boolean);
}

function browserEvidenceFailures(context, run, result) {
    return [
        ...browserIdentityFieldFailures(run, result),
        ...browserHeadModeFailures(run, result),
        ...browserSourceFailures(context, run, result),
    ];
}

function browserIdentityFieldFailures(run, result) {
    const textFields = ['browser.channel', 'browser.version', 'browser.payloadResolution'];
    const textComplete = textFields.every(path => Boolean(nestedValue(result, path)));
    const executableComplete = browserExecutableIdentityComplete(result, 'browser.executable');
    const payloadComplete = browserPayloadResolutionComplete(run, result);
    return failureUnless(textComplete && executableComplete && payloadComplete, run, 'actual browser provenance is incomplete');
}

function browserExecutableIdentityComplete(result, prefix) {
    const path = nestedValue(result, `${prefix}.path`);
    const sha256 = String(nestedValue(result, `${prefix}.sha256`));
    const numberFields = ['mode', 'mtimeMs', 'device', 'inode'];
    const numbersComplete = numberFields.every(field => Number.isFinite(nestedValue(result, `${prefix}.stat.${field}`)));
    return Boolean(path)
        && /^[a-f0-9]{64}$/u.test(sha256)
        && numbersComplete
        && Number(nestedValue(result, `${prefix}.stat.bytes`)) > 0;
}

function browserPayloadResolutionComplete(run, result) {
    const resolution = nestedValue(result, 'browser.payloadResolution');
    const check = BROWSER_PAYLOAD_CHECKS.get(resolution);
    return check ? check(run, result) : false;
}

function webKitWrapperPayloadComplete(run, result) {
    const launcherComplete = browserExecutableIdentityComplete(result, 'browser.launcher');
    const distinctPaths = nestedValue(result, 'browser.launcher.path') !== nestedValue(result, 'browser.executable.path');
    return [run.engine === 'webkit', launcherComplete, distinctPaths].every(Boolean);
}

function browserHeadModeFailures(run, result) {
    const headed = nestedValue(result, 'browser.headed');
    const headless = nestedValue(result, 'browser.headless');
    const valid = typeof headed === 'boolean' && headless === !headed;
    return failureUnless(valid, run, 'browser headed/headless provenance is inconsistent');
}

function browserSourceFailures(context, run, result) {
    const bundled = nestedValue(result, 'browser.channel') === 'playwright-bundled';
    if (bundled) return bundledBrowserFailures(context, run, result);
    const validCustom = nestedValue(result, 'browser.custom') === true && nestedValue(result, 'browser.registry') === null;
    return failureUnless(validCustom, run, 'custom browser provenance is incomplete');
}

function bundledBrowserFailures(context, run, result) {
    const expected = context.browserRegistry.browsers.find(browser => browser.name === run.engine);
    const registryFields = ['revision', 'browserVersion'];
    const registryComplete = registryFields.every(field => Boolean(nestedValue(result, `browser.registry.${field}`)));
    const manifestMatches = nestedValue(result, 'browser.registry.manifestSha256') === context.browserRegistry.sha256;
    const expectedName = nestedValue(result, 'browser.registry.name') === run.engine;
    const revisionMatches = nestedValue(result, 'browser.registry.revision') === expected.revision;
    const registryVersionMatches = nestedValue(result, 'browser.registry.browserVersion') === expected.browserVersion;
    const versionMatches = nestedValue(result, 'browser.registry.browserVersion') === nestedValue(result, 'browser.version');
    const matches = [registryComplete, manifestMatches, expectedName, revisionMatches, registryVersionMatches, versionMatches].every(Boolean);
    return failureUnless(matches, run, 'bundled browser registry identity does not match the launched browser');
}

function workloadScopeFailures(context, run, result) {
    return [
        ...failureUnless(nestedValue(result, 'workload.scope') === 'whole live YouTube watch page', run, 'whole-page workload scope is missing'),
        ...failureUnless(nestedValue(result, 'workload.kind') === context.workload.kind, run, 'workload kind does not match the requested workload'),
        ...failureUnless(nestedValue(result, 'workload.comparable') === false, run, 'live workload must be marked non-comparable'),
    ];
}

function instrumentationFailures(_context, run, result) {
    const instrumented = new Set(['cpu', 'coverage']).has(run.mode);
    return failureUnless(nestedValue(result, 'workload.instrumented') === instrumented, run, 'instrumentation scope is incorrect');
}

function chromiumNoneMetricsFailures(context, run, result) {
    if (run.key !== 'chromium:none') return [];
    const hasCdp = completeCdpMetrics(nestedValue(result, 'workload.cdpDelta'));
    const hasPage = completePageMetrics(nestedValue(result, 'workload.page'), context.workload);
    return failureUnless(hasCdp && hasPage, run, 'chromium:none whole-page CDP or page metrics are missing');
}

function completeCdpMetrics(metrics) {
    if (!isRecord(metrics)) return false;
    const complete = REQUIRED_CDP_DELTA_FIELDS.every(field => Number.isFinite(metrics[field]));
    const durations = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
    const counts = ['LayoutCount', 'RecalcStyleCount'];
    return [
        complete,
        durations.every(field => metrics[field] >= 0),
        counts.every(field => nonNegativeInteger(metrics[field])),
        metrics.TaskDuration > 0,
        metrics.ScriptDuration > 0,
        counts.some(field => metrics[field] > 0),
    ].every(Boolean);
}

function completePageMetrics(metrics, workload) {
    if (!isRecord(metrics)) return false;
    const counters = REQUIRED_PAGE_COUNTER_FIELDS.every(field => finiteNonNegative(metrics[field]));
    const integerCounters = ['longTasks', 'animationFrames', 'over50MsFrameGaps']
        .every(field => Number.isInteger(metrics[field]));
    const frameCountersConsistent = [
        metrics.animationFrames > 0,
        metrics.maxFrameGapMs > 0,
        metrics.over50MsFrameGaps <= metrics.animationFrames,
    ].every(Boolean);
    return [
        counters,
        integerCounters,
        finiteNonNegative(metrics.startedAt),
        metrics.elapsedMs > 0,
        longTaskMetricsConsistent(metrics),
        frameCountersConsistent,
        workloadElapsedComplete(metrics, workload),
    ].every(Boolean);
}

function longTaskMetricsConsistent(metrics) {
    return LONG_TASK_CONSISTENCY.get(metrics.longTasks === 0)(metrics);
}

function workloadElapsedComplete(metrics, workload) {
    if (workload.kind !== 'ambient') return true;
    return metrics.elapsedMs >= workload.durationMs * MIN_AMBIENT_WINDOW_RATIO;
}

function nonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

function finiteNonNegative(value) {
    return Number.isFinite(value) && value >= 0;
}

function fatalBridgeLedgerFailures(_context, run, result) {
    const ledger = nestedValue(result, 'fatalBridgeRequests');
    const empty = Array.isArray(ledger) && ledger.length === 0;
    return failureUnless(empty, run, 'run contains fatal unrecognized GM requests');
}

function ambientWindowFailures(context, run, result) {
    if (context.workload.kind !== 'ambient') return [];
    const window = nestedValue(result, 'interaction.ambientWindow');
    const requestedDurationMs = Number(nestedValue(window, 'requestedDurationMs'));
    const elapsedWallMs = Number(nestedValue(window, 'elapsedWallMs'));
    const expectedDeltaSeconds = Number(nestedValue(window, 'expectedDeltaSeconds'));
    const deltaSeconds = Number(nestedValue(window, 'deltaSeconds'));
    const progressRatio = Number(nestedValue(window, 'progressRatio'));
    const maxSampleGapMs = Number(nestedValue(window, 'maxSampleGapMs'));
    return [
        ...failureUnless(requestedDurationMs === context.workload.durationMs, run, 'ambient requested duration does not match the workload'),
        ...failureUnless(elapsedWallMs >= context.workload.durationMs * MIN_AMBIENT_WINDOW_RATIO, run, 'ambient wall observation window was too short'),
        ...failureUnless(expectedDeltaSeconds > 0 && deltaSeconds >= expectedDeltaSeconds * MIN_AMBIENT_PROGRESS_RATIO, run, 'ambient media delta was not meaningful for elapsed wall time'),
        ...failureUnless(progressRatio >= MIN_AMBIENT_PROGRESS_RATIO, run, 'ambient playback progress ratio was too low'),
        ...failureUnless(Number(nestedValue(window, 'sampleCount')) >= 2, run, 'ambient playback samples are missing'),
        ...failureUnless(maxSampleGapMs > 0 && maxSampleGapMs <= MAX_AMBIENT_SAMPLE_GAP_MS, run, 'ambient playback sample cadence was too sparse'),
        ...failureUnless(Number(nestedValue(window, 'stalledIntervalCount')) === 0, run, 'ambient playback contained a stalled interval'),
        ...failureUnless(nestedValue(window, 'fullWindow') === true, run, 'ambient playback did not cover the full window'),
        ...failureUnless(nestedValue(window, 'sampleCadenceHealthy') === true, run, 'ambient playback sampling was unhealthy'),
        ...failureUnless(nestedValue(window, 'progressed') === true, run, 'ambient media did not progress through the observation window'),
        ...failureUnless(nestedValue(window, 'unpaused') === true, run, 'ambient media ended paused'),
        ...failureUnless(nestedValue(window, 'nonStalled') === true, run, 'ambient media ended stalled'),
        ...failureUnless(nestedValue(window, 'ended.paused') === false, run, 'ambient media ended paused'),
        ...failureUnless(Number(nestedValue(window, 'ended.readyState')) >= 3, run, 'ambient media ended without future data'),
    ];
}

function cpuEvidenceFailures(context, run, evidence) {
    const failures = artifactSummaryScopeFailures(context, run, evidence);
    const hasProductSamples = Number(nestedValue(evidence, 'sampled.sampleCount')) > 0;
    return [...failures, ...failureUnless(hasProductSamples, run, 'CPU profile contains no product-scoped samples')];
}

function coverageEvidenceFailures(context, run, evidence) {
    const failures = artifactSummaryScopeFailures(context, run, evidence);
    const hasCalledFunctions = Number(nestedValue(evidence, 'calls.functionsCalled')) > 0;
    return [...failures, ...failureUnless(hasCalledFunctions, run, 'coverage contains no called product functions')];
}

function artifactSummaryScopeFailures(context, run, evidence) {
    const expected = context.artifacts;
    return [
        ...failureUnless(nestedValue(evidence, 'summaryScope.kind') === 'yomu-artifact-graph', run, 'function summary is not artifact-graph scoped'),
        ...failureUnless(nestedValue(evidence, 'summaryScope.sourceUrl') === expected.sourceUrl, run, 'function summary source URL does not match the product graph'),
        ...failureUnless(nestedValue(evidence, 'summaryScope.sha256') === expected.sha256, run, 'function summary hash does not match the product graph'),
    ];
}

function isRecord(value) {
    if (value === null) return false;
    if (Array.isArray(value)) return false;
    return typeof value === 'object';
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

function requiredSha256(value, message) {
    const sha256 = requiredText(value, message);
    if (!/^[a-f0-9]{64}$/u.test(sha256)) fail(message);
    return sha256;
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
