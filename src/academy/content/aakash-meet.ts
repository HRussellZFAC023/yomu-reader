import type { ChoiceActivityModel } from '../activities/choice';

export const AAKASH_RAINY_DIRECTIONS_SCENE_ID = 'scene:aakash-rainy-directions';

export function createAakashDirectionsActivity(): ChoiceActivityModel {
    return {
        id: 'activity:aakash-rainy-directions',
        kind: 'choice',
        conceptIds: ['concept:directions-straight-right'],
        responseKind: 'choice',
        prompt: {
            en: 'Aakash asks: 「カフェはどこですか。」 The cafe is straight ahead, then right. What do you say?',
            ja: 'アーカーシュさんが「カフェはどこですか」と聞きました。カフェはまっすぐ行って、右です。何と言いますか。',
        },
        payload: {
            reviewSeedId: 'review:aakash-rainy-directions',
            reviewContent: {
                expression: 'まっすぐ行って、右です。',
                reading: 'まっすぐいって、みぎです',
                meanings: ['Go straight, then it is on the right.'],
                sentence: 'この道をまっすぐ行って、右です。',
            },
            options: [
                {
                    id: 'straight-right',
                    label: {
                        en: 'Go straight along this road; it is on the right.',
                        ja: 'この道をまっすぐ行って、右です。',
                    },
                    correct: true,
                    explanation: {
                        en: 'Exactly: まっすぐ gives the path, and 右 gives the final side.',
                        ja: 'そのとおりです。「まっすぐ」で道順を示し、「右」で最後の位置を示します。',
                    },
                },
                {
                    id: 'straight-left',
                    label: {
                        en: 'Go straight along this road; it is on the left.',
                        ja: 'この道をまっすぐ行って、左です。',
                    },
                    correct: false,
                    errorTag: 'direction-side-confusion',
                    explanation: {
                        en: 'The route is straight, but the cafe is on the right, not the left.',
                        ja: 'まっすぐ行くところは合っていますが、カフェは左ではなく右です。',
                    },
                    repairPrompt: {
                        en: 'Keep まっすぐ and replace 左 with 右.',
                        ja: '「まっすぐ」は残して、「左」を「右」に変えてください。',
                    },
                    nearbyExample: {
                        en: '駅は右です means “The station is on the right.”',
                        ja: '「駅は右です」は、駅が右側にあるという意味です。',
                    },
                },
                {
                    id: 'turn-back',
                    label: {
                        en: 'Turn back; it is behind you.',
                        ja: '戻って、後ろです。',
                    },
                    correct: false,
                    errorTag: 'direction-path-confusion',
                    explanation: {
                        en: 'Aakash should continue ahead rather than turn back.',
                        ja: 'アーカーシュさんは戻らず、前へ進みます。',
                    },
                    repairPrompt: {
                        en: 'Start with the forward path: まっすぐ行って…',
                        ja: '前へ進む「まっすぐ行って」から始めてください。',
                    },
                    nearbyExample: {
                        en: 'まっすぐ行ってください means “Please go straight.”',
                        ja: '「まっすぐ行ってください」は、前へ直進するよう頼む表現です。',
                    },
                },
            ],
        },
    };
}
