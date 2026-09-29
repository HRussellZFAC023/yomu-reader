#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const publishedPath = path.join(root, 'config', 'dictionaries', 'published', 'v1', 'catalog.json');
const runtimePath = path.join(root, 'config', 'dictionaries', 'published', 'v1', 'runtime-catalog.json');
const catalog = JSON.parse(await readFile(publishedPath, 'utf8'));

const runtime = {
    revision: catalog.revision,
    objectsBaseUrl: catalog.objectsBaseUrl,
    entries: catalog.entries.map(entry => [
        entry.id,
        entry.title,
        entry.installedTitle ?? null,
        entry.categories,
        entry.headwordLanguages,
        entry.definitionLanguages,
        entry.source.projectUrl ?? null,
        entry.source.catalogueSection ?? null,
        compactDistribution(entry.distribution),
    ]),
};

const output = `${JSON.stringify(runtime, null, 2)}\n`;
if (process.argv.includes('--check')) {
    if (await readFile(runtimePath, 'utf8') !== output) {
        throw new Error('Runtime dictionary catalog is stale relative to published catalog.json. Run node scripts/dictionaries/build-runtime-catalog.mjs before generating offline starters.');
    }
} else {
    await writeFile(runtimePath, output);
    console.log(`Built runtime dictionary catalog with ${runtime.entries.length} entries.`);
}

function compactDistribution(distribution) {
    switch (distribution.state) {
        case 'published':
            return ['published', distribution.object.sha256, distribution.object.bytes];
        case 'upstream':
            return ['upstream', distribution.archive.url, distribution.archive.bytes ?? null];
        case 'blocked':
            return ['blocked', distribution.reason];
        default:
            return ['source-only'];
    }
}
