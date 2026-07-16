import lessonPackage from '../../../public/academy/content/lessons/046-l2-l19.json';
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

const PACKAGE_ID = 'l2-l19';
const PACKAGE_ORDER = 46;
const MODULE_ID = 8121273;
const ARCHIVE_ID = 'archive-000084';
const ARCHIVE_SHA256 = 'e38f396ece8bee828fe7d3b44a9fa540f17bb4900fb2fc6b746d4bf0b3d9fb83';
const VOLITIONAL_SHA256 = '092723d74f266e627c7eefba92cc567cba80328fe7961e19ca321e2d1495ddee';
const FORM_SHEET_SHA256 = '4da024b1ca32facc7b41b03895910d6bc681f98c7116d5789780b7d220f4a2a5';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(VOLITIONAL_SHA256, 'Chapter 31 volitional form', 1, 'moodle-chapter-31-volitional-page-1.png', '937da5c5e578dfcaf1d651815233f119f8c2da0a82d6f1586c23609e90e6f3b7', {
        ja: 'Moodle 原本: Chapter 31 意向形、1ページ。意向、〜ましょうとの対照、例文、五段動詞の作り方。',
        en: 'Moodle original: Chapter 31 volitional form page 1, with intention, the 〜ましょう contrast, examples, and group 1 formation.',
    }),
    sourceVisual(VOLITIONAL_SHA256, 'Chapter 31 volitional form', 2, 'moodle-chapter-31-volitional-page-2.png', '6f085bcf2b068cc7ae7be47d30696fd556cd111fd2b8e684f4b65ae187308721', {
        ja: 'Moodle 原本: Chapter 31 意向形、2ページ。一段動詞と不規則動詞の作り方。',
        en: 'Moodle original: Chapter 31 volitional form page 2, with group 2 and irregular formation.',
    }),
    sourceVisual(FORM_SHEET_SHA256, 'New HW Chapter 31 Creating volitional form', 1, 'moodle-chapter-31-form-sheet-page-1.png', 'de41bd3514974735073a89df40c03fd2f124a343ff2abd28ad37fc8594e595d5', {
        ja: 'Moodle 原本: Chapter 31 意向形を作るフォームシート、1ページ。語尾の変化を空欄で確かめます。',
        en: 'Moodle original: Chapter 31 form-and-word sheet page 1, checking ending changes in the printed blanks.',
    }),
    sourceVisual(FORM_SHEET_SHA256, 'New HW Chapter 31 Creating volitional form', 2, 'moodle-chapter-31-form-sheet-page-2.png', '1ec250f9b336d7dc5dccd8bd875a400da969cc860c0a04f3d1da531a00e30c6b', {
        ja: 'Moodle 原本: Chapter 31 意向形を作るフォームシート、2ページ。三つの動詞グループの表。',
        en: 'Moodle original: Chapter 31 form-and-word sheet page 2, with the printed three-group verb chart.',
    }),
]);

export function createLessonFortyFourVolitionalPlanBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('utaimasu-ending', 1, 1, 1, 1, 'action-choice', question(FORM_SHEET_SHA256, 1, 1, 1),
            'うたいます → うた（　　　）う', 'うたおう', [choice('うたおう'), choice('うたいよう')], hints(
                ['五段動詞は最後のい段の音をお段に変えます。', '「うたい」の「い」は「お」になります。', 'うたいます → うたおうです。'],
                ['For a group 1 verb, change the last i-row sound to the o-row.', 'The い in うたい becomes お.', 'うたいます becomes うたおう.'],
            )),
        round('kakimasu-ending', 2, 1, 1, 2, 'typed-report', question(FORM_SHEET_SHA256, 1, 1, 2),
            'かきます → （　　　　　　）', 'かこう', [], hints(
                ['「き」はお段の「こ」へ動かします。', '最後に長い「う」を付けます。', 'かきます → かこうです。'],
                ['Move き to its o-row partner, こ.', 'Then add the long う.', 'かきます becomes かこう.'],
            )),
        round('oyogimasu-ending', 3, 1, 2, 1, 'state-select', question(FORM_SHEET_SHA256, 1, 2, 1),
            'およぎます → およ（　　　）う', 'ご', [choice('ご'), choice('ぎ')], hints(
                ['フォームシートの五段動詞の行です。', '「ぎ」はお段の「ご」へ動かします。', 'およぎます → およごうです。'],
                ['This is a group 1 row on the form sheet.', 'Move ぎ to the o-row sound, ご.', 'およぎます becomes およごう.'],
            )),
        round('karimasu-form', 4, 1, 2, 2, 'typed-report', question(FORM_SHEET_SHA256, 1, 2, 2),
            'かります → （　　　　　　）', 'かりよう', [], hints(
                ['「かります」は一段動詞の欄にあります。', 'ますを取り、ようを付けます。', 'かります → かりようです。'],
                ['かります sits in the group 2 column.', 'Remove ます and add よう.', 'かります becomes かりよう.'],
            )),
        round('narai-form', 5, 2, 3, 1, 'typed-report', question(FORM_SHEET_SHA256, 2, 3, 1),
            '習います → （　　　　　　）', '習おう', [], hints(
                ['表では「習います」はGroup 1です。', '「い」はお段の「お」へ動かします。', '習います → 習おうです。'],
                ['The chart places 習います in Group 1.', 'Move い to the o-row sound, お.', '習います becomes 習おう.'],
            )),
        round('ukemasu-form', 6, 2, 3, 2, 'state-select', question(FORM_SHEET_SHA256, 2, 3, 2),
            '受けます → （　　　　　　）', '受けよう', [choice('受けよう'), choice('受けおう')], hints(
                ['表では「受けます」はGroup 2です。', '一段動詞はますを取り、ようを付けます。', '受けます → 受けようです。'],
                ['The chart places 受けます in Group 2.', 'For group 2, remove ます and add よう.', '受けます becomes 受けよう.'],
            )),
        round('moushikomimasu-form', 7, 2, 3, 3, 'action-choice', question(FORM_SHEET_SHA256, 2, 3, 3),
            '申し込みます → （　　　　　　）', '申し込もう', [choice('申し込もう'), choice('申し込みよう')], hints(
                ['「申し込みます」はGroup 1の表にあります。', '最後の「み」はお段の「も」へ動かします。', '申し込みます → 申し込もうです。'],
                ['The chart places 申し込みます in Group 1.', 'Move the final み to the o-row sound, も.', '申し込みます becomes 申し込もう.'],
            )),
        round('kyuukeishimasu-form', 8, 2, 3, 4, 'typed-report', question(FORM_SHEET_SHA256, 2, 3, 4),
            '休憩します → （　　　　　　）', '休憩しよう', [], hints(
                ['これは表のIrregular欄です。', '「します」は「しよう」になります。', '休憩します → 休憩しようです。'],
                ['This row is in the irregular column.', 'します becomes しよう.', '休憩します becomes 休憩しよう.'],
            )),
    ] as const;
    const activity: StateInspectionModel = {
        id: 'activity:l2-l19-sensei-volitional-plan', kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-31-volitional-plan', curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT, conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 31 とフォームシートを先に読み、八つの原問で意向形を選び、作ってください。',
            en: 'Read Sensei’s Chapter 31 and form-and-word sheet first, then choose or produce the volitional form for eight source prompts.',
        },
        provenance: {
            packageId: PACKAGE_ID, packageOrder: PACKAGE_ORDER, answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID, archiveId: ARCHIVE_ID, sourceSheets: SOURCE_VISUALS,
                media: { status: 'no-audio-members-in-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'sensei-verbatim-form-tables-and-yomu-derived-deterministic-volitional-completions-over-canonical-source-pages',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 31', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Volitional form and intentions', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Sensei source first', text: 'The two Chapter 31 pages show the meaning, examples, and all three formation groups before the form practice.' },
                { title: 'Group 1', text: 'Change the final i-row sound to the o-row and add う.' },
                { title: 'Group 2', text: 'Remove ます and add よう.' },
                { title: 'Irregular', text: 'する becomes しよう, and 来る becomes こよう.' },
            ],
            taskHeadings: [
                { sourceTask: 1, text: '1: Check √ to create Volitional form of verbs.' },
                { sourceTask: 2, text: '2: Try again! How to classify and create Potential forms. Please fill in the brackets.' },
                { sourceTask: 3, text: '3: Please complete the chart. If you don’t know the meaning, please check them.' },
            ],
            rounds, passScore: 1,
            feedback: {
                pass: { explanation: { ja: '八つの原問で、意向形を三つの動詞グループから作れました。', en: 'Across eight source prompts, you formed the volitional from all three verb groups.' } },
                lapse: {
                    explanation: { ja: '間違えた行だけ、動詞の組と最後の音をもう一度確認しましょう。', en: 'For the missed rows only, check the verb group and the final sound again.' },
                    repairPrompt: { ja: '間違えた原問だけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the missed source prompts, opening one earned hint at a time if needed.' },
                    nearbyExample: { ja: '先生の表: 話します → 話そう。', en: 'Sensei’s chart: 話します → 話そう.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-volitional-plan',
        narrative: { ja: 'りえ先生の表で、一つの動詞を小さな計画に変えます。', en: 'Rie’s form sheet turns one verb into a small plan.' },
        activity: Object.freeze(activity),
    });
}

function round(id: string, sourceOrder: StateInspectionRound['sourceOrder'], sourcePage: StateInspectionRound['sourcePage'], sourceTask: StateInspectionRound['sourceTask'], sourceItem: StateInspectionRound['sourceItem'], interaction: StateInspectionInteraction, sourceQuestionId: string, sourcePrompt: string, answerExpression: string, options: readonly StateInspectionOption[], roundHints: StateInspectionRound['hints']): StateInspectionRound {
    return Object.freeze({ id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId, sourcePrompt, options, answerValue: answerExpression, answerExpression, acceptedAnswers: [answerExpression], conceptId: `concept:l2-l19:volitional:${sourceOrder}`, errorTag: `l2-l19-volitional-${sourceOrder}`, hints: roundHints });
}

function question(payloadSha256: string, page: 1 | 2, task: 1 | 2 | 3, item: 1 | 2 | 3 | 4): string {
    return `moodle:${MODULE_ID}:${payloadSha256}:pdf-p${page}:task-${task}:q${item}`;
}

function choice(value: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja: value, en: value }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('Lesson 44 rounds require exactly three bilingual hints.');
    return [Object.freeze({ ja: ja[0]!, en: en[0]! }), Object.freeze({ ja: ja[1]!, en: en[1]! }), Object.freeze({ ja: ja[2]!, en: en[2]! })];
}

function sourceVisual(payloadSha256: string, title: string, page: StateInspectionSourceVisual['page'], filename: string, sha256: string, alt: LocalizedText): StateInspectionSourceVisual {
    return Object.freeze({ sourceId: `moodle:${payloadSha256}:page:${page}`, payloadSha256, title, page, url: `/academy/content/lessons/l2-l19/${filename}`, sha256, alt: Object.freeze(alt) });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l19 package');
    const identity = record(root.identity, 'l2-l19 identity');
    const coverage = record(root.sourceCoverage, 'l2-l19 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) throw new TypeError('Unexpected l2-l19 package identity.');
    const payloads = array(coverage.members, 'l2-l19 members').map(member => record(member, 'l2-l19 member').payloadSha256);
    if (!payloads.includes(VOLITIONAL_SHA256) || !payloads.includes(FORM_SHEET_SHA256)) throw new TypeError('The exact l2-l19 Moodle payloads are required.');
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label} record.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label} array.`);
    return value;
}
