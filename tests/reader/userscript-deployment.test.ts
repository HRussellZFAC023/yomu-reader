import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- standalone Node release/monitoring script
import { userscriptDependencies, verifyUserscriptDeployment } from '../../scripts/lib/userscript-deployment.mjs';

const runtime = '/* readable runtime */';
const css = 'body { color: black; }';
const pin = (text: string) => createHash('sha256').update(text).digest('base64');
const installer = `// ==UserScript==
// @version 2.3.2
// @require https://example.test/runtime.js#sha256=${pin(runtime)}
// @resource yomuCss  https://example.test/style.css#sha256=${pin(css)}
// ==/UserScript==
// @require https://example.test/not-metadata.js
`;

describe('published userscript dependency readiness', () => {
    it('reads only metadata, including CRLF and padded resource declarations', () => {
        const parsed = userscriptDependencies(installer.replaceAll('\n', '\r\n'));
        expect(parsed.version).toBe('2.3.2');
        expect(parsed.dependencies.map((item: { url: string }) => item.url)).toEqual([
            'https://example.test/runtime.js', 'https://example.test/style.css',
        ]);
    });

    it('passes exact pinned bytes even when the served installer differs from main', async () => {
        const fetcher = vi.fn(async (url: string) => new Response(url.endsWith('.js') ? runtime : css));
        expect((await verifyUserscriptDeployment(installer.replace('2.3.2', '2.3.1'), fetcher)).ok).toBe(true);
    });

    it('reproduces the missing 2.3.2 runtime and CSS instead of trusting a healthy homepage', async () => {
        const report = await verifyUserscriptDeployment(installer, async () => new Response('Not found', { status: 404 }));
        expect(report.ok).toBe(false);
        expect(report.results.map((item: { detail: string }) => item.detail)).toEqual(['HTTP 404', 'HTTP 404']);
    });

    it('rejects HTML fallbacks and stale mutable content even with HTTP 200', async () => {
        const report = await verifyUserscriptDeployment(installer, async () => new Response('<html>Fallback</html>'));
        expect(report.ok).toBe(false);
        expect(report.results.every((item: { detail: string }) => item.detail.includes('SHA-256 mismatch'))).toBe(true);
    });

    it('reports network failures and still checks the remaining dependency', async () => {
        const fetcher = vi.fn(async (url: string) => {
            if (url.endsWith('.js')) throw new Error('Request timed out');
            return new Response(css);
        });
        const report = await verifyUserscriptDeployment(installer, fetcher);
        expect(report.ok).toBe(false);
        expect(report.results[0].detail).toBe('Request timed out');
        expect(report.results[1].ok).toBe(true);
    });

    it.each([
        '<html>Not a userscript</html>',
        installer.replace('// @version 2.3.2', ''),
        installer.replace(/#sha256=[^\n]+/g, ''),
        installer.replace(/\/\/ @require https[^\n]+\n/g, ''),
        installer.replace(/\/\/ @resource[^\n]+\n/g, ''),
        installer.replace('https://example.test/runtime.js', 'http://example.test/runtime.js'),
    ])('fails closed on invalid installer metadata', source => {
        expect(() => userscriptDependencies(source)).toThrow();
    });

    it('gates release publication and monitors both live installers', () => {
        const release = readFileSync('.github/workflows/release.yml', 'utf8');
        const gate = 'node scripts/check-userscript-deployment.mjs --file dist/yomu.user.js';
        expect(release.indexOf(gate)).toBeGreaterThan(release.indexOf('Restore split userscript release artifact'));
        expect(release.indexOf(gate)).toBeLessThan(release.indexOf('- name: Publish GitHub release'));
        expect(readFileSync('.github/workflows/production-health.yml', 'utf8'))
            .toContain('run: node scripts/check-userscript-deployment.mjs');
    });
});
