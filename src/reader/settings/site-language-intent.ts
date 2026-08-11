import { gmStorageDelete, gmStorageGet, gmStorageSet, withGmStorageLease } from '../app/storage';
import { isHostedReaderRuntime } from '../app/runtime-presence';

/**
 * The durable user-intent boundary for the preference that changes page
 * startup behavior at document-start. It is stored as its own scalar so a
 * stale whole-settings writer can never become authoritative for it merely
 * because it finishes later.
 */
export const PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY = 'yomu:prefer-japanese-site-language:v1';

const PREFER_JAPANESE_SITE_LANGUAGE_STORAGE_LEASE = 'prefer-japanese-site-language-setting';

export async function authoritativePreferredJapaneseSiteLanguage(
    storedValue: unknown,
    migrationFallback: boolean,
): Promise<boolean> {
    if (typeof storedValue === 'boolean') return storedValue;
    if (isHostedReaderRuntime()) return migrationFallback;
    return withGmStorageLease(PREFER_JAPANESE_SITE_LANGUAGE_STORAGE_LEASE, async () => {
        // Re-read inside the lease so an explicit change that raced this
        // one-time migration always wins.
        const currentValue = await gmStorageGet<unknown>(
            PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
            undefined,
        );
        if (typeof currentValue === 'boolean') return currentValue;
        await gmStorageSet(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, migrationFallback);
        return migrationFallback;
    });
}

export async function persistPreferredJapaneseSiteLanguageWithSettings(
    value: boolean,
    persistSettings: () => Promise<void>,
): Promise<void> {
    if (isHostedReaderRuntime()) return persistSettings();
    await withGmStorageLease(PREFER_JAPANESE_SITE_LANGUAGE_STORAGE_LEASE, async () => {
        const previous = await gmStorageGet<unknown>(
            PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
            undefined,
        );
        await gmStorageSet(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, value);
        try {
            await persistSettings();
        } catch (error) {
            if (typeof previous === 'boolean') {
                await gmStorageSet(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, previous);
            } else {
                await gmStorageDelete(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY);
            }
            throw error;
        }
    });
}
