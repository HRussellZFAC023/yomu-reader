const DELTA_METRICS = Object.freeze([
    'TaskDuration',
    'ScriptDuration',
    'LayoutDuration',
    'RecalcStyleDuration',
    'LayoutCount',
    'RecalcStyleCount',
    'JSHeapUsedSize',
    'Nodes',
]);

export async function cdpMetrics(client) {
    const result = await client.send('Performance.getMetrics');
    return Object.fromEntries(result.metrics.map(metric => [metric.name, metric.value]));
}

export function metricDelta(before, after) {
    return Object.fromEntries(DELTA_METRICS.map(key => [
        key,
        roundMetric((after[key] ?? 0) - (before[key] ?? 0)),
    ]));
}

function roundMetric(value) {
    return Math.round(value * 1000) / 1000;
}
