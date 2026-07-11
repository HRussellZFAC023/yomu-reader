/**
 * Yomu Academy — lesson content (additive).
 *
 * This module is authored SEPARATELY from `content.ts` and never edits it. It
 * exports two things the app can merge into the existing content graph:
 *
 *   1. `lessonsContentGraph` — a runtime `AcademyContentGraph` fragment
 *      (concepts, variants, outcomes, assets, activities, curriculum units,
 *      placements) for three real lessons. Merge it with `academyContentGraph`
 *      via `mergeAcademyContentGraphs` and it passes `validateAcademyContentGraph`.
 *
 *   2. `ACADEMY_LESSONS` — the warm, human teaching layer that wraps each
 *      lesson: a scene with the real class, a recap of what came before, an
 *      explanation you'd actually want to read before practising, a short
 *      comprehensible-input story, vocabulary and kanji with readings, and the
 *      hana-maru grading copy. Every activity here has a match in the graph via
 *      `AcademyLesson.activityIds`.
 *
 * The Japanese sits at the class's real level: Minna no Nihongo II, chapters
 * 28–30 (〜ながら／〜し, 〜てしまいました＋状態の〜ています, 〜てある／〜ておく).
 * Every sentence, story, model answer, and rubric below is original writing.
 */

import type {
    AcademyActivity,
    AcademyAsset,
    AcademyConcept,
    AcademyContentGraph,
    AcademyCopy,
    AssetRights,
    ConceptVariant,
    CurriculumPlacement,
    CurriculumUnit,
    LearningOutcome,
} from './content';

/* --------------------------------------------------------------- tiny helpers */

const copy = (en: string, ja?: string): AcademyCopy => (ja ? { en, ja } : { en });

const originalRights = (): AssetRights => ({
    origin: 'original',
    status: 'cleared',
    rightsHolder: 'Yomu Academy',
    license: 'All rights reserved',
    attribution: 'Original Yomu Academy material.',
    permittedUses: ['academy-web', 'academy-offline', 'assessment', 'adaptation'],
});

/* ---------------------------------------------------- the warm teaching layer */

/** One Japanese line with its reading and a natural English rendering. */
export interface LessonExample {
    ja: string;
    /** Kana reading of the whole line (Yomu also injects furigana live). */
    reading: string;
    en: string;
    /** Optional aside — who says it, or a nuance worth a sentence. */
    note?: string;
}

/** A short story the learner can already mostly read — comprehensible input. */
export interface LessonReading {
    title: AcademyCopy;
    lines: readonly LessonExample[];
    /** One warm sentence of what just happened, in English. */
    gloss: string;
}

/** A grammar point explained the way a good teacher explains it out loud. */
export interface LessonGrammarPoint {
    /** The shape, e.g. `Vます-stem ＋ ながら、[main clause]`. */
    form: string;
    /** How the class refers to it in Japanese. */
    nameJa: string;
    heading: string;
    /** Warm, plain-English explanation. No jargon walls. */
    body: string;
    examples: readonly LessonExample[];
}

export interface LessonVocabEntry {
    ja: string;
    reading: string;
    en: string;
    example: LessonExample;
}

export interface LessonKanjiEntry {
    character: string;
    reading: string;
    meaning: string;
    word: string;
    wordReading: string;
}

/** Where the lesson opens and who is around — the Persona/Ghibli framing. */
export interface LessonScene {
    /** A place on campus or in the city ("the ramen counter", "the konbini"). */
    where: string;
    /** Cast ids from `cast.ts` who share this scene. */
    withCast: readonly string[];
    /** One or two warm lines that set the evening. */
    hook: string;
}

/** The hana-maru grading voice — Rie is warm and funny, never a checklist. */
export interface LessonGradingCopy {
    /** Full marks. */
    hanamaru: string;
    /** Nearly there — most of it landed. */
    almost: string;
    /** Try again, gently. */
    retry: string;
    /** A little aside from Rie-sensei after marking. */
    senseiAside: string;
}

export interface AcademyLesson {
    id: string;
    chapter: number;
    /** The curriculum unit id this lesson maps to inside `lessonsContentGraph`. */
    unitId: string;
    title: AcademyCopy;
    /** The class's real coursebook reference — sequence only, never copied. */
    minnaReference: string;
    scene: LessonScene;
    /** What we did last time, so nobody is lost. */
    recap: string;
    /** The human explanation you read before you practise anything. */
    intro: string;
    comprehensibleInput: LessonReading;
    grammar: readonly LessonGrammarPoint[];
    vocab: readonly LessonVocabEntry[];
    kanji: readonly LessonKanjiEntry[];
    grading: LessonGradingCopy;
    /** Activity ids from `lessonsContentGraph`, in the order you play them. */
    activityIds: readonly string[];
}

/* ------------------------------------------------------------- merge utility */

/**
 * Combine content graphs. Later graphs append to earlier ones. Merge order is
 * the caller's responsibility (a unit's parent must appear before or with it),
 * which is why the term programme is merged first below.
 */
export function mergeAcademyContentGraphs(
    base: AcademyContentGraph,
    ...additions: readonly AcademyContentGraph[]
): AcademyContentGraph {
    return additions.reduce<AcademyContentGraph>(
        (acc, next) => ({
            schemaVersion: '1',
            concepts: [...acc.concepts, ...next.concepts],
            conceptVariants: [...acc.conceptVariants, ...next.conceptVariants],
            outcomes: [...acc.outcomes, ...next.outcomes],
            activities: [...acc.activities, ...next.activities],
            assets: [...acc.assets, ...next.assets],
            curriculumUnits: [...acc.curriculumUnits, ...next.curriculumUnits],
            placements: [...acc.placements, ...next.placements],
        }),
        base,
    );
}

/* ------------------------------------------------------- the term (programme) */

const TERM_PROGRAMME: CurriculumUnit = {
    id: 'unit-academy-term',
    kind: 'programme',
    title: copy('The class term', 'クラスの学期'),
    summary: copy(
        'The evening class, one term of it — the weeks around Minna II chapters 28 to 30, told as the story of a real class that eats ramen together, loses umbrellas, and throws a surprise party.',
        'みんなでラーメンを食べて、傘をなくして、サプライズパーティーをする、ある学期の物語。',
    ),
    level: 'Upper-beginner · Minna II ch.28–30',
};

const programmeGraph: AcademyContentGraph = {
    schemaVersion: '1',
    concepts: [],
    conceptVariants: [],
    outcomes: [],
    activities: [],
    assets: [],
    curriculumUnits: [TERM_PROGRAMME],
    placements: [],
};

/* =====================================================================
 * LESSON 28 — Two things at once (〜ながら / 〜し)
 * Scene: the ramen counter before class, with Shin and Aakash.
 * ===================================================================== */

const l28Concepts: readonly AcademyConcept[] = [
    {
        id: 'concept-l28-nagara',
        domain: 'grammar',
        title: copy('Doing two things at once with ながら', '「ながら」で二つのことを同時に'),
        summary: copy('Attach ながら to a verb stem to say you do one thing while doing another. The main action is the second clause.'),
    },
    {
        id: 'concept-l28-shi',
        domain: 'grammar',
        title: copy('Stacking reasons with し', '「〜し、〜し」で理由をならべる'),
        summary: copy('Use し to list several reasons or qualities that pile up toward a feeling or conclusion.'),
    },
    {
        id: 'concept-l28-scene',
        domain: 'listening',
        title: copy('Following a short class scene', '短い場面を読み取る'),
        summary: copy('Catch the gist and the useful details of a warm, everyday conversation before leaning on the transcript.'),
    },
    {
        id: 'concept-l28-writing',
        domain: 'writing',
        title: copy('Writing about your routine', '毎日のことを書く'),
        summary: copy('Describe something you do while doing something else, and give the reasons you enjoy it.'),
    },
    {
        id: 'concept-l28-kanji',
        domain: 'kanji',
        title: copy('Kanji: song, driving, and study', '漢字：歌・運・転・勉・強'),
        summary: copy('Recognise 歌, 運, 転, 勉, and 強 in the words this class actually uses.'),
    },
];

const l28Variants: readonly ConceptVariant[] = [
    {
        id: 'variant-l28-nagara-simultaneous',
        conceptId: 'concept-l28-nagara',
        label: copy('One person, two actions', '一人・二つの動作'),
        form: 'Vます-stem ＋ ながら、[main clause]',
        explanation: copy('Both actions belong to the same person and happen together.'),
        example: copy('音楽を聞きながら、勉強します。', '音楽を聞きながら、勉強します。'),
    },
    {
        id: 'variant-l28-nagara-main-second',
        conceptId: 'concept-l28-nagara',
        label: copy('The real action comes second', '主な動作は後ろ'),
        form: '[side action]ながら、[main action]',
        explanation: copy('The clause after ながら is the thing you are mainly doing.'),
        example: copy('運転しながら、歌います。', '運転しながら、歌います。'),
    },
    {
        id: 'variant-l28-shi-reasons',
        conceptId: 'concept-l28-shi',
        label: copy('Reasons that add up', 'つみ重なる理由'),
        form: '[plain]し、[plain]し、[conclusion]',
        explanation: copy('Each し adds another reason, and together they lead to how you feel or what you decide.'),
        example: copy('安いし、おいしいし、よく行きます。', '安いし、おいしいし、よく行きます。'),
    },
    {
        id: 'variant-l28-shi-emphasis',
        conceptId: 'concept-l28-shi',
        label: copy('And what\'s more', 'それに'),
        form: '[plain]し (…and on top of that)',
        explanation: copy('し carries an "and on top of that" feeling — it is warmer than just listing facts.'),
        example: copy('雨だし、疲れたし、今日は休みます。', '雨だし、疲れたし、今日は休みます。'),
    },
    {
        id: 'variant-l28-scene-gist',
        conceptId: 'concept-l28-scene',
        label: copy('Gist first', 'まず大意'),
        form: 'first read → who, where, doing what',
        explanation: copy('Decide the broad picture before checking any single word.'),
        example: copy('二人がラーメン屋で話しています。', '二人がラーメン屋で話しています。'),
    },
    {
        id: 'variant-l28-writing-routine',
        conceptId: 'concept-l28-writing',
        label: copy('A "while" habit', '「ながら」の習慣'),
        form: '[when] ＋ [X]ながら [Y]。＋ [X]し、[Y]し、[feeling]。',
        explanation: copy('Combine a ながら habit with a couple of し reasons for a small, honest paragraph.'),
        example: copy('毎晩、音楽を聞きながら勉強します。楽しいし、リラックスできるし、好きです。', '毎晩、音楽を聞きながら勉強します。楽しいし、リラックスできるし、好きです。'),
    },
    {
        id: 'variant-l28-kanji-uta',
        conceptId: 'concept-l28-kanji',
        label: copy('歌', '歌'),
        form: '歌（うた・うたう）',
        explanation: copy('Song, and the verb to sing.'),
        example: copy('歌う', '歌う'),
    },
    {
        id: 'variant-l28-kanji-un',
        conceptId: 'concept-l28-kanji',
        label: copy('運', '運'),
        form: '運（うん）',
        explanation: copy('To carry; luck. Half of "to drive".'),
        example: copy('運転', '運転'),
    },
    {
        id: 'variant-l28-kanji-ten',
        conceptId: 'concept-l28-kanji',
        label: copy('転', '転'),
        form: '転（てん）',
        explanation: copy('To turn or roll. The other half of "to drive".'),
        example: copy('運転', '運転'),
    },
    {
        id: 'variant-l28-kanji-ben',
        conceptId: 'concept-l28-kanji',
        label: copy('勉', '勉'),
        form: '勉（べん）',
        explanation: copy('Effort — you only ever see it in 勉強.'),
        example: copy('勉強', '勉強'),
    },
    {
        id: 'variant-l28-kanji-kyou',
        conceptId: 'concept-l28-kanji',
        label: copy('強', '強'),
        form: '強（きょう・つよい）',
        explanation: copy('Strong; the study half of 勉強.'),
        example: copy('勉強', '勉強'),
    },
];

const l28Outcomes: readonly LearningOutcome[] = [
    {
        id: 'outcome-l28-use-nagara',
        statement: copy('I can say I do one thing while doing another, with the main action in the second clause.'),
        targetConceptIds: ['concept-l28-nagara'],
        targetVariantIds: ['variant-l28-nagara-simultaneous', 'variant-l28-nagara-main-second'],
    },
    {
        id: 'outcome-l28-use-shi',
        statement: copy('I can give two or more reasons with し that build toward a feeling or decision.'),
        targetConceptIds: ['concept-l28-shi'],
        targetVariantIds: ['variant-l28-shi-reasons', 'variant-l28-shi-emphasis'],
    },
    {
        id: 'outcome-l28-read-scene',
        statement: copy('I can follow a short everyday conversation and confirm its useful details.'),
        targetConceptIds: ['concept-l28-scene'],
        targetVariantIds: ['variant-l28-scene-gist'],
    },
    {
        id: 'outcome-l28-write-routine',
        statement: copy('I can write a short paragraph about a routine using ながら and し.'),
        targetConceptIds: ['concept-l28-writing', 'concept-l28-nagara', 'concept-l28-shi'],
        targetVariantIds: ['variant-l28-writing-routine', 'variant-l28-nagara-simultaneous', 'variant-l28-shi-reasons'],
    },
    {
        id: 'outcome-l28-read-kanji',
        statement: copy('I can read 歌, 運, 転, 勉, and 強 in familiar words.'),
        targetConceptIds: ['concept-l28-kanji'],
        targetVariantIds: [
            'variant-l28-kanji-uta',
            'variant-l28-kanji-un',
            'variant-l28-kanji-ten',
            'variant-l28-kanji-ben',
            'variant-l28-kanji-kyou',
        ],
    },
];

const l28Assets: readonly AcademyAsset[] = [
    {
        id: 'asset-l28-scene-audio',
        kind: 'audio',
        title: copy('Ramen before class: the scene', 'ラーメン屋の場面'),
        locale: 'ja',
        locator: 'academy://audio/lesson-28/ramen-before-class',
        durationSeconds: 42,
        rights: originalRights(),
    },
    {
        id: 'asset-l28-scene-transcript',
        kind: 'transcript',
        title: copy('Ramen before class: transcript', 'ラーメン屋の場面：スクリプト'),
        locale: 'ja',
        locator: 'academy://transcripts/lesson-28/ramen-before-class',
        transcriptOfAssetId: 'asset-l28-scene-audio',
        body: [
            'シンさんとアーカシュさんは、授業の前にラーメンを食べます。',
            'シンさんは、メニューを読みながら、漢字を教えてくれます。',
            '「このお店は、安いし、おいしいし、駅から近いですよ。」',
            'アーカシュさんは、ラーメンを食べながら、好きな音楽の話をします。',
            '「運転しながら、この曲をよく聞くんです。」',
            '二人は、笑いながら、教室へ歩きます。今日も、楽しい夜です。',
        ].join('\n'),
        rights: originalRights(),
    },
    {
        id: 'asset-l28-writing-model',
        kind: 'writing-model',
        title: copy('Model: a "while" routine', 'モデル：「ながら」の習慣'),
        locale: 'ja',
        locator: 'academy://models/lesson-28/while-routine',
        body: [
            '私は、毎晩、音楽を聞きながら、日本語を勉強します。',
            'この時間が好きだし、リラックスできるし、楽しいです。',
            '週末は、コーヒーを飲みながら、漫画を読みます。',
            '時々、歌いながら、新しい言葉を覚えます。',
        ].join('\n'),
        rights: originalRights(),
    },
    {
        id: 'asset-l28-writing-rubric',
        kind: 'rubric',
        title: copy('Rubric: a "while" routine', 'ルーブリック：「ながら」の習慣'),
        locale: 'ja-en',
        locator: 'academy://rubrics/lesson-28/while-routine',
        criteria: [
            {
                id: 'criterion-l28-nagara',
                label: copy('You describe two actions happening together with ながら.'),
                levels: [
                    { score: 0, description: copy('No ながら, or the two actions do not fit one person.') },
                    { score: 1, description: copy('One clear ながら sentence.') },
                    { score: 2, description: copy('ながら is used naturally, main action second.') },
                ],
            },
            {
                id: 'criterion-l28-shi',
                label: copy('You give reasons with し that build to a feeling.'),
                levels: [
                    { score: 0, description: copy('No し, or reasons do not connect.') },
                    { score: 1, description: copy('One し reason.') },
                    { score: 2, description: copy('Two or more し reasons lead to a clear feeling.') },
                ],
            },
            {
                id: 'criterion-l28-reader',
                label: copy('A reader can picture your routine.'),
                levels: [
                    { score: 0, description: copy('Hard to picture.') },
                    { score: 1, description: copy('Roughly clear.') },
                    { score: 2, description: copy('Warm and easy to picture.') },
                ],
            },
        ],
        rights: originalRights(),
    },
    {
        id: 'asset-l28-kanji-reference',
        kind: 'kanji-reference',
        title: copy('Lesson 28 kanji', '第28課の漢字'),
        locale: 'ja-en',
        locator: 'academy://references/lesson-28/kanji',
        entries: [
            { character: '歌', reading: 'うた', meaning: copy('song; to sing'), example: copy('歌う (to sing)', '歌う') },
            { character: '運', reading: 'うん', meaning: copy('to carry; luck'), example: copy('運転 (driving)', '運転') },
            { character: '転', reading: 'てん', meaning: copy('to turn; roll'), example: copy('運転 (driving)', '運転') },
            { character: '勉', reading: 'べん', meaning: copy('effort'), example: copy('勉強 (study)', '勉強') },
            { character: '強', reading: 'きょう', meaning: copy('strong'), example: copy('勉強 (study)', '勉強') },
        ],
        rights: originalRights(),
    },
];

const l28Activities: readonly AcademyActivity[] = [
    {
        id: 'activity-l28-listen-scene',
        kind: 'listening',
        title: copy('Listen: ramen before class', 'まず聞く：授業の前のラーメン'),
        instructions: copy('Listen (or read the scene aloud) before opening the transcript. Get the gist, then check the details.'),
        estimatedMinutes: 7,
        outcomeIds: ['outcome-l28-read-scene'],
        focusVariantIds: ['variant-l28-scene-gist'],
        assetUses: [
            { assetId: 'asset-l28-scene-audio', role: 'audio', availability: 'always' },
            { assetId: 'asset-l28-scene-transcript', role: 'transcript', availability: 'optional-after-first-attempt' },
        ],
        responses: [
            {
                id: 'response-l28-listened',
                kind: 'none',
                prompt: copy('Read or listen to the scene once before the transcript.'),
                completionLabel: copy('I read it once through'),
                required: false,
            },
            {
                id: 'response-l28-gist',
                kind: 'select-one',
                prompt: copy('What are Shin and Aakash doing?'),
                required: true,
                options: [
                    { id: 'l28-gist-ramen', label: copy('Eating ramen and chatting before class.') },
                    { id: 'l28-gist-exam', label: copy('Studying quietly for an exam in the library.') },
                    { id: 'l28-gist-shopping', label: copy('Shopping for a birthday present.') },
                ],
                correctOptionIds: ['l28-gist-ramen'],
            },
            {
                id: 'response-l28-detail',
                kind: 'select-many',
                prompt: copy('Which details does the scene actually give? Choose every true one.'),
                required: true,
                options: [
                    { id: 'l28-d-kanji', label: copy('Shin teaches kanji while reading the menu.') },
                    { id: 'l28-d-cheap', label: copy('The shop is cheap, tasty, and near the station.') },
                    { id: 'l28-d-drive', label: copy('Aakash listens to this song while driving.') },
                    { id: 'l28-d-taxi', label: copy('They take a taxi to the classroom.') },
                ],
                correctOptionIds: ['l28-d-kanji', 'l28-d-cheap', 'l28-d-drive'],
            },
        ],
    },
    {
        id: 'activity-l28-nagara-choose',
        kind: 'grammar-practice',
        title: copy('Which ながら sentence works?', '正しい「ながら」は？'),
        instructions: copy('ながら joins two actions of one person. Pick the sentence that follows the rule.'),
        estimatedMinutes: 4,
        outcomeIds: ['outcome-l28-use-nagara'],
        focusVariantIds: ['variant-l28-nagara-simultaneous'],
        assetUses: [],
        responses: [
            {
                id: 'response-l28-nagara-choose',
                kind: 'select-one',
                prompt: copy('Choose the natural sentence.'),
                required: true,
                options: [
                    { id: 'l28-n-ok', label: copy('コーヒーを飲みながら、本を読みます。 (I read while drinking coffee.)') },
                    { id: 'l28-n-two-people', label: copy('友だちが歌いながら、私が踊ります。 (My friend sings while I dance.)') },
                    { id: 'l28-n-past', label: copy('食べましたながら、話します。') },
                ],
                correctOptionIds: ['l28-n-ok'],
            },
        ],
    },
    {
        id: 'activity-l28-nagara-order',
        kind: 'grammar-practice',
        title: copy('Build a ながら sentence', '「ながら」の文を作る'),
        instructions: copy('Put the pieces in a natural order. Remember: the main action comes last.'),
        estimatedMinutes: 4,
        outcomeIds: ['outcome-l28-use-nagara'],
        focusVariantIds: ['variant-l28-nagara-main-second'],
        assetUses: [],
        responses: [
            {
                id: 'response-l28-nagara-order',
                kind: 'ordering',
                prompt: copy('Order the segments to mean "Aakash sings while driving."'),
                required: true,
                items: [
                    { id: 'l28-o-aakash', label: copy('アーカシュさんは') },
                    { id: 'l28-o-drive', label: copy('運転しながら') },
                    { id: 'l28-o-sing', label: copy('歌います。') },
                ],
                correctOrderIds: ['l28-o-aakash', 'l28-o-drive', 'l28-o-sing'],
            },
        ],
    },
    {
        id: 'activity-l28-shi-match',
        kind: 'grammar-practice',
        title: copy('Reasons and conclusions', '理由と結論をつなぐ'),
        instructions: copy('Each し line stacks up reasons. Match it to the conclusion it leads to.'),
        estimatedMinutes: 5,
        outcomeIds: ['outcome-l28-use-shi'],
        focusVariantIds: ['variant-l28-shi-reasons'],
        assetUses: [],
        responses: [
            {
                id: 'response-l28-shi-match',
                kind: 'matching',
                prompt: copy('Match each set of reasons to its conclusion.'),
                required: true,
                pairs: [
                    { id: 'l28-p-cheap', left: copy('安いし、おいしいし、'), right: copy('よく行きます。') },
                    { id: 'l28-p-rain', left: copy('雨だし、疲れたし、'), right: copy('今日は休みます。') },
                    { id: 'l28-p-quiet', left: copy('静かだし、広いし、'), right: copy('この部屋が好きです。') },
                ],
            },
        ],
    },
    {
        id: 'activity-l28-shi-write',
        kind: 'grammar-practice',
        title: copy('Two reasons with し', '「し」で理由を二つ'),
        instructions: copy('Think of a place you like. Give two reasons with し, then finish the thought.'),
        estimatedMinutes: 5,
        outcomeIds: ['outcome-l28-use-shi'],
        focusVariantIds: ['variant-l28-shi-emphasis'],
        assetUses: [],
        responses: [
            {
                id: 'response-l28-shi-write',
                kind: 'short-text',
                prompt: copy('Write one sentence in Japanese using し at least once.'),
                required: true,
                minimumCharacters: 12,
                maximumCharacters: 90,
                grading: { kind: 'contains', requiredFragments: ['し'] },
            },
        ],
    },
    {
        id: 'activity-l28-kanji',
        kind: 'kanji',
        title: copy('Lesson 28 kanji', '第28課の漢字'),
        instructions: copy('Use the reference. Match each kanji to a word, then build a sentence you heard tonight.'),
        estimatedMinutes: 7,
        outcomeIds: ['outcome-l28-read-kanji'],
        focusVariantIds: [
            'variant-l28-kanji-uta',
            'variant-l28-kanji-un',
            'variant-l28-kanji-ten',
            'variant-l28-kanji-ben',
            'variant-l28-kanji-kyou',
        ],
        assetUses: [{ assetId: 'asset-l28-kanji-reference', role: 'reference', availability: 'always' }],
        responses: [
            {
                id: 'response-l28-kanji-match',
                kind: 'matching',
                prompt: copy('Match each kanji to a word it lives in.'),
                required: true,
                pairs: [
                    { id: 'l28-k-uta', left: copy('歌'), right: copy('歌う') },
                    { id: 'l28-k-un', left: copy('運'), right: copy('運転（する）') },
                    { id: 'l28-k-ten', left: copy('転'), right: copy('運転（の「転」）') },
                    { id: 'l28-k-ben', left: copy('勉'), right: copy('勉強（の「勉」）') },
                    { id: 'l28-k-kyou', left: copy('強'), right: copy('勉強（する）') },
                ],
            },
            {
                id: 'response-l28-kanji-order',
                kind: 'ordering',
                prompt: copy('Order the segments: "I study while listening to music."'),
                required: true,
                items: [
                    { id: 'l28-ko-music', label: copy('音楽を聞きながら、') },
                    { id: 'l28-ko-study', label: copy('勉強') },
                    { id: 'l28-ko-suru', label: copy('します。') },
                ],
                correctOrderIds: ['l28-ko-music', 'l28-ko-study', 'l28-ko-suru'],
            },
        ],
    },
    {
        id: 'activity-l28-write',
        kind: 'writing',
        title: copy('Write: your "while" routine', '書く：あなたの「ながら」習慣'),
        instructions: copy('Write 3–4 sentences about something you do while doing something else, with two し reasons you enjoy it. Open the model after your first draft.'),
        estimatedMinutes: 14,
        outcomeIds: ['outcome-l28-write-routine'],
        focusVariantIds: ['variant-l28-writing-routine', 'variant-l28-nagara-simultaneous', 'variant-l28-shi-reasons'],
        assetUses: [
            { assetId: 'asset-l28-writing-model', role: 'model', availability: 'optional-after-first-attempt' },
            { assetId: 'asset-l28-writing-rubric', role: 'rubric', availability: 'always' },
        ],
        responses: [
            {
                id: 'response-l28-write',
                kind: 'long-text',
                prompt: copy('Write your routine in Japanese.'),
                required: true,
                minimumCharacters: 40,
                recommendedCharacters: [70, 130],
                maximumCharacters: 240,
                reviewMode: 'self-review',
                modelAssetId: 'asset-l28-writing-model',
                rubricAssetId: 'asset-l28-writing-rubric',
            },
        ],
    },
    {
        id: 'activity-l28-reflect',
        kind: 'reflection',
        title: copy('How did that feel?', '今日はどうでしたか'),
        instructions: copy('No score. Just tell Rie-sensei where you are with ながら and し.'),
        estimatedMinutes: 2,
        outcomeIds: ['outcome-l28-use-nagara', 'outcome-l28-use-shi'],
        focusVariantIds: ['variant-l28-nagara-simultaneous', 'variant-l28-shi-reasons'],
        assetUses: [],
        responses: [
            {
                id: 'response-l28-reflect',
                kind: 'self-assessment',
                prompt: copy('Can you describe a "while" routine with a couple of reasons?'),
                required: true,
                options: [
                    { id: 'l28-r-notyet', label: copy('Not yet — I want the model next to me.') },
                    { id: 'l28-r-almost', label: copy('Almost — with a few notes.') },
                    { id: 'l28-r-ready', label: copy('Yes — I can do it on my own.') },
                ],
            },
        ],
    },
];

const l28Unit: CurriculumUnit = {
    id: 'unit-academy-ch28',
    kind: 'lesson',
    parentUnitId: 'unit-academy-term',
    title: copy('Lesson 28: two things at once', '第28課：二つのことを同時に'),
    summary: copy('The ramen counter before class. Do two things at once with ながら, and stack up reasons with し.'),
    level: 'Upper-beginner · Minna II ch.28',
    alignments: [
        {
            reference: 'Minna no Nihongo II, Lesson 28',
            relation: 'scope-alignment',
            note: copy('Topic and grammar-sequence reference only; every sentence, scene, and model here is original.'),
        },
    ],
};

const l28Placements: readonly CurriculumPlacement[] = l28Activities.map((activity, index) => ({
    id: `placement-l28-${index + 1}`,
    curriculumUnitId: 'unit-academy-ch28',
    activityId: activity.id,
    position: index + 1,
    requirement: 'core',
}));

const l28Graph: AcademyContentGraph = {
    schemaVersion: '1',
    concepts: l28Concepts,
    conceptVariants: l28Variants,
    outcomes: l28Outcomes,
    activities: l28Activities,
    assets: l28Assets,
    curriculumUnits: [l28Unit],
    placements: l28Placements,
};

/* =====================================================================
 * LESSON 29 — When things go a little wrong
 * (〜てしまいました / states with 〜ています / transitive vs intransitive)
 * Scene: a rough day — Tom's umbrella, Chestnut and the homework, and
 * Rie-sensei somehow working the midnight konbini till.
 * ===================================================================== */

const l29Concepts: readonly AcademyConcept[] = [
    {
        id: 'concept-l29-teshimau',
        domain: 'grammar',
        title: copy('〜てしまいました: oops, and done', '「〜てしまいました」：完了と後悔'),
        summary: copy('Use てしまいました for something finished — often with a little regret at a mistake.'),
    },
    {
        id: 'concept-l29-state',
        domain: 'grammar',
        title: copy('States with 〜ています', '状態の「〜ています」'),
        summary: copy('An intransitive verb plus ています describes the state left behind: the window is open, the light is on.'),
    },
    {
        id: 'concept-l29-jita',
        domain: 'grammar',
        title: copy('Transitive and intransitive pairs', '自動詞と他動詞'),
        summary: copy('Verb pairs like 開ける／開く let you say either "I opened it" or "it is open".'),
    },
    {
        id: 'concept-l29-scene',
        domain: 'listening',
        title: copy('Following a "bad day" story', '失敗の話を読み取る'),
        summary: copy('Catch what went wrong, and the kindness that follows.'),
    },
    {
        id: 'concept-l29-writing',
        domain: 'writing',
        title: copy('Writing a small blunder', '小さい失敗を書く'),
        summary: copy('Tell a short, warm story of a mistake using てしまいました and a state.'),
    },
    {
        id: 'concept-l29-kanji',
        domain: 'kanji',
        title: copy('Kanji: forgetting, failing, and bouncing back', '漢字：忘・失・敗・変・元'),
        summary: copy('Recognise 忘, 失, 敗, 変, and 元 in everyday words.'),
    },
];

const l29Variants: readonly ConceptVariant[] = [
    {
        id: 'variant-l29-teshimau-regret',
        conceptId: 'concept-l29-teshimau',
        label: copy('The "oh no" one', '後悔の「しまう」'),
        form: 'Vて ＋ しまいました (regret)',
        explanation: copy('Something went wrong and you feel it a little.'),
        example: copy('宿題を忘れてしまいました。', '宿題を忘れてしまいました。'),
    },
    {
        id: 'variant-l29-teshimau-complete',
        conceptId: 'concept-l29-teshimau',
        label: copy('The "all done" one', '完了の「しまう」'),
        form: 'Vて ＋ しまいました (completion)',
        explanation: copy('You finished something completely.'),
        example: copy('本を全部読んでしまいました。', '本を全部読んでしまいました。'),
    },
    {
        id: 'variant-l29-state-open',
        conceptId: 'concept-l29-state',
        label: copy('It is open', '開いています'),
        form: '[intransitive]ています',
        explanation: copy('Describes the state now, not the action of opening it.'),
        example: copy('窓が開いています。', '窓が開いています。'),
    },
    {
        id: 'variant-l29-state-light',
        conceptId: 'concept-l29-state',
        label: copy('It is on', 'ついています'),
        form: '[intransitive]ています',
        explanation: copy('The light is on — the state someone left it in.'),
        example: copy('電気がついています。', '電気がついています。'),
    },
    {
        id: 'variant-l29-jita-pair',
        conceptId: 'concept-l29-jita',
        label: copy('open / close pairs', '開ける・開く'),
        form: '他 [Xを開ける] ／ 自 [Xが開く]',
        explanation: copy('Transitive takes を and a doer; intransitive takes が and just happens.'),
        example: copy('ドアを閉めます。→ ドアが閉まっています。', 'ドアを閉めます。→ ドアが閉まっています。'),
    },
    {
        id: 'variant-l29-scene-gist',
        conceptId: 'concept-l29-scene',
        label: copy('What went wrong', '何が起きたか'),
        form: 'read → the mistakes, then the kindness',
        explanation: copy('Track each small disaster, then the warm turn at the end.'),
        example: copy('傘をなくして、先生に会いました。', '傘をなくして、先生に会いました。'),
    },
    {
        id: 'variant-l29-writing-blunder',
        conceptId: 'concept-l29-writing',
        label: copy('My little failure', 'わたしの失敗'),
        form: '[when] ＋ [Xを]てしまいました。＋ [Yが]ています。＋ [warm ending]',
        explanation: copy('A mistake, a lingering state, and a soft landing.'),
        example: copy('携帯を忘れてしまいました。かばんが開いていました。でも、友だちが助けてくれました。', '携帯を忘れてしまいました。かばんが開いていました。でも、友だちが助けてくれました。'),
    },
    {
        id: 'variant-l29-kanji-wasure',
        conceptId: 'concept-l29-kanji',
        label: copy('忘', '忘'),
        form: '忘（ぼう・わすれる）',
        explanation: copy('To forget.'),
        example: copy('忘れる', '忘れる'),
    },
    {
        id: 'variant-l29-kanji-shitsu',
        conceptId: 'concept-l29-kanji',
        label: copy('失', '失'),
        form: '失（しつ）',
        explanation: copy('To lose; a fault. Half of "failure".'),
        example: copy('失敗', '失敗'),
    },
    {
        id: 'variant-l29-kanji-hai',
        conceptId: 'concept-l29-kanji',
        label: copy('敗', '敗'),
        form: '敗（はい）',
        explanation: copy('Defeat; the other half of "failure".'),
        example: copy('失敗', '失敗'),
    },
    {
        id: 'variant-l29-kanji-hen',
        conceptId: 'concept-l29-kanji',
        label: copy('変', '変'),
        form: '変（へん）',
        explanation: copy('Strange; change. Lives in "tough / awful".'),
        example: copy('大変', '大変'),
    },
    {
        id: 'variant-l29-kanji-gen',
        conceptId: 'concept-l29-kanji',
        label: copy('元', '元'),
        form: '元（げん）',
        explanation: copy('Origin; energy. Lives in "cheerful / well".'),
        example: copy('元気', '元気'),
    },
];

const l29Outcomes: readonly LearningOutcome[] = [
    {
        id: 'outcome-l29-use-teshimau',
        statement: copy('I can say I did something by mistake, or finished it completely, with てしまいました.'),
        targetConceptIds: ['concept-l29-teshimau'],
        targetVariantIds: ['variant-l29-teshimau-regret', 'variant-l29-teshimau-complete'],
    },
    {
        id: 'outcome-l29-describe-state',
        statement: copy('I can describe the state something is left in using an intransitive verb plus ています.'),
        targetConceptIds: ['concept-l29-state', 'concept-l29-jita'],
        targetVariantIds: ['variant-l29-state-open', 'variant-l29-state-light', 'variant-l29-jita-pair'],
    },
    {
        id: 'outcome-l29-choose-jita',
        statement: copy('I can choose the transitive or intransitive verb that fits a sentence.'),
        targetConceptIds: ['concept-l29-jita'],
        targetVariantIds: ['variant-l29-jita-pair'],
    },
    {
        id: 'outcome-l29-read-scene',
        statement: copy('I can follow a short "bad day" story and confirm what happened.'),
        targetConceptIds: ['concept-l29-scene'],
        targetVariantIds: ['variant-l29-scene-gist'],
    },
    {
        id: 'outcome-l29-write-blunder',
        statement: copy('I can write a short, warm story of a small mistake.'),
        targetConceptIds: ['concept-l29-writing', 'concept-l29-teshimau', 'concept-l29-state'],
        targetVariantIds: ['variant-l29-writing-blunder', 'variant-l29-teshimau-regret', 'variant-l29-state-open'],
    },
    {
        id: 'outcome-l29-read-kanji',
        statement: copy('I can read 忘, 失, 敗, 変, and 元 in familiar words.'),
        targetConceptIds: ['concept-l29-kanji'],
        targetVariantIds: [
            'variant-l29-kanji-wasure',
            'variant-l29-kanji-shitsu',
            'variant-l29-kanji-hai',
            'variant-l29-kanji-hen',
            'variant-l29-kanji-gen',
        ],
    },
];

const l29Assets: readonly AcademyAsset[] = [
    {
        id: 'asset-l29-scene-audio',
        kind: 'audio',
        title: copy('A rough day: the scene', '大変な一日：場面'),
        locale: 'ja',
        locator: 'academy://audio/lesson-29/rough-day',
        durationSeconds: 46,
        rights: originalRights(),
    },
    {
        id: 'asset-l29-scene-transcript',
        kind: 'transcript',
        title: copy('A rough day: transcript', '大変な一日：スクリプト'),
        locale: 'ja',
        locator: 'academy://transcripts/lesson-29/rough-day',
        transcriptOfAssetId: 'asset-l29-scene-audio',
        body: [
            'きのうは、大変な一日でした。',
            '朝、電車の中で、傘を忘れてしまいました。',
            '教室に着いたら、宿題がありません。犬のクリが、食べてしまったんです。',
            '夜、コンビニに行きました。すると、りえ先生がレジにいます！',
            '「先生、どうしてここに…?」',
            '「ふふ、内緒よ。あ、電気がついているから、こっちへどうぞ。」',
            '先生は笑いました。大変な日でしたが、少し元気になりました。',
        ].join('\n'),
        rights: originalRights(),
    },
    {
        id: 'asset-l29-writing-model',
        kind: 'writing-model',
        title: copy('Model: my little failure', 'モデル：わたしの失敗'),
        locale: 'ja',
        locator: 'academy://models/lesson-29/my-little-failure',
        body: [
            '先週、小さい失敗をしてしまいました。',
            '朝、急いでいたので、家に携帯を忘れてしまいました。',
            '会社に着いたら、かばんが開いていて、書類が落ちていました。',
            '大変でしたが、友だちが手伝ってくれて、元気になりました。',
        ].join('\n'),
        rights: originalRights(),
    },
    {
        id: 'asset-l29-writing-rubric',
        kind: 'rubric',
        title: copy('Rubric: my little failure', 'ルーブリック：わたしの失敗'),
        locale: 'ja-en',
        locator: 'academy://rubrics/lesson-29/my-little-failure',
        criteria: [
            {
                id: 'criterion-l29-teshimau',
                label: copy('You use てしまいました for the mistake.'),
                levels: [
                    { score: 0, description: copy('No てしまいました, or it does not fit.') },
                    { score: 1, description: copy('One clear てしまいました.') },
                    { score: 2, description: copy('てしまいました carries the "oh no" feeling well.') },
                ],
            },
            {
                id: 'criterion-l29-state',
                label: copy('You describe a resulting state with 〜ています.'),
                levels: [
                    { score: 0, description: copy('No state described.') },
                    { score: 1, description: copy('A state is there but a little off.') },
                    { score: 2, description: copy('A natural intransitive state (開いています, etc.).') },
                ],
            },
            {
                id: 'criterion-l29-warmth',
                label: copy('The story lands somewhere warm.'),
                levels: [
                    { score: 0, description: copy('It just stops.') },
                    { score: 1, description: copy('A small resolution.') },
                    { score: 2, description: copy('A genuinely kind or funny ending.') },
                ],
            },
        ],
        rights: originalRights(),
    },
    {
        id: 'asset-l29-kanji-reference',
        kind: 'kanji-reference',
        title: copy('Lesson 29 kanji', '第29課の漢字'),
        locale: 'ja-en',
        locator: 'academy://references/lesson-29/kanji',
        entries: [
            { character: '忘', reading: 'わす', meaning: copy('to forget'), example: copy('忘れる (to forget)', '忘れる') },
            { character: '失', reading: 'しつ', meaning: copy('to lose; fault'), example: copy('失敗 (a failure)', '失敗') },
            { character: '敗', reading: 'はい', meaning: copy('defeat'), example: copy('失敗 (a failure)', '失敗') },
            { character: '変', reading: 'へん', meaning: copy('strange; change'), example: copy('大変 (tough; awful)', '大変') },
            { character: '元', reading: 'げん', meaning: copy('origin; energy'), example: copy('元気 (cheerful; well)', '元気') },
        ],
        rights: originalRights(),
    },
];

const l29Activities: readonly AcademyActivity[] = [
    {
        id: 'activity-l29-listen-scene',
        kind: 'listening',
        title: copy('Listen: a rough day', 'まず聞く：大変な一日'),
        instructions: copy('Read or listen through once. What went wrong — and how did the evening turn warm?'),
        estimatedMinutes: 7,
        outcomeIds: ['outcome-l29-read-scene'],
        focusVariantIds: ['variant-l29-scene-gist'],
        assetUses: [
            { assetId: 'asset-l29-scene-audio', role: 'audio', availability: 'always' },
            { assetId: 'asset-l29-scene-transcript', role: 'transcript', availability: 'optional-after-first-attempt' },
        ],
        responses: [
            {
                id: 'response-l29-listened',
                kind: 'none',
                prompt: copy('Read or listen once before the transcript.'),
                completionLabel: copy('I read it once through'),
                required: false,
            },
            {
                id: 'response-l29-gist',
                kind: 'select-one',
                prompt: copy('What kind of day was it?'),
                required: true,
                options: [
                    { id: 'l29-gist-rough', label: copy('A rough day of small mishaps that ends kindly.') },
                    { id: 'l29-gist-party', label: copy('A birthday party being planned in secret.') },
                    { id: 'l29-gist-trip', label: copy('A long-planned trip to Japan.') },
                ],
                correctOptionIds: ['l29-gist-rough'],
            },
            {
                id: 'response-l29-detail',
                kind: 'select-many',
                prompt: copy('Which things actually happen? Choose every true one.'),
                required: true,
                options: [
                    { id: 'l29-d-umbrella', label: copy('The umbrella is forgotten on the train.') },
                    { id: 'l29-d-dog', label: copy('Chestnut the dog eats the homework.') },
                    { id: 'l29-d-sensei', label: copy('Rie-sensei is working the konbini register.') },
                    { id: 'l29-d-perfect', label: copy('The homework was finished perfectly.') },
                ],
                correctOptionIds: ['l29-d-umbrella', 'l29-d-dog', 'l29-d-sensei'],
            },
        ],
    },
    {
        id: 'activity-l29-teshimau-choose',
        kind: 'grammar-practice',
        title: copy('Say "oh no" with てしまいました', '後悔の「てしまいました」'),
        instructions: copy('Which sentence expresses a mistake you regret?'),
        estimatedMinutes: 4,
        outcomeIds: ['outcome-l29-use-teshimau'],
        focusVariantIds: ['variant-l29-teshimau-regret'],
        assetUses: [],
        responses: [
            {
                id: 'response-l29-teshimau-choose',
                kind: 'select-one',
                prompt: copy('Choose the "I made a mistake" sentence.'),
                required: true,
                options: [
                    { id: 'l29-t-lost', label: copy('傘をなくしてしまいました。 (I went and lost my umbrella.)') },
                    { id: 'l29-t-will', label: copy('傘をなくすつもりです。 (I intend to lose my umbrella.)') },
                    { id: 'l29-t-can', label: copy('傘をなくすことができます。 (I am able to lose my umbrella.)') },
                ],
                correctOptionIds: ['l29-t-lost'],
            },
        ],
    },
    {
        id: 'activity-l29-state-match',
        kind: 'grammar-practice',
        title: copy('Action, then the state it leaves', '動作と、残った状態'),
        instructions: copy('Someone did something; now match it to the state that is left behind.'),
        estimatedMinutes: 5,
        outcomeIds: ['outcome-l29-describe-state'],
        focusVariantIds: ['variant-l29-state-open', 'variant-l29-jita-pair'],
        assetUses: [],
        responses: [
            {
                id: 'response-l29-state-match',
                kind: 'matching',
                prompt: copy('Match the action to its resulting state.'),
                required: true,
                pairs: [
                    { id: 'l29-s-window', left: copy('窓を開けました。'), right: copy('窓が開いています。') },
                    { id: 'l29-s-door', left: copy('ドアを閉めました。'), right: copy('ドアが閉まっています。') },
                    { id: 'l29-s-light', left: copy('電気をつけました。'), right: copy('電気がついています。') },
                ],
            },
        ],
    },
    {
        id: 'activity-l29-jita-choose',
        kind: 'grammar-practice',
        title: copy('Transitive or intransitive?', '自動詞か、他動詞か'),
        instructions: copy('Nobody is mentioned as the doer here — so which verb fits?'),
        estimatedMinutes: 4,
        outcomeIds: ['outcome-l29-choose-jita'],
        focusVariantIds: ['variant-l29-jita-pair'],
        assetUses: [],
        responses: [
            {
                id: 'response-l29-jita-choose',
                kind: 'select-one',
                prompt: copy('Fill the gap: 窓が ____ 。'),
                required: true,
                options: [
                    { id: 'l29-j-open-intr', label: copy('開いています (is open)') },
                    { id: 'l29-j-open-tr', label: copy('開けています (someone is opening it)') },
                    { id: 'l29-j-open-plain', label: copy('開きます (will open)') },
                ],
                correctOptionIds: ['l29-j-open-intr'],
            },
        ],
    },
    {
        id: 'activity-l29-teshimau-write',
        kind: 'grammar-practice',
        title: copy('Your own small mistake', 'あなたの小さい失敗'),
        instructions: copy('Write one sentence about a time you forgot or lost something, using てしまいました.'),
        estimatedMinutes: 5,
        outcomeIds: ['outcome-l29-use-teshimau'],
        focusVariantIds: ['variant-l29-teshimau-regret'],
        assetUses: [],
        responses: [
            {
                id: 'response-l29-teshimau-write',
                kind: 'short-text',
                prompt: copy('Write your sentence in Japanese, ending in しまいました.'),
                required: true,
                minimumCharacters: 12,
                maximumCharacters: 90,
                grading: { kind: 'contains', requiredFragments: ['しまい'] },
            },
        ],
    },
    {
        id: 'activity-l29-kanji',
        kind: 'kanji',
        title: copy('Lesson 29 kanji', '第29課の漢字'),
        instructions: copy('Use the reference. Match each kanji to a word, then order a sentence from the scene.'),
        estimatedMinutes: 7,
        outcomeIds: ['outcome-l29-read-kanji'],
        focusVariantIds: [
            'variant-l29-kanji-wasure',
            'variant-l29-kanji-shitsu',
            'variant-l29-kanji-hai',
            'variant-l29-kanji-hen',
            'variant-l29-kanji-gen',
        ],
        assetUses: [{ assetId: 'asset-l29-kanji-reference', role: 'reference', availability: 'always' }],
        responses: [
            {
                id: 'response-l29-kanji-match',
                kind: 'matching',
                prompt: copy('Match each kanji to a word it lives in.'),
                required: true,
                pairs: [
                    { id: 'l29-k-wasure', left: copy('忘'), right: copy('忘れる') },
                    { id: 'l29-k-shitsu', left: copy('失'), right: copy('失敗（の「失」）') },
                    { id: 'l29-k-hai', left: copy('敗'), right: copy('失敗（する）') },
                    { id: 'l29-k-hen', left: copy('変'), right: copy('大変') },
                    { id: 'l29-k-gen', left: copy('元'), right: copy('元気') },
                ],
            },
            {
                id: 'response-l29-kanji-order',
                kind: 'ordering',
                prompt: copy('Order the segments: "I forgot my umbrella on the train."'),
                required: true,
                items: [
                    { id: 'l29-ko-train', label: copy('電車の中で、') },
                    { id: 'l29-ko-umbrella', label: copy('傘を') },
                    { id: 'l29-ko-forgot', label: copy('忘れてしまいました。') },
                ],
                correctOrderIds: ['l29-ko-train', 'l29-ko-umbrella', 'l29-ko-forgot'],
            },
        ],
    },
    {
        id: 'activity-l29-write',
        kind: 'writing',
        title: copy('Write: わたしの失敗', '書く：わたしの失敗'),
        instructions: copy('Write 3–4 sentences about a small mistake. Use てしまいました and one 〜ています state, and land somewhere warm. Open the model after your first draft.'),
        estimatedMinutes: 14,
        outcomeIds: ['outcome-l29-write-blunder'],
        focusVariantIds: ['variant-l29-writing-blunder', 'variant-l29-teshimau-regret', 'variant-l29-state-open'],
        assetUses: [
            { assetId: 'asset-l29-writing-model', role: 'model', availability: 'optional-after-first-attempt' },
            { assetId: 'asset-l29-writing-rubric', role: 'rubric', availability: 'always' },
        ],
        responses: [
            {
                id: 'response-l29-write',
                kind: 'long-text',
                prompt: copy('Write your little failure in Japanese.'),
                required: true,
                minimumCharacters: 40,
                recommendedCharacters: [70, 140],
                maximumCharacters: 260,
                reviewMode: 'self-review',
                modelAssetId: 'asset-l29-writing-model',
                rubricAssetId: 'asset-l29-writing-rubric',
            },
        ],
    },
    {
        id: 'activity-l29-reflect',
        kind: 'reflection',
        title: copy('How did that feel?', '今日はどうでしたか'),
        instructions: copy('No score. Where are you with てしまいました and states?'),
        estimatedMinutes: 2,
        outcomeIds: ['outcome-l29-use-teshimau', 'outcome-l29-describe-state'],
        focusVariantIds: ['variant-l29-teshimau-regret', 'variant-l29-state-open'],
        assetUses: [],
        responses: [
            {
                id: 'response-l29-reflect',
                kind: 'self-assessment',
                prompt: copy('Can you tell a small mistake with てしまいました and a state?'),
                required: true,
                options: [
                    { id: 'l29-r-notyet', label: copy('Not yet — I want the model next to me.') },
                    { id: 'l29-r-almost', label: copy('Almost — with a few notes.') },
                    { id: 'l29-r-ready', label: copy('Yes — I can do it on my own.') },
                ],
            },
        ],
    },
];

const l29Unit: CurriculumUnit = {
    id: 'unit-academy-ch29',
    kind: 'lesson',
    parentUnitId: 'unit-academy-term',
    title: copy('Lesson 29: when things go a little wrong', '第29課：ちょっと失敗した日'),
    summary: copy('A rough day, told kindly. Say "oops" with てしまいました, and describe the state something is left in.'),
    level: 'Upper-beginner · Minna II ch.29',
    alignments: [
        {
            reference: 'Minna no Nihongo II, Lesson 29',
            relation: 'scope-alignment',
            note: copy('Topic and grammar-sequence reference only; every sentence, scene, and model here is original.'),
        },
    ],
};

const l29Placements: readonly CurriculumPlacement[] = l29Activities.map((activity, index) => ({
    id: `placement-l29-${index + 1}`,
    curriculumUnitId: 'unit-academy-ch29',
    activityId: activity.id,
    position: index + 1,
    requirement: 'core',
}));

const l29Graph: AcademyContentGraph = {
    schemaVersion: '1',
    concepts: l29Concepts,
    conceptVariants: l29Variants,
    outcomes: l29Outcomes,
    activities: l29Activities,
    assets: l29Assets,
    curriculumUnits: [l29Unit],
    placements: l29Placements,
};

/* =====================================================================
 * LESSON 30 — Getting ready (〜てあります / 〜ておきます / まだ〜ていません)
 * Scene: a surprise party for Jodi — Angel with her lists, Jenny knitting
 * a gift — and, quietly, someone's job offer waiting across the sea.
 * ===================================================================== */

const l30Concepts: readonly AcademyConcept[] = [
    {
        id: 'concept-l30-tearu',
        domain: 'grammar',
        title: copy('〜てあります: done, on purpose, still that way', '「〜てあります」：準備された状態'),
        summary: copy('Someone did something deliberately and the result is still there — the drinks are bought, the decorations are up.'),
    },
    {
        id: 'concept-l30-teoku',
        domain: 'grammar',
        title: copy('〜ておきます: do it in advance', '「〜ておきます」：前もってする'),
        summary: copy('Do something now to be ready later — buy the drinks ahead of the party.'),
    },
    {
        id: 'concept-l30-mada',
        domain: 'grammar',
        title: copy('まだ〜ていません: not yet', '「まだ〜ていません」'),
        summary: copy('Say a thing has not happened yet, without closing the door on it.'),
    },
    {
        id: 'concept-l30-scene',
        domain: 'listening',
        title: copy('Following a preparation scene', '準備の場面を読み取る'),
        summary: copy('Track what is ready, what is prepared in advance, and what is still to do.'),
    },
    {
        id: 'concept-l30-writing',
        domain: 'writing',
        title: copy('Writing a plan for something ahead', '先の予定を書く'),
        summary: copy('Write a short "getting ready" note using てあります, ておきます, and まだ〜ていません.'),
    },
    {
        id: 'concept-l30-kanji',
        domain: 'kanji',
        title: copy('Kanji: preparing, birthdays, practice', '漢字：準・備・誕・練・習'),
        summary: copy('Recognise 準, 備, 誕, 練, and 習 in everyday words.'),
    },
];

const l30Variants: readonly ConceptVariant[] = [
    {
        id: 'variant-l30-tearu-ready',
        conceptId: 'concept-l30-tearu',
        label: copy('Already taken care of', 'もう〜てあります'),
        form: '[Xが] Vて ＋ あります',
        explanation: copy('The result of a deliberate action is still there for you now.'),
        example: copy('飲み物は、もう買ってあります。', '飲み物は、もう買ってあります。'),
    },
    {
        id: 'variant-l30-tearu-decor',
        conceptId: 'concept-l30-tearu',
        label: copy('Set up on purpose', '飾ってあります'),
        form: '[Xに] Vて ＋ あります',
        explanation: copy('Someone arranged it intentionally, and it stays arranged.'),
        example: copy('部屋に、飾りがつけてあります。', '部屋に、飾りがつけてあります。'),
    },
    {
        id: 'variant-l30-teoku-prep',
        conceptId: 'concept-l30-teoku',
        label: copy('Do it ahead', '前もって〜ておく'),
        form: 'Vて ＋ おきます',
        explanation: copy('You do it now specifically so that later is easier.'),
        example: copy('パーティーの前に、飲み物を買っておきます。', 'パーティーの前に、飲み物を買っておきます。'),
    },
    {
        id: 'variant-l30-teoku-practice',
        conceptId: 'concept-l30-teoku',
        label: copy('Rehearse in advance', '練習しておく'),
        form: 'Vて ＋ おきます',
        explanation: copy('Prepare a skill or a line before you need it.'),
        example: copy('「おめでとう」を練習しておきましょう。', '「おめでとう」を練習しておきましょう。'),
    },
    {
        id: 'variant-l30-mada-notyet',
        conceptId: 'concept-l30-mada',
        label: copy('Not yet', 'まだ〜ていません'),
        form: 'まだ ＋ Vて ＋ いません',
        explanation: copy('Present-and-open: it has not happened, but it still might.'),
        example: copy('ケーキは、まだ注文していません。', 'ケーキは、まだ注文していません。'),
    },
    {
        id: 'variant-l30-scene-gist',
        conceptId: 'concept-l30-scene',
        label: copy('Ready / prepared / to-do', '準備の三つ'),
        form: 'read → what is done, prepared ahead, and left',
        explanation: copy('Sort the party prep into three piles as you read.'),
        example: copy('飲み物はある。ケーキはまだ。', '飲み物はある。ケーキはまだ。'),
    },
    {
        id: 'variant-l30-writing-plan',
        conceptId: 'concept-l30-writing',
        label: copy('A getting-ready note', '準備メモ'),
        form: '[Xは]てあります。＋ [Yを]ておきます。＋ [Zは]まだ〜ていません。',
        explanation: copy('One thing done, one thing prepared ahead, one thing still to do.'),
        example: copy('ホテルは予約してあります。切符は、まだ買っていません。', 'ホテルは予約してあります。切符は、まだ買っていません。'),
    },
    {
        id: 'variant-l30-kanji-jun',
        conceptId: 'concept-l30-kanji',
        label: copy('準', '準'),
        form: '準（じゅん）',
        explanation: copy('Semi-; standard. Half of "preparation".'),
        example: copy('準備', '準備'),
    },
    {
        id: 'variant-l30-kanji-bi',
        conceptId: 'concept-l30-kanji',
        label: copy('備', '備'),
        form: '備（び）',
        explanation: copy('To provide; equip. The other half of "preparation".'),
        example: copy('準備', '準備'),
    },
    {
        id: 'variant-l30-kanji-tan',
        conceptId: 'concept-l30-kanji',
        label: copy('誕', '誕'),
        form: '誕（たん）',
        explanation: copy('Birth — it only shows up in "birthday".'),
        example: copy('誕生日', '誕生日'),
    },
    {
        id: 'variant-l30-kanji-ren',
        conceptId: 'concept-l30-kanji',
        label: copy('練', '練'),
        form: '練（れん）',
        explanation: copy('To knead; drill. Half of "practice".'),
        example: copy('練習', '練習'),
    },
    {
        id: 'variant-l30-kanji-shuu',
        conceptId: 'concept-l30-kanji',
        label: copy('習', '習'),
        form: '習（しゅう・ならう）',
        explanation: copy('To learn; the other half of "practice".'),
        example: copy('練習', '練習'),
    },
];

const l30Outcomes: readonly LearningOutcome[] = [
    {
        id: 'outcome-l30-use-tearu',
        statement: copy('I can say something has been deliberately done and still is, with てあります.'),
        targetConceptIds: ['concept-l30-tearu'],
        targetVariantIds: ['variant-l30-tearu-ready', 'variant-l30-tearu-decor'],
    },
    {
        id: 'outcome-l30-use-teoku',
        statement: copy('I can say I do something in advance to be ready, with ておきます.'),
        targetConceptIds: ['concept-l30-teoku'],
        targetVariantIds: ['variant-l30-teoku-prep', 'variant-l30-teoku-practice'],
    },
    {
        id: 'outcome-l30-use-mada',
        statement: copy('I can say something has not happened yet with まだ〜ていません.'),
        targetConceptIds: ['concept-l30-mada'],
        targetVariantIds: ['variant-l30-mada-notyet'],
    },
    {
        id: 'outcome-l30-read-scene',
        statement: copy('I can follow a preparation scene and sort what is done, prepared, and still to do.'),
        targetConceptIds: ['concept-l30-scene'],
        targetVariantIds: ['variant-l30-scene-gist'],
    },
    {
        id: 'outcome-l30-write-plan',
        statement: copy('I can write a short getting-ready note using てあります, ておきます, and まだ〜ていません.'),
        targetConceptIds: ['concept-l30-writing', 'concept-l30-teoku', 'concept-l30-mada'],
        targetVariantIds: ['variant-l30-writing-plan', 'variant-l30-teoku-prep', 'variant-l30-mada-notyet'],
    },
    {
        id: 'outcome-l30-read-kanji',
        statement: copy('I can read 準, 備, 誕, 練, and 習 in familiar words.'),
        targetConceptIds: ['concept-l30-kanji'],
        targetVariantIds: [
            'variant-l30-kanji-jun',
            'variant-l30-kanji-bi',
            'variant-l30-kanji-tan',
            'variant-l30-kanji-ren',
            'variant-l30-kanji-shuu',
        ],
    },
];

const l30Assets: readonly AcademyAsset[] = [
    {
        id: 'asset-l30-scene-audio',
        kind: 'audio',
        title: copy('The surprise party: the scene', 'サプライズパーティー：場面'),
        locale: 'ja',
        locator: 'academy://audio/lesson-30/surprise-party',
        durationSeconds: 48,
        rights: originalRights(),
    },
    {
        id: 'asset-l30-scene-transcript',
        kind: 'transcript',
        title: copy('The surprise party: transcript', 'サプライズパーティー：スクリプト'),
        locale: 'ja',
        locator: 'academy://transcripts/lesson-30/surprise-party',
        transcriptOfAssetId: 'asset-l30-scene-audio',
        body: [
            '土曜日は、ジョディさんの誕生日パーティーです。',
            'アンジェルさんが、リストを作っておきました。',
            '「飲み物は、もう買ってあります。ケーキは、まだ注文していません。」',
            'ジェニーさんは、プレゼントのマフラーを編んでおきました。',
            '「みんなで『おめでとう』を言う練習を、しておきましょう。」',
            '部屋には、もう飾りがつけてあります。準備は、ほとんどできています。',
            'ジョディさんは、まだ何も知りません。楽しみですね。',
        ].join('\n'),
        rights: originalRights(),
    },
    {
        id: 'asset-l30-writing-model',
        kind: 'writing-model',
        title: copy('Model: getting ready for Japan', 'モデル：日本への準備'),
        locale: 'ja',
        locator: 'academy://models/lesson-30/getting-ready',
        body: [
            '来月、日本へ旅行するので、いろいろ準備しておきます。',
            'ホテルは、もう予約してあります。',
            '新しいかばんは買いましたが、切符は、まだ買っていません。',
            '友だちに会う前に、日本語をもう少し練習しておきます。',
        ].join('\n'),
        rights: originalRights(),
    },
    {
        id: 'asset-l30-writing-rubric',
        kind: 'rubric',
        title: copy('Rubric: a getting-ready note', 'ルーブリック：準備メモ'),
        locale: 'ja-en',
        locator: 'academy://rubrics/lesson-30/getting-ready',
        criteria: [
            {
                id: 'criterion-l30-tearu-teoku',
                label: copy('You use てあります or ておきます for what is ready or prepared.'),
                levels: [
                    { score: 0, description: copy('Neither form appears, or they do not fit.') },
                    { score: 1, description: copy('One form used clearly.') },
                    { score: 2, description: copy('Both "already done" and "prepared ahead" are clear.') },
                ],
            },
            {
                id: 'criterion-l30-mada',
                label: copy('You name one thing still to do with まだ〜ていません.'),
                levels: [
                    { score: 0, description: copy('No "not yet" line.') },
                    { score: 1, description: copy('A "not yet" idea, slightly off.') },
                    { score: 2, description: copy('A natural まだ〜ていません.') },
                ],
            },
            {
                id: 'criterion-l30-usable',
                label: copy('Someone could actually follow your plan.'),
                levels: [
                    { score: 0, description: copy('Hard to act on.') },
                    { score: 1, description: copy('Mostly followable.') },
                    { score: 2, description: copy('Clear, ordered, and ready to hand over.') },
                ],
            },
        ],
        rights: originalRights(),
    },
    {
        id: 'asset-l30-kanji-reference',
        kind: 'kanji-reference',
        title: copy('Lesson 30 kanji', '第30課の漢字'),
        locale: 'ja-en',
        locator: 'academy://references/lesson-30/kanji',
        entries: [
            { character: '準', reading: 'じゅん', meaning: copy('standard; semi-'), example: copy('準備 (preparation)', '準備') },
            { character: '備', reading: 'び', meaning: copy('to provide; equip'), example: copy('準備 (preparation)', '準備') },
            { character: '誕', reading: 'たん', meaning: copy('birth'), example: copy('誕生日 (birthday)', '誕生日') },
            { character: '練', reading: 'れん', meaning: copy('to drill; knead'), example: copy('練習 (practice)', '練習') },
            { character: '習', reading: 'しゅう', meaning: copy('to learn'), example: copy('練習 (practice)', '練習') },
        ],
        rights: originalRights(),
    },
];

const l30Activities: readonly AcademyActivity[] = [
    {
        id: 'activity-l30-listen-scene',
        kind: 'listening',
        title: copy('Listen: the surprise party', 'まず聞く：サプライズパーティー'),
        instructions: copy('Read or listen through once. What is ready, what is prepared ahead, and what is still to do?'),
        estimatedMinutes: 7,
        outcomeIds: ['outcome-l30-read-scene'],
        focusVariantIds: ['variant-l30-scene-gist'],
        assetUses: [
            { assetId: 'asset-l30-scene-audio', role: 'audio', availability: 'always' },
            { assetId: 'asset-l30-scene-transcript', role: 'transcript', availability: 'optional-after-first-attempt' },
        ],
        responses: [
            {
                id: 'response-l30-listened',
                kind: 'none',
                prompt: copy('Read or listen once before the transcript.'),
                completionLabel: copy('I read it once through'),
                required: false,
            },
            {
                id: 'response-l30-gist',
                kind: 'select-one',
                prompt: copy('What is the class doing?'),
                required: true,
                options: [
                    { id: 'l30-gist-party', label: copy('Secretly getting ready for Jodi\'s birthday party.') },
                    { id: 'l30-gist-exam', label: copy('Revising together for a big exam.') },
                    { id: 'l30-gist-ramen', label: copy('Deciding which ramen shop to try.') },
                ],
                correctOptionIds: ['l30-gist-party'],
            },
            {
                id: 'response-l30-detail',
                kind: 'select-many',
                prompt: copy('Which are true? Choose every one.'),
                required: true,
                options: [
                    { id: 'l30-d-list', label: copy('Angel made a list in advance.') },
                    { id: 'l30-d-drinks', label: copy('The drinks are already bought.') },
                    { id: 'l30-d-cake', label: copy('The cake has not been ordered yet.') },
                    { id: 'l30-d-knows', label: copy('Jodi already knows about the party.') },
                ],
                correctOptionIds: ['l30-d-list', 'l30-d-drinks', 'l30-d-cake'],
            },
        ],
    },
    {
        id: 'activity-l30-tearu-choose',
        kind: 'grammar-practice',
        title: copy('Already taken care of', 'もう〜てあります'),
        instructions: copy('Which sentence says the drinks were bought on purpose and are still there?'),
        estimatedMinutes: 4,
        outcomeIds: ['outcome-l30-use-tearu'],
        focusVariantIds: ['variant-l30-tearu-ready'],
        assetUses: [],
        responses: [
            {
                id: 'response-l30-tearu-choose',
                kind: 'select-one',
                prompt: copy('Choose the "already done, on purpose" sentence.'),
                required: true,
                options: [
                    { id: 'l30-te-arimasu', label: copy('飲み物は、買ってあります。 (The drinks are bought and ready.)') },
                    { id: 'l30-te-imasu', label: copy('飲み物を、買っています。 (I am buying drinks right now.)') },
                    { id: 'l30-te-mashou', label: copy('飲み物を、買いましょう。 (Let\'s buy drinks.)') },
                ],
                correctOptionIds: ['l30-te-arimasu'],
            },
        ],
    },
    {
        id: 'activity-l30-teoku-order',
        kind: 'grammar-practice',
        title: copy('Do it in advance', '前もって〜ておく'),
        instructions: copy('Order the pieces into a natural "let\'s do it ahead of time" sentence.'),
        estimatedMinutes: 4,
        outcomeIds: ['outcome-l30-use-teoku'],
        focusVariantIds: ['variant-l30-teoku-prep'],
        assetUses: [],
        responses: [
            {
                id: 'response-l30-teoku-order',
                kind: 'ordering',
                prompt: copy('Order: "Before the party, let\'s buy the drinks in advance."'),
                required: true,
                items: [
                    { id: 'l30-oo-before', label: copy('パーティーの前に、') },
                    { id: 'l30-oo-drinks', label: copy('飲み物を') },
                    { id: 'l30-oo-buy', label: copy('買っておきましょう。') },
                ],
                correctOrderIds: ['l30-oo-before', 'l30-oo-drinks', 'l30-oo-buy'],
            },
        ],
    },
    {
        id: 'activity-l30-mada-match',
        kind: 'grammar-practice',
        title: copy('Done, or not yet?', 'もう？まだ？'),
        instructions: copy('Match each question to its honest answer.'),
        estimatedMinutes: 5,
        outcomeIds: ['outcome-l30-use-mada'],
        focusVariantIds: ['variant-l30-mada-notyet'],
        assetUses: [],
        responses: [
            {
                id: 'response-l30-mada-match',
                kind: 'matching',
                prompt: copy('Match the question to the reply.'),
                required: true,
                pairs: [
                    { id: 'l30-m-cake', left: copy('ケーキは、もう注文しましたか。'), right: copy('いいえ、まだ注文していません。') },
                    { id: 'l30-m-drinks', left: copy('飲み物は、買いましたか。'), right: copy('はい、もう買ってあります。') },
                    { id: 'l30-m-decor', left: copy('飾りは、つけましたか。'), right: copy('はい、部屋につけてあります。') },
                ],
            },
        ],
    },
    {
        id: 'activity-l30-teoku-write',
        kind: 'grammar-practice',
        title: copy('One thing to prepare', '前もってすること'),
        instructions: copy('Name one thing you will do in advance for a plan of yours, using ておきます.'),
        estimatedMinutes: 5,
        outcomeIds: ['outcome-l30-use-teoku'],
        focusVariantIds: ['variant-l30-teoku-prep'],
        assetUses: [],
        responses: [
            {
                id: 'response-l30-teoku-write',
                kind: 'short-text',
                prompt: copy('Write your sentence in Japanese using ておきます.'),
                required: true,
                minimumCharacters: 12,
                maximumCharacters: 90,
                grading: { kind: 'contains', requiredFragments: ['ておき'] },
            },
        ],
    },
    {
        id: 'activity-l30-kanji',
        kind: 'kanji',
        title: copy('Lesson 30 kanji', '第30課の漢字'),
        instructions: copy('Use the reference. Match each kanji to a word, then order a line from the scene.'),
        estimatedMinutes: 7,
        outcomeIds: ['outcome-l30-read-kanji'],
        focusVariantIds: [
            'variant-l30-kanji-jun',
            'variant-l30-kanji-bi',
            'variant-l30-kanji-tan',
            'variant-l30-kanji-ren',
            'variant-l30-kanji-shuu',
        ],
        assetUses: [{ assetId: 'asset-l30-kanji-reference', role: 'reference', availability: 'always' }],
        responses: [
            {
                id: 'response-l30-kanji-match',
                kind: 'matching',
                prompt: copy('Match each kanji to a word it lives in.'),
                required: true,
                pairs: [
                    { id: 'l30-k-jun', left: copy('準'), right: copy('準備（の「準」）') },
                    { id: 'l30-k-bi', left: copy('備'), right: copy('準備（する）') },
                    { id: 'l30-k-tan', left: copy('誕'), right: copy('誕生日') },
                    { id: 'l30-k-ren', left: copy('練'), right: copy('練習（の「練」）') },
                    { id: 'l30-k-shuu', left: copy('習'), right: copy('練習（する）') },
                ],
            },
            {
                id: 'response-l30-kanji-order',
                kind: 'ordering',
                prompt: copy('Order: "The preparation is almost done."'),
                required: true,
                items: [
                    { id: 'l30-ko-prep', label: copy('準備は、') },
                    { id: 'l30-ko-almost', label: copy('ほとんど') },
                    { id: 'l30-ko-done', label: copy('できています。') },
                ],
                correctOrderIds: ['l30-ko-prep', 'l30-ko-almost', 'l30-ko-done'],
            },
        ],
    },
    {
        id: 'activity-l30-write',
        kind: 'writing',
        title: copy('Write: getting ready', '書く：準備のメモ'),
        instructions: copy('Write 3–4 sentences preparing for something ahead — a party, a trip. Use てあります, ておきます, and one まだ〜ていません. Open the model after your first draft.'),
        estimatedMinutes: 14,
        outcomeIds: ['outcome-l30-write-plan'],
        focusVariantIds: ['variant-l30-writing-plan', 'variant-l30-teoku-prep', 'variant-l30-mada-notyet'],
        assetUses: [
            { assetId: 'asset-l30-writing-model', role: 'model', availability: 'optional-after-first-attempt' },
            { assetId: 'asset-l30-writing-rubric', role: 'rubric', availability: 'always' },
        ],
        responses: [
            {
                id: 'response-l30-write',
                kind: 'long-text',
                prompt: copy('Write your getting-ready note in Japanese.'),
                required: true,
                minimumCharacters: 40,
                recommendedCharacters: [70, 140],
                maximumCharacters: 260,
                reviewMode: 'self-review',
                modelAssetId: 'asset-l30-writing-model',
                rubricAssetId: 'asset-l30-writing-rubric',
            },
        ],
    },
    {
        id: 'activity-l30-reflect',
        kind: 'reflection',
        title: copy('How did that feel?', '今日はどうでしたか'),
        instructions: copy('No score. Where are you with てあります, ておきます, and まだ?'),
        estimatedMinutes: 2,
        outcomeIds: ['outcome-l30-use-tearu', 'outcome-l30-use-teoku', 'outcome-l30-use-mada'],
        focusVariantIds: ['variant-l30-tearu-ready', 'variant-l30-teoku-prep', 'variant-l30-mada-notyet'],
        assetUses: [],
        responses: [
            {
                id: 'response-l30-reflect',
                kind: 'self-assessment',
                prompt: copy('Can you write a getting-ready note someone could follow?'),
                required: true,
                options: [
                    { id: 'l30-r-notyet', label: copy('Not yet — I want the model next to me.') },
                    { id: 'l30-r-almost', label: copy('Almost — with a few notes.') },
                    { id: 'l30-r-ready', label: copy('Yes — I can do it on my own.') },
                ],
            },
        ],
    },
];

const l30Unit: CurriculumUnit = {
    id: 'unit-academy-ch30',
    kind: 'lesson',
    parentUnitId: 'unit-academy-term',
    title: copy('Lesson 30: getting ready', '第30課：準備しておく'),
    summary: copy('A surprise party, quietly assembled. Say what is ready with てあります, what you prepare ahead with ておきます, and what is still to do.'),
    level: 'Upper-beginner · Minna II ch.30',
    alignments: [
        {
            reference: 'Minna no Nihongo II, Lesson 30',
            relation: 'scope-alignment',
            note: copy('Topic and grammar-sequence reference only; every sentence, scene, and model here is original.'),
        },
    ],
};

const l30Placements: readonly CurriculumPlacement[] = l30Activities.map((activity, index) => ({
    id: `placement-l30-${index + 1}`,
    curriculumUnitId: 'unit-academy-ch30',
    activityId: activity.id,
    position: index + 1,
    requirement: 'core',
}));

const l30Graph: AcademyContentGraph = {
    schemaVersion: '1',
    concepts: l30Concepts,
    conceptVariants: l30Variants,
    outcomes: l30Outcomes,
    activities: l30Activities,
    assets: l30Assets,
    curriculumUnits: [l30Unit],
    placements: l30Placements,
};

/* =====================================================================
 * The merged, mergeable graph
 * ===================================================================== */

/**
 * All three lessons plus the term programme, as one `AcademyContentGraph`.
 * Merge it into the base with:
 *
 *   mergeAcademyContentGraphs(academyContentGraph, lessonsContentGraph)
 *
 * The result passes `validateAcademyContentGraph`.
 */
export const lessonsContentGraph: AcademyContentGraph = mergeAcademyContentGraphs(
    programmeGraph,
    l28Graph,
    l29Graph,
    l30Graph,
);

/* =====================================================================
 * The warm teaching layer (one AcademyLesson per graph lesson unit)
 * ===================================================================== */

const LESSON_28: AcademyLesson = {
    id: 'lesson-28',
    chapter: 28,
    unitId: 'unit-academy-ch28',
    title: copy('Two things at once', '二つのことを同時に'),
    minnaReference: 'Minna no Nihongo II · Lesson 28',
    scene: {
        where: 'the ramen counter, twenty minutes before class',
        withCast: ['shin', 'aakash'],
        hook: 'Shin reads the menu like a picture book; Aakash has the city-pop already playing. There is exactly enough time for one bowl before the bell.',
    },
    recap:
        'Last term we learned to make plans and invite each other — a time, a place, a gentle ませんか. Tonight we do two things at once and start giving real reasons for what we love.',
    intro:
        "Two little joiners tonight, and both are things you already do in English without thinking. ながら is \"while\": one person, two actions, at the same time — and the action you actually care about goes second (\"while listening to music, I study\"). し is \"and what's more\": you stack up reasons — cheap, and tasty, and close to the station — until they add up to a feeling. That's it. We'll hear Shin and Aakash use both over a bowl of ramen, then you'll build your own.",
    comprehensibleInput: {
        title: copy('Ramen before class', '授業の前のラーメン'),
        lines: [
            { ja: 'シンさんとアーカシュさんは、授業の前にラーメンを食べます。', reading: 'シンさんとアーカシュさんは、じゅぎょうのまえにラーメンをたべます。', en: 'Shin and Aakash eat ramen before class.' },
            { ja: 'シンさんは、メニューを読みながら、漢字を教えてくれます。', reading: 'シンさんは、メニューをよみながら、かんじをおしえてくれます。', en: 'Shin teaches me kanji while reading the menu.', note: 'ながら — two things at once' },
            { ja: '「このお店は、安いし、おいしいし、駅から近いですよ。」', reading: '「このおみせは、やすいし、おいしいし、えきからちかいですよ。」', en: '"This place is cheap, and tasty, and close to the station."', note: 'し — reasons stacking up' },
            { ja: 'アーカシュさんは、ラーメンを食べながら、好きな音楽の話をします。', reading: 'アーカシュさんは、ラーメンをたべながら、すきなおんがくのはなしをします。', en: 'Aakash talks about his favourite music while eating.' },
            { ja: '「運転しながら、この曲をよく聞くんです。」', reading: '「うんてんしながら、このきょくをよくきくんです。」', en: '"I often listen to this song while driving."' },
            { ja: '二人は、笑いながら、教室へ歩きます。今日も、楽しい夜です。', reading: 'ふたりは、わらいながら、きょうしつへあるきます。きょうも、たのしいよるです。', en: 'The two of them walk to class, laughing. Another good evening.' },
        ],
        gloss: 'Two friends, one bowl each, everything happening at once — and every reason to be happy stacked up with し.',
    },
    grammar: [
        {
            form: 'Vます-stem ＋ ながら、[main clause]',
            nameJa: '「ながら」',
            heading: 'Doing two things at once',
            body: 'Drop the ます from a verb and add ながら to say you do that thing while doing another. One person, both actions. Keep the action you mainly mean for the second half.',
            examples: [
                { ja: '音楽を聞きながら、勉強します。', reading: 'おんがくをききながら、べんきょうします。', en: 'I study while listening to music.' },
                { ja: 'テレビを見ながら、ご飯を食べます。', reading: 'テレビをみながら、ごはんをたべます。', en: 'I eat while watching TV.' },
            ],
        },
        {
            form: '[plain]し、[plain]し、[feeling / decision]',
            nameJa: '「〜し、〜し」',
            heading: 'Stacking up reasons',
            body: 'し lists reasons with an "and on top of that" warmth. Use plain forms before it. Two or three し, and then the thing they add up to.',
            examples: [
                { ja: 'このラーメンは安いし、おいしいし、よく食べます。', reading: 'このラーメンはやすいし、おいしいし、よくたべます。', en: "This ramen is cheap and tasty, so I eat it a lot." },
                { ja: '今日は雨だし、疲れたし、家で休みます。', reading: 'きょうはあめだし、つかれたし、いえでやすみます。', en: "It's raining and I'm tired, so I'll rest at home." },
            ],
        },
    ],
    vocab: [
        { ja: '授業', reading: 'じゅぎょう', en: 'class, lesson', example: { ja: '授業の前に、ラーメンを食べます。', reading: 'じゅぎょうのまえに、ラーメンをたべます。', en: 'I eat ramen before class.' } },
        { ja: '運転（する）', reading: 'うんてん', en: 'driving; to drive', example: { ja: '運転しながら、歌います。', reading: 'うんてんしながら、うたいます。', en: 'I sing while driving.' } },
        { ja: '歌う', reading: 'うたう', en: 'to sing', example: { ja: 'シャワーを浴びながら、歌います。', reading: 'シャワーをあびながら、うたいます。', en: 'I sing while taking a shower.' } },
        { ja: '曲', reading: 'きょく', en: 'song, track', example: { ja: 'この曲が好きです。', reading: 'このきょくがすきです。', en: 'I like this song.' } },
        { ja: '勉強（する）', reading: 'べんきょう', en: 'study; to study', example: { ja: '音楽を聞きながら勉強します。', reading: 'おんがくをききながらべんきょうします。', en: 'I study while listening to music.' } },
        { ja: '疲れる', reading: 'つかれる', en: 'to get tired', example: { ja: '疲れたし、休みます。', reading: 'つかれたし、やすみます。', en: "I'm tired, so I'll rest." } },
    ],
    kanji: [
        { character: '歌', reading: 'うた', meaning: 'song; to sing', word: '歌う', wordReading: 'うたう' },
        { character: '運', reading: 'うん', meaning: 'to carry; luck', word: '運転', wordReading: 'うんてん' },
        { character: '転', reading: 'てん', meaning: 'to turn; roll', word: '運転', wordReading: 'うんてん' },
        { character: '勉', reading: 'べん', meaning: 'effort', word: '勉強', wordReading: 'べんきょう' },
        { character: '強', reading: 'きょう', meaning: 'strong', word: '勉強', wordReading: 'べんきょう' },
    ],
    grading: {
        hanamaru: 'はなまる！Both actions in one breath, reasons stacked up — Rie-sensei drew a big 花丸 on this one.',
        almost: 'So close. The pieces are right; just let the main action sit at the end, after ながら.',
        retry: "Have another go — think 'while X, I Y', and pile up your reasons with し, し.",
        senseiAside: 'Rie-sensei, in the margin: "I read this on the night bus and smiled. Now — the second bowl is on you."',
    },
    activityIds: l28Activities.map(activity => activity.id),
};

const LESSON_29: AcademyLesson = {
    id: 'lesson-29',
    chapter: 29,
    unitId: 'unit-academy-ch29',
    title: copy('When things go a little wrong', 'ちょっと失敗した日'),
    minnaReference: 'Minna no Nihongo II · Lesson 29',
    scene: {
        where: 'a whole rough day, ending at the midnight konbini',
        withCast: ['tom', 'rie'],
        hook: "Tom loses his umbrella, Chestnut eats the homework, and then — of all people — Rie-sensei is the one at the konbini till. She is delighted. She is exhausted. She is, as always, kind.",
    },
    recap:
        'Last time we did two things at once with ながら and gave reasons with し. Tonight we tell the small disasters — the forgotten, the lost — and describe the state they leave behind.',
    intro:
        "Everyone has these days, so let's learn to tell them. 〜てしまいました is the sound of 'oh no': you did something, it's done, and you feel it a little (\"I went and forgot my homework\"). The second piece is quieter but everywhere: an intransitive verb plus 〜ています describes a state — not the act of opening the window, but the window sitting open now (窓が開いています). That leans on verb pairs like 開ける／開く: one takes を and a doer, the other just happens. We'll follow one rough day, then you'll write your own — and land it somewhere warm, the way Rie always does.",
    comprehensibleInput: {
        title: copy('A rough day', '大変な一日'),
        lines: [
            { ja: 'きのうは、大変な一日でした。', reading: 'きのうは、たいへんないちにちでした。', en: 'Yesterday was a rough day.' },
            { ja: '朝、電車の中で、傘を忘れてしまいました。', reading: 'あさ、でんしゃのなかで、かさをわすれてしまいました。', en: 'In the morning, I went and left my umbrella on the train.', note: 'てしまいました — oops' },
            { ja: '教室に着いたら、宿題がありません。犬のクリが、食べてしまったんです。', reading: 'きょうしつについたら、しゅくだいがありません。いぬのクリが、たべてしまったんです。', en: 'When I got to class, no homework — Chestnut the dog had eaten it.' },
            { ja: '夜、コンビニに行きました。すると、りえ先生がレジにいます！', reading: 'よる、コンビニにいきました。すると、りえせんせいがレジにいます！', en: 'That night I went to the konbini. And there is Rie-sensei at the register!' },
            { ja: '「先生、どうしてここに…?」', reading: '「せんせい、どうしてここに…?」', en: '"Sensei, why are you here…?"' },
            { ja: '「ふふ、内緒よ。あ、電気がついているから、こっちへどうぞ。」', reading: '「ふふ、ないしょよ。あ、でんきがついているから、こっちへどうぞ。」', en: '"Hee — that\'s a secret. Oh, the light\'s on over here, come this way."', note: 'ついている — a state' },
            { ja: '先生は笑いました。大変な日でしたが、少し元気になりました。', reading: 'せんせいはわらいました。たいへんなひでしたが、すこしげんきになりました。', en: 'Sensei laughed. It had been a hard day, but I felt a little better.' },
        ],
        gloss: 'Everything that could go wrong did — and then the kindest person in the story turned up behind the till.',
    },
    grammar: [
        {
            form: 'Vて ＋ しまいました',
            nameJa: '「〜てしまいました」',
            heading: 'Oops — and done',
            body: 'Add しまいました to the て-form for two feelings that often overlap: you finished something completely, or (very often) you did something by mistake and feel it a little.',
            examples: [
                { ja: '宿題を忘れてしまいました。', reading: 'しゅくだいをわすれてしまいました。', en: 'I went and forgot my homework.' },
                { ja: '本を全部読んでしまいました。', reading: 'ほんをぜんぶよんでしまいました。', en: 'I finished reading the whole book.' },
            ],
        },
        {
            form: '[intransitive verb]ています  (窓が開いています)',
            nameJa: '状態の「〜ています」',
            heading: 'The state something is left in',
            body: 'With an intransitive verb, 〜ています describes how things are now, not an action in progress. Compare the pair: 窓を開けます (I open the window) leaves 窓が開いています (the window is open).',
            examples: [
                { ja: 'ドアが閉まっています。', reading: 'ドアがしまっています。', en: 'The door is closed.' },
                { ja: '電気がついています。', reading: 'でんきがついています。', en: 'The light is on.' },
            ],
        },
    ],
    vocab: [
        { ja: '大変（な）', reading: 'たいへん', en: 'tough, awful, a lot', example: { ja: '大変な一日でした。', reading: 'たいへんないちにちでした。', en: 'It was a rough day.' } },
        { ja: '忘れる', reading: 'わすれる', en: 'to forget', example: { ja: '傘を忘れてしまいました。', reading: 'かさをわすれてしまいました。', en: 'I went and forgot my umbrella.' } },
        { ja: '失敗（する）', reading: 'しっぱい', en: 'a failure; to mess up', example: { ja: '小さい失敗をしてしまいました。', reading: 'ちいさいしっぱいをしてしまいました。', en: 'I made a little mistake.' } },
        { ja: '開く', reading: 'あく', en: '(it) opens — intransitive', example: { ja: '窓が開いています。', reading: 'まどがあいています。', en: 'The window is open.' } },
        { ja: '閉まる', reading: 'しまる', en: '(it) closes — intransitive', example: { ja: 'ドアが閉まっています。', reading: 'ドアがしまっています。', en: 'The door is closed.' } },
        { ja: '元気（な）', reading: 'げんき', en: 'well, cheerful, full of energy', example: { ja: '少し元気になりました。', reading: 'すこしげんきになりました。', en: 'I felt a little better.' } },
    ],
    kanji: [
        { character: '忘', reading: 'わす', meaning: 'to forget', word: '忘れる', wordReading: 'わすれる' },
        { character: '失', reading: 'しつ', meaning: 'to lose; fault', word: '失敗', wordReading: 'しっぱい' },
        { character: '敗', reading: 'はい', meaning: 'defeat', word: '失敗', wordReading: 'しっぱい' },
        { character: '変', reading: 'へん', meaning: 'strange; change', word: '大変', wordReading: 'たいへん' },
        { character: '元', reading: 'げん', meaning: 'origin; energy', word: '元気', wordReading: 'げんき' },
    ],
    grading: {
        hanamaru: 'はなまる！A real mistake, a state left behind, and a soft landing — that is exactly the shape of the わたしの失敗 story. Big 花丸.',
        almost: 'Nearly. The てしまいました lands; now let the aftermath sit as a state — 開いています, not 開けました.',
        retry: "One more time — what went wrong (…てしまいました), and what was it like afterwards (…ています)?",
        senseiAside: 'Rie-sensei, in the margin: "We have all lost an umbrella. Mine is somewhere on the Northern line. Kind ending — well done."',
    },
    activityIds: l29Activities.map(activity => activity.id),
};

const LESSON_30: AcademyLesson = {
    id: 'lesson-30',
    chapter: 30,
    unitId: 'unit-academy-ch30',
    title: copy('Getting ready', '準備しておく'),
    minnaReference: 'Minna no Nihongo II · Lesson 30',
    scene: {
        where: 'a borrowed room, the night before Jodi\'s birthday',
        withCast: ['angel', 'jenny', 'jodi'],
        hook: 'Angel has a colour-coded list nobody asked for and everybody needed. Jenny has knitted a scarf. The drinks are in, the cake is not — and Jodi has no idea. (Somewhere in the group chat, a job offer in Japan is quietly waiting.)',
    },
    recap:
        'Last time we told the small disasters with てしまいました and described the states they left. Tonight we do the opposite: we get everything ready on purpose, and say plainly what is still to do.',
    intro:
        "Three ways to talk about being ready. 〜てあります is 'someone did this on purpose and it's still that way' — the drinks are bought, the decorations are up (飲み物は買ってあります). 〜ておきます is 'I'll do it in advance' — you act now so later is easy (前に飲み物を買っておきます). And まだ〜ていません is the honest 'not yet' that leaves the door open (ケーキはまだ注文していません). Put them together and you can hand your plan to anyone. We'll assemble a surprise party, then you'll write a getting-ready note of your own — a party, a trip, whatever's next.",
    comprehensibleInput: {
        title: copy('The surprise party', 'サプライズパーティー'),
        lines: [
            { ja: '土曜日は、ジョディさんの誕生日パーティーです。', reading: 'どようびは、ジョディさんのたんじょうびパーティーです。', en: "Saturday is Jodi's birthday party." },
            { ja: 'アンジェルさんが、リストを作っておきました。', reading: 'アンジェルさんが、リストをつくっておきました。', en: 'Angel made a list in advance.', note: 'ておきました — prepared ahead' },
            { ja: '「飲み物は、もう買ってあります。ケーキは、まだ注文していません。」', reading: '「のみものは、もうかってあります。ケーキは、まだちゅうもんしていません。」', en: '"The drinks are already bought. The cake hasn\'t been ordered yet."', note: 'てあります / まだ〜ていません' },
            { ja: 'ジェニーさんは、プレゼントのマフラーを編んでおきました。', reading: 'ジェニーさんは、プレゼントのマフラーをあんでおきました。', en: 'Jenny knitted a scarf as a present, ready in advance.' },
            { ja: '「みんなで『おめでとう』を言う練習を、しておきましょう。」', reading: '「みんなで『おめでとう』をいうれんしゅうを、しておきましょう。」', en: '"Let\'s practise saying \'congratulations\' together beforehand."' },
            { ja: '部屋には、もう飾りがつけてあります。準備は、ほとんどできています。', reading: 'へやには、もうかざりがつけてあります。じゅんびは、ほとんどできています。', en: 'The decorations are already up in the room. Preparation is almost done.' },
            { ja: 'ジョディさんは、まだ何も知りません。楽しみですね。', reading: 'ジョディさんは、まだなにもしりません。たのしみですね。', en: "Jodi doesn't know a thing yet. Can't wait." },
        ],
        gloss: 'One quiet room, one list, and a whole class getting everything ready for someone who has no idea.',
    },
    grammar: [
        {
            form: '[Xが] Vて ＋ あります',
            nameJa: '「〜てあります」',
            heading: 'Done on purpose, and still that way',
            body: 'てあります describes a state that resulted from a deliberate action — someone did it for a reason, and the result is here for you now. Often paired with もう (already).',
            examples: [
                { ja: '飲み物は、もう買ってあります。', reading: 'のみものは、もうかってあります。', en: 'The drinks are already bought.' },
                { ja: '部屋に、飾りがつけてあります。', reading: 'へやに、かざりがつけてあります。', en: 'The decorations are up in the room.' },
            ],
        },
        {
            form: 'Vて ＋ おきます  /  まだ ＋ Vて ＋ いません',
            nameJa: '「〜ておきます」／「まだ〜ていません」',
            heading: 'Prepare ahead, and name what\'s left',
            body: 'ておきます is doing something now so that later is ready. まだ〜ていません is the open "not yet" — it has not happened, but it still can. Together they make a plan you can hand over.',
            examples: [
                { ja: 'パーティーの前に、飲み物を買っておきます。', reading: 'パーティーのまえに、のみものをかっておきます。', en: "I'll buy the drinks ahead of the party." },
                { ja: 'ケーキは、まだ注文していません。', reading: 'ケーキは、まだちゅうもんしていません。', en: "The cake hasn't been ordered yet." },
            ],
        },
    ],
    vocab: [
        { ja: '準備（する）', reading: 'じゅんび', en: 'preparation; to prepare', example: { ja: '準備は、ほとんどできています。', reading: 'じゅんびは、ほとんどできています。', en: 'Preparation is almost done.' } },
        { ja: '誕生日', reading: 'たんじょうび', en: 'birthday', example: { ja: '土曜日は誕生日パーティーです。', reading: 'どようびはたんじょうびパーティーです。', en: 'Saturday is the birthday party.' } },
        { ja: '注文（する）', reading: 'ちゅうもん', en: 'an order; to order', example: { ja: 'ケーキを注文しておきます。', reading: 'ケーキをちゅうもんしておきます。', en: "I'll order the cake in advance." } },
        { ja: '飾り', reading: 'かざり', en: 'decoration', example: { ja: '飾りがつけてあります。', reading: 'かざりがつけてあります。', en: 'The decorations are up.' } },
        { ja: '練習（する）', reading: 'れんしゅう', en: 'practice; to practise', example: { ja: '練習しておきましょう。', reading: 'れんしゅうしておきましょう。', en: "Let's practise beforehand." } },
        { ja: '予約（する）', reading: 'よやく', en: 'reservation; to reserve', example: { ja: 'ホテルは予約してあります。', reading: 'ホテルはよやくしてあります。', en: 'The hotel is booked.' } },
    ],
    kanji: [
        { character: '準', reading: 'じゅん', meaning: 'standard; semi-', word: '準備', wordReading: 'じゅんび' },
        { character: '備', reading: 'び', meaning: 'to provide; equip', word: '準備', wordReading: 'じゅんび' },
        { character: '誕', reading: 'たん', meaning: 'birth', word: '誕生日', wordReading: 'たんじょうび' },
        { character: '練', reading: 'れん', meaning: 'to drill; knead', word: '練習', wordReading: 'れんしゅう' },
        { character: '習', reading: 'しゅう', meaning: 'to learn', word: '練習', wordReading: 'れんしゅう' },
    ],
    grading: {
        hanamaru: 'はなまる！Something ready, something prepared ahead, and one honest "not yet" — a plan anyone could pick up and finish. Big 花丸.',
        almost: 'Almost there. Watch the pair: 買ってあります (it is bought and ready) vs 買っておきます (I will buy it ahead). One more line of what is still to do.',
        retry: "Give it another go — one thing done (てあります), one thing you'll prepare (ておきます), one thing まだ.",
        senseiAside: 'Rie-sensei, in the margin: "Angel would approve of this list. Save me a slice of cake — I finish my konbini shift at eleven."',
    },
    activityIds: l30Activities.map(activity => activity.id),
};

/** The three lessons, in study order, with their warm teaching layer. */
export const ACADEMY_LESSONS: readonly AcademyLesson[] = [LESSON_28, LESSON_29, LESSON_30];

const LESSONS_BY_ID = new Map(ACADEMY_LESSONS.map(lesson => [lesson.id, lesson]));
const LESSONS_BY_UNIT = new Map(ACADEMY_LESSONS.map(lesson => [lesson.unitId, lesson]));

export function academyLessonById(id: string): AcademyLesson | undefined {
    return LESSONS_BY_ID.get(id);
}

/** Look up the warm teaching layer for a curriculum lesson unit id. */
export function academyLessonByUnitId(unitId: string): AcademyLesson | undefined {
    return LESSONS_BY_UNIT.get(unitId);
}
