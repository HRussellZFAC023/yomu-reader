#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';

export const USER_SCRIPT_COMPILER_COMMIT = '52b7fe463ae503c294421752002da568472dfe4a';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const fixedZipTimestamp = new Date('1980-01-01T00:00:00.000Z');
const yomuRootFiles = [
    'LICENSE',
    'package-lock.json',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
];
const yomuSourceDirectories = ['config', 'scripts', 'src'];
const yomuPublicFiles = [
    'public/THIRD_PARTY_NOTICES.txt',
    'public/apple-touch-icon.png',
    'public/favicon-16x16.png',
    'public/favicon-32x32.png',
    'public/pwa-icon-192.png',
    'public/pwa-icon-512.png',
    'public/pwa-icon-maskable-512.png',
    'public/newtab/index.html',
    'public/newtab/manifest.webmanifest',
    'public/newtab/redirect.html',
    'public/newtab/sw.js',
    'public/yomu-icon.svg',
    'public/extension-icons/icon16.png',
    'public/extension-icons/icon32.png',
    'public/extension-icons/icon48.png',
    'public/extension-icons/icon128.png',
    'docs/public/screenshots/study-pwa-narrow.png',
    'docs/public/screenshots/study-pwa-wide.png',
];
const compilerRootFiles = ['LICENSE', 'README.md', 'package-lock.json', 'package.json'];

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    await main();
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const compilerRoot = path.resolve(options.compilerDir ?? path.join(repositoryRoot, 'UserScript-Compiler'));
    const output = path.resolve(options.output ?? path.join(
        repositoryRoot,
        'dist',
        'extension',
        'source',
        'yomureader.com-firefox-source.zip',
    ));
    const releaseTag = options.releaseTag ?? process.env.RELEASE_TAG;

    if (!releaseTag) {
        throw new Error('Pass --release-tag vX.Y.Z so the source bundle can be matched to the submitted add-on.');
    }

    const release = await validateReleaseVersions({
        releaseTag,
        packageJson: path.join(repositoryRoot, 'package.json'),
        chromePackage: path.resolve(options.chromePackage ?? path.join(
            repositoryRoot,
            'dist/extension/release/chrome/yomureader.com-chrome.zip',
        )),
        firefoxPackage: path.resolve(options.firefoxPackage ?? path.join(
            repositoryRoot,
            'dist/extension/release/firefox/yomureader.com-firefox.xpi',
        )),
    });
    const compilerCommit = verifyCompilerCheckout(compilerRoot);
    const yomuCommit = gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
    const sourceDateEpoch = gitOutput(repositoryRoot, ['show', '-s', '--format=%ct', 'HEAD']);
    const sourceBuildTemplate = await readFile(
        path.join(repositoryRoot, 'scripts/amo/SOURCE_BUILD.template.md'),
        'utf8',
    );
    const sourceBuildGuide = renderSourceBuildGuide(sourceBuildTemplate, {
        releaseTag,
        version: release.version,
        yomuCommit,
        compilerCommit,
        sourceDateEpoch,
    });

    const files = new Map();
    await addSelectedFiles(files, repositoryRoot, 'Yomu', yomuRootFiles);
    await addSelectedDirectories(files, repositoryRoot, 'Yomu', yomuSourceDirectories);
    await addSelectedFiles(files, repositoryRoot, 'Yomu', yomuPublicFiles);
    await addSelectedFiles(files, compilerRoot, 'Yomu/UserScript-Compiler', compilerRootFiles);
    await addSelectedDirectories(files, compilerRoot, 'Yomu/UserScript-Compiler', ['src']);
    files.set('Yomu/SOURCE_BUILD.md', strToU8(sourceBuildGuide));

    const archive = createDeterministicZip(files);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, archive);
    const digest = createHash('sha256').update(archive).digest('hex');
    console.log(`AMO source package: ${output}`);
    console.log(`Files: ${files.size}`);
    console.log(`SHA-256: ${digest}`);
}

export async function validateReleaseVersions({ releaseTag, packageJson, chromePackage, firefoxPackage }) {
    const tagVersion = String(releaseTag).replace(/^refs\/tags\//, '').replace(/^v/, '');
    if (!/^\d+(?:\.\d+){2,3}$/.test(tagVersion) || !String(releaseTag).replace(/^refs\/tags\//, '').startsWith('v')) {
        throw new Error(`Release tag must look like v1.2.3, received ${releaseTag}.`);
    }
    const pkg = JSON.parse(await readFile(packageJson, 'utf8'));
    const manifests = {
        chrome: await manifestFromZip(chromePackage),
        firefox: await manifestFromZip(firefoxPackage),
    };
    return validateReleaseVersionValues({
        tag: tagVersion,
        package: String(pkg.version ?? ''),
        chrome: String(manifests.chrome.version ?? ''),
        firefox: String(manifests.firefox.version ?? ''),
    }, manifests);
}

export function validateReleaseVersionValues(versions, manifests = undefined) {
    const tagVersion = String(versions.tag ?? '');
    const mismatches = Object.entries(versions).filter(([, version]) => version !== tagVersion);
    if (mismatches.length) {
        const detail = Object.entries(versions).map(([name, version]) => `${name}=${version || '<missing>'}`).join(', ');
        throw new Error(`Release version mismatch: ${detail}.`);
    }
    return { version: tagVersion, manifests };
}

export function createDeterministicZip(files) {
    const entries = {};
    for (const name of [...files.keys()].sort(comparePaths)) {
        assertSafeArchivePath(name);
        entries[name] = [files.get(name), {
            level: 9,
            mtime: fixedZipTimestamp,
            os: 3,
            attrs: 0o100644 << 16,
        }];
    }
    return zipSync(entries, { level: 9 });
}

function renderSourceBuildGuide(template, values) {
    const replacements = {
        __YOMU_TAG__: values.releaseTag,
        __YOMU_VERSION__: values.version,
        __YOMU_COMMIT__: values.yomuCommit,
        __COMPILER_COMMIT__: values.compilerCommit,
        __SOURCE_DATE_EPOCH__: values.sourceDateEpoch,
    };
    let rendered = template;
    for (const [token, value] of Object.entries(replacements)) rendered = rendered.replaceAll(token, value);
    const unresolved = rendered.match(/__[A-Z0-9_]+__/g);
    if (unresolved) throw new Error(`Unresolved SOURCE_BUILD.md token(s): ${[...new Set(unresolved)].join(', ')}`);
    return rendered;
}

function verifyCompilerCheckout(compilerRoot) {
    if (!existsSync(path.join(compilerRoot, 'package-lock.json'))) {
        throw new Error(`UserScript Compiler checkout is missing at ${compilerRoot}.`);
    }
    const commit = gitOutput(compilerRoot, ['rev-parse', 'HEAD']);
    if (commit !== USER_SCRIPT_COMPILER_COMMIT) {
        throw new Error(`UserScript Compiler must be checked out at ${USER_SCRIPT_COMPILER_COMMIT}; found ${commit}.`);
    }
    const trackedChanges = gitOutput(compilerRoot, ['status', '--porcelain', '--untracked-files=no']);
    if (trackedChanges) {
        throw new Error('UserScript Compiler has tracked changes; the AMO source bundle must contain the exact pinned checkout.');
    }
    return commit;
}

async function manifestFromZip(archivePath) {
    if (!existsSync(archivePath)) throw new Error(`Missing release package: ${archivePath}`);
    const entries = unzipSync(new Uint8Array(await readFile(archivePath)));
    const manifest = entries['manifest.json'];
    if (!manifest) throw new Error(`Release package has no root manifest.json: ${archivePath}`);
    return JSON.parse(new TextDecoder().decode(manifest));
}

async function addSelectedDirectories(files, sourceRoot, archiveRoot, directories) {
    for (const directory of directories) {
        const paths = await walkFiles(path.join(sourceRoot, directory));
        for (const file of paths) {
            const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
            files.set(`${archiveRoot}/${relative}`, new Uint8Array(await readFile(file)));
        }
    }
}

async function addSelectedFiles(files, sourceRoot, archiveRoot, relativePaths) {
    for (const relative of relativePaths) {
        const source = path.join(sourceRoot, relative);
        if (!existsSync(source)) throw new Error(`Required source file is missing: ${source}`);
        const info = await stat(source);
        if (!info.isFile()) throw new Error(`Expected a regular source file: ${source}`);
        files.set(`${archiveRoot}/${relative.split(path.sep).join('/')}`, new Uint8Array(await readFile(source)));
    }
}

async function walkFiles(root) {
    if (!existsSync(root)) throw new Error(`Required source directory is missing: ${root}`);
    const files = [];
    for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => comparePaths(left.name, right.name))) {
        if (entry.name === '.DS_Store' || entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'artifacts') continue;
        const child = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await walkFiles(child));
        else if (entry.isFile()) files.push(child);
        else throw new Error(`Source package does not accept symlinks or special files: ${child}`);
    }
    return files;
}

function assertSafeArchivePath(file) {
    const parts = file.split('/');
    if (file.startsWith('/') || parts.includes('..') || parts.some(part => ['.git', 'node_modules', 'artifacts'].includes(part))) {
        throw new Error(`Unsafe or generated path in AMO source archive: ${file}`);
    }
}

function gitOutput(cwd, arguments_) {
    return execFileSync('git', ['-C', cwd, ...arguments_], { encoding: 'utf8' }).trim();
}

function comparePaths(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function parseArguments(values) {
    const parsed = {};
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (!value.startsWith('--')) throw new Error(`Unexpected argument: ${value}`);
        const key = value.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
        const next = values[index + 1];
        if (!next || next.startsWith('--')) throw new Error(`Missing value for ${value}.`);
        parsed[key] = next;
        index += 1;
    }
    return parsed;
}
