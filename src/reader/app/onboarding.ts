import { APP_NAME } from './constants';
import { readerWordSurfaceText, setInnerHtml } from '../dom/index';
import { uiText, type UiCopyKey } from '../app/i18n';
import { Logger } from './logger';
import { jpOnlyOn, languageFamilyIncludes, syncLanguageFamilyDom } from '../settings/language-gating';
import { settingsText } from '../settings/settings-text';
import { changedSettingsKeys, defaultDictionaryLookupLinks, defaultLookupLinkMode, formatShortcutEvent, normalizeInterfaceLanguage, sanitizeAccentColor, saveSettings } from '../settings/index';
import type { InterfaceLanguage, ReaderSettings } from './types';
import { ocrInteractionModeFromSettings } from '../ocr/mode';
import { applyOverlayPageScale } from '../ui/page-scale';
import {
    activateLanguageProfileForOutputLanguage,
    activeLanguageProfile,
    canonicalTagForLearningTarget,
    canonicalTagForSlice1Language,
    learningTargetRosterIdForTag,
    slice1LanguageIdForTag,
    type LearningTargetRosterId,
} from '../languages';
import {
    LEARNER_LANGUAGES,
    isLearnerLanguageId,
    learnerLanguageById,
    type LearnerLanguageId,
} from '../locales';
import {
    isSelectableStudyTarget,
    populateStudyTargetSelect,
} from './study-target-picker';

const log = Logger.scope('Onboarding');
const ONBOARDING_ACCENT_SWATCHES = ['#5ea780', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2'] as const;
type PageScanMode = 'off' | 'auto' | 'manual';
const ONBOARDING_FEATURE_KEYS = [
    ['featureText', 'featureTextBody'],
    ['featureImages', 'featureImagesBody'],
    ['featureVideo', 'featureVideoBody'],
    ['featureControl', 'featureControlBody'],
    ['featureStudy', 'featureStudyBody'],
    ['featureGame', 'featureGameBody'],
] as const satisfies readonly (readonly [UiCopyKey, UiCopyKey])[];

interface OnboardingOptions {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    showSettings: (panel?: string) => void;
    // Annotates the welcome panel's Japanese with furigana + pitch through the
    // same nested-parse path that handles popovers/settings chrome.
    parseJapanese: (panel: HTMLElement) => void;
    lookupText?: (text: string, sentence: string, anchor: HTMLElement) => void;
    // Background download of the default offline parsing dictionaries.
    installOfflineDictionaries?: () => void;
    // Lets the owning runtime refresh its surface only after the completed
    // preferences have been durably stored.
    onComplete?: (settings: ReaderSettings) => Promise<void> | void;
    onPersistenceFailed?: (previousSettings: ReaderSettings) => void;
}

function selectedOnboardingLanguage(
    select: HTMLSelectElement | undefined,
    fallback: InterfaceLanguage,
): InterfaceLanguage {
    return normalizeInterfaceLanguage(select?.value, fallback);
}

export class OnboardingController {
    private panel?: HTMLElement;
    private backdrop?: HTMLElement;
    private languageSelect?: HTMLSelectElement;
    private learnerLanguageSelect?: HTMLSelectElement;
    private targetLanguageSelect?: HTMLSelectElement;
    private themeSwitch?: HTMLButtonElement;
    private accentColorInput?: HTMLInputElement;
    private pendingAccentPreviewColor?: string;
    private accentPreviewFrame?: number;
    private youtubeImmersionInput?: HTMLInputElement;
    private youtubeImmersionChoiceTouched = false;
    private preferJapaneseSiteLanguageInput?: HTMLInputElement;
    private offlineDictionariesInput?: HTMLInputElement;
    /**
     * Onboarding copy, resolved through the same factory the settings dialog uses so
     * a `{language}` label cannot leak its raw token here. It did: the master switch
     * and its auto mode gained that token and this surface -- the FIRST screen a new
     * user sees -- was still calling uiText directly, printing
     * "{language} text on webpages" (b20).
     */
    private text(key: Parameters<typeof uiText>[1]): string {
        return settingsText(this.options.getSettings().interfaceLanguage)(key);
    }

    private pageScanModeInputs: HTMLInputElement[] = [];
    private ocrModeInputs: HTMLInputElement[] = [];
    private manualPageScanShortcutInput?: HTMLInputElement;
    private manualPageScanShortcutLabel?: HTMLElement;
    private hoverLookupShortcutInput?: HTMLInputElement;

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
        this.panel.setAttribute('aria-label', this.text( 'welcomeLabel'));
        this.panel.tabIndex = -1;

        const closeButton = button('');
        closeButton.className = 'jpdb-reader-icon-mini jpdb-reader-onboarding-close';
        closeButton.dataset.onboardingAction = 'close';
        closeButton.title = this.text( 'closeOnboarding');
        closeButton.setAttribute('aria-label', this.text( 'closeOnboarding'));
        setInnerHtml(closeButton, closeIcon());
        closeButton.addEventListener('click', () => void this.complete(false));

        const eyebrow = element('div', 'jpdb-reader-onboarding-eyebrow', this.text( 'onboardingEyebrow'));
        const title = element('h2', '', APP_NAME);
        const copy = element(
            'p',
            '',
            this.text( 'onboardingCopy'),
        );
        const featureList = document.createElement('ul');
        featureList.className = 'jpdb-reader-onboarding-features';
        ONBOARDING_FEATURE_KEYS.forEach(([headingKey, textKey]) => {
            const item = document.createElement('li');
            item.append(
                element('strong', '', this.text( headingKey)),
                element('span', '', this.text( textKey)),
            );
            featureList.append(item);
        });

        const learnerLanguage = document.createElement('label');
        learnerLanguage.className = 'jpdb-reader-onboarding-language jpdb-reader-onboarding-learner-language';
        const learnerLanguageText = element(
            'span',
            '',
            onboardingLanguageProfileCopy(this.options.getSettings().interfaceLanguage).learnerLanguage,
        );
        learnerLanguageText.dataset.onboardingMultilingualCopy = 'learnerLanguage';
        this.learnerLanguageSelect = document.createElement('select');
        this.learnerLanguageSelect.name = 'learnerLanguage';
        this.learnerLanguageSelect.setAttribute('autocomplete', 'language');
        const initialLearnerLanguage = onboardingLearnerLanguage(this.options.getSettings());
        LEARNER_LANGUAGES.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.lang = item.runtimeLocale;
            option.dir = item.direction;
            option.textContent = learnerLanguageOptionLabel(item);
            option.selected = item.id === initialLearnerLanguage;
            this.learnerLanguageSelect?.append(option);
        });
        learnerLanguage.append(learnerLanguageText, this.learnerLanguageSelect);

        const targetLanguage = document.createElement('label');
        targetLanguage.className = 'jpdb-reader-onboarding-language jpdb-reader-onboarding-target-language';
        const targetLanguageText = element(
            'span',
            '',
            onboardingLanguageProfileCopy(this.options.getSettings().interfaceLanguage).targetLanguage,
        );
        targetLanguageText.dataset.onboardingMultilingualCopy = 'targetLanguage';
        this.targetLanguageSelect = document.createElement('select');
        this.targetLanguageSelect.name = 'targetLanguage';
        this.targetLanguageSelect.setAttribute('autocomplete', 'language');
        populateStudyTargetSelect(
            this.targetLanguageSelect,
            this.options.getSettings().interfaceLanguage,
            onboardingTargetLanguage(this.options.getSettings()),
        );
        targetLanguage.append(targetLanguageText, this.targetLanguageSelect);

        const language = document.createElement('label');
        language.className = 'jpdb-reader-onboarding-language jpdb-reader-onboarding-interface-language';
        const languageText = element('span', '', this.text( 'onboardingLanguage'));
        this.languageSelect = document.createElement('select');
        this.languageSelect.name = 'interfaceLanguage';
        [
            ['auto', this.text( 'automatic')],
            ['en', this.text( 'english')],
            ['ja', this.text( 'japanese')],
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
        preferences.append(learnerLanguage, targetLanguage, language, this.createThemeToggle());

        const accentPicker = document.createElement('fieldset');
        accentPicker.className = 'jpdb-reader-onboarding-accent';
        const accentLegend = document.createElement('legend');
        accentLegend.textContent = this.text( 'onboardingAccentColor');
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
        customAccentText.textContent = this.text( 'customAccentColor');
        this.accentColorInput = document.createElement('input');
        this.accentColorInput.type = 'color';
        this.accentColorInput.name = 'accentColor';
        this.accentColorInput.value = sanitizeAccentColor(this.options.getSettings().accentColor);
        this.accentColorInput.setAttribute('aria-label', this.text( 'onboardingAccentColor'));
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
        immersionLegend.textContent = this.text( 'onboardingImmersionOptions');
        this.hoverLookupShortcutInput = shortcutTextInput(
            'shortcuts.hoverLookup',
            this.options.getSettings().shortcuts.hoverLookup,
            this.options.getSettings().interfaceLanguage,
            'blankPlainHover',
        );
        this.manualPageScanShortcutInput = shortcutTextInput(
            'shortcuts.scanPage',
            this.options.getSettings().shortcuts.scanPage,
            this.options.getSettings().interfaceLanguage,
            'pressKeys',
        );
        const currentSettings = this.options.getSettings();
        this.youtubeImmersionInput = checkboxInput('youtubeImmersionEnabled', jpOnlyOn(
            currentSettings,
            currentSettings.youtubeImmersionEnabled,
            currentSettings.youtubeImmersionEnabledChosen,
        ));
        this.youtubeImmersionInput.addEventListener('change', () => {
            this.youtubeImmersionChoiceTouched = true;
        });
        this.preferJapaneseSiteLanguageInput = checkboxInput('preferJapaneseSiteLanguage', this.options.getSettings().preferJapaneseSiteLanguage);
        this.offlineDictionariesInput = checkboxInput('onboardingInstallOfflineDictionaries', true);
        const pageScanMode = createModeGroup(
            'pageScanMode',
            this.text( 'pageScanMode'),
            pageScanModeFromSettings(this.options.getSettings()),
            [
                ['off', this.text( 'pageScanModeOff')],
                ['auto', this.text( 'pageScanModeAuto')],
                ['manual', this.text( 'pageScanModeManual')],
            ],
        );
        this.pageScanModeInputs = pageScanMode.inputs;
        this.pageScanModeInputs.forEach(input => {
            input.addEventListener('change', () => this.syncManualPageScanShortcut());
        });
        const ocrMode = createModeGroup(
            'ocrInteractionMode',
            this.text( 'ocrInteractionMode'),
            ocrInteractionModeFromSettings(this.options.getSettings()),
            [
                ['auto', this.text( 'ocrInteractionModeAuto')],
                ['manual', this.text( 'ocrInteractionModeManual')],
                ['off', this.text( 'ocrInteractionModeOff')],
            ],
        );
        this.ocrModeInputs = ocrMode.inputs;
        const immersionGrid = document.createElement('div');
        immersionGrid.className = 'jpdb-reader-onboarding-immersion-grid';
        const defaultColumn = document.createElement('div');
        defaultColumn.className = 'jpdb-reader-onboarding-option-column';
        const preferredSiteLanguageLabel = checkboxLabel(
            this.preferJapaneseSiteLanguageInput,
            this.text('preferJapaneseSiteLanguage'),
        );
        preferredSiteLanguageLabel.classList.add('jp-only');
        preferredSiteLanguageLabel.dataset.languageFamily = 'preferred-target-sites';
        defaultColumn.append(
            checkboxLabel(this.youtubeImmersionInput, this.text( 'youtubeImmersionEnabled')),
            preferredSiteLanguageLabel,
            checkboxLabel(this.offlineDictionariesInput, this.text( 'onboardingInstallOfflineDictionaries')),
        );
        const scanColumn = document.createElement('div');
        scanColumn.className = 'jpdb-reader-onboarding-option-column';
        scanColumn.append(pageScanMode.fieldset, ocrMode.fieldset);
        const shortcutColumn = document.createElement('div');
        shortcutColumn.className = 'jpdb-reader-onboarding-option-column';
        this.manualPageScanShortcutLabel = shortcutLabel(this.manualPageScanShortcutInput, this.text( 'manualPageScanShortcut'));
        this.manualPageScanShortcutLabel.dataset.manualPageScanShortcut = 'true';
        shortcutColumn.append(
            shortcutLabel(this.hoverLookupShortcutInput, this.text( 'onboardingHoverShortcut')),
            this.manualPageScanShortcutLabel,
        );
        immersionGrid.append(defaultColumn, scanColumn, shortcutColumn);
        immersionOptions.append(
            immersionLegend,
            immersionGrid,
        );

        const actions = document.createElement('div');
        actions.className = 'jpdb-reader-onboarding-actions';
        // The keyless path is the documented recommendation for new users, so
        // it carries the primary emphasis and comes first.
        const setup = button(this.text( 'onboardingAddApiKey'));
        setup.className = 'jpdb-reader-btn';
        setup.dataset.onboardingAction = 'api-key';
        setup.addEventListener('click', () => void this.complete(true));
        const dictionaries = button(this.text( 'onboardingUseWithoutApiKey'));
        dictionaries.className = 'jpdb-reader-btn add';
        dictionaries.dataset.onboardingAction = 'without-api';
        dictionaries.addEventListener('click', () => void this.complete('dictionaries'));
        actions.append(dictionaries, setup);

        this.languageSelect.addEventListener('change', () => {
            const language = selectedOnboardingLanguage(this.languageSelect, this.options.getSettings().interfaceLanguage);
            log.info('Onboarding language changed', { language });
            this.options.setSettings({ ...this.options.getSettings(), interfaceLanguage: language });
            this.localize(language);
        });
        this.learnerLanguageSelect.addEventListener('change', () => {
            const learnerLanguage = selectedLearnerLanguage(
                this.learnerLanguageSelect,
                onboardingLearnerLanguage(this.options.getSettings()),
            );
            const selected = learnerLanguageById(learnerLanguage);
            log.info('Onboarding learner language changed', {
                learnerLanguage,
                targetLanguage: this.targetLanguageSelect?.value,
            });
            this.learnerLanguageSelect?.setAttribute('lang', selected.runtimeLocale);
            this.learnerLanguageSelect?.setAttribute('dir', selected.direction);
        });
        this.targetLanguageSelect.addEventListener('change', () => this.syncTargetLanguageSelection());
        this.panel.addEventListener('click', event => {
            this.handleWordLookup(event);
        });
        this.panel.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (this.handleWordLookup(event)) event.preventDefault();
        });

        this.panel.append(closeButton, eyebrow, title, copy, basics, actions, immersionOptions, featureList);
        syncLanguageFamilyDom(this.panel, this.targetLanguageSelect.value);
        this.syncThemeSwitch();
        this.syncAccentPicker(this.accentColorInput.value);
        this.syncManualPageScanShortcut();
        applyOverlayPageScale(this.panel);
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

    private syncTargetLanguageSelection(): void {
        const select = this.targetLanguageSelect;
        if (!select) return;
        const selected = select.selectedOptions[0];
        if (!selected) return;
        select.lang = selected.lang;
        select.dir = selected.dir;
        this.syncYoutubeImmersionChoice(selected.value);
        syncLanguageFamilyDom(this.panel!, selected.value);
        this.localize(this.options.getSettings().interfaceLanguage);
    }

    private syncYoutubeImmersionChoice(targetLanguage: string): void {
        const input = this.youtubeImmersionInput;
        if (!input) return;
        if (this.youtubeImmersionChoiceTouched) return;
        input.checked = defaultYoutubeImmersionChoice(this.options.getSettings(), targetLanguage);
    }

    private localize(language: InterfaceLanguage): void {
        // Same factory as first paint, or a `{language}` label relabels into its raw
        // token on a live interface-language switch (b20).
        const text = settingsText(language, this.targetLanguageSelect?.value);
        const panel = this.panel;
        if (!panel) return;
        panel.setAttribute('aria-label', text('welcomeLabel'));
        panel.querySelector('.jpdb-reader-onboarding-eyebrow')?.replaceChildren(text('onboardingEyebrow'));
        const copy = panel.querySelector('p');
        copy?.replaceChildren(text('onboardingCopy'));
        panel.querySelector('.jpdb-reader-onboarding-interface-language span')?.replaceChildren(text('onboardingLanguage'));
        const multilingualCopy = onboardingLanguageProfileCopy(language);
        panel.querySelector('[data-onboarding-multilingual-copy="learnerLanguage"]')
            ?.replaceChildren(multilingualCopy.learnerLanguage);
        panel.querySelector('[data-onboarding-multilingual-copy="targetLanguage"]')
            ?.replaceChildren(multilingualCopy.targetLanguage);
        panel.querySelector('[data-onboarding-copy="theme"]')?.replaceChildren(text('theme'));
        panel.querySelector('.jpdb-reader-onboarding-options legend')?.replaceChildren(text('onboardingImmersionOptions'));
        panel.querySelector('[data-onboarding-copy="shortcuts.hoverLookup"]')?.replaceChildren(text('onboardingHoverShortcut'));
        this.hoverLookupShortcutInput?.setAttribute('placeholder', text('blankPlainHover'));
        panel.querySelector('[data-onboarding-copy="shortcuts.scanPage"]')?.replaceChildren(text('manualPageScanShortcut'));
        this.manualPageScanShortcutInput?.setAttribute('placeholder', text('pressKeys'));
        panel.querySelector('[data-onboarding-copy="youtubeImmersionEnabled"]')?.replaceChildren(text('youtubeImmersionEnabled'));
        panel.querySelector('[data-onboarding-copy="preferJapaneseSiteLanguage"]')?.replaceChildren(text('preferJapaneseSiteLanguage'));
        panel.querySelector('[data-onboarding-copy="onboardingInstallOfflineDictionaries"]')?.replaceChildren(text('onboardingInstallOfflineDictionaries'));
        panel.querySelector('[data-onboarding-mode-legend="pageScanMode"]')?.replaceChildren(text('pageScanMode'));
        setOnboardingModeLabel(panel, 'pageScanMode', 'off', text('pageScanModeOff'));
        setOnboardingModeLabel(panel, 'pageScanMode', 'auto', text('pageScanModeAuto'));
        setOnboardingModeLabel(panel, 'pageScanMode', 'manual', text('pageScanModeManual'));
        panel.querySelector('[data-onboarding-mode-legend="ocrInteractionMode"]')?.replaceChildren(text('ocrInteractionMode'));
        setOnboardingModeLabel(panel, 'ocrInteractionMode', 'auto', text('ocrInteractionModeAuto'));
        setOnboardingModeLabel(panel, 'ocrInteractionMode', 'manual', text('ocrInteractionModeManual'));
        setOnboardingModeLabel(panel, 'ocrInteractionMode', 'off', text('ocrInteractionModeOff'));
        panel.querySelector('.jpdb-reader-onboarding-accent legend')?.replaceChildren(text('onboardingAccentColor'));
        panel.querySelector('[data-onboarding-copy="customAccentColor"]')?.replaceChildren(text('customAccentColor'));
        this.accentColorInput?.setAttribute('aria-label', text('onboardingAccentColor'));
        panel.querySelectorAll<HTMLButtonElement>('[data-onboarding-accent]').forEach(button => {
            const color = button.dataset.onboardingAccent;
            if (!color) return;
            const label = onboardingAccentLabel(language, color);
            button.setAttribute('aria-label', label);
            button.title = label;
        });
        const options: Array<[string, string]> = [
            ['auto', text('automatic')],
            ['en', text('english')],
            ['ja', text('japanese')],
        ];
        options.forEach(([value, text]) => {
            const option = this.languageSelect?.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
            if (option) option.textContent = text;
        });
        if (this.targetLanguageSelect) {
            populateStudyTargetSelect(
                this.targetLanguageSelect,
                language,
                selectedTargetId(
                    this.targetLanguageSelect,
                    onboardingTargetLanguage(this.options.getSettings()),
                ),
            );
        }
        const features = Array.from(panel.querySelectorAll('.jpdb-reader-onboarding-features > li'));
        features.forEach((feature, index) => {
            const [headingKey, bodyKey] = ONBOARDING_FEATURE_KEYS[index] ?? ONBOARDING_FEATURE_KEYS[0];
            feature.querySelector('strong')?.replaceChildren(text(headingKey));
            feature.querySelector('span')?.replaceChildren(text(bodyKey));
        });
        panel.querySelector('[data-onboarding-action="api-key"]')?.replaceChildren(text('onboardingAddApiKey'));
        panel.querySelector('[data-onboarding-action="without-api"]')?.replaceChildren(text('onboardingUseWithoutApiKey'));
        const closeButton = panel.querySelector('[data-onboarding-action="close"]');
        closeButton?.setAttribute('aria-label', text('closeOnboarding'));
        closeButton?.setAttribute('title', text('closeOnboarding'));
        this.syncThemeSwitch();
        // Re-annotate: replaceChildren above reset every label to plain text.
        this.annotateJapanese();
    }

    private async complete(openSettings: boolean | 'dictionaries'): Promise<void> {
        const done = log.time('Onboarding complete', { openSettings });
        const installOfflineDictionaries = this.offlineDictionariesInput?.checked === true;
        const previousSettings = this.options.getSettings();
        const settings = this.completedOnboardingSettings(openSettings, installOfflineDictionaries);
        try {
            this.options.setSettings(settings);
            await saveSettings(settings, {
                persistPreferredJapaneseSiteLanguage:
                    previousSettings.preferJapaneseSiteLanguage !== settings.preferJapaneseSiteLanguage,
                // Every field the onboarding panel's own controls moved. It used to
                // declare only the 17 allowlisted keys, so a theme or hotkey chosen
                // here was not intent and a legacy store could replay the old one.
                explicitUserChoiceKeys: changedSettingsKeys(previousSettings, settings),
            });
            this.close();
            await this.options.onComplete?.(settings);
            if (installOfflineDictionaries) this.options.installOfflineDictionaries?.();
            this.openPostOnboardingSettings(openSettings);
            log.info('Onboarding completed', { openSettings, installOfflineDictionaries, language: settings.interfaceLanguage });
        } catch (error) {
            this.options.onPersistenceFailed?.(previousSettings);
            log.warn('Onboarding completion failed', { openSettings, error });
            throw error;
        } finally {
            done();
        }
    }

    private completedOnboardingSettings(openSettings: boolean | 'dictionaries', installOfflineDictionaries: boolean): ReaderSettings {
        const current = this.options.getSettings();
        const pageScanMode = selectedMode(this.pageScanModeInputs, pageScanModeFromSettings(current));
        const ocrMode = selectedMode(this.ocrModeInputs, ocrInteractionModeFromSettings(current));
        const interfaceLanguage = selectedOnboardingLanguage(this.languageSelect, current.interfaceLanguage);
        const learnerLanguage = selectedLearnerLanguage(
            this.learnerLanguageSelect,
            onboardingLearnerLanguage(current),
        );
        const targetLanguage = selectedTargetId(
            this.targetLanguageSelect,
            onboardingTargetLanguage(current),
        );
        const languageProfileSelection = updateActiveOnboardingLanguageProfile(
            current,
            learnerLanguage,
            targetLanguage,
            interfaceLanguage,
        );
        return {
            ...current,
            onboardingSeen: true,
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: openSettings !== true || installOfflineDictionaries,
            youtubeImmersionEnabled: checkboxValue(
                this.youtubeImmersionInput,
                current.youtubeImmersionEnabled,
                this.youtubeImmersionChoiceTouched,
            ),
            youtubeImmersionEnabledChosen:
                current.youtubeImmersionEnabledChosen || this.youtubeImmersionChoiceTouched,
            preferJapaneseSiteLanguage: checkboxValue(
                this.preferJapaneseSiteLanguageInput,
                current.preferJapaneseSiteLanguage,
            ),
            annotationsPaused: pageScanMode === 'off',
            manualScanEnabled: pageScanMode === 'manual',
            ocrEnabled: ocrMode !== 'off',
            ocrAutoScanImages: ocrMode === 'auto',
            shortcuts: {
                ...current.shortcuts,
                hoverLookup: shortcutValue(this.hoverLookupShortcutInput, current.shortcuts.hoverLookup),
                scanPage: shortcutValue(this.manualPageScanShortcutInput, current.shortcuts.scanPage),
            },
            dictionaryLookupLinks: defaultDictionaryLookupLinks(
                defaultLookupLinkMode(openSettings === true),
                targetLanguage,
            ),
            interfaceLanguage,
            ...languageProfileSelection,
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
        this.learnerLanguageSelect = undefined;
        this.targetLanguageSelect = undefined;
        this.themeSwitch = undefined;
        this.accentColorInput = undefined;
        this.youtubeImmersionInput = undefined;
        this.youtubeImmersionChoiceTouched = false;
        this.preferJapaneseSiteLanguageInput = undefined;
        this.offlineDictionariesInput = undefined;
        this.pageScanModeInputs = [];
        this.ocrModeInputs = [];
        this.manualPageScanShortcutInput = undefined;
        this.manualPageScanShortcutLabel = undefined;
        this.hoverLookupShortcutInput = undefined;
    }

    private createThemeToggle(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'jpdb-reader-onboarding-theme';
        const title = document.createElement('span');
        title.className = 'jpdb-reader-theme-title';
        title.id = 'jpdb-reader-onboarding-theme-label';
        title.dataset.onboardingCopy = 'theme';
        title.textContent = this.text( 'theme');

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
        const theme = this.effectiveTheme(this.options.getSettings().theme);
        const label = this.text(theme === 'dark' ? 'switchToLightTheme' : 'switchToDarkTheme');
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

    private syncManualPageScanShortcut(): void {
        if (!this.manualPageScanShortcutLabel) return;
        this.manualPageScanShortcutLabel.hidden = selectedMode<PageScanMode>(this.pageScanModeInputs, 'auto') !== 'manual';
    }
}

function defaultYoutubeImmersionChoice(settings: ReaderSettings, targetLanguage: string): boolean {
    if (!settings.youtubeImmersionEnabled) return false;
    if (settings.youtubeImmersionEnabledChosen) return true;
    return languageFamilyIncludes('jp-only', targetLanguage);
}

function pageScanModeFromSettings(settings: ReaderSettings): PageScanMode {
    if (settings.annotationsPaused) return 'off';
    return settings.manualScanEnabled ? 'manual' : 'auto';
}

function selectedMode<T extends string>(inputs: HTMLInputElement[], fallback: T): T {
    return (inputs.find(input => input.checked)?.value as T | undefined) ?? fallback;
}

function shortcutValue(input: HTMLInputElement | undefined, fallback: string): string {
    return input?.value.trim() ?? fallback;
}

function checkboxValue(
    input: HTMLInputElement | undefined,
    fallback: boolean,
    useInput = true,
): boolean {
    return useInput ? input?.checked ?? fallback : fallback;
}

type OnboardingLanguageProfileCopy = {
    learnerLanguage: string;
    targetLanguage: string;
};

function onboardingLanguageProfileCopy(language: InterfaceLanguage): OnboardingLanguageProfileCopy {
    return {
        learnerLanguage: uiText(language, 'onboardingOutputLanguage'),
        targetLanguage: uiText(language, 'onboardingTargetLanguage'),
    };
}

function learnerLanguageOptionLabel(language: {
    nativeName: string;
    englishName: string;
}): string {
    return language.nativeName === language.englishName
        ? language.nativeName
        : `${language.nativeName} — ${language.englishName}`;
}

function onboardingLearnerLanguage(settings: ReaderSettings): LearnerLanguageId {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const saved = slice1LanguageIdForTag(profile?.outputLanguage);
    if (saved && saved !== 'en') return saved;

    const browserLanguages = typeof navigator === 'undefined'
        ? []
        : [...(navigator.languages ?? []), navigator.language];
    for (const browserLanguage of browserLanguages) {
        const detected = slice1LanguageIdForTag(browserLanguage);
        if (detected) return detected;
    }
    return saved ?? 'en';
}

function selectedLearnerLanguage(
    select: HTMLSelectElement | undefined,
    fallback: LearnerLanguageId,
): LearnerLanguageId {
    const value = select?.value;
    return value && isLearnerLanguageId(value) ? value : fallback;
}

function onboardingTargetLanguage(settings: ReaderSettings): LearningTargetRosterId {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return learningTargetRosterIdForTag(profile?.targetLanguage) ?? 'ja';
}

function selectedTargetId(
    select: HTMLSelectElement | undefined,
    fallback: LearningTargetRosterId,
): LearningTargetRosterId {
    const selected = learningTargetRosterIdForTag(select?.value);
    return selected && isSelectableStudyTarget(selected) ? selected : fallback;
}

function updateActiveOnboardingLanguageProfile(
    settings: ReaderSettings,
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    interfaceLanguage: InterfaceLanguage,
): Pick<ReaderSettings, 'languageProfiles' | 'activeLanguageProfileId'> {
    const learnerLanguageTag = canonicalTagForSlice1Language(learnerLanguage);
    const targetLanguageTag = canonicalTagForLearningTarget(targetLanguage);
    const activated = activateLanguageProfileForOutputLanguage(
        settings.languageProfiles,
        settings.activeLanguageProfileId,
        learnerLanguageTag,
        {
            targetLanguage: targetLanguageTag,
            uiLocale: interfaceLanguage,
            parserProvider: settings.parserProvider,
        },
    );
    return {
        activeLanguageProfileId: activated.activeProfileId,
        languageProfiles: activated.profiles.map(profile => profile.id === activated.activeProfileId
        ? {
            ...profile,
            outputLanguage: learnerLanguageTag,
            learnerLanguage: learnerLanguageTag,
            targetLanguage: targetLanguageTag,
            uiLocale: interfaceLanguage,
            parserProvider: settings.parserProvider,
        }
        : profile),
    };
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

function checkboxInput(name: keyof Pick<ReaderSettings, 'preferJapaneseSiteLanguage' | 'youtubeImmersionEnabled'> | 'onboardingInstallOfflineDictionaries', checked: boolean): HTMLInputElement {
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

function shortcutTextInput(name: 'shortcuts.hoverLookup' | 'shortcuts.scanPage', value: string, language: InterfaceLanguage, placeholderKey: UiCopyKey): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = name;
    input.value = value;
    input.placeholder = settingsText(language)(placeholderKey);
    input.autocomplete = 'off';
    input.inputMode = 'none';
    input.dataset.shortcutInput = 'true';
    input.setAttribute('aria-labelledby', onboardingCopyId(name));
    input.addEventListener('keydown', event => {
        event.preventDefault();
        event.stopPropagation();
        input.value = event.key === 'Backspace' || event.key === 'Delete' ? '' : formatShortcutEvent(event);
    });
    input.addEventListener('paste', event => event.preventDefault());
    return input;
}

function createModeGroup<T extends string>(
    name: string,
    legendText: string,
    selectedValue: T,
    options: readonly (readonly [T, string])[],
): { fieldset: HTMLFieldSetElement; inputs: HTMLInputElement[] } {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'jpdb-reader-onboarding-mode-group';
    const legend = document.createElement('legend');
    legend.dataset.onboardingModeLegend = name;
    legend.textContent = legendText;
    const inputs = options.map(([value, text]) => {
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = value;
        input.checked = value === selectedValue;
        const label = document.createElement('label');
        label.className = 'inline';
        label.dataset.onboardingModeLabel = `${name}.${value}`;
        label.append(input, document.createTextNode(text));
        fieldset.append(label);
        return input;
    });
    fieldset.prepend(legend);
    return { fieldset, inputs };
}

function setOnboardingModeLabel(panel: HTMLElement, name: string, value: string, text: string): void {
    const label = panel.querySelector<HTMLElement>(`[data-onboarding-mode-label="${name}.${value}"]`);
    const input = label?.querySelector('input');
    if (!label || !input) return;
    label.replaceChildren(input, document.createTextNode(text));
}

function shortcutLabel(input: HTMLInputElement, text: string): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'jpdb-reader-onboarding-shortcut';
    const copy = document.createElement('span');
    copy.id = onboardingCopyId(input.name);
    copy.dataset.onboardingCopy = input.name;
    copy.textContent = text;
    label.append(copy, input);
    return label;
}

function onboardingCopyId(name: string): string {
    return `jpdb-reader-onboarding-${name}`;
}

function onboardingAccentLabel(language: InterfaceLanguage, color: string): string {
    return `${settingsText(language)('onboardingAccentColor')} ${color.toUpperCase()}`;
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
