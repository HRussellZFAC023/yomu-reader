#!/usr/bin/env node

import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gamingIconSourceRevision } from './lib/gaming-icon-revision.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const outDir = path.join(appRoot, 'dist-gaming', 'electron');
const rendererOutDir = path.join(appRoot, 'dist-gaming', 'renderer');
const iconDir = path.join(appRoot, 'public', 'app-icons');
const sourceIconPng = path.join(iconDir, 'yomu-gaming-512.png');
const sourceIconIcns = path.join(iconDir, 'yomu-gaming.icns');
const generatedIconPng = path.join(appRoot, 'dist-gaming', 'yomu-icon-512.png');
const generatedIconIcns = path.join(appRoot, 'dist-gaming', 'yomu-icon.icns');
const sourceRevision = gamingIconSourceRevision(readFileSync(path.join(appRoot, 'public', 'yomu-icon.svg'), 'utf8'));
const renderedFrom = readRenderedFrom();

// Checked before anything is written: a build that bails after wiping dist-gaming
// leaves an app that still launches and silently has no icon at all.
assertAppIcon(sourceIconPng);
assertAppIcon(sourceIconIcns);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const shared = {
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
};

await Promise.all([
    build({
        ...shared,
        entryPoints: [path.join(appRoot, 'src/gaming/main.ts')],
        outfile: path.join(outDir, 'main.cjs'),
    }),
    build({
        ...shared,
        entryPoints: [path.join(appRoot, 'src/gaming/preload.ts')],
        outfile: path.join(outDir, 'preload.cjs'),
    }),
]);

mkdirSync(path.dirname(generatedIconPng), { recursive: true });
copyFileSync(sourceIconPng, generatedIconPng);
copyFileSync(sourceIconIcns, generatedIconIcns);
// Next to the bundled main process, so main.ts resolves it off __dirname both from
// dist-gaming/electron and from inside the packaged app.asar.
copyFileSync(generatedIconPng, path.join(outDir, 'yomu-icon-512.png'));
mkdirSync(rendererOutDir, { recursive: true });
copyFileSync(generatedIconPng, path.join(rendererOutDir, 'yomu-icon-512.png'));

// The icons are rendered from public/yomu-icon.svg and committed, so a build can
// pick up an asset that no longer matches the artwork. Both halves of "the icon is
// wrong" — absent, and silently a revision behind — fail here by name.
function assertAppIcon(source) {
    const name = path.basename(source);
    if (!existsSync(source)) {
        throw new Error(`Missing Yomu Gaming icon ${name}. Run: npm run build:gaming:icon`);
    }
    // iconutil is macOS-only, so a Linux or Windows build cannot refresh the .icns
    // and is not blocked by it — that asset is only consumed packaging for macOS.
    const refreshable = name !== 'yomu-gaming.icns' || process.platform === 'darwin';
    if (refreshable && renderedFrom[name] !== sourceRevision) {
        throw new Error(`Yomu Gaming icon ${name} is older than public/yomu-icon.svg. Run: npm run build:gaming:icon`);
    }
}

function readRenderedFrom() {
    const stamp = path.join(iconDir, 'generated-from.json');
    if (!existsSync(stamp)) return {};
    return JSON.parse(readFileSync(stamp, 'utf8')).renderedFrom ?? {};
}
