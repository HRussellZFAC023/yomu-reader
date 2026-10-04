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
        ...comparableRevision(entry),
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

/**
 * The catalogue `version` a card may compare installs against, number by number,
 * where it orders like the archive's own index.json `revision`. Audited on
 * 2026-10-04 against every mirrored archive: the frozen JMdict/JMnedict date
 * has the same numbers as "JMdict.2026-07-23", and those seed cards match
 * installs by exact identity. A Drive copy's version is its revision too, but
 * its seed card matches loosely (any "jpdbv2" title is the JPDB Kana card), so
 * a revision there could call a different build Installed and hide the card.
 * KANJIDIC's revision counts days ("kanjidic2.2026-204") and WTY's version is a
 * dataset commit, so those stay unknown.
 */
function comparableRevision({ id, version, distribution }) {
    return distribution.state === 'published' && /^(jmdict-|jmnedict$)/u.test(id)
        && /(?<!\d-)\d{4}/u.test(version) ? [version] : [];
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
