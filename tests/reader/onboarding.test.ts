import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../src/reader/app/onboarding';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

const PAGE_SCAN_LEGEND = 'Page scanning';

describe('OnboardingController', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
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
        const pageScanAuto = document.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="auto"]');
        const pageScanManual = document.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="manual"]');
        const hoverShortcut = document.querySelector<HTMLInputElement>('input[name="shortcuts.hoverLookup"]');
        const scanShortcutLabel = document.querySelector<HTMLElement>('[data-manual-page-scan-shortcut]');
        const accentColor = document.querySelector<HTMLInputElement>('input[name="accentColor"]');
        const themeSwitch = document.querySelector<HTMLButtonElement>('[data-onboarding-theme-switch]');
        const defaultAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#5ea780"]');
        const blueAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#2563eb"]');
        const featureItems = Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li'));
        const featureText = () => Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li span'), item => item.textContent);
        expect(youtubeFilter?.checked).toBe(true);
        expect(siteLanguage?.checked).toBe(true);
        expect(pageScanAuto?.checked).toBe(true);
        expect(pageScanManual?.checked).toBe(false);
        expect(document.body.textContent).toContain(PAGE_SCAN_LEGEND);
        expect(document.querySelector('.jpdb-reader-onboarding-immersion-grid')).not.toBeNull();
        expect(hoverShortcut?.type).toBe('text');
        expect(hoverShortcut?.placeholder).toBe('Blank = hover, no key');
        // Scan shortcut only matters in manual mode; it stays hidden until then.
        expect(scanShortcutLabel?.hidden).toBe(true);
        expect(document.querySelector('[name="shortcuts.captureScreen"], [data-onboarding-capture-shortcut]')).toBeNull();
        expect(accentColor?.value).toBe(DEFAULT_SETTINGS.accentColor);
        expect(themeSwitch?.getAttribute('aria-checked')).toBe('false');
        expect(themeSwitch?.title).toBe('Switch to dark theme');
        expect(themeSwitch?.getAttribute('aria-labelledby')).toBe('jpdb-reader-onboarding-theme-label');
        expect(defaultAccentSwatch?.getAttribute('aria-pressed')).toBe('true');
        expect(featureItems).toHaveLength(6);
        expect(featureText()).toContain('Read any image by tapping it.');
        expect(featureText()).toContain('Review words and kanji on the study page.');
        expect(featureText()).toContain('Install the Yomu app to use in games or anywhere on the PC.');
        expect(document.querySelector('.jpdb-reader-onboarding-grid > div')).toBeNull();

        youtubeFilter!.checked = false;
        siteLanguage!.checked = false;
        pageScanManual!.checked = true;
        pageScanManual!.dispatchEvent(new Event('change', { bubbles: true }));
        expect(scanShortcutLabel?.hidden).toBe(false);
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
        expect(settings.manualScanEnabled).toBe(true);
        expect(settings.theme).toBe('dark');
        expect(settings.accentColor).toBe('#336699');
        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
            youtubeImmersionEnabled: false,
            preferJapaneseSiteLanguage: false,
            manualScanEnabled: true,
            theme: 'dark',
            accentColor: '#336699',
        });
    });

    it('offers a default-on offline dictionary download and starts it on completion', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
        const installOfflineDictionaries = vi.fn();
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: nextSettings => {
                settings = nextSettings;
            },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
            installOfflineDictionaries,
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const offlineDownload = document.querySelector<HTMLInputElement>('input[name="onboardingInstallOfflineDictionaries"]');
        expect(offlineDownload?.checked).toBe(true);
        expect(document.body.textContent).toContain('Download offline dictionaries (Jitendex + pitch accents)');

        document.querySelector<HTMLButtonElement>('[data-onboarding-action="api-key"]')?.click();
        await settleAsyncHandlers();

        expect(installOfflineDictionaries).toHaveBeenCalledTimes(1);
        // The API-key path must not switch local dictionaries off while the
        // offline download it just requested is installing them.
        expect(settings.localDictionariesEnabled).toBe(true);
    });

    it('skips the offline download when the user unchecks it', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
        const installOfflineDictionaries = vi.fn();
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: nextSettings => {
                settings = nextSettings;
            },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
            installOfflineDictionaries,
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const offlineDownload = document.querySelector<HTMLInputElement>('input[name="onboardingInstallOfflineDictionaries"]');
        offlineDownload!.checked = false;
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="api-key"]')?.click();
        await settleAsyncHandlers();

        expect(installOfflineDictionaries).not.toHaveBeenCalled();
        expect(settings.localDictionariesEnabled).toBe(false);
    });

    it('requires an explicit welcome-screen opt-in before enabling Study for new tabs', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en', newTabEnabled: true };
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: nextSettings => {
                settings = nextSettings;
            },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const newTabToggle = document.querySelector<HTMLInputElement>('input[name="newTabEnabled"]');
        expect(newTabToggle).not.toBeNull();
        expect(newTabToggle?.checked).toBe(false);
        expect(document.body.textContent).toContain('Set Study as the new tab');

        newTabToggle!.checked = true;
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await settleAsyncHandlers();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.newTabEnabled).toBe(true);
    });

    it('leaves Study off when an extension user completes welcome without opting in', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: nextSettings => {
                settings = nextSettings;
            },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });

        await controller.showIfNeeded();
        expect(document.querySelector<HTMLInputElement>('input[name="newTabEnabled"]')?.checked).toBe(false);
        document.querySelector<HTMLInputElement>('input[name="onboardingInstallOfflineDictionaries"]')!.checked = false;
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await settleAsyncHandlers();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.newTabEnabled).toBe(false);
    });

    it('hides the new-tab toggle for userscript builds (cannot override the browser new tab)', async () => {
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: vi.fn(),
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        expect(document.querySelector('input[name="newTabEnabled"]')).toBeNull();
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
