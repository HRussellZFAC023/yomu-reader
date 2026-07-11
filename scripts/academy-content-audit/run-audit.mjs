// One-command reproducible content audit.
// Runs every extractor + matrix builder + release gates in dependency order and
// writes all machine-readable artifacts to public/academy/content/audit/.
// Read-only w.r.t. product code; only writes under the auditor's owned paths.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const steps = [
  'extract-source-ledger.mjs',
  'extract-content-inventory.mjs',
  'extract-furigana-pitch.mjs',
  'extract-teaching-leak.mjs',
  'build-coverage-matrices.mjs',
  'release-gates.mjs',
];

let failedGates = false;
for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  const r = spawnSync(process.execPath, [join(here, step)], { stdio: 'inherit' });
  if (step === 'release-gates.mjs') { failedGates = r.status !== 0; continue; }
  if (r.status !== 0) { console.error(`\nAudit step failed: ${step}`); process.exit(r.status ?? 1); }
}
console.log(`\nAudit complete. Artifacts in public/academy/content/audit/. Release gates: ${failedGates ? 'BLOCKED' : 'PASS'}.`);
process.exit(0); // orchestrator itself succeeds; gate verdict is in release-gates.json
