import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { OnboardingController } from '../../src/reader/app/onboarding';
import { uiText } from '../../src/reader/app/i18n';
import {
    DEFAULT_SETTINGS,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings/index';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import type { ReaderSettings } from '../../src/reader/app/types';

const PAGE_SCAN_LEGEND = 'Japanese text on webpages';

function offlineDictionaryOnboardingHarness(): {
    controller: OnboardingController;
    installOfflineDictionaries: ReturnType<typeof vi.fn>;
    settings: () => ReaderSettings;
} {
    let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
    const installOfflineDictionaries = vi.fn();
    const controller = new OnboardingController({
        getSettings: () => settings,
        setSettings: nextSettings => { settings = nextSettings; },
        showSettings: vi.fn(),
        parseJapanese: vi.fn(),
        installOfflineDictionaries,
    });
    return { controller, installOfflineDictionaries, settings: () => settings };
}

describe('OnboardingController', () => {
    beforeEach(() => {
        vi.stubGlobal('location', new URL('moz-extension://yomu/newtab/index.html'));
    });

    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('requires an explicit target before showing target-owned options or completing', async () => {
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
        const parseJapanese = vi.fn();
        const installOfflineDictionaries = vi.fn();
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings,
            showSettings,
            parseJapanese,
            installOfflineDictionaries,
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const targetLanguage = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        const targetOwnedOptions = document.querySelector<HTMLFieldSetElement>('.jpdb-reader-onboarding-options')!;
        const completeButton = document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')!;
        expect(targetLanguage.value).toBe('');
        expect(targetLanguage.selectedOptions[0]?.textContent).toBe('Choose a learning language…');
        expect(targetOwnedOptions.hidden).toBe(true);
        expect(targetOwnedOptions.disabled).toBe(true);
        expect(completeButton.disabled).toBe(true);
        expect(parseJapanese).not.toHaveBeenCalled();
        expect(installOfflineDictionaries).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('your learning language');
        let completionResolved = false;
        void controller.waitForCompletion().then(() => { completionResolved = true; });
        await Promise.resolve();
        expect(completionResolved).toBe(false);

        targetLanguage.value = 'ja';
        targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

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
        expect(targetOwnedOptions.hidden).toBe(false);
        expect(targetOwnedOptions.disabled).toBe(false);
        expect(completeButton.disabled).toBe(false);
        expect(parseJapanese).toHaveBeenCalled();
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
        await controller.waitForCompletion();

        expect(settings.onboardingSeen).toBe(true);
        expect(settings.learningTargetChosen).toBe(true);
        expect(settings.youtubeImmersionEnabled).toBe(false);
        expect(settings.youtubeImmersionEnabledChosen).toBe(true);
        expect(settings.preferJapaneseSiteLanguage).toBe(true);
        expect(settings.manualScanEnabled).toBe(true);
        expect(settings.theme).toBe('dark');
        expect(settings.accentColor).toBe('#336699');
        expect(completionResolved).toBe(true);
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

    it('dismisses without choosing, keeps Yomu inert, and asks again later', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, onboardingSeen: false, interfaceLanguage: 'en' };
        const setSettings = vi.fn((next: ReaderSettings) => { settings = next; });
        const parseJapanese = vi.fn();
        const installOfflineDictionaries = vi.fn();
        const hostAction = document.createElement('button');
        const hostClicked = vi.fn();
        hostAction.addEventListener('click', hostClicked);
        document.body.append(hostAction);
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings,
            showSettings: vi.fn(),
            parseJapanese,
            installOfflineDictionaries,
        });

        await controller.showIfNeeded();
        const completion = controller.waitForCompletion();
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')!.click();
        await completion;

        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(setSettings).not.toHaveBeenCalled();
        expect(parseJapanese).not.toHaveBeenCalled();
        expect(installOfflineDictionaries).not.toHaveBeenCalled();
        expect(settings).toMatchObject({ onboardingSeen: false, learningTargetChosen: false });
        hostAction.click();
        expect(hostClicked).toHaveBeenCalledTimes(1);

        await expect(controller.showIfNeeded()).resolves.toBe(true);
        expect(document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('');
    });

    it('records live previews and the completed target profile as explicit intent', async () => {
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            learningTargetChosen: false,
            interfaceLanguage: 'en',
            theme: 'light',
        };
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: nextSettings => { settings = nextSettings; },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });

        await controller.showIfNeeded();
        let interfaceLanguage = document.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
        interfaceLanguage.value = 'ja';
        interfaceLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector<HTMLButtonElement>('[data-onboarding-theme-switch]')!.click();
        document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#2563eb"]')!.click();
        const dismissed = controller.waitForCompletion();
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')!.click();
        await dismissed;
        expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBeNull();

        await controller.showIfNeeded();
        const learnerLanguage = document.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;
        learnerLanguage.value = 'ko';
        learnerLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        chooseOnboardingTarget('es');
        interfaceLanguage = document.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
        interfaceLanguage.value = 'en';
        interfaceLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector<HTMLButtonElement>('[data-onboarding-theme-switch]')!.click();
        document.querySelector<HTMLButtonElement>('[data-onboarding-accent="#5ea780"]')!.click();
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')!.click();
        await settleAsyncHandlers();
        await controller.waitForCompletion();

        const activeProfile = settings.languageProfiles.find(profile => profile.id === settings.activeLanguageProfileId);
        expect(activeProfile).toMatchObject({
            learnerLanguage: 'ko',
            targetLanguage: 'es',
            uiLocale: 'en',
        });
        const ledger = JSON.parse(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY) ?? '{}');
        expect(ledger.records).toMatchObject({
            interfaceLanguage: { value: 'en' },
            theme: { value: 'light' },
            accentColor: { value: '#5ea780' },
            learningTargetChosen: { value: true },
            activeLanguageProfileId: { value: settings.activeLanguageProfileId },
            languageProfiles: { seq: expect.any(Number) },
        });
    });

    it.each([
        { enabled: true, expectedDownloads: 1 },
        { enabled: false, expectedDownloads: 0 },
    ])('honours offline dictionary download choice $enabled', async ({ enabled, expectedDownloads }) => {
        const { controller, installOfflineDictionaries, settings } = offlineDictionaryOnboardingHarness();

        await expect(controller.showIfNeeded()).resolves.toBe(true);
        chooseOnboardingTarget('ja');

        const offlineDownload = document.querySelector<HTMLInputElement>('input[name="onboardingInstallOfflineDictionaries"]');
        expect(offlineDownload?.checked).toBe(true);
        expect(document.body.textContent).toContain(
            'Download starter dictionaries for this language',
        );
        expect(uiText('ja', 'onboardingInstallOfflineDictionaries'))
            .toBe('この言語のスターター辞書をダウンロード');

        offlineDownload!.checked = enabled;
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="api-key"]')?.click();
        await settleAsyncHandlers();

        expect(installOfflineDictionaries).toHaveBeenCalledTimes(expectedDownloads);
        // The API-key path must not switch local dictionaries off while the
        // offline download it just requested is installing them.
        expect(settings().localDictionariesEnabled).toBe(enabled);
    });

    it('keeps first-run dictionary progress visible in Reader and Study after onboarding closes', () => {
        const controller = readFileSync('src/reader/dictionaries/offline-setup-controller.ts', 'utf8');
        expect(controller).toContain('onProgress: this.options.notify');
        for (const sourcePath of ['src/reader/app/main.ts', 'src/reader/newtab/runtime.ts']) {
            const source = readFileSync(sourcePath, 'utf8');
            expect(source).toContain('notify: message => this.toast(message)');
        }
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

function chooseOnboardingTarget(target: string): void {
    const select = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
    select.value = target;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}
