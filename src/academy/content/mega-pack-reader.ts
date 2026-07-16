import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { StoryReaderModel } from '../minigames/activity-kit';
import {
    MEGA_PACK_READER_SOURCE,
    megaPackBeat,
    type MegaPackActivityBeat,
} from './mega-pack-provenance';

const READER_CONCEPTS = Object.freeze([
    'folktale:momotarou',
    'grammar:hearsay-souna',
    'particle:destination-ni',
    'reading:narrative-sequence',
]);

export function createMegaPackReaderBeat(): MegaPackActivityBeat {
    const activity: StoryReaderModel = {
        id: 'activity:mega-pack:reader:momotarou-opening',
        kind: 'academy-story-reader',
        sourceQuestionId: 'mega-pack-05:momotarou:pdf-pages-3-4',
        conceptIds: READER_CONCEPTS,
        responseKind: 'extended-reading-checkpoint',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: '「ももたろう」のはじまりを読み、三つの質問に答えてください。',
            en: 'Read the opening of Momotarou, then answer three checkpoints.',
        },
        payload: {
            title: { ja: 'ももたろう', en: 'Momotarou' },
            sections: [
                {
                    id: 'the-old-couple',
                    paragraphs: [
                        'むかし。あるところに じさまと ばさまが おったそうな。',
                        'ある日 じさま 山へ しば かりに ばさま 川へ せんたくに いったと。',
                    ],
                },
                {
                    id: 'the-peach',
                    paragraphs: [
                        'すると。川から 大きな もも どんぶら こっこ どんぶら こっこ ながれて きたんだと。',
                        'ばさま そのもも ひろいあげ だいじに かかえて うちへ かえると 戸だなの なかに しまったそうな。',
                    ],
                },
            ],
            questions: [
                {
                    id: 'river',
                    prompt: { ja: '川へ行ったのはだれですか。', en: 'Who went to the river?' },
                    options: [{ id: 'old-woman', label: 'ばさま' }, { id: 'old-man', label: 'じさま' }, { id: 'momotarou', label: 'ももたろう' }],
                    correctOptionId: 'old-woman',
                    errorTag: 'mega-pack-reader-river-agent',
                },
                {
                    id: 'floating',
                    prompt: { ja: '川から何がながれてきましたか。', en: 'What floated down the river?' },
                    options: [{ id: 'peach', label: '大きな もも' }, { id: 'wood', label: 'しば' }, { id: 'basket', label: 'せんたくかご' }],
                    correctOptionId: 'peach',
                    errorTag: 'mega-pack-reader-floating-object',
                },
                {
                    id: 'stored',
                    prompt: { ja: 'ばさまはももをどこにしまいましたか。', en: 'Where did the old woman put the peach?' },
                    options: [{ id: 'cupboard', label: '戸だなの なか' }, { id: 'river', label: '川の なか' }, { id: 'mountain', label: '山の なか' }],
                    correctOptionId: 'cupboard',
                    errorTag: 'mega-pack-reader-storage-place',
                },
            ],
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '人・もの・場所を正しく追えました。', en: 'You tracked the people, object, and place correctly.' } },
                lapse: {
                    explanation: { ja: '出来事の順番と助詞「へ」「から」「に」をもう一度確認しましょう。', en: 'Recheck the event order and the particles へ, から, and に.' },
                    repairPrompt: { ja: '各文で「だれが・何を・どこへ」を探してください。', en: 'Find who, what, and where in each sentence.' },
                    nearbyExample: { ja: 'ばさま 川へ せんたくに いったと。', en: 'The old woman went to the river to wash clothes.' },
                },
            },
            reviewTargets: [{
                id: 'review:mega-pack:reader:momotarou-peach',
                conceptId: 'folktale:momotarou',
                expression: 'もも',
                reading: 'もも',
                meanings: ['peach'],
                sentence: '川から 大きな もも ながれて きたんだと。',
            }],
        },
    };
    return megaPackBeat({
        id: 'mega-pack-reader-momotarou-opening',
        narrative: {
            ja: '絵本の最初の二場面です。古い語り口でも、人物と移動を示すことばを手がかりに読みます。',
            en: 'These are the first two story scenes. Use people and movement cues to follow the older folktale register.',
        },
        activity: Object.freeze(activity),
    }, MEGA_PACK_READER_SOURCE, {
        chapterId: 'mega-reader-01',
        skills: ['extended-reading', 'reading-comprehension', 'vocabulary-in-context'],
        jlpt: ['N4', 'N3'],
        conceptIds: READER_CONCEPTS,
    });
}
