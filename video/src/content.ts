import type { PitchClass } from './theme';

// Every glyph the clip renders comes from this file or from the components that
// import it, and scripts/fetch-fonts.mjs subsets the vendored webfont by
// scanning src/, so adding a word here and re-running `npm run fonts` is the
// whole workflow for new copy.

export type VocabState = 'new' | 'learning' | 'known';

/**
 * A run of characters inside a token that shares one reading, mirroring the
 * kanji/kana split the reader does before it places furigana: 引き出せ becomes
 * 引(ひ)+き+出(だ)+せ, so the ruby sits over the kanji instead of over the
 * whole token.
 */
export interface RubySegment {
    text: string;
    reading?: string;
}

export interface Token {
    segments: RubySegment[];
    /** Particles and punctuation stay untinted, like the real reader. */
    state?: VocabState;
    /** The one token the clip hovers, looks up and mines. */
    target?: boolean;
}

export const tokenSurface = (token: Token): string => token.segments.map(segment => segment.text).join('');
export const tokenLength = (token: Token): number => [...tokenSurface(token)].length;

/**
 * Real in-game Japanese, transcribed from
 * references/style-persona/p5r-leblanc-morgana-dialogue-1920x1080.webp.
 * This is exactly the case the gaming overlay exists for: baked-into-the-frame
 * text that no browser extension can reach.
 */
export const SCENE_ONE = {
    speaker: 'モルガナ',
    dateNumerals: '5/21',
    dayLatin: 'SATURDAY',
    dayKanji: '土',
    timeOfDay: '放課後',
    lines: [
        [
            { segments: [{ text: 'この' }], state: 'known' },
            { segments: [{ text: 'ワガハイ' }], state: 'new' },
            { segments: [{ text: 'を' }] },
            { segments: [{ text: '描', reading: 'えが' }, { text: 'こう' }], state: 'learning' },
            { segments: [{ text: 'って' }] },
            { segments: [{ text: 'の' }] },
            { segments: [{ text: 'か' }] },
            { segments: [{ text: '？' }] },
        ],
        [
            { segments: [{ text: 'ちゃんと' }], state: 'known' },
            { segments: [{ text: '素材', reading: 'そざい' }], state: 'new', target: true },
            { segments: [{ text: 'の' }] },
            { segments: [{ text: '良', reading: 'よ' }, { text: 'さ' }], state: 'learning' },
            { segments: [{ text: 'を' }] },
            {
                segments: [
                    { text: '引', reading: 'ひ' },
                    { text: 'き' },
                    { text: '出', reading: 'だ' },
                    { text: 'せ' },
                ],
                state: 'new',
            },
            { segments: [{ text: 'よ' }] },
            { segments: [{ text: '？' }] },
        ],
    ] satisfies Token[][],
} as const;

/**
 * Second frame, from references/style-persona/p5r-scene-2-1920x1080.webp.
 * A different scene, different speaker, same three keystrokes.
 */
export const SCENE_TWO = {
    speaker: '芳澤 かすみ',
    dateNumerals: '9/21',
    dayLatin: 'WEDNESDAY',
    dayKanji: '水',
    timeOfDay: '放課後',
    line: [
        { segments: [{ text: 'はい' }], state: 'known' },
        { segments: [{ text: '、' }] },
        { segments: [{ text: 'ありがとう' }], state: 'learning', target: true },
        { segments: [{ text: 'ございます' }], state: 'known' },
        { segments: [{ text: '！' }] },
    ] satisfies Token[],
    quickWord: {
        spelling: 'ありがとう',
        reading: 'ありがとう',
        gloss: 'thank you',
    },
} as const;

export interface Sense {
    partOfSpeech: string;
    glosses: string[];
}

/** The card the clip opens. Content follows JMdict/Jitendex for 素材. */
export const CARD = {
    spelling: '素材',
    reading: 'そざい',
    /** Downstep position, the same notation the reader's pitch bank uses. 0 = heiban. */
    pitchPattern: '0',
    pitchClass: 'heiban' satisfies PitchClass as PitchClass,
    pitchLabel: '平板',
    /** Mora-by-mora highs, matching pitchLevelsForDisplay in src/reader/popup/pitch.ts. */
    pitchLevels: ['L', 'H', 'H'] as const,
    morae: ['そ', 'ざ', 'い'] as const,
    frequencyChip: 'Top 5k',
    commonChip: 'Common',
    posChip: 'Noun',
    senses: [
        { partOfSpeech: 'noun', glosses: ['raw material', 'material'] },
        { partOfSpeech: 'noun', glosses: ['ingredients', 'stock'] },
        { partOfSpeech: 'noun', glosses: ['subject matter', 'source material'] },
    ] satisfies Sense[],
    /** Sentence card context, lifted straight off the frame. */
    contextBefore: 'ちゃんと',
    contextAfter: 'の良さを引き出せよ？',
    deckName: 'Mining',
    deckCountBefore: 128,
} as const;

/** The overlay's own control legend, mirroring the game's calm corner legend. */
export const LEGEND = [
    { key: '⌘⇧Y', label: '読み取り', latin: 'Read screen' },
    { key: 'Click', label: '辞書', latin: 'Look up' },
    { key: 'M', label: 'デッキに追加', latin: 'Add to deck' },
] as const;

export const SHORTCUT_KEYS = ['⌘', '⇧', 'Y'] as const;
export const SHORTCUT_WINDOWS = 'Ctrl + Shift + Y';

export const END_CARD = {
    wordmark: 'Yomu',
    productLine: 'Gaming',
    kicker: 'ゲームの日本語を、そのまま読む。',
    claims: [
        'Reads the Japanese baked into the frame, straight off your screen.',
        'Pitch accent, senses and audio on the word you point at.',
        'Sends the sentence, the audio and a screenshot to your deck.',
    ],
    url: 'yomureader.com',
    platforms: 'macOS · Windows · Linux',
    footnote: 'Free and open source.',
} as const;
