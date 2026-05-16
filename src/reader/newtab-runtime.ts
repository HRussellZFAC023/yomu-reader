import { AudioPlayer } from './audio';
import { AnkiConnectClient, type AnkiLookupResult } from './anki';
import { listNewTabAnkiCards } from './anki-new-tab';
import { positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { CardPopoverRenderer } from './card-popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData } from './card-render-data';
import { cardKey } from './card-utils';
import { APP_NAME, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TOOLS_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from './constants';
import {
    definitionSourceStateKey,
    renderJpdbDefinitionSource,
    renderLocalDefinitionSourcesSection,
} from './definition-source-render';
import { DictionarySourceStateController } from './dictionary-source-state';
import { appendToDocumentHead, HAS_JAPANESE, setInnerHtml } from './dom';
import { DictionaryStyleController } from './dictionary-styles';
import { ImmersionKitClient } from './immersion-kit';
import { ImmersionPopoverController } from './immersion-popover-controller';
import { uiText } from './i18n';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { createJpdbReviewBridgeClient } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { KanjiVGClient } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    inferMiningSourceKind,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedTextParsePlan } from './nested-text-parse';
import { NewTabController } from './new-tab-controller';
import { NEW_TAB_CSS } from './newtab-styles';
import { createReaderBackdrop, createReaderPopover, installSheetHandle } from './popover-shell';
import { groupTermEntriesByDictionary, pickTokenForSelection } from './popup-render';
import { ReaderParser } from './reader-parser';
import { RtkClient } from './rtk';
import {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
} from './settings';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from './reader-theme';
import { ReaderAudioActions } from './reader-audio-actions';
import { SettingsDialogController } from './settings-dialog-controller';
import { orderedDefinitionSourceIds } from './source-sections';
import { StudySourceController } from './study-sources';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';
import { renderWordPills } from './word-pills';
import { YomitanDictionaryStore, type YomitanTermEntry } from './yomitan';

const log = Logger.scope('NewTabRuntime');

type YomuNewTabWindow = typeof window & {
    __YOMU_READER_RUNTIME__?: string;
};

export function bootNewTabRuntime(): void {
    const app = new NewTabRuntime();
    void app.init().catch(error => {
        log.error('New tab initialization failed', error);
        throw error;
    });
    window.addEventListener('pagehide', () => app.destroy(), { once: true });
}

class NewTabRuntime {
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private activeDialog?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private newTab?: NewTabController;

    private jpdb = new JpdbClient(() => this.settings.apiKey.trim(), () => this.settings.corsProxyUrl);
    private jpdbKanji = new JpdbKanjiClient(() => this.settings.corsProxyUrl);
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private kanjiVG = new KanjiVGClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private jpdbReviewBridge = createJpdbReviewBridgeClient();
    private dictionaries = new YomitanDictionaryStore(() => this.settings.corsProxyUrl);
    private dictionarySourceState = new DictionarySourceStateController({
        getSettings: () => this.settings,
        onStateChange: () => this.repositionLookupPopover(),
    });
    private cardRenderData = new CardRenderDataLoader({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        jpdbPublicPitch: this.jpdbPublicPitch,
        jpdbVocabulary: this.jpdbVocabulary,
        anki: this.anki,
        jpdb: this.jpdb,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
    });
    private lookupPopoverRenderer = new CardPopoverRenderer({
        getSettings: () => this.settings,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
        renderWordHistory: () => '',
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        }),
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo),
        dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
    });
    private activeLookupPopover?: HTMLElement;
    private activeLookupBackdrop?: HTMLElement;
    private activeLookupAnchor?: HTMLElement;
    private externalRefreshController?: AbortController;
    private dictionaryStyles = new DictionaryStyleController({
        loadCss: () => this.settings.localDictionariesEnabled
            ? this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences)
            : Promise.resolve(''),
        onUnavailable: error => log.warn('Dictionary styles unavailable', error),
    });
    private studySources = new StudySourceController({
        getSettings: () => this.settings,
        dictionarySourceAttributes: key => this.dictionarySourceState.attributes(key),
        parseJapanese: paragraphs => this.parser.parse(paragraphs),
        parsePopoverJapanese: popover => this.parseNewTabContent(popover),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        isCurrentPopoverRoot: root => this.isCurrentPopoverRoot(root),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: paragraphs => this.parser.parse(paragraphs),
        canParseJapanese: () => this.parser.canParse(),
        parsePopoverJapanese: popover => this.parseNewTabContent(popover),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        repositionPopover: () => this.repositionLookupPopover(),
        setImmersionTranslationBlurred: blurred => this.setImmersionTranslationBlurred(blurred),
        toast: message => this.toast(message),
    });
    private audioActions = new ReaderAudioActions({
        audio: this.audio,
        getSettings: () => this.settings,
        getActivePopover: () => this.activeLookupPopover,
        getHoverLookupGeneration: () => 0,
        stopImmersionAudio: () => this.immersionPopover.stopAudio(),
        toast: message => this.toast(message),
    });
    private cardActions = new CardActionController({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        anki: this.anki,
        dictionaries: this.dictionaries,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
        resolveMiningContext: (card, sentence) => this.resolveMiningContext(card, sentence),
        showCard: (card, sentence, anchor) => this.showLookupCard(card, sentence, anchor),
        getActivePopoverAnchor: () => this.activeLookupAnchor?.isConnected ? this.activeLookupAnchor : undefined,
        getActivePopoverMode: () => 'modal',
        showSettings: panel => this.showSettings(panel),
        playAudio: (card, options) => this.audioActions.playTermAudio(card, options),
        playSentenceAudio: sentence => this.audioActions.playSentenceAudio(sentence),
        detectGrammarHints: sentence => this.studySources.detectGrammarHints(sentence),
        parsePopoverJapanese: popover => this.parseNewTabContent(popover),
        toast: message => this.toast(message),
    });
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });

    private settingsDialog = new SettingsDialogController({
        getSettings: () => this.settings,
        setSettings: settings => { this.settings = settings; },
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
        anki: this.anki,
        audio: this.audio,
        subtitles: refreshableNoop(),
        ocr: refreshableNoop(),
        createBackdrop: () => createReaderBackdrop(() => this.dismiss()),
        mountDialog: (backdrop, form) => this.mountSettingsDialog(backdrop, form),
        dismiss: () => this.dismiss(),
        toast: message => this.toast(message),
        applyTheme: () => this.applyTheme(),
        applyAccentColor: color => this.applyAccentColor(color),
        applyWordColors: settings => this.applyWordColors(settings),
        installFab: () => undefined,
        refreshDictionaryStyles: () => this.refreshDictionaryStyles(),
        scheduleDictionaryRescan: () => undefined,
        refreshNewTabIfCurrent: () => {
            if (this.newTab?.isCurrentPage()) void this.newTab.renderPage();
        },
        clearDictionarySourceOpenOverrides: () => undefined,
        beginSettingsPreview: (accent, _language, theme) => {
            this.settingsPreviewOriginalAccent = accent;
            this.settingsPreviewOriginalTheme = theme;
        },
        clearSettingsPreview: () => {
            this.settingsPreviewOriginalAccent = undefined;
            this.settingsPreviewOriginalTheme = undefined;
        },
    });

    async init(): Promise<void> {
        markNewTabRuntime();
        this.installExternalRefreshListener();
        configureLogger({ settingsProvider: () => this.settings });
        this.installStyles();
        this.settings = await loadSettings();
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        this.applyTheme();
        await this.refreshDictionaryStyles();
        this.newTab = this.createNewTabController();
        await this.newTab.renderPage();
    }

    destroy(): void {
        this.externalRefreshController?.abort();
        this.externalRefreshController = undefined;
        this.newTab?.destroy();
        this.dictionaryStyles.remove();
        this.dismiss();
    }

    private installExternalRefreshListener(): void {
        this.externalRefreshController?.abort();
        const controller = new AbortController();
        window.addEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => {
            if (this.newTab?.isCurrentPage()) void this.newTab.refreshExternalData();
        }, { signal: controller.signal });
        this.externalRefreshController = controller;
    }

    private createNewTabController(): NewTabController {
        return new NewTabController({
            getSettings: () => this.settings,
            anki: {
                listNewTabCards: limit => listNewTabAnkiCards(this.anki, this.settings, limit),
                answerCard: (cardId, grade) => this.anki.answerCard(cardId, grade),
            },
            jpdb: this.jpdb,
            jpdbKanji: this.jpdbKanji,
            kanjiVG: this.kanjiVG,
            rtk: this.rtk,
            immersionKit: this.immersionKit,
            jpdbReviewBridge: this.jpdbReviewBridge,
            parser: this.parser,
            dictionaries: this.dictionaries,
            parseContent: root => this.parseNewTabContent(root),
            lookupText: (text, reading, anchor) => this.lookupText(text, reading, anchor),
            lookupDictionaryReference: (query, reading, _dictionary, anchor) => this.lookupText(query, reading || query, anchor),
            setImmersionTranslationBlurred: blurred => this.setImmersionTranslationBlurred(blurred),
            onSettingsChange: () => saveSettings(this.settings),
            applyTheme: () => this.applyTheme(),
            showSettings: panel => this.showSettings(panel),
            dismiss: () => this.dismiss(),
        });
    }

    private installStyles(): void {
        const style = document.createElement('style');
        style.textContent = NEW_TAB_CSS;
        appendToDocumentHead(style);
    }

    private setImmersionTranslationBlurred(blurred: boolean): void {
        if (this.settings.immersionKitRevealTranslationOnClick === blurred) return;
        this.settings = { ...this.settings, immersionKitRevealTranslationOnClick: blurred };
        void saveSettings(this.settings);
    }

    private showSettings(panel?: string): void {
        this.settingsDialog.open(panel);
    }

    private mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void {
        this.dismiss();
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activeDialog = form;
        form.focus();
    }

    private dismiss(): void {
        this.activeDialog?.remove();
        this.activeBackdrop?.remove();
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        this.activeDialog = undefined;
        this.activeBackdrop = undefined;
        this.activeLookupPopover = undefined;
        this.activeLookupBackdrop = undefined;
        this.activeLookupAnchor = undefined;
        this.restoreSettingsPreviewState();
    }

    private async lookupText(text: string, reading = text, anchor?: HTMLElement): Promise<void> {
        const term = text.trim();
        if (!HAS_JAPANESE.test(term)) return;
        const sentence = anchor?.dataset.sentence || term;
        const card = await this.lookupCard(term, reading);
        await this.showLookupCard(card, sentence, anchor);
    }

    private async showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement): Promise<void> {
        const renderData = this.cardRenderData.load(card);
        const initialEntries = await renderData.localEntries.catch(() => []);
        const popover = createReaderPopover(APP_NAME, this.settings);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        clearNestedParseState(popover);
        setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', loadingCardRenderData(initialEntries, fallbackAnkiLookup)));
        this.mountLookupPopover(popover, anchor);
        this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
        this.installLookupPopoverHandlers(popover, card, sentence, anchor);
        this.installLookupPopoverSources(popover, card, sentence);
        void renderData.all.then(data => {
            if (this.activeLookupPopover !== popover || !popover.isConnected) return;
            clearNestedParseState(popover);
            setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', { ...data, loading: false }));
            this.dictionarySourceState.installTracking(popover);
            void this.parseNewTabContent(popover);
            this.installLookupPopoverSources(popover, card, sentence, data.jpdbVocabularyInfo);
            this.repositionLookupPopover();
        });
        void this.parseNewTabContent(popover);
    }

    private installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor?: HTMLElement): void {
        popover.addEventListener('click', event => {
            const kanjiButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="kanji"]');
            if (kanjiButton) {
                event.preventDefault();
                event.stopPropagation();
                const kanji = kanjiButton.dataset.kanji?.trim();
                if (kanji) void this.lookupText(kanji, kanji, kanjiButton);
                return;
            }

            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            if (button.dataset.action === 'mining-collapse') {
                this.toggleMiningControls(button);
                return;
            }
            if (button.dataset.action === 'deck-picker') {
                if (this.openDeckPickerForAdd(button, card, sentence)) return;
            }
            if (button.dataset.action === 'add' && this.openDeckPickerForAdd(button, card, sentence)) return;
            void this.handleCardAction(button, card, sentence, anchor);
        });
    }

    private toggleMiningControls(button: HTMLButtonElement): void {
        const actions = button.closest<HTMLElement>('.jpdb-reader-actions');
        if (!actions) return;
        this.setMiningControlsExpanded(button, actions.classList.contains('jpdb-reader-actions-mining-collapsed'));
    }

    private setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean): void {
        const actions = button.closest<HTMLElement>('.jpdb-reader-actions');
        if (!actions) return;
        actions.classList.toggle('jpdb-reader-actions-mining-collapsed', !expanded);
        button.setAttribute('aria-expanded', String(expanded));
        const label = expanded ? 'Hide mining actions' : 'Show mining actions';
        button.setAttribute('aria-label', label);
        button.title = label;
    }

    private openDeckPickerForAdd(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        const picker = button
            .closest<HTMLElement>('.jpdb-reader-mining-details')
            ?.querySelector<HTMLSelectElement>('[data-add-deck-select]');
        if (!picker) return false;
        const wrapper = picker.closest<HTMLElement>('.jpdb-reader-mining-details');
        const toggle = wrapper?.querySelector<HTMLButtonElement>('.jpdb-reader-mining-title');
        if (picker.classList.contains('jpdb-reader-add-deck-select-open')) {
            picker.focus();
            return true;
        }

        const controller = new AbortController();
        const cleanup = (): void => {
            controller.abort();
            picker.classList.remove('jpdb-reader-add-deck-select-open');
            wrapper?.classList.remove('jpdb-reader-deck-picker-open');
            toggle?.setAttribute('aria-expanded', 'false');
            picker.selectedIndex = 0;
        };
        picker.addEventListener('change', () => {
            const option = picker.selectedOptions[0];
            const deckId = option?.dataset.deckId?.trim();
            if (!deckId) {
                cleanup();
                return;
            }
            button.dataset.deckSource = option.dataset.deckSource === 'anki' ? 'anki' : 'jpdb';
            button.dataset.deckId = deckId;
            const originalAction = button.dataset.action;
            button.dataset.action = 'add';
            cleanup();
            void this.handleCardAction(button, card, sentence).finally(() => {
                if (originalAction) button.dataset.action = originalAction;
                delete button.dataset.deckSource;
                delete button.dataset.deckId;
            });
        }, { signal: controller.signal });
        picker.addEventListener('blur', () => {
            window.setTimeout(() => {
                if (document.activeElement !== picker) cleanup();
            }, 180);
        }, { once: true, signal: controller.signal });

        picker.classList.add('jpdb-reader-add-deck-select-open');
        wrapper?.classList.add('jpdb-reader-deck-picker-open');
        toggle?.setAttribute('aria-expanded', 'true');
        picker.focus();
        const showPicker = (picker as HTMLSelectElement & { showPicker?: () => void }).showPicker;
        if (showPicker) {
            try {
                showPicker.call(picker);
            } catch {
                // The temporary visible select is the fallback on browsers without a native picker.
            }
        }
        return true;
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const done = log.time('newTabCardAction', { action, term: card.spelling });
        try {
            const shouldRefresh = await this.cardActions.perform(action, button, card, sentence);
            if (shouldRefresh) await this.showLookupCard(card, sentence, anchor);
            log.info('New tab card action completed', { action, term: card.spelling });
        } catch (error) {
            log.warn('New tab card action failed', { action, term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : 'Action failed.');
        } finally {
            done();
            button.disabled = false;
        }
    }

    private async resolveMiningContext(card: JPDBCard, sentence?: string): Promise<MiningContext> {
        const activeContext = this.immersionPopover.activeContextFor(card);
        const storedContext = this.immersionPopover.storedContextFor(card);
        return resolveStoredMiningContext({
            term: card.spelling,
            sentence,
            settings: this.settings,
            activeContext,
            storedContext,
            sourceKind: inferMiningSourceKind(),
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit.fetchDataUrl(imageUrl, timeoutMs, this.settings.corsProxyUrl),
        });
    }

    private async lookupCard(term: string, reading: string): Promise<JPDBCard> {
        const parsed = await this.parser.parse([term]).catch(() => [[]]);
        const token = pickTokenForSelection(parsed[0] ?? [], term);
        if (token) return token.card;
        const localEntry = await this.localLookupEntry(term, reading);
        return localEntry ? this.parser.localCardFromEntry(localEntry) : this.parser.fallbackCardFromText(term);
    }

    private async localLookupEntry(term: string, reading: string): Promise<YomitanTermEntry | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const entries = await this.dictionaries.lookup(term, reading || term, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []);
        return entries[0];
    }

    private mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement): void {
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        const backdrop = createReaderBackdrop(() => this.dismissLookupPopover());
        document.body.append(backdrop, popover);
        this.activeLookupBackdrop = backdrop;
        this.activeLookupPopover = popover;
        this.activeLookupAnchor = anchor;
        this.dictionarySourceState.installTracking(popover);
        if (popover.classList.contains('jpdb-reader-sheet')) {
            installSheetHandle(popover, () => this.dismissLookupPopover());
            return;
        }
        this.repositionLookupPopover();
        requestAnimationFrame(() => this.repositionLookupPopover());
    }

    private dismissLookupPopover(): void {
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        this.activeLookupPopover = undefined;
        this.activeLookupBackdrop = undefined;
        this.activeLookupAnchor = undefined;
    }

    private repositionLookupPopover(): void {
        if (!this.activeLookupPopover) return;
        if (this.activeLookupPopover.classList.contains('jpdb-reader-sheet')) return;
        positionPopover(this.activeLookupPopover, this.activeLookupAnchor);
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[], sentence?: string, jpdbVocabularyInfo: JpdbVocabularyInfo | null = null): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        let renderedDictionaries = false;
        const sections = sourceIds.map(sourceId => {
            if (sourceId === JPDB_DEFINITION_SOURCE_ID) {
                return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded), jpdbVocabularyInfo);
            }
            if (sourceId === STUDY_TOOLS_SOURCE_ID) return this.studySources.renderToolsSource(sentence);
            if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return this.studySources.renderTranslationSource(sentence);
            if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return this.studySources.renderGrammarSource(sentence);
            if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderImmersionKitMount();
            if (grouped.has(sourceId)) {
                if (renderedDictionaries) return '';
                renderedDictionaries = true;
                return renderLocalDefinitionSourcesSection(
                    dictionarySourceIds,
                    grouped,
                    this.settings,
                    (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    card,
                );
            }
            return '';
        }).filter(Boolean);
        return sections.length
            ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
            : '<div class="jpdb-reader-help jpdb-reader-no-definitions">No definitions found.</div>';
    }

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceState.attributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private installLookupPopoverSources(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
    ): void {
        this.studySources.installLoaders(popover, sentence);
        if (!this.settings.immersionKitEnabled) return;
        const examples = jpdbVocabularyInfo
            ? this.immersionPopover.searchExamples(card, { relatedQueries: this.immersionRelatedQueries(jpdbVocabularyInfo) })
            : undefined;
        void this.immersionPopover.loadExamples(popover, card, examples);
    }

    private immersionRelatedQueries(info: JpdbVocabularyInfo): string[] {
        return info.compounds.flatMap(compound => [compound.term, compound.reading]).filter(Boolean);
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private isCurrentPopoverRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activeLookupPopover && (root === this.activeLookupPopover || this.activeLookupPopover.contains(root)));
    }

    private async enrichAnkiWords(tokens: JPDBToken[]): Promise<void> {
        if (!this.settings.ankiEnabled) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 16);
        for (const token of uniqueTokens) {
            const lookup = await this.anki.findExistingCards(token.card);
            this.applyAnkiLookupToRenderedWords(token.card, lookup);
        }
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void {
        if (!ankiLookup.primary) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.activeLookupPopover?.querySelectorAll<HTMLElement>(selector).forEach(word => {
            word.classList.add(`anki-${ankiLookup.state}`);
            word.dataset.ankiState = ankiLookup.state;
            word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
            word.title = `Anki: ${ankiLookup.state}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
        });
    }

    private restoreSettingsPreviewState(): void {
        if (this.settingsPreviewOriginalAccent !== undefined) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalTheme !== undefined) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
            this.applyTheme();
        }
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalTheme = undefined;
    }

    private toast(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'jpdb-reader-toast';
        toast.dataset.jpdbReaderRoot = 'true';
        toast.textContent = message;
        document.body.append(toast);
        window.setTimeout(() => toast.remove(), 3000);
    }

    private applyTheme(): void {
        applyReaderTheme(this.settings);
    }

    private applyAccentColor(color: string): void {
        applyReaderAccentColor(color);
    }

    private applyWordColors(settings = this.settings): void {
        applyReaderWordColors(settings);
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private async parseNewTabContent(root: HTMLElement): Promise<void> {
        if (!root.isConnected || !this.parser.canParse()) return;
        const plan = nestedTextParsePlan(root, 36);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        try {
            const parsed = await this.parser.parse(plan.targets.map(target => target.text));
            if (!root.isConnected || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey);
        }
    }
}

function markNewTabRuntime(): void {
    (window as YomuNewTabWindow).__YOMU_READER_RUNTIME__ = 'newtab';
}

function refreshableNoop(): { refresh: () => void } {
    return { refresh: () => undefined };
}
