import type {
    CurriculumActivityKind,
    CurriculumAugmentation,
    CurriculumSourceReceipt,
} from '../domain/curriculum-augmentation';

export const HONEN_DAY_ONE_COURSE_ID = '6a6538d092ef865026522aa5' as const;
export const HONEN_DAY_ONE_LESSON_ID = 'lesson:foundation-00' as const;

export type HonenLearningStage =
    | 'guided-exposure'
    | 'guided-retrieval'
    | 'independent-retrieval'
    | 'repair'
    | 'transfer'
    | 'spaced-return'
    | 'learner-choice';

export interface HonenActivityMapping {
    readonly id: string;
    readonly kind: CurriculumActivityKind;
}

export interface HonenTopicMapping {
    readonly unitId: string;
    readonly topicId: string;
    readonly title: string;
    readonly yomuLessonId: typeof HONEN_DAY_ONE_LESSON_ID;
    readonly yomuActivityId: string;
    readonly stage: HonenLearningStage;
    readonly activities: readonly HonenActivityMapping[];
    readonly flashcardIdStem: string;
}

export interface HonenCardMapping {
    readonly id: string;
    readonly topicId: string;
    readonly yomuLessonId: typeof HONEN_DAY_ONE_LESSON_ID;
    readonly yomuActivityId: string;
    readonly stage: HonenLearningStage;
}

export interface HonenVowelContrast {
    readonly itemIds: readonly string[];
    readonly sourceQuestionId: string;
    readonly cue: Readonly<{ en: string; ja: string }>;
}

const activity = (id: string, kind: CurriculumActivityKind): HonenActivityMapping =>
    Object.freeze({ id, kind });

const topic = (
    unitId: string,
    topicId: string,
    title: string,
    yomuActivityId: string,
    stage: HonenLearningStage,
    flashcardIdStem: string,
    activities: readonly HonenActivityMapping[],
): HonenTopicMapping => Object.freeze({
    unitId,
    topicId,
    title,
    yomuLessonId: HONEN_DAY_ONE_LESSON_ID,
    yomuActivityId,
    stage,
    flashcardIdStem,
    activities: Object.freeze(activities),
});

export const HONEN_DAY_ONE_TOPICS: readonly HonenTopicMapping[] = Object.freeze([
    topic(
        '6a653ad5d566c39cf2fd3c09',
        '6a653ad6033103525883c229',
        'Meet あ・い・う・え・お',
        'activity:lesson-zero-vowel-listen',
        'guided-exposure',
        'meet-----------card-',
        [
            activity('6a653ad67308dd1fa4e1646f', 'READ'),
            activity('6a653ad6e3ef8f5f9321b8cd', 'FLASHCARDS'),
            activity('6a653ad6ff074df7fbe1b943', 'QUIZ'),
        ],
    ),
    topic(
        '6a653ad5d566c39cf2fd3c09',
        '6a653ad6ba9069fd1d52ec37',
        'Hear It, Then Choose',
        'game:lesson-zero-vowel-listening-bingo',
        'independent-retrieval',
        'hear-it--then-choose-card-',
        [
            activity('6a653ad6c9b80a7ed19949fe', 'READ'),
            activity('6a653ad64340da0510915e9b', 'FLASHCARDS'),
            activity('6a65476ec6b17a86e3547383', 'GAME'),
        ],
    ),
    topic(
        '6a653ad5d566c39cf2fd3c09',
        '6a653ad73a2fa21918211ca0',
        'Find the Sounds in おはよう',
        'activity:lesson-zero-greet-rie',
        'transfer',
        'find-the-sounds-in------card-',
        [
            activity('6a653ad7da08c166cf14c1ce', 'READ'),
            activity('6a653ad75194ff1d032846a8', 'CHAT'),
            activity('6a65476eca4456f1d92fc273', 'FLASHCARDS'),
        ],
    ),
    topic(
        '6a653ad87436a025e34ece38',
        '6a653ad8afff0af122b1abd4',
        'The Hiragana Vowel Row',
        'activity:lesson-zero-vowel-doodle',
        'guided-exposure',
        'the-hiragana-vowel-row-card-',
        [
            activity('6a653ad82cf4f06cc0b327fb', 'READ'),
            activity('6a653ad8242aeae686269b8d', 'FLASHCARDS'),
            activity('6a653ad8fde2c6caad823922', 'QUIZ'),
        ],
    ),
    topic(
        '6a653ad87436a025e34ece38',
        '6a653ad8c0fdf796c7cc4f15',
        'The Katakana Vowel Row',
        'activity:lesson-zero-name-card-draft',
        'guided-exposure',
        'the-katakana-vowel-row-card-',
        [
            activity('6a653ad8ad7f14c1f98b3f89', 'READ'),
            activity('6a653ad8ffe32713f8c30eae', 'FLASHCARDS'),
            activity('6a653ad8d1fa8cd4f1a0f625', 'GAME'),
        ],
    ),
    topic(
        '6a653ad87436a025e34ece38',
        '6a653ad9fffec654d8b7bec4',
        'Switch Scripts Without Losing the Sound',
        'activity:lesson-zero-name-card-draft',
        'transfer',
        'switch-scripts-without-losing-the-sound-card-',
        [
            activity('6a653ad9fe014865a8d4d5be', 'READ'),
            activity('6a653ad9d1f6822e9c47f6d0', 'FLASHCARDS'),
            activity('6a654a7eba5c43774fbbbfd4', 'CHAT'),
        ],
    ),
    topic(
        '6a653ada6da36c7219c47990',
        '6a653ada5ff6458308e0bbee',
        'Hello and Good Evening',
        'activity:lesson-zero-greet-rie',
        'guided-exposure',
        'hello-and-good-evening-card-',
        [
            activity('6a653adae9e5f7e85e20e4e7', 'READ'),
            activity('6a653adabe7c5408e6d8d666', 'FLASHCARDS'),
            activity('6a653ada1e6fb30409fcb4ff', 'QUIZ'),
        ],
    ),
    topic(
        '6a653ada6da36c7219c47990',
        '6a653ada213b933175e222dd',
        'Good Morning',
        'activity:lesson-zero-greet-rie',
        'guided-retrieval',
        'good-morning------------card-',
        [
            activity('6a653ada0cf584fc882426ef', 'READ'),
            activity('6a653adab4f4b7a775981b72', 'FLASHCARDS'),
            activity('6a653ada12bb462d4dba8750', 'GAME'),
        ],
    ),
    topic(
        '6a653ada6da36c7219c47990',
        '6a653adb9446f12d33a70a90',
        'Before and After a Meal',
        'activity:lesson-zero-speaking-transfer',
        'transfer',
        'before-and-after-a-meal-card-',
        [
            activity('6a653adbf580fbcae8ece098', 'READ'),
            activity('6a653adb82e224628c08b3a3', 'FLASHCARDS'),
            activity('6a654aaac59f5e0df5548e28', 'CHAT'),
        ],
    ),
    topic(
        '6a653adc0bccee3f80525b85',
        '6a653adc17b1cee76294157e',
        'Look and Listen',
        'activity:lesson-zero-follow-instructions',
        'guided-exposure',
        'look-and-listen-card-',
        [
            activity('6a653adcbfb5adc6ab59dd63', 'READ'),
            activity('6a653adc9504783ceae550f0', 'FLASHCARDS'),
            activity('6a6548564f7f161cef4cbb0a', 'QUIZ'),
        ],
    ),
    topic(
        '6a653adc0bccee3f80525b85',
        '6a653addaf2a579a991401b6',
        'Ask for Help',
        'activity:lesson-zero-reconstruct-repair',
        'repair',
        'ask-for-help-card-',
        [
            activity('6a653add4c821fac5cbf424e', 'READ'),
            activity('6a654adf9249d7a4d3d6afba', 'FLASHCARDS'),
            activity('6a654adf43c4168211c69683', 'GAME'),
        ],
    ),
    topic(
        '6a653adc0bccee3f80525b85',
        '6a653add75da34727a084140',
        'Say, Write, and Read',
        'activity:lesson-zero-follow-instructions',
        'transfer',
        'say--write--and-read-card-',
        [
            activity('6a653add7c72f9c6507fd8cc', 'READ'),
            activity('6a653add82a0c59111b5889d', 'FLASHCARDS'),
            activity('6a654adfe32f0159fbf97025', 'CHAT'),
        ],
    ),
    topic(
        '6a653ade46d9ffd388df5e96',
        '6a653ade549db2736d03eaff',
        'Notebook, Pencil, Book',
        'activity:lesson-zero-desk-language',
        'guided-exposure',
        'notebook--pencil--book-card-',
        [
            activity('6a653ade7aeb354fb22f6b9c', 'READ'),
            activity('6a653aded9d87fae274ba51d', 'FLASHCARDS'),
            activity('6a653adec6517ccea7f6dbc6', 'QUIZ'),
        ],
    ),
    topic(
        '6a653ade46d9ffd388df5e96',
        '6a653adf1411e3777e1c33b4',
        'Homework and Example',
        'activity:lesson-zero-desk-language',
        'guided-retrieval',
        'homework-and-example-card-',
        [
            activity('6a653adf2563514d600c0399', 'READ'),
            activity('6a653adf9c90c79a8dbd2a8d', 'FLASHCARDS'),
            activity('6a653adf369fa2eb9949e013', 'GAME'),
        ],
    ),
    topic(
        '6a653ade46d9ffd388df5e96',
        '6a653adfde909ddd70719c9f',
        'Show Me the Right Thing',
        'activity:lesson-zero-desk-language',
        'transfer',
        'show-me-the-right-thing-card-',
        [
            activity('6a653adf6a52e9b55041123d', 'READ'),
            activity('6a653adf9f9f8b84c94ae77b', 'FLASHCARDS'),
            activity('6a653adf096b1a29b612655f', 'CHAT'),
        ],
    ),
    topic(
        '6a653ae0cf3f6655fc1a318d',
        '6a653ae1483bfbee9d9aa44b',
        'Break Your Name Into Sounds',
        'activity:lesson-zero-name-card-draft',
        'guided-exposure',
        'break-your-name-into-sounds-card-',
        [
            activity('6a653ae17ced759bbd9cf904', 'READ'),
            activity('6a653ae105fb41bd2b8422e2', 'FLASHCARDS'),
            activity('6a6548b1d9baf6529bb7bd59', 'QUIZ'),
        ],
    ),
    topic(
        '6a653ae0cf3f6655fc1a318d',
        '6a653ae1faeef96dd584a781',
        'Notice Name Patterns',
        'activity:lesson-zero-name-card-draft',
        'guided-retrieval',
        'notice-name-patterns-card-',
        [
            activity('6a653ae101c85fa898fb4c44', 'READ'),
            activity('6a653ae120e932842fcc6904', 'FLASHCARDS'),
            activity('6a654a35cfd8c2c9bfc5ff9f', 'GAME'),
        ],
    ),
    topic(
        '6a653ae0cf3f6655fc1a318d',
        '6a653ae2b1f7008b6c56db2d',
        'Introduce Yourself',
        'activity:lesson-zero-build-sentence-frames',
        'transfer',
        'introduce-yourself-card-',
        [
            activity('6a653ae2b147033cd2563bb2', 'READ'),
            activity('6a653ae2f9f1f0059a33c85c', 'FLASHCARDS'),
            activity('6a654a35cdee85462b716656', 'CHAT'),
        ],
    ),
    topic(
        '6a653ae39d24727a92b90f87',
        '6a653ae326b86b341cf340d5',
        'Remember Before You Review',
        'activity:lesson-zero-sound-transfer',
        'spaced-return',
        'remember-before-you-review-card-',
        [
            activity('6a653ae3b0fa4b686dff4789', 'READ'),
            activity('6a653ae3d99c3dc4bfd6a7b1', 'FLASHCARDS'),
            activity('6a653ae3d4a33cc11fb8670f', 'QUIZ'),
        ],
    ),
    topic(
        '6a653ae39d24727a92b90f87',
        '6a653ae36fee00bd68bcd180',
        'Use Japanese in Tiny Scenes',
        'activity:lesson-zero-speaking-transfer',
        'transfer',
        'use-japanese-in-tiny-scenes-card-',
        [
            activity('6a653ae38ccc986394d1665b', 'READ'),
            activity('6a653ae3696ab7a57341c286', 'GAME'),
            activity('6a654b37cb27d3c9e9022c76', 'FLASHCARDS'),
        ],
    ),
    topic(
        '6a653ae39d24727a92b90f87',
        '6a653ae47126bccf4c4c166c',
        'Choose Your Next Step',
        'activity:lesson-zero-close-room',
        'learner-choice',
        'choose-your-next-step-card-',
        [
            activity('6a653ae4a6b23b9be5927c8e', 'READ'),
            activity('6a653ae4c76d2d40f7ee6ff0', 'FLASHCARDS'),
            activity('6a653ae4c74e1fa3d8dc3012', 'CHAT'),
        ],
    ),
]);

export const HONEN_DAY_ONE_CARD_MAPPINGS: readonly HonenCardMapping[] = Object.freeze(
    HONEN_DAY_ONE_TOPICS.flatMap(topicMapping =>
        Array.from({ length: 5 }, (_, index) => Object.freeze({
            id: `${topicMapping.flashcardIdStem}${index + 1}`,
            topicId: topicMapping.topicId,
            yomuLessonId: topicMapping.yomuLessonId,
            yomuActivityId: topicMapping.yomuActivityId,
            stage: topicMapping.stage,
        }))),
);

export const HONEN_DAY_ONE_SOURCE_RECEIPTS: readonly CurriculumSourceReceipt[] = Object.freeze([
    Object.freeze({
        sourceId: 'jp-15e7854e24fc99a1',
        sha256: '15e7854e24fc99a13ad8a328674fbb535a20195ef62746e4fe20063ba659367a',
        itemId: '6a65365d6646aab70aa8d46d',
        versionId: '6a65367992ef865026522aa0',
    }),
    Object.freeze({
        sourceId: 'jp-e719f3e2ab9ae8be',
        sha256: 'e719f3e2ab9ae8be924556fc4d57f47ccc96385ee40ee0be47682463e4339f2e',
        itemId: '6a65365db8cb2e16cb817c66',
        versionId: '6a65366e92ef865026522a90',
    }),
    Object.freeze({
        sourceId: 'jp-79a9768b212b6c5e',
        sha256: '79a9768b212b6c5e834c817b110bb21612053c5e0940b12783c54986bfdb77b5',
        itemId: '6a655684ee04b81954015407',
        versionId: '6a6556cc41ed5d3565b14c33',
    }),
    Object.freeze({
        sourceId: 'jp-b327d5b0a7f036d3',
        sha256: 'b327d5b0a7f036d3339a81c76e0dfbfda11695c467a30e71334fa88bb8b55053',
        itemId: '6a655684ee04b81954015408',
        versionId: '6a6557086ac5c3aa9136be8c',
    }),
    Object.freeze({
        sourceId: 'jp-97f2bc0b111e8088',
        sha256: '97f2bc0b111e8088088029af4652e96ca6ed892e43a247075a8fe30d422c2bac',
        itemId: '6a655684ee04b81954015406',
        versionId: '6a655689ee04b8195401540b',
    }),
]);

export const HONEN_DAY_ONE_VOWEL_CONTRASTS: readonly HonenVowelContrast[] = Object.freeze([
    Object.freeze({
        itemIds: Object.freeze(['hira-a', 'hira-i']),
        sourceQuestionId: '6a653ad6ba9069fd1d52ec37-g-1',
        cue: Object.freeze({
            en: 'Compare the neighbours: あ opens the mouth; い spreads it into a small smile.',
            ja: '近い音を比べましょう。「あ」は口を開き、「い」は口を横に広げます。',
        }),
    }),
    Object.freeze({
        itemIds: Object.freeze(['hira-u', 'hira-o']),
        sourceQuestionId: '6a653ad6ba9069fd1d52ec37-g-2',
        cue: Object.freeze({
            en: 'Compare the neighbours: う keeps the lips small; お rounds them a little more.',
            ja: '近い音を比べましょう。「う」は唇を小さくし、「お」はもう少し丸くします。',
        }),
    }),
    Object.freeze({
        itemIds: Object.freeze(['hira-i', 'hira-e']),
        sourceQuestionId: '6a653ad6ba9069fd1d52ec37-g-3',
        cue: Object.freeze({
            en: 'Compare the neighbours: い stays high and narrow; え opens a little lower.',
            ja: '近い音を比べましょう。「い」は口を狭く保ち、「え」は少し下に開きます。',
        }),
    }),
]);

export function honenDayOneAugmentation(
    yomuActivityId: string,
    activityKind: CurriculumActivityKind,
): CurriculumAugmentation {
    const topicMapping = HONEN_DAY_ONE_TOPICS.find(candidate =>
        candidate.yomuActivityId === yomuActivityId
        && candidate.activities.some(candidateActivity => candidateActivity.kind === activityKind));
    if (!topicMapping) {
        throw new Error(`No Honen Day One ${activityKind} mapping for ${yomuActivityId}.`);
    }
    const activityMapping = topicMapping.activities.find(candidate => candidate.kind === activityKind)!;
    return Object.freeze({
        provider: 'honen',
        courseId: HONEN_DAY_ONE_COURSE_ID,
        unitId: topicMapping.unitId,
        topicId: topicMapping.topicId,
        activityId: activityMapping.id,
        activityKind,
        mappedLessonId: topicMapping.yomuLessonId,
        mappedActivityId: topicMapping.yomuActivityId,
        renderOwner: 'yomu',
        sourceReceipts: HONEN_DAY_ONE_SOURCE_RECEIPTS,
    });
}
