import lessonPackage from '../../../public/academy/content/lessons/042-l2-l15.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    CompletionRepairInteraction,
    CompletionRepairModel,
    CompletionRepairOption,
    CompletionRepairRound,
    CompletionRepairSourceVisual,
} from '../minigames/completion-repair';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l15';
const PACKAGE_ORDER = 42;
const MODULE_ID = 8121268;
const ARCHIVE_ID = 'archive-000016';
const SOURCE_PAYLOAD_SHA256 = 'c41e4dd83224a8c29a3e6eb07e7e7955a086e3fccbf4a93a5260efaedcf4e3b8';
const SOURCE_TITLE = 'Handouts/Chapter 29-2 〜てしまいます_しまいました grammar exercise.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUALS: CompletionRepairModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(1, '740c85dcc650f67e4fa84afccba19eea993e72730fdac67372daa8604299940b', {
        ja: 'Moodle 原本: Chapter 29-2 1ページ。完了と将来の完了の説明、例、課題1と2。',
        en: 'Moodle original: Chapter 29-2 page 1, with completed and future-completion teaching, examples, and tasks 1 and 2.',
    }),
    sourceVisual(2, 'fc529706b6821d2629b213f7269306b971c5a40c1491cc9e382814fe3d183a39', {
        ja: 'Moodle 原本: Chapter 29-2 2ページ。課題3、残念の用法、例、四つの意味の対照。',
        en: 'Moodle original: Chapter 29-2 page 2, with task 3, regret teaching, examples, and a four-way meaning contrast.',
    }),
    sourceVisual(3, 'a126ab62a102564bb6f8d1ff807da6853009c860dc25be5434ec773afffb6983', {
        ja: 'Moodle 原本: Chapter 29-2 3ページ。残念な出来事をつなぐ課題4、経験を話す課題5、絵の課題6。',
        en: 'Moodle original: Chapter 29-2 page 3, with task 4 regret links, task 5 experiences, and picture-based task 6.',
    }),
    sourceVisual(4, '966e692b4e190de0d319635e84c536c1d4c2f1f1e983b36934271c3670692b98', {
        ja: 'Moodle 原本: Chapter 29-2 4ページ。どこか、ないと、課題7の短い会話と解決。',
        en: 'Moodle original: Chapter 29-2 page 4, with dokoka, naito, task 7 short conversations, and solutions.',
    }),
    sourceVisual(5, '6f2aa526c4ff763da9fdf2773a090cfb06d860283ac35a5f046371b36b36e743', {
        ja: 'Moodle 原本: Chapter 29-2 5ページ。課題8の携帯会話と四つの困った場面。',
        en: 'Moodle original: Chapter 29-2 page 5, with task 8’s phone conversation and four difficult situations.',
    }),
]);

export function createLessonFortyCompletionRepairBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('report-written', 1, 1, 'completion-select',
            '1）レポートは もう 書きました。 →',
            'もう、レポートは 書いて しまったんですか。', [
                option('もう、レポートは 書いて しまったんですか。', 'もう、レポートは書いてしまったんですか。', 'Have you already finished writing the report?'),
                option('もう、レポートは 書いて しまいますか。', 'もう、レポートは書いてしまいますか。', 'Will you finish writing the report?'),
            ], [
                hint('これは、もう終わったことを確認する質問です。', 'This asks for confirmation about something already finished.'),
                hint('「書きました」のて形は「書いて」です。', 'The te-form behind 書きました is 書いて.'),
                hint('先生の例どおり「書いてしまったんですか」にします。', 'Follow Sensei’s model: 書いてしまったんですか.'),
            ]),
        round('homework-finished', 1, 2, 'completion-select',
            '2）夏休みの 宿題は 全部 やりました。 →',
            '夏休みの 宿題は 全部 やって しまったんですか。', [
                option('夏休みの 宿題は 全部 やって しまったんですか。', '夏休みの宿題は全部やってしまったんですか。', 'Did you finish all the summer homework?'),
                option('夏休みの 宿題は 全部 やって しまいますか。', '夏休みの宿題は全部やってしまいますか。', 'Will you finish all the summer homework?'),
            ], [
                hint('「全部」は、課題を完了したという意味を支えます。', '全部 supports the completed-action meaning.'),
                hint('「やります」→「やって」です。', 'Change やります to やって.'),
                hint('終わった驚きの質問は「やってしまったんですか」です。', 'The surprised completed question is やってしまったんですか.'),
            ]),
        round('speech-memorized', 1, 3, 'typed-transform',
            '3）スピーチは もう 覚えました。 →',
            'スピーチは もう 覚えて しまったんですか。', [], [
                hint('「もう」があるので、すでに完了したかを聞きます。', 'もう means you are asking whether it is already complete.'),
                hint('「覚えます」のて形は「覚えて」です。', 'The te-form of 覚えます is 覚えて.'),
                hint('「覚えて」＋「しまったんですか」で質問を完成します。', 'Complete the question with 覚えて plus しまったんですか.'),
            ]),
        round('room-tidied', 1, 4, 'typed-transform',
            '4）部屋は もう 片づけました。 →',
            '部屋は もう 片づけて しまったんですか。', [], [
                hint('部屋の片づけが全部終わったかを確認します。', 'Confirm whether tidying the room is completely finished.'),
                hint('「片づけます」→「片づけて」です。', 'Change 片づけます to 片づけて.'),
                hint('先生の課題1の型は「Vてしまったんですか」です。', 'Sensei’s task 1 pattern is Vてしまったんですか.'),
            ]),
        round('email-first', 3, 1, 'finish-first-choice',
            '1）（メールの 返事を 書きます） →',
            'メールの 返事を 書いて しまいますから、お先に どうぞ。', [
                option('メールの 返事を 書いて しまいますから、お先に どうぞ。', 'メールの返事を書いてしまいますから、お先にどうぞ。', 'I’ll finish the email reply, so please go ahead.'),
                option('メールの 返事を 書いて しまいましたから、お先に どうぞ。', 'メールの返事を書いてしまいましたから、お先にどうぞ。', 'I finished the email reply, so please go ahead.'),
            ], [
                hint('まだ帰らず、先に終える予定を言います。', 'You are not leaving yet; state what you intend to finish first.'),
                hint('将来の完了なので「書いてしまいます」です。', 'Use 書いてしまいます for future completion.'),
                hint('理由の「から」のあとに「お先にどうぞ」を置きます。', 'Put お先にどうぞ after the reason marked by から.'),
            ]),
        round('document-first', 3, 2, 'finish-first-choice',
            '2）（この 資料を 作ります） →',
            'この 資料を 作って しまいますから、お先に どうぞ。', [
                option('この 資料を 作って しまいますから、お先に どうぞ。', 'この資料を作ってしまいますから、お先にどうぞ。', 'I’ll finish this document, so please go ahead.'),
                option('この 資料を 作って しまったんですか。', 'この資料を作ってしまったんですか。', 'Did you finish this document?'),
            ], [
                hint('先生の課題3では、先に終える決意を伝えます。', 'Sensei’s task 3 states a determination to finish something first.'),
                hint('「作ります」のて形は「作って」です。', 'The te-form of 作ります is 作って.'),
                hint('「作ってしまいますから、お先にどうぞ」です。', 'Use 作ってしまいますから、お先にどうぞ.'),
            ]),
        round('train-left', 4, 1, 'typed-regret-link',
            '1）駅まで 走りました・電車は 行きました →',
            '駅まで 走りましたが、電車は 行って しまいました。', [], [
                hint('最初の文と残念な結果を「が」でつなぎます。', 'Join the first clause to the regrettable result with が.'),
                hint('「行きます」のて形は「行って」です。', 'The te-form of 行きます is 行って.'),
                hint('結果は「電車は行ってしまいました」です。', 'The result is 電車は行ってしまいました.'),
            ]),
        round('appointment-late', 4, 2, 'typed-regret-link',
            '2）タクシーで 行きました・約束の 時間に 遅れました →',
            'タクシーで 行きましたが、約束の 時間に 遅れて しまいました。', [], [
                hint('タクシーで行ったのに、残念な結果が続きます。', 'Despite taking a taxi, a regrettable result follows.'),
                hint('「遅れます」のて形は「遅れて」です。', 'The te-form of 遅れます is 遅れて.'),
                hint('「が」のあとを「約束の時間に遅れてしまいました」にします。', 'After が, use 約束の時間に遅れてしまいました.'),
            ]),
    ] as const;
    const activity: CompletionRepairModel = {
        id: 'activity:l2-l15-sensei-completion-repair',
        kind: 'academy-completion-repair',
        responseKind: 'moodle-chapter-29-completion-and-regret-repair',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 29-2 の五ページを先に読み、完了、先に終える決意、残念な結果を八つの原問で作ってください。',
            en: 'Read Sensei’s five Chapter 29-2 pages first, then form completed actions, finish-first intentions, and regrettable results across eight selected source prompts.',
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
                answerKeyBasis: 'yomu-derived-completions-over-canonical-source-pages-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 29', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki L18 (grammar overlay)', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Basic sentence:', text: 'Verb て-form しまいます／しまいました。' },
                {
                    title: 'Sensei’s completed-action rule',
                    text: '〜て しまいました emphasises that an action has been completed, such as difficult task has been completed before the deadline, things are very well organised in advance.',
                },
                {
                    title: 'Sensei’s future-completion rule',
                    text: '〜て しまいます indicates that an action will be completed at some point in the future. This sentence pattern emphasises the speaker’s intention that he/she will have done the things in advance or before deadline.',
                },
                {
                    title: 'Sensei’s regret rule',
                    text: 'Another function of 〜て しまいました is to indicate a feeling of regret or disappointment on the part of the speaker.',
                },
                {
                    title: 'Sensei’s four-way contrast',
                    text: [
                        'きのう たくさん ビールを 飲みました。— statement',
                        'きのう たくさん ビールを 飲んでしまいました。— feeling of regret',
                        '帰るまえに このビールを 飲んでしまいます。— going to complete',
                        '昨日 買った ビールは もう 飲んでしまいました。— being completed',
                    ].join('\n'),
                },
            ],
            taskHeadings: [
                { sourceTask: 1, text: '1: Following the example, please create question using 〜てしまいました.' },
                { sourceTask: 3, text: '3: Following the example, please ask your classmate ‘そろそろ かえりませんか’ and decline the invitation using ‘おさきに どうぞ’, because you are determined to finish something first.' },
                { sourceTask: 4, text: '4: Please create sentence to tell what you’ve done which you feel ざんねん。。。' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの原問が、終わった完了、先に終える決意、残念な結果を文脈に合わせて保ちました。',
                    en: 'All eight source prompts now preserve completed action, finish-first intention, or regrettable result in context.',
                } },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文で、て形、しまいます／しまいました、または文のつなぎ方を見直す必要があります。',
                        en: 'At least one response needs another look at the te-form, しまいます／しまいました, or the clause link.',
                    },
                    repairPrompt: {
                        ja: '表示された問題だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible prompts, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例「もう読んでしまったんですか」は完了を聞き、「忘れてしまいました」は残念な結果を伝えます。',
                        en: 'Sensei’s もう読んでしまったんですか asks about completion; 忘れてしまいました reports a regrettable result.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-completion-repair',
        narrative: {
            ja: 'メディア室の点検が終わると、ルパーナが先生の Chapter 29-2 の五ページを教室のクリスチャンへ届けます。クリスチャンの携帯は落としたあと静かなままです。ヘンリーと一緒に、終わったこと、先に終えること、残念だったことを分けて伝えます。',
            en: 'After the media-room inspection, Ruparna carries Sensei’s five Chapter 29-2 pages to Christian in the classroom. Christian’s phone has stayed very quiet since he dropped it. With Henry, he separates what is finished, what he will finish first, and what went regrettably wrong.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceTask: 1 | 3 | 4,
    sourceItem: 1 | 2 | 3 | 4,
    interaction: CompletionRepairInteraction,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly CompletionRepairOption[],
    hints: CompletionRepairRound['hints'],
): CompletionRepairRound {
    const sourceOrder = sourceOrderFor(sourceTask, sourceItem);
    const sourcePage = sourceTask === 1 ? 1 : sourceTask === 3 ? 2 : 3;
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p${sourcePage}:task-${sourceTask}:q${sourceItem}`,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l15:completion-repair:${sourceOrder}`,
        errorTag: `l2-l15-completion-repair-${sourceOrder}`,
        hints,
    });
}

function sourceOrderFor(
    sourceTask: 1 | 3 | 4,
    sourceItem: 1 | 2 | 3 | 4,
): CompletionRepairRound['sourceOrder'] {
    if (sourceTask === 1) return sourceItem;
    if (sourceTask === 3 && sourceItem <= 2) return (sourceItem + 4) as 5 | 6;
    if (sourceTask === 4 && sourceItem <= 2) return (sourceItem + 6) as 7 | 8;
    throw new TypeError(`Unsupported Chapter 29-2 source locus: task ${sourceTask}, item ${sourceItem}.`);
}

function option(value: string, ja: string, en: string): CompletionRepairOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(page: 1 | 2 | 3 | 4 | 5, sha256: string, alt: LocalizedText): CompletionRepairSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:${page}`,
        payloadSha256: SOURCE_PAYLOAD_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l15/moodle-chapter-29-2-completion-repair-page-${page}.png`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l15 package');
    const identity = record(root.identity, 'l2-l15 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l15 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l15 coverage');
    if (coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== '28c25403e44ae113f3fd934f1485df26b79da4beddb31b24cfa8fe969913cd92') {
        throw new TypeError('Unexpected l2-l15 source archive.');
    }
    const members = array(coverage.members, 'l2-l15 members').map(value => record(value, 'l2-l15 member'));
    const sourceMatches = members.filter(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (sourceMatches.length !== 1 || sourceMatches[0]?.title !== SOURCE_TITLE || sourceMatches[0]?.kind !== 'document') {
        throw new TypeError(`Missing unique Lesson 40 Moodle source ${SOURCE_TITLE}.`);
    }
    if (members.filter(member => member.kind === 'audio').length !== 3) {
        throw new TypeError('Lesson 40 expects three quarantined Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l15 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 29'
        || mapping.genki !== '≈ Genki L18 (grammar overlay)') {
        throw new TypeError('Lesson 40 must preserve its sequence-only Minna and Genki mapping.');
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
