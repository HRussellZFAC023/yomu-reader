import lessonPackage from '../../../public/academy/content/lessons/037-l2-l10.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    MinnaTrueFalseListeningModel,
    MinnaTrueFalseTask,
    MinnaTrueFalseTranscriptLine,
    MinnaTruthMark,
} from '../minigames/minna-true-false-listening';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l10';
const PACKAGE_ORDER = 37;
const MODULE_ID = 6974659;
const ARCHIVE_SHA256 = '717787bb3eb1af1b75d149b26cef1e1386950430020c3c583b790523d6f0404c';
const AUDIO_SHA256 = '3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l10-minna-077.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-3be2ca818292e685.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${AUDIO_SHA256}:audio:minna077-mondai-2`;

export function createLessonThirtyFiveMinna077ListeningBeat(): LessonActivityBeat {
    assertExactPackageSource();
    const tasks = [
        task('woman-made-cake', 1, '女の人は チョコレートケーキを 作りました。', 'circle'),
        task('umbrella-behind-stairs', 2, '傘は 階段の 後ろに 置かなければ なりません。', 'circle'),
        task('miller-reading-paper', 3, 'ミラーさんは 今、新聞を 読んでいます。', 'cross'),
        task('man-keeps-child-plan', 4, '男の人は あした 子どもと 遊びますから、テニスに 行きません。', 'circle'),
        task('karina-short-hair', 5, 'カリナさんは 髪が 短いです。', 'circle'),
    ] as const;
    const urls = tasks.map(item => resolvePackagedListeningTask(PACKAGE_ID, item.sourceQuestionId, AUDIO_LOCATOR));
    if (urls.some(url => url !== AUDIO_URL)) {
        throw new TypeError('Expected one exact packaged Minna 077 binding for all five truth judgements.');
    }
    const activity: MinnaTrueFalseListeningModel = {
        id: 'activity:l2-l10-sensei-minna-077-true-false',
        kind: 'academy-minna-true-false-listening',
        responseKind: 'minna-077-mondai-2-true-false',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: 'Chapter 22 の名詞を説明する節を思い出しながら Minna 077 を聞き、最後の文が会話と同じなら○、違うなら×を付けましょう。',
            en: 'Recall the Chapter 22 clauses that describe nouns, then listen to Minna 077. Mark each closing statement ○ if it matches the dialogue or × if it does not.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                audio: {
                    sourceId: `moodle:${AUDIO_SHA256}:audio`,
                    payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR,
                    url: AUDIO_URL,
                    durationSeconds: 96.235125,
                    label: 'Minna no Nihongo track 077',
                },
                sourceTask: 'recording-embedded-mondai-2',
                answerKeyBasis: 'reviewed-original-audio-statements-and-dialogues',
            },
        },
        payload: {
            sourceCaption: {
                ja: '元資料: Moodle Lesson 9 の宿題に収録された Minna 077「問題2」。公式3A版と一バイトずつ同一で、音声内の五問を元の○・×形式で確認します。',
                en: 'Source: Minna 077 Mondai 2 from Moodle Lesson 9 homework. It is byte-identical to the official 3A track, and its five recording-embedded items retain the original ○/× format.',
            },
            tasks,
            transcript: reviewedTranscript(),
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '五つの○・×が、Minna 077 の会話と最後の文に合いました。',
                        en: 'All five marks match the Minna 077 dialogues and closing statements.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文で、説明する節の人物・物・予定をもう一度確かめる必要があります。',
                        en: 'At least one statement needs another check of the person, object, or plan described by its clause.',
                    },
                    repairPrompt: {
                        ja: 'Minna 077 をもう一度聞き、まちがえた番号だけ○・×を直しましょう。',
                        en: 'Replay Minna 077 and repair only the missed ○/× items.',
                    },
                    nearbyExample: {
                        ja: '「ここにあった新聞」は新聞を説明しています。だれが持って行ったかを聞き分けます。',
                        en: 'In ここにあった新聞, the clause describes the newspaper. Listen for who took it away.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-minna-077-true-false',
        narrative: {
            ja: '「とき」の境目を確認したあと、エンジェルが前の Chapter 22 の説明節を Minna 077 で呼び戻します。五つの文と台本は、最初の聞き取りが終わるまで伏せます。',
            en: 'After checking the toki threshold, Onke retrieves the previous Chapter 22 describing clauses through Minna 077. All five statements and the transcript stay covered until the first listening attempt is complete.',
        },
        activity: Object.freeze(activity),
    });
}

function task(id: string, sourceOrder: MinnaTrueFalseTask['sourceOrder'], statement: string, correctMark: MinnaTruthMark): MinnaTrueFalseTask {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`,
        statement,
        correctMark,
        conceptId: `concept:l2-l10:minna077-${id}`,
        errorTag: `l2-l10-minna077-${id}`,
        reviewExpression: statement,
    });
}

function reviewedTranscript(): readonly MinnaTrueFalseTranscriptLine[] {
    return Object.freeze([
        line(1, 'A', 'これ、私が 作った ケーキですけど、いかがですか。'),
        line(1, 'B', 'チョコレートケーキですね。'),
        line(1, 'B', 'いただきます。'),
        line(1, 'B', 'おいしいですね。'),
        line(1, '文', '女の人は チョコレートケーキを 作りました。'),
        line(2, 'A', 'あ、そこに 傘を 置かないで ください。'),
        line(2, 'B', 'すみません。'),
        line(2, 'B', '傘を 置く ところは どこですか。'),
        line(2, 'A', '階段の 後ろに 置いて ください。'),
        line(2, 'B', 'わかりました。'),
        line(2, '文', '傘は 階段の 後ろに 置かなければ なりません。'),
        line(3, 'A', 'ミラーさん、ここに あった 新聞は？'),
        line(3, 'B', '山田さんが 持って 行きましたよ。'),
        line(3, 'A', 'あ、そうですか。'),
        line(3, '文', 'ミラーさんは 今、新聞を 読んでいます。'),
        line(4, 'A', '山田さん、あした テニスに 行きませんか。'),
        line(4, 'B', 'あしたですか。'),
        line(4, 'B', 'あしたは ちょっと 子どもと 遊びに 行く 約束が ありますから。'),
        line(4, 'A', 'そうですか。じゃ、また 今度。'),
        line(4, '文', '男の人は あした 子どもと 遊びますから、テニスに 行きません。'),
        line(5, 'A', '旅行の 写真ですね。'),
        line(5, 'A', 'この 人は だれですか。'),
        line(5, 'B', 'どの 人ですか。'),
        line(5, 'A', '佐藤さんの 後ろに いる 髪が 短い 人です。'),
        line(5, 'B', 'あ、カリナさんです。'),
        line(5, '文', 'カリナさんは 髪が 短いです。'),
    ]);
}

function line(item: MinnaTrueFalseTranscriptLine['item'], speaker: MinnaTrueFalseTranscriptLine['speaker'], text: string): MinnaTrueFalseTranscriptLine {
    return Object.freeze({ item, speaker, text });
}

function assertExactPackageSource(): void {
    const root = record(lessonPackage, 'l2-l10 package');
    const identity = record(root.identity, 'l2-l10 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l10 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l10 coverage');
    if (coverage.archiveSha256 !== ARCHIVE_SHA256) throw new TypeError('Unexpected l2-l10 source archive.');
    const members = array(coverage.members, 'l2-l10 members').map(value => record(value, 'l2-l10 member'));
    const audioMembers = members.filter(member => member.kind === 'audio');
    const audio = audioMembers.find(member => member.payloadSha256 === AUDIO_SHA256);
    if (!audio || audio.title !== 'Homework/minna_shokyu_1_077.mp3' || audioMembers.length !== 4) {
        throw new TypeError('Lesson 35 requires exact Minna 077 among four package audio members.');
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
