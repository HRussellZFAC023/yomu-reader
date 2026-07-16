import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { TypedResponseModel } from '../minigames/activity-kit';
import {
    MEGA_PACK_WRITING_SOURCE,
    megaPackBeat,
    type MegaPackActivityBeat,
} from './mega-pack-provenance';

const WRITING_MAPPING = Object.freeze({
    chapterId: 'mega-kana-01' as const,
    skills: Object.freeze(['kana-recognition', 'kana-production', 'reading']),
    jlpt: Object.freeze(['N5']),
    conceptIds: Object.freeze(['kana:hiragana-basic', 'kana:romaji-to-hiragana']),
});

export function createMegaPackWritingSystemBeats(): readonly MegaPackActivityBeat[] {
    return Object.freeze([
        kanaPrompt('aka-red', 'aka (red)', 'あか', 'red', 'lexeme:aka'),
        kanaPrompt('eki-station', 'eki (station)', 'えき', 'station', 'lexeme:eki'),
    ]);
}

function kanaPrompt(
    id: string,
    sourcePrompt: string,
    answer: string,
    meaning: string,
    lexemeConceptId: string,
): MegaPackActivityBeat {
    const conceptIds = [...WRITING_MAPPING.conceptIds, lexemeConceptId];
    const activity: TypedResponseModel = {
        id: `activity:mega-pack:kana:${id}`,
        kind: 'academy-typed-response',
        sourceQuestionId: `mega-pack-01:worksheet:p4:${id}`,
        conceptIds,
        responseKind: 'kana-input',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: `「${sourcePrompt}」をひらがなで書いてください。`,
            en: `Write ${sourcePrompt} in hiragana.`,
        },
        payload: {
            inputLabel: { ja: 'ひらがな', en: 'Hiragana answer' },
            acceptedAnswers: [answer],
            errorTag: `mega-pack-kana-${id}`,
            feedback: {
                pass: { explanation: { ja: `${sourcePrompt} は「${answer}」です。`, en: `${sourcePrompt} is ${answer}.` } },
                lapse: {
                    explanation: { ja: `ローマ字の音を一つずつ確認すると「${answer}」です。`, en: `Sound out each romanized mora: ${answer}.` },
                    repairPrompt: { ja: '母音と子音を一拍ずつひらがなに変えましょう。', en: 'Convert each mora to one hiragana at a time.' },
                    nearbyExample: { ja: `${sourcePrompt} → ${answer}`, en: `${meaning}: ${answer}` },
                },
            },
            reviewTargets: [{
                id: `review:mega-pack:kana:${id}`,
                conceptId: lexemeConceptId,
                expression: answer,
                reading: answer,
                meanings: [meaning],
            }],
        },
    };
    return megaPackBeat({
        id: `mega-pack-kana-${id}`,
        narrative: {
            ja: 'ワークシートのローマ字を読み、見本を見ずにひらがなを思い出します。',
            en: 'Read the worksheet romanization and retrieve its hiragana without a model answer.',
        },
        activity: Object.freeze(activity),
    }, MEGA_PACK_WRITING_SOURCE, {
        ...WRITING_MAPPING,
        conceptIds,
    });
}
