import type { ReaderSettings } from '../app/types';

export type ApiCredentialSettings =
    Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>
    & Partial<Pick<ReaderSettings, 'bunproApiKey' | 'bunproFrontendApiToken' | 'bunproFrontendApiTokenExpiresAt' | 'wanikaniApiToken'>>;
export type BunproCredentialSettings = Partial<Pick<ReaderSettings, 'bunproApiKey' | 'bunproFrontendApiToken' | 'bunproFrontendApiTokenExpiresAt'>>;
export type WanikaniCredentialSettings = Partial<Pick<ReaderSettings, 'wanikaniApiToken'>>;

const JITEN_API_KEY_PREFIX = 'ak_';

// UT-61: dual credentials are first-class — labels must reflect BOTH
// providers instead of silently preferring one.
export function combinedApiCredentialLabel(settings: ApiCredentialSettings): string {
    const jpdb = Boolean(effectiveJpdbApiKey(settings));
    const jiten = Boolean(effectiveJitenApiKey(settings));
    if (jpdb && jiten) return 'Jiten + JPDB';
    if (jiten) return 'Jiten';
    return 'JPDB';
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

export function effectiveBunproFrontendApiToken(settings: BunproCredentialSettings): string {
    return settings.bunproFrontendApiToken?.trim() ?? '';
}

export function effectiveBunproLegacyApiKey(settings: BunproCredentialSettings): string {
    return settings.bunproApiKey?.trim() ?? '';
}

export function hasBunproFrontendCredential(settings: BunproCredentialSettings): boolean {
    return Boolean(effectiveBunproFrontendApiToken(settings));
}

// fallow-ignore-next-line unused-export
export function hasBunproLegacyCredential(settings: BunproCredentialSettings): boolean {
    return Boolean(effectiveBunproLegacyApiKey(settings));
}

export function isBunproFrontendCredentialExpired(settings: BunproCredentialSettings, now = Date.now()): boolean {
    const raw = settings.bunproFrontendApiTokenExpiresAt?.trim();
    if (!raw || !hasBunproFrontendCredential(settings)) return false;
    const expiresAt = Date.parse(raw);
    return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function effectiveWanikaniApiToken(settings: WanikaniCredentialSettings): string {
    return settings.wanikaniApiToken?.trim() ?? '';
}

export function hasWanikaniApiCredential(settings: WanikaniCredentialSettings): boolean {
    return Boolean(effectiveWanikaniApiToken(settings));
}

function splitApiCredential(value: string): ApiCredentialSettings {
    const credential = value.trim();
    if (!credential) return { apiKey: '', jitenApiKey: '' };
    return isJitenApiCredential(credential)
        ? { apiKey: '', jitenApiKey: credential }
        : { apiKey: credential, jitenApiKey: '' };
}

export function readApiCredentialsFromFormData(data: FormData): ApiCredentialSettings {
    const bunpro = readBunproCredentialsFromFormData(data);
    const wanikani = readWanikaniCredentialsFromFormData(data);
    // UT-56: dedicated per-provider fields; values still auto-route by
    // prefix so a Jiten key pasted into the JPDB field lands correctly.
    if (data.has('apiCredentialJpdb') || data.has('apiCredentialJiten')) {
        return {
            ...mergeApiCredentialValues(
                String(data.get('apiCredentialJpdb') ?? ''),
                String(data.get('apiCredentialJiten') ?? ''),
            ),
            ...bunpro,
            ...wanikani,
        };
    }
    if (data.has('apiCredential')) return { ...splitApiCredential(String(data.get('apiCredential') ?? '')), ...bunpro, ...wanikani };
    return {
        apiKey: String(data.get('apiKey') ?? '').trim(),
        jitenApiKey: String(data.get('jitenApiKey') ?? '').trim(),
        ...bunpro,
        ...wanikani,
    };
}

function readWanikaniCredentialsFromFormData(data: FormData): WanikaniCredentialSettings {
    return { wanikaniApiToken: String(data.get('apiCredentialWanikani') ?? data.get('wanikaniApiToken') ?? '').trim() };
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

function readBunproCredentialsFromFormData(data: FormData): Pick<ApiCredentialSettings, 'bunproApiKey' | 'bunproFrontendApiToken' | 'bunproFrontendApiTokenExpiresAt'> {
    return {
        bunproApiKey: String(data.get('apiCredentialBunproLegacy') ?? data.get('bunproApiKey') ?? '').trim(),
        bunproFrontendApiToken: String(data.get('apiCredentialBunpro') ?? data.get('bunproFrontendApiToken') ?? '').trim(),
        bunproFrontendApiTokenExpiresAt: String(data.get('bunproFrontendApiTokenExpiresAt') ?? '').trim(),
    };
}
