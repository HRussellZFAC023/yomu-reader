#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve('electron/package.json');
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

function installElectronRuntimeDirectly() {
    const platform = electronDownloadPlatform(process.env.npm_config_platform || process.platform);
    const arch = electronDownloadArch(process.env.npm_config_arch || process.arch);
    const platformPath = electronPlatformPath(platform);
    const zipName = `electron-v${electronPackage.version}-${platform}-${arch}.zip`;
    const checksums = require(path.join(electronPackageDir, 'checksums.json'));
    const expectedChecksum = checksums[zipName];
    if (!expectedChecksum) throw new Error(`No Electron checksum found for ${zipName}.`);
    const url = `https://github.com/electron/electron/releases/download/v${electronPackage.version}/${zipName}`;
    console.log(`[ensure-electron-runtime] direct download ${url}`);
    rmSync(electronPathFile, { force: true });
    rmSync(electronDistPath, { recursive: true, force: true });
    mkdirSync(electronDistPath, { recursive: true });
    const zipPath = path.join(os.tmpdir(), zipName);
    runCommand('download', 'curl', ['-fL', '--retry', '3', '--retry-delay', '2', '-o', zipPath, url]);
    const zip = readFileSync(zipPath);
    const actualChecksum = createHash('sha256').update(zip).digest('hex');
    if (actualChecksum !== expectedChecksum) {
        throw new Error(`Electron checksum mismatch for ${zipName}: expected ${expectedChecksum}, got ${actualChecksum}.`);
    }
    runCommand('extract', 'unzip', ['-q', zipPath, '-d', electronDistPath]);
    const extractedTypesPath = path.join(electronDistPath, 'electron.d.ts');
    if (existsSync(extractedTypesPath)) renameSync(extractedTypesPath, electronTypeDefinitionPath);
    writeFileSync(electronPathFile, platformPath);
}

function runCommand(label, command, args) {
    console.log(`[ensure-electron-runtime] ${label}: ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
    }
}

function electronDownloadPlatform(platform = process.platform) {
    return platform === 'mas' ? 'darwin' : platform;
}

function electronDownloadArch(arch = process.arch) {
    return arch === 'arm' ? 'armv7l' : arch;
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
    if (process.env.YOMU_ELECTRON_DIRECT_INSTALL === '1') {
        installElectronRuntimeDirectly();
    } else {
        runInstaller('install');
    }
    verifyElectronBinary();
} catch (error) {
    console.warn(`[ensure-electron-runtime] first verification failed: ${error instanceof Error ? error.message : error}`);
    console.warn('[ensure-electron-runtime] removing stale Electron runtime files and installing directly.');
    rmSync(electronPathFile, { force: true });
    rmSync(electronDistPath, { recursive: true, force: true });
    installElectronRuntimeDirectly();
    verifyElectronBinary();
}
