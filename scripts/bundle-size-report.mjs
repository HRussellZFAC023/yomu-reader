#!/usr/bin/env node
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const DIST_FILES = [
    'dist/yomu.user.js',
    'dist/newtab/app.js',
    'dist/newtab/sw.js',
    'dist/newtab/index.html',
];
const FEATURE_BUCKETS = [
    ['audio', /(^|\/)(audio|reader-audio-actions|page-media-url)\.ts$/],
    ['subtitles', /(^|\/)(subtitles|subtitle-|subtitle-.*|subtitle-player-.*|site-parsers)\.ts$/],
    ['ocr', /(^|\/)(ocr|reader-words-ocr)\.(ts|css)$/],
    ['kanji', /(^|\/)(kanji|kanjivg|rtk|uchisen|origin-graph|kanji-.*|rtk-elements|jpdb-kanji)\.(ts|css)$/],
    ['local-dictionaries', /(^|\/)(yomitan|yomitan-.*|local-dictionary-.*|definition-source-render|dictionary-.*|source-sections|zip)\.(ts|css)$/],
    ['newtab', /(^|\/)(new-tab|newtab|anki-new-tab|new-tab-.*|newtab-.*)\.(ts|css)$/],
    ['immersion-kit', /(^|\/)(immersion-.*|study-.*)\.(ts|css)$/],
    ['anki', /(^|\/)(anki|anki-render|card-action-controller|deck-choice)\.ts$/],
    ['core-reader', /(^|\/)(main|userscript|userscript-entry|reader-boot|popup-|popover-|card-|dom|settings|settings-form|styles|browser-ui|i18n|storage|logger|jpdb|jpdb-.*|deinflect|nested-text-parse|word-pills)\.(ts|css)$/],
];

const json = process.argv.includes('--json');
const dist = await Promise.all(DIST_FILES.map(readDistSize));
const sourceFiles = await listFiles(new URL('src/reader/', ROOT));
const sourceBuckets = await bucketSourceSizes(sourceFiles);
const report = {
    generatedAt: new Date().toISOString(),
    dist,
    sourceBuckets,
    notes: [
        'dist sizes are exact for current build artifacts; run npm run build before this report for fresh bundle evidence.',
        'sourceBuckets are pre-bundle approximations grouped by feature filename patterns, useful for lazy-loading candidates but not a replacement for a bundler analyzer.',
    ],
};

if (json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    printReport(report);
}

async function readDistSize(relativePath) {
    const fileUrl = new URL(relativePath, ROOT);
    try {
        const buffer = await readFile(fileUrl);
        return {
            file: relativePath,
            rawBytes: buffer.length,
            gzipBytes: gzipSync(buffer).length,
            brotliBytes: brotliCompressSync(buffer).length,
        };
    } catch (error) {
        return {
            file: relativePath,
            missing: true,
            error: String(error?.code || error?.message || error),
        };
    }
}

async function listFiles(dirUrl) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
        if (entry.isDirectory()) return listFiles(child);
        if (!/\.(ts|css|svg)$/u.test(entry.name)) return [];
        return [child];
    }));
    return files.flat();
}

async function bucketSourceSizes(files) {
    const buckets = new Map(FEATURE_BUCKETS.map(([name]) => [name, { feature: name, files: 0, rawBytes: 0 }]));
    buckets.set('unbucketed', { feature: 'unbucketed', files: 0, rawBytes: 0 });
    for (const file of files) {
        const relative = path.relative(pathFromUrl(ROOT), pathFromUrl(file)).replaceAll(path.sep, '/');
        const fileStat = await stat(file);
        const bucket = FEATURE_BUCKETS.find(([, pattern]) => pattern.test(relative))?.[0] ?? 'unbucketed';
        const entry = buckets.get(bucket);
        entry.files += 1;
        entry.rawBytes += fileStat.size;
    }
    return Array.from(buckets.values())
        .filter(bucket => bucket.files > 0)
        .sort((a, b) => b.rawBytes - a.rawBytes);
}

function pathFromUrl(url) {
    return fileURLToPath(url);
}

function printReport(report) {
    console.log('Yomu bundle size report');
    console.log('');
    console.log('Current dist artifacts');
    console.log('| file | raw | gzip | brotli |');
    console.log('| --- | ---: | ---: | ---: |');
    for (const item of report.dist) {
        if (item.missing) {
            console.log(`| ${item.file} | missing | missing | missing |`);
            continue;
        }
        console.log(`| ${item.file} | ${formatBytes(item.rawBytes)} | ${formatBytes(item.gzipBytes)} | ${formatBytes(item.brotliBytes)} |`);
    }
    console.log('');
    console.log('Source feature buckets');
    console.log('| feature | files | raw source |');
    console.log('| --- | ---: | ---: |');
    for (const bucket of report.sourceBuckets) {
        console.log(`| ${bucket.feature} | ${bucket.files} | ${formatBytes(bucket.rawBytes)} |`);
    }
    console.log('');
    for (const note of report.notes) console.log(`- ${note}`);
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KiB`;
}
