import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CORPUS_REVISION, CORPUS_SCHEMAS } from './paths.mjs';
import { readJson, readJsonIfPresent, sha256Hex } from '../io.mjs';

const LESSON_FILE = /^\d{3}-l[12]-l\d{2}\.json$/u;
const VOCABULARY_SOURCE = /vocabular(?:y|ies)|word\s*list/iu;

export function buildVocabularyParity(roots) {
    const packs = readJsonIfPresent(roots.packCandidatesPath)?.packs ?? [];
    const packBySha = new Map(packs.map(pack => [pack.sourceDocument.sha256, pack]));
    const lessons = readdirSync(roots.lessonsRoot)
        .filter(name => LESSON_FILE.test(name))
        .sort()
        .map(name => ({ name, value: readJson(path.join(roots.lessonsRoot, name)) }));
    const privateLessons = lessons.map(({ name, value }) => buildLessonRecord(roots, name, value, packBySha));
    const privateParity = {
        schema: CORPUS_SCHEMAS.vocabulary,
        revision: CORPUS_REVISION,
        contract: {
            comparedFields: ['surface', 'reading', 'meaning', 'order', 'media'],
            sourceAnswerGate: 'after-attempt',
            exactMeans: 'Every ordered pre-study row and media identifier matches one exact source-sheet sequence.',
        },
        lessons: privateLessons,
        summary: summarize(privateLessons),
    };
    return { privateParity, publicParity: toPublic(privateParity) };
}

function buildLessonRecord(roots, fileName, lesson, packBySha) {
    const moduleId = lesson.sourceCoverage?.archiveModuleId ?? null;
    const sourceMembers = (lesson.sourceCoverage?.members ?? [])
        .filter(member => member.role === 'vocabulary' || VOCABULARY_SOURCE.test(member.title ?? ''));
    const sheets = sourceMembers.map(member => extractSheet(roots, moduleId, member, packBySha.get(member.payloadSha256)));
    const lessonRows = (lesson.components ?? [])
        .filter(component => component.type === 'vocabulary')
        .flatMap(component => component.items ?? [])
        .map((item, index) => normalizeLessonRow(item, index));
    const sourceSequences = sheets.filter(sheet => sheet.reuseRows.length > 0).map(sheet => sheet.reuseRows);
    const matchingSheet = sourceSequences.find(rows => arraysEqual(
        rows.map(row => row.fingerprint), lessonRows.map(row => row.fingerprint)));
    const gaps = [];
    if (sheets.length === 0) gaps.push('no-exact-source-vocabulary-sheet');
    if (sheets.length > 0 && lessonRows.length === 0) gaps.push('lesson-prestudy-list-missing');
    if (sheets.some(sheet => sheet.extractionStatus !== 'complete')) gaps.push('source-sheet-extraction-incomplete');
    if (sheets.length > 0 && lessonRows.length > 0 && !matchingSheet) gaps.push('ordered-vocabulary-content-mismatch');
    if (sheets.some(sheet => sheet.mediaStatus === 'unresolved')) gaps.push('source-vocabulary-media-unresolved');
    return {
        lessonId: lesson.id,
        lessonFile: fileName,
        moodleModuleId: moduleId,
        sheets,
        lessonRows,
        parityStatus: matchingSheet && gaps.length === 0 ? 'exact' : 'gap-declared',
        matchedSourceId: matchingSheet ? sheets[sourceSequences.indexOf(matchingSheet)]?.sourceId ?? null : null,
        gaps: [...new Set(gaps)],
    };
}

function extractSheet(roots, moduleId, member, pack) {
    const sourceId = `moodle-vocabulary:${moduleId}:${member.payloadSha256}`;
    const payloadPath = path.join(roots.privateRoot, '..', 'payloads', member.payloadSha256);
    const pdfRows = member.extension === '.pdf' && existsSync(payloadPath)
        ? extractPdfRows(payloadPath)
        : [];
    const donorRows = pack ? extractDigitizedRows(pack) : [];
    const rows = donorRows.length > 0 ? donorRows : pdfRows;
    const completeRows = rows.filter(row => row.surface && row.reading && row.meaning);
    const unresolvedMedia = rows.some(row => row.media.some(media => media.status !== 'verified'));
    return {
        sourceId,
        payloadSha256: member.payloadSha256,
        title: member.title,
        extractionMethod: donorRows.length > 0 ? 'digitized-pack' : pdfRows.length > 0 ? 'pdf-text-table' : 'unavailable',
        extractionStatus: rows.length > 0 && completeRows.length === rows.length ? 'complete' : 'partial',
        rowCount: rows.length,
        completeRowCount: completeRows.length,
        sourceProvidedReadingCount: rows.filter(row => row.readingProvenance === 'source-provided').length,
        sourceProvidedMeaningCount: rows.filter(row => row.meaningProvenance === 'source-provided').length,
        modelAnswerCount: rows.filter(row => row.answerProvenance === 'model-answer-review-required').length,
        answerGate: rows.some(row => row.reading || row.meaning) ? 'after-attempt' : null,
        mediaStatus: unresolvedMedia ? 'unresolved' : 'resolved-or-none',
        rows,
        reuseRows: completeRows,
    };
}

function extractDigitizedRows(pack) {
    const augmentationById = new Map(pack.augmentation.map(item => [item.itemId, item]));
    return pack.sourceCandidates
        .slice()
        .sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER))
        .map((source, index) => {
            const augmentation = augmentationById.get(source.itemId) ?? {};
            const answerStatus = augmentation.answer?.status;
            const media = source.mediaDescriptions ?? [];
            return vocabularyRow({
                index,
                surface: source.promptOriginal,
                reading: augmentation.furigana,
                meaning: augmentation.promptTranslation,
                readingProvenance: 'model-answer-review-required',
                meaningProvenance: 'model-answer-review-required',
                answerProvenance: answerStatus === 'provided'
                    ? 'source-provided'
                    : 'model-answer-review-required',
                media,
            });
        });
}

function extractPdfRows(payloadPath) {
    const result = spawnSync('pdftotext', ['-layout', payloadPath, '-'], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
    });
    if (result.status !== 0 || !result.stdout) return [];
    return parseVocabularyTable(result.stdout);
}

export function parseVocabularyTable(text) {
    const rows = [];
    for (const page of text.split('\f')) {
        const lines = page.split(/\r?\n/u);
        const header = lines.find(line => /words?/iu.test(line) && /pronunciation/iu.test(line) && /meaning/iu.test(line));
        if (!header) continue;
        const wordColumn = header.search(/words?/iu);
        const readingColumn = header.search(/pronunciation/iu);
        const meaningColumn = header.search(/meaning/iu);
        for (const line of lines.slice(lines.indexOf(header) + 1)) {
            const numberMatch = /^\s*(\d+)\s+/u.exec(line);
            if (!numberMatch) continue;
            const numberEnd = numberMatch[0].length;
            const surface = cleanCell(line.slice(Math.max(numberEnd, wordColumn), readingColumn));
            const reading = cleanCell(line.slice(readingColumn, meaningColumn));
            const meaning = cleanCell(line.slice(meaningColumn));
            if (!surface) continue;
            rows.push(vocabularyRow({
                index: rows.length,
                surface: surface.replace(/^\d+\)\s*/u, ''),
                reading,
                meaning,
                readingProvenance: reading ? 'source-provided' : 'source-blank',
                meaningProvenance: meaning ? 'source-provided' : 'source-blank',
                answerProvenance: reading || meaning ? 'source-provided' : 'unresolved',
                media: [],
            }));
        }
    }
    return rows;
}

function cleanCell(value) {
    return value.replace(/\s+/gu, ' ').trim();
}

function normalizeLessonRow(item, index) {
    return vocabularyRow({
        index,
        surface: item.ja,
        reading: item.reading,
        meaning: item.en,
        readingProvenance: 'lesson-authored',
        meaningProvenance: 'lesson-authored',
        answerProvenance: 'lesson-authored',
        media: item.audio ? [item.audio] : [],
    });
}

function vocabularyRow({ index, surface, reading, meaning, readingProvenance, meaningProvenance, answerProvenance, media }) {
    const normalized = [surface, reading, meaning, media.map(normalizeMedia)].map(normalizeValue);
    return {
        order: index + 1,
        surface: surface || null,
        reading: reading || null,
        meaning: meaning || null,
        readingProvenance,
        meaningProvenance,
        answerProvenance,
        answerGate: reading || meaning ? 'after-attempt' : null,
        media,
        fingerprint: sha256Hex(Buffer.from(JSON.stringify(normalized))),
    };
}

function normalizeMedia(value) {
    if (typeof value === 'string') return value;
    return value?.ref ?? value?.src ?? value?.id ?? JSON.stringify(value ?? null);
}

function normalizeValue(value) {
    if (Array.isArray(value)) return value.map(normalizeValue);
    return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function arraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function summarize(lessons) {
    const sheets = lessons.flatMap(lesson => lesson.sheets);
    return {
        lessonCount: lessons.length,
        exactLessonCount: lessons.filter(lesson => lesson.parityStatus === 'exact').length,
        gapLessonCount: lessons.filter(lesson => lesson.parityStatus === 'gap-declared').length,
        sourceSheetCount: sheets.length,
        extractedRowCount: sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0),
        completeRowCount: sheets.reduce((sum, sheet) => sum + sheet.completeRowCount, 0),
        gapCounts: countValues(lessons.flatMap(lesson => lesson.gaps)),
    };
}

function countValues(values) {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function toPublic(value) {
    return {
        ...value,
        lessons: value.lessons.map(lesson => ({
            lessonId: lesson.lessonId,
            moodleModuleId: lesson.moodleModuleId,
            sheets: lesson.sheets.map(sheet => ({
                sourceId: sheet.sourceId,
                payloadSha256: sheet.payloadSha256,
                extractionMethod: sheet.extractionMethod,
                extractionStatus: sheet.extractionStatus,
                rowCount: sheet.rowCount,
                completeRowCount: sheet.completeRowCount,
                sourceProvidedReadingCount: sheet.sourceProvidedReadingCount,
                sourceProvidedMeaningCount: sheet.sourceProvidedMeaningCount,
                modelAnswerCount: sheet.modelAnswerCount,
                answerGate: sheet.answerGate,
                mediaStatus: sheet.mediaStatus,
                orderedRowFingerprints: sheet.reuseRows.map(row => row.fingerprint),
            })),
            lessonRowCount: lesson.lessonRows.length,
            orderedLessonRowFingerprints: lesson.lessonRows.map(row => row.fingerprint),
            parityStatus: lesson.parityStatus,
            matchedSourceId: lesson.matchedSourceId,
            gaps: lesson.gaps,
        })),
    };
}
