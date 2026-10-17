#!/usr/bin/env node
// Rules for the committed Recorded Pages (scripts/fixtures/recorded/), checked
// without a browser:
//   - every recording has a manifest naming its licence, attribution, document
//     and HAR, and every body the HAR names is committed (nothing else is);
//   - ATTRIBUTION.md credits every recording, and nothing that is not committed;
//   - a redacted recording (a copyrighted site) carries the recorder's hash
//     list and NO committed file holds a text run whose hash is on it;
//   - hand-made files beside the recordings are named *-mechanism-fixture.*.
//
//   node scripts/check-recorded-pages.mjs [--root=<dir>]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRedactionLeaks } from './lib/recorded-redaction.mjs';

const DEFAULT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'recorded');
const root = process.argv.find(arg => arg.startsWith('--root='))?.slice('--root='.length) ?? DEFAULT_ROOT;
const REQUIRED = ['slug', 'url', 'content', 'licence', 'attribution', 'document', 'har', 'recorder'];
const BODY_DIRECTORIES = ['resources', 'product-resources'];

function isRecording(dir, name) {
    return statSync(path.join(dir, name)).isDirectory() && existsSync(path.join(dir, name, 'manifest.json'));
}

function recordingDirectories(dir) {
    return readdirSync(dir).filter(name => isRecording(dir, name));
}

function readText(file) {
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function checkRecordedPages(dir) {
    if (!existsSync(dir)) return [`${dir} does not exist`];
    const attribution = readText(path.join(dir, 'ATTRIBUTION.md'));
    return [
        ...(attribution ? [] : ['ATTRIBUTION.md is missing']),
        ...absentCredits(dir, attribution),
        ...handMadeFileProblems(dir),
        ...recordingDirectories(dir).flatMap(slug => checkRecording(path.join(dir, slug), slug, attribution)),
    ];
}

// A table row's first cell names what it credits: a recording or a hand-made file.
function absentCredits(dir, attribution) {
    const credited = attribution.split('\n').filter(line => line.startsWith('| `')).flatMap(line => [...line.split('|')[1].matchAll(/`([^`]+)`/gu)].map(match => match[1]));
    return credited.filter(name => !existsSync(path.join(dir, name))).map(name => `ATTRIBUTION.md credits ${name}, which is not committed`);
}

function handMadeFileProblems(dir) {
    const folders = readdirSync(dir).filter(name => statSync(path.join(dir, name)).isDirectory() && !isRecording(dir, name));
    return folders.flatMap(folder => readdirSync(path.join(dir, folder))
        .filter(file => !/-mechanism-fixture\.[a-z]+$/u.test(file))
        .map(file => `${folder}/${file}: hand-made files beside recordings are named *-mechanism-fixture.*`));
}

const MANIFEST_RULES = [
    (manifest, slug) => REQUIRED.filter(field => !manifest[field]).map(field => `${slug}: manifest.json has no ${field}`),
    (manifest, slug) => (manifest.slug === slug ? [] : [`${slug}: manifest slug is ${manifest.slug}`]),
    (manifest, slug) => (['verbatim', 'redacted'].includes(manifest.content) ? [] : [`${slug}: content must be verbatim or redacted`]),
    (manifest, slug, dir) => committedFiles(manifest).filter(file => !existsSync(path.join(dir, file))).map(file => `${slug}: ${file} is missing`),
];

function committedFiles(manifest) {
    return [manifest.document, manifest.har, manifest.geometry, manifest.productTraffic?.har].filter(Boolean);
}

function checkRecording(dir, slug, attribution) {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return [
        ...MANIFEST_RULES.flatMap(rule => rule(manifest, slug, dir)),
        ...(attribution.includes(`\`${slug}\``) ? [] : [`${slug}: not credited in ATTRIBUTION.md`]),
        ...bodyProblems(dir, slug, [manifest.har, manifest.productTraffic?.har].filter(file => file && existsSync(path.join(dir, file)))),
        ...(manifest.content === 'redacted' ? redactionProblems(dir, slug) : []),
    ];
}

function redactionProblems(dir, slug) {
    const hashPath = path.join(dir, 'redaction-hashes.json');
    if (!existsSync(hashPath)) return [`${slug}: a redacted recording needs the recorder's redaction-hashes.json`];
    return findRedactionLeaks(dir, JSON.parse(readFileSync(hashPath, 'utf8')))
        .map(leak => `${slug}: ${leak.file} holds a ${leak.length}-character text run from the original page (hash ${leak.hash})`);
}

function namedBodies(dir, harFiles) {
    return harFiles.flatMap(harFile => JSON.parse(readFileSync(path.join(dir, harFile), 'utf8')).log.entries
        .map(entry => entry.response.content?._file)
        .filter(Boolean)
        .map(file => ({ harFile, file })));
}

function bodyProblems(dir, slug, harFiles) {
    const named = namedBodies(dir, harFiles);
    const missing = named.filter(({ file }) => !existsSync(path.join(dir, file))).map(({ harFile, file }) => `${slug}: ${harFile} names ${file}, which is not committed`);
    const known = new Set(named.map(({ file }) => file));
    const unnamed = BODY_DIRECTORIES.filter(bodyDir => existsSync(path.join(dir, bodyDir)))
        .flatMap(bodyDir => readdirSync(path.join(dir, bodyDir)).map(file => `${bodyDir}/${file}`))
        .filter(file => !known.has(file))
        .map(file => `${slug}: ${file} is not named by any HAR`);
    return [...missing, ...unnamed];
}

const problems = checkRecordedPages(root);
if (problems.length) {
    console.error(`[recorded-pages] FAIL: ${problems.length} problem(s) under ${path.relative(process.cwd(), root) || root}`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
}
console.log(`[recorded-pages] PASS: ${recordingDirectories(root).length} recording(s), licences, attribution and redaction verified.`);
