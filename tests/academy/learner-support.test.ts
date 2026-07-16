import {
    learnerHintTiersForActivity,
    progressiveHintChoiceId,
    progressiveHintTierFromChoiceId,
    remainingBeginnerHintTiers,
} from '../../src/academy/domain/learner-support';

describe('learner support evidence', () => {
    const activityId = 'activity:beginner-constructed-response';

    it('derives semantic hint progress from neutral persisted support evidence', () => {
        const supportUses = [{
            activityId,
            supportKind: 'hint',
            choiceId: progressiveHintChoiceId('task-meaning'),
        }, {
            activityId,
            supportKind: 'transcript',
            choiceId: progressiveHintChoiceId('vocabulary-reading'),
        }, {
            activityId: 'activity:another-response',
            supportKind: 'hint',
            choiceId: progressiveHintChoiceId('form-scaffold'),
        }];

        expect(learnerHintTiersForActivity(activityId, supportUses)).toEqual(['task-meaning']);
        expect(remainingBeginnerHintTiers(activityId, supportUses)).toEqual([
            'vocabulary-reading',
            'form-scaffold',
        ]);
    });

    it('uses stable IDs and ignores unrelated legacy hint choices', () => {
        expect(progressiveHintChoiceId('form-scaffold')).toBe('progressive-hint:form-scaffold');
        expect(progressiveHintTierFromChoiceId('progressive-hint:vocabulary-reading')).toBe('vocabulary-reading');
        expect(progressiveHintTierFromChoiceId('progressive-hint:2')).toBeUndefined();
    });
});
