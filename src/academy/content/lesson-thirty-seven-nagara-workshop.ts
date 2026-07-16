import lessonPackage from '../../../public/academy/content/lessons/039-l2-l12.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    NagaraInteraction,
    NagaraOption,
    NagaraSourceVisual,
    NagaraWorkshopModel,
    NagaraWorkshopRound,
} from '../minigames/nagara-workshop';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l12';
const PACKAGE_ORDER = 39;
const MODULE_ID = 8121261;
const ARCHIVE_ID = 'archive-000032';
const SOURCE_PAYLOAD_SHA256 = 'b5a1d39c3306a5e7b1c55b108d906bdbf697caea45bdb28746cf5661e772bf48';
const SOURCE_TITLE = 'Handouts/Chapter 28-1 〜ながら_grammar_exercise.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUALS: readonly [NagaraSourceVisual, NagaraSourceVisual] = Object.freeze([
    sourceVisual(1, 'a0e5167eafeacd2316aa60681c14d4de5da5eb8970b3198f335d441d8b3f088f', {
        ja: 'Moodle 原本: Chapter 28-1「ながら」1ページ。先生の基本文、二つの説明、六つの例、絵の練習、課題2の六問。',
        en: 'Moodle original: Chapter 28-1 nagara page 1, with Sensei’s pattern, two explanations, six examples, picture practice, and all six task 2 prompts.',
    }),
    sourceVisual(2, 'c21841db30455c7bd40b0a8b05382d53e17e857b3d9518e830b88887a18dd241', {
        ja: 'Moodle 原本: Chapter 28-1「ながら」2ページ。課題3の例、九つの文、三つの絵。',
        en: 'Moodle original: Chapter 28-1 nagara page 2, with the task 3 model, nine prompts, and three illustrations.',
    }),
]);

export function createLessonThirtySevenNagaraWorkshopBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('listen-and-note', 1, 'stem-select', '1） 話を 聞きます・メモして ください →',
            '話を 聞きながら、メモして ください。', [
                option('話を 聞きながら、メモして ください。', '聞きながら', '聞きながら'),
                option('話を 聞くながら、メモして ください。', '聞くながら', '聞くながら'),
            ], [
                hint('最初の動詞「聞きます」を、ながらの前の形にします。', 'Change the first verb, 聞きます, into the form used before nagara.'),
                hint('先生の基本文は「Verb 1 ます-form ながら Verb 2」です。', 'Sensei’s pattern is Verb 1 masu-form + nagara + Verb 2.'),
                hint('聞きますから「ます」を取ると「聞きながら」です。', 'Remove ます from 聞きます to make 聞きながら.'),
            ]),
        round('drive-no-phone', 2, 'stem-select', '2） 運転します・電話を しないで ください →',
            '運転しながら、電話を しないで ください。', [
                option('運転しながら、電話を しないで ください。', '運転しながら', '運転しながら'),
                option('運転するながら、電話を しないで ください。', '運転するながら', '運転するながら'),
            ], [
                hint('ながらに変えるのは最初の「運転します」です。', 'The first verb, 運転します, is the one that changes before nagara.'),
                hint('する動詞のます形は「します」です。', 'The masu-form of a suru verb ends in します.'),
                hint('「します」から「ます」を取ると「しながら」です。', 'Remove ます from します to make しながら.'),
            ]),
        round('tea-and-talk', 3, 'main-clause-choice', '3） お茶を 飲みます・話しましょう →',
            'お茶を 飲みながら、話しましょう。', [
                option('お茶を 飲みながら、話しましょう。', 'お茶を 飲みながら、話しましょう。', 'Drink tea while we talk.'),
                option('話しながら、お茶を 飲みましょう。', '話しながら、お茶を 飲みましょう。', 'Talk while we drink tea.'),
            ], [
                hint('先生の説明では、Verb 2 が主な動作です。', 'Sensei’s explanation says Verb 2 is the main action.'),
                hint('元の二文の順番を保つと、「飲みます」がながら節になります。', 'Keeping the source order puts 飲みます in the nagara clause.'),
                hint('主な動作「話しましょう」を文の最後に残します。', 'Keep the main action 話しましょう at the end.'),
            ]),
        round('piano-and-sing', 4, 'main-clause-choice', '4） ピアノを 弾きます・歌えますか →',
            'ピアノを 弾きながら、歌えますか。', [
                option('ピアノを 弾きながら、歌えますか。', 'ピアノを 弾きながら、歌えますか。', 'Can you sing while playing piano?'),
                option('歌いながら、ピアノを 弾けますか。', '歌いながら、ピアノを 弾けますか。', 'Can you play piano while singing?'),
            ], [
                hint('この課題は、元の二文をその順番で一文にします。', 'This task joins the two source sentences in their given order.'),
                hint('最初の動詞「弾きます」をます語幹にします。', 'Put the first verb, 弾きます, into its masu-stem.'),
                hint('「弾きながら」の後に、主な質問「歌えますか」が続きます。', 'Follow 弾きながら with the main question 歌えますか.'),
            ]),
        round('volunteer-and-travel', 5, 'typed-join', '5） ボランティアを します・世界を 旅行して います →',
            'ボランティアを しながら、世界を 旅行して います。', [], [
                hint('最初の「します」だけをながらの形に変えます。', 'Only the first します changes into the nagara form.'),
                hint('ボランティアを「しながら」で最初の節を閉じます。', 'Close the first clause with ボランティアをしながら.'),
                hint('元の主な動作「世界を旅行しています」を後ろに保ちます。', 'Keep the original main action 世界を旅行しています last.'),
            ]),
        round('teach-and-draw', 6, 'typed-join', '6） 絵を 教えます・マンガを かいて います →',
            '絵を 教えながら、マンガを かいて います。', [], [
                hint('最初の「教えます」をながらの前の形にします。', 'Change the first verb, 教えます, into the form before nagara.'),
                hint('「教えます」から「ます」を取ると「教え」です。', 'Remove ます from 教えます to get 教え.'),
                hint('「絵を教えながら」の後に「マンガをかいています」を置きます。', 'Put マンガをかいています after 絵を教えながら.'),
            ]),
    ] as const;
    const activity: NagaraWorkshopModel = {
        id: 'activity:l2-l12-sensei-nagara-workshop',
        kind: 'academy-nagara-workshop',
        responseKind: 'moodle-chapter-28-nagara-varied-join',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 28-1 の基本文・説明・例を先に読み、課題2の六つの二文を、形選び・主動作選び・入力で一文にしてください。',
            en: 'Read Sensei’s Chapter 28-1 pattern, explanations, and examples first, then join the six exact task 2 pairs using form selection, main-action contrast, and typed production.',
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
                answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 28', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Simultaneous actions and routines', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Basic sentence:', text: 'Verb 1 ます-form ながら Verb 2 。' },
                {
                    title: '① Sensei’s main-action rule',
                    text: '①This sentence pattern indicates that someone performing an action indicated by Verb 1 is simultaneously performing a separate action indicated by verb 2, where verb 2 indicates this main action.',
                },
                {
                    title: '② Sensei’s extended-time rule',
                    text: '②It is also used to describe someone doing two things continuously over a period of time.',
                },
                {
                    title: 'れい)',
                    text: [
                        '寝転(ねころ)がりながら 携帯(けいたい)を 使(つか)っています。',
                        '泣(な)きながら おべんとうを 食(た)べています。',
                        'ビスケットを 食べながら 携帯を 使いながらテレビを 見ています。',
                        'ミュージカルは、踊(おど)りながら 歌(うた)います。',
                        'バーで 働(はたら)きながら 小説(しょうせつ)を 書(か)きました。',
                        '仕事(しごと)を しながら 大学(だいがく)で 勉強(べんきょう)しています。',
                    ].join('\n'),
                },
            ],
            taskHeading: '2: please change two sentences to one long sentence.',
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '六つの元の二文が、ます語幹＋ながらと主動作の順番を保った一文になりました。',
                        en: 'All six source pairs now form one sentence with the masu-stem plus nagara and the main action in its source position.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文で、ながらの前の形か、後ろに残す主動作を見直す必要があります。',
                        en: 'At least one join needs another look at the form before nagara or the main action kept at the end.',
                    },
                    repairPrompt: {
                        ja: '表示された文だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible joins, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例「仕事を しながら 大学で 勉強しています」では、最初の動作が「しながら」、主動作が後ろです。',
                        en: 'In Sensei’s example 仕事をしながら大学で勉強しています, the first action becomes しながら and the main action stays last.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-nagara-workshop',
        narrative: {
            ja: '駅コンコースの四つの案内文が一文になると、りえ先生は次の Chapter 28-1 の二ページを共有キッチンのアカシュへ渡します。アカシュはラジオを聞きながらスープを作り、二つの動作のうち後ろに残る主動作を確かめます。',
            en: 'Once the station’s four notices become complete sentences, Rie carries the next Chapter 28-1 pages to Aakash in the shared kitchen. Aakash makes soup while listening to the radio, checking which of two actions remains the main action at the end.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: NagaraWorkshopRound['sourceOrder'],
    interaction: NagaraInteraction,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly NagaraOption[],
    hints: NagaraWorkshopRound['hints'],
): NagaraWorkshopRound {
    return Object.freeze({
        id,
        interaction,
        sourceOrder,
        sourcePage: 1,
        sourceTask: 2,
        sourceItem: sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p1:task-2:q${sourceOrder}`,
        sourcePrompt,
        options,
        answerValue: answerExpression,
        answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l12:nagara-join:${sourceOrder}`,
        errorTag: `l2-l12-nagara-join-${sourceOrder}`,
        hints,
    });
}

function option(value: string, ja: string, en: string): NagaraOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(page: 1 | 2, sha256: string, alt: LocalizedText): NagaraSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:${page}`,
        payloadSha256: SOURCE_PAYLOAD_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l12/moodle-chapter-28-1-nagara-page-${page}.png`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l12 package');
    const identity = record(root.identity, 'l2-l12 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l12 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l12 coverage');
    if (coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== '62c3a814d3590157a8498d34e5ca172c5afa6608d9f9be1ad149a4ca4b99d4fe') {
        throw new TypeError('Unexpected l2-l12 source archive.');
    }
    const members = array(coverage.members, 'l2-l12 members').map(value => record(value, 'l2-l12 member'));
    const sourceMatches = members.filter(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (sourceMatches.length !== 1 || sourceMatches[0]?.title !== SOURCE_TITLE || sourceMatches[0]?.kind !== 'document') {
        throw new TypeError(`Missing unique Lesson 37 Moodle source ${SOURCE_TITLE}.`);
    }
    if (members.filter(member => member.kind === 'audio').length !== 4) {
        throw new TypeError('Lesson 37 expects four quarantined Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l12 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 28'
        || mapping.genki !== '≈ Genki II · Simultaneous actions and routines') {
        throw new TypeError('Lesson 37 must preserve its sequence-only Minna and Genki mapping.');
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
