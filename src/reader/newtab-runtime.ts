import { AudioPlayer } from './audio';
import { AnkiConnectClient, type AnkiLookupResult } from './anki';
import { listNewTabAnkiCards } from './anki-new-tab';
import { runLimited } from './async-utils';
import { copyText, positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { CardPopoverRenderer } from './card-popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData } from './card-render-data';
import { highlightCardTargetScopes } from './card-highlight';
import { cardKey } from './card-utils';
import { APP_NAME, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from './constants';
import {
    kanjiSourceStateKey,
    definitionSourceStateKey,
    renderKanjiDefinitions,
    renderJpdbDefinitionSource,
    renderLocalDefinitionSourcesSection,
    renderSimilarKanjiWordsContent,
    renderSimilarKanjiWordsShell,
} from './definition-source-render';
import { DictionarySourceStateController } from './dictionary-source-state';
import { appendToDocumentHead, escapeHtml, HAS_JAPANESE, readerWordSurfaceText, setInnerHtml, unwrapReaderWords } from './dom';
import { DictionaryStyleController } from './dictionary-styles';
import { FactoryResetCoordinator, FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS } from './factory-reset-coordinator';
import { ImmersionKitClient } from './immersion-kit';
import { ImmersionPopoverController } from './immersion-popover-controller';
import { waitForIdle as waitForBrowserIdle } from './idle';
import { resolveUiLanguage, uiText, type UiCopyKey } from './i18n';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo } from './jpdb-kanji';
import { getPitchClass } from './jpdb-parser';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { jpdbAudioCard } from './jpdb-page-targets';
import { createJpdbReviewBridgeClient } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { buildKanjiFacts, buildKanjiOriginGraph } from './kanji-origin';
import { installKanjiPracticeDoodle } from './kanji-practice-grader';
import { canAttemptAudiblePlayback } from './media-activation';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    inferMiningSourceKind,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsTextParsePlan, nestedTextParsePlan } from './nested-text-parse';
import { NewTabController, newTabKanjiSourceTitle } from './new-tab-controller';
import { NEW_TAB_CSS } from './newtab-styles';
import { installOriginGraphInteractions } from './origin-graph-interactions';
import { createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, popoverMaxHeightSetting, refreshForcedReaderPopoverSurface } from './popover-shell';
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
    renderPitch,
    renderRtkInfo,
    uniqueKanji,
} from './popup-render';
import { ReaderParser, jpdbFirstParseOptions } from './reader-parser';
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
    KANJI_SIMILAR_WORDS_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    KANJI_UCHISEN_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
} from './source-sections';
import { StudySourceController } from './study-sources';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { installUchisenCarousel, loadUchisenData } from './uchisen';
import { addWindowEventListener } from './window-events';
import { renderWordPills } from './word-pills';

import { YomitanDictionaryStore, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';

const log = Logger.scope('NewTabRuntime');
const NEW_TAB_POPOVER_PARSE_TIMEOUT_MS = 1_200;
const NEW_TAB_STUDY_PARSE_TIMEOUT_MS = 15_000;
const NEW_TAB_LOCAL_LOOKUP_TIMEOUT_MS = 450;
const NEW_TAB_REMOTE_LOOKUP_TIMEOUT_MS = 8_000;
const NEW_TAB_ANKI_ENRICHMENT_LIMIT = 16;
const NEW_TAB_PITCH_ENRICHMENT_LIMIT = 12;
const NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY = 4;
const NEW_TAB_PARSE_CONTENT_CACHE_TTL_MS = 30_000;
const NEW_TAB_PARSE_CONTENT_CACHE_LIMIT = 160;

type YomuNewTabWindow = typeof window & {
    __YOMU_READER_RUNTIME__?: string;
};

interface NewTabLookupDisplayOptions {
    navigation?: CardNavigationMode;
    previousNavigationEntry?: PopupNavigationEntry;
    reuseActivePopover?: boolean;
    autoPlay?: boolean;
    stackOverSettings?: boolean;
    userGesture?: boolean;
}

interface NewTabKanjiLookupOptions {
    navigation?: CardNavigationMode;
    reuseActivePopover?: boolean;
}

interface NewTabParseContentOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
}

export function bootNewTabRuntime(): void {
    const app = new NewTabRuntime();
    void app.init().catch(error => {
        log.error('New tab initialization failed', error);
        throw error;
    });
    addWindowEventListener('pagehide', () => app.destroy(), { once: true });
}

export class NewTabRuntime {
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private isDestroyed = false;
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
    private dictionaries = new YomitanDictionaryStore(() => this.settings.corsProxyUrl, () => this.settings.interfaceLanguage);
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
        renderReviewButtonsFallback: card => this.renderNewTabLookupReviewButtons(card),
    });
    private activeLookupPopover?: HTMLElement;
    private activeLookupBackdrop?: HTMLElement;
    private activeLookupAnchor?: HTMLElement;
    private activeLookupHandlerController?: AbortController;
    private lookupRenderRequest = 0;
    private parseContentCache = new Map<string, { expiresAt: number; promise: Promise<JPDBToken[][]> }>();
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
        parseJapanese: (paragraphs, options) => this.parser.parse(paragraphs, options),
        parsePopoverJapanese: popover => this.parseNewTabContent(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        isCurrentPopoverRoot: root => this.isCurrentPopoverRoot(root),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: (paragraphs, options) => this.parser.parse(paragraphs, options),
        canParseJapanese: () => this.parser.canParse(),
        parsePopoverJapanese: popover => this.parseNewTabContent(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens),
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
        playMediaUrl: audioUrl => this.audioActions.playMediaUrl(audioUrl),
        playSentenceAudio: sentence => this.audioActions.playSentenceAudio(sentence),
        playJpdbExampleAudio: (audioIds, fallbackSentence) => this.audioActions.playJpdbExampleAudio(audioIds, fallbackSentence),
        detectGrammarHints: sentence => this.studySources.detectGrammarHints(sentence),
        parsePopoverJapanese: popover => this.parseNewTabContent(popover),
        toast: message => this.toast(message),
    });
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });
    private factoryReset = new FactoryResetCoordinator({
        isDestroyed: () => this.isDestroyed,
        getLanguage: () => this.settings.interfaceLanguage,
        invalidateRuntimeStores: () => this.invalidateRuntimeStoresForFactoryReset(),
        resetDictionaryDatabase: () => this.dictionaries.deleteDatabase({ timeoutMs: FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS })
            .then(() => ({ deleted: true })),
        toast: message => this.toast(message),
        reload: () => location.reload(),
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
        youtube: refreshableNoop(),
        createBackdrop: () => createReaderBackdrop(() => this.dismiss()),
        mountDialog: (backdrop, form) => this.mountSettingsDialog(backdrop, form),
        dismiss: () => this.dismiss(),
        toast: message => this.toast(message),
        applyTheme: settings => this.applyTheme(settings),
        applyAccentColor: color => this.applyAccentColor(color),
        applyWordColors: settings => this.applyWordColors(settings),
        lookupText: (text, _sentence, anchor) => this.lookupText(text, text, anchor, { stackOverSettings: true }),
        parseSettingsJapanese: form => this.parseSettingsJapanese(form),
        installFab: () => undefined,
        refreshDictionaryStyles: () => this.refreshDictionaryStyles(),
        scheduleDictionaryRescan: () => undefined,
        refreshNewTabIfCurrent: () => {
            if (this.newTab?.isCurrentPage()) void this.newTab.renderPage();
        },
        clearDictionarySourceOpenOverrides: () => undefined,
        resetAllData: () => this.factoryReset.resetAllData(),
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
        this.isDestroyed = false;
        markNewTabRuntime();
        this.installExternalRefreshListener();
        configureLogger({ settingsProvider: () => this.settings });
        this.factoryReset.bind();
        this.installStyles();
        this.settings = await loadSettings();
        configureLogger({ forceEnabled: this.settings.enableLogging });
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        this.applyTheme();
        this.newTab = this.createNewTabController();
        await this.newTab.renderPage();
        void this.refreshDictionaryStyles();
        if (this.settings.localDictionariesEnabled) {
            window.setTimeout(() => {
                if (!this.isDestroyed) void this.dictionaries.prepareTermSearchIndex();
            }, 1500);
        }
    }

    destroy(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.externalRefreshController?.abort();
        this.externalRefreshController = undefined;
        this.factoryReset.destroy();
        this.newTab?.destroy();
        this.dictionaryStyles.remove();
        this.parseContentCache.clear();
        this.dismiss();
    }

    private async invalidateRuntimeStoresForFactoryReset(): Promise<void> {
        this.dismiss();
        this.jpdb.clear();
        this.parser.clearLocalCache();
        this.dictionarySourceState.clear();
        this.cardRenderData.clear();
        this.parseContentCache.clear();
        this.lookupRenderRequest++;
        this.lastAutoAudioKey = '';
        this.lastAutoAudioAt = 0;
        await this.dictionaries.invalidateForFactoryReset();
    }

    private installExternalRefreshListener(): void {
        this.externalRefreshController?.abort();
        const controller = new AbortController();
        addWindowEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => {
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
                invoke: (action, params) => this.anki.invoke(action, params),
                requestPermission: () => this.anki.invoke('requestPermission'),
            },
            jpdb: this.jpdb,
            jpdbKanji: this.jpdbKanji,
            kanjiVG: this.kanjiVG,
            rtk: this.rtk,
            immersionKit: this.immersionKit,
            jpdbVocabulary: this.jpdbVocabulary,
            jpdbPublicPitch: this.jpdbPublicPitch,
            jpdbReviewBridge: this.jpdbReviewBridge,
            parser: this.parser,
            dictionaries: this.dictionaries,
            parseContent: (root, options) => this.parseNewTabContent(root, {
                jpdbTimeoutMs: options?.jpdbTimeoutMs ?? NEW_TAB_STUDY_PARSE_TIMEOUT_MS,
                allowJpdbTimeoutFallback: options?.allowJpdbTimeoutFallback,
            }),
            lookupText: (text, reading, anchor, options) => this.lookupText(text, reading, anchor, { userGesture: options?.userGesture }),
            lookupDictionaryReference: (query, reading, _dictionary, anchor, options) => this.lookupText(query, reading || query, anchor, { userGesture: options?.userGesture }),
            showLookupCard: (card, sentence, anchor, options) => this.showLookupCard(card, sentence, anchor, {
                navigation: 'push-current',
                reuseActivePopover: true,
                autoPlay: false,
                userGesture: options?.userGesture,
            }),
            showKanjiCard: (card, kanji, sentence, anchor) => this.showKanjiLookupCard(card, kanji, sentence, anchor),
            loadCardRenderData: card => this.cardRenderData.load(card).all,
            renderSearchDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, { includeStudySources: false }),
            renderSearchWordPills: (card, metaEntries) => renderWordPills({
                card,
                jpdbUrl: `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`,
                settings: this.settings,
                metaEntries,
                isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
                dictionaryLabel: name => this.dictionaryLabel(name),
            }),
            installSearchDetailSources: (root, card, sentence, jpdbVocabularyInfo) => this.installLookupPopoverSources(root, card, sentence, jpdbVocabularyInfo),
            preloadWordAudio: card => this.preloadCurrentStudyWordAudio(card),
            playWordAudio: card => this.audioActions.playTermAudio(card, { userGesture: true }),
            playJpdbExampleAudio: (audioIds, fallbackSentence) => this.audioActions.playJpdbExampleAudio(audioIds, fallbackSentence),
            setImmersionTranslationBlurred: blurred => this.setImmersionTranslationBlurred(blurred),
            dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            isDictionarySourceOpen: (key, initiallyExpanded) => this.dictionarySourceState.isOpen(key, initiallyExpanded),
            installDictionarySourceTracking: root => this.dictionarySourceState.installTracking(root),
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

    private activateLookupRenderSurface(popover: HTMLElement, anchor: HTMLElement | undefined, reused: boolean, options: Pick<NewTabLookupDisplayOptions, 'stackOverSettings'> = {}): void {
        if (!reused) {
            this.mountLookupPopover(popover, anchor, options);
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

    private text(key: UiCopyKey): string {
        return uiText(this.settings.interfaceLanguage, key);
    }

    private localizeLookupPopoverChrome(popover: HTMLElement): void {
        popover.setAttribute('aria-label', this.text('lookupDialog'));
        refreshForcedReaderPopoverSurface(popover, this.settings);
        popover.querySelectorAll<HTMLElement>('.jpdb-reader-sheet-handle').forEach(handle => {
            handle.setAttribute('aria-label', this.text('resizeLookupSheet'));
        });
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
        const { popover, reused } = this.lookupRenderSurface(options.reuseActivePopover === true);
        if (requestId !== this.lookupRenderRequest) return;
        this.maybePreloadLookupCardAudio(card, options);
        const renderData = this.cardRenderData.load(card);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        const renderState = { fullRenderCompleted: false };
        let metaEntriesValue: YomitanMetaEntry[] = [];
        let renderedPitchKey = card.pitchAccent.join('|');
        clearNestedParseState(popover);
        setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', loadingCardRenderData([], fallbackAnkiLookup)));
        this.localizeLookupPopoverChrome(popover);
        this.activateLookupRenderSurface(popover, anchor, reused, options);
        this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
        this.installLookupPopoverHandlers(popover, card, sentence, anchor);
        this.installLookupPopoverSources(popover, card, sentence);
        this.maybeAutoPlayLookupCard(card, options);
        void renderData.localEntries.then(localEntries => {
            if (renderState.fullRenderCompleted || !this.isCurrentLookupRender(popover, requestId)) return;
            clearNestedParseState(popover);
            setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', loadingCardRenderData(localEntries, fallbackAnkiLookup)));
            this.localizeLookupPopoverChrome(popover);
            this.dictionarySourceState.installTracking(popover);
            void this.parseNewTabContent(popover);
            this.installLookupPopoverSources(popover, card, sentence);
            this.repositionLookupPopover();
        });
        if (renderData.localMetaEntries) {
            void Promise.all([renderData.localEntries, renderData.localMetaEntries]).then(([localEntries, metaEntries]) => {
                metaEntriesValue = metaEntries;
                if (renderState.fullRenderCompleted || !this.isCurrentLookupRender(popover, requestId)) return;
                this.applyPitchAccentToRenderedWords(card);
                renderedPitchKey = card.pitchAccent.join('|');
                clearNestedParseState(popover);
                setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', loadingCardRenderData(localEntries, fallbackAnkiLookup, metaEntries)));
                this.localizeLookupPopoverChrome(popover);
                this.dictionarySourceState.installTracking(popover);
                void this.parseNewTabContent(popover);
                this.installLookupPopoverSources(popover, card, sentence);
                this.repositionLookupPopover();
            });
        }
        if (renderData.pitchAccent) {
            void renderData.pitchAccent.then(pitchAccent => {
                if (!pitchAccent.length || !this.isCurrentLookupRender(popover, requestId)) return;
                if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
                if (renderedPitchKey === card.pitchAccent.join('|')) return;
                renderedPitchKey = card.pitchAccent.join('|');
                this.updateDeferredLookupPitch(popover, card, metaEntriesValue);
            });
        }
        void renderData.all.then(data => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            renderState.fullRenderCompleted = true;
            metaEntriesValue = data.metaEntries;
            renderedPitchKey = card.pitchAccent.join('|');
            this.applyPitchAccentToRenderedWords(card);
            clearNestedParseState(popover);
            setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', { ...data, loading: false }));
            this.localizeLookupPopoverChrome(popover);
            this.dictionarySourceState.installTracking(popover);
            void this.parseNewTabContent(popover);
            this.installLookupPopoverSources(popover, card, sentence, data.jpdbVocabularyInfo);
            this.repositionLookupPopover();
        });
        void this.parseNewTabContent(popover);
    }

    private updateDeferredLookupPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        this.applyPitchAccentToRenderedWords(card);
        this.updateLookupWordPills(popover, card, metaEntries);
        this.updateLookupPitch(popover, card, metaEntries);
        this.repositionLookupPopover();
    }

    private updateLookupWordPills(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        const heading = popover.querySelector<HTMLElement>('.jpdb-reader-heading');
        if (!heading) return;
        const html = renderWordPills({
            card,
            jpdbUrl: `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`,
            settings: this.settings,
            metaEntries,
            isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        });
        replaceOptionalElement(heading, '.jpdb-reader-word-pills', html);
    }

    private updateLookupPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        const tools = popover.querySelector<HTMLElement>('.jpdb-reader-card-tools');
        if (!tools || !this.settings.showPitchAccent) return;
        replaceOptionalElement(tools, '.jpdb-reader-pitch', renderPitch(card, metaEntries), tools.firstElementChild);
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
        this.localizeLookupPopoverChrome(popover);
        this.activateLookupRenderSurface(popover, anchor, reused);
        this.installKanjiLookupHandlers(popover, card, kanji, sentence);
        void this.renderKanjiLookupDetails(popover, card, kanji, requestId);
    }

    private renderKanjiLookupShell(card: JPDBCard, kanji: string): string {
        const language = this.settings.interfaceLanguage;
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const sourceMounts = this.renderKanjiLookupSourceMounts(kanji, language);
        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                ${renderModalNavigation(this.navigation.kanjiModalBack(card, language))}
                <div class="jpdb-reader-header">
                    <div class="jpdb-reader-heading">
                        <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                            <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                            <div data-kanji-keyword-mount><div class="jpdb-reader-help">${escapeHtml(this.text('loadingKanjiDetails'))}</div></div>
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
                    </div>
                </div>
                <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                    ${sourceMounts}
                </div>
            </div>
            ${this.renderKanjiLookupActionBar(card)}
        `;
    }

    private renderKanjiLookupSourceMounts(kanji: string, language: ReaderSettings['interfaceLanguage']): string {
        const mounts: string[] = [];
        for (const sourceId of orderedKanjiSourceIds(this.settings)) {
            const mount = this.renderKanjiLookupSourceMount(sourceId, kanji, language);
            if (mount) mounts.push(mount);
        }
        return mounts.join('');
    }

    private renderKanjiLookupSourceMount(sourceId: string, kanji: string, language: ReaderSettings['interfaceLanguage']): string {
        const sourceStateKey = kanjiSourceStateKey(sourceId);
        if (sourceId === KANJI_STROKE_SOURCE_ID) {
            return renderKanjiPractice(null, kanji, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(sourceId));
        }
        if (sourceId === KANJI_JPDB_SOURCE_ID) return '<div data-kanji-jpdb-mount></div>';
        if (sourceId === KANJI_RTK_SOURCE_ID) return '<div data-kanji-rtk-mount></div>';
        if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderKanjiLookupImmersionMount();
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return '<div data-kanji-origin-mount></div>';
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return '<div data-kanji-uchisen-mount></div>';
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return '<div data-kanji-definitions-mount></div>';
        if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) {
            const sourceStateKey = kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID);
            return renderSimilarKanjiWordsShell(
                kanji,
                language,
                sourceStateKey,
                this.dictionarySourceState.isOpen(sourceStateKey),
                (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                this.kanjiSourceTitle(sourceId),
            );
        }
        const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
        return dictionaryName
            ? `<div data-kanji-definitions-mount data-kanji-dictionary="${escapeHtml(dictionaryName)}" data-kanji-source-id="${escapeHtml(sourceId)}"></div>`
            : '';
    }

    private renderKanjiLookupImmersionMount(): string {
        if (!this.shouldRenderKanjiImmersionKit()) return '';
        const sourceStateKey = kanjiSourceStateKey(IMMERSION_KIT_SOURCE_ID);
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceState.attributes(sourceStateKey, false)}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private renderKanjiLookupActionBar(card: JPDBCard): string {
        const reviewButtons = this.renderKanjiLookupReviewButtons(card);
        return `
            <div class="jpdb-reader-actions" data-kanji-actions data-kanji-has-review="${reviewButtons ? 'true' : 'false'}"${reviewButtons ? '' : ' hidden'}>
                <div class="jpdb-reader-actions-gutter" hidden>
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="${escapeHtml(this.text('showMiningActions'))}" aria-label="${escapeHtml(this.text('showMiningActions'))}"></button>
                </div>
                <div data-kanji-mining-mount hidden></div>
                ${reviewButtons}
            </div>
        `;
    }

    private renderKanjiLookupReviewButtons(card: JPDBCard): string {
        return this.renderNewTabLookupReviewButtons(card);
    }

    private renderNewTabLookupReviewButtons(card: JPDBCard): string {
        const grades = this.newTab?.lookupGradeOptions(card) ?? [];
        if (!grades.length) return '';
        return `
            <div class="jpdb-reader-row${grades.length === 5 ? ' jpdb-reader-grades' : ''}" style="--cols: ${grades.length}">
                ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}">${escapeHtml(label)}</button>`).join('')}
            </div>
        `;
    }

    private updateKanjiLookupMiningControls(popover: HTMLElement, controls: string): void {
        const actions = popover.querySelector<HTMLElement>('[data-kanji-actions]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        if (!actions || !miningMount) return;
        const hasControls = Boolean(controls);
        const hasReview = actions.dataset.kanjiHasReview === 'true';
        actions.hidden = !hasControls && !hasReview;
        actions.classList.toggle('jpdb-reader-actions-has-mining', hasControls);
        actions.classList.toggle('jpdb-reader-actions-mining-collapsed', hasControls);
        const gutter = actions.querySelector<HTMLElement>('.jpdb-reader-actions-gutter');
        if (gutter) gutter.hidden = !hasControls;
        const collapseButton = actions.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');
        if (collapseButton && hasControls) this.setMiningControlsExpanded(collapseButton, false);
        miningMount.hidden = !hasControls;
        setInnerHtml(miningMount, controls);
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
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        popover.addEventListener('click', event => {
            if (this.handleLookupPopoverDictionaryLink(event, popover)) return;
            if (this.handleLookupPopoverParsedWord(event, popover)) return;

            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button || !popover.contains(button)) return;
            const action = button.dataset.action;
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === 'copy-word') {
                void copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord')));
                return;
            }
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
                void this.lookupText(expression, reading, button, { navigation: 'push-current', reuseActivePopover: true, userGesture: true });
                return;
            }
            if (action === 'jpdb-kanji-action') {
                const actionId = button.dataset.kanjiActionId ?? '';
                if (actionId) void this.performJpdbKanjiAction(actionId, card, kanji, sentence, button);
                return;
            }
            if (action === 'mining-collapse') {
                this.toggleMiningControls(button);
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
            this.toast(this.text('couldNotSubmitGrade'));
        } finally {
            button.disabled = false;
        }
    }

    private async renderKanjiLookupDetails(popover: HTMLElement, card: JPDBCard, kanji: string, requestId = this.lookupRenderRequest): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        const practiceDoodle = installKanjiPracticeDoodle(popover, () => this.settings.interfaceLanguage, () => kanjiVGInfo);
        const jpdbInfoPromise = this.settings.jpdbKanjiEnabled
            ? this.lookupDetailWithTimeout(this.jpdbKanji.lookup(kanji), null, 'JPDB kanji lookup timed out.')
            : Promise.resolve(null);
        const kanjiEntriesPromise = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.lookupDetailWithTimeout(
                this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences),
                [] as YomitanKanjiEntry[],
                'Local kanji lookup timed out.',
                NEW_TAB_LOCAL_LOOKUP_TIMEOUT_MS,
            )
            : Promise.resolve([]);
        const rtkInfoPromise = this.settings.rtkEnabled
            ? this.lookupDetailWithTimeout(this.rtk.lookup(kanji), null, 'RTK lookup timed out.')
            : Promise.resolve(null);
        const needsKanjiVG = this.settings.kanjivgEnabled || (this.settings.kanjiOriginsEnabled && this.settings.kanjiOriginGraphEnabled);
        const kanjiVGInfoPromise = needsKanjiVG
            ? this.lookupDetailWithTimeout(this.kanjiVG.lookup(kanji), null, 'KanjiVG lookup timed out.')
            : Promise.resolve(null);
        if (this.settings.similarKanjiWords) {
            this.renderSimilarKanjiWordsProgressively(popover, jpdbInfoPromise, kanji, card, requestId);
        }
        if (this.settings.uchisenEnabled) {
            void this.renderUchisenInto(popover, kanji, requestId);
        }
        this.installKanjiLookupImmersionExamples(popover, kanji);

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
                    dictionaryName ? this.dictionaryLabel(dictionaryName) : this.kanjiSourceTitle(KANJI_DICTIONARIES_SOURCE_ID),
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
                new Set([
                    jpdbInfo?.type ? this.text('factType') : null,
                    jpdbInfo?.frequency ? this.text('factFrequency') : null,
                ].filter(Boolean) as string[]),
                this.kanjiSourceTitle(KANJI_ORIGINS_SOURCE_ID),
            ));
            installOriginGraphInteractions(mount);
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
                if (jpdbMount?.isConnected) setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, this.settings.interfaceLanguage, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(KANJI_JPDB_SOURCE_ID)));
                this.updateKanjiLookupMiningControls(popover, renderJpdbKanjiMiningControls(jpdbInfo, this.settings.interfaceLanguage));
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
                practiceDoodle.reassess();
            }),
        ]);
        if (!this.isCurrentLookupRender(popover, requestId)) return;
        renderOrigins();
        void this.parseNewTabContent(popover);
        this.repositionLookupPopover();
    }

    private shouldRenderKanjiImmersionKit(): boolean {
        return this.settings.immersionKitEnabled && this.settings.kanjiImmersionKitEnabled;
    }

    private installKanjiLookupImmersionExamples(popover: HTMLElement, kanji: string): void {
        if (!this.shouldRenderKanjiImmersionKit()) return;
        this.immersionPopover.installLazyLoad(popover, jpdbAudioCard(kanji, kanji));
    }

    private renderSimilarKanjiWordsProgressively(
        popover: HTMLElement,
        jpdbInfoPromise: Promise<JpdbKanjiInfo | null>,
        kanji: string,
        card: JPDBCard,
        requestId: number,
    ): void {
        const section = popover.querySelector<HTMLDetailsElement>('[data-kanji-similar-words]');
        const mount = section?.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!section?.isConnected || !mount?.isConnected) return;

        let started = false;
        let jpdbLoaded = false;
        let localLoaded = !this.settings.localDictionariesEnabled;
        let jpdbVocabulary: JpdbKanjiInfo['vocabulary'] = [];
        let localEntries: YomitanTermEntry[] = [];
        const render = () => {
            if (!this.isCurrentLookupRender(popover, requestId) || !section.isConnected || !mount.isConnected) return;
            const content = renderSimilarKanjiWordsContent(localEntries, jpdbVocabulary, card, this.settings, name => this.dictionaryLabel(name));
            setInnerHtml(mount, content || `<div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, jpdbLoaded && localLoaded ? 'noSimilarWords' : 'loadingSimilarWords')}</div>`);
            this.repositionLookupPopover();
        };

        const load = () => {
            if (!section.open || started || !this.isCurrentLookupRender(popover, requestId)) return;
            started = true;
            render();

            void jpdbInfoPromise.then(info => {
                jpdbVocabulary = info?.vocabulary ?? [];
                jpdbLoaded = true;
                render();
            }).catch(() => {
                jpdbLoaded = true;
                render();
            });

            if (!this.settings.localDictionariesEnabled) return;
            void this.lookupSimilarKanjiWordsWhenIdle(kanji).then(entries => {
                localEntries = entries;
                localLoaded = true;
                render();
            }).catch(() => {
                localLoaded = true;
                render();
            });
        };

        section.addEventListener('toggle', load);
        load();
    }

    private async lookupSimilarKanjiWordsWhenIdle(kanji: string): Promise<YomitanTermEntry[]> {
        await this.waitForIdle();
        return this.lookupDetailWithTimeout(
            this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences),
            [] as YomitanTermEntry[],
            'Similar kanji words lookup timed out.',
            NEW_TAB_LOCAL_LOOKUP_TIMEOUT_MS,
        );
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return waitForBrowserIdle(timeoutMs);
    }

    private lookupDetailWithTimeout<T>(
        promise: Promise<T>,
        fallback: T,
        message: string,
        timeoutMs = NEW_TAB_REMOTE_LOOKUP_TIMEOUT_MS,
    ): Promise<T> {
        let timeoutId = 0;
        const timeout = new Promise<T>(resolve => {
            timeoutId = window.setTimeout(() => {
                log.debug(message, { timeoutMs });
                resolve(fallback);
            }, timeoutMs);
        });
        return Promise.race([
            promise.catch(() => fallback),
            timeout,
        ]).finally(() => window.clearTimeout(timeoutId));
    }

    private async renderUchisenInto(popover: HTMLElement, kanji: string, requestId: number): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        if (!mount?.isConnected || !this.settings.uchisenEnabled || !this.isCurrentLookupRender(popover, requestId)) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const sourceAttributes = () => this.dictionarySourceState.attributes(sourceStateKey, this.dictionarySourceState.isOpen(sourceStateKey));
        setInnerHtml(mount, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source" ${sourceAttributes()}>
                <summary class="jpdb-reader-local-title">Uchisen</summary>
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">${escapeHtml(this.text('loadingMnemonicImages'))}</div></div>
            </details>
        `);
        const data = await loadUchisenData(kanji, this.settings.corsProxyUrl).catch(() => ({ images: [], componentGroups: [], kanjiKeyword: null, kanjiId: '', canGenerateImages: false }));
        if (!this.isCurrentLookupRender(popover, requestId) || !mount.isConnected) return;
        if (!data.images.length && !data.canGenerateImages) {
            mount.remove();
            this.repositionLookupPopover();
            return;
        }
        await installUchisenCarousel(mount, kanji, data.images, {
            proxyUrl: this.settings.corsProxyUrl,
            sourceAttributes: sourceAttributes(),
            detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
            summaryClass: 'jpdb-reader-local-title',
            bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
            componentGroups: data.componentGroups,
            kanjiKeyword: data.kanjiKeyword,
            kanjiId: data.kanjiId,
            canGenerateImages: data.canGenerateImages,
            refreshData: () => loadUchisenData(kanji, this.settings.corsProxyUrl),
            interfaceLanguage: this.settings.interfaceLanguage,
        });
        if (this.isCurrentLookupRender(popover, requestId)) this.repositionLookupPopover();
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        try {
            await this.jpdbKanji.performAction(actionId);
            this.toast(this.text('jpdbKanjiUpdated'));
            await this.showKanjiLookupCard(card, kanji, sentence, anchor, {
                navigation: 'preserve',
                reuseActivePopover: true,
            });
        } catch (error) {
            log.warn('JPDB kanji action failed', { kanji }, error);
            this.toast(this.text('jpdbKanjiUpdateFailedRuntime'));
        }
    }

    private installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor?: HTMLElement): void {
        const signal = this.resetLookupHandlers();
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        popover.addEventListener('click', event => {
            if (this.handleLookupPopoverDictionaryLink(event, popover)) return;
            if (this.handleLookupPopoverParsedWord(event, popover)) return;

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

    private handleLookupPopoverDictionaryLink(event: MouseEvent, popover: HTMLElement): boolean {
        const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]');
        if (!link || !popover.contains(link)) return false;
        const query = link.dataset.dictionaryLookup?.trim() ?? '';
        if (!HAS_JAPANESE.test(query)) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.lookupText(link.dataset.dictionaryLookup ?? '', link.dataset.dictionaryReading || query, link, {
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        });
        return true;
    }

    private handleLookupPopoverParsedWord(event: MouseEvent, popover: HTMLElement): boolean {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-action="kanji"][data-kanji]')) return false;
        const word = target?.closest<HTMLElement>('.jpdb-reader-word');
        if (!word || !popover.contains(word)) return false;
        const card = this.parser.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
        event.preventDefault();
        event.stopPropagation();
        const expression = readerWordSurfaceText(word).trim();
        const sentence = word.dataset.sentence || expression || card?.spelling || '';
        if (!card) {
            if (HAS_JAPANESE.test(expression)) {
                void this.lookupText(expression, expression, word, {
                    navigation: 'push-current',
                    reuseActivePopover: true,
                    previousNavigationEntry: this.lookupPreviousNavigationEntry('push-current'),
                    userGesture: true,
                });
            }
            return true;
        }
        void this.showLookupCard(card, sentence, word, {
            navigation: 'push-current',
            reuseActivePopover: true,
            previousNavigationEntry: this.lookupPreviousNavigationEntry('push-current'),
            userGesture: true,
        });
        return true;
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
        const label = this.text(expanded ? 'hideMiningActions' : 'showMiningActions');
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
            this.toast(error instanceof Error ? error.message : this.text('actionFailed'));
        } finally {
            done();
            button.disabled = false;
        }
    }

    private maybeAutoPlayLookupCard(card: JPDBCard, options: NewTabLookupDisplayOptions): void {
        if (!this.shouldAutoPlayLookupCard(card, options)) return;
        if (options.userGesture) void this.audioActions.playTermAudio(card, { userGesture: true });
        else void this.audioActions.playTermAudio(card);
    }

    private preloadCurrentStudyWordAudio(card: JPDBCard): void {
        if (!this.settings.audioEnabled) return;
        this.audio.preload(card, {
            sourceLimit: 1,
            candidateLimit: 1,
            prepareAudio: true,
        });
    }

    private maybePreloadLookupCardAudio(card: JPDBCard, options: NewTabLookupDisplayOptions): void {
        if (!this.settings.audioEnabled) return;
        this.audio.preload(card, {
            sourceLimit: 1,
            candidateLimit: 1,
            prepareAudio: true,
        });
    }

    private shouldAutoPlayLookupCard(card: JPDBCard, options: NewTabLookupDisplayOptions): boolean {
        if (options.autoPlay === false) return false;
        if (!this.settings.audioEnabled || !this.settings.autoPlayAudio) return false;
        if (!this.shouldAutoPlayForTrigger('modal')) return false;
        if (!canAttemptAudiblePlayback()) return false;
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
            fetchAudioDataUrl: (audioUrls, timeoutMs) => this.immersionKit.fetchDataUrl(audioUrls, timeoutMs, this.settings.corsProxyUrl),
        });
    }

    private async lookupCard(term: string, reading: string): Promise<JPDBCard> {
        const localEntry = await this.localLookupEntry(term, reading);
        if (localEntry) return this.parser.localCardFromEntry(localEntry);
        const publicCard = await this.publicLookupCard(term, true);
        if (publicCard) return publicCard;
        const parsed = await this.parser.parse([term], jpdbFirstParseOptions()).catch(() => [[]]);
        const token = pickTokenForSelection(parsed[0] ?? [], term);
        if (token) return token.card;
        return this.parser.fallbackCardFromText(term);
    }

    private async publicLookupCard(term: string, exact = false): Promise<JPDBCard | undefined> {
        if (!this.settings.jpdbDefinitionsEnabled) return undefined;
        const cards = await this.jpdbVocabulary.search(term, 1).catch(() => []);
        return cards.find(card => card.spelling === term) ?? (exact ? undefined : cards[0]);
    }

    private async localLookupEntry(term: string, reading: string): Promise<YomitanTermEntry | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const entries = await this.dictionaries.lookup(term, reading || term, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []);
        return entries[0];
    }

    private mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement, options: NewTabLookupDisplayOptions = {}): void {
        this.activeLookupHandlerController?.abort();
        this.activeLookupHandlerController = undefined;
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        const stackOverSettings = Boolean(options.stackOverSettings && this.activeDialog?.classList.contains('jpdb-reader-settings') && this.activeDialog.isConnected);
        if (stackOverSettings) forceReaderPopoverSurface(popover, this.settings);
        const useBackdrop = !stackOverSettings && !popover.classList.contains('jpdb-reader-sheet');
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (useBackdrop) {
            const backdrop = createReaderBackdrop(() => this.dismissLookupPopover());
            document.body.append(backdrop, popover);
            this.activeLookupBackdrop = backdrop;
        } else {
            document.body.append(popover);
            this.activeLookupBackdrop = undefined;
        }
        this.activeLookupPopover = popover;
        this.activeLookupAnchor = anchor;
        this.installLookupPopoverBodyStabilizers(popover);
        this.dictionarySourceState.installTracking(popover);
        if (popover.classList.contains('jpdb-reader-sheet')) {
            installSheetHandle(popover, () => this.dismissLookupPopover(), this.text('resizeLookupSheet'));
            this.localizeLookupPopoverChrome(popover);
            popover.classList.toggle('jpdb-reader-sheet-sticky', this.settings.stickyBottomSheet);
            if (this.settings.stickyBottomSheet) {
                installSheetCloseButton(popover, () => this.dismissLookupPopover(), uiText(this.settings.interfaceLanguage, 'closeDrawer'));
            }
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
        const scrollBody = this.lookupPopoverScrollBody();
        const scrollTop = scrollBody?.scrollTop ?? 0;
        const lockedRect = this.activeLookupPopover.dataset.jpdbReaderPositionLocked === 'true'
            ? this.lockedLookupPopoverPosition()
            : undefined;
        if (this.shouldUseFixedLookupHeight()) this.activeLookupPopover.style.height = '';
        if (lockedRect) this.placeLookupPopoverWithoutMoving(lockedRect);
        else {
            positionPopover(this.activeLookupPopover, this.activeLookupAnchor, undefined, {
                maxHeight: popoverMaxHeightSetting(this.settings),
            });
            this.lockLookupPopoverPosition(this.activeLookupPopover.getBoundingClientRect());
        }
        this.syncLookupPopoverFixedHeight();
        if (scrollBody && scrollBody.scrollTop !== scrollTop) scrollBody.scrollTop = scrollTop;
    }

    private lockedLookupPopoverPosition(): { left: number; top: number } | undefined {
        if (!this.activeLookupPopover) return undefined;
        const left = Number.parseFloat(this.activeLookupPopover.dataset.jpdbReaderLockedLeft ?? '');
        const top = Number.parseFloat(this.activeLookupPopover.dataset.jpdbReaderLockedTop ?? '');
        if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
        this.lockLookupPopoverPosition(this.activeLookupPopover.getBoundingClientRect());
        return this.lockedLookupPopoverPosition();
    }

    private lockLookupPopoverPosition(rect: Pick<DOMRect, 'left' | 'top'>): void {
        if (!this.activeLookupPopover) return;
        this.activeLookupPopover.dataset.jpdbReaderPositionLocked = 'true';
        this.activeLookupPopover.dataset.jpdbReaderLockedLeft = String(rect.left);
        this.activeLookupPopover.dataset.jpdbReaderLockedTop = String(rect.top);
    }

    private placeLookupPopoverWithoutMoving(rect: Pick<DOMRect, 'left' | 'top'>): void {
        if (!this.activeLookupPopover) return;
        const maxHeight = this.lookupPopoverMaxHeightAtTop(rect.top);
        this.activeLookupPopover.style.left = `${rect.left}px`;
        this.activeLookupPopover.style.top = `${rect.top}px`;
        this.activeLookupPopover.style.maxHeight = `${maxHeight}px`;
    }

    private lookupPopoverMaxHeightAtTop(top: number): number {
        const margin = 8;
        const availableHeight = Math.max(0, window.innerHeight - top - margin);
        const configuredMaxHeight = popoverMaxHeightSetting(this.settings);
        return configuredMaxHeight ? Math.min(availableHeight, configuredMaxHeight) : availableHeight;
    }

    private installLookupPopoverBodyStabilizers(popover: HTMLElement): void {
        if (popover.dataset.jpdbReaderBodyStabilizers === 'true') return;
        popover.dataset.jpdbReaderBodyStabilizers = 'true';
        popover.addEventListener('click', event => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            const summary = target?.closest<HTMLElement>('summary');
            if (!summary || !popover.contains(summary)) return;
            this.stabilizeLookupPopoverBodyAround(popover, summary);
        }, true);
    }

    private stabilizeLookupPopoverBodyAround(popover: HTMLElement, anchor: HTMLElement): void {
        const scrollBody = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body') ?? popover;
        const scrollTop = scrollBody.scrollTop;
        const anchorTop = anchor.getBoundingClientRect().top;
        requestAnimationFrame(() => {
            if (!popover.isConnected || !anchor.isConnected) return;
            const delta = anchor.getBoundingClientRect().top - anchorTop;
            if (Math.abs(delta) > 0.5) scrollBody.scrollTop = scrollTop + delta;
        });
    }

    private lookupPopoverScrollBody(): HTMLElement | undefined {
        return this.activeLookupPopover?.querySelector<HTMLElement>('.jpdb-reader-popover-body') ?? this.activeLookupPopover;
    }

    private shouldUseFixedLookupHeight(): boolean {
        return Boolean(
            this.activeLookupPopover
                && this.settings.popoverHeightMode === 'fixed'
                && !this.activeLookupPopover.classList.contains('jpdb-reader-sheet')
                && this.activeLookupPopover.querySelector('.jpdb-reader-popover-body'),
        );
    }

    private syncLookupPopoverFixedHeight(): void {
        const popover = this.activeLookupPopover;
        if (!popover) return;
        if (!this.shouldUseFixedLookupHeight()) {
            popover.style.height = '';
            return;
        }
        const maxHeight = Number.parseFloat(popover.style.maxHeight);
        if (Number.isFinite(maxHeight) && maxHeight > 0) popover.style.height = `${maxHeight}px`;
    }

    private renderDefinitionSources(
        card: JPDBCard,
        entries: YomitanTermEntry[],
        sentence?: string,
        jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
        options: { includeStudySources?: boolean } = {},
    ): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        const includeStudySources = options.includeStudySources ?? true;
        let renderedDictionaries = false;
        const sections = sourceIds.map(sourceId => {
            if (sourceId === JPDB_DEFINITION_SOURCE_ID) {
                return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded), jpdbVocabularyInfo);
            }
            if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return includeStudySources ? this.studySources.renderTranslationSource(sentence) : '';
            if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return includeStudySources ? this.studySources.renderGrammarSource(sentence) : '';
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
            : `<div class="jpdb-reader-help jpdb-reader-no-definitions">${escapeHtml(this.text('noDefinitionsFound'))}</div>`;
    }

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceState.attributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID), false)}>
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
        const options = jpdbVocabularyInfo
            ? { relatedQueries: this.immersionRelatedQueries(jpdbVocabularyInfo) }
            : undefined;
        this.immersionPopover.installLazyLoad(popover, card, options);
    }

    private immersionRelatedQueries(info: JpdbVocabularyInfo): string[] {
        return info.compounds.flatMap(compound => [compound.term, compound.reading]).filter(Boolean);
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private kanjiSourceTitle(sourceId: string): string {
        return newTabKanjiSourceTitle(this.settings, sourceId);
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
        }).slice(0, NEW_TAB_ANKI_ENRICHMENT_LIMIT);
        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const lookup = await this.anki.findExistingCards(token.card);
            this.applyAnkiLookupToRenderedWords(token.card, lookup);
        });
    }

    private async enrichPitchWords(tokens: JPDBToken[]): Promise<void> {
        if (!this.settings.showPitchAccent) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            if (token.card.pitchAccent.length) return false;
            if (!token.card.spelling.trim()) return false;
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, NEW_TAB_PITCH_ENRICHMENT_LIMIT);

        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const pitchAccent = await this.jpdbPublicPitch.lookup(token.card.spelling, token.card.reading).catch(() => []);
            if (!pitchAccent.length) return;
            if (!token.card.pitchAccent.length) token.card.pitchAccent = pitchAccent;
            this.applyPitchAccentToRenderedWords(token.card);
        });
    }

    private async enrichPublicVocabularyWords(tokens: JPDBToken[]): Promise<void> {
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            if (token.card.source !== 'fallback') return false;
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, NEW_TAB_PITCH_ENRICHMENT_LIMIT);

        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const card = await this.publicLookupCard(token.card.spelling, true);
            if (!card) {
                this.unwrapRenderedFallbackWords(token.card);
                return;
            }
            if (!card.pitchAccent.length) card.pitchAccent = await this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(() => []);
            this.parser.cacheCards([card]);
            this.applyPublicVocabularyToRenderedWords(token.card, card);
        });
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void {
        if (!ankiLookup.primary) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.activeLookupPopover?.querySelectorAll<HTMLElement>(selector).forEach(word => {
            word.classList.add(`anki-${ankiLookup.state}`);
            word.dataset.ankiState = ankiLookup.state;
            word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
            word.title = `Anki: ${this.cardStateText(ankiLookup.state)}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
        });
    }

    private applyPitchAccentToRenderedWords(card: JPDBCard): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (!pitchClass) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.activeLookupPopover?.querySelectorAll<HTMLElement>(selector).forEach(word => {
            Array.from(word.classList)
                .filter(className => className.startsWith('jpdb-pitch-'))
                .forEach(className => word.classList.remove(className));
            word.classList.add(`jpdb-pitch-${pitchClass}`);
            word.dataset.pitchClass = pitchClass;
        });
    }

    private applyPublicVocabularyToRenderedWords(fallback: JPDBCard, card: JPDBCard): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        document.querySelectorAll<HTMLElement>(this.renderedWordSelector(fallback)).forEach(word => {
            Array.from(word.classList)
                .filter(className => className.startsWith('jpdb-pitch-'))
                .forEach(className => word.classList.remove(className));
            word.classList.add(`jpdb-pitch-${pitchClass}`);
            word.dataset.vid = String(card.vid);
            word.dataset.sid = String(card.sid);
            word.dataset.expression = card.spelling;
            word.dataset.reading = card.reading;
            word.dataset.pitchClass = pitchClass;
        });
    }

    private unwrapRenderedFallbackWords(card: JPDBCard): void {
        document.querySelectorAll<HTMLElement>(this.renderedWordSelector(card)).forEach(word => {
            const parent = word.parentNode;
            word.replaceWith(document.createTextNode(readerWordSurfaceText(word)));
            parent?.normalize();
        });
    }

    private renderedWordSelector(card: JPDBCard): string {
        return `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
    }

    private cardStateText(state: string): string {
        const keys: Partial<Record<string, UiCopyKey>> = {
            new: 'stateNew',
            learning: 'stateLearning',
            due: 'stateDue',
            failed: 'stateFailed',
            known: 'stateKnown',
            'never-forget': 'stateNeverForget',
            suspended: 'stateSuspended',
            locked: 'stateLocked',
            blacklisted: 'stateBlacklisted',
            redundant: 'stateRedundant',
            'not-in-deck': 'stateNotInDeck',
        };
        const key = keys[state];
        return key ? this.text(key) : state.replace(/-/g, ' ');
    }

    private restoreSettingsPreviewState(): void {
        if (this.settingsPreviewOriginalAccent !== undefined) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalTheme !== undefined) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
        }
        this.applyTheme();
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

    private applyTheme(settings = this.settings): void {
        applyReaderTheme(settings);
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

    private async parseNewTabContent(root: HTMLElement, options: NewTabParseContentOptions = {}): Promise<void> {
        if (!root.isConnected || !this.parser.canParse()) return;
        const plan = nestedTextParsePlan(root, 160);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        const parseLoadingId = `${Date.now()}:${Math.random()}`;
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        root.dataset.jpdbReaderParseLoadingId = parseLoadingId;
        try {
            const parsed = await this.loadParsedNewTabContent(plan.targets.map(target => target.text), options);
            if (!root.isConnected
                || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey
                || root.dataset.jpdbReaderParseLoadingId !== parseLoadingId) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            highlightCardTargetScopes(root);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
            void this.enrichPublicVocabularyWords(parsed.flat());
            void this.enrichPitchWords(parsed.flat());
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey, parseLoadingId);
        }
    }

    private loadParsedNewTabContent(texts: string[], options: NewTabParseContentOptions = {}): Promise<JPDBToken[][]> {
        const parseOptions = {
            jpdbTimeoutMs: options.jpdbTimeoutMs ?? NEW_TAB_POPOVER_PARSE_TIMEOUT_MS,
            allowJpdbTimeoutFallback: options.allowJpdbTimeoutFallback ?? false,
            includeLocalPitch: false,
        };
        const key = this.parseContentCacheKey(texts, parseOptions);
        const now = Date.now();
        const cached = this.parseContentCache.get(key);
        if (cached && cached.expiresAt > now) {
            this.parseContentCache.delete(key);
            this.parseContentCache.set(key, cached);
            return cached.promise;
        }
        if (cached) this.parseContentCache.delete(key);

        const promise = this.parser.parse(texts, parseOptions).catch(error => {
            if (this.parseContentCache.get(key)?.promise === promise) this.parseContentCache.delete(key);
            throw error;
        });
        this.parseContentCache.set(key, { expiresAt: now + NEW_TAB_PARSE_CONTENT_CACHE_TTL_MS, promise });
        this.pruneParseContentCache(now);
        return promise;
    }

    private parseContentCacheKey(
        texts: string[],
        options: { jpdbTimeoutMs: number; allowJpdbTimeoutFallback: boolean; includeLocalPitch: boolean },
    ): string {
        return JSON.stringify({
            texts,
            options,
            settings: {
                apiKey: Boolean(this.settings.apiKey.trim()),
                localDictionariesEnabled: this.settings.localDictionariesEnabled,
                dictionaries: this.settings.dictionaryPreferences.map(preference => ({
                    name: preference.name,
                    enabled: preference.enabled,
                    priority: preference.priority,
                })),
            },
        });
    }

    private pruneParseContentCache(now: number): void {
        for (const [key, entry] of this.parseContentCache) {
            if (entry.expiresAt <= now) this.parseContentCache.delete(key);
        }
        while (this.parseContentCache.size > NEW_TAB_PARSE_CONTENT_CACHE_LIMIT) {
            const oldest = this.parseContentCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.parseContentCache.delete(oldest);
        }
    }

    private async parseSettingsJapanese(form: HTMLFormElement): Promise<void> {
        if (!this.isCurrentSettingsRoot(form)) return;
        unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup]' });
        clearNestedParseState(form);
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.parser.canParse()) return;
        const plan = nestedSettingsTextParsePlan(form, 640);
        if (!plan) return;
        const parseLoadingId = `${Date.now()}:${Math.random()}`;
        form.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        form.dataset.jpdbReaderParseLoadingId = parseLoadingId;
        try {
            const parsed = await this.parser.parse(plan.targets.map(target => target.text), {
                allowJpdbTimeoutFallback: true,
                includeLocalPitch: false,
                jpdbTimeoutMs: NEW_TAB_POPOVER_PARSE_TIMEOUT_MS,
                skipJpdb: true,
            });
            if (!this.isCurrentSettingsRoot(form)
                || form.dataset.jpdbReaderParseLoadingKey !== plan.parseKey
                || form.dataset.jpdbReaderParseLoadingId !== parseLoadingId) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            form.dataset.jpdbReaderParseKey = plan.parseKey;
            void this.enrichPublicVocabularyWords(parsed.flat());
            void this.enrichPitchWords(parsed.flat());
        } catch {
        } finally {
            clearNestedParseLoadingKey(form, plan.parseKey, parseLoadingId);
        }
    }

    private isCurrentSettingsRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activeDialog === root && root.classList.contains('jpdb-reader-settings'));
    }
}

function markNewTabRuntime(): void {
    (window as YomuNewTabWindow).__YOMU_READER_RUNTIME__ = 'newtab';
}

function refreshableNoop(): { refresh: () => void } {
    return { refresh: () => undefined };
}

function replaceOptionalElement(parent: Element, selector: string, html: string, before: Element | null = null): void {
    const existing = parent.querySelector<HTMLElement>(selector);
    const next = htmlToFirstElement(html);
    if (existing && next) {
        existing.replaceWith(next);
        return;
    }
    if (existing) {
        existing.remove();
        return;
    }
    if (next) parent.insertBefore(next, before);
}

function htmlToFirstElement(html: string): HTMLElement | null {
    const trimmed = html.trim();
    if (!trimmed) return null;
    const template = document.createElement('template');
    template.innerHTML = trimmed;
    const first = template.content.firstElementChild;
    return first instanceof HTMLElement ? first : null;
}
