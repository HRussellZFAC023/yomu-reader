import type { AuthoredVocabularyAnnotation } from '../../reader/lookup/authored-vocabulary';
import type { ConstructedResponseActivityModel } from '../activities/constructed-response';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import {
    assertNoColdProduction,
    type AcademyLearningSequenceContract,
} from './cold-production-audit';

export const AAKASH_RAINY_DIRECTIONS_SCENE_ID = 'scene:aakash-rainy-directions';
export const AAKASH_DIRECTIONS_CONCEPT_ID = 'concept:directions-straight-right';

export const AAKASH_DIRECTIONS_CONTENT = {
    context: {
        id: 'aakash-directions:context',
        japanese: '雨ですね。Aakashはカフェを探しています。',
        translation: 'It is raining. Aakash is looking for the cafe.',
    },
    question: {
        id: 'aakash-directions:question',
        japanese: 'カフェはどこですか。',
        reading: 'kafee wa doko desu ka',
        translation: 'Where is the cafe?',
    },
    vocabulary: [
        { japanese: 'まっすぐ', reading: 'massugu', meaning: 'straight ahead' },
        { japanese: '行って', reading: 'itte', meaning: 'go, then...' },
        { japanese: '右', reading: 'migi', meaning: 'right' },
        { japanese: '左', reading: 'hidari', meaning: 'left' },
    ],
    vocabularyPrompt: {
        id: 'aakash-directions:vocabulary',
        japanese: 'まず、道順のことばを見てみましょう。',
        translation: 'First, learn the route words.',
    },
    recognition: {
        id: 'aakash-directions:recognise-right',
        japanese: 'カフェは右です。どちらが「右」ですか。',
        translation: 'The cafe is on the right. Which word means right?',
        options: [
            { id: 'right', japanese: '右', reading: 'migi', meaning: 'right', correct: true },
            { id: 'left', japanese: '左', reading: 'hidari', meaning: 'left', correct: false },
        ],
    },
    frame: {
        id: 'aakash-directions:frame',
        japanese: 'まっすぐ行って、左です。',
        reading: 'massugu itte, hidari desu',
        translation: 'Go straight, then it is on the left.',
        note: 'The umbrella stand is on the left. Put the path first, then the final side.',
    },
    guidedPractice: {
        id: 'aakash-directions:guided-frame',
        japanese: '傘立てまで案内しましょう。',
        translation: 'Guide someone to the umbrella stand: go straight, then it is on the left.',
        options: [
            {
                id: 'path-then-side',
                japanese: 'まっすぐ行って、左です。',
                reading: 'massugu itte, hidari desu',
                correct: true,
            },
            {
                id: 'side-then-path',
                japanese: '左です。まっすぐ行って。',
                reading: 'hidari desu. massugu itte',
                correct: false,
            },
        ],
    },
    assessment: {
        id: 'activity:aakash-rainy-directions',
        japanese: 'カフェはどこですか。',
        translation: 'Where is the cafe? Give the route in Japanese. You can ask for hints if typing is new.',
    },
    resolution: {
        id: 'aakash-directions:thanks',
        japanese: '分かりました。ありがとうございます。',
        translation: 'Got it. Thank you.',
    },
} as const;

export const AAKASH_DIRECTIONS_LEARNING_SEQUENCE = {
    id: 'sequence:aakash-rainy-directions',
    steps: [
        { id: AAKASH_DIRECTIONS_CONTENT.context.id, kind: 'context', conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID] },
        { id: AAKASH_DIRECTIONS_CONTENT.vocabularyPrompt.id, kind: 'instruction', conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID] },
        { id: AAKASH_DIRECTIONS_CONTENT.recognition.id, kind: 'guided-practice', conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID] },
        { id: AAKASH_DIRECTIONS_CONTENT.frame.id, kind: 'instruction', conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID] },
        { id: AAKASH_DIRECTIONS_CONTENT.guidedPractice.id, kind: 'guided-practice', conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID] },
        { id: AAKASH_DIRECTIONS_CONTENT.assessment.id, kind: 'assessed-production', conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID] },
    ],
} as const satisfies AcademyLearningSequenceContract;

assertNoColdProduction(AAKASH_DIRECTIONS_LEARNING_SEQUENCE);

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

/** Keep the original story binding, Concept, deterministic answers, and review seed stable. */
export function createAakashDirectionsActivity(): ConstructedResponseActivityModel {
    return {
        id: AAKASH_DIRECTIONS_CONTENT.assessment.id,
        kind: 'constructed-japanese',
        conceptIds: [AAKASH_DIRECTIONS_CONCEPT_ID],
        responseKind: 'ime',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            en: 'Give Aakash the cafe route in Japanese. Hints are available.',
            ja: 'Aakashに、カフェまでの道順を日本語で伝えてください。',
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
            hints: [
                {
                    text: {
                        en: 'Route words: まっすぐ (massugu) is “straight”; 右 (migi) is “right.”',
                        ja: '道順のことば：「まっすぐ」は straight、「右（みぎ）」は right です。',
                    },
                },
                {
                    text: {
                        en: 'Use the frame from the umbrella stand: まっすぐ + 行って、[side] + です。',
                        ja: '傘立てと同じ形です：「まっすぐ」＋「行って」、「向き」＋「です」。',
                    },
                },
                {
                    text: {
                        en: 'Complete route: まっすぐ行って、右です。 (massugu itte, migi desu.)',
                        ja: '道順は「まっすぐ行って、右です。」です。',
                    },
                    fillResponse: 'まっすぐ行って、右です。',
                },
            ],
        },
    };
}
