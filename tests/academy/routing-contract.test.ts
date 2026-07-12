import { projectLearnerRecord, type LearnerEvent } from '../../src/academy/domain/learner-record';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import { normalizeResumeCheckpoint } from '../../src/academy/routing/contract';

const SESSION = {
    sessionId: 'session',
    expiresAt: 2_000,
    offlineResumeUntil: 3_000,
    source: 'local-qa' as const,
};

function checkpoint(route: AcademyCheckpoint['route']): AcademyCheckpoint {
    return { schemaVersion: 1, route, session: SESSION, updatedAt: 100 };
}

function event<T extends LearnerEvent>(value: Omit<T, 'schemaVersion' | 'eventId' | 'at'>, index: number): T {
    return { ...value, schemaVersion: 1, eventId: `event-${index}`, at: 100 + index } as T;
}

describe('Academy resume route contract', () => {
    it('restores a missing selected band from curriculum evidence', () => {
        const projection = projectLearnerRecord([
            event({
                kind: 'profile-changed',
                profile: { displayName: 'Mina', learningReason: 'Work', portraitId: 'quality-3' },
            } as LearnerEvent, 1),
            event({ kind: 'curriculum-entry-chosen', route: 'manual-band', band: 'n3' } as LearnerEvent, 2),
        ]);
        expect(normalizeResumeCheckpoint(checkpoint('band-entry'), projection, 1_000, true)).toMatchObject({
            route: 'band-entry',
            selectedBand: 'n3',
        });
    });

    it('moves completed vertical-slice checkpoints forward without replaying milestones', () => {
        const profile = event({
            kind: 'profile-changed',
            profile: { displayName: 'Riku', learningReason: 'Read', portraitId: 'quality-2' },
        } as LearnerEvent, 1);
        const sourceComplete = event({ kind: 'scene-completed', sceneId: 'scene:lesson-zero-first-repair' } as LearnerEvent, 2);
        const writingComplete = event({ kind: 'scene-completed', sceneId: 'scene:lesson-zero-writing-desk' } as LearnerEvent, 3);

        expect(normalizeResumeCheckpoint(checkpoint('source-activity'), projectLearnerRecord([profile, sourceComplete]), 1_000, true).route)
            .toBe('aakash-meet');
        expect(normalizeResumeCheckpoint(checkpoint('writing-practice'), projectLearnerRecord([profile, writingComplete]), 1_000, true).route)
            .toBe('campus');
    });

    it('returns to access when neither online nor offline session validity remains', () => {
        expect(normalizeResumeCheckpoint(checkpoint('campus'), projectLearnerRecord([]), 4_000, false).route).toBe('access');
    });
});
