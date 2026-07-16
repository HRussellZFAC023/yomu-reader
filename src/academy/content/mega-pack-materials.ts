import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { TypedResponseModel } from '../minigames/activity-kit';
import {
    MEGA_PACK_MATERIALS_SOURCE,
    megaPackBeat,
    type MegaPackActivityBeat,
} from './mega-pack-provenance';

export function createMegaPackMaterialsBeats(): readonly MegaPackActivityBeat[] {
    return Object.freeze([
        typedMaterial({
            id: 'topic-particle-wa',
            conceptIds: ['particle:wa'],
            prompt: {
                ja: '「wa」と読み、話題を示すひらがなの助詞を一文字で入力してください。',
                en: 'Type the one-character hiragana particle pronounced wa that marks a topic.',
            },
            acceptedAnswers: ['は'],
            expression: 'は',
            meanings: ['topic particle, pronounced wa'],
            pass: { ja: '助詞の「は」は「wa」と読みます。', en: 'The particle は is pronounced wa.' },
        }),
        typedMaterial({
            id: 'student-example',
            conceptIds: ['particle:wa', 'syntax:topic-comment'],
            prompt: {
                ja: '教材の例文「I am a student」を日本語で入力してください。',
                en: 'Type the source example meaning “I am a student” in Japanese.',
            },
            acceptedAnswers: ['わたし は がくせい です。', 'わたしはがくせいです。'],
            expression: 'わたし は がくせい です。',
            meanings: ['I am a student.'],
            pass: { ja: '「わたし」は話題、「がくせいです」はその説明です。', en: 'わたし is the topic; がくせいです describes it.' },
        }),
    ]);
}

interface MaterialInput {
    readonly id: string;
    readonly conceptIds: readonly string[];
    readonly prompt: Readonly<{ ja: string; en: string }>;
    readonly acceptedAnswers: readonly string[];
    readonly expression: string;
    readonly meanings: readonly string[];
    readonly pass: Readonly<{ ja: string; en: string }>;
}

function typedMaterial(input: MaterialInput): MegaPackActivityBeat {
    const activity: TypedResponseModel = {
        id: `activity:mega-pack:materials:${input.id}`,
        kind: 'academy-typed-response',
        sourceQuestionId: `mega-pack-08:particle-cheatsheet:p1:${input.id}`,
        conceptIds: input.conceptIds,
        responseKind: 'kana-input',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: input.prompt,
        payload: {
            inputLabel: { ja: '日本語の答え', en: 'Japanese answer' },
            acceptedAnswers: input.acceptedAnswers,
            errorTag: `mega-pack-materials-${input.id}`,
            feedback: {
                pass: { explanation: input.pass },
                lapse: {
                    explanation: { ja: '助詞の読み方と、話題・説明の順番を確認しましょう。', en: 'Check the particle reading and the topic-then-description order.' },
                    repairPrompt: { ja: '話題の直後に、助詞「は」を置きます。', en: 'Place the topic particle immediately after the topic.' },
                    nearbyExample: { ja: 'わたし は がくせい です。', en: 'I am a student.' },
                },
            },
            reviewTargets: [{
                id: `review:mega-pack:materials:${input.id}`,
                conceptId: input.conceptIds[0],
                expression: input.expression,
                meanings: input.meanings,
                ...(input.id === 'student-example' ? { sentence: input.expression } : {}),
            }],
        },
    };
    return megaPackBeat({
        id: `mega-pack-materials-${input.id}`,
        narrative: {
            ja: '一枚の助詞資料から、読むだけでなく自分で取り出せる知識に変えます。',
            en: 'Turn a one-page particle reference into knowledge you can retrieve, not just recognize.',
        },
        activity: Object.freeze(activity),
    }, MEGA_PACK_MATERIALS_SOURCE, {
        chapterId: 'mega-materials-01',
        skills: ['grammar', 'kana-production', 'sentence-construction'],
        jlpt: ['N5'],
        conceptIds: input.conceptIds,
    });
}
