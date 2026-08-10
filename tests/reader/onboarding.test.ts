import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { OnboardingController } from '../../src/reader/app/onboarding';
import { uiText } from '../../src/reader/app/i18n';
import {
    DEFAULT_SETTINGS,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

const PAGE_SCAN_LEGEND = 'Japanese text on webpages';

describe('OnboardingController', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('shows immersion options and keeps Japanese-site navigation opt-in', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            interfaceLanguage: 'en',
            theme: 'light',
            youtubeImmersionEnabled: true,
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

        const youtubeFilter = document.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')!;
        const siteLanguage = document.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]')!;
        const pageScanAuto = document.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="auto"]')!;
        const pageScanManual = document.querySelector<HTMLInputElement>('input[name="pageScanMode"][value="manual"]')!;
        const hoverShortcut = document.querySelector<HTMLInputElement>('input[name="shortcuts.hoverLookup"]')!;
        const scanShortcutLabel = document.querySelector<HTMLElement>('[data-manual-page-scan-shortcut]')!;
        const accentColor = document.querySelector<HTMLInputElement>('input[name="accentColor"]')!;
        const themeSwitch = document.querySelector<HTMLButtonElement>('[data-onboarding-theme-switch]')!;
        const defaultAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#5ea780"]')!;
        const blueAccentSwatch = document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#2563eb"]')!;
        const featureItems = Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li'));
        const featureText = () => Array.from(document.querySelectorAll('.jpdb-reader-onboarding-features > li span'), item => String(item.textContent));
        expect(youtubeFilter.checked).toBe(true);
        expect(siteLanguage.checked).toBe(false);
        expect(pageScanAuto.checked).toBe(true);
        expect(pageScanManual.checked).toBe(false);
        expect(document.body.textContent).toContain(PAGE_SCAN_LEGEND);
        expect(document.body.textContent).toContain('Leave pages unchanged');
        expect(document.body.textContent).toContain('Scan Japanese automatically');
        // b20 guard. Several labels gained a `{language}` token so they can name the
        // learner's own target, and this surface -- the FIRST screen a new user sees --
        // resolved copy with plain uiText, so it printed "{language} text on webpages"
        // verbatim. A raw token anywhere here is worse than the Japanese-only label it
        // replaced, and this catches the next one without naming the key.
        expect(document.body.textContent).not.toMatch(/\{[a-z][A-Za-z]*\}/u);
        expect(document.body.textContent).toContain('Scan only when I ask');
        expect(document.querySelector('.jpdb-reader-onboarding-immersion-grid')).not.toBeNull();
        expect(hoverShortcut.type).toBe('text');
        expect(hoverShortcut.placeholder).toBe('Blank = hover, no key');
        // Scan shortcut only matters in manual mode; it stays hidden until then.
        expect(scanShortcutLabel.hidden).toBe(true);
        expect(document.querySelector('[name="shortcuts.captureScreen"], [data-onboarding-capture-shortcut]')).toBeNull();
        expect(accentColor.value).toBe(DEFAULT_SETTINGS.accentColor);
        expect(themeSwitch.getAttribute('aria-checked')).toBe('false');
        expect(themeSwitch.title).toBe('Switch to dark theme');
        expect(themeSwitch.getAttribute('aria-labelledby')).toBe('jpdb-reader-onboarding-theme-label');
        expect(defaultAccentSwatch.getAttribute('aria-pressed')).toBe('true');
        expect(featureItems).toHaveLength(6);
        expect(featureText()).toContain('Read any image by tapping it.');
        expect(featureText()).toContain('Review words and characters on the study page.');
        expect(featureText()).toContain('Install the Yomu app to use in games or anywhere on the PC.');
        expect(document.querySelector('.jpdb-reader-onboarding-grid > div')).toBeNull();

        youtubeFilter.checked = false;
        youtubeFilter.dispatchEvent(new Event('change', { bubbles: true }));
        siteLanguage.checked = true;
        pageScanManual.checked = true;
        pageScanManual.dispatchEvent(new Event('change', { bubbles: true }));
        expect(scanShortcutLabel.hidden).toBe(false);
        themeSwitch.click();
        expect(settings.theme).toBe('dark');
        expect(themeSwitch.getAttribute('aria-checked')).toBe('true');
        blueAccentSwatch.click();
        expect(accentColor.value).toBe('#2563eb');
        expect(settings.accentColor).toBe('#2563eb');
        accentColor!.value = '#336699';
        accentColor!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(settings.accentColor).toBe('#2563eb');
        accentColor!.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')!.click();
        await settleAsyncHandlers();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.youtubeImmersionEnabled).toBe(false);
        expect(settings.youtubeImmersionEnabledChosen).toBe(true);
        expect(settings.preferJapaneseSiteLanguage).toBe(true);
        expect(settings.manualScanEnabled).toBe(true);
        expect(settings.theme).toBe('dark');
        expect(settings.accentColor).toBe('#336699');
        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toMatchObject({
            youtubeImmersionEnabled: false,
            preferJapaneseSiteLanguage: true,
            manualScanEnabled: true,
            theme: 'dark',
            accentColor: '#336699',
        });
        expect(JSON.parse(
            localStorage.getItem(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)!,
        )).toBe(true);
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
        expect(document.body.textContent).toContain(
            'Download starter dictionaries for this language',
        );
        expect(uiText('ja', 'onboardingInstallOfflineDictionaries'))
            .toBe('この言語のスターター辞書をダウンロード');

        document.querySelector<HTMLButtonElement>('[data-onboarding-action="api-key"]')?.click();
        await settleAsyncHandlers();

        expect(installOfflineDictionaries).toHaveBeenCalledTimes(1);
        // The API-key path must not switch local dictionaries off while the
        // offline download it just requested is installing them.
        expect(settings.localDictionariesEnabled).toBe(true);
    });

    it('keeps first-run dictionary progress visible in Reader and Study after onboarding closes', () => {
        for (const sourcePath of ['src/reader/app/main.ts', 'src/reader/newtab/runtime.ts']) {
            const source = readFileSync(sourcePath, 'utf8');
            expect(source).toContain('onProgress: message => this.toast(message)');
        }
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

    it('does not offer to replace new tabs in extension or userscript onboarding', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: vi.fn(),
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        expect(document.querySelector('input[name="newTabEnabled"]')).toBeNull();
        expect(document.body.textContent).not.toContain('Set Study as the new tab');
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
