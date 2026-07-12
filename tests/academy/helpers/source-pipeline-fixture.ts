import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

export const SECRET_TOKENS = [
    'Secret Lesson Title',
    'Secret Worksheet',
    '秘密のレッスン',
    'ひみつ',
    'Secret Resource Note',
    'secret-lesson',
];

export const PDF_SHARED = strToU8('%PDF-1.4 shared worksheet payload for dedup tests');
export const PDF_UNIQUE = strToU8('%PDF-1.4 another unique worksheet payload');
export const MP3_BYTES = strToU8('ID3 fake audio payload');
export const DOCX_BYTES = strToU8('PK fake docx direct resource payload');

export interface FixtureRoots {
    corpusRoot: string;
    donorPacksRoot: string;
    privateRoot: string;
    publicRoot: string;
    repoRoot?: string;
    resourceLedgerPath?: string;
}

/**
 * Builds a tiny but corpus-shaped fixture: a manifest with private titles, two
 * Moodle-style folder ZIPs (one shared payload for dedup), one direct resource,
 * and one donor worksheet pack. Expected denominators: 2 archive occurrences,
 * 4 member occurrences, 3 unique member payloads, 1 direct resource.
 */
export function buildFixture(): FixtureRoots {
    const base = mkdtempSync(path.join(tmpdir(), 'academy-source-fixture-'));
    const corpusRoot = path.join(base, 'moodle-raw');
    const sectionDir = path.join(corpusRoot, 'course-a', 'sec-1');
    mkdirSync(sectionDir, { recursive: true });

    writeFileSync(path.join(corpusRoot, 'manifest.json'), JSON.stringify({
        schema: 'yomu-academy.moodle-raw.v1',
        courses: [{
            id: 'course-a',
            title: 'Secret Lesson Title',
            sections: [{
                id: 'sec-1',
                title: '秘密のレッスン',
                modules: [
                    { id: 101, type: 'folder', title: 'Secret Lesson Title' },
                    { id: 103, type: 'folder', title: '秘密のレッスン' },
                    { id: 102, type: 'resource', title: 'Secret Resource Note' },
                ],
            }],
        }],
    }, null, 2));

    writeFileSync(path.join(sectionDir, '01-folder-101-secret-lesson.zip'), zipSync({
        'Secret Worksheet ひみつ.pdf': PDF_SHARED,
        'Listening Audio.mp3': MP3_BYTES,
    }));
    writeFileSync(path.join(sectionDir, '02-folder-103-himitsu.zip'), zipSync({
        'nested/Secret Worksheet Copy.pdf': PDF_SHARED,
        'Another Sheet.pdf': PDF_UNIQUE,
    }));
    writeFileSync(path.join(sectionDir, '03-resource-102-secret-notes.docx'), DOCX_BYTES);

    const donorPacksRoot = path.join(base, 'worksheet-packs');
    mkdirSync(path.join(donorPacksRoot, 'packs'), { recursive: true });
    writeFileSync(path.join(donorPacksRoot, 'packs', 'secret-lesson-pack.json'), JSON.stringify(donorPack(), null, 2));

    return {
        corpusRoot,
        donorPacksRoot,
        privateRoot: path.join(base, 'artifacts'),
        publicRoot: path.join(base, 'public'),
    };
}

export function donorPack() {
    return {
        schema: 'yomu-academy-worksheet-pack/v1',
        packId: 'wp-fixture000001',
        slug: 'secret-lesson',
        sourceId: 'japanese-library:Lessons/Secret Lesson Title/Secret Worksheet.pdf',
        sha256: 'sha256:' + 'ab'.repeat(32),
        byteLength: 1234,
        pageCount: 2,
        provenance: {
            primaryName: 'Secret Worksheet.pdf',
            occurrences: [{ relPath: 'Lessons/Secret Worksheet.pdf', week: 1 }],
        },
        audio: [{ id: 'audio-fixture0001', label: 'Track 1', durationSeconds: 88 }],
        instructions: [{ id: 'ins-1', originalText: 'ひみつの説明を読んでください', translation: 'Read the secret instructions' }],
        items: [
            {
                id: 'item-1',
                type: 'cloze',
                promptOriginal: 'ひみつの文を（　　）書いてください',
                promptTranslation: 'Write the secret sentence',
                furigana: 'ひみつのぶん',
                media: { audioRefs: ['audio-fixture0001'], imageRefs: [] },
                answer: { status: 'provided', accepted: ['ひみつ'] },
            },
            {
                id: 'item-2',
                type: 'other',
                promptOriginal: '絵を見て答えてください',
                promptTranslation: null,
                media: { audioRefs: [], imageRefs: [{ description: 'A secret map drawing' }] },
                answer: null,
            },
        ],
    };
}

export function toEnv(roots: FixtureRoots): Record<string, string> {
    return {
        ACADEMY_SOURCE_CORPUS_ROOT: roots.corpusRoot,
        ACADEMY_SOURCE_DONOR_PACKS_ROOT: roots.donorPacksRoot,
        ACADEMY_SOURCE_PRIVATE_ROOT: roots.privateRoot,
        ACADEMY_SOURCE_PUBLIC_ROOT: roots.publicRoot,
    };
}
