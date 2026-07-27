// Regression for the 1.8.15 release: yomureader.com/study/ served a 1.8.14
// build because every gate stage that could have noticed regenerated the
// artifacts first. `npm run verify` compared bytes sync-docs-userscript had
// just written, so a stale COMMITTED artifact was invisible.
//
// The guard closes that by asking a question no build step can rewrite: did
// this run change tracked build output? These tests drive it against real git
// repositories, because the whole point is what `git status` reports -- a mock
// would only re-assert the parsing this file exists to pin.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { artifactDrift, describeArtifactDrift, hasUncommittedSourceEdits } from '../../scripts/lib/artifact-drift.mjs';
// @ts-expect-error plain .mjs script module without type declarations
import { offLockfilePackages } from '../../scripts/lib/dependency-tree-drift.mjs';

const repositories: string[] = [];

afterEach(() => {
    for (const repository of repositories.splice(0)) rmSync(repository, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
    execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function write(cwd: string, path: string, contents: string): void {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), contents);
}

/** A repository whose committed artifacts match its committed sources. */
function repositoryShippingCurrentArtifacts(): string {
    const cwd = mkdtempSync(join(tmpdir(), 'yomu-drift-'));
    repositories.push(cwd);
    git(cwd, 'init', '--quiet');
    git(cwd, 'config', 'user.email', 'gate@example.test');
    git(cwd, 'config', 'user.name', 'gate');
    write(cwd, 'src/app.ts', 'export const version = "1.8.15";\n');
    write(cwd, 'docs/public/study/app.js', 'const CURRENT_YOMU_VERSION = "1.8.15";\n');
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '--quiet', '-m', 'release 1.8.15');
    return cwd;
}

/** What the build lane does to that repository on its way through the gate. */
function gateRegeneratesStudyApp(cwd: string): void {
    write(cwd, 'docs/public/study/app.js', 'const CURRENT_YOMU_VERSION = "1.8.15";\n');
}

function verdict(cwd: string, sourceEdits: boolean) {
    return describeArtifactDrift({ drifted: artifactDrift(cwd), sourceEdits });
}

describe('artifact drift guard', () => {
    it('passes when the gate regenerates byte-identical output', () => {
        const cwd = repositoryShippingCurrentArtifacts();

        gateRegeneratesStudyApp(cwd);

        expect(artifactDrift(cwd)).toEqual([]);
        expect(verdict(cwd, hasUncommittedSourceEdits(cwd)).ok).toBe(true);
    });

    it('fails the gate when the committed artifact was stale', () => {
        // The 1.8.15 shape exactly: HEAD carries a previous release's build
        // output, and the gate rewrites it on its way to a green `verify`.
        const cwd = repositoryShippingCurrentArtifacts();
        write(cwd, 'docs/public/study/app.js', 'const CURRENT_YOMU_VERSION = "1.8.14";\n');
        git(cwd, 'commit', '--quiet', '-a', '-m', 'ship a stale Study build');

        const sourceEdits = hasUncommittedSourceEdits(cwd);
        gateRegeneratesStudyApp(cwd);

        expect(artifactDrift(cwd)).toEqual(['docs/public/study/app.js']);
        const { ok, lines } = verdict(cwd, sourceEdits);
        expect(ok).toBe(false);
        expect(lines.join('\n')).toContain('FAIL artifact-drift');
        expect(lines.join('\n')).toContain('docs/public/study/app.js');
    });

    it('stays armed when the gate leaves untracked byproducts of its own', () => {
        // docs:build writes docs/.vitepress/.temp/. While "was the tree clean?"
        // meant "is `git status` empty?", that byproduct made every run after
        // the first look like it had local edits, and the guard downgraded
        // itself from a failure to a note -- disarmed by the pipeline it guards.
        const cwd = repositoryShippingCurrentArtifacts();
        write(cwd, 'docs/public/study/app.js', 'const CURRENT_YOMU_VERSION = "1.8.14";\n');
        git(cwd, 'commit', '--quiet', '-a', '-m', 'ship a stale Study build');
        write(cwd, 'docs/.vitepress/.temp/deps.js', 'scratch\n');
        write(cwd, 'artifacts/check-logs/build.log', 'scratch\n');

        expect(hasUncommittedSourceEdits(cwd)).toBe(false);

        gateRegeneratesStudyApp(cwd);
        expect(verdict(cwd, false).ok).toBe(false);
    });

    it('counts a never-committed companion as drift', () => {
        // Content-addressed companions are NEW files every build, and the
        // userscript header pins them by URL. `git add -u` stages modifications
        // only, so the one it drops is a hard 404 on @require at install time.
        const cwd = repositoryShippingCurrentArtifacts();

        write(cwd, 'docs/public/greasyfork/yomu-anki.bba5ca533489.user.js', '// companion\n');

        expect(artifactDrift(cwd)).toEqual(['docs/public/greasyfork/yomu-anki.bba5ca533489.user.js']);
        expect(verdict(cwd, false).ok).toBe(false);
    });

    it('reports paths to stage instead of failing when the tree has local edits', () => {
        const cwd = repositoryShippingCurrentArtifacts();
        write(cwd, 'src/app.ts', 'export const version = "1.8.16";\n');

        expect(hasUncommittedSourceEdits(cwd)).toBe(true);

        write(cwd, 'docs/public/study/app.js', 'const CURRENT_YOMU_VERSION = "1.8.16";\n');
        const { ok, lines } = verdict(cwd, true);
        expect(ok).toBe(true);
        // Directories, so the staging advice picks up new companions too.
        expect(lines.join('\n')).toContain('docs/public/greasyfork');
    });

    it('says out loud that a dirty-tree run did not enforce the check', () => {
        // A run that reports drift instead of failing on it has tested nothing
        // about HEAD. Said quietly, its PASS gets quoted as evidence the
        // artifacts are current -- which is how "I ran it twice, no drift"
        // survived a second run whose own first run had dirtied the tree.
        const { ok, advisory, lines } = describeArtifactDrift({
            drifted: ['docs/public/study/app.js'],
            sourceEdits: true,
        });

        expect(ok).toBe(true);
        expect(advisory).toBe(true);
        expect(lines.join('\n')).toContain('NOT ENFORCED');
        expect(lines.join('\n')).toContain('clean-tree run');
    });
});

describe('artifact drift against an off-lockfile dependency tree', () => {
    // The stale-HEAD verdict is reached by elimination, so it may only be
    // stated on a machine running the versions package-lock.json pins. On this
    // workstation an fflate 0.8.3 installed against a 0.8.2 pin added one line
    // to every bundle, and the guard called 11 rewritten artifacts proof that
    // HEAD was stale. HEAD was fine.
    function repositoryWithLockfile(pinned: Record<string, string>, installed: Record<string, string>): string {
        const cwd = mkdtempSync(join(tmpdir(), 'yomu-lock-'));
        repositories.push(cwd);
        const packages: Record<string, unknown> = { '': { name: 'yomu', version: '1.8.15' } };
        for (const [name, version] of Object.entries(pinned)) packages[`node_modules/${name}`] = { version };
        write(cwd, 'package-lock.json', JSON.stringify({ lockfileVersion: 3, packages }));
        for (const [name, version] of Object.entries(installed)) {
            write(cwd, `node_modules/${name}/package.json`, JSON.stringify({ name, version }));
        }
        return cwd;
    }

    it('reports a package installed at a version the lockfile does not pin', () => {
        const cwd = repositoryWithLockfile({ fflate: '0.8.2' }, { fflate: '0.8.3' });

        expect(offLockfilePackages(cwd)).toEqual([
            { path: 'node_modules/fflate', pinned: '0.8.2', installed: '0.8.3' },
        ]);
    });

    it('ignores packages that are absent, which is how optional binaries ship', () => {
        // Every platform-specific esbuild/rollup/sharp binary but this one is
        // missing by design. Treating absence as drift would mean the guard
        // never trusted any machine.
        const cwd = repositoryWithLockfile({ fflate: '0.8.2', '@esbuild/win32-x64': '0.25.0' }, { fflate: '0.8.2' });

        expect(offLockfilePackages(cwd)).toEqual([]);
    });

    it('claims nothing when there is no lockfile to compare against', () => {
        const cwd = mkdtempSync(join(tmpdir(), 'yomu-lock-'));
        repositories.push(cwd);

        expect(offLockfilePackages(cwd)).toEqual([]);
    });

    it('blames the dependency tree, not the commit, and withholds the commit advice', () => {
        const { ok, lines } = describeArtifactDrift({
            drifted: ['dist/yomu.user.js', 'docs/public/study/app.js'],
            sourceEdits: false,
            offLockfile: [{ path: 'node_modules/fflate', pinned: '0.8.2', installed: '0.8.3' }],
        });
        const report = lines.join('\n');

        expect(ok).toBe(false);
        expect(report).toContain('FAIL artifact-drift');
        expect(report).toContain('node_modules/fflate: package-lock.json pins 0.8.2, installed is 0.8.3');
        expect(report).toContain('npm ci');
        // The wrong diagnosis and the dangerous instruction that followed it:
        // those bytes came from the wrong toolchain and must not be committed.
        expect(report).not.toContain('HEAD ships stale build output');
        expect(report).not.toContain('Commit the regenerated files');
    });

    it('still names a stale HEAD when the dependency tree does match the lockfile', () => {
        const { ok, lines } = describeArtifactDrift({
            drifted: ['docs/public/study/app.js'],
            sourceEdits: false,
            offLockfile: [],
        });

        expect(ok).toBe(false);
        expect(lines.join('\n')).toContain('HEAD ships stale build output');
    });
});
