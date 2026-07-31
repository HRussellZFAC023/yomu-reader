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

    // GitHub #36 (mirrormc): "After saving the change the userscript would apply the
    // change for a very short amount of time (seconds) before reverting back to the
    // Shift popover functionality... After updating to v1.8.57 it once again set my
    // popover hotkey to Shift."
    //
    // Clearing the shortcut is a real choice and it is INDISTINGUISHABLE from never
    // setting one if you only look at the value: both are ''. The backfill tested the
    // emptiness of its own RESULT, so it re-minted Shift inside every save and every
    // load for anyone who deliberately cleared it. An explicitly stored '' has to
    // survive, while a legacy payload that never stored one still resolves to a key.
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
