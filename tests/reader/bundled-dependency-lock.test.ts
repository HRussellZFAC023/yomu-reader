import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireCjs = createRequire(import.meta.url);
const { collectBundledDependencyDrift, formatBundledDependencyDrift } = requireCjs('../../scripts/lib/bundled-dependency-lock.cjs') as {
    collectBundledDependencyDrift: (
        dependencies: Record<string, string> | undefined,
        lockPackages: Record<string, { version?: string }>,
        readInstalledVersion: (name: string) => string | null,
    ) => { name: string; locked: string; installed: string | null }[];
    formatBundledDependencyDrift: (drift: { name: string; locked: string; installed: string | null }[]) => string;
};

const readJson = (relativePath: string) => JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));

describe('bundled dependency lock', () => {
    it('reports a bundled dependency whose installed copy drifts from the lock', () => {
        const drift = collectBundledDependencyDrift(
            { fflate: '^0.8.2', aws4fetch: '^1.0.20' },
            { 'node_modules/fflate': { version: '0.8.2' }, 'node_modules/aws4fetch': { version: '1.0.20' } },
            name => (name === 'fflate' ? '0.8.3' : '1.0.20'),
        );
        expect(drift).toEqual([{ name: 'fflate', locked: '0.8.2', installed: '0.8.3' }]);
        expect(formatBundledDependencyDrift(drift)).toContain('package-lock.json pins 0.8.2, node_modules has 0.8.3');
        expect(formatBundledDependencyDrift(drift)).toContain('npm ci');
    });

    it('stays silent when every bundled dependency matches the lock', () => {
        const drift = collectBundledDependencyDrift(
            { fflate: '^0.8.2' },
            { 'node_modules/fflate': { version: '0.8.2' } },
            () => '0.8.2',
        );
        expect(drift).toEqual([]);
    });

    it('reports a bundled dependency that is not installed at all', () => {
        const drift = collectBundledDependencyDrift(
            { fflate: '^0.8.2' },
            { 'node_modules/fflate': { version: '0.8.2' } },
            () => null,
        );
        expect(drift).toEqual([{ name: 'fflate', locked: '0.8.2', installed: null }]);
        expect(formatBundledDependencyDrift(drift)).toContain('no installed copy');
    });

    // The guard is only worth having if it is true of this checkout right now.
    it('finds no drift in the installed tree', () => {
        const packageJson = readJson('package.json');
        const lockPackages = readJson('package-lock.json').packages ?? {};
        const drift = collectBundledDependencyDrift(packageJson.dependencies, lockPackages, name => {
            try {
                return readJson(path.join('node_modules', name, 'package.json')).version ?? null;
            } catch {
                return null;
            }
        });
        expect(drift, formatBundledDependencyDrift(drift)).toEqual([]);
    });
});

describe('study version.json', () => {
    // A committed artifact may only contain build-derived fields. A wall-clock
    // stamp here rewrote the file on every build and made the repository dirty
    // after any rebuild.
    it('carries only fields derived from the build', () => {
        const version = readJson('docs/public/study/version.json');
        expect(Object.keys(version).sort()).toEqual(['appHash', 'buildId']);
        expect(version.buildId).toContain(version.appHash);
    });

    it('is written without a timestamp by both writers', () => {
        for (const writer of ['scripts/sync-docs-userscript.cjs', 'scripts/build-extension.mjs']) {
            const source = readFileSync(path.join(ROOT, writer), 'utf8');
            const versionWrite = source.match(/JSON\.stringify\(\{ appHash, buildId[^}]*\}/);
            expect(versionWrite, `${writer} no longer writes a recognisable version.json payload`).toBeTruthy();
            expect(versionWrite?.[0]).not.toContain('generatedAt');
        }
    });
});
