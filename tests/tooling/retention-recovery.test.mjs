import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { contentAddressedRetentionReport, restoreRetainedArtifactsFromHead } from '../../scripts/lib/content-addressed-retention.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'yomu-retention-undo-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '--quiet');
    git('config', 'user.name', 'Retention test');
    git('config', 'user.email', 'retention@example.test');
    const put = (path, bytes) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), bytes);
    };
    const revision = i => {
        const bytes = `// revision ${i}\n`;
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
        const path = `docs/public/greasyfork/yomu-runtime.${hash}.user.js`;
        const header = `// @require https://yomureader.com/greasyfork/yomu-runtime.${hash}.user.js\n`;
        put(path, bytes);
        put('docs/public/yomu.user.js', header);
        return { path, header, bytes };
    };
    return { root, git, put, revision };
}

test('undoing a header restores its oldest supported pin after a temporary prune', t => {
    const { root, git, put, revision } = fixture(t);
    const releases = [];
    for (let i = 0; i <= 40; i++) {
        const release = revision(i);
        git('add', '--', 'docs/public/yomu.user.js', release.path);
        git('commit', '--quiet', '-m', `Revision ${i}`);
        releases.push(release);
    }
    assert.equal(contentAddressedRetentionReport(root).retained.length, 41);
    revision(41);
    const temporary = contentAddressedRetentionReport(root);
    assert.deepEqual(temporary.stale, [releases[0].path]);
    rmSync(join(root, releases[0].path));
    put('docs/public/yomu.user.js', releases.at(-1).header);
    const undone = contentAddressedRetentionReport(root);
    assert.deepEqual(undone.missing, [releases[0].path], 'read-only reporting remains strict');
    assert.deepEqual(restoreRetainedArtifactsFromHead(root, undone.missing), [releases[0].path]);
    assert.equal(readFileSync(join(root, releases[0].path), 'utf8'), releases[0].bytes);
    assert.deepEqual(contentAddressedRetentionReport(root).missing, []);
});

test('recovery rejects mismatched committed hashes and cannot invent or escape pins', t => {
    const { root, git, put } = fixture(t);
    const invalid = 'docs/public/greasyfork/yomu-runtime.000000000000.user.js';
    put(invalid, 'wrong bytes');
    git('add', '--', invalid);
    git('commit', '--quiet', '-m', 'Mismatched artifact');
    rmSync(join(root, invalid));
    assert.throws(() => restoreRetainedArtifactsFromHead(root, [invalid]), /does not match its content address/);
    assert.equal(existsSync(join(root, invalid)), false);
    assert.deepEqual(restoreRetainedArtifactsFromHead(root, ['docs/public/yomu.111111111111.css']), []);
    assert.throws(() => restoreRetainedArtifactsFromHead(root, ['../outside']), /non-content-addressed/);
});
