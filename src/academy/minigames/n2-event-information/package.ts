import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import { N2_EVENT_INFORMATION_PACKAGE_ID, N2_EVENT_INFORMATION_PROVENANCE } from './source';
import type {
    N2EventInformationPackage,
    N2EventInformationPrerequisite,
    N2EventInformationReaderSrsProjection,
} from './types';

const NOTICE_PARAGRAPHS = Object.freeze([
    '市民科学館では、日曜日の10時から16時まで「身近な自然観察会」を開きます。入場は無料です。14時30分のミニ講座は先着18人で、当日の14時から受付で整理券を配ります。',
    '観察カードを受け取り、会場の観察台を3か所以上回ると標本カードがもらえます。標本カードへの交換は15時30分までです。13時の顕微鏡作りは予約した人だけが参加でき、材料費は300円です。',
    '雨の場合も観察台を館内へ移して実施します。ただし、荒天で中止する場合は、当日の午前7時30分までに科学館の案内ページで知らせます。',
]);

const PREREQUISITES: readonly N2EventInformationPrerequisite[] = Object.freeze([
    prerequisite('reading:n3-notice-layout', '案内文の見出しと項目を対応させて読める。', 'Can connect notice headings with their details.'),
    prerequisite('reading:n3-time-and-quantity', '時刻、人数、回数を正確に拾える。', 'Can retrieve times, headcounts, and quantities accurately.'),
    prerequisite('reading:n3-condition-exception', '条件と例外を別々に追える。', 'Can track a condition separately from its exception.'),
]);

export function createN2EventInformationPackage(): N2EventInformationPackage {
    const activity = Object.freeze({
        id: 'activity:n2-event-information',
        kind: 'academy-n2-event-information' as const,
        sourceQuestionId: N2_EVENT_INFORMATION_PROVENANCE.sourceId,
        conceptIds: [
            'reading:n2-deadline-backsolve',
            'reading:n2-threshold-and-capacity',
            'reading:n2-condition-exception',
            'listening:n2-operational-sequence',
        ],
        responseKind: 'n2-event-information-v1' as const,
        curriculumPhase: 'assessed-recognition' as const,
        prompt: {
            ja: '案内の締め切り・必要数・例外を整理し、行動の順番を決めましょう。',
            en: 'Organize the notice deadline, threshold, and exception, then choose the action order.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'pattern' as const,
            title: { ja: '検索する前に条件を分ける', en: 'Separate constraints before retrieval' },
            entries: [
                { japanese: '15時30分まで', translation: 'a deadline, not the event closing time' },
                { japanese: '3か所以上', translation: 'a minimum threshold' },
                { japanese: 'ただし、荒天の場合', translation: 'an exception to the normal plan' },
            ],
        },
        provenance: N2_EVENT_INFORMATION_PROVENANCE,
        payload: {
            teaching: [
                teaching('締め切りを終了時刻と分ける', 'Separate a deadline from closing time', '会は16時までですが、交換は15時30分までです。', '最後にできる時刻を、催し全体の終了時刻と混ぜません。', 'Do not confuse the last time an action is allowed with the event closing time.'),
                teaching('「以上」と「先着」を区別する', 'Distinguish a minimum from a capacity', '3か所以上回る。先着18人まで参加できる。', '「以上」は必要な最小数、「先着」は受け入れる最大人数を示します。', 'Ijou gives a minimum requirement; senchaku gives a capacity.'),
                teaching('通常と例外を二段にする', 'Keep the normal case and exception in two layers', '雨でも実施します。ただし、荒天の場合は中止します。', '最初の条件を、後の「ただし」がどこまで狭めるか確認します。', 'Check how far the later tadashi narrows the normal rule.'),
            ],
            notice: {
                title: { ja: 'オリジナル N2 案内: 身近な自然観察会', en: 'Original N2 notice: neighbourhood nature lab' },
                paragraphs: NOTICE_PARAGRAPHS,
                facts: [
                    fact('開催', 'Event', '日曜日 10:00-16:00 / 入場無料'),
                    fact('ミニ講座', 'Mini talk', '14:30 / 先着18人 / 整理券は14:00から'),
                    fact('標本カード', 'Specimen card', '観察台3か所以上 / 交換は15:30まで'),
                    fact('顕微鏡作り', 'Microscope workshop', '13:00 / 要予約 / 材料費300円'),
                    fact('天候', 'Weather', '雨天実施 / 荒天中止は7:30までに案内'),
                ],
                playbackText: NOTICE_PARAGRAPHS.join(' '),
                authorship: 'original-yomu-n2-notice' as const,
            },
            questions: [
                question('specimen-card', '標本カードをもらうために必要なことはどれですか。', 'What is required to receive the specimen card?', [
                    option('three-by-1530', '観察台を3か所以上回り、15時30分までに交換する。', 'Visit at least three stations and exchange by 15:30.'),
                    option('one-by-1600', '観察台を1か所回り、16時までに交換する。', 'Visit one station and exchange by 16:00.'),
                    option('pay-300', '材料費300円を払う。', 'Pay the 300-yen materials fee.'),
                ], 'three-by-1530', 'station-threshold'),
                question('mini-talk', '14時30分のミニ講座について正しいものはどれですか。', 'Which statement about the 14:30 mini talk is correct?', [
                    option('ticket-capacity', '14時から配る整理券を受け取り、先着18人に入る必要がある。', 'Get a ticket distributed from 14:00 and be among the first 18.'),
                    option('advance-booking', '前日までに予約しなければならない。', 'Book by the previous day.'),
                    option('paid-entry', '入場料300円を払えば必ず参加できる。', 'Pay 300 yen to guarantee entry.'),
                ], 'ticket-capacity', 'lecture-capacity'),
                question('weather', '天候について、案内に合うものはどれですか。', 'Which weather statement matches the notice?', [
                    option('rain-inside-severe-cancel', '雨なら館内で実施し、荒天中止なら7時30分までに案内が出る。', 'Rain moves the activity indoors; severe-weather cancellation is posted by 07:30.'),
                    option('all-rain-cancel', '雨が降れば必ず中止になる。', 'Any rain cancels the event.'),
                    option('decision-at-1000', '中止のお知らせは10時に出る。', 'Cancellation is posted at 10:00.'),
                ], 'rain-inside-severe-cancel', 'weather-exception'),
            ],
            actionSequence: {
                prompt: {
                    ja: '標本カードを受け取る流れを、案内に合う順番にしてください。',
                    en: 'Put the specimen-card process in the order supported by the notice.',
                },
                actions: [
                    action('check-status', '荒天の日は案内ページを確認する', 'Check the notice page in severe weather'),
                    action('get-observation-card', '観察カードを受け取る', 'Collect an observation card'),
                    action('visit-three-stations', '観察台を3か所以上回る', 'Visit at least three stations'),
                    action('exchange-by-deadline', '15時30分までに標本カードへ交換する', 'Exchange for the specimen card by 15:30'),
                ],
                correctOrder: ['check-status', 'get-observation-card', 'visit-three-stations', 'exchange-by-deadline'],
                errorTag: 'action-sequence' as const,
            },
            passScore: 1 as const,
            feedback: {
                pass: {
                    explanation: {
                        ja: '締め切り、必要数、定員、天候の例外を分け、行動順に戻せました。',
                        en: 'You separated the deadline, threshold, capacity, and weather exception and rebuilt the action sequence.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '時刻、数、「ただし」の後を別々に表へ戻して確認しましょう。',
                        en: 'Return the times, numbers, and the clause after tadashi to separate rows of the grid.',
                    },
                    repairPrompt: {
                        ja: '「まで」「以上」「先着」「ただし」に印を付け、必要条件だけを順番に並べてください。',
                        en: 'Mark made, ijou, senchaku, and tadashi, then order only the required conditions.',
                    },
                    nearbyExample: {
                        ja: '会場は17時までです。ただし、受付は16時30分までで、先着20人です。',
                        en: 'The venue is open until 17:00. However, check-in ends at 16:30 and capacity is the first 20 people.',
                    },
                },
            },
            reviewTargets: [
                review('deadline', 'reading:n2-deadline-backsolve', '15時30分まで', 'じゅうごじさんじゅっぷんまで', ['by 15:30'], NOTICE_PARAGRAPHS[1], ['station-threshold', 'action-sequence']),
                review('minimum', 'reading:n2-threshold-and-capacity', '3か所以上', 'さんかしょいじょう', ['at least three locations'], NOTICE_PARAGRAPHS[1], ['station-threshold', 'action-sequence']),
                review('capacity', 'reading:n2-threshold-and-capacity', '先着18人', 'せんちゃくじゅうはちにん', ['the first 18 people'], NOTICE_PARAGRAPHS[0], ['lecture-capacity']),
                review('exception', 'reading:n2-condition-exception', 'ただし、荒天で中止する場合', 'ただし、こうてんでちゅうしするばあい', ['however, if cancelled because of severe weather'], NOTICE_PARAGRAPHS[2], ['weather-exception', 'action-sequence']),
            ],
        },
    });

    return Object.freeze({
        id: N2_EVENT_INFORMATION_PACKAGE_ID,
        band: 'N2' as const,
        prerequisites: PREREQUISITES,
        activity,
        readerSrs: readerSrsProjection(),
    });
}

function prerequisite(conceptId: string, ja: string, en: string): N2EventInformationPrerequisite {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted', reason: Object.freeze({ ja, en }) });
}

function teaching(ja: string, en: string, example: string, explanationJa: string, explanationEn: string) {
    return Object.freeze({ title: Object.freeze({ ja, en }), example, explanation: Object.freeze({ ja: explanationJa, en: explanationEn }) });
}

function fact(ja: string, en: string, value: string) {
    return Object.freeze({ label: Object.freeze({ ja, en }), value });
}

function option(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}

function question(id: string, ja: string, en: string, options: readonly ReturnType<typeof option>[], correctOptionId: string, errorTag: string) {
    return Object.freeze({ id, prompt: Object.freeze({ ja, en }), options: Object.freeze(options), correctOptionId, errorTag });
}

function action(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}

function review(
    suffix: string,
    conceptId: string,
    expression: string,
    reading: string,
    meanings: readonly string[],
    sentence: string,
    repairFor: readonly string[],
) {
    return Object.freeze({
        id: `review:${N2_EVENT_INFORMATION_PACKAGE_ID}:${suffix}`,
        conceptId,
        expression,
        reading,
        meanings: Object.freeze([...meanings]),
        sentence,
        repairFor: Object.freeze([...repairFor]),
    });
}

function readerSrsProjection(): N2EventInformationReaderSrsProjection {
    return Object.freeze({
        readerSurfaceIds: Object.freeze([
            'reader:n2-event-information-01:teaching:1',
            'reader:n2-event-information-01:teaching:2',
            'reader:n2-event-information-01:teaching:3',
            'reader:n2-event-information-01:grid:1',
            'reader:n2-event-information-01:grid:2',
            'reader:n2-event-information-01:grid:3',
            'reader:n2-event-information-01:grid:4',
            'reader:n2-event-information-01:grid:5',
            'reader:n2-event-information-01:notice:paragraph-1',
            'reader:n2-event-information-01:notice:paragraph-2',
            'reader:n2-event-information-01:notice:paragraph-3',
        ]),
        miningRequests: Object.freeze(miningRequests()),
        networkDependencies: Object.freeze([]) as readonly [],
    });
}

function miningRequests(): MiningRequest[] {
    return [
        {
            expression: '3か所以上',
            sentence: NOTICE_PARAGRAPHS[1],
            sourceTitle: 'Yomu original N2 notice: 身近な自然観察会',
            conceptIds: ['reading:n2-threshold-and-capacity', 'reading:n2-deadline-backsolve'],
        },
        {
            expression: 'ただし、荒天で中止する場合',
            sentence: NOTICE_PARAGRAPHS[2],
            sourceTitle: 'Yomu original N2 notice: 身近な自然観察会',
            conceptIds: ['reading:n2-condition-exception', 'listening:n2-operational-sequence'],
        },
    ];
}
