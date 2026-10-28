import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('layout CI assembles hosted Study after build and before its aggregate', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8').split('  layout-smoke:')[1].split('\n  build:')[0];
    assert.match(ci, /npm run build\s+- run: node scripts\/sync-docs-userscript\.cjs\s+- run: npm run smoke:layout-regressions/);
});
for (const state of ['completed success', 'completed failure', 'completed cancelled', '', 'in_progress']) {
    test(`Release CI gate fails closed except successful tagged SHA: ${state || 'absent'}`, t => {
        const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
        const step = workflow.split('      - name: Wait for CI on the tagged commit\n')[1].split('\n      - name:')[0];
        assert.ok(workflow.indexOf('Wait for CI on the tagged commit') < workflow.indexOf('Publish GitHub release'));
        assert.match(workflow, /actions: read/);
        assert.ok(!step.includes('if:'));
        const script = step.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
        const root = mkdtempSync(join(tmpdir(), 'yomu-release-ci-'));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        const bin = (name, source) => { const file = join(root, name); writeFileSync(file, '#!/bin/sh\n' + source); chmodSync(file, 0o755); };
        bin('git', 'echo tagged-sha\n');
        bin('sleep', 'exit 0\n');
        bin('seq', 'printf "1\\n10\\n100\\n"\n');
        bin('gh', 'printf "%s\\n" "$*" >> "$PROBE_ARGS"\nprintf "%s\\n" "$PROBE_STATE"\n');
        const result = spawnSync('bash', ['-e', '-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, GITHUB_SHA: 'dispatch-sha', GITHUB_REPOSITORY: 'owner/repo', PROBE_ARGS: join(root, 'args'), PROBE_STATE: state } });
        assert.equal(result.status, state === 'completed success' ? 0 : 1, result.stderr + result.stdout);
        assert.match(readFileSync(join(root, 'args'), 'utf8'), /--workflow CI --commit tagged-sha --event push/);
    });
}
