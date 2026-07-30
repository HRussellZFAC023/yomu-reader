import { resolveLanguageProfile } from './profiles';
import type { LanguageSelection, LanguageTag, LocalePreference } from './types';

/**
 * The three language axes, read from one place.
 *
 * U105 exists because these three were being answered by the same field. The
 * live bug was example translation: the popover handed `interfaceLanguage` to a
 * machine-translation call, so a Korean speaker reading Japanese with an
 * English UI got English example translations and had no way to ask for Korean
 * ones without translating all of Yomu into Korean.
 *
 * The fix is not a rename. It is that every consumer states which axis it
 * wants, so a future change cannot quietly reintroduce the coupling:
 *
 *   parsing / morphology / audio / OCR / mining -> `targetLanguageOf`
 *   definitions / example translations          -> `outputLanguageOf`
 *   buttons / settings / errors / onboarding    -> `interfaceLanguageOf`
 *
 * Dictionary catalogue metadata (`headwordLanguages`, `definitionLanguages`,
 * a recommendation manifest's `learnerLanguage`) is none of these: it describes
 * what a source can supply, and is used to *satisfy* a TARGET or OUTPUT choice
 * rather than to make one.
 */
export function resolveLanguageSelection(value: unknown): LanguageSelection {
    const profile = resolveLanguageProfile(value);
    return {
        targetLanguage: profile.targetLanguage,
        outputLanguage: profile.outputLanguage,
        interfaceLanguage: profile.uiLocale,
    };
}

/** TARGET: the language being read. */
export function targetLanguageOf(value: unknown): LanguageTag {
    return resolveLanguageProfile(value).targetLanguage;
}

/** OUTPUT: the language definitions and example translations render in. */
export function outputLanguageOf(value: unknown): LanguageTag {
    return resolveLanguageProfile(value).outputLanguage;
}

/**
 * INTERFACE: the language Yomu's own chrome speaks, as stored.
 *
 * This is deliberately the profile's `uiLocale` and not `settings.interfaceLanguage`:
 * the root field still narrows to `auto | en | ja` because only those two
 * interface locales exist, while the profile can already hold any canonical
 * tag. D43 widens the resolved set; keeping the stored value readable here is
 * what makes that a one-place change instead of a search across the reader.
 */
export function interfaceLanguageOf(value: unknown): LocalePreference {
    return resolveLanguageProfile(value).uiLocale;
}
