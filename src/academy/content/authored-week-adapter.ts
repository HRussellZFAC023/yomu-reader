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
    'l1-l01': '5eef8e5cb2bb45393c8abea6567555dd124447aaf5414842c4aca691fad3af43',
    'l1-l02': '57d02d2eeb20f058b22a86ef16883d38d4d2d009056017afa5b7bd4aa73f1588',
    'l1-l03': 'c499a9155aa3bd4c1f36062988090090a13e35bc61481e558421b58e7ac62843',
    'l1-l04': '8662206ba0a6a622ffb9a6a80d4ae3ab780dfb09e1477d7a0ddde6e91c0cff36',
    'l1-l05': '5fdc4404e31965453d4eaa4c88836866467fe726a73f2fcad22736fcf6aab22c',
    'l1-l06': '1e351c61a8610319b985a82a316f8fc120a66ff4ae9282231ceb01a092faa87d',
    'l1-l07': '3811f7a4d9cc8327355efc46105dfb0a3a0873a73c12506b9e6a712c0add3ca9',
    'l1-l08': '6d19a8b5bcd1b1c57b61a1479e1287b86c00a6b4e6b77469415b71e2ca7e3f8f',
    'l1-l09': 'a0a7ca069c1878da27dc962aaea3b86137bb3b49cada013b7f66f4f79c7bd979',
    'l1-l10': 'cb61a0d2cc3c43edec4c8bec1c99b3678a90fa14f3f6fcc75ad3879b6ee8fb34',
    'l1-l11': 'b47229d7a7a9ed81a1f2877a792c744b30fb134ff20a3a8d8ad8c7d215501a9e',
    'l1-l12': 'b4eb6c44d1043a1936fd2ed0b1ced7c8a0c1f0bccf3dd1477c28546793c95cf0',
    'l1-l13': '35e0aba3f4755c4e78546fd860342104df0800eefefbddf3c2abbda89524c517',
    'l1-l14': '2088851b83dcfc88926f3d74ca0e00b8cb40230e789f53ea408526a70519ee3e',
    'l1-l15': '636a68cede9810f882e78058804d7685b0617158268e52e3a94e6ff520e0d27c',
    'l1-l16': 'd524cd54e4c2441e7613f065c3aa51b8bfffd33ed70db2dd773def02bcff8c02',
    'l1-l17': '04fe995f2e56ecab4f504c2c64e31d9952ed087a1503a9c714a75e5fb565f0d0',
    'l1-l18': '01b56f04bc5cdb64986669d01cf32a76606f3898b241766277c30ed9bbd0d854',
    'l1-l19': 'a6063210b4962cc1b39f2e79a8b00de8a28fe2dedcacf20beb02a85e446fe87c',
    'l1-l20': '07320d09f3b56bbbe8494b9e076e8594c76a187d6b2d582f4e069655df147300',
    'l1-l21': '8ef06397d57ef46717063fcae364992ade0b562f6d8aabda95125cb89be5e9c0',
    'l1-l22': 'ef41f2a6433bf92a586ef078524e827bd734386ec621325d0db6b04cb9166bd9',
    'l1-l23': 'f783745ded90660cf752c01a5e0079c18a7b2c320d1efdd759ecc6e580781047',
    'l1-l24': 'f74b82a70ba9e4b755ef5490f5e05d9146521527915baa2c61323913e8cbdf7e',
    'l1-l25': 'ae6cdf81783440af1e0156ba72dc2e81fe4dccfbf66c9d9423fac2a506ed9a48',
    'l1-l26': '381036e7e28cf345ca495ab6cd70be0688120ae5af92ebdd498f0ba43f6df998',
    'l2-l02': '2f74245cbe3348792351a54194e5e56584773a86caf16b301b4f28597a625f2f',
    'l2-l03': '8b4a0a0ca0d3a8bfa6c90555d4106500823b7ffea3d4bd6d27176bd6b7c12522',
    'l2-l04': '62885898a643f116d8277a7ed5745e89ed45b6bb87023cc41859cf0677141d0c',
    'l2-l05': 'd4286e8c46ee6e7581609c02b08d76f0bc9252c26a431f5b2ca50f33471e5d0b',
    'l2-l06': 'f511c246dd35cc6b13486b0b96bb048bfe23a41cca5a61f5272f9bb0ca6a5b38',
    'l2-l07': 'df132cbf7246235c268883f2b09018af990e8b221f8ab75a2041b9d3d61dfea3',
    'l2-l08': 'b4ea67831a52cff003ebc89d2604999bbf51cf7d722e1db82f5740cfe2cf0852',
    'l2-l09': '951cedfa65d24865c12731438d63679c27b5e65fed8efd9abb4984370ac929fd',
    'l2-l10': '8f2ce673a3b21b958fd512304aa4b08c18679d9982f3b0e6ad2f043108e880af',
    'l2-l11': '56e2fcdb5952819c2a3958121d23cdd3e75fd8c8eec0a6593165ae990be3dfd6',
    'l2-l12': 'eeb8c16bb319e8a3e06fe128e7149afc8362eedc5848e99e0b24669d23c423d4',
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
    'l2-l29': 'edfb9aab702282ed7a173ab72d3649b746ef30e8f73acf817165a382ae43cef2',
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
    readonly provenance: { readonly packageId: AuthoredWeekId; readonly sourceQuestionId: string };
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
    readonly provenance: { readonly packageId: AuthoredWeekId; readonly sourceQuestionId: string };
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
            const exercise = choice ?? exact;
            if (!exercise) continue;
            const sourceQuestionId = `${id}/${exercise.id}`;
            if (seen.has(sourceQuestionId)) throw new TypeError(`Duplicate exercise id ${sourceQuestionId}.`);
            seen.add(sourceQuestionId);
            const mapping = overlays[sourceQuestionId] ?? derivedOverlay(id, exercise);
            if (!mapping) throw new TypeError(`Missing explicit overlay for ${sourceQuestionId}.`);
            const activity = exercise.kind === 'choice'
                ? toChoiceActivity(id, exercise, sourceQuestionId, mapping, component.teachingSupport, packagedListening?.listening)
                : toTextActivity(id, exercise, sourceQuestionId, mapping, component.teachingSupport);
            activities.push(activity);
            answers.set(activity.id, { kind: exercise.kind === 'choice' ? 'choice' : 'text', exercise, mapping } as
                | { kind: 'choice'; exercise: AuthoredChoiceExercise; mapping: Overlay }
                | { kind: 'text'; exercise: AuthoredExactExercise; mapping: Overlay });
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
                kind: 'vocabulary' as const,
                title: { ja: 'ことばを見てから', en: 'See the word first' },
                entries: [{
                    japanese: item.ja,
                    ...(item.reading !== item.ja ? { reading: item.reading } : {}),
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

function toChoiceActivity(
    packageId: AuthoredWeekId,
    exercise: AuthoredChoiceExercise,
    sourceQuestionId: string,
    mapping: Overlay,
    teachingSupport: import('../domain/activity-runtime').ActivityTeachingSupport,
    listening?: LearnerAuthoredChoice['listening'],
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
        curriculumPhase: learnerCurriculumPhase(exercise.phase, 'assessed-recognition'),
        prompt: exercise.prompt,
        options,
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport,
        ...(listening ? { listening } : {}),
        provenance: { packageId, sourceQuestionId },
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
): LearnerAuthoredText {
    return {
        id: `authored:${sourceQuestionId}`,
        kind: 'text',
        sourceQuestionId,
        conceptIds: [mapping.conceptId],
        responseKind: 'text',
        curriculumPhase: learnerCurriculumPhase(exercise.phase, 'assessed-production'),
        prompt: exercise.prompt,
        options: [],
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport,
        provenance: { packageId, sourceQuestionId },
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
