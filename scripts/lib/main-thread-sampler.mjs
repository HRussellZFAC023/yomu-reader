// Main-thread sampler: how much of the page's main thread something other than
// the sampler used, in ms per second, in every engine.
//
// - Spin sampler (Chromium, WebKit, Firefox): a MessageChannel loop that spins
//   in 2 ms slices. Wall time not spent spinning was used by the page — host
//   scripts, the product, style, layout and paint. Gaps over 50 ms are long
//   tasks by another name, which WebKit cannot report itself.
// - CDP Performance metrics (Chromium only): TaskDuration, ScriptDuration,
//   RecalcStyleDuration and LayoutDuration deltas, plus recalc/layout counts.
//
// The spin sampler occupies every idle slice, so run it only over a window
// where idle time is what you are measuring, not while timing a lookup.

const SPIN_SLICE_MS = 2;
const LONG_GAP_MS = 50;

export async function startMainThreadSampler(page, { engine = 'chromium', spin = true, cdp = engine === 'chromium' } = {}) {
    const startedAt = Date.now();
    let client = null;
    let metricsBefore = null;
    if (cdp) {
        client = await page.context().newCDPSession(page);
        await client.send('Performance.enable');
        metricsBefore = metricMap((await client.send('Performance.getMetrics')).metrics);
    }
    if (spin) await page.evaluate(startSpinInPage, { sliceMs: SPIN_SLICE_MS });

    return {
        async stop() {
            const elapsedMs = Date.now() - startedAt;
            const result = { elapsedMs };
            if (spin) {
                const raw = await page.evaluate(stopSpinInPage);
                result.spin = raw ? spinSummary(raw) : null;
            }
            if (client) {
                const metricsAfter = metricMap((await client.send('Performance.getMetrics')).metrics);
                result.cdp = cdpPerSecond(metricsBefore, metricsAfter, elapsedMs / 1000);
                await client.detach().catch(() => undefined);
            }
            return result;
        },
    };
}

function metricMap(metrics) {
    return Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
}

/** Pure: CDP Performance.getMetrics deltas turned into per-second rates. */
export function cdpPerSecond(before, after, seconds) {
    const perSecond = (name, scale = 1) => round(((after[name] ?? 0) - (before[name] ?? 0)) * scale / Math.max(seconds, 0.001));
    return {
        taskMsPerSec: perSecond('TaskDuration', 1000),
        scriptMsPerSec: perSecond('ScriptDuration', 1000),
        recalcStyleMsPerSec: perSecond('RecalcStyleDuration', 1000),
        layoutMsPerSec: perSecond('LayoutDuration', 1000),
        recalcStylesPerSec: perSecond('RecalcStyleCount'),
        layoutsPerSec: perSecond('LayoutCount'),
        nodes: after.Nodes ?? null,
    };
}

/** Pure: the spin loop's raw totals turned into the numbers gates read. */
export function spinSummary({ wallMs, spunMs, gaps }, longGapMs = LONG_GAP_MS) {
    const longGaps = gaps.filter(gap => gap > longGapMs);
    return {
        wallMs: round(wallMs),
        otherMsPerSec: round(((wallMs - spunMs) / Math.max(wallMs, 1)) * 1000),
        longGaps: longGaps.length,
        longGapMs: round(longGaps.reduce((sum, gap) => sum + gap, 0)),
        longestGapMs: round(gaps.reduce((max, gap) => Math.max(max, gap), 0)),
    };
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function startSpinInPage({ sliceMs }) {
    const state = { running: true, spunMs: 0, gaps: [], start: performance.now(), last: performance.now() };
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        if (!state.running) return;
        const sliceStart = performance.now();
        const gap = sliceStart - state.last;
        if (gap > 4) state.gaps.push(gap);
        while (performance.now() - sliceStart < sliceMs) { /* spin */ }
        const sliceEnd = performance.now();
        state.spunMs += sliceEnd - sliceStart;
        state.last = sliceEnd;
        channel.port2.postMessage(0);
    };
    window.__yomuMainThreadSpin = { state, channel };
    channel.port2.postMessage(0);
}

function stopSpinInPage() {
    const sampler = window.__yomuMainThreadSpin;
    if (!sampler) return null;
    const { state, channel } = sampler;
    state.running = false;
    channel.port1.close();
    delete window.__yomuMainThreadSpin;
    return { wallMs: performance.now() - state.start, spunMs: state.spunMs, gaps: state.gaps };
}
