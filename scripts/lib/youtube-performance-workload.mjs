/**
 * Run a deterministic amount of YouTube fixture churn. Every replay gets the
 * same ordered operation ledger, so metrics, sampled CPU and call counts can be
 * compared without wall-clock throughput changing the work.
 */
export async function exerciseYoutubeFixedChurn(page, options) {
    const { lookupPlan, waitForLookupPlanReady } = options;
    const cycles = Number(options.cycles);
    const label = String(options.label);
    assertFixedBenchmarkOptions(label, lookupPlan, waitForLookupPlanReady);
    const initialHostRestores = await page.evaluate(stopFixtureChurn);
    const startedAt = Date.now();
    const operations = [];
    for (const operation of fixedAmbientOperationPlan(cycles)) {
        operations.push(await page.evaluate(performFixedAmbientFixtureOperation, operation));
        await waitForLookupPlanReady(page, lookupPlan);
    }
    const finalHostRestores = await page.evaluate(() => window.__yomuProfileHostRestores ?? 0);
    const hostRestores = finalHostRestores - initialHostRestores;
    assertAmbientChurnExecuted(label, operations.length, hostRestores);
    assertEveryFixedOperationRestoredHosts(label, operations);
    return {
        label,
        workload: 'fixed-ambient-benchmark',
        comparable: true,
        requestedCycles: cycles,
        durationMs: Date.now() - startedAt,
        cycles: operations.length,
        playbackTicks: operations.reduce((sum, operation) => sum + operation.playbackTicks, 0),
        hostRestores,
        operations,
    };
}

function assertFixedBenchmarkOptions(label, lookupPlan, waitForLookupPlanReady) {
    if (!Array.isArray(lookupPlan)) throw new Error(`${label}: fixed ambient benchmark requires an exact lookup plan.`);
    if (typeof waitForLookupPlanReady !== 'function') {
        throw new Error(`${label}: fixed ambient benchmark requires a lookup readiness barrier.`);
    }
}

function assertEveryFixedOperationRestoredHosts(label, operations) {
    const failedOperation = operations.find(operation => operation.restoredHosts <= 0);
    if (failedOperation) throw new Error(`${label}: fixed ambient benchmark did not rehydrate its fixture hosts on every cycle.`);
}

export function fixedAmbientOperationPlan(cycles) {
    if (!Number.isInteger(cycles) || cycles <= 0) throw new Error(`Fixed ambient cycle count must be positive: ${cycles}`);
    return Array.from({ length: cycles }, (_, cycle) => ({
        cycle,
        phase: fixedPlaybackPhase(cycle, cycles),
        scrollOffset: (cycle % 5) * 180,
        playbackTicks: Number(fixedPlaybackPhase(cycle, cycles) === 'playing'),
    }));
}

function stopFixtureChurn() {
    window.__yomuProfileStopHostRehydrate();
    window.__yomuProfileStopPlayback();
    return window.__yomuProfileHostRestores ?? 0;
}

function performFixedAmbientFixtureOperation(operation) {
    const comments = document.querySelector('#comments, ytm-comment-section-renderer');
    const commentTop = comments ? comments.getBoundingClientRect().top + window.scrollY - 120 : 0;
    window.scrollTo({
        top: Math.max(0, commentTop + operation.scrollOffset),
        behavior: 'instant',
    });
    if (operation.playbackTicks > 0) window.__yomuProfilePlaybackTickOnce();
    return {
        ...operation,
        restoredHosts: window.__yomuProfileRehydrateOnce(),
    };
}

function fixedPlaybackPhase(cycle, cycles) {
    if (cycle < Math.ceil(cycles * 0.4)) return 'playing';
    if (cycle < Math.ceil(cycles * 0.7)) return 'paused';
    return 'playing';
}

/**
 * Optional time-boxed throughput soak. This is deliberately not merged across
 * replays and never substitutes for the fixed-operation benchmark.
 */
export async function exerciseYoutubeAmbientSoak(page, options) {
    const durationMs = Number(options.durationMs);
    const label = String(options.label);
    const initialHostRestores = await page.evaluate(() => {
        window.__yomuProfileStartPlayback?.();
        window.__yomuProfileStartHostRehydrate?.({ intervalMs: 150 });
        return window.__yomuProfileHostRestores ?? 0;
    });
    const startedAt = Date.now();
    let cycles = 0;
    let playbackPhase = 'playing';
    try {
        while (Date.now() - startedAt < durationMs) {
            const nextPlaybackPhase = ambientPlaybackPhase((Date.now() - startedAt) / durationMs);
            if (nextPlaybackPhase !== playbackPhase) {
                playbackPhase = nextPlaybackPhase;
                await setAmbientPlaybackPhase(page, playbackPhase);
            }
            await page.evaluate(scrollFixtureComments, cycles);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
            cycles += 1;
            await page.waitForTimeout(90);
        }
    } finally {
        await page.evaluate(stopOptionalFixtureChurn);
    }
    const finalHostRestores = await page.evaluate(() => window.__yomuProfileHostRestores ?? 0);
    const hostRestores = finalHostRestores - initialHostRestores;
    assertAmbientChurnExecuted(label, cycles, hostRestores);
    const elapsedMs = Date.now() - startedAt;
    return {
        label,
        workload: 'ambient-throughput-soak',
        comparable: false,
        requestedDurationMs: durationMs,
        durationMs: elapsedMs,
        cycles,
        cyclesPerSecond: Math.round((cycles / Math.max(1, elapsedMs)) * 100_000) / 100,
        hostRestores,
    };
}

function scrollFixtureComments(index) {
    const comments = document.querySelector('#comments, ytm-comment-section-renderer');
    const top = comments ? comments.getBoundingClientRect().top + window.scrollY - 120 : 0;
    window.scrollTo({
        top: Math.max(0, top + (index % 5) * 180),
        behavior: 'instant',
    });
}

function stopOptionalFixtureChurn() {
    window.__yomuProfileStopHostRehydrate?.();
    window.__yomuProfileStopPlayback?.();
}

function ambientPlaybackPhase(progress) {
    if (progress < 0.38) return 'playing';
    if (progress < 0.68) return 'paused';
    return 'playing';
}

async function setAmbientPlaybackPhase(page, phase) {
    await page.evaluate(playing => {
        if (playing) window.__yomuProfileStartPlayback?.();
        else window.__yomuProfileStopPlayback?.();
    }, phase === 'playing');
}

function assertAmbientChurnExecuted(label, cycles, hostRestores) {
    if (cycles <= 0) throw new Error(`${label}: ambient churn completed no scroll cycles.`);
    if (hostRestores <= 0) throw new Error(`${label}: ambient churn completed no host restores.`);
}
