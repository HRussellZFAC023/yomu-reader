import type { WorldPlaceId } from './world-locations';
import type { AcademyRoute, AcademyRouteContextState } from '../routing/route-history';

export const DAY_CLOSURE_DIMENSIONS = [
    'implementation',
    'reachability',
    'media',
    'persistence',
    'journeyProof',
] as const;

export type DayClosureDimension = typeof DAY_CLOSURE_DIMENSIONS[number];
export type DayDeliveryState = 'unverified' | 'partial' | 'verified';
export type AcademyDayId = `day:${number}`;

export type DayActivityCategory =
    | 'enrollment'
    | 'story'
    | 'lesson'
    | 'study'
    | 'review'
    | 'world'
    | 'exploration'
    | 'social'
    | 'bond'
    | 'minigame'
    | 'one-off'
    | 'prop'
    | 'wiki'
    | 'account'
    | 'accessibility'
    | 'offline'
    | 'evening';

export type DayAvailabilityMode =
    | 'required'
    | 'optional'
    | 'revisitable'
    | 'repeatable'
    | 'one-off'
    | 'accessibility'
    | 'online'
    | 'offline';

export interface DayActivityRoute {
    readonly route: AcademyRoute;
    readonly context?: Partial<AcademyRouteContextState>;
}

export interface DayActivityMediaRequirement {
    readonly audio: 'none' | 'voice' | 'learning-audio' | 'music-ambience-sfx';
    readonly visual: 'none' | 'ui' | 'cast' | 'scene' | 'interactive';
}

export interface DayActivityDelivery {
    readonly implementation: DayDeliveryState;
    readonly reachability: DayDeliveryState;
    readonly media: DayDeliveryState;
    readonly persistence: DayDeliveryState;
    readonly journeyProof: DayDeliveryState;
}

export interface DayActivityAvailability {
    /** Stable production row id. This is distinct from learner evidence ids. */
    readonly id: string;
    readonly dayId: AcademyDayId;
    readonly title: string;
    readonly category: DayActivityCategory;
    readonly modes: readonly DayAvailabilityMode[];
    readonly route: DayActivityRoute;
    readonly prerequisites: readonly string[];
    /** Runtime activities, story nodes, content records, or controls this row proves. */
    readonly contentIds: readonly string[];
    readonly media: DayActivityMediaRequirement;
    readonly persistenceEvidence: string;
    readonly journeyEvidence: string;
    readonly delivery: DayActivityDelivery;
}

export interface AcademyDayAvailabilityManifest {
    readonly dayId: AcademyDayId;
    readonly dayNumber: number;
    readonly title: string;
    readonly entries: readonly DayActivityAvailability[];
}

const UNVERIFIED_DELIVERY: DayActivityDelivery = Object.freeze({
    implementation: 'unverified',
    reachability: 'unverified',
    media: 'unverified',
    persistence: 'unverified',
    journeyProof: 'unverified',
});

const VERIFIED_STANDALONE_ACTIVITY_DELIVERY: DayActivityDelivery = Object.freeze({
    implementation: 'verified',
    reachability: 'partial',
    media: 'partial',
    persistence: 'verified',
    journeyProof: 'partial',
});

const VERIFIED_JOURNEY_PENDING_MEDIA_DELIVERY: DayActivityDelivery = Object.freeze({
    implementation: 'verified',
    reachability: 'verified',
    media: 'partial',
    persistence: 'verified',
    journeyProof: 'verified',
});

const VERIFIED_DELIVERY: DayActivityDelivery = Object.freeze({
    implementation: 'verified',
    reachability: 'verified',
    media: 'verified',
    persistence: 'verified',
    journeyProof: 'verified',
});

export function academyDayId(dayNumber: number): AcademyDayId {
    if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) {
        throw new TypeError('Academy day numbers must be positive safe integers.');
    }
    return `day:${dayNumber}`;
}

export function academyDayNumber(dayId: string): number | undefined {
    const match = /^day:([1-9]\d*)$/.exec(dayId);
    if (!match) return undefined;
    const day = Number(match[1]);
    return Number.isSafeInteger(day) ? day : undefined;
}

/** The calendar advances from durable day-closure evidence and has no authored maximum. */
export function currentAcademyDayNumber(closedDays: Readonly<Record<string, unknown>>): number {
    const latest = Object.keys(closedDays)
        .map(academyDayNumber)
        .filter((day): day is number => day !== undefined)
        .reduce((maximum, day) => Math.max(maximum, day), 0);
    return latest + 1;
}

export const DAY_ONE_WORLD_PLACE_IDS: readonly WorldPlaceId[] = Object.freeze([
    'courtyard',
    'classroom',
    'library',
    'home',
]);

const DAY_ONE_WORLD_PRACTICE_IDS = new Set([
    'courtyard-notice-look',
    'courtyard-notice-write',
    'classroom-board-understanding',
    'classroom-board-confirmation',
]);

export function worldPlaceAvailableOnAcademyDay(place: WorldPlaceId, dayNumber: number): boolean {
    return dayNumber > 1 || DAY_ONE_WORLD_PLACE_IDS.includes(place);
}

export function worldPracticeAvailableOnAcademyDay(
    _place: WorldPlaceId,
    practiceId: string,
    dayNumber: number,
): boolean {
    return dayNumber > 1 || DAY_ONE_WORLD_PRACTICE_IDS.has(practiceId);
}

const DAY_ONE_LESSON_ACTIVITY_IDS = [
    'activity:lesson-zero-greet-rie',
    'activity:lesson-zero-vowel-listen',
    'activity:lesson-zero-vowel-doodle',
    'activity:lesson-zero-follow-instructions',
    'activity:lesson-zero-reconstruct-repair',
    'activity:lesson-zero-desk-language',
    'activity:lesson-zero-build-sentence-frames',
    'activity:lesson-zero-name-card-draft',
    'activity:lesson-zero-sound-input',
    'activity:lesson-zero-text-input',
    'activity:lesson-zero-speaking-input',
    'activity:lesson-zero-read-name-cards',
    'activity:lesson-zero-write-name-card',
    'activity:lesson-zero-sound-transfer',
    'activity:lesson-zero-text-transfer',
    'activity:lesson-zero-speaking-transfer',
    'activity:lesson-zero-written-transfer',
    'activity:lesson-zero-close-room',
] as const;

const DAY_ONE_LESSON_ACTIVITY_TITLES = {
    'activity:lesson-zero-greet-rie': 'Greet Rie and introduce yourself',
    'activity:lesson-zero-vowel-listen': 'Hear and identify the five vowel sounds',
    'activity:lesson-zero-vowel-doodle': 'Write the five vowel kana',
    'activity:lesson-zero-follow-instructions': 'Follow Rie’s classroom instructions',
    'activity:lesson-zero-reconstruct-repair': 'Rebuild a request for repetition',
    'activity:lesson-zero-desk-language': 'Use the first desk-language worksheet',
    'activity:lesson-zero-build-sentence-frames': 'Build the first sentence frames',
    'activity:lesson-zero-name-card-draft': 'Put your name on the class card',
    'activity:lesson-zero-sound-input': 'Find two names by listening',
    'activity:lesson-zero-text-input': 'Repair a phrase by text',
    'activity:lesson-zero-speaking-input': 'Repair a phrase by speaking',
    'activity:lesson-zero-read-name-cards': 'Read the class name cards',
    'activity:lesson-zero-write-name-card': 'Finish your own name card',
    'activity:lesson-zero-sound-transfer': 'Use the sound repair in a new scene',
    'activity:lesson-zero-text-transfer': 'Use the text repair in a new scene',
    'activity:lesson-zero-speaking-transfer': 'Use the spoken repair in a new scene',
    'activity:lesson-zero-written-transfer': 'Use the written repair in a new scene',
    'activity:lesson-zero-close-room': 'Close the first classroom session',
} as const satisfies Readonly<Record<typeof DAY_ONE_LESSON_ACTIVITY_IDS[number], string>>;

const DAY_ONE_VERIFIED_ACTIVITY_IDS = new Set<typeof DAY_ONE_LESSON_ACTIVITY_IDS[number]>([
    'activity:lesson-zero-sound-input',
    'activity:lesson-zero-text-input',
    'activity:lesson-zero-speaking-input',
    'activity:lesson-zero-read-name-cards',
    'activity:lesson-zero-write-name-card',
    'activity:lesson-zero-sound-transfer',
    'activity:lesson-zero-text-transfer',
    'activity:lesson-zero-speaking-transfer',
    'activity:lesson-zero-written-transfer',
    'activity:lesson-zero-close-room',
]);

export const DAY_ONE_CLASSROOM_EXPRESSION_IDS: readonly string[] = Object.freeze(
    Array.from({ length: 14 }, (_, index) =>
        `expression:classroom-${String(index + 1).padStart(2, '0')}`),
);

function entry(
    id: string,
    title: string,
    category: DayActivityCategory,
    modes: readonly DayAvailabilityMode[],
    route: DayActivityRoute,
    contentIds: readonly string[],
    media: DayActivityMediaRequirement,
    persistenceEvidence: string,
    journeyEvidence: string,
    prerequisites: readonly string[] = [],
    delivery: DayActivityDelivery = UNVERIFIED_DELIVERY,
): DayActivityAvailability {
    return Object.freeze({
        id,
        dayId: 'day:1' as const,
        title,
        category,
        modes: Object.freeze([...modes]),
        route: Object.freeze({ ...route }),
        prerequisites: Object.freeze([...prerequisites]),
        contentIds: Object.freeze([...contentIds]),
        media: Object.freeze({ ...media }),
        persistenceEvidence,
        journeyEvidence,
        delivery: Object.freeze({ ...delivery }),
    });
}

const DAY_ONE_ENROLLMENT: readonly DayActivityAvailability[] = [
    entry('day:1:access', 'Enter with a class code', 'enrollment', ['required', 'online'],
        { route: 'access' }, ['route:access'], { audio: 'none', visual: 'ui' },
        'Invite session survives the route transition.', 'Clean browser reaches the profile/account fork.',
        [], VERIFIED_DELIVERY),
    entry('day:1:account-link', 'Link or resume an Academy account', 'account', ['optional', 'online', 'revisitable'],
        { route: 'profile-sync' }, ['route:profile-sync'], { audio: 'none', visual: 'ui' },
        'Linked identity, encrypted profile, devices, and sync status persist.', 'Link, refresh, sign-out, resume, export, and delete are browser-proved.',
        [], VERIFIED_DELIVERY),
    entry('day:1:offline-entry', 'Resume the downloaded welcome while offline', 'offline', ['optional', 'offline', 'revisitable'],
        { route: 'access' }, ['academy-shell', 'offline-cache'], { audio: 'none', visual: 'ui' },
        'Checkpoint and queued evidence survive an offline restart.', 'Installed build opens and explains unavailable network actions without a dead end.',
        [], VERIFIED_DELIVERY),
    entry('day:1:profile', 'Create the learner identity', 'enrollment', ['required', 'one-off'],
        { route: 'profile' }, ['route:profile'], { audio: 'none', visual: 'ui' },
        'Learner name, language, and reason are recorded.', 'Profile continues to the first Rie scene and restores on reload.',
        [], VERIFIED_DELIVERY),
    entry('day:1:rie-introduction', 'Meet Rie-sensei', 'one-off', ['required', 'one-off'],
        { route: 'rie-unlock' }, ['route:rie-unlock', 'character:rie'], { audio: 'voice', visual: 'cast' },
        'First introduction is recorded once.', 'Rie appears, speaks, and does not replay after completion unless chosen from the journal.',
        [], VERIFIED_DELIVERY),
    entry('day:1:start-choice', 'Choose the starting path', 'enrollment', ['required'],
        { route: 'start' }, ['route:start'], { audio: 'music-ambience-sfx', visual: 'ui' },
        'Curriculum entry choice is recorded.', 'Lesson Zero, manual band, and placement branches each return to a valid route.',
        [], VERIFIED_DELIVERY),
    entry('day:1:manual-band', 'Choose a known starting level', 'enrollment', ['optional', 'revisitable'],
        { route: 'manual-band' }, ['route:manual-band'], { audio: 'music-ambience-sfx', visual: 'ui' },
        'Selected band persists.', 'Every band opens its intended arrival bridge without exposing future Day 1 work.',
        [], VERIFIED_DELIVERY),
    entry('day:1:placement', 'Try the placement path', 'enrollment', ['optional', 'revisitable'],
        { route: 'placement-mock' }, ['route:placement-mock', 'route:placement-result'], { audio: 'learning-audio', visual: 'interactive' },
        'Placement draft and accepted result persist.', 'Listening, writing, speaking alternative, result, accept, and override paths are proved.',
        [], VERIFIED_DELIVERY),
];

const DAY_ONE_STORY: readonly DayActivityAvailability[] = [
    entry('day:1:arrival', 'Arrive at the Academy', 'story', ['required', 'revisitable'],
        { route: 'arrival-bridge' }, ['opening-arrival-bridge'], { audio: 'voice', visual: 'scene' },
        'Arrival completion and return cursor persist.', 'The route enters the courtyard without a teleport, duplicate onboarding, or lost Back path.',
        [], VERIFIED_DELIVERY),
    entry('day:1:blank-atlas', 'Complete Chapter 1: The Blank Atlas', 'story', ['required', 'revisitable'],
        { route: 'story', context: { sectionId: 's1e01-the-blank-atlas' } },
        ['s1e01-the-blank-atlas'], { audio: 'voice', visual: 'scene' },
        'Scene, encounter, activity, and story cursor evidence persist.', 'All story moments, lesson handoffs, choices, repairs, voice, and return routes are proved.',
        [], VERIFIED_DELIVERY),
];

const DAY_ONE_LESSON: readonly DayActivityAvailability[] = DAY_ONE_LESSON_ACTIVITY_IDS.map((activityId, index) =>
    entry(
        `day:1:lesson-zero:${String(index + 1).padStart(2, '0')}`,
        DAY_ONE_LESSON_ACTIVITY_TITLES[activityId],
        'lesson',
        ['required', 'revisitable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId } },
        [activityId],
        { audio: 'learning-audio', visual: 'interactive' },
        `Attempt, support, and completion evidence persist for ${activityId}.`,
        `The story handoff, direct resume, repair, and return path are proved for ${activityId}.`,
        [],
        DAY_ONE_VERIFIED_ACTIVITY_IDS.has(activityId)
            ? VERIFIED_DELIVERY
            : activityId === 'activity:lesson-zero-greet-rie'
            ? VERIFIED_DELIVERY
            : activityId === 'activity:lesson-zero-vowel-listen'
                || activityId === 'activity:lesson-zero-vowel-doodle'
                || activityId === 'activity:lesson-zero-follow-instructions'
                || activityId === 'activity:lesson-zero-reconstruct-repair'
                || activityId === 'activity:lesson-zero-desk-language'
                || activityId === 'activity:lesson-zero-build-sentence-frames'
                || activityId === 'activity:lesson-zero-name-card-draft'
            ? VERIFIED_STANDALONE_ACTIVITY_DELIVERY
            : UNVERIFIED_DELIVERY,
    ));

const DAY_ONE_CLASSROOM: readonly DayActivityAvailability[] = [
    entry('day:1:classroom-expressions', 'Use all fourteen classroom expressions', 'lesson',
        ['required', 'revisitable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-follow-instructions' } },
        ['session:lesson-zero-classroom-expressions', ...DAY_ONE_CLASSROOM_EXPRESSION_IDS],
        { audio: 'learning-audio', visual: 'interactive' },
        'All seventeen constructed-response probes, repairs, and review seeds persist.',
        'All fourteen expressions are taught before assessment, passable, resumable, and reachable from story and lesson views.'),
    entry('day:1:vowel-dictation', 'Hear and write the five first vowels', 'lesson', ['required', 'repeatable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-vowel-dictation' } },
        ['activity:lesson-zero-vowel-dictation'], { audio: 'learning-audio', visual: 'interactive' },
        'Sound-to-kana attempts and review seeds persist.', 'A clean learner can listen, commit, repair, retry, and pass without seeing the answer first.'),
];

const DAY_ONE_GAMES: readonly DayActivityAvailability[] = [
    entry('day:1:game:sound-gate', 'First-sound gate', 'minigame', ['required', 'repeatable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-first-repair:sound' } },
        ['activity:lesson-zero-first-repair:sound'], { audio: 'learning-audio', visual: 'interactive' },
        'Recognition and repair evidence feed review.', 'The gate teaches before testing and supports touch, keyboard, replay, and retry.'),
    entry('day:1:game:vowel-bingo', 'Vowel listening bingo', 'minigame', ['optional', 'repeatable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-vowel-listen' } },
        ['game:lesson-zero-vowel-listening-bingo'], { audio: 'learning-audio', visual: 'interactive' },
        'Each heard choice and confusion pair can seed review.', 'A full randomized board is playable with deterministic audio and no answer-first cue.',
        [], VERIFIED_JOURNEY_PENDING_MEDIA_DELIVERY),
    entry('day:1:game:kana-trace', 'Trace the first kana', 'minigame', ['required', 'repeatable'],
        { route: 'writing-practice', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-kanji-one' } },
        ['activity:lesson-zero-kanji-one', 'cue:kana-trace-one-stroke'], { audio: 'music-ambience-sfx', visual: 'interactive' },
        'Stroke attempt and completion evidence persist.', 'Pointer, touch, reduced-motion, and non-drawing alternatives are proved.'),
    entry('day:1:game:name-card', 'Make and read a name card', 'minigame', ['required', 'revisitable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-name-card-draft' } },
        ['activity:lesson-zero-name-card-draft', 'activity:lesson-zero-read-name-cards', 'activity:lesson-zero-write-name-card'],
        { audio: 'voice', visual: 'interactive' },
        'Draft, reading, writing, and learner identity evidence persist.', 'The card is made in context, remains legible, enters the story, and can be revisited.'),
    entry('day:1:game:classroom-command', 'Respond to classroom commands', 'minigame', ['required', 'repeatable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-follow-instructions' } },
        ['game:lesson-zero-classroom-command-response'], { audio: 'learning-audio', visual: 'interactive' },
        'Command-response accuracy and repair evidence persist.', 'Listening, action, repair, SRS consequence, keyboard, and touch paths are proved.'),
    entry('day:1:game:living-worksheet', 'Complete the living worksheet', 'minigame', ['required', 'revisitable'],
        { route: 'source-activity', context: { lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-desk-language' } },
        ['game:lesson-zero-living-worksheet'], { audio: 'learning-audio', visual: 'interactive' },
        'Every committed field, correction, and review seed persists.', 'The worksheet explains its purpose, fits mobile and desktop, and returns its answers to story and review.'),
];

const DAY_ONE_WORLD: readonly DayActivityAvailability[] = [
    entry('day:1:world:courtyard', 'Explore the courtyard and its notice', 'world', ['required', 'revisitable'],
        { route: 'campus' }, ['place:courtyard', 'courtyard-notice-look', 'courtyard-notice-write'],
        { audio: 'music-ambience-sfx', visual: 'scene' },
        'First arrival, notice practice, prop, and revisit count persist.', 'Arrival, two practices, journal entry, travel, Back, audio, and reduced-motion paths are proved.'),
    entry('day:1:world:classroom', 'Enter the classroom', 'world', ['required', 'revisitable'],
        { route: 'classroom', context: { lessonId: 'lesson:foundation-00' } },
        ['place:classroom', 'classroom-board-understanding', 'classroom-board-confirmation'],
        { audio: 'music-ambience-sfx', visual: 'scene' },
        'Arrival, board practices, cast presence, prop, and revisit state persist.', 'Classroom arrival, lesson launch, two practices, cast, audio, travel, and return are proved.'),
    entry('day:1:world:library-threshold', 'Discover the library and review desk', 'exploration', ['optional', 'revisitable'],
        { route: 'review', context: { lessonId: 'lesson:foundation-00' } },
        ['place:library', 'introduction:library'], { audio: 'music-ambience-sfx', visual: 'scene' },
        'First visit and study state persist without exposing later grammar.', 'The threshold, explanation, vocabulary sheet, empty/due states, and return path are proved.'),
    entry('day:1:world:home', 'Return home for the first evening', 'evening', ['required', 'revisitable'],
        { route: 'home' }, ['place:home', 'day:1:train-home-transition'], { audio: 'music-ambience-sfx', visual: 'scene' },
        'Home arrival, evening cursor, journal, and return state persist.', 'The transition is narrated, not a teleport, and no later home grammar is exposed.'),
    entry('day:1:prop:campus-bell', 'Listen to the courtyard soundscape', 'prop', ['optional', 'repeatable', 'accessibility'],
        { route: 'campus' }, ['courtyard-bell'], { audio: 'music-ambience-sfx', visual: 'ui' },
        'Audio preference persists globally.', 'The control has a continuing purpose, clear label, keyboard support, and settings parity.'),
    entry('day:1:prop:blackboard', 'Inspect the classroom board', 'prop', ['required', 'revisitable'],
        { route: 'classroom', context: { lessonId: 'lesson:foundation-00' } },
        ['item.classroom-belongings', 'classroom-blackboard'], { audio: 'music-ambience-sfx', visual: 'interactive' },
        'Board interaction and earned note persist.', 'Board text, paper controls, cast, pitch marks, and launch controls never overlap.'),
];

const DAY_ONE_SOCIAL_STUDY: readonly DayActivityAvailability[] = [
    entry('day:1:social:class-ensemble', 'Meet the Day 1 class ensemble', 'social', ['required', 'revisitable'],
        { route: 'story', context: { sectionId: 's1e01-the-blank-atlas' } },
        ['rie', 'xingyu', 'mika', 'sophie', 'ruparna', 'aakash', 'sam'], { audio: 'voice', visual: 'cast' },
        'Encounter and first relationship evidence persist per character.', 'Every required person has a portrait, line, action, correct identity, optional talk, and journal revisit.'),
    entry('day:1:bond:first-conversations', 'Choose first optional conversations', 'bond', ['optional', 'one-off', 'revisitable'],
        { route: 'story', context: { sectionId: 's1e01-the-blank-atlas' } },
        ['bond:day1:rie', 'bond:day1:xingyu', 'bond:day1:mika', 'bond:day1:sophie', 'bond:day1:ruparna', 'bond:day1:aakash', 'bond:day1:sam'],
        { audio: 'voice', visual: 'cast' },
        'Choice, relationship evidence, and replay availability persist.', 'Each conversation has a bespoke action, natural dialogue, consequence, and safe replay path.'),
    entry('day:1:study:seed', 'Save today\'s first review items', 'study', ['required'],
        { route: 'review', context: { lessonId: 'lesson:foundation-00' } },
        ['review:day1:lesson-zero'], { audio: 'learning-audio', visual: 'interactive' },
        'Every taught item has one canonical review identity and schedule.', 'Lesson, story, world, and game errors produce deduplicated review items.'),
    entry('day:1:review:first-session', 'Try the first spaced review', 'review', ['optional', 'repeatable', 'revisitable'],
        { route: 'review', context: { lessonId: 'lesson:foundation-00' } },
        ['study:day1:first-session'], { audio: 'learning-audio', visual: 'interactive' },
        'Ratings, due times, vocabulary status, and undo persist and sync.', 'New, due, empty, offline, and resumed sessions are proved with pronunciation and keyboard/touch controls.'),
    entry('day:1:wiki:discoveries', 'Open Day 1 discoveries', 'wiki', ['optional', 'revisitable'],
        { route: 'journal' },
        ['wiki:rie', 'wiki:learner', 'wiki:academy', 'wiki:courtyard', 'wiki:classroom', 'wiki:blank-atlas', 'wiki:kana', 'wiki:mora', 'wiki:pitch', 'wiki:classroom-phrases'],
        { audio: 'none', visual: 'ui' },
        'Discovery state and spoiler boundary persist.', 'Every entry unlocks in context, links back to its scene or lesson, and works in the main app route.'),
];

const DAY_ONE_ACCESSIBILITY_AND_CLOSE: readonly DayActivityAvailability[] = [
    entry('day:1:accessibility:reading', 'Control reading support', 'accessibility', ['accessibility', 'revisitable'],
        { route: 'story', context: { sectionId: 's1e01-the-blank-atlas' } },
        ['setting:furigana', 'setting:reading-support', 'setting:english-reveal'], { audio: 'none', visual: 'ui' },
        'Learner-controlled support choices persist.', 'Furigana, reading, meaning, transcript, and model-answer timing are proved on phone and desktop.'),
    entry('day:1:accessibility:input', 'Use accessible input alternatives', 'accessibility', ['accessibility', 'revisitable'],
        { route: 'lesson-overview', context: { lessonId: 'lesson:foundation-00' } },
        ['input:keyboard', 'input:touch', 'input:no-microphone', 'input:no-drawing'], { audio: 'learning-audio', visual: 'interactive' },
        'Chosen input alternatives and pending work persist.', 'All required tasks remain completable without microphone, pointer precision, motion, or sound-only information.'),
    entry('day:1:accessibility:motion-audio', 'Use motion and audio preferences', 'accessibility', ['accessibility', 'revisitable'],
        { route: 'campus' }, ['setting:reduced-motion', 'setting:audio', 'setting:captions'], { audio: 'music-ambience-sfx', visual: 'ui' },
        'Preferences persist across Academy and Reader surfaces.', 'Reduced motion, mute, captions, focus order, contrast, and screen-reader names are journey-proved.'),
    entry('day:1:journal', 'Revisit today in the class journal', 'evening', ['required', 'revisitable'],
        { route: 'journal' }, ['route:journal', 'replay:rie-opening', 'replay:aakash-memory'], { audio: 'voice', visual: 'interactive' },
        'People, scenes, lines, discoveries, and replay links persist.', 'The journal shows only earned Day 1 material and every replay returns to the same evening state.'),
    entry('day:1:day-end', 'Close the first evening', 'evening', ['required', 'one-off'],
        { route: 'day-end' }, ['day:1:closure'], { audio: 'voice', visual: 'scene' },
        'A single day:1 closure event records completed optional activities and elapsed time.', 'Clean, returning, online, and offline journeys close without losing any activity evidence.'),
];

export const DAY_ONE_AVAILABILITY_MANIFEST: AcademyDayAvailabilityManifest = Object.freeze({
    dayId: 'day:1',
    dayNumber: 1,
    title: 'Welcome, First Sound, First Evening',
    entries: Object.freeze([
        ...DAY_ONE_ENROLLMENT,
        ...DAY_ONE_STORY,
        ...DAY_ONE_LESSON,
        ...DAY_ONE_CLASSROOM,
        ...DAY_ONE_GAMES,
        ...DAY_ONE_WORLD,
        ...DAY_ONE_SOCIAL_STUDY,
        ...DAY_ONE_ACCESSIBILITY_AND_CLOSE,
    ]),
});

export interface DayManifestIssue {
    readonly entryId?: string;
    readonly dimension?: DayClosureDimension;
    readonly message: string;
}

export function validateAcademyDayAvailabilityManifest(
    manifest: AcademyDayAvailabilityManifest,
): readonly DayManifestIssue[] {
    const issues: DayManifestIssue[] = [];
    if (manifest.dayId !== academyDayId(manifest.dayNumber)) {
        issues.push({ message: 'Manifest dayId does not match its positive dayNumber.' });
    }
    if (!manifest.title.trim() || !manifest.entries.length) {
        issues.push({ message: 'A day manifest needs a title and at least one activity.' });
    }
    const ids = new Set<string>();
    for (const candidate of manifest.entries) {
        if (!candidate.id.trim() || ids.has(candidate.id)) {
            issues.push({ entryId: candidate.id, message: `Duplicate or empty day activity id: ${candidate.id}` });
        }
        ids.add(candidate.id);
        if (candidate.dayId !== manifest.dayId) {
            issues.push({ entryId: candidate.id, message: 'Activity belongs to a different day.' });
        }
        if (!candidate.title.trim() || !candidate.modes.length || !candidate.contentIds.length) {
            issues.push({ entryId: candidate.id, message: 'Activity needs a title, availability mode, and runtime content id.' });
        }
        if (new Set(candidate.modes).size !== candidate.modes.length
            || new Set(candidate.contentIds).size !== candidate.contentIds.length) {
            issues.push({ entryId: candidate.id, message: 'Activity modes and content ids must be unique.' });
        }
        if (!candidate.persistenceEvidence.trim() || !candidate.journeyEvidence.trim()) {
            issues.push({ entryId: candidate.id, message: 'Activity needs explicit persistence and journey evidence.' });
        }
    }
    return issues;
}

export function dayDeliveryGaps(manifest: AcademyDayAvailabilityManifest): readonly DayManifestIssue[] {
    return manifest.entries.flatMap(candidate => DAY_CLOSURE_DIMENSIONS.flatMap(dimension =>
        candidate.delivery[dimension] === 'verified'
            ? []
            : [{
                entryId: candidate.id,
                dimension,
                message: `${candidate.title}: ${dimension} is ${candidate.delivery[dimension]}.`,
            } satisfies DayManifestIssue]));
}

export function academyDayIsProductionComplete(manifest: AcademyDayAvailabilityManifest): boolean {
    return validateAcademyDayAvailabilityManifest(manifest).length === 0
        && dayDeliveryGaps(manifest).length === 0;
}
