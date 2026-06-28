#!/usr/bin/env node

import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve('electron/package.json');
const electronPackageDir = path.dirname(electronPackagePath);
const installerPath = path.join(electronPackageDir, 'install.js');
const electronDistPath = path.join(electronPackageDir, 'dist');
const electronPathFile = path.join(electronPackageDir, 'path.txt');

const installEnv = { ...process.env };
delete installEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
delete installEnv.npm_config_ELECTRON_SKIP_BINARY_DOWNLOAD;
delete installEnv.npm_config_electron_skip_binary_download;
installEnv.ELECTRON_SKIP_BINARY_DOWNLOAD = '';

function runInstaller(label) {
    console.log(`[ensure-electron-runtime] ${label}: ${path.relative(process.cwd(), installerPath)}`);
    const result = spawnSync(process.execPath, [installerPath], {
        cwd: electronPackageDir,
        env: installEnv,
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`Electron installer exited with status ${result.status ?? 'unknown'}.`);
    }
}

function resolveElectronBinary() {
    const electronPath = require('electron');
    if (typeof electronPath !== 'string' || electronPath.length === 0) {
        throw new Error(`Electron package resolved to ${typeof electronPath}, not an executable path.`);
    }
    return electronPath;
}

function verifyElectronBinary() {
    const electronPath = resolveElectronBinary();
    if (!existsSync(electronPath)) {
        throw new Error(`Electron executable is missing at ${electronPath}.`);
    }
    console.log(`[ensure-electron-runtime] verified ${electronPath}`);
}

try {
    runInstaller('install');
    verifyElectronBinary();
} catch (error) {
    console.warn(`[ensure-electron-runtime] first verification failed: ${error instanceof Error ? error.message : error}`);
    console.warn('[ensure-electron-runtime] removing stale Electron runtime files and retrying once.');
    rmSync(electronPathFile, { force: true });
    rmSync(electronDistPath, { recursive: true, force: true });
    runInstaller('reinstall');
    verifyElectronBinary();
}
