import type { LanguageTag } from './types';

/**
 * Japanese lookup and the default secondary-subtitle language (ADR-0024).
 *
 * Definitions and secondary subtitles remain English. Automatic sentence and
 * example translations resolve their destination through translationOutputLanguage.
 * Stored learning targets stay preserved; lookup always reads Japanese.
 */
export const TARGET_LANGUAGE: LanguageTag = 'ja';
export const OUTPUT_LANGUAGE: LanguageTag = 'en';
