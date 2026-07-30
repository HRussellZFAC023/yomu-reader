// Keep the canonical specifier: companion builds alias it to i18n-companion.
import { uiText, type UiCopyKey } from '../app/i18n';
import type { InterfaceLanguage } from './types';

/**
 * Keeps an English diagnostic on Error.message while carrying a stable copy ID
 * across the reader/companion bundle boundary for localized user feedback.
 */
export type UserFacingError = Error & { readonly yomuUiCopyKey: UiCopyKey };

export function userFacingError(
    copyKey: UiCopyKey,
    options: { cause?: unknown; diagnostic?: string } = {},
): UserFacingError {
    return Object.assign(
        new Error(options.diagnostic ?? uiText('en', copyKey), { cause: options.cause }),
        { name: 'UserFacingError', yomuUiCopyKey: copyKey },
    );
}

export function userFacingErrorText(
    language: InterfaceLanguage,
    fallbackKey: UiCopyKey,
    error?: unknown,
): string {
    const copyKey = userFacingCopyKey(error)
        ?? fallbackKey;
    const message = uiText(language, copyKey);
    return typeof message === 'string' ? message : uiText(language, fallbackKey);
}

function userFacingCopyKey(error: unknown): UiCopyKey | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const copyKey = (error as { yomuUiCopyKey?: unknown }).yomuUiCopyKey;
    return typeof copyKey === 'string' ? copyKey as UiCopyKey : undefined;
}
