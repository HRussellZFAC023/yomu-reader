import { uiText, type UiCopyKey } from '../app/i18n';
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
    return withDiagnostic(uiText(language, copyKey), diagnosticOf(error, copyKey));
}

/** The English diagnostic, unless it is only the error's own copy again. */
function diagnosticOf(error: unknown, copyKey: UiCopyKey): string {
    const diagnostic = error instanceof Error ? error.message.trim() : '';
    return diagnostic === uiText('en', copyKey) ? '' : diagnostic;
}

function withDiagnostic(copy: string, diagnostic: string): string {
    if (!diagnostic) return copy;
    // A localized diagnostic such as "Dictionary download failed (404)." already says it all.
    return diagnostic.includes(copy.replace(/[.。]$/u, '')) ? diagnostic : `${copy} ${diagnostic}`;
}

function isStorageFull(error: unknown): boolean {
    let current = error;
    for (let depth = 0; current && depth < 4; depth++) {
        if ((current as { name?: unknown }).name === 'QuotaExceededError') return true;
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}
