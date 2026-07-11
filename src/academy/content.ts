export interface AcademyCopy {
    en: string;
    ja?: string;
}

export type ConceptDomain = 'listening' | 'grammar' | 'speaking' | 'writing' | 'kanji';

export interface AcademyConcept {
    id: string;
    domain: ConceptDomain;
    title: AcademyCopy;
    summary: AcademyCopy;
}

export interface ConceptVariant {
    id: string;
    conceptId: string;
    label: AcademyCopy;
    form: string;
    explanation: AcademyCopy;
    example: AcademyCopy;
}

export interface LearningOutcome {
    id: string;
    statement: AcademyCopy;
    targetConceptIds: readonly string[];
    targetVariantIds: readonly string[];
}

export type AssetKind = 'audio' | 'transcript' | 'writing-model' | 'rubric' | 'kanji-reference';
export type AssetRightsOrigin = 'original' | 'licensed' | 'open-license' | 'learner-contributed';
export type AssetRightsStatus = 'cleared' | 'pending' | 'restricted';
export type AssetPermittedUse = 'academy-web' | 'academy-offline' | 'assessment' | 'adaptation';

export interface AssetRights {
    origin: AssetRightsOrigin;
    status: AssetRightsStatus;
    rightsHolder: string;
    license: string;
    attribution: string;
    permittedUses: readonly AssetPermittedUse[];
    sourceUrl?: string;
}

interface AcademyAssetBase {
    id: string;
    kind: AssetKind;
    title: AcademyCopy;
    locale: 'ja' | 'en' | 'ja-en';
    locator: string;
    rights: AssetRights;
}

export interface AudioAsset extends AcademyAssetBase {
    kind: 'audio';
    durationSeconds: number;
}

export interface TranscriptAsset extends AcademyAssetBase {
    kind: 'transcript';
    transcriptOfAssetId: string;
    body: string;
}

export interface WritingModelAsset extends AcademyAssetBase {
    kind: 'writing-model';
    body: string;
}

export interface RubricLevel {
    score: number;
    description: AcademyCopy;
}

export interface RubricCriterion {
    id: string;
    label: AcademyCopy;
    levels: readonly RubricLevel[];
}

export interface RubricAsset extends AcademyAssetBase {
    kind: 'rubric';
    criteria: readonly RubricCriterion[];
}

export interface KanjiReferenceEntry {
    character: string;
    reading: string;
    meaning: AcademyCopy;
    example: AcademyCopy;
}

export interface KanjiReferenceAsset extends AcademyAssetBase {
    kind: 'kanji-reference';
    entries: readonly KanjiReferenceEntry[];
}

export type AcademyAsset = AudioAsset | TranscriptAsset | WritingModelAsset | RubricAsset | KanjiReferenceAsset;

export type ActivityKind = 'listening' | 'grammar-practice' | 'speaking' | 'writing' | 'kanji' | 'reflection';
export type ActivityAssetRole = 'audio' | 'transcript' | 'model' | 'rubric' | 'reference';
export type AssetAvailability = 'always' | 'optional' | 'optional-after-first-attempt';

export interface ActivityAssetUse {
    assetId: string;
    role: ActivityAssetRole;
    availability: AssetAvailability;
}

export const academyResponseKinds = [
    'none',
    'select-one',
    'select-many',
    'short-text',
    'long-text',
    'recording',
    'matching',
    'ordering',
    'self-assessment',
] as const;

export type AcademyResponseKind = (typeof academyResponseKinds)[number];

interface ActivityResponseBase {
    id: string;
    kind: AcademyResponseKind;
    prompt: AcademyCopy;
    required: boolean;
}

export interface NoResponse extends ActivityResponseBase {
    kind: 'none';
    completionLabel: AcademyCopy;
}

export interface ChoiceOption {
    id: string;
    label: AcademyCopy;
}

export interface SelectOneResponse extends ActivityResponseBase {
    kind: 'select-one';
    options: readonly ChoiceOption[];
    correctOptionIds: readonly string[];
}

export interface SelectManyResponse extends ActivityResponseBase {
    kind: 'select-many';
    options: readonly ChoiceOption[];
    correctOptionIds: readonly string[];
}

export type ShortTextGrading =
    | {
        kind: 'manual';
    }
    | {
        kind: 'contains';
        requiredFragments: readonly string[];
    }
    | {
        kind: 'exact';
        acceptedAnswers: readonly string[];
    };

export interface ShortTextResponse extends ActivityResponseBase {
    kind: 'short-text';
    minimumCharacters: number;
    maximumCharacters: number;
    grading: ShortTextGrading;
}

export interface LongTextResponse extends ActivityResponseBase {
    kind: 'long-text';
    minimumCharacters: number;
    recommendedCharacters: readonly [number, number];
    maximumCharacters: number;
    reviewMode: 'self-review' | 'teacher-review';
    modelAssetId?: string;
    rubricAssetId?: string;
}

export interface RecordingResponse extends ActivityResponseBase {
    kind: 'recording';
    minimumSeconds: number;
    maximumSeconds: number;
}

export interface MatchingPair {
    id: string;
    left: AcademyCopy;
    right: AcademyCopy;
}

export interface MatchingResponse extends ActivityResponseBase {
    kind: 'matching';
    pairs: readonly MatchingPair[];
}

export interface OrderingItem {
    id: string;
    label: AcademyCopy;
}

export interface OrderingResponse extends ActivityResponseBase {
    kind: 'ordering';
    items: readonly OrderingItem[];
    correctOrderIds: readonly string[];
}

export interface SelfAssessmentOption {
    id: string;
    label: AcademyCopy;
}

export interface SelfAssessmentResponse extends ActivityResponseBase {
    kind: 'self-assessment';
    options: readonly SelfAssessmentOption[];
}

export type ActivityResponse =
    | NoResponse
    | SelectOneResponse
    | SelectManyResponse
    | ShortTextResponse
    | LongTextResponse
    | RecordingResponse
    | MatchingResponse
    | OrderingResponse
    | SelfAssessmentResponse;

export type ActivityResponseSubmission =
    | {
        responseId: string;
        kind: 'none';
    }
    | {
        responseId: string;
        kind: 'select-one';
        selectedOptionId: string | null;
    }
    | {
        responseId: string;
        kind: 'select-many';
        selectedOptionIds: readonly string[];
    }
    | {
        responseId: string;
        kind: 'short-text' | 'long-text';
        text: string;
    }
    | {
        responseId: string;
        kind: 'recording';
        recordingLocator: string;
        durationSeconds: number;
    }
    | {
        responseId: string;
        kind: 'matching';
        matches: Readonly<Record<string, string>>;
    }
    | {
        responseId: string;
        kind: 'ordering';
        orderedItemIds: readonly string[];
    }
    | {
        responseId: string;
        kind: 'self-assessment';
        selectedOptionId: string | null;
    };

export interface AcademyActivity {
    id: string;
    kind: ActivityKind;
    title: AcademyCopy;
    instructions: AcademyCopy;
    estimatedMinutes: number;
    outcomeIds: readonly string[];
    focusVariantIds: readonly string[];
    assetUses: readonly ActivityAssetUse[];
    responses: readonly ActivityResponse[];
}

export type CurriculumUnitKind = 'programme' | 'lesson' | 'strand';
export type CurriculumAlignmentRelation = 'scope-alignment' | 'sequence-alignment';

export interface CurriculumAlignment {
    reference: string;
    relation: CurriculumAlignmentRelation;
    note: AcademyCopy;
}

export interface CurriculumUnit {
    id: string;
    kind: CurriculumUnitKind;
    title: AcademyCopy;
    summary: AcademyCopy;
    level: string;
    parentUnitId?: string;
    alignments?: readonly CurriculumAlignment[];
}

export type PlacementRequirement = 'core' | 'extension';

export interface CurriculumPlacement {
    id: string;
    curriculumUnitId: string;
    activityId: string;
    position: number;
    requirement: PlacementRequirement;
}

export interface AcademyContentGraph {
    schemaVersion: '1';
    concepts: readonly AcademyConcept[];
    conceptVariants: readonly ConceptVariant[];
    outcomes: readonly LearningOutcome[];
    activities: readonly AcademyActivity[];
    assets: readonly AcademyAsset[];
    curriculumUnits: readonly CurriculumUnit[];
    placements: readonly CurriculumPlacement[];
}

export interface ResolvedActivityAsset {
    use: ActivityAssetUse;
    asset: AcademyAsset;
}

export interface ResolvedCurriculumPlacement {
    placement: CurriculumPlacement;
    activity: AcademyActivity;
}

export type ContentValidationCode =
    | 'blank-field'
    | 'duplicate-id'
    | 'duplicate-placement'
    | 'invalid-asset'
    | 'invalid-relationship'
    | 'invalid-response'
    | 'unknown-reference';

export interface ContentValidationIssue {
    code: ContentValidationCode;
    path: string;
    message: string;
}

const originalYomuRights = (): AssetRights => ({
    origin: 'original',
    status: 'cleared',
    rightsHolder: 'Yomu Academy',
    license: 'All rights reserved',
    attribution: 'Original Yomu Academy material.',
    permittedUses: ['academy-web', 'academy-offline', 'assessment', 'adaptation'],
});

const copy = (en: string, ja?: string): AcademyCopy => ja ? { en, ja } : { en };

export const academyContentGraph = {
    schemaVersion: '1',
    concepts: [
        {
            id: 'concept-listening-gist-detail',
            domain: 'listening',
            title: copy('Listening for gist and detail', '大意と詳細を聞き取る'),
            summary: copy('Build a plausible first understanding, then confirm actions and conditions on a replay.'),
        },
        {
            id: 'concept-nara-suggestions',
            domain: 'grammar',
            title: copy('なら for a practical suggestion', '提案の「なら」'),
            summary: copy('Use a stated situation as the basis for a useful next-step suggestion.'),
        },
        {
            id: 'concept-polite-negative-question',
            domain: 'grammar',
            title: copy('Polite negative availability questions', '丁寧な「ありませんか」の質問'),
            summary: copy('Use ありませんか to ask gently whether something is available for a shared plan.'),
        },
        {
            id: 'concept-purpose-youni',
            domain: 'grammar',
            title: copy('Purpose with ように and ないように', '目的の「ように／ないように」'),
            summary: copy('Describe an action that enables a result or prevents an unwanted result.'),
        },
        {
            id: 'concept-solo-dialogue-adaptation',
            domain: 'speaking',
            title: copy('Solo dialogue adaptation', '一人用の会話アダプテーション'),
            summary: copy('Turn a two-person planning exchange into lines you can say and record independently.'),
        },
        {
            id: 'concept-extended-writing',
            domain: 'writing',
            title: copy('Extended practical writing', '実用的な長文ライティング'),
            summary: copy('Write a clear shared-plan message with a purpose, suggestion, and contingency.'),
        },
        {
            id: 'concept-kanji-set-7',
            domain: 'kanji',
            title: copy('Kanji 7: food, fields, halves, and size', '漢字7：肉・料・理・野・半・大・小'),
            summary: copy('Recognise and use 肉, 料, 理, 野, 半, 大, and 小 in a meaningful planning context.'),
        },
    ],
    conceptVariants: [
        {
            id: 'variant-listening-gist-before-transcript',
            conceptId: 'concept-listening-gist-detail',
            label: copy('Gist before support', '支援の前に大意を取る'),
            form: 'first listen -> likely setting and purpose',
            explanation: copy('Commit to a broad interpretation before reading supporting text.'),
            example: copy('Ask yourself: who is talking, and what do they want to do?'),
        },
        {
            id: 'variant-listening-detail-after-replay',
            conceptId: 'concept-listening-gist-detail',
            label: copy('Detail on replay', '聞き直して詳細を取る'),
            form: 'replay -> actions, quantities, and contingency',
            explanation: copy('Use a second listen to verify what each person will do and what changes if it rains.'),
            example: copy('Listen for the time, what each person will take, and the backup plan.'),
        },
        {
            id: 'variant-nara-suggestion',
            conceptId: 'concept-nara-suggestions',
            label: copy('Situation plus proposal', '状況と提案'),
            form: 'condition + なら、proposalませんか',
            explanation: copy('Treat the condition as shared context, then offer a considerate next action.'),
            example: copy('雨なら、駅の中のカフェに変えませんか。', '雨なら、駅の中のカフェに変えませんか。'),
        },
        {
            id: 'variant-arimasenka-polite-question',
            conceptId: 'concept-polite-negative-question',
            label: copy('Availability question with ありませんか', '「ありませんか」で尋ねる'),
            form: 'noun + は ありませんか',
            explanation: copy('The negative form gently asks whether a needed option is available.'),
            example: copy('野菜の料理はありませんか。', '野菜の料理はありませんか。'),
        },
        {
            id: 'variant-youni-enabling-purpose',
            conceptId: 'concept-purpose-youni',
            label: copy('Enable a result', 'できるように'),
            form: 'result + ように、action',
            explanation: copy('Use ように when the action is intended to make a result possible.'),
            example: copy('みんなが場所を見つけられるように、写真を送ります。', 'みんなが場所を見つけられるように、写真を送ります。'),
        },
        {
            id: 'variant-nai-youni-preventing-purpose',
            conceptId: 'concept-purpose-youni',
            label: copy('Prevent an unwanted result', 'ないように'),
            form: 'negative result + ないように、action',
            explanation: copy('Use ないように when the action aims to prevent a problem.'),
            example: copy('道に迷わないように、小さい地図を作ります。', '道に迷わないように、小さい地図を作ります。'),
        },
        {
            id: 'variant-kanji-niku',
            conceptId: 'concept-kanji-set-7',
            label: copy('肉', '肉'),
            form: '肉（にく）',
            explanation: copy('Recognise meat in food and meal-planning vocabulary.'),
            example: copy('肉料理', '肉料理'),
        },
        {
            id: 'variant-kanji-ryou',
            conceptId: 'concept-kanji-set-7',
            label: copy('料', '料'),
            form: '料（りょう）',
            explanation: copy('Recognise the material or fee kanji in common compounds.'),
            example: copy('料理', '料理'),
        },
        {
            id: 'variant-kanji-ri',
            conceptId: 'concept-kanji-set-7',
            label: copy('理', '理'),
            form: '理（り）',
            explanation: copy('Recognise reason or logic in familiar compounds.'),
            example: copy('料理', '料理'),
        },
        {
            id: 'variant-kanji-ya',
            conceptId: 'concept-kanji-set-7',
            label: copy('野', '野'),
            form: '野（や）',
            explanation: copy('Recognise fields and vegetables in everyday words.'),
            example: copy('野菜', '野菜'),
        },
        {
            id: 'variant-kanji-han',
            conceptId: 'concept-kanji-set-7',
            label: copy('半', '半'),
            form: '半（はん）',
            explanation: copy('Recognise half and halfway in quantities and timing.'),
            example: copy('半分', '半分'),
        },
        {
            id: 'variant-kanji-dai',
            conceptId: 'concept-kanji-set-7',
            label: copy('大', '大'),
            form: '大（だい・おお）',
            explanation: copy('Recognise large and major in descriptive language.'),
            example: copy('大きい', '大きい'),
        },
        {
            id: 'variant-kanji-shou',
            conceptId: 'concept-kanji-set-7',
            label: copy('小', '小'),
            form: '小（しょう・ちい）',
            explanation: copy('Recognise small and minor in descriptive language.'),
            example: copy('小さい', '小さい'),
        },
    ],
    outcomes: [
        {
            id: 'outcome-listen-for-gist',
            statement: copy('I can identify the setting and overall plan in a short conversation before reading a transcript.'),
            targetConceptIds: ['concept-listening-gist-detail'],
            targetVariantIds: ['variant-listening-gist-before-transcript'],
        },
        {
            id: 'outcome-listen-for-detail',
            statement: copy('I can confirm specific arrangements and a contingency after replaying a short conversation.'),
            targetConceptIds: ['concept-listening-gist-detail'],
            targetVariantIds: ['variant-listening-detail-after-replay'],
        },
        {
            id: 'outcome-suggest-with-nara',
            statement: copy('I can make a considerate suggestion from a stated situation using なら.'),
            targetConceptIds: ['concept-nara-suggestions'],
            targetVariantIds: ['variant-nara-suggestion'],
        },
        {
            id: 'outcome-ask-with-arimasenka',
            statement: copy('I can use ありませんか to ask politely whether a useful option is available.'),
            targetConceptIds: ['concept-polite-negative-question'],
            targetVariantIds: ['variant-arimasenka-polite-question'],
        },
        {
            id: 'outcome-express-purpose-youni',
            statement: copy('I can state why an action helps something happen or stops a problem using ように or ないように.'),
            targetConceptIds: ['concept-purpose-youni'],
            targetVariantIds: ['variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
        },
        {
            id: 'outcome-adapt-dialogue-solo',
            statement: copy('I can adapt useful planning language into a short independent spoken response.'),
            targetConceptIds: ['concept-solo-dialogue-adaptation', 'concept-nara-suggestions', 'concept-polite-negative-question', 'concept-purpose-youni'],
            targetVariantIds: ['variant-nara-suggestion', 'variant-arimasenka-polite-question', 'variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
        },
        {
            id: 'outcome-write-shared-plan',
            statement: copy('I can write a practical message that proposes a plan, explains a purpose, and includes a fallback.'),
            targetConceptIds: ['concept-extended-writing', 'concept-nara-suggestions', 'concept-polite-negative-question', 'concept-purpose-youni'],
            targetVariantIds: ['variant-nara-suggestion', 'variant-arimasenka-polite-question', 'variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
        },
        {
            id: 'outcome-recognise-kanji-7',
            statement: copy('I can recognise and use 肉, 料, 理, 野, 半, 大, and 小 in familiar words.'),
            targetConceptIds: ['concept-kanji-set-7'],
            targetVariantIds: ['variant-kanji-niku', 'variant-kanji-ryou', 'variant-kanji-ri', 'variant-kanji-ya', 'variant-kanji-han', 'variant-kanji-dai', 'variant-kanji-shou'],
        },
    ],
    assets: [
        {
            id: 'asset-weekend-plan-audio',
            kind: 'audio',
            title: copy('Weekend plan: original dialogue', '週末の予定：オリジナル会話'),
            locale: 'ja',
            locator: 'academy://audio/level-3-plus/lesson-09-weekend-plan',
            durationSeconds: 35,
            rights: originalYomuRights(),
        },
        {
            id: 'asset-weekend-plan-transcript',
            kind: 'transcript',
            title: copy('Weekend plan: optional transcript', '週末の予定：任意のスクリプト'),
            locale: 'ja-en',
            locator: 'academy://transcripts/level-3-plus/lesson-09-weekend-plan',
            transcriptOfAssetId: 'asset-weekend-plan-audio',
            body: [
                'ユウ: 日曜日に川の近くで昼ごはんを食べるなら、十時に駅で会いませんか。',
                'マイ: いいですね。野菜の料理はありませんか。',
                'ユウ: あります。肉だけでなく、野菜の料理も半分ぐらい持って行きましょう。',
                'ユウ: そうしましょう。みんなが場所を見つけられるように、大きい案内板の写真を送ります。',
                'マイ: 私は道に迷わないように、小さい地図も作ります。',
                'ユウ: ありがとう。雨なら、駅の中のカフェに変えませんか。',
            ].join('\n'),
            rights: originalYomuRights(),
        },
        {
            id: 'asset-weekend-plan-writing-model',
            kind: 'writing-model',
            title: copy('Model: shared lunch plan', 'モデル：昼ごはんの計画'),
            locale: 'ja-en',
            locator: 'academy://models/level-3-plus/lesson-09-shared-lunch-plan',
            body: [
                '日曜日に川の近くで昼ごはんを食べるなら、十一時に北口で会いませんか。',
                'みんなが迷わないように、駅から川までの写真を送ります。',
                '肉が苦手な人もいるので、野菜の料理はありませんか。あれば、半分ぐらい用意します。',
                '雨なら、近くの図書館のカフェに変えませんか。',
            ].join('\n'),
            rights: originalYomuRights(),
        },
        {
            id: 'asset-weekend-plan-writing-rubric',
            kind: 'rubric',
            title: copy('Rubric: practical shared-plan message', 'ルーブリック：実用的な計画メッセージ'),
            locale: 'ja-en',
            locator: 'academy://rubrics/level-3-plus/lesson-09-shared-lunch-plan',
            criteria: [
                {
                    id: 'criterion-plan',
                    label: copy('A reader can identify the time, place, and proposed activity.'),
                    levels: [
                        { score: 0, description: copy('The plan is missing or unclear.') },
                        { score: 1, description: copy('Some practical details are clear.') },
                        { score: 2, description: copy('Time, place, and activity are all clear.') },
                    ],
                },
                {
                    id: 'criterion-grammar',
                    label: copy('The message uses a suggestion and a purpose or prevention statement accurately.'),
                    levels: [
                        { score: 0, description: copy('The target forms are absent or obscure meaning.') },
                        { score: 1, description: copy('One target form works clearly.') },
                        { score: 2, description: copy('A suggestion and a ように or ないように purpose both work clearly.') },
                    ],
                },
                {
                    id: 'criterion-reader-care',
                    label: copy('The message helps another person act on the plan.'),
                    levels: [
                        { score: 0, description: copy('The reader cannot easily act on the message.') },
                        { score: 1, description: copy('The message offers one useful support or fallback.') },
                        { score: 2, description: copy('The message includes a useful support and a clear fallback.') },
                    ],
                },
            ],
            rights: originalYomuRights(),
        },
        {
            id: 'asset-kanji-7-reference',
            kind: 'kanji-reference',
            title: copy('Kanji 7 reference', '漢字7リファレンス'),
            locale: 'ja-en',
            locator: 'academy://references/level-3-plus/kanji-7',
            entries: [
                { character: '肉', reading: 'にく', meaning: copy('meat'), example: copy('肉料理 (meat dish)', '肉料理') },
                { character: '料', reading: 'りょう', meaning: copy('material; fee'), example: copy('料理 (cooking; dish)', '料理') },
                { character: '理', reading: 'り', meaning: copy('reason; logic'), example: copy('料理 (cooking; dish)', '料理') },
                { character: '野', reading: 'や', meaning: copy('field; wild'), example: copy('野菜 (vegetables)', '野菜') },
                { character: '半', reading: 'はん', meaning: copy('half'), example: copy('半分 (half)', '半分') },
                { character: '大', reading: 'おお', meaning: copy('large'), example: copy('大きい (large)', '大きい') },
                { character: '小', reading: 'ちい', meaning: copy('small'), example: copy('小さい (small)', '小さい') },
            ],
            rights: originalYomuRights(),
        },
    ],
    activities: [
        {
            id: 'activity-listen-weekend-plan',
            kind: 'listening',
            title: copy('Listen first: a weekend plan', 'まず聞く：週末の予定'),
            instructions: copy('Listen twice without text. Choose the main idea, then identify the details you can confirm. Open the transcript only after your first attempt.'),
            estimatedMinutes: 8,
            outcomeIds: ['outcome-listen-for-gist', 'outcome-listen-for-detail'],
            focusVariantIds: ['variant-listening-gist-before-transcript', 'variant-listening-detail-after-replay'],
            assetUses: [
                { assetId: 'asset-weekend-plan-audio', role: 'audio', availability: 'always' },
                { assetId: 'asset-weekend-plan-transcript', role: 'transcript', availability: 'optional-after-first-attempt' },
            ],
            responses: [
                {
                    id: 'response-listen-twice',
                    kind: 'none',
                    prompt: copy('Listen twice before you open the transcript.'),
                    completionLabel: copy('I have listened twice'),
                    required: false,
                },
                {
                    id: 'response-listening-gist',
                    kind: 'select-one',
                    prompt: copy('What are the speakers mainly doing?'),
                    required: true,
                    options: [
                        { id: 'gist-plan', label: copy('Arranging a shared Sunday meal near a river.') },
                        { id: 'gist-return', label: copy('Returning food to a restaurant.') },
                        { id: 'gist-cancel', label: copy('Cancelling a long train trip.') },
                    ],
                    correctOptionIds: ['gist-plan'],
                },
                {
                    id: 'response-listening-detail',
                    kind: 'select-many',
                    prompt: copy('Which details do you hear? Select every statement that is supported.'),
                    required: true,
                    options: [
                        { id: 'detail-ten', label: copy('They propose meeting at the station at ten.') },
                        { id: 'detail-vegetables', label: copy('They check that vegetable dishes are available and decide to bring some.') },
                        { id: 'detail-cafe', label: copy('They may move to a cafe if it rains.') },
                        { id: 'detail-seven', label: copy('They decide to leave home at seven.') },
                    ],
                    correctOptionIds: ['detail-ten', 'detail-vegetables', 'detail-cafe'],
                },
            ],
        },
        {
            id: 'activity-nara-suggestion',
            kind: 'grammar-practice',
            title: copy('Make a なら suggestion', '「なら」で提案する'),
            instructions: copy('Your group wants to eat outdoors, but rain is possible. Write one considerate proposal using なら and ませんか.'),
            estimatedMinutes: 5,
            outcomeIds: ['outcome-suggest-with-nara'],
            focusVariantIds: ['variant-nara-suggestion'],
            assetUses: [],
            responses: [
                {
                    id: 'response-nara-suggestion',
                    kind: 'short-text',
                    prompt: copy('Write your proposal in Japanese.'),
                    required: true,
                    minimumCharacters: 10,
                    maximumCharacters: 90,
                    grading: { kind: 'contains', requiredFragments: ['なら', 'ませんか'] },
                },
            ],
        },
        {
            id: 'activity-polite-negative-question',
            kind: 'grammar-practice',
            title: copy('Ask with ありませんか', '「ありませんか」で尋ねる'),
            instructions: copy('Ask politely whether a vegetable dish is available for the group.'),
            estimatedMinutes: 3,
            outcomeIds: ['outcome-ask-with-arimasenka'],
            focusVariantIds: ['variant-arimasenka-polite-question'],
            assetUses: [],
            responses: [
                {
                    id: 'response-polite-invitation',
                    kind: 'short-text',
                    prompt: copy('Write the polite question in Japanese.'),
                    required: true,
                    minimumCharacters: 10,
                    maximumCharacters: 38,
                    grading: { kind: 'exact', acceptedAnswers: ['野菜の料理はありませんか。', '野菜の料理はありませんか'] },
                },
            ],
        },
        {
            id: 'activity-purpose-youni',
            kind: 'grammar-practice',
            title: copy('Match purpose to action', '目的と行動をつなぐ'),
            instructions: copy('Match each intended result to the action that makes it possible or prevents a problem.'),
            estimatedMinutes: 5,
            outcomeIds: ['outcome-express-purpose-youni'],
            focusVariantIds: ['variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
            assetUses: [],
            responses: [
                {
                    id: 'response-purpose-matching',
                    kind: 'matching',
                    prompt: copy('Match the purpose clause with its action.'),
                    required: true,
                    pairs: [
                        {
                            id: 'pair-find-place',
                            left: copy('みんなが場所を見つけられるように'),
                            right: copy('大きい案内板の写真を送ります。'),
                        },
                        {
                            id: 'pair-not-lost',
                            left: copy('道に迷わないように'),
                            right: copy('小さい地図を作ります。'),
                        },
                    ],
                },
            ],
        },
        {
            id: 'activity-solo-dialogue-adaptation',
            kind: 'speaking',
            title: copy('Adapt the dialogue for one voice', '会話を一人用に変える'),
            instructions: copy('Imagine you are sending the plan yourself. Draft two or three lines that include an availability question and one reason for your support action, then record them.'),
            estimatedMinutes: 9,
            outcomeIds: ['outcome-adapt-dialogue-solo', 'outcome-suggest-with-nara', 'outcome-ask-with-arimasenka', 'outcome-express-purpose-youni'],
            focusVariantIds: ['variant-nara-suggestion', 'variant-arimasenka-polite-question', 'variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
            assetUses: [
                { assetId: 'asset-weekend-plan-audio', role: 'audio', availability: 'optional' },
                { assetId: 'asset-weekend-plan-transcript', role: 'transcript', availability: 'optional' },
            ],
            responses: [
                {
                    id: 'response-solo-dialogue-draft',
                    kind: 'short-text',
                    prompt: copy('Draft your independent version in Japanese.'),
                    required: true,
                    minimumCharacters: 28,
                    maximumCharacters: 220,
                    grading: { kind: 'manual' },
                },
                {
                    id: 'response-solo-dialogue-recording',
                    kind: 'recording',
                    prompt: copy('Record your independent version.'),
                    required: true,
                    minimumSeconds: 10,
                    maximumSeconds: 45,
                },
            ],
        },
        {
            id: 'activity-write-shared-plan',
            kind: 'writing',
            title: copy('Write a shared-plan message', '計画メッセージを書く'),
            instructions: copy('Write a 90-130 character message for friends planning a Sunday lunch. Include a なら proposal, an ありませんか question, one ように or ないように purpose, and a fallback for rain. Use the model and rubric after drafting.'),
            estimatedMinutes: 15,
            outcomeIds: ['outcome-write-shared-plan'],
            focusVariantIds: ['variant-nara-suggestion', 'variant-arimasenka-polite-question', 'variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
            assetUses: [
                { assetId: 'asset-weekend-plan-writing-model', role: 'model', availability: 'optional-after-first-attempt' },
                { assetId: 'asset-weekend-plan-writing-rubric', role: 'rubric', availability: 'always' },
            ],
            responses: [
                {
                    id: 'response-shared-plan-writing',
                    kind: 'long-text',
                    prompt: copy('Write your message in Japanese.'),
                    required: true,
                    minimumCharacters: 70,
                    recommendedCharacters: [90, 130],
                    maximumCharacters: 220,
                    reviewMode: 'self-review',
                    modelAssetId: 'asset-weekend-plan-writing-model',
                    rubricAssetId: 'asset-weekend-plan-writing-rubric',
                },
            ],
        },
        {
            id: 'activity-kanji-7',
            kind: 'kanji',
            title: copy('Kanji 7 in the plan', '計画の中の漢字7'),
            instructions: copy('Use the reference to connect each kanji with a familiar word, then arrange a useful planning sentence.'),
            estimatedMinutes: 8,
            outcomeIds: ['outcome-recognise-kanji-7'],
            focusVariantIds: ['variant-kanji-niku', 'variant-kanji-ryou', 'variant-kanji-ri', 'variant-kanji-ya', 'variant-kanji-han', 'variant-kanji-dai', 'variant-kanji-shou'],
            assetUses: [
                { assetId: 'asset-kanji-7-reference', role: 'reference', availability: 'always' },
            ],
            responses: [
                {
                    id: 'response-kanji-word-matching',
                    kind: 'matching',
                    prompt: copy('Match each kanji with its word.'),
                    required: true,
                    pairs: [
                        { id: 'kanji-niku', left: copy('肉'), right: copy('肉料理') },
                        { id: 'kanji-ryou', left: copy('料'), right: copy('料理') },
                        { id: 'kanji-ri', left: copy('理'), right: copy('料理') },
                        { id: 'kanji-ya', left: copy('野'), right: copy('野菜') },
                        { id: 'kanji-han', left: copy('半'), right: copy('半分') },
                        { id: 'kanji-dai', left: copy('大'), right: copy('大きい') },
                        { id: 'kanji-shou', left: copy('小'), right: copy('小さい') },
                    ],
                },
                {
                    id: 'response-kanji-sentence-order',
                    kind: 'ordering',
                    prompt: copy('Put the sentence segments in a natural order.'),
                    required: true,
                    items: [
                        { id: 'order-send', label: copy('送ります。') },
                        { id: 'order-sunday', label: copy('日曜日に') },
                        { id: 'order-photo', label: copy('大きい案内板の写真を') },
                    ],
                    correctOrderIds: ['order-sunday', 'order-photo', 'order-send'],
                },
            ],
        },
        {
            id: 'activity-lesson-reflection',
            kind: 'reflection',
            title: copy('Choose your next rehearsal', '次の練習を選ぶ'),
            instructions: copy('Rate how ready you are to make a shared plan without looking at the transcript.'),
            estimatedMinutes: 2,
            outcomeIds: ['outcome-adapt-dialogue-solo', 'outcome-write-shared-plan'],
            focusVariantIds: ['variant-nara-suggestion', 'variant-arimasenka-polite-question', 'variant-youni-enabling-purpose', 'variant-nai-youni-preventing-purpose'],
            assetUses: [],
            responses: [
                {
                    id: 'response-lesson-reflection',
                    kind: 'self-assessment',
                    prompt: copy('How ready are you to propose a plan, explain its purpose, and handle rain?'),
                    required: true,
                    options: [
                        { id: 'not-yet', label: copy('I need the transcript and model.') },
                        { id: 'almost', label: copy('I can do it with a few notes.') },
                        { id: 'ready', label: copy('I can do it independently.') },
                    ],
                },
            ],
        },
    ],
    curriculumUnits: [
        {
            id: 'unit-level-3-plus',
            kind: 'programme',
            title: copy('Yomu Academy Level 3+', 'よむアカデミー レベル3+'),
            summary: copy('A practical Japanese programme that joins listening, interaction, writing, and literacy.'),
            level: 'Level 3+',
        },
        {
            id: 'unit-level-3-plus-lesson-09',
            kind: 'lesson',
            parentUnitId: 'unit-level-3-plus',
            title: copy('Lesson 9: plans that work for everyone', '第9課：みんなのための計画'),
            summary: copy('A listening-first lesson on making a shared plan with useful support and a fallback.'),
            level: 'Level 3+',
            alignments: [
                {
                    reference: 'UCL Level 3+ Lesson 9',
                    relation: 'scope-alignment',
                    note: copy('Topic and progression alignment only; all Yomu Academy wording, examples, and activities are original.'),
                },
                {
                    reference: 'Minna 35-36',
                    relation: 'sequence-alignment',
                    note: copy('Grammar sequence reference only; this catalogue does not reproduce source material.'),
                },
                {
                    reference: 'Genki 22-23',
                    relation: 'sequence-alignment',
                    note: copy('Grammar sequence reference only; this catalogue does not reproduce source material.'),
                },
            ],
        },
        {
            id: 'unit-strand-listening-interaction',
            kind: 'strand',
            parentUnitId: 'unit-level-3-plus',
            title: copy('Listening and interaction', '聞く・やり取りする'),
            summary: copy('Build meaning from sound, then turn useful language into an interaction.'),
            level: 'Level 3+',
        },
        {
            id: 'unit-strand-grammar-in-action',
            kind: 'strand',
            parentUnitId: 'unit-level-3-plus',
            title: copy('Grammar in action', '使う文法'),
            summary: copy('Use grammar to make plans that another person can follow.'),
            level: 'Level 3+',
        },
        {
            id: 'unit-strand-writing-literacy',
            kind: 'strand',
            parentUnitId: 'unit-level-3-plus',
            title: copy('Writing and literacy', '書く・読む'),
            summary: copy('Write useful messages and recognise their kanji in context.'),
            level: 'Level 3+',
        },
    ],
    placements: [
        { id: 'placement-lesson-09-listening', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-listen-weekend-plan', position: 1, requirement: 'core' },
        { id: 'placement-lesson-09-nara', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-nara-suggestion', position: 2, requirement: 'core' },
        { id: 'placement-lesson-09-masenka', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-polite-negative-question', position: 3, requirement: 'core' },
        { id: 'placement-lesson-09-youni', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-purpose-youni', position: 4, requirement: 'core' },
        { id: 'placement-lesson-09-solo', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-solo-dialogue-adaptation', position: 5, requirement: 'core' },
        { id: 'placement-lesson-09-writing', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-write-shared-plan', position: 6, requirement: 'core' },
        { id: 'placement-lesson-09-kanji', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-kanji-7', position: 7, requirement: 'core' },
        { id: 'placement-lesson-09-reflection', curriculumUnitId: 'unit-level-3-plus-lesson-09', activityId: 'activity-lesson-reflection', position: 8, requirement: 'core' },
        { id: 'placement-listening-strand-listening', curriculumUnitId: 'unit-strand-listening-interaction', activityId: 'activity-listen-weekend-plan', position: 1, requirement: 'core' },
        { id: 'placement-listening-strand-solo', curriculumUnitId: 'unit-strand-listening-interaction', activityId: 'activity-solo-dialogue-adaptation', position: 2, requirement: 'core' },
        { id: 'placement-grammar-strand-nara', curriculumUnitId: 'unit-strand-grammar-in-action', activityId: 'activity-nara-suggestion', position: 1, requirement: 'core' },
        { id: 'placement-grammar-strand-masenka', curriculumUnitId: 'unit-strand-grammar-in-action', activityId: 'activity-polite-negative-question', position: 2, requirement: 'core' },
        { id: 'placement-grammar-strand-youni', curriculumUnitId: 'unit-strand-grammar-in-action', activityId: 'activity-purpose-youni', position: 3, requirement: 'core' },
        { id: 'placement-literacy-strand-writing', curriculumUnitId: 'unit-strand-writing-literacy', activityId: 'activity-write-shared-plan', position: 1, requirement: 'core' },
        { id: 'placement-literacy-strand-kanji', curriculumUnitId: 'unit-strand-writing-literacy', activityId: 'activity-kanji-7', position: 2, requirement: 'core' },
    ],
} as const satisfies AcademyContentGraph;

export function conceptVariantsForConcept(graph: AcademyContentGraph, conceptId: string): readonly ConceptVariant[] {
    return graph.conceptVariants.filter(variant => variant.conceptId === conceptId);
}

export function resolvedAssetsForActivity(graph: AcademyContentGraph, activityId: string): readonly ResolvedActivityAsset[] {
    const activity = graph.activities.find(candidate => candidate.id === activityId);
    if (!activity) return [];

    const assetsById = new Map(graph.assets.map(asset => [asset.id, asset]));
    return activity.assetUses.flatMap(use => {
        const asset = assetsById.get(use.assetId);
        return asset ? [{ use, asset }] : [];
    });
}

export function placementsForUnit(graph: AcademyContentGraph, curriculumUnitId: string): readonly ResolvedCurriculumPlacement[] {
    const activitiesById = new Map(graph.activities.map(activity => [activity.id, activity]));
    return graph.placements
        .filter(placement => placement.curriculumUnitId === curriculumUnitId)
        .slice()
        .sort((left, right) => left.position - right.position)
        .flatMap(placement => {
            const activity = activitiesById.get(placement.activityId);
            return activity ? [{ placement, activity }] : [];
        });
}

export function unitsForActivity(graph: AcademyContentGraph, activityId: string): readonly CurriculumUnit[] {
    const unitsById = new Map(graph.curriculumUnits.map(unit => [unit.id, unit]));
    return graph.placements
        .filter(placement => placement.activityId === activityId)
        .slice()
        .sort((left, right) => left.position - right.position)
        .flatMap(placement => {
            const unit = unitsById.get(placement.curriculumUnitId);
            return unit ? [unit] : [];
        });
}

export function validateAcademyContentGraph(graph: AcademyContentGraph): readonly ContentValidationIssue[] {
    const issues: ContentValidationIssue[] = [];
    const conceptsById = indexEntities(graph.concepts, 'concepts', issues);
    const variantsById = indexEntities(graph.conceptVariants, 'conceptVariants', issues);
    const outcomesById = indexEntities(graph.outcomes, 'outcomes', issues);
    const assetsById = indexEntities(graph.assets, 'assets', issues);
    const activitiesById = indexEntities(graph.activities, 'activities', issues);
    const unitsById = indexEntities(graph.curriculumUnits, 'curriculumUnits', issues);
    indexEntities(graph.placements, 'placements', issues);

    graph.concepts.forEach((concept, index) => {
        validateCopy(concept.title, `concepts[${index}].title`, issues);
        validateCopy(concept.summary, `concepts[${index}].summary`, issues);
    });

    graph.conceptVariants.forEach((variant, index) => {
        const path = `conceptVariants[${index}]`;
        validateCopy(variant.label, `${path}.label`, issues);
        validateCopy(variant.explanation, `${path}.explanation`, issues);
        validateCopy(variant.example, `${path}.example`, issues);
        validateText(variant.form, `${path}.form`, issues);
        if (!conceptsById.has(variant.conceptId)) {
            issue(issues, 'unknown-reference', `${path}.conceptId`, `Unknown concept "${variant.conceptId}".`);
        }
    });

    graph.outcomes.forEach((outcome, index) => {
        const path = `outcomes[${index}]`;
        validateCopy(outcome.statement, `${path}.statement`, issues);
        if (!outcome.targetConceptIds.length) {
            issue(issues, 'invalid-relationship', `${path}.targetConceptIds`, 'An outcome must target at least one concept.');
        }
        outcome.targetConceptIds.forEach((conceptId, conceptIndex) => {
            if (!conceptsById.has(conceptId)) {
                issue(issues, 'unknown-reference', `${path}.targetConceptIds[${conceptIndex}]`, `Unknown concept "${conceptId}".`);
            }
        });
        outcome.targetVariantIds.forEach((variantId, variantIndex) => {
            const variant = variantsById.get(variantId);
            if (!variant) {
                issue(issues, 'unknown-reference', `${path}.targetVariantIds[${variantIndex}]`, `Unknown concept variant "${variantId}".`);
                return;
            }
            if (!outcome.targetConceptIds.includes(variant.conceptId)) {
                issue(issues, 'invalid-relationship', `${path}.targetVariantIds[${variantIndex}]`, `Variant "${variantId}" does not belong to an outcome target concept.`);
            }
        });
    });

    graph.assets.forEach((asset, index) => validateAsset(asset, `assets[${index}]`, assetsById, issues));

    graph.activities.forEach((activity, index) => {
        const path = `activities[${index}]`;
        validateCopy(activity.title, `${path}.title`, issues);
        validateCopy(activity.instructions, `${path}.instructions`, issues);
        if (!isPositiveInteger(activity.estimatedMinutes)) {
            issue(issues, 'invalid-relationship', `${path}.estimatedMinutes`, 'Estimated minutes must be a positive integer.');
        }
        if (!activity.outcomeIds.length) {
            issue(issues, 'invalid-relationship', `${path}.outcomeIds`, 'An activity must target at least one outcome.');
        }

        const activityTargetConceptIds = new Set<string>();
        activity.outcomeIds.forEach((outcomeId, outcomeIndex) => {
            const outcome = outcomesById.get(outcomeId);
            if (!outcome) {
                issue(issues, 'unknown-reference', `${path}.outcomeIds[${outcomeIndex}]`, `Unknown outcome "${outcomeId}".`);
                return;
            }
            outcome.targetConceptIds.forEach(conceptId => activityTargetConceptIds.add(conceptId));
        });

        activity.focusVariantIds.forEach((variantId, variantIndex) => {
            const variant = variantsById.get(variantId);
            if (!variant) {
                issue(issues, 'unknown-reference', `${path}.focusVariantIds[${variantIndex}]`, `Unknown concept variant "${variantId}".`);
                return;
            }
            if (!activityTargetConceptIds.has(variant.conceptId)) {
                issue(issues, 'invalid-relationship', `${path}.focusVariantIds[${variantIndex}]`, `Variant "${variantId}" is not covered by this activity's outcomes.`);
            }
        });

        const usedAssetRoles = new Set<string>();
        activity.assetUses.forEach((use, useIndex) => {
            const usePath = `${path}.assetUses[${useIndex}]`;
            const asset = assetsById.get(use.assetId);
            const duplicateKey = `${use.assetId}:${use.role}`;
            if (usedAssetRoles.has(duplicateKey)) {
                issue(issues, 'invalid-relationship', usePath, `Asset "${use.assetId}" is attached with role "${use.role}" more than once.`);
            }
            usedAssetRoles.add(duplicateKey);
            if (!asset) {
                issue(issues, 'unknown-reference', `${usePath}.assetId`, `Unknown asset "${use.assetId}".`);
                return;
            }
            if (!assetKindMatchesRole(asset.kind, use.role)) {
                issue(issues, 'invalid-asset', usePath, `Asset "${use.assetId}" cannot be used as "${use.role}".`);
            }
            if (asset.rights.status !== 'cleared') {
                issue(issues, 'invalid-asset', usePath, `Asset "${use.assetId}" is not cleared for learner use.`);
            }
        });

        if (!activity.responses.length) {
            issue(issues, 'invalid-response', `${path}.responses`, 'An activity must declare at least one UI response.');
        }
        const responseIds = new Set<string>();
        activity.responses.forEach((response, responseIndex) => {
            const responsePath = `${path}.responses[${responseIndex}]`;
            if (responseIds.has(response.id)) {
                issue(issues, 'duplicate-id', `${responsePath}.id`, `Duplicate response id "${response.id}" in activity "${activity.id}".`);
            }
            responseIds.add(response.id);
            validateResponse(response, responsePath, activity, assetsById, issues);
        });
    });

    graph.curriculumUnits.forEach((unit, index) => {
        const path = `curriculumUnits[${index}]`;
        validateCopy(unit.title, `${path}.title`, issues);
        validateCopy(unit.summary, `${path}.summary`, issues);
        validateText(unit.level, `${path}.level`, issues);
        if (unit.parentUnitId && !unitsById.has(unit.parentUnitId)) {
            issue(issues, 'unknown-reference', `${path}.parentUnitId`, `Unknown curriculum unit "${unit.parentUnitId}".`);
        }
        if (unit.parentUnitId === unit.id) {
            issue(issues, 'invalid-relationship', `${path}.parentUnitId`, 'A curriculum unit cannot be its own parent.');
        }
        unit.alignments?.forEach((alignment, alignmentIndex) => {
            validateText(alignment.reference, `${path}.alignments[${alignmentIndex}].reference`, issues);
            validateCopy(alignment.note, `${path}.alignments[${alignmentIndex}].note`, issues);
        });
    });
    validateUnitParentCycles(graph.curriculumUnits, unitsById, issues);

    const placementsByUnitAndActivity = new Set<string>();
    const positionsByUnit = new Set<string>();
    graph.placements.forEach((placement, index) => {
        const path = `placements[${index}]`;
        if (!unitsById.has(placement.curriculumUnitId)) {
            issue(issues, 'unknown-reference', `${path}.curriculumUnitId`, `Unknown curriculum unit "${placement.curriculumUnitId}".`);
        }
        if (!activitiesById.has(placement.activityId)) {
            issue(issues, 'unknown-reference', `${path}.activityId`, `Unknown activity "${placement.activityId}".`);
        }
        if (!isPositiveInteger(placement.position)) {
            issue(issues, 'invalid-relationship', `${path}.position`, 'Placement position must be a positive integer.');
        }
        const activityKey = `${placement.curriculumUnitId}:${placement.activityId}`;
        const positionKey = `${placement.curriculumUnitId}:${placement.position}`;
        if (placementsByUnitAndActivity.has(activityKey) || positionsByUnit.has(positionKey)) {
            issue(issues, 'duplicate-placement', path, 'A unit cannot place the same activity or position more than once.');
        }
        placementsByUnitAndActivity.add(activityKey);
        positionsByUnit.add(positionKey);
    });

    return issues;
}

export function assertValidAcademyContentGraph(graph: AcademyContentGraph): void {
    const issues = validateAcademyContentGraph(graph);
    if (!issues.length) return;

    const detail = issues.map(issueItem => `${issueItem.path}: ${issueItem.message}`).join('\n');
    throw new Error(`Invalid Yomu Academy content graph:\n${detail}`);
}

function indexEntities<T extends { id: string }>(
    entities: readonly T[],
    collection: string,
    issues: ContentValidationIssue[],
): ReadonlyMap<string, T> {
    const entitiesById = new Map<string, T>();
    entities.forEach((entity, index) => {
        const path = `${collection}[${index}].id`;
        validateText(entity.id, path, issues);
        if (entitiesById.has(entity.id)) {
            issue(issues, 'duplicate-id', path, `Duplicate id "${entity.id}" in ${collection}.`);
            return;
        }
        entitiesById.set(entity.id, entity);
    });
    return entitiesById;
}

function validateAsset(asset: AcademyAsset, path: string, assetsById: ReadonlyMap<string, AcademyAsset>, issues: ContentValidationIssue[]): void {
    validateCopy(asset.title, `${path}.title`, issues);
    validateText(asset.locator, `${path}.locator`, issues);
    validateRights(asset.rights, `${path}.rights`, issues);

    switch (asset.kind) {
        case 'audio':
            if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0) {
                issue(issues, 'invalid-asset', `${path}.durationSeconds`, 'Audio duration must be greater than zero.');
            }
            return;
        case 'transcript': {
            validateText(asset.body, `${path}.body`, issues);
            const audio = assetsById.get(asset.transcriptOfAssetId);
            if (!audio) {
                issue(issues, 'unknown-reference', `${path}.transcriptOfAssetId`, `Unknown audio asset "${asset.transcriptOfAssetId}".`);
            } else if (audio.kind !== 'audio') {
                issue(issues, 'invalid-asset', `${path}.transcriptOfAssetId`, 'A transcript must point to an audio asset.');
            }
            return;
        }
        case 'writing-model':
            validateText(asset.body, `${path}.body`, issues);
            return;
        case 'rubric':
            if (!asset.criteria.length) {
                issue(issues, 'invalid-asset', `${path}.criteria`, 'A rubric needs at least one criterion.');
            }
            asset.criteria.forEach((criterion, criterionIndex) => {
                const criterionPath = `${path}.criteria[${criterionIndex}]`;
                validateText(criterion.id, `${criterionPath}.id`, issues);
                validateCopy(criterion.label, `${criterionPath}.label`, issues);
                if (!criterion.levels.length) {
                    issue(issues, 'invalid-asset', `${criterionPath}.levels`, 'A rubric criterion needs at least one level.');
                }
                criterion.levels.forEach((level, levelIndex) => {
                    if (!Number.isFinite(level.score)) {
                        issue(issues, 'invalid-asset', `${criterionPath}.levels[${levelIndex}].score`, 'A rubric score must be a number.');
                    }
                    validateCopy(level.description, `${criterionPath}.levels[${levelIndex}].description`, issues);
                });
            });
            return;
        case 'kanji-reference':
            if (!asset.entries.length) {
                issue(issues, 'invalid-asset', `${path}.entries`, 'A kanji reference needs at least one entry.');
            }
            asset.entries.forEach((entry, entryIndex) => {
                const entryPath = `${path}.entries[${entryIndex}]`;
                validateText(entry.character, `${entryPath}.character`, issues);
                validateText(entry.reading, `${entryPath}.reading`, issues);
                validateCopy(entry.meaning, `${entryPath}.meaning`, issues);
                validateCopy(entry.example, `${entryPath}.example`, issues);
            });
    }
}

function validateRights(rights: AssetRights, path: string, issues: ContentValidationIssue[]): void {
    validateText(rights.rightsHolder, `${path}.rightsHolder`, issues);
    validateText(rights.license, `${path}.license`, issues);
    validateText(rights.attribution, `${path}.attribution`, issues);
    if (!rights.permittedUses.length) {
        issue(issues, 'invalid-asset', `${path}.permittedUses`, 'An asset must declare permitted uses.');
    }
    if (rights.origin !== 'original' && !rights.sourceUrl?.trim()) {
        issue(issues, 'invalid-asset', `${path}.sourceUrl`, 'A non-original asset must identify its source URL.');
    }
}

function validateResponse(
    response: ActivityResponse,
    path: string,
    activity: AcademyActivity,
    assetsById: ReadonlyMap<string, AcademyAsset>,
    issues: ContentValidationIssue[],
): void {
    validateText(response.id, `${path}.id`, issues);
    validateCopy(response.prompt, `${path}.prompt`, issues);

    switch (response.kind) {
        case 'none':
            validateCopy(response.completionLabel, `${path}.completionLabel`, issues);
            return;
        case 'select-one':
            validateChoiceResponse(response, path, 1, issues);
            return;
        case 'select-many':
            validateChoiceResponse(response, path, 1, issues);
            return;
        case 'short-text':
            if (response.minimumCharacters < 0 || response.maximumCharacters < response.minimumCharacters) {
                issue(issues, 'invalid-response', path, 'Short-text character limits are invalid.');
            }
            if (response.grading.kind === 'contains' && !response.grading.requiredFragments.length) {
                issue(issues, 'invalid-response', `${path}.grading`, 'Contains grading needs at least one required fragment.');
            }
            if (response.grading.kind === 'exact' && !response.grading.acceptedAnswers.length) {
                issue(issues, 'invalid-response', `${path}.grading`, 'Exact grading needs at least one accepted answer.');
            }
            return;
        case 'long-text': {
            const [recommendedMinimum, recommendedMaximum] = response.recommendedCharacters;
            if (
                response.minimumCharacters < 0
                || response.maximumCharacters < response.minimumCharacters
                || recommendedMinimum < response.minimumCharacters
                || recommendedMaximum < recommendedMinimum
                || recommendedMaximum > response.maximumCharacters
            ) {
                issue(issues, 'invalid-response', path, 'Long-text character limits are invalid.');
            }
            validateResponseSupportAsset(response.modelAssetId, 'writing-model', 'model', path, activity, assetsById, issues);
            validateResponseSupportAsset(response.rubricAssetId, 'rubric', 'rubric', path, activity, assetsById, issues);
            return;
        }
        case 'recording':
            if (response.minimumSeconds <= 0 || response.maximumSeconds < response.minimumSeconds) {
                issue(issues, 'invalid-response', path, 'Recording duration limits are invalid.');
            }
            return;
        case 'matching':
            validateMatchingResponse(response, path, issues);
            return;
        case 'ordering':
            validateOrderingResponse(response, path, issues);
            return;
        case 'self-assessment':
            validateSelfAssessmentResponse(response, path, issues);
            return;
    }
}

function validateChoiceResponse(
    response: SelectOneResponse | SelectManyResponse,
    path: string,
    minimumCorrectAnswers: number,
    issues: ContentValidationIssue[],
): void {
    if (response.options.length < 2) {
        issue(issues, 'invalid-response', `${path}.options`, 'A choice response needs at least two options.');
    }
    const optionIds = new Set<string>();
    response.options.forEach((option, optionIndex) => {
        validateText(option.id, `${path}.options[${optionIndex}].id`, issues);
        validateCopy(option.label, `${path}.options[${optionIndex}].label`, issues);
        if (optionIds.has(option.id)) {
            issue(issues, 'duplicate-id', `${path}.options[${optionIndex}].id`, `Duplicate option id "${option.id}".`);
        }
        optionIds.add(option.id);
    });
    if (response.correctOptionIds.length < minimumCorrectAnswers) {
        issue(issues, 'invalid-response', `${path}.correctOptionIds`, 'A choice response needs a correct answer.');
    }
    response.correctOptionIds.forEach((optionId, answerIndex) => {
        if (!optionIds.has(optionId)) {
            issue(issues, 'unknown-reference', `${path}.correctOptionIds[${answerIndex}]`, `Unknown option "${optionId}".`);
        }
    });
    if (response.kind === 'select-one' && response.correctOptionIds.length !== 1) {
        issue(issues, 'invalid-response', `${path}.correctOptionIds`, 'A select-one response needs exactly one correct answer.');
    }
}

function validateMatchingResponse(response: MatchingResponse, path: string, issues: ContentValidationIssue[]): void {
    if (!response.pairs.length) {
        issue(issues, 'invalid-response', `${path}.pairs`, 'A matching response needs at least one pair.');
    }
    const pairIds = new Set<string>();
    response.pairs.forEach((pair, pairIndex) => {
        const pairPath = `${path}.pairs[${pairIndex}]`;
        validateText(pair.id, `${pairPath}.id`, issues);
        validateCopy(pair.left, `${pairPath}.left`, issues);
        validateCopy(pair.right, `${pairPath}.right`, issues);
        if (pairIds.has(pair.id)) {
            issue(issues, 'duplicate-id', `${pairPath}.id`, `Duplicate matching pair id "${pair.id}".`);
        }
        pairIds.add(pair.id);
    });
}

function validateOrderingResponse(response: OrderingResponse, path: string, issues: ContentValidationIssue[]): void {
    if (!response.items.length) {
        issue(issues, 'invalid-response', `${path}.items`, 'An ordering response needs at least one item.');
    }
    const itemIds = new Set<string>();
    response.items.forEach((item, itemIndex) => {
        validateText(item.id, `${path}.items[${itemIndex}].id`, issues);
        validateCopy(item.label, `${path}.items[${itemIndex}].label`, issues);
        if (itemIds.has(item.id)) {
            issue(issues, 'duplicate-id', `${path}.items[${itemIndex}].id`, `Duplicate ordering item id "${item.id}".`);
        }
        itemIds.add(item.id);
    });
    if (response.correctOrderIds.length !== itemIds.size || response.correctOrderIds.some(itemId => !itemIds.has(itemId))) {
        issue(issues, 'invalid-response', `${path}.correctOrderIds`, 'The correct order must contain every ordering item exactly once.');
        return;
    }
    if (new Set(response.correctOrderIds).size !== response.correctOrderIds.length) {
        issue(issues, 'invalid-response', `${path}.correctOrderIds`, 'The correct order cannot repeat an item.');
    }
}

function validateSelfAssessmentResponse(response: SelfAssessmentResponse, path: string, issues: ContentValidationIssue[]): void {
    if (response.options.length < 2) {
        issue(issues, 'invalid-response', `${path}.options`, 'A self-assessment needs at least two choices.');
    }
    const optionIds = new Set<string>();
    response.options.forEach((option, optionIndex) => {
        validateText(option.id, `${path}.options[${optionIndex}].id`, issues);
        validateCopy(option.label, `${path}.options[${optionIndex}].label`, issues);
        if (optionIds.has(option.id)) {
            issue(issues, 'duplicate-id', `${path}.options[${optionIndex}].id`, `Duplicate self-assessment option id "${option.id}".`);
        }
        optionIds.add(option.id);
    });
}

function validateResponseSupportAsset(
    assetId: string | undefined,
    expectedKind: AcademyAsset['kind'],
    expectedRole: ActivityAssetRole,
    path: string,
    activity: AcademyActivity,
    assetsById: ReadonlyMap<string, AcademyAsset>,
    issues: ContentValidationIssue[],
): void {
    if (!assetId) return;

    const asset = assetsById.get(assetId);
    if (!asset) {
        issue(issues, 'unknown-reference', path, `Unknown support asset "${assetId}".`);
        return;
    }
    if (asset.kind !== expectedKind) {
        issue(issues, 'invalid-asset', path, `Support asset "${assetId}" must be a ${expectedKind} asset.`);
    }
    if (!activity.assetUses.some(use => use.assetId === assetId && use.role === expectedRole)) {
        issue(issues, 'invalid-relationship', path, `Support asset "${assetId}" must also be attached to the activity as "${expectedRole}".`);
    }
}

function validateUnitParentCycles(
    units: readonly CurriculumUnit[],
    unitsById: ReadonlyMap<string, CurriculumUnit>,
    issues: ContentValidationIssue[],
): void {
    units.forEach((unit, index) => {
        const visited = new Set<string>([unit.id]);
        let parentId = unit.parentUnitId;
        while (parentId) {
            if (visited.has(parentId)) {
                issue(issues, 'invalid-relationship', `curriculumUnits[${index}].parentUnitId`, 'Curriculum unit parent relationships cannot form a cycle.');
                break;
            }
            visited.add(parentId);
            parentId = unitsById.get(parentId)?.parentUnitId;
        }
    });
}

function assetKindMatchesRole(assetKind: AssetKind, role: ActivityAssetRole): boolean {
    return (
        (role === 'audio' && assetKind === 'audio')
        || (role === 'transcript' && assetKind === 'transcript')
        || (role === 'model' && assetKind === 'writing-model')
        || (role === 'rubric' && assetKind === 'rubric')
        || (role === 'reference' && assetKind === 'kanji-reference')
    );
}

function validateCopy(value: AcademyCopy, path: string, issues: ContentValidationIssue[]): void {
    validateText(value.en, `${path}.en`, issues);
    if (value.ja !== undefined) validateText(value.ja, `${path}.ja`, issues);
}

function validateText(value: string, path: string, issues: ContentValidationIssue[]): void {
    if (!value.trim()) issue(issues, 'blank-field', path, 'Value must not be blank.');
}

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}

function issue(issues: ContentValidationIssue[], code: ContentValidationCode, path: string, message: string): void {
    issues.push({ code, path, message });
}
