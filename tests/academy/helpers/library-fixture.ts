import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

export const LIBRARY_SECRET_TOKENS = [
    'Secret Textbook',
    '秘密の教科書',
    'Lessons',
    'secret-audio',
];

export const SHARED_PDF = strToU8('%PDF-1.4 library payload shared with moodle');
const UNIQUE_PDF = strToU8('%PDF-1.4 library-only textbook payload');
export const AUDIO_BYTES = strToU8('ID3 secret-audio library payload');
const BUILD_ARTIFACT = strToU8('rust build artifact payload');
export const ARCHIVE_MEMBER = strToU8('archive member worksheet payload');

export interface LibraryFixture {
    base: string;
    libraryRoot: string;
    outsideDir: string;
    env: Record<string, string>;
}

/**
 * Library-shaped fixture: nested dirs with Japanese names, duplicate payloads,
 * excluded build artifacts and Finder metadata, an unknown extension, a ZIP
 * with duplicated members, a corrupt ZIP, and symlinks both inside and
 * escaping the root. Expected regular-file accounting is asserted in tests.
 */
export function buildLibraryFixture(): LibraryFixture {
    const base = mkdtempSync(path.join(tmpdir(), 'academy-library-fixture-'));
    const libraryRoot = path.join(base, 'Japanese');
    const outsideDir = path.join(base, 'outside');
    const lessons = path.join(libraryRoot, 'Lessons', '秘密の教科書');
    mkdirSync(lessons, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });

    writeFileSync(path.join(lessons, 'Secret Textbook.pdf'), SHARED_PDF);
    writeFileSync(path.join(lessons, 'Secret Textbook Copy.pdf'), SHARED_PDF);
    writeFileSync(path.join(lessons, 'Another Textbook.pdf'), UNIQUE_PDF);
    writeFileSync(path.join(lessons, 'secret-audio.mp3'), AUDIO_BYTES);
    writeFileSync(path.join(libraryRoot, 'tool.rmeta'), BUILD_ARTIFACT);
    writeFileSync(path.join(libraryRoot, '.DS_Store'), strToU8('finder metadata'));
    writeFileSync(path.join(libraryRoot, 'mystery.zzz'), strToU8('unknown extension payload'));
    writeFileSync(path.join(libraryRoot, 'deck.apkg'), zipSync({
        'collection.anki2': ARCHIVE_MEMBER,
        'media/clip.mp3': ARCHIVE_MEMBER,
    }, { level: 0 }));
    writeFileSync(path.join(libraryRoot, 'broken.zip'), strToU8('PK not actually a zip'));
    writeFileSync(path.join(outsideDir, 'escape-target.txt'), strToU8('outside payload'));
    symlinkSync(path.join(outsideDir, 'escape-target.txt'), path.join(libraryRoot, 'escape-link'));
    symlinkSync(path.join(lessons, 'Another Textbook.pdf'), path.join(libraryRoot, 'inside-link.pdf'));

    return {
        base,
        libraryRoot,
        outsideDir,
        env: {
            ACADEMY_LIBRARY_ROOT: libraryRoot,
            ACADEMY_SOURCE_CORPUS_ROOT: path.join(base, 'moodle-raw'),
            ACADEMY_SOURCE_DONOR_PACKS_ROOT: path.join(base, 'worksheet-packs'),
            ACADEMY_SOURCE_PRIVATE_ROOT: path.join(base, 'artifacts'),
            ACADEMY_SOURCE_PUBLIC_ROOT: path.join(base, 'public'),
        },
    };
}
