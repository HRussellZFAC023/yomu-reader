// Japanese's own script detectors now live with the rest of the Japanese
// script data, so the ranges are declared once instead of being re-typed here
// and in every file that needed a kana/kanji test. Re-exported because core
// still imports them from this module for the handful of checks that genuinely
// mean "Japanese specifically"; everything that means "the language being
// studied" goes through isTargetLanguageText in ../lookup/target-text.
export { HAS_JAPANESE, HAS_JAPANESE_LETTER } from '../lookup/japanese-script';

export const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
