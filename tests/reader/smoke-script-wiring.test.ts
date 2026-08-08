import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { userscriptCompanionPaths } from '../../scripts/lib/smoke-test-helpers.mjs';

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

    it('gates releases on the cross-engine parser glyph identity sweep', () => {
        expect(PACKAGE.scripts['smoke:parser-glyph-identity'])
            .toBe('node scripts/parser-glyph-identity-smoke.mjs');
        expect(PACKAGE.scripts['smoke:release'])
            .toContain('npm run smoke:parser-glyph-identity');
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

/**
 * The distributed userscript delegates whole capability suites — the JPDB and
 * Jiten clients, the definition-source renderers, the learning-target runtime —
 * to companion libraries a script manager executes from the `@require` header.
 * Core keeps only inert facades: with the companion absent, `JpdbClient.parse`
 * resolves to `[]` and the Jiten renderer returns `''`. Nothing throws.
 *
 * So a smoke that boots the reader core against a HAND-WRITTEN companion list
 * does not fail loudly when the split moves — it quietly measures a reader with
 * no dictionary at all. That is exactly what happened when the split collapsed
 * into one deduplicated `yomu-runtime` companion: three popover smokes kept
 * loading the retired per-feature bundles, so the word never annotated, the
 * popover never produced a source card, and the failure read as a plain
 * Playwright timeout with no hint at the cause.
 *
 * The companion set has one derivation — the built `@require` header, read by
 * `userscriptCompanionPaths` — and these smokes must use it.
 */
describe('full-reader smoke companion graph', () => {
    const require = createRequire(import.meta.url);
    const { GREASY_FORK_LIBRARIES } = require('../../scripts/lib/greasyfork-libraries.cjs') as {
        GREASY_FORK_LIBRARIES: Array<{ fileName: string; userscriptRequire?: boolean }>;
    };
    const BUILT_USERSCRIPT = path.join('dist', 'yomu.user.js');

    // Smokes that click a word and assert on the popover's dictionary content.
    const FULL_READER_SMOKES = [
        'scripts/definition-sources-playwright-smoke.mjs',
        'scripts/grading-provider-popover-smoke.mjs',
        'scripts/popover-headword-furigana-smoke.mjs',
        'scripts/furigana-tapband-smoke.mjs',
    ];

    it.each(FULL_READER_SMOKES)('%s derives its companions from the built @require header', file => {
        const source = readFileSync(file, 'utf8');
        expect(source, `${file} must resolve companions through smoke-test-helpers`)
            .toMatch(/from '\.\/lib\/smoke-test-helpers\.mjs'/);
        expect(source, `${file} must load the whole @require graph for SCRIPT_PATH`)
            .toMatch(/(?:addScriptTagWithCspFallback|addUserscriptGraphInitScripts|userscriptCompanionPaths)\(\s*(?:page,\s*)?SCRIPT_PATH\s*\)/);
        // A literal companion bundle name is the hand-written list coming back.
        expect([...source.matchAll(/yomu-[a-z\d-]+\.user\.js/g)].map(match => match[0]), file)
            .toEqual([]);
    });

    it('derives the Japanese-site acceptance runtime from the built @require header', () => {
        const file = 'scripts/manual/japanese-site-language-smoke.mjs';
        const source = readFileSync(file, 'utf8');

        expect(source).toMatch(/from '\.\.\/lib\/smoke-test-helpers\.mjs'/);
        expect(source).toMatch(/addScriptTagWithCspFallback\(\s*page,\s*SCRIPT_PATH\s*\)/);
        expect([...source.matchAll(/yomu-[a-z\d-]+\.user\.js/g)].map(match => match[0]))
            .toEqual([]);
    });

    it('resolves every @require line in the built userscript to a file on disk', () => {
        if (!existsSync(BUILT_USERSCRIPT)) return;
        const header = readFileSync(BUILT_USERSCRIPT, 'utf8');
        const requireLines = header.split(/\r?\n/u)
            .filter(line => /^\/\/ @require https:\/\/yomureader\.com\/greasyfork\//.test(line));
        const resolved = userscriptCompanionPaths(BUILT_USERSCRIPT);

        expect(resolved.length).toBe(requireLines.length);
        expect(resolved.filter(companionPath => !existsSync(companionPath))).toEqual([]);
    });

    it('pins the built @require header to the manifest libraries flagged for it', () => {
        if (!existsSync(BUILT_USERSCRIPT)) return;
        const expected = GREASY_FORK_LIBRARIES
            .filter(library => library.userscriptRequire === true)
            .map(library => library.fileName.replace(/\.user\.js$/u, ''));

        expect(userscriptCompanionPaths(BUILT_USERSCRIPT)
            .map(companionPath => path.basename(companionPath).replace(/(?:\.[a-f\d]{12})?\.user\.js$/u, '')))
            .toEqual(expected);
    });
});
