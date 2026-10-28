import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAcquisitionQueue } from '../../scripts/dictionaries/acquire.mjs';
import {
    applyLanguageReadiness,
    mergePublishedBase,
} from '../../scripts/dictionaries/prepare-release.mjs';
import {
    mergeWtySnapshot,
    wtyCatalogEntry,
} from '../../scripts/dictionaries/sync-wty-release.mjs';
import {
    buildAcquiredObjectUploadPlan,
    remoteObjectMatches,
} from '../../scripts/dictionaries/upload.mjs';
import { fetchMirrorHead } from '../../scripts/dictionaries/record-mirror-objects.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

const artifact = {
    id: 'wty-sq-en',
    path: 'latest/dict/sq/en/wty-sq-en.zip',
    filename: 'wty-sq-en.zip',
    headwordLanguage: 'sq',
    definitionLanguage: 'en',
    category: 'terms',
    variant: 'terms',
    bytes: 42,
    sha256: 'a'.repeat(64),
};

const snapshot = {
    schemaVersion: 1,
    dataset: 'daxida/wty-release',
    datasetCommit: 'b'.repeat(40),
    generatedAt: '2026-07-29T00:00:00.000Z',
    roster: ['sq'],
    pairDirectories: 1,
    archiveCount: 1,
    totalBytes: 42,
    missingExpectedPaths: ['latest/dict/sq/en/wty-sq-en-ipa.zip'],
    alternatePaths: [],
    artifacts: [artifact],
};

describe('WTY release snapshot generation', () => {
    it('pins acquisition to the dataset commit and the API-reported SHA-256', async () => {
        const merged = mergeWtySnapshot({
            snapshot,
            acquisition: { sources: [], collections: [] },
            catalog: { revision: 'base', entries: [] },
            languages: {
                languages: [{
                    tag: 'sq',
                    catalogueEvidence: ['base'],
                }],
            },
            coverage: { collections: [] },
        });
        const source = merged.acquisition.sources[0];

        expect(source.url).toContain(`/resolve/${snapshot.datasetCommit}/${artifact.path}`);
        expect(source.sha256).toBe(artifact.sha256);
        expect(source.bytes).toBe(artifact.bytes);
        expect(merged.catalog.entries).toEqual([expect.objectContaining({
            id: artifact.id,
            categories: ['terms'],
            headwordLanguages: ['sq'],
            definitionLanguages: ['en'],
            license: expect.objectContaining({ redistribution: 'allowed' }),
        })]);
        expect(merged.languages.languages[0]).toMatchObject({
            readiness: 'blocked',
            blockers: ['dictionary-objects-not-yet-mirrored'],
            dictionaryCoverage: {
                wtyPairDirectories: 1,
                upstreamMissingArchives: 1,
            },
        });
    });

    it('declares IPA archives as pronunciation data', () => {
        const entry = wtyCatalogEntry(snapshot, {
            ...artifact,
            id: 'wty-sq-en-ipa',
            filename: 'wty-sq-en-ipa.zip',
            path: 'latest/dict/sq/en/wty-sq-en-ipa.zip',
            category: 'pronunciation',
            variant: 'ipa',
        });

        expect(entry.categories).toEqual(['pronunciation']);
    });

    it('passes expected hashes and byte counts into the acquisition queue', async () => {
        const [queued] = await buildAcquisitionQueue({
            sources: [{
                id: artifact.id,
                filename: artifact.filename,
                url: 'https://example.test/wty.zip',
                acquisitionReview: 'allowed',
                redistributionReview: 'allowed',
                sha256: artifact.sha256,
                bytes: artifact.bytes,
            }],
        });

        expect(queued).toMatchObject({
            expectedSha256: artifact.sha256,
            expectedBytes: artifact.bytes,
        });
    });
});

describe('WTY release preservation and readiness', () => {
    it('keeps published connector rows and published objects while overlaying generated rows', () => {
        const preservedObject = {
            key: `objects/sha256/${'c'.repeat(64)}.zip`,
            sha256: 'c'.repeat(64),
            bytes: 7,
            contentType: 'application/zip',
        };
        const merged = mergePublishedBase({
            entries: [
                { id: 'drive-existing', distribution: { state: 'published', object: preservedObject } },
                { id: 'jmdict-en', title: 'old', distribution: { state: 'published', object: preservedObject } },
            ],
        }, {
            revision: 'new',
            entries: [
                { id: 'jmdict-en', title: 'new', distribution: { state: 'source-only' } },
                { id: 'wty-sq-en', distribution: { state: 'source-only' } },
            ],
        });

        expect(merged.entries.map((entry: { id: string }) => entry.id)).toEqual([
            'drive-existing',
            'jmdict-en',
            'wty-sq-en',
        ]);
        expect(merged.entries[1]).toMatchObject({
            title: 'new',
            distribution: { state: 'published', object: preservedObject },
        });
    });

    it('marks only targets with published terms ready and records partial upstream coverage', () => {
        const result = applyLanguageReadiness({
            revision: 'old',
            generatedAt: '2026-01-01T00:00:00.000Z',
            languages: [{ tag: 'sq' }, { tag: 'lo' }],
        }, {
            revision: 'new',
            generatedAt: '2026-07-29T00:00:00.000Z',
            entries: [{
                id: 'wty-sq-en',
                categories: ['terms'],
                headwordLanguages: ['sq'],
                definitionLanguages: ['en'],
                distribution: { state: 'published' },
            }],
        }, {
            artifacts: [artifact],
            missingExpectedPaths: snapshot.missingExpectedPaths,
        });

        expect(result.languages[0]).toMatchObject({
            readiness: 'ready',
            blockers: [],
            dictionaryCoverage: {
                publishedEntries: 1,
                terms: 1,
                pronunciation: 0,
                definitionLanguages: ['en'],
                wtyPairDirectories: 1,
                upstreamMissingArchives: 1,
            },
        });
        expect(result.languages[1]).toMatchObject({
            readiness: 'blocked',
            blockers: ['no-published-terms-dictionary'],
        });
    });
});

describe('acquired-object batch upload planning', () => {
    it('uploads only objects still present in the bounded local batch and rehashes them', async () => {
        const root = await mkdtemp(join(tmpdir(), 'yomu-wty-upload-'));
        temporaryDirectories.push(root);
        const bytes = Buffer.from('batch dictionary');
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const key = `objects/sha256/${sha256}.zip`;
        await mkdir(join(root, 'objects', 'sha256'), { recursive: true });
        await writeFile(join(root, key), bytes);
        await writeFile(join(root, 'acquisition-ledger.v1.json'), JSON.stringify({
            schemaVersion: 1,
            artifacts: [
                { object: { key, sha256, bytes: bytes.byteLength } },
                {
                    object: {
                        key: `objects/sha256/${'d'.repeat(64)}.zip`,
                        sha256: 'd'.repeat(64),
                        bytes: 99,
                    },
                },
            ],
        }));

        const plan = await buildAcquiredObjectUploadPlan({ stagingRoot: root });

        expect(plan).toHaveLength(1);
        expect(plan[0]).toMatchObject({
            key,
            contentType: 'application/zip',
        });
        expect(await readFile(plan[0].path)).toEqual(bytes);
    });

    it('retries a transient public-mirror HEAD before deciding whether to resume', async () => {
        const sha256 = 'e'.repeat(64);
        const fetchImplementation = vi.fn()
            .mockRejectedValueOnce(new Error('socket closed'))
            .mockResolvedValue(new Response(null, {
                status: 200,
                headers: {
                    'content-length': '42',
                    'x-content-sha256': sha256,
                },
            }));
        const waits: number[] = [];

        const matches = await remoteObjectMatches(
            'https://dictionaries.example.test',
            `objects/sha256/${sha256}.zip`,
            42,
            {
                fetchImplementation,
                wait: async (milliseconds: number) => {
                    waits.push(milliseconds);
                },
            },
        );

        expect(matches).toBe(true);
        expect(fetchImplementation).toHaveBeenCalledTimes(2);
        expect(waits).toEqual([500]);
    });
});

describe('public mirror evidence recording', () => {
    it('retries transient HEAD failures before recording an object', async () => {
        const fetchImplementation = vi.fn()
            .mockRejectedValueOnce(new Error('connect timed out'))
            .mockResolvedValue(new Response(null, {
                status: 200,
                headers: {
                    'content-length': '42',
                    'x-content-sha256': 'f'.repeat(64),
                },
            }));
        const waits: number[] = [];

        const response = await fetchMirrorHead('https://dictionaries.example.test/object.zip', {
            fetchImplementation,
            wait: async (milliseconds: number) => {
                waits.push(milliseconds);
            },
        });

        expect(response.status).toBe(200);
        expect(fetchImplementation).toHaveBeenCalledTimes(2);
        expect(waits).toEqual([500]);
    });
});
