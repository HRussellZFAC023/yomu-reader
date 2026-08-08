import { formatUiText, uiText } from '../app/i18n';
import { activeTargetLanguageDisplayName, targetLanguageDisplayNameFor } from '../app/target-language-name';
import type { InterfaceLanguage } from '../app/types';

export type SettingsText = (key: Parameters<typeof uiText>[1]) => string;

/**
 * Every settings label, with `{language}` filled by the language the learner is
 * actually studying.
 *
 * Several labels named Japanese outright — including the product's master switch,
 * which read "Japanese text on webpages" with "Scan Japanese automatically" — while
 * the machinery behind them asks the ACTIVE target whether text is its language
 * (`textWalkerHasJapaneseWithinBudget` → `isTargetLanguageText` →
 * `activeLearningTarget().isLookupableText`). So they were lies rather than honest
 * Japanese-only scoping, and the first settings screen a Russian learner opened told
 * them this product reads Japanese (b20).
 *
 * Substituting here rather than at the call sites is what makes it complete: first
 * paint and the live interface-language relabel both resolve labels through this one
 * function, so neither can drift from the other or leak a raw `{language}` token.
 */
export function settingsText(language: InterfaceLanguage, targetLanguage?: string): SettingsText {
    const targetName = targetLanguage
        ? targetLanguageDisplayNameFor(targetLanguage, language)
        : activeTargetLanguageDisplayName(language);
    return key => {
        const message = uiText(language, key);
        return message.includes('{language}') ? formatUiText(language, key, { language: targetName }) : message;
    };
}
