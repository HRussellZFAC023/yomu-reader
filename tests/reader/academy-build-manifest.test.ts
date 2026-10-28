import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error Node build helper is exercised directly by sync.
import { academyBuildManifest, academyBuildSources, academyHostedCounterpart, renderAcademyTemplate, academyBuildCode, academyBuildFile, academyProofTemplate, academyEmittedFilesMatch } from '../../scripts/lib/academy-build-manifest.cjs';

function manifest() {
    return {
        'src/academy/entrypoint.ts': { file: 'app.js', isEntry: true, imports: ['shared'], dynamicImports: ['study'], css: ['assets/shell-a.css'] },
        shared: { file: 'chunks/shared-a.js', css: ['assets/shared-a.css'] },
        study: { file: 'chunks/study-a.js', imports: ['shared'], dynamicImports: ['settings'], css: ['assets/study-a.css'], assets: ['assets/icon-a.svg'] },
        settings: { file: 'chunks/settings-a.js' },
    };
}

describe('Academy emitted asset manifest', () => {
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
