#!/usr/bin/env node
// Extension packaging builds a self-contained core and empties dist/. Preserve
// the already-built split graph so the release smoke tests the install artifact.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const core = readFileSync(path.join(dist, 'yomu.user.js'));
if (!/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\//m.test(core.toString())) {
    throw new Error('Build the split userscript first: npm run build');
}
const css = readFileSync(path.join(dist, 'yomu.css'));
// The gate build deliberately leaves Study templates to hosted sync. Assemble
// them before packaging, including on a fresh standalone npm run build.
const sync = spawnSync(process.execPath, ['scripts/sync-docs-userscript.cjs'], { cwd: root, stdio: 'inherit' });
if (sync.error) throw sync.error;
if (sync.status !== 0) throw new Error(`Hosted sync failed (${sync.signal ?? sync.status})`);
const artifacts = path.join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const saved = mkdtempSync(path.join(artifacts, 'release-smoke-build-'));
const directories = ['greasyfork', 'newtab', 'academy'].filter(name => existsSync(path.join(dist, name)));
for (const name of directories) cpSync(path.join(dist, name), path.join(saved, name), { recursive: true });
try {
    const result = spawnSync('npm', ['run', 'build:extension'], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Extension build failed (${result.signal ?? result.status})`);
} finally {
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, 'yomu.user.js'), core);
    writeFileSync(path.join(dist, 'yomu.css'), css);
    for (const name of directories) {
        rmSync(path.join(dist, name), { recursive: true, force: true });
        cpSync(path.join(saved, name), path.join(dist, name), { recursive: true });
    }
    rmSync(saved, { recursive: true, force: true });
}
console.log('Release smoke artifacts ready: compiled extension and original split userscript graph.');
