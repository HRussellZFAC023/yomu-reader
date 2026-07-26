import {
    createLessonZeroVowelBingo,
    createLessonZeroVowelSoundMap,
} from '../../src/academy/content/lesson-zero-vowel-sound-map';
import {
    lessonZeroVowelResponse,
    startLessonZeroVowelSession,
    transitionLessonZeroVowelSession,
    type LessonZeroVowelSessionAction,
} from '../../src/academy/domain/lesson-zero-vowel-session';
import {
    HONEN_DAY_ONE_CARD_MAPPINGS,
    HONEN_DAY_ONE_COURSE_ID,
    HONEN_DAY_ONE_SOURCE_RECEIPTS,
    HONEN_DAY_ONE_TOPICS,
    HONEN_DAY_ONE_VOWEL_CONTRASTS,
} from '../../src/academy/integration/honen-day-one';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { createLessonZeroVowelScreen } from '../../src/academy/ui/lesson-zero-vowel-screen';

const YOMU_DAY_ONE_ACTIVITY_IDS = new Set([
    'activity:lesson-zero-vowel-listen',
    'game:lesson-zero-vowel-listening-bingo',
    'activity:lesson-zero-vowel-doodle',
    'activity:lesson-zero-greet-rie',
    'activity:lesson-zero-follow-instructions',
    'activity:lesson-zero-reconstruct-repair',
    'activity:lesson-zero-desk-language',
    'activity:lesson-zero-build-sentence-frames',
    'activity:lesson-zero-name-card-draft',
    'activity:lesson-zero-sound-transfer',
    'activity:lesson-zero-speaking-transfer',
    'activity:lesson-zero-close-room',
]);

describe('Honen Day One curriculum augmentation', () => {
    it('maps every ready topic, activity, and flashcard into the Yomu Day One progression', () => {
        const activities = HONEN_DAY_ONE_TOPICS.flatMap(topic => topic.activities);
        expect(HONEN_DAY_ONE_TOPICS).toHaveLength(21);
        expect(activities).toHaveLength(63);
        expect(HONEN_DAY_ONE_CARD_MAPPINGS).toHaveLength(105);
        expect(new Set(HONEN_DAY_ONE_TOPICS.map(topic => topic.topicId)).size).toBe(21);
        expect(new Set(activities.map(activity => activity.id)).size).toBe(63);
        expect(new Set(HONEN_DAY_ONE_CARD_MAPPINGS.map(card => card.id)).size).toBe(105);
        expect(HONEN_DAY_ONE_TOPICS.every(topic =>
            topic.yomuLessonId === 'lesson:foundation-00'
            && YOMU_DAY_ONE_ACTIVITY_IDS.has(topic.yomuActivityId))).toBe(true);
        expect(HONEN_DAY_ONE_CARD_MAPPINGS.every(card =>
            card.yomuLessonId === 'lesson:foundation-00'
            && YOMU_DAY_ONE_ACTIVITY_IDS.has(card.yomuActivityId))).toBe(true);
    });

    it('augments rather than replaces the exact source, story hook, and SRS contract', () => {
        const lesson = createLessonZeroVowelSoundMap();
        const bingo = createLessonZeroVowelBingo();

        expect(lesson.payload.source).toMatchObject({
            sourceId: 'moodle-raw',
            role: 'kana-a-row-writing',
            sourceSha256: 'fe962ee2dc21478ffe53a24ba77ef0abb5a7685ab7a6eda8f79ac63817ad7dd6',
            storyHook: {
                sceneId: 'scene:blank-atlas:sound-script-map',
                activityId: 'activity:lesson-zero-vowel-listen',
            },
            augmentation: {
                provider: 'honen',
                courseId: HONEN_DAY_ONE_COURSE_ID,
                topicId: '6a653ad6033103525883c229',
                activityId: '6a653ad6ff074df7fbe1b943',
                activityKind: 'QUIZ',
                mappedActivityId: 'activity:lesson-zero-vowel-listen',
                renderOwner: 'yomu',
            },
        });
        expect(bingo.payload.source.augmentation).toMatchObject({
            provider: 'honen',
            courseId: HONEN_DAY_ONE_COURSE_ID,
            topicId: '6a653ad6ba9069fd1d52ec37',
            activityId: '6a65476ec6b17a86e3547383',
            activityKind: 'GAME',
            mappedActivityId: 'game:lesson-zero-vowel-listening-bingo',
            renderOwner: 'yomu',
        });
        expect(bingo.payload.source.augmentation?.sourceReceipts).toEqual(HONEN_DAY_ONE_SOURCE_RECEIPTS);
        expect(bingo.payload.contrastRepairs).toEqual(HONEN_DAY_ONE_VOWEL_CONTRASTS);
        expect(bingo.payload.contrastRepairs?.map(contrast => contrast.sourceQuestionId)).toEqual([
            '6a653ad6ba9069fd1d52ec37-g-1',
            '6a653ad6ba9069fd1d52ec37-g-2',
            '6a653ad6ba9069fd1d52ec37-g-3',
        ]);
        expect(lesson.payload.items.map(item => item.reviewSeedId)).toEqual([
            'review:lesson-zero:vowel-sound:hira-a',
            'review:lesson-zero:vowel-sound:hira-i',
            'review:lesson-zero:vowel-sound:hira-u',
            'review:lesson-zero:vowel-sound:hira-e',
            'review:lesson-zero:vowel-sound:hira-o',
        ]);
    });

    it('turns a Bingo miss into a Yomu-authored adjacent-sound repair', async () => {
        const model = createLessonZeroVowelSoundMap();
        const bingoModel = createLessonZeroVowelBingo();
        const runtime = createAcademyActivityRuntime();
        let state = startLessonZeroVowelSession(model);
        const apply = (action: LessonZeroVowelSessionAction) => {
            const transition = transitionLessonZeroVowelSession(model, state, action, Date.now());
            state = transition.state;
            return transition;
        };
        apply({ kind: 'start' });
        for (const item of model.payload.items) apply({ kind: 'learn-item', itemId: item.id });
        apply({ kind: 'begin-attempt' });
        apply({ kind: 'choose-mode', mode: 'visual' });
        for (const roundId of state.roundOrder) {
            apply({ kind: 'select', kanaId: roundId });
        }
        const lessonEvaluation = runtime.evaluate(model, lessonZeroVowelResponse(model, state));
        apply({ kind: 'record-result', evaluation: lessonEvaluation });
        apply({ kind: 'start-bingo' });
        apply({ kind: 'choose-mode', mode: 'visual' });
        const selections = state.roundOrder.map((roundId, index) => ({
            roundId,
            kanaId: index === 0
                ? model.payload.items.find(item => item.id !== roundId)!.id
                : roundId,
        }));
        for (const selection of selections) apply({ kind: 'select', kanaId: selection.kanaId });
        const bingoEvaluation = runtime.evaluate(bingoModel, lessonZeroVowelResponse(model, state));
        const lapse = apply({ kind: 'record-result', evaluation: bingoEvaluation });

        expect(lapse.state.stage).toBe('repair');
        expect(lapse.state.repairItemIds).toHaveLength(1);
    });

    it('renders the Honen-derived revision through Yomu without exposing a competing course UI', () => {
        const model = createLessonZeroVowelSoundMap();
        const bingoModel = createLessonZeroVowelBingo();
        const runtime = createAcademyActivityRuntime();
        const screen = createLessonZeroVowelScreen({
            language: 'en',
            model,
            bingoModel,
            initialState: startLessonZeroVowelSession(model),
            pronunciation: { play: vi.fn() } as never,
            xingyuSprite: '/academy/art/characters/xingyu/test.png',
            evaluate: (variant, response) =>
                runtime.evaluate(variant === 'bingo' ? bingoModel : model, response),
            onTransition: vi.fn(),
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });

        expect(screen.element.dataset).toMatchObject({
            academyScreen: 'lesson-zero-vowel-lab',
            curriculumAugmentation: 'honen',
            curriculumCourseId: HONEN_DAY_ONE_COURSE_ID,
            curriculumTopicId: '6a653ad6ba9069fd1d52ec37',
            curriculumActivityId: '6a65476ec6b17a86e3547383',
            curriculumRenderOwner: 'yomu',
        });
        expect(screen.element.textContent).toContain('Xingyu');
        expect(screen.element.textContent).toContain('Five sounds open the language');
        expect(screen.element.textContent).not.toMatch(/Honen|course builder|curriculum designer/i);
        expect(screen.element.querySelector('iframe')).toBeNull();
        screen.dispose();
    });
});
