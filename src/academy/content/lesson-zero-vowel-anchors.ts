import type { LessonZeroVowelWritingItemId } from './lesson-zero-vowel-writing';

export interface LessonZeroVowelAnchor {
    readonly itemId: LessonZeroVowelWritingItemId;
    readonly kana: string;
    readonly spokenJapanese: string;
    readonly wordKana: string;
    readonly meaning: Readonly<{ en: string; ja: string }>;
    readonly mouthCue: Readonly<{ en: string; ja: string }>;
    readonly bindingId: `lesson-zero:vowel:${LessonZeroVowelWritingItemId}`;
}

export const LESSON_ZERO_VOWEL_ANCHORS = Object.freeze({
    'hira-a': Object.freeze({
        itemId: 'hira-a',
        kana: 'あ',
        spokenJapanese: 'あさです',
        wordKana: 'あさ',
        meaning: Object.freeze({ en: 'morning', ja: '朝' }),
        mouthCue: Object.freeze({
            en: 'Open your mouth and release the sound quickly.',
            ja: '口を開いて、短く音を出します。',
        }),
        bindingId: 'lesson-zero:vowel:hira-a',
    }),
    'hira-i': Object.freeze({
        itemId: 'hira-i',
        kana: 'い',
        spokenJapanese: 'いぬです',
        wordKana: 'いぬ',
        meaning: Object.freeze({ en: 'dog', ja: '犬' }),
        mouthCue: Object.freeze({
            en: 'Relax your lips and keep the sound short.',
            ja: '唇を楽にして、短く音を出します。',
        }),
        bindingId: 'lesson-zero:vowel:hira-i',
    }),
    'hira-u': Object.freeze({
        itemId: 'hira-u',
        kana: 'う',
        spokenJapanese: 'うみです',
        wordKana: 'うみ',
        meaning: Object.freeze({ en: 'sea', ja: '海' }),
        mouthCue: Object.freeze({
            en: 'Keep your lips relaxed and let the sound go.',
            ja: '唇を丸めすぎず、軽く音を出します。',
        }),
        bindingId: 'lesson-zero:vowel:hira-u',
    }),
    'hira-e': Object.freeze({
        itemId: 'hira-e',
        kana: 'え',
        spokenJapanese: 'えほんです',
        wordKana: 'えほん',
        meaning: Object.freeze({ en: 'picture book', ja: '絵本' }),
        mouthCue: Object.freeze({
            en: 'Keep it short; do not add a second sound.',
            ja: '次の音を足さず、短く出します。',
        }),
        bindingId: 'lesson-zero:vowel:hira-e',
    }),
    'hira-o': Object.freeze({
        itemId: 'hira-o',
        kana: 'お',
        spokenJapanese: 'おちゃです',
        wordKana: 'おちゃ',
        meaning: Object.freeze({ en: 'tea', ja: 'お茶' }),
        mouthCue: Object.freeze({
            en: 'Round your lips lightly, then release.',
            ja: '唇を軽く丸めて、すぐに音を出します。',
        }),
        bindingId: 'lesson-zero:vowel:hira-o',
    }),
} satisfies Readonly<Record<LessonZeroVowelWritingItemId, LessonZeroVowelAnchor>>);

export function lessonZeroVowelAnchor(itemId: string): LessonZeroVowelAnchor {
    const anchor = LESSON_ZERO_VOWEL_ANCHORS[itemId as LessonZeroVowelWritingItemId];
    if (!anchor) throw new Error(`Unknown Lesson Zero vowel anchor: ${itemId}`);
    return anchor;
}
