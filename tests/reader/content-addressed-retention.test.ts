import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { RELEASE_RETENTION_COUNT, SUPPORTED_RELEASE_REFS, contentAddressedRetentionManifest, contentAddressedRetentionReport, isShallowRepository, pinnedArtifactPaths, retentionManifestIsCurrent, retentionManifestShortfall } from '../../scripts/lib/content-addressed-retention.mjs';

const repositories: string[] = [];

afterEach(() => {
    for (const repository of repositories.splice(0)) rmSync(repository, { recursive: true, force: true });
});

function header(companionHash: string, cssHash: string): string {
    return `// ==UserScript==
// @require https://yomureader.com/greasyfork/yomu-runtime.${companionHash}.user.js#sha256=fake
// @resource yomuCss https://yomureader.com/yomu.${cssHash}.css#sha256=fake
// ==/UserScript==
`;
}

function write(root: string, path: string, contents = 'artifact\n'): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
}

function git(root: string, ...args: string[]): void {
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
}

function repository(): string {
    const root = mkdtempSync(join(tmpdir(), 'yomu-retention-'));
    repositories.push(root);
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.name', 'retention test');
    git(root, 'config', 'user.email', 'retention@example.test');

    const storeHeader = header('111111111111', '222222222222');
    write(root, 'dist/yomu.user.js', storeHeader);
    write(root, 'docs/public/yomu.user.js', storeHeader);
    write(root, 'docs/public/greasyfork/yomu-runtime.111111111111.user.js');
    write(root, 'docs/public/yomu.222222222222.css');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'store release');
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v1.8.2');

    const currentHeader = header('333333333333', '444444444444');
    write(root, 'dist/yomu.user.js', currentHeader);
    write(root, 'docs/public/yomu.user.js', currentHeader);
    write(root, 'docs/public/greasyfork/yomu-runtime.333333333333.user.js');
    write(root, 'docs/public/yomu.444444444444.css');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'current release');
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v1.8.43');
    return root;
}

describe('content-addressed artifact retention', () => {
    it('extracts immutable companion and stylesheet pins from a userscript header', () => {
        expect([...pinnedArtifactPaths(header('abcdef123456', '654321fedcba'))]).toEqual([
            'docs/public/greasyfork/yomu-runtime.abcdef123456.user.js',
            'docs/public/yomu.654321fedcba.css',
        ]);
    });

    it('keeps current, recent-release, and frozen-store pins while reporting unrelated files', () => {
        const root = repository();
        write(root, 'docs/public/greasyfork/yomu-runtime.aaaaaaaaaaaa.user.js', 'stale companion\n');
        write(root, 'docs/public/yomu.bbbbbbbbbbbb.css', 'stale css\n');

        const report = contentAddressedRetentionReport(root);

        expect(report.missing).toEqual([]);
        expect(report.retained).toEqual([
            'docs/public/greasyfork/yomu-runtime.111111111111.user.js',
            'docs/public/greasyfork/yomu-runtime.333333333333.user.js',
            'docs/public/yomu.222222222222.css',
            'docs/public/yomu.444444444444.css',
        ]);
        expect(report.stale).toEqual([
            'docs/public/greasyfork/yomu-runtime.aaaaaaaaaaaa.user.js',
            'docs/public/yomu.bbbbbbbbbbbb.css',
        ]);
    });

    it('fails closed when a supported header pins a file that is absent', () => {
        const root = repository();
        rmSync(join(root, 'docs/public/yomu.222222222222.css'));

        expect(contentAddressedRetentionReport(root).missing).toEqual([
            'docs/public/yomu.222222222222.css',
        ]);
    });

    // This used to assert `toContain('v1.8.2')`, which froze a measurement into a
    // test: the pin stayed on 1.8.2 for ~70 patch releases because the repo believed
    // only a `v*.*.0` tag can publish to a browser store. `release.yml`'s
    // `publish_browser_stores` input publishes patch builds too, and it did — AMO
    // serves 1.8.72 and the Chrome Web Store 1.8.71 (measured 2026-08-04). So assert
    // the SHAPE of the pin plus the floor we measured, and name the debunked value so
    // it cannot come back silently.
    it('documents a week-sized release window and pins the published store builds', () => {
        expect(RELEASE_RETENTION_COUNT).toBe(40);
        expect(SUPPORTED_RELEASE_REFS.length).toBeGreaterThan(0);
        for (const ref of SUPPORTED_RELEASE_REFS) expect(ref).toMatch(/^v\d+\.\d+\.\d+$/);
        expect(SUPPORTED_RELEASE_REFS).not.toContain('v1.8.2');
        expect(SUPPORTED_RELEASE_REFS).toEqual(['v1.8.88']);
    });

    // The gate used to demand byte equality with a freshly computed manifest, so every
    // release shifted the tag window, the committed file stopped matching, and
    // check:release went red at its second stage for everyone (A43). The two
    // directions are not symmetric, and only one of them is dangerous.
    it('tolerates a manifest that retains more than history still pins', () => {
        const source = repository();
        const manifest = contentAddressedRetentionManifest(source);
        const generous = {
            ...manifest,
            retainedPaths: [...manifest.retainedPaths, 'docs/public/greasyfork/yomu-anki.deadbeef0000.user.js'].sort(),
        };
        write(source, 'config/ci/content-addressed-retention.json', `${JSON.stringify(generous, null, 2)}\n`);
        git(source, 'add', '.');
        git(source, 'commit', '--quiet', '-m', 'generous retention manifest');

        // Harmless: a shallow checkout simply retains one path longer than needed,
        // which is exactly what a release leaves behind as a tag ages out.
        const shortfall = retentionManifestShortfall(source);
        expect(shortfall.ok).toBe(true);
        expect(shortfall.missingFromManifest).toEqual([]);
        expect(shortfall.extraInManifest).toEqual(['docs/public/greasyfork/yomu-anki.deadbeef0000.user.js']);
        expect(retentionManifestIsCurrent(source)).toBe(true);
    });

    it('fails when the manifest omits an artifact history still pins', () => {
        const source = repository();
        const manifest = contentAddressedRetentionManifest(source);
        expect(manifest.retainedPaths.length).toBeGreaterThan(0);
        const [dropped, ...kept] = manifest.retainedPaths;
        write(source, 'config/ci/content-addressed-retention.json', `${JSON.stringify({ ...manifest, retainedPaths: kept }, null, 2)}\n`);
        git(source, 'add', '.');
        git(source, 'commit', '--quiet', '-m', 'short retention manifest');

        // Dangerous: a shallow checkout would prune an artifact a published userscript
        // still pins by hash, which 404s its @require for everyone on that version.
        const shortfall = retentionManifestShortfall(source);
        expect(shortfall.ok).toBe(false);
        expect(shortfall.missingFromManifest).toEqual([dropped]);
        expect(retentionManifestIsCurrent(source)).toBe(false);
    });

    it('uses the committed retention manifest when CI checks out one shallow commit', () => {
        const source = repository();
        const manifest = contentAddressedRetentionManifest(source);
        write(source, 'config/ci/content-addressed-retention.json', `${JSON.stringify(manifest, null, 2)}\n`);
        git(source, 'add', '.');
        git(source, 'commit', '--quiet', '-m', 'retention manifest');
        expect(retentionManifestIsCurrent(source)).toBe(true);

        const clone = mkdtempSync(join(tmpdir(), 'yomu-retention-shallow-'));
        repositories.push(clone);
        execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${source}`, clone], { stdio: 'pipe' });

        expect(isShallowRepository(clone)).toBe(true);
        const report = contentAddressedRetentionReport(clone);
        expect(report.missing).toEqual([]);
        expect(report.stale).toEqual([]);
        expect(report.retained).toEqual(manifest.retainedPaths);
    });
});
