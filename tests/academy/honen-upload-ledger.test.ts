import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
    appendExternalSource,
    initialiseUploadLedger,
    recordImport,
    summariseUploadLedger,
} from '../../scripts/academy-honen/upload-ledger.mjs';

function hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

describe('Honen upload ledger', () => {
    test('preserves only byte-identical completed receipts across regeneration', () => {
        const batches = {
            generatedAt: '2026-07-25T00:00:00.000Z',
            libraryRoot: '/library',
            batches: [{
                id: 'batch-0001',
                group: '01-n5-foundations/Genki',
                files: [{
                    sourceId: 'jp-source',
                    relativePath: 'Genki/lesson-1.txt',
                    sha256: 'a'.repeat(64),
                    byteLength: 42,
                }],
            }],
        };
        const existing = {
            entries: [{
                sourceId: 'jp-source',
                relativePath: 'Genki/lesson-1.txt',
                sha256: 'a'.repeat(64),
                status: 'imported',
                receipt: { itemId: 'item-1' },
            }],
        };

        const ledger = initialiseUploadLedger(batches, existing);
        expect(ledger.entries[0]).toMatchObject({
            status: 'imported',
            receipt: { itemId: 'item-1' },
        });
        expect(summariseUploadLedger(ledger)).toMatchObject({ total: 1, imported: 1, pending: 0 });
    });

    test('records a receipt only after verifying the source bytes', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'honen-ledger-'));
        const filePath = path.join(root, 'lesson.txt');
        fs.writeFileSync(filePath, 'しゅくだい');
        const ledger = initialiseUploadLedger({
            generatedAt: '2026-07-25T00:00:00.000Z',
            libraryRoot: root,
            batches: [{
                id: 'batch-0001',
                group: '01-n5-foundations',
                files: [{
                    sourceId: 'jp-source',
                    relativePath: 'lesson.txt',
                    sha256: hash('しゅくだい'),
                    byteLength: Buffer.byteLength('しゅくだい'),
                }],
            }],
        });

        const entry = recordImport(ledger, {
            sourceId: 'jp-source',
            workspaceId: 'workspace',
            parentId: 'folder',
            itemId: 'item',
            title: 'Lesson',
        });
        expect(entry.status).toBe('imported');
        expect(entry.receipt).toMatchObject({ itemId: 'item', parentId: 'folder' });

        fs.writeFileSync(filePath, 'changed');
        expect(() => recordImport(ledger, {
            sourceId: 'jp-source',
            workspaceId: 'workspace',
            parentId: 'folder',
            itemId: 'item-2',
            title: 'Changed',
        })).toThrow(/Source size changed|Source hash changed/);
    });

    test('adds out-of-library sources without duplicating their stable ID', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'honen-external-'));
        const filePath = path.join(root, 'N5script.txt');
        fs.writeFileSync(filePath, 'listening script');
        const ledger = initialiseUploadLedger({
            generatedAt: '2026-07-25T00:00:00.000Z',
            libraryRoot: '/library',
            batches: [],
        });

        const first = appendExternalSource(ledger, {
            absolutePath: filePath,
            logicalPath: 'soya/jlpt/N5script.txt',
        });
        const second = appendExternalSource(ledger, {
            absolutePath: filePath,
            logicalPath: 'soya/jlpt/N5script.txt',
        });

        expect(second).toBe(first);
        expect(ledger.entries).toHaveLength(1);
        expect(first).toMatchObject({ origin: 'external', status: 'pending' });

        expect(recordImport(ledger, {
            sourceId: first.sourceId,
            workspaceId: 'workspace',
            parentId: 'soya-folder',
            itemId: 'document',
            title: 'N5script',
        })).toMatchObject({
            status: 'imported',
            receipt: { itemId: 'document', parentId: 'soya-folder' },
        });
    });
});
