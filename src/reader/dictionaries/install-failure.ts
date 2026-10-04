import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { userFacingCopyKeyOf } from '../app/user-facing-errors';

/**
 * What a learner reads when a dictionary install fails: the error's copy plus
 * the diagnostic it already carries (an HTTP status, a blocked host, a manager
 * error), so the reason is no longer thrown away. A full disk gets its own copy.
 */
export function dictionaryInstallFailureText(language: InterfaceLanguage, error: unknown): string {
    if (isStorageFull(error)) return uiText(language, 'dictionaryStorageFull');
    const copyKey = userFacingCopyKeyOf(error) ?? 'dictionaryDownloadFailed';
    const copy = uiText(language, copyKey);
    const diagnostic = error instanceof Error ? error.message.trim() : '';
    // A diagnostic that already states the copy, such as a localized
    // "Dictionary download failed (404).", says it all.
    if (diagnostic.includes(copy.replace(/[.。]$/u, ''))) return diagnostic;
    // Any other diagnostic is English, so it only extends English copy.
    return diagnostic && copy === uiText('en', copyKey) ? `${copy} ${diagnostic}` : copy;
}

function isStorageFull(error: unknown): boolean {
    let current = error;
    for (let depth = 0; current && depth < 4; depth++) {
        if ((current as { name?: unknown }).name === 'QuotaExceededError') return true;
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}
