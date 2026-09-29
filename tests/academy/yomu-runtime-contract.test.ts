import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Use the production sync's template renderer.
import { renderAcademyTemplate } from '../../scripts/lib/academy-build-manifest.cjs';
import { academyFixtureManifest } from '../helpers/academy-offline';

describe('Academy Reader runtime contract', () => {
    it('delegates dependency ordering to the shared final-userscript graph Module', () => {
        const source = readFileSync('src/academy/integration/yomu-runtime.ts', 'utf8');

        expect(source).toContain("from '../../reader/app/hosted-runtime-graph'");
        expect(source).toContain('await loadHostedReaderRuntime({');
        expect(source).not.toMatch(/greasyfork\/yomu-[a-z-]+\.user\.js/u);
    });

    it('loads the generated graph before the manifest-selected Academy module', () => {
        const html = renderAcademyTemplate(readFileSync('public/academy/index.html', 'utf8'), 's1-contract', academyFixtureManifest());
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const scripts = [...parsed.querySelectorAll('script')];
        const graphs = scripts.filter(script => script.getAttribute('src') === '/hosted-runtime-graph.js?v=s1-contract');
        const modules = scripts.filter(script => script.type === 'module');
        expect(graphs).toHaveLength(1);
        expect(modules).toHaveLength(1);
        expect(graphs[0]!.getAttribute('type') ?? '').toBe('');
        expect(graphs[0]!.hasAttribute('defer')).toBe(true);
        expect(modules[0]!.getAttribute('src')).toBe('/academy/entry-contract.js?v=s1-contract');
        expect(graphs[0]!.hasAttribute('async')).toBe(false);
        expect(modules[0]!.hasAttribute('async')).toBe(false);
        expect(scripts.indexOf(graphs[0]!)).toBeLessThan(scripts.indexOf(modules[0]!));
        expect(html).not.toMatch(/__ACADEMY_(?:REVISION|ENTRY_URL|ENTRY_STYLES)__/u);
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

    it('leaves durable Reader settings to their owner rather than seeding raw defaults', () => {
        const source = readFileSync('src/academy/integration/yomu-runtime.ts', 'utf8');
        expect(source).not.toContain('seedAcademyReaderDefaults');
        expect(source).not.toContain('localStorage.setItem');
    });
});
