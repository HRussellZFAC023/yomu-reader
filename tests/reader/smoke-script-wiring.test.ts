import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A smoke script with no npm alias runs exactly once — on the day it is written.
 * CI invokes `smoke:layout-regressions`, so a layout guard that never joins that
 * chain protects nothing. This test keeps the wiring honest: every headless
 * smoke under scripts/ must be reachable by name, and the chain CI runs must
 * name the ones that guard rendered layout.
 */
const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const BODIES = Object.values(PACKAGE.scripts).join(' ');

describe('smoke script wiring', () => {
    it('gives every smoke and proof script under scripts/ an npm alias', () => {
        const unreachable = readdirSync('scripts')
            .filter(name => /-smoke\.mjs$|-proof\.mjs$/.test(name))
            .filter(name => !BODIES.includes(`scripts/${name}`));

        expect(unreachable).toEqual([]);
    });

    it('runs the subtitle furigana outline guard from the chain CI executes', () => {
        expect(PACKAGE.scripts['smoke:subtitle-furigana-outline'])
            .toBe('node scripts/subtitle-furigana-outline-scale-smoke.mjs');
        expect(PACKAGE.scripts['smoke:layout-regressions'])
            .toContain('npm run smoke:subtitle-furigana-outline');
    });

    it('keeps every link of the CI chain a self-contained scripts/ entry point', () => {
        const chain = PACKAGE.scripts['smoke:layout-regressions'].split('&&')
            .map(part => part.trim().replace(/^npm run /, ''));

        expect(chain.length).toBeGreaterThan(1);
        for (const name of chain) {
            const body = PACKAGE.scripts[name];
            // scripts/manual/* are owner-driven probes against live sites and
            // must never join a chain CI runs; a chain link is one plain node
            // entry point under scripts/, with no build or install step to
            // race the other CI jobs.
            expect(body, name).toMatch(/^node scripts\/[\w.-]+\.mjs$/);
            expect(() => readFileSync(body.replace('node ', ''), 'utf8'), name).not.toThrow();
        }
    });
});
