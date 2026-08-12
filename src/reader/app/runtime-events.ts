import {
    INTERFACE_LANGUAGE_CHANGE_EVENT,
    OPEN_SETTINGS_EVENT,
    SETTINGS_CHANGE_EVENT,
    USERSCRIPT_HTTP_BRIDGE_READY_EVENT,
} from './constants';
import type { InterfaceLanguage, ReaderSettings } from './types';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
import { addWindowEventListener } from '../platform/window-events';
import { subscribeToSettingsChanges, type SettingsChangeDetail } from '../settings/settings-change-bus';
import { isHostedYomuOrigin } from './storage';
import { isRecord } from '../core/object-utils';

type InterfaceLanguageChangeDetail = Partial<{ language: unknown; interfaceLanguage: unknown }>;
type OpenSettingsEventDetail = Partial<{ panel: unknown; tab: unknown }>;
interface HostedPublicSettingsChangeRecords {
    detail: Record<string, unknown>;
    settings: Record<string, unknown>;
}

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
        if (!isHostedYomuOrigin()) return;
        handlers.showSettings(openSettingsPanelDetail((event as CustomEvent<OpenSettingsEventDetail>).detail));
    }, { signal });

    addWindowEventListener(INTERFACE_LANGUAGE_CHANGE_EVENT, event => {
        if (handlers.isDestroyed()) return;
        if (!isHostedYomuOrigin()) return;
        const language = interfaceLanguageChangeDetail((event as CustomEvent<InterfaceLanguageChangeDetail>).detail);
        if (language) void handlers.setInterfaceLanguage(language);
    }, { signal });

    subscribeToSettingsChanges(detail => handleSettingsChange(handlers, detail), signal);
    addWindowEventListener(SETTINGS_CHANGE_EVENT, event => {
        if (handlers.isDestroyed() || !isHostedYomuOrigin()) return;
        const detail = hostedPublicSettingsChangeDetail((event as CustomEvent).detail);
        if (detail) handleSettingsChange(handlers, detail);
    }, { signal });

    addWindowEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => {
        handlers.clearBridgeCaches();
    }, { signal });
}

function hostedPublicSettingsChangeDetail(value: unknown): SettingsChangeDetail | null {
    const records = hostedPublicSettingsChangeRecords(value);
    if (!records) return null;
    const theme = settingsThemeValue(records.settings.theme);
    if (!theme) return null;
    return {
        settings: { theme },
        preview: records.detail.preview === true,
        remote: records.detail.remote === true,
    };
}

function hostedPublicSettingsChangeRecords(value: unknown): HostedPublicSettingsChangeRecords | null {
    if (!isRecord(value)) return null;
    if (!isRecord(value.settings)) return null;
    return { detail: value, settings: value.settings };
}

function handleSettingsChange(
    handlers: ReaderRuntimeEventHandlers,
    detail: SettingsChangeDetail,
): void {
    if (handlers.isDestroyed()) return;
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
    detail: SettingsChangeDetail,
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
    detail: SettingsChangeDetail,
): void {
    if (detail.preview === true) return;
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

function settingsThemeChangeDetail(detail: SettingsChangeDetail): ReaderSettings['theme'] | null {
    return settingsThemeValue(detail.settings.theme);
}

function settingsThemeValue(value: unknown): ReaderSettings['theme'] | null {
    return value === 'auto' || value === 'dark' || value === 'light' ? value : null;
}
