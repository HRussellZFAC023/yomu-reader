import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLessonTwentyFiveKatakanaRowSwitchboardBeat } from '../../src/academy/content/lesson-twenty-five-katakana-row-switchboard';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type KatakanaRowSwitchboardModel } from '../../src/academy/minigames';

function model(): KatakanaRowSwitchboardModel {
    return createLessonTwentyFiveKatakanaRowSwitchboardBeat().activity as KatakanaRowSwitchboardModel;
}

describe('Lesson 25 Sensei katakana row switchboard', () => {
    it('teaches the exact Moodle na and ha rows before using explicitly non-Moodle pronunciation support', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l25-sensei-katakana-row-switchboard',
            kind: 'academy-katakana-row-switchboard',
            responseKind: 'katakana-audio-row-switchboard',
            payload: { audioSupport: { provider: 'canonical-yomu-pronunciation-service', sourceAudioStatus: 'not-present-in-moodle-archive' } },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'ナ　ニ　ヌ　ネ　ノ　／　ハ　ヒ　フ　ヘ　ホ',
            'ナ　ニ　ヌ　ネ　ノ　／　ハ　ヒ　フ　ヘ　ホ',
        ]);
        expect(activity.payload.rounds.map(round => round.kana)).toEqual(['フ', 'ネ', 'ハ', 'ニ', 'ホ', 'ナ', 'ヘ', 'ノ', 'ヒ', 'ヌ']);
        expect(activity.payload.rounds.map(round => `${round.rowId}:${round.vowelColumnId}`)).toEqual([
            'ha:u', 'na:e', 'ha:a', 'na:i', 'ha:o', 'na:a', 'ha:e', 'na:o', 'ha:i', 'na:u',
        ]);
    });

    it('requires a separately set row switch and vowel dial for every signal and reviews only missed chart cells', () => {
        const activity = model(); const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map(round => ({ signalId: round.id, rowId: round.rowId, vowelColumnId: round.vowelColumnId })),
        });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(['フ', 'ネ', 'ハ', 'ニ', 'ホ', 'ナ', 'ヘ', 'ノ', 'ヒ', 'ヌ']);

        const repair = runtime.evaluate(activity, {
            answers: activity.payload.rounds.map((round, index) => ({
                signalId: round.id,
                rowId: index === 0 ? 'ha' : round.rowId,
                vowelColumnId: index === 0 ? 'a' : round.vowelColumnId,
            })),
        });
        expect(repair.result).toMatchObject({ outcome: 'lapse', score: 0.9, errorTags: ['l1-l25-katakana-ha-u'] });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:5489606:katakana-worksheets:p1:ha-row:cell-u']);
    });

    it('ships all three Moodle pages, records the no-audio archive truth, and precaches the source renders', () => {
        const assets = [
            ['moodle-katakana-worksheets-na-ha-pa-ba-page-1.png', '15f434e6c76102b2956f0634e9a1aebc01fd67ca75a63a2a386c66834e20814e'],
            ['moodle-katakana-writing-na-page-1.png', '07c75b5e11d0bc9484dcf07dcd6610278853bd250a7b4dfe30bf2687d217fcb2'],
            ['moodle-katakana-writing-ha-page-2.png', '38b51b4390d9f7890e85064c217080a5fcb1c5e274e45bad1e0d947af71220fd'],
        ] as const;
        const worker = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        for (const [filename, sha256] of assets) {
            const source = path.resolve('public/academy/content/lessons/l1-l25', filename);
            const hosted = path.resolve('docs/public/academy/content/lessons/l1-l25', filename);
            expect(createHash('sha256').update(fs.readFileSync(source)).digest('hex')).toBe(sha256);
            expect(fs.readFileSync(hosted)).toEqual(fs.readFileSync(source));
            expect(worker).toContain(`'/academy/content/lessons/l1-l25/${filename}'`);
        }
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l25');
        expect(slice).toMatchObject({
            audio: { status: 'not-present-in-moodle-archive', sourceAudioMembers: 0 },
            claims: { sourceChartCellsDelivered: 10, sourceVisualCropsDelivered: 3, originalAudioTracksDelivered: 0 },
        });
        expect(JSON.stringify(slice)).toContain('Minna no Nihongo I, Katakana strand');
        expect(JSON.stringify(slice)).toContain('Genki I Lesson 2 literacy workbook 5');
        expect(JSON.stringify(slice)).toMatch(/pa and ba rows.*not assessed/i);
    });

    it('makes the completed Lesson 25 activity reachable in Angel and Mika’s chapter', async () => {
        const chapter = await loadLessonActivityChapter('l1-l25', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l25',
            host: { id: 'angel' },
            beats: [{ id: 'sensei-katakana-row-switchboard', activity: { kind: 'academy-katakana-row-switchboard' } }],
        });
    });
});
