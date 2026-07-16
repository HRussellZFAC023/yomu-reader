import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [
    vitest,
    'run',
    '--config', 'config/vite/academy.config.ts',
    'tests/academy/lesson-uniqueness-conformance.test.ts',
], {
    cwd: repoRoot,
    stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
