#!/usr/bin/env node

import { Arch, build, Platform } from 'electron-builder';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const distRoot = path.join(appRoot, 'dist-gaming');
const packageSourceDir = path.join(distRoot, 'package-source');
const packagesDir = path.join(distRoot, 'packages');
const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));

const platform = normalizePlatform(argValue('--platform') || process.platform);
const arch = normalizeArch(argValue('--arch') || process.arch);
const targets = (argValue('--target') || defaultTargets(platform))
    .split(',')
    .map(target => target.trim())
    .filter(Boolean);
const electronVersion = String(packageJson.devDependencies?.electron ?? '').replace(/^[^\d]*/, '');

if (!electronVersion) {
    throw new Error('Could not find the Electron version in package.json.');
}

await rm(packageSourceDir, { recursive: true, force: true });
await rm(packagesDir, { recursive: true, force: true });
await mkdir(packageSourceDir, { recursive: true });
await cp(path.join(distRoot, 'electron'), path.join(packageSourceDir, 'electron'), { recursive: true });
await cp(path.join(distRoot, 'renderer'), path.join(packageSourceDir, 'renderer'), { recursive: true });
await writeFile(path.join(packageSourceDir, 'package.json'), JSON.stringify({
    name: 'yomu-gaming',
    productName: 'Yomu Gaming',
    version: packageJson.version,
    description: 'Yomu Gaming desktop reader.',
    author: packageJson.author || 'Yomu Reader contributors',
    private: true,
    main: 'electron/main.cjs',
}, null, 2));

await mkdir(packagesDir, { recursive: true });
const artifactPaths = await build({
    targets: platformTarget(platform).createTarget(targets, archTarget(arch)),
    config: {
        appId: 'com.yomureader.gaming',
        productName: 'Yomu Gaming',
        copyright: 'Copyright Yomu Reader contributors',
        electronVersion,
        icon: path.join(distRoot, 'yomu-icon-512.png'),
        asar: true,
        npmRebuild: false,
        directories: {
            app: packageSourceDir,
            output: packagesDir,
        },
        files: ['**/*'],
        linux: {
            category: 'Education',
            executableName: 'yomu-gaming',
            artifactName: 'yomu-gaming-${version}-${os}-${arch}.${ext}',
        },
        mac: {
            category: 'public.app-category.education',
            artifactName: 'yomu-gaming-${version}-${os}-${arch}.${ext}',
            // Prebuilt icns (scripts/generate-gaming-icon.mjs): app-builder's own
            // PNG→icns downscaler corrupts the 16/32px representations.
            icon: path.join(distRoot, 'yomu-icon.icns'),
        },
        win: {
            artifactName: 'yomu-gaming-${version}-${os}-${arch}.${ext}',
        },
    },
    publish: 'never',
});

for (const artifactPath of artifactPaths) {
    console.log(path.relative(appRoot, artifactPath));
}
if (artifactPaths.length === 0) {
    console.log(path.relative(appRoot, packagesDir));
}

function argValue(name) {
    const direct = process.argv.find(arg => arg.startsWith(`${name}=`));
    if (direct) return direct.slice(name.length + 1);
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function normalizePlatform(value) {
    if (value === 'win') return 'win32';
    if (value === 'mac') return 'darwin';
    return value;
}

function normalizeArch(value) {
    if (value === 'amd64') return 'x64';
    return value;
}

function defaultTargets(platformName) {
    if (platformName === 'linux') return 'AppImage';
    if (platformName === 'win32') return 'portable';
    if (platformName === 'darwin') return 'zip';
    return 'dir';
}

function platformTarget(platformName) {
    if (platformName === 'linux') return Platform.LINUX;
    if (platformName === 'win32') return Platform.WINDOWS;
    if (platformName === 'darwin') return Platform.MAC;
    throw new Error(`Unsupported platform: ${platformName}`);
}

function archTarget(archName) {
    if (archName === 'x64') return Arch.x64;
    if (archName === 'arm64') return Arch.arm64;
    throw new Error(`Unsupported arch: ${archName}`);
}
