import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import {
    N3_N4_SLEEP_BRIDGE_PACKAGE_ID,
    N3_N4_SLEEP_BRIDGE_PROVENANCE,
    N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS,
} from './source';
import type {
    N3N4SleepBridgePackage,
    N3N4SleepBridgePrerequisite,
    N3N4SleepBridgeReaderSrsProjection,
} from './types';

const TRANSFER_PARAGRAPHS = Object.freeze([
    '大学の図書館では、夜遅くまで勉強する学生が増えている。そこで、閉館時間をすぐに遅くするのではなく、まず夜の座席の利用状況を記録することにした。',
    '利用者が多い一方で、終電前に帰る学生も少なくない。記録を見た上で必要なら、試験の前の週だけ開館時間を延ばす予定だ。',
]);

const PREREQUISITES: readonly N3N4SleepBridgePrerequisite[] = Object.freeze([
    prerequisite('grammar:n4-time-te-kara', '「〜てから」で出来事の順序を追えること。', 'Can follow the sequence of events with te kara.'),
    prerequisite('grammar:n4-adversative-kedo', '二つの事実を「しかし／けれども」で対比できること。', 'Can contrast two facts with shikashi or keredomo.'),
    prerequisite('reading:n4-main-claim', '短い説明文で中心の変化を探した経験があること。', 'Has practised locating the central change in a short explanatory text.'),
]);

export function createN3N4SleepBridgePackage(): N3N4SleepBridgePackage {
    const activity = Object.freeze({
        id: 'activity:n3-n4-sleep-bridge',
        kind: 'academy-n3-n4-sleep-bridge' as const,
        sourceQuestionId: N3_N4_SLEEP_BRIDGE_PROVENANCE.sourceId,
        conceptIds: [
            'grammar:n3-ippou-de',
            'grammar:n3-you-da-inference',
            'reading:n3-trade-off-and-bounded-response',
        ],
        responseKind: 'n3-n4-sleep-bridge-v1' as const,
        curriculumPhase: 'assessed-recognition' as const,
        prompt: {
            ja: 'N4の順序・対比を足場にして、N3の両面と控えめな推測を聞き分けましょう。',
            en: 'Use N4 sequencing and contrast as a foothold for N3 trade-offs and cautious inference.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'pattern' as const,
            title: { ja: '変化を一方向に決めつけない', en: 'Do not reduce a change to one direction' },
            entries: [
                { japanese: '〜てから、〜。', translation: 'After ..., ...' },
                { japanese: '便利になった一方で、〜。', translation: 'While it became convenient, ...' },
                { japanese: '〜ようだ。', translation: 'It seems that ...' },
            ],
        },
        provenance: N3_N4_SLEEP_BRIDGE_PROVENANCE,
        payload: {
            teaching: [
                teaching('N4の順序を残す', 'Keep the N4 sequence visible', '電気が広まってから、夜の店が増えた。', '「〜てから」は、何が先かを決めます。後ろの変化を原因そのものと決めつけません。', 'Te kara fixes what came first; it does not by itself prove a cause.'),
                teaching('N3の両面を並べる', 'Hold both sides of the N3 trade-off', '便利になった一方で、休む時間が短くなった。', '「一方で」の後には、前半と同時に成り立つ別の面が来ます。', 'After ippou de comes another side that holds alongside the first.'),
                teaching('推測の強さを保つ', 'Keep inference at its stated strength', '疲れている人も増えているようだ。', '「ようだ」は観察にもとづく控えめな判断です。必ずそうだとは言いません。', 'You da is a cautious judgment based on observation, not an absolute claim.'),
            ],
            sourceSegments: N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS,
            transfer: {
                title: { ja: 'オリジナル転移文: 夜の図書館', en: 'Original transfer: the late library' },
                paragraphs: TRANSFER_PARAGRAPHS,
                playbackText: TRANSFER_PARAGRAPHS.join(' '),
                authorship: 'original-yomu-n3-n4-bridge-transfer' as const,
            },
            questions: [
                question('source-sequence', 'source-rehearsal', 'listening-choice', '本文で、夜遅くまで起きる人が多くなった変化の後に置かれているのは何ですか。', 'What does the source place before the change that more people stay up late?', [
                    option('electricity-invented', '電気が発明されたこと。', 'The invention of electricity.'),
                    option('morning-disappeared', '朝がなくなったこと。', 'The disappearance of mornings.'),
                    option('sleep-became-illegal', '寝ることが禁止されたこと。', 'Sleeping being prohibited.'),
                ], 'electricity-invented', 'sequence-anchor'),
                question('source-trade-off', 'source-rehearsal', 'evidence-sort', '本文の「一方で」の後にある、便利さと並ぶ面を選びましょう。', 'Select the side that the source places alongside convenience after ippou de.', [
                    option('sleep-shortage', '睡眠不足で疲れている人も増えているようだ。', 'There seem to be more people tired from lack of sleep.'),
                    option('all-sleep-improved', '全員の睡眠がよくなった。', 'Everyone sleeps better.'),
                    option('electricity-ended', '電気が使えなくなった。', 'Electricity can no longer be used.'),
                ], 'sleep-shortage', 'trade-off-evidence'),
                question('transfer-condition', 'original-transfer', 'cloze', '文を完成させる選択肢を選びましょう: 「記録を見た上で必要なら、_____だけ開館時間を延ばす。」', 'Complete the sentence: “After reviewing the record, if needed, the library will extend opening hours only _____.”', [
                    option('week-before-exams', '試験の前の週', 'in the week before exams'),
                    option('every-night', '毎晩', 'every night'),
                    option('forever', 'いつまでも', 'forever'),
                ], 'week-before-exams', 'bounded-condition'),
                question('transfer-conclusion', 'original-transfer', 'conclusion-choice', '転移文に最も合う判断はどれですか。', 'Which conclusion best fits the transfer passage?', [
                    option('measure-first', '利用時間を変える前に、夜の利用状況を確かめる。', 'Check late use before changing opening hours.'),
                    option('extend-now', '記録を見ずに、すぐ毎晩遅くまで開館する。', 'Immediately open later every night without checking records.'),
                    option('close-library', '夜に勉強する学生がいるので、図書館を閉める。', 'Close the library because students study at night.'),
                ], 'measure-first', 'bounded-response'),
            ],
            passScore: 1 as const,
            feedback: {
                pass: { explanation: { ja: '順序、両面、推測の強さ、条件つきの対応を区別できました。', en: 'You distinguished sequence, both sides of a trade-off, inference strength, and a conditional response.' } },
                lapse: {
                    explanation: { ja: '「てから」「一方で」「ようだ」「必要なら」の前後を分けて、本文が言い過ぎていない範囲を確かめましょう。', en: 'Separate the clauses around te kara, ippou de, you da, and hitsuyou nara, then check the limits of what the passages claim.' },
                    repairPrompt: { ja: '先に起きたこと、並んでいる二つの面、条件がある対応にそれぞれ印を付けてください。', en: 'Mark what came first, the two sides held together, and the response that has a condition.' },
                    nearbyExample: { ja: '便利になった一方で、確認する時間も必要になったようだ。必要なら、混む日だけ予約を増やす。', en: 'While things became convenient, it seems checking time also became necessary. If needed, bookings increase only on busy days.' },
                },
            },
            reviewTargets: [
                review('ippou-de', 'grammar:n3-ippou-de', '一方で', 'いっぽうで', ['while; on the other hand'], N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text, ['trade-off-evidence']),
                review('you-da', 'grammar:n3-you-da-inference', '〜ようだ', undefined, ['it seems that ...'], N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text, ['trade-off-evidence']),
                review('hitsuyou-nara', 'reading:n3-trade-off-and-bounded-response', '必要なら', 'ひつようなら', ['if necessary'], TRANSFER_PARAGRAPHS[1], ['bounded-condition']),
                review('kiroku-o-mita-ue-de', 'reading:n3-trade-off-and-bounded-response', '記録を見た上で', 'きろくをみたうえで', ['after reviewing the record'], TRANSFER_PARAGRAPHS[1], ['bounded-response']),
            ],
        },
    });

    return Object.freeze({ id: N3_N4_SLEEP_BRIDGE_PACKAGE_ID, band: 'N3' as const, prerequisites: PREREQUISITES, activity, readerSrs: readerSrsProjection() });
}

function prerequisite(conceptId: string, ja: string, en: string): N3N4SleepBridgePrerequisite {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted', reason: Object.freeze({ ja, en }) });
}

function teaching(ja: string, en: string, example: string, explanationJa: string, explanationEn: string) {
    return Object.freeze({ title: Object.freeze({ ja, en }), example, explanation: Object.freeze({ ja: explanationJa, en: explanationEn }) });
}

function option(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}

function question(
    id: string,
    stage: 'source-rehearsal' | 'original-transfer',
    activityMode: 'listening-choice' | 'evidence-sort' | 'cloze' | 'conclusion-choice',
    ja: string,
    en: string,
    options: readonly ReturnType<typeof option>[],
    correctOptionId: string,
    errorTag: string,
) {
    return Object.freeze({ id, stage, activityMode, prompt: Object.freeze({ ja, en }), options: Object.freeze(options), correctOptionId, errorTag });
}

function review(suffix: string, conceptId: string, expression: string, reading: string | undefined, meanings: readonly string[], sentence: string, repairFor: readonly string[]) {
    return Object.freeze({ id: `review:${N3_N4_SLEEP_BRIDGE_PACKAGE_ID}:${suffix}`, conceptId, expression, ...(reading ? { reading } : {}), meanings: Object.freeze([...meanings]), sentence, repairFor: Object.freeze([...repairFor]) });
}

function readerSrsProjection(): N3N4SleepBridgeReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze([
            'reader:n3-n4-sleep-bridge-01:source-sleep-habits',
            'reader:n3-n4-sleep-bridge-01:original-transfer:paragraph-1',
            'reader:n3-n4-sleep-bridge-01:original-transfer:paragraph-2',
        ]),
        miningRequests: Object.freeze(miningRequests()),
    });
}

function miningRequests(): MiningRequest[] {
    return [
        { expression: '一方で', sentence: N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS[0].text, sourceTitle: 'Soya N3 mock 1 reading: mock1_r_03', conceptIds: ['grammar:n3-ippou-de', 'grammar:n3-you-da-inference'] },
        { expression: '記録を見た上で', sentence: TRANSFER_PARAGRAPHS[1], sourceTitle: 'Yomu original N3/N4 bridge transfer: 夜の図書館', conceptIds: ['reading:n3-trade-off-and-bounded-response'] },
    ];
}
