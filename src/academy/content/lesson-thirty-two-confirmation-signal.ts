import lessonPackage from '../../../public/academy/content/lessons/034-l2-l07.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    ConfirmationSignalOption,
    ConfirmationSignalModel,
    ConfirmationSignalRound,
} from '../minigames/confirmation-signal';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l07';
const PACKAGE_ORDER = 34;
const MODULE_ID = 6974653;
const SOURCE_PAYLOAD_SHA256 = 'dca619084366be2c1d89de013f3b7b142b83fb5ee7462175bc4d35af9ecd8ab6';
const SOURCE_IMAGE_SHA256 = '68cdcf841810f4738474a813fd60eafbfdd5e384da0d0e10fcaf987f552c05a9';
const SOURCE_TITLE = 'Handouts/Chapter 21-3 〜でしょう_exercise and grammar review.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}:pdf-p1:deshou`;

export function createLessonThirtyTwoConfirmationSignalBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('okinawa-clean', 1, '沖縄は 海が きれいです →', 'okinawa-clean-correct', '沖縄は 海が きれいでしょう？', [
            option('okinawa-clean-correct', '沖縄は 海が きれいでしょう？'),
            option('okinawa-clean-da', '沖縄は 海が きれいだでしょう？'),
            option('okinawa-clean-katta', '沖縄は 海が きれかったでしょう？'),
        ], [
            hint('きれいは「な形容詞」です。', 'きれい is a na-adjective.'),
            hint('先生の説明では、な形容詞の「〜だ」を でしょう の前で使いません。', 'Sensei’s rule removes 〜だ before でしょう for a na-adjective.'),
            hint('きれい + でしょう？を選び、声を上げる信号を入れます。', 'Choose きれい + でしょう？ and switch on the rising signal.'),
        ]),
        round('watt-interesting', 2, 'ワットさんの 話は おもしろいです →', 'watt-interesting-correct', 'ワットさんの 話は おもしろいでしょう？', [
            option('watt-interesting-correct', 'ワットさんの 話は おもしろいでしょう？'),
            option('watt-interesting-da', 'ワットさんの 話は おもしろだでしょう？'),
            option('watt-interesting-past', 'ワットさんの 話は おもしろかったでしょう？'),
        ], [
            hint('おもしろいは「い形容詞」です。', 'おもしろい is an i-adjective.'),
            hint('い形容詞は です を取り、そのまま でしょう？につなぎます。', 'Remove です and join the i-adjective directly to でしょう？.'),
            hint('おもしろい + でしょう？を選び、声を上げる信号を入れます。', 'Choose おもしろい + でしょう？ and switch on the rising signal.'),
        ]),
        round('kimura-does-not-know', 3, '木村さんは イーさんを 知りません →', 'kimura-does-not-know-correct', '木村さんは イーさんを 知らないでしょう？', [
            option('kimura-does-not-know-correct', '木村さんは イーさんを 知らないでしょう？'),
            option('kimura-does-not-know-polite', '木村さんは イーさんを 知りませんでしょう？'),
            option('kimura-does-not-know-mixed', '木村さんは イーさんを 知るないでしょう？'),
        ], [
            hint('知りませんは動詞の否定丁寧形です。', '知りません is a polite negative verb form.'),
            hint('普通形の否定は「知らない」です。', 'Its plain negative form is 知らない.'),
            hint('知らない + でしょう？を選び、声を上げる信号を入れます。', 'Choose 知らない + でしょう？ and switch on the rising signal.'),
        ]),
        round('football-match-happened', 4, 'きのう サッカーの 試合が ありました →', 'football-match-happened-correct', 'きのう サッカーの 試合が あったでしょう？', [
            option('football-match-happened-correct', 'きのう サッカーの 試合が あったでしょう？'),
            option('football-match-happened-polite', 'きのう サッカーの 試合が ありましたでしょう？'),
            option('football-match-happened-present', 'きのう サッカーの 試合が あるでしょう？'),
        ], [
            hint('ありましたは動詞の過去丁寧形です。', 'ありました is a polite past verb form.'),
            hint('ある の普通形の過去は「あった」です。', 'The plain past form of ある is あった.'),
            hint('あった + でしょう？を選び、声を上げる信号を入れます。', 'Choose あった + でしょう？ and switch on the rising signal.'),
        ]),
    ] as const;
    const activity: ConfirmationSignalModel = {
        id: 'activity:l2-l07-sensei-confirmation-signal',
        kind: 'academy-confirmation-signal',
        responseKind: 'moodle-chapter-21-deshou-confirmation-signal',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 21「〜でしょう」の説明と例を先に読み、四つの文で確認の形と上がるイントネーションを信号にしましょう。',
            en: 'Read Sensei’s Chapter 21 〜でしょう rule and examples first, then signal both the confirmation form and rising intonation for four sentences.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                sourceSheet: {
                    sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:1`,
                    payloadSha256: SOURCE_PAYLOAD_SHA256,
                    title: SOURCE_TITLE,
                    page: 1,
                    url: '/academy/content/lessons/l2-l07/moodle-chapter-21-deshou-teaching-task-page-1.png',
                    sha256: SOURCE_IMAGE_SHA256,
                    alt: {
                        ja: `Moodle 原本: ${SOURCE_TITLE} 1ページ`,
                        en: `Moodle original: ${SOURCE_TITLE}, page 1`,
                    },
                },
                audio: {
                    status: 'minna-074-recording-embedded-true-false-reviewed',
                    sourceAudioMembers: 8,
                    sourceAudioTracksDelivered: 1,
                    quarantinedSourceAudioMembers: 7,
                },
                answerKeyBasis: 'yomu-derived-deshou-transformations-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I, Lesson 21', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: 'none-verified', reuse: 'none' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Basic sentence:',
                    text: 'Verb Plain form でしょう？(⤴)\nい-adj Plain form でしょう？(⤴)\nな-adj 〜な →〜だ Plain form でしょう？(⤴)\nNoun だ Plain form でしょう？(⤴)',
                },
                {
                    title: 'Sensei’s explanation',
                    text: 'This sentence form is used when seeking agreement or confirmation from the listener.\nでしょう is spoken with a rising intonation. The plain form is used before でしょう, but without the 〜だ in the case of a な-adjective or noun.',
                },
                {
                    title: 'ex)',
                    text: 'Non past affirmative 行くでしょう？\nPast 行ったでしょう？\nNon past negative 行かないでしょう？\nPast negative 行かなかったでしょう？',
                },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '四つの文で普通形 + でしょう？と上がるイントネーションを信号にできました。',
                        en: 'You signalled plain form + でしょう？ and rising intonation for all four sentences.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文で普通形かイントネーションの信号を直す必要があります。',
                        en: 'At least one sentence needs a repair to its plain form or intonation signal.',
                    },
                    repairPrompt: {
                        ja: '表示された文だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible sentences, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: 'あしたは 休みです → あしたは 休みでしょう？ ↗',
                        en: 'あしたは 休みです becomes あしたは 休みでしょう？ with rising intonation.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-confirmation-signal',
        narrative: {
            ja: 'シンが先生の「〜でしょう」ページを厨房の掲示台に置きます。ソフィーは、確認の形と声の上がり方を別々の信号にしてから答えるようにします。',
            en: 'Shin places Sensei’s 〜でしょう page on the practice-kitchen display. Sophie asks the learner to set the confirmation form and the rising voice as separate signals.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: ConfirmationSignalRound['sourceOrder'],
    sourcePrompt: string,
    correctOptionId: string,
    answerExpression: string,
    options: ConfirmationSignalRound['options'],
    hints: ConfirmationSignalRound['hints'],
): ConfirmationSignalRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:q${sourceOrder}`,
        sourcePrompt,
        options,
        correctOptionId,
        answerExpression,
        conceptId: `concept:l2-l07:deshou-confirmation:${sourceOrder}`,
        errorTag: `l2-l07-confirmation-signal-${sourceOrder}`,
        hints,
    });
}

function option(id: string, label: string): ConfirmationSignalOption { return Object.freeze({ id, label }); }
function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l07 package');
    const identity = record(root.identity, 'l2-l07 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l07 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l07 coverage');
    if (coverage.archiveSha256 !== '0d1df9696ef0f6114060c0c290818c5b53c739b4e58173d7dfb91407885ba1e3') {
        throw new TypeError('Unexpected l2-l07 source archive.');
    }
    const members = array(coverage.members, 'l2-l07 members').map(value => record(value, 'l2-l07 member'));
    const source = members.find(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (!source || source.title !== SOURCE_TITLE) throw new TypeError(`Missing exact Lesson 32 Moodle source ${SOURCE_TITLE}.`);
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 8) throw new TypeError('Lesson 32 expects exactly eight Moodle audio members.');
    const mapping = record(root.mapping, 'l2-l07 mapping');
    if (mapping.genki !== 'No verified Genki crosswalk asserted.') throw new TypeError('Lesson 32 must not invent a Genki crosswalk.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
