import fs from 'node:fs';
import path from 'node:path';
import { createLessonTwentySixKatakanaFinalRowShelfBeat } from '../../src/academy/content/lesson-twenty-six-katakana-final-row-shelf';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type KatakanaFinalRowShelfModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): KatakanaFinalRowShelfModel {
    return createLessonTwentySixKatakanaFinalRowShelfBeat().activity as KatakanaFinalRowShelfModel;
}

describe('Lesson 26 Sensei katakana final-row shelf', () => {
    it('teaches every exact Moodle final-row cell before using explicitly non-Moodle pronunciation support', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l26-sensei-katakana-final-row-shelf',
            kind: 'academy-katakana-final-row-shelf',
            responseKind: 'katakana-audio-final-row-shelf',
            payload: { audioSupport: { provider: 'canonical-yomu-pronunciation-service', sourceAudioStatus: 'not-present-in-moodle-archive' } },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'マ　ミ　ム　メ　モ　／　ヤ　ユ　ヨ　／　ラ　リ　ル　レ　ロ　／　ワ　ヲ　ン',
            'マ　ミ　ム　メ　モ　／　ヤ　ユ　ヨ　／　ラ　リ　ル　レ　ロ　／　ワ　ヲ　ン',
        ]);
        expect(activity.payload.shelves.map(shelf => [shelf.id, shelf.slots.length])).toEqual([
            ['ma', 5], ['ya', 3], ['ra', 5], ['wa', 3],
        ]);
        expect(activity.payload.rounds.map(round => round.kana)).toEqual([
            'ロ', 'ユ', 'メ', 'ン', 'リ', 'マ', 'ヨ', 'ル', 'ワ', 'ミ', 'ラ', 'モ', 'ヤ', 'レ', 'ヲ', 'ム',
        ]);
    });

    it('requires a unique visible shelf slot for every signal and reviews only missed source cells', () => {
        const activity = model(); const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map(round => ({ signalId: round.id, slotId: round.slotId })),
        });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(16);
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(activity.payload.rounds.map(round => round.kana));

        const repair = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map((round, index) => ({
                signalId: round.id,
                slotId: index === 0 ? 'ra:a' : index === 10 ? 'ra:o' : round.slotId,
            })),
        });
        expect(repair.result).toMatchObject({ outcome: 'lapse', score: 14 / 16, errorTags: ['l1-l26-katakana-ra-a', 'l1-l26-katakana-ra-o'] });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:5489607:katakana-worksheets:p1:ra-row:cell-o',
            'moodle:5489607:katakana-worksheets:p1:ra-row:cell-a',
        ]);
    });

    it('ships all three Moodle pages, records the no-audio archive truth, and precaches the source renders', () => {
        const assets = [
            ['moodle-katakana-worksheets-ma-ya-ra-wa-page-1.png', '19ce34abaf39b5798d13f352db7462d27e3ed326e51d0973d67c1b3b5de6044c'],
            ['moodle-katakana-writing-ma-ya-page-1.png', '489e36ae8a9fe64dcc8a7df53338aa49173b4b3cd7d14ab2b71cd329e4fcc488'],
            ['moodle-katakana-writing-ra-wa-page-2.png', '3c8399ccb89c07cfb76e08fcee0d7ac8dd6fcd5c07858e61f516a68dbf9ced4e'],
        ] as const;
        const worker = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        for (const [filename, sha256] of assets) {
            const source = path.resolve('public/academy/content/lessons/l1-l26', filename);
            const hosted = path.resolve('docs/public/academy/content/lessons/l1-l26', filename);
            expect(sha256File(source)).toBe(sha256);
            expect(filesHaveSameContent(hosted, source)).toBe(true);
            expect(worker).toContain(`'/academy/content/lessons/l1-l26/${filename}'`);
        }
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l26');
        expect(slice).toMatchObject({
            audio: { status: 'not-present-in-moodle-archive', sourceAudioMembers: 0 },
            claims: { sourceChartCellsDelivered: 16, sourceVisualCropsDelivered: 3, originalAudioTracksDelivered: 0 },
        });
        expect(JSON.stringify(slice)).toContain('Minna no Nihongo I, Katakana strand');
        expect(JSON.stringify(slice)).toContain('Genki I Lesson 2 literacy workbook 7');
        expect(JSON.stringify(slice)).toContain('Genki I Lesson 2 literacy workbook 9');
        expect(JSON.stringify(slice)).toMatch(/shorter ヤ行 and ワ行.*no absent positions.*invented/i);
    });

    it('makes the completed Lesson 26 activity reachable in Mika and Onke’s chapter', async () => {
        const chapter = await loadLessonActivityChapter('l1-l26', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l26',
            host: { id: 'mika' },
            beats: [{ id: 'sensei-katakana-final-row-shelf', activity: { kind: 'academy-katakana-final-row-shelf' } }],
        });
    });
});
