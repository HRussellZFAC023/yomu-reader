import lessonPackage from '../../../public/academy/content/lessons/045-l2-l18.json';
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

const PACKAGE_ID = 'l2-l18';
const PACKAGE_ORDER = 45;
const MODULE_ID = 8121271;
const ARCHIVE_ID = 'archive-000044';
const ARCHIVE_SHA256 = '8e397f175c772f0335e845b8ecf141b9e00c23040d296adb083b81d67a6c897a';
const ANSWER_SHA256 = 'de21995ba280fc828e67ce6e74a533069b86e03945a9046472a2681b494d0c06';
const TOKA_SHA256 = 'a3047558bbefa828f2ba023e62bb9ea039e9ddbe1cd507b196b7015c037f3ffe';
const VOCABULARY_SHA256 = '0da41a083ba196d0b8dab00b5ccd06baf4e649bdb9c1ea047b926277a0690851';
const MEMO_SHA256 = 'dacefe0eb959a982fd3df004782eb757da08b278dfa581bd5741d6beddad6f44';
const SCRIPT_SHA256 = '38a9974c41c43cea05d332ce504149b6614f1cd6069fe00570a2a447ae1d3c13';
const LISTENING_SHA256 = 'e63689d47daab01e6e21698fc5f0267f17cdabe00cad3f25cc63ceb701b594c6';
const CUMULATIVE_REVIEW_SHA256 = '5118e6832fcfd924f93ec8636c2acb046db30bfed53df067e2e471b1e5f1c46f';
const REVIEW_SHA256 = '305a4d89c101682a4475ceebfe249ea7ff1129142a9d475391fa0920ea91c9ff';
const EMERGENCY_SHA256 = 'd8bde07203834d887897daedd75dd7378b3e3adebd02fc3d222c4288b271fca3';
const AUDIO_SHA256 = 'aca35dbabfc34bac27deef4f328382718a57734e5ef67c2f73e348616fd8494c';
const ANSWER_TITLE = 'Chapter 30 quiz あります います おきます answer';
const TOKA_TITLE = 'Chapter 30-3 〜とか、〜とか Grammar listening speaking exercise';
const VOCABULARY_TITLE = 'Chapter 30-3 Vocabulary Sheet';
const MEMO_TITLE = 'Chapter 30 reading and speaking 伝言メモ';
const SCRIPT_TITLE = 'Chapter 30 Conversation listening script';
const LISTENING_TITLE = 'Chapter 30 Conversation listening';
const CUMULATIVE_REVIEW_TITLE = 'New HW Chapter 26-30 grammar review-1';
const REVIEW_TITLE = 'New HW Chapter 30 grammar review てある ている ておく';
const EMERGENCY_TITLE = 'Reference Chapter 30 Vocabulary Emergency';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(VOCABULARY_SHA256, VOCABULARY_TITLE, 1, 'moodle-chapter-30-3-vocabulary-1.png', 'b0c0670c80adc4b31ecae77d56f83311b6d22a6184594f025c19d66581f43c38', {
        ja: 'Moodle 原本: Chapter 30-3 語彙表1ページ。台風、植木、伝言、部下、上司、届きます、伺います、非常袋など。',
        en: 'Moodle original: Chapter 30-3 vocabulary page 1, including typhoon, plants, messages, workplace roles, arrivals, visits, and emergency bags.',
    }),
    sourceVisual(VOCABULARY_SHA256, VOCABULARY_TITLE, 2, 'moodle-chapter-30-3-vocabulary-2.png', 'a7644b9f3dc5c4d2d8a9642c006aa4166a775b37bb6ca2e3eeef78ba79c3a51f', {
        ja: 'Moodle 原本: Chapter 30-3 語彙表2ページ。非常時、懐中電灯、準備します、生活します。',
        en: 'Moodle original: Chapter 30-3 vocabulary page 2, including emergencies, torches, preparation, and daily life.',
    }),
    sourceVisual(EMERGENCY_SHA256, EMERGENCY_TITLE, 1, 'moodle-chapter-30-emergency-vocabulary-1.png', '422c0d4534842be79f1007bd388cf573371e339b9d2c5e47c576aca74424e0de', {
        ja: 'Moodle 原本: 地震と台風の非常時に備える行動と、非常袋の中身を絵と対訳で確認する参照ページ。',
        en: 'Moodle original: illustrated bilingual reference for earthquake and typhoon preparation, including an emergency kit and supplies.',
    }),
    sourceVisual(TOKA_SHA256, TOKA_TITLE, 1, 'moodle-chapter-30-3-toka-grammar-1.png', 'd01f3cd3ac1b2b26fbd26fbc24dd135cafcf99cb58314f605223cd4a17e73db3', {
        ja: 'Moodle 原本: Chapter 30-3「〜とか、〜とか」の説明、先生の例、クラスメイトへの五つの質問。',
        en: 'Moodle original: Chapter 30-3 explanation of 〜とか, Sensei examples, and five classmate questions.',
    }),
    sourceVisual(TOKA_SHA256, TOKA_TITLE, 2, 'moodle-chapter-30-3-toka-grammar-2.png', '9e0c96b76d8f0b25881ab8a3a1bd3ae9c181436e44151aa0e97b8d20f6c5f28c', {
        ja: 'Moodle 原本: 非常袋の聞き取り五問と、普段の例「とか」と特定の例「たり」の会話練習。',
        en: 'Moodle original: five emergency-bag listening questions and speaking practice contrasting general とか examples with specific たり examples.',
    }),
    sourceVisual(SCRIPT_SHA256, SCRIPT_TITLE, 1, 'moodle-chapter-30-conversation-script-1.png', '32845fc5e1416ee779018a2245a5973103b3907523e8e2f3f8a48534f8c5dce0', {
        ja: 'Moodle 原本: Track 13「非常袋を準備しておかないと」の会話全文。',
        en: 'Moodle original: full script for Track 13, “We need to prepare an emergency bag.”',
    }),
    sourceVisual(LISTENING_SHA256, LISTENING_TITLE, 1, 'moodle-chapter-30-conversation-listening-1.png', '97b1a7cbc76a2df6eb8c0813c1b7a7fd8ecf68d39518261aa44e0365066b8b75', {
        ja: 'Moodle 原本: 「非常袋を準備しておかないと」の聞き取り五問。',
        en: 'Moodle original: five listening questions for “We need to prepare an emergency bag.”',
    }),
    sourceVisual(MEMO_SHA256, MEMO_TITLE, 1, 'moodle-chapter-30-message-memo-1.png', 'f2ce68d61198cf057550c2075fd7b08eae181fd2ae6c22012092a21d7a760865', {
        ja: 'Moodle 原本: 五つの手書き風伝言メモ。帰宅、職場、謝罪、家事、ビデオの注意を読み分けます。',
        en: 'Moodle original: five handwritten-style message memos about coming home, work, an apology, household tasks, and a warning about a video.',
    }),
    sourceVisual(MEMO_SHA256, MEMO_TITLE, 2, 'moodle-chapter-30-message-memo-2.png', '4ef9d5d4a08a96608e4ee6dcfcc14eac819c41af325888f5bf26782291ecc833', {
        ja: 'Moodle 原本: 伝言の読み取りと、ホリデー中の猫、犬、植物の世話を頼む自由会話。',
        en: 'Moodle original: message-memo reading followed by free speaking to request cat, dog, or plant care during a holiday.',
    }),
    sourceVisual(CUMULATIVE_REVIEW_SHA256, CUMULATIVE_REVIEW_TITLE, 1, 'moodle-chapter-26-30-review-1.png', '14ba5a05b417df87caae0929d1911c738b105d31982c6a86e045b5dd9111e9d6', {
        ja: 'Moodle 原本: Chapter 26–30 の助詞と活用を復習する宿題ページ。',
        en: 'Moodle original: Chapter 26–30 homework review of particles and contextual verb forms.',
    }),
    sourceVisual(REVIEW_SHA256, REVIEW_TITLE, 1, 'moodle-chapter-30-state-review-1.png', 'ccd631965e0684ba9648b77cca66a2779fc6367a37455c198708b6c89c19914b', {
        ja: 'Moodle 原本: Chapter 30「ています・てあります・ておきます」と助詞の復習。',
        en: 'Moodle original: Chapter 30 review of ています, てあります, ておきます, and their particles.',
    }),
]);

export function createLessonFortyThreeMessageHandoffBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('emergency-kit', 1, 1, 'vocabulary', 3, 'action-choice', emergencyQuestion(3),
            '地震の場合、備えとして何をしておきますか。', '非常袋を用意しておきます。', [
                option('非常袋を用意しておきます。', '非常袋を用意しておきます。', 'Have an emergency kit ready.'),
                option('地震が起きてから非常袋を探します。', '地震が起きてから非常袋を探します。', 'Look for an emergency kit after the earthquake starts.'),
            ], hints(
                ['非常時の前にする「備え」を選びます。', '参照ページの地震の備え、三番を見ます。', '原文は「非常袋を用意しておく」です。'],
                ['Choose preparation done before an emergency.', 'Look at item three under earthquake preparation.', 'The source says 非常袋を用意しておく.'],
            )),
        round('restaurant-examples', 2, 1, 1, 1, 'action-choice', tokaQuestion(1, 1),
            'いつも、どんな レストランへ 行きますか。', 'そうですね、中華料理とか、インド料理とかですね。', [
                option('そうですね、中華料理とか、インド料理とかですね。', 'そうですね、中華料理とか、インド料理とかですね。', 'Chinese and Indian restaurants, for example.'),
                option('そうですね、中華料理と、インド料理だけですね。', 'そうですね、中華料理と、インド料理だけですね。', 'Only Chinese and Indian restaurants.'),
            ], hints(
                ['先生の一つ目の質問は、全部ではなく一般的な例を聞きます。', '「中華料理」と「インド料理」は二つの例です。', '例を開いたままにするので、それぞれに「とか」を付けます。'],
                ['Sensei’s first question asks for general examples, not a complete list.', 'Chinese and Indian food are the two examples.', 'Keep the list open by adding とか to each example.'],
            )),
        round('usual-sports', 3, 1, 1, 4, 'typed-report', tokaQuestion(1, 4),
            'いつも、どんな スポーツを していますか。', 'そうですね、テニスをするとか、ジョギングをするとかですね。', [], hints(
                ['今度は名詞ではなく、普通形の動作を二つ挙げます。', '「テニスをする」と「ジョギングをする」を使います。', '普通形の後ろに「とか」を付けます。'],
                ['This time list two plain-form actions rather than nouns.', 'Use テニスをする and ジョギングをする.', 'Put とか after each plain-form action.'],
            ), ['テニスをするとかジョギングをするとかですね。']),
        round('three-days', 4, 1, 'listening', 4, 'action-choice', listeningQuestion(4),
            '非常袋で何日ぐらい生活できますか。', '3日ぐらい生活できます。', [
                option('3日ぐらい生活できます。', '3日ぐらい生活できます。', 'You can live for about three days.'),
                option('30日ぐらい生活できます。', '30日ぐらい生活できます。', 'You can live for about thirty days.'),
            ], hints(
                ['Track 13 をもう一度聞きます。', '鈴木さんは「電気やガスが止まっても」と説明します。', '続く期間は「3日ぐらい」です。'],
                ['Replay Track 13.', 'Suzuki explains what happens even if electricity and gas stop.', 'The duration that follows is about three days.'],
            )),
        round('memo-warning', 5, 1, 'message', 5, 'state-select', memoQuestion(1, 5),
            '五番の伝言で、絶対にしてはいけないことは何ですか。', 'ビデオに触ることです。', [
                option('ビデオに触ることです。', 'ビデオに触ることです。', 'Touching the video.'),
                option('晩ごはんを食べることです。', '晩ごはんを食べることです。', 'Eating dinner.'),
            ], hints(
                ['原本の五番をもう一度読みます。', '最初の文は「絶対に〜ないで」です。', '「絶対にビデオに触らないで」と書いてあります。'],
                ['Read memo five once more.', 'Its first sentence uses 絶対に〜ないで.', 'It says 絶対にビデオに触らないで.'],
            )),
        round('holiday-handoff', 6, 2, 'message', 1, 'typed-report', memoQuestion(2, 1),
            '明日からホリデーです。クラスメイトに猫の世話を頼んでください。', '明日からホリデーに行きますから、猫の世話をお願いします。', [], hints(
                ['先生のれいは、先に理由を言います。', '理由は「明日からホリデーに行きますから」です。', '頼む行動は「猫の世話をお願いします」です。'],
                ['Sensei’s example gives the reason first.', 'The reason is 明日からホリデーに行きますから.', 'The requested action is 猫の世話をお願いします.'],
            ), ['明日からホリデーに行きますから猫の世話をお願いします。']),
        round('lost-card-repair', 7, 1, 'review', 5, 'typed-report', cumulativeReviewQuestion(5),
            'キャッシュカードを（なくします）しまったんですが、どう（します）ら、いいですか。',
            'キャッシュカードをなくしてしまったんですが、どうしたらいいですか。', [], hints(
                ['Chapter 26–30 復習の五番です。二つの動詞を文脈に合わせます。', '「なくします」は「〜てしまった」の前なので、て形にします。', '「どうしますか」は条件の「どうしたらいいですか」にします。'],
                ['This is item five in the Chapter 26–30 review; adapt both verbs to the context.', 'なくします takes the te-form before 〜てしまった.', 'どうしますか becomes the conditional question どうしたらいいですか.'],
            ), ['キャッシュカードをなくしてしまったんですがどうしたらいいですか']),
        round('prepared-lunch-contrast', 8, 1, 'review', 4, 'action-choice', chapterThirtyReviewQuestion(4),
            '準備された状態と、先にした行動を正しく分ける会話はどれですか。',
            'あしたのおべんとうが作ってあります。明日早いので、おべんとうを作っておきました。', [
                option(
                    'あしたのおべんとうが作ってあります。明日早いので、おべんとうを作っておきました。',
                    'あしたのおべんとうが作ってあります。明日早いので、おべんとうを作っておきました。',
                    'Tomorrow’s lunch has been prepared. Because tomorrow starts early, I made it in advance.',
                ),
                option(
                    'あしたのおべんとうを作ってあります。明日早いので、おべんとうが作っておきました。',
                    'あしたのおべんとうを作ってあります。明日早いので、おべんとうが作っておきました。',
                    'The particles swap the prepared state and the advance action.',
                ),
            ], hints(
                ['最初の文は、できている弁当の状態を報告します。', '準備状態は「おべんとうが作ってあります」です。', '先にした行動は「おべんとうを作っておきました」です。'],
                ['The first sentence reports the lunch’s prepared state.', 'The prepared state is おべんとうが作ってあります.', 'The advance action is おべんとうを作っておきました.'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l18-sensei-message-handoff',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-30-message-handoff',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の非常時語彙、Chapter 30-3、Track 13、伝言メモ、Chapter 26–30 復習を先に学び、八つの原問に答えてください。',
            en: 'Study Sensei’s emergency vocabulary, Chapter 30-3, Track 13, message memos, and Chapter 26–30 review first, then answer eight source-grounded prompts.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: {
                    status: 'audio-member-verified-script-and-worksheet-pairing',
                    sourceAudioMembers: 1,
                    sourceAudioTracksDelivered: 1,
                    durationSeconds: 50.12,
                    audio: {
                        url: '/academy/content/lessons/l2-l18/moodle-track-13.mp3',
                        payloadSha256: AUDIO_SHA256,
                        durationSeconds: 50.12,
                        transcriptPayloadSha256: SCRIPT_SHA256,
                        worksheetPayloadSha256: LISTENING_SHA256,
                        verification: 'exact-script-and-independent-transcript-match',
                    },
                },
                answerKeyBasis: 'sensei-verbatim-examples-and-separately-attributed-yomu-model-completions-over-canonical-source-pages',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lessons 26 and 30 review', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Examples, explanations, and careful requests', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Sensei vocabulary first', text: 'Read the two Chapter 30-3 vocabulary pages and the emergency reference before producing language: 伝言, 非常袋, 非常時, 懐中電灯, 準備します, and 生活します anchor the lesson.' },
                { title: 'Emergency preparation', text: 'The reference page groups what to do before, during, and after an earthquake. Beforehand, use 〜ておく for preparations such as 非常袋を用意しておく.' },
                { title: 'Basic sentence', text: 'Noun 1 とか、Noun 2 とか / plain sentence 1 とか、plain sentence 2 とか.' },
                { title: 'Sensei’s open-list rule', text: '〜とか lists examples without saying the list is complete. It is colloquial and more general than 〜たり when 〜たり describes particular things done on a specific occasion.' },
                { title: 'Conversation listening', text: 'Track 13 is paired to Sensei’s exact script and five-question worksheet. Play it first, then consult the script and worksheet below, replay as needed, and answer only what the conversation establishes.' },
                { title: 'Message memo', text: 'Keep the listener’s job intact: state the situation, name only the useful examples, then make one clear request.' },
                { title: 'Chapter 26–30 review', text: 'Review contextual particles and forms, then separate Chapter 30 states: 〜ています reports a state or ongoing action, 〜てあります a prepared result, and 〜ておきます an action done in advance.' },
            ],
            taskHeadings: [
                { sourceTask: 'vocabulary', text: 'Emergency vocabulary: prepare what the reference page names.' },
                { sourceTask: 1, text: '〜とか: give open, general examples.' },
                { sourceTask: 'listening', text: 'Conversation listening: replay Track 13, then answer from what you heard.' },
                { sourceTask: 'message', text: '伝言メモ: preserve the instruction the recipient must act on.' },
                { sourceTask: 'review', text: 'Chapter 26–30 review: repair the form, then contrast Chapter 30 states.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '非常時の備え、「とか」、聞き取り、伝言、Chapter 26–30 の復習を、先生の原本に沿って完了できました。',
                    en: 'You completed Sensei’s emergency preparation, とか, listening, message, and Chapter 26–30 review sequence.',
                } },
                lapse: {
                    explanation: {
                        ja: '間違えた原問で、語彙、聞き取り、形、または伝言の行動をもう一度確認しましょう。',
                        en: 'Recheck the vocabulary, listening detail, form, or message action in each missed source prompt.',
                    },
                    repairPrompt: {
                        ja: '間違えた原問だけを直し、必要なら先生のページとヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed source prompts, reopening Sensei’s page and one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例: 中華料理とか、インド料理とかですね。',
                        en: 'Sensei’s example: 中華料理とか、インド料理とかですね。',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-message-handoff',
        narrative: {
            ja: 'エンジェルの帰国準備を手伝っていると、教室の明かりが一度消えます。ジョディは非常袋のそばで伝言メモを書き、クリスチャンは必要な物だけを声に出して確認します。ルパーナは、全部を言わなくても行動が伝わるか見守ります。',
            en: 'While the class helps Angel prepare to return home, the classroom lights flicker out. Jodi writes a memo beside the emergency bag, Christian repeats only the supplies and action he needs, and Ruparna checks that the message works without listing everything.',
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
    roundHints: StateInspectionRound['hints'],
    alternatives: readonly string[] = [],
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression, ...alternatives],
        conceptId: `concept:l2-l18:message-handoff:${sourceOrder}`,
        errorTag: `l2-l18-message-handoff-${sourceOrder}`,
        hints: roundHints,
    });
}

function tokaQuestion(page: 1 | 2, item: 1 | 2 | 3 | 4 | 5): string {
    return `moodle:${MODULE_ID}:${TOKA_SHA256}:pdf-p${page}:task-${page === 1 ? 1 : 3}:q${item}`;
}

function memoQuestion(page: 1 | 2, item: 1 | 5): string {
    return `moodle:${MODULE_ID}:${MEMO_SHA256}:pdf-p${page}:task-${page === 1 ? 1 : 2}:q${item}`;
}

function emergencyQuestion(item: 3): string {
    return `moodle:${MODULE_ID}:${EMERGENCY_SHA256}:pdf-p1:task-earthquake-preparation:q${item}`;
}

function listeningQuestion(item: 4): string {
    return `moodle:${MODULE_ID}:${LISTENING_SHA256}:pdf-p1:track-13:q${item}`;
}

function cumulativeReviewQuestion(item: 5): string {
    return `moodle:${MODULE_ID}:${CUMULATIVE_REVIEW_SHA256}:pdf-p1:task-2:q${item}`;
}

function chapterThirtyReviewQuestion(item: 4): string {
    return `moodle:${MODULE_ID}:${ANSWER_SHA256}:pdf-p1:task-1:q${item}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('Lesson 43 rounds require exactly three bilingual hints.');
    return [
        Object.freeze({ ja: ja[0]!, en: en[0]! }),
        Object.freeze({ ja: ja[1]!, en: en[1]! }),
        Object.freeze({ ja: ja[2]!, en: en[2]! }),
    ];
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: StateInspectionSourceVisual['page'],
    filename: string,
    sha256: string,
    alt: LocalizedText,
): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l18/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l18 package');
    const identity = record(root.identity, 'l2-l18 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l18 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l18 coverage');
    if (coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l18 source archive.');
    }
    const members = array(coverage.members, 'l2-l18 members').map(value => record(value, 'l2-l18 member'));
    for (const [payloadSha256, title] of [
        [ANSWER_SHA256, ANSWER_TITLE],
        [TOKA_SHA256, TOKA_TITLE],
        [VOCABULARY_SHA256, VOCABULARY_TITLE],
        [MEMO_SHA256, MEMO_TITLE],
        [SCRIPT_SHA256, SCRIPT_TITLE],
        [LISTENING_SHA256, LISTENING_TITLE],
        [CUMULATIVE_REVIEW_SHA256, CUMULATIVE_REVIEW_TITLE],
        [REVIEW_SHA256, REVIEW_TITLE],
        [EMERGENCY_SHA256, EMERGENCY_TITLE],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (!matches.some(member => member.title === title) || !matches.every(member => member.kind === 'document')) {
            throw new TypeError(`Missing exact Lesson 43 Moodle source ${title}.`);
        }
    }
    const audio = members.filter(member => member.kind === 'audio');
    if (audio.length !== 1 || audio[0]?.payloadSha256 !== AUDIO_SHA256) {
        throw new TypeError('Lesson 43 expects one verified Moodle audio member with its exact hash.');
    }
    const mapping = record(root.mapping, 'l2-l18 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lessons 26 and 30 review'
        || mapping.genki !== '≈ Genki II · Examples, explanations, and careful requests') {
        throw new TypeError('Lesson 43 must preserve its sequence-only Minna and Genki mapping.');
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
