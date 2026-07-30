import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPreferredJapaneseSiteLanguage, installPreferredJapaneseSiteLanguageFromStoredSettings, preferredJapaneseSiteUrl } from '../../src/reader/app/preferred-site-language';

type CompanionWindow = Window & { __yomuCompanions?: Record<string, unknown> };

function setVideoSlot(slot: Record<string, unknown> | undefined): void {
    const target = window as CompanionWindow;
    target.__yomuCompanions = slot === undefined ? {} : { video: slot };
}

afterEach(() => {
    delete (window as CompanionWindow).__yomuCompanions;
});

// The core wrapper must dispatch to the video companion when present and be
// inert — never throw — when the companion is missing (ADR-0003 degradation).
describe('preferred-site-language companion wrapper', () => {
    it('dispatches to the registered video companion', () => {
        const install = vi.fn();
        const apply = vi.fn();
        const url = vi.fn(() => 'https://example.jp/');
        setVideoSlot({
            installPreferredJapaneseSiteLanguageFromStoredSettings: install,
            applyPreferredJapaneseSiteLanguage: apply,
            preferredJapaneseSiteUrl: url,
        });
        installPreferredJapaneseSiteLanguageFromStoredSettings();
        applyPreferredJapaneseSiteLanguage(true, true);
        expect(preferredJapaneseSiteUrl('https://example.com/')).toBe('https://example.jp/');
        expect(install).toHaveBeenCalledOnce();
        expect(apply).toHaveBeenCalledWith(true, true, false, 'ja');
        expect(url).toHaveBeenCalledWith('https://example.com/', undefined);

        applyPreferredJapaneseSiteLanguage(true, false, false, 'es');
        expect(apply).toHaveBeenLastCalledWith(true, false, false, 'es');
    });

    it('is inert without the video companion', () => {
        setVideoSlot(undefined);
        expect(() => installPreferredJapaneseSiteLanguageFromStoredSettings()).not.toThrow();
        expect(() => applyPreferredJapaneseSiteLanguage(false)).not.toThrow();
        expect(preferredJapaneseSiteUrl('https://example.com/')).toBeNull();
    });
});
