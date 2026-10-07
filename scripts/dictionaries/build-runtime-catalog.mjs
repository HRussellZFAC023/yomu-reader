#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const publishedPath = path.join(root, 'config', 'dictionaries', 'published', 'v1', 'catalog.json');
const runtimePath = path.join(root, 'config', 'dictionaries', 'published', 'v1', 'runtime-catalog.json');
const catalog = JSON.parse(await readFile(publishedPath, 'utf8'));
// Yomu reads Japanese only (ADR-0024): the app carries the Japanese-headword
// dictionaries. The published catalogue keeps every entry.
const entries = catalog.entries.filter(entry => entry.headwordLanguages.includes('ja'));

const archiveRevisions = sharedArchiveRevisions(entries);
const runtime = {
    revision: catalog.revision,
    objectsBaseUrl: catalog.objectsBaseUrl,
    archiveRevisions,
    entries: entries.map(entry => [
        entry.id,
        entry.title,
        entry.installedTitle ?? null,
        entry.categories,
        entry.headwordLanguages,
        entry.definitionLanguages,
        entry.source.projectUrl ?? null,
        entry.source.catalogueSection ?? null,
        compactDistribution(entry.distribution),
        ...revisionColumn(entry),
    ]),
};

const output = `${JSON.stringify(runtime, null, 2)}\n`;
if (process.argv.includes('--check')) {
    if (await readFile(runtimePath, 'utf8') !== output) {
        throw new Error('Runtime dictionary catalog is stale relative to published catalog.json. Run node scripts/dictionaries/build-runtime-catalog.mjs.');
    }
} else {
    await writeFile(runtimePath, output);
    console.log(`Built runtime dictionary catalog with ${runtime.entries.length} entries.`);
}

/**
 * The published archive's own index.json revision, for the seed-card families
 * that compare it with an install: JMdict, JMnedict, KANJIDIC and WTY. A card
 * compares it number by number with the revision the install recorded from its
 * own index.json ("kanjidic2.2026-204" against an upstream "kanjidic2.2026-277"),
 * which a catalogue version cannot do: KANJIDIC's "2026-07-23" is a release date
 * and WTY's is a dataset commit. Every WTY build titled "wty-*" stamps its build
 * day ("2026.07.15"). A card that carries a revision matches installs only by
 * URL or exact identity (dictionary-recommendations-view.ts). Drive copies stay
 * out: their seed cards rely on title tokens, and the JPDB Kana card's
 * hand-listed ones count any "jpdbv2" title as its own, so a revision there
 * could call a different build Installed.
 */
function comparableRevision({ id, distribution }) {
    const revision = distribution.state === 'published' ? distribution.object.revision : undefined;
    return revision && /^(jmdict-|jmnedict$|kanjidic-|wty-)/u.test(id) ? revision : null;
}

/**
 * A family's archives mostly share one revision (1,428 of 1,440 WTY archives
 * were built on 2026.07.15), so the projection stores each family's most common
 * revision once, keyed by the id's first word. An entry of that family carries
 * its own only when it differs, and null when it has none.
 */
function sharedArchiveRevisions(entries) {
    const tallies = {};
    for (const entry of entries) {
        const revision = comparableRevision(entry);
        if (!revision) continue;
        const tally = tallies[archiveFamily(entry.id)] ??= {};
        tally[revision] = (tally[revision] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(tallies).map(([family, tally]) => [
        family,
        Object.keys(tally).sort((left, right) => tally[right] - tally[left] || left.localeCompare(right))[0],
    ]));
}

function revisionColumn(entry) {
    const family = archiveFamily(entry.id);
    if (!Object.hasOwn(archiveRevisions, family)) return [];
    const revision = comparableRevision(entry);
    return revision === archiveRevisions[family] ? [] : [revision];
}

function archiveFamily(id) {
    return id.split('-')[0];
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
