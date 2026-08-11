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
    saveSettings: (
        settings: ReaderSettings,
        explicitUserChoiceKeys: readonly (keyof ReaderSettings)[],
    ) => Promise<unknown>;
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
        handleSettingsChangeEvent(handlers, event as CustomEvent<SettingsChangeEventDetail>);
    }, { signal });

    addWindowEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => {
        handlers.clearBridgeCaches();
    }, { signal });
}

function handleSettingsChangeEvent(
    handlers: ReaderRuntimeEventHandlers,
    event: CustomEvent<SettingsChangeEventDetail>,
): void {
    if (handlers.isDestroyed()) return;
    const detail = event.detail;
    const settings = handlers.getSettings();
    adoptChosenLearningTarget(settings);
    applyChangedTheme(handlers, settings, detail);
}

// Every persisted settings write dispatches this, so this hook covers the
// dialog, onboarding, and cross-tab sync alike. The compatibility profile is
// not learner intent while the required first-run target chooser is open.
function adoptChosenLearningTarget(settings: ReaderSettings): void {
    if (settings.learningTargetChosen) adoptLearningTargetFromSettings(settings);
}

function applyChangedTheme(
    handlers: ReaderRuntimeEventHandlers,
    settings: ReaderSettings,
    detail: SettingsChangeEventDetail | undefined,
): void {
    const theme = settingsThemeChangeDetail(detail);
    if (!theme) return;
    if (settings.theme === theme) return;
    settings.theme = theme;
    handlers.setSettings(settings);
    handlers.applyTheme();
    persistChangedTheme(handlers, settings, detail);
}

// The event carries the choice made on another surface. Preview events mirror
// it locally without turning that temporary value into durable intent.
function persistChangedTheme(
    handlers: ReaderRuntimeEventHandlers,
    settings: ReaderSettings,
    detail: SettingsChangeEventDetail | undefined,
): void {
    if (detail?.preview === true) return;
    void handlers.saveSettings(settings, ['theme']);
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
