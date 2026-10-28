import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonL2L23KanjiColumnSortBeat,
    createLessonL2L23LibraryReadingBeat,
    createLessonL2L23ReturnWritingBeat,
    createLessonL2L23SourceVocabularyBeat,
    L2_L23_SOURCE_PAGES,
} from '../../src/academy/content/lesson-l2-l23-kanji-handover';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type DragSortModel, type TypedResponseModel } from '../../src/academy/minigames';
import type { SourceVocabularySheetModel } from '../../src/academy/minigames/source-vocabulary-sheet';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const SOURCE_PACKAGE_SHA256 = 'b6db986c187c97eef70eac6d647a2ccea5cb982546ca7ebabae3311778c9c778';

function trace() {
    return {
        character: '帰',
        svg: '<svg viewBox="0 0 1 1"><path d="M0 0" /></svg>',
        strokeCount: 1,
        strokeShapes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
        source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'test' },
    } as const;
}

describe('l2-l23 exact-source Kanji 6 handover', () => {
    it('uses only source-visible Moodle vocabulary and readings, with Minna sequence-only and no audio', () => {
        const runtime = createAcademyActivityRuntime();
        const vocabulary = createLessonL2L23SourceVocabularyBeat().activity as SourceVocabularySheetModel;
        const sort = createLessonL2L23KanjiColumnSortBeat().activity as DragSortModel;
        const library = createLessonL2L23LibraryReadingBeat().activity as TypedResponseModel;
        const writing = createLessonL2L23ReturnWritingBeat(trace()).activity;

        expect([vocabulary, sort, library, writing].every(activity => runtime.validate(activity).length === 0)).toBe(true);
        expect(vocabulary).toMatchObject({
            sourceQuestionId: 'moodle:b6446cd4695a506e9ff357f64b6f471496fb30690c42836f2480b13857c4b7aa:page:3:reading-panel-1',
            payload: {
                exact: { words: '新聞', pronunciation: 'しんぶん', meaning: null },
                fieldProvenance: { words: 'source-provided', reading: 'source-provided', meaning: 'yomu-support' },
            },
        });
        expect(sort.payload.items.map(item => item.label)).toEqual(['今', '来', '帰', '会', '社', '聞', '読', '書', '話']);
        expect(sort.payload.zones.map(zone => zone.id)).toEqual(['movement', 'communication']);
        expect(library.payload.acceptedAnswers).toEqual(['としょかん']);
        expect(writing).toMatchObject({
            id: 'activity:l2-l23-source-return-writing',
            kind: 'kanji-writing',
            payload: { reading: 'かえる', review: { expression: '帰' } },
        });
    });

    it('grades the source sheet grouping and visible reading without importing a homework answer key', () => {
        const runtime = createAcademyActivityRuntime();
        const sort = createLessonL2L23KanjiColumnSortBeat().activity as DragSortModel;
        const passed = runtime.evaluate(sort, {
            placements: sort.payload.items.map(item => ({ itemId: item.id, zoneId: item.correctZoneId })),
        });
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([sort.sourceQuestionId, sort.sourceQuestionId]);

        const missed = runtime.evaluate(sort, {
            placements: sort.payload.items.map(item => ({ itemId: item.id, zoneId: item.label === '帰' ? 'communication' : item.correctZoneId })),
        });
        expect(missed.result).toMatchObject({ outcome: 'lapse', score: 8 / 9, errorTags: ['l2-l23-kanji-sheet-columns'] });

        const library = createLessonL2L23LibraryReadingBeat().activity as TypedResponseModel;
        expect(runtime.evaluate(library, 'としょかん').result.outcome).toBe('pass');
        expect(runtime.evaluate(library, 'としょ').result).toMatchObject({ outcome: 'lapse', errorTags: ['l2-l23-library-reading'] });
    });

    it('pins every canonical page, its docs mirror, offline registration, and the honest zero-audio ledger claim', () => {
        expect(L2_L23_SOURCE_PAGES).toHaveLength(7);
        for (const visual of L2_L23_SOURCE_PAGES) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l23', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l23', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l23', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }

        expect(sha256File(path.resolve('public/academy/content/lessons/050-l2-l23.json'))).toBe(SOURCE_PACKAGE_SHA256);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/050-l2-l23.json'), path.resolve('public/academy/content/lessons/050-l2-l23.json'))).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);

        const worker = readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        const hostedWorker = readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        for (const visual of L2_L23_SOURCE_PAGES) {
            expect(worker).toContain(`'${visual.url}'`);
            expect(hostedWorker).toContain(`'${visual.url}'`);
        }

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l2-l23');
        expect(slice).toMatchObject({
            moodleModuleId: 8121282,
            sourcePackage: { filename: '050-l2-l23.json', sha256: SOURCE_PACKAGE_SHA256 },
            sourceArchive: { id: 'archive-000093' },
            audio: { status: 'no-audio-members-in-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
            claims: { canonicalMoodlePagesRendered: 7, sourceAnswerKeysExposed: 0, originalAudioTracksDelivered: 0 },
        });
        expect(JSON.stringify(slice)).toContain('Minna no Nihongo II · Kanji strand 6');
        expect(JSON.stringify(slice)).toContain('no-Genki-source-mapped-for-this-package');
    });

    it('makes the exact-source chapter reachable with four varied, non-listening activities', async () => {
        const chapter = await loadLessonActivityChapter('l2-l23', { lookup: async character => character === '帰' ? trace() : null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l23',
            host: { id: 'shin' },
            beats: [
                { id: 'source-newspaper-row', activity: { kind: 'academy-source-vocabulary-sheet' } },
                { id: 'source-kanji-sheet-columns', activity: { kind: 'academy-drag-sort' } },
                { id: 'source-library-reading', activity: { kind: 'academy-typed-response' } },
                { id: 'source-return-writing', activity: { kind: 'kanji-writing' } },
            ],
        });
        expect(chapter?.introduction.en).toContain('no audio');
    });
});
