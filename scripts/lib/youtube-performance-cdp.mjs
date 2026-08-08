const PROFILE_MODES = new Set(['none', 'metrics', 'cpu', 'coverage']);
const configuredModeByClient = new WeakMap();
const PROFILER_CONFIGURERS = {
    cpu: configureCpuProfiler,
    coverage: configureCoverageProfiler,
};
const PROFILER_STARTERS = {
    cpu: client => client.send('Profiler.start'),
    coverage: client =>
        client.send('Profiler.startPreciseCoverage', {
            callCount: true,
            detailed: true,
            allowTriggeredUpdates: false,
        }),
};
const PROFILER_STOPPERS = {
    cpu: stopCpuProfiler,
    coverage: stopCoverageProfiler,
};

export async function configureFunctionProfiler(client, mode) {
    const requestedMode = canonicalProfilerMode(mode);
    const configure = PROFILER_CONFIGURERS[requestedMode];
    const configuredMode = configuredModeByClient.get(client);
    assertCompatibleProfilerMode(configuredMode, requestedMode);
    if (configuredMode) return;
    await configure?.(client);
    configuredModeByClient.set(client, requestedMode);
}

export async function startFunctionProfiler(client, mode) {
    const configuredMode = assertConfiguredMode(client, mode);
    await PROFILER_STARTERS[configuredMode]?.(client);
}

export async function stopFunctionProfiler(client, mode) {
    const configuredMode = assertConfiguredMode(client, mode);
    const stop = PROFILER_STOPPERS[configuredMode];
    return stop ? stop(client, configuredMode) : { mode: configuredMode };
}

async function configureCpuProfiler(client) {
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 250 });
}

async function configureCoverageProfiler(client) {
    await client.send('Profiler.enable');
}

async function stopCpuProfiler(client, mode) {
    return { mode, profile: (await client.send('Profiler.stop')).profile };
}

async function stopCoverageProfiler(client, mode) {
    const collection = await collectCoverage(client);
    const teardownFailure = await stopCoverageCollection(client);
    const failure = combinedCoverageFailure(collection.error, teardownFailure);
    if (failure) throw failure;
    return { mode, scripts: collection.result };
}

function combinedCoverageFailure(collectionFailure, teardownFailure) {
    if (collectionFailure && teardownFailure) {
        return new AggregateError([collectionFailure, teardownFailure], 'Precise coverage collection and teardown failed.');
    }
    return collectionFailure || teardownFailure;
}

async function collectCoverage(client) {
    try {
        return { result: (await client.send('Profiler.takePreciseCoverage')).result, error: null };
    } catch (error) {
        return { result: null, error };
    }
}

async function stopCoverageCollection(client) {
    try {
        await client.send('Profiler.stopPreciseCoverage');
        return null;
    } catch (error) {
        return error;
    }
}

function assertCompatibleProfilerMode(configuredMode, requestedMode) {
    if (configuredMode && configuredMode !== requestedMode) {
        throw new Error(`A CDP session cannot mix ${configuredMode} and ${requestedMode} profiling.`);
    }
}

function assertConfiguredMode(client, mode) {
    const requestedMode = canonicalProfilerMode(mode);
    if (configuredModeByClient.get(client) !== requestedMode) {
        throw new Error(`CDP ${requestedMode} profiling must be configured before use.`);
    }
    return requestedMode;
}

function canonicalProfilerMode(mode) {
    if (!PROFILE_MODES.has(mode)) throw new Error(`Unknown CDP profiler mode: ${mode}`);
    return PROFILER_CONFIGURERS[mode] ? mode : 'none';
}
