import lessonPackage from '../../../public/academy/content/lessons/031-l2-l04.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { PlainStyleMatrixModel } from '../minigames/plain-style-matrix';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l04';
const MODULE_ID = 7011920;
const VOCABULARY_SHA256 = 'eadb985342ee844a845bdb8ba0c8eeadc28d23e7e44fc05a025b65b701de9088';
const GRAMMAR_SHA256 = '87f2476a1e1f9701d058f3b761542a0caba4a9b4da9213f919c4373781d8033c';
const GENKI_SHA256 = '510418850a44517faf16d384412b5cc90f653bfe7426063cdf616723d4c62f55';
const VOCABULARY_IMAGE_SHA256 = 'c0069c4fcc3b1d31df9badbb2f4532078b02d925e2c44303c5e50408e95819f2';
const GRAMMAR_IMAGE_SHA256 = 'd8d0b2b0ff00c3e6801b4e02d97cde11382a201e85b0ea468b717a448cd9f38f';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${GRAMMAR_SHA256}:pdf-p3:plain-style-matrix`;

export function createLessonTwentyEightPlainStyleMatrixBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const prompts = [
        ['oyogimasu-dictionary', '泳ぎます', 'dictionary', [['a', '泳ぐ'], ['b', '泳いだ'], ['c', '泳がない']], 'a', '泳ぐ'],
        ['kashimasu-dictionary', '貸します', 'dictionary', [['a', '貸した'], ['b', '貸す'], ['c', '貸さない']], 'b', '貸す'],
        ['machimasu-negative', '待ちます', 'negative', [['a', '待った'], ['b', '待つ'], ['c', '待たない']], 'c', '待たない'],
        ['asobimasu-past-negative', '遊びます', 'past-negative', [['a', '遊ばなかった'], ['b', '遊んだ'], ['c', '遊ばない']], 'a', '遊ばなかった'],
    ] as const;
    const activity: PlainStyleMatrixModel = {
        id: 'activity:l2-l04-sensei-plain-style-matrix', kind: 'academy-plain-style-matrix', responseKind: 'moodle-chapter-20-plain-style-matrix', curriculumPhase: 'assessed-recognition', answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: prompts.map(([id]) => `concept:l2-l04:plain-matrix-${id}`),
        prompt: { ja: '先生の Chapter 20-1 の語彙と動詞の表を見てから、四つの行を指定された列へ動かしましょう。', en: 'Study Sensei’s Chapter 20-1 vocabulary and verb matrix, then move four rows into their specified plain-form columns.' },
        provenance: {
            packageId: PACKAGE_ID, answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                vocabularySheet: sourceVisual(`moodle:${VOCABULARY_SHA256}:page:1`, VOCABULARY_SHA256, VOCABULARY_IMAGE_SHA256, 'Handouts/Chapter 20-1 Vocabulary Sheet.pdf', '/academy/content/lessons/l2-l04/moodle-chapter-20-1-vocabulary-page-1.png'),
                grammarSheet: sourceVisual(`moodle:${GRAMMAR_SHA256}:page:3`, GRAMMAR_SHA256, GRAMMAR_IMAGE_SHA256, 'Handouts/Chapter 20-1 plain style_verb_Grammar exercise.pdf', '/academy/content/lessons/l2-l04/moodle-chapter-20-1-plain-style-verb-page-3.png'),
                answerKeyBasis: 'yomu-derived-plain-form-completion-over-verbatim-source-matrix',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I, Lesson 20', reuse: 'sequence-only' },
                genki: { sourceId: `japanese-genki-interactive:${GENKI_SHA256}`, payloadSha256: GENKI_SHA256, relation: 'post-instruction-short-form-support-only-no-genki-task-shown' },
            },
        },
        payload: {
            teaching: [
                { title: { ja: '先生の Chapter 20-1 Vocabulary Sheet', en: 'Sensei’s Chapter 20-1 Vocabulary Sheet' }, pattern: '（ビザが）いります　パイロット　そら　とびます　うちゅう', instruction: { ja: '最初に先生の語彙ページを原本の順で見ます。新しい意味や語彙リストを足しません。', en: 'Start with Sensei’s vocabulary page in its original order. Do not add a new meaning list or vocabulary list.' } },
                { title: { ja: '先生の動詞の表', en: 'Sensei’s verb matrix' }, pattern: '辞書形・ない形・た形・なかった形', instruction: { ja: '先生のページ3の表は四つの普通形を並べています。下の四問は、その表を読んで作ったYomuの確認であり、Moodleの答えを主張しません。', en: 'Sensei’s page 3 lays out four plain forms. The four checks below are Yomu-derived readings of that matrix, not claimed Moodle answer keys.' } },
            ],
            prompts: prompts.map(([id, politeForm, targetColumn, options, correctOptionId, reviewExpression], index) => ({ id, politeForm, targetColumn, options: options.map(([optionId, label]) => ({ id: optionId, label })), correctOptionId, reviewExpression, sourceQuestionId: `${SOURCE_PREFIX}:row-${index + 1}`, sourceOrder: (index + 1) as 1 | 2 | 3 | 4, conceptId: `concept:l2-l04:plain-matrix-${id}`, errorTag: `l2-l04-plain-matrix-${id}` })),
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '四つの形を、先生の動詞の表を見ながら確認できました。', en: 'You checked all four forms against Sensei’s verb matrix.' } },
                lapse: { explanation: { ja: '一つ以上の行がまだ別の列にあります。', en: 'At least one row is still in a different column.' }, repairPrompt: { ja: '先生のページ3の表を見たまま、まちがえた行だけを選び直しましょう。', en: 'Keep Sensei’s page 3 matrix visible and revise only the missed row.' }, nearbyExample: { ja: '辞書形・ない形・た形・なかった形', en: 'dictionary, negative, past, and past-negative forms' } },
            },
        },
    };
    return Object.freeze({ id: 'sensei-plain-style-matrix', narrative: { ja: 'トムが先生の動詞の表を四つの列に広げます。フランシスは、答えを先に言わず、見えている列だけを確かめます。', en: 'Tom opens Sensei’s verb matrix into four columns. Francis checks only the visible column without giving the form away first.' }, activity: Object.freeze(activity) });
}

function sourceVisual(sourceId: string, payloadSha256: string, sha256: string, title: string, url: string) { return { sourceId, payloadSha256, title, url, sha256, alt: { ja: `Moodle 原本: ${title}`, en: `Moodle original: ${title}` } } as const; }
function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l04 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l04 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l2-l04 package identity.');
    const members = array(record(root.sourceCoverage, 'l2-l04 coverage').members, 'l2-l04 members').map(value => record(value, 'l2-l04 member'));
    for (const [sha256, title] of [[VOCABULARY_SHA256, 'Handouts/Chapter 20-1 Vocabulary Sheet.pdf'], [GRAMMAR_SHA256, 'Handouts/Chapter 20-1 plain style_verb_Grammar exercise.pdf']] as const) { const member = members.find(candidate => candidate.payloadSha256 === sha256); if (!member || member.title !== title) throw new TypeError(`Missing exact Lesson 28 Moodle source ${title}.`); }
    const mappings = array(record(root.provenance, 'l2-l04 provenance').sourceMappings, 'l2-l04 mappings').map(value => record(value, 'l2-l04 mapping'));
    if (!mappings.some(mapping => mapping.sourceId === 'source-minna-no-nihongo' && mapping.reference === 'Minna no Nihongo I, Lesson 20' && mapping.reuse === 'sequence-only')) throw new TypeError('Lesson 28 requires bounded Minna Lesson 20 chronology support.');
    const activities = array(root.genkiInteractiveActivities, 'l2-l04 Genki activities').map(value => record(value, 'l2-l04 Genki activity'));
    if (!activities.some(activity => activity.id === 'genki-2e:l2-l04:lesson-9-grammar-1' && record(activity.source, 'l2-l04 Genki source').payloadSha256 === GENKI_SHA256)) throw new TypeError('Lesson 28 requires exact Genki short-form support metadata.');
}
function record(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Readonly<Record<string, unknown>>; }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
