import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('installed Vitest related selects changed tests themselves and only tests importing changed source', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'yomu-related-vitest-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, 'vitest.config.mjs'), `export default { test: { globals: true, environment: 'node', include: ['*.test.ts'], pool: 'forks', minWorkers: 1, maxWorkers: 1 } };`);
    writeFileSync(join(root, 'a.ts'), 'export const a = 1;');
    writeFileSync(join(root, 'a.test.ts'), "import { a } from './a'; it('a', () => expect(a).toBe(1));");
    writeFileSync(join(root, 'b.test.ts'), "it('b', () => expect(2).toBe(2));");
    for (const [changed, expected] of [['a.ts', 'a.test.ts'], ['b.test.ts', 'b.test.ts']]) {
        const report = join(root, 'report.json');
        const result = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'related', join(root, changed), '--run', '--config', join(root, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${report}`], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.ok(existsSync(report), `${result.stdout}\n${result.stderr}`);
        assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')).testResults.map(result => result.name), [join(root, expected)]);
    }
});
