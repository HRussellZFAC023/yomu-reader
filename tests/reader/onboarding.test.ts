import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../src/reader/onboarding';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

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
        expect(youtubeFilter?.checked).toBe(true);
        expect(siteLanguage?.checked).toBe(true);

        youtubeFilter!.checked = false;
        siteLanguage!.checked = false;
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await settleAsyncHandlers();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.youtubeImmersionEnabled).toBe(false);
        expect(settings.preferJapaneseSiteLanguage).toBe(false);
        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
            youtubeImmersionEnabled: false,
            preferJapaneseSiteLanguage: false,
        });
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
