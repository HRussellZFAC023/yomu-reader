import lessonPackage from '../../../public/academy/content/lessons/023-l1-l22.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { KatakanaShapeRelayModel } from '../minigames/katakana-shape-relay';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l22';
const MODULE_ID = 5489603;
const LIST_SHA256 = '95f08c8d50b1f64902f707339c48c456157e085249f1bda4b788271302029350';
const WRITING_SHA256 = '5f76dbe42ed8c5643a76bd6b9382eec83c9664778fca13540690918c5f8531dd';
const LIST_PAGE_SHA256 = '5605d67fd4553c40ab8b41ec40a8302791219964683fff435b4f08684342b038';
const WRITING_PAGE_SHA256 = 'e7f953396daf44afdcd70bdcab08904280270a8029ea5f2073076e53a092e417';
const GENKI_SHA256 = '9cd748533a1d67337b7b1c089a36ff72081f22d077b3305ce4c33629d308f20f';

const ROUNDS = [
    ['u', 'ウ', 3],
    ['a', 'ア', 1],
    ['o', 'オ', 5],
    ['i', 'イ', 2],
    ['e', 'エ', 4],
] as const;

export function createLessonTwentyTwoKatakanaShapeRelayBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = ROUNDS.map(([id, kana, sourcePosition], index) => Object.freeze({
        id: `sensei-katakana-vowel-${id}`,
        sourceCellId: `moodle:5489603:katakana-writing-system:p1:basic-katakana:row-1:cell-${sourcePosition}`,
        kana,
        conceptId: `concept:l1-l22:katakana-vowel:${id}`,
        reviewSeedId: `review:l1-l22:katakana-vowel:${id}`,
        errorTag: `l1-l22-katakana-vowel-${id}`,
        relayOrder: index + 1,
    }));
    const activity: KatakanaShapeRelayModel = {
        id: 'activity:l1-l22-sensei-katakana-shape-relay',
        kind: 'academy-katakana-shape-relay',
        responseKind: 'katakana-audio-relay-placement',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生のカタカナ表を見てから、聞こえた音を五つのリレー台に置きましょう。',
            en: 'Study Sensei’s katakana charts first, then place each heard sound at its relay station.',
        },
        payload: {
            teaching: [
                {
                    sourceLabel: 'Moodle - Katakana writing system completed, page 1',
                    pattern: 'ア　イ　ウ　エ　オ',
                    explanation: {
                        ja: '最初の行は、ア・イ・ウ・エ・オです。形と音を一つずつ対応させます。',
                        en: 'The first row is ア, イ, ウ, エ, オ. Match each shape with one sound at a time.',
                    },
                },
                {
                    sourceLabel: 'Moodle - katakana list with Hiragana + Romanji, page 1',
                    pattern: 'Katakana / Hiragana / Roman-ji',
                    explanation: {
                        ja: '二つの先生の表は、同じカタカナの行を別の見え方で示します。答える前に両方を見比べます。',
                        en: 'Sensei’s two charts show the same katakana row in different formats. Compare both before answering.',
                    },
                },
            ],
            sourceVisuals: [
                {
                    url: '/academy/content/lessons/l1-l22/moodle-katakana-writing-basic-page-1.png',
                    sha256: WRITING_PAGE_SHA256,
                    label: { ja: 'Moodle原本: Katakana writing system completed - 1ページ', en: 'Moodle original: Katakana writing system completed - page 1' },
                },
                {
                    url: '/academy/content/lessons/l1-l22/moodle-katakana-list-page-1.png',
                    sha256: LIST_PAGE_SHA256,
                    label: { ja: 'Moodle原本: katakana list with Hiragana + Romanji - 1ページ', en: 'Moodle original: katakana list with Hiragana + Romanji - page 1' },
                },
            ],
            audioSupport: {
                provider: 'canonical-yomu-pronunciation-service',
                sourceAudioStatus: 'not-present-in-moodle-archive',
                role: 'post-instruction-runtime-pronunciation-support',
            },
            supportReferences: {
                minna: {
                    reference: 'Minna no Nihongo I, Katakana strand',
                    role: 'chronology-map-only',
                },
                genki: {
                    taskId: 'genki-2e:l1-l22:lesson-2-literacy-wb-1',
                    payloadSha256: GENKI_SHA256,
                    lineLocus: [76, 93],
                    role: 'post-instruction-writing-subset-support-only',
                },
            },
            rounds,
            passScore: 1,
            stationLabel: { ja: '音のリレー台を選んで、聞き直しましょう。', en: 'Choose a relay station to hear its sound.' },
            tileLabel: { ja: '聞こえた音のカタカナ札を置きましょう。', en: 'Place the katakana tile for the sound you heard.' },
            feedback: {
                pass: {
                    explanation: { ja: '五つの音を、先生の最初のカタカナ行の形に正しくつなげました。', en: 'You connected all five sounds to the shapes in Sensei’s first katakana row.' },
                },
                lapse: {
                    explanation: { ja: '一つ以上の音と形がまだ合っていません。', en: 'At least one sound and shape do not match yet.' },
                    repairPrompt: { ja: 'まちがえた台をもう一度押し、先生の表の最初の行だけを見て、札を置き直しましょう。', en: 'Press the missed station again, look only at the first row of Sensei’s chart, and replace its tile.' },
                    nearbyExample: { ja: 'ア　イ　ウ　エ　オ', en: 'ア　イ　ウ　エ　オ' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-katakana-shape-relay',
        narrative: {
            ja: 'りえ先生が二枚のカタカナ表を机に並べ、ミカが五つのリレー台の音を一つずつ確かめます。聞こえた音を急いで英語にせず、形の札に戻します。',
            en: 'Rie places two katakana charts on the table while Mika checks the five relay sounds one at a time. The heard sound returns to a shape tile before anyone jumps to English.',
        },
        activity: Object.freeze(activity),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l22 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l22 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l22 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l1-l22 coverage').members, 'l1-l22 members')
        .map((value, index) => record(value, `l1-l22 member ${index}`));
    for (const [payloadSha256, title] of [
        [LIST_SHA256, 'katakana list with Hiragana + Romanji'],
        [WRITING_SHA256, 'Katakana writing system completed'],
    ] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || member.title !== title) throw new TypeError(`Missing exact l1-l22 Moodle source ${title}.`);
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l22 Genki activities')
        .map((value, index) => record(value, `l1-l22 Genki activity ${index}`));
    const genki = activities.find(activity => activity.id === 'genki-2e:l1-l22:lesson-2-literacy-wb-1');
    if (!genki || record(genki.source, 'l1-l22 Genki source').payloadSha256 !== GENKI_SHA256) {
        throw new TypeError('Lesson 22 requires its exact Genki ア-オ writing support.');
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
