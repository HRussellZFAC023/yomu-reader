import { subscribeToCardStateSignals } from '../app/card-state-signal';
import { AudioPlayer } from '../audio/player';
import { AnkiConnectClient, ankiLookupWithUnavailableDetails, untrustedAnkiLookupResult, type AnkiLookupResult } from '../anki';
import { listNewTabAnkiCards } from '../anki/new-tab';
import { runLimited } from '../core/async-utils';
import { copyText, positionPopover } from '../ui/browser';
import { CardActionController } from '../cards/action-controller';
import { CardPopoverRenderer, togglePopoverReviewTargetSelection, updatePopoverReviewTargetSelection } from '../cards/popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData, type CardRenderData, type CardRenderDataLoad } from '../cards/render-data';
import { highlightCardTargetScopes } from '../cards/highlight';
import { isPlainReadingDuplicatedByVisibleRuby } from '../cards/reading-display';
import { normalizeCardStates, primaryCardState } from '../cards/state';
import { cardKey } from '../cards/utils';
import { APP_NAME, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from '../app/constants';
import { handleReaderActionPillLink } from '../app/main-helpers';
import { yomuKanjiStudyCompanion } from '../companions/registry';
import {
    kanjiFactProviderTitle,
    kanjiSourceStateKey,
    renderKanjiDefinitions,
} from '../sources/definition-render';
import { renderDefinitionSourcesStack, type DefinitionSourceStackOptions } from '../sources/definition-stack';
import { DictionarySourceStateController } from '../sources/state';
import { escapeHtml, HAS_JAPANESE, inferredInflectedSurfaceRubies, readerWordSurfaceText, setInnerHtml, unwrapReaderWords } from '../dom';
import { DictionaryStyleController } from '../sources/styles';
import { createFactoryResetCoordinator, type FactoryResetCoordinator } from '../app/factory-reset-coordinator';
import { ImmersionKitClient } from '../immersion/kit';
import { ImmersionPopoverController } from '../immersion/popover-controller';
import { resolveUiLanguage, uiText, type UiCopyKey } from '../app/i18n';
import { isNewTabCopyKey, newTabText, type NewTabCopyKey } from './i18n';
import {
    consumeLookupPopoverButtonEvent,
    installLookupOutsideDismiss,
    lookupPopoverDictionaryLinkRequest,
    lookupPopoverActionButton,
    lookupPopoverParsedWordElement,
    lookupTextRequestFromPopoverButton,
    newTabLookupMetaItems,
    newTabLookupReviewTargetSelection,
    parsedWordLookupSentence,
    renderNewTabLookupReviewButtons as renderNewTabLookupReviewButtonsHtml,
    updateKanjiLookupMiningControls,
} from './lookup-dom';
import { JpdbClient } from '../jpdb/jpdb';
import { JitenApiClient, type JitenKanjiInfo, type JitenVocabularyInfo } from '../dictionaries/jiten';
import { JitenPublicVocabularyClient } from '../dictionaries/jiten-public-vocabulary';
import { jitenKanjiOriginFactLabels, renderJitenKanjiInfo, renderJitenKanjiKeywordLine } from '../jiten/jiten-kanji-info-render';
import { filterJitenKanjiWords as filterSharedJitenKanjiWords, loadMoreJitenKanjiWords as loadMoreSharedJitenKanjiWords, type JitenKanjiWordsActionContext } from '../jiten/jiten-kanji-words-actions';
import type { JpdbKanjiClient, JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { renderedJpdbRelatedWords } from '../jpdb/jpdb-related-words';
import { jpdbVocabularyUrl } from '../jpdb/jpdb-vocabulary-url';
import { jpdbAudioCard } from '../jpdb/jpdb-page-targets';
import { createJpdbReviewBridgeClient } from '../jpdb/jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { KanjiVGClient, KanjiVGInfo } from '../kanji/vg';
import { installKanjiPracticeDoodle } from '../kanji/practice-grader';
import { canAttemptAudiblePlayback } from '../audio/media-activation';
import { configureLogger, Logger, loggingSettingsSummary } from '../app/logger';
import {
    inferMiningSourceKind,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from '../study/mining-context';
import {
    openDeckPickerForCardAdd,
    setMiningControlsExpanded as setMiningControlsExpandedState,
    toggleMiningControls as toggleMiningControlsState,
} from '../study/mining-controls';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsTextParsePlan, nestedTextParsePlan } from '../lookup/nested-text-parse';
import { NewTabController, newTabKanjiSourceTitle, type NewTabLookupReviewTargetSelection } from './controller';
import { createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, refreshForcedReaderPopoverSurface } from '../popup/shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import {
    buildKanjiFacts,
    buildKanjiOriginGraph,
    buildRtkComponentSummaries,
    cardPronunciationReading,
    installOriginGraphInteractions,
    isKanjiCharacter,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderRtkInfo,
} from '../popup/render';
import { applyPublicVocabularyFurigana, updateRenderedPitch } from '../app/dom-helpers';
import { ReaderParser, fallbackLookupTermsForCard, jpdbFirstParseOptions } from '../lookup/parser';
import {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    shouldLookupAnkiStatus,
    subscribeToSettingsStorageChanges,
} from '../settings';
import { effectiveJitenApiKey, effectiveJpdbApiKey, hasJitenApiCredential } from '../settings/api-credential';
import { clearRenderedWordAnkiState, setRenderedWordCardIdentity, setRenderedWordPitchClass } from '../dom/rendered-word-state';
import { refreshReaderWordContrast } from '../dom/word-contrast';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from '../theme/reader-theme';
import { showReaderToast } from '../ui/toast';
import { ReaderAudioActions } from '../audio/actions';
import { refreshRenderedAnkiStatusAfterMutation as refreshRenderedAnkiStatus, scheduleReaderAnkiStatusRefresh, scheduleReaderAnkiStatusWarmup } from '../app/status-warmup';
import { SettingsDialogController } from '../settings/dialog-controller';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_UCHISEN_SOURCE_ID,
} from '../sources/sections';
import { parseContentCacheKey } from '../lookup/parse-content-cache-key';
import { renderKanjiImmersionKitMount, renderKanjiSourceMounts as renderRuntimeKanjiSourceMounts } from '../runtime/kanji-source-mounts';
import {
    configuredPopoverMaxHeight,
    installPopoverBodyStabilizers as installRuntimePopoverBodyStabilizers,
    popoverMaxHeightAtTop as runtimePopoverMaxHeightAtTop,
    shouldUseFixedPopoverHeight,
    syncFixedPopoverHeight,
} from '../runtime/popover-body-stabilizer';
import { StudySourceController } from '../study/sources';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from '../app/types';
import { installUchisenCarousel, loadUchisenData } from '../dictionaries/uchisen';
import { addWindowEventListener } from '../platform/window-events';
import { renderWordPills, updateHeadingWordPills } from '../sources/word-pills';
import type { RtkClient, RtkInfo } from '../kanji/rtk';

import { YomitanDictionaryStore, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from '../dictionaries/yomitan';

const log = Logger.scope('NewTabRuntime');
const NEW_TAB_POPOVER_PARSE_TIMEOUT_MS = 1_200;
const NEW_TAB_SETTINGS_PARSE_TIMEOUT_MS = 10_000;
const NEW_TAB_STUDY_PARSE_TIMEOUT_MS = 15_000;
const NEW_TAB_LOCAL_LOOKUP_TIMEOUT_MS = 450;
const NEW_TAB_REMOTE_LOOKUP_TIMEOUT_MS = 8_000;
const NEW_TAB_PITCH_ENRICHMENT_LIMIT = 12;
const NEW_TAB_SETTINGS_ENRICHMENT_LIMIT = 192;
const NEW_TAB_SETTINGS_PUBLIC_VOCABULARY_LIMIT = 64;
const NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY = 4;
const NEW_TAB_PARSE_CONTENT_CACHE_TTL_MS = 30_000;
const NEW_TAB_PARSE_CONTENT_CACHE_LIMIT = 160;
type NewTabRuntimeTextKey = UiCopyKey | NewTabCopyKey;

function createNoopJpdbKanjiClient(): JpdbKanjiClient {
    return {
        lookup: () => Promise.resolve(null),
        performAction: () => Promise.reject(new Error('Yomu Kanji/Study companion is missing.')),
    } as unknown as JpdbKanjiClient;
}

function createNoopKanjiVGClient(): KanjiVGClient {
    return {
        lookup: () => Promise.resolve(null),
    } as unknown as KanjiVGClient;
}

function createNoopRtkClient(): RtkClient {
    return {
        lookup: () => Promise.resolve(null),
    } as unknown as RtkClient;
}

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
    previousNavigationEntry?: PopupNavigationEntry;
    reuseActivePopover?: boolean;
    userGesture?: boolean;
}

interface NewTabParseContentOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
}

interface KanjiLookupDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    jitenInfo: Promise<JitenKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
    kanjiVGInfo: Promise<KanjiVGInfo | null>;
}

interface LookupPopoverScrollState {
    body?: HTMLElement;
    scrollTop: number;
}

type UchisenData = Awaited<ReturnType<typeof loadUchisenData>>;

export function bootNewTabRuntime(): void {
    const app = new NewTabRuntime();
    void app.init().catch(error => {
        log.error('New tab initialization failed', error);
        throw error;
    });
    addWindowEventListener('pagehide', () => app.destroy(), { once: true });
}

export class NewTabRuntime {
    private unsubscribeCardStateSignals?: () => void;
    private unsubscribeSettingsStorageChanges?: () => void;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private isDestroyed = false;
    private activeDialog?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private newTab?: NewTabController;

    private jpdb = new JpdbClient(() => effectiveJpdbApiKey(this.settings), () => this.settings.corsProxyUrl);
    private jiten = new JitenApiClient(() => effectiveJitenApiKey(this.settings), { proxyUrl: () => this.settings.corsProxyUrl });
    private kanjiCompanion = yomuKanjiStudyCompanion();
    private jpdbKanji = this.kanjiCompanion ? new this.kanjiCompanion.JpdbKanjiClient(() => this.settings.corsProxyUrl) : createNoopJpdbKanjiClient();
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private jitenPublicVocabulary = new JitenPublicVocabularyClient({ proxyUrl: () => this.settings.corsProxyUrl });
    private kanjiVG = this.kanjiCompanion ? new this.kanjiCompanion.KanjiVGClient() : createNoopKanjiVGClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = this.kanjiCompanion ? new this.kanjiCompanion.RtkClient() : createNoopRtkClient();
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
        jiten: this.jiten,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
    });
    private lookupPopoverRenderer = new CardPopoverRenderer({
        getSettings: () => this.settings,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
        renderWordHistory: (language, trigger) => this.navigation.renderWordHistory(language, trigger),
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery, _trigger, ankiLookup) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            ankiLookup,
            isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        }),
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, extraSections) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, extraSections),
        dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
        renderReviewButtonsFallback: (card, data) => this.renderNewTabLookupReviewButtons(card, data),
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
        jiten: this.jiten,
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
        invalidateCardData: () => this.cardRenderData.clear(),
        setApiGradingProvider: provider => {
            this.settings.apiGradingProvider = provider;
            void saveSettings(this.settings);
        },
        onAnkiStatusChanged: card => this.handleAnkiStatusChanged(card),
        onApiCardStateChanged: card => this.handleApiCardStateChanged(card),
    });
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });
    private factoryReset: FactoryResetCoordinator = createFactoryResetCoordinator({
        dictionaries: this.dictionaries,
        isDestroyed: () => this.isDestroyed,
        getLanguage: () => this.settings.interfaceLanguage,
        invalidateRuntimeStores: () => this.invalidateRuntimeStoresForFactoryReset(),
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
        this.scheduleAnkiStatusWarmup();
        this.installCardStateSignalSubscription();
        this.installSettingsStorageSubscription();
    }

    // Cross-tab card-state mutation bus: grading or mining a card on a page
    // popover in another tab recolors this study tab's rendered occurrences
    // (current card, transcripts, search results) without a refresh.
    private installCardStateSignalSubscription(): void {
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = subscribeToCardStateSignals(card => {
            if (this.isDestroyed) return;
            this.applyPublicVocabularyToRenderedWords(card, card);
        });
    }

    private installSettingsStorageSubscription(): void {
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = subscribeToSettingsStorageChanges(settings => {
            if (this.isDestroyed) return;
            void this.applyRemoteSettings(settings);
        });
    }

    private async applyRemoteSettings(settings: ReaderSettings): Promise<void> {
        this.settings = settings;
        configureLogger({ forceEnabled: settings.enableLogging });
        this.cardRenderData.clear();
        this.parseContentCache.clear();
        this.jpdbVocabulary.clear();
        this.parser.clearLocalCache();
        this.applyTheme(settings);
        this.applyWordColors(settings);
        await this.refreshDictionaryStyles();
        if (this.newTab?.isCurrentPage()) await this.newTab.renderPage();
        this.scheduleAnkiStatusWarmup();
    }

    private scheduleAnkiStatusWarmup(): void {
        scheduleReaderAnkiStatusWarmup({
            getSettings: () => this.settings,
            isDestroyed: () => this.isDestroyed,
            warmStatusIndex: () => this.anki.warmStatusIndex(),
            onWarmupError: error => {
                log.warnOnce('newtab-anki-status-warmup-failed', 'New tab Anki status warmup failed', error);
            },
        });
    }

    private scheduleRenderedAnkiStatusRefresh(card: JPDBCard): void {
        scheduleReaderAnkiStatusRefresh(this.settings, () => refreshRenderedAnkiStatus(card, {
            getSettings: () => this.settings,
            isDestroyed: () => this.isDestroyed,
            findExistingCards: targetCard => this.anki.findExistingCards(targetCard),
            applyAnkiLookupToRenderedWords: (targetCard, lookup) => this.applyAnkiLookupToRenderedWords(targetCard, lookup),
            onLookupError: error => {
                log.warnOnce('newtab-anki-mutation-recolor-failed', 'New tab Anki status recolor after mutation failed', error);
            },
        }));
    }

    private handleAnkiStatusChanged(card: JPDBCard): void {
        this.cardRenderData.clear();
        this.scheduleRenderedAnkiStatusRefresh(card);
    }

    private handleApiCardStateChanged(card: JPDBCard): void {
        this.cardRenderData.clear();
        this.applyPublicVocabularyToRenderedWords(card, card);
        this.newTab?.refreshBrowseAfterCardMutation(card);
    }

    destroy(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = undefined;
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = undefined;
        this.externalRefreshController?.abort();
        this.externalRefreshController = undefined;
        this.factoryReset.destroy();
        this.newTab?.destroy();
        this.anki.destroy?.();
        this.jpdbReviewBridge.close();
        this.dictionaryStyles.remove();
        this.parseContentCache.clear();
        this.dismiss();
    }

    private async invalidateRuntimeStoresForFactoryReset(): Promise<void> {
        this.dismiss();
        this.newTab?.invalidateForFactoryReset();
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
            this.audio.clearCaches();
            this.jpdbVocabulary.clear();
            this.cardRenderData.clear();
            if (this.newTab?.isCurrentPage()) void this.newTab.refreshExternalData();
        }, { signal: controller.signal });
        this.externalRefreshController = controller;
    }

    private createNewTabController(): NewTabController {
        return new NewTabController({
            getSettings: () => this.settings,
            toast: message => showReaderToast(message),
            anki: {
                listNewTabCards: (limit, deckScope) => listNewTabAnkiCards(this.anki, this.settings, limit, deckScope),
                answerCard: (cardId, grade) => this.anki.answerCard(cardId, grade),
                findExistingCards: card => this.anki.findExistingCards(card),
                invoke: (action, params) => this.anki.invoke(action, params),
                requestPermission: () => this.anki.invoke('requestPermission'),
            },
            jpdb: this.jpdb,
            jiten: this.jiten,
            jpdbKanji: this.jpdbKanji,
            kanjiVG: this.kanjiVG,
            rtk: this.rtk,
            immersionKit: this.immersionKit,
            jpdbVocabulary: this.jpdbVocabulary,
            jpdbPublicPitch: this.jpdbPublicPitch,
            jpdbReviewBridge: this.jpdbReviewBridge,
            parser: this.parser,
            dictionaries: this.dictionaries,
            onAnkiStatusChanged: card => this.handleAnkiStatusChanged(card),
            parseContent: (root, options) => this.parseNewTabContent(root, {
                jpdbTimeoutMs: options?.jpdbTimeoutMs ?? NEW_TAB_STUDY_PARSE_TIMEOUT_MS,
                allowJpdbTimeoutFallback: options?.allowJpdbTimeoutFallback,
            }),
            lookupText: (text, reading, anchor, options) => this.lookupText(text, reading, anchor, {
                navigation: options?.navigation,
                previousNavigationEntry: options?.previousNavigationEntry,
                reuseActivePopover: options?.reuseActivePopover,
                userGesture: options?.userGesture,
            }),
            lookupDictionaryReference: (query, reading, _dictionary, anchor, options) => this.lookupText(query, reading || query, anchor, {
                navigation: options?.navigation,
                previousNavigationEntry: options?.previousNavigationEntry,
                reuseActivePopover: options?.reuseActivePopover,
                userGesture: options?.userGesture,
            }),
            showLookupCard: (card, sentence, anchor, options) => this.showLookupCard(card, sentence, anchor, {
                navigation: options?.navigation ?? 'push-current',
                previousNavigationEntry: options?.previousNavigationEntry,
                reuseActivePopover: options?.reuseActivePopover ?? true,
                autoPlay: false,
                userGesture: options?.userGesture,
            }),
            showKanjiCard: (card, kanji, sentence, anchor, options) => this.showKanjiLookupCard(card, kanji, sentence, anchor, {
                navigation: options?.navigation,
                previousNavigationEntry: options?.previousNavigationEntry,
                reuseActivePopover: options?.reuseActivePopover,
                userGesture: options?.userGesture,
            }),
            loadCardRenderData: card => this.cardRenderData.load(card).all,
            renderSearchDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, { includeStudySources: false }),
            renderSearchWordPills: (card, metaEntries, ankiLookup) => renderWordPills({
                card,
                jpdbUrl: jpdbVocabularyUrl(card),
                settings: this.settings,
                metaEntries,
                ankiLookup,
                isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
                dictionaryLabel: name => this.dictionaryLabel(name),
            }),
            installSearchDetailSources: (root, card, sentence, jpdbVocabularyInfo) => this.installLookupPopoverSources(root, card, sentence, jpdbVocabularyInfo),
            renderStudyDefinitionSources: (card, data, sentence) => this.renderDefinitionSources(card, data.localEntries, sentence, data.jpdbVocabularyInfo, data.jitenVocabularyInfo ?? null, {
                includeStudySources: false,
                includeImmersionSource: false,
            }),
            preloadWordAudio: card => this.maybePreloadLookupCardAudio(card),
            playWordAudio: card => this.audioActions.playTermAudio(card, { userGesture: true }),
            playJpdbExampleAudio: (audioIds, fallbackSentence) => this.audioActions.playJpdbExampleAudio(audioIds, fallbackSentence),
            performCardAction: (button, card, sentence, anchor) => this.handleCardAction(button, card, sentence, anchor),
            setImmersionTranslationBlurred: blurred => this.setImmersionTranslationBlurred(blurred),
            dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            isDictionarySourceOpen: (key, initiallyExpanded) => this.dictionarySourceState.isOpen(key, initiallyExpanded),
            installDictionarySourceTracking: root => this.dictionarySourceState.installTracking(root),
            onSettingsChange: () => saveSettings(this.settings),
            applyTheme: () => this.applyTheme(),
            showSettings: panel => this.showSettings(panel),
            dismissLookup: () => this.dismissLookupPopover(),
            dismiss: () => this.dismiss(),
        });
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
        const dismissFromBackdrop = (event: Event) => {
            if (event.target !== backdrop) return;
            event.preventDefault();
            event.stopPropagation();
            this.dismiss();
        };
        backdrop.addEventListener('pointerdown', dismissFromBackdrop, { capture: true });
        backdrop.addEventListener('mousedown', dismissFromBackdrop, { capture: true });
        backdrop.addEventListener('click', dismissFromBackdrop, { capture: true });
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
        const hadSettingsDialog = Boolean(this.activeDialog?.classList.contains('jpdb-reader-settings'));
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
        if (hadSettingsDialog) this.settingsDialog.releaseModalBackground();
    }

    private text(key: NewTabRuntimeTextKey): string {
        return isNewTabCopyKey(key) ? newTabText(this.settings.interfaceLanguage, key) : uiText(this.settings.interfaceLanguage, key);
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
        this.maybePreloadLookupCardAudio(card);
        const renderData = this.cardRenderData.load(card);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null, trusted: false };
        let currentAnkiLookup = fallbackAnkiLookup;
        const renderState = { fullRenderCompleted: false };
        let metaEntriesValue: YomitanMetaEntry[] = [];
        let renderedPitchKey = card.pitchAccent.join('|');
        clearNestedParseState(popover);
        this.renderLookupPopoverContent(popover, card, sentence, loadingCardRenderData([], fallbackAnkiLookup));
        this.localizeLookupPopoverChrome(popover);
        this.activateLookupRenderSurface(popover, anchor, reused, options);
        this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
        this.installLookupPopoverHandlers(popover, card, sentence, anchor);
        this.installLookupPopoverSources(popover, card, sentence);
        this.maybeAutoPlayLookupCard(card, options);
        if (renderData.ankiLookup) {
            void renderData.ankiLookup.then(ankiLookup => {
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                if (!ankiLookup.primary && !currentAnkiLookup.primary && ankiLookup.trusted !== false) return;
                currentAnkiLookup = ankiLookup;
                this.applyAnkiLookupToRenderedWords(card, ankiLookup);
                if (renderState.fullRenderCompleted) return;
                clearNestedParseState(popover);
                this.renderLookupPopoverContent(popover, card, sentence, loadingCardRenderData([], ankiLookup, metaEntriesValue));
                this.refreshDeferredLookupPopover(popover, card, sentence);
            }).catch(error => {
                log.warn('New-tab Anki lookup failed', { term: card.spelling }, error);
            });
        }
        void renderData.localEntries.then(localEntries => {
            if (renderState.fullRenderCompleted || !this.isCurrentLookupRender(popover, requestId)) return;
            clearNestedParseState(popover);
            this.renderLookupPopoverContent(popover, card, sentence, loadingCardRenderData(localEntries, currentAnkiLookup));
            this.refreshDeferredLookupPopover(popover, card, sentence);
        });
        if (renderData.localMetaEntries) {
            void Promise.all([renderData.localEntries, renderData.localMetaEntries]).then(([localEntries, metaEntries]) => {
                metaEntriesValue = metaEntries;
                if (renderState.fullRenderCompleted || !this.isCurrentLookupRender(popover, requestId)) return;
                this.applyPitchAccentToRenderedWords(card);
                renderedPitchKey = card.pitchAccent.join('|');
                clearNestedParseState(popover);
                this.renderLookupPopoverContent(popover, card, sentence, loadingCardRenderData(localEntries, currentAnkiLookup, metaEntries));
                this.refreshDeferredLookupPopover(popover, card, sentence);
            });
        }
        if (renderData.pitchAccent) {
            void renderData.pitchAccent.then(pitchAccent => {
                if (!pitchAccent.length || !this.isCurrentLookupRender(popover, requestId)) return;
                if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
                if (renderedPitchKey === card.pitchAccent.join('|')) return;
                renderedPitchKey = card.pitchAccent.join('|');
                this.updateDeferredLookupPitch(popover, card, metaEntriesValue, currentAnkiLookup);
            });
        }
        void renderData.all.then(data => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            renderState.fullRenderCompleted = true;
            metaEntriesValue = data.metaEntries;
            renderedPitchKey = card.pitchAccent.join('|');
            this.applyPitchAccentToRenderedWords(card);
            clearNestedParseState(popover);
            const renderedData = currentAnkiLookup.primary && !data.ankiLookup.primary
                ? { ...data, ankiLookup: currentAnkiLookup }
                : data;
            this.renderLookupPopoverContent(popover, card, sentence, { ...renderedData, loading: false });
            this.refreshDeferredLookupPopover(popover, card, sentence, renderedData.jpdbVocabularyInfo);
            this.renderHydratedLookupAnki(popover, card, sentence, renderedData, renderData, requestId);
        });
        void this.parseNewTabContent(popover);
    }

    private renderLookupPopoverContent(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        data: CardRenderData & { loading: boolean },
    ): void {
        setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', data));
        this.refreshNewTabLookupHeader(popover, card, data);
    }

    private refreshNewTabLookupHeader(popover: HTMLElement, card: JPDBCard, data: CardRenderData & { loading: boolean }): void {
        const titleRow = popover.querySelector<HTMLElement>('.jpdb-reader-title-row');
        if (!titleRow) return;
        this.ensureNewTabLookupReading(titleRow, card);
        this.refreshNewTabLookupMeta(titleRow, card, data);
    }

    private ensureNewTabLookupReading(titleRow: HTMLElement, card: JPDBCard): void {
        const reading = cardPronunciationReading(card) || card.reading.trim();
        if (isPlainReadingDuplicatedByVisibleRuby(card, this.settings, reading)) return;
        if (!reading) return;
        let readingElement = titleRow.querySelector<HTMLElement>('.jpdb-reader-reading');
        if (!readingElement) {
            readingElement = document.createElement('div');
            readingElement.className = 'jpdb-reader-reading';
            const spelling = titleRow.querySelector<HTMLElement>('.jpdb-reader-spelling');
            spelling?.after(readingElement);
            if (!readingElement.isConnected) titleRow.prepend(readingElement);
        }
        readingElement.dataset.newtabLookupReading = 'true';
        readingElement.textContent = reading;
    }

    private refreshNewTabLookupMeta(titleRow: HTMLElement, card: JPDBCard, data: CardRenderData & { loading: boolean }): void {
        const items = newTabLookupMetaItems({
            card,
            ankiLookup: data.ankiLookup,
            jpdbState: this.newTabLookupJpdbState(card),
            isJpdbBacked: this.parser.isJpdbBackedCard(card),
            settings: this.settings,
        });
        const existingMeta = titleRow.querySelector<HTMLElement>('.jpdb-reader-meta');
        if (!items.length) {
            existingMeta?.remove();
            return;
        }
        const meta = existingMeta ?? document.createElement('div');
        meta.className = 'jpdb-reader-meta';
        meta.replaceChildren(...items);
        if (!existingMeta) titleRow.append(meta);
    }

    private newTabLookupJpdbState(card: JPDBCard): string {
        return primaryCardState(normalizeCardStates(card.cardState));
    }

    private renderHydratedLookupAnki(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        data: CardRenderData,
        renderData: CardRenderDataLoad,
        requestId: number,
    ): void {
        const hydrateAnkiLookup = renderData.hydrateAnkiLookup;
        if (!hydrateAnkiLookup) return;
        void hydrateAnkiLookup()
            .then(ankiLookup => {
                const resolvesPendingMiss = data.ankiLookup.trusted === false && ankiLookup.trusted !== false;
                if (!ankiLookup.primary && !data.ankiLookup.primary && !resolvesPendingMiss) return;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                this.renderHydratedLookupAnkiResult(popover, card, sentence, data, ankiLookup);
            })
            .catch(error => {
                log.warn('New-tab Anki detail failed', { term: card.spelling }, error);
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                const ankiLookup = ankiLookupWithUnavailableDetails(data.ankiLookup);
                if (!ankiLookup.primary) return;
                this.renderHydratedLookupAnkiResult(popover, card, sentence, data, ankiLookup);
        });
    }

    private renderHydratedLookupAnkiResult(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        data: CardRenderData,
        ankiLookup: AnkiLookupResult,
    ): void {
        clearNestedParseState(popover);
        this.renderLookupPopoverContent(popover, card, sentence, { ...data, ankiLookup, loading: false });
        this.applyAnkiLookupToRenderedWords(card, ankiLookup);
        this.refreshDeferredLookupPopover(popover, card, sentence, data.jpdbVocabularyInfo);
    }

    private refreshDeferredLookupPopover(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
    ): void {
        this.localizeLookupPopoverChrome(popover);
        this.dictionarySourceState.installTracking(popover);
        void this.parseNewTabContent(popover);
        this.installLookupPopoverSources(popover, card, sentence, jpdbVocabularyInfo);
        this.repositionLookupPopover();
    }

    private updateDeferredLookupPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: AnkiLookupResult): void {
        this.applyPitchAccentToRenderedWords(card);
        this.updateLookupWordPills(popover, card, metaEntries, ankiLookup);
        this.updateLookupPitch(popover, card, metaEntries);
        this.repositionLookupPopover();
    }

    private updateLookupWordPills(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: AnkiLookupResult): void {
        updateHeadingWordPills(popover, {
            card,
            jpdbUrl: jpdbVocabularyUrl(card),
            settings: this.settings,
            metaEntries,
            ankiLookup,
            isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        });
    }

    private updateLookupPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        updateRenderedPitch(popover, card, metaEntries, this.settings.showPitchAccent);
    }

    private lookupPreviousNavigationEntry(navigation: CardNavigationMode | undefined): PopupNavigationEntry | undefined {
        if (navigation !== 'push-current') return undefined;
        return this.navigation.activeKanjiEntry() ?? this.navigation.activeWordEntry();
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
        return renderRuntimeKanjiSourceMounts({
            settings: this.settings,
            kanji,
            language,
            isSourceOpen: key => this.dictionarySourceState.isOpen(key),
            sourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            sourceTitle: sourceId => this.kanjiSourceTitle(sourceId),
            renderImmersionMount: () => this.renderKanjiLookupImmersionMount(),
        });
    }

    private renderKanjiLookupImmersionMount(): string {
        return renderKanjiImmersionKitMount(this.settings, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded));
    }

    private renderKanjiLookupActionBar(card: JPDBCard): string {
        const reviewButtons = this.renderKanjiLookupReviewButtons(card);
        const hasReviewTargetGutter = reviewButtons.includes('data-review-target-gutter');
        const actionsClass = hasReviewTargetGutter ? ' jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed' : '';
        return `
            <div class="jpdb-reader-actions${actionsClass}" data-kanji-actions data-kanji-has-review="${reviewButtons ? 'true' : 'false'}"${reviewButtons ? '' : ' hidden'}>
                ${hasReviewTargetGutter ? '' : `<div class="jpdb-reader-actions-gutter" hidden>
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="${escapeHtml(this.text('showMiningActions'))}" aria-label="${escapeHtml(this.text('showMiningActions'))}"></button>
                </div>`}
                <div data-kanji-mining-mount hidden></div>
                ${reviewButtons}
            </div>
        `;
    }

    private renderKanjiLookupReviewButtons(card: JPDBCard): string {
        return this.renderNewTabLookupReviewButtons(card);
    }

    private renderNewTabLookupReviewButtons(card: JPDBCard, data?: CardRenderData | null): string {
        const grades = this.newTab?.lookupGradeOptions(card) ?? [];
        const targets = this.newTab?.lookupReviewTargets(card, data) ?? [];
        return renderNewTabLookupReviewButtonsHtml(grades, targets);
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
        popover.addEventListener('click', event => this.handleKanjiLookupPopoverClick(event, popover, card, kanji, sentence), { signal });
        popover.addEventListener('change', event => this.handleLookupReviewTargetChange(event, popover), { signal });
    }

    private handleKanjiLookupPopoverClick(event: MouseEvent, popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string): void {
        const button = this.lookupPopoverActionButton(event, popover);
        if (!button) return;
        this.handleKanjiLookupAction(button, card, kanji, sentence);
    }

    private handleKanjiLookupAction(button: HTMLButtonElement, card: JPDBCard, kanji: string, sentence?: string): void {
        const handlers: Record<string, () => void> = {
            'copy-word': () => {
                void copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord')));
            },
            'word-back': () => {
                void this.showLookupCard(card, sentence, button, { navigation: 'preserve', reuseActivePopover: true, autoPlay: false });
            },
            'kanji-history-back': () => {
                void this.showPreviousKanjiLookup(button);
            },
            kanji: () => {
                void this.showKanjiLookupCard(card, button.dataset.kanji ?? kanji, sentence, button, {
                    navigation: 'push-current',
                    reuseActivePopover: true,
                });
            },
            'similar-word': () => {
                this.lookupTextFromPopoverButton(button);
            },
            'jiten-kanji-more': () => {
                void this.loadMoreJitenKanjiWords(button);
            },
            'jiten-kanji-reading': () => {
                void this.filterJitenKanjiWords(button);
            },
            lookup: () => {
                this.lookupTextFromPopoverButton(button);
            },
            'jpdb-kanji-action': () => {
                this.performJpdbKanjiActionFromButton(button, card, kanji, sentence);
            },
            'mining-collapse': () => {
                this.toggleMiningControls(button);
            },
            grade: () => {
                this.gradeLookupFromButton(button, card, sentence);
            },
        };
        const handler = handlers[button.dataset.action ?? ''];
        if (handler) handler();
    }

    private jitenKanjiWordsActionContext(): JitenKanjiWordsActionContext | null {
        if (!this.isJitenApiActive()) return null;
        return {
            lookupKanjiWords: (character, options) => this.jiten.lookupKanjiWords(character, options),
            language: () => this.settings.interfaceLanguage,
            afterRender: () => this.repositionLookupPopover(),
            onError: (details, error) => log.warn('Jiten kanji words lookup failed', details, error),
        };
    }

    private async loadMoreJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        const context = this.jitenKanjiWordsActionContext();
        if (context) await loadMoreSharedJitenKanjiWords(button, context);
    }

    private async filterJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        const context = this.jitenKanjiWordsActionContext();
        if (context) await filterSharedJitenKanjiWords(button, context);
    }

    private lookupTextFromPopoverButton(button: HTMLButtonElement): void {
        const { expression, reading } = lookupTextRequestFromPopoverButton(button);
        void this.lookupText(expression, reading, button, { navigation: 'push-current', reuseActivePopover: true, userGesture: true });
    }

    private performJpdbKanjiActionFromButton(button: HTMLButtonElement, card: JPDBCard, kanji: string, sentence?: string): void {
        const actionId = button.dataset.kanjiActionId ?? '';
        if (actionId) void this.performJpdbKanjiAction(actionId, card, kanji, sentence, button);
    }

    private async renderKanjiLookupDetails(popover: HTMLElement, _card: JPDBCard, kanji: string, requestId = this.lookupRenderRequest): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let jitenInfo: JitenKanjiInfo | null = null;
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        const practiceDoodle = installKanjiPracticeDoodle(popover, () => this.settings.interfaceLanguage, () => kanjiVGInfo);
        const detailPromises = this.kanjiLookupDetailPromises(kanji);
        if (this.settings.uchisenEnabled) {
            void this.renderUchisenInto(popover, kanji, requestId);
        }
        this.installKanjiLookupImmersionExamples(popover, kanji);

        const renderKeyword = () => {
            if (!this.isCurrentLookupRender(popover, requestId)) return;
            const mount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
            if (mount?.isConnected) setInnerHtml(mount, jitenInfo
                ? renderJitenKanjiKeywordLine(jitenInfo, rtkInfo, kanjiEntries, this.settings.interfaceLanguage)
                : renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries));
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

        const renderKanjiVG = () => {
            if (!kanjiVGInfo || !this.isCurrentLookupRender(popover, requestId)) return;
            const stage = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-doodle-stage'))
                .find(candidate => candidate.dataset.kanji === kanji);
            const ghost = stage?.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
            const help = stage?.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
            if (ghost) setInnerHtml(ghost, kanjiVGInfo.svg);
            if (help) help.textContent = `${kanjiVGInfo.strokeCount} ${uiText(this.settings.interfaceLanguage, 'strokes')}`;
            stage?.classList.remove('trace-hidden');
        };

        await Promise.all([
            detailPromises.jpdbInfo.then(info => {
                jpdbInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
                if (jpdbMount?.isConnected) setInnerHtml(jpdbMount, this.renderNewTabKanjiFactSources(jpdbInfo, jitenInfo));
                updateKanjiLookupMiningControls(
                    popover,
                    renderJpdbKanjiMiningControls(jpdbInfo, this.settings.interfaceLanguage),
                    (button, expanded) => this.setMiningControlsExpanded(button, expanded),
                );
                renderRtk();
            }),
            detailPromises.jitenInfo.then(info => {
                jitenInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
                if (jpdbMount?.isConnected) setInnerHtml(jpdbMount, this.renderNewTabKanjiFactSources(jpdbInfo, jitenInfo));
            }),
            detailPromises.kanjiEntries.then(entries => {
                kanjiEntries = entries;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                renderDefinitions();
                renderRtk();
            }),
            detailPromises.rtkInfo.then(info => {
                rtkInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKeyword();
                renderRtk();
            }),
            detailPromises.kanjiVGInfo.then(info => {
                kanjiVGInfo = info;
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                renderKanjiVG();
                practiceDoodle.reassess();
            }),
        ]);
        if (!this.isCurrentLookupRender(popover, requestId)) return;
        this.renderKanjiLookupOrigins(popover, requestId, kanji, jpdbInfo, jitenInfo, rtkInfo, kanjiVGInfo, kanjiEntries);
        void this.parseNewTabContent(popover);
        this.repositionLookupPopover();
    }

    private kanjiLookupDetailPromises(kanji: string): KanjiLookupDetailPromises {
        return {
            jpdbInfo: this.settings.jpdbKanjiEnabled
                ? this.lookupDetailWithTimeout(this.jpdbKanji.lookup(kanji), null, 'JPDB kanji lookup timed out.')
                : Promise.resolve(null),
            jitenInfo: this.settings.jpdbKanjiEnabled && this.isJitenApiActive()
                ? this.lookupDetailWithTimeout(this.jiten.lookupKanji(kanji), null, 'Jiten kanji lookup timed out.')
                : Promise.resolve(null),
            kanjiEntries: this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
                ? this.lookupDetailWithTimeout(
                    this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences),
                    [] as YomitanKanjiEntry[],
                    'Local kanji lookup timed out.',
                    NEW_TAB_LOCAL_LOOKUP_TIMEOUT_MS,
                )
                : Promise.resolve([]),
            rtkInfo: this.settings.rtkEnabled
                ? this.lookupDetailWithTimeout(this.rtk.lookup(kanji), null, 'RTK lookup timed out.')
                : Promise.resolve(null),
            kanjiVGInfo: this.shouldLoadKanjiVGInfo()
                ? this.lookupDetailWithTimeout(this.kanjiVG.lookup(kanji), null, 'KanjiVG lookup timed out.')
                : Promise.resolve(null),
        };
    }

    private isJitenApiActive(): boolean {
        return hasJitenApiCredential(this.settings);
    }

    private shouldLoadKanjiVGInfo(): boolean {
        return this.settings.kanjivgEnabled || (this.settings.kanjiOriginsEnabled && this.settings.kanjiOriginGraphEnabled);
    }

    private renderKanjiLookupOrigins(
        popover: HTMLElement,
        requestId: number,
        kanji: string,
        jpdbInfo: JpdbKanjiInfo | null,
        jitenInfo: JitenKanjiInfo | null,
        rtkInfo: RtkInfo | null,
        kanjiVGInfo: KanjiVGInfo | null,
        kanjiEntries: YomitanKanjiEntry[],
    ): void {
        const mount = this.kanjiLookupOriginMount(popover, requestId);
        if (!mount) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, renderKanjiOrigins(
            buildKanjiFacts(kanji, jpdbInfo, rtkInfo, this.settings.kanjivgEnabled ? kanjiVGInfo : null, kanjiEntries),
            this.kanjiLookupOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries),
            null,
            this.settings,
            this.settings.interfaceLanguage,
            this.dictionarySourceState.isOpen(sourceStateKey),
            sourceStateKey,
            this.hiddenKanjiLookupOriginFactLabels(jpdbInfo, jitenInfo),
            this.kanjiSourceTitle(KANJI_ORIGINS_SOURCE_ID),
        ));
        installOriginGraphInteractions(mount);
    }

    private kanjiLookupOriginMount(popover: HTMLElement, requestId: number): HTMLElement | null {
        if (!this.isCurrentLookupRender(popover, requestId)) return null;
        if (!this.settings.kanjiOriginsEnabled) return null;
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        return mount?.isConnected ? mount : null;
    }

    private kanjiLookupOriginGraph(
        kanji: string,
        jpdbInfo: JpdbKanjiInfo | null,
        rtkInfo: RtkInfo | null,
        kanjiVGInfo: KanjiVGInfo | null,
        kanjiEntries: YomitanKanjiEntry[],
    ): ReturnType<typeof buildKanjiOriginGraph> | null {
        return this.settings.kanjiOriginGraphEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, null, kanjiVGInfo)
            : null;
    }

    private hiddenKanjiLookupOriginFactLabels(jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null): Set<string> {
        const labels = new Set(jitenKanjiOriginFactLabels(jitenInfo, this.settings.interfaceLanguage));
        if (!jitenInfo) {
            if (jpdbInfo?.type) labels.add(this.text('factType'));
            if (jpdbInfo?.frequency) labels.add(this.text('factFrequency'));
        }
        return labels;
    }

    private shouldRenderKanjiImmersionKit(): boolean {
        return this.settings.immersionKitEnabled && this.settings.kanjiImmersionKitEnabled;
    }

    private installKanjiLookupImmersionExamples(popover: HTMLElement, kanji: string): void {
        if (!this.shouldRenderKanjiImmersionKit()) return;
        this.immersionPopover.installLazyLoad(popover, jpdbAudioCard(kanji, kanji));
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
        const mount = this.kanjiLookupUchisenMount(popover, requestId);
        if (!mount) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const sourceAttributes = () => this.dictionarySourceState.attributes(sourceStateKey, this.dictionarySourceState.isOpen(sourceStateKey));
        setInnerHtml(mount, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source" ${sourceAttributes()}>
                <summary class="jpdb-reader-local-title">Uchisen</summary>
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">${escapeHtml(this.text('loadingMnemonicImages'))}</div></div>
            </details>
        `);
        const data = await this.loadUchisenLookupData(kanji);
        if (!this.canRenderKanjiLookupMount(popover, requestId, mount)) return;
        if (this.shouldRemoveEmptyUchisenData(data)) {
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

    private kanjiLookupUchisenMount(popover: HTMLElement, requestId: number): HTMLElement | null {
        if (!this.settings.uchisenEnabled) return null;
        const mount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        return mount && this.canRenderKanjiLookupMount(popover, requestId, mount) ? mount : null;
    }

    private canRenderKanjiLookupMount(popover: HTMLElement, requestId: number, mount: HTMLElement): boolean {
        return mount.isConnected && this.isCurrentLookupRender(popover, requestId);
    }

    private loadUchisenLookupData(kanji: string): Promise<UchisenData> {
        return loadUchisenData(kanji, this.settings.corsProxyUrl).catch(() => ({
            images: [],
            componentGroups: [],
            kanjiKeyword: null,
            kanjiId: '',
            canGenerateImages: false,
        }));
    }

    private shouldRemoveEmptyUchisenData(data: Pick<UchisenData, 'images' | 'canGenerateImages'>): boolean {
        return data.images.length === 0 && !data.canGenerateImages;
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
        installLookupOutsideDismiss({
            popover,
            anchor,
            signal,
            isActive: () => this.activeLookupPopover === popover,
            dismiss: () => this.dismissLookupPopover(),
        });
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        popover.addEventListener('click', event => this.handleLookupPopoverClick(event, popover, card, sentence, anchor), { signal });
        popover.addEventListener('change', event => this.handleLookupReviewTargetChange(event, popover), { signal });
    }

    private handleLookupReviewTargetChange(event: Event, popover: HTMLElement): void {
        const select = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>('[data-review-target-select]');
        if (select && popover.contains(select)) updatePopoverReviewTargetSelection(select);
    }

    private handleLookupPopoverClick(event: MouseEvent, popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor?: HTMLElement): void {
        const button = this.lookupPopoverActionButton(event, popover);
        if (!button) return;
        this.handleLookupPopoverAction(button, card, sentence, anchor);
    }

    private lookupPopoverActionButton(event: MouseEvent, popover: HTMLElement): HTMLButtonElement | null {
        if (handleReaderActionPillLink(event)) return null;
        if (this.handleLookupPopoverDictionaryLink(event, popover)) return null;
        if (this.handleLookupPopoverParsedWord(event, popover)) return null;
        const button = lookupPopoverActionButton(event, popover);
        if (button) consumeLookupPopoverButtonEvent(event);
        return button;
    }

    private handleLookupPopoverAction(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, anchor?: HTMLElement): void {
        if (this.tryShowKanjiFromLookupButton(button, card, sentence)) return;
        switch (button.dataset.action) {
            case 'word-history-back':
                void this.showPreviousLookupWord(button);
                return;
            case 'mining-collapse':
                this.toggleMiningControls(button);
                return;
            case 'review-target-toggle':
                togglePopoverReviewTargetSelection(button);
                return;
            case 'grade':
                this.gradeLookupFromButton(button, card, sentence, anchor);
                return;
            case 'deck-picker':
                if (this.openDeckPickerForAdd(button, card, sentence)) return;
                break;
            case 'add':
                if (this.openDeckPickerForAdd(button, card, sentence)) return;
                break;
        }
        void this.handleCardAction(button, card, sentence, anchor);
    }

    private tryShowKanjiFromLookupButton(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        if (button.dataset.action !== 'kanji') return false;
        const kanji = button.dataset.kanji?.trim();
        if (kanji) void this.showKanjiLookupCard(card, kanji, sentence, button, { reuseActivePopover: true });
        return true;
    }

    private gradeLookupFromButton(button: HTMLButtonElement, card?: JPDBCard, sentence?: string, anchor?: HTMLElement): void {
        const grade = button.dataset.grade as JPDBGrade | undefined;
        if (grade) void this.gradeCurrentCardFromLookup(button, grade, newTabLookupReviewTargetSelection(button), card, sentence, anchor);
    }

    private async gradeCurrentCardFromLookup(
        button: HTMLButtonElement,
        grade: JPDBGrade,
        target?: NewTabLookupReviewTargetSelection,
        card?: JPDBCard,
        sentence?: string,
        anchor?: HTMLElement,
    ): Promise<void> {
        if (!this.newTab || button.disabled) return;
        button.disabled = true;
        try {
            const result = await this.newTab.gradeFromLookup(grade, target);
            if (!result.preserveLookup) this.dismissLookupPopover();
            else if (card && this.activeLookupPopover?.isConnected) await this.showLookupCard(card, sentence, anchor ?? button, {
                navigation: 'preserve',
                reuseActivePopover: true,
                autoPlay: false,
            });
        } catch (error) {
            log.warn('New tab lookup grade failed', { grade }, error);
            this.toast(this.text('couldNotSubmitGrade'));
        } finally {
            button.disabled = false;
        }
    }

    private handleLookupPopoverDictionaryLink(event: MouseEvent, popover: HTMLElement): boolean {
        const request = lookupPopoverDictionaryLinkRequest(event, popover);
        if (!request) return false;
        void this.lookupText(request.text, request.reading, request.link, {
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        });
        return true;
    }

    private handleLookupPopoverParsedWord(event: MouseEvent, popover: HTMLElement): boolean {
        const word = lookupPopoverParsedWordElement(event, popover);
        if (!word) return false;
        const card = this.cachedCardForParsedWord(word);
        event.preventDefault();
        event.stopPropagation();
        const expression = readerWordSurfaceText(word).trim();
        const sentence = parsedWordLookupSentence(word, expression, card);
        if (card) {
            this.showParsedWordLookupCard(card, sentence, word);
            return true;
        }
        this.lookupParsedWordWithoutCard(word, expression);
        return true;
    }

    private cachedCardForParsedWord(word: HTMLElement): JPDBCard | undefined {
        return this.parser.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
    }

    private lookupParsedWordWithoutCard(word: HTMLElement, expression: string): void {
        if (!HAS_JAPANESE.test(expression)) return;
        void this.lookupText(expression, expression, word, {
            navigation: 'push-current',
            reuseActivePopover: true,
            previousNavigationEntry: this.lookupPreviousNavigationEntry('push-current'),
            userGesture: true,
        });
    }

    private showParsedWordLookupCard(card: JPDBCard, sentence: string, word: HTMLElement): void {
        void this.showLookupCard(card, sentence, word, {
            navigation: 'push-current',
            reuseActivePopover: true,
            previousNavigationEntry: this.lookupPreviousNavigationEntry('push-current'),
            userGesture: true,
        });
    }

    private toggleMiningControls(button: HTMLButtonElement): void {
        toggleMiningControlsState(button, expanded => this.miningControlsToggleLabel(expanded));
    }

    private setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean): void {
        setMiningControlsExpandedState(button, expanded, value => this.miningControlsToggleLabel(value));
    }

    private miningControlsToggleLabel(expanded: boolean): string {
        return this.text(expanded ? 'hideMiningActions' : 'showMiningActions');
    }

    private openDeckPickerForAdd(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        return openDeckPickerForCardAdd(button, card, sentence, (actionButton, actionCard, actionSentence) => (
            this.handleCardAction(actionButton, actionCard, actionSentence)
        ));
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const done = log.time('newTabCardAction', { action, term: card.spelling });
        try {
            const shouldRefresh = await this.cardActions.perform(action, button, card, sentence);
            if (shouldRefresh && action === 'grade') {
                this.dismissLookupPopover();
                log.info('New tab card action completed', { action, term: card.spelling });
                return;
            }
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
        const playback = options.userGesture
            ? this.audioActions.playTermAudio(card, { userGesture: true })
            : this.audioActions.playTermAudio(card);
        void playback.catch(error => {
            log.warn('New tab lookup autoplay failed', { term: card.spelling }, error);
        });
    }

    private maybePreloadLookupCardAudio(card: JPDBCard): void {
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
        if (mode === 'off') return false;
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
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit.fetchDataUrl(imageUrl, timeoutMs, this.settings.corsProxyUrl, this.settings.interfaceLanguage),
            fetchAudioDataUrl: (audioUrls, timeoutMs) => this.immersionKit.fetchDataUrl(audioUrls, timeoutMs, this.settings.corsProxyUrl, this.settings.interfaceLanguage),
        });
    }

    private async lookupCard(term: string, reading: string): Promise<JPDBCard> {
        const localEntry = await this.localLookupEntry(term, reading);
        if (localEntry) return this.parser.localCardFromEntry(localEntry);
        const allowJpdbPublicLookup = Boolean(effectiveJpdbApiKey(this.settings));
        const publicCard = allowJpdbPublicLookup ? await this.publicLookupCard(term, true) : undefined;
        if (publicCard) return publicCard;
        const fallbackCard = this.parser.fallbackCardFromText(term);
        const fallbackPublicCard = await this.publicLookupFallbackCard(fallbackCard, allowJpdbPublicLookup ? {} : { jpdbPublicLookup: false });
        if (fallbackPublicCard) return fallbackPublicCard;
        const parsed = await this.parser.parse([term], jpdbFirstParseOptions()).catch(() => [[]]);
        const token = pickTokenForSelection(parsed[0] ?? [], term);
        if (token) return token.card;
        return fallbackCard;
    }

    private async publicLookupCard(term: string, exact = false): Promise<JPDBCard | undefined> {
        if (!this.settings.jpdbDefinitionsEnabled) return undefined;
        const cards = await this.jpdbVocabulary.search(term, 1).catch(() => []);
        return cards.find(card => card.spelling === term) ?? (exact ? undefined : cards[0]);
    }

    private async publicLookupFallbackCard(card: JPDBCard, options: { jpdbPublicLookup?: boolean } = {}): Promise<JPDBCard | undefined> {
        return (await this.publicLookupFallbackCards([card], options)).get(cardKey(card));
    }

    private async publicLookupFallbackCards(cards: readonly JPDBCard[], options: { jpdbPublicLookup?: boolean } = {}): Promise<Map<string, JPDBCard>> {
        const result = new Map<string, JPDBCard>();
        if (!this.settings.jpdbDefinitionsEnabled && !this.settings.showPitchAccent) return result;
        const entries = uniqueFallbackLookupEntries(cards);
        if (!entries.length) return result;

        const terms = [...new Set(entries.flatMap(entry => entry.terms))];
        const jitenCards = await this.jitenPublicVocabulary?.lookupMany?.(terms).catch(error => {
            log.warn('Public Jiten batch fallback search failed', { terms: terms.length }, error);
            return new Map<string, JPDBCard>();
        }) ?? new Map<string, JPDBCard>();
        for (const entry of entries) {
            for (const term of entry.terms) {
                const card = jitenCards.get(normalizedJitenLookupKey(term));
                if (!card) continue;
                result.set(entry.key, card);
                break;
            }
        }

        if (options.jpdbPublicLookup === false) return result;
        const unresolved = entries.filter(entry => !result.has(entry.key));
        await runLimited(unresolved, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async entry => {
            for (const term of entry.terms) {
                const cards = await this.jpdbVocabulary.search(term, 1).catch(error => {
                    log.warn('Public JPDB fallback search failed', { term }, error);
                    return [];
                });
                const publicCard = cards.find(candidate => candidate.spelling === term);
                if (!publicCard) continue;
                result.set(entry.key, publicCard);
                return;
            }
        });
        return result;
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
        const popover = this.repositionableLookupPopover();
        if (!popover) return;
        const scrollState = this.lookupPopoverScrollState();
        if (this.shouldUseFixedLookupHeight()) popover.style.height = '';
        this.placeLookupPopover(popover);
        this.syncLookupPopoverFixedHeight();
        this.restoreLookupPopoverScrollState(scrollState);
    }

    private repositionableLookupPopover(): HTMLElement | null {
        const popover = this.activeLookupPopover;
        if (!popover) return null;
        return popover.classList.contains('jpdb-reader-sheet') ? null : popover;
    }

    private lookupPopoverScrollState(): LookupPopoverScrollState {
        const body = this.lookupPopoverScrollBody();
        return { body, scrollTop: body?.scrollTop ?? 0 };
    }

    private placeLookupPopover(popover: HTMLElement): void {
        const lockedRect = this.lookupPopoverLockedPosition(popover);
        if (lockedRect) {
            this.placeLookupPopoverWithoutMoving(lockedRect);
            return;
        }
        positionPopover(popover, this.activeLookupAnchor, undefined, {
            maxHeight: configuredPopoverMaxHeight(this.settings),
        });
        this.lockLookupPopoverPosition(popover.getBoundingClientRect());
    }

    private lookupPopoverLockedPosition(popover: HTMLElement): { left: number; top: number } | undefined {
        return popover.dataset.jpdbReaderPositionLocked === 'true'
            ? this.lockedLookupPopoverPosition()
            : undefined;
    }

    private restoreLookupPopoverScrollState(state: LookupPopoverScrollState): void {
        if (state.body && state.body.scrollTop !== state.scrollTop) state.body.scrollTop = state.scrollTop;
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
        return runtimePopoverMaxHeightAtTop(this.settings, top);
    }

    private installLookupPopoverBodyStabilizers(popover: HTMLElement): void {
        installRuntimePopoverBodyStabilizers(popover);
    }

    private lookupPopoverScrollBody(): HTMLElement | undefined {
        return this.activeLookupPopover?.querySelector<HTMLElement>('.jpdb-reader-popover-body') ?? this.activeLookupPopover;
    }

    private shouldUseFixedLookupHeight(): boolean {
        return shouldUseFixedPopoverHeight(this.activeLookupPopover, this.settings);
    }

    private syncLookupPopoverFixedHeight(): void {
        syncFixedPopoverHeight(this.activeLookupPopover, this.shouldUseFixedLookupHeight());
    }

    private renderDefinitionSources(
        card: JPDBCard,
        entries: YomitanTermEntry[],
        sentence?: string,
        jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
        jitenVocabularyInfo: JitenVocabularyInfo | null = null,
        extraSectionsOrOptions: Record<string, string> | Pick<DefinitionSourceStackOptions, 'includeStudySources' | 'includeImmersionSource'> = {},
    ): string {
        return renderDefinitionSourcesStack({
            card,
            entries,
            settings: this.settings,
            sourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            dictionaryLabel: name => this.dictionaryLabel(name),
            noDefinitionsHtml: () => `<div class="jpdb-reader-help jpdb-reader-no-definitions">${escapeHtml(this.text('noDefinitionsFound'))}</div>`,
            sentence,
            jpdbVocabularyInfo,
            jitenVocabularyInfo,
            extraSectionsOrOptions,
            optionKeys: ['includeStudySources', 'includeImmersionSource'],
            renderTranslationSource: renderSentence => this.studySources.renderTranslationSource(renderSentence),
            renderGrammarSource: renderSentence => this.studySources.renderGrammarSource(renderSentence),
        });
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

    // Render Jiten and JPDB kanji facts side by side (both keys present) rather
    // than only the active provider, matching the reader popover.
    private renderNewTabKanjiFactSources(jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null): string {
        const sections: string[] = [];
        const jpdbKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
        if (jpdbInfo) {
            sections.push(renderJpdbKanjiInfo(jpdbInfo, this.settings.interfaceLanguage, this.dictionarySourceState.isOpen(jpdbKey), jpdbKey, kanjiFactProviderTitle('jpdb')));
        }
        if (jitenInfo) {
            const jitenKey = `${jpdbKey}:jiten`;
            sections.push(renderJitenKanjiInfo(jitenInfo, this.settings.interfaceLanguage, this.dictionarySourceState.isOpen(jitenKey), jitenKey, kanjiFactProviderTitle('jiten')));
        }
        return sections.join('');
    }

    private isCurrentPopoverRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activeLookupPopover && (root === this.activeLookupPopover || this.activeLookupPopover.contains(root)));
    }

    private async enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void> {
        if (!shouldLookupAnkiStatus(this.settings)) return;
        const uniqueTokens = this.uniqueTokens(tokens, () => true);
        const lookups = await this.anki.findCachedStatusBatch(uniqueTokens.map(token => token.card))
            .catch(error => {
                log.warnOnce('background-anki-coloring-failed', 'Anki background coloring failed', error);
                return uniqueTokens.map(() => untrustedAnkiLookupResult());
            });
        uniqueTokens.forEach((token, index) => {
            this.applyAnkiLookupToRenderedWords(token.card, lookups[index] ?? untrustedAnkiLookupResult(), roots);
        });
    }

    private async enrichPitchWords(tokens: JPDBToken[], limit = NEW_TAB_PITCH_ENRICHMENT_LIMIT): Promise<void> {
        if (!this.settings.showPitchAccent) return;
        if (!effectiveJpdbApiKey(this.settings)) return;
        const uniqueTokens = this.uniqueTokens(
            tokens,
            token => !token.card.pitchAccent.length && Boolean(token.card.spelling.trim()),
            limit,
        );

        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const pitchAccent = await this.jpdbPublicPitch.lookup(token.card.spelling, token.card.reading).catch(() => []);
            if (!pitchAccent.length) return;
            if (!token.card.pitchAccent.length) token.card.pitchAccent = pitchAccent;
            this.applyPitchAccentToRenderedWords(token.card);
        });
    }

    private async enrichPublicVocabularyWords(tokens: JPDBToken[], limit = NEW_TAB_PITCH_ENRICHMENT_LIMIT): Promise<void> {
        if (!this.settings.jpdbDefinitionsEnabled && !this.settings.showPitchAccent) return;
        const uniqueTokens = this.uniqueTokens(
            tokens,
            token => token.card.source === 'fallback',
            limit,
        );
        const resolvedCards = await this.publicLookupFallbackCards(uniqueTokens.map(token => token.card), { jpdbPublicLookup: false });

        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const card = resolvedCards.get(cardKey(token.card));
            if (!card) {
                this.unwrapRenderedFallbackWords(token.card);
                return;
            }
            this.parser.cacheCards?.([card]);
            this.applyPublicVocabularyToRenderedWords(token.card, card);
        });
    }

    private uniqueTokens(tokens: JPDBToken[], include: (token: JPDBToken) => boolean, limit = tokens.length): JPDBToken[] {
        const seen = new Set<string>();
        return tokens.filter(token => {
            if (!include(token)) return false;
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, limit);
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult, roots?: ParentNode[]): void {
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        const targetRoots = roots?.length ? roots : (this.activeLookupPopover ? [this.activeLookupPopover] : []);
        targetRoots.forEach(root => {
            root.querySelectorAll<HTMLElement>(selector).forEach(word => {
                if (!ankiLookup.primary && ankiLookup.trusted === false) return;
                clearRenderedWordAnkiState(word);
                if (!ankiLookup.primary) return;
                word.classList.add(`anki-${ankiLookup.state}`);
                word.dataset.ankiState = ankiLookup.state;
                word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
                word.title = `Anki: ${this.cardStateText(ankiLookup.state)}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
            });
        });
    }

    private applyPitchAccentToRenderedWords(card: JPDBCard): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (!pitchClass) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.activeLookupPopover?.querySelectorAll<HTMLElement>(selector).forEach(word => {
            setRenderedWordPitchClass(word, pitchClass);
        });
    }

    private applyPublicVocabularyToRenderedWords(fallback: JPDBCard, card: JPDBCard): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        document.querySelectorAll<HTMLElement>(this.renderedWordSelector(fallback)).forEach(word => {
            setRenderedWordPitchClass(word, pitchClass);
            setRenderedWordCardIdentity(word, card);
            applyPublicVocabularyFurigana(word, card, this.settings);
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
            'in-deck': 'stateInDeck',
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
        showReaderToast(message, 3000);
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
        this.enrichJpdbRelatedWords(root);
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
            const tokens = parsed.flat();
            void this.enrichPublicVocabularyWords(tokens);
            void this.enrichPitchWords(tokens);
            void this.enrichAnkiWords(tokens, [root]);
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey, parseLoadingId);
        }
    }

    private enrichJpdbRelatedWords(root: ParentNode): void {
        const related = renderedJpdbRelatedWords(root)
            .filter(({ word }) => word.dataset.jpdbReaderRelatedEnqueued !== 'true');
        if (!related.length) return;
        related.forEach(({ word }) => { word.dataset.jpdbReaderRelatedEnqueued = 'true'; });
        const tokens = related.map(({ token }) => token);
        void this.enrichPitchWords(tokens);
        void this.enrichAnkiWords(tokens, [root]);
    }

    private loadParsedNewTabContent(texts: string[], options: NewTabParseContentOptions = {}): Promise<JPDBToken[][]> {
        const parseOptions = {
            jpdbTimeoutMs: options.jpdbTimeoutMs ?? NEW_TAB_POPOVER_PARSE_TIMEOUT_MS,
            allowJpdbTimeoutFallback: options.allowJpdbTimeoutFallback ?? false,
            includeLocalPitch: false,
            allowSegmentedFallback: true,
        };
        const key = parseContentCacheKey(texts, parseOptions, this.settings);
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
        if (form.dataset.yomuSettingsSelfEnhancing === 'true') {
            form.dataset.yomuSettingsSelfEnhancePending = 'true';
            return;
        }
        form.dataset.yomuSettingsSelfEnhancing = 'true';
        unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup], [data-settings-preview-lookup] .jpdb-reader-word' });
        clearNestedParseState(form);
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.parser.canParse()) {
            delete form.dataset.yomuSettingsSelfEnhancing;
            return;
        }
        const plan = nestedSettingsTextParsePlan(form, 640);
        if (!plan) {
            delete form.dataset.yomuSettingsSelfEnhancing;
            return;
        }
        const parseLoadingId = `${Date.now()}:${Math.random()}`;
        form.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        form.dataset.jpdbReaderParseLoadingId = parseLoadingId;
        try {
            const parsed = await this.parser.parse(plan.targets.map(target => target.text), {
                allowJpdbTimeoutFallback: true,
                allowSegmentedFallback: true,
                includeLocalPitch: false,
                jpdbTimeoutMs: NEW_TAB_SETTINGS_PARSE_TIMEOUT_MS,
                requireJpdb: false,
                skipJpdb: true,
            });
            await this.hydrateSettingsFallbackTokens(parsed);
            if (!this.isCurrentSettingsRoot(form)
                || form.dataset.jpdbReaderParseLoadingKey !== plan.parseKey
                || form.dataset.jpdbReaderParseLoadingId !== parseLoadingId) return;
            const currentPlan = nestedSettingsTextParsePlan(form, 640);
            if (!currentPlan) return;
            const currentParsed = parsedSettingsTargetsForCurrentPlan(plan, parsed, currentPlan);
            const renderSettings = settingsForSettingsFormParse(form, this.settings);
            applyNestedParsePlan(currentPlan, currentParsed, renderSettings);
            addSettingsRubyFromRenderedReadings(form, renderSettings);
            highlightCardTargetScopes(form);
            refreshReaderWordContrast(form);
            form.dataset.jpdbReaderParseKey = currentPlan.parseKey;
            form.dataset.yomuSettingsSelfEnhanced = 'true';
            const tokens = currentParsed.flat();
            void this.enrichPublicVocabularyWords(tokens, NEW_TAB_SETTINGS_PUBLIC_VOCABULARY_LIMIT);
            void this.enrichPitchWords(tokens, NEW_TAB_SETTINGS_ENRICHMENT_LIMIT);
        } catch {
        } finally {
            clearNestedParseLoadingKey(form, plan.parseKey, parseLoadingId);
            if (this.isCurrentSettingsRoot(form)) {
                const pending = form.dataset.yomuSettingsSelfEnhancePending === 'true';
                delete form.dataset.yomuSettingsSelfEnhancing;
                delete form.dataset.yomuSettingsSelfEnhancePending;
                if (pending) {
                    void this.parseSettingsJapanese(form);
                }
            }
        }
    }

    private async hydrateSettingsFallbackTokens(parsed: JPDBToken[][]): Promise<void> {
        const tokens = this.uniqueTokens(
            parsed.flat(),
            token => token.card.source === 'fallback',
            NEW_TAB_SETTINGS_PUBLIC_VOCABULARY_LIMIT,
        );
        const resolvedCards = await this.publicLookupFallbackCards(tokens.map(token => token.card), { jpdbPublicLookup: false });
        await runLimited(tokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const card = resolvedCards.get(cardKey(token.card));
            if (!card) return;
            const surface = token.sentence?.slice(token.start, token.end) || card.spelling;
            token.card = card;
            token.rubies = inferredInflectedSurfaceRubies(surface, card.spelling, card.reading);
            token.pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass;
            this.parser.cacheCards?.([card]);
        });
    }

    private isCurrentSettingsRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activeDialog === root && root.classList.contains('jpdb-reader-settings'));
    }
}

function markNewTabRuntime(): void {
    (window as YomuNewTabWindow).__YOMU_READER_RUNTIME__ = 'newtab';
}

function parsedSettingsTargetsForCurrentPlan(
    previousPlan: NonNullable<ReturnType<typeof nestedSettingsTextParsePlan>>,
    previousParsed: JPDBToken[][],
    currentPlan: NonNullable<ReturnType<typeof nestedSettingsTextParsePlan>>,
): JPDBToken[][] {
    const parsedByText = new Map<string, JPDBToken[][]>();
    previousPlan.targets.forEach((target, index) => {
        const queue = parsedByText.get(target.text) ?? [];
        queue.push(previousParsed[index] ?? []);
        parsedByText.set(target.text, queue);
    });
    return currentPlan.targets.map(target => parsedByText.get(target.text)?.shift() ?? []);
}

interface FallbackLookupEntry {
    key: string;
    terms: string[];
}

function uniqueFallbackLookupEntries(cards: readonly JPDBCard[]): FallbackLookupEntry[] {
    const seen = new Set<string>();
    const entries: FallbackLookupEntry[] = [];
    for (const card of cards) {
        const key = cardKey(card);
        if (seen.has(key)) continue;
        seen.add(key);
        const terms = fallbackLookupTermsForCard(card);
        if (terms.length) entries.push({ key, terms });
    }
    return entries;
}

function normalizedJitenLookupKey(term: string): string {
    return term.replace(/\s+/g, '').trim();
}

function settingsForSettingsFormParse(form: HTMLFormElement, settings: ReaderSettings): ReaderSettings {
    const furiganaMode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')?.value;
    const showPitchAccent = form.querySelector<HTMLInputElement>('input[name="showPitchAccent"]')?.checked;
    if (furiganaMode !== 'all' && furiganaMode !== 'difficult-kanji' && furiganaMode !== 'known-status' && furiganaMode !== 'hover' && furiganaMode !== 'off') {
        return typeof showPitchAccent === 'boolean' ? { ...settings, showPitchAccent } : settings;
    }
    return {
        ...settings,
        showFurigana: furiganaMode !== 'off',
        furiganaMode,
        showPitchAccent: typeof showPitchAccent === 'boolean' ? showPitchAccent : settings.showPitchAccent,
    };
}

function addSettingsRubyFromRenderedReadings(form: HTMLFormElement, settings: ReaderSettings): void {
    if (!settings.showFurigana || settings.furiganaMode === 'off') return;
    for (const word of form.querySelectorAll<HTMLElement>('.jpdb-reader-word')) {
        if (word.querySelector('rt,.jpdb-reader-furi')) continue;
        const reading = word.dataset.reading?.trim() ?? '';
        const surface = word.dataset.surface?.trim() || word.dataset.expression?.trim() || word.textContent?.trim() || '';
        if (!surface || !reading || reading === surface || !/[\u3400-\u9fff]/u.test(surface) || !/^[\u3040-\u30ffー・]+$/u.test(reading)) continue;
        const ruby = document.createElement('ruby');
        const base = document.createElement('span');
        base.className = 'jpdb-reader-ruby-base';
        base.textContent = surface;
        const open = document.createElement('rp');
        open.textContent = '(';
        const rt = document.createElement('rt');
        rt.className = 'jpdb-reader-furi';
        rt.textContent = reading;
        const close = document.createElement('rp');
        close.textContent = ')';
        ruby.append(base, open, rt, close);
        word.replaceChildren(ruby);
        word.classList.add('jpdb-reader-has-furi');
    }
}

function refreshableNoop(): { refresh: () => void } {
    return { refresh: () => undefined };
}
