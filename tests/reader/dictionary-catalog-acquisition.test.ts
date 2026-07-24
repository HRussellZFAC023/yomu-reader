import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAcquisitionQueue } from '../../scripts/dictionaries/acquire.mjs';
import { parsePublicDriveFolderHtml } from '../../scripts/dictionaries/drive-inventory.mjs';
import { ingestVerifiedConnectorManifest } from '../../scripts/dictionaries/ingest-verified-connector-manifest.mjs';
import { buildUploadPlan, uploadDictionaryRelease } from '../../scripts/dictionaries/upload.mjs';

describe('dictionary acquisition safety', () => {
    it('parses public Drive rows into recursive folders and direct download files', () => {
        const html = `
          <table>
            <tr data-selectable data-id="folder_123" class="qwPkcb RDfNAe">
              <td><strong class="DNoYtb">Nested &amp; useful</strong></td>
            </tr>
            <tr data-selectable data-id="file_456" class="qwPkcb">
              <td><strong class="DNoYtb">[JA-EN] Sample.zip</strong></td>
            </tr>
          </table>
        `;

        expect(parsePublicDriveFolderHtml(html, { id: 'root', path: 'Japanese' })).toEqual([
            expect.objectContaining({
                id: 'folder_123',
                name: 'Nested & useful',
                kind: 'folder',
                relativePath: 'Japanese/Nested & useful',
                sourceUrl: 'https://drive.google.com/drive/folders/folder_123',
            }),
            expect.objectContaining({
                id: 'file_456',
                name: '[JA-EN] Sample.zip',
                kind: 'file',
                relativePath: 'Japanese/[JA-EN] Sample.zip',
                sourceUrl: 'https://drive.usercontent.google.com/download?id=file_456&export=download&confirm=t',
            }),
        ]);
    });

    it('deduplicates repeated Drive file IDs while preserving direct sources', async () => {
        const queue = await buildAcquisitionQueue({
            sources: [{
                id: 'jmdict-en',
                filename: 'JMdict_english.zip',
                url: 'https://example.test/JMdict_english.zip',
                acquisitionReview: 'allowed',
                redistributionReview: 'allowed',
            }],
            collections: [{
                id: 'drive',
                method: 'google-drive-folder',
                acquisitionReview: 'allowed',
                redistributionReview: 'per-artifact',
            }],
        }, {
            collections: [{
                collectionId: 'drive',
                entries: [
                    { id: 'same', name: 'one.zip', relativePath: 'Japanese/one.zip', sourceUrl: 'https://drive.example/same' },
                    { id: 'same', name: 'duplicate.zip', relativePath: 'Starter/duplicate.zip', sourceUrl: 'https://drive.example/same' },
                ],
            }],
        });

        expect(queue).toHaveLength(2);
        expect(queue.map(item => item.sourceId)).toEqual(['drive-same', 'jmdict-en']);
    });

    it('keeps R2 upload non-mutating by default and requires an exact bucket confirmation', async () => {
        await expect(uploadDictionaryRelease([], {
            execute: false,
            bucket: 'yomu-dictionaries',
        })).resolves.toEqual({ mode: 'dry-run', uploads: [] });
        await expect(uploadDictionaryRelease([], {
            execute: true,
            bucket: 'yomu-dictionaries',
            confirmBucket: 'wrong-bucket',
        })).rejects.toThrow(/--confirm-bucket yomu-dictionaries/);
    });

    it('falls back to the tracked published snapshot, never the pre-publication acquisition manifests', async () => {
        const root = await mkdtemp(join(tmpdir(), 'yomu-dictionary-upload-'));
        const publishedRoot = join(root, 'published', 'v1');
        const stagingRoot = join(root, 'staging');
        const releaseRoot = join(root, 'missing-release');
        const archive = Buffer.from('verified dictionary fixture');
        const sha256 = createHash('sha256').update(archive).digest('hex');
        const objectKey = `objects/sha256/${sha256}.zip`;
        try {
            await mkdir(join(publishedRoot, 'recommendations'), { recursive: true });
            await mkdir(join(stagingRoot, 'objects', 'sha256'), { recursive: true });
            await writeFile(join(publishedRoot, 'catalog.json'), JSON.stringify({
                schemaVersion: 1,
                entries: [{
                    id: 'fixture',
                    distribution: {
                        state: 'published',
                        object: { key: objectKey, sha256, bytes: archive.byteLength },
                    },
                }],
            }));
            const languages = Array.from({ length: 32 }, (_, index) => ({ tag: `fixture-${index + 1}` }));
            await writeFile(join(publishedRoot, 'languages.json'), JSON.stringify({ schemaVersion: 1, count: 32, languages }));
            for (const [index, language] of languages.entries()) {
                await writeFile(
                    join(publishedRoot, 'recommendations', `${String(index + 1).padStart(2, '0')}-ja.json`),
                    JSON.stringify({
                        schemaVersion: 1,
                        learnerLanguage: language.tag,
                        targetLanguage: 'ja',
                        readiness: 'ready',
                        blockers: [],
                        dictionaries: [{ dictionaryId: 'fixture' }],
                    }),
                );
            }
            await writeFile(join(stagingRoot, objectKey), archive);

            const plan = await buildUploadPlan({
                releaseRoot,
                publishedManifestRoot: publishedRoot,
                stagingRoot,
            });

            expect(plan).toHaveLength(35);
            expect(plan.map(item => item.key)).toContain('v1/recommendations/01-ja.json');
            expect(plan.map(item => item.key)).toContain('v1/recommendations/32-ja.json');
            expect(plan.map(item => item.key)).toContain(objectKey);
            expect(plan[0]?.path).toBe(join(publishedRoot, 'catalog.json'));
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('ingests the full connector inventory under the confirmed rights decision', () => {
        const sha256 = 'c'.repeat(64);
        const connectorEntries = Array.from({ length: 173 }, (_, index) => ({
            catalogId: index === 0 ? 'drive-sample' : `drive-sample-${index}`,
            sourceId: `drive-file-${index + 1}`,
            title: `Drive sample ${index + 1}`,
            version: '2026-07-23',
            categories: ['terms'],
            headwordLanguages: ['ja'],
            definitionLanguages: ['ko'],
            sourceUrl: `https://drive.example/sample-${index + 1}`,
            attribution: 'Confirmed frozen collection',
            ...(index === 0 ? {
                object: {
                    key: `objects/sha256/${sha256}.zip`,
                    sha256,
                    bytes: 42,
                    contentType: 'application/zip',
                },
            } : {}),
        }));
        const result = ingestVerifiedConnectorManifest({
            schemaVersion: 1,
            revision: 'frozen',
            entries: [],
        }, {
            schemaVersion: 1,
            snapshotRevision: 'frozen',
            expectedEntryCount: 173,
            redistributionRightsConfirmed: true,
            entries: connectorEntries,
        });

        expect(result.entries).toHaveLength(173);
        expect(result.entries).toContainEqual(
            expect.objectContaining({
                id: 'drive-sample',
                license: expect.objectContaining({ redistribution: 'allowed' }),
                distribution: expect.objectContaining({ state: 'published' }),
            }),
        );
    });
});
