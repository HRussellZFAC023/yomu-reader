import { APP_NAME } from './constants';
import { setInnerHtml } from '../dom/index';
import { uiText, type UiCopyKey } from './i18n';
import { Logger } from './logger';
import { defaultDictionaryLookupLinks, saveSettings } from '../settings/index';
import type { InterfaceLanguage, ReaderSettings } from './types';

const log = Logger.scope('Onboarding');

interface OnboardingOptions {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    showSettings: (panel?: string) => void;
}

function selectedOnboardingLanguage(value: string | undefined, fallback: InterfaceLanguage): InterfaceLanguage {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : fallback;
}

export class OnboardingController {
    private panel?: HTMLElement;
    private backdrop?: HTMLElement;
    private languageSelect?: HTMLSelectElement;
    private youtubeImmersionInput?: HTMLInputElement;
    private preferJapaneseSiteLanguageInput?: HTMLInputElement;

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
        this.panel.className = 'jpdb-reader-onboarding';
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
        const featureGrid = document.createElement('div');
        featureGrid.className = 'jpdb-reader-onboarding-grid';
        const featureKeys: Array<[UiCopyKey, UiCopyKey]> = [
            ['featureText', 'featureTextBody'],
            ['featureImages', 'featureImagesBody'],
            ['featureVideo', 'featureVideoBody'],
            ['featureControl', 'featureControlBody'],
            ['featureStudy', 'featureStudyBody'],
        ];
        featureKeys.forEach(([headingKey, textKey]) => {
            const card = document.createElement('div');
            card.append(
                element('strong', '', uiText(this.options.getSettings().interfaceLanguage, headingKey)),
                element('span', '', uiText(this.options.getSettings().interfaceLanguage, textKey)),
            );
            featureGrid.append(card);
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

        const immersionOptions = document.createElement('fieldset');
        immersionOptions.className = 'jpdb-reader-onboarding-options';
        const immersionLegend = document.createElement('legend');
        immersionLegend.textContent = uiText(this.options.getSettings().interfaceLanguage, 'onboardingImmersionOptions');
        this.youtubeImmersionInput = checkboxInput('youtubeImmersionEnabled', this.options.getSettings().youtubeImmersionEnabled);
        this.preferJapaneseSiteLanguageInput = checkboxInput('preferJapaneseSiteLanguage', this.options.getSettings().preferJapaneseSiteLanguage);
        immersionOptions.append(
            immersionLegend,
            checkboxLabel(this.youtubeImmersionInput, uiText(this.options.getSettings().interfaceLanguage, 'youtubeImmersionEnabled')),
            checkboxLabel(this.preferJapaneseSiteLanguageInput, uiText(this.options.getSettings().interfaceLanguage, 'preferJapaneseSiteLanguage')),
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

        this.panel.append(closeButton, eyebrow, title, copy, language, immersionOptions, actions, featureGrid);
        document.body.append(this.backdrop, this.panel);
        this.panel.focus();
    }

    private localize(language: InterfaceLanguage): void {
        const panel = this.panel;
        if (!panel) return;
        panel.setAttribute('aria-label', uiText(language, 'welcomeLabel'));
        panel.querySelector('.jpdb-reader-onboarding-eyebrow')?.replaceChildren(uiText(language, 'onboardingEyebrow'));
        const copy = panel.querySelector('p');
        copy?.replaceChildren(uiText(language, 'onboardingCopy'));
        panel.querySelector('.jpdb-reader-onboarding-language span')?.replaceChildren(uiText(language, 'onboardingLanguage'));
        panel.querySelector('.jpdb-reader-onboarding-options legend')?.replaceChildren(uiText(language, 'onboardingImmersionOptions'));
        panel.querySelector('[data-onboarding-copy="youtubeImmersionEnabled"]')?.replaceChildren(uiText(language, 'youtubeImmersionEnabled'));
        panel.querySelector('[data-onboarding-copy="preferJapaneseSiteLanguage"]')?.replaceChildren(uiText(language, 'preferJapaneseSiteLanguage'));
        const options: Array<[string, string]> = [
            ['auto', uiText(language, 'automatic')],
            ['en', uiText(language, 'english')],
            ['ja', uiText(language, 'japanese')],
        ];
        options.forEach(([value, text]) => {
            const option = this.languageSelect?.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
            if (option) option.textContent = text;
        });
        const cards = Array.from(panel.querySelectorAll('.jpdb-reader-onboarding-grid > div'));
        const cardKeys = [
            ['featureText', 'featureTextBody'],
            ['featureImages', 'featureImagesBody'],
            ['featureVideo', 'featureVideoBody'],
            ['featureControl', 'featureControlBody'],
        ] as const;
        cards.forEach((card, index) => {
            const [headingKey, bodyKey] = cardKeys[index] ?? cardKeys[0];
            card.querySelector('strong')?.replaceChildren(uiText(language, headingKey));
            card.querySelector('span')?.replaceChildren(uiText(language, bodyKey));
        });
        panel.querySelector('[data-onboarding-action="api-key"]')?.replaceChildren(uiText(language, 'onboardingAddApiKey'));
        panel.querySelector('[data-onboarding-action="without-api"]')?.replaceChildren(uiText(language, 'onboardingUseWithoutApiKey'));
        const closeButton = panel.querySelector('[data-onboarding-action="close"]');
        closeButton?.setAttribute('aria-label', uiText(language, 'closeOnboarding'));
        closeButton?.setAttribute('title', uiText(language, 'closeOnboarding'));
    }

    private async complete(openSettings: boolean | 'dictionaries'): Promise<void> {
        const done = log.time('Onboarding complete', { openSettings });
        const settings = this.completedOnboardingSettings(openSettings);
        try {
            this.options.setSettings(settings);
            await saveSettings(settings);
            this.close();
            this.openPostOnboardingSettings(openSettings);
            log.info('Onboarding completed', { openSettings, language: settings.interfaceLanguage });
        } catch (error) {
            log.warn('Onboarding completion failed', { openSettings, error });
            throw error;
        } finally {
            done();
        }
    }

    private completedOnboardingSettings(openSettings: boolean | 'dictionaries'): ReaderSettings {
        const current = this.options.getSettings();
        return {
            ...current,
            onboardingSeen: true,
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: openSettings !== true,
            youtubeImmersionEnabled: this.youtubeImmersionInput?.checked ?? current.youtubeImmersionEnabled,
            preferJapaneseSiteLanguage: this.preferJapaneseSiteLanguageInput?.checked ?? current.preferJapaneseSiteLanguage,
            dictionaryLookupLinks: defaultDictionaryLookupLinks(openSettings === true ? 'jpdb' : 'local'),
            interfaceLanguage: selectedOnboardingLanguage(this.languageSelect?.value, current.interfaceLanguage),
        };
    }

    private openPostOnboardingSettings(openSettings: boolean | 'dictionaries'): void {
        if (openSettings === 'dictionaries') this.options.showSettings('dictionaries');
        else if (openSettings) this.options.showSettings();
    }

    private close(): void {
        this.panel?.remove();
        this.backdrop?.remove();
        this.panel = undefined;
        this.backdrop = undefined;
        this.languageSelect = undefined;
        this.youtubeImmersionInput = undefined;
        this.preferJapaneseSiteLanguageInput = undefined;
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

function checkboxInput(name: keyof Pick<ReaderSettings, 'preferJapaneseSiteLanguage' | 'youtubeImmersionEnabled'>, checked: boolean): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.checked = checked;
    input.setAttribute('aria-labelledby', onboardingCopyId(name));
    return input;
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

function closeIcon(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
}
