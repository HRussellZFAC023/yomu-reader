import type { ReaderSettings } from '../app/types';
import { credentialValueFromFormData, storedCredentialClearName, trimmedFormField } from './credential-form';

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

export function readApiCredentialsFromFormData(
    data: FormData,
    current: ApiCredentialSettings = { apiKey: '', jitenApiKey: '' },
): ApiCredentialSettings {
    return {
        ...readProviderApiCredentials(data, current),
        ...readBunproCredentialsFromFormData(data, current),
        ...readWanikaniCredentialsFromFormData(data, current),
    };
}

function readProviderApiCredentials(
    data: FormData,
    current: ApiCredentialSettings,
): Pick<ApiCredentialSettings, 'apiKey' | 'jitenApiKey'> {
    // UT-56: dedicated per-provider fields; values still auto-route by
    // prefix so a Jiten key pasted into the JPDB field lands correctly.
    if (hasDedicatedApiCredentialFields(data)) {
        return updatedDedicatedApiCredentials(data, current);
    }
    if (data.has('apiCredential')) {
        return splitApiCredential(credentialValueFromFormData(data, 'apiCredential', storedCombinedApiCredential(current)));
    }
    return {
        apiKey: trimmedFormField(data, 'apiKey'),
        jitenApiKey: trimmedFormField(data, 'jitenApiKey'),
    };
}

function hasDedicatedApiCredentialFields(data: FormData): boolean {
    return data.has('apiCredentialJpdb') || data.has('apiCredentialJiten');
}

function storedCombinedApiCredential(current: ApiCredentialSettings): string {
    return current.apiKey || current.jitenApiKey;
}

function updatedDedicatedApiCredentials(
    data: FormData,
    current: ApiCredentialSettings,
): Pick<ApiCredentialSettings, 'apiKey' | 'jitenApiKey'> {
    const next = {
        apiKey: current.apiKey.trim(),
        jitenApiKey: current.jitenApiKey.trim(),
    };
    updateCredentialSlot(data, 'apiCredentialJiten', next, 'jiten');
    updateCredentialSlot(data, 'apiCredentialJpdb', next, 'jpdb');
    return next;
}

function updateCredentialSlot(
    data: FormData,
    name: string,
    next: Pick<ApiCredentialSettings, 'apiKey' | 'jitenApiKey'>,
    slot: 'jpdb' | 'jiten',
): void {
    const replacement = trimmedFormField(data, name);
    if (!replacement && !data.has(storedCredentialClearName(name))) return;
    applyCredentialSlotReplacement(next, slot, replacement);
}

function applyCredentialSlotReplacement(
    next: Pick<ApiCredentialSettings, 'apiKey' | 'jitenApiKey'>,
    slot: 'jpdb' | 'jiten',
    replacement: string,
): void {
    if (isJitenApiCredential(replacement)) {
        applyJitenCredentialReplacement(next, slot, replacement);
        return;
    }
    applyJpdbCredentialReplacement(next, slot, replacement);
}

function applyJitenCredentialReplacement(
    next: Pick<ApiCredentialSettings, 'apiKey' | 'jitenApiKey'>,
    slot: 'jpdb' | 'jiten',
    replacement: string,
): void {
    next.jitenApiKey = replacement;
    if (slot === 'jpdb') next.apiKey = '';
}

function applyJpdbCredentialReplacement(
    next: Pick<ApiCredentialSettings, 'apiKey' | 'jitenApiKey'>,
    slot: 'jpdb' | 'jiten',
    replacement: string,
): void {
    if (slot === 'jpdb') {
        next.apiKey = replacement;
        return;
    }
    next.jitenApiKey = '';
    if (replacement) next.apiKey = replacement;
}

/**
 * Reconstruct only credential presence from the masked form. The sentinel
 * values are never persisted or rendered; they let localization and status
 * labels stay accurate without putting stored secrets back into page DOM.
 */
export function redactedApiCredentialsFromForm(form: HTMLFormElement): ApiCredentialSettings {
    const configured = (name: string, sentinel: string): string => {
        const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
        return input?.dataset.storedCredentialPlaceholder === 'true' ? sentinel : '';
    };
    return readApiCredentialsFromFormData(new FormData(form), {
        apiKey: configured('apiCredentialJpdb', 'stored-jpdb'),
        jitenApiKey: configured('apiCredentialJiten', 'ak_stored-jiten'),
        bunproFrontendApiToken: configured('apiCredentialBunpro', 'stored-bunpro'),
        wanikaniApiToken: configured('apiCredentialWanikani', 'stored-wanikani'),
    });
}

function readWanikaniCredentialsFromFormData(
    data: FormData,
    current: WanikaniCredentialSettings,
): WanikaniCredentialSettings {
    const field = data.has('apiCredentialWanikani') ? 'apiCredentialWanikani' : 'wanikaniApiToken';
    return { wanikaniApiToken: credentialValueFromFormData(data, field, current.wanikaniApiToken) };
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

function readBunproCredentialsFromFormData(
    data: FormData,
    current: BunproCredentialSettings,
): Pick<ApiCredentialSettings, 'bunproApiKey' | 'bunproFrontendApiToken' | 'bunproFrontendApiTokenExpiresAt'> {
    const legacyField = preferredCredentialField(data, 'apiCredentialBunproLegacy', 'bunproApiKey');
    const frontendField = preferredCredentialField(data, 'apiCredentialBunpro', 'bunproFrontendApiToken');
    const frontendToken = credentialValueFromFormData(data, frontendField, current.bunproFrontendApiToken);
    return {
        bunproApiKey: credentialValueFromFormData(data, legacyField, current.bunproApiKey),
        bunproFrontendApiToken: frontendToken,
        bunproFrontendApiTokenExpiresAt: retainedBunproExpiration(data, current, frontendToken),
    };
}

function preferredCredentialField(data: FormData, preferred: string, legacy: string): string {
    return data.has(preferred) ? preferred : legacy;
}

function retainedBunproExpiration(data: FormData, current: BunproCredentialSettings, frontendToken: string): string {
    if (!frontendToken) return '';
    return String(data.get('bunproFrontendApiTokenExpiresAt') ?? current.bunproFrontendApiTokenExpiresAt ?? '').trim();
}
