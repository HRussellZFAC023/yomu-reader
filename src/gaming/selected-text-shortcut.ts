import { normalizeCaptureShortcut } from './capture-shortcut';
import type { YomuGamingTextLookupShortcut } from './ipc';

const DEFAULT_TEXT_LOOKUP_SHORTCUT = 'CommandOrControl+Shift+L';
export const DEFAULT_TEXT_LOOKUP_SETTINGS = {
    enabled: false, shortcut: DEFAULT_TEXT_LOOKUP_SHORTCUT, language: 'en',
} satisfies TextLookupShortcutSettings;

export interface TextLookupShortcutSettings {
    enabled: boolean;
    shortcut: string;
    language: 'en' | 'ja';
}

export function parseTextLookupShortcutSettings(value: unknown, platform: string): TextLookupShortcutSettings | null {
    if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean'
        || !('shortcut' in value)) return null;
    const normalized = normalizeCaptureShortcut(value.shortcut, platform);
    if (!normalized.ok) return null;
    return { enabled: value.enabled, shortcut: normalized.shortcut, language: 'language' in value && value.language === 'ja' ? 'ja' : 'en' };
}

export function sameNativeShortcut(first: string, second: string, platform: string): boolean {
    const native = (shortcut: string) => shortcut.replace('CommandOrControl', platform === 'darwin' ? 'Command' : 'Control');
    return native(first) === native(second);
}

export function textLookupShortcutStatus(settings: TextLookupShortcutSettings, registered: boolean, error?: YomuGamingTextLookupShortcut['error']): YomuGamingTextLookupShortcut {
    return { ...settings, registered, ...(error ? { error } : {}) };
}
