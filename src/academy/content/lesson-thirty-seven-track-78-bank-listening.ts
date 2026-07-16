import lessonPackage from '../../../public/academy/content/lessons/039-l2-l12.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { BankListeningClozeModel, BankListeningField } from '../minigames/bank-listening-cloze';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l12';
const PACKAGE_ORDER = 39;
const MODULE_ID = 8121261;
const ARCHIVE_ID = 'archive-000032';
const ARCHIVE_SHA256 = '62c3a814d3590157a8498d34e5ca172c5afa6608d9f9be1ad149a4ca4b99d4fe';
const WORKSHEET_SHA256 = '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617';
const WORKSHEET_IMAGE_SHA256 = '07ae4ae9fa5441f99bf5542d4199215433cc56ddddc4f1ab968d7533c4bd3ef4';
const AUDIO_SHA256 = '1039d11bef7a0575c6f104f780d1b65c79e63eb50dc292ea8c39f05d241123d2';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l2-l12-track-78.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:track78-bank`;

export function createLessonThirtySevenTrack78BankListeningBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const fields = [
        field('send-later', 1, '男の人は 銀行に います。', '送ってもらいますか。', 'キャッシュカード'),
        field('overseas-transfer', 2, '外国からの', 'を 受け取れますか。', '送金', ['送金', 'そうきん']),
        field('seal', 3, '本日は', 'と…', '印鑑', ['印鑑', 'いんかん']),
        field('passport', 4, '', 'は お持ちでしょうか。', 'パスポート'),
        field('cash-card', 5, '', 'は お作りしますか。', 'キャッシュカード'),
        field('post', 6, '2週間ほど かかりますが、', 'で ご自宅に', '郵送', ['郵送', 'ゆうそう']),
        field('send-polite', 7, '', '。', 'お送りします', ['お送りします', 'おおくりします']),
        field('money-distractor', 8, '選択肢 3：', '', 'お金', ['お金', 'おかね']),
    ] as const;
    const choiceQuestionId = `${SOURCE_PREFIX}:choice`;
    const activity: BankListeningClozeModel = {
        id: 'activity:l2-l12-track-78-bank-listening',
        kind: 'academy-bank-listening-cloze',
        responseKind: 'moodle-track-78-bank-cloze',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: [...fields.map(item => item.conceptId), 'concept:l2-l12:track78-send-later'],
        prompt: {
            ja: '窓口表現を確認してから Track 78 を聞き、原本どおり①〜⑧を埋め、最後の答えを一つ選んでください。',
            en: 'Review the service-desk language, then listen to Track 78, complete source blanks 1–8, and choose the final answer.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            repairScope: 'missed-source-items-only',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                archiveSha256: ARCHIVE_SHA256,
                worksheet: {
                    sourceId: `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1`,
                    payloadSha256: WORKSHEET_SHA256,
                    title: 'Homework/New_Homework_listening口座を開く_て あげます_て くれます_て もらいます.pdf',
                    page: 1,
                    url: '/academy/content/lessons/l2-l12/moodle-track-78-bank-listening-page-1.png',
                    sha256: WORKSHEET_IMAGE_SHA256,
                },
                audio: {
                    sourceId: `moodle:${MODULE_ID}:${AUDIO_SHA256}:audio:track-78`,
                    payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR,
                    url: requirePackagedAudio(choiceQuestionId),
                    durationSeconds: 76.032313,
                },
                answerKeyBasis: 'worksheet-track-identity-and-original-audio-reviewed',
            },
        },
        payload: {
            sourceCaption: {
                ja: 'Moodle 原本 Section II。Track 78 と明記された口座開設の八つの空所と、最後の四択だけを扱います。',
                en: 'Moodle Section II: only the eight bank-account blanks explicitly bound to Track 78 and its final four-option check.',
            },
            prerequisiteContext: [
                context('〜たいんですが', '希望をやわらかく切り出します。', 'Softly introduces a request.'),
                context('ご記入を お願いします', '用紙に書いてもらう丁寧な依頼です。', 'Politely asks someone to fill in a form.'),
                context('〜は お持ちでしょうか', '持っているかを丁寧に確認します。', 'Politely checks whether someone has an item.'),
                context('お使いいただけます', '「使えます」を窓口で丁寧に伝えます。', 'A service-register way to say something can be used.'),
                context('〜て もらいます', '相手の行為を受ける人の視点を表します。', 'Frames an action from the recipient’s point of view.'),
            ],
            instruction: 'II. トラック78を 聞いて、＿＿＿＿に ことばを 書きましょう。',
            fields,
            choice: {
                sourceQuestionId: choiceQuestionId,
                prompt: '①＿＿＿送ってもらいますか。ただしい答えをひとつ選びましょう。1、2、3、4のどれですか。',
                options: [
                    { id: '1', label: '④' },
                    { id: '2', label: '③' },
                    { id: '3', label: '⑧' },
                    { id: '4', label: '⑤' },
                ],
                answer: '4',
                conceptId: 'concept:l2-l12:track78-send-later',
                errorTag: 'l2-l12-track78-choice-send-later',
            },
            transcript: reviewedTranscript(),
            feedback: {
                pass: { explanation: { ja: '八つの語と最後の選択が、Track 78 の窓口会話と一致しました。', en: 'All eight words and the final choice match the Track 78 service conversation.' } },
                lapse: {
                    explanation: { ja: '一つ以上の空所か最後の選択を、完成した台本と照らして聞き直します。', en: 'Re-listen to one or more blanks or the final choice against the completed transcript.' },
                    repairPrompt: { ja: '間違えた原本項目だけが残ります。', en: 'Only missed source items remain for repair.' },
                    nearbyExample: { ja: '窓口では「〜はお持ちでしょうか」の直前に、持参する物が二つ並びます。', en: 'At the counter, two required items appear immediately before 〜はお持ちでしょうか.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'track-78-bank-listening',
        narrative: {
            ja: 'ながら工房の後、アカシュは銀行窓口の Track 78 を再生します。丁寧な表現を手掛かりに、送金とカード受取の流れを聞き取ります。',
            en: 'After the nagara workshop, Aakash plays Track 78 from a bank counter. Service-register cues anchor the transfer and card-delivery sequence.',
        },
        activity: Object.freeze(activity),
    });
}

function field(
    id: string,
    sourceOrder: BankListeningField['sourceOrder'],
    before: string,
    after: string,
    answer: string,
    acceptedAnswers: readonly string[] = [answer],
): BankListeningField {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:blank-${sourceOrder}`,
        before,
        after,
        answer,
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        conceptId: `concept:l2-l12:track78-blank-${sourceOrder}`,
        errorTag: `l2-l12-track78-blank-${sourceOrder}`,
    });
}

function context(pattern: string, ja: string, en: string) { return Object.freeze({ pattern, explanation: Object.freeze({ ja, en }) }); }

function reviewedTranscript(): BankListeningClozeModel['payload']['transcript'] {
    return Object.freeze([
        line('音声', 'トラック78。男の人は 銀行に います。後で 何を 送ってもらいますか。'),
        line('男', 'あのう、口座を 開きたいんですが…。'),
        line('女', 'ありがとうございます。それでは、こちらの 用紙に ご記入を お願いします。'),
        line('男', '外国からの 送金を 受け取れますか。'),
        line('女', 'はい、大丈夫です。本日は 印鑑と…、パスポートは お持ちでしょうか。'),
        line('男', 'はい。'),
        line('女', 'キャッシュカードは お作りしますか。銀行の ATM だけでなく、コンビニでも お使いいただけますが…。'),
        line('男', 'いくら かかりますか。'),
        line('女', '無料です。2週間ほど かかりますが、郵送で ご自宅に お送りします。'),
        line('男', 'はい、では お願いします。'),
        line('音声', '後で 何を 送ってもらいますか。'),
        line('1', 'パスポート'),
        line('2', '印鑑'),
        line('3', 'お金'),
        line('4', 'キャッシュカード'),
        line('答え', '4'),
        line('対応', '①キャッシュカード、②送金、③印鑑、④パスポート、⑤キャッシュカード、⑥郵送、⑦お送りします、⑧お金'),
    ]);
}

function line(speaker: string, text: string) { return Object.freeze({ speaker, text }); }

function requirePackagedAudio(sourceQuestionId: string): string {
    const url = resolvePackagedListeningTask(PACKAGE_ID, sourceQuestionId, AUDIO_LOCATOR);
    if (!url) throw new TypeError('Track 78 must have a packaged exact-task binding.');
    return url;
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l12 package');
    const identity = record(root.identity, 'l2-l12 identity');
    const coverage = record(root.sourceCoverage, 'l2-l12 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l12 package identity.');
    }
    const members = array(coverage.members, 'l2-l12 members').map(value => record(value, 'l2-l12 member'));
    const worksheet = members.find(member => member.payloadSha256 === WORKSHEET_SHA256);
    const audio = members.find(member => member.payloadSha256 === AUDIO_SHA256);
    if (worksheet?.title !== 'Homework/New_Homework_listening口座を開く_て あげます_て くれます_て もらいます.pdf'
        || worksheet.kind !== 'document' || audio?.title !== 'Homework/78 Track 78.mp3' || audio.kind !== 'audio') {
        throw new TypeError('Lesson 37 requires the exact Track 78 worksheet/audio pair.');
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
