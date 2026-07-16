/** Semantic stages for a beginner's post-attempt constructed-response aid. */
export const BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS = [
    'task-meaning',
    'vocabulary-reading',
    'form-scaffold',
] as const;

export type BeginnerConstructedResponseHintTier =
    typeof BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS[number];

export interface LearnerSupportUse {
    readonly activityId: string;
    readonly supportKind: string;
    readonly choiceId?: string;
}

export function progressiveHintChoiceId(tier: BeginnerConstructedResponseHintTier): string {
    return `progressive-hint:${tier}`;
}

export function progressiveHintTierFromChoiceId(choiceId: string | undefined): BeginnerConstructedResponseHintTier | undefined {
    return BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS.find(tier => choiceId === progressiveHintChoiceId(tier));
}

/** Returns the semantic stages already requested for one persisted activity. */
export function learnerHintTiersForActivity(
    activityId: string,
    supportUses: readonly LearnerSupportUse[] | undefined,
): readonly BeginnerConstructedResponseHintTier[] {
    const used = new Set((supportUses ?? [])
        .filter(support => support.activityId === activityId && support.supportKind === 'hint')
        .map(support => progressiveHintTierFromChoiceId(support.choiceId))
        .filter((tier): tier is BeginnerConstructedResponseHintTier => tier !== undefined));
    return BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS.filter(tier => used.has(tier));
}

export function remainingBeginnerHintTiers(
    activityId: string,
    supportUses: readonly LearnerSupportUse[] | undefined,
): readonly BeginnerConstructedResponseHintTier[] {
    const used = new Set(learnerHintTiersForActivity(activityId, supportUses));
    return BEGINNER_CONSTRUCTED_RESPONSE_HINT_TIERS.filter(tier => !used.has(tier));
}
