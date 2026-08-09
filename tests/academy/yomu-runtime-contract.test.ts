import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Academy Reader runtime contract', () => {
    it('delegates dependency ordering to the shared final-userscript graph Module', () => {
        const source = readFileSync('src/academy/integration/yomu-runtime.ts', 'utf8');

        expect(source).toContain("from '../../reader/app/hosted-runtime-graph'");
        expect(source).toContain('await loadHostedReaderRuntime({');
        expect(source).not.toMatch(/greasyfork\/yomu-[a-z-]+\.user\.js/u);
    });

    it('loads the generated graph before the deferred Academy application', () => {
        const source = readFileSync('public/academy/index.html', 'utf8');
        const graph = source.indexOf('<script src="/hosted-runtime-graph.js?v=__ACADEMY_REVISION__" defer></script>');
        const application = source.indexOf('<script src="/academy/app.js?v=__ACADEMY_REVISION__" defer></script>');

        expect(graph).toBeGreaterThan(0);
        expect(application).toBeGreaterThan(graph);
    });

    it('keeps English Academy cold and wakes on the lifecycle-owned reading marker', () => {
        const source = readFileSync('src/academy/integration/yomu-runtime.ts', 'utf8');

        expect(source).toContain("attributeFilter: ['data-yomu-runtime-surface']");
        expect(source).not.toContain('SURFACE_WAIT_TIMEOUT_MS');
        expect(source).toContain("if (academyRuntimePresence() !== 'conforming') {");
        expect(source).toContain('const surfaceReady = await waitForJapaneseSurface();');
        expect(source).toContain("from '../../reader/app/runtime-presence'");
        expect(source).toContain('if (!shouldInstallHostedReaderRuntime()) return \'starting\';');
    });
});
