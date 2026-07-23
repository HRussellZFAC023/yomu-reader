import lessonPackage from '../../../public/academy/content/lessons/034-l2-l07.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    MinnaTrueFalseListeningModel,
    MinnaTrueFalseTask,
    MinnaTrueFalseTranscriptLine,
    MinnaTruthMark,
} from '../minigames/minna-true-false-listening';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l07';
const PACKAGE_ORDER = 34;
const MODULE_ID = 6974653;
const AUDIO_SHA256 = '2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l07-minna-074.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3';
const SOURCE_ID = 'source-minna-074-true-false';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${AUDIO_SHA256}:audio:minna074-mondai-2`;

export function createLessonThirtyTwoMinna074ListeningBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = [
        task('woman-goes-now', 1, '女の人は これから 会議室へ 行きます。', 'cross'),
        task('man-predicts-japan', 2, '男の人は 日本が 勝つと 言いました。', 'cross'),
        task('pair-rests-at-cafe', 3, '男の人と 女の人は 喫茶店で 休みます。', 'circle'),
        task('woman-goes-to-gion', 4, '女の人は 祇園祭に 行きます。', 'circle'),
        task('man-carries-bag', 5, '男の人は 女の人の かばんを 持ちます。', 'cross'),
    ] as const;
    const urls = tasks.map(item => resolvePackagedListeningTask(PACKAGE_ID, item.sourceQuestionId, AUDIO_LOCATOR));
    if (urls.some(url => url !== AUDIO_URL)) {
        throw new TypeError('Expected one exact packaged Minna 074 binding for all five truth judgements.');
    }
    const activity: MinnaTrueFalseListeningModel = {
        id: 'activity:l2-l07-sensei-minna-074-true-false',
        kind: 'academy-minna-true-false-listening',
        responseKind: 'minna-074-mondai-2-true-false',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: '五つの短い会話と最後の文を聞き、文が会話と同じなら○、違うなら×を付けましょう。',
            en: 'Listen to five short dialogues and their closing statements. Mark ○ when a statement matches and × when it does not.',
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
                    durationSeconds: 109.688167,
                    label: 'Five-dialogue listening check',
                },
                sourceTask: 'recording-embedded-mondai-2',
                answerKeyBasis: 'reviewed-original-audio-statements-and-dialogues',
            },
        },
        payload: {
            sourceCaption: {
                ja: '会話のあとに文が流れます。内容が同じか違うかを、五問すべて判断してください。',
                en: 'Each dialogue is followed by a statement. Decide whether it matches for all five items.',
            },
            tasks,
            transcript: reviewedTranscript(),
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '五つの○・×が、会話と最後の文に合いました。',
                        en: 'All five marks match the dialogues and closing statements.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文が、その前の会話と同じかどうかをもう一度確かめる必要があります。',
                        en: 'At least one statement needs another check against the dialogue before it.',
                    },
                    repairPrompt: {
                        ja: 'もう一度聞き、まちがえた番号だけ○・×を直しましょう。',
                        en: 'Listen again and repair only the missed ○/× items.',
                    },
                    nearbyExample: {
                        ja: '会話で「あとで来ます」と言ったら、「これから行きます」は×です。',
                        en: 'If the dialogue says “I’ll come later,” the statement “She is going now” is ×.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-minna-074-true-false',
        narrative: {
            ja: '確認信号がそろうと、ソフィーが五つの会話を再生します。シンは、台本と○・×を最初の試行が終わるまで伏せます。',
            en: 'Once the confirmation signals are set, Sophie plays five short dialogues. Shin keeps the transcripts and ○/× answers hidden until the first attempt is complete.',
        },
        activity: Object.freeze(activity),
    });
}

function task(
    id: string,
    sourceOrder: MinnaTrueFalseTask['sourceOrder'],
    statement: string,
    correctMark: MinnaTruthMark,
): MinnaTrueFalseTask {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`,
        statement,
        correctMark,
        conceptId: `concept:l2-l07:minna074-${id}`,
        errorTag: `l2-l07-minna074-${id}`,
        reviewExpression: statement,
    });
}

function reviewedTranscript(): readonly MinnaTrueFalseTranscriptLine[] {
    return Object.freeze([
        line(1, 'A', '課長は 2階の 会議室です。今 会議を しています。'),
        line(1, 'B', '何時ごろ 終わりますか。'),
        line(1, 'A', '3時ごろだと 思いますが。'),
        line(1, 'B', 'そうですか。じゃ、また あとで 来ます。'),
        line(1, '文', '女の人は これから 会議室へ 行きます。'),
        line(2, 'A', '次の サッカーの 試合は 大阪で ありますね。'),
        line(2, 'B', 'ええ。日本が 勝つと 思いますか。'),
        line(2, 'A', 'そうですね。どちらも 強いですからね。'),
        line(2, '文', '男の人は 日本が 勝つと 言いました。'),
        line(3, 'A', '今 放送が ありましたね。何と 言いましたか。'),
        line(3, 'B', '3階に 喫茶店が あると 言いましたよ。'),
        line(3, 'A', 'そうですか。ちょっと 疲れましたね。コーヒーを 飲みに 行きませんか。'),
        line(3, 'B', 'ええ、そうしましょう。'),
        line(3, '文', '男の人と 女の人は 喫茶店で 休みます。'),
        line(4, 'A', '7月に 京都で 有名な お祭りが あるでしょう。'),
        line(4, 'B', 'ああ、祇園祭ですね。'),
        line(4, 'A', '行った ことが ありますか。'),
        line(4, 'B', 'いいえ、ありません。'),
        line(4, 'A', 'じゃ、ことし いっしょに 行きませんか。'),
        line(4, 'B', 'ええ。'),
        line(4, '文', '女の人は 祇園祭に 行きます。'),
        line(5, 'A', 'その かばん、重いでしょう。持ちましょうか。'),
        line(5, 'B', 'ありがとうございます。でも、そんなに 重くないですから、大丈夫です。'),
        line(5, 'A', 'そうですか。'),
        line(5, '文', '男の人は 女の人の かばんを 持ちます。'),
    ]);
}

function line(
    item: MinnaTrueFalseTranscriptLine['item'],
    speaker: MinnaTrueFalseTranscriptLine['speaker'],
    text: string,
): MinnaTrueFalseTranscriptLine {
    return Object.freeze({ item, speaker, text });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l07 package');
    const identity = record(root.identity, 'l2-l07 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l07 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l07 coverage');
    if (coverage.archiveSha256 !== '0d1df9696ef0f6114060c0c290818c5b53c739b4e58173d7dfb91407885ba1e3') {
        throw new TypeError('Unexpected l2-l07 source archive.');
    }
    const members = array(coverage.members, 'l2-l07 members').map(value => record(value, 'l2-l07 member'));
    const audioMembers = members.filter(member => member.kind === 'audio');
    const audio = audioMembers.find(member => member.payloadSha256 === AUDIO_SHA256);
    if (!audio || audio.title !== 'Homework/minna_shokyu_1_074.mp3' || audioMembers.length !== 8) {
        throw new TypeError('Lesson 32 requires the exact Minna 074 member among eight source audio members.');
    }
    const normalization = record(root.sourceQuestionNormalization, 'l2-l07 normalization');
    const questions = array(normalization.sourceQuestions, 'l2-l07 source questions').map(value => record(value, 'l2-l07 source question'));
    const expectedIds = Array.from({ length: 5 }, (_, index) => `${SOURCE_PREFIX}:item-${index + 1}`);
    if (questions.filter(question => question.sourceId === SOURCE_ID).map(question => question.id).join('|') !== expectedIds.join('|')) {
        throw new TypeError('Lesson 32 requires all five exact Minna 074 source questions in order.');
    }
    const quarantine = record(normalization.quarantine, 'l2-l07 quarantine');
    const unresolved = array(quarantine.unresolvedMedia, 'l2-l07 unresolved media').map(value => record(value, 'l2-l07 unresolved medium'));
    const otherAudioHashes = audioMembers.map(member => member.payloadSha256).filter(hash => hash !== AUDIO_SHA256).sort();
    const unresolvedHashes = unresolved.map(member => member.payloadSha256).sort();
    if (unresolved.length !== 7 || unresolvedHashes.join('|') !== otherAudioHashes.join('|')) {
        throw new TypeError('Lesson 32 must keep exactly the seven unrelated audio members quarantined.');
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
