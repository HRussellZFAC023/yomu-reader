import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import { N2_POLICY_SCOPE_PACKAGE_ID, N2_POLICY_SCOPE_PROVENANCE } from './source';
import type {
    N2PolicyScopePackage,
    N2PolicyScopePrerequisite,
    N2PolicyScopeReaderSrsProjection,
} from './types';

const REHEARSAL_PARAGRAPHS = Object.freeze([
    '地域センターでは、利用者が増えたからといって、すぐに部屋を増やすわけではない。まず、時間帯によって空いている部屋がないかを調べ、予約の方法を見直すことにした。',
    'それでも混雑が続く場合に限り、週末の利用時間を短くする案も検討する。今回の変更は利用者を減らすためではなく、今ある設備を安全に使い続けるためにほかならない。',
]);

const PREREQUISITES: readonly N2PolicyScopePrerequisite[] = Object.freeze([
    prerequisite('grammar:n3-condition-baai', '「場合に」を条件として読めること。', 'Can read baai ni as a condition.'),
    prerequisite('grammar:n3-reason-tame-ni', '「ために」で目的と理由を区別できること。', 'Can distinguish purpose and reason with tame ni.'),
    prerequisite('reading:n3-scope-and-contrast', '短い説明文で条件と対比の範囲を追えること。', 'Can track the scope of conditions and contrasts in a short explanatory text.'),
]);

export function createN2PolicyScopePackage(): N2PolicyScopePackage {
    const activity = Object.freeze({
        id: 'activity:n2-policy-scope-rehearsal',
        kind: 'academy-n2-policy-scope-rehearsal' as const,
        sourceQuestionId: N2_POLICY_SCOPE_PROVENANCE.sourceId,
        conceptIds: [
            'grammar:n2-kara-toitte',
            'grammar:n2-wake-dewa-nai',
            'grammar:n2-baai-ni-kagiri',
            'reading:n2-policy-purpose-and-scope',
        ],
        responseKind: 'n2-policy-scope-rehearsal-v1' as const,
        curriculumPhase: 'assessed-recognition' as const,
        prompt: {
            ja: 'N2の文法問題の構造を手がかりに、条件・非断定・目的の範囲を聞き分けましょう。',
            en: 'Use the N2 grammar-item structure to distinguish condition, non-assertion, and purpose by listening.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'pattern' as const,
            title: { ja: '範囲を保って読む', en: 'Read without widening the scope' },
            entries: [
                { japanese: '〜からといって、〜わけではない。', translation: 'Just because ... does not mean that ...' },
                { japanese: '〜場合に限り、〜。', translation: 'Only in the case that ...' },
                { japanese: '〜ためにほかならない。', translation: 'It is for no other reason than ...' },
            ],
        },
        provenance: N2_POLICY_SCOPE_PROVENANCE,
        payload: {
            teaching: [
                teaching('理由を結論に広げない', 'Do not widen a reason into a conclusion', '利用者が増えたからといって、部屋を増やすわけではない。', '前半の理由だけから、後半の結論を断定しません。', 'The reason in the first half does not establish the conclusion in the second.'),
                teaching('条件の外を含めない', 'Keep the condition narrow', '混雑が続く場合に限り、案を検討する。', '「場合に限り」は、決定がいつでも行われるとは言いません。', 'Baai ni kagiri does not say the decision applies at every time.'),
                teaching('目的を取り違えない', 'Identify the stated purpose', '安全に使い続けるためにほかならない。', '本文が示す目的を、別の推測に置き換えません。', 'Do not replace the stated purpose with a different inference.'),
            ],
            rehearsal: {
                title: { ja: 'オリジナル N2 リハーサル: 地域センターの利用', en: 'Original N2 rehearsal: community-centre use' },
                paragraphs: REHEARSAL_PARAGRAPHS,
                playbackText: REHEARSAL_PARAGRAPHS.join(' '),
                authorship: 'original-yomu-n2-rehearsal' as const,
            },
            questions: [
                question('non-assertion', '「利用者が増えたからといって」の後で、本文が否定しているのは何ですか。', 'What does the passage deny after riyousha ga fueta kara to itte?', [
                    option('automatic-new-rooms', 'すぐに部屋を増やすこと。', 'That rooms will immediately be added.'),
                    option('checking-availability', '空いている部屋を調べること。', 'Checking for available rooms.'),
                    option('revising-booking', '予約方法を見直すこと。', 'Reviewing the booking method.'),
                ], 'automatic-new-rooms', 'scope-non-assertion'),
                question('first-response', '混雑への最初の対応として、本文が述べているのは何ですか。', 'What first response to crowding does the passage state?', [
                    option('check-and-review', '空き時間を調べ、予約方法を見直すこと。', 'Check unused times and review bookings.'),
                    option('shorten-every-weekend', '毎週末、必ず利用時間を短くすること。', 'Always shorten use every weekend.'),
                    option('reduce-users', '利用者の数を減らすこと。', 'Reduce the number of users.'),
                ], 'check-and-review', 'source-sequence'),
                question('condition-limit', '週末の利用時間を短くする案は、どの条件で検討されますか。', 'Under which condition is shorter weekend use considered?', [
                    option('continued-crowding', '混雑が続く場合に限り。', 'Only if crowding continues.'),
                    option('any-new-user', '利用者が一人でも増えた場合。', 'Whenever even one user is added.'),
                    option('empty-room-found', '空いている部屋が見つかった場合。', 'If an empty room is found.'),
                ], 'continued-crowding', 'scope-condition'),
                question('purpose', '今回の変更の目的として、本文に最も合うのはどれですか。', 'Which purpose best fits the passage?', [
                    option('safe-continuity', '今ある設備を安全に使い続けること。', 'Continue using the existing facilities safely.'),
                    option('fewer-users', '利用者を少なくすること。', 'Make the number of users smaller.'),
                    option('new-building', '新しい建物をすぐに作ること。', 'Immediately build a new facility.'),
                ], 'safe-continuity', 'purpose-stated'),
            ],
            passScore: 1 as const,
            feedback: {
                pass: {
                    explanation: {
                        ja: '理由から広げすぎない結論、条件の範囲、本文が示す目的を区別できました。',
                        en: 'You distinguished a conclusion that is not overextended from its reason, the condition’s scope, and the stated purpose.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '「からといって」「わけではない」「場合に限り」「ためにほかならない」の前後を分けて確認しましょう。',
                        en: 'Check the clauses around kara to itte, wake dewa nai, baai ni kagiri, and tame ni hoka naranai separately.',
                    },
                    repairPrompt: {
                        ja: '理由、条件、目的にそれぞれ下線を引き、本文が言っていない範囲を選択肢から外してください。',
                        en: 'Underline the reason, condition, and purpose, then remove choices that widen beyond the passage.',
                    },
                    nearbyExample: {
                        ja: '予約が多いからといって、毎日受付を閉めるわけではない。必要な場合に限り、時間を調整する。',
                        en: 'Just because bookings are numerous does not mean the desk closes every day. Hours are adjusted only when necessary.',
                    },
                },
            },
            reviewTargets: [
                review('kara-toitte', 'grammar:n2-kara-toitte', '〜からといって', undefined, ['just because ... does not mean ...'], REHEARSAL_PARAGRAPHS[0], ['scope-non-assertion']),
                review('wake-dewa-nai', 'grammar:n2-wake-dewa-nai', '〜わけではない', undefined, ['it does not mean that ...'], REHEARSAL_PARAGRAPHS[0], ['scope-non-assertion']),
                review('baai-ni-kagiri', 'grammar:n2-baai-ni-kagiri', '〜場合に限り', 'ばあいにかぎり', ['only in the case that ...'], REHEARSAL_PARAGRAPHS[1], ['scope-condition']),
                review('tame-ni-hoka-naranai', 'reading:n2-policy-purpose-and-scope', '〜ためにほかならない', undefined, ['for no other reason than ...'], REHEARSAL_PARAGRAPHS[1], ['purpose-stated']),
            ],
        },
    });

    return Object.freeze({
        id: N2_POLICY_SCOPE_PACKAGE_ID,
        band: 'N2' as const,
        prerequisites: PREREQUISITES,
        activity,
        readerSrs: readerSrsProjection(),
    });
}

function prerequisite(conceptId: string, ja: string, en: string): N2PolicyScopePrerequisite {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted', reason: Object.freeze({ ja, en }) });
}

function teaching(ja: string, en: string, example: string, explanationJa: string, explanationEn: string) {
    return Object.freeze({ title: Object.freeze({ ja, en }), example, explanation: Object.freeze({ ja: explanationJa, en: explanationEn }) });
}

function option(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}

function question(id: string, ja: string, en: string, options: readonly ReturnType<typeof option>[], correctOptionId: string, errorTag: string) {
    return Object.freeze({ id, prompt: Object.freeze({ ja, en }), options: Object.freeze(options), correctOptionId, errorTag });
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
        id: `review:${N2_POLICY_SCOPE_PACKAGE_ID}:${suffix}`,
        conceptId,
        expression,
        ...(reading ? { reading } : {}),
        meanings: Object.freeze([...meanings]),
        sentence,
        repairFor: Object.freeze([...repairFor]),
    });
}

function readerSrsProjection(): N2PolicyScopeReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze([
            'reader:n2-policy-scope-01:rehearsal:paragraph-1',
            'reader:n2-policy-scope-01:rehearsal:paragraph-2',
        ]),
        miningRequests: Object.freeze(miningRequests()),
    });
}

function miningRequests(): MiningRequest[] {
    return [
        {
            expression: '〜からといって',
            sentence: REHEARSAL_PARAGRAPHS[0],
            sourceTitle: 'Yomu original N2 rehearsal: 地域センターの利用',
            conceptIds: ['grammar:n2-kara-toitte', 'grammar:n2-wake-dewa-nai'],
        },
        {
            expression: '〜場合に限り',
            sentence: REHEARSAL_PARAGRAPHS[1],
            sourceTitle: 'Yomu original N2 rehearsal: 地域センターの利用',
            conceptIds: ['grammar:n2-baai-ni-kagiri', 'reading:n2-policy-purpose-and-scope'],
        },
    ];
}
