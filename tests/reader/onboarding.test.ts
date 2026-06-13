import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../src/reader/app/onboarding';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

describe('OnboardingController', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('shows default-on immersion options and saves first-run choices', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            youtubeImmersionEnabled: true,
            preferJapaneseSiteLanguage: true,
        };
        const setSettings = vi.fn((nextSettings: ReaderSettings) => {
            settings = nextSettings;
        });
        const showSettings = vi.fn();
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings,
            showSettings,
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const youtubeFilter = document.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]');
        const siteLanguage = document.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]');
        const accentColor = document.querySelector<HTMLInputElement>('input[name="accentColor"]');
        const defaultAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#5ea780"]');
        const blueAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#2563eb"]');
        expect(youtubeFilter?.checked).toBe(true);
        expect(siteLanguage?.checked).toBe(true);
        expect(accentColor?.value).toBe(DEFAULT_SETTINGS.accentColor);
        expect(defaultAccentSwatch?.getAttribute('aria-pressed')).toBe('true');

        youtubeFilter!.checked = false;
        siteLanguage!.checked = false;
        blueAccentSwatch!.click();
        expect(accentColor?.value).toBe('#2563eb');
        expect(settings.accentColor).toBe('#2563eb');
        accentColor!.value = '#336699';
        accentColor!.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await settleAsyncHandlers();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.youtubeImmersionEnabled).toBe(false);
        expect(settings.preferJapaneseSiteLanguage).toBe(false);
        expect(settings.accentColor).toBe('#336699');
        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
            youtubeImmersionEnabled: false,
            preferJapaneseSiteLanguage: false,
            accentColor: '#336699',
        });
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
