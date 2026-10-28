// Recursive route discovery and the two disclosure documents.
// @yomu-reads docs/** README.md
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { internalDocsExcludeGlobs } from '../../config/docs/published-pages';
import { LEGACY_DOC_REDIRECTS } from '../../config/docs/legacy-redirects';
import { PUBLISHED_WEBSITE_ROUTES } from '../../docs/.vitepress/locales/site-locales';
import { publishedWebsiteRouteDefinitions } from '../../docs/.vitepress/locales/route-catalog';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const internal = (file: string) => internalDocsExcludeGlobs.some(glob => path.matchesGlob(file, glob));
const route = (file: string) => file.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
function markdownFiles(directory = 'docs'): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === '.vitepress' ? [] : markdownFiles(file);
        return entry.isFile() && file.endsWith('.md') ? [file.slice('docs/'.length)] : [];
    });
}
describe('docs publication and default lookup disclosure', () => {
    it('routes only catalogued user-facing pages, rejecting new root notes', () => {
        expect(markdownFiles().filter(file => !internal(file)).map(route).sort()).toEqual([
            ...PUBLISHED_WEBSITE_ROUTES,
            ...publishedWebsiteRouteDefinitions('ja').map(definition => `ja/${definition.route}`),
            ...Object.keys(LEGACY_DOC_REDIRECTS).map(route),
        ].sort());
    });
    it('keeps every engineering, operations and reviewer family excluded', () => {
        for (const file of [
            'academy/STATUS.md', 'academy/story/dossiers/rie.md',
            'dev/check-performance.md', 'dev/check-exit-code-incident-2026-07-18.md',
            'multilingual/README.md', 'qa/ANNOTATION-FIX-PROBE-20260715.md',
            'operations/cloudflare-data-recovery.md', 'operations/cloudflare-data-recovery-drill-2026-07-29.md',
            'public/academy/vendor/kanjivg/ATTRIBUTION.md',
            'carryover-workstream-2026-07-18.md', 'nuclear-backlog-2026-07-16.md',
            'changelog-archive.md', 'store-review-notes.md',
        ]) expect(internal(file), file).toBe(true);
    });
    it('names every default keyless definition service in the lookup disclosure', () => {
        const names: Record<string, string> = { jiten: 'Jiten', jpdb: 'JPDB', bunpro: 'Bunpro', wanikani: 'WaniKani' };
        const keyless = Object.entries(DEFAULT_SETTINGS).flatMap(([key, value]) => {
            const provider = /^(\w+)DefinitionsEnabled$/u.exec(key)?.[1];
            return provider && value === true && provider !== 'wanikani' ? [provider] : [];
        });
        expect(keyless.length).toBeGreaterThan(0);
        for (const file of ['docs/privacy/index.md', 'README.md']) {
            const line = readFileSync(file, 'utf8').split('\n').find(value => /word you (?:open|look up) goes to/u.test(value));
            expect(line, file).toBeDefined();
            for (const provider of keyless) {
                expect(names[provider], `Name new default provider: ${provider}`).toBeDefined();
                expect(line, `${file}: ${provider}`).toContain(names[provider]);
            }
        }
    });
});
