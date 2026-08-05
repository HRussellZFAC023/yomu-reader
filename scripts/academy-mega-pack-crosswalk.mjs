import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEGA_PACK_CROSSWALK_SCHEMA = 'yomu-academy.source-pipeline.mega-pack-crosswalk/v1';
const MEGA_PACK_CROSSWALK_REVISION = 'mega-pack-crosswalk/2026-07-15.1';
// The only output. docs/public/academy is generated: scripts/sync-academy.cjs
// rm -rf's it and rewrites it from public/academy on every build:academy.
const OUTPUT_PATH = 'public/academy/content/source-pipeline/mega-pack-crosswalk.v1.json';

const DEFAULT_ROOT = path.join(
    os.homedir(),
    'Documents/Japanese/Resource Packs/Japanese Mega Learning Pack',
);

const SEGMENTS = Object.freeze([
    segment({
        id: 'mega-pack-01-hiragana-quiz-a-ko',
        packId: 'mega-pack-01',
        packFolder: '01.Japanese Writing System',
        relativePath: '01.Japanese Writing System/Hiragana Katakana Worksheet/Hiragana Katakana Worksheet.pdf',
        payloadSha256: 'bc6e047118c8bf3322571e198370c713ba39df676b0e5ec5720ebb12d4167ff4',
        title: 'Hiragana and Katakana Work Sheets',
        sourceChapter: 'Hiragana work sheets and quizzes: a-ko',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [4, 4], printedPages: [2, 2] },
        role: 'playable-writing-system',
        skills: ['kana-recognition', 'kana-production', 'reading'],
        jlpt: ['N5'],
        concepts: ['kana:hiragana-basic', 'kana:romaji-to-hiragana', 'lexeme:aka', 'lexeme:eki'],
        chapters: ['mega-kana-01'],
    }),
    segment({
        id: 'mega-pack-02-script-study-orientation',
        packId: 'mega-pack-02',
        packFolder: '02.Audio Courses, Textbooks',
        relativePath: '02.Audio Courses, Textbooks/Japanese Is Possible/Japanese Is Possible - Lesson 01 (Ebook - Learn Japanese).pdf',
        payloadSha256: '46515d5710c4c73fa07227f92fa171dd7adb8223bfd9a07a9c5f4178d6b4925a',
        title: 'Japanese Is Possible! Lesson 1',
        sourceChapter: '4 MYTHS about Japanese',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [2, 3] },
        role: 'supporting-study-material',
        skills: ['learning-strategy', 'reading', 'script-awareness'],
        jlpt: ['pre-N5', 'N5'],
        concepts: ['script:hiragana', 'script:katakana', 'script:kanji', 'strategy:distributed-practice'],
        chapters: ['mega-orientation-01'],
    }),
    segment({
        id: 'mega-pack-03-topic-particle-wa',
        packId: 'mega-pack-03',
        packFolder: '03.Grammar, Workbooks, Usage',
        relativePath: '03.Grammar, Workbooks, Usage/Particles/All About Particles A Handbook of Japanese Function Words.pdf',
        payloadSha256: '30ff10fc0bccf97d97eee824551689df8efd393b9f45bbf79a3829e73f78931e',
        title: 'All About Particles',
        sourceChapter: 'WA / は',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [4, 5], printedPages: [10, 12] },
        role: 'grammar-reference',
        skills: ['grammar', 'reading', 'sentence-analysis'],
        jlpt: ['N5', 'N4'],
        concepts: ['particle:wa', 'particle:ga', 'syntax:topic-comment'],
        chapters: ['mega-particles-01'],
    }),
    segment({
        id: 'mega-pack-04-basic-verb-forms',
        packId: 'mega-pack-04',
        packFolder: '04.Vocabulary, Expressions, Idioms',
        relativePath: '04.Vocabulary, Expressions, Idioms/Basic verb 100/BasicVerb100(Kana).pdf',
        payloadSha256: 'c6c8c56920c488fefac973d1af8946a52dfb32c19437782499e89c3dbca82c2e',
        title: 'Basic Verb 100 (Kana)',
        sourceChapter: '100 basic verbs: masu, te, and nai forms',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [1, 4] },
        role: 'verb-form-reference',
        skills: ['reading', 'verb-conjugation', 'vocabulary'],
        jlpt: ['N5', 'N4'],
        concepts: ['verb:masu-form', 'verb:te-form', 'verb:nai-form'],
        chapters: ['mega-verbs-01'],
    }),
    segment({
        id: 'mega-pack-05-momotarou-opening',
        packId: 'mega-pack-05',
        packFolder: "05.Children's Books, Readers",
        relativePath: "05.Children's Books, Readers/Momotarou.pdf",
        payloadSha256: '767b663768ee7185b8710ebdde7efebdc27bbfc706c8f667ea4c833dcde764af',
        title: 'ももたろう',
        sourceChapter: 'Opening: the peach in the river',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [3, 4], printedPages: [1, 3] },
        role: 'playable-reader',
        skills: ['extended-reading', 'reading-comprehension', 'vocabulary-in-context'],
        jlpt: ['N4', 'N3'],
        concepts: ['folktale:momotarou', 'grammar:hearsay-souna', 'particle:destination-ni', 'reading:narrative-sequence'],
        chapters: ['mega-reader-01'],
    }),
    segment({
        id: 'mega-pack-06-colloquial-register',
        packId: 'mega-pack-06',
        packFolder: '06.Dictionaries, Phrasebooks',
        relativePath: '06.Dictionaries, Phrasebooks/Japanese Slang.txt',
        payloadSha256: '3ae58a1d464d9c812658c85ca5e107cf4e27a165f20acf5e84166c28c4079c9a',
        title: 'Japanese Slang',
        sourceChapter: 'Japanese Slang Vol. 2 opening entries',
        mediaType: 'text/plain',
        locus: { kind: 'text-lines', lines: [146, 154] },
        role: 'register-literacy-reference',
        skills: ['pragmatics', 'reading', 'register-awareness'],
        jlpt: ['N4', 'N3'],
        concepts: ['register:colloquial', 'register:dated-language', 'romanization:interpretation', 'safety:context-before-reuse'],
        chapters: ['mega-register-01'],
    }),
    segment({
        id: 'mega-pack-07-historical-periods',
        packId: 'mega-pack-07',
        packFolder: '07.Society,Culture,History,Tourism',
        relativePath: '07.Society,Culture,History,Tourism/Culture/Japanese Culture.pdf',
        payloadSha256: 'f6ee7ef3e97beead72100bbc1c4622ac419d7898da93ec413c29fadde11deae9',
        title: 'Japanese Culture',
        sourceChapter: 'Contents and major periods of Japanese history',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [8, 11] },
        role: 'culture-reading-reference',
        skills: ['culture-literacy', 'reference-reading', 'timeline-reading'],
        jlpt: ['N3', 'N2'],
        concepts: ['culture:historical-periodization', 'history:premodern-japan', 'reading:reference-structure'],
        chapters: ['mega-culture-01'],
    }),
    segment({
        id: 'mega-pack-08-particle-cheatsheet',
        packId: 'mega-pack-08',
        packFolder: '08.Miscellaneous',
        relativePath: '08.Miscellaneous/Cheatsheets/japanese-particles-cheatsheet.pdf',
        payloadSha256: 'ac76bbec8250b201e59e61073cd3cdd6a797a5d822b8f9e3e070a0fa9fe0bffa',
        title: 'Japanese Particles Cheatsheet',
        sourceChapter: 'は, が, の, も, を, に, へ, and で',
        mediaType: 'application/pdf',
        locus: { kind: 'pdf-pages', pdfPages: [1, 1] },
        role: 'playable-supporting-material',
        skills: ['grammar', 'kana-production', 'sentence-construction'],
        jlpt: ['N5'],
        concepts: ['particle:wa', 'particle:wo', 'particle:ni', 'syntax:topic-comment'],
        chapters: ['mega-materials-01', 'mega-particles-01'],
    }),
]);

export function resolveMegaPackRoot(env = process.env) {
    return path.resolve(env.YOMU_MEGA_PACK_ROOT || DEFAULT_ROOT);
}

export function buildMegaPackCrosswalk({ root = resolveMegaPackRoot() } = {}) {
    if (!existsSync(root)) throw new Error(`Mega Pack root does not exist: ${root}`);
    const folders = immediateFolders(root);
    const segments = SEGMENTS.map(definition => materializeSegment(root, definition));
    const indexes = {
        skill: buildIndex(segments, 'skills'),
        jlpt: buildIndex(segments, 'jlpt'),
        concept: buildIndex(segments, 'concepts'),
        chapter: buildIndex(segments, 'chapters'),
    };
    const corpusSha256 = sha256(JSON.stringify(segments.map(item => ({
        id: item.id,
        payloadSha256: item.source.payloadSha256,
        locus: item.source.locus,
        mapping: item.mapping,
    }))));
    const catalog = {
        schema: MEGA_PACK_CROSSWALK_SCHEMA,
        revision: MEGA_PACK_CROSSWALK_REVISION,
        policy: {
            provenance: 'user-supplied-local-educational-corpus',
            reuse: 'user-permitted-verbatim-educational-use',
            publication: 'Source binaries and absolute local paths are excluded; only mapped excerpts may enter authored Academy activities.',
            warning: 'This permission records the task owner\'s reuse instruction and is not a general copyright or licensing claim.',
        },
        coverage: {
            requestedFolderCount: 8,
            mappedFolderCount: new Set(segments.map(item => item.packId)).size,
            mappedSegmentCount: segments.length,
            corpusSha256,
            folders,
        },
        segments,
        indexes,
        playableSlice: {
            id: 'mega-pack-foundations-slice-01',
            chapterOrder: ['mega-kana-01', 'mega-reader-01', 'mega-materials-01'],
            segmentIds: [
                'mega-pack-01-hiragana-quiz-a-ko',
                'mega-pack-05-momotarou-opening',
                'mega-pack-08-particle-cheatsheet',
            ],
        },
    };
    const issues = validateMegaPackCrosswalk(catalog);
    if (issues.length) throw new Error(`Invalid Mega Pack crosswalk: ${issues.join('; ')}`);
    return catalog;
}

export function validateMegaPackCrosswalk(catalog) {
    const issues = [];
    if (catalog?.schema !== MEGA_PACK_CROSSWALK_SCHEMA) issues.push('schema must be mega-pack-crosswalk/v1');
    if (catalog?.coverage?.requestedFolderCount !== 8 || catalog?.coverage?.mappedFolderCount !== 8) {
        issues.push('all eight requested folders must be mapped');
    }
    if (!Array.isArray(catalog?.coverage?.folders) || catalog.coverage.folders.length !== 8) {
        issues.push('coverage must summarize eight folders');
    }
    const segments = catalog?.segments;
    if (!Array.isArray(segments) || segments.length !== 8) {
        issues.push('exactly one initial mapped segment is required per pack folder');
        return issues;
    }
    if (new Set(segments.map(item => item.packId)).size !== 8) issues.push('segment pack ids must cover eight unique folders');
    for (const item of segments) {
        if (!/^[a-f0-9]{64}$/u.test(item?.source?.payloadSha256 ?? '')) issues.push(`${item?.id}: invalid SHA-256`);
        if (path.isAbsolute(item?.source?.relativePath ?? '')) issues.push(`${item?.id}: source path must be relative`);
        for (const dimension of ['skills', 'jlpt', 'concepts', 'chapters']) {
            if (!Array.isArray(item?.mapping?.[dimension]) || item.mapping[dimension].length === 0) {
                issues.push(`${item?.id}: mapping.${dimension} must not be empty`);
            }
        }
    }
    if (JSON.stringify(catalog).includes('/Users/')) issues.push('catalog leaks a private absolute path');
    for (const [indexName, mappingName] of [
        ['skill', 'skills'],
        ['jlpt', 'jlpt'],
        ['concept', 'concepts'],
        ['chapter', 'chapters'],
    ]) {
        const expected = buildIndex(segments, mappingName);
        if (JSON.stringify(catalog?.indexes?.[indexName]) !== JSON.stringify(expected)) {
            issues.push(`${indexName} index is not a complete reverse mapping`);
        }
    }
    const playableIds = new Set(catalog?.playableSlice?.segmentIds ?? []);
    if (playableIds.size !== 3 || !segments.filter(item => playableIds.has(item.id)).every(item => item.mapping.role.startsWith('playable-'))) {
        issues.push('playable slice must map the writing-system, reader, and supporting-material segments');
    }
    return issues;
}

function writeMegaPackCrosswalk(catalog, { repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') } = {}) {
    writeFileSync(path.join(repoRoot, OUTPUT_PATH), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function checkMegaPackCrosswalk(catalog, { repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') } = {}) {
    const output = path.join(repoRoot, OUTPUT_PATH);
    const expected = `${JSON.stringify(catalog, null, 2)}\n`;
    if (!existsSync(output) || readFileSync(output, 'utf8') !== expected) {
        throw new Error(`Stale Mega Pack crosswalk output: ${OUTPUT_PATH}`);
    }
}

function segment(value) {
    return Object.freeze(value);
}

function materializeSegment(root, definition) {
    const sourcePath = path.join(root, definition.relativePath);
    if (!existsSync(sourcePath)) throw new Error(`Mapped Mega Pack source is missing: ${definition.relativePath}`);
    const actualSha256 = sha256(readFileSync(sourcePath));
    if (actualSha256 !== definition.payloadSha256) {
        throw new Error(`Mapped Mega Pack source hash changed: ${definition.relativePath}`);
    }
    return {
        id: definition.id,
        packId: definition.packId,
        packFolder: definition.packFolder,
        source: {
            sourceId: `mega-pack:${definition.payloadSha256}:${definition.id}`,
            relativePath: definition.relativePath,
            payloadSha256: definition.payloadSha256,
            byteLength: statSync(sourcePath).size,
            mediaType: definition.mediaType,
            title: definition.title,
            sourceChapter: definition.sourceChapter,
            locus: definition.locus,
            permission: 'user-permitted-verbatim-educational-use',
        },
        mapping: {
            role: definition.role,
            skills: [...definition.skills],
            jlpt: [...definition.jlpt],
            concepts: [...definition.concepts],
            chapters: [...definition.chapters],
        },
    };
}

function immediateFolders(root) {
    return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && /^0[1-8]\./u.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name, 'en'))
        .map((entry, index) => ({
            packId: `mega-pack-0${index + 1}`,
            folder: entry.name,
            fileCount: countFiles(path.join(root, entry.name)),
            mappedSegmentIds: SEGMENTS.filter(item => item.packFolder === entry.name).map(item => item.id),
        }));
}

function countFiles(directory) {
    let count = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === '.DS_Store') continue;
        if (entry.isDirectory()) count += countFiles(path.join(directory, entry.name));
        else if (entry.isFile()) count += 1;
    }
    return count;
}

function buildIndex(segments, mappingName) {
    const index = {};
    for (const item of segments) {
        for (const key of item.mapping[mappingName]) (index[key] ??= []).push(item.id);
    }
    return Object.fromEntries(Object.entries(index)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, ids]) => [key, ids.sort((left, right) => left.localeCompare(right, 'en'))]));
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function runCli() {
    const catalog = buildMegaPackCrosswalk();
    if (process.argv.includes('--write')) writeMegaPackCrosswalk(catalog);
    else if (process.argv.includes('--check')) checkMegaPackCrosswalk(catalog);
    else process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) runCli();
