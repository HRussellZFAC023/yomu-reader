import path from 'node:path';
import { createLessonTwentyFrequencyLensBeat } from '../../src/academy/content/lesson-twenty-frequency-lens';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type FrequencyLensModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): FrequencyLensModel {
    return createLessonTwentyFrequencyLensBeat().activity as FrequencyLensModel;
}

describe('Lesson 20 Sensei frequency lens', () => {
    it('keeps all six Chapter 11-3 cues in source order, with Moodle first and labelled Minna/Genki support', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l20-sensei-frequency-lens',
            kind: 'academy-frequency-lens',
            provenance: {
                packageId: 'l1-l20',
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6310077,
                    payloadSha256: '14bf6fe4ba20b651eebe5639f9e87b2492592dc6ec92893ccd162e78289cc737',
                    lineLocus: { start: 26, end: 33 },
                },
                minna: { reference: 'Minna no Nihongo I, Lesson 11', role: 'post-instruction-context-and-paired-track-039' },
                genki: { reference: 'Genki I, Lesson 4 Grammar 9', role: 'post-instruction-duration-support', sourceSlice: [1, 6] },
            },
        });
        expect(activity.payload.rounds.map(round => round.sourceCue)).toEqual([
            'いちにち／いぬ と さんぽ を します（２）',
            'いっしゅうかん／にほんご を ならいます（1）',
            'いっしゅうかん／ヨガ を します（3）',
            'いっかげつ／ジム へ いきます（4）',
            'いちねん／りょこう します（2）',
            'いちねん／かのじょ に プレゼント を あげます（7）',
        ]);
    });

    it('requires the frequency lens, に, and the exact source count for every source cue', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const passed = runtime.evaluate(activity, { answers: activity.payload.rounds.map(round => ({
            roundId: round.id, lens: 'frequency', particle: 'ni', countId: round.correctCountId,
        })) });
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(6);
        expect(passed.reviewSeeds[0]).toMatchObject({
            sourceQuestionId: 'moodle:6310077:chapter-11-3:p1:exercise-1:item-1',
            content: { expression: 'いちにちに ２かい いぬと さんぽを します。' },
        });

        const lapsed = runtime.evaluate(activity, { answers: activity.payload.rounds.map(round => ({
            roundId: round.id, lens: 'duration', particle: 'none', countId: 'hours',
        })) });
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 0 });
        expect(lapsed.result.errorTags).toHaveLength(6);
    });

    it('ships the rendered answer-key-free worksheet and both exact source tracks in both public trees', () => {
        const assets = [
            ['moodle-chapter-11-3-frequency-page-1.png', 'eb21bacb07cd59fd5491708dbe05dc52a113833ba37869601c28986fc624bed4'],
            ['moodle-45-a-45.mp3', '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8'],
            ['moodle-minna-039.mp3', 'bca7547d5207c2a6b2abe6fd2df8716a1858fd02bbdf34d6195291900c75389d'],
        ] as const;
        for (const [filename, sha256] of assets) {
            const publicAsset = path.resolve('public/academy/content/lessons/l1-l20', filename);
            const docsAsset = path.resolve('docs/public/academy/content/lessons/l1-l20', filename);
            expect(sha256File(publicAsset)).toBe(sha256);
            expect(filesHaveSameContent(docsAsset, publicAsset)).toBe(true);
        }
    });

    it('places the new mechanic in the Jodi/Peter source-card story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l20', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l20',
            canonicalEpisodeId: 's1e09-the-story-in-two-tenses',
            host: { id: 'jodi' },
            beats: [{ id: 'sensei-frequency-lens', activity: { kind: 'academy-frequency-lens' } }],
        });
    });
});
