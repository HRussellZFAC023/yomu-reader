// Capture-shortcut vocabulary shared by the Electron main process (which registers the
// accelerator) and the renderer (which shows it). Deliberately free of `electron` and
// `process` so both bundles — and unit tests — can use the same rules.

export const DEFAULT_CAPTURE_SHORTCUT = 'CommandOrControl+Shift+Y';

const CAPTURE_SHORTCUT_MODIFIERS = new Set([
    'CommandOrControl',
    'Control',
    'Ctrl',
    'Command',
    'Cmd',
    'Alt',
    'Option',
    'Shift',
    'Super',
    'Meta',
]);

const SHORTCUT_PART_ALIASES = new Map<string, string>([
    ['control', 'Control'],
    ['ctrl', 'Control'],
    ['commandorcontrol', 'CommandOrControl'],
    ['cmdorctrl', 'CommandOrControl'],
    ['command', 'Command'],
    ['cmd', 'Command'],
    ['win', 'Super'],
    ['windows', 'Super'],
    ['super', 'Super'],
    ['alt', 'Alt'],
    ['option', 'Alt'],
    ['shift', 'Shift'],
    ['escape', 'Escape'],
    ['esc', 'Escape'],
    ['space', 'Space'],
    ['spacebar', 'Space'],
    [' ', 'Space'],
    ['arrowup', 'Up'],
    ['up', 'Up'],
    ['arrowdown', 'Down'],
    ['down', 'Down'],
    ['arrowleft', 'Left'],
    ['left', 'Left'],
    ['arrowright', 'Right'],
    ['right', 'Right'],
    ['plus', 'Plus'],
]);

const MODIFIER_ORDER = ['CommandOrControl', 'Control', 'Command', 'Alt', 'Shift', 'Super'];
// Electron 38's documented named accelerator keys. Unknown names must not be
// silently converted into a different shortcut or reach a native registration.
const NAMED_SHORTCUT_KEYS = new Map([
    'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
    'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'VolumeUp', 'VolumeDown', 'VolumeMute',
    'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause', 'PrintScreen',
    'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9', 'numdec', 'numadd', 'numsub', 'nummult', 'numdiv',
].map(key => [key.toLowerCase(), key]));

export type CaptureShortcutResult = { ok: true; shortcut: string } | { ok: false; error: string };

export function normalizeCaptureShortcut(value: unknown, platform: string): CaptureShortcutResult {
    if (typeof value !== 'string') return { ok: false, error: 'Capture shortcut must be text.' };
    const parts = value.split('+').map(part => normalizeShortcutPart(part, platform));
    if (parts.some(part => !part)) return { ok: false, error: 'Use a supported shortcut key.' };
    if (platform !== 'darwin' && parts.includes('Command')) return { ok: false, error: 'Use Ctrl or CommandOrControl on this platform.' };
    const deduped = parts.filter((part, index) => parts.indexOf(part) === index);
    const key = captureShortcutKey(deduped);
    const hasModifier = deduped.some(part => CAPTURE_SHORTCUT_MODIFIERS.has(part));
    if (!key || deduped.filter(part => !CAPTURE_SHORTCUT_MODIFIERS.has(part)).length !== 1) return { ok: false, error: 'Press a shortcut with one letter, number, function key, or named key.' };
    if (!hasModifier) return { ok: false, error: 'Use at least one modifier, such as Ctrl, Alt, Shift, or Command.' };
    return { ok: true, shortcut: orderShortcutParts(deduped).join('+') };
}

// Human-readable form of an Electron accelerator, for menus, tray items, and settings.
export function captureShortcutLabel(shortcut: string, platform: string): string {
    const isMac = platform === 'darwin';
    return (shortcut || DEFAULT_CAPTURE_SHORTCUT)
        .split('+')
        .map(part => shortcutPartLabel(part, isMac))
        .filter(Boolean)
        .join('+');
}

function shortcutPartLabel(part: string, isMac: boolean): string {
    if (part === 'CommandOrControl') return isMac ? 'Cmd' : 'Ctrl';
    if (part === 'Control') return 'Ctrl';
    if (part === 'Command') return 'Cmd';
    if (part === 'Super') return 'Meta';
    return part;
}

function normalizeShortcutPart(part: string, platform: string): string {
    const value = part.trim();
    if (!value) return '';
    const lower = value.toLowerCase().replace(/\s+/g, '');
    if (lower === 'meta') return platform === 'darwin' ? 'Command' : 'Super';
    const alias = SHORTCUT_PART_ALIASES.get(lower);
    if (alias) return alias;
    if (/^f([1-9]|1\d|2[0-4])$/i.test(value)) return value.toUpperCase();
    if (/^[a-z0-9]$/i.test(value)) return value.toUpperCase();
    return NAMED_SHORTCUT_KEYS.get(lower) ?? '';
}

function captureShortcutKey(parts: string[]): string {
    return [...parts].reverse().find(part => !CAPTURE_SHORTCUT_MODIFIERS.has(part)) ?? '';
}

function orderShortcutParts(parts: string[]): string[] {
    const key = captureShortcutKey(parts);
    return MODIFIER_ORDER.filter(part => parts.includes(part)).concat(key ? [key] : []);
}
