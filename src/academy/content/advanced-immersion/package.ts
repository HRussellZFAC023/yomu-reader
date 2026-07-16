import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import {
    ADVANCED_IMMERSION_PROVENANCE,
    ADVANCED_IMMERSION_QUARANTINE,
    ADVANCED_IMMERSION_SOURCE_SEGMENTS,
} from './source';
import type {
    AdvancedImmersionPackage,
    AdvancedImmersionReaderSrsProjection,
    EpistemicFunction,
} from './types';

const CONCEPTS = Object.freeze([
    'grammar:inference-youdesu',
    'reading:contrast-with-evidence',
    'reading:evidence-ceiling',
    'reading:qualified-synthesis',
]);

const PREREQUISITES = Object.freeze([
    prerequisite('grammar:contrast-keredomo', '逆接の接続を、二つの出来事の単純な対比として読める。', 'Can read a concessive connection as a simple contrast between two events.'),
    prerequisite('grammar:inference-youdesu', '「ようだ」を断定ではなく、根拠のある見方として扱える。', 'Can treat youda as an evidence-based view, not a certainty.'),
    prerequisite('reading:claim-evidence', '本文に書かれた事実と、そこから導く説明を分けられる。', 'Can separate what a text states from an explanation inferred from it.'),
]);

const TRANSFER_PARAGRAPHS = Object.freeze([
    '夜間の活動時間が延びた地域があることは、当時の生活記録から読み取れる。照明の普及が唯一の原因だったとまでは言えない。',
    '便利になった一方で睡眠不足が増えたという見方にも、地域や職業による差が残る。したがって、制度全体の変化と断定するには、追加の資料が必要である。',
]);

export function createAdvancedImmersionPackage(): AdvancedImmersionPackage {
    const activity = Object.freeze({
        id: 'activity:advanced-immersion:evidence-boundaries',
        kind: 'academy-advanced-epistemic-immersion' as const,
        sourceQuestionId: `${ADVANCED_IMMERSION_PROVENANCE.sourceId}:source-and-transfer-v1`,
        conceptIds: CONCEPTS,
        responseKind: 'n3-n1-evidence-boundary-immersion-v1' as const,
        curriculumPhase: 'assessed-production' as const,
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: 'N3の資料文で述べられたことと推測を分け、N1の資料メモで断定の境界を保ってください。',
            en: 'Separate what the N3 source states from what it suggests, then preserve that boundary in an N1 source note.',
        },
        teachingSupport: {
            kind: 'pattern' as const,
            title: { ja: '根拠の境界', en: 'Evidence boundaries' },
            entries: [
                { japanese: '増えているようだ。', translation: 'An evidence-based observation, not a certainty.' },
                { japanese: '便利になった一方で、問題も残る。', translation: 'A contrast can hold two facts together.' },
                { japanese: '〜とまでは言えない。', translation: 'The evidence does not reach that conclusion.' },
            ],
        },
        provenance: ADVANCED_IMMERSION_PROVENANCE,
        payload: {
            teaching: [
                teaching('qualified-observation', '見方を限定する', 'Qualify an observation', '増えているようだ。', '根拠があっても、断定できる範囲を超えません。', 'Evidence can support an observation without making it certain.'),
                teaching('contrast-with-limit', '対比の両方を残す', 'Keep both sides of a contrast', '便利になった一方で、問題も残る。', '便利さと問題を、どちらか一方に消しません。', 'Convenience and a remaining problem can both be true.'),
                teaching('bounded-conclusion', '結論を根拠までに留める', 'Stop at the evidence', '唯一の原因だったとまでは言えない。', '資料が示さない原因や範囲は、結論に足しません。', 'Do not add a cause or scope the evidence does not establish.'),
            ],
            sourceSegments: ADVANCED_IMMERSION_SOURCE_SEGMENTS,
            transfer: {
                title: { ja: 'N+1 資料メモ：夜間活動の変化', en: 'N+1 source note: changing night activity' },
                paragraphs: TRANSFER_PARAGRAPHS,
                playbackText: TRANSFER_PARAGRAPHS.join(' '),
                authorship: 'original-yomu-n1-transfer' as const,
            },
            questions: [
                question('source-change', 'source-rehearsal', '電気の発明後、本文が直接述べている変化は何ですか。', 'What change does the source directly state after electricity was invented?', 'late-awake-increase', 'source-direct-claim'),
                question('source-contrast', 'source-rehearsal', '「一方で」は、便利さと何を同時に示していますか。', 'What does ippou de hold alongside greater convenience?', 'sleep-fatigue-increase', 'source-contrast-boundary'),
                question('source-modality', 'source-rehearsal', '「ようだ」は、話し手の判断をどう限定していますか。', 'How does youda limit the writer’s judgment?', 'qualified-observation', 'source-qualified-observation'),
                transferEvidenceQuestion(),
                transferSynthesisQuestion(),
            ],
            passScore: 1 as const,
            feedback: {
                pass: {
                    explanation: {
                        ja: '本文の事実、対比、資料がまだ支えない結論を分けられました。',
                        en: 'You separated stated facts, contrast, and conclusions the evidence does not yet support.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '何が書かれているかと、そこから何を言えるかを一文ずつ分けて確認しましょう。',
                        en: 'Check each sentence separately: what it says, and what it permits you to conclude.',
                    },
                    repairPrompt: {
                        ja: '「ようだ」「一方で」「とまでは言えない」「断定するには」を印にしてください。',
                        en: 'Mark youda, ippou de, to made wa ienai, and dantei suru ni wa as boundary signals.',
                    },
                    nearbyExample: {
                        ja: '利用者が増えたようだが、制度変更だけが理由だとは言えない。',
                        en: 'Users seem to have increased, but the policy change alone cannot be named as the reason.',
                    },
                },
            },
            reviewTargets: [
                review('youdesu', 'grammar:inference-youdesu', '〜ようだ', undefined, ['it seems; an evidence-based observation'], ADVANCED_IMMERSION_SOURCE_SEGMENTS[2].text, ['source-qualified-observation']),
                review('ippoude', 'reading:contrast-with-evidence', '一方で', 'いっぽうで', ['while; on the other hand'], ADVANCED_IMMERSION_SOURCE_SEGMENTS[2].text, ['source-contrast-boundary']),
                review('to-made-wa-ienai', 'reading:evidence-ceiling', '〜とまでは言えない', undefined, ['cannot go so far as to say'], TRANSFER_PARAGRAPHS[0], ['transfer-evidence-ceiling']),
                review('dantei-suru-niwa', 'reading:qualified-synthesis', '断定するには', 'だんていするには', ['to conclude definitively'], TRANSFER_PARAGRAPHS[1], ['transfer-qualified-synthesis']),
            ],
        },
    });

    return Object.freeze({
        id: ADVANCED_IMMERSION_PROVENANCE.packageId,
        band: 'N3-to-N1' as const,
        prerequisites: PREREQUISITES,
        activity,
        readerSrs: readerSrsProjection(),
        quarantine: ADVANCED_IMMERSION_QUARANTINE,
    });
}

function prerequisite(conceptId: string, ja: string, en: string) {
    return Object.freeze({
        conceptId,
        minimumEvidence: 'introduced-and-attempted' as const,
        reason: Object.freeze({ ja, en }),
    });
}

function teaching(
    fn: EpistemicFunction,
    ja: string,
    en: string,
    example: string,
    explanationJa: string,
    explanation: string,
) {
    return Object.freeze({
        function: fn,
        title: Object.freeze({ ja, en }),
        example,
        explanation: Object.freeze({ ja: explanationJa, en: explanation }),
    });
}

function question(
    id: string,
    stage: 'source-rehearsal' | 'n1-transfer',
    ja: string,
    en: string,
    answer: string,
    errorTag: string,
) {
    return Object.freeze({ id, stage, prompt: Object.freeze({ ja, en }), options: sourceOptions(), correctOptionId: answer, errorTag });
}

function sourceOptions() {
    return Object.freeze([
        option('late-awake-increase', '夜遅くまで起きている人が多くなった。', 'More people stayed awake late at night.'),
        option('sleep-fatigue-increase', '睡眠不足で疲れている人も増えている。', 'More people are also tired from lack of sleep.'),
        option('qualified-observation', '根拠はあるが、断定ではない見方である。', 'It is an evidence-based view, not a certainty.'),
    ]);
}

function transferEvidenceQuestion() {
    return Object.freeze({
        id: 'transfer-evidence',
        stage: 'n1-transfer' as const,
        prompt: Object.freeze({ ja: '資料メモから直接読み取れる範囲はどこまでですか。', en: 'What is the strongest claim directly supported by the source note?' }),
        options: Object.freeze([
            option('regional-activity', '夜間の活動時間が延びた地域がある。', 'Some regions had longer night activity.'),
            option('sole-cause', '照明の普及だけが活動時間を変えた。', 'Lighting alone changed activity hours.'),
            option('system-wide-change', '制度全体が変化したことが確定した。', 'A system-wide change has been established.'),
        ]),
        correctOptionId: 'regional-activity',
        errorTag: 'transfer-evidence-ceiling',
    });
}

function transferSynthesisQuestion() {
    return Object.freeze({
        id: 'transfer-synthesis',
        stage: 'n1-transfer' as const,
        prompt: Object.freeze({ ja: '根拠の境界を保つ要約を選んでください。', en: 'Choose the summary that preserves every evidence boundary.' }),
        options: Object.freeze([
            option('qualified', '夜間活動が延びた地域はあるが、照明を唯一の原因とは言えず、全体の変化には追加資料が必要である。', 'Some regions had longer night activity, but lighting cannot be named as the sole cause and more evidence is needed for a whole-system claim.'),
            option('certain', '照明の普及が制度全体を変え、睡眠不足を増やしたことが証明された。', 'Lighting is proven to have changed the whole system and increased sleep deprivation.'),
            option('unknown-all', '原因が一つに決まらないので、夜間活動について確認できることは何もない。', 'Because the cause is not singular, nothing about night activity can be confirmed.'),
        ]),
        correctOptionId: 'qualified',
        errorTag: 'transfer-qualified-synthesis',
    });
}

function option(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}

function review(
    suffix: string,
    conceptId: string,
    expression: string,
    reading: string | undefined,
    meanings: readonly string[],
    sentence: string,
    repairFor: readonly string[],
) {
    return Object.freeze({
        id: `review:${ADVANCED_IMMERSION_PROVENANCE.packageId}:${suffix}`,
        conceptId,
        expression,
        ...(reading ? { reading } : {}),
        meanings: Object.freeze([...meanings]),
        sentence,
        repairFor: Object.freeze([...repairFor]),
    });
}

function readerSrsProjection(): AdvancedImmersionReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze([
            ...ADVANCED_IMMERSION_SOURCE_SEGMENTS.map(segment => `reader:${ADVANCED_IMMERSION_PROVENANCE.packageId}:${segment.id}`),
            'reader:advanced-immersion-n3-n1-01:n1-transfer:paragraph-1',
            'reader:advanced-immersion-n3-n1-01:n1-transfer:paragraph-2',
        ]),
        miningRequests: Object.freeze(miningRequests()),
    });
}

function miningRequests(): MiningRequest[] {
    return [
        {
            expression: '〜ようだ',
            sentence: ADVANCED_IMMERSION_SOURCE_SEGMENTS[2].text,
            sourceTitle: 'Soya N3 mock 1 reading: mock1_r_03',
            conceptIds: ['grammar:inference-youdesu', 'reading:contrast-with-evidence'],
        },
        {
            expression: '〜とまでは言えない',
            sentence: TRANSFER_PARAGRAPHS[0],
            sourceTitle: 'Yomu original N1 transfer: 夜間活動の変化',
            conceptIds: ['reading:evidence-ceiling', 'reading:qualified-synthesis'],
        },
    ];
}
