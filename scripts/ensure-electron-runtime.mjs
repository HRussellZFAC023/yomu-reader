#!/usr/bin/env node

import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve('electron/package.json');
const electronRequire = createRequire(electronPackagePath);
const electronPackage = require(electronPackagePath);
const electronPackageDir = path.dirname(electronPackagePath);
const installerPath = path.join(electronPackageDir, 'install.js');
const electronDistPath = path.join(electronPackageDir, 'dist');
const electronPathFile = path.join(electronPackageDir, 'path.txt');
const electronTypeDefinitionPath = path.join(electronPackageDir, 'electron.d.ts');

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
    delete require.cache[require.resolve('electron')];
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

async function installElectronRuntimeDirectly() {
    const { downloadArtifact } = electronRequire('@electron/get');
    const extract = electronRequire('extract-zip');
    const platform = process.env.npm_config_platform || process.platform;
    const arch = process.env.npm_config_arch || process.arch;
    const platformPath = electronPlatformPath(platform);
    console.log(`[ensure-electron-runtime] direct download electron v${electronPackage.version} ${platform}/${arch}`);
    rmSync(electronPathFile, { force: true });
    rmSync(electronDistPath, { recursive: true, force: true });
    const zipPath = await downloadArtifact({
        version: electronPackage.version,
        artifactName: 'electron',
        force: true,
        cacheRoot: process.env.electron_config_cache,
        checksums: require(path.join(electronPackageDir, 'checksums.json')),
        platform,
        arch,
    });
    await extract(zipPath, { dir: electronDistPath });
    const extractedTypesPath = path.join(electronDistPath, 'electron.d.ts');
    if (existsSync(extractedTypesPath)) renameSync(extractedTypesPath, electronTypeDefinitionPath);
    writeFileSync(electronPathFile, platformPath);
}

function electronPlatformPath(platform = os.platform()) {
    switch (platform) {
        case 'mas':
        case 'darwin':
            return 'Electron.app/Contents/MacOS/Electron';
        case 'freebsd':
        case 'openbsd':
        case 'linux':
            return 'electron';
        case 'win32':
            return 'electron.exe';
        default:
            throw new Error(`Electron builds are not available on platform: ${platform}`);
    }
}

try {
    runInstaller('install');
    verifyElectronBinary();
} catch (error) {
    console.warn(`[ensure-electron-runtime] first verification failed: ${error instanceof Error ? error.message : error}`);
    console.warn('[ensure-electron-runtime] removing stale Electron runtime files and installing directly.');
    rmSync(electronPathFile, { force: true });
    rmSync(electronDistPath, { recursive: true, force: true });
    await installElectronRuntimeDirectly();
    verifyElectronBinary();
}
