import {
    INTERFACE_LANGUAGE_CHANGE_EVENT,
    OPEN_SETTINGS_EVENT,
    SETTINGS_CHANGE_EVENT,
    USERSCRIPT_HTTP_BRIDGE_READY_EVENT,
} from './constants';
import type { InterfaceLanguage, ReaderSettings } from './types';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
import { addWindowEventListener } from '../platform/window-events';

type InterfaceLanguageChangeDetail = Partial<{ language: unknown; interfaceLanguage: unknown }>;
type OpenSettingsEventDetail = Partial<{ panel: unknown; tab: unknown }>;
type SettingsChangeEventDetail = Partial<{ preview: unknown; settings: Partial<{ theme: unknown }> }>;

export interface ReaderRuntimeEventHandlers {
    applyTheme: () => void;
    clearBridgeCaches: () => void;
    getSettings: () => ReaderSettings;
    isDestroyed: () => boolean;
    saveSettings: (settings: ReaderSettings) => Promise<unknown>;
    setInterfaceLanguage: (language: InterfaceLanguage) => void | Promise<void>;
    setSettings: (settings: ReaderSettings) => void;
    showSettings: (panel?: string) => void;
}

export function bindReaderRuntimeEvents(
    handlers: ReaderRuntimeEventHandlers,
    signal: AbortSignal,
): void {
    addWindowEventListener(OPEN_SETTINGS_EVENT, event => {
        if (handlers.isDestroyed()) return;
        handlers.showSettings(openSettingsPanelDetail((event as CustomEvent<OpenSettingsEventDetail>).detail));
    }, { signal });

    addWindowEventListener(INTERFACE_LANGUAGE_CHANGE_EVENT, event => {
        if (handlers.isDestroyed()) return;
        const language = interfaceLanguageChangeDetail((event as CustomEvent<InterfaceLanguageChangeDetail>).detail);
        if (language) void handlers.setInterfaceLanguage(language);
    }, { signal });

    addWindowEventListener(SETTINGS_CHANGE_EVENT, event => {
        if (handlers.isDestroyed()) return;
        const detail = (event as CustomEvent<SettingsChangeEventDetail>).detail;
        const settings = handlers.getSettings();
        // Every persisted settings write dispatches this, so it is the one
        // hook that covers the settings dialog, onboarding, and cross-tab
        // storage sync alike: the active learning target follows the profile
        // the user actually has, not the one they had at boot. Idempotent, and
        // ahead of the theme guard below, which returns early on most events.
        adoptLearningTargetFromSettings(settings);
        const theme = settingsThemeChangeDetail(detail);
        if (!theme || settings.theme === theme) return;
        settings.theme = theme;
        handlers.setSettings(settings);
        handlers.applyTheme();
        if (detail?.preview !== true) void handlers.saveSettings(settings);
    }, { signal });

    addWindowEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => {
        handlers.clearBridgeCaches();
    }, { signal });
}

function interfaceLanguageChangeDetail(detail: InterfaceLanguageChangeDetail | undefined): InterfaceLanguage | null {
    const value = detail?.language ?? detail?.interfaceLanguage;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : null;
}

function openSettingsPanelDetail(detail: OpenSettingsEventDetail | undefined): string | undefined {
    const value = detail?.panel ?? detail?.tab;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function settingsThemeChangeDetail(detail: SettingsChangeEventDetail | undefined): ReaderSettings['theme'] | null {
    const value = detail?.settings?.theme;
    return value === 'auto' || value === 'dark' || value === 'light' ? value : null;
}
