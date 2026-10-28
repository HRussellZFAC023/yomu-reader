import { describe, expect, it } from 'vitest';
import { configureFunctionProfiler, startFunctionProfiler, stopFunctionProfiler } from '../../scripts/lib/youtube-performance-cdp.mjs';

describe('YouTube performance CDP lifecycle', () => {
    it('samples CPU without enabling precise coverage', async () => {
        const client = fakeClient();
        await configureFunctionProfiler(client, 'cpu');
        await startFunctionProfiler(client, 'cpu');
        await stopFunctionProfiler(client, 'cpu');

        expect(client.methods).toEqual(['Profiler.enable', 'Profiler.setSamplingInterval', 'Profiler.start', 'Profiler.stop']);
        expect(client.methods).not.toContain('Profiler.startPreciseCoverage');
    });

    it('collects precise call counts without starting CPU sampling', async () => {
        const client = fakeClient();
        await configureFunctionProfiler(client, 'coverage');
        await startFunctionProfiler(client, 'coverage');
        await stopFunctionProfiler(client, 'coverage');

        expect(client.methods).toEqual([
            'Profiler.enable',
            'Profiler.startPreciseCoverage',
            'Profiler.takePreciseCoverage',
            'Profiler.stopPreciseCoverage',
        ]);
        expect(client.methods).not.toContain('Profiler.start');
    });

    it('keeps metrics mode uninstrumented and rejects mixed profiler modes', async () => {
        const metrics = fakeClient();
        await configureFunctionProfiler(metrics, 'metrics');
        await startFunctionProfiler(metrics, 'metrics');
        await stopFunctionProfiler(metrics, 'metrics');
        expect(metrics.methods).toEqual([]);

        const mixed = fakeClient();
        await configureFunctionProfiler(mixed, 'cpu');
        await expect(configureFunctionProfiler(mixed, 'coverage')).rejects.toThrow(/cannot mix/u);
        await expect(stopFunctionProfiler(mixed, 'metrics')).rejects.toThrow(/must be configured/u);
    });
});

function fakeClient() {
    const methods: string[] = [];
    return {
        methods,
        async send(method: string) {
            methods.push(method);
            if (method === 'Profiler.stop') return { profile: { nodes: [], samples: [], timeDeltas: [] } };
            if (method === 'Profiler.takePreciseCoverage') return { result: [] };
            return {};
        },
    };
}
