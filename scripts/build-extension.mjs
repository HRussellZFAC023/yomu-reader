#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { run } from './lib/ci-utils.mjs';
import { hardenGeneratedExtensionBackgrounds } from './lib/extension-runtime-hardening.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compilerCli = resolveCompilerCli();

if (!compilerCli) {
    console.error([
        'Could not find UserScript Compiler.',
        'This workspace expects it at tools/UserScript-Compiler,',
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
const publicNewtabManifest = path.join(publicNewtab, 'manifest.webmanifest');
const publicNewtabServiceWorker = path.join(publicNewtab, 'sw.js');
const publicIcon = path.join(root, 'public', 'yomu-icon.svg');
const publicFaviconFiles = ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'];
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
], { cwd: root });

await hardenGeneratedExtensionBackgrounds(out);
await run(process.execPath, [path.join(out, 'tools', 'verify.mjs')], { cwd: out });
await verifyReleaseArtifacts();

console.log(`Yomu extension packages written to ${out}`);

async function stageNewTabShell() {
    await mkdir(newtab, { recursive: true });
    const appHash = createHash('sha256').update(await readFile(newtabApp)).digest('hex').slice(0, 12);
    const buildId = `${await packageVersion()}-${appHash}`;
    const index = await readFile(publicNewtabIndex, 'utf8');
    await writeFile(newtabIndex, extensionNewTabIndex(index, appHash, buildId));
    await writeFile(path.join(newtab, 'version-loader.js'), extensionNewTabVersionLoader(appHash, buildId));
    await writeFile(path.join(newtab, 'version.json'), `${JSON.stringify({ appHash, buildId, generatedAt: new Date().toISOString() }, null, 2)}\n`);
    await stageNewTabWebManifest();
    await stageNewTabServiceWorker(appHash);
    await copyFileIfExists(publicIcon, path.join(newtab, 'yomu-icon.svg'));
    await stagePublicFavicons();
    await stageManifestIcons();
}

async function stageNewTabServiceWorker(appHash) {
    if (!existsSync(publicNewtabServiceWorker)) return;
    await writeFile(path.join(newtab, 'sw.js'), extensionNewTabServiceWorker(await readFile(publicNewtabServiceWorker, 'utf8'), appHash));
}

async function stageNewTabWebManifest() {
    if (!existsSync(publicNewtabManifest)) return;
    const manifest = await readFile(publicNewtabManifest, 'utf8');
    await writeFile(path.join(newtab, 'manifest.webmanifest'), manifest.replaceAll('../', './'));
}

async function stagePublicFavicons() {
    for (const file of publicFaviconFiles) {
        await copyFileIfExists(path.join(root, 'public', file), path.join(newtab, file));
    }
}

async function copyFileIfExists(source, destination) {
    if (existsSync(source)) await copyFile(source, destination);
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

function extensionNewTabIndex(index, appHash, buildId) {
    return index
        .replaceAll('href="../favicon-32x32.png"', 'href="./favicon-32x32.png"')
        .replaceAll('href="../favicon-16x16.png"', 'href="./favicon-16x16.png"')
        .replaceAll('href="../apple-touch-icon.png"', 'href="./apple-touch-icon.png"')
        .replaceAll('href="../yomu-icon.svg"', 'href="./yomu-icon.svg"')
        .replaceAll('__YOMU_NEW_TAB_APP_HASH__', appHash)
        .replaceAll('__YOMU_NEW_TAB_BUILD_ID__', buildId)
        .replace(/<script>\s*\(\(\) => \{\s*const appHash = '[^']*';[\s\S]*?\}\)\(\);\s*<\/script>/, `<script src="./version-loader.js?v=${appHash}"></script>`)
        .replace(/<script src="\.\/app\.js(?:\?v=[^"]*)?"><\/script>/, `<script src="./app.js?v=${appHash}"></script>`);
}

function extensionNewTabVersionLoader(appHash, buildId) {
    return `(() => {
  const appHash = ${JSON.stringify(appHash)};
  const buildId = ${JSON.stringify(buildId)};
  window.yomuNewTabAppHash = appHash;
  window.yomuNewTabBuildId = buildId;
  const current = new URL(location.href);
  if (current.searchParams.get('build') === buildId) return;
  fetch(\`./version.json?t=\${Date.now()}\`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(version => {
      if (!version || version.buildId === buildId) return;
      const next = new URL('./index.html', location.href);
      next.searchParams.set('app', version.appHash);
      next.searchParams.set('build', version.buildId);
      Promise.all([
        'serviceWorker' in navigator
          ? navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
          : Promise.resolve(),
        'caches' in window
          ? caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('yomu-newtab-')).map(key => caches.delete(key))))
          : Promise.resolve(),
      ]).finally(() => location.replace(next.href));
    })
    .catch(() => undefined);
})();
`;
}

function extensionNewTabServiceWorker(source, appHash) {
    return source.replaceAll('__YOMU_NEW_TAB_APP_HASH__', appHash);
}

async function packageVersion() {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    return pkg.version || 'dev';
}

async function verifyReleaseArtifacts() {
    const requiredFiles = [
        'manifest.json',
        'content.js',
        'background.js',
        'popup.html',
        'popup.js',
        'popup.css',
        'newtab/index.html',
        'newtab/app.js',
        'newtab/manifest.webmanifest',
        'newtab/version-loader.js',
        'newtab/sw.js',
        'newtab/version.json',
        'newtab/yomu-icon.svg',
        'newtab/favicon-16x16.png',
        'newtab/favicon-32x32.png',
        'newtab/apple-touch-icon.png',
        'newtab/icons/icon16.png',
        'newtab/icons/icon32.png',
        'newtab/icons/icon48.png',
        'newtab/icons/icon128.png',
    ];
    await verifyZipArtifact(path.join(out, 'release', 'chrome', 'yomureader.com-chrome.zip'), requiredFiles);
    await verifyZipArtifact(path.join(out, 'release', 'firefox', 'yomureader.com-firefox.xpi'), requiredFiles);
    verifyDirectoryArtifact(path.join(out, 'release', 'safari', 'yomureader.com-safari-web-extension'), requiredFiles);
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
        path.join(root, '..', '..', 'tools', 'UserScript-Compiler', 'src', 'cli.mjs'),
        path.join(root, '..', 'UserScript-Compiler', 'src', 'cli.mjs'),
        path.join(root, 'node_modules', '.bin', 'userscript-compiler'),
    ].filter(Boolean);
    return candidates.find(candidate => existsSync(candidate));
}
