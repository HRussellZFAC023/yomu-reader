import fs from 'node:fs';
import path from 'node:path';
import { createLessonTwentyFourKatakanaTwoRowAudioRouteBeat } from '../../src/academy/content/lesson-twenty-four-katakana-two-row-audio-route';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type KatakanaTwoRowAudioRouteModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): KatakanaTwoRowAudioRouteModel {
    return createLessonTwentyFourKatakanaTwoRowAudioRouteBeat().activity as KatakanaTwoRowAudioRouteModel;
}

describe('Lesson 24 Sensei katakana two-row audio route', () => {
    it('teaches the exact Moodle sa and ta rows before using explicitly non-Moodle pronunciation support', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l24-sensei-katakana-two-row-audio-route',
            kind: 'academy-katakana-two-row-audio-route',
            responseKind: 'katakana-two-row-audio-route',
            payload: { audioSupport: { provider: 'canonical-yomu-pronunciation-service', sourceAudioStatus: 'not-present-in-moodle-archive' } },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'サ　シ　ス　セ　ソ　／　タ　チ　ツ　テ　ト',
            'サ　シ　ス　セ　ソ　／　タ　チ　ツ　テ　ト',
        ]);
        expect(activity.payload.rounds.map(round => round.kana)).toEqual(['ツ', 'セ', 'タ', 'シ', 'ト', 'サ', 'テ', 'ソ', 'チ', 'ス']);
        expect(activity.payload.rounds.map(round => `${round.rowId}:${round.vowelColumnId}`)).toEqual([
            'ta:u', 'sa:e', 'ta:a', 'sa:i', 'ta:o', 'sa:a', 'ta:e', 'sa:o', 'ta:i', 'sa:u',
        ]);
    });

    it('requires a row-and-vowel coordinate for every signal and reviews only missed chart cells', () => {
        const activity = model(); const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map(round => ({ roundId: round.id, cellId: `${round.rowId}:${round.vowelColumnId}` })),
        });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(['ツ', 'セ', 'タ', 'シ', 'ト', 'サ', 'テ', 'ソ', 'チ', 'ス']);

        const repair = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map((round, index) => ({
                roundId: round.id,
                cellId: index === 0 ? 'ta:a' : `${round.rowId}:${round.vowelColumnId}`,
            })),
        });
        expect(repair.result).toMatchObject({ outcome: 'lapse', score: 0.9, errorTags: ['l1-l24-katakana-ta-u'] });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:5489605:katakana-worksheets:p1:ta-row:cell-u']);
    });

    it('ships all three Moodle pages, records the no-audio archive truth, and precaches the source renders', () => {
        const assets = [
            ['moodle-katakana-worksheets-sa-za-ta-da-page-1.png', 'cba30d8842877f8687ac5d28ac7b0d7ab6f156c990e71c44b5e9113b79981e2f'],
            ['moodle-katakana-writing-sa-page-1.png', '325523de6a17787b0725b62cf682d4257e264fbcbf70078d7b56ef2fb6fbd2fe'],
            ['moodle-katakana-writing-ta-page-2.png', '7429b8e7831314f34a89e59475be2c56c4c9840d4e9ec05770e12c04908542b2'],
        ] as const;
        const worker = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        for (const [filename, sha256] of assets) {
            const source = path.resolve('public/academy/content/lessons/l1-l24', filename);
            const hosted = path.resolve('docs/public/academy/content/lessons/l1-l24', filename);
            expect(sha256File(source)).toBe(sha256);
            expect(filesHaveSameContent(hosted, source)).toBe(true);
            expect(worker).toContain(`'/academy/content/lessons/l1-l24/${filename}'`);
        }
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l24');
        expect(slice).toMatchObject({
            audio: { status: 'not-present-in-moodle-archive', sourceAudioMembers: 0 },
            claims: { sourceChartCellsDelivered: 10, sourceVisualCropsDelivered: 3, originalAudioTracksDelivered: 0 },
        });
        expect(JSON.stringify(slice)).toContain('Minna no Nihongo I, Katakana strand');
        expect(JSON.stringify(slice)).toContain('Genki I Lesson 2 literacy workbook 3');
    });

    it('makes the completed Lesson 24 activity reachable in Mika and Onke’s chapter', async () => {
        const chapter = await loadLessonActivityChapter('l1-l24', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l24',
            host: { id: 'mika' },
            beats: [{ id: 'sensei-katakana-two-row-audio-route', activity: { kind: 'academy-katakana-two-row-audio-route' } }],
        });
    });
});
