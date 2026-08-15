/**
 * Logical storage keys owned by Reader settings persistence.
 *
 * Backup restore must never feed these through the generic managed-value
 * importer: settings and intent are a witnessed pair, while the site-language
 * scalar has its own rollback boundary. They publish together at the final
 * settings commit instead.
 *
 * Kept dependency-free because the storage layer and settings transaction both
 * need the classification without importing each other.
 */
export const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const LEGACY_SETTINGS_STORAGE_KEYS = [
    'jpdb-reader-settings',
    'yomu-reader-settings',
    'yomu-settings',
] as const;
const SETTINGS_INTENT_LEDGER_STORAGE_KEY = 'yomu:settings-intent:v2';
export const EXPLICIT_USER_SETTINGS_STORAGE_KEY = 'yomu:explicit-user-settings:v1';
const PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY = 'yomu:prefer-japanese-site-language:v1';
const PREFERRED_JAPANESE_SITE_LANGUAGE_CACHE_KEY = 'yomu:prefer-japanese-site-language';

const SETTINGS_AUTHORITY_STORAGE_KEYS = new Set<string>([
    SETTINGS_STORAGE_KEY,
    ...LEGACY_SETTINGS_STORAGE_KEYS,
    SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    EXPLICIT_USER_SETTINGS_STORAGE_KEY,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    PREFERRED_JAPANESE_SITE_LANGUAGE_CACHE_KEY,
]);

export function isSettingsAuthorityStorageKey(key: string): boolean {
    return SETTINGS_AUTHORITY_STORAGE_KEYS.has(key);
}
