import type { ReaderSettings } from '../app/types';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';

export function parseContentCacheKey(
    texts: string[],
    options: unknown,
    settings: ReaderSettings,
): string {
    return JSON.stringify({
        texts,
        options,
        settings: {
            apiKey: hasJpdbApiCredential(settings),
            jitenApiKey: hasJitenApiCredential(settings),
            localDictionariesEnabled: settings.localDictionariesEnabled,
            dictionaries: settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        },
    });
}
