import lessonPackage from '../../../public/academy/content/lessons/004-l1-l03.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    MoodleListeningChoiceModel,
    MoodleListeningChoicePrompt,
    MoodleListeningChoiceTrack,
} from '../minigames/moodle-listening-choice';

const PACKAGE_ID = 'l1-l03';
const MODULE_ID = 5804931;
const HANDOUT_SHA256 = 'b694cbef8eb74e1c59120effde033a49d886be29ea0efcbe940fb4b460ec9095';
const NAME_AUDIO_SHA256 = 'b601a7681c2ff12d68f4e8bf769319b855f0570dec6a5cfb14e3ee722bed7444';
const COUNTRY_AUDIO_SHA256 = '4fac34dc313c88ab75c802462f98f80530831faa93f3a3d0736134f24060573c';
const SOURCE_IMAGE_SHA256 = '6c6b2dd4436da26a0c7d51021cd843b41b90e83e0b493d7480df3cb2955aedc9';
const GENKI_PAYLOAD_SHA256 = '341b1eca3ef498d9c5890601ef4dd5965478675e97fa7dc3a9012bbdd7b292cd';

export function createLessonThreeMoodleListeningModel(): MoodleListeningChoiceModel {
    assertExactSources();
    const tracks: readonly MoodleListeningChoiceTrack[] = Object.freeze([
        track('names', '1 A-1', NAME_AUDIO_SHA256, '/academy/content/lessons/l1-l03/moodle-1-a-1.mp3', 45.88, [
            prompt('sano', 'なまえは a ですか、b ですか。', 'さの', 'さろ', 'a'),
            prompt('suzuki', 'なまえは a ですか、b ですか。', 'すずき', 'つづき', 'a'),
            prompt('kudo', 'なまえは a ですか、b ですか。', 'ぐとう', 'くどう', 'b'),
        ]),
        track('countries', '2 A-2', COUNTRY_AUDIO_SHA256, '/academy/content/lessons/l1-l03/moodle-2-a-2.mp3', 75.453333, [
            prompt('sen', 'くには a ですか、b ですか。', 'インド', 'インドネシア', 'a'),
            prompt('jan', 'くには a ですか、b ですか。', 'ブラジル', 'フランス', 'b'),
            prompt('koru', 'くには a ですか、b ですか。', 'インド', 'ドイツ', 'b'),
        ]),
    ]);
    const model: MoodleListeningChoiceModel = {
        id: 'activity:l1-l03-moodle-listening-a-or-b',
        kind: 'academy-moodle-listening-choice',
        responseKind: 'moodle-audio-a-or-b-choice',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tracks.flatMap(track => track.prompts.map(prompt => prompt.conceptId)),
        prompt: {
            ja: '先生の音声を聞いて、ワークシートのAかBを選びましょう。',
            en: 'Listen to the teacher audio, then choose A or B from the worksheet.',
        },
        provenance: {
            packageId: 'l1-l03',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                handout: {
                    sourceId: `moodle-payload:${HANDOUT_SHA256}`,
                    payloadSha256: HANDOUT_SHA256,
                    title: 'Chapter 1 listening',
                    locus: { page: 1, sections: [1, 2] },
                },
                sourceImage: {
                    url: '/academy/content/lessons/l1-l03/moodle-chapter-1-listening-page-1.png',
                    sha256: SOURCE_IMAGE_SHA256,
                    alt: {
                        ja: 'Chapter 1 listeningの1ページ目。名前と国を聞いてAかBを選ぶ三問ずつ、例、国旗、地図、人物イラストがある。',
                        en: 'Chapter 1 listening page 1: three A-or-B name prompts and three country prompts, with worked examples, flags, maps, and people illustrations.',
                    },
                },
                answerKeyBasis: 'source-audio-verified-selections',
            },
            support: {
                phase: 'after-moodle-listening',
                minna: { reference: 'Minna no Nihongo I, Lesson 1', reuse: 'sequence-only' },
                genki: {
                    sourceId: `japanese-genki-interactive:${GENKI_PAYLOAD_SHA256}:generateQuiz`,
                    relation: 'post-instruction-supported-transfer',
                },
            },
        },
        payload: {
            teaching: [
                {
                    title: { ja: '名前を聞く', en: 'Listen for a name' },
                    instruction: {
                        ja: 'ワークシートの「なまえは a ですか、b ですか」を先に見て、二つの名前の違いを確認します。',
                        en: 'First inspect the worksheet frame, なまえは a ですか、b ですか, and notice the two names that differ.',
                    },
                    pattern: 'なまえは a ですか、b ですか。',
                },
                {
                    title: { ja: '国を聞く', en: 'Listen for a country' },
                    instruction: {
                        ja: '次に「くには a ですか、b ですか」を見て、音声の「からきました」を聞きます。',
                        en: 'Then inspect くには a ですか、b ですか and listen for the country before からきました.',
                    },
                    pattern: 'くには a ですか、b ですか。',
                },
            ],
            sourceCaption: {
                ja: '先生の原資料: Chapter 1 listening、1ページ目。下の音声1 A-1と2 A-2を聞いてから、同じA/B選択を完成させます。',
                en: 'Teacher source: Chapter 1 listening, page 1. Listen to original tracks 1 A-1 and 2 A-2 below, then complete the same A/B choices.',
            },
            tracks,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '名前と国の六つの聞き取りが、先生の音声と合いました。',
                        en: 'All six name and country choices match the teacher audio.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '聞き取りと違うA/Bがあります。音声をもう一度聞いて、ワークシートの二つの選択肢を比べましょう。',
                        en: 'At least one A/B choice differs from the audio. Listen again and compare the two worksheet options.',
                    },
                    repairPrompt: {
                        ja: '間違えた行だけ、名前か国の二つの選択肢を聞き分けましょう。',
                        en: 'For each missed row, distinguish only the two name or country choices.',
                    },
                    nearbyExample: {
                        ja: '例: ワンさんは ちゅうごくから きました。',
                        en: 'Example: Mr Wang came from China.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

function track(
    id: MoodleListeningChoiceTrack['id'],
    sourceTitle: string,
    payloadSha256: string,
    url: string,
    durationSeconds: number,
    prompts: readonly MoodleListeningChoicePrompt[],
): MoodleListeningChoiceTrack {
    const result: MoodleListeningChoiceTrack = {
        id,
        title: { ja: `${sourceTitle} を聞く`, en: `Listen: ${sourceTitle}` },
        audio: {
            sourceId: `moodle-payload:${payloadSha256}`,
            payloadSha256,
            url,
            durationSeconds,
            transcriptStatus: 'not-provided-do-not-invent',
        },
        prompts,
    };
    return Object.freeze(result);
}

function prompt(
    id: string,
    question: string,
    optionA: string,
    optionB: string,
    correctOptionId: 'a' | 'b',
): MoodleListeningChoicePrompt {
    const trackId = ['sano', 'suzuki', 'kudo'].includes(id) ? '1-a-1' : '2-a-2';
    const options: readonly MoodleListeningChoicePrompt['options'][number][] = Object.freeze([
        { id: 'a', label: optionA },
        { id: 'b', label: optionB },
    ]);
    const result: MoodleListeningChoicePrompt = {
        id,
        sourceQuestionId: `moodle:5804931:chapter-1-listening:p1:${trackId}:${id}`,
        prompt: question,
        options,
        correctOptionId,
        conceptId: `concept:l1-l03:moodle-listening:${id}`,
        errorTag: `l1-l03-moodle-listening-${id}`,
    };
    return Object.freeze(result);
}

function assertExactSources(): void {
    const root = record(lessonPackage, 'l1-l03 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l03 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l03 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l1-l03 coverage').members, 'l1-l03 members')
        .map((value, index) => record(value, `l1-l03 member ${index}`));
    for (const [payloadSha256, title] of [
        [HANDOUT_SHA256, 'Chapter 1 listening'],
        [NAME_AUDIO_SHA256, '1 A-1'],
        [COUNTRY_AUDIO_SHA256, '2 A-2'],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (matches.length !== 1 || exactText(matches[0].title, `${payloadSha256} title`) !== title) {
            throw new TypeError(`Expected one exact l1-l03 Moodle listening source for ${payloadSha256}.`);
        }
    }
    const provenance = record(root.provenance, 'l1-l03 provenance');
    const minna = array(provenance.sourceMappings, 'l1-l03 mappings').map((value, index) => record(value, `l1-l03 mapping ${index}`))
        .filter(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (minna.length !== 1 || exactText(minna[0].reference, 'l1-l03 Minna reference') !== 'Minna no Nihongo I · Lesson 1'
        || exactText(minna[0].reuse, 'l1-l03 Minna reuse') !== 'sequence-only') {
        throw new TypeError('Expected mapped Minna Lesson 1 sequence support.');
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l03 Genki activities').map((value, index) => record(value, `l1-l03 Genki activity ${index}`));
    const genki = activities.filter(activity => activity.id === 'genki-2e:l1-l03:lesson-1-workbook-7');
    if (genki.length !== 1 || exactText(genki[0].relation, 'l1-l03 Genki relation') !== 'post-instruction-supported-transfer'
        || record(genki[0].source, 'l1-l03 Genki source').payloadSha256 !== GENKI_PAYLOAD_SHA256) {
        throw new TypeError('Expected mapped Genki post-instruction support.');
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

function exactText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}
