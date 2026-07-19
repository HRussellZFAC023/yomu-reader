import type { ReaderSettings } from '../app/types';

const AUTHENTICATION_INFO_PERMISSION = 'authenticationInfo';

type FirefoxDataCollectionPermissions = {
    request?: (permissions: { data_collection: string[] }) => Promise<boolean>;
};

type FirefoxExtensionApi = {
    permissions?: FirefoxDataCollectionPermissions;
    runtime?: { id?: string; getURL?: (path: string) => string };
};

export type FirefoxAuthenticationInfoConsent = 'granted' | 'denied' | 'extension-page-required';

const AUTHENTICATION_FIELDS = [
    'apiKey',
    'jitenApiKey',
    'bunproApiKey',
    'bunproFrontendApiToken',
    'nadeshikoApiKey',
    'ocrCloudVisionApiKey',
] as const satisfies readonly (keyof ReaderSettings)[];

/**
 * Firefox 140+ requires an explicit built-in data-consent grant before an
 * extension stores or sends account credentials. Call this directly from the
 * user's Save action so Firefox can show its native permission UI.
 */
export function requestFirefoxAuthenticationInfoForChangedSettings(
    current: ReaderSettings,
    next: ReaderSettings,
): Promise<FirefoxAuthenticationInfoConsent> {
    if (!addsOrChangesAuthenticationInfo(current, next)) return Promise.resolve('granted');
    return requestFirefoxAuthenticationInfoPermission();
}

export function requestFirefoxAuthenticationInfoForSettings(
    settings: ReaderSettings,
): Promise<FirefoxAuthenticationInfoConsent> {
    if (!settingsContainAuthenticationInfo(settings)) return Promise.resolve('granted');
    return requestFirefoxAuthenticationInfoPermission();
}

/** Call from a deliberate credential-import button before reading the token. */
export function requestFirefoxAuthenticationInfoPermission(): Promise<FirefoxAuthenticationInfoConsent> {
    const firefox = firefoxExtensionApi();
    const request = firefox?.permissions?.request;
    if (!firefox?.runtime?.id) return Promise.resolve('granted');
    // Content scripts get only a small WebExtension API subset. Firefox
    // exposes runtime there, but not permissions: never interpret that as
    // consent. Account details must be entered from a bundled extension page.
    if (typeof request !== 'function') return Promise.resolve('extension-page-required');
    try {
        // Keep this as the first asynchronous browser call. Awaiting any work
        // before request() would lose Firefox's required user gesture.
        return Promise.resolve(request.call(firefox.permissions, {
            data_collection: [AUTHENTICATION_INFO_PERMISSION],
        })).then(granted => granted ? 'granted' : 'denied', () => 'denied');
    } catch {
        return Promise.resolve('denied');
    }
}

export function addsOrChangesAuthenticationInfo(current: ReaderSettings, next: ReaderSettings): boolean {
    return AUTHENTICATION_FIELDS.some(field => {
        const nextValue = normalizedCredential(next[field]);
        return Boolean(nextValue) && nextValue !== normalizedCredential(current[field]);
    });
}

export function settingsContainAuthenticationInfo(settings: ReaderSettings): boolean {
    return AUTHENTICATION_FIELDS.some(field => Boolean(normalizedCredential(settings[field])));
}

export function firefoxAuthenticationInfoRequiresExtensionPage(): boolean {
    const firefox = firefoxExtensionApi();
    return Boolean(firefox?.runtime?.id && typeof firefox.permissions?.request !== 'function');
}

export function firefoxAuthenticationInfoSettingsPageUrl(): string {
    const runtime = firefoxExtensionApi()?.runtime;
    if (!runtime?.id || typeof runtime.getURL !== 'function') return '';
    try {
        return `${runtime.getURL('newtab/index.html')}#settings=api`;
    } catch {
        return '';
    }
}

function normalizedCredential(value: ReaderSettings[typeof AUTHENTICATION_FIELDS[number]]): string {
    return typeof value === 'string' ? value.trim() : '';
}

function firefoxExtensionApi(): FirefoxExtensionApi | undefined {
    try {
        return (globalThis as typeof globalThis & { browser?: FirefoxExtensionApi }).browser;
    } catch {
        return undefined;
    }
}
