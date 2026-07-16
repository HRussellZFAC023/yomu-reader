import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ChoiceActivityModel } from '../../src/academy/activities/choice';
import {
    createLessonL2L26KuruImperativeBeat,
    createLessonL2L26RunnerSequenceBeat,
    createLessonL2L26SignMeaningBeat,
    createLessonL2L26VerbGroupSortBeat,
    L2_L26_SOURCE_PAGES,
} from '../../src/academy/content/lesson-l2-l26-imperative-source-return';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type DragSortModel, type SequenceModel, type TypedResponseModel } from '../../src/academy/minigames';

const SOURCE_PACKAGE_SHA256 = '42a67ed9eea0dd6d8c336c7813c1e3ade22b885ca78c6ec02e3cdebdda170afe';

describe('l2-l26 exact-source imperative and prohibitive return', () => {
    it('validates four varied, answer-gated activities with source wording intact', () => {
        const runtime = createAcademyActivityRuntime();
        const sign = createLessonL2L26SignMeaningBeat().activity as ChoiceActivityModel;
        const groups = createLessonL2L26VerbGroupSortBeat().activity as DragSortModel;
        const runner = createLessonL2L26RunnerSequenceBeat().activity as SequenceModel;
        const kuru = createLessonL2L26KuruImperativeBeat().activity as TypedResponseModel;

        expect([sign, groups, runner, kuru].every(activity => runtime.validate(activity).length === 0)).toBe(true);
        expect([sign, groups, runner, kuru].every(activity => activity.answerSupport?.id === 'academy-assessed-v1')).toBe(true);
        expect(sign.payload.options.map(option => option.label.en)).toEqual(['Do Not Use', 'Keep Out', 'Go Slow']);
        expect(groups.payload.items.map(item => [item.label, item.correctZoneId])).toEqual([
            ['いう', 'group-1'],
            ['あるく', 'group-1'],
            ['いそぐ', 'group-1'],
            ['にげる', 'group-2'],
            ['あきらめる', 'group-2'],
            ['たべる', 'group-2'],
            ['くる', 'irregular'],
            ['する', 'irregular'],
        ]);
        expect(runner.payload.correctOrder).toEqual(['cannot-run', 'distance-left', 'encourage']);
        expect(kuru.payload.acceptedAnswers).toEqual(['こい']);
    });

    it('grades all four modes and releases progressive repair only after an attempt', () => {
        const runtime = createAcademyActivityRuntime();
        const sign = createLessonL2L26SignMeaningBeat().activity as ChoiceActivityModel;
        expect(runtime.evaluate(sign, 'do-not-use').result.outcome).toBe('pass');
        expect(runtime.evaluate(sign, 'keep-out').result).toMatchObject({
            outcome: 'lapse',
            errorTags: ['l2-l26-sign-row-confusion'],
            feedback: { repairPrompt: expect.any(Object), nearbyExample: expect.any(Object) },
        });

        const groups = createLessonL2L26VerbGroupSortBeat().activity as DragSortModel;
        const placements = groups.payload.items.map(item => ({ itemId: item.id, zoneId: item.correctZoneId }));
        expect(runtime.evaluate(groups, { placements }).result).toMatchObject({ outcome: 'pass', score: 1 });
        expect(runtime.evaluate(groups, {
            placements: placements.map(placement => placement.itemId === 'kuru'
                ? { ...placement, zoneId: 'group-2' }
                : placement),
        }).result).toMatchObject({ outcome: 'lapse', score: 7 / 8, errorTags: ['l2-l26-source-verb-group'] });

        const runner = createLessonL2L26RunnerSequenceBeat().activity as SequenceModel;
        expect(runtime.evaluate(runner, { order: runner.payload.correctOrder }).result.outcome).toBe('pass');
        expect(runtime.evaluate(runner, { order: [...runner.payload.correctOrder].reverse() }).result)
            .toMatchObject({ outcome: 'lapse', errorTags: ['l2-l26-runner-source-order'] });

        const kuru = createLessonL2L26KuruImperativeBeat().activity as TypedResponseModel;
        expect(runtime.evaluate(kuru, 'こい').result.outcome).toBe('pass');
        expect(runtime.evaluate(kuru, 'くろ').result)
            .toMatchObject({ outcome: 'lapse', errorTags: ['l2-l26-kuru-imperative'] });
    });

    it('pins nine canonical pages, mirrors, offline URLs, and five quarantined audio members', () => {
        expect(L2_L26_SOURCE_PAGES).toHaveLength(9);
        for (const visual of L2_L26_SOURCE_PAGES) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l26', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l26', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(readdirSync(path.resolve('public/academy/content/lessons/l2-l26')).some(filename => filename.endsWith('.mp3'))).toBe(false);

        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/053-l2-l26.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex')).toBe(SOURCE_PACKAGE_SHA256);
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/053-l2-l26.json'))).toEqual(sourcePackage);
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));

        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            for (const visual of L2_L26_SOURCE_PAGES) expect(worker).toContain(`'${visual.url}'`);
            expect(worker).not.toMatch(/l2-l26\/[^']+\.mp3/u);
        }

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, any>> };
        };
        const slices = ledger.worksheetDigitisation.additionalSlices.filter(candidate => candidate.lessonId === 'l2-l26');
        expect(slices).toHaveLength(1);
        expect(slices[0]).toMatchObject({
            moodleModuleId: 8121288,
            sourcePackage: { filename: '053-l2-l26.json', sha256: SOURCE_PACKAGE_SHA256 },
            sourceArchive: { id: 'archive-000082' },
            audio: {
                status: 'five-source-audio-members-unpaired-and-quarantined',
                sourceAudioMembers: 5,
                sourceAudioTracksDelivered: 0,
            },
            claims: {
                canonicalMoodlePagesRendered: 9,
                sourceAnswerKeysExposed: 0,
                originalAudioTracksDelivered: 0,
                answerVisibility: 'after-attempt',
            },
        });
        expect(JSON.stringify(slices[0])).toContain('source-audio-recorded-task-pairing-unverified');
        expect(JSON.stringify(slices[0])).toContain('Minna no Nihongo II · Lessons 32–33');
    });

    it('makes l2-l26 reachable as four non-listening source activities', async () => {
        const chapter = await loadLessonActivityChapter('l2-l26', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l26',
            host: { id: 'christian' },
            beats: [
                { id: 'source-sign-meaning', activity: { kind: 'choice' } },
                { id: 'source-verb-group-sort', activity: { kind: 'academy-drag-sort' } },
                { id: 'source-runner-sequence', activity: { kind: 'academy-sequence' } },
                { id: 'source-kuru-imperative', activity: { kind: 'academy-typed-response' } },
            ],
        });
        expect(chapter?.introduction.en).toContain('Five archived audio files remain quarantined');
    });
});
