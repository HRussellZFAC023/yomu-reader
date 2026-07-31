import 'fake-indexeddb/auto';

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { YomitanDictionaryStore, type YomitanTermMatch } from '../../src/reader/dictionaries/yomitan';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../src/reader/languages/registry';
import type { LearningTargetModule } from '../../src/reader/languages/types';
import {
    candidateFilteredTermsFromPublishedArchive,
} from '../../scripts/lib/multilingual-parity-archive';
import type { MultilingualParityTargetCorpus } from '../../scripts/lib/multilingual-parity-corpus';
import { yomitanZipBytes } from './zip-fixture';

const stores: YomitanDictionaryStore[] = [];

afterEach(async () => {
    await Promise.all(stores.map(store => store.clear()));
    stores.length = 0;
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule('fi');
});

function finnishTarget(): LearningTargetModule {
    return activateTarget(createLearningTargetModule({
        id: 'fi-parity-test',
        language: 'fi',
        featureSemantics: {
            characterSystem: 'Latin',
            phoneticScripts: [],
            pronunciation: 'ipa',
            readingAnnotation: 'none',
        },
        detectsText: /\p{Script=Latin}/u,
        lookupRewrites: [{
            suffix: 'ssa',
            minStemLength: 2,
            reason: 'test inessive',
        }],
    }));
}

function activateTarget(target: LearningTargetModule): LearningTargetModule {
    registerLearningTargetModule(target);
    const active = setActiveLearningTargetLanguage(target.language);
    if (active !== target) throw new Error('Could not activate the test target.');
    return target;
}

function corpus(): MultilingualParityTargetCorpus {
    return {
        language: 'fi',
        source: {
            kind: 'test',
            story: 'synthetic authoritative archive',
            license: 'MIT',
            reviewStatus: 'test fixture',
        },
        sentences: [{
            id: 'fi-filter-1',
            text: 'talossa koirassa lukee',
            contentWords: ['talossa', 'koirassa', 'lukee'],
        }],
    };
}

type ZipTermRow = [string, string, string, string, number, unknown[], number, string];

function termRow(
    expression: string,
    reading: string,
    score: number,
    sequence: number,
    glossary: unknown[] = [`definition ${sequence}`],
): ZipTermRow {
    return [expression, reading, '', '', score, glossary, sequence, ''];
}

interface ArchiveFixture {
    bytes: Uint8Array;
    file: File;
}

function archiveFixture(rowsByBank: ZipTermRow[][]): ArchiveFixture {
    const files: Record<string, unknown> = {
        'index.json': {
        title: 'Synthetic Finnish',
        format: 3,
        revision: 'test',
        },
    };
    rowsByBank.forEach((rows, index) => {
        files[`term_bank_${index + 1}.json`] = rows;
    });
    const bytes = yomitanZipBytes(files, { compression: 'deflate' });
    return {
        bytes,
        file: new File(
            [bytes as Uint8Array<ArrayBuffer>],
            'wty-fi-en.zip',
            { type: 'application/zip' },
        ),
    };
}

function integrity(bytes: Uint8Array): { sha256: string; bytes: number } {
    return {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength,
    };
}

function comparableMatches(matches: readonly YomitanTermMatch[]): unknown[] {
    return matches.map(match => ({
        start: match.start,
        end: match.end,
        surface: match.surface,
        expression: match.entry.expression,
        reading: match.entry.reading,
        rules: match.entry.rules,
        score: match.entry.score,
        sequence: match.entry.sequence,
        deinflected: match.deinflected?.term,
    }));
}

async function matcherResults(
    archive: ArchiveFixture,
    target: LearningTargetModule,
    targetCorpus: MultilingualParityTargetCorpus,
): Promise<{ full: unknown[]; filtered: unknown[] }> {
    const store = new YomitanDictionaryStore();
    stores.push(store);
    await store.clear();
    await store.importFile(archive.file, undefined, '', { persistArchive: false });
    const full = comparableMatches(await store.findTermMatches(targetCorpus.sentences[0].text, 256, [], target));

    const result = await candidateFilteredTermsFromPublishedArchive(
        archive.bytes,
        archive.file.name,
        targetCorpus,
        target,
        integrity(archive.bytes),
    );
    await store.clear();
    await store.importFile(new File([JSON.stringify({
        formatName: 'yomu-yomitan-dictionaries',
        formatVersion: 2,
        terms: result.terms,
    })], 'filtered.json', { type: 'application/json' }) as unknown as globalThis.File);
    const filtered = comparableMatches(await store.findTermMatches(targetCorpus.sentences[0].text, 256, [], target));
    return { full, filtered };
}

describe('candidate-filtered authoritative archive scan', () => {
    it('preserves production expression, reading, morphology, and first-eight index semantics', async () => {
        const firstBank: ZipTermRow[] = [
            termRow('distractor', 'distractor', 999, 999),
            ...Array.from({ length: 5 }, (_, index) => termRow('talossa', 'talossa', index + 1, index + 1)),
            termRow('koira', 'koira', 20, 20),
            termRow('read', 'lukee', 30, 30),
        ];
        const secondBank = Array.from(
            { length: 5 },
            (_, index) => termRow('talossa', 'talossa', index + 6, index + 6),
        );
        const archive = archiveFixture([firstBank, secondBank]);
        const target = finnishTarget();
        const targetCorpus = corpus();

        const scanned = await candidateFilteredTermsFromPublishedArchive(
            archive.bytes,
            archive.file.name,
            targetCorpus,
            target,
            integrity(archive.bytes),
        );

        expect(scanned.scan).toEqual({
            mode: 'candidate-filtered-full-archive',
            termBanks: 2,
            scannedTermRows: 13,
            retainedTermRows: 12,
        });
        expect(scanned.terms.map(term => term.sequence)).toEqual([
            1, 2, 3, 4, 5, 20, 30, 6, 7, 8, 9, 10,
        ]);
        expect(scanned.terms.every(term => term.glossary[0] === 'Published dictionary match (compact parity evidence).')).toBe(true);

        const { full, filtered } = await matcherResults(archive, target, targetCorpus);
        expect(filtered).toEqual(full);
        expect(filtered).toEqual(expect.arrayContaining([
            expect.objectContaining({ surface: 'talossa', sequence: 8 }),
            expect.objectContaining({ surface: 'koirassa', expression: 'koira', deinflected: 'koira' }),
            expect.objectContaining({ surface: 'lukee', expression: 'read', reading: 'lukee' }),
        ]));
        expect(filtered).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ sequence: 10 }),
        ]));
    });

    it('does not retain reading-only rows when the production target skips the reading index', async () => {
        const target = activateTarget(createLearningTargetModule({
            id: 'exact-expression-test',
            language: 'fi',
            lookupSweepMode: 'left-to-right-longest-exact',
            featureSemantics: {
                characterSystem: 'Latin',
                phoneticScripts: [],
                pronunciation: 'ipa',
                readingAnnotation: 'none',
            },
            detectsText: /\p{Script=Latin}/u,
        }));
        const archive = archiveFixture([[
            termRow('unreachable', 'talossa', 1, 1),
            termRow('talossa', 'other-reading', 2, 2),
        ]]);

        const scanned = await candidateFilteredTermsFromPublishedArchive(
            archive.bytes,
            archive.file.name,
            corpus(),
            target,
            integrity(archive.bytes),
        );

        expect(scanned.terms.map(term => term.sequence)).toEqual([2]);
    });

    it('rejects a tampered archive before scanning any dictionary rows', async () => {
        const target = finnishTarget();
        const archive = archiveFixture([[termRow('talossa', 'talossa', 1, 1)]]);
        const expected = integrity(archive.bytes);

        await expect(candidateFilteredTermsFromPublishedArchive(
            archive.bytes,
            archive.file.name,
            corpus(),
            target,
            { ...expected, sha256: '0'.repeat(64) },
        )).rejects.toThrow('Dictionary download SHA-256 mismatch.');
    });
});
