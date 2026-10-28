import { describe, expect, it } from 'vitest';
import {
    buildSourceRows,
    buildSummary,
    buildUploadBatches,
    canImportDirectlyToHonen,
    inferCurriculumBand,
} from '../../scripts/academy-honen/source-bundle.mjs';

describe('Honen source bundle', () => {
    it('keeps direct and companion-only formats in the same source census', () => {
        const ledger = {
            summary: { uniquePayloadCount: 2 },
            entries: [
                {
                    entryKind: 'file',
                    relativePath: 'Genki/Lesson 1.pdf',
                    byteLength: 120,
                    sha256: 'a'.repeat(64),
                    state: 'included',
                    classification: { extension: '.pdf', kind: 'document' },
                },
                {
                    entryKind: 'file',
                    relativePath: 'Audio/N5/track-01.mp3',
                    byteLength: 80,
                    sha256: 'b'.repeat(64),
                    state: 'included',
                    classification: { extension: '.mp3', kind: 'audio' },
                },
            ],
        };

        const rows = buildSourceRows(ledger);
        const summary = buildSummary(ledger, rows);

        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.honenDirect)).toEqual([false, true]);
        expect(summary).toMatchObject({
            regularFiles: 2,
            regularFileBytes: 200,
            uniquePayloadCount: 2,
            honenDirectFiles: 1,
            companionOnlyFiles: 1,
        });
    });

    it('maps explicit level signals before broad reference signals', () => {
        expect(inferCurriculumBand('Shin Kanzen Master/N1/Reading.pdf')).toBe('05-n1-mastery');
        expect(inferCurriculumBand('Tobira/Intermediate/Lesson 1.pdf')).toBe('03-n3-intermediate');
        expect(inferCurriculumBand('Genki/Lesson 1.pdf')).toBe('01-n5-foundations');
        expect(inferCurriculumBand('Dictionaries/JMdict.txt')).toBe('06-reference-corpora');
    });

    it('matches the active Honen knowledge-base file contract', () => {
        expect(canImportDirectlyToHonen('.pdf')).toBe(true);
        expect(canImportDirectlyToHonen('.md')).toBe(true);
        expect(canImportDirectlyToHonen('.mp4')).toBe(true);
        expect(canImportDirectlyToHonen('.mp3')).toBe(false);
        expect(canImportDirectlyToHonen('.apkg')).toBe(false);
    });

    it('creates bounded, deterministic upload batches', () => {
        const rows = Array.from({ length: 5 }, (_, index) => ({
            sourceId: `source-${index}`,
            relativePath: `Genki/Lesson 1/page-${index}.pdf`,
            sha256: String(index).repeat(64),
            byteLength: 20,
            kind: 'document',
            state: 'included',
            extension: '.pdf',
            curriculumBand: '01-n5-foundations',
            honenDirect: true,
        }));

        const batches = buildUploadBatches(rows, { maxFiles: 2, maxBytes: 100 });

        expect(batches.map(batch => batch.files.length)).toEqual([2, 2, 1]);
        expect(batches.map(batch => batch.id)).toEqual(['batch-0001', 'batch-0002', 'batch-0003']);
    });
});
