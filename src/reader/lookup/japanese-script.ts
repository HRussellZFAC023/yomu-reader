/**
 * The one place Japanese script ranges are written down.
 *
 * Before this module the same kana/kanji character classes were re-declared
 * inline in dozens of files, so "what counts as Japanese" was a per-file guess
 * that drifted (some included the prolonged sound mark, some the iteration
 * mark, some halfwidth katakana). Every class below is a plain string fragment
 * so a call site composes exactly the class it needs --
 * `[${KANJI}${ITERATION_MARKS}]` -- instead of retyping ranges.
 *
 * Some endpoints below are unassigned or combining code points that render as
 * nothing useful in an editor, so `japanese-script.test.ts` pins every constant
 * to its exact code points; edit a range only with that test in front of you.
 *
 * This is Japanese's own script data. It is deliberately NOT part of the
 * cross-language `LearningTargetModule` contract: another target's detection
 * lives in that target's module, and core reaches detection through
 * `isTargetLanguageText` rather than through anything here.
 *
 * Nothing in this file imports anything, so the DOM layer, the parser, and the
 * Japanese learning-target module can all share it without an import cycle.
 */

/** Hiragana block, including the iteration/ligature tail at U+309D-U+309F. */
export const HIRAGANA = '぀-ゟ';
/** Katakana block, including the prolonged sound mark and the middle dot. */
export const KATAKANA = '゠-ヿ';
/** Both kana blocks, which are contiguous. */
export const KANA = '぀-ヿ';
/** Halfwidth katakana, including the halfwidth punctuation at its head. */
export const HALFWIDTH_KATAKANA = 'ｦ-ﾟ';
/** CJK ideographs: Extension A (U+3400) through the Unified block (U+9FFF). */
export const KANJI = '㐀-鿿';
/** Repeats the preceding kanji; several call sites accept it and not the closing mark. */
export const ITERATION_MARK = '々';
/** Iteration and closing marks, read as kanji but living outside the block. */
export const ITERATION_MARKS = `${ITERATION_MARK}〆`;
/** Katakana glyphs used as kanji-like counters, as in a "one month" span. */
export const KANA_COUNTERS = 'ヵヶ';
/** Lengthens the preceding mora, so it is part of a word and never a boundary. */
export const PROLONGED_SOUND_MARK = 'ー';
/** Separates parts of a katakana name, so it stays inside a reading. */
export const KATAKANA_MIDDLE_DOT = '・';
/** Sentence punctuation that binds to the Japanese text on either side of it. */
export const JAPANESE_SENTENCE_PUNCTUATION = '、。！？・';
/** Combining voiced/semi-voiced sound marks, as used in decomposed readings. */
export const COMBINING_KANA_MARKS = '゙゚';

/**
 * Letters only. Unlike the blocks above, these exclude the punctuation that
 * lives inside the kana ranges (notably the middle dot and the prolonged sound
 * mark) -- which is what a render-boundary check needs: a token may not replace
 * page text unless it covers a real letter.
 */
export const HIRAGANA_LETTERS = 'ぁ-ゖゝ-ゟ';
export const KATAKANA_LETTERS = 'ァ-ヺヽ-ヿ';
export const HALFWIDTH_KATAKANA_LETTERS = 'ｦ-ｯｱ-ﾝ';

/** Everything written with kanji semantics: ideographs plus the two marks. */
export const KANJI_LIKE = `${KANJI}${ITERATION_MARKS}`;
/** Kanji semantics plus the counters the segmenter treats as kanji. */
export const KANJI_LIKE_WITH_COUNTERS = `${KANJI_LIKE}${KANA_COUNTERS}`;
export const HIRAGANA_WITH_PROLONGED = `${HIRAGANA}${PROLONGED_SOUND_MARK}`;
export const KATAKANA_WITH_PROLONGED = `${KATAKANA}${PROLONGED_SOUND_MARK}`;
export const KANA_WITH_PROLONGED = `${KANA}${PROLONGED_SOUND_MARK}`;
/** The character set a furigana reading may be spelled with. */
export const READING_KANA = `${KANA}${PROLONGED_SOUND_MARK}${KATAKANA_MIDDLE_DOT}`;
/** The broad "this text is Japanese" set: kana, kanji, marks, halfwidth katakana. */
export const JAPANESE_SCRIPT = `${KANA}${KANJI}${ITERATION_MARKS}${HALFWIDTH_KATAKANA}`;
/** Japanese letters only -- the render-boundary counterpart of JAPANESE_SCRIPT. */
export const JAPANESE_LETTERS =
    `${HIRAGANA_LETTERS}${KATAKANA_LETTERS}${KANJI}${HALFWIDTH_KATAKANA_LETTERS}`;

/**
 * Shared instances for classes several call sites need identically.
 * Only non-global regexes are shared: a `g`-flagged instance carries
 * `lastIndex` between calls, so sharing one would couple unrelated call sites.
 * Global patterns compose the fragments above into their own instance instead.
 */
/**
 * Broad scan gate: does this text contain anything Japanese at all? This is
 * Japanese's own detector, wired into the Japanese learning-target module as
 * its `isLookupableText`. Core does not call it directly -- core asks
 * `isTargetLanguageText`, which resolves to whichever target is active.
 */
export const HAS_JAPANESE = new RegExp(`[${JAPANESE_SCRIPT}]`);
/**
 * Render-boundary check. Unlike the broad scan gate above this excludes the
 * punctuation living inside the kana blocks (notably the middle dot and the
 * prolonged sound mark). A token must cover at least one Japanese
 * letter/ideograph before it may replace page text; punctuation may still be
 * part of a wider legitimate word span.
 */
export const HAS_JAPANESE_LETTER = new RegExp(`[${JAPANESE_LETTERS}]`, 'u');

export const KANJI_RE = new RegExp(`[${KANJI}]`, 'u');
export const KANJI_LIKE_RE = new RegExp(`[${KANJI_LIKE}]`, 'u');
export const KANA_ONLY_RUN_RE = new RegExp(`^[${KANA_WITH_PROLONGED}]+$`, 'u');
export const READING_KANA_CHAR_RE = new RegExp(`[${READING_KANA}]`, 'u');
export const READING_KANA_ONLY_RE = new RegExp(`^[${READING_KANA}]+$`, 'u');
