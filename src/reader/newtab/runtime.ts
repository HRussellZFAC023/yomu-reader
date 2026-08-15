import { subscribeToCardStateSignals } from '../app/card-state-signal';
import { AudioPlayer } from '../audio/player';
import { AnkiConnectClient, ankiLookupWithUnavailableDetails, untrustedAnkiLookupResult, type AnkiLookupResult } from '../anki';
import { newTabAnkiClient } from '../anki/new-tab';
import { runLimited } from '../core/async-utils';
import { copyText, positionPopover } from '../ui/browser';
import { CardActionController } from '../cards/action-controller';
import { refreshAfterCardAction, reportCardActionFailure, runCardActionOperation } from '../cards/action-operation';
import { CardPopoverRenderer, togglePopoverReviewTargetSelection, updatePopoverReviewTargetSelection } from '../cards/popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData, type CardRenderData, type CardRenderDataLoad } from '../cards/render-data';
import { highlightCardTargetScopes } from '../cards/highlight';
import { apiSrsProviderViewForCard } from '../cards/srs-providers';
import { normalizeCardStates, primaryCardState } from '../cards/state';
import { cardKey } from '../cards/utils';
import { APP_NAME, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from '../app/constants';
import { handleReaderActionPillLink } from '../app/main-helpers';
import {
    yomuKanjiStudyCompanion,
    yomuOnboardingController,
    yomuSettingsSurfaceCompanion,
} from '../companions/registry';
import {
    kanjiFactProviderTitle,
    kanjiSourceStateKey,
    renderKanjiDefinitions,
} from '../sources/definition-render';
import { renderDefinitionSourcesStack, type DefinitionSourceStackOptions } from '../sources/definition-stack';
import { installProviderExampleBehaviors } from '../sources/provider-examples';
import { DictionarySourceStateController } from '../sources/state';
import { escapeHtml, inferredInflectedSurfaceRubies, readerWordSurfaceText, setInnerHtml } from '../dom';
import { createReaderDictionaryStyleController } from '../sources/styles';
import { OfflineDictionarySetupController } from '../dictionaries/offline-setup-controller';
import { createFactoryResetCoordinator, type FactoryResetCoordinator } from '../app/factory-reset-coordinator';
import { clearManagedBrowserCaches, ensureManagedWebStorageCurrent, unregisterManagedServiceWorkers } from '../app/storage';
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
import { kanjiFrequencyRanks } from '../cards/frequency-ranks';
import { runJitenKanjiWordsAction, type JitenKanjiWordsActionContext } from '../jiten/jiten-kanji-words-actions';
import type { JpdbKanjiClient, JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { renderedJpdbRelatedWords } from '../jpdb/jpdb-related-words';
import { jpdbVocabularyUrl } from '../jpdb/jpdb-vocabulary-url';
import { jpdbAudioCard } from '../jpdb/jpdb-page-targets';
import { createJpdbReviewBridgeClient } from '../jpdb/jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { KanjiVGClient, KanjiVGInfo } from '../kanji/vg';
import type { KanjiSourceInfo } from '../kanji/origin';
import { canAttemptAudiblePlayback } from '../audio/media-activation';
import { configureLogger, Logger } from '../app/logger';
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
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedTextParsePlan, providerExampleTextParsePlan, type NestedParsePlan } from '../lookup/nested-text-parse';
import { isTargetLanguageText } from '../lookup/target-text';
import { NewTabController, newTabKanjiSourceTitle, type NewTabLookupReviewTargetSelection } from './controller';
import { newTabSettingsWithPageInterfaceLanguage, newTabSettingsWithPageTarget } from './runtime-target-policy';
import { settingsPanelFromHash, type SettingsPanelId } from './url';
import { ensureExtensionStudySettingsAuthority } from './extension-settings-recovery-guard';
import type { StudySessionClock } from './session-clock';
import {
    privateCommandAttributes,
    dispatchPrivateCommand,
    readCardCommandCapability,
    type CardCommandCapability,
} from '../dom/private-command-capabilities';
import { trustedReaderEventHandler } from '../ui/trusted-interaction';
import { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
import { createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, refreshForcedReaderPopoverSurface } from '../popup/shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import {
    buildKanjiFacts,
    buildKanjiOriginGraph,
    buildRtkComponentSummaries,
    installOriginGraphInteractions,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderRtkInfo,
} from '../popup/render';
import { cardUsesPitchAccentPronunciation } from '../popup/pronunciation';
import { applyAnkiLookupToRenderedWord, applyPublicVocabularyFurigana, updateRenderedPitch } from '../app/dom-helpers';
import { targetCanLookupCharacter, usesJapaneseCharacterStudy, usesJapaneseProviders } from '../languages/character-lookup';
import { ReaderParser } from '../lookup/parser';
import {
    DEFAULT_SETTINGS,
    loadSettingsWithWitnessedAuthority,
    NO_EXPLICIT_USER_CHOICE,
    saveSettings,
    shouldLookupAnkiStatus,
} from '../settings/index';
import {
    effectiveBunproFrontendApiToken,
    effectiveBunproLegacyApiKey,
    effectiveJitenApiKey,
    effectiveJpdbApiKey,
    hasJitenApiCredential,
    isBunproFrontendCredentialExpired,
} from '../settings/api-credential';
import { renderedWordCardKey, renderedWordElementKey, renderedWordsInRoot, setRenderedWordCardIdentity, setRenderedWordPitchClass } from '../dom/rendered-word-state';
import { renderedWordPrivateValue } from '../dom/rendered-word-private-state';
import { refreshReaderWordContrast } from '../dom/word-contrast';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from '../theme/reader-theme';
import { applyInterfaceLocaleToDocument, applyInterfaceLocaleToRoot } from '../locales/direction';
import { resolveInterfaceLocale } from '../locales/resolve';
import { showReaderToast } from '../ui/toast';
import { ReaderAudioActions } from '../audio/actions';
import { refreshRenderedAnkiStatusAfterMutation as refreshRenderedAnkiStatus, scheduleReaderAnkiStatusRefresh, scheduleReaderAnkiStatusWarmup } from '../app/status-warmup';
import { SettingsDialogController } from '../settings/dialog-controller';
import { getUserscriptHttpRequest } from '../userscript';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    definitionSourceLabel,
} from '../sources/sections';
import { renderKanjiImmersionKitMount, renderKanjiSourceMounts as renderRuntimeKanjiSourceMounts } from '../runtime/kanji-source-mounts';
import {
    configuredPopoverMaxHeight,
    installPopoverBodyStabilizers as installRuntimePopoverBodyStabilizers,
    popoverMaxHeightAtTop as runtimePopoverMaxHeightAtTop,
    shouldUseFixedPopoverHeight,
    syncFixedPopoverHeight,
} from '../runtime/popover-body-stabilizer';
import { StudySourceController } from '../study/sources';
import { outputLanguageOf, targetLanguageOf } from '../languages/selection';
import { translateJapaneseSentence } from '../study/tools';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from '../app/types';
import { addWindowEventListener } from '../platform/window-events';
import { subscribeToReaderSettingsChanges } from '../app/settings-storage-subscription';
import { renderWordPills, updateHeadingWordPills } from '../sources/word-pills';
import type { RtkClient, RtkInfo } from '../kanji/rtk';
import { BunproClient } from '../bunpro/bunpro';
import { createBunproSrsAdapter, createWanikaniSrsAdapter, createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../srs';
import { installAcademyReaderSrsSync } from '../srs/account-sync';
import { repaintYomuLocalSrsRenderedWords } from '../srs/local-yomu-state';
import { WanikaniClient } from '../wanikani/wanikani';
import { WanikaniLookupClient } from '../wanikani/wanikani-lookup';
import { WanikaniSourceController } from '../wanikani/wanikani-source';
import { YomitanDictionaryStore, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from '../dictionaries/yomitan';
import { NewTabTargetLookupResolver } from './target-lookup-resolver';
import {
    NewTabLookupTargetScope,
    type LookupTargetSnapshot,
} from './target-scope';
import { NewTabTargetParseCache, type NewTabParseContentOptions } from './target-parse-cache';
import { emptyKanjiLookupDetailPromises, type KanjiLookupDetailPromises } from './target-kanji-details';

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

function noopKanjiPracticeDoodle(): { reassess: () => void; clear: () => void } {
    const noop = (): void => undefined;
    return { reassess: noop, clear: noop };
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

interface LookupPopoverScrollState {
    body?: HTMLElement;
    scrollTop: number;
}

export interface NewTabRuntimeStartupOptions {
    readonly ensureStorageCurrent?: () => Promise<void>;
    readonly createRuntime?: () => { init(): Promise<void>; destroy(): void };
    readonly registerPagehide?: (destroy: () => void) => void;
}

export function bootNewTabRuntime(): void { void startNewTabRuntime().catch(error => log.error('New tab initialization failed', error)); }

export async function startNewTabRuntime(options: NewTabRuntimeStartupOptions = {}): Promise<void> {
    await ensureExtensionStudySettingsAuthority({
        reportFailure: failure => log.warn('Packaged Study settings recovery failed', {
            rawChosenSettingsDetected: failure.rawChosenSettingsDetected,
        }),
    });
    await (options.ensureStorageCurrent ?? ensureManagedWebStorageCurrent)();
    const app = (options.createRuntime ?? (() => new NewTabRuntime()))();
    await app.init();
    (options.registerPagehide ?? (destroy => {
        addWindowEventListener('pagehide', destroy, { once: true });
    }))(() => app.destroy());
}

export interface NewTabRuntimeOptions {
    readonly mountHost?: HTMLElement;
    /** Deliberate, non-persisted target owned by an embedded hosted lesson. */
    readonly pageOwnedLearningTarget?: 'ja';
    readonly sessionClock?: StudySessionClock;
    readonly interfaceLanguage?: 'en' | 'ja';
    /** Read-only lesson context. Scheduler writes are owned by Academy learner evidence. */
    readonly sessionVocabulary?: readonly ReaderStudyVocabulary[];
}

export interface ReaderStudyVocabulary {
    readonly id: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meaning?: string;
    readonly source?: string;
}

/** Mounts the production Study runtime without replacing the Academy document. */
export async function mountNewTabStudySurface(
    host: HTMLElement,
    options: {
        readonly language: 'en' | 'ja';
        readonly sessionClock: StudySessionClock;
        readonly sessionVocabulary?: readonly ReaderStudyVocabulary[];
    },
): Promise<{ dispose(): void }> {
    await ensureManagedWebStorageCurrent();
    const runtime = new NewTabRuntime({
        mountHost: host,
        pageOwnedLearningTarget: 'ja',
        sessionClock: options.sessionClock,
        interfaceLanguage: options.language,
        sessionVocabulary: options.sessionVocabulary,
    });
    await runtime.init();
    return {
        dispose() {
            runtime.destroy();
            host.replaceChildren();
        },
    };
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
    private pendingOnboardingSettingsPanel?: string;
    private newTab?: NewTabController;
    private jpdb = new JpdbClient(() => effectiveJpdbApiKey(this.settings), () => this.settings.corsProxyUrl);
    private jiten = new JitenApiClient(() => effectiveJitenApiKey(this.settings), { proxyUrl: () => this.settings.corsProxyUrl });
    private kanjiCompanion = yomuKanjiStudyCompanion();
    private jpdbKanji = this.kanjiCompanion ? new this.kanjiCompanion.JpdbKanjiClient(() => this.settings.corsProxyUrl) : createNoopJpdbKanjiClient();
    private kanjiOrigin = this.kanjiCompanion ? new this.kanjiCompanion.KanjiOriginClient() : null;
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private jitenPublicVocabulary = new JitenPublicVocabularyClient({ proxyUrl: () => this.settings.corsProxyUrl });
    private kanjiVG = this.kanjiCompanion ? new this.kanjiCompanion.KanjiVGClient() : createNoopKanjiVGClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private bunpro = new BunproClient({
        getFrontendToken: () => this.activeBunproFrontendApiToken(),
        getLegacyApiKey: () => effectiveBunproLegacyApiKey(this.settings),
        getProxyUrl: () => this.settings.corsProxyUrl,
        isTransportAvailable: () => Boolean(this.settings.corsProxyUrl.trim() || getUserscriptHttpRequest()),
    });
    private bunproSrs = createBunproSrsAdapter(this.bunpro);
    private wanikani = new WanikaniClient({ getToken: () => this.settings.wanikaniApiToken });
    private wanikaniSrs = createWanikaniSrsAdapter(this.wanikani);
    private yomuLocalSrsRepository = new LocalYomuSrsRepository();
    private yomuLocalSrs = createYomuLocalSrsAdapter(this.yomuLocalSrsRepository);
    private rtk = this.kanjiCompanion ? new this.kanjiCompanion.RtkClient() : createNoopRtkClient();
    private jpdbReviewBridge = createJpdbReviewBridgeClient();
    private dictionaries = new YomitanDictionaryStore(() => this.settings.corsProxyUrl, () => this.settings.interfaceLanguage);
    private dictionarySourceState = new DictionarySourceStateController({
        getSettings: () => this.settings,
        onStateChange: () => this.repositionLookupPopover(),
    });
    // fallow-ignore-next-line code-duplication
    private wanikaniSources = new WanikaniSourceController(
        new WanikaniLookupClient(this.wanikani),
        () => this.settings,
        (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        mount => {
            this.repositionLookupPopover();
            const installDefinitionTranslationBehaviors =
                yomuSettingsSurfaceCompanion()?.installDefinitionTranslationBehaviors;
            if (!installDefinitionTranslationBehaviors) return;
            void installDefinitionTranslationBehaviors(mount, this.settings)
                .then(() => this.repositionLookupPopover());
        },
    );
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
        bunpro: this.bunpro,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
    });
    private lookupPopoverRenderer = new CardPopoverRenderer({
        getSettings: () => this.settings,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
        renderWordHistory: (language, trigger) => this.navigation.renderWordHistory(language, trigger),
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery, _trigger, ankiLookup, frequencyRanks) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            ankiLookup,
            frequencyRanks,
            isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        }),
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, bunproDefinitionInfo, extraSections) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, bunproDefinitionInfo, extraSections),
        dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
        renderReviewButtonsFallback: (card, data) => this.renderNewTabLookupReviewButtons(card, data),
    });
    private activeLookupPopover?: HTMLElement;
    private activeLookupBackdrop?: HTMLElement;
    private activeLookupAnchor?: HTMLElement;
    private activeLookupHandlerController?: AbortController;
    private readonly lookupModal = new LookupModalAccessibility();
    private readonly lookupTarget = new NewTabLookupTargetScope();
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private externalRefreshController?: AbortController;
    private offlineDictionaries = new OfflineDictionarySetupController({
        dictionaries: this.dictionaries,
        getSettings: () => this.settings,
        applySettings: async settings => {
            this.settings = settings;
            await saveSettings(settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
        },
        notify: message => this.toast(message),
        afterInstalled: () => this.refreshDictionaryStyles(),
    });
    private dictionaryStyles = createReaderDictionaryStyleController(() => this.settings, preferences => this.dictionaries.dictionaryStyleCss(preferences), error => log.warn('Dictionary styles unavailable', error));
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
        srsAdapters: {
            bunpro: this.bunproSrs,
            wanikani: this.wanikaniSrs,
            'yomu-local': this.yomuLocalSrs,
        },
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
            void saveSettings(this.settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
        },
        onAnkiStatusChanged: card => this.handleAnkiStatusChanged(card),
        onApiCardStateChanged: card => this.handleApiCardStateChanged(card),
    });
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        jitenPublicVocabulary: this.jitenPublicVocabulary,
        dictionaries: this.dictionaries,
        yomuLocalSrs: this.yomuLocalSrs,
    });
    private readonly targetLookup = new NewTabTargetLookupResolver({
        getSettings: () => this.settings,
        getDictionaries: () => this.dictionaries,
        getParser: () => this.parser,
        getJpdbVocabulary: () => this.jpdbVocabulary,
        getJiten: () => this.jiten,
        getJitenPublicVocabulary: () => this.jitenPublicVocabulary,
        isJitenApiActive: () => this.isJitenApiActive(),
        publicFallbackConcurrency: NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY,
        warnPublicSearch: (term, error) => log.warn('Public JPDB fallback search failed', { term }, error),
        targetScope: this.lookupTarget,
    });
    private readonly parseContentCache = new NewTabTargetParseCache({
        getSettings: () => this.settings,
        parse: (texts, options) => this.parser.parse(texts, options),
        defaultTimeoutMs: NEW_TAB_POPOVER_PARSE_TIMEOUT_MS,
        ttlMs: NEW_TAB_PARSE_CONTENT_CACHE_TTL_MS,
        limit: NEW_TAB_PARSE_CONTENT_CACHE_LIMIT,
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
        getSettings: () => this.settings, saveSettings,
        setSettings: (settings, options) => {
            const nextSettings = this.settingsDialogTargetChoice(settings, options?.transient === true);
            this.settings = nextSettings;
            this.syncRuntimeTarget(nextSettings);
        },
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
    private onboarding = this.createOnboardingController();

    constructor(private readonly options: NewTabRuntimeOptions = {}) {}

    async init(): Promise<void> {
        this.isDestroyed = false;
        this.markOwnedRuntime();
        this.installExternalRefreshListener();
        configureLogger({ settingsProvider: () => this.settings });
        this.factoryReset.bind();
        this.settings = newTabSettingsWithPageInterfaceLanguage(await loadSettingsWithWitnessedAuthority(), this.options.interfaceLanguage);
        // Hosted Study can start before an installed userscript/extension has
        // exposed its shared storage bridge. Listen before target resolution:
        // onboarding waits below, so installing this only after the first
        // render made the authoritative settings permanently unreachable.
        this.installSettingsStorageSubscription();
        configureLogger({ forceEnabled: this.settings.enableLogging });
        // D43: the new tab and the study app are documents Yomu owns outright, so
        // they take `lang`, `dir` and the per-script interface font from the
        // locale manifest. When mounted into a host page (`mountHost`) we stamp
        // the mount, never the page's documentElement.
        this.applyInterfaceLocale();
        this.applyTheme();
        const runtimeTargetSettings = await this.resolveRuntimeTargetSettings();
        if (!runtimeTargetSettings) return;
        this.syncLookupTarget(runtimeTargetSettings);
        this.assertSessionVocabularyReadOnly();
        const requestedSettingsPanel = this.consumeRequestedSettingsPanel();
        this.newTab = this.createNewTabController();
        await this.newTab.renderPage();
        this.openPendingOnboardingSettingsPanel();
        this.openRequestedSettingsPanel(requestedSettingsPanel);
        void this.refreshDictionaryStyles();
        this.scheduleDictionaryIndexPreparation();
        this.scheduleAnkiStatusWarmup();
        this.installCardStateSignalSubscription();
        installAcademyReaderSrsSync();
        void this.settingsDialog.resumePendingCloudSettingsSync();
    }

    private markOwnedRuntime(): void {
        if (!this.options.mountHost) markNewTabRuntime();
    }

    private scheduleDictionaryIndexPreparation(): void {
        if (!this.settings.localDictionariesEnabled) return;
        window.setTimeout(() => {
            if (!this.isDestroyed) void this.dictionaries.prepareTermSearchIndex();
        }, 1500);
    }

    private createOnboardingController() {
        const Controller = yomuOnboardingController();
        if (!Controller) return undefined;
        return new Controller({
            getSettings: () => this.settings,
            setSettings: settings => {
                this.settings = settings;
                if (settings.learningTargetChosen) this.syncLookupTarget(settings);
                this.applyTheme(settings);
                this.applyWordColors(settings);
            },
            showSettings: panel => { this.pendingOnboardingSettingsPanel = panel; },
            parseJapanese: panel => void this.parseNewTabContent(panel),
            lookupText: (text, sentence, anchor) => void this.lookupText(text, sentence || text, anchor, { stackOverSettings: true }),
            installOfflineDictionaries: () => void this.offlineDictionaries.run(),
            onComplete: settings => this.applyRemoteSettings(settings),
            onPersistenceFailed: settings => this.rollbackOnboardingSettings(settings),
        });
    }

    private async resolveRuntimeTargetSettings(): Promise<ReaderSettings | null> {
        const current = this.runtimeTargetSettings(this.settings);
        if (current) return current;
        // A generic embedded mount must fail closed. Academy supplies a
        // page-owned target, while standalone Study can host the chooser.
        if (this.options.mountHost) return null;
        await this.runOnboardingIfAvailable();
        if (this.isDestroyed) return null;
        return this.runtimeTargetSettings(this.settings);
    }

    private runtimeTargetSettings(settings: ReaderSettings): ReaderSettings | null {
        if (settings.learningTargetChosen) return settings;
        const pageOwnedLearningTarget = this.options.pageOwnedLearningTarget;
        if (!pageOwnedLearningTarget) return null;
        return newTabSettingsWithPageTarget(settings, pageOwnedLearningTarget);
    }

    private settingsDialogTargetChoice(settings: ReaderSettings, transient: boolean): ReaderSettings {
        if (transient) return settings;
        if (targetLanguageOf(settings) === targetLanguageOf(this.settings)) return settings;
        return { ...settings, learningTargetChosen: true };
    }

    private syncRuntimeTarget(settings: ReaderSettings): void {
        const runtimeTargetSettings = this.runtimeTargetSettings(settings);
        if (runtimeTargetSettings) this.syncLookupTarget(runtimeTargetSettings);
    }

    private async runOnboardingIfAvailable(): Promise<void> {
        const onboarding = this.onboarding;
        if (!onboarding) return;
        await onboarding.showIfNeeded();
        await onboarding.waitForCompletion();
    }

    private rollbackOnboardingSettings(previousSettings: ReaderSettings): void {
        this.settings = previousSettings;
        this.syncRuntimeTarget(previousSettings);
        this.applyTheme(previousSettings);
        this.applyWordColors(previousSettings);
    }

    private assertSessionVocabularyReadOnly(): void {
        for (const item of this.options.sessionVocabulary ?? []) {
            if (!item.id.trim() || !item.expression.trim()) {
                throw new TypeError('Academy session vocabulary requires stable ids and expressions.');
            }
        }
    }

    // Cross-tab card-state mutation bus: grading or mining a card on a page
    // popover in another tab recolors this study tab's rendered occurrences
    // (current card, transcripts, search results) without a refresh.
    private installCardStateSignalSubscription(): void {
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = subscribeToCardStateSignals(card => {
            if (this.isDestroyed) return;
            this.applyPublicVocabularyToRenderedWords(card, card);
            repaintYomuLocalSrsRenderedWords(card);
            if (card.source === 'bunpro') {
                this.dismissLookupPopover();
                void this.newTab?.refreshBunproQueueAfterExternalGrade();
            }
        });
    }

    private installSettingsStorageSubscription(): void {
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = subscribeToReaderSettingsChanges(settings => {
            if (this.isDestroyed) return;
            void this.applyRemoteSettings(settings);
        });
    }

    private async applyRemoteSettings(settings: ReaderSettings): Promise<void> {
        const effectiveSettings = newTabSettingsWithPageInterfaceLanguage(settings, this.options.interfaceLanguage);
        this.settings = effectiveSettings;
        void this.onboarding?.waitForCompletion(effectiveSettings);
        this.syncRuntimeTarget(effectiveSettings);
        configureLogger({ forceEnabled: effectiveSettings.enableLogging });
        this.cardRenderData.clear();
        this.parseContentCache.clear();
        this.jpdbVocabulary.clear();
        this.parser.clearLocalCache();
        this.applyInterfaceLocale();
        this.applyTheme(effectiveSettings);
        this.applyWordColors(effectiveSettings);
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
        repaintYomuLocalSrsRenderedWords(card);
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
        this.audio.destroy?.();
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
        this.lookupTarget.invalidateRender();
        this.lastAutoAudioKey = '';
        this.lastAutoAudioAt = 0;
        await this.dictionaries.invalidateForFactoryReset();
        await clearManagedBrowserCaches();
        await unregisterManagedServiceWorkers();
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
            anki: newTabAnkiClient(this.anki, () => this.settings),
            jpdb: this.jpdb,
            jiten: this.jiten,
            jpdbKanji: this.jpdbKanji,
            kanjiVG: this.kanjiVG,
            kanjiOrigin: this.kanjiOrigin ?? undefined,
            rtk: this.rtk,
            immersionKit: this.immersionKit,
            jpdbVocabulary: this.jpdbVocabulary,
            jpdbPublicPitch: this.jpdbPublicPitch,
            jpdbReviewBridge: this.jpdbReviewBridge,
            srsAdapters: {
                bunpro: this.bunproSrs,
                wanikani: this.wanikaniSrs,
                'yomu-local': this.yomuLocalSrs,
            },
            clearWanikaniAccountContext: () => this.wanikani.clear(),
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
            loadCardRenderData: (card, options) => this.cardRenderData.load(card, options).all,
            hydratePitchAccent: card => this.cardRenderData.load(card).hydratePitchAccent?.() ?? Promise.resolve([...card.pitchAccent]),
            hydrateFrequencyRanks: card => this.cardRenderData.load(card).hydrateFrequencyRanks?.() ?? Promise.resolve({}),
            hydrateBunproDefinitionInfo: card => this.cardRenderData.load(card).hydrateBunproDefinitionInfo?.() ?? Promise.resolve(null),
            hydrateBunproDefinitionResult: card => this.cardRenderData.load(card).hydrateBunproDefinitionResult?.()
                ?? Promise.resolve({ info: null, status: { state: 'client-unavailable' } }),
            renderSearchDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, bunproDefinitionInfo) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, bunproDefinitionInfo, { includeStudySources: false }),
            renderSearchWordPills: (card, metaEntries, ankiLookup, frequencyRanks) => renderWordPills({
                card,
                jpdbUrl: jpdbVocabularyUrl(card),
                settings: this.settings,
                metaEntries,
                ankiLookup,
                frequencyRanks,
                isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
                dictionaryLabel: name => this.dictionaryLabel(name),
            }),
            renderStudyWordPills: (card, metaEntries, ankiLookup, frequencyRanks) => renderWordPills({
                card,
                jpdbUrl: jpdbVocabularyUrl(card),
                settings: this.settings,
                metaEntries,
                ankiLookup,
                frequencyRanks,
                isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
                dictionaryLabel: name => this.dictionaryLabel(name),
            }),
            installSearchDetailSources: (root, card, sentence, jpdbVocabularyInfo) => this.installLookupPopoverSources(root, card, sentence, jpdbVocabularyInfo),
            installWanikaniSources: (root, card) => this.wanikaniSources.installDefinitionMounts(root, card),
            lookupStudyCard: (term, reading) => this.lookupCard(term, reading ?? ''),
            renderStudyDefinitionSources: (card, data, sentence) => this.renderDefinitionSources(card, data.localEntries, sentence, data.jpdbVocabularyInfo, data.jitenVocabularyInfo ?? null, data.bunproDefinitionInfo ?? null, {
                includeStudySources: false,
                includeImmersionSource: false,
            }),
            preloadWordAudio: card => this.maybePreloadLookupCardAudio(card),
            playWordAudio: card => this.audioActions.playTermAudio(card, { userGesture: true }),
            playJpdbExampleAudio: (audioIds, fallbackSentence) => this.audioActions.playJpdbExampleAudio(audioIds, fallbackSentence),
            performCardAction: (button, card, sentence, anchor, command) => this.handleCardAction(button, card, sentence, anchor, command),
            setImmersionTranslationBlurred: blurred => this.setImmersionTranslationBlurred(blurred),
            dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            isDictionarySourceOpen: (key, initiallyExpanded) => this.dictionarySourceState.isOpen(key, initiallyExpanded),
            installDictionarySourceTracking: root => this.dictionarySourceState.installTracking(root),
            onSettingsChange: explicitUserChoiceKeys => saveSettings(this.settings, { explicitUserChoiceKeys }),
            applyTheme: () => this.applyTheme(),
            showSettings: panel => this.showSettings(panel),
            dismissLookup: () => this.dismissLookupPopover(),
            dismiss: () => this.dismiss(),
        }, {
            host: this.options.mountHost,
            surface: this.options.mountHost ? 'academy' : 'standalone',
            sessionClock: this.options.sessionClock,
            showSessionClockControl: !this.options.mountHost,
        });
    }

    private setImmersionTranslationBlurred(blurred: boolean): void {
        if (this.settings.immersionKitRevealTranslationOnClick === blurred) return;
        this.settings = { ...this.settings, immersionKitRevealTranslationOnClick: blurred };
        void saveSettings(this.settings, { explicitUserChoiceKeys: ['immersionKitRevealTranslationOnClick'] });
    }

    private showSettings(panel?: string): void {
        this.settingsDialog.open(panel);
    }
    private openPendingOnboardingSettingsPanel(): void {
        const panel = this.pendingOnboardingSettingsPanel;
        this.pendingOnboardingSettingsPanel = undefined;
        if (panel) this.showSettings(panel);
    }
    private consumeRequestedSettingsPanel(): SettingsPanelId | null {
        const panel = settingsPanelFromHash(location.hash);
        if (!panel) return null;
        try {
            history.replaceState(history.state, '', `${location.pathname}${location.search}`);
        } catch {
            // A locked-down extension history must not block the settings UI.
        }
        return panel;
    }
    private openRequestedSettingsPanel(panel: SettingsPanelId | null): void {
        if (!panel) return;
        this.showSettings(panel);
    }
    private activeBunproFrontendApiToken(): string {
        return isBunproFrontendCredentialExpired(this.settings)
            ? ''
            : effectiveBunproFrontendApiToken(this.settings);
    }

    private mountSettingsDialog(backdrop: HTMLElement, surface: HTMLElement): void {
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
        document.body.append(backdrop, surface);
        this.activeBackdrop = backdrop;
        this.activeDialog = surface;
        surface.focus();
    }

    private nextLookupRenderRequest(): number {
        return this.lookupTarget.nextRender();
    }

    private isCurrentLookupRender(popover: HTMLElement, requestId: number): boolean {
        return this.lookupTarget.isCurrentRender(requestId)
            && popover.isConnected
            && this.activeLookupPopover === popover;
    }

    private captureLookupTarget(): LookupTargetSnapshot {
        return this.lookupTarget.capture();
    }

    private isCurrentLookupTarget(snapshot: LookupTargetSnapshot): boolean {
        return this.lookupTarget.isCurrent(snapshot);
    }

    private syncLookupTarget(settings: ReaderSettings): void {
        if (!this.lookupTarget.sync(settings)) return;
        this.parseContentCache.clear();
        this.newTab?.invalidateForTargetChange();
        // This closes only the lookup layer. A settings dialog underneath a
        // stacked lookup remains mounted and interactive.
        this.dismissLookupPopover();
    }

    private isCurrentKanjiLookupRender(popover: HTMLElement, requestId: number, kanji: string): boolean {
        return targetCanLookupCharacter(kanji)
            && this.isCurrentLookupRender(popover, requestId);
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
        this.lookupModal.release();
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
        if (!isTargetLanguageText(term)) return;
        const lookupTarget = this.captureLookupTarget();
        const sentence = anchor?.dataset.sentence || term;
        const previousNavigationEntry = options.previousNavigationEntry
            ?? this.lookupPreviousNavigationEntry(options.navigation);
        const card = await this.lookupCard(term, reading, lookupTarget).catch(() => null);
        if (!card) return;
        if (!this.isCurrentLookupTarget(lookupTarget)) return;
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
        if (!this.lookupTarget.isCurrentRender(requestId)) return;
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
        if (renderData.hydratePitchAccent) {
            void renderData.hydratePitchAccent().then(pitchAccent => {
                if (!this.isCurrentLookupRender(popover, requestId)) return;
                if (!card.pitchAccent.length && pitchAccent.length) card.pitchAccent = [...pitchAccent];
                if (renderedPitchKey === card.pitchAccent.join('|')) return;
                renderedPitchKey = card.pitchAccent.join('|');
                this.updateDeferredLookupPitch(popover, card, metaEntriesValue, currentAnkiLookup);
            }).catch(error => {
                log.debug('New-tab pitch hydration failed', { term: card.spelling, error });
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
        this.wanikaniSources.installDefinitionMounts(popover, card);
        this.refreshNewTabLookupHeader(popover, card, data);
    }

    private refreshNewTabLookupHeader(popover: HTMLElement, card: JPDBCard, data: CardRenderData & { loading: boolean }): void {
        const titleRow = popover.querySelector<HTMLElement>('.jpdb-reader-title-row');
        if (!titleRow) return;
        this.removeNewTabLookupTrailingReading(titleRow);
        this.refreshNewTabLookupMeta(titleRow, card, data);
    }

    private removeNewTabLookupTrailingReading(titleRow: HTMLElement): void {
        titleRow.querySelectorAll<HTMLElement>('.jpdb-reader-reading, .jpdb-reader-meta-reading')
            .forEach(reading => reading.remove());
    }

    private refreshNewTabLookupMeta(titleRow: HTMLElement, card: JPDBCard, data: CardRenderData & { loading: boolean }): void {
        const items = newTabLookupMetaItems({
            card,
            ankiLookup: data.ankiLookup,
            provider: apiSrsProviderViewForCard(card, this.settings, target => this.parser.isJpdbBackedCard(target)),
            providerState: this.newTabLookupJpdbState(card),
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
        updateRenderedPitch(popover, card, metaEntries, this.settings, name => this.dictionaryLabel(name));
    }

    private lookupPreviousNavigationEntry(navigation: CardNavigationMode | undefined): PopupNavigationEntry | undefined {
        if (navigation !== 'push-current') return undefined;
        return this.navigation.activeKanjiEntry() ?? this.navigation.activeWordEntry();
    }

    private async showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: NewTabKanjiLookupOptions = {}): Promise<void> {
        if (!targetCanLookupCharacter(kanji)) return;
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
        return `
            <div class="jpdb-reader-actions${kanjiLookupActionsClass(hasReviewTargetGutter)}" data-kanji-actions${kanjiLookupReviewAttributes(reviewButtons)}>
                ${renderKanjiLookupMiningGutter(hasReviewTargetGutter, this.text('showMiningActions'))}
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
        popover.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => this.handleKanjiLookupPopoverClick(event, popover, card, kanji, sentence)), { signal });
        popover.addEventListener('change', trustedReaderEventHandler((event: Event) => this.handleLookupReviewTargetChange(event, popover)), { signal });
    }

    private handleKanjiLookupPopoverClick(event: MouseEvent, popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string): void {
        const button = this.lookupPopoverActionButton(event, popover);
        if (!button) return;
        this.handleKanjiLookupAction(button, card, kanji, sentence);
    }

    private handleKanjiLookupAction(button: HTMLButtonElement, card: JPDBCard, kanji: string, sentence?: string): void {
        // A target switch can leave the old popover connected long enough for
        // one more delegated click. Make the stale surface inert before any
        // Japanese provider action is dispatched.
        if (!targetCanLookupCharacter(kanji)) return;
        if (this.dispatchKanjiLookupCommand(button, card, kanji, sentence)) return;
        this.handleLegacyKanjiLookupAction(button, card, sentence);
    }

    private dispatchKanjiLookupCommand(button: HTMLButtonElement, card: JPDBCard, kanji: string, sentence?: string): boolean {
        return dispatchPrivateCommand(button, {
            'kanji-lookup': command => { void this.showKanjiLookupCard(card, command.kanji, sentence, button, { navigation: 'push-current', reuseActivePopover: true }); },
            'jpdb-kanji-action': command => { void this.performJpdbKanjiAction(command.actionId, card, kanji, sentence, button); },
            'card-ui': () => this.toggleMiningControls(button),
            'card-action': command => { if (command.action === 'copy-word') void copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord'))); else if (command.action === 'grade') this.gradeLookupFromButton(button, command, card, sentence); },
            'kanji-word': command => { void this.lookupText(command.expression, command.reading || command.expression, button, { navigation: 'push-current', reuseActivePopover: true, userGesture: true }); },
            'jiten-kanji-words': command => { void runJitenKanjiWordsAction(button, command.action, this.jitenKanjiWordsActionContext()); },
        });
    }

    private handleLegacyKanjiLookupAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): void {
        const handlers: Record<string, () => void> = {
            'word-back': () => {
                void this.showLookupCard(card, sentence, button, { navigation: 'preserve', reuseActivePopover: true, autoPlay: false });
            },
            'kanji-history-back': () => {
                void this.showPreviousKanjiLookup(button);
            },
        };
        const handler = handlers[button.dataset.action ?? ''];
        if (handler) handler();
    }

    private jitenKanjiWordsActionContext(): JitenKanjiWordsActionContext | null {
        if (!usesJapaneseCharacterStudy() || !this.isJitenApiActive()) return null;
        return {
            lookupKanjiWords: (character, options) => this.jiten.lookupKanjiWords(character, options),
            language: () => this.settings.interfaceLanguage,
            afterRender: () => this.repositionLookupPopover(),
            onError: (details, error) => log.warn('Jiten kanji words lookup failed', details, error),
        };
    }

    private async renderKanjiLookupDetails(popover: HTMLElement, card: JPDBCard, kanji: string, requestId = this.lookupTarget.currentRenderRequest()): Promise<void> {
        if (!targetCanLookupCharacter(kanji) || !usesJapaneseProviders()) return;
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let jitenInfo: JitenKanjiInfo | null = null;
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        let sourceInfo: KanjiSourceInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        const practiceDoodle = this.kanjiCompanion?.installKanjiPracticeDoodle?.(popover, () => this.settings.interfaceLanguage, () => kanjiVGInfo)
            ?? noopKanjiPracticeDoodle();
        const detailPromises = this.kanjiLookupDetailPromises(kanji);
        this.wanikaniSources.installKanjiMount(popover, kanji);
        this.installKanjiLookupImmersionExamples(popover, kanji);

        const renderKeyword = () => {
            if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
            const mount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
            if (mount?.isConnected) setInnerHtml(mount, jitenInfo
                ? renderJitenKanjiKeywordLine(jitenInfo, rtkInfo, kanjiEntries, this.settings.interfaceLanguage, sourceInfo)
                : renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries, this.settings.interfaceLanguage, sourceInfo));
        };
        // Merge each provider's own KANJI frequency into the heading pills
        // (Jiten's kanji API rank, JPDB's "Top 300-400" band) once it arrives.
        const renderKanjiPillRanks = () => {
            if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
            const frequencyRanks = kanjiFrequencyRanks(kanji, jitenInfo?.frequencyRank, jpdbInfo?.frequency);
            if (!frequencyRanks.jiten && !frequencyRanks.jpdb) return;
            updateHeadingWordPills(popover, {
                card,
                jpdbUrl: `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`,
                settings: this.settings,
                metaEntries: [],
                overrideQuery: kanji,
                frequencyRanks,
                isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
                dictionaryLabel: name => this.dictionaryLabel(name),
            });
        };
        const renderRtk = () => {
            if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
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
            if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
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
            if (!kanjiVGInfo || !this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
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
                if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
                renderKeyword();
                renderKanjiPillRanks();
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
                if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
                renderKeyword();
                renderKanjiPillRanks();
                const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
                if (jpdbMount?.isConnected) setInnerHtml(jpdbMount, this.renderNewTabKanjiFactSources(jpdbInfo, jitenInfo));
            }),
            detailPromises.kanjiEntries.then(entries => {
                kanjiEntries = entries;
                if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
                renderKeyword();
                renderDefinitions();
                renderRtk();
            }),
            detailPromises.rtkInfo.then(info => {
                rtkInfo = info;
                if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
                renderKeyword();
                renderRtk();
            }),
            detailPromises.kanjiVGInfo.then(info => {
                kanjiVGInfo = info;
                if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
                renderKanjiVG();
                practiceDoodle.reassess();
            }),
            detailPromises.kanjiSourceInfo.then(info => {
                sourceInfo = info;
                renderKeyword();
            }),
        ]);
        if (!this.isCurrentKanjiLookupRender(popover, requestId, kanji)) return;
        this.renderKanjiLookupOrigins(popover, requestId, kanji, jpdbInfo, jitenInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        void this.parseNewTabContent(popover);
        this.repositionLookupPopover();
    }

    private kanjiLookupDetailPromises(kanji: string): KanjiLookupDetailPromises {
        if (!targetCanLookupCharacter(kanji) || !usesJapaneseProviders()) return emptyKanjiLookupDetailPromises();
        return {
            jpdbInfo: this.settings.jpdbKanjiEnabled
                ? this.lookupDetailWithTimeout(this.jpdbKanji.lookup(kanji), null, 'JPDB kanji lookup timed out.')
                : Promise.resolve(null),
            // Keyless requests ride the built-in edge proxy (the kanji endpoint is
            // on the shared-proxy allowlist), so no Jiten API credential is required.
            jitenInfo: this.settings.jpdbKanjiEnabled
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
            kanjiSourceInfo: this.kanjiOrigin?.lookup(kanji, this.settings) ?? Promise.resolve(null),
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
        sourceInfo: KanjiSourceInfo | null,
    ): void {
        if (!targetCanLookupCharacter(kanji)) return;
        const mount = this.kanjiLookupOriginMount(popover, requestId);
        if (!mount) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, renderKanjiOrigins(
            buildKanjiFacts(kanji, jpdbInfo, rtkInfo, this.settings.kanjivgEnabled ? kanjiVGInfo : null, kanjiEntries, sourceInfo),
            this.kanjiLookupOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo),
            sourceInfo,
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
        sourceInfo: KanjiSourceInfo | null,
    ): ReturnType<typeof buildKanjiOriginGraph> | null {
        return this.settings.kanjiOriginGraphEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo, kanjiVGInfo)
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
        if (!targetCanLookupCharacter(kanji) || !this.shouldRenderKanjiImmersionKit()) return;
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

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (!targetCanLookupCharacter(kanji) || !usesJapaneseProviders()) return;
        try {
            await this.jpdbKanji.performAction(actionId);
            if (!targetCanLookupCharacter(kanji) || !usesJapaneseProviders()) return;
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
        popover.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => this.handleLookupPopoverClick(event, popover, card, sentence, anchor)), { signal });
        popover.addEventListener('change', trustedReaderEventHandler((event: Event) => this.handleLookupReviewTargetChange(event, popover)), { signal });
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
        if (button.dataset.action === 'word-history-back') {
            void this.showPreviousLookupWord(button);
            return;
        }
        dispatchPrivateCommand(button, {
            'kanji-lookup': command => { void this.showKanjiLookupCard(card, command.kanji, sentence, button, { reuseActivePopover: true }); },
            'card-ui': command => this.handleLookupCardUiCommand(button, command.action, card, sentence),
            'card-action': command => this.handleLookupCardCommand(button, command, card, sentence, anchor),
        });
    }

    private handleLookupCardUiCommand(button: HTMLButtonElement, action: 'deck-picker' | 'mining-collapse' | 'review-target-toggle', card: JPDBCard, sentence: string | undefined): void {
        if (action === 'mining-collapse') return this.toggleMiningControls(button);
        if (action === 'review-target-toggle') return togglePopoverReviewTargetSelection(button);
        this.openDeckPickerForAdd(button, card, sentence);
    }

    private handleLookupCardCommand(button: HTMLButtonElement, command: CardCommandCapability, card: JPDBCard, sentence: string | undefined, anchor?: HTMLElement): void {
        if (command.action === 'grade') return this.gradeLookupFromButton(button, command, card, sentence, anchor);
        if (command.action !== 'add' || !this.openDeckPickerForAdd(button, card, sentence)) {
            void this.handleCardAction(button, card, sentence, anchor, command);
        }
    }

    private gradeLookupFromButton(button: HTMLButtonElement, command: CardCommandCapability, card?: JPDBCard, sentence?: string, anchor?: HTMLElement): void {
        if (command.grade) void this.gradeCurrentCardFromLookup(button, command.grade, newTabLookupReviewTargetSelection(button), card, sentence, anchor);
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
            const result = await this.newTab.gradeFromLookup(grade, target, card);
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
        return this.parser.getCachedCard(
            Number(renderedWordPrivateValue(word, 'vid')),
            Number(renderedWordPrivateValue(word, 'sid')),
        );
    }

    private lookupParsedWordWithoutCard(word: HTMLElement, expression: string): void {
        if (!isTargetLanguageText(expression)) return;
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
        return openDeckPickerForCardAdd(button, card, sentence, async (actionButton, actionCard, actionSentence, command) => {
            await this.handleCardAction(actionButton, actionCard, actionSentence, undefined, command);
        });
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement, suppliedCommand?: CardCommandCapability): Promise<void> {
        if (button.disabled) return;
        const command = runtimeCardCommand(button, suppliedCommand);
        if (!command) return;
        const action = command.action;
        const done = log.time('newTabCardAction', { action, term: card.spelling });
        await runCardActionOperation(
            button,
            () => refreshAfterCardAction(
                command.action,
                () => this.cardActions.perform(command, button, card, sentence),
                () => this.dismissLookupPopover(),
                () => this.showLookupCard(card, sentence, anchor, { navigation: 'preserve', reuseActivePopover: true, autoPlay: false }),
            ),
            error => reportCardActionFailure({ logger: log, warning: 'New tab card action failed', action, term: card.spelling, language: this.settings.interfaceLanguage, toast: message => this.toast(message) }, error),
            done,
        );
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

    private async lookupCard(
        term: string,
        reading: string,
        lookupTarget = this.captureLookupTarget(),
    ): Promise<JPDBCard> {
        return this.targetLookup.lookup(term, reading, lookupTarget);
    }

    private publicLookupFallbackCards(cards: readonly JPDBCard[], options: { jpdbPublicLookup?: boolean } = {}): Promise<Map<string, JPDBCard>> {
        return this.targetLookup.publicFallbackCards(cards, options);
    }

    private mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement, options: NewTabLookupDisplayOptions = {}): void {
        this.activeLookupHandlerController?.abort();
        this.activeLookupHandlerController = undefined;
        this.lookupModal.release(Boolean(this.activeLookupPopover?.isConnected));
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        const stackOverSettings = Boolean(options.stackOverSettings && this.activeDialog?.classList.contains('jpdb-reader-settings') && this.activeDialog.isConnected);
        if (stackOverSettings) forceReaderPopoverSurface(popover, this.settings);
        const useBackdrop = !stackOverSettings && !popover.classList.contains('jpdb-reader-sheet');
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
        this.lookupModal.activate(popover, anchor);
        popover.focus({ preventScroll: true });
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
        this.lookupModal.release();
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
        bunproDefinitionInfo: import('../bunpro/definition').BunproDefinitionInfo | null = null,
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
            bunproDefinitionInfo,
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
            sections.push(renderJpdbKanjiInfo(jpdbInfo, this.settings.interfaceLanguage, this.dictionarySourceState.isOpen(jpdbKey), jpdbKey, definitionSourceLabel(this.settings, JPDB_DEFINITION_SOURCE_ID, kanjiFactProviderTitle('jpdb'))));
        }
        if (jitenInfo) {
            const jitenKey = `${jpdbKey}:jiten`;
            sections.push(renderJitenKanjiInfo(jitenInfo, this.settings.interfaceLanguage, this.dictionarySourceState.isOpen(jitenKey), jitenKey, definitionSourceLabel(this.settings, JITEN_DEFINITION_SOURCE_ID, kanjiFactProviderTitle('jiten'))));
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
        const target = this.captureLookupTarget();
        if (!usesJapaneseProviders() || !this.settings.showPitchAccent) return;
        // Public pitch enrichment is keyless — don't gate it on a JPDB API key, or
        // Jiten-only / no-key readers never get pitch underlines.
        const uniqueTokens = this.uniqueTokens(
            tokens,
            token => cardUsesPitchAccentPronunciation(token.card)
                && !token.card.pitchAccent.length
                && Boolean(token.card.spelling.trim()),
            limit,
        );

        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            if (!this.isCurrentLookupTarget(target) || !usesJapaneseProviders()) return;
            const pitchAccent = await this.jpdbPublicPitch.lookup(token.card.spelling, token.card.reading).catch(() => []);
            if (!this.isCurrentLookupTarget(target) || !usesJapaneseProviders() || !pitchAccent.length) return;
            if (!token.card.pitchAccent.length) token.card.pitchAccent = pitchAccent;
            this.applyPitchAccentToRenderedWords(token.card);
        });
    }

    private async enrichPublicVocabularyWords(
        tokens: JPDBToken[],
        limit = NEW_TAB_PITCH_ENRICHMENT_LIMIT,
        options: { preserveMissingFallbacks?: boolean } = {},
    ): Promise<void> {
        const target = this.captureLookupTarget();
        if (!usesJapaneseProviders() || (!this.settings.jpdbDefinitionsEnabled && !this.settings.showPitchAccent)) return;
        const uniqueTokens = this.uniqueTokens(
            tokens,
            token => token.card.source === 'fallback',
            limit,
        );
        const resolvedCards = await this.publicLookupFallbackCards(uniqueTokens.map(token => token.card), { jpdbPublicLookup: false });
        if (!this.isCurrentLookupTarget(target) || !usesJapaneseProviders()) return;

        await runLimited(uniqueTokens, NEW_TAB_BACKGROUND_ENRICHMENT_CONCURRENCY, async token => {
            const card = resolvedCards.get(cardKey(token.card));
            if (!card) {
                if (!options.preserveMissingFallbacks) this.unwrapRenderedFallbackWords(token.card);
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
        const targetRoots = roots?.length ? roots : (this.activeLookupPopover ? [this.activeLookupPopover] : []);
        targetRoots.forEach(root => {
            this.renderedWordsForCard(root, card).forEach(word => {
                if (!ankiLookup.primary && ankiLookup.trusted === false) return;
                applyAnkiLookupToRenderedWord(word, ankiLookup, this.settings.interfaceLanguage);
            });
        });
    }

    private applyPitchAccentToRenderedWords(card: JPDBCard): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (!pitchClass) return;
        this.renderedWordsForCard(this.activeLookupPopover, card).forEach(word => {
            setRenderedWordPitchClass(word, pitchClass);
        });
    }

    private applyPublicVocabularyToRenderedWords(fallback: JPDBCard, card: JPDBCard): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        this.renderedWordsForCard(document, fallback).forEach(word => {
            setRenderedWordPitchClass(word, pitchClass);
            setRenderedWordCardIdentity(word, card);
            applyPublicVocabularyFurigana(word, card, this.settings);
        });
    }

    private unwrapRenderedFallbackWords(card: JPDBCard): void {
        this.renderedWordsForCard(document, card).forEach(word => {
            const parent = word.parentNode;
            word.replaceWith(document.createTextNode(readerWordSurfaceText(word)));
            parent?.normalize();
        });
    }

    private renderedWordsForCard(root: ParentNode | null | undefined, card: JPDBCard): HTMLElement[] {
        if (!root) return [];
        const key = renderedWordCardKey(card.vid, card.sid);
        return renderedWordsInRoot(root).filter(word => renderedWordElementKey(word) === key);
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

    private applyInterfaceLocale(settings = this.settings): void {
        const locale = resolveInterfaceLocale(settings.interfaceLanguage, {
            browserLocales: typeof navigator === 'undefined'
                ? []
                : [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language],
        }).locale;
        if (this.options.mountHost) applyInterfaceLocaleToRoot(this.options.mountHost, locale);
        else applyInterfaceLocaleToDocument(document, locale);
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
        if (!root.isConnected) return;
        void yomuSettingsSurfaceCompanion()?.installDefinitionTranslationBehaviors(root, this.settings);
        if (!this.parser.canParse()) return;
        installProviderExampleBehaviors(root, {
            interfaceLanguage: this.settings.interfaceLanguage,
            outputLanguage: outputLanguageOf(this.settings),
            blurTranslations: this.settings.immersionKitRevealTranslationOnClick,
            translate: translateJapaneseSentence,
            isCurrentRoot: candidate => candidate.isConnected,
        });
        this.enrichJpdbRelatedWords(root);
        const plan = nestedTextParsePlan(root, 160, { excludeProviderExamples: true });
        if (plan && !nestedParseAlreadyScheduled(root, plan.parseKey)) {
            await this.parseNewTabPlan(root, plan, options);
        }
        if (!root.isConnected) return;
        const providerPlan = providerExampleTextParsePlan(root, 24);
        if (providerPlan && !nestedParseAlreadyScheduled(root, providerPlan.parseKey)) {
            await this.parseNewTabPlan(root, providerPlan, options, 24, false);
        }
    }

    private async parseNewTabPlan(
        root: HTMLElement,
        plan: NestedParsePlan,
        options: NewTabParseContentOptions,
        publicJitenDetailLimit?: number,
        recordParseKey = true,
    ): Promise<void> {
        const parseLoadingId = `${Date.now()}:${Math.random()}`;
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        root.dataset.jpdbReaderParseLoadingId = parseLoadingId;
        try {
            const parsed = await this.loadParsedNewTabContent(plan.targets.map(target => target.text), options, publicJitenDetailLimit);
            if (!root.isConnected
                || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey
                || root.dataset.jpdbReaderParseLoadingId !== parseLoadingId) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            highlightCardTargetScopes(root);
            if (recordParseKey) root.dataset.jpdbReaderParseKey = plan.parseKey;
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

    private loadParsedNewTabContent(texts: string[], options: NewTabParseContentOptions = {}, publicJitenDetailLimit?: number): Promise<JPDBToken[][]> {
        return this.parseContentCache.load(texts, options, publicJitenDetailLimit);
    }

    private async parseSettingsJapanese(form: HTMLFormElement): Promise<void> {
        if (!this.isCurrentSettingsRoot(form)) return;
        const enhancement = yomuSettingsSurfaceCompanion()?.selfEnhancement;
        if (!enhancement || enhancement.nestedSettingsParseAlreadyRendered(form)) return;
        if (form.dataset.yomuSettingsSelfEnhancing === 'true') {
            form.dataset.yomuSettingsSelfEnhancePending = 'true';
            return;
        }
        form.dataset.yomuSettingsSelfEnhancing = 'true';
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.parser.canParse()) {
            delete form.dataset.yomuSettingsSelfEnhancing;
            return;
        }
        const plan = enhancement.nestedSettingsTextParsePlan(
            form,
            enhancement.SETTINGS_PARSE_TARGET_LIMIT,
        );
        if (!plan) {
            delete form.dataset.yomuSettingsSelfEnhancing;
            return;
        }
        if (nestedParseAlreadyScheduled(form, plan.parseKey)) {
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
            if (!this.isCurrentSettingsRoot(form)
                || form.dataset.jpdbReaderParseLoadingKey !== plan.parseKey
                || form.dataset.jpdbReaderParseLoadingId !== parseLoadingId) return;
            const currentPlan = enhancement.nestedSettingsTextParsePlan(
                form,
                enhancement.SETTINGS_PARSE_TARGET_LIMIT,
            );
            if (!currentPlan) return;
            const currentParsed = enhancement.supplementSettingsFallbackTokens(
                currentPlan.targets,
                enhancement.parsedSettingsTargetsForCurrentPlan(plan, parsed, currentPlan),
            );
            await this.hydrateSettingsFallbackTokens(currentParsed);
            const latestPlan = enhancement.nestedSettingsTextParsePlan(
                form,
                enhancement.SETTINGS_PARSE_TARGET_LIMIT,
            );
            if (!latestPlan) return;
            const latestParsed = enhancement.supplementSettingsFallbackTokens(
                latestPlan.targets,
                enhancement.parsedSettingsTargetsForCurrentPlan(currentPlan, currentParsed, latestPlan),
            );
            const renderSettings = enhancement.settingsForSettingsFormParse(form, this.settings);
            applyNestedParsePlan(latestPlan, latestParsed, renderSettings);
            enhancement.addSettingsRubyFromRenderedReadings(form, renderSettings);
            highlightCardTargetScopes(form);
            refreshReaderWordContrast(form);
            form.dataset.jpdbReaderParseKey = latestPlan.parseKey;
            form.dataset.yomuSettingsSelfEnhanced = 'true';
            const tokens = latestParsed.flat();
            void this.enrichPublicVocabularyWords(tokens, NEW_TAB_SETTINGS_PUBLIC_VOCABULARY_LIMIT, { preserveMissingFallbacks: true });
            void this.enrichPitchWords(tokens, NEW_TAB_SETTINGS_ENRICHMENT_LIMIT);
            if (latestPlan.targets.length >= enhancement.SETTINGS_PARSE_TARGET_LIMIT) {
                window.setTimeout(() => void this.parseSettingsJapanese(form), 0);
            }
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
        const target = this.captureLookupTarget();
        if (!usesJapaneseProviders()) return;
        const tokens = this.uniqueTokens(
            parsed.flat(),
            token => token.card.source === 'fallback',
            NEW_TAB_SETTINGS_PUBLIC_VOCABULARY_LIMIT,
        );
        const resolvedCards = await this.publicLookupFallbackCards(tokens.map(token => token.card), { jpdbPublicLookup: false });
        if (!this.isCurrentLookupTarget(target) || !usesJapaneseProviders()) return;
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

function kanjiLookupActionsClass(hasReviewTargetGutter: boolean): string {
    return hasReviewTargetGutter ? ' jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed' : '';
}

function runtimeCardCommand(button: HTMLButtonElement, supplied: CardCommandCapability | undefined): CardCommandCapability | undefined {
    return supplied ?? readCardCommandCapability(button);
}

function kanjiLookupReviewAttributes(reviewButtons: string): string {
    return reviewButtons ? ' data-kanji-has-review="true"' : ' data-kanji-has-review="false" hidden';
}

function renderKanjiLookupMiningGutter(hasReviewTargetGutter: boolean, label: string): string {
    if (hasReviewTargetGutter) return '';
    return `<div class="jpdb-reader-actions-gutter" hidden>
        <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse"${privateCommandAttributes({ kind: 'card-ui', action: 'mining-collapse' })} aria-expanded="false" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></button>
    </div>`;
}

function markNewTabRuntime(): void {
    (window as YomuNewTabWindow).__YOMU_READER_RUNTIME__ = 'newtab';
}

function refreshableNoop(): { refresh: () => void } {
    return { refresh: () => undefined };
}
