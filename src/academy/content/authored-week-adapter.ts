import {
    ACADEMY_ASSESSED_ANSWER_SUPPORT,
    createActivityRuntime,
    type AnswerSupportContract,
    type GradeResult,
    type ReviewSeed,
} from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import {
    parseAuthoredWeekPackage,
    parseChoiceExercise,
    type AuthoredChoiceExercise,
    type AuthoredExercisePhase,
    parseExactExercise,
    type AuthoredExactExercise,
    type AuthoredSourceVocabularySheet,
} from './authored-week-schema';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';
import {
    sourceVocabularySheetPlugin,
    type SourceVocabularySheetModel,
} from '../minigames/source-vocabulary-sheet';
import { grammarConceptForAuthoredQuestion } from '../integration/grammar-concepts';
import { assertAuthoredWeekPedagogy } from './authored-week-pedagogy';

export const AUTHORED_WEEK_HASHES = {
    'l1-l01': '0b3540669711fd2019edac4aa8b0afa54b7c931808a0707ecc6f941e048daf50',
    'l1-l02': '5f2f04b5c575539d0bfe4112c9c456e0c21e7b49d2e6a01332f051b0c978dbbd',
    'l1-l03': 'f2e11d7100e1a1269a54e07fc01ccbc7c653229f423b5df593402874d82e1c6c',
    'l1-l04': 'f9b8a577870c194f74f8c93f6d3b04b5f20dcbc69ce20bd9c6f06800a4ea9a2e',
    'l1-l05': '081c109eb3fd3f0f721a690b03ff580165666d391afc3370608862945f26132d',
    'l1-l06': '3cd7bcd1c86f0ef37ccc3c7dc16136847bf0c21290a2f15ab7b460d358895a43',
    'l1-l07': 'b924df28e1e398ce8bf1cc2b4f6eaf4e661e287301698ce23b4590f4c55cb7a8',
    'l1-l08': 'a2f403ae5b9e494bb33a8368258ae9e6aeb7bbf126cfa79affe20b30ccf186d2',
    'l1-l09': 'c52c094e16cece56193b8a07574163242159396cdb6575fdaa7083266881b435',
    'l1-l10': '5ea1b7b013a85a00c0155cb1f5c8f8ae144fde850afcd5a34aacc40a602b8f32',
    'l1-l11': 'e7af6535f51233a4693ebdf37df61b4afe8c3125c774f754001fed7a351662f9',
    'l1-l12': '43f24fa272b9d9399ed7d73b127d775bc16d45fd57570e610fe4e4a27a6ce717',
    'l1-l13': 'b850d5ac1f97902140b102dd45d26748cc48e8a32e2087cc57a355b068cd1b45',
    'l1-l14': '3a4b6d494f043aea728bab6dd7b41bc19301137e1dfc56efa7f768eb5ecf6463',
    'l1-l15': 'ca255f81d24b5163b6265ce3d7ae2e0a2fbe42cc321071054bd5a43f9233e1ff',
    'l1-l16': 'f22a3de005e06cc673bf0e0574638fee3449aefd3f0330375f37236a7ec728a8',
    'l1-l17': '64b2bf724adccb446cd05443d86152c7010f93e6e38c7986d4a32ce68ebba4dc',
    'l1-l18': '6a9de53879f0688c1f15600163811038ddd25afef7944dc078ef2e8c37f9ac5d',
    'l1-l19': '71efeaf9c76f0e8a02b238a99440782fba1cd1ca6e21ee454f9e6c2025f2d199',
    'l1-l20': 'dd790467c5aa79e4a754b0c0d7aa2b3c5562accb08639693867129be6812bfd2',
    'l1-l21': 'a70940430542e776156a1a3e174330c4d89d99ca06a0013bf4c1feaacda506d3',
    'l1-l22': '58edb4c41d2c49a2f0d44ab9d0acd0589a2a9afdc5baab7e7ce608f10edd4e5c',
    'l1-l23': 'd5796d9847be2d47b932f6a4b31506d8acc334a4e7be9068850da95e90868ae5',
    'l1-l24': 'b29ede520d0c9653857a2ce27872d21c5564df75f23de73bdd154aa3cf8deece',
    'l1-l25': '1d4ab307fa6a66d6191e511c7c258ffa77bfc572b1f8e53ec285f9e76ab2c6ad',
    'l1-l26': 'b05dab7fcf8a1ceff530d020cd414ac5adfedbbd9f1a1935b9d0349434d776ee',
    'l2-l02': '2f74245cbe3348792351a54194e5e56584773a86caf16b301b4f28597a625f2f',
    'l2-l03': '20552264c4787684cd1cb1ca757d47ce93bd8575bf16fbd79c87f2738b4c47f0',
    'l2-l04': '2a9649cba309665a44f7c8bbc69d10f20e37b09aae31970d0b6b5926df76f1c7',
    'l2-l05': '3003db9b0cf9b795b1b46067b143e2e71869f4903c5705ef463f356c42502544',
    'l2-l06': 'f511c246dd35cc6b13486b0b96bb048bfe23a41cca5a61f5272f9bb0ca6a5b38',
    'l2-l07': '7edfa0f5430e384f00d6ac2a695c7fa3d8271e266585e2d7c4d889fe5a964a99',
    'l2-l08': '99e60d70579c368a1611bdb6058bdd9e4ee0ccee350c8e0f25c8c4cffc4c22fd',
    'l2-l09': '951cedfa65d24865c12731438d63679c27b5e65fed8efd9abb4984370ac929fd',
    'l2-l10': '8f2ce673a3b21b958fd512304aa4b08c18679d9982f3b0e6ad2f043108e880af',
    'l2-l11': '56e2fcdb5952819c2a3958121d23cdd3e75fd8c8eec0a6593165ae990be3dfd6',
    'l2-l12': '55b200a9a89971ed0f4272bfc53c95c8e318677d9c649d41dc90ad909044af30',
    'l2-l13': '7fd25568ae5a57f7ce553fedce51594edbea77c6360efaa92f8492a61af5bcfe',
    'l2-l14': 'd698fdb60de1a60efbb893e0e7bb02094c1332c0a514b1eb8f08d63f02e8b2cb',
    'l2-l15': 'abefe9aae6730274afc8bc184eec221c64e7848df84ae5fb8cb235487c6c6da9',
    'l2-l16': '04ad279a9667497f6419123300eb137f8f4fd4c08fd35cba9ab99427da87e396',
    'l2-l17': 'a319510a34b185d008fd631849f56539f360bd61f32ad017812b5714fe38c834',
    'l2-l18': '79331b534ae7a45d12307262656da71d8c52e2d80d8c067f267a5259e4ee3443',
    'l2-l19': '5be73c8311e5fab0284cb875eab140b6e110e7691e4cdc8fec58570987232c06',
    'l2-l20': '32b44dd9de43b0836153a5907c008e710bcc170e742737e64737343eccbceeda',
    'l2-l21': '8f0468b15ecc934fa007cd19d7dd1a6e40d31fc0545b0e671a07adcc48c6ed4c',
    'l2-l22': '4f700d5386baddaf45025a70612e343bf43a92cde19b151b01d9e33222177227',
    'l2-l23': 'b6db986c187c97eef70eac6d647a2ccea5cb982546ca7ebabae3311778c9c778',
    'l2-l24': 'fa6eeaef568f896958c230e036690beff6bb02c090ad5a2ff58c16cb0ac9973e',
    'l2-l25': 'a38f92840b06bb66cec4587a6d5b3005d4860f454152f5d5347f7c1b8526f00a',
    'l2-l26': '42a67ed9eea0dd6d8c336c7813c1e3ade22b885ca78c6ec02e3cdebdda170afe',
    'l2-l27': '06148a863fd7e75864ca04d90eb90800d28eb728904bc8b62b330b6038355776',
    'l2-l28': 'bf518f6d5141a0ae5195a83ac563789c48774d03e947742080cd8ac039a6a79d',
    'l2-l29': 'df75b67e6ba13033c76edc83f75630594128a3a35679e7768fa1e0a1cc993817',
    'l2-l30': '4c0690c2c041497cb102b6ab9d94edbf3bbb7238710ba24c8fdf326e3d6a19bb',
    'l2-l31': '89545b660280f0570a73c4ae2e66a2c39cab803adea1de638a931048b3114dcf',
    'l2-l32': '2c62cac30744372dbc1790806410e647c86baca7695803c3806372f69d09ee23',
    'l2-l33': '766792a660f9f445cb21d23fda504c6403a3d90eaa08ddcf6980cf9a03bdd2d8',
    'l2-l34': 'bea04efb2eba6ef59b9a5bbd198f5f74db3ed91e6335c710a6cfc9df2462b7a6',
} as const;

export type AuthoredWeekId = keyof typeof AUTHORED_WEEK_HASHES;

export interface AuthoredWeekSource {
    readonly path: string;
    readonly sha256: string;
}

export interface LearnerAuthoredWeek {
    readonly id: AuthoredWeekId;
    readonly activities: readonly LearnerAuthoredActivity[];
    readonly media: readonly {
        assetId: string;
        status: 'unavailable';
        reason: 'unresolved-academy-locator';
        sourceLocator: string;
    }[];
    readonly provenance: {
        readonly source: AuthoredWeekSource;
        readonly packageId: AuthoredWeekId;
        readonly packageProvenance: Readonly<Record<string, unknown>>;
    };
    evaluate(activityId: string, responseId: string): AuthoredChoiceEvaluation;
}

export interface LearnerAuthoredChoice {
    readonly id: string;
    readonly kind: 'choice';
    readonly sourceQuestionId: string;
    readonly conceptIds: readonly string[];
    readonly responseKind: 'choice';
    readonly curriculumPhase: LearnerAuthoredCurriculumPhase;
    readonly prompt: LocalizedText;
    readonly options: readonly { readonly id: string; readonly label: LocalizedText }[];
    readonly answerSupport: AnswerSupportContract;
    readonly teachingSupport?: import('../domain/activity-runtime').ActivityTeachingSupport;
    readonly listening?: LearnerListeningSource;
    readonly provenance: LearnerAuthoredExerciseProvenance;
}

export interface LearnerListeningSource {
    readonly sourceLocator: string;
    readonly url: string;
    readonly transcript: readonly { readonly speaker: string; readonly text: string }[];
    readonly transcriptReveal: 'after-attempt';
}

export interface LearnerAuthoredText {
    readonly id: string;
    readonly kind: 'text';
    readonly sourceQuestionId: string;
    readonly conceptIds: readonly string[];
    readonly responseKind: 'text';
    readonly curriculumPhase: LearnerAuthoredCurriculumPhase;
    readonly prompt: LocalizedText;
    readonly options: readonly [];
    readonly answerSupport: AnswerSupportContract;
    readonly teachingSupport?: import('../domain/activity-runtime').ActivityTeachingSupport;
    readonly provenance: LearnerAuthoredExerciseProvenance;
}

export interface LearnerAuthoredExerciseProvenance {
    readonly packageId: AuthoredWeekId;
    readonly sourceQuestionId: string;
    readonly authoredSource?: {
        readonly exerciseId: string;
        readonly sourceQuestionId?: string;
        readonly sourcePromptExact?: string;
        readonly sourceOrder?: number;
        readonly locator?: Readonly<Record<string, unknown>>;
        readonly provenance?: Readonly<Record<string, unknown>>;
    };
}

export type LearnerAuthoredActivity = LearnerAuthoredChoice | LearnerAuthoredText | SourceVocabularySheetModel;

export type LearnerAuthoredCurriculumPhase =
    | 'context'
    | 'instruction'
    | 'guided-practice'
    | 'assessed-recognition'
    | 'assessed-production';

export interface AuthoredChoiceEvaluation {
    readonly result: GradeResult;
    readonly reviewSeeds: readonly ReviewSeed[];
}

interface Overlay {
    readonly conceptId: string;
    readonly feedback: { readonly en: string; readonly ja: string };
    readonly repair: { readonly en: string; readonly ja: string };
    readonly example: { readonly en: string; readonly ja: string };
    readonly review: ReviewSeed['content'];
}

interface AdaptedExercise {
    readonly exercise: AuthoredChoiceExercise | AuthoredExactExercise;
    readonly sourceQuestionId: string;
    readonly mapping?: Overlay;
    readonly curriculumPhase?: LearnerAuthoredCurriculumPhase;
    readonly authoredSource?: NonNullable<LearnerAuthoredExerciseProvenance['authoredSource']>;
}

const overlays: Readonly<Record<string, Overlay>> = {
    'l1-l01/ex-input-job': overlay('concept:self-introduction-job', 'エンジニアです', 'engineer'),
    'l1-l01/ex-grammar-particle': grammarOverlay('l1-l01/ex-grammar-particle', 'わたしは トムです', 'topic は'),
    'l1-l01/ex-grammar-negative': grammarOverlay('l1-l01/ex-grammar-negative', 'がくせいじゃ ありません', 'is not a student'),
    'l1-l01/ex-listen-gist': overlay('concept:listening-self-introduction', 'はじめまして', 'first meeting'),
    'l1-l01/ex-listen-detail': overlay('concept:listening-nationality', 'カナダじんです', 'Canadian'),
    'l1-l01/ex-soya-n5_mock1_l_19': overlay('concept:listening-n5-detail-19', 'こたえを ききとる', 'listen for the answer'),
    'l1-l01/ex-soya-n5_mock1_l_24': overlay('concept:listening-n5-detail-24', 'こたえを ききとる', 'listen for the answer'),
    'l1-l01/ex-read-who': overlay('concept:reading-occupation', 'アーカッシュさんは エンジニアです', 'Aakash is an engineer'),
    'l1-l01/ex-read-job': overlay('concept:reading-occupation', 'トムさんは かいしゃいんです', 'Tom is a company employee'),
    'l1-l01/ex-kanji-sannin': overlay('concept:kanji-sannin', '三人', 'three people', 'さんにん'),
    'l1-l01/ex-review-desu': grammarOverlay('l1-l01/ex-review-desu', 'がくせいです', 'is a student'),
    'l1-l02/ex-input-job': overlay('concept:self-introduction-job', 'たなかさんは せんせいです', 'Mr Tanaka is a teacher'),
    'l1-l02/ex-grammar-kochira': overlay('concept:demonstrative-kochira', 'こちらは ともだちです', 'this is my friend'),
    'l1-l02/ex-grammar-nani': overlay('concept:question-country', 'おくには どちらですか', 'what country are you from'),
    'l1-l02/ex-grammar-mo': overlay('concept:particle-mo', 'トムさんも かいしゃいんです', 'Tom is also an employee'),
    'l1-l02/ex-grammar-number': overlay('concept:number-hyaku', '百', 'one hundred', 'ひゃく'),
    'l1-l02/ex-listen-gist': overlay('concept:listening-introduction', 'しょうかいします', 'introducing someone'),
    'l1-l02/ex-soya-n5_listening_014': overlay('concept:listening-n5-detail-014', 'こたえを ききとる', 'listen for the answer'),
    'l1-l02/ex-read-study': overlay('concept:reading-field-of-study', 'みかさんの せんもん', "Mika's field of study"),
    'l1-l02/ex-read-nationality': overlay('concept:reading-nationality', 'アンヘルさんの こくせき', "Angel's nationality"),
    'l1-l02/ex-kanji-nihon': overlay('concept:kanji-nihon-meaning', '日本', 'Japan', 'にほん'),
    'l1-l02/ex-review-negative': overlay('concept:copula-negative', '日本人じゃ ありません', 'is not Japanese'),
    'l1-l03/ex-input-affil': overlay('concept:affiliation-no', 'さくらだいがくの がくせい', 'a Sakura University student'),
    'l1-l03/ex-input-senmon': overlay('concept:field-of-study', 'せんもん', 'field of study'),
    'l1-l03/ex-vocab-nationality': overlay('concept:nationality-jin', 'ちゅうごくじん', 'Chinese person'),
    'l1-l03/ex-question-word': overlay('concept:question-country', 'おくには どちらですか', 'what country are you from'),
    'l1-l03/ex-nan-nansai': overlay('concept:question-job', 'おしごとは なんですか', 'what is your job'),
    'l1-l03/ex-listen-from': overlay('concept:listening-nationality', 'みかさんは どこから', 'where Mika is from'),
    'l1-l03/ex-read-nationality': overlay('concept:reading-nationality', 'マリアさんの こくせき', "Maria's nationality"),
    'l1-l03/ex-read-job': overlay('concept:reading-occupation', 'ヤンさんの しごと', "Yan's job"),
    'l1-l03/ex-kanji-nihon': overlay('concept:kanji-nihon-reading', '日本', 'Japan', 'にほん'),
    'l1-l03/ex-kanji-sannin': overlay('concept:kanji-sannin', '三人', 'three people', 'さんにん'),
    'l1-l03/ex-review-neg': overlay('concept:copula-negative', 'アメリカじんじゃ ありません', 'is not American'),
    'l1-l04/ex-input-whose': overlay('concept:possession-no', 'だれの カードですか', 'whose card'),
    'l1-l04/ex-grammar-kosoa': overlay('concept:kosoado-object', 'それは なんですか', 'what is that'),
    'l1-l04/ex-grammar-desu-ka': overlay('concept:question-ka', 'それは かばんですか', 'is that a bag'),
    'l1-l04/ex-listen-gist': overlay('concept:listening-object', 'かぎを みせる', 'showing a key'),
    'l1-l04/ex-read-who': overlay('concept:reading-possession', 'だれの いぬ', 'whose dog'),
    'l1-l04/ex-read-where': overlay('concept:reading-nationality', 'アーカッシュさんの くに', "Aakash's country"),
    'l1-l04/ex-kanji-person': overlay('concept:kanji-hito', '人', 'person', 'ひと'),
    'l1-l04/ex-kanji-count': overlay('concept:kanji-three', '三', 'three', 'さん'),
    'l1-l04/ex-review-wa': overlay('concept:topic-particle-wa', 'は', 'topic particle wa', 'わ'),
    'l1-l05/ex-input-whose': overlay('concept:possession-owner', 'もちぬし', 'owner'),
    'l1-l05/ex-kore-sore': overlay('concept:kosoado-object', 'それは ほんです', 'that is a book'),
    'l1-l05/ex-dareno': overlay('concept:question-dare-no', 'これは だれの かぎですか', 'whose key is this'),
    'l1-l05/ex-listen-gist': overlay('concept:listening-possession', 'もちぬしを さがす', 'finding the owner'),
    'l1-l05/ex-listen-detail': overlay('concept:listening-possession', 'だれの かばん', 'whose bag'),
    'l1-l05/ex-read-wa': overlay('concept:topic-particle-wa', 'わたしは', 'as for me'),
    'l1-l05/ex-kanji-read': overlay('concept:kanji-six', '六', 'six', 'ろく'),
    'l1-l05/ex-review-mo': overlay('concept:particle-mo', 'トムさんも がくせいです', 'Tom is also a student'),
    'l1-l05/ex-review-no': overlay('concept:noun-linking-no', 'にほんごの せんせい', 'teacher of Japanese'),
    'l1-l06/ex-input-price': overlay('concept:price-ikura', 'せんえん', '1,000 yen'),
    'l1-l06/ex-kore-choice': overlay('concept:kosoado-object', 'これは ほんです', 'this is a book'),
    'l1-l06/ex-no-choice': overlay('concept:possession-no', 'わたしのです', 'it is mine'),
    'l1-l06/ex-doko-choice': overlay('concept:kosoado-place', 'あそこ', 'over there'),
    'l1-l06/ex-listen-price': overlay('concept:listening-price', 'はっぴゃくえん', '800 yen'),
    'l1-l06/ex-listen-floor': overlay('concept:listening-floor', 'さんがい', 'third floor'),
    'l1-l06/ex-soya-n5_listening_004': overlay('concept:listening-n5-detail-004', 'コーヒー', 'coffee'),
    'l1-l06/ex-soya-n5_listening_010': overlay('concept:listening-n5-detail-010', '赤い傘', 'red umbrella'),
    'l1-l06/ex-read-floor': overlay('concept:reading-floor', 'にかい', 'second floor'),
    'l1-l06/ex-read-where': overlay('concept:reading-location', 'ちか', 'basement'),
    'l1-l06/ex-kanji-floor': overlay('concept:kanji-two-floor', '二かい', 'second floor', 'にかい'),
    'l1-l06/ex-review-janai': overlay('concept:copula-negative', 'じゃ ありません', 'is not'),
    'l1-l06/ex-review-no': overlay('concept:possession-no', 'トムさんのです', "it is Tom's"),
    'l1-l07/ex-input-floor': overlay('concept:floor-location', 'さんがい', 'third floor'),
    'l1-l07/ex-doko': overlay('concept:question-doko', 'どこ', 'where'),
    'l1-l07/ex-asoko': overlay('concept:kosoado-place', 'あそこ', 'over there'),
    'l1-l07/ex-dochira': overlay('concept:demonstrative-dochira', 'どちら', 'which way or where politely'),
    'l1-l07/ex-listen-gist': overlay('concept:listening-shopping-gist', 'シャツと CDうりば', 'buying a shirt and asking for the CD counter'),
    'l1-l07/ex-read-where': overlay('concept:reading-location', 'えきの まえ', 'in front of the station'),
    'l1-l07/ex-read-price': overlay('concept:reading-price', 'せんえん', '1,000 yen each'),
    'l1-l07/ex-kanji-floor': overlay('concept:kanji-three-floor', '三かい', 'third floor', 'さんがい'),
    'l1-l07/ex-review-kore-koko': overlay('concept:kosoado-object', 'これは ほんです', 'this is a book'),
    'l1-l08/ex-input-time': overlay('concept:time-start-kara', 'くじから', 'from nine'),
    'l1-l08/ex-input-longvowel': overlay('concept:long-vowel-obāsan', 'おばあさん', 'grandmother'),
    'l1-l08/ex-input-gakkou': overlay('concept:small-tsu-gakkou', 'がっこう', 'school'),
    'l1-l08/ex-vocab-time': overlay('concept:time-half-past', 'さんじはん', 'half past three'),
    'l1-l08/ex-ni-particle': overlay('concept:time-particle-ni', 'しちじに おきます', 'get up at seven'),
    'l1-l08/ex-verb-past-neg': overlay('concept:verb-past-negative', 'べんきょうしませんでした', 'did not study'),
    'l1-l08/ex-listen-hours': overlay('concept:listening-opening-hours', 'あさ はちじから よる じゅうじまで', '8 a.m. to 10 p.m.'),
    'l1-l08/ex-listen-closed': overlay('concept:listening-closed-day', 'にちようび', 'Sunday'),
    'l1-l08/ex-soya-n5_listening_009': overlay('concept:listening-n5-detail-009', '6時', 'six o’clock'),
    'l1-l08/ex-soya-n5_listening_006': overlay('concept:listening-n5-detail-006', '日曜日', 'Sunday'),
    'l1-l08/ex-read-closed': overlay('concept:reading-closed-day', 'げつようび', 'Monday'),
    'l1-l08/ex-read-price': overlay('concept:reading-price', 'ごひゃくえん', '500 yen'),
    'l1-l08/ex-kanji-count': overlay('concept:kanji-three', '三', 'three', 'さん'),
    'l1-l08/ex-kanji-read': overlay('concept:kanji-sunday', '日ようび', 'Sunday', 'にちようび'),
    'l1-l08/ex-review-ikura': overlay('concept:price-ikura', 'ごひゃくえんです', 'it is 500 yen'),
    'l1-l09/ex-input-start': overlay('concept:time-start-kara', 'はちじから', 'from eight o’clock'),
    'l1-l09/ex-time-read': overlay('concept:time-four', 'よじ', 'four o’clock'),
    'l1-l09/ex-day-past': overlay('concept:copula-past', 'げつようびでした', 'was Monday'),
    'l1-l09/ex-listen-gist': overlay('concept:listening-meeting-gist', 'えいがの まちあわせ', 'when to meet for a film'),
    'l1-l09/ex-listen-time': overlay('concept:listening-meeting-time', 'さんじ', 'three o’clock'),
    'l1-l09/ex-soya-n5_listening_018': overlay('concept:listening-n5-detail-018', '10時', 'ten o’clock'),
    'l1-l09/ex-read-day': overlay('concept:reading-weekday', 'すいようび', 'Wednesday'),
    'l1-l09/ex-read-time': overlay('concept:reading-finish-time', 'しちじはん', 'half past seven'),
    'l1-l09/ex-kanji-oclock': overlay('concept:kanji-three-time', '三じ', 'three o’clock', 'さんじ'),
    'l1-l09/ex-kanji-day': overlay('concept:kanji-day', '日', 'day or sun', 'ひ・にち'),
    'l1-l09/ex-review-number': overlay('concept:number-three-hundred', 'さんびゃくえん', '300 yen'),
    'l1-l09/ex-review-kore': overlay('concept:kosoado-object', 'それ', 'that near you'),
    'l1-l10/ex-cafe-closed': overlay('concept:closed-day', 'にちようび', 'Sunday'),
    'l1-l10/ex-verb-past': overlay('concept:verb-past-negative', 'べんきょうしませんでした', 'did not study'),
    'l1-l10/ex-ne-use': overlay('concept:sentence-particle-ne', 'じゅうじまでですね', 'inviting agreement'),
    'l1-l10/ex-listen-gist': overlay('concept:listening-work-schedule', 'しごとの じかん', "Jodi's work schedule"),
    'l1-l10/ex-listen-detail': overlay('concept:listening-start-time', 'くじから', 'from nine'),
    'l1-l10/ex-soya-n5_listening_023': overlay('concept:listening-n5-detail-023', '3時', 'three o’clock'),
    'l1-l10/ex-read-wake': overlay('concept:reading-wake-time', 'ろくじはん', 'half past six'),
    'l1-l10/ex-read-weekend': overlay('concept:reading-weekend-routine', 'やすみます', 'they rest'),
    'l1-l10/ex-kanji-time': overlay('concept:kanji-three-time', '三じ', 'three o’clock', 'さんじ'),
    'l1-l10/ex-review-numbers': overlay('concept:number-nine-hundred', 'きゅうひゃくえん', '900 yen'),
    'l1-l10/ex-review-kore': overlay('concept:kosoado-object', 'これは ほんです', 'this is a book'),
};

export function adaptAuthoredWeek(input: unknown, source: AuthoredWeekSource): LearnerAuthoredWeek {
    const authored = parseAuthoredWeekPackage(input);
    if (!(authored.id in AUTHORED_WEEK_HASHES)) throw new TypeError(`Unsupported authored package ${authored.id}.`);
    const id = authored.id as AuthoredWeekId;
    if (source.sha256 !== AUTHORED_WEEK_HASHES[id]) throw new TypeError(`Hash mismatch for ${id}.`);
    const seen = new Set<string>();
    const supportsGroundedExact = !isLegacyAuthoredWeek(id);
    const activities: LearnerAuthoredActivity[] = [];
    const sourceVocabularyActivities = new Map<string, SourceVocabularySheetModel>();
    const sourceVocabularyRuntime = createActivityRuntime([sourceVocabularySheetPlugin]);
    const answers = new Map<string,
        | { kind: 'choice'; exercise: AuthoredChoiceExercise; mapping: Overlay }
        | { kind: 'text'; exercise: AuthoredExactExercise; mapping: Overlay }>();
    for (const [componentIndex, component] of authored.components.entries()) {
        if (component.sourceVocabularySheet) {
            for (const activity of toSourceVocabularyActivities(id, component.sourceVocabularySheet)) {
                if (seen.has(activity.sourceQuestionId)) {
                    throw new TypeError(`Duplicate source item id ${activity.sourceQuestionId}.`);
                }
                seen.add(activity.sourceQuestionId);
                const issues = sourceVocabularyRuntime.validate(activity);
                if (issues.length) {
                    throw new TypeError(`Invalid source vocabulary row ${activity.sourceQuestionId}: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
                }
                activities.push(activity);
                sourceVocabularyActivities.set(activity.id, activity);
            }
        }
        for (const [exerciseIndex, value] of (component.exercises ?? []).entries()) {
            const path = `package.components[${componentIndex}].exercises[${exerciseIndex}]`;
            const normalized = normalizeLegacyChoice(id, value, path);
            const packagedListening = parsePackagedListeningChoice(id, value, path);
            const choice = parseChoiceExercise(normalized, path) ?? packagedListening?.exercise;
            const exact = choice || !supportsGroundedExact ? undefined : parseExactExercise(normalized, path);
            const adapted: readonly AdaptedExercise[] = choice || exact
                ? [{ exercise: choice ?? exact!, sourceQuestionId: `${id}/${(choice ?? exact)!.id}` }]
                : adaptSupportedSourceExercise(id, normalized, path);
            for (const item of adapted) {
                const { exercise, sourceQuestionId } = item;
                if (seen.has(sourceQuestionId)) throw new TypeError(`Duplicate exercise id ${sourceQuestionId}.`);
                seen.add(sourceQuestionId);
                const mapping = item.mapping ?? overlays[sourceQuestionId] ?? derivedOverlay(id, exercise);
                if (!mapping) throw new TypeError(`Missing explicit overlay for ${sourceQuestionId}.`);
                const activity = exercise.kind === 'choice'
                    ? toChoiceActivity(
                        id,
                        exercise,
                        sourceQuestionId,
                        mapping,
                        component.teachingSupport,
                        packagedListening?.listening,
                        item.curriculumPhase,
                        item.authoredSource,
                    )
                    : toTextActivity(
                        id,
                        exercise,
                        sourceQuestionId,
                        mapping,
                        component.teachingSupport,
                        item.curriculumPhase,
                        item.authoredSource,
                    );
                activities.push(activity);
                answers.set(activity.id, { kind: exercise.kind === 'choice' ? 'choice' : 'text', exercise, mapping } as
                    | { kind: 'choice'; exercise: AuthoredChoiceExercise; mapping: Overlay }
                    | { kind: 'text'; exercise: AuthoredExactExercise; mapping: Overlay });
            }
        }
    }
    const media = authored.components.flatMap(component => component.audio ? [{
        assetId: component.audio.assetId,
        status: 'unavailable' as const,
        reason: 'unresolved-academy-locator' as const,
        sourceLocator: component.audio.locator,
    }] : []);
    const week: LearnerAuthoredWeek = {
        id,
        activities,
        media,
        provenance: { source: { ...source }, packageId: id, packageProvenance: authored.provenance },
        evaluate(activityId, responseId) {
            const sourceVocabulary = sourceVocabularyActivities.get(activityId);
            if (sourceVocabulary) {
                const evaluation = sourceVocabularyRuntime.evaluate(sourceVocabulary, responseId);
                return { result: evaluation.result, reviewSeeds: evaluation.reviewSeeds };
            }
            const answer = answers.get(activityId);
            if (!answer) throw new TypeError(`Unknown authored activity ${activityId}.`);
            const passed = answer.kind === 'choice'
                ? answer.exercise.options.find(candidate => candidate.id === responseId)?.correct
                : acceptedExactAnswers(answer.exercise).has(normalizeExactAnswer(responseId));
            if (passed === undefined) throw new TypeError(`Unknown choice response ${responseId}.`);
            const result: GradeResult = {
                outcome: passed ? 'pass' : 'lapse',
                score: passed ? 1 : 0,
                errorTags: passed ? [] : [`${answer.mapping.conceptId}:repair`],
                feedback: {
                    explanation: answer.mapping.feedback,
                    ...(passed ? {} : { repairPrompt: answer.mapping.repair, nearbyExample: answer.mapping.example }),
                },
            };
            return {
                result,
                reviewSeeds: [{
                    id: `review:${answer.exercise.id}:${answer.mapping.conceptId}`,
                    conceptId: answer.mapping.conceptId,
                    reason: passed ? 'new-learning' : 'repair',
                    sourceQuestionId: `${id}/${answer.exercise.id}`,
                    content: answer.mapping.review,
                }],
            };
        },
    };
    return assertAuthoredWeekPedagogy(week);
}

function toSourceVocabularyActivities(
    packageId: AuthoredWeekId,
    sheet: AuthoredSourceVocabularySheet,
): readonly SourceVocabularySheetModel[] {
    return sheet.items.map(item => {
        const locus = item.source.locus;
        const activityLocus = `${sheet.componentId}:p${locus.page}:r${locus.row}`;
        const conceptId = `concept:${packageId}:source-vocabulary:${activityLocus}`;
        return {
            id: `authored:${packageId}/${activityLocus}`,
            kind: 'academy-source-vocabulary-sheet' as const,
            sourceQuestionId: item.source.itemId,
            conceptIds: [conceptId],
            responseKind: 'source-vocabulary-recall' as const,
            curriculumPhase: 'assessed-recognition' as const,
            prompt: sheet.sourceInstructions,
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            teachingSupport: {
                kind: 'context' as const,
                title: { ja: '思い出すコツ', en: 'Recall strategy' },
                entries: [{
                    japanese: locus.row % 2 === 1
                        ? 'まず意味を思い出してから、短く答えましょう。'
                        : '意味から、ことばの音や形を思い出しましょう。',
                    translation: locus.row % 2 === 1
                        ? 'Recall the meaning first, then answer briefly.'
                        : 'Use the meaning to recall the word\'s sound or shape.',
                }],
            },
            provenance: {
                packageId,
                componentId: sheet.componentId,
                sourceId: sheet.provenance.sourceId,
                sourceQuestionId: item.source.itemId,
                payloadSha256: item.source.payloadSha256,
                sourceTitle: item.source.title,
                locus: { ...locus },
            },
            payload: {
                exact: { ...item.source.exact },
                support: { words: item.ja, reading: item.reading, meaning: item.en },
                fieldProvenance: { ...item.source.fieldProvenance },
            },
        };
    });
}

const L1_L10_UNWRAPPED_LABEL_EXERCISES = new Set([
    'ex-listen-gist',
    'ex-listen-detail',
    'ex-read-wake',
    'ex-read-weekend',
]);

function normalizeLegacyChoice(packageId: AuthoredWeekId, value: unknown, path: string): unknown {
    if (packageId !== 'l1-l10' || !value || typeof value !== 'object' || Array.isArray(value)) return value;
    const exercise = value as Readonly<Record<string, unknown>>;
    if (typeof exercise.id !== 'string' || !L1_L10_UNWRAPPED_LABEL_EXERCISES.has(exercise.id)) return value;
    if (!Array.isArray(exercise.options)) throw new TypeError(`${path}.options must be an array.`);
    const options = exercise.options.map((candidate, index) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            throw new TypeError(`${path}.options[${index}] must be an object.`);
        }
        const option = candidate as Readonly<Record<string, unknown>>;
        if (option.label !== undefined || typeof option.en !== 'string' || typeof option.ja !== 'string') {
            throw new TypeError(`${path}.options[${index}] does not match the known l1-l10 label shape.`);
        }
        return { ...option, label: { en: option.en, ja: option.ja } };
    });
    return { ...exercise, options };
}

function adaptSupportedSourceExercise(
    packageId: AuthoredWeekId,
    value: unknown,
    path: string,
): readonly AdaptedExercise[] {
    const candidate = recordField(value, path);
    if (candidate.kind !== 'cloze' && candidate.kind !== 'matching' && candidate.kind !== 'ordering') return [];
    if (candidate.autoGraded === false) return [];
    if (candidate.autoGraded !== true) throw new TypeError(`${path}.autoGraded must be true or false.`);
    switch (candidate.kind) {
        case 'cloze':
            return adaptClozeExercise(packageId, candidate, path);
        case 'matching':
            return adaptMatchingExercise(packageId, candidate, path);
        case 'ordering':
            return adaptOrderingExercise(packageId, candidate, path);
    }
}

function adaptClozeExercise(
    packageId: AuthoredWeekId,
    candidate: Readonly<Record<string, unknown>>,
    path: string,
): readonly AdaptedExercise[] {
    const id = textField(candidate.id, `${path}.id`);
    const prompt = localizedField(candidate.prompt, `${path}.prompt`, 'Fill the gap.');
    const japanese = textField(candidate.japanese, `${path}.japanese`);
    const explanation = textField(candidate.explanation, `${path}.explanation`);
    const reviewTag = optionalTextField(candidate.reviewTag, `${path}.reviewTag`);
    const blanks = arrayField(candidate.blanks, `${path}.blanks`);
    if (!blanks.length) throw new TypeError(`${path}.blanks must contain at least one blank.`);
    const blankIds = new Set<string>();
    const curriculumPhase = sourceCurriculumPhase(candidate, path, 'guided-practice');
    const authoredSource = authoredSourceProvenance(candidate, id, path);
    return blanks.map((value, index) => {
        const blankPath = `${path}.blanks[${index}]`;
        const blank = recordField(value, blankPath);
        const blankId = textField(blank.id, `${blankPath}.id`);
        if (blankIds.has(blankId)) throw new TypeError(`Duplicate cloze blank id ${packageId}/${id}/${blankId}.`);
        blankIds.add(blankId);
        const wrongAnswers = wrongAnswerTriggers(candidate.wrongAnswerExplanations, `${path}.wrongAnswerExplanations`);
        const answer = exactAnswerField(blank.answer, `${blankPath}.answer`, wrongAnswers);
        const sourceQuestionId = `${packageId}/${id}${blanks.length === 1 ? '' : `:${blankId}`}`;
        const exercisePrompt = sourcePrompt(
            prompt,
            safeClozeSource(japanese, answer.primary),
            blanks.length === 1 ? undefined : {
                en: `Blank ${index + 1} of ${blanks.length}`,
                ja: `${index + 1} / ${blanks.length}`,
            },
        );
        const exercise: AuthoredExactExercise = {
            id: blanks.length === 1 ? id : `${id}:${blankId}`,
            kind: 'exact',
            prompt: exercisePrompt,
            explanation,
            ...(reviewTag ? { reviewTag } : {}),
            autoGraded: true,
            answer,
        };
        return {
            exercise,
            sourceQuestionId,
            mapping: sourceExerciseOverlay(
                packageId,
                `${reviewTag ?? id}:${blankId}`,
                answer.primary,
                explanation,
                explanation,
            ),
            curriculumPhase,
            authoredSource,
        };
    });
}

function adaptMatchingExercise(
    packageId: AuthoredWeekId,
    candidate: Readonly<Record<string, unknown>>,
    path: string,
): readonly AdaptedExercise[] {
    if (candidate.pluginTarget !== 'academy-drag-sort') {
        throw new TypeError(`${path}.pluginTarget must be academy-drag-sort for an auto-graded matching exercise.`);
    }
    const id = textField(candidate.id, `${path}.id`);
    const prompt = localizedField(candidate.prompt, `${path}.prompt`, 'Match each item to its answer.');
    const explanation = textField(candidate.explanation, `${path}.explanation`);
    const sourceItems = textArrayField(candidate.sourceItemsExact, `${path}.sourceItemsExact`);
    const answers = recordField(candidate.answers, `${path}.answers`);
    const values = textArrayField(answers.values, `${path}.answers.values`);
    if (sourceItems.length < 2 || sourceItems.length !== values.length) {
        throw new TypeError(`${path} must have the same number of source items and matching answers.`);
    }
    if (new Set(values).size !== values.length) {
        throw new TypeError(`${path}.answers.values must be unique for deterministic matching.`);
    }
    const curriculumPhase = sourceCurriculumPhase(candidate, path, 'guided-practice');
    const authoredSource = authoredSourceProvenance(candidate, id, path);
    return sourceItems.map((sourceItem, itemIndex) => {
        const exerciseId = `${id}:match-${itemIndex + 1}`;
        const displayedAnswers = rotate(values, (itemIndex * 2) + 1);
        const exercise: AuthoredChoiceExercise = {
            id: exerciseId,
            kind: 'choice',
            prompt: sourcePrompt(prompt, sourceItem, {
                en: `Item ${itemIndex + 1} of ${sourceItems.length}`,
                ja: `${itemIndex + 1} / ${sourceItems.length}`,
            }),
            explanation,
            autoGraded: true,
            options: displayedAnswers.map((answer, optionIndex) => ({
                id: `match-option-${optionIndex + 1}`,
                label: { en: answer, ja: answer },
                correct: answer === values[itemIndex],
            })),
        };
        return {
            exercise,
            sourceQuestionId: `${packageId}/${exerciseId}`,
            mapping: sourceExerciseOverlay(packageId, id, values[itemIndex], explanation, sourceItem),
            curriculumPhase,
            authoredSource,
        };
    });
}

function adaptOrderingExercise(
    packageId: AuthoredWeekId,
    candidate: Readonly<Record<string, unknown>>,
    path: string,
): readonly AdaptedExercise[] {
    if (candidate.pluginTarget !== 'academy-sequence') {
        throw new TypeError(`${path}.pluginTarget must be academy-sequence for an auto-graded ordering exercise.`);
    }
    const id = textField(candidate.id, `${path}.id`);
    const prompt = localizedField(candidate.prompt, `${path}.prompt`, 'Put the items in order.');
    const explanation = textField(candidate.explanation, `${path}.explanation`);
    const curriculumPhase = sourceCurriculumPhase(candidate, path, 'guided-practice');
    const authoredSource = authoredSourceProvenance(candidate, id, path);
    if (candidate.tiles !== undefined || candidate.answer !== undefined) {
        const tiles = textArrayField(candidate.tiles, `${path}.tiles`);
        if (tiles.length < 2 || new Set(tiles).size !== tiles.length) {
            throw new TypeError(`${path}.tiles must contain at least two unique source tiles.`);
        }
        const answer = exactAnswerField(candidate.answer, `${path}.answer`);
        const displayedTiles = deterministicShuffle(tiles, `${packageId}:${id}`);
        const exercise: AuthoredExactExercise = {
            id,
            kind: 'exact',
            prompt: sourcePrompt(prompt, {
                en: `Tiles: ${displayedTiles.join(' / ')}`,
                ja: `カード: ${displayedTiles.join(' / ')}`,
            }),
            explanation,
            autoGraded: true,
            answer,
        };
        return [{
            exercise,
            sourceQuestionId: `${packageId}/${id}`,
            mapping: sourceExerciseOverlay(packageId, id, answer.primary, explanation, prompt.en),
            curriculumPhase,
            authoredSource,
        }];
    }

    const sourceItems = textArrayField(candidate.sourceItemsExact, `${path}.sourceItemsExact`);
    const answers = recordField(candidate.answers, `${path}.answers`);
    const values = textArrayField(answers.values, `${path}.answers.values`);
    if (!sourceItems.length || sourceItems.length !== values.length) {
        throw new TypeError(`${path} must have the same number of ordering cues and answers.`);
    }
    const workedExample = optionalTextField(candidate.workedExampleExact, `${path}.workedExampleExact`);
    return sourceItems.map((sourceItem, index) => {
        const exerciseId = `${id}:item-${index + 1}`;
        const exercisePrompt = sourcePrompt(
            prompt,
            sourceItem,
            workedExample ? { en: `Source example: ${workedExample}`, ja: `例: ${workedExample}` } : undefined,
        );
        const exercise: AuthoredExactExercise = {
            id: exerciseId,
            kind: 'exact',
            prompt: exercisePrompt,
            explanation,
            autoGraded: true,
            answer: { primary: values[index], alternatives: [] },
        };
        return {
            exercise,
            sourceQuestionId: `${packageId}/${exerciseId}`,
            mapping: sourceExerciseOverlay(packageId, id, values[index], explanation, sourceItem),
            curriculumPhase,
            authoredSource,
        };
    });
}

function sourcePrompt(
    prompt: LocalizedText,
    source: string | LocalizedText,
    scaffold?: LocalizedText,
): LocalizedText {
    const sourceText = typeof source === 'string' ? { en: source, ja: source } : source;
    return {
        en: [prompt.en, sourceText.en, scaffold?.en].filter(Boolean).join('\n'),
        ja: [prompt.ja, sourceText.ja, scaffold?.ja].filter(Boolean).join('\n'),
    };
}

function exactAnswerField(
    value: unknown,
    path: string,
    rejected: ReadonlySet<string> = new Set(),
): AuthoredExactExercise['answer'] {
    const answer = recordField(value, path);
    const primary = textField(answer.primary, `${path}.primary`);
    const alternatives = answer.alternatives === undefined
        ? []
        : textArrayField(answer.alternatives, `${path}.alternatives`);
    return {
        primary,
        alternatives: alternatives.filter(candidate => !rejected.has(normalizeExactAnswer(candidate))),
    };
}

function wrongAnswerTriggers(value: unknown, path: string): ReadonlySet<string> {
    if (value === undefined) return new Set();
    return new Set(arrayField(value, path).map((candidate, index) => {
        const item = recordField(candidate, `${path}[${index}]`);
        return normalizeExactAnswer(textField(item.trigger, `${path}[${index}].trigger`));
    }));
}

function safeClozeSource(source: string, primary: string): string {
    const normalizedPrimary = normalizeExactAnswer(primary);
    if (normalizeExactAnswer(source) === normalizedPrimary) return '＿＿＿';
    const arrow = source.indexOf('→');
    if (arrow >= 0) {
        if (normalizeExactAnswer(source.slice(arrow + 1)) === normalizedPrimary) {
            return `${source.slice(0, arrow + 1)} ＿＿＿`;
        }
        if (normalizeExactAnswer(source.slice(0, arrow)) === normalizedPrimary) return '＿＿＿';
    }
    return source;
}

function textArrayField(value: unknown, path: string): readonly string[] {
    return arrayField(value, path).map((candidate, index) => textField(candidate, `${path}[${index}]`));
}

function rotate<T>(values: readonly T[], offset: number): readonly T[] {
    const split = offset % values.length;
    return [...values.slice(split), ...values.slice(0, split)];
}

function deterministicShuffle<T>(values: readonly T[], seed: string): readonly T[] {
    const shuffled = [...values];
    let state = [...seed].reduce((hash, character) => ((hash * 31) + character.codePointAt(0)!) >>> 0, 2166136261);
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        state = ((state * 1664525) + 1013904223) >>> 0;
        const swapIndex = state % (index + 1);
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled.every((value, index) => value === values[index]) ? rotate(shuffled, 1) : shuffled;
}

function optionalTextField(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : textField(value, path);
}

function sourceCurriculumPhase(
    candidate: Readonly<Record<string, unknown>>,
    path: string,
    fallback: LearnerAuthoredCurriculumPhase,
): LearnerAuthoredCurriculumPhase {
    const curriculumPhase = candidate.curriculumPhase;
    if (curriculumPhase !== undefined) {
        if (typeof curriculumPhase !== 'string') throw new TypeError(`${path}.curriculumPhase is not supported.`);
        switch (curriculumPhase) {
            case 'context':
            case 'instruction':
            case 'guided-practice':
            case 'assessed-recognition':
            case 'assessed-production':
                return curriculumPhase;
            default:
                throw new TypeError(`${path}.curriculumPhase is not supported.`);
        }
    }
    const phase = candidate.phase;
    if (phase === undefined) return fallback;
    if (typeof phase !== 'string') throw new TypeError(`${path}.phase is not supported.`);
    switch (phase) {
        case 'context':
        case 'instruction':
        case 'guided-practice':
        case 'constrained-practice':
        case 'assessed-production':
        case 'supported-production':
        case 'transfer':
        case 'prestudy':
            return learnerCurriculumPhase(phase, fallback);
        default:
            throw new TypeError(`${path}.phase is not supported.`);
    }
}

function authoredSourceProvenance(
    candidate: Readonly<Record<string, unknown>>,
    exerciseId: string,
    path: string,
): NonNullable<LearnerAuthoredExerciseProvenance['authoredSource']> {
    const sourceQuestionId = optionalTextField(candidate.sourceQuestionId, `${path}.sourceQuestionId`);
    const sourcePromptExact = optionalTextField(
        candidate.sourcePromptExact ?? candidate.sourceCueExact,
        `${path}.${candidate.sourcePromptExact !== undefined ? 'sourcePromptExact' : 'sourceCueExact'}`,
    );
    const sourceOrder = candidate.sourceOrder === undefined
        ? undefined
        : finiteNumberField(candidate.sourceOrder, `${path}.sourceOrder`);
    const locator = candidate.source === undefined ? undefined : { ...recordField(candidate.source, `${path}.source`) };
    const provenance = candidate.provenance === undefined
        ? undefined
        : { ...recordField(candidate.provenance, `${path}.provenance`) };
    return {
        exerciseId,
        ...(sourceQuestionId ? { sourceQuestionId } : {}),
        ...(sourcePromptExact ? { sourcePromptExact } : {}),
        ...(sourceOrder !== undefined ? { sourceOrder } : {}),
        ...(locator ? { locator } : {}),
        ...(provenance ? { provenance } : {}),
    };
}

function finiteNumberField(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${path} must be finite.`);
    return value;
}

function sourceExerciseOverlay(
    packageId: AuthoredWeekId,
    conceptKey: string,
    expression: string,
    explanation: string,
    meaning: string,
): Overlay {
    return {
        conceptId: `concept:${packageId}:${conceptKey}`,
        feedback: { en: explanation, ja: `答えを確認しましょう：${expression}。` },
        repair: { en: 'Try once more using the source wording and scaffold.', ja: 'もとの文とヒントを見て、もう一度答えましょう。' },
        example: { en: `Source target: ${expression}`, ja: `答えの例：${expression}` },
        review: { expression, meanings: [meaning] },
    };
}

function toChoiceActivity(
    packageId: AuthoredWeekId,
    exercise: AuthoredChoiceExercise,
    sourceQuestionId: string,
    mapping: Overlay,
    teachingSupport: import('../domain/activity-runtime').ActivityTeachingSupport,
    listening?: LearnerAuthoredChoice['listening'],
    curriculumPhase?: LearnerAuthoredCurriculumPhase,
    authoredSource?: NonNullable<LearnerAuthoredExerciseProvenance['authoredSource']>,
): LearnerAuthoredChoice {
    const correct = exercise.options.filter(option => option.correct);
    if (correct.length !== 1) throw new TypeError(`${sourceQuestionId} must have exactly one correct option.`);
    const optionIds = new Set<string>();
    const options = exercise.options.map(option => {
        if (optionIds.has(option.id)) throw new TypeError(`Duplicate option id ${sourceQuestionId}/${option.id}.`);
        optionIds.add(option.id);
        return { id: option.id, label: option.label };
    });
    return {
        id: `authored:${sourceQuestionId}`,
        kind: 'choice',
        sourceQuestionId,
        conceptIds: [mapping.conceptId],
        responseKind: 'choice',
        curriculumPhase: curriculumPhase ?? learnerCurriculumPhase(exercise.phase, 'assessed-recognition'),
        prompt: exercise.prompt,
        options,
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport,
        ...(listening ? { listening } : {}),
        provenance: { packageId, sourceQuestionId, ...(authoredSource ? { authoredSource } : {}) },
    };
}

function parsePackagedListeningChoice(
    packageId: AuthoredWeekId,
    value: unknown,
    path: string,
): { exercise: AuthoredChoiceExercise; listening: NonNullable<LearnerAuthoredChoice['listening']> } | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const candidate = value as Readonly<Record<string, unknown>>;
    if (candidate.kind !== 'quarantined-listening-choice') return undefined;
    if (typeof candidate.audioRef !== 'string' || !candidate.audioRef.trim()) return undefined;
    const id = textField(candidate.id, `${path}.id`);
    const locator = textField(candidate.audioRef, `${path}.audioRef`);
    const url = resolvePackagedListeningTask(packageId, id, locator);
    if (!url) return undefined;
    const prompt = localizedField(candidate.prompt, `${path}.prompt`, 'Listen carefully and choose the answer.');
    const options = arrayField(candidate.options, `${path}.options`).map((option, index) => {
        const item = recordField(option, `${path}.options[${index}]`);
        return {
            id: textField(item.id, `${path}.options[${index}].id`),
            label: localizedField(item.label, `${path}.options[${index}].label`, textField(recordField(item.label, `${path}.options[${index}].label`).ja, `${path}.options[${index}].label.ja`)),
            correct: booleanField(item.correct, `${path}.options[${index}].correct`),
        };
    });
    const transcript = recordField(candidate.transcript, `${path}.transcript`);
    const script = arrayField(transcript.script, `${path}.transcript.script`).map((line, index) => {
        const item = recordField(line, `${path}.transcript.script[${index}]`);
        return { speaker: textField(item.speaker, `${path}.transcript.script[${index}].speaker`), text: textField(item.text, `${path}.transcript.script[${index}].text`) };
    });
    return {
        exercise: {
            id,
            kind: 'choice',
            prompt,
            explanation: textField(candidate.explanation, `${path}.explanation`),
            autoGraded: true,
            options,
        },
        listening: { sourceLocator: locator, url, transcript: script, transcriptReveal: 'after-attempt' },
    };
}

function localizedField(value: unknown, path: string, fallbackEnglish: string): LocalizedText {
    const item = recordField(value, path);
    const ja = textField(item.ja, `${path}.ja`);
    return { ja, en: typeof item.en === 'string' && item.en.trim() ? item.en : fallbackEnglish };
}

function recordField(value: unknown, path: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function arrayField(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
    return value;
}

function textField(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${path} must be non-empty text.`);
    return value;
}

function booleanField(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`${path} must be boolean.`);
    return value;
}

function toTextActivity(
    packageId: AuthoredWeekId,
    exercise: AuthoredExactExercise,
    sourceQuestionId: string,
    mapping: Overlay,
    teachingSupport: import('../domain/activity-runtime').ActivityTeachingSupport,
    curriculumPhase?: LearnerAuthoredCurriculumPhase,
    authoredSource?: NonNullable<LearnerAuthoredExerciseProvenance['authoredSource']>,
): LearnerAuthoredText {
    return {
        id: `authored:${sourceQuestionId}`,
        kind: 'text',
        sourceQuestionId,
        conceptIds: [mapping.conceptId],
        responseKind: 'text',
        curriculumPhase: curriculumPhase ?? learnerCurriculumPhase(exercise.phase, 'assessed-production'),
        prompt: exercise.prompt,
        options: [],
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport,
        provenance: { packageId, sourceQuestionId, ...(authoredSource ? { authoredSource } : {}) },
    };
}

function learnerCurriculumPhase(
    phase: AuthoredExercisePhase | undefined,
    fallback: LearnerAuthoredCurriculumPhase,
): LearnerAuthoredCurriculumPhase {
    switch (phase) {
        case 'context':
        case 'instruction':
        case 'guided-practice':
        case 'assessed-production':
            return phase;
        case 'constrained-practice':
        case 'supported-production':
            return 'guided-practice';
        case 'prestudy':
            return 'context';
        case 'transfer':
            return 'assessed-recognition';
        default:
            return fallback;
    }
}

function derivedOverlay(packageId: AuthoredWeekId, exercise: AuthoredChoiceExercise | AuthoredExactExercise): Overlay | undefined {
    if (isLegacyAuthoredWeek(packageId)) return undefined;
    const expression = exercise.kind === 'exact'
        ? exercise.answer.primary
        : exercise.options.find(option => option.correct)?.label.ja;
    if (!expression) return undefined;
    return {
        conceptId: `concept:${packageId}:${exercise.reviewTag ?? exercise.id}`,
        feedback: { en: exercise.explanation, ja: `答えを確認しましょう：${expression}。` },
        repair: { en: 'Try once more using the source pattern.', ja: 'もとの文型を使って、もう一度答えましょう。' },
        example: { en: `Model answer: ${expression}`, ja: `答えの例：${expression}` },
        review: { expression, meanings: [exercise.prompt.en] },
    };
}

function isLegacyAuthoredWeek(packageId: AuthoredWeekId): boolean {
    return packageId.startsWith('l1-l') && Number(packageId.match(/\d+$/u)?.[0] ?? 0) <= 10;
}

function acceptedExactAnswers(exercise: AuthoredExactExercise): ReadonlySet<string> {
    return new Set([exercise.answer.primary, ...exercise.answer.alternatives].map(normalizeExactAnswer));
}

function normalizeExactAnswer(value: string): string {
    return value.normalize('NFKC').replace(/[\s。、,.!?！？]/gu, '').toLocaleLowerCase('ja');
}

function overlay(conceptId: string, expression: string, meaning: string, reading?: string): Overlay {
    return {
        conceptId,
        feedback: { en: `Review the target: ${meaning}.`, ja: `ポイントを かくにんしましょう：${expression}。` },
        repair: { en: `Try again and look for “${meaning}”.`, ja: `もういちど。「${expression}」を さがしましょう。` },
        example: { en: `Nearby example: ${meaning}.`, ja: `ちかい れい：${expression}。` },
        review: { expression, ...(reading ? { reading } : {}), meanings: [meaning] },
    };
}

function grammarOverlay(sourceQuestionId: string, expression: string, meaning: string): Overlay {
    const conceptId = grammarConceptForAuthoredQuestion(sourceQuestionId);
    if (!conceptId) throw new TypeError(`Missing Academy grammar Concept home for ${sourceQuestionId}.`);
    return overlay(conceptId, expression, meaning);
}
