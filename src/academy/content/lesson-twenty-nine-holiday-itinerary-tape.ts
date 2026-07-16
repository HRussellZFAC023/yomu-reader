import lessonPackage from '../../../public/academy/content/lessons/030-l2-l03.json';
import priorLessonPackage from '../../../public/academy/content/lessons/029-l2-l02.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';
import type { HolidayItineraryTapeModel } from '../minigames/holiday-itinerary-tape';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l03';
const MODULE_ID = 7011919;
const VOCABULARY_SHA256 = '5e7880ecbaa49b880eae7d78f938bb313bbd3f1eced59ccece97a221a64f0899';
const GRAMMAR_SHA256 = '17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a';
const AUDIO_SHA256 = '6dccd9517dc4e10fb1ce3548de2c3c9d07a498f12bbf6e5b734b0e56c1490e6b';
const GENKI_SHA256 = 'c60448dea49bb12806d091d10b21890c040d2778d4df20283790e7e2c7ca2aee';
const VOCABULARY_IMAGE_SHA256 = 'edaa7f991771ccda7ff2a2a00ebffb5418234df2e0cd536c059cce532f38119e';
const GRAMMAR_IMAGE_SHA256 = '20595904296d510ed9aab10a13148c8d0c9d85e27779a637ac9cb5949dccf738';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${GRAMMAR_SHA256}:pdf-p3:summer-holiday:b22`;
const B22_LOCATOR = 'academy/content/moodle/audio/l2-l03-b22.mp3';

export function createLessonTwentyNineHolidayItineraryTapeBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const pins = [
        ['yamada-plan', 'speaker-a', '山田さん: 八月に一週間ぐらいあり、両親のうちへ帰ります。'],
        ['yamada-activities', 'speaker-a', '山田さん: 子どもと釣りに行ったり、山に登ったりします。'],
        ['clara-plan', 'speaker-b', 'クララさん: 九月に家族とインドネシアのバリへ行き、三週間ゆっくり休みます。'],
        ['clara-activities', 'speaker-b', 'クララさん: 海で泳いだり、本を読んだりしたいです。'],
    ] as const;
    const audioUrl = resolvePackagedListeningTask(PACKAGE_ID, `${SOURCE_PREFIX}:pin-1`, B22_LOCATOR);
    if (!audioUrl) throw new TypeError('Expected packaged and task-bound Moodle B-22 audio.');
    const activity: HolidayItineraryTapeModel = {
        id: 'activity:l2-l03-sensei-holiday-itinerary-tape',
        kind: 'academy-holiday-itinerary-tape',
        responseKind: 'moodle-b22-holiday-itinerary-tape',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: pins.map(([id]) => `concept:l2-l03:b22-${id}`),
        prompt: { ja: '先生のことばと夏休みのページを見てから、B-22を聞きます。四つの音声ピンを話し手AかBの棚に置きましょう。', en: 'Study Sensei’s vocabulary and summer-holiday page, then hear B-22. Place each of four audio pins on speaker shelf A or B.' },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                vocabularySheet: sourceVisual(`moodle:${VOCABULARY_SHA256}:page:1`, VOCABULARY_SHA256, VOCABULARY_IMAGE_SHA256, 'Handouts from last week/Chapter 19-2,3 Vocabulary Sheet.pdf', '/academy/content/lessons/l2-l03/moodle-chapter-19-2-3-vocabulary-page-1.png'),
                grammarSheet: sourceVisual(`moodle:${GRAMMAR_SHA256}:page:3`, GRAMMAR_SHA256, GRAMMAR_IMAGE_SHA256, 'Handouts from last week/Chapter 19-2 〜たり、〜たり_Grammar exercise.pdf', '/academy/content/lessons/l2-l03/moodle-chapter-19-2-tari-grammar-page-3.png'),
                audio: { sourceId: `moodle:${AUDIO_SHA256}:audio`, payloadSha256: AUDIO_SHA256, url: audioUrl, durationSeconds: 45.093333, transcriptStatus: 'audio-reviewed-speaker-pins-hidden-until-attempt' },
                answerKeyBasis: 'source-grammar-page-three-and-audio-reviewed-speaker-pins',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I, Lesson 19', reuse: 'sequence-only' },
                genki: { sourceId: `japanese-genki-interactive:${GENKI_SHA256}`, payloadSha256: GENKI_SHA256, relation: 'prior-form-context-only-no-genki-task-shown' },
            },
        },
        payload: {
            teaching: [
                { title: { ja: '先生の Chapter 19-2,3 Vocabulary Sheet', en: 'Sensei’s Chapter 19-2,3 Vocabulary Sheet' }, pattern: 'そうじします　せんたくします　れんしゅうします　やすみ の ひ　もうすぐ', instruction: { ja: '最初に先生の語彙シートをそのまま見ます。B-22を聞く前に、聞き取りの答えは出しません。', en: 'Look at Sensei’s vocabulary sheet first. Do not reveal any listening answer before B-22.' } },
                { title: { ja: '先生の夏休みの問い', en: 'Sensei’s summer-holiday question' }, pattern: 'Vた り、Vた り します', instruction: { ja: '先生のページ3は「夏休みは毎年何をしますか」と聞きます。B-22では、二人の計画と例として挙げる活動を聞き分けます。', en: 'Sensei’s page 3 asks what someone does each summer holiday. In B-22, distinguish the two plans and the example activities.' } },
            ],
            pins: pins.map(([id, correctSpeakerId, reviewExpression], index) => ({ id, sourceQuestionId: `${SOURCE_PREFIX}:pin-${index + 1}`, sourceOrder: (index + 1) as 1 | 2 | 3 | 4, correctSpeakerId, conceptId: `concept:l2-l03:b22-${id}`, errorTag: `l2-l03-b22-${id}`, reviewExpression })),
            transcript: [
                { speaker: '音声', text: '二番、今年の夏休みはどうですか。' },
                { speaker: 'A', text: 'もうすぐ夏ですね。山田さんは夏休みに何をしますか。' },
                { speaker: '山田', text: '夏休みですか。八月に一週間ぐらいありますが、いつも両親のうちへ帰ります。' },
                { speaker: 'A', text: '今年も帰りますか。' },
                { speaker: '山田', text: 'ええ。子どもと釣りに行ったり、山に登ったりします。' },
                { speaker: 'A', text: 'クララさんの夏休みは？' },
                { speaker: 'クララ', text: '今年は九月に家族とインドネシアのバリへ行きます。小さいうちを借りて、三週間ゆっくり休みます。' },
                { speaker: 'クララ', text: '海で泳いだり、本を読んだりしたいです。' },
                { speaker: 'A', text: '三週間ですか。いいですね。' },
            ],
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: 'B-22の四つの聞き取りピンを、先生の夏休みの問いと原音声で確かめられました。', en: 'You matched all four B-22 pins against Sensei’s summer-holiday prompt and original audio.' } },
                lapse: { explanation: { ja: '一つ以上のピンがまだ別の話し手の棚にあります。', en: 'At least one pin is still on the other speaker’s shelf.' }, repairPrompt: { ja: '先生の夏休みのページを見たままB-22をもう一度聞き、まちがえたピンだけを置き直しましょう。', en: 'Keep Sensei’s summer-holiday page visible, replay B-22, and move only the missed pins.' }, nearbyExample: { ja: 'Vた り、Vた り します', en: 'V-ta ri, V-ta ri shimasu' } },
            },
        },
    };
    return Object.freeze({ id: 'sensei-holiday-itinerary-tape', narrative: { ja: 'ジョディが先生の夏休みの問いを四つの音声ピンに分けます。アレックスは、内容を先に言わず、聞こえた話し手の棚だけを選ぶようにします。', en: 'Jodi turns Sensei’s summer-holiday question into four audio pins. Alex keeps the details hidden and asks the learner to choose only the shelf of the speaker they hear.' }, activity: Object.freeze(activity) });
}

function sourceVisual(sourceId: string, payloadSha256: string, sha256: string, title: string, url: string) { return { sourceId, payloadSha256, title, url, sha256, alt: { ja: `Moodle 原本: ${title}`, en: `Moodle original: ${title}` } } as const; }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l03 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l03 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l2-l03 package identity.');
    const members = array(record(root.sourceCoverage, 'l2-l03 coverage').members, 'l2-l03 members').map((value, index) => record(value, `l2-l03 member ${index}`));
    for (const [sha256, title] of [[VOCABULARY_SHA256, 'Handouts from last week/Chapter 19-2,3 Vocabulary Sheet.pdf'], [GRAMMAR_SHA256, 'Handouts from last week/Chapter 19-2 〜たり、〜たり_Grammar exercise.pdf'], [AUDIO_SHA256, 'audio materials/22 B-22.mp3']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === sha256);
        if (!member || member.title !== title) throw new TypeError(`Missing exact Lesson 29 Moodle source ${title}.`);
    }
    const priorActivities = array(record(priorLessonPackage, 'l2-l02 package').genkiInteractiveActivities, 'l2-l02 Genki activities').map(value => record(value, 'l2-l02 Genki activity'));
    if (!priorActivities.some(activity => activity.id === 'genki-2e:l2-l02:lesson-11-grammar-4' && record(activity.source, 'l2-l02 Genki source').payloadSha256 === GENKI_SHA256)) throw new TypeError('Lesson 29 requires bounded prior Genki Lesson 11 context.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Readonly<Record<string, unknown>>; }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
