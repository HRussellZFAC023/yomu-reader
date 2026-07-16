import lessonPackage from '../../../public/academy/content/lessons/032-l2-l05.json';
import priorLessonPackage from '../../../public/academy/content/lessons/031-l2-l04.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ListeningHingeModel } from '../minigames/listening-hinge';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l05';
const MODULE_ID = 6974651;
const VOCABULARY_SHA256 = 'b2835af1a2c829c0c1827ca1cf4518e0f58e05c2219aa59a5f1d64d5aacb8128';
const LISTENING_SHEET_SHA256 = 'a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd';
const AUDIO_SHA256 = 'f39560e74390378765a07f94dd19d1d4f0595935dbef04ffebcf37b10e485df2';
const GENKI_SHA256 = '510418850a44517faf16d384412b5cc90f653bfe7426063cdf616723d4c62f55';
const VOCABULARY_IMAGE_SHA256 = '0981cc1579d4cde558ecec3f68dc385e72cc50a09fee38c7d54e36aa1edd6e5c';
const LISTENING_IMAGE_SHA256 = 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${LISTENING_SHEET_SHA256}:pdf-p1:b24-listening-hinge`;

export function createLessonThirtyListeningHingeBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const prompts = [['hanami', 'left', '日曜日 花見に 行きます。'], ['cooking', 'right', '料理を 手伝いません。'], ['bakery', 'right', 'パン屋へ 行きます。']] as const;
    const activity: ListeningHingeModel = {
        id: 'activity:l2-l05-sensei-b24-listening-hinge', kind: 'academy-listening-hinge', responseKind: 'moodle-b24-listening-hinge', curriculumPhase: 'assessed-recognition', answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: prompts.map(([id]) => `concept:l2-l05:b24-${id}`),
        prompt: { ja: '先生の Chapter 20-2 の語彙と B-24 のページを見てから、音声を聞きます。三つのヒンジを、聞こえた選択の左右へ動かしましょう。', en: 'Study Sensei’s Chapter 20-2 vocabulary and B-24 page, then hear the audio. Set each of three hinges to the side of the choice you hear.' },
        provenance: {
            packageId: PACKAGE_ID, answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                vocabularySheet: sourceVisual(`moodle:${VOCABULARY_SHA256}:page:1`, VOCABULARY_SHA256, VOCABULARY_IMAGE_SHA256, 'Handouts/New_Chapter 20-2 Vocabulary Sheet.pdf', '/academy/content/lessons/l2-l05/moodle-chapter-20-2-vocabulary-page-1.png'),
                listeningSheet: sourceVisual(`moodle:${LISTENING_SHEET_SHA256}:page:1`, LISTENING_SHEET_SHA256, LISTENING_IMAGE_SHA256, 'Handouts/Chapter 20 listening .pdf', '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png'),
                audio: { sourceId: `moodle:${AUDIO_SHA256}:audio`, payloadSha256: AUDIO_SHA256, url: '/academy/content/lessons/l2-l05/moodle-b-24.mp3', durationSeconds: 82.56, transcriptStatus: 'audio-reviewed-b24-choice-pairing-hidden-until-attempt' },
                answerKeyBasis: 'source-worksheet-prompts-and-audio-reviewed-b24-choices',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I, Lesson 20', reuse: 'sequence-only' },
                genki: { sourceId: `japanese-genki-interactive:${GENKI_SHA256}`, payloadSha256: GENKI_SHA256, relation: 'prior-short-form-context-only-no-genki-task-shown' },
            },
        },
        payload: {
            teaching: [
                { title: { ja: '先生の Chapter 20-2 Vocabulary Sheet', en: 'Sensei’s Chapter 20-2 Vocabulary Sheet' }, pattern: 'よかったら　いろいろ　ぼく　うん　ううん', instruction: { ja: '最初に先生の語彙シートをそのまま見ます。B-24の選択は、音声を聞くまで決めません。', en: 'Start with Sensei’s vocabulary sheet as it is. Do not decide the B-24 choices before listening.' } },
                { title: { ja: '先生の B-24 のページ', en: 'Sensei’s B-24 page' }, pattern: '〜ます / 〜ません', instruction: { ja: 'ページの左右の選択を見たまま、音声で小林君がすること・しないことを確かめます。', en: 'Keep the page’s left and right choices visible while checking what Kobayashi does and does not do in the audio.' } },
            ],
            prompts: prompts.map(([id, correctOptionId, reviewExpression], index) => ({ id, correctOptionId, reviewExpression, sourceQuestionId: `${SOURCE_PREFIX}:hinge-${index + 1}`, sourceOrder: (index + 1) as 1 | 2 | 3, conceptId: `concept:l2-l05:b24-${id}`, errorTag: `l2-l05-b24-${id}` })),
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: 'B-24の三つの選択を、先生のページと原音声で確かめられました。', en: 'You checked all three B-24 choices against Sensei’s page and original audio.' } },
                lapse: { explanation: { ja: '一つ以上のヒンジが、聞こえた選択と反対側にあります。', en: 'At least one hinge is on the opposite side from the choice you heard.' }, repairPrompt: { ja: '先生の B-24 のページを見たまま、音声をもう一度聞き、まちがえたヒンジだけを動かしましょう。', en: 'Keep Sensei’s B-24 page visible, replay the audio, and move only the missed hinge.' }, nearbyExample: { ja: '〜ます / 〜ません', en: 'does / does not' } },
            },
        },
    };
    return Object.freeze({ id: 'sensei-b24-listening-hinge', narrative: { ja: 'アレックスが先生のB-24の選択を三つのヒンジにします。トムは、どちらの文かを先に言わず、聞こえた側だけを選ぶようにします。', en: 'Alex turns Sensei’s B-24 choices into three hinges. Tom keeps the wording unspoken and asks the learner to choose only the side they hear.' }, activity: Object.freeze(activity) });
}

function sourceVisual(sourceId: string, payloadSha256: string, sha256: string, title: string, url: string) { return { sourceId, payloadSha256, title, url, sha256, alt: { ja: `Moodle 原本: ${title}`, en: `Moodle original: ${title}` } } as const; }
function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l05 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l05 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l2-l05 package identity.');
    const members = array(record(root.sourceCoverage, 'l2-l05 coverage').members, 'l2-l05 members').map(value => record(value, 'l2-l05 member'));
    for (const [sha256, title] of [[VOCABULARY_SHA256, 'Handouts/New_Chapter 20-2 Vocabulary Sheet.pdf'], [LISTENING_SHEET_SHA256, 'Handouts/Chapter 20 listening .pdf'], [AUDIO_SHA256, 'audio materials/B-24.mp3']] as const) { const member = members.find(candidate => candidate.payloadSha256 === sha256); if (!member || member.title !== title) throw new TypeError(`Missing exact Lesson 30 Moodle source ${title}.`); }
    const activities = array(record(priorLessonPackage, 'l2-l04 package').genkiInteractiveActivities, 'l2-l04 Genki activities').map(value => record(value, 'l2-l04 Genki activity'));
    if (!activities.some(activity => activity.id === 'genki-2e:l2-l04:lesson-9-grammar-1' && record(activity.source, 'l2-l04 Genki source').payloadSha256 === GENKI_SHA256)) throw new TypeError('Lesson 30 requires bounded prior Genki short-form context.');
}
function record(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Readonly<Record<string, unknown>>; }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
