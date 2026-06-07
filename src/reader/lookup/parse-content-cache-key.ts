import type { ReaderSettings } from '../app/types';

export function parseContentCacheKey(
    texts: string[],
    options: unknown,
    settings: ReaderSettings,
): string {
    return JSON.stringify({
        texts,
        options,
        settings: {
            apiKey: Boolean(settings.apiKey.trim()),
            localDictionariesEnabled: settings.localDictionariesEnabled,
            dictionaries: settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        },
    });
}
