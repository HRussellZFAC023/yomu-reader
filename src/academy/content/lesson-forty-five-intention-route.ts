import lessonPackage from '../../../public/academy/content/lessons/047-l2-l20.json';
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

const PACKAGE_ID = 'l2-l20';
const PACKAGE_ORDER = 47;
const MODULE_ID = 8121275;
const ARCHIVE_ID = 'archive-000064';
const ARCHIVE_SHA256 = 'b8875ef88944fc14f33bba4c07dbeee8fc42340c0dc83c39b08892a26c215c80';
const INTENTION_SHA256 = 'ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef';
const VOLITIONAL_SHA256 = 'd76736ced083bb11fe341e9f7f344777b75b3ce1be3dc6be841cef178ff02e3c';
const VOCABULARY_SHA256 = '3a4757f4bdccdc447df62720a1ec466d4272b9f137c8b2d5db90d1a1d953b895';
const UNPAIRED_AUDIO_SHA256 = '49383b3d78eae5ac77a7480a56e29fedf1e0ccd41d36e45a2c8d2f8b97f923b7';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(INTENTION_SHA256, 'Chapter 31-1 〜ようと思っています grammar exercise', 1, 'moodle-chapter-31-intention-grammar-page-1.png', '28837b83244eb87d41b1cad8afdf980303ed25ba669a39c8864700c44c7ba9f8', {
        ja: 'Moodle 原本: Chapter 31-1、意向形＋と思っていますの意味、例文、時制との違い。',
        en: 'Moodle original: Chapter 31-1, the meaning of volitional form plus と思っています, examples, and the timing contrast.',
    }),
    sourceVisual(INTENTION_SHA256, 'Chapter 31-1 〜ようと思っています grammar exercise', 2, 'moodle-chapter-31-intention-grammar-page-2.png', '6846226c05243a01905183c38d2bf08d24772a28850173e7b55318e363ed30ba', {
        ja: 'Moodle 原本: Chapter 31-1、六つの変換と四つの「何をしますか」から作る計画。',
        en: 'Moodle original: Chapter 31-1, six transformations and four plans built from “What will you do?” prompts.',
    }),
    sourceVisual(VOLITIONAL_SHA256, 'Chapter 31-1 verb volitional form exercise', 1, 'moodle-chapter-31-volitional-exercise-page-1.png', '67af928bf27e3fc6593eb46419cae00826b2fcf8866ec7d74669b097f91983ce', {
        ja: 'Moodle 原本: Chapter 31-1、意向形の作り方と「見よう」の会話例。',
        en: 'Moodle original: Chapter 31-1, forming the volitional and a “let’s watch” conversation example.',
    }),
    sourceVisual(VOLITIONAL_SHA256, 'Chapter 31-1 verb volitional form exercise', 2, 'moodle-chapter-31-volitional-exercise-page-2.png', 'df2dedc3a96c914a0dd3e72d9dbe1e587baf177c8f32edaca6889b55f6c5949f', {
        ja: 'Moodle 原本: Chapter 31-1、意向形の質問と普通形の会話例。',
        en: 'Moodle original: Chapter 31-1, volitional questions and plain-style conversation examples.',
    }),
    sourceVisual(VOCABULARY_SHA256, 'Chapter 31-1 Vocabulary Sheet', 1, 'moodle-chapter-31-vocabulary-page-1.png', 'c59b0398fc3587f6a1c3926b22bb233180f25f3e65cbe5cad2a4c6ba9c3d0f2e', {
        ja: 'Moodle 原本: Chapter 31-1 語彙表1ページ。受けます、続けます、申し込みます、連休、予定など。',
        en: 'Moodle original: Chapter 31-1 vocabulary page 1, including take an exam, continue, apply, long holiday, and plans.',
    }),
    sourceVisual(VOCABULARY_SHA256, 'Chapter 31-1 Vocabulary Sheet', 2, 'moodle-chapter-31-vocabulary-page-2.png', 'e1cb38564b1a6b8d1e9918f414f6ed980f331dfc3a3e083ac8873d0286757145', {
        ja: 'Moodle 原本: Chapter 31-1 語彙表2ページ。日本代表、お子さん、〜の方、うん、ううん。',
        en: 'Moodle original: Chapter 31-1 vocabulary page 2, including Japan’s national team, someone else’s child, direction, and casual yes/no.',
    }),
]);

export function createLessonFortyFiveIntentionRouteBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('climb-fuji', 1, 1, 1, 'action-choice', question(1, 1), '富士山に のぼります。', '富士山に 登ろうと 思っています。', [
            choice('富士山に 登ろうと 思っています。'), choice('富士山に 登りようと 思っています。'),
        ], hints(
            ['先生の例は、ます形を意向形にしてから「と思っています」へつなげます。', '「のぼります」は五段動詞です。', 'のぼります → 登ろう、です。'],
            ['Sensei’s example changes the ます form to volitional before adding と思っています.', 'のぼります is a group 1 verb.', 'The source transformation is のぼります → 登ろう.'],
        )),
        round('learn-piano', 2, 1, 2, 'typed-report', question(1, 2), 'ピアノを ならいます。', 'ピアノを 習おうと 思っています。', [], hints(
            ['「ならいます」は五段動詞です。', '最後の「い」を「お」に変え、うを付けます。', '習います → 習おうです。'],
            ['ならいます is a group 1 verb.', 'Move the final i-row sound to o-row, then add う.', 'The form is 習おう.'],
        )),
        round('give-flowers', 3, 1, 4, 'state-select', question(1, 4), 'つまに 花を おくります。', '贈ろう', [choice('贈ろう'), choice('贈りよう')], hints(
            ['先生の一番の練習は、まず意向形を作る変換です。', '「おくります」は五段動詞です。', '贈ります → 贈ろうです。'],
            ['Sensei’s first task starts by making the volitional transformation.', 'おくります is a group 1 verb.', 'The source form is 贈ります → 贈ろう.'],
        )),
        round('marry-next-year', 4, 1, 6, 'typed-report', question(1, 6), '来年 けっこんします。', '来年 結婚しようと 思っています。', [], hints(
            ['「結婚します」は します動詞です。', 'しますは、意向形でしようになります。', '結婚します → 結婚しようです。'],
            ['結婚します is a します verb.', 'In the volitional, します becomes しよう.', 'The source form is 結婚します → 結婚しよう.'],
        )),
        round('family-church', 5, 2, 1, 'action-choice', question(2, 1), '今度の 日曜日は 何を しますか。 （家族と 教会へ 行きます）', '家族と 教会へ 行こうと 思っています。', [
            choice('家族と 教会へ 行こうと 思っています。'), choice('家族と 教会へ 行きますと 思っています。'),
        ], hints(
            ['二番の例は、かっこの行動をそのまま計画に変えます。', '「行きます」の意向形を先に作ります。', '行きます → 行こうと思っています、です。'],
            ['Task 2 turns the parenthesized action into the plan.', 'First make the volitional of 行きます.', 'The source pattern gives 行こうと思っています.'],
        )),
        round('holiday-rest', 6, 2, 2, 'typed-report', question(2, 2), '連休は 何を しますか。 （うちで ゆっくり 休みます）', 'うちで ゆっくり 休もうと 思っています。', [], hints(
            ['語彙表には連休があります。かっこの行動を計画にします。', '休みますは五段動詞です。', '休みます → 休もうと思っています、です。'],
            ['The vocabulary sheet includes 連休. Turn the parenthesized action into the plan.', '休みます is a group 1 verb.', 'The source pattern gives 休もうと思っています.'],
        )),
        round('weekend-climb', 7, 2, 3, 'state-select', question(2, 3), '今度の 週末は 何を しますか。 （山に 登ります）', '登ろう', [choice('登ろう'), choice('登りよう')], hints(
            ['かっこの「登ります」を意向形にしてから文を作ります。', 'のぼりますは五段動詞です。', '登ります → 登ろうです。'],
            ['Make the parenthesized 登ります volitional before building the sentence.', 'のぼります is a group 1 verb.', 'The source form is 登ります → 登ろう.'],
        )),
        round('write-novel', 8, 2, 4, 'typed-report', question(2, 4), '暇に なったら、何を しますか。 （小説を 書きます）', '小説を 書こうと 思っています。', [], hints(
            ['「暇になったら」は、そのあとにある計画を変えません。', '書きますは五段動詞です。', '書きます → 書こうと思っています、です。'],
            ['暇になったら stays before the plan; it does not change the form after it.', '書きます is a group 1 verb.', 'The source pattern gives 書こうと思っています.'],
        )),
    ] as const;
    const activity: StateInspectionModel = {
        id: 'activity:l2-l20-sensei-intention-route', kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-31-intention-route', curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT, conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 31-1 と語彙表を先に読み、八つの原問で、意向形を「〜ようと思っています」の計画につなげてください。',
            en: 'Read Sensei’s Chapter 31-1 pages and vocabulary sheet first, then connect the volitional form to 〜ようと思っています across eight source prompts.',
        },
        provenance: {
            packageId: PACKAGE_ID, packageOrder: PACKAGE_ORDER, answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID, archiveId: ARCHIVE_ID, sourceSheets: SOURCE_VISUALS,
                media: {
                    status: 'audio-member-quarantined-pairing-unproven', sourceAudioMembers: 1, sourceAudioTracksDelivered: 0,
                    quarantinedPayloadSha256: UNPAIRED_AUDIO_SHA256,
                },
                answerKeyBasis: 'sensei-verbatim-intention-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 31', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Volitional form and intentions', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Sensei source first', text: 'The Chapter 31-1 pages and vocabulary sheet stay visible before every source prompt.' },
                { title: 'A considered plan', text: 'Use the volitional form before と 思っています for an intention you have held for some time.' },
                { title: 'Task 1', text: 'Transform the six printed polite-form actions into a sentence with the source pattern.' },
                { title: 'Task 2', text: 'Use the action in brackets to answer each printed question as a plan.' },
            ],
            taskHeadings: [
                { sourceTask: 1, text: '1: Construct sentences as in example.' },
                { sourceTask: 2, text: '2: Create sentences using〜ようとおもっています' },
            ],
            rounds, passScore: 1,
            feedback: {
                pass: { explanation: { ja: '八つの原問で、意向形を長く考えている計画につなげられました。', en: 'Across eight source prompts, you connected volitional forms to intentions considered over time.' } },
                lapse: {
                    explanation: { ja: '間違えた行だけ、まず意向形にしてから「と思っています」を付ける順番を確認しましょう。', en: 'For missed rows only, first form the volitional, then add と思っています.' },
                    repairPrompt: { ja: '間違えた原問だけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the missed source prompts, opening one earned hint at a time if needed.' },
                    nearbyExample: { ja: '先生の例: 旅行に行きます。→ 旅行に行こうと思っています。', en: 'Sensei’s example: 旅行に行きます。→ 旅行に行こうと思っています。' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-intention-route',
        narrative: { ja: '先生の計画シートで、意向形を「考えてきたこと」にします。', en: 'Sensei’s planning sheet turns a volitional form into something you have been considering.' },
        activity: Object.freeze(activity),
    });
}

function round(id: string, sourceOrder: StateInspectionRound['sourceOrder'], sourceTask: 1 | 2, sourceItem: StateInspectionRound['sourceItem'], interaction: StateInspectionInteraction, sourceQuestionId: string, sourcePrompt: string, answerExpression: string, options: readonly StateInspectionOption[], roundHints: StateInspectionRound['hints']): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage: 2, sourceTask, sourceItem, sourceQuestionId, sourcePrompt,
        options, answerValue: answerExpression, answerExpression, acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l20:intention:${sourceOrder}`, errorTag: `l2-l20-intention-${sourceOrder}`, hints: roundHints,
    });
}

function question(task: 1 | 2, item: StateInspectionRound['sourceItem']): string {
    return `moodle:${MODULE_ID}:${INTENTION_SHA256}:pdf-p2:task-${task}:q${item}`;
}

function choice(value: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja: value, en: value }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('l2-l20 rounds require exactly three bilingual hints.');
    return [Object.freeze({ ja: ja[0]!, en: en[0]! }), Object.freeze({ ja: ja[1]!, en: en[1]! }), Object.freeze({ ja: ja[2]!, en: en[2]! })];
}

function sourceVisual(payloadSha256: string, title: string, page: StateInspectionSourceVisual['page'], filename: string, sha256: string, alt: LocalizedText): StateInspectionSourceVisual {
    return Object.freeze({ sourceId: `moodle:${payloadSha256}:page:${page}`, payloadSha256, title, page, url: `/academy/content/lessons/l2-l20/${filename}`, sha256, alt: Object.freeze(alt) });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l20 package');
    const identity = record(root.identity, 'l2-l20 identity');
    const coverage = record(root.sourceCoverage, 'l2-l20 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l20 package identity.');
    }
    const members = array(coverage.members, 'l2-l20 members').map(member => record(member, 'l2-l20 member'));
    for (const payloadSha256 of [INTENTION_SHA256, VOLITIONAL_SHA256, VOCABULARY_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l20 Moodle document ${payloadSha256}.`);
        }
    }
    if (!members.some(member => member.payloadSha256 === UNPAIRED_AUDIO_SHA256 && member.kind === 'audio')) {
        throw new TypeError('l2-l20 must retain its unpaired Moodle audio in quarantine.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label} record.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label} array.`);
    return value;
}
