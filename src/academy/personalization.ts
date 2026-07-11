export const learnerMotivations = [
    'first-conversations',
    'everyday-independence',
    'reading',
    'jlpt-progress',
    'returning-to-study',
] as const;

export const learnerConfidenceLevels = ['new', 'rusty', 'steady'] as const;

export const learnerAccessibilityModes = [
    'no-specific-support',
    'text-first',
    'reduced-motion',
    'screen-reader-and-keyboard',
    'low-bandwidth',
] as const;

export const learnerTimeWindows = ['five-minutes', 'fifteen-minutes', 'thirty-plus-minutes'] as const;

export const learnerPracticePreferences = [
    'guided',
    'listening',
    'reading',
    'writing',
    'speaking',
    'mixed-review',
] as const;

export const personalizationStartingSections = [
    'kana-on-ramp',
    'lesson-01-hajimemashite',
    'lesson-02-town-prices',
    'lesson-03-food-invitations',
    'lesson-04-routines-past-te',
    'lesson-05-n4-bridge',
] as const;

export const personalizationSupportOrder = [
    'semantic-controls',
    'text-equivalent',
    'static-scenes',
    'low-bandwidth-mode',
    'short-session',
    'checkpointed-session',
    'exact-resume',
    'kana-scaffold',
    'worked-example',
    'returning-learner-recap',
    'manual-route-switch',
    'challenge-first',
    'audio-with-transcript',
    'adjustable-reading-aids',
    'model-after-attempt',
    'private-rehearsal',
    'mixed-practice',
    'real-world-scenario',
    'jlpt-checkpoint-preview',
] as const;

export type LearnerMotivation = (typeof learnerMotivations)[number];
export type LearnerConfidence = (typeof learnerConfidenceLevels)[number];
export type LearnerAccessibility = (typeof learnerAccessibilityModes)[number];
export type LearnerTime = (typeof learnerTimeWindows)[number];
export type LearnerPractice = (typeof learnerPracticePreferences)[number];
export type PersonalizationStartingSection = (typeof personalizationStartingSections)[number];
export type PersonalizationSupport = (typeof personalizationSupportOrder)[number];

export interface LearnerPersonalizationProfile {
    readonly motivation: LearnerMotivation;
    readonly confidence: LearnerConfidence;
    readonly accessibility: LearnerAccessibility;
    readonly time: LearnerTime;
    readonly preferredPractice: LearnerPractice;
}

export interface PersonalizationRecommendation {
    readonly startingSection: PersonalizationStartingSection;
    readonly supports: readonly PersonalizationSupport[];
}

const STARTING_SECTION_BY_CONFIDENCE: Readonly<Record<
    LearnerConfidence,
    Readonly<Record<LearnerMotivation, PersonalizationStartingSection>>
>> = {
    new: {
        'first-conversations': 'lesson-01-hajimemashite',
        'everyday-independence': 'kana-on-ramp',
        reading: 'kana-on-ramp',
        'jlpt-progress': 'kana-on-ramp',
        'returning-to-study': 'kana-on-ramp',
    },
    rusty: {
        'first-conversations': 'lesson-01-hajimemashite',
        'everyday-independence': 'lesson-02-town-prices',
        reading: 'lesson-04-routines-past-te',
        'jlpt-progress': 'lesson-04-routines-past-te',
        'returning-to-study': 'lesson-01-hajimemashite',
    },
    steady: {
        'first-conversations': 'lesson-03-food-invitations',
        'everyday-independence': 'lesson-04-routines-past-te',
        reading: 'lesson-04-routines-past-te',
        'jlpt-progress': 'lesson-05-n4-bridge',
        'returning-to-study': 'lesson-05-n4-bridge',
    },
};

const SUPPORTS_BY_ACCESSIBILITY: Readonly<Record<LearnerAccessibility, readonly PersonalizationSupport[]>> = {
    'no-specific-support': [],
    'text-first': ['text-equivalent', 'audio-with-transcript'],
    'reduced-motion': ['static-scenes'],
    'screen-reader-and-keyboard': ['semantic-controls', 'text-equivalent'],
    'low-bandwidth': ['text-equivalent', 'low-bandwidth-mode', 'exact-resume'],
};

const SUPPORTS_BY_TIME: Readonly<Record<LearnerTime, readonly PersonalizationSupport[]>> = {
    'five-minutes': ['short-session', 'exact-resume'],
    'fifteen-minutes': ['checkpointed-session', 'exact-resume'],
    'thirty-plus-minutes': [],
};

const SUPPORTS_BY_CONFIDENCE: Readonly<Record<LearnerConfidence, readonly PersonalizationSupport[]>> = {
    new: ['kana-scaffold', 'worked-example', 'manual-route-switch'],
    rusty: ['returning-learner-recap', 'manual-route-switch'],
    steady: ['manual-route-switch', 'challenge-first'],
};

const SUPPORTS_BY_PRACTICE: Readonly<Record<LearnerPractice, readonly PersonalizationSupport[]>> = {
    guided: ['worked-example'],
    listening: ['audio-with-transcript'],
    reading: ['adjustable-reading-aids'],
    writing: ['model-after-attempt'],
    speaking: ['private-rehearsal'],
    'mixed-review': ['mixed-practice'],
};

const SUPPORTS_BY_MOTIVATION: Readonly<Record<LearnerMotivation, readonly PersonalizationSupport[]>> = {
    'first-conversations': ['private-rehearsal', 'real-world-scenario'],
    'everyday-independence': ['real-world-scenario'],
    reading: ['adjustable-reading-aids'],
    'jlpt-progress': ['jlpt-checkpoint-preview'],
    'returning-to-study': ['returning-learner-recap'],
};

export function personalizeAcademy(profile: LearnerPersonalizationProfile): PersonalizationRecommendation {
    const requestedSupports = new Set<PersonalizationSupport>([
        ...SUPPORTS_BY_ACCESSIBILITY[profile.accessibility],
        ...SUPPORTS_BY_TIME[profile.time],
        ...SUPPORTS_BY_CONFIDENCE[profile.confidence],
        ...SUPPORTS_BY_PRACTICE[profile.preferredPractice],
        ...SUPPORTS_BY_MOTIVATION[profile.motivation],
    ]);

    return {
        startingSection: STARTING_SECTION_BY_CONFIDENCE[profile.confidence][profile.motivation],
        supports: personalizationSupportOrder.filter(support => requestedSupports.has(support)),
    };
}
