#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';
import { hardenGeneratedExtensionBackgrounds } from './extension-runtime-hardening.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compilerCli = resolveCompilerCli();

if (!compilerCli) {
    console.error([
        'Could not find UserScript Compiler.',
        'Clone https://github.com/HRussellZFAC023/UserScript-Compiler beside yomu-reader,',
        'or set USERSCRIPT_COMPILER_CLI=/absolute/path/to/UserScript-Compiler/src/cli.mjs.',
    ].join('\n'));
    process.exit(1);
}

const userscript = path.join(root, 'dist', 'yomu.user.js');
const newtab = path.join(root, 'dist', 'newtab');
const newtabApp = path.join(newtab, 'app.js');
const newtabIndex = path.join(newtab, 'index.html');
const publicNewtab = path.join(root, 'public', 'newtab');
const publicNewtabIndex = path.join(publicNewtab, 'index.html');
const publicNewtabServiceWorker = path.join(publicNewtab, 'sw.js');
const publicIcon = path.join(root, 'public', 'yomu-icon.svg');
const publicExtensionIcons = path.join(root, 'public', 'extension-icons');
const out = path.join(root, 'dist', 'extension');

for (const required of [userscript, newtabApp, publicNewtabIndex]) {
    if (!existsSync(required)) {
        console.error(`Missing build artifact: ${required}`);
        console.error('Run npm run build before building extension packages.');
        process.exit(1);
    }
}

await stageNewTabShell();
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await run(process.execPath, [
    compilerCli,
    userscript,
    '--out', out,
    '--target', 'chrome,firefox,safari',
    '--runtime', 'content-script',
    '--newtab-dir', newtab,
]);

await hardenGeneratedExtensionBackgrounds(out);
await run(process.execPath, [path.join(out, 'tools', 'verify.mjs')], { cwd: out });
await verifyReleaseArtifacts();

console.log(`Yomu extension packages written to ${out}`);

async function stageNewTabShell() {
    await mkdir(newtab, { recursive: true });
    const appHash = createHash('sha256').update(await readFile(newtabApp)).digest('hex').slice(0, 12);
    const index = await readFile(publicNewtabIndex, 'utf8');
    await writeFile(newtabIndex, extensionNewTabIndex(index, appHash));
    if (existsSync(publicNewtabServiceWorker)) {
        await writeFile(path.join(newtab, 'sw.js'), extensionNewTabServiceWorker(await readFile(publicNewtabServiceWorker, 'utf8'), appHash));
    }
    if (existsSync(publicIcon)) {
        await copyFile(publicIcon, path.join(newtab, 'yomu-icon.svg'));
    }
    await stageManifestIcons();
}

async function stageManifestIcons() {
    if (!existsSync(publicExtensionIcons)) return;
    const iconOut = path.join(newtab, 'icons');
    await mkdir(iconOut, { recursive: true });
    for (const size of [16, 32, 48, 128]) {
        const source = path.join(publicExtensionIcons, `icon${size}.png`);
        if (existsSync(source)) await copyFile(source, path.join(iconOut, `icon${size}.png`));
    }
}

function extensionNewTabIndex(index, appHash) {
    return index
        .replaceAll('href="../yomu-icon.svg"', 'href="./yomu-icon.svg"')
        .replace(/<script src="\.\/app\.js(?:\?v=[^"]*)?"><\/script>/, `<script src="./app.js?v=${appHash}"></script>`);
}

function extensionNewTabServiceWorker(source, appHash) {
    return source.replaceAll('__YOMU_NEW_TAB_APP_HASH__', appHash);
}

async function verifyReleaseArtifacts() {
    const requiredFiles = [
        'manifest.json',
        'content.js',
        'background.js',
        'options.html',
        'options.js',
        'options.css',
        'newtab/index.html',
        'newtab/app.js',
        'newtab/sw.js',
        'newtab/yomu-icon.svg',
        'newtab/icons/icon16.png',
        'newtab/icons/icon32.png',
        'newtab/icons/icon48.png',
        'newtab/icons/icon128.png',
    ];
    await verifyZipArtifact(path.join(out, 'release', 'chrome', 'yomu-reader-chrome.zip'), requiredFiles);
    await verifyZipArtifact(path.join(out, 'release', 'firefox', 'yomu-reader-firefox.xpi'), requiredFiles);
    verifyDirectoryArtifact(path.join(out, 'release', 'safari', 'yomu-reader-safari-web-extension'), requiredFiles);
}

async function verifyZipArtifact(artifact, requiredFiles) {
    if (!existsSync(artifact)) {
        throw new Error(`Missing release artifact: ${artifact}`);
    }
    const entries = Object.keys(unzipSync(new Uint8Array(await readFile(artifact))));
    for (const required of requiredFiles) {
        if (!entries.includes(required)) {
            throw new Error(`Missing ${required} in ${artifact}`);
        }
    }
}

function verifyDirectoryArtifact(directory, requiredFiles) {
    for (const required of requiredFiles) {
        const file = path.join(directory, required);
        if (!existsSync(file)) {
            throw new Error(`Missing ${file}`);
        }
    }
}

function resolveCompilerCli() {
    const candidates = [
        process.env.USERSCRIPT_COMPILER_CLI,
        path.join(root, '..', 'UserScript-Compiler', 'src', 'cli.mjs'),
        path.join(root, 'node_modules', '.bin', 'userscript-compiler'),
    ].filter(Boolean);
    return candidates.find(candidate => existsSync(candidate));
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd || root,
            stdio: 'inherit',
            env: process.env,
        });
        child.on('error', reject);
        child.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        });
    });
}
