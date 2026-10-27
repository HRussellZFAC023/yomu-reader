import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencyInputs } from '../../scripts/lib/dependency-inputs.mjs';
test('docs dependencies include transitive imports, exports, side effects and literal dynamic imports', t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-doc-inputs-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'docs'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'docs/theme.ts'), "import '../src/a'; import('../src/b');");
    writeFileSync(join(root, 'src/a.ts'), "export { c } from './c';");
    writeFileSync(join(root, 'src/b.ts'), "require('./c');");
    writeFileSync(join(root, 'src/c.ts'), 'export const c = 1;');
    writeFileSync(join(root, 'src/unrelated.ts'), 'export const d = 2;');
    assert.deepEqual(dependencyInputs(root, ['docs/theme.ts']), ['docs/theme.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts']);
});
