import lessonPackage from '../../../public/academy/content/lessons/039-l2-l12.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { FavorDirectionListeningModel, FavorDirectionListeningTask } from '../minigames/favor-direction-listening';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l12';
const PACKAGE_ORDER = 39;
const MODULE_ID = 8121261;
const ARCHIVE_ID = 'archive-000032';
const ARCHIVE_SHA256 = '62c3a814d3590157a8498d34e5ca172c5afa6608d9f9be1ad149a4ca4b99d4fe';
const WORKSHEET_SHA256 = '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617';
const WORKSHEET_IMAGE_SHA256 = '8fbb6b9881e26e31bb614c0b3a2048780c3b590d457e9418a7ffeec7f828bc8c';
const AUDIO_SHA256 = '612ff9f8f70e5ce4ac79b3c6826e12e6b2a7c4d2ccccf5a017df7509f474c63e';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l2-l12-track-79.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p2:track79-favor-direction`;

export function createLessonThirtySevenTrack79FavorDirectionBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = [
        task('read-newspaper', 1, 'right', '→', '読んでもらう', ['読んでもらう', 'ここを読んでもらう']),
        task('lend-umbrella', 2, 'left', '←', '傘を貸してもらう', ['傘を貸してもらう', 'かさを貸してもらう', '貸してもらう']),
        task('finish-food', 3, 'right', '→', '食べてもらう', ['食べてもらう', '全部食べてもらう']),
    ] as const;
    const activity: FavorDirectionListeningModel = {
        id: 'activity:l2-l12-track-79-favor-direction',
        kind: 'academy-favor-direction-listening',
        responseKind: 'moodle-track-79-favor-direction',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: '受け手の見方を確認してから Track 79 の（2）を聞き、「〜てもらう」人への矢印とことばを書いてください。',
            en: 'Review the recipient viewpoint, then listen to Track 79 section (2) and give the arrow toward the person receiving the favor plus the 〜てもらう phrase.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            repairScope: 'missed-source-items-only',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                archiveSha256: ARCHIVE_SHA256,
                worksheet: {
                    sourceId: `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p2`,
                    payloadSha256: WORKSHEET_SHA256,
                    title: 'Homework/New_Homework_listening口座を開く_て あげます_て くれます_て もらいます.pdf',
                    page: 2,
                    url: '/academy/content/lessons/l2-l12/moodle-track-79-favor-direction-page-2.png',
                    sha256: WORKSHEET_IMAGE_SHA256,
                },
                audio: {
                    sourceId: `moodle:${MODULE_ID}:${AUDIO_SHA256}:audio:track-79`,
                    payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR,
                    url: requirePackagedAudio(tasks[0].sourceQuestionId),
                    durationSeconds: 78.92525,
                },
                answerKeyBasis: 'worksheet-beneficiary-direction-and-original-audio-reviewed',
                excludedAudioSection: 'section-1-explicitly-skipped-by-worksheet',
            },
        },
        payload: {
            sourceCaption: {
                ja: 'Moodle 原本 Section III。原本の赤字どおり Track 79 の（1）をスキップし、（2）の三つの絵・矢印・「〜てもらう」だけを扱います。',
                en: 'Moodle Section III: following the red source instruction, section (1) of Track 79 is skipped and only the three pictures, beneficiary arrows, and 〜てもらう phrases in section (2) are assessed.',
            },
            prerequisiteContext: [
                context('〜てもらう', '動作を受ける人の視点で言います。', 'States the action from the viewpoint of the person receiving it.'),
                context('矢印の先', '原本では「〜てもらう」人、つまり動作の受け手を指します。', 'In the source, the arrow points to the 〜てもらう person: the recipient of the action.'),
                context('〜てくれる？', '相手が自分のためにする動作を依頼する形です。', 'Requests an action that the other person will do for the speaker.'),
                context('〜てあげる', '話し手が相手のためにする動作を表します。', 'Describes an action the speaker does for someone else.'),
            ],
            instruction: 'III. トラック79を聞いて、問題に答えましょう。（2）例のように、「〜てもらう」人に矢印（→）を、＿＿＿＿＿＿にことばを書きましょう。',
            tasks,
            transcript: reviewedTranscript(),
            feedback: {
                pass: { explanation: { ja: '三つの受け手と「〜てもらう」のことばが、Track 79 と原本の絵に一致しました。', en: 'All three recipients and 〜てもらう phrases match Track 79 and the source pictures.' } },
                lapse: {
                    explanation: { ja: '矢印かことばが一つ以上、原本の受け手の視点と異なりました。', en: 'One or more arrows or phrases differ from the source recipient viewpoint.' },
                    repairPrompt: { ja: '間違えた原本項目だけが残ります。', en: 'Only missed source items remain for repair.' },
                    nearbyExample: { ja: '例では、先生が見る動作を受ける学生に矢印が向き、「見てもらう」と書きます。', en: 'In the example, the arrow points to the student receiving the teacher\'s action, and the phrase is 見てもらう.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'track-79-favor-direction',
        narrative: {
            ja: 'Track 78 の窓口会話の後、アカシュは同じ原本の Track 79 を再生します。三つの会話から、動作をしてもらう人を絵の中で追います。',
            en: 'After the Track 78 counter dialogue, Aakash plays Track 79 from the same source. Three exchanges ask the learner to follow the person receiving each helpful action through the picture.',
        },
        activity: Object.freeze(activity),
    });
}

function task(
    id: string,
    sourceOrder: FavorDirectionListeningTask['sourceOrder'],
    beneficiaryDirection: FavorDirectionListeningTask['beneficiaryDirection'],
    arrow: FavorDirectionListeningTask['arrow'],
    answer: string,
    acceptedAnswers: readonly string[],
): FavorDirectionListeningTask {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`,
        beneficiaryDirection,
        arrow,
        answer,
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        conceptId: `concept:l2-l12:track79-beneficiary-${sourceOrder}`,
        errorTag: `l2-l12-track79-item-${sourceOrder}`,
    });
}

function context(pattern: string, ja: string, en: string) { return Object.freeze({ pattern, explanation: Object.freeze({ ja, en }) }); }

function reviewedTranscript(): FavorDirectionListeningModel['payload']['transcript'] {
    return Object.freeze([
        line('音声', 'トラック79。'),
        line('音声', '（1）'),
        line('1', '口座'),
        line('2', '通帳'),
        line('3', 'キャッシュカード'),
        line('4', '印鑑、はんこ'),
        line('音声', '（2）例'),
        line('学生', '先生、あの作文を書いたんですが、見ていただけますか。'),
        line('先生', 'いいですよ。じゃあ、明日までに見ておきましょう。'),
        line('学生', 'ありがとうございます。'),
        line('1・男', 'としくん、ここ読んでくれる？'),
        line('1・少年', 'うーんとね、これはね、IT産業だよ。'),
        line('1・男', 'ほうほう、なるほど。'),
        line('2・男', 'あ、ひどい雨だよ。まずいな、傘持ってないや。'),
        line('2・女', '私、まだ仕事あるから、これどうぞ。'),
        line('2・男', 'ありがとう。助かった。'),
        line('3・女', 'あー、これ食べられないんだよ。全部食べないと怒られちゃうのに。'),
        line('3・男', 'じゃあ、食べてあげるよ。'),
        line('3・女', '本当？ ありがとう。助かったよ。'),
    ]);
}

function line(speaker: string, text: string) { return Object.freeze({ speaker, text }); }

function requirePackagedAudio(sourceQuestionId: string): string {
    const url = resolvePackagedListeningTask(PACKAGE_ID, sourceQuestionId, AUDIO_LOCATOR);
    if (!url) throw new TypeError('Track 79 must have a packaged exact-task binding.');
    return url;
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l12 package');
    const identity = record(root.identity, 'l2-l12 identity');
    const coverage = record(root.sourceCoverage, 'l2-l12 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l12 package identity.');
    }
    const members = array(coverage.members, 'l2-l12 members').map(value => record(value, 'l2-l12 member'));
    const worksheet = members.find(member => member.payloadSha256 === WORKSHEET_SHA256);
    const audio = members.find(member => member.payloadSha256 === AUDIO_SHA256);
    if (worksheet?.title !== 'Homework/New_Homework_listening口座を開く_て あげます_て くれます_て もらいます.pdf'
        || worksheet.kind !== 'document' || audio?.title !== 'Homework/79 Track 79.mp3' || audio.kind !== 'audio') {
        throw new TypeError('Lesson 37 requires the exact Track 79 worksheet/audio pair.');
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
