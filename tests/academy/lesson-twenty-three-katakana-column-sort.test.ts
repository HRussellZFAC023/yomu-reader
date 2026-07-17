import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLessonTwentyThreeKatakanaColumnSortBeat } from '../../src/academy/content/lesson-twenty-three-katakana-column-sort';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type KatakanaColumnSortModel } from '../../src/academy/minigames';

function model(): KatakanaColumnSortModel {
    return createLessonTwentyThreeKatakanaColumnSortBeat().activity as KatakanaColumnSortModel;
}

describe('Lesson 23 Sensei katakana column sort', () => {
    it('teaches the exact Moodle ka row before using explicitly non-Moodle pronunciation support', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l23-sensei-katakana-column-sort',
            kind: 'academy-katakana-column-sort',
            responseKind: 'katakana-audio-column-sort',
            payload: {
                audioSupport: {
                    provider: 'canonical-yomu-pronunciation-service',
                    sourceAudioStatus: 'not-present-in-moodle-archive',
                    role: 'post-instruction-runtime-pronunciation-support',
                },
            },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual(['カ　キ　ク　ケ　コ', 'カ　キ　ク　ケ　コ']);
        expect(activity.payload.rounds.map(round => round.kana)).toEqual(['ク', 'カ', 'コ', 'キ', 'ケ']);
        expect(activity.payload.rounds.map(round => round.vowelColumnId)).toEqual(['u', 'a', 'o', 'i', 'e']);
    });

    it('requires one ka-row tile in every source vowel column and reviews only missed cells', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const passed = runtime.evaluate(activity, {
            placements: activity.payload.rounds.map(round => ({ kanaId: round.id, columnId: round.vowelColumnId })),
        });
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds.map(seed => seed.content.expression)).toEqual(['ク', 'カ', 'コ', 'キ', 'ケ']);

        const shiftedColumns = ['a', 'o', 'i', 'e', 'u'];
        const lapsed = runtime.evaluate(activity, {
            placements: activity.payload.rounds.map((round, index) => ({ kanaId: round.id, columnId: shiftedColumns[index] })),
        });
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 0 });
        expect(lapsed.reviewSeeds).toHaveLength(5);
    });

    it('ships both source pages, tracks the no-audio archive truth, and keeps Genki and Minna in their support roles', () => {
        const assets = [
            ['moodle-katakana-worksheets-a-ka-ga-page-1.png', '6cbfa4c81eddce26f264bf7f7ec2bf940db3bed1a98390d5404eb36ee9d0df30'],
            ['moodle-katakana-writing-ka-page-2.png', '79eb8e8d59c8031511e04d36b440567d022138b1c8aee7dfae021e5277793930'],
        ] as const;
        for (const [filename, sha256] of assets) {
            const source = path.resolve('public/academy/content/lessons/l1-l23', filename);
            const hosted = path.resolve('docs/public/academy/content/lessons/l1-l23', filename);
            expect(createHash('sha256').update(fs.readFileSync(source)).digest('hex')).toBe(sha256);
            expect(fs.readFileSync(hosted)).toEqual(fs.readFileSync(source));
        }
        const ledger = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        const slice = ledger.worksheetDigitisation.additionalSlices.find(candidate => candidate.lessonId === 'l1-l23');
        expect(slice).toMatchObject({
            audio: { status: 'not-present-in-moodle-archive', sourceAudioMembers: 0 },
            claims: { sourceChartCellsDelivered: 5, originalAudioTracksDelivered: 0 },
        });
        expect(JSON.stringify(slice)).toContain('Minna no Nihongo I, Katakana strand');
        expect(JSON.stringify(slice)).toContain('Genki I Lesson 2 literacy workbook 2');
    });

    it('makes the completed Lesson 23 activity reachable in Onke and Sophie’s chapter', async () => {
        const chapter = await loadLessonActivityChapter('l1-l23', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l23',
            host: { id: 'angel' },
            beats: [{ id: 'sensei-katakana-column-sort', activity: { kind: 'academy-katakana-column-sort' } }],
        });
    });
});
