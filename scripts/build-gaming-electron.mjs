#!/usr/bin/env node

import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const outDir = path.join(appRoot, 'dist-gaming', 'electron');
const rendererOutDir = path.join(appRoot, 'dist-gaming', 'renderer');
const sourceIconPng = path.join(appRoot, 'public', 'app-icons', 'yomu-gaming-512.png');
const generatedIconPng = path.join(appRoot, 'dist-gaming', 'yomu-icon-512.png');

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
copyAppIcon(sourceIconPng, generatedIconPng);
copyFileSync(generatedIconPng, path.join(outDir, 'yomu-icon-512.png'));
mkdirSync(rendererOutDir, { recursive: true });
copyFileSync(generatedIconPng, path.join(rendererOutDir, 'yomu-icon-512.png'));

function copyAppIcon(sourcePng, outputPng) {
    if (!existsSync(sourcePng)) {
        throw new Error(`Missing Yomu Gaming icon: ${sourcePng}`);
    }
    copyFileSync(sourcePng, outputPng);
}
