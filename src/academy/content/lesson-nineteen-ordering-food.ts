import lessonPackage from '../../../public/academy/content/lessons/020-l1-l19.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { SentenceBuilderModel, SentenceBuilderToken } from '../minigames/sentence-builder';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l19';
const MODULE_ID = 6223185;
const ORDERING_FOOD_SHA256 = 'e316f2b99ea18663277b112f99680efee75a9dfe60d5ef5e00246e4498e27d6b';
const TRACK_43_SHA256 = '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372';
const TRACK_44_SHA256 = 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd';
const PAGE_TWO_SHA256 = '8bac804fa76d47a526f2b6d270a2492e656d72c2990ae1e67b7de2878883246a';
const SOURCE_QUESTION_ID = 'moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order';

const TOKENS: readonly SentenceBuilderToken[] = Object.freeze([
    { id: 'drink', label: 'なまビール' },
    { id: 'object', label: 'を' },
    { id: 'quantity', label: 'ふたつ' },
    { id: 'request', label: 'ください。' },
]);

export function createLessonNineteenOrderingFoodBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: SentenceBuilderModel = {
        id: 'activity:l1-l19-moodle-ordering-food',
        kind: 'academy-sentence-builder',
        sourceQuestionId: SOURCE_QUESTION_ID,
        conceptIds: ['concept:l1-l19:food-order:drink-request'],
        responseKind: 'tapped-token-order',
        curriculumPhase: 'guided-practice',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: '元の会話を見ながら、飲み物の注文を組み立てましょう。',
            en: 'Use the source conversation to build the drink order.',
        },
        payload: {
            tokens: TOKENS,
            correctOrder: ['drink', 'object', 'quantity', 'request'],
            sourceSentence: 'なまビールをふたつください。',
            source: {
                sourceId: `moodle-payload:${ORDERING_FOOD_SHA256}`,
                relativePath: 'Handouts/Chapter 11-2 ordering food.pdf',
                payloadSha256: ORDERING_FOOD_SHA256,
                lineLocus: { start: 15, end: 16 },
                rights: 'moodle-teaching-material',
                reuse: 'verbatim-rendered-teaching-sentence',
            },
            sourceSurface: {
                url: '/academy/content/lessons/l1-l19/moodle-chapter-11-2-ordering-food-page-2.png',
                sha256: PAGE_TWO_SHA256,
                alt: {
                    ja: 'MoodleのChapter 11-2 ordering food、2ページ目。注文の会話と語彙・表現。',
                    en: 'Moodle Chapter 11-2 ordering food, page 2, showing the ordering dialogue and vocabulary notes.',
                },
                caption: {
                    ja: '元資料: Chapter 11-2 ordering food、2ページ目。会話の飲み物の注文を見つけて、同じ順番で組み立てます。',
                    en: 'Source: Chapter 11-2 ordering food, page 2. Find the drink order in the dialogue, then build it in the same order.',
                },
            },
            sourceAudio: [
                audio('43 A-43', TRACK_43_SHA256, '/academy/content/lessons/l1-l19/moodle-43-a-43.mp3', 73.533333),
                audio('44 A-44', TRACK_44_SHA256, '/academy/content/lessons/l1-l19/moodle-44-a-44.mp3', 109.133333),
            ],
            mapping: {
                academyWeek: 'Level 1+ Lesson 9 / l1plus-l09',
                moodleModuleId: MODULE_ID,
                curriculum: [
                    'Moodle Chapter 11-2 ordering food, page 2, delivered first.',
                    'Minna no Nihongo I Lesson 11 supplies sequence support only.',
                    'Genki I quantity and request practice remains post-instruction support only.',
                ],
                skills: ['food ordering', 'general counter ふたつ', 'polite request ください'],
                jlpt: 'N5',
            },
            errorTag: 'l1-l19-food-order-word-order',
            feedback: {
                pass: {
                    explanation: {
                        ja: '元の会話どおりに、飲み物・を・数・くださいを並べられました。',
                        en: 'You rebuilt the source order: drink, を, quantity, then ください.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '注文では、品物のあとに「を」、数、そのあとに「ください」が続きます。',
                        en: 'In this order, the item is followed by を, then the quantity, then ください.',
                    },
                    repairPrompt: {
                        ja: '元資料の会話の「おのみものは？」の次の行を見て、同じ順番で組み立て直しましょう。',
                        en: 'Look at the line after おのみものは？ in the source dialogue, then rebuild it in that order.',
                    },
                    nearbyExample: {
                        ja: 'なまビールをふたつください。',
                        en: 'Two draft beers, please.',
                    },
                },
            },
            reviewTargets: [{
                id: 'review:l1-l19:moodle-food-order',
                conceptId: 'concept:l1-l19:food-order:drink-request',
                expression: 'なまビールをふたつください。',
                meanings: ['Two draft beers, please.'],
                sentence: 'なまビールをふたつください。',
            }],
        },
    };
    return Object.freeze({
        id: 'moodle-ordering-food',
        narrative: {
            ja: 'シンが元のメニュー会話を開きます。リエは、答えを見る前に、飲み物の注文だけを自分の手で並べるように言います。',
            en: 'Shin opens the original menu dialogue. Before looking at the model answer, Rie asks the learner to assemble just the drink order by hand.',
        },
        activity: Object.freeze(activity),
    });
}

function audio(title: string, payloadSha256: string, url: string, durationSeconds: number) {
    return Object.freeze({
        title: { ja: `元の音声 ${title}`, en: `Original Moodle audio ${title}` },
        sourceId: `moodle-payload:${payloadSha256}`,
        payloadSha256,
        url,
        durationSeconds,
        transcriptStatus: 'not-provided-do-not-invent' as const,
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l19 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l19 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l19 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l1-l19 coverage').members, 'l1-l19 members')
        .map((value, index) => record(value, `l1-l19 member ${index}`));
    for (const [payloadSha256, title] of [
        [ORDERING_FOOD_SHA256, 'Chapter 11-2 ordering food'],
        [TRACK_43_SHA256, '43 A-43'],
        [TRACK_44_SHA256, '44 A-44'],
    ] as const) {
        const match = members.find(member => member.payloadSha256 === payloadSha256);
        if (!match || match.title !== title) throw new TypeError(`Missing exact l1-l19 Moodle source ${title}.`);
    }
    const mappings = array(record(root.provenance, 'l1-l19 provenance').sourceMappings, 'l1-l19 mappings')
        .map((value, index) => record(value, `l1-l19 mapping ${index}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo I · Lesson 11' || minna.reuse !== 'sequence-only') {
        throw new TypeError('Lesson 19 needs Minna Lesson 11 sequence support only.');
    }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
