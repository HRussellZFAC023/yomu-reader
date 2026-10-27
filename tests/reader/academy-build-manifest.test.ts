import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error Node build helper is exercised directly by sync.
import { academyBuildManifest, academyBuildSources, academyHostedCounterpart, renderAcademyTemplate, academyBuildCode, academyBuildFile, academyProofTemplate, academyEmittedFilesMatch } from '../../scripts/lib/academy-build-manifest.cjs';
import { join } from "node:path";
// @ts-expect-error The revision helper is a Node CommonJS module.
import academyRevisionModule from "../../scripts/lib/academy-revision.cjs";

function manifest() {
    return {
        'src/academy/entrypoint.ts': { file: 'app.js', isEntry: true, imports: ['shared'], dynamicImports: ['study'], css: ['assets/shell-a.css'] },
        shared: { file: 'chunks/shared-a.js', css: ['assets/shared-a.css'] },
        study: { file: 'chunks/study-a.js', imports: ['shared'], dynamicImports: ['settings'], css: ['assets/study-a.css'], assets: ['assets/icon-a.svg'] },
        settings: { file: 'chunks/settings-a.js' },
    };
}

describe('Academy emitted asset manifest', () => {
    it('requires complete runtime payloads even when templates and emitted assets match', () => {
        const sources = [['public/academy/art', 'art'], ['public/academy/audio/catalog.json', 'audio/catalog.json']];
        const payloads: Record<string, Buffer> = { 'art/ASSET-USAGE.json': Buffer.from('usage'), 'art/portrait.webp': Buffer.from('image'), 'audio/catalog.json': Buffer.from('catalog') };
        const entries = function* (source: string) {
            if (source.endsWith('/art')) {
                yield [source + '/ASSET-USAGE.json', Buffer.from('usage')];
                yield [source + '/portrait.webp', Buffer.from('image')];
            } else yield [source, Buffer.from('catalog')];
        };
        const matches = () => academyRevisionModule.academyRuntimeDeliveryMatches(sources, entries, (file: string) => payloads[file] ?? null);
        expect(matches()).toBe(true);
        delete payloads['art/portrait.webp'];
        expect(matches()).toBe(false);
        payloads['art/portrait.webp'] = Buffer.from('image');
        payloads['audio/catalog.json'] = Buffer.from('damaged');
        expect(matches()).toBe(false);
    });

    it('does not trust a stale sync marker when a lazy chunk or stylesheet is missing or truncated', () => {
        const original = Object.fromEntries(['manifest.json', ...academyBuildManifest(manifest()).files].map((file: string) => [file, Buffer.from(`complete:${file}`)]));
        const hosted = { ...original };
        const matches = () => academyEmittedFilesMatch(manifest(), (file: string) => original[file] ?? null, (file: string) => hosted[file] ?? null);
        expect(matches()).toBe(true);
        delete hosted['chunks/study-a.js'];
        expect(matches()).toBe(false);
        hosted['chunks/study-a.js'] = original['chunks/study-a.js'];
        hosted['assets/study-a.css'] = Buffer.from('truncated');
        expect(matches()).toBe(false);
    });

    it('inspects deferred code and fails when a referenced file is missing', () => {
        const files: Record<string, string> = {
            'manifest.json': JSON.stringify(manifest()), 'app.js': 'entry shim',
            'chunks/shared-a.js': 'shared implementation', 'chunks/study-a.js': 'deferred marker', 'chunks/settings-a.js': 'settings implementation',
        };
        expect(academyBuildCode((file: string) => files[file] ?? null)).toContain('deferred marker');
        delete files['chunks/study-a.js'];
        expect(() => academyBuildCode((file: string) => files[file] ?? null)).toThrow('Missing Academy emitted code');
        expect(() => academyBuildCode((file: string) => file === 'app.js' ? 'old monolith' : null)).toThrow();
        expect(academyBuildCode((file: string) => file === 'app.js' ? 'old monolith' : null, true)).toBe('old monolith');
    });

    it('serves isolated proof templates and every emitted chunk from the selected build', () => {
        mkdirSync('artifacts', { recursive: true });
        const fixture = mkdtempSync(path.resolve('artifacts/academy-server-proof-'));
        try {
            const graph = academyBuildManifest(manifest());
            writeFileSync(path.join(fixture, 'manifest.json'), JSON.stringify(manifest()));
            for (const file of graph.files) {
                mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
                writeFileSync(path.join(fixture, file), `body:${file}`);
            }
            const source = path.join(fixture, 'templates');
            mkdirSync(source);
            writeFileSync(path.join(source, 'index.html'), '<!--__ACADEMY_ENTRY_STYLES__--><script type="module" src="__ACADEMY_ENTRY_URL__"></script>');
            writeFileSync(path.join(source, 'sw.js'), 'const code = __ACADEMY_CODE_ASSETS__;');
            expect(academyBuildFile(fixture, '/academy/chunks/settings-a.js')).toBe(path.join(fixture, 'chunks/settings-a.js'));
            expect(academyBuildFile(fixture, '/academy/chunks/absent.js')).toBeNull();
            expect(academyProofTemplate(fixture, source, '/academy/').body).toContain('src="/academy/app.js?v=s1-');
            expect(academyProofTemplate(fixture, source, '/academy/').body).not.toContain('study-a.css');
            expect(academyProofTemplate(fixture, source, '/academy/sw.js').body).toContain('/academy/assets/study-a.css');
        } finally { rmSync(fixture, { recursive: true, force: true }); }
    });

    it('includes all nested lazy dependencies and styles but only eager styles in HTML', () => {
        const result = academyBuildManifest(manifest());
        expect(result.files).toEqual(['app.js', 'assets/icon-a.svg', 'assets/shared-a.css', 'assets/shell-a.css', 'assets/study-a.css', 'chunks/settings-a.js', 'chunks/shared-a.js', 'chunks/study-a.js']);
        expect(result.initialStyles).toEqual(['assets/shared-a.css', 'assets/shell-a.css']);
        const html = renderAcademyTemplate('<meta content="__ACADEMY_REVISION__"><!--__ACADEMY_ENTRY_STYLES__--><script type="module" src="__ACADEMY_ENTRY_URL__"></script>', 's1-test', manifest());
        expect(html).toContain('src="/academy/app.js?v=s1-test"');
        expect(html).toContain('/academy/assets/shared-a.css');
        expect(html).not.toContain('study-a.css');
        const worker = renderAcademyTemplate('const assets = __ACADEMY_CODE_ASSETS__;', 's1-test', manifest());
        expect(worker).toContain('/academy/chunks/settings-a.js');
        expect(worker).toContain('/academy/assets/study-a.css');
        expect(worker).toContain('/academy/manifest.json?v=s1-test');
    });

    it('fails closed for missing dependencies or escaping asset paths', () => {
        const missing = manifest();
        missing.study.dynamicImports = ['absent'];
        expect(() => academyBuildManifest(missing)).toThrow('Missing Academy manifest dependency');
        for (const file of ['../private.js', '/outside.js', 'https://elsewhere/app.js', 'chunks/../app.js']) {
            const unsafe = manifest();
            unsafe.study.file = file;
            expect(() => academyBuildManifest(unsafe)).toThrow('Invalid Academy emitted asset path');
        }
    });

    it('copies and hashes the same manifest-derived files, including future chunk names', () => {
        const sources = academyBuildSources(() => manifest());
        expect(sources).toContainEqual(['dist/academy/manifest.json', 'manifest.json']);
        expect(sources).toContainEqual(['dist/academy/chunks/settings-a.js', 'chunks/settings-a.js']);
        for (const [source, target] of sources) expect(academyHostedCounterpart(source)).toBe(`docs/public/academy/${target}`);
    });

    it('refuses to replace an existing sync destination when an emitted asset is missing', () => {
        mkdirSync('artifacts', { recursive: true });
        const fixture = mkdtempSync(path.resolve('artifacts/academy-sync-proof-'));
        try {
            const build = path.join(fixture, 'build');
            const destination = path.join(fixture, 'hosted');
            mkdirSync(build);
            mkdirSync(destination);
            writeFileSync(path.join(build, 'manifest.json'), JSON.stringify(manifest()));
            writeFileSync(path.join(build, 'app.js'), 'entry');
            writeFileSync(path.join(destination, 'keep.txt'), 'previous usable build');
            const result = spawnSync(process.execPath, ['scripts/sync-academy.cjs'], {
                encoding: 'utf8', env: { ...process.env, YOMU_ACADEMY_BUILD_DIR: build, YOMU_ACADEMY_OUTPUT_DIR: destination },
            });
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain('Missing Academy runtime file: dist/academy/');
            expect(readFileSync(path.join(destination, 'keep.txt'), 'utf8')).toBe('previous usable build');
        } finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });
});

describe("academy revision", () => {
    // The hosted Academy shell busts its cache with a revision hashed from the
    // bytes it publishes. Nothing verified that number until scripts/check-committed
    // -artifacts.mjs learned to recompute it from the commit, and recomputing it is
    // only possible because every input has a committed counterpart -- the property
    // these tests pin, since it is one careless entry in the source list away from
    // being false again.






    const {
        HOSTED_DEPENDENCIES,
        REVISION_PATTERN,
        TEMPLATES,
        academyRevision,
        academyRevisionSourcePaths,
    } = academyRevisionModule as {
        HOSTED_DEPENDENCIES: string[];
        REVISION_PATTERN: RegExp;
        TEMPLATES: [string, string][];
        academyRevision: (sourcePaths: string[], entries: (source: string) => Iterable<[string, Buffer]>) => string;
        academyRevisionSourcePaths: (readJson: (path: string) => unknown) => string[];
    };

    const REPOSITORY_ROOT = process.cwd();

    // The source list is built from the two voice catalogs; which revision of them
    // is irrelevant here, so read the checked-out copy rather than shelling to git.
    function readJson(path: string): unknown {
        if (path === 'dist/academy/manifest.json') return {
            'src/academy/entrypoint.ts': { file: 'app.js', isEntry: true, dynamicImports: ['study'], css: ['assets/shell-abc.css'] },
            study: { file: 'chunks/study-abc.js', css: ['assets/study-abc.css'] },
        };
        return JSON.parse(readFileSync(join(REPOSITORY_ROOT, path), 'utf8'));
    }

    /** Hash a source set from a fixture, one file per source. */
    function revisionOf(bytesBySource: Record<string, string>): string {
        const sources = Object.keys(bytesBySource).sort();
        return academyRevision(sources, source => [[source, Buffer.from(bytesBySource[source])]]);
    }

    describe('academy revision source set', () => {
        it('can be recomputed from committed bytes alone', () => {
            // THE reproducibility invariant. dist/ is not in git, so any source
            // that lives there must name the committed file the sync copies it to;
            // otherwise check:artifacts would have to rebuild to check the stamp,
            // and a rebuild on a different dependency tree computes a different
            // number -- exactly the confusion that made this revision look
            // unverifiable.
            const withoutCommittedBytes = academyRevisionSourcePaths(readJson).filter(source => {
                if (academyHostedCounterpart(source) !== source) return false;
                return !source.startsWith('public/') && !source.startsWith('docs/public/');
            });

            expect(withoutCommittedBytes).toEqual([]);
        });

        it('names every counterpart under the hosted Academy route the sync writes', () => {
            // The counterpart has to be the file the sync copies the source to, or
            // the recomputed hash reads bytes that were never published.
            for (const source of academyRevisionSourcePaths(readJson).filter(source => source.startsWith('dist/academy/'))) {
                const counterpart = academyHostedCounterpart(source);
                expect(source.startsWith('dist/academy/')).toBe(true);
                expect(counterpart).toBe(source.replace('dist/academy/', 'docs/public/academy/'));
            }
        });

        it('hashes the canonical hosted runtime graph the shell loads', () => {
            // A student on a cached shell against a new runtime graph is the bug
            // this half of the source set exists to prevent.
            const sources = academyRevisionSourcePaths(readJson);

            for (const dependency of HOSTED_DEPENDENCIES) expect(sources).toContain(dependency);
            expect(sources).toEqual([...sources].sort());
            expect(sources).toContain('dist/academy/manifest.json');
            expect(sources).toContain('dist/academy/chunks/study-abc.js');
            expect(sources).toContain('dist/academy/assets/study-abc.css');
        });

        it('renders both cache-busting templates', () => {
            expect(TEMPLATES.map(([, target]) => target)).toEqual(['index.html', 'sw.js']);
        });
    });

    describe('academy revision digest', () => {
        it('is a short prefixed sha256, which is what the templates match on', () => {
            const revision = revisionOf({ 'dist/academy/app.js': 'bundle' });

            expect(revision).toMatch(new RegExp(`^${REVISION_PATTERN.source}$`));
        });

        it('moves when any published byte moves', () => {
            const before = revisionOf({ 'dist/academy/app.js': 'bundle', 'docs/public/yomu.css': 'a{}' });
            const after = revisionOf({ 'dist/academy/app.js': 'bundle', 'docs/public/yomu.css': 'a{ }' });

            expect(after).not.toBe(before);
        });

        it('moves when a file is renamed but its bytes are not', () => {
            // Paths are hashed alongside contents, so a moved asset still busts the
            // cache even though every byte it contains is unchanged.
            const before = revisionOf({ 'public/academy/art/a.png': 'pixels' });
            const after = revisionOf({ 'public/academy/art/b.png': 'pixels' });

            expect(after).not.toBe(before);
        });

        it('does not confuse a source boundary, so two files cannot swap bytes unnoticed', () => {
            const before = revisionOf({ 'public/academy/a.json': '12', 'public/academy/b.json': '3' });
            const after = revisionOf({ 'public/academy/a.json': '1', 'public/academy/b.json': '23' });

            expect(after).not.toBe(before);
        });

        it('computes the formula the committed shells were stamped with', () => {
            // A frozen vector, because this digest is not free to change: every
            // revision already stamped into a committed index.html and sw.js was
            // produced by this exact byte layout (label, NUL, contents, NUL), and
            // the gate compares recomputed numbers against those. Change the
            // formula and every hosted shell in git reads as stale.
            expect(revisionOf({ 'public/academy/a.json': '12', 'public/academy/b.json': '3' })).toBe('s1-b07ff61202b9');
        });
    });
});
