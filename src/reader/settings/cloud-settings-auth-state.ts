const AUTHORIZATION_STATE_BYTES = 24;
const AUTHORIZATION_STATE_PATTERN = /^[0-9a-f]{48}$/u;

export interface CloudSettingsAuthorization {
    state: string;
}

/**
 * Creates the private correlation capability for one redirect-based cloud
 * settings action. Failing closed is preferable to falling back to Math.random:
 * this value is what prevents a forged OAuth callback from selecting an action.
 */
export function createCloudSettingsAuthorization(): CloudSettingsAuthorization {
    const cryptoSource = globalThis.crypto;
    if (!cryptoSource?.getRandomValues) {
        throw new Error('Secure randomness is unavailable for Google authorization.');
    }
    const bytes = cryptoSource.getRandomValues(new Uint8Array(AUTHORIZATION_STATE_BYTES));
    return {
        state: Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''),
    };
}

export function isCloudSettingsAuthorizationState(value: unknown): value is string {
    return typeof value === 'string' && AUTHORIZATION_STATE_PATTERN.test(value);
}

export function cloudSettingsRedirectHandoffRequired(): boolean {
    const global = globalThis as typeof globalThis & {
        GM?: { xmlHttpRequest?: unknown; xmlhttpRequest?: unknown };
        GM_info?: unknown;
    };
    return [
        typeof GM_xmlhttpRequest === 'function',
        typeof global.GM?.xmlHttpRequest === 'function',
        typeof global.GM?.xmlhttpRequest === 'function',
        Boolean(global.GM_info),
    ].some(Boolean);
}
