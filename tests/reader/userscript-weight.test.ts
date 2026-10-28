import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { userscriptWeightReport } = require('../../scripts/lib/userscript-weight.cjs') as {
    userscriptWeightReport: (root: string) => {
        files: Array<{ relativePath: string; bytes: number }>;
        totalBytes: number;
        maxInjectedBytes: number;
        previousMaxInjectedBytes: number | null;
    };
};

const repositories: string[] = [];

afterEach(() => {
    for (const repository of repositories.splice(0)) rmSync(repository, { recursive: true, force: true });
});

function write(root: string, path: string, contents: string): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
}

function repository(budget: number): string {
    const root = mkdtempSync(join(tmpdir(), 'yomu-weight-'));
    repositories.push(root);
    write(root, 'dist/yomu.user.js', `// ==UserScript==
// @require https://yomureader.com/greasyfork/yomu-runtime.0123456789ab.user.js#sha256=fake
// ==/UserScript==
core
`);
    write(root, 'dist/greasyfork/yomu-runtime.user.js', 'runtime');
    write(root, 'config/ci/userscript-weight.json', JSON.stringify({ maxInjectedBytes: budget }));
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.name', 'weight test');
    git(root, 'config', 'user.email', 'weight@example.test');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'baseline');
    return root;
}

function git(root: string, ...args: string[]): void {
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
}

describe('injected userscript weight', () => {
    it('counts the core and every unconditional required file', () => {
        const root = repository(10_000);
        const report = userscriptWeightReport(root);

        expect(report.files.map(file => file.relativePath)).toEqual([
            'dist/yomu.user.js',
            'dist/greasyfork/yomu-runtime.user.js',
        ]);
        expect(report.totalBytes).toBe(
            Buffer.byteLength('// ==UserScript==\n// @require https://yomureader.com/greasyfork/yomu-runtime.0123456789ab.user.js#sha256=fake\n// ==/UserScript==\ncore\n')
            + Buffer.byteLength('runtime'),
        );
    });

    it('rejects an unconditional dependency the local gate cannot measure', () => {
        const root = repository(10_000);
        write(root, 'dist/yomu.user.js', `// ==UserScript==
// @require https://cdn.example.test/hidden.js
// ==/UserScript==
`);

        expect(() => userscriptWeightReport(root)).toThrow('Cannot measure unconditional @require');
    });

    it('exposes the lower historical ceiling so the CLI can reject budget increases', () => {
        const root = repository(10_000);
        write(root, 'config/ci/userscript-weight.json', JSON.stringify({ maxInjectedBytes: 11_000 }));

        const report = userscriptWeightReport(root);

        expect(report.maxInjectedBytes).toBe(11_000);
        expect(report.previousMaxInjectedBytes).toBe(10_000);
    });
});
