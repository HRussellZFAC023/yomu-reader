import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import {
    N3_PET_HOUSING_PACKAGE_ID,
    N3_PET_HOUSING_PROVENANCE,
    N3_PET_HOUSING_QUARANTINE,
    N3_PET_HOUSING_SOURCE_SEGMENTS,
} from './source';
import type {
    N3PetHousingPackage,
    N3PetHousingPrerequisite,
    N3PetHousingReaderSrsProjection,
} from './types';

const TRANSFER_PARAGRAPHS = Object.freeze([
    '管理会社は、ペット可の表示だけで安心しないよう入居者に伝えている。契約で許されていても、夜遅い時間の鳴き声や共用廊下のにおいは、近所の人にとって困ることがあるからだ。',
    'ある建物では、飼い主同士が月に一度短い話し合いを始めた。苦情を言う場ではなく、困ったことを早めに共有し、必要なら飼い方を変えるための場である。',
]);

const PREREQUISITES: readonly N3PetHousingPrerequisite[] = Object.freeze([
    prerequisite('grammar:n4-reason-kara', '理由を「から」で結べること。', 'Can connect a reason with kara.'),
    prerequisite('grammar:n4-adversative-kedo', '二つの事実を「しかし／けれども」で対比できること。', 'Can contrast two facts with shikashi or keredomo.'),
    prerequisite('reading:n4-main-claim', '短い説明文で中心の主張を探した経験があること。', 'Has practised locating the main claim in a short explanatory text.'),
]);

export function createN3PetHousingPackage(): N3PetHousingPackage {
    const activity = Object.freeze({
        id: 'activity:n3-pet-housing-immersion',
        kind: 'academy-n3-pet-housing-immersion' as const,
        sourceQuestionId: N3_PET_HOUSING_PROVENANCE.sourceId,
        conceptIds: [
            'grammar:n3-case-mo-sukunakunai',
            'reading:n3-reason-and-consequence',
            'reading:n3-bounded-community-response',
        ],
        responseKind: 'n3-pet-housing-source-rehearsal-and-transfer-v1' as const,
        curriculumPhase: 'assessed-recognition' as const,
        prompt: {
            ja: '短い資料文を聞き、理由・対比・起こりうる結果を分けて判断しましょう。',
            en: 'Rehearse a short source text, then distinguish its reason, contrast, and possible consequence.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'pattern' as const,
            title: { ja: '理由と結果を分ける', en: 'Separate reason from consequence' },
            entries: [
                { japanese: '〜からだ。', translation: 'It is because ...' },
                { japanese: 'しかし、〜。', translation: 'However, ...' },
                { japanese: '〜ケースも少なくない。', translation: 'Cases of ... are not uncommon.' },
            ],
        },
        provenance: N3_PET_HOUSING_PROVENANCE,
        payload: {
            teaching: [
                teaching('理由を先に確かめる', 'Identify the stated reason first', '一人暮らしの寂しさを癒すためだ。', '理由を、起きた問題と取り違えません。', 'Do not confuse the stated reason with the problem that follows.'),
                teaching('対比で方向を変える', 'Use the contrast to change direction', 'しかし、問題もある。', '「しかし」の後では、本文の焦点が新しい制約や問題に移ります。', 'After shikashi, the focus moves to a constraint or problem.'),
                teaching('頻度を言い過ぎない', 'Do not overstate frequency', 'ケースも少なくない。', '「少なくない」は、必ず起こるという意味ではありません。', 'Sukunakunai says a case is not rare; it does not say it always happens.'),
            ],
            sourceSegments: N3_PET_HOUSING_SOURCE_SEGMENTS,
            transfer: {
                title: { ja: 'オリジナル転移文: 住まいの相談', en: 'Original transfer: a housing conversation' },
                paragraphs: TRANSFER_PARAGRAPHS,
                playbackText: TRANSFER_PARAGRAPHS.join(' '),
                authorship: 'original-yomu-n3-transfer' as const,
            },
            questions: [
                question('source-reason', 'source-rehearsal', '犬や猫を飼う人が多い理由として、本文が述べているのは何ですか。', 'What reason does the source give for many people keeping dogs or cats?', [
                    option('ease-loneliness', '一人暮らしの寂しさを癒すため。', 'To ease the loneliness of living alone.'),
                    option('lower-rent', '家賃が安くなるため。', 'Because rent becomes cheaper.'),
                    option('no-rules', '建物に規則がないため。', 'Because the building has no rules.'),
                ], 'ease-loneliness', 'source-stated-reason'),
                question('source-consequence', 'source-rehearsal', '「しかし」の後で、本文が示す起こりうる結果は何ですか。', 'What possible result does the source state after shikashi?', [
                    option('neighbour-trouble', '隣の人とトラブルになることがある。', 'There can be trouble with neighbours.'),
                    option('pets-disappear', '犬や猫がいなくなる。', 'Dogs and cats disappear.'),
                    option('rent-doubles', '家賃が二倍になる。', 'Rent doubles.'),
                ], 'neighbour-trouble', 'source-contrast-consequence'),
                question('transfer-purpose', 'original-transfer', '話し合いの主な目的は何ですか。', 'What is the primary purpose of the meeting?', [
                    option('early-sharing', '困ったことを早めに共有し、必要なら飼い方を変えること。', 'To share problems early and change care when needed.'),
                    option('assign-blame', '苦情を言った人を決めること。', 'To identify who made a complaint.'),
                    option('ban-pets', 'すぐにペットを禁止すること。', 'To ban pets immediately.'),
                ], 'early-sharing', 'transfer-bounded-response'),
                question('transfer-limit', 'original-transfer', '本文に最も合う判断はどれですか。', 'Which judgment best fits the transfer passage?', [
                    option('permission-not-enough', '契約で許されていても、近所への影響を考える必要がある。', 'Permission in the contract still requires considering neighbours.'),
                    option('permission-solves-all', '契約で許されていれば、近所への影響は考えなくてよい。', 'Contract permission means neighbour impact need not be considered.'),
                    option('talk-never-helps', '話し合いをしても、問題を早く共有することはできない。', 'A meeting cannot help share problems early.'),
                ], 'permission-not-enough', 'transfer-scope-limit'),
            ],
            passScore: 1 as const,
            feedback: {
                pass: {
                    explanation: {
                        ja: '資料文の理由と結果、そしてオリジナル転移文の限られた対応を区別できました。',
                        en: 'You separated the source reason and consequence, then identified the bounded response in the original transfer text.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '理由、対比の後に起こること、本文が言い過ぎていない範囲を一つずつ確認しましょう。',
                        en: 'Check one layer at a time: the reason, what follows the contrast, and the limit of what the text claims.',
                    },
                    repairPrompt: {
                        ja: '「からだ」「しかし」「少なくない」「必要なら」に印を付けて、前後の文を比べてください。',
                        en: 'Mark kara da, shikashi, sukunakunai, and hitsuyou nara, then compare what comes before and after each one.',
                    },
                    nearbyExample: {
                        ja: '利用は許可されている。しかし、夜の音については早めに相談する必要がある。',
                        en: 'Use is permitted. However, night-time noise still needs early discussion.',
                    },
                },
            },
            reviewTargets: [
                review('sukunakunai', 'grammar:n3-case-mo-sukunakunai', '〜ケースも少なくない', 'けーすもすくなくない', ['cases of ... are not uncommon'], N3_PET_HOUSING_SOURCE_SEGMENTS[0].text, ['source-contrast-consequence']),
                review('reason-consequence', 'reading:n3-reason-and-consequence', 'しかし', undefined, ['however; introduces a contrast or consequence'], N3_PET_HOUSING_SOURCE_SEGMENTS[0].text, ['source-stated-reason', 'source-contrast-consequence']),
                review('hitsuyou-nara', 'reading:n3-bounded-community-response', '必要なら', 'ひつようなら', ['if necessary'], TRANSFER_PARAGRAPHS[1], ['transfer-bounded-response']),
                review('contract-limit', 'reading:n3-bounded-community-response', '契約で許されていても', 'けいやくでゆるされていても', ['even if permitted by contract'], TRANSFER_PARAGRAPHS[0], ['transfer-scope-limit']),
            ],
        },
    });

    return Object.freeze({
        id: N3_PET_HOUSING_PACKAGE_ID,
        band: 'N3' as const,
        prerequisites: PREREQUISITES,
        activity,
        readerSrs: readerSrsProjection(),
        quarantine: N3_PET_HOUSING_QUARANTINE,
    });
}

function prerequisite(conceptId: string, ja: string, en: string): N3PetHousingPrerequisite {
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
    ja: string,
    en: string,
    options: readonly ReturnType<typeof option>[],
    correctOptionId: string,
    errorTag: string,
) {
    return Object.freeze({ id, stage, prompt: Object.freeze({ ja, en }), options: Object.freeze(options), correctOptionId, errorTag });
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
        id: `review:${N3_PET_HOUSING_PACKAGE_ID}:${suffix}`,
        conceptId,
        expression,
        ...(reading ? { reading } : {}),
        meanings: Object.freeze([...meanings]),
        sentence,
        repairFor: Object.freeze([...repairFor]),
    });
}

function readerSrsProjection(): N3PetHousingReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze([
            ...N3_PET_HOUSING_SOURCE_SEGMENTS.map(segment => `reader:${N3_PET_HOUSING_PACKAGE_ID}:${segment.id}`),
            'reader:n3-pet-housing-01:original-transfer:paragraph-1',
            'reader:n3-pet-housing-01:original-transfer:paragraph-2',
        ]),
        miningRequests: Object.freeze(miningRequests()),
    });
}

function miningRequests(): MiningRequest[] {
    return [
        {
            expression: '〜ケースも少なくない',
            sentence: N3_PET_HOUSING_SOURCE_SEGMENTS[0].text,
            sourceTitle: 'Soya N3 mock 1 reading: mock1_r_04',
            conceptIds: ['grammar:n3-case-mo-sukunakunai', 'reading:n3-reason-and-consequence'],
        },
        {
            expression: '必要なら',
            sentence: TRANSFER_PARAGRAPHS[1],
            sourceTitle: 'Yomu original N3 transfer: 住まいの相談',
            conceptIds: ['reading:n3-bounded-community-response'],
        },
    ];
}
