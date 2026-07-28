import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SETTINGS,
    readFormSettings,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
} from './fixtures';

describe('subtitle overlay visibility choices', () => {
    registerSettingsFormCleanup();

    it('remembers that the user unchecked "Show native subtitles" so an automatic track cannot re-enable it', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: true, subtitleSecondaryVisibleChosen: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleSecondaryVisible"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleSecondaryVisible).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(true);
    });

    it('remembers an unchecked subtitle overlay the same way', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleOverlayVisible: true, subtitleOverlayVisibleChosen: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleOverlayVisible"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleOverlayVisible).toBe(false);
        expect(saved.subtitleOverlayVisibleChosen).toBe(true);
    });

    it('leaves untouched overlay visibilities open to the automatic reveal', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleOverlayVisible: false, subtitleSecondaryVisible: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleKaraokeMode"]')!.checked = false;

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleKaraokeMode).toBe(false);
        expect(saved.subtitleOverlayVisibleChosen).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(false);
    });

    it('keeps an earlier choice recorded when a later save does not touch the checkbox', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: false, subtitleSecondaryVisibleChosen: true };
        const form = renderSettingsTestForm(current);

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleSecondaryVisible).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(true);
    });
});
