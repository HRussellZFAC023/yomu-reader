import lessonPackage from '../../../public/academy/content/lessons/021-l1-l20.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { FrequencyLensModel } from '../minigames/frequency-lens';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l20' as const;
const MODULE_ID = 6310077;
const WORKSHEET_SHA256 = '14bf6fe4ba20b651eebe5639f9e87b2492592dc6ec92893ccd162e78289cc737';
const A45_SHA256 = '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8';
const MINNA_039_SHA256 = 'bca7547d5207c2a6b2abe6fd2df8716a1858fd02bbdf34d6195291900c75389d';

const CUES = [
    ['いちにち／いぬ と さんぽ を します（２）', 'いちにちに ２かい いぬと さんぽを します。', 'two'],
    ['いっしゅうかん／にほんご を ならいます（1）', 'いっしゅうかんに １かい にほんごを ならいます。', 'one'],
    ['いっしゅうかん／ヨガ を します（3）', 'いっしゅうかんに ３かい ヨガを します。', 'three'],
    ['いっかげつ／ジム へ いきます（4）', 'いっかげつに ４かい ジムへ いきます。', 'four'],
    ['いちねん／りょこう します（2）', 'いちねんに ２かい りょこう します。', 'two'],
    ['いちねん／かのじょ に プレゼント を あげます（7）', 'いちねんに ７かい かのじょに プレゼントを あげます。', 'seven'],
] as const;

export function createLessonTwentyFrequencyLensModel(): FrequencyLensModel {
    assertExactPackageSources();
    const rounds = CUES.map(([sourceCue, answerExpression, correctCountId], index) => Object.freeze({
        id: `sensei-frequency-${index + 1}`,
        sourceOrder: index + 1,
        sourceQuestionId: `moodle:6310077:chapter-11-3:p1:exercise-1:item-${index + 1}`,
        sourceCue,
        answerExpression,
        correctCountId,
        conceptId: `concept:l1-l20:frequency:${index + 1}`,
        errorTag: `l1-l20-frequency-lens-${index + 1}`,
    }));
    return Object.freeze({
        id: 'activity:l1-l20-sensei-frequency-lens',
        kind: 'academy-frequency-lens',
        responseKind: 'frequency-lens-classify-and-build',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: 'Senseiの六つの手がかりを、回数のレンズで完成させましょう。',
            en: 'Use the frequency lens to complete Sensei’s six source cues.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                payloadSha256: WORKSHEET_SHA256,
                member: 'Handouts/Chapter 11-3_time period_how many times_how long.docx',
                lineLocus: { start: 26, end: 33 },
                sourceSurface: {
                    url: '/academy/content/lessons/l1-l20/moodle-chapter-11-3-frequency-page-1.png',
                    sha256: 'eb21bacb07cd59fd5491708dbe05dc52a113833ba37869601c28986fc624bed4',
                    page: 1,
                },
                audio: [
                    { title: 'Original Moodle audio 45 A-45', url: '/academy/content/lessons/l1-l20/moodle-45-a-45.mp3', payloadSha256: A45_SHA256, transcriptStatus: 'not-provided-do-not-invent' },
                    { title: 'Original Moodle paired Minna track 039', url: '/academy/content/lessons/l1-l20/moodle-minna-039.mp3', payloadSha256: MINNA_039_SHA256, transcriptStatus: 'learner-toggle' },
                ],
            },
            minna: { reference: 'Minna no Nihongo I, Lesson 11', role: 'post-instruction-context-and-paired-track-039' },
            genki: { reference: 'Genki I, Lesson 4 Grammar 9', role: 'post-instruction-duration-support', sourceSlice: [1, 6] },
        },
        payload: {
            teaching: [
                {
                    sourceQuestionId: 'moodle:6310077:chapter-11-3:p1:basic-frequency',
                    sourceLabel: 'Moodle - Chapter 11-3, page 1',
                    pattern: 'Time period に Number + かい Verb ます。',
                    explanation: {
                        ja: '期間のあとに「に」を置き、回数を「かい」で数えます。',
                        en: 'Put に after the period, then count the repetitions with かい.',
                    },
                    example: 'いっしゅうかん に 1かい にほんごを べんきょう します。',
                },
                {
                    sourceQuestionId: 'moodle:6310077:chapter-11-3:p4:basic-duration',
                    sourceLabel: 'Moodle first; Genki I Lesson 4 Grammar 9 follows as support',
                    pattern: 'duration + action (no frequency に)',
                    explanation: {
                        ja: '時間の長さを言うときは、回数の「期間に」と区別して、時間を動作の前に置きます。',
                        en: 'For duration, put the length before the action; it is different from the frequency period に frame.',
                    },
                    example: 'まいばん 15ふん ヨガを します。',
                },
            ],
            rounds: Object.freeze(rounds),
            countOptions: [
                { id: 'one', ja: '１かい' }, { id: 'two', ja: '２かい' }, { id: 'three', ja: '３かい' },
                { id: 'four', ja: '４かい' }, { id: 'seven', ja: '７かい' }, { id: 'hours', ja: '２じかん' },
            ],
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '六つの手がかりすべてで、期間に・回数・動作をそろえられました。', en: 'Every source cue now has its period に, repetition count, and action aligned.' } },
                lapse: {
                    explanation: { ja: '回数のレンズ、に、または回数を直す手がかりがあります。', en: 'At least one source cue needs its frequency lens, に, or repetition count repaired.' },
                    repairPrompt: { ja: 'そのカードの期間を先に読み、「に」、それから「何回」を確認して直しましょう。', en: 'Read that card’s period first, then check に and how many repetitions before repairing it.' },
                    nearbyExample: { ja: 'いっしゅうかんに ３かい ヨガを します。', en: 'I do yoga three times a week.' },
                },
            },
            reviewTargets: Object.freeze(rounds.map(round => ({
                id: `review:l1-l20:${round.id}`,
                conceptId: round.conceptId,
                expression: round.answerExpression,
                meanings: ['Frequency with period に and number of repetitions.'],
                sentence: round.answerExpression,
            }))),
        },
    } satisfies FrequencyLensModel);
}

export function createLessonTwentyFrequencyLensBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'sensei-frequency-lens',
        narrative: {
            ja: 'ジョディが六つの予定カードを窓にかざします。ピーターは、時間の長さではなく、何回するかを見るカードだけを選ぶように言います。',
            en: 'Jodi holds six schedule cards against the window. Peter asks the learner to select the lens that sees how often, not how long.',
        },
        activity: createLessonTwentyFrequencyLensModel(),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l20 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l20 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l20 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l20 coverage').members, 'l1-l20 members').map((value, index) => record(value, `l1-l20 member ${index}`));
    for (const [payloadSha256, title] of [[WORKSHEET_SHA256, 'Chapter 11-3 time period how many times how long'], [A45_SHA256, '45 A-45'], [MINNA_039_SHA256, 'minna shokyu 1 039']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || member.title !== title) throw new TypeError(`Missing exact l1-l20 Moodle source ${title}.`);
    }
    const mappings = array(record(root.provenance, 'l1-l20 provenance').sourceMappings, 'l1-l20 mappings').map((value, index) => record(value, `l1-l20 mapping ${index}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'minna-i:66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229:lesson-11');
    const genki = mappings.find(mapping => mapping.sourceId === `japanese-genki-interactive:${'6b8d397d95313e5fe17eb8de2d5cebb557f6365ee835309caff3d7c6a25fa5fa'}:generateQuiz`);
    if (!minna || !genki) throw new TypeError('Lesson 20 requires its mapped Minna and Genki support sources.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
