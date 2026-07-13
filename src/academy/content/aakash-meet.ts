import type { AuthoredVocabularyAnnotation } from '../../reader/lookup/authored-vocabulary';
import type { ConstructedResponseActivityModel } from '../activities/constructed-response';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';

export const AAKASH_RAINY_DIRECTIONS_SCENE_ID = 'scene:aakash-rainy-directions';

// Both 行く and 行う legitimately deinflect from 行って. This route owns the
// intended sense, so it declares the disambiguation instead of teaching the
// general Reader a linguistically false homograph heuristic.
export const AAKASH_DIRECTIONS_READER_ANNOTATIONS = [{
    surface: '行って',
    lemma: '行く',
    reading: 'いって',
    pitch: {
        pattern: 'LHHH',
        source: 'Jiten vocabulary 1578850/0 (行く pitch 0); Academy te-form surface reading',
    },
}] as const satisfies readonly AuthoredVocabularyAnnotation[];

/**
 * The original story binding, Concept, review seed, and taught expression stay
 * stable. Only the response surface changes from recognition to production.
 */
export function createAakashDirectionsActivity(): ConstructedResponseActivityModel {
    return {
        id: 'activity:aakash-rainy-directions',
        kind: 'constructed-japanese',
        conceptIds: ['concept:directions-straight-right'],
        responseKind: 'ime',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            en: 'Answer Aakash in Japanese.',
            ja: 'Aakashに、日本語で道を案内してください。',
        },
        payload: {
            acceptedAnswers: [
                'この道をまっすぐ行って、右です。',
                'このみちをまっすぐいって、みぎです。',
                'まっすぐ行って、右です。',
                'まっすぐいって、みぎです。',
            ],
            passFeedback: {
                en: 'Aakash has the route.',
                ja: 'Aakashに道順が伝わりました。',
            },
            lapseFeedback: {
                errorTag: 'direction-path-confusion',
                contrast: {
                    en: 'The route must take him straight ahead and finish on the right.',
                    ja: '道順は、まっすぐ進んで、最後は右です。',
                },
                repairPrompt: {
                    en: 'Use まっすぐ行って for the path, then finish with 右です.',
                    ja: '道は「まっすぐ行って」、最後は「右です」で伝えてください。',
                },
                nearbyExample: {
                    en: 'Check the final side: 右 is right; 左 is left.',
                    ja: '最後の向きを確認しましょう。「右」は右側、「左」は左側です。',
                },
            },
            lapseDiagnostics: [{
                responseIncludesAny: ['左', 'ひだり'],
                feedback: {
                    errorTag: 'direction-side-confusion',
                    contrast: {
                        en: 'The path is straight, but the cafe is on the right, not the left.',
                        ja: 'まっすぐ進むところは合っていますが、カフェは左ではなく右です。',
                    },
                    repairPrompt: {
                        en: 'Keep the route and replace 左 with 右.',
                        ja: '道順は残して、「左」を「右」に変えてください。',
                    },
                    nearbyExample: {
                        en: '右 is right; 左 is left.',
                        ja: '「右」は右側、「左」は左側です。',
                    },
                },
            }],
            reviewSeedId: 'review:aakash-rainy-directions',
            reviewContent: {
                expression: 'まっすぐ行って、右です。',
                reading: 'まっすぐいって、みぎです',
                meanings: ['Go straight, then it is on the right.'],
                sentence: 'この道をまっすぐ行って、右です。',
            },
        },
    };
}
