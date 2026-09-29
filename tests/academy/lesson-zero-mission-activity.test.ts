import fs from 'node:fs';
import path from 'node:path';
import { createSourceLibrary } from '../../src/academy/domain/source-library';
import {
    createLessonZeroMissionDefinition,
    evaluateLessonZeroMission as assessLessonZeroMission,
    LESSON_ZERO_MISSION_ACTIVITY_IDS,
    type LessonZeroMissionActivityId,
    type LessonZeroMissionResponse,
} from '../../src/academy/content/lesson-zero-mission-activity';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';

const lessonData = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
    'utf8',
)));
const content = {
    sourceLibrary: createSourceLibrary(lessonData.sourceLibrary),
    lesson: lessonData.lesson,
    grounding: validateLessonZeroGrounding(lessonData),
};

function evaluateLessonZeroMission(...args: Parameters<typeof assessLessonZeroMission>) {
    const result = assessLessonZeroMission(...args);
    if ('kind' in result) throw new Error('Expected an assessable response, received unassessed guidance.');
    return result;
}

const passingResponses: Readonly<Record<LessonZeroMissionActivityId, LessonZeroMissionResponse>> = {
    'activity:lesson-zero-text-input': { kind: 'particle-links', values: ['の', 'も'] },
    'activity:lesson-zero-speaking-input': {
        kind: 'spoken',
        performed: true,
        checkIds: ['responds-to-question', 'intelligible-name'],
        recorded: false,
    },
    'activity:lesson-zero-read-name-cards': {
        kind: 'name-card-evidence',
        personId: 'ruparna',
        lineId: 'line:lesson-zero-text-ruparna',
    },
    'activity:lesson-zero-write-name-card': { kind: 'written', text: 'ヘンリーです。' },
    'activity:lesson-zero-sound-transfer': {
        kind: 'spoken',
        performed: true,
        checkIds: ['mora-timing', 'repair-language', 'listen-back-reflection'],
        recorded: true,
    },
    'activity:lesson-zero-text-transfer': { kind: 'written', text: 'これはわたしの名札です。' },
    'activity:lesson-zero-speaking-transfer': {
        kind: 'spoken',
        performed: true,
        checkIds: ['greeting', 'true-introduction', 'question', 'repair', 'closing'],
        recorded: false,
    },
    'activity:lesson-zero-written-transfer': {
        kind: 'written',
        text: 'はじめまして。ヘンリーです。よろしくお願いします。',
    },
    'activity:lesson-zero-close-room': { kind: 'room-action', actionId: 'study' },
};

describe('Lesson Zero story mission evidence', () => {
    it('registers every mission with the Lesson Zero evidence gateway', () => {
        const registration = getCompleteLessonRegistration('lesson:foundation-00');

        expect(registration.trustedActivityIds).toEqual(expect.arrayContaining([
            ...LESSON_ZERO_MISSION_ACTIVITY_IDS,
        ]));
    });

    it.each(Object.entries(passingResponses) as [LessonZeroMissionActivityId, LessonZeroMissionResponse][])(
        'records a pass for the completed task %s',
        (activityId, response) => {
            const definition = createLessonZeroMissionDefinition(content, activityId, 'Henry');
            const evaluation = evaluateLessonZeroMission(definition, response, 100);

            expect(evaluation.attempt).toEqual(expect.objectContaining({
                activityId,
                outcome: 'pass',
                score: 1,
                conceptIds: definition.activity.conceptIds,
            }));
            for (const seed of evaluation.reviewSeeds) expect(seed.conceptId).toBeTruthy();
        },
    );

    it.each([
        ['activity:lesson-zero-text-transfer', 'aaaaのです'],
        ['activity:lesson-zero-text-transfer', 'のもです。'],
        ['activity:lesson-zero-text-transfer', 'これはわたしの名札です。garbage'],
        ['activity:lesson-zero-written-transfer', 'はじめましてです'],
        ['activity:lesson-zero-written-transfer', 'よろしくお願いしますです'],
        ['activity:lesson-zero-written-transfer', 'はじめまして。学生です。'],
        ['activity:lesson-zero-write-name-card', 'はじめましてです'],
        ['activity:lesson-zero-write-name-card', 'ヘンリーですgarbage'],
    ] as const)('does not certify malformed writing in %s: %s', (id, text) => {
        const result = assessLessonZeroMission(createLessonZeroMissionDefinition(content, id, 'Henry'), { kind: 'written', text });
        expect(result).toMatchObject({ kind: 'unassessed', feedback: expect.objectContaining({ repairPrompt: expect.any(Object) }) });
        expect(result).not.toHaveProperty('attempt');
        expect(result).not.toHaveProperty('reviewSeeds');
    });

    it.each([
        ['activity:lesson-zero-text-transfer', 'わたしも日本語を勉強しています。'],
        ['activity:lesson-zero-text-transfer', '私も学生です'],
        ['activity:lesson-zero-text-transfer', 'これはソフィーのノートです。'],
        ['activity:lesson-zero-written-transfer', 'はじめまして。Henryです。'],
        ['activity:lesson-zero-written-transfer', 'ヘンリーです。よろしくおねがいします。'],
        ['activity:lesson-zero-written-transfer', 'はじめまして。私はヘンリーです。'],
        ['activity:lesson-zero-write-name-card', 'Anne-Marieです。'],
    ] as const)('accepts a supported meaningful variant in %s: %s', (id, text) => {
        expect(evaluateLessonZeroMission(createLessonZeroMissionDefinition(content, id, 'Henry'), { kind: 'written', text }).attempt.outcome).toBe('pass');
    });

    it('does not replace personal writing or a navigation choice with an unrelated review card', () => {
        for (const id of ['activity:lesson-zero-write-name-card', 'activity:lesson-zero-text-transfer', 'activity:lesson-zero-written-transfer', 'activity:lesson-zero-close-room'] as const) {
            const result = evaluateLessonZeroMission(createLessonZeroMissionDefinition(content, id, 'Henry'), passingResponses[id]);
            expect(result.reviewSeeds).toEqual([]);
        }
    });

    it('does not score a grammatical sentence beyond the supported class-note patterns', () => {
        const result = assessLessonZeroMission(createLessonZeroMissionDefinition(content, 'activity:lesson-zero-text-transfer', 'Henry'),
            { kind: 'written', text: '昨日、図書館で日本語を勉強しました。' });
        expect(result).toMatchObject({ kind: 'unassessed' });
        expect(result).not.toHaveProperty('attempt');
        expect(result).not.toHaveProperty('reviewSeeds');
    });

    it('preserves the previously chosen name spelling rather than imposing a new name policy', () => {
        for (const name of ['J. O’Neill', '山田 太郎', 'A・B']) {
            const definition = createLessonZeroMissionDefinition(content, 'activity:lesson-zero-write-name-card', name, name);
            expect(evaluateLessonZeroMission(definition, { kind: 'written', text: `${name}です。` }).attempt.outcome).toBe('pass');
        }
    });

    it('seeds the actual authored reading line, without attributing it to the classroom PDF', () => {
        const id = 'activity:lesson-zero-read-name-cards';
        const result = evaluateLessonZeroMission(createLessonZeroMissionDefinition(content, id, 'Henry'), passingResponses[id]);
        expect(result.reviewSeeds[0]?.content).toMatchObject({ expression: 'Ruparnaです。わたしも日本語を勉強しています。', meanings: ["I'm Ruparna. I'm studying Japanese too."] });
        expect(result.reviewSeeds[0]?.sourceQuestionId).toBeUndefined();
    });

    it('attributes the repeat request to phrase 09, not the listen instruction, and keeps authored questions separate', () => {
        const sound = 'activity:lesson-zero-sound-transfer';
        const soundResult = evaluateLessonZeroMission(createLessonZeroMissionDefinition(content, sound, 'Henry'), passingResponses[sound]);
        expect(soundResult.reviewSeeds[0]).toMatchObject({ sourceQuestionId: 'source-question:classroom-phrase-09', content: { expression: 'もう一度お願いします。' } });
        const speaking = 'activity:lesson-zero-speaking-input';
        const question = evaluateLessonZeroMission(createLessonZeroMissionDefinition(content, speaking, 'Henry'), passingResponses[speaking]);
        expect(question.reviewSeeds[0]?.content.expression).toBe('お名前は何ですか。');
        expect(question.reviewSeeds[0]?.sourceQuestionId).toBeUndefined();
        expect(question.attempt.sourceQuestionId).toBeUndefined();
    });

    it('schedules the corrected reading content once across repeated attempts and reload', async () => {
        const repository = createMemoryLearnerEventRepository();
        const review = { ingest: vi.fn(async () => undefined), due: async () => [], rate: async () => undefined };
        const resolver = { resolve: async () => content.grounding };
        const evidence = createLearnerEvidence(repository, review, resolver);
        await evidence.initialize();
        const id = 'activity:lesson-zero-read-name-cards';
        const definition = createLessonZeroMissionDefinition(content, id, 'Henry');
        await evidence.recordActivity(evaluateLessonZeroMission(definition, passingResponses[id], 100), 'lesson:foundation-00');
        const reloaded = createLearnerEvidence(repository, review, resolver);
        await reloaded.initialize();
        await reloaded.recordActivity(evaluateLessonZeroMission(definition, passingResponses[id], 200), 'lesson:foundation-00');
        const events = (await repository.readAll()).filter(event => event.kind === 'review-scheduled');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ eventId: `review-scheduled:academy:review:${id}:task-content-v2`, conceptId: 'concept:reading-for-evidence' });
        expect(review.ingest).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ content: expect.objectContaining({ expression: 'Ruparnaです。わたしも日本語を勉強しています。' }) })]));
    });

    it.each([
        ['activity:lesson-zero-text-input', { kind: 'particle-links', values: ['は', 'を'] }],
        ['activity:lesson-zero-read-name-cards', {
            kind: 'name-card-evidence', personId: 'sophie', lineId: 'line:lesson-zero-text-sophie',
        }],
        ['activity:lesson-zero-write-name-card', { kind: 'written', text: 'です。' }],
        ['activity:lesson-zero-speaking-input', {
            kind: 'spoken', performed: true, checkIds: [], recorded: false,
        }],
        ['activity:lesson-zero-close-room', { kind: 'room-action', actionId: 'unknown' }],
    ] as [LessonZeroMissionActivityId, LessonZeroMissionResponse][])(
        'keeps %s in a repair loop when its evidence is incomplete',
        (activityId, response) => {
            const evaluation = assessLessonZeroMission(
                createLessonZeroMissionDefinition(content, activityId, 'Henry'),
                response,
                200,
            );

            if ('kind' in evaluation) {
                expect(response.kind).toBe('written');
                expect(evaluation.feedback.repairPrompt).toBeTruthy();
                return;
            }
            expect(evaluation.attempt.outcome).toBe('lapse');
            expect(evaluation.result.feedback.repairPrompt).toBeTruthy();
            expect(evaluation.reviewSeeds).toEqual([]);
        },
    );

    it('only exposes ready authored audio to a mission screen', () => {
        expect(createLessonZeroMissionDefinition(
            content,
            'activity:lesson-zero-sound-transfer',
            'Henry',
        ).audioUrl).toBe('/academy/audio/lesson-zero/sound-hosts.opus');
        expect(createLessonZeroMissionDefinition(
            content,
            'activity:lesson-zero-speaking-input',
            'Henry',
        ).audioUrl).toBe('/academy/audio/lesson-zero/speaking-hosts.opus');
    });
});
