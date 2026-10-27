import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { academyIsolatedFiles } from '../../config/vite/academy-test.ts';

test('every Academy module mock owns an isolated realm in local and affected runs', () => {
    const files = readdirSync('tests/academy', { recursive: true }).filter(file => file.endsWith('.test.ts')).map(file => `tests/academy/${file}`);
    const mocks = files.filter(file => /^\s*vi\.mock\(/m.test(readFileSync(file, 'utf8'))).sort();
    assert.deepEqual([...academyIsolatedFiles].sort(), mocks);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const isolatedCommand = pkg.scripts['test:academy'].split('&&')[1];
    assert.match(isolatedCommand, /VITEST_ISOLATE=1/);
    for (const file of mocks) assert.ok(isolatedCommand.includes(file), file);
    assert.match(readFileSync('config/vite/academy.config.ts', 'utf8'), /configDefaults\.exclude, \.\.\.academyIsolatedFiles/);
    assert.match(readFileSync('scripts/run-affected-tests.mjs', 'utf8'), /new Set\(academyIsolatedFiles\)/);
});
