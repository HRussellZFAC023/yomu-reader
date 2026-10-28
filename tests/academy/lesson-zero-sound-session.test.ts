import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroSoundDefinition } from '../../src/academy/content/lesson-zero-sound';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    lessonZeroSoundSessionSnapshotShapeIsValid,
    startLessonZeroSoundSession,
    transitionLessonZeroSoundSession,
    type LessonZeroSoundDefinition,
    type LessonZeroSoundSessionState,
} from '../../src/academy/domain/lesson-zero-sound-session';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
const MANIFEST_PATH = path.resolve('docs/academy/audio/lesson-zero-sound-manifest.json');

function definition() {
    const data = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8')));
    return createLessonZeroSoundDefinition({
        lesson: data.lesson,
        sourceLibrary: {} as never,
        grounding: {} as never,
    });
}

describe('Lesson Zero sound session', () => {
    it('binds two introductions and a changed-speaker check to reproducible character audio', () => {
        const content = definition();
        expect(getCompleteLessonRegistration('lesson:foundation-00').trustedActivityIds)
            .toContain(content.activityId);
        expect(content.lines).toEqual([
            expect.objectContaining({
                id: 'line:lesson-zero-sound-xingyu',
                phase: 'introduction',
                speakerId: 'xingyu',
                targetSpeakerId: 'xingyu',
                japanese: 'はじめまして。シンユです。',
                audioUrl: '/academy/audio/lesson-zero/sound-xingyu.opus',
            }),
            expect.objectContaining({
                id: 'line:lesson-zero-sound-mika',
                phase: 'introduction',
                speakerId: 'mika',
                targetSpeakerId: 'mika',
                japanese: 'ミカです。よろしくお願いします。',
                audioUrl: '/academy/audio/lesson-zero/sound-mika.opus',
            }),
            expect.objectContaining({
                id: 'line:lesson-zero-sound-mika-names-xingyu',
                phase: 'check',
                speakerId: 'mika',
                targetSpeakerId: 'xingyu',
                japanese: 'こちらはシンユさんです。',
                audioUrl: '/academy/audio/lesson-zero/sound-mika-names-xingyu.opus',
            }),
            expect.objectContaining({
                id: 'line:lesson-zero-sound-xingyu-names-mika',
                phase: 'check',
                speakerId: 'xingyu',
                targetSpeakerId: 'mika',
                japanese: 'こちらはミカさんです。',
                audioUrl: '/academy/audio/lesson-zero/sound-xingyu-names-mika.opus',
            }),
        ]);
        expect(content.speakers.every(speaker => speaker.portraitUrl?.startsWith('/academy/art/characters/')))
            .toBe(true);

        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as {
            qualityBoundary: string;
            lines: Array<{ runtimeUrl: string; fileSha256: string }>;
        };
        expect(manifest.qualityBoundary).toMatch(/no human-audition claim/i);
        expect(manifest.lines).toHaveLength(4);
        for (const line of manifest.lines) {
            const file = path.resolve('public', line.runtimeUrl.replace(/^\//, ''));
            const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
            expect(digest).toBe(line.fileSha256);
        }
    });

    it('teaches both exact names before testing them in reversed speaker order', () => {
        const content = definition();
        let state = startLessonZeroSoundSession(content);
        expect(state).toMatchObject({ stage: 'meet', introduced: false });

        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard',
            lineId: 'line:lesson-zero-sound-mika-names-xingyu',
        }, 1).state;
        expect(state.heardLineIds).toEqual([]);
        expect(transitionLessonZeroSoundSession(content, state, { kind: 'begin-check' }, 2).state.stage)
            .toBe('meet');

        state = meetAndBegin(content, state, 10);
        expect(state).toMatchObject({ stage: 'attempt', introduced: true, heardLineIds: [] });
        expect(checkLines(content).map(line => [line.speakerId, line.targetSpeakerId])).toEqual([
            ['mika', 'xingyu'],
            ['xingyu', 'mika'],
        ]);

        for (const line of checkLines(content)) {
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker',
                lineId: line.id,
                speakerId: line.targetSpeakerId,
            }, 20).state;
            expect(state.selections.some(selection => selection.lineId === line.id)).toBe(false);
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard',
                lineId: line.id,
            }, 21).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker',
                lineId: line.id,
                speakerId: line.targetSpeakerId,
            }, 22).state;
        }
        const passed = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 23);

        expect(passed.state).toMatchObject({ status: 'complete', stage: 'complete' });
        expect(passed.evaluation?.attempt).toMatchObject({
            outcome: 'pass', score: 1, responseKind: 'audio-name-match',
        });
        expect(passed.evaluation?.reviewSeeds.map(seed => [seed.id, seed.content.expression])).toEqual([
            ['review:lesson-zero:name:xingyu', 'シンユ'],
            ['review:lesson-zero:name:mika', 'ミカ'],
        ]);
        expect(passed.adaptive).toMatchObject({ skill: 'listening', action: 'listen', independent: true });
    });

    it('repairs only the missed name, then retries only that changed-speaker line', () => {
        const content = definition();
        let state = meetAndBegin(content, startLessonZeroSoundSession(content), 10);
        const [xingyuCheck, mikaCheck] = checkLines(content);
        for (const line of checkLines(content)) {
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: line.id,
            }, 20).state;
        }
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: xingyuCheck!.id, speakerId: 'xingyu',
        }, 21).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: mikaCheck!.id, speakerId: 'xingyu',
        }, 22).state;
        const lapse = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 23);
        expect(lapse.state.stage).toBe('repair');
        expect(lapse.evaluation?.attempt).toMatchObject({ outcome: 'lapse', score: 0.5 });
        expect(lapse.state.attempts[0]?.missedLineIds).toEqual([mikaCheck!.id]);

        expect(transitionLessonZeroSoundSession(content, lapse.state, { kind: 'retry' }, 24).state.stage)
            .toBe('repair');
        const support = transitionLessonZeroSoundSession(content, lapse.state, { kind: 'reveal-model' }, 25);
        expect(support.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript', 'translation', 'model-answer',
        ]);
        state = transitionLessonZeroSoundSession(content, support.state, {
            kind: 'mark-repair-heard', lineId: xingyuCheck!.id,
        }, 26).state;
        expect(state.repairedLineIds).toEqual([]);
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-repair-heard', lineId: mikaCheck!.id,
        }, 27).state;
        state = transitionLessonZeroSoundSession(content, state, { kind: 'retry' }, 28).state;
        expect(state).toMatchObject({
            stage: 'attempt',
            heardLineIds: [],
            selections: [],
            repairedLineIds: [mikaCheck!.id],
        });

        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: mikaCheck!.id,
        }, 29).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: mikaCheck!.id, speakerId: 'mika',
        }, 30).state;
        const repaired = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 31);
        expect(repaired.state.status).toBe('complete');
        expect(repaired.evaluation?.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
        expect(repaired.adaptive).toMatchObject({ skill: 'listening', action: 'repair', independent: false });
    });

    it('ends after the single repair even if the retry still misses, while scheduling review', () => {
        const content = definition();
        let state = meetAndBegin(content, startLessonZeroSoundSession(content), 10);
        const checks = checkLines(content);
        for (const line of checks) {
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: line.id,
            }, 20).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker', lineId: line.id, speakerId: 'xingyu',
            }, 21).state;
        }
        state = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 22).state;
        const missed = state.attempts.at(-1)!.missedLineIds[0]!;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-repair-heard', lineId: missed,
        }, 23).state;
        state = transitionLessonZeroSoundSession(content, state, { kind: 'retry' }, 24).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: missed,
        }, 25).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: missed, speakerId: 'xingyu',
        }, 26).state;
        const assisted = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 27);

        expect(assisted.state).toMatchObject({
            status: 'complete',
            stage: 'complete',
            modelRevealed: true,
        });
        expect(assisted.evaluation?.result.outcome).toBe('lapse');
        expect(assisted.evaluation?.reviewSeeds).toHaveLength(2);
        expect(assisted.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript', 'translation', 'model-answer',
        ]);
    });

    it('round-trips the exact meet cursor and safely restarts incomplete legacy checkpoints', () => {
        const content = definition();
        let state = startLessonZeroSoundSession(content);
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: 'line:lesson-zero-sound-xingyu',
        }, 1).state;
        const paused = transitionLessonZeroSoundSession(content, state, { kind: 'pause' }, 2).state;
        expect(startLessonZeroSoundSession(content, paused)).toEqual(paused);

        const legacy = {
            ...paused,
            stage: 'attempt' as const,
            introduced: undefined,
            status: 'active' as const,
        };
        expect(startLessonZeroSoundSession(content, legacy)).toMatchObject({
            stage: 'meet',
            introduced: false,
            heardLineIds: [],
        });
        expect(lessonZeroSoundSessionSnapshotShapeIsValid({
            ...paused,
            selections: [{ lineId: 'line:unknown', speakerId: 'xingyu' }],
        })).toBe(false);
        expect(lessonZeroSoundSessionSnapshotShapeIsValid({
            ...paused,
            status: 'complete',
            stage: 'complete',
        })).toBe(false);
    });
});

function meetAndBegin(
    content: LessonZeroSoundDefinition,
    initial: LessonZeroSoundSessionState,
    at: number,
): LessonZeroSoundSessionState {
    let state = initial;
    for (const line of content.lines.filter(candidate => candidate.phase === 'introduction')) {
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: line.id,
        }, at).state;
    }
    return transitionLessonZeroSoundSession(content, state, { kind: 'begin-check' }, at + 1).state;
}

function checkLines(content: LessonZeroSoundDefinition) {
    return content.lines.filter(line => line.phase === 'check');
}
