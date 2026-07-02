import { APP_NAME } from './constants';
import { readerWordSurfaceText, setInnerHtml } from '../dom/index';
import { uiText, type UiCopyKey } from './i18n';
import { Logger } from './logger';
import { defaultDictionaryLookupLinks, sanitizeAccentColor, saveSettings } from '../settings/index';
import type { InterfaceLanguage, ReaderSettings } from './types';

const log = Logger.scope('Onboarding');
const ONBOARDING_ACCENT_SWATCHES = ['#5ea780', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2'] as const;
const ONBOARDING_FEATURE_KEYS = [
    ['featureText', 'featureTextBody'],
    ['featureImages', 'featureImagesBody'],
    ['featureVideo', 'featureVideoBody'],
    ['featureControl', 'featureControlBody'],
    ['featureStudy', 'featureStudyBody'],
] as const satisfies readonly (readonly [UiCopyKey, UiCopyKey])[];

interface OnboardingOptions {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    showSettings: (panel?: string) => void;
    // Annotates the welcome panel's Japanese with furigana + pitch through the
    // same nested-parse path that handles popovers/settings chrome.
    parseJapanese: (panel: HTMLElement) => void;
    lookupText?: (text: string, sentence: string, anchor: HTMLElement) => void;
    // Fire-and-forget background download of the default offline parsing
    // dictionaries (terms + pitch); progress and errors surface via toasts.
    installOfflineDictionaries?: () => void;
}

function selectedOnboardingLanguage(value: string | undefined, fallback: InterfaceLanguage): InterfaceLanguage {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : fallback;
}

export class OnboardingController {
    private panel?: HTMLElement;
    private backdrop?: HTMLElement;
    private languageSelect?: HTMLSelectElement;
    private themeSwitch?: HTMLButtonElement;
    private accentColorInput?: HTMLInputElement;
    private pendingAccentPreviewColor?: string;
    private accentPreviewFrame?: number;
    private youtubeImmersionInput?: HTMLInputElement;
    private preferJapaneseSiteLanguageInput?: HTMLInputElement;
    private manualScanInput?: HTMLInputElement;
    private offlineDictionariesInput?: HTMLInputElement;

    constructor(private readonly options: OnboardingOptions) {}

    async showIfNeeded(): Promise<boolean> {
        if (this.options.getSettings().onboardingSeen) {
            return false;
        }
        this.show();
        return true;
    }

    private show(): void {
        log.info('Showing onboarding', { language: this.options.getSettings().interfaceLanguage });
        this.close();
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'jpdb-reader-backdrop jpdb-reader-onboarding-backdrop';
        this.backdrop.dataset.jpdbReaderRoot = 'true';

        this.panel = document.createElement('section');
        // jpdb-reader-parseable opts the welcome panel into the nested furigana
        // + pitch parse (it is otherwise excluded from scanning as reader root).
        this.panel.className = 'jpdb-reader-onboarding jpdb-reader-parseable';
        this.panel.dataset.jpdbReaderRoot = 'true';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-label', uiText(this.options.getSettings().interfaceLanguage, 'welcomeLabel'));
        this.panel.tabIndex = -1;

        const closeButton = button('');
        closeButton.className = 'jpdb-reader-icon-mini jpdb-reader-onboarding-close';
        closeButton.dataset.onboardingAction = 'close';
        closeButton.title = uiText(this.options.getSettings().interfaceLanguage, 'closeOnboarding');
        closeButton.setAttribute('aria-label', uiText(this.options.getSettings().interfaceLanguage, 'closeOnboarding'));
        setInnerHtml(closeButton, closeIcon());
        closeButton.addEventListener('click', () => void this.complete(false));

        const eyebrow = element('div', 'jpdb-reader-onboarding-eyebrow', uiText(this.options.getSettings().interfaceLanguage, 'onboardingEyebrow'));
        const title = element('h2', '', APP_NAME);
        const copy = element(
            'p',
            '',
            uiText(this.options.getSettings().interfaceLanguage, 'onboardingCopy'),
        );
        const featureList = document.createElement('ul');
        featureList.className = 'jpdb-reader-onboarding-features';
        ONBOARDING_FEATURE_KEYS.forEach(([headingKey, textKey]) => {
            const item = document.createElement('li');
            item.append(
                element('strong', '', uiText(this.options.getSettings().interfaceLanguage, headingKey)),
                element('span', '', uiText(this.options.getSettings().interfaceLanguage, textKey)),
            );
            featureList.append(item);
        });

        const language = document.createElement('label');
        language.className = 'jpdb-reader-onboarding-language';
        const languageText = element('span', '', uiText(this.options.getSettings().interfaceLanguage, 'onboardingLanguage'));
        this.languageSelect = document.createElement('select');
        this.languageSelect.name = 'interfaceLanguage';
        [
            ['auto', uiText(this.options.getSettings().interfaceLanguage, 'automatic')],
            ['en', uiText(this.options.getSettings().interfaceLanguage, 'english')],
            ['ja', uiText(this.options.getSettings().interfaceLanguage, 'japanese')],
        ].forEach(([value, text]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            option.selected = value === this.options.getSettings().interfaceLanguage;
            this.languageSelect?.append(option);
        });
        language.append(languageText, this.languageSelect);

        const preferences = document.createElement('div');
        preferences.className = 'jpdb-reader-onboarding-preferences';
        preferences.append(language, this.createThemeToggle());

        const accentPicker = document.createElement('fieldset');
        accentPicker.className = 'jpdb-reader-onboarding-accent';
        const accentLegend = document.createElement('legend');
        accentLegend.textContent = uiText(this.options.getSettings().interfaceLanguage, 'onboardingAccentColor');
        const swatches = document.createElement('div');
        swatches.className = 'jpdb-reader-onboarding-swatches';
        ONBOARDING_ACCENT_SWATCHES.forEach(color => {
            const swatch = button('');
            swatch.className = 'jpdb-reader-onboarding-swatch';
            swatch.dataset.onboardingAccent = color;
            swatch.style.setProperty('--jpdb-reader-onboarding-swatch', color);
            swatch.setAttribute('aria-label', onboardingAccentLabel(this.options.getSettings().interfaceLanguage, color));
            swatch.title = onboardingAccentLabel(this.options.getSettings().interfaceLanguage, color);
            swatch.addEventListener('click', () => this.applyAccentChoice(color));
            swatches.append(swatch);
        });
        const customAccent = document.createElement('label');
        customAccent.className = 'jpdb-reader-onboarding-custom-accent';
        const customAccentText = document.createElement('span');
        customAccentText.dataset.onboardingCopy = 'customAccentColor';
        customAccentText.textContent = uiText(this.options.getSettings().interfaceLanguage, 'customAccentColor');
        this.accentColorInput = document.createElement('input');
        this.accentColorInput.type = 'color';
        this.accentColorInput.name = 'accentColor';
        this.accentColorInput.value = sanitizeAccentColor(this.options.getSettings().accentColor);
        this.accentColorInput.setAttribute('aria-label', uiText(this.options.getSettings().interfaceLanguage, 'onboardingAccentColor'));
        this.accentColorInput.addEventListener('input', () => this.previewAccentChoice(this.accentColorInput?.value));
        this.accentColorInput.addEventListener('change', () => this.applyAccentChoice(this.accentColorInput?.value));
        customAccent.append(customAccentText, this.accentColorInput);
        accentPicker.append(accentLegend, swatches, customAccent);

        const basics = document.createElement('div');
        basics.className = 'jpdb-reader-onboarding-basics';
        basics.append(preferences, accentPicker);

        const immersionOptions = document.createElement('fieldset');
        immersionOptions.className = 'jpdb-reader-onboarding-options';
        const immersionLegend = document.createElement('legend');
        immersionLegend.textContent = uiText(this.options.getSettings().interfaceLanguage, 'onboardingImmersionOptions');
        this.youtubeImmersionInput = checkboxInput('youtubeImmersionEnabled', this.options.getSettings().youtubeImmersionEnabled);
        this.preferJapaneseSiteLanguageInput = checkboxInput('preferJapaneseSiteLanguage', this.options.getSettings().preferJapaneseSiteLanguage);
        this.manualScanInput = checkboxInput('manualScanEnabled', this.options.getSettings().manualScanEnabled);
        immersionOptions.append(
            immersionLegend,
            checkboxLabel(this.youtubeImmersionInput, uiText(this.options.getSettings().interfaceLanguage, 'youtubeImmersionEnabled')),
            checkboxLabel(this.preferJapaneseSiteLanguageInput, uiText(this.options.getSettings().interfaceLanguage, 'preferJapaneseSiteLanguage')),
            checkboxLabel(this.manualScanInput, uiText(this.options.getSettings().interfaceLanguage, 'manualScanEnabled')),
        );

        const offlineSetup = document.createElement('fieldset');
        offlineSetup.className = 'jpdb-reader-onboarding-options jpdb-reader-onboarding-offline';
        const offlineLegend = document.createElement('legend');
        offlineLegend.textContent = uiText(this.options.getSettings().interfaceLanguage, 'onboardingOfflineSetup');
        this.offlineDictionariesInput = checkboxInput('onboardingInstallOfflineDictionaries', true);
        offlineSetup.append(
            offlineLegend,
            checkboxLabel(this.offlineDictionariesInput, uiText(this.options.getSettings().interfaceLanguage, 'onboardingInstallOfflineDictionaries')),
        );

        const actions = document.createElement('div');
        actions.className = 'jpdb-reader-onboarding-actions';
        const setup = button(uiText(this.options.getSettings().interfaceLanguage, 'onboardingAddApiKey'));
        setup.className = 'jpdb-reader-btn add';
        setup.dataset.onboardingAction = 'api-key';
        setup.addEventListener('click', () => void this.complete(true));
        const dictionaries = button(uiText(this.options.getSettings().interfaceLanguage, 'onboardingUseWithoutApiKey'));
        dictionaries.className = 'jpdb-reader-btn';
        dictionaries.dataset.onboardingAction = 'without-api';
        dictionaries.addEventListener('click', () => void this.complete('dictionaries'));
        actions.append(setup, dictionaries);

        this.languageSelect.addEventListener('change', () => {
            const language = normalizeLanguage(this.languageSelect?.value, this.options.getSettings().interfaceLanguage);
            log.info('Onboarding language changed', { language });
            this.options.setSettings({ ...this.options.getSettings(), interfaceLanguage: language });
            this.localize(language);
        });
        this.panel.addEventListener('click', event => {
            this.handleWordLookup(event);
        });
        this.panel.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (this.handleWordLookup(event)) event.preventDefault();
        });

        this.panel.append(closeButton, eyebrow, title, copy, basics, immersionOptions, offlineSetup, actions, featureList);
        this.syncThemeSwitch();
        this.syncAccentPicker(this.accentColorInput.value);
        document.body.append(this.backdrop, this.panel);
        this.panel.focus();
        this.annotateJapanese();
    }

    private annotateJapanese(): void {
        if (this.panel) this.options.parseJapanese(this.panel);
    }

    private handleWordLookup(event: Event): boolean {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const word = target?.closest<HTMLElement>('.jpdb-reader-onboarding .jpdb-reader-word');
        if (!word || !this.panel?.contains(word) || !this.options.lookupText) return false;
        if (isOnboardingCommandWord(word)) return false;
        const expression = word.dataset.expression?.trim()
            || readerWordSurfaceText(word).trim()
            || word.textContent?.trim()
            || '';
        if (!expression) return false;
        event.preventDefault();
        event.stopPropagation();
        this.options.lookupText(expression, word.dataset.sentence || expression, word);
        return true;
    }

    private localize(language: InterfaceLanguage): void {
        const panel = this.panel;
        if (!panel) return;
        panel.setAttribute('aria-label', uiText(language, 'welcomeLabel'));
        panel.querySelector('.jpdb-reader-onboarding-eyebrow')?.replaceChildren(uiText(language, 'onboardingEyebrow'));
        const copy = panel.querySelector('p');
        copy?.replaceChildren(uiText(language, 'onboardingCopy'));
        panel.querySelector('.jpdb-reader-onboarding-language span')?.replaceChildren(uiText(language, 'onboardingLanguage'));
        panel.querySelector('[data-onboarding-copy="theme"]')?.replaceChildren(uiText(language, 'theme'));
        panel.querySelector('.jpdb-reader-onboarding-options legend')?.replaceChildren(uiText(language, 'onboardingImmersionOptions'));
        panel.querySelector('[data-onboarding-copy="youtubeImmersionEnabled"]')?.replaceChildren(uiText(language, 'youtubeImmersionEnabled'));
        panel.querySelector('[data-onboarding-copy="preferJapaneseSiteLanguage"]')?.replaceChildren(uiText(language, 'preferJapaneseSiteLanguage'));
        panel.querySelector('[data-onboarding-copy="manualScanEnabled"]')?.replaceChildren(uiText(language, 'manualScanEnabled'));
        panel.querySelector('.jpdb-reader-onboarding-offline legend')?.replaceChildren(uiText(language, 'onboardingOfflineSetup'));
        panel.querySelector('[data-onboarding-copy="onboardingInstallOfflineDictionaries"]')?.replaceChildren(uiText(language, 'onboardingInstallOfflineDictionaries'));
        panel.querySelector('.jpdb-reader-onboarding-accent legend')?.replaceChildren(uiText(language, 'onboardingAccentColor'));
        panel.querySelector('[data-onboarding-copy="customAccentColor"]')?.replaceChildren(uiText(language, 'customAccentColor'));
        this.accentColorInput?.setAttribute('aria-label', uiText(language, 'onboardingAccentColor'));
        panel.querySelectorAll<HTMLButtonElement>('[data-onboarding-accent]').forEach(button => {
            const color = button.dataset.onboardingAccent;
            if (!color) return;
            const label = onboardingAccentLabel(language, color);
            button.setAttribute('aria-label', label);
            button.title = label;
        });
        const options: Array<[string, string]> = [
            ['auto', uiText(language, 'automatic')],
            ['en', uiText(language, 'english')],
            ['ja', uiText(language, 'japanese')],
        ];
        options.forEach(([value, text]) => {
            const option = this.languageSelect?.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
            if (option) option.textContent = text;
        });
        const features = Array.from(panel.querySelectorAll('.jpdb-reader-onboarding-features > li'));
        features.forEach((feature, index) => {
            const [headingKey, bodyKey] = ONBOARDING_FEATURE_KEYS[index] ?? ONBOARDING_FEATURE_KEYS[0];
            feature.querySelector('strong')?.replaceChildren(uiText(language, headingKey));
            feature.querySelector('span')?.replaceChildren(uiText(language, bodyKey));
        });
        panel.querySelector('[data-onboarding-action="api-key"]')?.replaceChildren(uiText(language, 'onboardingAddApiKey'));
        panel.querySelector('[data-onboarding-action="without-api"]')?.replaceChildren(uiText(language, 'onboardingUseWithoutApiKey'));
        const closeButton = panel.querySelector('[data-onboarding-action="close"]');
        closeButton?.setAttribute('aria-label', uiText(language, 'closeOnboarding'));
        closeButton?.setAttribute('title', uiText(language, 'closeOnboarding'));
        this.syncThemeSwitch();
        // Re-annotate: replaceChildren above reset every label to plain text.
        this.annotateJapanese();
    }

    private async complete(openSettings: boolean | 'dictionaries'): Promise<void> {
        const done = log.time('Onboarding complete', { openSettings });
        const installOfflineDictionaries = this.offlineDictionariesInput?.checked === true;
        const settings = this.completedOnboardingSettings(openSettings, installOfflineDictionaries);
        try {
            this.options.setSettings(settings);
            await saveSettings(settings);
            this.close();
            if (installOfflineDictionaries) this.options.installOfflineDictionaries?.();
            this.openPostOnboardingSettings(openSettings);
            log.info('Onboarding completed', { openSettings, installOfflineDictionaries, language: settings.interfaceLanguage });
        } catch (error) {
            log.warn('Onboarding completion failed', { openSettings, error });
            throw error;
        } finally {
            done();
        }
    }

    private completedOnboardingSettings(openSettings: boolean | 'dictionaries', installOfflineDictionaries: boolean): ReaderSettings {
        const current = this.options.getSettings();
        return {
            ...current,
            onboardingSeen: true,
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: openSettings !== true || installOfflineDictionaries,
            youtubeImmersionEnabled: this.youtubeImmersionInput?.checked ?? current.youtubeImmersionEnabled,
            preferJapaneseSiteLanguage: this.preferJapaneseSiteLanguageInput?.checked ?? current.preferJapaneseSiteLanguage,
            manualScanEnabled: this.manualScanInput?.checked ?? current.manualScanEnabled,
            dictionaryLookupLinks: defaultDictionaryLookupLinks(openSettings === true ? 'jpdb' : 'local'),
            interfaceLanguage: selectedOnboardingLanguage(this.languageSelect?.value, current.interfaceLanguage),
            accentColor: sanitizeAccentColor(this.accentColorInput?.value, current.accentColor),
        };
    }

    private openPostOnboardingSettings(openSettings: boolean | 'dictionaries'): void {
        if (openSettings === 'dictionaries') this.options.showSettings('dictionaries');
        else if (openSettings) this.options.showSettings('api');
    }

    private close(): void {
        this.cancelAccentPreviewFrame();
        this.panel?.remove();
        this.backdrop?.remove();
        this.panel = undefined;
        this.backdrop = undefined;
        this.languageSelect = undefined;
        this.themeSwitch = undefined;
        this.accentColorInput = undefined;
        this.youtubeImmersionInput = undefined;
        this.preferJapaneseSiteLanguageInput = undefined;
        this.manualScanInput = undefined;
        this.offlineDictionariesInput = undefined;
    }

    private createThemeToggle(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'jpdb-reader-onboarding-theme';
        const title = document.createElement('span');
        title.className = 'jpdb-reader-theme-title';
        title.id = 'jpdb-reader-onboarding-theme-label';
        title.dataset.onboardingCopy = 'theme';
        title.textContent = uiText(this.options.getSettings().interfaceLanguage, 'theme');

        const chrome = document.createElement('div');
        chrome.className = 'VPNavBarAppearance appearance jpdb-reader-theme-appearance';
        this.themeSwitch = button('');
        this.themeSwitch.className = 'VPSwitch VPSwitchAppearance jpdb-reader-theme-switch';
        this.themeSwitch.dataset.onboardingThemeSwitch = 'true';
        this.themeSwitch.setAttribute('role', 'switch');
        this.themeSwitch.setAttribute('aria-labelledby', title.id);
        this.themeSwitch.setAttribute('aria-describedby', title.id);
        setInnerHtml(this.themeSwitch, themeSwitchChrome());
        this.themeSwitch.addEventListener('click', () => this.toggleTheme());
        chrome.append(this.themeSwitch);
        wrapper.append(title, chrome);
        return wrapper;
    }

    private toggleTheme(): void {
        const current = this.options.getSettings();
        const theme = this.effectiveTheme(current.theme) === 'dark' ? 'light' : 'dark';
        this.options.setSettings({ ...current, theme });
        this.syncThemeSwitch();
    }

    private syncThemeSwitch(): void {
        if (!this.themeSwitch) return;
        const language = this.options.getSettings().interfaceLanguage;
        const theme = this.effectiveTheme(this.options.getSettings().theme);
        const label = uiText(language, theme === 'dark' ? 'switchToLightTheme' : 'switchToDarkTheme');
        this.themeSwitch.setAttribute('aria-label', label);
        this.themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
        this.themeSwitch.title = label;
    }

    private effectiveTheme(value: ReaderSettings['theme'] | undefined): 'dark' | 'light' {
        if (value === 'dark' || value === 'light') return value;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    private applyAccentChoice(value: string | undefined): void {
        this.cancelAccentPreviewFrame();
        const current = this.options.getSettings();
        const accentColor = sanitizeAccentColor(value, current.accentColor);
        this.options.setSettings({ ...current, accentColor });
        if (this.accentColorInput && this.accentColorInput.value !== accentColor) {
            this.accentColorInput.value = accentColor;
        }
        this.syncAccentPicker(accentColor);
    }

    private previewAccentChoice(value: string | undefined): void {
        const current = this.options.getSettings();
        const accentColor = sanitizeAccentColor(value, current.accentColor);
        this.pendingAccentPreviewColor = accentColor;
        this.syncAccentPicker(accentColor);
        if (this.accentPreviewFrame !== undefined) return;
        this.accentPreviewFrame = requestOnboardingFrame(() => {
            this.accentPreviewFrame = undefined;
            const pendingColor = this.pendingAccentPreviewColor;
            this.pendingAccentPreviewColor = undefined;
            if (!pendingColor || !this.panel?.isConnected) return;
            this.options.setSettings({ ...this.options.getSettings(), accentColor: pendingColor });
        });
    }

    private cancelAccentPreviewFrame(): void {
        if (this.accentPreviewFrame === undefined) return;
        cancelOnboardingFrame(this.accentPreviewFrame);
        this.accentPreviewFrame = undefined;
        this.pendingAccentPreviewColor = undefined;
    }

    private syncAccentPicker(color: string): void {
        const selectedColor = sanitizeAccentColor(color);
        this.panel?.querySelectorAll<HTMLButtonElement>('[data-onboarding-accent]').forEach(button => {
            const selected = sanitizeAccentColor(button.dataset.onboardingAccent) === selectedColor;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    }
}

function normalizeLanguage(value: unknown, fallback: InterfaceLanguage): InterfaceLanguage {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : fallback;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
}

function button(text: string): HTMLButtonElement {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    return node;
}

function checkboxInput(name: keyof Pick<ReaderSettings, 'preferJapaneseSiteLanguage' | 'youtubeImmersionEnabled' | 'manualScanEnabled'> | 'onboardingInstallOfflineDictionaries', checked: boolean): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    input.setAttribute('aria-labelledby', onboardingCopyId(name));
    return input;
}

function isOnboardingCommandWord(word: HTMLElement): boolean {
    return Boolean(word.closest('button, a[href], input, select, textarea, label, [data-onboarding-action], [data-onboarding-theme-switch], [data-onboarding-accent]'));
}

function checkboxLabel(input: HTMLInputElement, text: string): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'inline';
    const copy = document.createElement('span');
    copy.id = onboardingCopyId(input.name);
    copy.dataset.onboardingCopy = input.name;
    copy.textContent = text;
    label.append(input, copy);
    return label;
}

function onboardingCopyId(name: string): string {
    return `jpdb-reader-onboarding-${name}`;
}

function onboardingAccentLabel(language: InterfaceLanguage, color: string): string {
    return `${uiText(language, 'onboardingAccentColor')} ${color.toUpperCase()}`;
}

function requestOnboardingFrame(callback: () => void): number {
    if (typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(() => callback());
    }
    return window.setTimeout(callback, 16);
}

function cancelOnboardingFrame(id: number): void {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
    else window.clearTimeout(id);
}

function closeIcon(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
}

function themeSwitchChrome(): string {
    return '<span class="check"><span class="icon"><span class="vpi-sun sun" aria-hidden="true"></span><span class="vpi-moon moon" aria-hidden="true"></span></span></span>';
}
