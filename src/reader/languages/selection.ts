import type { LanguageTag } from './types';

/**
 * The two content languages, fixed (ADR-0024).
 *
 * Yomu reads Japanese, and its definitions, example translations and
 * secondary subtitles are English. A stored profile from an earlier Yomu may
 * still name another target or definition language; it is kept as stored and
 * never read. Yomu's own interface language is `settings.interfaceLanguage`.
 */
export const TARGET_LANGUAGE: LanguageTag = 'ja';
export const OUTPUT_LANGUAGE: LanguageTag = 'en';
