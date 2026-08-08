import { headwordLanguageName } from '../languages/display-name';
import { languageSubtag } from '../languages/locale';
import { activeLearningTargetLanguage } from '../languages/target-runtime';
import { outputLanguageOf } from '../languages/selection';
// Use the canonical cross-directory path so the split userscript build can
// substitute the i18n companion facade. A same-directory `./i18n` import
// bypasses that alias and duplicates the full copy catalogue in core.
import { resolveUiLanguage } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from './types';

/**
 * The name of the language the learner is studying, written in their interface
 * language — "Russian" in an English UI, 「ロシア語」in a Japanese one.
 *
 * One declaration because several labels take a `{language}` token now (the master
 * switch, the YouTube filter, the site-language redirect, the empty-scan toast) and
 * the substitution had started to appear in four places at once. Each copy is a
 * chance for one surface to drift or to leak the raw token, which is exactly what
 * happened while b20 was being fixed.
 */
export function targetLanguageDisplayName(settings: ReaderSettings): string {
    // Startup and every settings write adopt the stored profile before core
    // renders these labels. Reading that same runtime target keeps the label
    // aligned with the scanner/filter behaviour and, importantly, keeps the
    // profile roster out of the size-limited core bundle.
    return activeTargetLanguageDisplayName(settings.interfaceLanguage);
}

/**
 * The same, for callers that have no settings object to hand and must read the
 * adopted runtime target instead.
 */
export function activeTargetLanguageDisplayName(interfaceLanguage: InterfaceLanguage): string {
    return targetLanguageDisplayNameFor(activeLearningTargetLanguage(), interfaceLanguage);
}

/** Resolve a selected or adopted target without erasing catalogue identities such as sh/tl. */
export function targetLanguageDisplayNameFor(tag: string, interfaceLanguage: InterfaceLanguage): string {
    const uiLanguage = resolveUiLanguage(interfaceLanguage);
    const subtag = languageSubtag(tag) ?? 'ja';
    return rosterIdentityDisplayName(subtag, uiLanguage) ?? headwordLanguageName(subtag, uiLanguage);
}

function rosterIdentityDisplayName(subtag: string, uiLanguage: 'en' | 'ja'): string | undefined {
    const identity = ROSTER_IDENTITY_BY_RUNTIME_SUBTAG[subtag] ?? subtag;
    return TARGET_IDENTITY_NAMES[identity]?.[uiLanguage];
}

/**
 * The two learner-facing content axes shown beside a lookup result.
 *
 * TARGET comes from the adopted runtime generation, exactly like scanning and
 * lookup. OUTPUT comes from the active stored profile, exactly like definition
 * translation. Keeping those sources distinct is intentional: the live report
 * was Spanish TARGET + English OUTPUT + Japanese INTERFACE, a valid state whose
 * popup looked like an unexplained "English mode".
 */
export function activeContentLanguageAxes(settings: ReaderSettings): {
    targetLanguage: string;
    targetName: string;
    outputLanguage: string;
    outputName: string;
} {
    const targetLanguage = activeLearningTargetLanguage();
    const outputLanguage = outputLanguageOf(settings);
    return {
        targetLanguage,
        targetName: targetLanguageDisplayNameFor(targetLanguage, settings.interfaceLanguage),
        outputLanguage,
        outputName: targetLanguageDisplayNameFor(outputLanguage, settings.interfaceLanguage),
    };
}

const TARGET_IDENTITY_NAMES: Partial<Record<string, Readonly<Record<'en' | 'ja', string>>>> = {
    sh: { en: 'Serbo-Croatian', ja: 'セルボ・クロアチア語' },
    tl: { en: 'Tagalog', ja: 'タガログ語' },
};
const ROSTER_IDENTITY_BY_RUNTIME_SUBTAG: Readonly<Record<string, string>> = {
    bs: 'sh', fil: 'tl', hr: 'sh', sr: 'sh',
};
