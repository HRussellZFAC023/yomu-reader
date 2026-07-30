import type { LocaleMessages } from './catalog';

/**
 * The `setup.*` pack for Japanese.
 *
 * Japanese is a shipped interface locale but not a *learner* language row: it is
 * the study target, so it has no file under `catalogs/`, whose 32 rows are owned
 * one-per-locale by `config/multilingual/locale-ownership.json`. Rather than bend
 * that ownership model, Japanese setup copy sits here and is served through the
 * same `setupPackFor` seam, which is what makes the coverage measurement in
 * `registry.ts` treat all 33 locales alike.
 *
 * Hand-written, not machine-drafted: every one of these is in the human-critical
 * tier (first-run and language choice), and Japanese is a reference locale.
 */
export const JAPANESE_SETUP_MESSAGES: LocaleMessages = Object.freeze({
    setupTitle: 'よむをあなたの言語で設定',
    learnerLanguageLabel: 'あなたの言語',
    targetLanguageLabel: '学習する言語',
    targetJapanese: '日本語',
    recommendedDictionariesTitle: 'おすすめの日本語辞書',
    automaticTranslationLabel: '{language}へ自動翻訳',
    dictionaryCountAndSize: '{count, plural, one {辞書 #冊} other {辞書 #冊}} · {size}',
    setupProgress: '言語設定 {current} / {total}',
    continueAction: '次へ',
    originalDefinitionLabel: '{language}の原文',
    interfaceRtlVerificationPending: '右から左へのレイアウト確認が進行中です。',
    interfaceTranslationPending: '翻訳が進行中です。',
});
