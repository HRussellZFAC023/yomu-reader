import lessonPackage from '../../../public/academy/content/lessons/029-l2-l02.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ExperiencePostcardListeningModel } from '../minigames/experience-postcard-listening';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l02';
const MODULE_ID = 7011918;
const VOCABULARY_SHA256 = '34763479d18b72f20bf7618aa691b3a5d0f5855ae7f09ebd5799703b7d714097';
const LISTENING_SHA256 = 'efa1e30112ad8ec1dd606b9d74c70b0bf315896701da851a359f8c468d950b75';
const AUDIO_SHA256 = '654c720b3734cb748e45cea2d9a2e6ec938668afc9d07e95451b01daa672f2db';
const GENKI_SHA256 = 'c60448dea49bb12806d091d10b21890c040d2778d4df20283790e7e2c7ca2aee';
const VOCABULARY_IMAGE_SHA256 = 'b9a76542879c20ac1e1519c4f2246bf3d16ca84e510e680e98119d41c40c3802';
const LISTENING_IMAGE_SHA256 = '70b5f991a2cc262205669d21901b2f945b5faf24e8ad41caa5134bb34f2a7414';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${LISTENING_SHA256}:pdf-p1:task-1`;

export function createLessonTwentySevenExperiencePostcardListeningBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const prompts = [
        ['sumo', 'b', '相撲を見に行ったことがあります'],
        ['awa-dance', 'c', '阿波踊りをしたことがあります'],
        ['horse', 'b', '馬に乗ったことがあります'],
    ] as const;
    const vocabularySheet = sourceVisual(`moodle:${VOCABULARY_SHA256}:page:1`, VOCABULARY_SHA256, VOCABULARY_IMAGE_SHA256, 'Handouts from last lesson/Chapter 19-1 Vocabulary Sheet.pdf', '/academy/content/lessons/l2-l02/moodle-chapter-19-1-vocabulary-page-1.png');
    const listeningSheet = sourceVisual(`moodle:${LISTENING_SHA256}:page:1`, LISTENING_SHA256, LISTENING_IMAGE_SHA256, 'Handouts from last lesson/Chapter 19 listening .pdf', '/academy/content/lessons/l2-l02/moodle-chapter-19-listening-page-1.png');
    const activity: ExperiencePostcardListeningModel = {
        id: 'activity:l2-l02-sensei-experience-postcard-listening',
        kind: 'academy-experience-postcard-listening',
        responseKind: 'moodle-b21-experience-postcard-rail',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: prompts.map(([id]) => `concept:l2-l02:b21-${id}`),
        prompt: { ja: '先生のことばの表とB-21の絵を見てから、音声の三つの経験にA、B、Cの印を一つずつ置きましょう。', en: 'Study Sensei’s vocabulary sheet and the B-21 picture page, then place one neutral A, B, or C stamp at each experience stop.' },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            vocabularySheet,
            listeningSheet,
            moodle: {
                moduleId: MODULE_ID,
                vocabularySheet,
                listeningSheet,
                audio: { sourceId: `moodle:${AUDIO_SHA256}:audio`, payloadSha256: AUDIO_SHA256, url: '/academy/content/lessons/l2-l02/moodle-b-21.mp3', durationSeconds: 127.906667, transcriptStatus: 'audio-reviewed-answer-keys-hidden-until-attempt' },
                answerKeyBasis: 'source-audio-verified-picture-selections',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I, Lesson 19', reuse: 'sequence-only' },
                genki: { sourceId: `japanese-genki-interactive:${GENKI_SHA256}`, payloadSha256: GENKI_SHA256, relation: 'post-instruction-experience-form-support-only' },
            },
        },
        payload: {
            teaching: [
                { title: { ja: '先生の Chapter 19-1 Vocabulary Sheet', en: 'Sensei’s Chapter 19-1 Vocabulary Sheet' }, pattern: 'のぼります　とまります　かぶき　すもう　なっとう　いちど　はじめて　なんども', instruction: { ja: '最初に先生の十四語を原本の順で読みます。音声を聞く前に、意味や絵の答えを増やしません。', en: 'Read Sensei’s fourteen source rows in order first. Do not add meanings or picture answers before listening.' } },
                { title: { ja: '経験を聞く形', en: 'Asking about experience' }, pattern: 'Vたことがあります', instruction: { ja: 'B-21は「日本で どんな 経験を しましたか」という三つの絵の選択です。聞こえた経験に対応する印だけを選びます。', en: 'B-21 asks about three experiences in Japan. Choose only the marker that corresponds to the experience you hear.' } },
            ],
            prompts: prompts.map(([id, correctOptionId, reviewExpression], index) => ({ id, sourceQuestionId: `${SOURCE_PREFIX}:item-${index + 1}:audio-b21`, sourceOrder: (index + 1) as 1 | 2 | 3, correctOptionId, conceptId: `concept:l2-l02:b21-${id}`, errorTag: `l2-l02-b21-${id}`, reviewExpression })),
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: 'B-21の三つの経験を、先生の原本の絵と音声で確かめられました。', en: 'You matched all three B-21 experiences against Sensei’s original picture page and audio.' } },
                lapse: { explanation: { ja: '一つ以上の印がまだ別の絵にあります。', en: 'At least one stamp is still on a different picture.' }, repairPrompt: { ja: '先生の原本を見たままB-21をもう一度聞き、まちがえた場所だけを選び直しましょう。', en: 'Keep Sensei’s original page visible, replay B-21, and revise only the missed stop.' }, nearbyExample: { ja: 'Vたことがあります', en: 'Vたことがあります' } },
            },
        },
    };
    return Object.freeze({ id: 'sensei-experience-postcard-listening', narrative: { ja: 'アレックスが先生の経験の絵を三つの旅行の札にします。ジョディは、聞こえたことを先に決めつけず、一つずつ印を置きます。', en: 'Alex turns Sensei’s three experience pictures into travel stops. Jodi places one stamp at a time without deciding what was heard in advance.' }, activity: Object.freeze(activity) });
}

function sourceVisual(sourceId: string, payloadSha256: string, sha256: string, title: string, url: string) {
    return { sourceId, payloadSha256, title, url, sha256, alt: { ja: `Moodle 原本: ${title}`, en: `Moodle original: ${title}` } } as const;
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l02 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l02 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l2-l02 package identity.');
    const members = array(record(root.sourceCoverage, 'l2-l02 coverage').members, 'l2-l02 members').map((value, index) => record(value, `l2-l02 member ${index}`));
    for (const [sha256, title] of [[VOCABULARY_SHA256, 'Handouts from last lesson/Chapter 19-1 Vocabulary Sheet.pdf'], [LISTENING_SHA256, 'Handouts from last lesson/Chapter 19 listening .pdf'], [AUDIO_SHA256, 'audio materials/21 B-21.mp3']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === sha256);
        if (!member || member.title !== title) throw new TypeError(`Missing exact Lesson 27 Moodle source ${title}.`);
    }
    const vocabulary = array(root.components, 'l2-l02 components').map(value => record(value, 'l2-l02 component')).find(component => component.type === 'vocabulary');
    const rows = array(vocabulary?.items, 'l2-l02 vocabulary rows');
    if (rows.length !== 14 || rows.some((row, index) => record(row, `l2-l02 vocabulary row ${index}`).source === undefined)) throw new TypeError('Lesson 27 requires all fourteen exact Sensei vocabulary rows.');
    const activities = array(root.genkiInteractiveActivities, 'l2-l02 Genki activities').map(value => record(value, 'l2-l02 Genki activity'));
    if (!activities.some(activity => activity.id === 'genki-2e:l2-l02:lesson-11-grammar-4' && record(activity.source, 'l2-l02 Genki source').payloadSha256 === GENKI_SHA256)) throw new TypeError('Lesson 27 requires exact Genki Lesson 11 support metadata.');
    const mappings = array(record(root.provenance, 'l2-l02 provenance').sourceMappings, 'l2-l02 mappings').map(value => record(value, 'l2-l02 mapping'));
    if (!mappings.some(mapping => mapping.sourceId === 'source-minna-no-nihongo' && mapping.reference === 'Minna no Nihongo I, Lesson 19' && mapping.reuse === 'sequence-only')) throw new TypeError('Lesson 27 requires bounded Minna Lesson 19 chronology support.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Readonly<Record<string, unknown>>; }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
