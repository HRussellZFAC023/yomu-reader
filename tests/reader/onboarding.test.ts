import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../src/reader/app/onboarding';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

const AMBIGUOUS_SCAN_COPY = ['Manual scan', 'only'].join(' ');

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
            interfaceLanguage: 'en',
            theme: 'light',
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
            parseJapanese: vi.fn(),
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const youtubeFilter = document.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]');
        const siteLanguage = document.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]');
        const hoverShortcut = document.querySelector<HTMLInputElement>('input[name="shortcuts.hoverLookup"]');
        const manualPageScanShortcut = document.querySelector<HTMLInputElement>('input[name="shortcuts.scanPage"]');
        const pageScanMode = () => document.querySelector<HTMLInputElement>('input[name="pageScanMode"]:checked')?.value;
        const ocrMode = () => document.querySelector<HTMLInputElement>('input[name="ocrInteractionMode"]:checked')?.value;
        const accentColor = document.querySelector<HTMLInputElement>('input[name="accentColor"]');
        const themeSwitch = document.querySelector<HTMLButtonElement>('[data-onboarding-theme-switch]');
        const defaultAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#5ea780"]');
        const blueAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#2563eb"]');
        const featureItems = Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li'));
        const featureTitles = () => Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li strong'), item => item.textContent);
        const featureText = () => Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li span'), item => item.textContent);
        expect(youtubeFilter?.checked).toBe(true);
        expect(siteLanguage?.checked).toBe(true);
        expect(hoverShortcut?.type).toBe('text');
        expect(hoverShortcut?.value).toBe(DEFAULT_SETTINGS.shortcuts.hoverLookup);
        expect(hoverShortcut?.placeholder).toBe('Blank means hover without a key');
        expect(hoverShortcut?.dataset.shortcutInput).toBe('true');
        expect(pageScanMode()).toBe('auto');
        expect(ocrMode()).toBe('auto');
        expect(manualPageScanShortcut?.value).toBe(DEFAULT_SETTINGS.shortcuts.scanPage);
        expect(manualPageScanShortcut?.closest('label')?.hidden).toBe(true);
        expect(document.body.textContent).toContain('Page scanning');
        expect(document.body.textContent).toContain('Image OCR scanning');
        expect(document.body.textContent).not.toContain(AMBIGUOUS_SCAN_COPY);
        expect(document.querySelector('.jpdb-reader-onboarding-immersion-grid')).not.toBeNull();
        expect(document.querySelector('[name="shortcuts.captureScreen"], [data-onboarding-capture-shortcut]')).toBeNull();
        expect(accentColor?.value).toBe(DEFAULT_SETTINGS.accentColor);
        expect(themeSwitch?.getAttribute('aria-checked')).toBe('false');
        expect(themeSwitch?.title).toBe('Switch to dark theme');
        expect(themeSwitch?.getAttribute('aria-labelledby')).toBe('jpdb-reader-onboarding-theme-label');
        expect(defaultAccentSwatch?.getAttribute('aria-pressed')).toBe('true');
        expect(featureItems).toHaveLength(6);
        expect(featureTitles()).toContain('Game');
        expect(featureText()).toContain('Read any image by tapping it.');
        expect(featureText()).toContain('Review words and kanji on the study page.');
        expect(featureText()).toContain('Install the Yomu app to use in games or anywhere on the PC.');
        expect(document.querySelector('.jpdb-reader-onboarding-grid > div')).toBeNull();

        youtubeFilter!.checked = false;
        siteLanguage!.checked = false;
        document.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="manual"]')!.click();
        expect(manualPageScanShortcut?.closest('label')?.hidden).toBe(false);
        document.querySelector<HTMLInputElement>('input[name="ocrInteractionMode"][value="manual"]')!.click();
        hoverShortcut!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
        expect(hoverShortcut?.value).toBe('Shift');
        manualPageScanShortcut!.dispatchEvent(new KeyboardEvent('keydown', { key: 'J', altKey: true, bubbles: true }));
        expect(manualPageScanShortcut?.value).toBe('Alt+J');
        themeSwitch!.click();
        expect(settings.theme).toBe('dark');
        expect(themeSwitch?.getAttribute('aria-checked')).toBe('true');
        blueAccentSwatch!.click();
        expect(accentColor?.value).toBe('#2563eb');
        expect(settings.accentColor).toBe('#2563eb');
        accentColor!.value = '#336699';
        accentColor!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(settings.accentColor).toBe('#2563eb');
        accentColor!.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await settleAsyncHandlers();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.youtubeImmersionEnabled).toBe(false);
        expect(settings.preferJapaneseSiteLanguage).toBe(false);
        expect(settings.annotationsPaused).toBe(false);
        expect(settings.manualScanEnabled).toBe(true);
        expect(settings.ocrEnabled).toBe(true);
        expect(settings.ocrAutoScanImages).toBe(false);
        expect(settings.shortcuts.hoverLookup).toBe('Shift');
        expect(settings.shortcuts.scanPage).toBe('Alt+J');
        expect(settings.theme).toBe('dark');
        expect(settings.accentColor).toBe('#336699');
        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
            youtubeImmersionEnabled: false,
            preferJapaneseSiteLanguage: false,
            annotationsPaused: false,
            manualScanEnabled: true,
            ocrEnabled: true,
            ocrAutoScanImages: false,
            shortcuts: expect.objectContaining({ hoverLookup: 'Shift', scanPage: 'Alt+J' }),
            theme: 'dark',
            accentColor: '#336699',
        });
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
