import type { ReaderSettings } from '../app/types';

/** Projects ordered root preferences into the active profile's compact snapshot. */
export function languageProfileDictionariesFromPreferences(
    preferences: ReaderSettings['dictionaryPreferences'],
): ReaderSettings['languageProfiles'][number]['dictionaries'] {
    const ordered = [...preferences].sort((left, right) => left.priority - right.priority);
    return {
        installed: ordered.map(preference => preference.name),
        enabled: ordered.filter(preference => preference.enabled).map(preference => preference.name),
        order: ordered.map(preference => preference.name),
    };
}
