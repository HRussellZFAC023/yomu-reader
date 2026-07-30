import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { RELEASE_RETENTION_COUNT, SUPPORTED_RELEASE_REFS, contentAddressedRetentionReport, pinnedArtifactPaths } from '../../scripts/lib/content-addressed-retention.mjs';

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

    it('documents a week-sized release window and the frozen store version', () => {
        expect(RELEASE_RETENTION_COUNT).toBe(40);
        expect(SUPPORTED_RELEASE_REFS).toContain('v1.8.2');
    });
});
