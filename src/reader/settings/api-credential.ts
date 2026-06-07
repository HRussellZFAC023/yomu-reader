import type { ReaderSettings } from '../app/types';

export type ApiCredentialSettings = Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>;

const JITEN_API_KEY_PREFIX = 'ak_';

export function singleApiCredentialValue(settings: ApiCredentialSettings): string {
    return settings.jitenApiKey.trim() || settings.apiKey;
}

function splitApiCredential(value: string): ApiCredentialSettings {
    const credential = value.trim();
    if (!credential) return { apiKey: '', jitenApiKey: '' };
    return isJitenApiCredential(credential)
        ? { apiKey: '', jitenApiKey: credential }
        : { apiKey: credential, jitenApiKey: '' };
}

export function readApiCredentialsFromFormData(data: FormData): ApiCredentialSettings {
    if (data.has('apiCredential')) return splitApiCredential(String(data.get('apiCredential') ?? ''));
    return {
        apiKey: String(data.get('apiKey') ?? '').trim(),
        jitenApiKey: String(data.get('jitenApiKey') ?? '').trim(),
    };
}

function isJitenApiCredential(value: string): boolean {
    return value.trim().startsWith(JITEN_API_KEY_PREFIX);
}
