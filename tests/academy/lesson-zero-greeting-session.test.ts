import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroGreetingDefinition } from '../../src/academy/content/lesson-zero-greeting';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    lessonZeroGreetingSessionSnapshotShapeIsValid,
    startLessonZeroGreetingSession,
    transitionLessonZeroGreetingSession,
} from '../../src/academy/domain/lesson-zero-greeting-session';

function definition() {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
        path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
        'utf8',
    ))).lesson;
    return createLessonZeroGreetingDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-greet-rie')!,
        'Henry',
    );
}

function arrangedState() {
    const content = definition();
    let state = transitionLessonZeroGreetingSession(
        content,
        startLessonZeroGreetingSession(content),
        { kind: 'start' },
        1,
    ).state;
    for (const chunkId of ['evening', 'first-meeting', 'name', 'closing'] as const) {
        state = transitionLessonZeroGreetingSession(content, state, { kind: 'select-chunk', chunkId }, 2).state;
    }
    return {
        content,
        state: transitionLessonZeroGreetingSession(content, state, { kind: 'check-arrangement' }, 3).state,
    };
}

describe('Lesson Zero first greeting session', () => {
    it('builds the learner name into the authored four-part greeting', () => {
        const content = definition();
        expect(content.chunks.map(chunk => chunk.japanese)).toEqual([
            'こんばんは。',
            'はじめまして。',
            'Henryです。',
            'よろしくお願いします。',
        ]);
        expect(content.conceptIds).toEqual([
            'concept:first-meeting-greeting',
            'concept:self-introduction-name',
        ]);
    });

    it('keeps arrangement instructional and assesses the independent greeting', () => {
        const content = definition();
        let state = transitionLessonZeroGreetingSession(
            content,
            startLessonZeroGreetingSession(content),
            { kind: 'start' },
            1,
        ).state;
        for (const chunkId of ['closing', 'name', 'first-meeting', 'evening'] as const) {
            state = transitionLessonZeroGreetingSession(content, state, { kind: 'select-chunk', chunkId }, 2).state;
        }
        const wrong = transitionLessonZeroGreetingSession(content, state, { kind: 'check-arrangement' }, 3);
        expect(wrong.arrangementCorrect).toBe(false);
        expect(wrong.evaluation).toBeUndefined();
        expect(wrong.state.stage).toBe('arrange');
    });

    it('records a transparent lapse, earned supports, repair and four SRS memories', () => {
        const { content, state: arranged } = arrangedState();
        let state = transitionLessonZeroGreetingSession(
            content,
            arranged,
            { kind: 'choose-mode', mode: 'typed' },
            4,
        ).state;
        const lapse = transitionLessonZeroGreetingSession(
            content,
            state,
            { kind: 'submit-typed', response: 'はじめまして。Henryです。' },
            5,
        );
        expect(lapse.evaluation).toMatchObject({
            attempt: {
                activityId: 'activity:lesson-zero-greet-rie',
                responseKind: 'typed-accessible-speaking-alternative',
                outcome: 'lapse',
                errorTags: ['greeting-order'],
            },
        });
        expect(lapse.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript',
            'translation',
            'model-answer',
        ]);
        expect(lapse.evaluation?.reviewSeeds).toEqual([]);

        state = lapse.state;
        const repaired = transitionLessonZeroGreetingSession(
            content,
            state,
            {
                kind: 'submit-typed',
                response: 'こんばんは。はじめまして。 Henry です。よろしくお願いします。',
            },
            6,
        );
        expect(repaired.state.status).toBe('complete');
        expect(repaired.evaluation?.reviewSeeds).toHaveLength(4);
        expect(repaired.evaluation?.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
        expect(repaired.adaptive).toMatchObject({ skill: 'writing', action: 'repair', independent: false });
    });

    it('accepts a recorded take only after both learner checks are explicit', () => {
        const { content, state: arranged } = arrangedState();
        let state = transitionLessonZeroGreetingSession(
            content,
            arranged,
            { kind: 'choose-mode', mode: 'recorded' },
            4,
        ).state;
        const lapse = transitionLessonZeroGreetingSession(
            content,
            state,
            { kind: 'submit-self-check', greetingOrder: true, nameIntelligible: false },
            5,
        );
        expect(lapse.evaluation?.attempt).toMatchObject({ outcome: 'lapse', errorTags: ['name-intelligibility'] });
        state = lapse.state;
        const pass = transitionLessonZeroGreetingSession(
            content,
            state,
            { kind: 'submit-self-check', greetingOrder: true, nameIntelligible: true },
            6,
        );
        expect(pass.evaluation?.attempt.responseKind).toBe('spoken-self-check');
        expect(pass.adaptive).toMatchObject({ skill: 'speaking', action: 'repair' });
    });

    it('round-trips paused snapshots and rejects impossible complete snapshots', () => {
        const { content, state } = arrangedState();
        const paused = transitionLessonZeroGreetingSession(content, state, { kind: 'pause' }, 4).state;
        expect(startLessonZeroGreetingSession(content, paused)).toEqual(paused);
        expect(lessonZeroGreetingSessionSnapshotShapeIsValid({ ...paused, status: 'complete' })).toBe(false);
        expect(lessonZeroGreetingSessionSnapshotShapeIsValid({ ...paused, stage: 'complete' })).toBe(false);
    });
});
