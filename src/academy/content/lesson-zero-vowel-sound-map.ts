import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import { LESSON_ZERO_VOWEL_BINGO_ID } from '../domain/lesson-zero-vowel-session';
import type { KanaSoundMapModel } from '../minigames/kana-sound-map';
import {
    LESSON_ZERO_KANA_SEQUENCE,
    LESSON_ZERO_SOURCE_MEDIA,
    LESSON_ZERO_SOURCE_PROVENANCE,
} from './lesson-zero-source-material';

export const LESSON_ZERO_VOWEL_SOUND_MAP_ID = 'activity:lesson-zero-vowel-listen';
const LESSON_ZERO_VOWEL_SOUND_SOURCE_QUESTION_ID = 'source-question:lesson-zero-hiragana-a-row';

export function createLessonZeroVowelSoundMap(): KanaSoundMapModel {
    const items = LESSON_ZERO_KANA_SEQUENCE.map(item => Object.freeze({
        id: item.id,
        kana: item.kana,
        romaji: item.romaji,
        conceptId: `concept:kana:${item.id}`,
        reviewSeedId: `review:lesson-zero:vowel-sound:${item.id}`,
        errorTag: `vowel-sound-${item.romaji}`,
    }));
    return Object.freeze({
        id: LESSON_ZERO_VOWEL_SOUND_MAP_ID,
        kind: 'kana-sound-map',
        sourceQuestionId: LESSON_ZERO_VOWEL_SOUND_SOURCE_QUESTION_ID,
        conceptIds: Object.freeze(items.map(item => item.conceptId)),
        responseKind: 'kana-listening-choice',
        prompt: Object.freeze({
            ja: '五つの音を聞いて、ひらがなを選んでください。',
            en: 'Listen to five sounds and choose the matching hiragana.',
        }),
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: Object.freeze({
            items: Object.freeze(items),
            source: Object.freeze({
                sourceId: 'moodle-raw',
                role: 'kana-a-row-writing',
                runtimeUrl: LESSON_ZERO_SOURCE_MEDIA.hiraganaARow,
                sourceSha256: LESSON_ZERO_SOURCE_PROVENANCE.hiraganaARowSha256,
                locus: 'page 1',
                answerGate: 'after-attempt' as const,
                storyHook: Object.freeze({
                    sceneId: 'scene:blank-atlas:sound-script-map',
                    activityId: LESSON_ZERO_VOWEL_SOUND_MAP_ID,
                }),
            }),
            passScore: 1,
            choiceLabel: Object.freeze({
                ja: '聞こえた音の文字を一つ選びましょう。',
                en: 'Choose the character you heard.',
            }),
            feedback: Object.freeze({
                pass: Object.freeze({
                    explanation: Object.freeze({
                        ja: '五つの母音とひらがなを正しい順で結べました。',
                        en: 'You matched all five vowel sounds to their hiragana.',
                    }),
                }),
                lapse: Object.freeze({
                    explanation: Object.freeze({
                        ja: '音と文字が違うところがありました。',
                        en: 'One or more sounds did not match the chosen kana.',
                    }),
                    repairPrompt: Object.freeze({
                        ja: '迷った音だけをもう一度聞き、五つの位置を保ちましょう。',
                        en: 'Replay the uncertain sound while keeping the five positions in place.',
                    }),
                    nearbyExample: Object.freeze({
                        ja: '最初の音「あ」から、一つずつ確かめます。',
                        en: 'Start with the first sound, あ, and check one position at a time.',
                    }),
                }),
            }),
        }),
    });
}

export function createLessonZeroVowelBingo(): KanaSoundMapModel {
    const lesson = createLessonZeroVowelSoundMap();
    return Object.freeze({
        ...lesson,
        id: LESSON_ZERO_VOWEL_BINGO_ID,
        prompt: Object.freeze({
            ja: '聞こえた五つの音で、ビンゴの花を完成させましょう。',
            en: 'Use the five sounds you hear to complete the bingo flower.',
        }),
        payload: Object.freeze({
            ...lesson.payload,
            source: Object.freeze({
                ...lesson.payload.source,
                storyHook: Object.freeze({
                    ...lesson.payload.source.storyHook,
                    activityId: LESSON_ZERO_VOWEL_BINGO_ID,
                }),
            }),
            choiceLabel: Object.freeze({
                ja: '音を聞いて、同じ文字のマスを選びましょう。',
                en: 'Listen, then mark the tile with the matching character.',
            }),
        }),
    });
}
