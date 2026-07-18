#!/usr/bin/env node
// Times every stage of `npm run check` individually and writes a JSON + markdown
// report. Usage: node scripts/measure-check.mjs [--out artifacts/check-baseline.json]
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.indexOf('--out');
const outPath = outArg > -1 ? process.argv[outArg + 1] : 'artifacts/check-baseline.json';

const STAGES = [
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['test:ci', ['npm', 'run', 'test:ci']],
  ['test:academy', ['npm', 'run', 'test:academy']],
  ['build', ['npm', 'run', 'build']],
  ['sync-docs-userscript', ['node', 'scripts/sync-docs-userscript.cjs']],
  ['build:academy', ['npm', 'run', 'build:academy']],
  ['docs:build', ['npm', 'run', 'docs:build']],
  ['verify', ['npm', 'run', 'verify']],
];

const results = [];
for (const [name, cmd] of STAGES) {
  const start = Date.now();
  console.log(`\n===== [measure] stage: ${name} =====`);
  const res = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: 'inherit', env: process.env });
  const seconds = (Date.now() - start) / 1000;
  results.push({ name, seconds: Math.round(seconds * 10) / 10, status: res.status ?? 1 });
  console.log(`===== [measure] ${name}: ${seconds.toFixed(1)}s (exit ${res.status}) =====`);
  if (res.status !== 0) break;
}

const total = results.reduce((sum, r) => sum + r.seconds, 0);
mkdirSync(dirname(join(ROOT, outPath)), { recursive: true });
writeFileSync(join(ROOT, outPath), JSON.stringify({ when: new Date().toISOString(), total, results }, null, 2));
console.log(`\n[measure] total ${total.toFixed(1)}s -> ${outPath}`);
process.exit(results.some(r => r.status !== 0) ? 1 : 0);
