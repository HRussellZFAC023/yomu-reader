import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SETTINGS,
    readFormSettings,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
} from './fixtures';

describe('subtitle overlay visibility choices', () => {
    registerSettingsFormCleanup();

    it('shows the preferred reveal mode before an automatic native track is available', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            subtitleSecondaryVisible: false,
            subtitleSecondaryVisibleChosen: false,
            subtitleNativeBlurred: true,
        });

        expect(form.querySelector<HTMLSelectElement>('select[name="subtitleNativeDisplay"]')?.value).toBe('blurred');
    });

    it('remembers that the user chose "Hide completely" so an automatic track cannot re-enable it', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: true, subtitleSecondaryVisibleChosen: false };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLSelectElement>('select[name="subtitleNativeDisplay"]')!.value = 'hidden';

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleSecondaryVisible).toBe(false);
        expect(saved.subtitleSecondaryVisibleChosen).toBe(true);
    });

    it('stores the three native-translation choices without adding a duplicate mode key', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleSecondaryVisible: true, subtitleNativeBlurred: true };
        const form = renderSettingsTestForm(current);
        const mode = form.querySelector<HTMLSelectElement>('select[name="subtitleNativeDisplay"]')!;

        mode.value = 'shown';
        let saved = readFormSettings(new FormData(form), current);
        expect(saved.subtitleSecondaryVisible).toBe(true);
        expect(saved.subtitleNativeBlurred).toBe(false);

        mode.value = 'blurred';
        saved = readFormSettings(new FormData(form), current);
        expect(saved.subtitleSecondaryVisible).toBe(true);
        expect(saved.subtitleNativeBlurred).toBe(true);
    });

    it('clamps the persisted native subtitle concealment strength', () => {
        const current = { ...DEFAULT_SETTINGS, subtitleNativeBlurStrength: 12 };
        const form = renderSettingsTestForm(current);
        form.querySelector<HTMLInputElement>('input[name="subtitleNativeBlurStrength"]')!.value = '99';

        const saved = readFormSettings(new FormData(form), current);

        expect(saved.subtitleNativeBlurStrength).toBe(20);
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
