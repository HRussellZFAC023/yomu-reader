#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { run } from './lib/ci-utils.mjs';
import {
    assertHardenedExtensionDictionaryBackgroundSource,
    buildExtensionDictionaryBackgroundSource,
} from './lib/extension-dictionary-background.mjs';
import {
    assertAmoJavaScriptFiles,
    deterministicExtensionTimestamp,
    hardenGeneratedExtensionBackgrounds,
    hardenExtensionSubmissionGuide,
    refreshGeneratedExtensionProjectArchive,
} from './lib/extension-runtime-hardening.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const compilerCli = resolveCompilerCli();

if (!compilerCli) {
    console.error([
        'Could not find UserScript Compiler. Clone it into tools/:',
        '  git clone https://github.com/HRussellZFAC023/UserScript-Compiler.git tools/UserScript-Compiler',
        '  npm --prefix tools/UserScript-Compiler ci',
        'or set USERSCRIPT_COMPILER_CLI=/absolute/path/to/UserScript-Compiler/src/cli.mjs.',
        'Looked in:',
        ...compilerCliCandidates().map(candidate => `  ${candidate}`),
    ].join('\n'));
    process.exit(1);
}

const { hostedAppearanceBootSnippet } = createRequire(import.meta.url)('./lib/hosted-appearance-boot.cjs');

const userscript = path.join(root, 'dist', 'yomu.user.js');
const readerCss = path.join(root, 'dist', 'yomu.css');
// The hosted Study app stays as one classic script for its existing cache and
// fixture contract. Store packages use a separate readable ES-module build so
// no single local file exceeds AMO's parser limit.
const newtab = path.join(root, 'dist', 'newtab-extension');
const newtabApp = path.join(newtab, 'app.js');
const newtabIndex = path.join(newtab, 'index.html');
const hostedNewtabStyles = path.join(root, 'dist', 'newtab', 'styles.css');
const publicNewtab = path.join(root, 'public', 'newtab');
const publicNewtabIndex = path.join(publicNewtab, 'index.html');
const publicNewtabManifest = path.join(publicNewtab, 'manifest.webmanifest');
const publicNewtabServiceWorker = path.join(publicNewtab, 'sw.js');
const publicIcon = path.join(root, 'public', 'yomu-icon.svg');
const publicFaviconFiles = ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'];
const publicExtensionIcons = path.join(root, 'public', 'extension-icons');
const thirdPartyNotices = path.join(root, 'public', 'THIRD_PARTY_NOTICES.txt');
const runtimeDictionaryCatalog = path.join(root, 'config', 'dictionaries', 'published', 'v1', 'runtime-catalog.json');
const out = path.join(root, 'dist', 'extension');
const UNSAFE_HTML_ASSIGNMENT = /\.(?:inner|outer)HTML\s*(?:\+=|\|\|=|&&=|\?\?=|=(?!=))/;
const generatedAt = await extensionGeneratedAt();

for (const required of [userscript, readerCss, newtabApp, hostedNewtabStyles, publicNewtabIndex, thirdPartyNotices, runtimeDictionaryCatalog]) {
    if (!existsSync(required)) {
        console.error(`Missing build artifact: ${required}`);
        console.error('Run npm run build before building extension packages.');
        process.exit(1);
    }
}

await stageNewTabShell();
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const dictionaryBackgroundSource = await buildExtensionDictionaryBackgroundSource(root);

await run(process.execPath, [
    compilerCli,
    userscript,
    '--out', out,
    '--target', 'chrome,firefox,safari',
    '--runtime', 'content-script',
    '--newtab-dir', newtab,
    '--firefox-id', 'yomu@yomureader.com',
    '--config', path.join(root, 'config', 'userscript-compiler.config.json'),
], { cwd: root });

await hardenGeneratedExtensionBackgrounds(out, {
    readerCss: await readFile(readerCss),
    thirdPartyNotices: await readFile(thirdPartyNotices),
    runtimeDictionaryCatalog: await readFile(runtimeDictionaryCatalog),
    archiveTimestamp: generatedAt,
    dictionaryBackgroundSource,
});
await hardenGeneratedSubmissionGuide();
await refreshGeneratedExtensionProjectArchive(out, generatedAt);
await run(process.execPath, [path.join(out, 'tools', 'verify.mjs')], { cwd: out });
await verifyReleaseArtifacts();
await verifyStoreReadiness();

console.log(`Yomu extension packages written to ${out}`);

async function stageNewTabShell() {
    await mkdir(newtab, { recursive: true });
    // Vite keeps dist/newtab between builds, so a hosted compatibility alias can
    // survive there and make the extension compiler follow ../study/. The
    // extension ships the real Study shell and must not package that redirect.
    await rm(path.join(newtab, 'redirect.html'), { force: true });
    const appHash = createHash('sha256').update(await readFile(newtabApp)).digest('hex').slice(0, 12);
    const buildId = `${await packageVersion()}-${appHash}`;
    const index = await readFile(publicNewtabIndex, 'utf8');
    await writeFile(newtabIndex, extensionNewTabIndex(index, appHash, buildId));
    await writeFile(path.join(newtab, 'appearance-boot.js'), `${hostedAppearanceBootSnippet('surface')}\n`);
    await writeFile(path.join(newtab, 'version-loader.js'), extensionNewTabVersionLoader(appHash, buildId));
    await writeFile(path.join(newtab, 'sw-register.js'), extensionNewTabServiceWorkerRegister());
    // Must stay byte-identical to the committed docs/public/study/version.json
    // that scripts/sync-docs-userscript.cjs writes (verify-userscript.cjs
    // compares the two), so this carries the same build-derived fields only.
    // generatedAt stays out of it and is used for the ZIP archive timestamp.
    await writeFile(path.join(newtab, 'version.json'), `${JSON.stringify({ appHash, buildId }, null, 2)}\n`);
    await copyFile(hostedNewtabStyles, path.join(newtab, 'styles.css'));
    await stageNewTabWebManifest();
    await stageNewTabServiceWorker(appHash);
    await copyFileIfExists(publicIcon, path.join(newtab, 'yomu-icon.svg'));
    await stagePublicFavicons();
    await stageManifestIcons();
}

async function hardenGeneratedSubmissionGuide() {
    const guide = path.join(out, 'review', 'submission-guide.md');
    if (!existsSync(guide)) return;
    const source = await readFile(guide, 'utf8');
    const hardened = hardenExtensionSubmissionGuide(source, await finalSubmissionGuideEvidence());
    if (/packaged new-tab page|Safari new-tab behavior|Remote new tab:/i.test(hardened)) {
        throw new Error('Extension submission guide still positions Study as a browser new-tab override.');
    }
    await writeFile(guide, hardened);
}

async function finalSubmissionGuideEvidence() {
    const firefoxDirectory = path.join(out, 'packages', 'extension', 'firefox');
    const firefoxFiles = await collectDirectoryFiles(firefoxDirectory);
    const firefoxExecutableSource = (await Promise.all(firefoxFiles
        .filter(file => file.endsWith('.js') || file.endsWith('.html'))
        .map(file => readFile(path.join(firefoxDirectory, file), 'utf8'))))
        .join('\n');
    const safariManifest = JSON.parse(await readFile(
        path.join(out, 'packages', 'extension', 'safari', 'manifest.json'),
        'utf8',
    ));
    const safariMatches = (safariManifest.content_scripts ?? [])
        .flatMap(contentScript => contentScript.matches ?? []);
    return {
        firefoxHasUnsafeHtmlAssignment: UNSAFE_HTML_ASSIGNMENT.test(firefoxExecutableSource),
        safariHasBrowserOverride: Boolean(
            safariManifest.chrome_url_overrides
            || safariManifest.browser_url_overrides
            || safariManifest.chrome_settings_overrides,
        ),
        safariHasFileUrlMatch: safariMatches.some(match => /^file:/i.test(String(match))),
    };
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
    const externalized = index
        .replaceAll('href="../favicon-32x32.png"', 'href="./favicon-32x32.png"')
        .replaceAll('href="../favicon-16x16.png"', 'href="./favicon-16x16.png"')
        .replaceAll('href="../apple-touch-icon.png"', 'href="./apple-touch-icon.png"')
        .replaceAll('href="../yomu-icon.svg"', 'href="./yomu-icon.svg"')
        .replaceAll('__YOMU_NEW_TAB_APP_HASH__', appHash)
        .replaceAll('__YOMU_NEW_TAB_BUILD_ID__', buildId)
        .replace(/<script>\s*\(\(\) => \{\s*const appHash = '[^']*';[\s\S]*?\}\)\(\);\s*<\/script>/, `<script src="./version-loader.js?v=${appHash}"></script>`)
        // MV3 extension pages forbid inline <script> (no hash/nonce exceptions).
        // Externalize the service-worker registration block into sw-register.js.
        // The web-hosted public/newtab/index.html keeps its inline copy untouched.
        .replace(/<script>\s*if \('serviceWorker' in navigator && location\.protocol !== 'file:'\) \{[\s\S]*?<\/script>/, `<script src="./sw-register.js?v=${appHash}"></script>`)
        // The pre-paint appearance bootstrap is inline on the web, where it must
        // beat the first paint with no extra request. Extension pages forbid
        // inline script, so it ships as a local file loaded from the same head
        // position — still before any body content paints.
        .replace(/<script>\/\* yomu:appearance-boot:start \*\/[\s\S]*?\/\* yomu:appearance-boot:end \*\/<\/script>/, `<script src="./appearance-boot.js?v=${appHash}"></script>`)
        .replace(/<script src="\.\/app\.js(?:\?v=[^"]*)?"><\/script>/, `<script type="module" src="./app.js?v=${appHash}"></script>`);
    assertNoInlineScripts(externalized);
    return externalized;
}

function assertNoInlineScripts(html) {
    // Guard against future template changes reintroducing an inline <script> that
    // would trip the MV3 extension-page CSP. Any <script> without a src is fatal.
    const inline = [...html.matchAll(/<script\b([^>]*)>/gi)]
        .filter(match => !/\bsrc\s*=/.test(match[1]));
    if (inline.length) {
        throw new Error(`Extension newtab/index.html contains ${inline.length} inline <script> block(s); MV3 extension pages forbid inline script. Externalize them in build-extension.mjs.`);
    }
}

function extensionNewTabServiceWorkerRegister() {
    return `if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }, { once: true });
}
`;
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

async function extensionGeneratedAt() {
    let gitCommitEpoch = '315532800'; // 1980-01-01, the earliest ZIP timestamp.
    try {
        ({ stdout: gitCommitEpoch } = await execFileAsync('git', ['log', '-1', '--format=%ct'], { cwd: root }));
    } catch {
        // AMO reviewers build from a source archive without .git. The stable
        // ZIP epoch keeps that rebuild deterministic when SOURCE_DATE_EPOCH
        // was not provided explicitly.
    }
    return deterministicExtensionTimestamp(process.env.SOURCE_DATE_EPOCH, gitCommitEpoch);
}

async function verifyReleaseArtifacts() {
    const requiredFiles = [
        'manifest.json',
        'content.js',
        'background.js',
        'popup.html',
        'popup.js',
        'popup.css',
        'yomu.css',
        'THIRD_PARTY_NOTICES.txt',
        'newtab/index.html',
        'newtab/app.js',
        'newtab/manifest.webmanifest',
        'newtab/version-loader.js',
        'newtab/sw-register.js',
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
    await verifyZipArtifact(path.join(out, 'release', 'firefox', 'yomureader.com-firefox.xpi'), [
        ...requiredFiles,
        'gm-runtime.js',
    ]);
    verifyDirectoryArtifact(path.join(out, 'release', 'safari', 'yomureader.com-safari-web-extension'), requiredFiles);
    await verifyFirefoxPackageArchiveParity();
}

async function verifyFirefoxPackageArchiveParity() {
    const packageDirectory = path.join(out, 'packages', 'extension', 'firefox');
    const archive = path.join(out, 'release', 'firefox', 'yomureader.com-firefox.xpi');
    const archiveEntries = unzipSync(new Uint8Array(await readFile(archive)));
    for (const file of ['gm-runtime.js', 'content.js']) {
        const packaged = new Uint8Array(await readFile(path.join(packageDirectory, file)));
        const archived = archiveEntries[file];
        if (!archived || packaged.byteLength !== archived.byteLength
            || packaged.some((byte, index) => byte !== archived[index])) {
            throw new Error(`Firefox ${file} differs between the unpacked review project and release XPI.`);
        }
    }
}

async function verifyStoreReadiness() {
    await verifyStoreProjectArchive(path.join(out, 'yomureader.com-extension-project.zip'));
    await verifyStoreZip(path.join(out, 'release', 'chrome', 'yomureader.com-chrome.zip'), 'chrome');
    await verifyStoreZip(path.join(out, 'release', 'firefox', 'yomureader.com-firefox.xpi'), 'firefox');
    await verifyStoreDirectory(path.join(out, 'release', 'safari', 'yomureader.com-safari-web-extension'), 'safari');
}

async function verifyStoreProjectArchive(artifact) {
    const archiveEntries = unzipSync(new Uint8Array(await readFile(artifact)));
    for (const target of ['chrome', 'firefox', 'safari']) {
        const prefix = `packages/extension/${target}/`;
        const entries = Object.fromEntries(Object.entries(archiveEntries)
            .filter(([file]) => file.startsWith(prefix) && !file.endsWith('/'))
            .map(([file, bytes]) => [file.slice(prefix.length), bytes]));
        verifyStorePackage(entries, `${target} project archive`);
    }
}

async function verifyStoreZip(artifact, target) {
    const entries = unzipSync(new Uint8Array(await readFile(artifact)));
    const decode = file => new TextDecoder().decode(entries[file]);
    verifyStorePackage(entries, target);
}

async function verifyStoreDirectory(directory, target) {
    const fileNames = await collectDirectoryFiles(directory);
    const entries = Object.fromEntries(await Promise.all(fileNames.map(async file => [
        file,
        new Uint8Array(await readFile(path.join(directory, file))),
    ])));
    verifyStorePackage(entries, target);
}

function verifyStorePackage(entries, target) {
    const decode = file => new TextDecoder().decode(entries[file]);
    const manifest = JSON.parse(decode('manifest.json'));
    verifyDictionaryBackgroundService(entries, target);
    const permissions = manifest.permissions ?? [];
    const hostPermissions = manifest.manifest_version >= 3
        ? manifest.host_permissions ?? []
        : permissions;
    if (permissions.includes('tabs')) {
        throw new Error(`${target} store package requests the unnecessary tabs browsing-history permission.`);
    }
    if (hostPermissions.includes('<all_urls>') && hostPermissions.includes('file:///*')) {
        throw new Error(`${target} store package has redundant <all_urls> and file:///* host access.`);
    }
    if (String(manifest.description ?? '').length > 132) {
        throw new Error(`${target} manifest description exceeds Chrome Web Store's 132-character limit.`);
    }
    if (manifest.chrome_url_overrides || manifest.browser_url_overrides || manifest.chrome_settings_overrides) {
        throw new Error(`${target} store package must not override browser pages, search, or home settings.`);
    }
    if (target === 'safari') {
        const contentScriptMatches = (manifest.content_scripts ?? [])
            .flatMap(contentScript => contentScript.matches ?? []);
        if (contentScriptMatches.some(match => /^file:/i.test(String(match)))) {
            throw new Error('Safari store package still advertises unsupported file-page content-script injection.');
        }
    }
    if (!entries['yomu.css']) {
        throw new Error(`${target} store package is missing the local reader stylesheet.`);
    }
    if (!entries['THIRD_PARTY_NOTICES.txt'] || !decode('THIRD_PARTY_NOTICES.txt').includes('fflate')) {
        throw new Error(`${target} store package is missing the bundled fflate license notice.`);
    }
    if (!entries['runtime-catalog.json']) {
        throw new Error(`${target} store package is missing its local dictionary catalog.`);
    }
    const studyIndex = decode('newtab/index.html');
    if (!/<script\s+type="module"\s+src="\.\/app\.js\?v=[a-f0-9]+"><\/script>/.test(studyIndex)) {
        throw new Error(`${target} packaged Study page must load its readable split bundle as a local module.`);
    }
    const studyApp = decode('newtab/app.js');
    const studyChunkReferences = [...studyApp.matchAll(/["']\.\/chunks\/([^"']+\.m?js)["']/g)]
        .map(match => `newtab/chunks/${match[1]}`);
    if (!studyChunkReferences.length || studyChunkReferences.some(file => !entries[file])) {
        throw new Error(`${target} packaged Study page is missing one or more local module chunks.`);
    }
    const readerCssSource = decode('yomu.css');
    if (!readerCssSource.includes('.jpdb-reader-popover') || !readerCssSource.includes('.jpdb-subtitle-player')) {
        throw new Error(`${target} store package does not contain the full built reader stylesheet.`);
    }
    const exposedResources = (manifest.web_accessible_resources ?? []).flatMap(resource => (
        typeof resource === 'string' ? [resource] : resource.resources ?? []
    ));
    if (!exposedResources.includes('yomu.css')) {
        throw new Error(`${target} store package does not expose its local reader stylesheet to the content script.`);
    }
    if (!exposedResources.includes('runtime-catalog.json')) {
        throw new Error(`${target} store package does not expose its local dictionary catalog to the content script.`);
    }
    if (target === 'firefox') {
        assertAmoJavaScriptFiles(entries);
        const gecko = manifest.browser_specific_settings?.gecko;
        const geckoId = gecko?.id ?? manifest.applications?.gecko?.id;
        if (geckoId !== 'yomu@yomureader.com') {
            throw new Error(`Firefox store package must use the stable yomu@yomureader.com add-on ID.`);
        }
        if (gecko?.strict_min_version !== '140.0'
            || manifest.browser_specific_settings?.gecko_android?.strict_min_version !== '142.0') {
            throw new Error('Firefox store package must declare the minimum versions required for built-in data consent.');
        }
        const dataPermissions = gecko?.data_collection_permissions;
        if (!dataPermissions?.required?.includes('websiteContent')
            || !dataPermissions?.optional?.includes('authenticationInfo')) {
            throw new Error('Firefox store package must disclose website content and request optional account credential consent.');
        }
    }
    const executableSource = Object.entries(entries)
        .filter(([file]) => file.endsWith('.js') || file.endsWith('.html'))
        .map(([file, bytes]) => `${file}\n${new TextDecoder().decode(bytes)}`)
        .join('\n');
    if (target === 'firefox' && UNSAFE_HTML_ASSIGNMENT.test(executableSource)) {
        throw new Error('Firefox store package contains an innerHTML or outerHTML assignment that AMO will warn about.');
    }
    if (!executableSource.includes('yomu-extension-packaged-reader-css')) {
        throw new Error(`${target} store package does not route reader CSS loading to its packaged asset.`);
    }
    if (/https:\/\/raw\.githubusercontent\.com\/HRussellZFAC023\/yomu-reader\/[^\s"'`]*yomu\.css/i.test(executableSource)
        || /https:\/\/yomureader\.com\/yomu(?:\.[a-f0-9]+)?\.css/i.test(executableSource)) {
        throw new Error(`${target} store package still contains a hosted reader stylesheet fetch path.`);
    }
    if (executableSource.includes('https://accounts.google.com/gsi/client')) {
        throw new Error(`${target} store package contains the hosted Google Identity Services script URL.`);
    }
    const popupSource = Object.entries(entries)
        .filter(([file]) => file === 'popup.html' || file === 'popup.js')
        .map(([, bytes]) => new TextDecoder().decode(bytes))
        .join('\n');
    if (popupSource.includes('video-player/')) {
        throw new Error(`${target} store popup references a video-player page that is not packaged.`);
    }
    if (target === 'safari' && /\^file:/.test(popupSource)) {
        throw new Error('Safari store popup still offers unsupported file-page injection.');
    }
}

function verifyDictionaryBackgroundService(entries, target) {
    const source = entries['background.js'] && new TextDecoder().decode(entries['background.js']);
    if (!source) {
        throw new Error(`${target} store package is missing the shared dictionary background service.`);
    }
    assertHardenedExtensionDictionaryBackgroundSource(source, `${target} store package background.js`);
}

async function collectDirectoryFiles(directory, relative = '') {
    const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) files.push(...await collectDirectoryFiles(directory, child));
        else if (entry.isFile()) files.push(child.split(path.sep).join('/'));
    }
    return files;
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

function compilerCliCandidates() {
    return [
        process.env.USERSCRIPT_COMPILER_CLI,
        // The checkout this workspace documents, and the one CI reproduces:
        // the compiler cloned into tools/ inside the repository.
        path.join(root, 'tools', 'UserScript-Compiler', 'src', 'cli.mjs'),
        path.join(root, '..', '..', 'tools', 'UserScript-Compiler', 'src', 'cli.mjs'),
        path.join(root, '..', 'UserScript-Compiler', 'src', 'cli.mjs'),
        path.join(root, 'node_modules', '.bin', 'userscript-compiler'),
    ].filter(Boolean);
}

function resolveCompilerCli() {
    return compilerCliCandidates().find(candidate => existsSync(candidate));
}
