import lessonPackage from '../../../public/academy/content/lessons/022-l1-l21.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';
import type { CommuteComparisonLogModel } from '../minigames/commute-comparison-log';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l21';
const MODULE_ID = 6375062;
const WORKSHEET_SHA256 = '49468890a807f485a2c86cf2c05f6c3e11b6e2bf0cbd2ca50da662de8b91e5f5';
const AUDIO_SHA256 = '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l1-l21-a46.mp3';
const PAGE_ONE_SHA256 = '549fadcb25776014c1901d17cdc3e5ac032da901c615cc1b31e66252cc444e12';
const PAGE_THREE_SHA256 = '18979cb3a0916d93ea0e507bfbfb036ea2f95142c8711a0fadb7d16edc75f4df';
const GENKI_SHA256 = '2f55d6b6f87e9431d4359eaa1d52a175fd15619dd61321775ce35b8b98c6f36e';

const ROUNDS = [
    { sourcePrompt: '2hours by bus / 30mins by tube usually', disruption: ['bus', 'two-hours'], usual: ['tube', 'thirty-minutes'], answerExpression: 'バスで ２じかん かかりました。いつも ちかてつで ３０ぷん だけ です。' },
    { sourcePrompt: '1hour and half on foot / only 15 mins by tube usually', disruption: ['on-foot', 'one-and-a-half-hours'], usual: ['tube', 'fifteen-minutes'], answerExpression: 'あるいて １じかん はん かかりました。いつも ちかてつで １５ぷん だけ です。' },
    { sourcePrompt: 'about 3hours on foot / 45mins by bus and tube usually', disruption: ['on-foot', 'three-hours-about'], usual: ['bus-and-tube', 'forty-five-minutes'], answerExpression: 'あるいて ３じかん ぐらい かかりました。いつも バスと ちかてつで ４５ぷん です。' },
] as const;

const SOURCE_QUESTION_IDS = [
    'ex-l21-a46-strike-example',
    'ex-l21-a46-strike-walk-tube',
    'ex-l21-a46-strike-walk-bus-tube',
] as const;

const SOURCE_SCRIPT = [
    { speaker: 'A', text: 'きのう ちかてつ の ストライキ が ありましたね。' },
    { speaker: 'B', text: 'ええ、わたし は バス で かいしゃ へ いきました。' },
    { speaker: 'A', text: 'え！かいしゃ まで どのくらい かかりましたか。' },
    { speaker: 'B', text: 'バス で ２じかん かかりました。' },
    { speaker: 'A', text: 'そうでしたか。いつも どのくらい かかりますか。' },
    { speaker: 'B', text: 'ちかてつ で ３０ぷん だけ です。' },
    { speaker: 'A', text: 'たいへんでしたね。' },
    { speaker: 'B', text: 'はい、ほんとうに たいへんでした。' },
] as const;

export function createLessonTwentyOneCommuteComparisonBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = ROUNDS.map((round, index) => Object.freeze({
        id: `sensei-commute-${index + 1}`,
        sourceOrder: index + 1,
        sourceQuestionId: `${PACKAGE_ID}/${SOURCE_QUESTION_IDS[index]}`,
        sourcePrompt: round.sourcePrompt,
        disruption: { transportId: round.disruption[0], durationId: round.disruption[1] },
        usual: { transportId: round.usual[0], durationId: round.usual[1] },
        answerExpression: round.answerExpression,
        conceptId: `concept:l1-l21:commute-comparison:${index + 1}`,
        errorTag: `l1-l21-commute-comparison-${index + 1}`,
    }));
    const audioUrls = rounds.map(round => resolvePackagedListeningTask(PACKAGE_ID, round.sourceQuestionId.split('/').pop()!, AUDIO_LOCATOR));
    if (audioUrls.some(url => !url) || new Set(audioUrls).size !== 1) throw new TypeError('Missing exact packaged A-46 binding.');
    const activity: CommuteComparisonLogModel = {
        id: 'activity:l1-l21-sensei-commute-comparison-log',
        kind: 'academy-commute-comparison-log',
        responseKind: 'source-commute-disruption-usual-log',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: { ja: 'ストの日と、いつもの通勤を二行のノートに分けましょう。', en: 'Separate the strike-day and usual commutes into a two-line notebook.' },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                worksheet: { payloadSha256: WORKSHEET_SHA256, member: 'Chapter 11-4_time period_how long does it take.pdf', pages: [1, 3] },
                audio: { payloadSha256: AUDIO_SHA256, member: '46 A-46.mp3', url: audioUrls[0]!, durationSeconds: 70.066667, transcriptStatus: 'worksheet-script-after-attempt' },
                sourceSurfaces: [
                    { url: '/academy/content/lessons/l1-l21/moodle-chapter-11-4-duration-page-1.png', sha256: PAGE_ONE_SHA256, page: 1 },
                    { url: '/academy/content/lessons/l1-l21/moodle-chapter-11-4-duration-page-3.png', sha256: PAGE_THREE_SHA256, page: 3 },
                ],
            },
            minna: { reference: 'Minna no Nihongo I, Lesson 11', role: 'chronology-map-only' },
            genki: { taskId: 'genki-2e:l1-l21:lesson-1-workbook-1', role: 'post-instruction-number-reinforcement-only', payloadSha256: GENKI_SHA256, lineLocus: [76, 109] },
        },
        payload: {
            teaching: [
                { sourceQuestionId: 'moodle:6375062:chapter-11-4:p1:route-frame', sourceLabel: 'Moodle - Chapter 11-4, page 1', pattern: 'Place A から Place B まで transportation で Time period かかります。', explanation: { ja: '出発地から目的地まで、交通手段と、かかる時間を順に置きます。', en: 'Give the start and destination, then the transport and time it takes.' }, example: 'イギリスから にほんまで ひこうきで 14 じかん かかります。' },
                { sourceQuestionId: 'moodle:6375062:chapter-11-4:p1:how-long-question', sourceLabel: 'Moodle - Chapter 11-4, page 1', pattern: 'どのくらい かかりますか。', explanation: { ja: '「どのくらい」で時間の長さをたずねます。ストの日と、いつもの時間は別々に聞けます。', en: 'Use どのくらい to ask about duration. The strike-day and usual durations can be asked separately.' }, example: 'ひこうきで どのくらい かかりますか。' },
            ],
            rounds,
            sourceScript: SOURCE_SCRIPT,
            transportOptions: [{ id: 'bus', ja: 'バスで' }, { id: 'tube', ja: 'ちかてつで' }, { id: 'on-foot', ja: 'あるいて' }, { id: 'bus-and-tube', ja: 'バスと ちかてつで' }, { id: 'train', ja: 'でんしゃで' }],
            durationOptions: [{ id: 'two-hours', ja: '２じかん' }, { id: 'thirty-minutes', ja: '３０ぷん' }, { id: 'one-and-a-half-hours', ja: '１じかん はん' }, { id: 'fifteen-minutes', ja: '１５ぷん' }, { id: 'three-hours-about', ja: '３じかん ぐらい' }, { id: 'forty-five-minutes', ja: '４５ぷん' }, { id: 'one-hour', ja: '１じかん' }],
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '三つの通勤メモで、ストの日といつもの交通手段・時間を分けられました。', en: 'Each commute note now separates the strike-day and usual transport-and-duration facts.' } },
                lapse: { explanation: { ja: '一つ以上のメモで、ストの日といつもの行が入れ替わっているか、交通手段と時間が合っていません。', en: 'At least one note swaps the strike day and usual line, or mismatches its transport and duration.' }, repairPrompt: { ja: '先に「ストの日」の一組を読み、次に「いつも」の一組を読み直して、その二行だけ直しましょう。', en: 'Read the strike-day pair first, then the usual pair, and repair only those two lines.' }, nearbyExample: { ja: 'バスで ２じかん かかりました。いつも ちかてつで ３０ぷん だけ です。', en: 'It took two hours by bus. Usually it is only thirty minutes by tube.' } },
            },
            reviewTargets: rounds.map(round => ({ id: `review:l1-l21:${round.id}`, conceptId: round.conceptId, expression: round.answerExpression, meanings: ['Compare a disrupted journey with the usual journey using transport and duration.'], sentence: round.answerExpression })),
        },
    };
    return Object.freeze({
        id: 'sensei-commute-comparison-log',
        narrative: { ja: 'ピーターが、ストの日といつもの通勤を一つの答えに混ぜないよう、二行だけのノートを開きます。エンジェルは、数字を読む前に、どちらの日の行かを確認します。', en: 'Peter opens a two-line notebook so strike-day and usual commutes do not collapse into one answer. Onke checks which day a line belongs to before reading its number.' },
        activity: Object.freeze(activity),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l21 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l21 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l21 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l21 coverage').members, 'l1-l21 members').map((value, index) => record(value, `l1-l21 member ${index}`));
    for (const [payloadSha256, title] of [[WORKSHEET_SHA256, 'Chapter 11-4 time period how long does it take'], [AUDIO_SHA256, '46 A-46']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || member.title !== title) throw new TypeError(`Missing exact l1-l21 Moodle source ${title}.`);
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l21 Genki activities').map((value, index) => record(value, `l1-l21 Genki activity ${index}`));
    if (!activities.some(activity => activity.id === 'genki-2e:l1-l21:lesson-1-workbook-1')) throw new TypeError('Lesson 21 requires its mapped Genki number support.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
