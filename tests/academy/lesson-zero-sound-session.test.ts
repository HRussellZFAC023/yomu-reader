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
    it('binds two trusted voices to exact playable audio and reproducible hashes', () => {
        const content = definition();
        expect(getCompleteLessonRegistration('lesson:foundation-00').trustedActivityIds)
            .toContain(content.activityId);
        expect(content.lines).toEqual([
            expect.objectContaining({
                id: 'line:lesson-zero-sound-xingyu',
                speakerId: 'xingyu',
                japanese: 'はじめまして。シンユです。',
                audioUrl: '/academy/audio/lesson-zero/sound-xingyu.opus',
            }),
            expect.objectContaining({
                id: 'line:lesson-zero-sound-mika',
                speakerId: 'mika',
                japanese: 'ミカです。よろしくお願いします。',
                audioUrl: '/academy/audio/lesson-zero/sound-mika.opus',
            }),
        ]);
        expect(content.speakers.every(speaker => speaker.portraitUrl?.startsWith('/academy/art/characters/')))
            .toBe(true);

        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as {
            qualityBoundary: string;
            lines: Array<{ runtimeUrl: string; fileSha256: string }>;
        };
        expect(manifest.qualityBoundary).toMatch(/no human-audition claim/i);
        for (const line of manifest.lines) {
            const file = path.resolve('public', line.runtimeUrl.replace(/^\//, ''));
            const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
            expect(digest).toBe(line.fileSha256);
        }
    });

    it('locks answers until both voices finish and records an independent pass', () => {
        const content = definition();
        let state = startLessonZeroSoundSession(content);
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker',
            lineId: 'line:lesson-zero-sound-xingyu',
            speakerId: 'xingyu',
        }, 1).state;
        expect(state.selections).toEqual([]);

        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: 'line:lesson-zero-sound-xingyu',
        }, 2).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: 'line:lesson-zero-sound-xingyu', speakerId: 'xingyu',
        }, 3).state;
        expect(transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 4).evaluation)
            .toBeUndefined();

        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: 'line:lesson-zero-sound-mika',
        }, 5).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: 'line:lesson-zero-sound-mika', speakerId: 'mika',
        }, 6).state;
        const passed = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 7);

        expect(passed.state).toMatchObject({ status: 'complete', stage: 'complete' });
        expect(passed.evaluation?.attempt).toMatchObject({
            outcome: 'pass', score: 1, responseKind: 'audio-speaker-match',
        });
        expect(passed.evaluation?.reviewSeeds.map(seed => seed.id)).toEqual([
            'review:lesson-zero:sound:hajimemashite',
            'review:lesson-zero:sound:yoroshiku',
        ]);
        expect(passed.adaptive).toMatchObject({ skill: 'listening', action: 'listen', independent: true });
    });

    it('replays only the missed voice before an assisted retry', () => {
        const content = definition();
        let state = startLessonZeroSoundSession(content);
        for (const line of content.lines) {
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: line.id,
            }, 10).state;
        }
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: content.lines[0]!.id, speakerId: 'xingyu',
        }, 11).state;
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'select-speaker', lineId: content.lines[1]!.id, speakerId: 'xingyu',
        }, 12).state;
        const lapse = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 13);
        expect(lapse.state.stage).toBe('repair');
        expect(lapse.evaluation?.attempt).toMatchObject({ outcome: 'lapse', score: 0.5 });
        expect(lapse.state.attempts[0]?.missedLineIds).toEqual(['line:lesson-zero-sound-mika']);

        const lockedRetry = transitionLessonZeroSoundSession(content, lapse.state, { kind: 'retry' }, 14);
        expect(lockedRetry.state.stage).toBe('repair');
        const support = transitionLessonZeroSoundSession(content, lapse.state, { kind: 'reveal-model' }, 15);
        expect(support.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript', 'translation', 'model-answer',
        ]);
        state = transitionLessonZeroSoundSession(content, support.state, {
            kind: 'mark-repair-heard', lineId: 'line:lesson-zero-sound-xingyu',
        }, 16).state;
        expect(state.repairedLineIds).toEqual([]);
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-repair-heard', lineId: 'line:lesson-zero-sound-mika',
        }, 17).state;
        state = transitionLessonZeroSoundSession(content, state, { kind: 'retry' }, 18).state;
        expect(state).toMatchObject({ stage: 'attempt', heardLineIds: [], selections: [] });

        for (const line of content.lines) {
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'mark-heard', lineId: line.id,
            }, 19).state;
            state = transitionLessonZeroSoundSession(content, state, {
                kind: 'select-speaker', lineId: line.id, speakerId: line.speakerId,
            }, 20).state;
        }
        const repaired = transitionLessonZeroSoundSession(content, state, { kind: 'check' }, 21);
        expect(repaired.state.status).toBe('complete');
        expect(repaired.evaluation?.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
        expect(repaired.adaptive).toMatchObject({ skill: 'listening', action: 'repair', independent: false });
    });

    it('round-trips paused progress and rejects impossible snapshots', () => {
        const content = definition();
        let state = startLessonZeroSoundSession(content);
        state = transitionLessonZeroSoundSession(content, state, {
            kind: 'mark-heard', lineId: 'line:lesson-zero-sound-xingyu',
        }, 1).state;
        const paused = transitionLessonZeroSoundSession(content, state, { kind: 'pause' }, 2).state;
        expect(startLessonZeroSoundSession(content, paused)).toEqual(paused);
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
