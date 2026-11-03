import { normalizeCaptureShortcut } from './capture-shortcut';
import { parseTextLookupShortcutSettings } from './selected-text-shortcut';
import type { YomuGamingShortcutPatch } from './ipc';

/** Parse the whole requested pair before touching either native registration. */
export function parseDesktopShortcutPatch(value: unknown, platform: string): YomuGamingShortcutPatch | null {
    if (!value || typeof value !== 'object') return null;
    const keys = Object.keys(value);
    if (!keys.length || keys.some(key => key !== 'captureShortcut' && key !== 'textLookupShortcut')) return null;
    const patch: YomuGamingShortcutPatch = {};
    if ('captureShortcut' in value) {
        const capture = normalizeCaptureShortcut(value.captureShortcut, platform);
        if (!capture.ok) return null;
        patch.captureShortcut = capture.shortcut;
    }
    if ('textLookupShortcut' in value) {
        const text = parseTextLookupShortcutSettings(value.textLookupShortcut, platform);
        if (!text) return null;
        patch.textLookupShortcut = text;
    }
    return patch;
}
