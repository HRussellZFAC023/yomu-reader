#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const rendererPort = process.env.YOMU_GAMING_RENDERER_PORT || '5187';
const rendererUrl = `http://127.0.0.1:${rendererPort}/`;

await runOnce('node', ['scripts/build-gaming-electron.mjs']);

const vite = spawn(localBin('vite'), ['--config', 'config/vite/gaming.config.ts', '--host', '127.0.0.1', '--port', rendererPort], {
    cwd: appRoot,
    stdio: 'inherit',
});

await waitForServer(rendererUrl);

const electron = spawn(localBin('electron'), ['dist-gaming/electron/main.cjs'], {
    cwd: appRoot,
    stdio: 'inherit',
    env: { ...process.env, YOMU_GAMING_RENDERER_URL: rendererUrl },
});

const stop = () => {
    electron.kill();
    vite.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

electron.on('exit', code => {
    vite.kill();
    process.exit(code ?? 0);
});

function runOnce(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: appRoot, stdio: 'inherit' });
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with ${code}.`)));
    });
}

async function waitForServer(url) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function localBin(name) {
    return path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}
