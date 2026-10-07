import type { ReaderSettings } from '../app/types';

/** Keeps a hosted page's explicit interface locale page-owned. */
export function newTabSettingsWithPageInterfaceLanguage(
    settings: ReaderSettings,
    interfaceLanguage: ReaderSettings['interfaceLanguage'] | undefined,
): ReaderSettings {
    if (!interfaceLanguage || settings.interfaceLanguage === interfaceLanguage) return settings;
    return { ...settings, interfaceLanguage };
}
