#!/usr/bin/env node

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const outDir = path.join(appRoot, 'dist-gaming', 'electron');
const rendererOutDir = path.join(appRoot, 'dist-gaming', 'renderer');

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

copyFileSync(
    path.join(appRoot, 'public', 'app-icons', 'yomu-gaming-512.png'),
    path.join(outDir, 'yomu-gaming-512.png'),
);
mkdirSync(rendererOutDir, { recursive: true });
copyFileSync(
    path.join(appRoot, 'public', 'app-icons', 'yomu-gaming-512.png'),
    path.join(rendererOutDir, 'yomu-gaming-512.png'),
);
