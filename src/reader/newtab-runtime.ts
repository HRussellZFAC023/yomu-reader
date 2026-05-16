import { AudioPlayer } from './audio';
import { AnkiConnectClient, type AnkiLookupResult } from './anki';
import { renderReviewButtons } from './anki-render';
import { listNewTabAnkiCards } from './anki-new-tab';
import { positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { CardPopoverRenderer } from './card-popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData } from './card-render-data';
import { cardKey } from './card-utils';
import { APP_NAME, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from './constants';
import {
    kanjiSourceStateKey,
    definitionSourceStateKey,
    renderKanjiDefinitions,
    renderJpdbDefinitionSource,
    renderLocalDefinitionSourcesSection,
} from './definition-source-render';
import { DictionarySourceStateController } from './dictionary-source-state';
import { appendToDocumentHead, escapeHtml, HAS_JAPANESE, setInnerHtml } from './dom';
import { DictionaryStyleController } from './dictionary-styles';
import { ImmersionKitClient } from './immersion-kit';
import { ImmersionPopoverController } from './immersion-popover-controller';
import { uiText } from './i18n';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { createJpdbReviewBridgeClient } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { buildKanjiFacts, buildKanjiOriginGraph } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    inferMiningSourceKind,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedTextParsePlan } from './nested-text-parse';
import { NewTabController } from './new-tab-controller';
import { NEW_TAB_CSS } from './newtab-styles';
import { createReaderBackdrop, createReaderPopover, installMiningDrawerHandle, installSheetHandle } from './popover-shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from './popup-navigation';
import {
    buildRtkComponentSummaries,
    groupTermEntriesByDictionary,
    isKanjiCharacter,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderRtkInfo,
    uniqueKanji,
} from './popup-render';
import { ReaderParser } from './reader-parser';
import { RtkClient, type RtkInfo } from './rtk';
import {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
} from './settings';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from './reader-theme';
import { ReaderAudioActions } from './reader-audio-actions';
import { SettingsDialogController } from './settings-dialog-controller';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    KANJI_UCHISEN_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
} from './source-sections';
import { StudySourceController } from './study-sources';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { installUchisenCarousel, loadUchisenData } from './uchisen';
import { renderWordPills } from './word-pills';
import { YomitanDictionaryStore, type YomitanKanjiEntry, type YomitanTermEntry } from './yomitan';

const log = Logger.scope('NewTabRuntime');

type YomuNewTabWindow = typeof window & {
    __YOMU_READER_RUNTIME__?: string;
};

interface NewTabLookupDisplayOptions {
    navigation?: CardNavigationMode;
    previousNavigationEntry?: PopupNavigationEntry;
    reuseActivePopover?: boolean;
    autoPlay?: boolean;
}

interface NewTabKanjiLookupOptions {
    navigation?: CardNavigationMode;
    reuseActivePopover?: boolean;
}

export function bootNewTabRuntime(): void {
    const app = new NewTabRuntime();
    void app.init().catch(error => {
        log.error('New tab initialization failed', error);
        throw error;
    });
    window.addEventListener('pagehide', () => app.destroy(), { once: true });
}

export class NewTabRuntime {
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
    private navigation = new PopupNavigationController(() => Boolean(
        this.activeLookupPopover?.isConnected && this.activeLookupPopover.querySelector('.jpdb-reader-kanji-display'),
    ));
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
        renderWordHistory: (language, trigger) => this.navigation.renderWordHistory(language, trigger),
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
    private activeLookupHandlerController?: AbortController;
    private lookupRenderRequest = 0;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
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
        showCard: (card, sentence, anchor, options) => this.showLookupCard(card, sentence, anchor, options),
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
            showKanjiCard: (card, kanji, sentence, anchor) => this.showKanjiLookupCard(card, kanji, sentence, anchor),
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

    private nextLookupRenderRequest(): number {
        this.lookupRenderRequest += 1;
        return this.lookupRenderRequest;
    }

    private isCurrentLookupRender(popover: HTMLElement, requestId: number): boolean {
        return requestId === this.lookupRenderRequest
            && popover.isConnected
            && this.activeLookupPopover === popover;
    }

    private lookupRenderSurface(reuseActivePopover: boolean): { popover: HTMLElement; reused: boolean } {
        const active = this.activeLookupPopover;
        if (reuseActivePopover && active?.isConnected) return { popover: active, reused: true };
        return { popover: createReaderPopover(APP_NAME, this.settings), reused: false };
    }

    private activateLookupRenderSurface(popover: HTMLElement, anchor: HTMLElement | undefined, reused: boolean): void {
        if (!reused) {
            this.mountLookupPopover(popover, anchor);
            return;
        }
        this.activeLookupAnchor = anchor;
        this.dictionarySourceState.installTracking(popover);
        this.repositionLookupPopover();
    }

    private dismiss(): void {
        this.activeDialog?.remove();
        this.activeBackdrop?.remove();
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        this.activeLookupHandlerController?.abort();
        this.activeDialog = undefined;
        this.activeBackdrop = undefined;
        this.activeLookupPopover = undefined;
        this.activeLookupBackdrop = undefined;
        this.activeLookupAnchor = undefined;
        this.activeLookupHandlerController = undefined;
        this.navigation.clearWord();
        this.navigation.clearKanji();
        this.restoreSettingsPreviewState();
    }

    private async lookupText(text: string, reading = text, anchor?: HTMLElement, options: NewTabLookupDisplayOptions = {}): Promise<void> {
        const term = text.trim();
        if (!HAS_JAPANESE.test(term)) return;
        const sentence = anchor?.dataset.sentence || term;
        const previousNavigationEntry = options.previousNavigationEntry
            ?? this.lookupPreviousNavigationEntry(options.navigation);
        const card = await this.lookupCard(term, reading);
        await this.showLookupCard(card, sentence, anchor, {
            ...options,
            previousNavigationEntry,
        });
    }

    private async showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: NewTabLookupDisplayOptions = {}): Promise<void> {
        const requestId = this.nextLookupRenderRequest();
        const navigation = options.navigation ?? 'reset';
        this.navigation.updateWord(card, sentence, 'modal', navigation, options.previousNavigationEntry);
        this.navigation.clearKanji();
        const renderData = this.cardRenderData.load(card);
        const initialEntries = await renderData.localEntries.catch(() => []);
        if (requestId !== this.lookupRenderRequest) return;
        const { popover, reused } = this.lookupRenderSurface(options.reuseActivePopover === true);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        clearNestedParseState(popover);
        setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', loadingCardRenderData(initialEntries, fallbackAnkiLookup)));
        this.activateLookupRenderSurface(popover, anchor, reused);
        this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
        this.installLookupPopoverHandlers(popover, card, sentence, anchor);
        this.installLookupPopoverSources(popover, card, sentence);
        this.maybeAutoPlayLookupCard(card, options);
        void renderData.all.then(data => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            clearNestedParseState(popover);
            setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', { ...data, loading: false }));
            this.dictionarySourceState.installTracking(popover);
            void this.parseNewTabContent(popover);
            this.installLookupPopoverSources(popover, card, sentence, data.jpdbVocabularyInfo);
            this.repositionLookupPopover();
        });
        void this.parseNewTabContent(popover);
    }

    private lookupPreviousNavigationEntry(navigation: CardNavigationMode | undefined): PopupNavigationEntry | undefined {
        return navigation === 'push-current' ? this.navigation.activeKanjiEntry() : undefined;
    }

    private async showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: NewTabKanjiLookupOptions = {}): Promise<void> {
        if (!isKanjiCharacter(kanji)) return;
        const requestId = this.nextLookupRenderRequest();
        const navigation = options.navigation ?? 'reset';
        this.navigation.updateKanji(card, kanji, sentence, navigation);
        const { popover, reused } = this.lookupRenderSurface(options.reuseActivePopover === true);
        clearNestedParseState(popover);
        setInnerHtml(popover, this.renderKanjiLookupShell(card, kanji));
        this.activateLookupRenderSurface(popover, anchor, reused);
        this.installKanjiLookupHandlers(popover, card, kanji, sentence);
        installKanjiDoodle(popover, () => this.settings.interfaceLanguage);
        void this.renderKanjiLookupDetails(popover, card, kanji, requestId);
    }

    private renderKanjiLookupShell(card: JPDBCard, kanji: string): string {
        const language = this.settings.interfaceLanguage;
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const sourceMounts = this.renderKanjiLookupSourceMounts(card, kanji, language);
        return `
            <div class="jpdb-reader-popover-body">
                <div class="jpdb-reader-sheet-handle"></div>
                ${renderModalNavigation(this.navigation.kanjiModalBack(card, language))}
                <div class="jpdb-reader-header">
                    <div class="jpdb-reader-heading">
                        <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                            <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                            <div data-kanji-keyword-mount><div class="jpdb-reader-help">Loading kanji details...</div></div>
                            ${renderWordPills({
                                card,
                                jpdbUrl,
                                settings: this.settings,
                                metaEntries: [],
                                overrideQuery: kanji,
                                isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
                                dictionaryLabel: name => this.dictionaryLabel(name),
                            })}
                        </div>
                        <div data-kanji-mining-mount hidden></div>
                    </div>
                </div>
                <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                    ${sourceMounts}
                </div>
            </div>
        `;
    }

    private renderKanjiLookupSourceMounts(card: JPDBCard, kanji: string, language: ReaderSettings['interfaceLanguage']): string {
        const reviewControls = this.renderKanjiLookupReviewControls(card);
        const mounts: string[] = [];
        let insertedReviewControls = false;
        for (const sourceId of orderedKanjiSourceIds(this.settings)) {
            const mount = this.renderKanjiLookupSourceMount(sourceId, kanji, language);
            if (mount) mounts.push(mount);
            if (sourceId === KANJI_STROKE_SOURCE_ID && reviewControls) {
                mounts.push(reviewControls);
                insertedReviewControls = true;
            }
        }
        if (reviewControls && !insertedReviewControls) mounts.unshift(reviewControls);
        return mounts.join('');
    }

    private renderKanjiLookupSourceMount(sourceId: string, kanji: string, language: ReaderSettings['interfaceLanguage']): string {
        const sourceStateKey = kanjiSourceStateKey(sourceId);
        if (sourceId === KANJI_STROKE_SOURCE_ID) {
            return renderKanjiPractice(null, kanji, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey);
        }
        if (sourceId === KANJI_JPDB_SOURCE_ID) return '<div data-kanji-jpdb-mount></div>';
        if (sourceId === KANJI_RTK_SOURCE_ID) return '<div data-kanji-rtk-mount></div>';
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return '<div data-kanji-origin-mount></div>';
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return '<div data-kanji-uchisen-mount></div>';
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return '<div data-kanji-definitions-mount></div>';
        const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
        return dictionaryName
            ? `<div data-kanji-definitions-mount data-kanji-dictionary="${escapeHtml(dictionaryName)}" data-kanji-source-id="${escapeHtml(sourceId)}"></div>`
            : '';
    }

    private renderKanjiLookupReviewControls(card: JPDBCard): string {
        if (!this.newTab?.lookupGradeOptions(card).length) return '';
        return `
            <div class="jpdb-reader-kanji-review-card" role="group" aria-label="Grade current word">
                ${renderReviewButtons(this.settings)}
            </div>
        `;
    }

    private resetLookupHandlers(): AbortSignal {
        this.activeLookupHandlerController?.abort();
        const controller = new AbortController();
        this.activeLookupHandlerController = controller;
        return controller.signal;
    }

    private async showPreviousLookupWord(anchor?: HTMLElement): Promise<void> {
        const previous = this.navigation.popPreviousWord();
        if (!previous) return;
        if (previous.kind === 'kanji') {
            await this.showKanjiLookupCard(previous.card, previous.kanji, previous.sentence, anchor, {
                navigation: 'preserve',
                reuseActivePopover: true,
            });
            return;
        }
        await this.showLookupCard(previous.card, previous.sentence, anchor, {
            navigation: 'preserve',
            reuseActivePopover: true,
            autoPlay: false,
        });
    }

    private async showPreviousKanjiLookup(anchor?: HTMLElement): Promise<void> {
        const previous = this.navigation.popPreviousKanji();
        if (!previous) return;
        await this.showKanjiLookupCard(previous.card, previous.kanji, previous.sentence, anchor, {
            navigation: 'preserve',
            reuseActivePopover: true,
        });
    }

    private installKanjiLookupHandlers(popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string): void {
        const signal = this.resetLookupHandlers();
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button || !popover.contains(button)) return;
            const action = button.dataset.action;
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === 'word-back') {
                void this.showLookupCard(card, sentence, button, { navigation: 'preserve', reuseActivePopover: true, autoPlay: false });
                return;
            }
            if (action === 'kanji-history-back') {
                void this.showPreviousKanjiLookup(button);
                return;
            }
            if (action === 'kanji') {
                void this.showKanjiLookupCard(card, button.dataset.kanji ?? kanji, sentence, button, {
                    navigation: 'push-current',
                    reuseActivePopover: true,
                });
                return;
            }
            if (action === 'similar-word' || action === 'lookup') {
                const expression = button.dataset.expression ?? button.dataset.lookup ?? button.dataset.term ?? '';
                const reading = button.dataset.reading ?? expression;
                void this.lookupText(expression, reading, button, { navigation: 'push-current', reuseActivePopover: true });
                return;
            }
            if (action === 'jpdb-kanji-action') {
                const actionId = button.dataset.kanjiActionId ?? '';
                if (actionId) void this.performJpdbKanjiAction(actionId, card, kanji, sentence, button);
                return;
            }
            if (action === 'grade') {
                const grade = button.dataset.grade as JPDBGrade | undefined;
                if (grade) void this.gradeCurrentCardFromKanjiLookup(button, grade);
            }
        }, { signal });
    }

    private async gradeCurrentCardFromKanjiLookup(button: HTMLButtonElement, grade: JPDBGrade): Promise<void> {
        if (!this.newTab || button.disabled) return;
        button.disabled = true;
        try {
            await this.newTab.gradeFromLookup(grade);
            this.dismissLookupPopover();
        } catch (error) {
            log.warn('New tab kanji lookup grade failed', { grade }, error);
            this.toast('Could not submit grade.');
        } finally {
            button.disabled = false;
        }
    }

    private async renderKanjiLookupDetails(popover: HTMLElement, card: JPDBCard, kanji: string, requestId = this.lookupRenderRequest): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        const jpdbInfoPromise = this.settings.jpdbKanjiEnabled ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null);
        const kanjiEntriesPromise = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
        const rtkInfoPromise = this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null);
        const needsKanjiVG = this.settings.kanjivgEnabled || (this.settings.kanjiOriginsEnabled && this.settings.kanjiOriginGraphEnabled);
        const kanjiVGInfoPromise = needsKanjiVG ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null);

        const renderKeyword = () => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            const mount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
            if (mount?.isConnected) setInnerHtml(mount, renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries));
        };
        const renderRtk = () => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            const mount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
            if (!mount?.isConnected) return;
            const sourceStateKey = kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
            setInnerHtml(mount, renderRtkInfo(
                rtkInfo,
                buildRtkComponentSummaries(rtkInfo, jpdbInfo, kanjiEntries),
                this.settings.interfaceLanguage,
                this.dictionarySourceState.isOpen(sourceStateKey),
                sourceStateKey,
            ));
        };

        const renderDefinitions = () => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            popover.querySelectorAll<HTMLElement>('[data-kanji-definitions-mount]').forEach(mount => {
                const dictionaryName = mount.dataset.kanjiDictionary;
                const sourceId = mount.dataset.kanjiSourceId ?? KANJI_DICTIONARIES_SOURCE_ID;
                const visibleEntries = dictionaryName ? kanjiEntries.filter(entry => entry.dictionary === dictionaryName) : kanjiEntries;
                setInnerHtml(mount, renderKanjiDefinitions(
                    visibleEntries,
                    (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    sourceId,
                    dictionaryName ? this.dictionaryLabel(dictionaryName) : 'Kanji dictionaries',
                ));
            });
        };

        const renderOrigins = () => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
            if (!mount?.isConnected || !this.settings.kanjiOriginsEnabled) return;
            const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
            const facts = buildKanjiFacts(kanji, jpdbInfo, rtkInfo, this.settings.kanjivgEnabled ? kanjiVGInfo : null, kanjiEntries);
            const graph = this.settings.kanjiOriginGraphEnabled ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, null, kanjiVGInfo) : null;
            setInnerHtml(mount, renderKanjiOrigins(
                facts,
                graph,
                null,
                this.settings,
                this.settings.interfaceLanguage,
                this.dictionarySourceState.isOpen(sourceStateKey),
                sourceStateKey,
            ));
        };

        const renderKanjiVG = () => {
            if (!kanjiVGInfo || !this.isCurrentLookupRender(popover, requestId)) return;
            const stage = popover.querySelector<HTMLElement>(`.jpdb-reader-doodle-stage[data-kanji="${CSS.escape(kanji)}"]`);
            const ghost = stage?.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
            const help = stage?.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
            if (ghost) setInnerHtml(ghost, kanjiVGInfo.svg);
            if (help) help.textContent = `${kanjiVGInfo.strokeCount} ${uiText(this.settings.interfaceLanguage, 'strokes')}`;
            stage?.classList.remove('trace-hidden');
        };

        await Promise.all([
            jpdbInfoPromise.then(info => {
                jpdbInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
                if (jpdbMount?.isConnected) setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, this.settings.interfaceLanguage, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey));
                const controls = renderJpdbKanjiMiningControls(jpdbInfo, this.settings.interfaceLanguage);
                const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
                if (miningMount?.isConnected) {
                    miningMount.hidden = !controls;
                    setInnerHtml(miningMount, controls);
                }
                renderRtk();
            }),
            kanjiEntriesPromise.then(entries => {
                kanjiEntries = entries;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                renderDefinitions();
                renderRtk();
            }),
            rtkInfoPromise.then(info => {
                rtkInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                renderRtk();
            }),
            kanjiVGInfoPromise.then(info => {
                kanjiVGInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKanjiVG();
            }),
            this.renderUchisenInto(popover, kanji, requestId),
        ]);
        if (!this.isCurrentLookupRender(popover, requestId)) return;
        renderOrigins();
        void this.parseNewTabContent(popover);
        this.repositionLookupPopover();
    }

    private async renderUchisenInto(popover: HTMLElement, kanji: string, requestId: number): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        if (!mount?.isConnected || !this.settings.uchisenEnabled || !this.isCurrentLookupRender(popover, requestId)) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const sourceAttributes = () => this.dictionarySourceState.attributes(sourceStateKey, this.dictionarySourceState.isOpen(sourceStateKey));
        setInnerHtml(mount, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source" ${sourceAttributes()}>
                <summary class="jpdb-reader-local-title">Uchisen</summary>
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">Loading mnemonic images...</div></div>
            </details>
        `);
        const data = await loadUchisenData(kanji, this.settings.corsProxyUrl).catch(() => ({ images: [], componentGroups: [] }));
        if (!this.isCurrentLookupRender(popover, requestId) || !mount.isConnected) return;
        if (!data.images.length) {
            mount.remove();
            return;
        }
        await installUchisenCarousel(mount, kanji, data.images, {
            proxyUrl: this.settings.corsProxyUrl,
            sourceAttributes: sourceAttributes(),
            detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
            summaryClass: 'jpdb-reader-local-title',
            bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
            componentGroups: data.componentGroups,
        });
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        try {
            await this.jpdbKanji.performAction(actionId);
            this.toast('JPDB kanji updated.');
            await this.showKanjiLookupCard(card, kanji, sentence, anchor, {
                navigation: 'preserve',
                reuseActivePopover: true,
            });
        } catch (error) {
            log.warn('JPDB kanji action failed', { kanji }, error);
            this.toast('Could not update JPDB kanji. Check JPDB kanji reviews are enabled.');
        }
    }

    private installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor?: HTMLElement): void {
        const signal = this.resetLookupHandlers();
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        popover.addEventListener('click', event => {
            const kanjiButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="kanji"]');
            if (kanjiButton) {
                event.preventDefault();
                event.stopPropagation();
                const kanji = kanjiButton.dataset.kanji?.trim();
                if (kanji) void this.showKanjiLookupCard(card, kanji, sentence, kanjiButton, { reuseActivePopover: true });
                return;
            }

            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            if (button.dataset.action === 'word-history-back') {
                void this.showPreviousLookupWord(button);
                return;
            }
            if (button.dataset.action === 'mining-collapse') {
                this.toggleMiningControls(button);
                return;
            }
            if (button.dataset.action === 'deck-picker') {
                if (this.openDeckPickerForAdd(button, card, sentence)) return;
            }
            if (button.dataset.action === 'add' && this.openDeckPickerForAdd(button, card, sentence)) return;
            void this.handleCardAction(button, card, sentence, anchor);
        }, { signal });
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
            if (shouldRefresh) await this.showLookupCard(card, sentence, anchor, {
                navigation: 'preserve',
                reuseActivePopover: true,
                autoPlay: false,
            });
            log.info('New tab card action completed', { action, term: card.spelling });
        } catch (error) {
            log.warn('New tab card action failed', { action, term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : 'Action failed.');
        } finally {
            done();
            button.disabled = false;
        }
    }

    private maybeAutoPlayLookupCard(card: JPDBCard, options: NewTabLookupDisplayOptions): void {
        if (!this.shouldAutoPlayLookupCard(card, options)) return;
        void this.audioActions.playTermAudio(card);
    }

    private shouldAutoPlayLookupCard(card: JPDBCard, options: NewTabLookupDisplayOptions): boolean {
        if (options.autoPlay === false) return false;
        if (!this.settings.audioEnabled || !this.settings.autoPlayAudio) return false;
        if (!this.shouldAutoPlayForTrigger('modal')) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
        this.lastAutoAudioKey = key;
        this.lastAutoAudioAt = now;
        return true;
    }

    private shouldAutoPlayForTrigger(trigger: 'modal' | 'hover'): boolean {
        const mode = this.settings.audioAutoPlayMode;
        if (mode === 'all') return true;
        return mode === 'hover' ? trigger === 'hover' : trigger === 'modal';
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
        this.activeLookupHandlerController?.abort();
        this.activeLookupHandlerController = undefined;
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
        this.activeLookupHandlerController?.abort();
        this.activeLookupPopover = undefined;
        this.activeLookupBackdrop = undefined;
        this.activeLookupAnchor = undefined;
        this.activeLookupHandlerController = undefined;
        this.navigation.clearWord();
        this.navigation.clearKanji();
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
