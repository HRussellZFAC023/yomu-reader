import type { LanguageTag } from './types';

/**
 * Japanese lookup and the default secondary-subtitle language (ADR-0024).
 *
 * Secondary subtitles default to English. Automatic sentence, example and
 * opted-in definition translations resolve through translationOutputLanguage.
 * Stored learning targets stay preserved; lookup always reads Japanese.
 */
export const TARGET_LANGUAGE: LanguageTag = 'ja';
export const OUTPUT_LANGUAGE: LanguageTag = 'en';
