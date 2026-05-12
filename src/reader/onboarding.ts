import { APP_NAME } from './constants';
import { uiText, type UiCopyKey } from './i18n';
import { Logger } from './logger';
import { defaultDictionaryLookupLinks, saveSettings } from './settings';
import type { InterfaceLanguage, ReaderSettings } from './types';

const log = Logger.scope('Onboarding');

interface OnboardingOptions {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    showSettings: (panel?: string) => void;
}

export class OnboardingController {
    private panel?: HTMLElement;
    private backdrop?: HTMLElement;
    private languageSelect?: HTMLSelectElement;

    constructor(private readonly options: OnboardingOptions) {}

    async showIfNeeded(): Promise<boolean> {
        if (this.options.getSettings().onboardingSeen) {
            log.debug('Onboarding skipped', { reason: 'already-seen' });
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
        closeButton.innerHTML = closeIcon();
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

        const note = element('p', 'jpdb-reader-onboarding-note', uiText(this.options.getSettings().interfaceLanguage, 'onboardingNote'));
        this.panel.append(closeButton, eyebrow, title, copy, language, actions, featureGrid, note);
        document.body.append(this.backdrop, this.panel);
        this.panel.focus();
    }

    private localize(language: InterfaceLanguage): void {
        const panel = this.panel;
        if (!panel) return;
        panel.setAttribute('aria-label', uiText(language, 'welcomeLabel'));
        panel.querySelector('.jpdb-reader-onboarding-eyebrow')?.replaceChildren(uiText(language, 'onboardingEyebrow'));
        const copy = panel.querySelector('p:not(.jpdb-reader-onboarding-note)');
        copy?.replaceChildren(uiText(language, 'onboardingCopy'));
        panel.querySelector('.jpdb-reader-onboarding-language span')?.replaceChildren(uiText(language, 'onboardingLanguage'));
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
        panel.querySelector('.jpdb-reader-onboarding-note')?.replaceChildren(uiText(language, 'onboardingNote'));
    }

    private async complete(openSettings: boolean | 'dictionaries'): Promise<void> {
        const done = log.time('Onboarding complete', { openSettings });
        const language = this.languageSelect?.value;
        const settings = {
            ...this.options.getSettings(),
            onboardingSeen: true,
            jpdbDefinitionsEnabled: openSettings === true,
            localDictionariesEnabled: openSettings !== true,
            dictionaryLookupLinks: defaultDictionaryLookupLinks(openSettings === true ? 'jpdb' : 'local'),
            interfaceLanguage: language === 'en' || language === 'ja' || language === 'auto'
                ? language
                : this.options.getSettings().interfaceLanguage,
        };
        try {
            this.options.setSettings(settings);
            await saveSettings(settings);
            this.close();
            if (openSettings === 'dictionaries') this.options.showSettings('dictionaries');
            else if (openSettings) this.options.showSettings();
            log.info('Onboarding completed', { openSettings, language: settings.interfaceLanguage });
        } catch (error) {
            log.warn('Onboarding completion failed', { openSettings, error });
            throw error;
        } finally {
            done();
        }
    }

    private close(): void {
        if (this.panel || this.backdrop) log.debug('Closing onboarding');
        this.panel?.remove();
        this.backdrop?.remove();
        this.panel = undefined;
        this.backdrop = undefined;
        this.languageSelect = undefined;
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

function closeIcon(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
}
