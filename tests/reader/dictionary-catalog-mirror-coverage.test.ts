import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    assertEntriesAreAcquirable,
    assertPublishedObjectsResolvable,
    assertStagedEntriesReachPublished,
    assertUnmirroredEntriesAreExplorable,
    assertUpstreamCoverage,
} from '../../scripts/dictionaries/coverage.mjs';
import { crawlPublicDriveFolder } from '../../scripts/dictionaries/drive-inventory.mjs';
import { ingestVerifiedConnectorManifest } from '../../scripts/dictionaries/ingest-verified-connector-manifest.mjs';
import { prepareDictionaryRelease } from '../../scripts/dictionaries/prepare-release.mjs';
import { buildUploadPlan } from '../../scripts/dictionaries/upload.mjs';
import {
    SLICE1_LEARNER_LANGUAGES,
    SLICE1_TARGET_LANGUAGES,
    parseDictionaryCatalogManifest,
} from '../../src/reader/dictionaries/catalog';

const CONFIG_ROOT = resolve(process.cwd(), 'config/dictionaries');

async function json<T = any>(path: string): Promise<T> {
    return JSON.parse(await readFile(path, 'utf8')) as T;
}

const published = () => json(resolve(CONFIG_ROOT, 'published/v1/catalog.json'));
const staged = () => json(resolve(CONFIG_ROOT, 'manifests/v1/catalog.json'));
const ledger = () => json(resolve(CONFIG_ROOT, 'mirror-objects.v1.json'));
const coverage = () => json(resolve(CONFIG_ROOT, 'upstream-coverage.v1.json'));
const acquisition = () => json(resolve(CONFIG_ROOT, 'acquisition.v1.json'));

describe('published dictionary objects resolve', () => {
    it('accepts the shipped catalogue: every published entry names an object the mirror was observed to serve', async () => {
        const result = assertPublishedObjectsResolvable(await published(), await ledger());

        expect(result.publishedEntries).toBeGreaterThan(0);
        expect(result.ledgerObjects).toBeGreaterThan(0);
    });

    it('refuses a published entry whose object was never uploaded, because Settings renders it as a 404 Install button', async () => {
        const catalog = structuredClone(await published()) as { entries: any[] };
        const observed = structuredClone(await ledger()) as any;
        const victim = catalog.entries.find(entry => entry.distribution.state === 'published');
        expect(victim).toBeDefined();
        const invented = 'f'.repeat(64);
        victim.distribution.object = {
            key: `objects/sha256/${invented}.zip`,
            sha256: invented,
            bytes: 1234,
            contentType: 'application/zip',
        };

        expect(() => assertPublishedObjectsResolvable(catalog, observed))
            .toThrow(/never been observed to serve/);
    });

    it('refuses a published entry whose recorded size disagrees with the object the mirror serves', async () => {
        const catalog = structuredClone(await published()) as { entries: any[] };
        const observed = structuredClone(await ledger()) as any;
        const victim = catalog.entries.find(entry => entry.distribution.state === 'published');
        victim.distribution.object.bytes += 1;

        expect(() => assertPublishedObjectsResolvable(catalog, observed)).toThrow(/but the mirror serves/);
    });

    it('refuses an empty ledger rather than passing a catalogue nothing was checked against', async () => {
        const catalog = await published();

        expect(() => assertPublishedObjectsResolvable(catalog, { schemaVersion: 1, objects: [] }))
            .toThrow(/ledger is empty/);
        expect(() => assertPublishedObjectsResolvable({ entries: [] }, { schemaVersion: 1, objects: [] }))
            .toThrow(/ledger is empty/);
    });
});

describe('staged dictionary entries reach publication', () => {
    it('publishes every entry the pre-release manifests carry', async () => {
        const result = assertStagedEntriesReachPublished(await staged(), await published());

        expect(result.stagedEntries).toBeGreaterThan(0);
        expect(result.publishedEntries).toBeGreaterThanOrEqual(result.stagedEntries);
    });

    it('names the staged entries a release would drop', async () => {
        const publishedCatalog = structuredClone(await published()) as { entries: any[] };
        const stagedCatalog = await staged() as { entries: any[] };
        const dropped = stagedCatalog.entries[0].id;
        publishedCatalog.entries = publishedCatalog.entries.filter(entry => entry.id !== dropped);

        expect(() => assertStagedEntriesReachPublished(stagedCatalog, publishedCatalog))
            .toThrow(new RegExp(`never reached the published catalogue: ${dropped}`));
    });
});

describe('upstream coverage', () => {
    it('accounts for every surveyed upstream artifact', async () => {
        const result = assertUpstreamCoverage(await coverage(), await published());

        expect(result.artifacts).toBeGreaterThan(0);
        expect(result.collections).toBeGreaterThan(0);
    });

    it('catalogues every upstream artifact the mirror does not serve, as a source-only entry', async () => {
        const catalog = await published() as { entries: any[] };
        const byId = new Map(catalog.entries.map(entry => [entry.id, entry]));
        const gaps = (await coverage() as any).collections
            .flatMap((collection: any) => collection.artifacts ?? [])
            .filter((artifact: any) => artifact.disposition === 'catalogued-not-mirrored');

        expect(gaps.length).toBeGreaterThan(0);
        for (const gap of gaps) {
            for (const id of gap.catalogEntryIds) {
                const entry = byId.get(id);
                expect(entry, `${gap.path} -> ${id}`).toBeDefined();
                expect(entry.distribution.state, `${gap.path} -> ${id}`).toBe('source-only');
                expect(entry.source.url, `${gap.path} -> ${id}`).toBe(gap.downloadUrl);
            }
        }
    });

    it('fails when an upstream artifact loses its catalogue entry', async () => {
        const catalog = structuredClone(await published()) as { entries: any[] };
        const record = await coverage() as any;
        const gap = record.collections
            .flatMap((collection: any) => collection.artifacts ?? [])
            .find((artifact: any) => artifact.disposition === 'catalogued-not-mirrored');
        catalog.entries = catalog.entries.filter(entry => entry.id !== gap.catalogEntryIds[0]);

        expect(() => assertUpstreamCoverage(record, catalog)).toThrow(/does not exist/);
    });

    it('fails when an artifact recorded as mirrored has no published object behind it', async () => {
        const catalog = structuredClone(await published()) as { entries: any[] };
        const record = await coverage() as any;
        const mirrored = record.collections
            .flatMap((collection: any) => collection.artifacts ?? [])
            .find((artifact: any) => artifact.disposition === 'mirrored' && artifact.sha256);
        for (const entry of catalog.entries) {
            if (entry.distribution.state === 'published' && entry.distribution.object.sha256 === mirrored.sha256) {
                entry.distribution = { state: 'source-only' };
            }
        }

        expect(() => assertUpstreamCoverage(record, catalog)).toThrow(/recorded as mirrored/);
    });
});

describe('unmirrored catalogue rows stay actionable', () => {
    it('gives every catalogue row without an object somewhere to send the reader', async () => {
        const result = assertUnmirroredEntriesAreExplorable(await published());

        expect(result.unmirroredEntries).toBeGreaterThan(0);
    });

    it('fails when an unmirrored row would render as a name with no action', async () => {
        const catalog = structuredClone(await published()) as { entries: any[] };
        const victim = catalog.entries.find(entry => entry.distribution.state !== 'published');
        expect(victim).toBeDefined();
        delete victim.source.projectUrl;

        expect(() => assertUnmirroredEntriesAreExplorable(catalog)).toThrow(/no source\.projectUrl/);
    });
});

describe('catalogue entries stay acquirable', () => {
    it('gives every catalogue entry an acquisition source a mirroring run can fetch', async () => {
        const result = assertEntriesAreAcquirable(await published(), await acquisition());

        expect(result.entries).toBeGreaterThan(0);
    });

    it('fails when an entry names an acquisition source nobody declared', async () => {
        const catalog = structuredClone(await published()) as { entries: any[] };
        const sources = await acquisition();
        catalog.entries.push({
            ...structuredClone(catalog.entries[0]),
            id: 'orphan-entry',
            source: { ...catalog.entries[0].source, acquisitionId: 'nothing-declares-this' },
        });

        expect(() => assertEntriesAreAcquirable(catalog, sources)).toThrow(/orphan-entry -> nothing-declares-this/);
    });
});

describe('the shipped catalogues still satisfy the runtime schema', () => {
    it('parses the published catalogue, source-only rows and all', async () => {
        const manifest = parseDictionaryCatalogManifest(await published());
        const sourceOnly = manifest.entries.filter(entry => entry.distribution.state === 'source-only');

        expect(manifest.entries.length).toBeGreaterThan(0);
        expect(sourceOnly.length).toBeGreaterThan(0);
    });

    it('parses the pre-release catalogue', async () => {
        const catalog = await staged();

        expect(() => parseDictionaryCatalogManifest(catalog)).not.toThrow();
    });
});

describe('the upload plan carries unmirrored catalogue rows', () => {
    async function fixture(entries: unknown[], seedId = 'fixture') {
        const root = await mkdtemp(join(tmpdir(), 'yomu-dictionary-coverage-'));
        const publishedRoot = join(root, 'published', 'v1');
        const stagingRoot = join(root, 'staging');
        await mkdir(join(publishedRoot, 'recommendations'), { recursive: true });
        await mkdir(join(stagingRoot, 'objects', 'sha256'), { recursive: true });
        const normalizedEntries = (entries as any[]).map(entry =>
            entry.id === seedId && !entry.headwordLanguages
                ? { ...entry, headwordLanguages: [...SLICE1_TARGET_LANGUAGES] }
                : entry);
        await writeFile(join(publishedRoot, 'catalog.json'), JSON.stringify({ schemaVersion: 1, entries: normalizedEntries }));
        const languages = SLICE1_LEARNER_LANGUAGES.map(tag => ({ tag }));
        await writeFile(join(publishedRoot, 'languages.json'), JSON.stringify({ schemaVersion: 1, count: 32, languages }));
        await Promise.all(SLICE1_TARGET_LANGUAGES.flatMap(targetLanguage =>
            languages.map(language => {
                const targetSeed = normalizedEntries.find(entry =>
                    entry.distribution?.state === 'published'
                    && entry.headwordLanguages?.includes(targetLanguage))?.id ?? seedId;
                return writeFile(
                join(publishedRoot, 'recommendations', `${language.tag}-${targetLanguage}.json`),
                JSON.stringify({
                    schemaVersion: 1,
                    learnerLanguage: language.tag,
                    targetLanguage,
                    readiness: 'ready',
                    blockers: [],
                    dictionaries: [{ dictionaryId: targetSeed }],
                }),
            )})));
        return { root, publishedRoot, stagingRoot };
    }

    const archive = Buffer.from('verified dictionary fixture');
    const sha256 = 'ff225c3bb266a9c333b4a41855df2549dd519f42fec1eeec24e3f618745c6d4a';
    const objectKey = `objects/sha256/${sha256}.zip`;
    const publishedEntry = {
        id: 'fixture',
        headwordLanguages: [...SLICE1_TARGET_LANGUAGES],
        distribution: { state: 'published', object: { key: objectKey, sha256, bytes: archive.byteLength } },
    };

    it('uploads a catalogue that also describes an upstream dictionary nobody has mirrored yet', async () => {
        const { root, publishedRoot, stagingRoot } = await fixture([
            publishedEntry,
            { id: 'not-mirrored-yet', distribution: { state: 'source-only' } },
        ]);
        try {
            await writeFile(join(stagingRoot, objectKey), archive);

            const plan = await buildUploadPlan({
                releaseRoot: join(root, 'missing-release'),
                publishedManifestRoot: publishedRoot,
                stagingRoot,
            });

            expect(plan.map(item => item.key)).toContain(objectKey);
            expect(plan).toHaveLength(1_059);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    // Builds and scans the complete 32×33 recommendation matrix. Under the
    // release gate's parallel reader pass this is the same measured workload as
    // the full-regeneration shelf case, so give both the same real budget.
    }, 120_000);

    it('still refuses a catalogue that publishes nothing at all', async () => {
        const { root, publishedRoot, stagingRoot } = await fixture([
            { id: 'not-mirrored-yet', distribution: { state: 'source-only' } },
        ]);
        try {
            await expect(buildUploadPlan({
                releaseRoot: join(root, 'missing-release'),
                publishedManifestRoot: publishedRoot,
                stagingRoot,
            })).rejects.toThrow(/publishes nothing/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 30000);

    it('publishes a catalogue-only correction without a staging tree, and still refuses one whose objects are unknown', async () => {
        const { root, publishedRoot, stagingRoot } = await fixture(
            (await published() as { entries: any[] }).entries,
            'jmdict-en',
        );
        try {
            const plan = await buildUploadPlan({
                releaseRoot: join(root, 'missing-release'),
                publishedManifestRoot: publishedRoot,
                stagingRoot,
                manifestsOnly: true,
            });

            expect(plan).toHaveLength(1_058);
            expect(plan.every(item => !item.key.startsWith('objects/sha256/'))).toBe(true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }

        const unknown = await fixture([{
            id: 'invented',
            distribution: {
                state: 'published',
                object: { key: `objects/sha256/${'e'.repeat(64)}.zip`, sha256: 'e'.repeat(64), bytes: 7 },
            },
        }], 'invented');
        try {
            await expect(buildUploadPlan({
                releaseRoot: join(unknown.root, 'missing-release'),
                publishedManifestRoot: unknown.publishedRoot,
                stagingRoot: unknown.stagingRoot,
                manifestsOnly: true,
            })).rejects.toThrow(/never been observed to serve/);
        } finally {
            await rm(unknown.root, { recursive: true, force: true });
        }
    }, 30000);

    it('still refuses a recommendation manifest that seeds an unmirrored dictionary', async () => {
        const { root, publishedRoot, stagingRoot } = await fixture([
            publishedEntry,
            { id: 'not-mirrored-yet', distribution: { state: 'source-only' } },
        ]);
        try {
            await writeFile(join(stagingRoot, objectKey), archive);
            await writeFile(
                join(publishedRoot, 'recommendations', 'sq-ja.json'),
                JSON.stringify({
                    schemaVersion: 1,
                    learnerLanguage: 'sq',
                    targetLanguage: 'ja',
                    readiness: 'ready',
                    blockers: [],
                    dictionaries: [{ dictionaryId: 'not-mirrored-yet' }],
                }),
            );

            await expect(buildUploadPlan({
                releaseRoot: join(root, 'missing-release'),
                publishedManifestRoot: publishedRoot,
                stagingRoot,
            })).rejects.toThrow(/references unpublished dictionary not-mirrored-yet/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 30000);
});

describe('the release pipeline carries the unmirrored rows', () => {
    it('keeps every pre-release entry when the connector inventory is merged in', async () => {
        const base = await staged() as { revision: string; entries: any[] };
        const connectorEntries = Array.from({ length: 173 }, (_, index) => ({
            catalogId: `drive-fixture-${index + 1}`,
            sourceId: `drive-file-${index + 1}`,
            title: `Drive fixture ${index + 1}`,
            version: '2026-07-23',
            categories: ['terms'],
            headwordLanguages: ['ja'],
            definitionLanguages: ['en'],
            sourceUrl: `https://drive.example/sample-${index + 1}`,
            attribution: 'Confirmed frozen collection',
        }));

        const merged = ingestVerifiedConnectorManifest(base, {
            schemaVersion: 1,
            snapshotRevision: base.revision,
            expectedEntryCount: 173,
            redistributionRightsConfirmed: true,
            entries: connectorEntries,
        });
        const mergedIds = new Set(merged.entries.map((entry: any) => entry.id));

        for (const entry of base.entries) expect(mergedIds.has(entry.id), entry.id).toBe(true);
        expect(merged.entries).toHaveLength(base.entries.length + 173);
    });

    it('reports a dry run that still holds every pre-release entry', async () => {
        const base = await staged() as { entries: any[] };
        const stagingRoot = await mkdtemp(join(tmpdir(), 'yomu-dictionary-prepare-'));
        try {
            await writeFile(join(stagingRoot, 'acquisition-ledger.v1.json'), JSON.stringify({ schemaVersion: 1, artifacts: [] }));

            const summary = await prepareDictionaryRelease({ stagingRoot });

            expect(summary.catalogEntries).toBe(base.entries.length);
            expect(summary.promotedObjects).toBe(0);
        } finally {
            await rm(stagingRoot, { recursive: true, force: true });
        }
    }, 30000);
});

describe('the public Drive crawler refuses a truncated page', () => {
    const row = (id: string, name: string) =>
        `<tr data-selectable data-id="${id}" class="qwPkcb"><td><strong class="DNoYtb">${name}</strong></td></tr>`;

    const crawlWithRows = (count: number, pageRowCap: number) => crawlPublicDriveFolder({
        folderUrl: 'https://drive.google.com/drive/folders/root',
        recurse: false,
        includeExtensions: ['.zip'],
        pageRowCap,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => `<table>${Array.from({ length: count }, (_, index) => row(`file_${index}`, `dict-${index}.zip`)).join('')}</table>`,
        }),
    });

    it('fails on a full first page instead of reporting a short inventory as complete', async () => {
        await expect(crawlWithRows(50, 50)).rejects.toThrow(/anonymous page limit of 50/);
    });

    it('accepts a page that is not full', async () => {
        const inventory = await crawlWithRows(49, 50);

        expect(inventory.entries).toHaveLength(49);
    });
});
