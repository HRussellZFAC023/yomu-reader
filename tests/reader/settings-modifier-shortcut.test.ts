import { describe, expect, it } from 'vitest';

import { normalizeReaderSettings } from '../../src/reader/settings/index';
import { shortcutIsPressed } from '../../src/reader/settings/shortcuts';

describe('current hover shortcut normalization', () => {
    it('uses the current default when no shortcuts object exists', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'modifier' });

        expect(settings.shortcuts.hoverLookup).toBe('');
        expect(settings.lookupOnHover).toBe(true);
    });

    it('ignores scanModifierKey when normalizing current shortcuts', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'modifier', scanModifierKey: 'alt' });

        expect(settings.shortcuts.hoverLookup).toBe('');
    });

    it('uses the current default when hoverLookup is absent', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'modifier', shortcuts: {} as never });

        expect(settings.shortcuts.hoverLookup).toBe('');
    });

    it('keeps an explicitly configured hoverLookup shortcut', () => {
        const settings = normalizeReaderSettings({
            popupActivationMode: 'modifier',
            shortcuts: { hoverLookup: 'Ctrl' } as never,
        });

        expect(settings.shortcuts.hoverLookup).toBe('Ctrl');
    });

    it('does not force a modifier onto plain hover mode', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'hover' });

        expect(settings.shortcuts.hoverLookup).toBe('');
    });

    it('keeps a deliberately CLEARED hoverLookup shortcut cleared', () => {
        const settings = normalizeReaderSettings({
            popupActivationMode: 'modifier',
            shortcuts: { hoverLookup: '' } as never,
        });

        expect(settings.shortcuts.hoverLookup).toBe('');
        // Idempotent: normalizing the result again must not resurrect it either,
        // which is what made this survive a save/load cycle and a version update.
        expect(normalizeReaderSettings(settings).shortcuts.hoverLookup).toBe('');
    });

    it('documents why a blank shortcut is dangerous: it matches every pointer event', () => {
        expect(shortcutIsPressed('', new MouseEvent('mousemove'))).toBe(true);
    });
});
