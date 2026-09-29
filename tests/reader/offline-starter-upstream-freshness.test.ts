import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');

describe('offline starter upstream freshness', () => {
    it('rejects an authoritative-only entry change in both standalone starter modes without rewriting artifacts', () => {
        const fixture = mkdtempSync(path.join(tmpdir(), 'yomu-starter-freshness-'));
        try {
            const scripts = path.join(fixture, 'scripts', 'dictionaries');
            const published = path.join(fixture, 'config', 'dictionaries', 'published', 'v1');
            mkdirSync(scripts, { recursive: true });
            mkdirSync(published, { recursive: true });
            const script = path.join(scripts, 'build-runtime-catalog.mjs');
            copyFileSync(path.join(root, 'scripts/dictionaries/build-runtime-catalog.mjs'), script);
            const starterScript = path.join(scripts, 'build-offline-starters.mts');
            copyFileSync(path.join(root, 'scripts/dictionaries/build-offline-starters.mts'), starterScript);
            // The fixture isolates the upstream guard from the recommendation
            // implementation. Deriving anything before validation must fail.
            const dictionaries = path.join(fixture, 'src/reader/dictionaries');
            mkdirSync(path.join(dictionaries, 'catalog'), { recursive: true });
            copyFileSync(path.join(root, 'src/reader/dictionaries/offline-starters-catalog.ts'), path.join(dictionaries, 'offline-starters-catalog.ts'));
            writeFileSync(path.join(dictionaries, 'catalog/types.ts'), "export const SLICE1_LEARNER_LANGUAGES = ['en']; export const SLICE1_TARGET_LANGUAGES = ['ja'];");
            writeFileSync(path.join(dictionaries, 'catalog/runtime.ts'), "export const FROZEN_DICTIONARY_CATALOG = { objectsBaseUrl: 'https://example.test/' };");
            writeFileSync(path.join(dictionaries, 'catalog/integrity.ts'), "export function dictionaryObjectKey() { throw new Error('Unexpected projection work'); }");
            writeFileSync(path.join(dictionaries, 'recommended.ts'), [
                'findRecommendedDictionary', 'recommendedDictionariesForLanguageProfile',
                'recommendedDictionaryImportOptions', 'recommendedDictionaryInstalledIdentity',
            ].map(name => `export function ${name}() { throw new Error('Unexpected projection work'); }`).join('\n'));
            const catalog = {
                revision: 'unchanged', objectsBaseUrl: 'https://example.test/',
                entries: [{ id: 'starter', title: 'Before', categories: ['terms'], headwordLanguages: ['ja'], definitionLanguages: ['en'], source: {}, distribution: { state: 'source-only' } }],
            };
            const source = path.join(published, 'catalog.json');
            writeFileSync(source, JSON.stringify(catalog));
            execFileSync(process.execPath, [script]);
            const runtime = path.join(published, 'runtime-catalog.json');
            const before = readFileSync(runtime, 'utf8');
            expect(spawnSync(process.execPath, [script, '--check']).status).toBe(0);
            catalog.entries[0]!.title = 'After';
            writeFileSync(source, JSON.stringify(catalog));
            const checked = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
            expect(checked.status).not.toBe(0);
            expect(checked.stderr).toContain('stale relative to published catalog.json');
            expect(readFileSync(runtime, 'utf8')).toBe(before);
            const starters = path.join(published, 'offline-starters.json');
            writeFileSync(starters, 'unchanged starter projection');
            for (const mode of [[], ['--check']]) {
                const result = spawnSync(path.join(root, 'node_modules/.bin/vite-node'), [starterScript, ...mode], {
                    cwd: fixture, encoding: 'utf8', timeout: 15_000,
                });
                expect(result.status).not.toBe(0);
                expect(result.stderr).toContain('stale relative to published catalog.json');
                expect(readFileSync(starters, 'utf8')).toBe('unchanged starter projection');
                expect(readFileSync(runtime, 'utf8')).toBe(before);
            }
        } finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    }, 40_000);
});
