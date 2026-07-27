import fs from 'node:fs';
import path from 'node:path';
import { createSourceLibrary } from '../../src/academy/domain/source-library';
import {
    createLessonZeroMissionDefinition,
    evaluateLessonZeroMission,
    LESSON_ZERO_MISSION_ACTIVITY_IDS,
    type LessonZeroMissionActivityId,
    type LessonZeroMissionResponse,
} from '../../src/academy/content/lesson-zero-mission-activity';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';

const lessonData = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
    path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
    'utf8',
)));
const content = {
    sourceLibrary: createSourceLibrary(lessonData.sourceLibrary),
    lesson: lessonData.lesson,
    grounding: validateLessonZeroGrounding(lessonData),
};

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
        'records a real pass and SRS seed for %s',
        (activityId, response) => {
            const definition = createLessonZeroMissionDefinition(content, activityId, 'Henry');
            const evaluation = evaluateLessonZeroMission(definition, response, 100);

            expect(evaluation.attempt).toEqual(expect.objectContaining({
                activityId,
                outcome: 'pass',
                score: 1,
                conceptIds: definition.activity.conceptIds,
            }));
            expect(evaluation.reviewSeeds).toHaveLength(1);
            expect(evaluation.reviewSeeds[0]?.conceptId).toBeTruthy();
        },
    );

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
            const evaluation = evaluateLessonZeroMission(
                createLessonZeroMissionDefinition(content, activityId, 'Henry'),
                response,
                200,
            );

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
