import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { TypedResponseModel } from '../minigames';
import { LESSON_ZERO_KANA_SEQUENCE, LESSON_ZERO_SOURCE_MEDIA, LESSON_ZERO_SOURCE_PROVENANCE } from './lesson-zero-source-material';

export const LESSON_ZERO_VOWEL_DICTATION_ID = 'activity:lesson-zero-vowel-dictation';

/** Assessed N+1 after the source-led A-row teaching game: sound to written kana. */
export function createLessonZeroVowelDictation(): TypedResponseModel {
    const answer = LESSON_ZERO_KANA_SEQUENCE.map(item => item.kana).join('');
    return Object.freeze({
        id: LESSON_ZERO_VOWEL_DICTATION_ID,
        kind: 'academy-typed-response',
        sourceQuestionId: 'source-question:lesson-zero-hiragana-a-row',
        conceptIds: Object.freeze(LESSON_ZERO_KANA_SEQUENCE.map(item => `concept:kana:${item.id}`)),
        responseKind: 'kana-input',
        curriculumPhase: 'assessed-production',
        prompt: Object.freeze({
            ja: '五つの音を聞いて、同じ順番でひらがなを書いてください。',
            en: 'Listen to the five sounds and type the hiragana in the same order.',
        }),
        teachingSupport: Object.freeze({
            kind: 'example' as const,
            title: Object.freeze({ ja: '先に練習した五つの文字', en: 'The five characters you practised first' }),
            entries: Object.freeze([{ japanese: answer, reading: 'a i u e o', translation: 'the hiragana vowel row' }]),
        }),
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: Object.freeze({
            inputLabel: Object.freeze({ ja: '聞こえたひらがな', en: 'Hiragana you heard' }),
            audioTerms: Object.freeze(LESSON_ZERO_KANA_SEQUENCE.map(item => Object.freeze({ term: item.kana, reading: item.kana }))),
            acceptedAnswers: Object.freeze([answer]),
            errorTag: 'vowel-dictation-order',
            feedback: Object.freeze({
                pass: Object.freeze({ explanation: Object.freeze({ ja: '五つの音を、ひらがなで正しい順に書けました。', en: 'You wrote all five sounds in the correct hiragana order.' }) }),
                lapse: Object.freeze({
                    explanation: Object.freeze({ ja: '音と文字、または順番をもう一度確かめましょう。', en: 'Check the sound-to-character match or the order once more.' }),
                    repairPrompt: Object.freeze({ ja: '音声を一つずつ聞き、書道室で練習した五つの位置だけを直してください。', en: 'Replay one sound at a time and repair the five positions practised in the writing studio.' }),
                    nearbyExample: Object.freeze({ ja: '最初は「あ」です。', en: 'The first sound is あ.' }),
                }),
            }),
            reviewTargets: Object.freeze(LESSON_ZERO_KANA_SEQUENCE.map(item => Object.freeze({
                id: `review:lesson-zero:vowel-dictation:${item.id}`,
                conceptId: `concept:kana:${item.id}`,
                expression: item.kana,
                reading: item.kana,
                meanings: Object.freeze([`hiragana vowel ${item.romaji}`]),
            }))),
            source: Object.freeze({
                runtimeUrl: LESSON_ZERO_SOURCE_MEDIA.hiraganaARow,
                sha256: LESSON_ZERO_SOURCE_PROVENANCE.hiraganaARowSha256,
                locus: 'page 1',
                audioClaim: 'Yomu pronunciation playback; the Moodle page is not claimed to contain audio',
            }),
        }),
    });
}
