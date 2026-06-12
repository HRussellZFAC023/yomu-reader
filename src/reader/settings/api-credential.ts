import type { ReaderSettings } from '../app/types';

export type ApiCredentialSettings = Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>;

const JITEN_API_KEY_PREFIX = 'ak_';

export function singleApiCredentialValue(settings: ApiCredentialSettings): string {
    return effectiveJitenApiKey(settings) || effectiveJpdbApiKey(settings);
}

export function activeApiCredentialLabel(settings: ApiCredentialSettings): 'JPDB' | 'Jiten' {
    return effectiveJitenApiKey(settings) ? 'Jiten' : 'JPDB';
}

// UT-61: dual credentials are first-class — labels must reflect BOTH
// providers instead of silently preferring one.
export function combinedApiCredentialLabel(settings: ApiCredentialSettings): string {
    const jpdb = Boolean(effectiveJpdbApiKey(settings));
    const jiten = Boolean(effectiveJitenApiKey(settings));
    if (jpdb && jiten) return 'JPDB + Jiten';
    if (jiten) return 'Jiten';
    return 'JPDB';
}

export function apiCredentialLabelFromValue(value: string): 'JPDB' | 'Jiten' {
    return isJitenApiCredential(value) ? 'Jiten' : 'JPDB';
}

export function effectiveJpdbApiKey(settings: ApiCredentialSettings): string {
    const apiKey = settings.apiKey.trim();
    return isJitenApiCredential(apiKey) ? '' : apiKey;
}

export function effectiveJitenApiKey(settings: ApiCredentialSettings): string {
    const explicit = settings.jitenApiKey.trim();
    if (explicit) return explicit;
    const apiKey = settings.apiKey.trim();
    return isJitenApiCredential(apiKey) ? apiKey : '';
}

export function hasJpdbApiCredential(settings: ApiCredentialSettings): boolean {
    return Boolean(effectiveJpdbApiKey(settings));
}

export function hasJitenApiCredential(settings: ApiCredentialSettings): boolean {
    return Boolean(effectiveJitenApiKey(settings));
}

function splitApiCredential(value: string): ApiCredentialSettings {
    const credential = value.trim();
    if (!credential) return { apiKey: '', jitenApiKey: '' };
    return isJitenApiCredential(credential)
        ? { apiKey: '', jitenApiKey: credential }
        : { apiKey: credential, jitenApiKey: '' };
}

export function readApiCredentialsFromFormData(data: FormData): ApiCredentialSettings {
    // UT-56: dedicated per-provider fields; values still auto-route by
    // prefix so a Jiten key pasted into the JPDB field lands correctly.
    if (data.has('apiCredentialJpdb') || data.has('apiCredentialJiten')) {
        return mergeApiCredentialValues(
            String(data.get('apiCredentialJpdb') ?? ''),
            String(data.get('apiCredentialJiten') ?? ''),
        );
    }
    if (data.has('apiCredential')) return splitApiCredential(String(data.get('apiCredential') ?? ''));
    return {
        apiKey: String(data.get('apiKey') ?? '').trim(),
        jitenApiKey: String(data.get('jitenApiKey') ?? '').trim(),
    };
}

export function mergeApiCredentialValues(jpdbValue: string, jitenValue: string): ApiCredentialSettings {
    const values = [jpdbValue.trim(), jitenValue.trim()].filter(Boolean);
    const jitenApiKey = values.find(isJitenApiCredential) ?? '';
    const apiKey = values.find(value => !isJitenApiCredential(value)) ?? '';
    return { apiKey, jitenApiKey };
}

export function isJitenApiCredential(value: string): boolean {
    return value.trim().startsWith(JITEN_API_KEY_PREFIX);
}
