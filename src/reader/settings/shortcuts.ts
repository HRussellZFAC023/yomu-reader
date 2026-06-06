export function matchesShortcut(event: KeyboardEvent, shortcut = ''): boolean {
    if (!shortcut) return false;

    const parts = parseShortcut(shortcut);
    const key = parts.key?.toLowerCase();
    if (!key) return false;

    const eventKey = normalizeEventKey(event.key).toLowerCase();

    return eventKey === key
        && shortcutModifiersMatch(event, parts.modifiers);
}

function shortcutModifiersMatch(event: KeyboardEvent, modifiers: Set<string>): boolean {
    return event.altKey === modifiers.has('alt')
        && event.ctrlKey === modifiers.has('ctrl')
        && event.metaKey === modifiers.has('meta')
        && event.shiftKey === modifiers.has('shift');
}

export function formatShortcutEvent(event: KeyboardEvent): string {
    const parts: string[] = [];
    addShortcutModifierParts(parts, event);
    addShortcutKeyPart(parts, normalizeEventKey(event.key));
    return dedupeShortcutParts(parts).join('+');
}

function addShortcutModifierParts(parts: string[], event: KeyboardEvent): void {
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
}

function addShortcutKeyPart(parts: string[], key: string): void {
    if (!isModifierKey(key)) parts.push(key);
}

export function shortcutIsPressed(shortcut = '', event: MouseEvent | KeyboardEvent, pressedKeys = new Set<string>()): boolean {
    if (!shortcut.trim()) return true;
    const parts = parseShortcut(shortcut);
    if (!shortcutModifiersArePressed(parts.modifiers, event)) return false;
    if (!parts.key) return parts.modifiers.size > 0;
    return shortcutKeyIsPressed(parts.key, event, pressedKeys);
}

function shortcutModifiersArePressed(modifiers: Set<string>, event: MouseEvent | KeyboardEvent): boolean {
    return modifiers.has('alt') === event.altKey
        && modifiers.has('ctrl') === event.ctrlKey
        && modifiers.has('meta') === event.metaKey
        && modifiers.has('shift') === event.shiftKey;
}

function shortcutKeyIsPressed(key: string, event: MouseEvent | KeyboardEvent, pressedKeys: Set<string>): boolean {
    const normalized = key.toLowerCase();
    return pressedKeys.has(normalized)
        || ('key' in event && normalizeEventKey(event.key).toLowerCase() === normalized);
}

function parseShortcut(shortcut: string): { key: string; modifiers: Set<string> } {
    const parts = shortcut.split('+').map(part => normalizeShortcutPart(part)).filter(Boolean);
    const modifiers = new Set(parts.filter(isModifierKey).map(part => part.toLowerCase()));
    const key = [...parts].reverse().find(part => !isModifierKey(part)) ?? '';
    return { key: key.toLowerCase(), modifiers };
}

function normalizeShortcutPart(part: string): string {
    const value = part.trim();
    if (!value) return '';
    const lower = value.toLowerCase();
    const alias = shortcutPartAlias(lower);
    if (alias) return alias;
    if (value.length === 1) return value.toUpperCase();
    return value[0]?.toUpperCase() + value.slice(1);
}

function shortcutPartAlias(lower: string): string {
    return SHORTCUT_PART_ALIASES.get(lower) ?? '';
}

const SHORTCUT_PART_ALIASES = new Map<string, string>([
    ['control', 'Ctrl'],
    ['cmd', 'Meta'],
    ['command', 'Meta'],
    ['win', 'Meta'],
    ['windows', 'Meta'],
    ['option', 'Alt'],
    ['esc', 'Escape'],
    ['spacebar', 'Space'],
    [' ', 'Space'],
]);

function normalizeEventKey(key: string): string {
    if (key === ' ') return 'Space';
    return normalizeShortcutPart(key);
}

function isModifierKey(key: string): boolean {
    return key === 'Alt' || key === 'Ctrl' || key === 'Meta' || key === 'Shift';
}

function dedupeShortcutParts(parts: string[]): string[] {
    return parts.filter((part, index) => parts.indexOf(part) === index);
}
