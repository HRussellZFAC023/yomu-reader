import lessonPackage from '../../../public/academy/content/lessons/043-l2-l16.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    StateInspectionInteraction,
    StateInspectionModel,
    StateInspectionOption,
    StateInspectionRound,
    StateInspectionSourceVisual,
} from '../minigames/state-inspection';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l16';
const PACKAGE_ORDER = 43;
const MODULE_ID = 8121269;
const ARCHIVE_ID = 'archive-000066';
const GRAMMAR_ONE_SHA256 = '0db539c444b66c4e83424da858d8206c2dfa0e34f80c3d4342605a20ff9ecada';
const GRAMMAR_TWO_SHA256 = '1c3abd70bbd7971c9bdb119d400634d088356bb22c68495daf9a722b46ed9cf9';
const INFO_GAP_SHA256 = 'ec9736ce5fe4c09b825ad9d47cf216821f7ac96ac461b05f5ab5a85f63ac898e';
const VOCABULARY_SHA256 = 'a24f5e14a09ee74f45855296fa1a0df00775a7e9037c0ec6fc350e6b98a26db8';
const GRAMMAR_ONE_TITLE = 'Handouts/Chapter 30-1 〜てある-1 Grammar exercise.pdf';
const GRAMMAR_TWO_TITLE = 'Handouts/Chapter 30-1 〜てある-2 Grammar exercise and summary.pdf';
const INFO_GAP_TITLE = 'Handouts/Chapter 30 〜てある information gap exercise_completed.pdf';
const VOCABULARY_TITLE = 'Handouts/Chapter 30-1 Vocabulary Sheet.pdf';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(VOCABULARY_SHA256, VOCABULARY_TITLE, 1, 'moodle-chapter-30-1-vocabulary-page-1.png', '1152918885025693d42f59d0844e315acf7aacf0fa1747ba5509aac317dd38e1', {
        ja: 'Moodle 原本: Chapter 30-1 Vocabulary Sheet、1ページ。玄関、廊下、壁、貼ります、掛けます、並べます、植えます、周り、真ん中などの語彙。',
        en: 'Moodle original: Chapter 30-1 Vocabulary Sheet page 1, including entrance, corridor, wall, paste, hang, arrange, plant, around, and middle vocabulary.',
    }, 'inline-reference'),
    sourceVisual(VOCABULARY_SHA256, VOCABULARY_TITLE, 2, 'moodle-chapter-30-1-vocabulary-page-2.png', '5bbae29bcf083f2b9f6c1843c1848b32bbe294b2079ed2528bff2ceea3c12754', {
        ja: 'Moodle 原本: Chapter 30-1 Vocabulary Sheet、2ページ。予定表、ごみ箱、引き出し、入れます、片付けます、しまいます、窓際、茶室などの語彙。',
        en: 'Moodle original: Chapter 30-1 Vocabulary Sheet page 2, including schedule, rubbish bin, drawer, put in, tidy up, put away, by the window, and tea-room vocabulary.',
    }, 'inline-reference'),
    sourceVisual(GRAMMAR_ONE_SHA256, GRAMMAR_ONE_TITLE, 1, 'moodle-chapter-30-1-tearu-1-page-1.png', '5d9c9a9e3a2b241eb3a31ff96855f2ce24e0987dd6a1c5b5f632226b181d535c', {
        ja: 'Moodle 原本: Chapter 30-1 その1、1ページ。目的のある行為の結果、場所に物がある型、自動詞の「ています」と他動詞の「てあります」の対照。',
        en: 'Moodle original: Chapter 30-1 part 1 page 1, teaching purposeful resultant state, place-ni thing-ga order, and the intransitive ています versus transitive てあります contrast.',
    }),
    sourceVisual(GRAMMAR_ONE_SHA256, GRAMMAR_ONE_TITLE, 2, 'moodle-chapter-30-1-tearu-1-page-2.png', 'b8786e398c80109f92caa5fd9cf9ec129348f1ff541005d5e592f4b7a21a9cd6', {
        ja: 'Moodle 原本: Chapter 30-1 その1、2ページ。絵の配置課題と短い会話。',
        en: 'Moodle original: Chapter 30-1 part 1 page 2, with picture-placement tasks and short conversations.',
    }),
    sourceVisual(GRAMMAR_TWO_SHA256, GRAMMAR_TWO_TITLE, 1, 'moodle-chapter-30-1-tearu-2-page-1.png', 'ddc590cf0270e321e98b933ccc2972798367051343e3ca221f88bcfc5dcc430f', {
        ja: 'Moodle 原本: Chapter 30-1 その2、1ページ。物を「は」で取り上げる型と台所の課題。',
        en: 'Moodle original: Chapter 30-1 part 2 page 1, teaching thing-wa place-ni order and a kitchen task.',
    }),
    sourceVisual(GRAMMAR_TWO_SHA256, GRAMMAR_TWO_TITLE, 2, 'moodle-chapter-30-1-tearu-2-page-2.png', '9f98114f963287be60c3ab2074af0823c229d078cff290fc15a0c0008853016f', {
        ja: 'Moodle 原本: Chapter 30-1 その2、2ページ。オフィスの四つの配置問題と持ち物の会話。',
        en: 'Moodle original: Chapter 30-1 part 2 page 2, with four office-placement rows and belongings conversation practice.',
    }),
    sourceVisual(GRAMMAR_TWO_SHA256, GRAMMAR_TWO_TITLE, 3, 'moodle-chapter-30-1-tearu-2-page-3.png', 'e44924a1d24809feaa577fb59c0ca90b64fded5743fba2d3ede3457a4b78529d', {
        ja: 'Moodle 原本: Chapter 30-1 その2、3ページ。音声課題、自動詞・他動詞表、三つの「ています／てあります」選択。',
        en: 'Moodle original: Chapter 30-1 part 2 page 3, with an unresolved listening task, a verb-pair table, and three ています／てあります choices.',
    }),
    sourceVisual(INFO_GAP_SHA256, INFO_GAP_TITLE, 1, 'moodle-chapter-30-information-gap-page-1.png', 'db345d3097b5e664a19d1274c3c0eda961f6406ac6ac9536614518c45de86556', {
        ja: 'Moodle 原本: Chapter 30 情報差、1ページ。Room A と Room B、および帽子と花の二つの例。',
        en: 'Moodle original: Chapter 30 information gap page 1, with Room A, Room B, and the two hat and flower examples.',
    }),
]);

export function createLessonFortyOnePreparedStateAuditBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('window-neutral', 1, 3, 6, 1, 'state-select', grammarQuestion(3, 6, 1),
            '1）窓が 閉まって［います／あります］。', '窓が 閉まって います。', [
                option('窓が 閉まって います。', '窓が閉まっています。', 'The window is closed: a neutral visible state.'),
                option('窓が 閉まって あります。', '窓が閉まってあります。', 'The window is deliberately closed, but with the intransitive verb.'),
            ], [
                hint('この文は、窓の状態だけを伝えます。', 'This row only reports the window’s visible state.'),
                hint('「閉まる」は自動詞です。', '閉まる is the intransitive verb.'),
                hint('自動詞の結果状態は「閉まっています」です。', 'Use 閉まっています for the intransitive resulting state.'),
            ]),
        round('desks-prepared', 2, 3, 6, 2, 'state-select', grammarQuestion(3, 6, 2),
            '2）机が 並べて［います／ありますよ］。', '机が 並べて ありますよ。', [
                option('机が 並べて います。', '机が並べています。', 'The desks use the transitive verb but います.'),
                option('机が 並べて ありますよ。', '机が並べてありますよ。', 'The desks have been arranged and left ready.'),
            ], [
                hint('机は、だれかが授業のために並べた結果です。', 'Someone arranged the desks for class, and that result remains.'),
                hint('「並べる」は他動詞です。', '並べる is transitive.'),
                hint('目的のある準備状態は「並べてありますよ」です。', 'The purposeful prepared state is 並べてありますよ.'),
            ]),
        round('trees-prepared', 3, 3, 6, 3, 'state-select', grammarQuestion(3, 6, 3),
            '3）木が 植えて［います／あります］。', '木が 植えて あります。', [
                option('木が 植えて います。', '木が植えています。', 'The trees use the transitive verb but います.'),
                option('木が 植えて あります。', '木が植えてあります。', 'The trees have been planted and remain there.'),
            ], [
                hint('木は、だれかが植えたあと、その場所に残っています。', 'Someone planted the trees, and they remain in that place.'),
                hint('「植える」は他動詞です。', '植える is transitive.'),
                hint('他動詞のて形に「あります」: 植えてあります。', 'Use the transitive te-form plus あります: 植えてあります.'),
            ]),
        round('bus-timetable', 4, 2, 2, 1, 'action-choice', grammarQuestion(2, 2, 1),
            '1）壁に バスの 時刻表が（　　　　）あります。', '壁に バスの 時刻表が 掛けて あります。', [
                option('壁に バスの 時刻表が 掛けて あります。', '壁にバスの時刻表が掛けてあります。', 'The bus timetable has been hung on the wall.'),
                option('壁に バスの 時刻表が 置いて あります。', '壁にバスの時刻表が置いてあります。', 'The bus timetable has been placed on the wall.'),
            ], [
                hint('絵では、時刻表は壁にあります。', 'In the picture, the timetable is on the wall.'),
                hint('壁の物には、先生の例「写真が掛けてあります」を使えます。', 'Use Sensei’s wall example 写真が掛けてあります.'),
                hint('全文は「壁にバスの時刻表が掛けてあります」です。', 'The full report is 壁にバスの時刻表が掛けてあります.'),
            ]),
        round('desk-key', 5, 2, 2, 2, 'action-choice', grammarQuestion(2, 2, 2),
            '2）机の 右側に かぎが（　　　　）あります。', '机の 右側に かぎが 置いて あります。', [
                option('机の 右側に かぎが 置いて あります。', '机の右側にかぎが置いてあります。', 'The key has been placed on the right side of the desk.'),
                option('机の 右側に かぎが 掛けて あります。', '机の右側にかぎが掛けてあります。', 'The key has been hung on the right side of the desk.'),
            ], [
                hint('絵のかぎは、机の右側にあります。', 'The key is on the right side of the desk in the picture.'),
                hint('机の上の物は「置く」を使います。', 'Use 置く for an item placed on the desk.'),
                hint('「置く」→「置いてあります」です。', 'Change 置く to 置いてあります.'),
            ]),
        round('drawer-tools', 6, 2, 2, 3, 'typed-report', grammarQuestion(2, 2, 3),
            '3）ホッチキスや セロテープは 引き出しに（　　　　）あります。', 'ホッチキスや セロテープは 引き出しに しまって あります。', [], [
                hint('ホッチキスとセロテープは、引き出しの中です。', 'The stapler and tape are inside the drawer.'),
                hint('物を所定の場所に収める動詞は「しまいます」です。', 'The verb for putting items away in their place is しまいます.'),
                hint('「しまいます」→「しまってあります」です。', 'Change しまいます to しまってあります.'),
            ]),
        round('copy-paper', 7, 2, 2, 4, 'typed-report', grammarQuestion(2, 2, 4),
            '4）コピーの 紙は コピー機の 横に（　　　　）あります。', 'コピーの 紙は コピー機の 横に 置いて あります。', [], [
                hint('コピー用紙の場所は、コピー機の横です。', 'The copy paper is beside the copier.'),
                hint('紙をそこに準備した動詞は「置く」です。', 'The preparation verb for the paper is 置く.'),
                hint('話題の「は」を保ち、「コピー機の横に置いてあります」と続けます。', 'Keep topic は, then add コピー機の横に置いてあります.'),
            ]),
        round('room-a-dress', 8, 1, 'room-a', 1, 'typed-report', infoGapQuestion(1),
            'Room A：壁に ワンピースが（　　　　）あります。', '壁に ワンピースが 掛けて あります。', [], [
                hint('Room A のワンピースは、壁から下がっています。', 'In Room A, the dress hangs from the wall.'),
                hint('帽子の例と同じ他動詞「掛ける」を使います。', 'Use the same transitive verb as the hat example: 掛ける.'),
                hint('「壁にワンピースが掛けてあります」です。', 'The report is 壁にワンピースが掛けてあります.'),
            ]),
    ] as const;
    const activity: StateInspectionModel = {
        id: 'activity:l2-l16-sensei-prepared-state-audit',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-30-prepared-state-audit',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 30-1 と情報差の原本を先に読み、見えるだけの状態と、だれかが準備して残した状態を八つの原問で分けてください。',
            en: 'Read Sensei’s Chapter 30-1 and information-gap originals first, then distinguish a merely visible state from one deliberately prepared and left in place across eight source prompts.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-prepared-state-reports-over-canonical-source-pages-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 30', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Prepared resultant states', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Basic sentence:', text: 'Verb て-form あります／ありません。' },
                { title: 'Sensei’s purposeful-state rule', text: 'Verb て-form あります indicates a continuing state resulting from a purposeful action. Transitive verbs are used for this.' },
                { title: 'Sentence structure ①', text: 'Noun1 (place) に Noun2 (thing) が Verb て-form あります。' },
                { title: 'Sensei’s ています／てあります contrast', text: '窓が 開いています simply indicates that the situation exists. 窓が 開けてあります emphasises that the situation exists as the result of somebody’s deliberate action.' },
                { title: 'Sentence structure ②', text: 'Noun2 (thing) は Noun1 (place) に Verb て-form あります。 When Noun2 is taken as the topic, it is indicated by は.' },
            ],
            taskHeadings: [
                { sourceTask: 6, text: '6: Please choose an appropriate one: 〜ています／〜てあります.' },
                { sourceTask: 2, text: '2: Look at the picture below and create sentences: どこに なにが ありますか / それは どこに ありますか.' },
                { sourceTask: 'room-a', text: '1: Please explain Room A so your classmate can draw a picture.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの原問で、見えるだけの状態と、他動詞で準備して残した状態を分け、場所と物を正しく報告できました。',
                    en: 'Across all eight source prompts, neutral visible states are distinct from transitive prepared states, with each thing and place reported accurately.',
                } },
                lapse: {
                    explanation: {
                        ja: '一つ以上の報告で、自動詞・他動詞、ています・てあります、または場所の表現を見直す必要があります。',
                        en: 'At least one report needs another look at the verb pair, ています versus てあります, or the location phrase.',
                    },
                    repairPrompt: {
                        ja: '表示された問題だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible prompts, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の対照では「窓が開いています」は見える状態、「窓が開けてあります」はだれかが意図して残した状態です。',
                        en: 'In Sensei’s contrast, 窓が開いています is a visible state; 窓が開けてあります is a state someone deliberately left.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-prepared-state-audit',
        narrative: {
            ja: '完了と残念な出来事を分けたあと、エンジェルは先生の次の準備表を開きます。クリスチャンと、ただ残っている状態と、だれかが使いやすいように準備して残した状態を見分けます。',
            en: 'After separating completion from regret, Angel opens Sensei’s next preparation sheet. With Christian, she distinguishes what merely remains from what someone deliberately prepared and left ready for use.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: StateInspectionRound['sourceOrder'],
    sourcePage: StateInspectionRound['sourcePage'],
    sourceTask: StateInspectionRound['sourceTask'],
    sourceItem: StateInspectionRound['sourceItem'],
    interaction: StateInspectionInteraction,
    sourceQuestionId: string,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[],
    hints: StateInspectionRound['hints'],
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l16:prepared-state:${sourceOrder}`,
        errorTag: `l2-l16-prepared-state-${sourceOrder}`,
        hints,
    });
}

function grammarQuestion(page: 2 | 3, task: 2 | 6, item: 1 | 2 | 3 | 4): string {
    return `moodle:${MODULE_ID}:${GRAMMAR_TWO_SHA256}:pdf-p${page}:task-${task}:q${item}`;
}

function infoGapQuestion(item: 1): string {
    return `moodle:${MODULE_ID}:${INFO_GAP_SHA256}:pdf-p1:task-1:room-a:q${item}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: StateInspectionSourceVisual['page'],
    filename: string,
    sha256: string,
    alt: LocalizedText,
    presentation: StateInspectionSourceVisual['presentation'] = 'inspectable',
): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l16/${filename}`,
        sha256,
        alt: Object.freeze(alt),
        presentation,
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l16 package');
    const identity = record(root.identity, 'l2-l16 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l16 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l16 coverage');
    if (coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== 'bae6d71c2784284c17a6bea25cbcc4a4fb75d410193f27c9ce2484d4efd53d32') {
        throw new TypeError('Unexpected l2-l16 source archive.');
    }
    const members = array(coverage.members, 'l2-l16 members').map(value => record(value, 'l2-l16 member'));
    for (const [payloadSha256, title] of [
        [VOCABULARY_SHA256, VOCABULARY_TITLE],
        [GRAMMAR_ONE_SHA256, GRAMMAR_ONE_TITLE],
        [GRAMMAR_TWO_SHA256, GRAMMAR_TWO_TITLE],
        [INFO_GAP_SHA256, INFO_GAP_TITLE],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (!matches.some(member => member.title === title)
            || !matches.every(member => member.kind === 'document')) {
            throw new TypeError(`Missing exact Lesson 41 Moodle source ${title}.`);
        }
    }
    if (members.filter(member => member.kind === 'audio').length !== 3) {
        throw new TypeError('Lesson 41 expects three quarantined Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l16 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 30'
        || mapping.genki !== '≈ Genki II · Prepared resultant states') {
        throw new TypeError('Lesson 41 must preserve its sequence-only Minna and Genki mapping.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value;
}
