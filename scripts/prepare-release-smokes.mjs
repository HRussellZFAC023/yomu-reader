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
const artifacts = path.join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const saved = mkdtempSync(path.join(artifacts, 'release-smoke-build-'));
const companions = path.join(dist, 'greasyfork');
const hadCompanions = existsSync(companions);
if (hadCompanions) cpSync(companions, path.join(saved, 'greasyfork'), { recursive: true });
try {
    const result = spawnSync('npm', ['run', 'build:extension'], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Extension build failed (${result.signal ?? result.status})`);
} finally {
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, 'yomu.user.js'), core);
    writeFileSync(path.join(dist, 'yomu.css'), css);
    if (hadCompanions) cpSync(path.join(saved, 'greasyfork'), companions, { recursive: true });
    rmSync(saved, { recursive: true, force: true });
}
console.log('Release smoke artifacts ready: compiled extension and original split userscript graph.');
