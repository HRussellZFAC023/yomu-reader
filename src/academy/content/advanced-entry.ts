import type { MinnaTrueFalseListeningModel } from '../minigames/minna-true-false-listening';
import type { LearnerEvent } from '../domain/learner-record';
import { ACADEMY_LEARNER_MODELS } from '../personalization';
import type { LearningCandidate, NextLearningAction } from '../personalization/contracts';
import { createLessonThirtyTwoMinna074ListeningBeat } from './lesson-thirty-two-minna-074-listening';

export const N3_ADVANCED_ENTRY_LESSON_ID = 'authored-week:l2-l07';
export const N3_ADVANCED_ENTRY_SOURCE_ID = 'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2';

export type AdvancedEntryMode = 'guided' | 'test-out' | 'repair' | 'independent';

export interface AdvancedEntryPlan {
    readonly band: 'n3';
    readonly mode: AdvancedEntryMode;
    readonly activity: MinnaTrueFalseListeningModel;
    readonly recommendation: NextLearningAction;
    readonly lessonId: typeof N3_ADVANCED_ENTRY_LESSON_ID;
    readonly sourceId: typeof N3_ADVANCED_ENTRY_SOURCE_ID;
    readonly independent: boolean;
}

export function createN3AdvancedEntryPlan(input: Readonly<{
    events: readonly LearnerEvent[];
    placementAccepted: boolean;
    now: number;
}>): AdvancedEntryPlan {
    const sourceBeat = createLessonThirtyTwoMinna074ListeningBeat();
    if (sourceBeat.activity.kind !== 'academy-minna-true-false-listening') {
        throw new TypeError('N3 advanced entry requires the exact Minna true/false activity plugin.');
    }
    const activity = sourceBeat.activity as MinnaTrueFalseListeningModel;
    const concepts = activity.conceptIds;
    const candidates: LearningCandidate[] = [
        candidate('guided', 'learn', 1, concepts),
        candidate('repair', 'repair', 2, concepts),
        {
            ...candidate('independent', 'practice', 2, concepts),
            prerequisites: [{ skill: 'listening', minimumStorageLevel: 1 }],
        },
        ...(input.placementAccepted ? [candidate('test-out', 'test-out', 3, concepts)] : []),
    ];
    const recommendation = ACADEMY_LEARNER_MODELS.resolve('academy-adaptive-learner-v1').selectNext({
        events: input.events,
        candidates,
        missionTags: ['advanced-arrival', 'source-listening'],
        now: input.now,
    }).primary;
    if (!recommendation) throw new Error('N3 advanced entry has no eligible learning action.');
    const mode = modeFor(recommendation.candidate.id);
    return {
        band: 'n3',
        mode,
        activity,
        recommendation,
        lessonId: N3_ADVANCED_ENTRY_LESSON_ID,
        sourceId: N3_ADVANCED_ENTRY_SOURCE_ID,
        independent: mode !== 'guided' && mode !== 'repair',
    };
}

function candidate(
    mode: AdvancedEntryMode,
    purpose: LearningCandidate['purpose'],
    challengeLevel: LearningCandidate['challengeLevel'],
    conceptIds: readonly string[],
): LearningCandidate {
    return {
        id: `advanced-entry:n3:minna074:${mode}`,
        skill: 'listening',
        purpose,
        challengeLevel,
        conceptIds,
        missionTags: ['advanced-arrival', 'source-listening'],
    };
}

function modeFor(candidateId: string): AdvancedEntryMode {
    const mode = candidateId.split(':').at(-1);
    if (mode === 'guided' || mode === 'test-out' || mode === 'repair' || mode === 'independent') return mode;
    throw new TypeError(`Unknown N3 advanced-entry candidate: ${candidateId}`);
}
