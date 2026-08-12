export interface CredentialFieldReader {
    get: (name: string) => string;
    has: (name: string) => boolean;
}

const CLEAR_SUFFIX = '.clearStoredCredential';
export const PROTECTED_CREDENTIAL_INPUT_ATTRIBUTES = {
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-protonpass-ignore': 'true',
    'data-form-type': 'other',
} as const;

export function storedCredentialClearName(name: string): string {
    return `${name}${CLEAR_SUFFIX}`;
}

/**
 * Credential inputs are deliberately blank in page DOM. A blank field keeps
 * the saved value, a typed value replaces it, and the adjacent explicit
 * checkbox removes it. This prevents host-page scripts from reading secrets
 * when the Reader settings dialog is open.
 */
export function credentialValueFromReader(
    reader: CredentialFieldReader,
    name: string,
    storedValue: string | null | undefined,
): string {
    const replacement = reader.get(name).trim();
    if (replacement) return replacement;
    return reader.has(storedCredentialClearName(name)) ? '' : storedValue?.trim() ?? '';
}

export function credentialValueFromFormData(
    data: FormData,
    name: string,
    storedValue: string | null | undefined,
): string {
    return credentialValueFromReader({
        get: field => String(data.get(field) ?? ''),
        has: field => data.has(field),
    }, name, storedValue);
}

export function trimmedFormField(data: FormData, name: string): string {
    return String(data.get(name) ?? '').trim();
}
