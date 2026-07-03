import { describe, expect, it } from 'vitest';

import { normalizeReaderSettings } from '../../src/reader/settings/index';
import { shortcutIsPressed } from '../../src/reader/settings/shortcuts';

// popupActivationMode 'modifier' promises "hover lookup only while a modifier is
// held". An empty hoverLookup shortcut makes shortcutIsPressed() match every
// event, silently turning modifier mode into plain hover mode, so the
// normalizer must never let 'modifier' resolve with a blank shortcut.
describe('modifier-mode hover shortcut backfill', () => {
    it('backfills Shift for a bare modifier-mode payload with no shortcuts object', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'modifier' });

        expect(settings.shortcuts.hoverLookup).toBe('Shift');
        expect(settings.lookupOnHover).toBe(true);
    });

    it('derives the modifier from the legacy scanModifierKey when present', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'modifier', scanModifierKey: 'alt' });

        expect(settings.shortcuts.hoverLookup).toBe('Alt');
    });

    it('backfills when a shortcuts object exists without hoverLookup and no legacy modifier', () => {
        const settings = normalizeReaderSettings({ popupActivationMode: 'modifier', shortcuts: {} as never });

        expect(settings.shortcuts.hoverLookup).toBe('Shift');
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

    it('documents why a blank shortcut is dangerous: it matches every pointer event', () => {
        expect(shortcutIsPressed('', new MouseEvent('mousemove'))).toBe(true);
    });
});
