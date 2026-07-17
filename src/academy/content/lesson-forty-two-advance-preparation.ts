import lessonPackage from '../../../public/academy/content/lessons/044-l2-l17.json';
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

const PACKAGE_ID = 'l2-l17';
const PACKAGE_ORDER = 44;
const MODULE_ID = 8121270;
const ARCHIVE_ID = 'archive-000008';
const ARCHIVE_SHA256 = '11da659f2aabdb7a3bd0988b530509bf3ccecf1a035232bbfcc855ac7ac2f9d0';
const SPEAKING_SHA256 = '46a2d4445826046b564660774854fa065595dc103c2baaa2f2aa3ec3c5646bb6';
const GRAMMAR_SHA256 = '90b589e71a04e270602824c2c12497ca171baa8a347b251dc0ce9f1ec4e32eb3';
const VOCABULARY_SHA256 = '8881424ea8009aec174aee22a0b404d89fc177e1422cd6986ff51ad7e4426eb4';
const SPEAKING_TITLE = 'Chapter 30-2 〜ておきますGrammar Speaking exercise';
const GRAMMAR_TITLE = 'Chapter 30-2 〜ておく-1,2,3 Grammar exercise';
const VOCABULARY_TITLE = 'New Chapter 30-2 Vocabulary Sheet';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(SPEAKING_SHA256, SPEAKING_TITLE, 1, 'moodle-chapter-30-2-teoku-speaking-page-1.png', '03e596ec3b21e2f56ac996e5745aa6af45cd6173887582ab4a8f235d801cb902', {
        ja: 'Moodle 原本: Chapter 30-2 会話練習。開ける、閉める、買う、しまう、準備するを使い、先にすることを話します。',
        en: 'Moodle original: Chapter 30-2 speaking practice using open, close, buy, put away, and prepare to say what will be done in advance.',
    }),
    ...([1, 2, 3, 4, 5] as const).map((page, index) => sourceVisual(
        GRAMMAR_SHA256,
        GRAMMAR_TITLE,
        page,
        `moodle-chapter-30-2-teoku-grammar-page-${page}.png`,
        [
            '7b63a738f396068857231f336a4cae5d523693a387e0bed999b4ca73eb1571b4',
            '9f3f61f2e4ef494dd62609f86e788d19eca778c4743942282294b4a3cbab015e',
            'de4ec14cbdfad8a2b137140968bd2ff8ae3c55e99c85c32e712b56981e9a6b09',
            '49907afc412052e69c4584da08181e11cf2285c87e22a558204ef067819e73a7',
            '36d227d976d9fbf5c6034fe6c1e69445b8e9b56261017049109eb6b2cf247689',
        ][index]!,
        {
            ja: `Moodle 原本: Chapter 30-2 文法練習、${page}ページ。期限までの準備、次に使うための片付け、状態をそのままにする用法を段階的に扱います。`,
            en: `Moodle original: Chapter 30-2 grammar practice page ${page}, progressively covering deadline preparation, resetting for next use, and deliberately leaving a state as it is.`,
        },
    )),
    sourceVisual(VOCABULARY_SHA256, VOCABULARY_TITLE, 1, 'moodle-chapter-30-2-vocabulary-page-1.png', '2cd5b7dae44b376aab79ef533b94153518a6cc221386c2d1423caedd5f050917', {
        ja: 'Moodle 原本: Chapter 30-2 語彙表、1ページ。帰国、準備、選ぶ、決める、予習、復習など。',
        en: 'Moodle original: Chapter 30-2 vocabulary sheet page 1, including returning home, preparation, choosing, deciding, preview, and review.',
    }),
    sourceVisual(VOCABULARY_SHA256, VOCABULARY_TITLE, 2, 'moodle-chapter-30-2-vocabulary-page-2.png', '8bea9a4e4de77280beea393440b6a06efbed9a6083f395d25543b3d4de4646e7', {
        ja: 'Moodle 原本: Chapter 30-2 語彙表、2ページ。元の所、戻す、そのままにするなど。',
        en: 'Moodle original: Chapter 30-2 vocabulary sheet page 2, including the original place, putting back, and leaving something as it is.',
    }),
]);

export function createLessonFortyTwoAdvancePreparationBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('ticket-before-return', 1, 1, 1, 1, 'action-choice', grammarQuestion(1, 1, 1),
            '帰国の まえに、飛行機の チケットを（　　　　）。', '帰国の まえに、飛行機の チケットを 買っておきます。', [
                option('帰国の まえに、飛行機の チケットを 買っておきます。', '帰国の前に、飛行機のチケットを買っておきます。', 'Before returning home, I will buy the plane ticket in advance.'),
                option('帰国の まえに、飛行機の チケットを 買ってあります。', '帰国の前に、飛行機のチケットを買ってあります。', 'The ticket has been bought and remains in that state.'),
            ], hints(
                ['「帰国のまえに」は、行動の期限です。', '「買います」のて形は「買って」です。', '自分が先にする準備なので「買っておきます」です。'],
                ['帰国のまえに gives the action a deadline.', 'The te-form of 買います is 買って.', 'This is something the speaker will prepare, so use 買っておきます.'],
            )),
        round('choose-book', 2, 1, 1, 2, 'action-choice', grammarQuestion(1, 1, 2),
            '飛行機は 退屈ですから、本を（　　　　）。', '飛行機は 退屈ですから、本を 選んでおきます。', [
                option('飛行機は 退屈ですから、本を 選んでおきます。', '飛行機は退屈ですから、本を選んでおきます。', 'Because the flight is boring, I will choose a book beforehand.'),
                option('飛行機は 退屈ですから、本を 選んでいます。', '飛行機は退屈ですから、本を選んでいます。', 'Because the flight is boring, I am choosing a book now.'),
            ], hints(
                ['語彙表の「選びます」を使います。', '旅行より前に本を決める準備です。', '「選びます」→「選んでおきます」です。'],
                ['Use 選びます from Sensei’s vocabulary sheet.', 'The book is chosen as preparation before the journey.', '選びます becomes 選んでおきます.'],
            )),
        round('decide-name', 3, 1, 1, 3, 'typed-report', grammarQuestion(1, 1, 3),
            '子供が うまれる までに、名前を（　　　　）。', '子供が うまれる までに、名前を 決めておきたいです。', [], hints(
                ['「までに」は、その時より前に終える期限です。', '語彙表の「決めます」を使います。', '希望も保って「決めておきたいです」とします。'],
                ['までに sets a deadline by which the action is complete.', 'Use 決めます from the vocabulary sheet.', 'Keep the wish from Sensei’s example: 決めておきたいです.'],
            )),
        round('party-contacts', 4, 2, 3, 1, 'typed-report', grammarQuestion(2, 3, 1),
            'パーティまでに、◯◯さんと◯◯さんに（　　　　）。', 'パーティまでに、◯◯さんと◯◯さんに 連絡しておいてください。', [], hints(
                ['これは、パーティより前に相手へしてほしい準備です。', '「連絡します」のて形は「連絡して」です。', '依頼なので「連絡しておいてください」です。'],
                ['This asks someone to prepare by contacting people before the party.', 'The te-form of 連絡します is 連絡して.', 'It is a request, so use 連絡しておいてください.'],
            )),
        round('wash-dishes', 5, 3, 2, 1, 'state-select', grammarQuestion(3, 2, 1),
            '食事が 終わったら、食器を（　　　　）。', '食事が 終わったら、食器を 洗っておいてください。', [
                option('食事が 終わったら、食器を 洗っておいてください。', '食事が終わったら、食器を洗っておいてください。', 'After the meal, please wash the dishes so they are ready.'),
                option('食事が 終わったら、食器を 洗ってあります。', '食事が終わったら、食器を洗ってあります。', 'After the meal, the dishes have been washed.'),
            ], hints(
                ['次に使えるように必要な行動をします。', '語彙表の「洗います」を使います。', '依頼は「洗っておいてください」です。'],
                ['Do the necessary action so the dishes are ready next time.', 'Use 洗います from the vocabulary sheet.', 'The request form is 洗っておいてください.'],
            )),
        round('return-scissors', 6, 3, 2, 2, 'typed-report', grammarQuestion(3, 2, 2),
            'はさみを 使い終わったら、もとの ところに（　　　　）。', 'はさみを 使い終わったら、もとの ところに 戻しておいてね。', [], hints(
                ['語彙表の「元の所」と「戻します」を使います。', '次の人が使えるように、使ったあとで戻します。', 'Sensei の文は「戻しておいてね」です。'],
                ['Use 元の所 and 戻します from the vocabulary sheet.', 'Put the scissors back after use so they are ready for the next person.', 'Sensei’s sentence ends 戻しておいてね.'],
            )),
        round('leave-window-closed', 7, 3, 3, 1, 'state-select', grammarQuestion(3, 3, 1),
            '窓を 開けましょうか。— いいえ、寒いから、（　　　　）。', 'いいえ、寒いから、閉めておいてください。', [
                option('いいえ、寒いから、閉めておいてください。', 'いいえ、寒いから、閉めておいてください。', 'No, it is cold, so please leave it closed.'),
                option('いいえ、寒いから、閉まってあります。', 'いいえ、寒いから、閉まってあります。', 'No, it is cold, so it has been closed.'),
            ], hints(
                ['寒いので、今の閉じた状態を変えません。', '自分で窓を閉める他動詞は「閉める」です。', '状態を保つ依頼は「閉めておいてください」です。'],
                ['Because it is cold, do not change the current closed state.', 'The transitive verb for closing the window is 閉める.', 'Ask to preserve the state with 閉めておいてください.'],
            )),
        round('three-way-contrast', 8, 5, 'note', 3, 'action-choice', grammarQuestion(5, 'note', 3),
            '話し手が「必要だから、今 窓を開けて、その状態を残す」と言う文はどれですか。', '窓を 開けておきます。', [
                option('窓が 開けてあります。', '窓が開けてあります。', 'Someone deliberately opened the window; that prepared state remains.'),
                option('窓を 開けておきます。', '窓を開けておきます。', 'I will open the window and deliberately leave it that way.'),
            ], hints(
                ['「話し手が今する必要な行動」が焦点です。', '目的語には「窓を」を使います。', '自分が先にする行動は「開けておきます」です。'],
                ['The focus is a necessary action the speaker will take now.', 'Use object marker を with 窓.', 'The speaker’s advance action is 開けておきます.'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l17-sensei-advance-preparation',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-30-advance-preparation',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の語彙表と Chapter 30-2 の原本を先に読み、期限までの準備、次に使うための片付け、そのままにする行動を八つの原問で選び、作ってください。',
            en: 'Read Sensei’s vocabulary and Chapter 30-2 originals first, then choose or produce eight source-grounded actions: preparation by a deadline, resetting for next use, and deliberately leaving a state as it is.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'sensei-verbatim-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 30', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Advance preparation and leaving things as they are', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Basic sentence', text: 'Verb て-form おきます／おいてください。' },
                { title: 'Sensei’s purposeful-action rule', text: 'Verb て-form おきます indicates a purposeful action. Transitive verbs are used for this.' },
                { title: '1 · Before a deadline', text: '〜のまえに／dictionary form まえに／〜までに marks when a necessary preparation must be completed.' },
                { title: '2 · Ready for next use', text: 'After using something, wash it or return it to its original place so it is ready next time.' },
                { title: '3 · Leave it as it is', text: 'Use 〜ておきます to deliberately keep the resultant state unchanged.' },
                { title: 'Three-way contrast', text: '窓が開いています is a visible state; 窓が開けてあります is a deliberate resultant state; 窓を開けておきます is the speaker’s purposeful advance action.' },
            ],
            taskHeadings: [
                { sourceTask: 1, text: '1: Create a sentence using 〜まえに／〜のまえに and 〜ておきます.' },
                { sourceTask: 3, text: '3: Ask or suggest what should be prepared for an upcoming event.' },
                { sourceTask: 2, text: '2: Complete a necessary action in preparation for the next use.' },
                { sourceTask: 'note', text: 'Note: distinguish ています, てあります, and ておきます.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの原問で、先にする準備、次に使うための片付け、そのままにする行動を、先生の形と語彙で表せました。',
                    en: 'Across all eight source prompts, Sensei’s forms and vocabulary now express advance preparation, resetting for next use, and deliberately preserving a state.',
                } },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文で、期限、て形、または「おきます／おいてください」の働きをもう一度確認しましょう。',
                        en: 'One or more sentences need another look at the deadline, te-form, or the role of おきます／おいてください.',
                    },
                    repairPrompt: {
                        ja: '間違えた原問だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed source prompts, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例: 帰国のまえに、飛行機のチケットを買っておきます。',
                        en: 'Sensei’s example: 帰国のまえに、飛行機のチケットを買っておきます。',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-advance-preparation',
        narrative: {
            ja: '教室を使える状態にしたあと、エンジェルは帰国前の旅行準備を始めます。クリスチャンとヘンリーは、先生の語彙表を見ながら、旅の前にすること、使ったあとに戻すこと、今のまま残すことを一緒に整理します。',
            en: 'With the classroom left ready, Onke begins preparing for her journey home. Christian and Henry use Sensei’s vocabulary sheet to sort what must be done before the trip, reset after use, or deliberately left as it is.',
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
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l17:advance-preparation:${sourceOrder}`,
        errorTag: `l2-l17-advance-preparation-${sourceOrder}`,
        hints: roundHints,
    });
}

function grammarQuestion(page: 1 | 2 | 3 | 5, task: 1 | 2 | 3 | 'note', item: 1 | 2 | 3): string {
    return `moodle:${MODULE_ID}:${GRAMMAR_SHA256}:pdf-p${page}:task-${task}:q${item}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('Lesson 42 rounds require exactly three bilingual hints.');
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
        url: `/academy/content/lessons/l2-l17/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l17 package');
    const identity = record(root.identity, 'l2-l17 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l17 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l17 coverage');
    if (coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l17 source archive.');
    }
    const members = array(coverage.members, 'l2-l17 members').map(value => record(value, 'l2-l17 member'));
    for (const [payloadSha256, title] of [
        [SPEAKING_SHA256, SPEAKING_TITLE],
        [GRAMMAR_SHA256, GRAMMAR_TITLE],
        [VOCABULARY_SHA256, VOCABULARY_TITLE],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (!matches.some(member => member.title === title) || !matches.every(member => member.kind === 'document')) {
            throw new TypeError(`Missing exact Lesson 42 Moodle source ${title}.`);
        }
    }
    if (members.filter(member => member.kind === 'audio').length !== 4) {
        throw new TypeError('Lesson 42 expects four quarantined Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l17 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 30'
        || mapping.genki !== '≈ Genki II · Advance preparation and leaving things as they are') {
        throw new TypeError('Lesson 42 must preserve its sequence-only Minna and Genki mapping.');
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
