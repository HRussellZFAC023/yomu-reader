import lessonPackage from '../../../public/academy/content/lessons/033-l2-l06.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { OpinionTransformationModel, OpinionTransformationRound } from '../minigames/opinion-transformation';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l06';
const PACKAGE_ORDER = 33;
const MODULE_ID = 6974652;
const VOCABULARY_SHA256 = '32097fd886f557806cbecf84e943bf8b0b919ff32c6367ba4fddab5c88b11283';
const GRAMMAR_SHA256 = '837cd9f8468d50c09902520d196089dc84ee4d435a5e1b7b654c346e9e9d701f';
const VOCABULARY_IMAGE_SHA256 = 'a0137ffaab518de2a37d783c5c02c4efe8d719cbe2c8647e186e55e35a00a02f';
const TEACHING_IMAGE_SHA256 = 'dc138ddbfe0ff40495511a961485f03767ffae7afada9e5886e922809a48dcdb';
const TASK_IMAGE_SHA256 = '9c93bc53a77ebb3b3cf2a5013400240acfda5b856773c9d14c13be763c9627d9';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${GRAMMAR_SHA256}:pdf-p2:supposition`;

export function createLessonThirtyOneOpinionTransformationBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('miller-comes', 1, 'ミラーさんは 9時に 来ます。→', 'ミラーさんは 9時に 来ると 思います。', [
            hint('来ますは動詞の丁寧形です。', '来ます is a polite verb form.'),
            hint('来ますを普通形の「来る」にします。', 'Change 来ます to the plain form 来る.'),
            hint('来る + と 思います の順につなぎます。', 'Join 来る + と 思います in that order.'),
        ]),
        round('maria-does-not-drive', 2, 'マリアさんは 運転しません。→', 'マリアさんは 運転しないと 思います。', [
            hint('運転しませんは動詞の否定丁寧形です。', '運転しません is a polite negative verb form.'),
            hint('運転しませんを普通形の「運転しない」にします。', 'Change 運転しません to the plain negative 運転しない.'),
            hint('運転しない + と 思います の順につなぎます。', 'Join 運転しない + と 思います in that order.'),
        ]),
        round('pub-crowded', 3, 'あのパブは 人が 多いです。→', 'あのパブは 人が 多いと 思います。', [
            hint('多いは「い形容詞」です。', '多い is an i-adjective.'),
            hint('い形容詞では、ですを取って普通形にします。', 'For an i-adjective, remove です to make the plain form.'),
            hint('多い + と 思います の順につなぎます。', 'Join 多い + と 思います in that order.'),
        ]),
        round('restaurant-quiet', 4, 'あのレストランは 静かです。→', 'あのレストランは 静かだと 思います。', [
            hint('静かは「な形容詞」です。', '静か is a na-adjective.'),
            hint('な形容詞の普通形では、ですを「だ」にします。', 'For a na-adjective plain form, change です to だ.'),
            hint('静かだ + と 思います の順につなぎます。', 'Join 静かだ + と 思います in that order.'),
        ]),
        round('tomorrow-snow', 5, 'あしたは 雪です。→', 'あしたは 雪だと 思います。', [
            hint('雪は名詞です。', '雪 is a noun.'),
            hint('名詞の普通形では、ですを「だ」にします。', 'For a noun plain form, change です to だ.'),
            hint('雪だ + と 思います の順につなぎます。', 'Join 雪だ + と 思います in that order.'),
        ]),
    ] as const;
    const activity: OpinionTransformationModel = {
        id: 'activity:l2-l06-sensei-opinion-transformation',
        kind: 'academy-opinion-transformation',
        responseKind: 'moodle-chapter-21-opinion-transformation',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 21 の語彙と「〜と思います」の説明を読んでから、元の五つの文を推量の文に変えましょう。',
            en: 'Read Sensei’s Chapter 21 vocabulary and 〜と思います explanation, then change the five original statements into suppositions.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                vocabularySheet: sourceVisual(
                    `moodle:${VOCABULARY_SHA256}:page:1`, VOCABULARY_SHA256,
                    'Handouts/Chapter 21-1 Vocabulary Sheet.pdf', 1,
                    '/academy/content/lessons/l2-l06/moodle-chapter-21-1-vocabulary-page-1.png', VOCABULARY_IMAGE_SHA256,
                ),
                teachingSheet: sourceVisual(
                    `moodle:${GRAMMAR_SHA256}:page:1`, GRAMMAR_SHA256,
                    'Handouts/Chapter 21 Grammar Exercise_〜とおもいます.pdf', 1,
                    '/academy/content/lessons/l2-l06/moodle-chapter-21-opinion-teaching-page-1.png', TEACHING_IMAGE_SHA256,
                ),
                taskSheet: sourceVisual(
                    `moodle:${GRAMMAR_SHA256}:page:2`, GRAMMAR_SHA256,
                    'Handouts/Chapter 21 Grammar Exercise_〜とおもいます.pdf', 2,
                    '/academy/content/lessons/l2-l06/moodle-chapter-21-opinion-task-page-2.png', TASK_IMAGE_SHA256,
                ),
                audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 2, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-plain-form-transformations-over-verbatim-source-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I, Lesson 21', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: 'none-verified', reuse: 'none' },
            },
        },
        payload: {
            teaching: [
                {
                    title: { ja: '先生の基本文', en: 'Sensei’s basic sentence' },
                    pattern: 'Verb Plain form\nい-adj Plain form\nな-adj 〜な →〜だ Plain form\nNoun だ Plain form\n＋ と 思います。',
                    instruction: {
                        ja: '先生の1ページ目の表と例を先に読みます。動詞・い形容詞・な形容詞・名詞で、と の前の普通形がどう変わるか確かめます。',
                        en: 'Read Sensei’s page-one table and examples first. Check the plain form before と for verbs, i-adjectives, na-adjectives, and nouns.',
                    },
                },
                {
                    title: { ja: '否定の推量', en: 'Negative conjecture' },
                    pattern: 'the clause before と is put in the negative',
                    instruction: {
                        ja: '否定の推量では、と の前の節を否定の普通形にします。答えは最初に試すまで表示しません。',
                        en: 'For a negative conjecture, put the clause before と in the plain negative. Derived completions stay hidden until the first attempt.',
                    },
                },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '先生の五つの文を、普通形 + と 思います の推量に変えられました。', en: 'You transformed all five of Sensei’s statements into plain form + と 思います suppositions.' } },
                lapse: {
                    explanation: { ja: '一つ以上の文で、と の前の普通形を直す必要があります。', en: 'At least one sentence needs a repair to the plain form before と.' },
                    repairPrompt: { ja: '表示された文だけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the visible sentences, opening one earned hint at a time if needed.' },
                    nearbyExample: { ja: '会議室に います。→ 会議室に いると 思います。', en: 'います becomes いる before と 思います.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-opinion-transformation',
        narrative: {
            ja: 'シンが先生の五つの文をそのまま並べます。ソフィーは答えを先に言わず、と の前だけを一つずつ普通形に変えるようにします。',
            en: 'Shin lays out Sensei’s five statements unchanged. Sophie keeps the completions unspoken and asks the learner to change only the clause before と, one at a time.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: OpinionTransformationRound['sourceOrder'],
    sourcePrompt: string,
    answerExpression: string,
    hints: OpinionTransformationRound['hints'],
): OpinionTransformationRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:q${sourceOrder}`,
        sourcePrompt,
        answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l06:opinion-transformation:${sourceOrder}`,
        errorTag: `l2-l06-opinion-transformation-${sourceOrder}`,
        hints,
    });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(
    sourceId: string,
    payloadSha256: string,
    title: string,
    page: number,
    url: string,
    sha256: string,
) {
    return {
        sourceId, payloadSha256, title, page, url, sha256,
        alt: { ja: `Moodle 原本: ${title} ${page}ページ`, en: `Moodle original: ${title}, page ${page}` },
    } as const;
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l06 package');
    const identity = record(root.identity, 'l2-l06 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l06 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l2-l06 coverage').members, 'l2-l06 members')
        .map(value => record(value, 'l2-l06 member'));
    for (const [sha256, title] of [
        [VOCABULARY_SHA256, 'Handouts/Chapter 21-1 Vocabulary Sheet.pdf'],
        [GRAMMAR_SHA256, 'Handouts/Chapter 21 Grammar Exercise_〜とおもいます.pdf'],
    ] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === sha256);
        if (!member || member.title !== title) throw new TypeError(`Missing exact Lesson 31 Moodle source ${title}.`);
    }
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 2) throw new TypeError('Lesson 31 expects exactly two quarantined Moodle audio members.');
    const mapping = record(root.mapping, 'l2-l06 mapping');
    if (mapping.genki !== 'No verified Genki crosswalk asserted.') throw new TypeError('Lesson 31 must not invent a Genki crosswalk.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}
function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
