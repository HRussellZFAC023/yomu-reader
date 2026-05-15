import { AudioPlayer } from './audio';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from './app-pages';
import { renderAnkiActionRow, renderAnkiExistingSection, renderReviewButtons } from './anki-render';
import { AnkiConnectClient, captureActiveVideoFrame, type AnkiLookupResult } from './anki';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { normalizeCardStates, primaryCardState } from './card-state';
import { cardKey, waitForInstantData } from './card-utils';
import { APP_NAME, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, NEW_TAB_PAGE_URL, STUDY_GRAMMAR_SOURCE_ID, STUDY_TOOLS_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, VIDEO_PLAYER_PAGE_URL } from './constants';
import {
    HAS_JAPANESE,
    appendToDocumentHead,
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    documentHasJapaneseText,
    collectTextTargetsIn,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    nearestReadableSentenceForElement,
    renderTokensToHtml,
    setInnerHtml,
    unwrapReaderWords,
    type ScanTextTarget,
} from './dom';
import {
    definitionSourceStateKey,
    kanjiSourceStateKey,
    localDictionaryStateKey,
    renderFrequencyPills,
    renderJpdbDefinitionSource,
    renderKanjiDefinitions,
    renderLocalDefinitionSourcesSection,
    renderSimilarKanjiWordsContent,
    renderSimilarKanjiWordsShell,
} from './definition-source-render';
import { ImmersionKitClient } from './immersion-kit';
import { isUsefulImmersionPreloadQuery } from './immersion-query';
import { ImmersionPopoverController } from './immersion-popover-controller';
import { FloatingButtonController } from './floating-button';
import { detectHanabiraGrammarHints } from './hanabira-grammar';
import { JpdbClient } from './jpdb';
import { JpdbExtensionsController, installUchisenCarousel, loadUchisenImages } from './jpdb-extensions';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { createJpdbReviewBridgeClient, initJpdbReviewPageBridge } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient, type KanjiSourceInfo } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { installKanjiGraphDrag } from './kanji-graph-drag';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    formatLookupUrl,
    pillStyle,
} from './local-dictionary-display';
import {
    inferMiningSourceKind,
    loadMiningContext,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationInsideReaderRoot, mutationMayContainJapaneseText, mutationTouchesAsbPlayer } from './mutation-scan';
import { NewTabController } from './new-tab-controller';
import { resolveUiLanguage, uiText } from './i18n';
import { OnboardingController } from './onboarding';
import { ImageOcrController } from './ocr';
import {
    caretTextPositionFromPoint,
    isLowValuePointerText,
    japaneseRunAt,
    pointerTextCharacterOffset,
    type ActivePointerTextLookup,
    type PointerTextLookup,
} from './pointer-text-lookup';
import { createReaderBackdrop, createReaderPopover, installSheetHandle, placePopoverAtViewportPosition, popoverMaxHeightSetting } from './popover-shell';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import {
    buildRtkComponentSummaries,
    copyIcon,
    externalLinkIcon,
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
    renderSpellingForKanjiNavigation,
    speakerIcon,
    uniqueKanji,
} from './popup-render';
import { RtkClient, type RtkInfo } from './rtk';
import { ReaderParser, fallbackLookupTermAtOffset } from './reader-parser';
import {
    DEFAULT_SETTINGS,
    accentToRgba,
    applyUrlBootstrapSettings,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    effectiveWordHighlightMode,
    loadSettings,
    matchesShortcut,
    sanitizeAccentColor,
    saveSettings,
    shortcutIsPressed,
} from './settings';
import { SettingsDialogController } from './settings-dialog-controller';
import { collectScanTargets, collectSiteScanTargets } from './site-parsers';
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
import {
    clearManagedStoredValues,
    createFactoryResetSignal,
    publishFactoryResetSignal,
    subscribeToFactoryResetSignals,
    type FactoryResetSignal,
    type FactoryResetSignalSource,
} from './storage';
import { READER_CSS } from './styles';
import { detectGrammarHints, mergeGrammarHints, renderGrammarHints, translateJapaneseSentence, type GrammarHint } from './study-tools';
import { SubtitlePlayerController } from './subtitles';
import type { InterfaceLanguage, JPDBCard, JPDBDeck, JPDBGrade, JPDBToken, ReaderColorSource, ReaderSettings } from './types';
import { YoutubeImmersionFilter } from './youtube';
import {
    YomitanDictionaryStore,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const log = Logger.scope('ReaderApp');
const LOCAL_DICTIONARIES_SOURCE_ID = '__local_dictionaries__';
const CARD_RENDER_DATA_CACHE_TTL_MS = 30_000;
const CARD_RENDER_DETAIL_TIMEOUT_MS = 9_000;
const FACTORY_RESET_PREPARE_DELAY_MS = 80;
const INSTANT_DICTIONARY_RENDER_WAIT_MS = 120;
const TERM_AUDIO_PRELOAD_LIMIT = 8;
const NEARBY_TERM_AUDIO_PRELOAD_LIMIT = 6;
const COLOR_SOURCE_CLASSES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];
const COLOR_CHANNELS = ['highlight', 'underline', 'text'] as const;
type ColorChannel = typeof COLOR_CHANNELS[number];
type ReviewShortcutKey = keyof ReaderSettings['shortcuts'];

const TWO_BUTTON_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeFail', 'fail'],
    ['gradePass', 'pass'],
];

const FIVE_BUTTON_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeNothing', 'nothing'],
    ['gradeSomething', 'something'],
    ['gradeHard', 'hard'],
    ['gradeOkay', 'okay'],
    ['gradeEasy', 'easy'],
];

function matchedReviewShortcutGrade(
    event: KeyboardEvent,
    shortcuts: ReaderSettings['shortcuts'],
    candidates: Array<[ReviewShortcutKey, JPDBGrade]>,
): JPDBGrade | null {
    return candidates.find(([key]) => matchesShortcut(event, shortcuts[key]))?.[1] ?? null;
}

interface MiningActionState {
    isNeverForget: boolean;
    isBlacklisted: boolean;
    neverForgetTitle: string;
    blacklistTitle: string;
    neverForgetLabel: string;
    blacklistLabel: string;
}

function miningActionState(cardStates: ReturnType<typeof normalizeCardStates>, language: InterfaceLanguage): MiningActionState {
    const isNeverForget = cardStates.includes('never-forget');
    const isBlacklisted = cardStates.includes('blacklisted');
    return {
        isNeverForget,
        isBlacklisted,
        neverForgetTitle: isNeverForget ? uiText(language, 'forgetHint') : uiText(language, 'neverHint'),
        blacklistTitle: isBlacklisted ? uiText(language, 'unlistHint') : uiText(language, 'blacklistHint'),
        neverForgetLabel: isNeverForget ? uiText(language, 'forget') : uiText(language, 'never'),
        blacklistLabel: isBlacklisted ? uiText(language, 'unlist') : uiText(language, 'blacklist'),
    };
}

function addDeckChoiceOption(
    options: Array<[string, string]>,
    source: 'jpdb' | 'anki',
    value: string,
    label: string,
): void {
    const normalizedValue = value.trim();
    const key = `${source}:${normalizedValue}`;
    if (!normalizedValue || options.some(([existing]) => existing === key)) return;
    options.push([key, label]);
}

function renderDeckChoiceOption([value, label]: [string, string]): string {
    const [source, ...idParts] = value.split(':');
    const deckId = idParts.join(':');
    return `<option value="${escapeHtml(value)}" data-deck-source="${escapeHtml(source)}" data-deck-id="${escapeHtml(deckId)}">${escapeHtml(label)}</option>`;
}

function normalizedLookupText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function isLookupableJapaneseText(text: string): boolean {
    return Boolean(text && HAS_JAPANESE.test(text));
}

function dictionaryLookupLink(target: EventTarget | null): HTMLAnchorElement | null {
    return (target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]') ?? null;
}

function dictionaryLookupQuery(link: HTMLAnchorElement): string {
    return normalizedLookupText(link.dataset.dictionaryLookup ?? '');
}

function lookupCandidateSentence(text: string): string {
    const sentence = normalizedLookupText(text);
    return isLookupableJapaneseText(sentence) ? sentence : '';
}

function connectedElement<T extends HTMLElement>(element: T | undefined): T | undefined {
    return element?.isConnected ? element : undefined;
}

function hasVisibleAutoScanTargets(): boolean {
    return (collectSiteScanTargets(1)?.length ?? 0) > 0 || collectVisibleTextTargets(1).length > 0;
}

function hasPressLookupEnabled(settings: ReaderSettings): boolean {
    return settings.lookupOnClick || settings.lookupOnHover;
}

function isMousePointerEvent(event: MouseEvent | PointerEvent): boolean {
    return !('pointerType' in event) || event.pointerType === 'mouse';
}

function eventElement(event: Event): Element | null {
    return event.target instanceof Element ? event.target : null;
}

function audioPreloadLimits(options: { sourceLimit?: number; candidateLimit?: number }): { sourceLimit: number; candidateLimit: number } {
    return {
        sourceLimit: options.sourceLimit ?? 1,
        candidateLimit: options.candidateLimit ?? 1,
    };
}

function shouldPauseVideoForSubtitleHover(word: HTMLElement, settings: ReaderSettings): boolean {
    return settings.subtitleMiningPause && Boolean(word.closest('.jpdb-subtitle-player'));
}

function cardDisplayTrigger(options: CardDisplayOptions): 'modal' | 'hover' {
    return options.trigger === 'hover' ? 'hover' : 'modal';
}

function cardSourceLabel(card: JPDBCard): string {
    return card.source ?? 'jpdb';
}

function renderedWordNavigationMode(insideReaderPopup: boolean, trigger: 'modal' | 'hover'): CardNavigationMode {
    return insideReaderPopup && trigger === 'modal' ? 'push-current' : 'reset';
}

function renderedWordAnchor(
    word: HTMLElement,
    insideReaderPopup: boolean,
    activePopoverAnchor: HTMLElement | undefined,
): HTMLElement | undefined {
    return insideReaderPopup ? activePopoverAnchor ?? undefined : word;
}

function popoverAnchorRect(anchor: HTMLElement | undefined, fallback: DOMRect | undefined): DOMRect | undefined {
    const rect = anchor?.getBoundingClientRect();
    return rect && (rect.width > 0 || rect.height > 0) ? rect : fallback;
}

function shouldLockMountedPopoverPosition(popover: HTMLElement, state: PopoverMountState): boolean {
    return state.mode !== 'hover'
        && !popover.classList.contains('jpdb-reader-sheet')
        && Boolean(state.previousPopoverRect);
}

function mountedHoverPointerPosition(
    state: PopoverMountState,
    lastPointerPosition: { x: number; y: number } | undefined,
): { x: number; y: number } | undefined {
    const hoverPointerPosition = state.previousHoverPointerPosition ?? lastPointerPosition;
    return state.mode === 'hover' && hoverPointerPosition ? { ...hoverPointerPosition } : undefined;
}

function newTabNestedParsePlan(root: HTMLElement): NestedParsePlan | null {
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-parseable'))
        .flatMap(parseRoot => collectFragmentTextTargetsIn(parseRoot, 36, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 }))
        .slice(0, 36);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

function popoverNestedParsePlan(popover: HTMLElement): NestedParsePlan | null {
    const targets = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-parseable'))
        .flatMap(root => collectFragmentTextTargetsIn(root, 24, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 }))
        .slice(0, 24);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

function nestedParseKey(targets: ScanTextTarget[]): string {
    return targets.map(target => target.text).join('\n\n');
}

function nestedParseAlreadyScheduled(root: HTMLElement, parseKey: string): boolean {
    return root.dataset.jpdbReaderParseKey === parseKey
        || root.dataset.jpdbReaderParseLoadingKey === parseKey;
}

function applyNestedParsePlan(plan: NestedParsePlan, parsed: JPDBToken[][], settings: ReaderSettings): void {
    plan.targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], settings));
}

function clearNestedParseLoadingKey(root: HTMLElement, parseKey: string): void {
    if (root.dataset.jpdbReaderParseLoadingKey === parseKey) delete root.dataset.jpdbReaderParseLoadingKey;
}

interface KanjiDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
    kanjiVGInfo: Promise<KanjiVGInfo | null>;
}

interface CardNavigationEntry {
    card: JPDBCard;
    sentence?: string;
}

type CardNavigationMode = 'reset' | 'preserve' | 'push-current';

interface KanjiNavigationEntry extends CardNavigationEntry {
    kanji: string;
}

type PopupNavigationEntry =
    | (CardNavigationEntry & { kind: 'word' })
    | (KanjiNavigationEntry & { kind: 'kanji' });

interface CardDisplayOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    hoverLookupKey?: string;
    hoverLookupGeneration?: number;
    pointerTextLookup?: ActivePointerTextLookup;
    insideReaderPopup?: boolean;
}

type PointerTextDisplayOptions = Pick<CardDisplayOptions, 'navigation' | 'preservePosition' | 'hoverLookupGeneration'>;
type LocalPointerTextEntryMatch = { entry: YomitanTermEntry; start: number; end: number };

function canSchedulePointerTextHoverLookup(hoverEnabled: boolean, candidate: PointerTextLookup | null): candidate is PointerTextLookup {
    return hoverEnabled && Boolean(candidate);
}

function samePointerTextLookupTarget(active: ActivePointerTextLookup, candidate: PointerTextLookup): boolean {
    return active.anchor === candidate.anchor && active.text === candidate.text;
}

function pointerOffsetInsideLookup(active: ActivePointerTextLookup, offset: number): boolean {
    return (active.start <= offset && offset < active.end)
        || (active.start < offset && offset <= active.end);
}

interface RenderedWordDisplayContext {
    sentence?: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    hoverLookupKey?: string;
    previousNavigationEntry?: PopupNavigationEntry;
    insideReaderPopup: boolean;
}

interface TextLookupOptions {
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    anchor?: HTMLElement;
}

interface TextLookupDisplayContext {
    selected: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    preservePosition: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
}

interface PressLookupState {
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    source: 'primary' | 'middle';
    captureTarget?: Element;
    lastWord?: HTMLElement;
}

interface MiningControlsDrag {
    pointerId: number;
    startY: number;
    lastY: number;
    moved: boolean;
    button: HTMLButtonElement;
}

interface CardRenderData {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup: AnkiLookupResult;
    jpdbDecks: JPDBDeck[];
    ankiDecks: string[];
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
}

interface CardRenderDataLoad {
    localEntries: Promise<YomitanTermEntry[]>;
    all: Promise<CardRenderData>;
}

interface CardPopoverRenderView {
    cardStates: ReturnType<typeof normalizeCardStates>;
    state: ReturnType<typeof primaryCardState>;
    storedContext: ReturnType<typeof loadMiningContext> | null;
    jpdbUrl: string;
    cardPos: string;
    cardPosDetails: string;
    language: InterfaceLanguage;
    hasJpdb: boolean;
    miningActions: string;
    ankiActions: string;
    reviewButtons: string;
    metaItems: string[];
    loadingDetails: string;
}

interface WordPillContext {
    query: string;
    word: string;
    reading: string;
    vid: string;
    sid: string;
}

interface MountedCardShell {
    instantLocalEntries: YomitanTermEntry[] | null;
    requestId: number;
}

interface StudyTranslationResult {
    tokens: JPDBToken[];
    translated: string;
}

interface NestedParsePlan {
    targets: ScanTextTarget[];
    parseKey: string;
}

interface MountPopoverOptions {
    mode?: 'modal' | 'hover';
    preservePosition?: boolean;
    hoverLookupKey?: string;
    pointerTextLookup?: ActivePointerTextLookup;
}

interface PopoverMountState {
    mode: 'modal' | 'hover';
    backdrop?: HTMLElement;
    resolvedAnchor?: HTMLElement;
    anchorRect?: DOMRect;
    previousPopoverRect?: DOMRect;
    previousHoverPointerPosition?: { x: number; y: number };
}

interface ModalNavigationOptions {
    backAction: string;
    backTitle: string;
    label: string;
    controlsHtml?: string;
}

interface ReaderAppInitOptions {
    isDemo?: boolean;
    showWelcome?: boolean;
}

export class ReaderApp {
    private abortController = new AbortController();
    public isDemo = false;
    private isDestroyed = false;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private setImmersionTranslationBlurred = (blurred: boolean): void => {
        if (this.settings.immersionKitRevealTranslationOnClick === blurred) return;
        this.settings = {
            ...this.settings,
            immersionKitRevealTranslationOnClick: blurred,
        };
        document.querySelectorAll<HTMLInputElement>('input[name="immersionKitRevealTranslationOnClick"]').forEach(input => {
            input.checked = blurred;
        });
        void saveSettings(this.settings);
        log.debug('Immersion Kit translation blur preference updated', { blurred });
    };
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient();
    private jpdbPublicPitch = new JpdbPublicPitchClient();
    private jpdbVocabulary = new JpdbVocabularyClient();
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private jpdbReviewBridge = createJpdbReviewBridgeClient();
    private dictionaries = new YomitanDictionaryStore();
    private cardActions = new CardActionController({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        anki: this.anki,
        dictionaries: this.dictionaries,
        isJpdbBackedCard: card => this.isJpdbBackedCard(card),
        resolveMiningContext: (card, sentence) => this.resolveMiningContext(card, sentence),
        showCard: (card, sentence, anchor, options) => this.showCard(card, sentence, anchor, options),
        getActivePopoverAnchor: () => this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
        getActivePopoverMode: () => this.activePopoverMode,
        showSettings: panel => this.showSettings(panel),
        playAudio: card => this.playAudio(card),
        playSentenceAudio: sentence => this.playSentenceAudio(sentence),
        detectGrammarHints: sentence => this.detectStudyGrammarHints(sentence),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        toast: message => this.toast(message),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: paragraphs => this.parseJapanese(paragraphs),
        canParseJapanese: () => this.canParseJapanese(),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        repositionPopover: () => this.repositionActivePopover(),
        setImmersionTranslationBlurred: this.setImmersionTranslationBlurred,
        toast: message => this.toast(message),
    });
    private floatingButton = new FloatingButtonController();
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });
    private newTab = new NewTabController({
        getSettings: () => this.settings,
        anki: this.anki,
        jpdb: this.jpdb,
        jpdbKanji: this.jpdbKanji,
        kanjiVG: this.kanjiVG,
        rtk: this.rtk,
        immersionKit: this.immersionKit,
        jpdbReviewBridge: this.jpdbReviewBridge,
        parser: this.parser,
        dictionaries: this.dictionaries,
        ensureStarterDictionary: onProgress => this.settingsDialog.ensureStarterDictionaryInstalled(onProgress),
        lookupText: (text, sentence, anchor) => this.lookupText(text, sentence, { anchor }),
        lookupDictionaryReference: (query, reading, sourceDictionary, anchor) => this.lookupDictionaryReference(query, reading, sourceDictionary, anchor, 'modal'),
        showKanjiCard: (card, kanji, sentence, anchor) => this.showKanjiCard(card, kanji, sentence, anchor),
        parseContent: root => this.parseNewTabContent(root),
        setImmersionTranslationBlurred: this.setImmersionTranslationBlurred,
        onSettingsChange: () => saveSettings(this.settings),
        applyTheme: () => this.applyTheme(),
        showSettings: panel => this.showSettings(panel),
        dismiss: options => this.dismiss(options),
    });
    private jpdbExtensions = new JpdbExtensionsController({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        immersionKit: this.immersionKit,
        jpdbKanji: this.jpdbKanji,
        rtk: this.rtk,
        audio: this.audio,
        parseJapanese: paragraphs => this.parseJapanese(paragraphs),
        setImmersionTranslationBlurred: this.setImmersionTranslationBlurred,
    });
    private onboarding = new OnboardingController({
        getSettings: () => this.settings,
        setSettings: settings => {
            this.settings = settings;
            this.applyTheme();
        },
        showSettings: panel => this.showSettings(panel),
    });
    private subtitles = new SubtitlePlayerController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onSettingsChange: () => void saveSettings(this.settings),
    });
    private ocr = new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onLookup: (text, sentence) => this.lookupText(text, sentence),
        onToast: message => this.toast(message),
        shouldAutoScan: () => this.pageHasJapaneseText,
    });
    private youtube = new YoutubeImmersionFilter({
        getSettings: () => this.settings,
        setEnabled: enabled => void this.setYoutubeImmersionEnabled(enabled),
    });
    private settingsDialog = new SettingsDialogController({
        getSettings: () => this.settings,
        setSettings: settings => { this.settings = settings; },
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
        anki: this.anki,
        audio: this.audio,
        subtitles: this.subtitles,
        ocr: this.ocr,
        youtube: this.youtube,
        jpdbExtensions: this.jpdbExtensions,
        createBackdrop: () => createReaderBackdrop(() => this.dismiss()),
        mountDialog: (backdrop, form) => this.mountSettingsDialog(backdrop, form),
        dismiss: () => this.dismiss(),
        toast: message => this.toast(message),
        applyTheme: () => this.applyTheme(),
        applyAccentColor: color => this.applyAccentColor(color),
        applyWordColors: settings => this.applyWordColors(settings),
        installFab: () => this.installFab(),
        refreshDictionaryStyles: () => this.refreshDictionaryStyles(),
        scheduleDictionaryRescan: () => this.scheduleDictionaryRescan(),
        refreshNewTabIfCurrent: () => {
            if (this.newTab.isCurrentPage()) void this.newTab.renderPage();
        },
        clearDictionarySourceOpenOverrides: () => this.dictionarySourceOpenOverrides.clear(),
        beginSettingsPreview: (accent, language, theme) => {
            this.settingsPreviewOriginalAccent = accent;
            this.settingsPreviewOriginalLanguage = language;
            this.settingsPreviewOriginalTheme = theme;
        },
        clearSettingsPreview: () => {
            this.settingsPreviewOriginalAccent = undefined;
            this.settingsPreviewOriginalLanguage = undefined;
            this.settingsPreviewOriginalTheme = undefined;
        },
    });
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private lastCard?: JPDBCard;
    private lastCardSentence?: string;
    private lastAnkiLookup?: AnkiLookupResult;
    private selectionTimer?: number;
    private autoScanTimer?: number;
    private autoScanDeadline = 0;
    private autoScanObserver?: MutationObserver;
    private visiblePageScanInFlight = false;
    private asbScanTimer?: number;
    private hoverLookupTimer?: number;
    private hoverCloseTimer?: number;
    private hoverWatchTimer?: number;
    private hoverPendingWord?: HTMLElement;
    private hoverPendingLookupKey = '';
    private hoverLookupInFlightKey = '';
    private hoverLookupGeneration = 0;
    private activeHoverWord?: HTMLElement;
    private activeHoverLookupKey = '';
    private activePointerTextLookup?: ActivePointerTextLookup;
    private suppressedHoverWord?: HTMLElement;
    private suppressedHoverLookupKey = '';
    private activePopoverMode?: 'modal' | 'hover';
    private activePopoverAnchor?: HTMLElement;
    private activePopoverAnchorRect?: DOMRect;
    private activePopoverPositionLocked = false;
    private activePopoverResizeObserver?: ResizeObserver;
    private lastPointerPosition?: { x: number; y: number };
    private hoverPopoverPointerPosition?: { x: number; y: number };
    private popoverRepositionFrame?: number;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private dictionaryStyleElement?: HTMLStyleElement;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private audioLoadingRequest = 0;
    private cardRenderRequest = 0;
    private dictionaryRescanPending = false;
    private visiblePageReparseTimer?: number;
    private preloadedTermAudioKeys = new Set<string>();
    private wordNavigationStack: PopupNavigationEntry[] = [];
    private currentWordNavigation?: CardNavigationEntry;
    private kanjiNavigationStack: KanjiNavigationEntry[] = [];
    private currentKanjiNavigation?: KanjiNavigationEntry;
    private dictionarySourceOpenOverrides = new Map<string, boolean>();
    private cardRenderDataCache = new Map<string, { expiresAt: number; load: CardRenderDataLoad }>();
    private pressedKeys = new Set<string>();
    private factoryResetUnsubscribe?: () => void;
    private activeFactoryResetId = '';
    private handledFactoryResetSignals = new Set<string>();
    private hoverAnchorIds = new WeakMap<HTMLElement, number>();
    private nextHoverAnchorId = 1;
    private miningControlsDrag?: MiningControlsDrag;
    private suppressedMiningToggleClicks = new WeakSet<HTMLButtonElement>();
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
    private pageHasJapaneseText = false;
    private pressLookup?: PressLookupState;
    private suppressMiddleAuxClickUntil = 0;

    constructor() {
        configureLogger({ settingsProvider: () => this.settings });
    }

    async init(options?: ReaderAppInitOptions): Promise<void> {
        const done = log.time('init', { href: location.href, devMode: Logger.isDevMode() });
        const shouldShowWelcome = await this.loadInitialSettings(options);
        const dictionaryWarmup = this.startDictionaryWarmup();
        await this.installCoreSurfaces();
        if (await this.renderNewTabPageIfCurrent(dictionaryWarmup)) return done();
        if (this.leaveHostedPassivePage()) return done();
        await this.initReaderPage(shouldShowWelcome);
        done();
    }

    private async loadInitialSettings(options?: ReaderAppInitOptions): Promise<boolean> {
        this.bindFactoryResetSignals();
        this.settings = await loadSettings();
        if (options?.isDemo) this.enableDemoMode();
        const shouldShowWelcome = options?.showWelcome ?? !this.isDemo;
        this.settings = applyUrlBootstrapSettings(this.settings);
        this.pageHasJapaneseText = documentHasJapaneseText();
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        return shouldShowWelcome;
    }

    private enableDemoMode(): void {
        this.settings.onboardingSeen = true;
        this.isDemo = true;
    }

    private startDictionaryWarmup(): Promise<unknown> {
        if (!this.settings.localDictionariesEnabled || !this.newTab.isCurrentPage()) return Promise.resolve();
        return this.dictionaries.warm(this.settings.dictionaryPreferences).catch(error => {
            log.warn('Local dictionary warmup failed', error);
        });
    }

    private async installCoreSurfaces(): Promise<void> {
        this.installStyles();
        this.applyTheme();
        await this.refreshDictionaryStyles();
        this.registerMenuCommands();
        this.bindEvents();
        initJpdbReviewPageBridge();
    }

    private async renderNewTabPageIfCurrent(dictionaryWarmup: Promise<unknown>): Promise<boolean> {
        if (!this.newTab.isCurrentPage()) return false;
        await dictionaryWarmup;
        await this.newTab.renderPage();
        return true;
    }

    private leaveHostedPassivePage(): boolean {
        if (!isYomuHostedPassivePage(location.href)) return false;
        log.info('Hosted Yomu content page left passive', { href: location.href, demo: this.isDemo });
        return true;
    }

    private async initReaderPage(shouldShowWelcome: boolean): Promise<void> {
        this.installFab();
        this.subtitles.init();
        this.ocr.init();
        this.youtube.init();
        this.jpdbExtensions.init();
        this.setupAutoScan();
        if (shouldShowWelcome && !isYomuHostedAppUrl(location.href)) await this.onboarding.showIfNeeded();
        if (this.shouldScanInitialPage()) void this.scanVisiblePage({ silent: true });
    }

    private shouldScanInitialPage(): boolean {
        return this.canParseJapanese()
            && (this.settings.scanVisiblePage || this.settings.autoScanJapanese)
            && this.pageHasJapaneseText;
    }

    private registerMenuCommands(): void {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
            GM_registerMenuCommand(`${APP_NAME} open new tab`, () => this.openNewTabPage());
            GM_registerMenuCommand(`${APP_NAME} open video player`, () => this.openVideoPlayer());
            GM_registerMenuCommand(`${APP_NAME} toggle YouTube filter`, () => void this.toggleYoutubeImmersion());
            GM_registerMenuCommand(`${APP_NAME} toggle puck`, () => {
                this.settings.showFloatingButton = !this.settings.showFloatingButton;
                void saveSettings(this.settings).then(() => this.installFab());
            });
            GM_registerMenuCommand(`${APP_NAME} reset all`, () => void this.resetAllData());
        }
    }

    private openNewTabPage(): void {
        const opened = window.open(NEW_TAB_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        if (!opened) location.href = NEW_TAB_PAGE_URL;
        log.info('New tab page opened', { url: NEW_TAB_PAGE_URL });
    }

    private openVideoPlayer(): void {
        const opened = window.open(VIDEO_PLAYER_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        if (!opened) location.href = VIDEO_PLAYER_PAGE_URL;
        log.info('Video player page opened', { url: VIDEO_PLAYER_PAGE_URL });
    }

    private async resetAllData(): Promise<void> {
        const confirmed = window.confirm([
            `Reset all ${APP_NAME} data?`,
            '',
            'This deletes settings, cached cards, local dictionaries, and other local/GM storage for the userscript.',
        ].join('\n'));
        if (!confirmed) return;

        const resetSignal = createFactoryResetSignal('prepare');
        this.activeFactoryResetId = resetSignal.id;
        try {
            await publishFactoryResetSignal(resetSignal);
            await this.invalidateRuntimeStoresForFactoryReset();
            await delay(FACTORY_RESET_PREPARE_DELAY_MS);
            const dictionaryReset = await this.dictionaries.resetDatabase();
            const deletedStorageValues = await clearManagedStoredValues();
            await publishFactoryResetSignal(createFactoryResetSignal('complete', resetSignal.id));
            log.info('All local data reset', { deletedStorageValues, dictionaryReset });
            location.reload();
        } catch (error) {
            this.activeFactoryResetId = '';
            log.warn('All-data reset failed', error);
            this.toast(error instanceof Error ? error.message : 'Reset failed.');
        }
    }

    private bindFactoryResetSignals(): void {
        if (this.factoryResetUnsubscribe) return;
        this.factoryResetUnsubscribe = subscribeToFactoryResetSignals((signal, source) => {
            void this.handleFactoryResetSignal(signal, source);
        });
    }

    private async handleFactoryResetSignal(signal: FactoryResetSignal, source: FactoryResetSignalSource): Promise<void> {
        if (this.isDestroyed || signal.id === this.activeFactoryResetId) return;
        const handledKey = `${signal.id}:${signal.phase}`;
        if (this.handledFactoryResetSignals.has(handledKey)) return;
        this.handledFactoryResetSignals.add(handledKey);

        log.info('Factory reset signal received', {
            phase: signal.phase,
            href: signal.href,
            remote: source.remote,
            transport: source.transport,
        });
        await this.invalidateRuntimeStoresForFactoryReset();
        if (signal.phase === 'complete') {
            this.toast('よむ was reset in another tab. Reloading...');
            window.setTimeout(() => location.reload(), 50);
        }
    }

    private async invalidateRuntimeStoresForFactoryReset(): Promise<void> {
        this.dismiss({ suppressHoverTarget: false });
        this.jpdb.clear();
        this.parser.clearLocalCache();
        this.newTab.invalidateForFactoryReset();
        this.dictionarySourceOpenOverrides.clear();
        this.cardRenderDataCache.clear();
        this.preloadedTermAudioKeys.clear();
        this.pressedKeys.clear();
        this.cardRenderRequest++;
        await this.dictionaries.invalidateForFactoryReset();
    }

    private installStyles(): void {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(READER_CSS);
            log.debug('Styles installed via GM_addStyle');
        } else {
            const style = document.createElement('style');
            style.textContent = READER_CSS;
            appendToDocumentHead(style);
            log.debug('Styles installed via document head');
        }
    }

    private applyTheme(): void {
        this.applyAccentColor(this.settings.accentColor);
        this.applyWordColors();
        document.documentElement.classList.toggle('jpdb-reader-theme-dark', this.settings.theme === 'dark');
        document.documentElement.classList.toggle('jpdb-reader-theme-light', this.settings.theme === 'light');
        const furiganaMode = effectiveFuriganaMode(this.settings);
        const wordHighlightMode = effectiveWordHighlightMode(this.settings);
        const wordColorSources = {
            highlight: effectiveReaderColorSource(this.settings, this.settings.wordHighlightColorSource),
            underline: effectiveReaderColorSource(this.settings, this.settings.wordUnderlineColorSource),
            text: effectiveReaderColorSource(this.settings, this.settings.wordTextColorSource),
        } satisfies Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>;
        const subtitleColorSources = {
            highlight: effectiveSubtitleColorSource(this.settings, this.settings.subtitleHighlightColorSource),
            underline: effectiveSubtitleColorSource(this.settings, this.settings.subtitleUnderlineColorSource),
            text: effectiveSubtitleColorSource(this.settings, this.settings.subtitleTextColorSource),
        } satisfies Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>;
        document.documentElement.classList.toggle('jpdb-reader-hide-known', furiganaMode === 'known-status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-status', wordHighlightMode === 'status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-pitch', wordHighlightMode === 'pitch');
        document.documentElement.classList.toggle('jpdb-reader-highlight-off', wordHighlightMode === 'off');
        this.applyColorSourceClasses('word', wordColorSources);
        this.applyColorSourceClasses('subtitle', subtitleColorSources);
        log.debug('Theme applied', {
            theme: this.settings.theme,
            popupMode: this.settings.popupMode,
            furiganaMode,
            wordHighlightMode,
            wordColorSources,
            subtitleColorSources,
        });
    }

    private applyColorSourceClasses(scope: 'word' | 'subtitle', sources: Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>): void {
        COLOR_CHANNELS.forEach(channel => {
            COLOR_SOURCE_CLASSES.forEach(source => {
                document.documentElement.classList.toggle(`jpdb-reader-${scope}-${channel}-${source}`, sources[channel] === source);
            });
        });
    }

    private async refreshDictionaryStyles(): Promise<void> {
        this.applyDictionaryStyleCss(await this.dictionaryStyleCss());
    }

    private async dictionaryStyleCss(): Promise<string> {
        if (!this.settings.localDictionariesEnabled) return '';
        return this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences).catch(error => {
            log.warn('Dictionary styles unavailable', error);
            return '';
        });
    }

    private applyDictionaryStyleCss(css: string): void {
        const existing = this.dictionaryStyleElement ?? document.getElementById('jpdb-reader-yomitan-dictionary-styles') as HTMLStyleElement | null;
        if (!css.trim()) {
            this.clearDictionaryStyleElement(existing);
            return;
        }
        this.upsertDictionaryStyleElement(existing, css);
    }

    private clearDictionaryStyleElement(existing: HTMLStyleElement | null): void {
        existing?.remove();
        this.dictionaryStyleElement = undefined;
        log.debug('Dictionary styles cleared');
    }

    private upsertDictionaryStyleElement(existing: HTMLStyleElement | null, css: string): void {
        const style = existing ?? document.createElement('style');
        style.id = 'jpdb-reader-yomitan-dictionary-styles';
        style.textContent = css;
        if (!style.isConnected) appendToDocumentHead(style);
        this.dictionaryStyleElement = style;
        log.debug('Dictionary styles refreshed', { bytes: css.length });
    }

    private scheduleDictionaryRescan(): void {
        if (this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.dictionaryRescanPending = true;
            log.debug('Dictionary rescan deferred until settings closes');
            return;
        }
        this.scheduleVisiblePageReparse(120);
    }

    private scheduleVisiblePageReparse(delay = 0): void {
        if (this.isDestroyed) return;
        if (this.visiblePageReparseTimer !== undefined) return;
        this.visiblePageReparseTimer = window.setTimeout(() => {
            this.visiblePageReparseTimer = undefined;
            void this.reparseVisiblePage();
        }, Math.max(0, delay));
    }

    private async reparseVisiblePage(): Promise<void> {
        this.jpdb.clear();
        this.parser.clearLocalCache();
        const unwrapped = this.pauseAutoScanObserver(() => unwrapReaderWords(document));
        if (!this.canParseJapanese()) {
            log.debug('Reader words unwrapped without reparse because parsing is disabled', { unwrapped });
            return;
        }
        log.debug('Reparsing visible page', { unwrapped });
        await this.scanVisiblePage({ silent: true });
    }

    private applyAccentColor(color: string): void {
        const accentColor = sanitizeAccentColor(color);
        document.documentElement.style.setProperty('--jpdb-reader-accent', accentColor);
        document.documentElement.style.setProperty('--jpdb-reader-accent-soft', accentToRgba(accentColor, 0.18));
    }

    private applyWordColors(settings = this.settings): void {
        const colorMap = {
            new: sanitizeAccentColor(settings.wordColorNew),
            learning: sanitizeAccentColor(settings.wordColorLearning),
            known: sanitizeAccentColor(settings.wordColorKnown),
            due: sanitizeAccentColor(settings.wordColorDue),
            failed: sanitizeAccentColor(settings.wordColorFailed),
            ignored: sanitizeAccentColor(settings.wordColorIgnored),
        };
        Object.entries(colorMap).forEach(([state, color]) => {
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}`, color);
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}-soft`, accentToRgba(color, 0.16));
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}-strong`, accentToRgba(color, 0.28));
        });
        const pitchColorMap = {
            heiban: { color: sanitizeAccentColor(settings.pitchColorHeiban), alpha: 0.14 },
            atamadaka: { color: sanitizeAccentColor(settings.pitchColorAtamadaka), alpha: 0.14 },
            nakadaka: { color: sanitizeAccentColor(settings.pitchColorNakadaka), alpha: 0.16 },
            odaka: { color: sanitizeAccentColor(settings.pitchColorOdaka), alpha: 0.14 },
            kifuku: { color: sanitizeAccentColor(settings.pitchColorKifuku), alpha: 0.14 },
            unknown: { color: sanitizeAccentColor(settings.pitchColorUnknown), alpha: 0 },
        };
        Object.entries(pitchColorMap).forEach(([pattern, { color, alpha }]) => {
            document.documentElement.style.setProperty(`--jpdb-reader-pitch-${pattern}`, color);
            document.documentElement.style.setProperty(`--jpdb-reader-pitch-${pattern}-soft`, alpha > 0 ? accentToRgba(color, alpha) : 'transparent');
        });
    }

    private installFab(): void {
        this.floatingButton.install(
            this.settings,
            () => void saveSettings(this.settings),
            () => this.showSettings(),
        );
        log.debug('Floating puck refreshed', { enabled: this.settings.showFloatingButton });
    }

    destroy(): void {
        this.isDestroyed = true;
        this.factoryResetUnsubscribe?.();
        this.factoryResetUnsubscribe = undefined;
        this.abortController.abort();
        this.autoScanObserver?.disconnect();
        window.clearTimeout(this.autoScanTimer);
        window.clearTimeout(this.asbScanTimer);
        window.clearTimeout(this.selectionTimer);
        window.clearTimeout(this.visiblePageReparseTimer);
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.activePopoverResizeObserver?.disconnect();
        
        this.newTab.destroy();
        this.floatingButton.destroy();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        document.querySelectorAll('.jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby').forEach(el => {
            if (el.classList.contains('jpdb-reader-word') || el.classList.contains('jpdb-reader-ruby')) {
                const text = document.createTextNode(el.textContent || '');
                el.replaceWith(text);
            } else {
                el.remove();
            }
        });
        
        this.dictionaryStyleElement?.remove();
        document.querySelectorAll('[data-jpdb-reader-root]').forEach(el => el.remove());
    }

    private setupAutoScan(): void {
        this.autoScanObserver?.disconnect();
        this.autoScanObserver = new MutationObserver(mutations => {
            if (mutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (mutations.every(mutationInsideReaderRoot)) return;
            else if (mutations.some(mutationMayContainJapaneseText)) {
                this.pageHasJapaneseText = true;
                this.scheduleAutoScan(450);
            }
        });
        this.observeAutoScanMutations();
        window.addEventListener('scroll', () => this.scheduleAutoScan(500), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(700), { passive: true });
        if (this.pageHasJapaneseText) this.scheduleAutoScan(600);
        log.debug('Auto-scan observer installed');
    }

    private observeAutoScanMutations(): void {
        this.autoScanObserver?.observe(document.body, AUTO_SCAN_OBSERVER_OPTIONS);
    }

    private pauseAutoScanObserver<T>(callback: () => T): T {
        const observer = this.autoScanObserver;
        if (!observer) return callback();

        observer.disconnect();
        try {
            return callback();
        } finally {
            if (this.autoScanObserver === observer) this.observeAutoScanMutations();
        }
    }

    private scheduleAutoScan(delay: number): void {
        if (!this.canScheduleAutoScan()) return;
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) return;

        window.clearTimeout(this.autoScanTimer);
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.runScheduledAutoScan();
        }, delay);
    }

    private canScheduleAutoScan(): boolean {
        return !this.isDestroyed
            && this.settings.autoScanJapanese
            && this.canParseJapanese()
            && this.pageHasJapaneseText;
    }

    private runScheduledAutoScan(): void {
        this.autoScanTimer = undefined;
        this.autoScanDeadline = 0;
        void this.scanAsbPlayerSubtitles();
        if (hasVisibleAutoScanTargets()) void this.scanVisiblePage({ silent: true });
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (this.isDestroyed) return;
        if (!this.settings.autoScanJapanese || !this.canParseJapanese()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        log.debug('Binding reader event handlers');
        document.addEventListener('click', event => {
            if (this.isDestroyed) return;
            if ((event.target as HTMLElement).closest?.('[data-jpdb-reader-root] a.gloss-link[data-dictionary-lookup]')) return;
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word) {
                if (!this.settings.lookupOnClick) return;
                const candidate = this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target);
                if (!candidate) return;
                event.preventDefault();
                event.stopPropagation();
                this.suppressSelectionLookupUntil = Date.now() + 350;
                const insideActivePopover = this.activePopoverMode === 'modal' && this.isInsideActivePopover(event.target as Node | null);
                void this.showLookupCandidate(candidate, 'modal', {
                    navigation: insideActivePopover ? 'push-current' : 'reset',
                    preservePosition: insideActivePopover,
                });
                return;
            }
            if (Date.now() < this.suppressWordClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (!this.settings.lookupOnClick) return;

            event.preventDefault();
            event.stopPropagation();
            this.suppressSelectionLookupUntil = Date.now() + 350;
            if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word, { trigger: 'click' });
        }, { capture: true });

        document.addEventListener('mousedown', event => {
            if (this.isDestroyed) return;
            if (!this.shouldCaptureMiddleMouseLookup(event)) return;
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true, passive: false });

        document.addEventListener('auxclick', event => {
            if (this.isDestroyed) return;
            if (event.button !== 1 || Date.now() > this.suppressMiddleAuxClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true });

        document.addEventListener('pointerdown', event => {
            this.dismissHoverPopoverForOutsidePointer(event);
            this.beginPressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointermove', event => {
            this.updatePressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointerup', event => {
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointercancel', event => {
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointerover', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointermove', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointerout', event => {
            this.handleHoverPointerOut(event);
        }, { capture: true });

        document.addEventListener('mouseover', event => {
            this.handleHoverPointer(event as PointerEvent);
        }, { capture: true });

        document.addEventListener('mousemove', event => {
            this.handleHoverPointer(event as PointerEvent);
        }, { capture: true });

        document.addEventListener('mouseout', event => {
            this.handleHoverPointerOut(event as PointerEvent);
        }, { capture: true });

        document.addEventListener('keyup', () => {
            if (this.isDestroyed) return;
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 120);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDestroyed) return;
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 140);
        });

        document.addEventListener('touchend', () => {
            if (this.isDestroyed) return;
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 180);
        }, { passive: true });

        document.addEventListener('keydown', event => {
            if (this.isDestroyed) return;
            this.pressedKeys.add(normalizePressedKey(event.key));
            if (isEditableTarget(event.target)) return;
            const escapeClose = this.settings.shortcuts.closePopup.trim().toLowerCase() === 'escape' && event.key === 'Escape';
            if ((escapeClose || matchesShortcut(event, this.settings.shortcuts.closePopup)) && this.hasOpenReaderDialog()) {
                event.preventDefault();
                log.debug('Shortcut closing active reader dialog');
                this.dismiss({ suppressHoverTarget: true });
                return;
            }
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
            if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
                event.preventDefault();
                log.info('Shortcut triggered visible page scan');
                void this.scanVisiblePage({ silent: true });
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
                event.preventDefault();
                log.info('Shortcut opened settings');
                this.showSettings();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
                event.preventDefault();
                this.settings.ocrEnabled = !this.settings.ocrEnabled;
                void saveSettings(this.settings);
                this.ocr.refresh();
                log.info('Shortcut toggled OCR', { enabled: this.settings.ocrEnabled });
                this.toast(this.settings.ocrEnabled ? 'Image reading enabled.' : 'Image reading hidden.');
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
                event.preventDefault();
                log.info('Shortcut toggled YouTube filter');
                void this.toggleYoutubeImmersion();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.scanImages)) {
                event.preventDefault();
                log.info('Shortcut triggered image scan');
                void this.ocr.scanVisible();
                return;
            }
            if (this.lastCard && this.activePopover && matchesShortcut(event, this.settings.shortcuts.playAudio)) {
                event.preventDefault();
                log.debug('Shortcut triggered audio playback', { term: this.lastCard.spelling });
                void this.playAudio(this.lastCard);
                return;
            }
            const grade = this.shortcutGrade(event);
            if (this.lastCard && grade && this.activePopover?.classList.contains('jpdb-reader-popover')) {
                event.preventDefault();
                const ankiCardId = this.lastAnkiLookup?.primary?.primaryCardId ?? null;
                if (!ankiCardId && !this.settings.jpdbMiningEnabled) return;
                const card = this.lastCard;
                const sentence = this.lastCardSentence;
                const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
                const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
                void this.cardActions.reviewGrade(grade, card, sentence, {
                    ankiCardId: Number.isFinite(ankiCardId) && ankiCardId ? ankiCardId : undefined,
                }).then(() => this.showCard(card, sentence, anchor, {
                    autoPlay: false,
                    trigger,
                    navigation: 'preserve',
                    preservePosition: true,
                })).catch(error => {
                    log.warn('Shortcut review failed', { grade, ankiCardId: Number.isFinite(ankiCardId) ? ankiCardId : undefined }, error);
                    this.toast(error instanceof Error ? error.message : 'Review failed.');
                });
            }
        });
        document.addEventListener('keyup', event => {
            this.pressedKeys.delete(normalizePressedKey(event.key));
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && !this.shouldLookupOnHover(event)) {
                this.cancelPendingHoverLookup();
                if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
            }
        });
        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
            this.cancelPendingHoverLookup();
            if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
        });
    }

    private shortcutGrade(event: KeyboardEvent): JPDBGrade | null {
        if (!this.settings.enableReviews) return null;
        const shortcuts = this.settings.twoButtonReviews
            ? TWO_BUTTON_REVIEW_SHORTCUTS
            : FIVE_BUTTON_REVIEW_SHORTCUTS;
        return matchedReviewShortcutGrade(event, this.settings.shortcuts, shortcuts);
    }

    private shouldLookupOnHover(event: MouseEvent | KeyboardEvent): boolean {
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private beginPressLookup(event: PointerEvent): void {
        const request = this.pressLookupRequest(event);
        if (!request) return;
        if (request.isMiddleScan) this.captureMiddleMouseLookup(event);
        this.pressLookup = this.createPressLookup(event, request.isMiddleScan);
        if (request.isMiddleScan) this.updatePressLookup(event);
    }

    private pressLookupRequest(event: PointerEvent): { isMiddleScan: boolean } | null {
        const isMiddleScan = this.shouldCaptureMiddleMouseLookup(event);
        if (!this.canBeginPressLookup(event, isMiddleScan)) return null;
        if (!isMiddleScan && !this.wordFromEventTarget(event.target)) return null;
        return { isMiddleScan };
    }

    private canBeginPressLookup(event: PointerEvent, isMiddleScan: boolean): boolean {
        if (this.isDestroyed) return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        if (isMiddleScan) return true;
        return this.canBeginPrimaryPressLookup(event);
    }

    private canBeginPrimaryPressLookup(event: PointerEvent): boolean {
        return hasPressLookupEnabled(this.settings)
            && (event.pointerType !== 'mouse' || event.button === 0);
    }

    private createPressLookup(event: PointerEvent, isMiddleScan: boolean): PressLookupState {
        return {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: isMiddleScan,
            source: isMiddleScan ? 'middle' : 'primary',
            captureTarget: isMiddleScan && event.target instanceof Element ? event.target : undefined,
        };
    }

    private updatePressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };

        if (!this.activatePressLookupIfNeeded(pressLookup, event)) return;

        event.preventDefault();
        event.stopPropagation();
        this.updateActivePressLookupTarget(pressLookup, event);
    }

    private updateActivePressLookupTarget(pressLookup: PressLookupState, event: PointerEvent): void {
        const targetAtPointer = document.elementFromPoint(event.clientX, event.clientY);
        if (this.isInsideActivePopover(targetAtPointer)) {
            this.cancelHoverClose();
            return;
        }

        const word = this.wordFromPoint(event.clientX, event.clientY);
        if (!word) {
            if (pressLookup.source === 'middle') this.scheduleHoverClose();
            return;
        }
        this.showPressLookupWord(pressLookup, word, event);
    }

    private showPressLookupWord(pressLookup: PressLookupState, word: HTMLElement, event: PointerEvent): void {
        this.rememberHoverPopoverPointer(event);
        if (this.refreshPressLookupWord(pressLookup, word)) return;
        pressLookup.lastWord = word;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        void this.showWord(word, { trigger: 'hover', hoverLookupGeneration });
    }

    private activatePressLookupIfNeeded(pressLookup: PressLookupState, event: PointerEvent): boolean {
        if (pressLookup.active) return true;
        const distance = Math.hypot(event.clientX - pressLookup.startX, event.clientY - pressLookup.startY);
        if (distance < 8) return false;
        pressLookup.active = true;
        this.suppressWordClickUntil = Date.now() + 700;
        this.suppressedHoverWord = undefined;
        return true;
    }

    private refreshPressLookupWord(pressLookup: PressLookupState, word: HTMLElement): boolean {
        if (word !== pressLookup.lastWord) return false;
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) this.scheduleActivePopoverReposition();
        return true;
    }

    private endPressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.matchingPressLookup(event);
        if (!pressLookup) return;
        this.finishPressLookupRelease(event, pressLookup);
        this.pressLookup = undefined;
    }

    private matchingPressLookup(event: PointerEvent): PressLookupState | null {
        const pressLookup = this.pressLookup;
        return pressLookup?.pointerId === event.pointerId ? pressLookup : null;
    }

    private finishPressLookupRelease(event: PointerEvent, pressLookup: PressLookupState): void {
        if (pressLookup.active) this.suppressPressLookupAfterRelease();
        if (pressLookup.source === 'middle') this.finishMiddlePressLookup(event, pressLookup);
    }

    private suppressPressLookupAfterRelease(): void {
        this.suppressWordClickUntil = Date.now() + 700;
        this.suppressSelectionLookupUntil = Date.now() + 350;
    }

    private finishMiddlePressLookup(event: PointerEvent, pressLookup: PressLookupState): void {
        event.preventDefault();
        event.stopPropagation();
        this.finishMiddleMouseLookup(pressLookup);
        if (this.activePopoverMode === 'hover' && !this.isHoverContextActive()) this.scheduleHoverClose();
    }

    private shouldCaptureMiddleMouseLookup(event: MouseEvent | PointerEvent): boolean {
        if (!this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        return isMousePointerEvent(event) && !this.isNativeMiddleClickTarget(eventElement(event));
    }

    private captureMiddleMouseLookup(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.suppressMiddleAuxClickUntil = Date.now() + 1200;
        this.suppressSelectionLookupUntil = Date.now() + 350;
        document.documentElement.classList.add('jpdb-reader-middle-scan-active');
        log.debug('Middle-mouse scan started');
        try {
            if (event.target instanceof Element) event.target.setPointerCapture?.(event.pointerId);
        } catch {
            // Some pages detach nodes during pointerdown; capture is only an enhancement.
        }
    }

    private finishMiddleMouseLookup(pressLookup: { pointerId: number; captureTarget?: Element }): void {
        this.suppressMiddleAuxClickUntil = Date.now() + 700;
        document.documentElement.classList.remove('jpdb-reader-middle-scan-active');
        log.debug('Middle-mouse scan finished');
        try {
            pressLookup.captureTarget?.releasePointerCapture?.(pressLookup.pointerId);
        } catch {
            // Already released or unsupported.
        }
    }

    private isNativeMiddleClickTarget(target: Element | null): boolean {
        return Boolean(target?.closest([
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            'summary',
            '[role="button"]',
            '[contenteditable="true"]',
            '[data-jpdb-reader-root]',
        ].join(',')));
    }

    private wordFromEventTarget(target: EventTarget | null): HTMLElement | null {
        const element = target instanceof Element ? target : null;
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canLookupReaderWord(word) ? word : null;
    }

    private wordFromPoint(x: number, y: number): HTMLElement | null {
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word && this.canLookupReaderWord(word)) return word;
        }
        return null;
    }

    private preloadHoverWordAudio(word: HTMLElement): void {
        this.preloadReaderWordAudio(word, { sourceLimit: 2, candidateLimit: 1 });
        this.preloadNearbyReaderWordAudio(word);
    }

    private preloadReaderWordAudio(word: HTMLElement, options: { sourceLimit?: number; candidateLimit?: number } = {}): boolean {
        if (!this.canPreloadReaderAudio()) return false;
        const card = this.preloadableReaderWordCard(word);
        if (!card) return false;
        if (!this.reservePreloadedTermAudio(card)) return false;
        this.audio.preload(card, audioPreloadLimits(options));
        return true;
    }

    private canPreloadReaderAudio(): boolean {
        return this.settings.audioEnabled && this.settings.autoPlayAudio;
    }

    private reservePreloadedTermAudio(card: JPDBCard): boolean {
        const key = cardKey(card);
        if (this.preloadedTermAudioKeys.has(key)) return false;
        this.preloadedTermAudioKeys.add(key);
        return true;
    }

    private preloadableReaderWordCard(word: HTMLElement): JPDBCard | null {
        const card = this.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
        return card && isUsefulImmersionPreloadQuery(card.spelling) ? card : null;
    }

    private preloadNearbyReaderWordAudio(word: HTMLElement): void {
        const queued = this.queueNearbyReaderWordAudioPreloads(word);
        if (queued) log.debugThrottled('nearby-audio-preload', 2500, 'Nearby term audio preloads queued', { queued });
    }

    private queueNearbyReaderWordAudioPreloads(word: HTMLElement): number {
        const words = this.lookupableReaderWords();
        const index = words.indexOf(word);
        return index < 0 ? 0 : this.queueReaderWordAudioPreloads(words.slice(index + 1));
    }

    private lookupableReaderWords(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(candidate => candidate.isConnected && this.canLookupReaderWord(candidate));
    }

    private queueReaderWordAudioPreloads(words: HTMLElement[]): number {
        let queued = 0;
        for (const candidate of words) {
            if (this.preloadReaderWordAudio(candidate)) queued++;
            if (queued >= NEARBY_TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        return queued;
    }

    private canLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer, .jpdb-reader-popover'));
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer'));
    }

    private handleHoverPointer(event: PointerEvent): void {
        if (this.shouldIgnoreHoverPointer(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (this.handleActivePopoverHover(event)) return;

        const word = this.hoverReaderWordForEvent(event);
        if (!word) {
            this.handlePointerTextHover(event);
            return;
        }
        this.handleReaderWordHover(word, event);
    }

    private shouldIgnoreHoverPointer(event: PointerEvent): boolean {
        return this.isDestroyed
            || this.pressLookup?.source === 'middle'
            || event.pointerType === 'touch';
    }

    private handleActivePopoverHover(event: PointerEvent): boolean {
        if (!this.isInsideActivePopover(event.target as Node | null)) return false;
        this.cancelHoverClose();
        return true;
    }

    private hoverReaderWordForEvent(event: PointerEvent): HTMLElement | null {
        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private handlePointerTextHover(event: PointerEvent): void {
        const hoverEnabled = this.shouldLookupOnHover(event);
        const candidate = hoverEnabled ? this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target) : null;
        if (candidate && this.refreshActivePointerTextHover(candidate, event)) return;
        this.cancelMissingPointerTextCandidate(candidate);
        this.scheduleInactiveHoverClose();
        if (!canSchedulePointerTextHoverLookup(hoverEnabled, candidate)) return;
        this.rememberHoverPopoverPointer(event);
        this.schedulePointerTextLookup(candidate, event);
    }

    private refreshActivePointerTextHover(candidate: PointerTextLookup, event: PointerEvent): boolean {
        if (!this.isActivePointerTextLookup(candidate)) return false;
        this.rememberHoverPopoverPointer(event);
        this.cancelHoverClose();
        this.refreshActiveHoverAnchor(candidate.anchor);
        this.scheduleActivePopoverReposition();
        return true;
    }

    private cancelMissingPointerTextCandidate(candidate: PointerTextLookup | null): void {
        if (!candidate) this.cancelPendingHoverLookup();
    }

    private scheduleInactiveHoverClose(): void {
        if (this.activePopoverMode === 'hover' && !this.isHoverContextActive({ ignoreCssHover: true })) {
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        }
    }

    private handleReaderWordHover(word: HTMLElement, event: PointerEvent): void {
        this.rememberHoverPopoverPointer(event);
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.cancelHoverClose();
            this.refreshActiveHoverAnchor(word);
            this.scheduleActivePopoverReposition();
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            this.scheduleActivePopoverReposition();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        this.preloadHoverWordAudio(word);
        this.scheduleHoverLookup(word, event);
    }

    private handleHoverPointerOut(event: PointerEvent): void {
        if (this.isDestroyed) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        const related = event.relatedTarget as Node | null;
        if (this.handleActivePopoverPointerOut(event, related)) return;
        this.handleReaderWordPointerOut(event, related);
    }

    private handleActivePopoverPointerOut(event: PointerEvent, related: Node | null): boolean {
        if (this.isInsideActivePopover(event.target as Node | null)) {
            if (this.isInsideActivePopover(related) || (this.activeHoverWord && this.isInsideNode(related, this.activeHoverWord))) return true;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
            return true;
        }
        return false;
    }

    private handleReaderWordPointerOut(event: PointerEvent, related: Node | null): void {
        const word = this.pointerOutReaderWord(event, related);
        if (!word) return;
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        this.cancelPendingHoverLookupForWord(word, hoverLookupKey);
        this.clearSuppressedHoverForWord(word, hoverLookupKey);
        this.handleActiveHoverWordPointerOut(word, related);
    }

    private pointerOutReaderWord(event: PointerEvent, related: Node | null): HTMLElement | null {
        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && !(related && word.contains(related)) ? word : null;
    }

    private cancelPendingHoverLookupForWord(word: HTMLElement, hoverLookupKey: string): void {
        if (this.hoverPendingWord === word || this.hoverPendingLookupKey === hoverLookupKey || this.hoverLookupInFlightKey === hoverLookupKey) {
            this.cancelPendingHoverLookup();
        }
    }

    private clearSuppressedHoverForWord(word: HTMLElement, hoverLookupKey: string): void {
        if (this.suppressedHoverWord === word) this.suppressedHoverWord = undefined;
        if (this.suppressedHoverLookupKey === hoverLookupKey) this.suppressedHoverLookupKey = '';
    }

    private handleActiveHoverWordPointerOut(word: HTMLElement, related: Node | null): void {
        if (this.activePopoverMode !== 'hover' || this.activeHoverWord !== word) return;
        if (this.isInsideActivePopover(related)) {
            this.cancelHoverClose();
            return;
        }
        this.scheduleHoverClose(undefined, { ignoreCssHover: true });
    }

    private scheduleHoverLookupAtPointer(event: KeyboardEvent): void {
        const pointer = this.activeHoverPointerPosition();
        if (!pointer) return;
        this.hoverPopoverPointerPosition = { ...pointer };
        this.scheduleHoverLookupForPointer(pointer, event);
    }

    private activeHoverPointerPosition(): { x: number; y: number } | null {
        return !this.isDestroyed && this.lastPointerPosition ? this.lastPointerPosition : null;
    }

    private scheduleHoverLookupForPointer(pointer: { x: number; y: number }, event: KeyboardEvent): void {
        const target = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null;
        const word = this.hoverReaderWordFromElement(target);
        if (word) {
            this.scheduleHoverLookup(word, event);
            return;
        }
        this.schedulePointerTextLookupForPointer(pointer, target, event);
    }

    private hoverReaderWordFromElement(element: HTMLElement | null): HTMLElement | null {
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private schedulePointerTextLookupForPointer(pointer: { x: number; y: number }, target: EventTarget | null, event: KeyboardEvent): void {
        const candidate = this.lookupCandidateFromPoint(pointer.x, pointer.y, target);
        if (candidate) this.schedulePointerTextLookup(candidate, event);
    }

    private dismissHoverPopoverForOutsidePointer(event: PointerEvent): void {
        if (this.isDestroyed || this.activePopoverMode !== 'hover') return;
        const target = event.target as Node | null;
        if (!this.shouldDismissHoverForPointerTarget(target)) return;
        this.dismiss({ suppressHoverTarget: false });
    }

    private shouldDismissHoverForPointerTarget(target: Node | null): boolean {
        if (this.isInsideActivePopover(target)) return false;
        return !(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private rememberHoverPopoverPointer(event: MouseEvent): void {
        this.hoverPopoverPointerPosition = { x: event.clientX, y: event.clientY };
    }

    private nextHoverLookupGeneration(): number {
        this.hoverLookupGeneration++;
        return this.hoverLookupGeneration;
    }

    private cancelPendingHoverLookup(): void {
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        this.hoverLookupInFlightKey = '';
        this.nextHoverLookupGeneration();
    }

    private scheduleActivePopoverReposition(): void {
        if (this.activePopoverMode !== 'hover' || !this.activePopover || this.activePopover.classList.contains('jpdb-reader-sheet')) return;
        if (this.popoverRepositionFrame !== undefined) return;
        this.popoverRepositionFrame = window.requestAnimationFrame(() => {
            this.popoverRepositionFrame = undefined;
            this.repositionActivePopover();
        });
    }

    private scheduleHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent): void {
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.shouldSkipHoverLookupSchedule(word, hoverLookupKey)) return;

        this.preloadHoverWordAudio(word);
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = word;
        this.hoverPendingLookupKey = hoverLookupKey;
        this.installHoverLookupTimer(() => this.runScheduledHoverLookup(word, event, hoverLookupGeneration));
    }

    private shouldSkipHoverLookupSchedule(word: HTMLElement, hoverLookupKey: string): boolean {
        if (this.isSuppressedHoverLookup(word, hoverLookupKey)) return true;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return true;
        }
        return this.isSameActiveHoverWord(word)
            || this.isPendingHoverLookup(word, hoverLookupKey)
            || this.isInFlightHoverLookup(hoverLookupKey);
    }

    private isSuppressedHoverLookup(word: HTMLElement, hoverLookupKey: string): boolean {
        return this.suppressedHoverWord === word || Boolean(hoverLookupKey && this.suppressedHoverLookupKey === hoverLookupKey);
    }

    private isSameActiveHoverWord(word: HTMLElement): boolean {
        return this.activePopoverMode === 'hover' && this.activeHoverWord === word;
    }

    private isPendingHoverLookup(word: HTMLElement, hoverLookupKey: string): boolean {
        return Boolean((this.hoverPendingWord === word || (hoverLookupKey && this.hoverPendingLookupKey === hoverLookupKey)) && this.hoverLookupTimer);
    }

    private isInFlightHoverLookup(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && this.hoverLookupInFlightKey === hoverLookupKey);
    }

    private installHoverLookupTimer(runLookup: () => void): void {
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) runLookup();
        else this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private runScheduledHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent, hoverLookupGeneration: number): void {
        if (this.hoverLookupGeneration !== hoverLookupGeneration) return;
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        const activeWord = this.resolveScheduledHoverWord(word);
        if (!activeWord || !this.canRunScheduledHoverLookup(activeWord, event)) return;
        const activeHoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        if (activeHoverLookupKey) this.hoverLookupInFlightKey = activeHoverLookupKey;
        void this.showWord(activeWord, { trigger: 'hover', hoverLookupGeneration }).finally(() => {
            if (this.hoverLookupInFlightKey === activeHoverLookupKey) this.hoverLookupInFlightKey = '';
        });
    }

    private resolveScheduledHoverWord(word: HTMLElement): HTMLElement | null {
        if (word.isConnected) return word;
        return this.lastPointerPosition
            ? this.wordFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) ?? null
            : null;
    }

    private canRunScheduledHoverLookup(activeWord: HTMLElement, event: MouseEvent | KeyboardEvent): boolean {
        const hoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        if (!this.isRunnableScheduledHoverWord(activeWord, hoverLookupKey)) return false;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(activeWord);
            return false;
        }
        if (!this.canOpenHoverLookupForWord(activeWord, event)) return false;
        if (shouldPauseVideoForSubtitleHover(activeWord, this.settings)) pauseActiveVideo();
        return true;
    }

    private isRunnableScheduledHoverWord(activeWord: HTMLElement, hoverLookupKey: string): boolean {
        return activeWord.isConnected && !this.isSuppressedHoverLookup(activeWord, hoverLookupKey);
    }

    private canOpenHoverLookupForWord(activeWord: HTMLElement, event: MouseEvent | KeyboardEvent): boolean {
        return this.isWordHoverActive(activeWord)
            && this.settings.lookupOnHover
            && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private schedulePointerTextLookup(candidate: PointerTextLookup, event: MouseEvent | KeyboardEvent): void {
        if (this.isActivePointerTextLookup(candidate)) {
            this.refreshActiveHoverAnchor(candidate.anchor);
            return;
        }
        const hoverLookupKey = this.pendingPointerTextLookupKey(candidate);
        if (this.isPointerTextLookupAlreadyQueued(hoverLookupKey)) return;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = hoverLookupKey;
        const runLookup = () => {
            if (this.hoverLookupGeneration !== hoverLookupGeneration) return;
            this.hoverLookupTimer = undefined;
            this.hoverPendingLookupKey = '';
            if (!candidate.anchor.isConnected || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys)) return;
            if (hoverLookupKey) this.hoverLookupInFlightKey = hoverLookupKey;
            void this.showLookupCandidate(candidate, 'hover', { hoverLookupGeneration }).finally(() => {
                if (this.hoverLookupInFlightKey === hoverLookupKey) this.hoverLookupInFlightKey = '';
            });
        };
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) {
            runLookup();
            return;
        }
        this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private isPointerTextLookupAlreadyQueued(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && (
            (this.hoverPendingLookupKey === hoverLookupKey && this.hoverLookupTimer)
            || this.hoverLookupInFlightKey === hoverLookupKey
        ));
    }

    private cancelHoverClose(): void {
        window.clearTimeout(this.hoverCloseTimer);
        this.hoverCloseTimer = undefined;
    }

    private scheduleHoverClose(delay = this.settings.hoverCloseDelayMs, options: { ignoreCssHover?: boolean } = {}): void {
        if (this.activePopoverMode !== 'hover') return;
        this.cancelHoverClose();
        this.hoverCloseTimer = window.setTimeout(() => {
            this.hoverCloseTimer = undefined;
            if (this.isHoverContextActive(options)) return;
            this.dismiss({ suppressHoverTarget: false });
        }, Math.max(0, delay));
    }

    private isHoverContextActive(options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        if (this.activeHoverWord && this.isWordHoverActive(this.activeHoverWord, options)) return true;
        if (this.isPopoverCssHoverActive(options)) return true;
        const target = this.currentHoverPointerTarget(options);
        return target ? this.isInsideActiveHoverContext(target) : false;
    }

    private isPopoverCssHoverActive(options: { ignoreCssHover?: boolean }): boolean {
        return !options.ignoreCssHover && Boolean(this.activePopover?.matches(':hover'));
    }

    private currentHoverPointerTarget(options: { ignorePointerPosition?: boolean }): Element | null {
        if (options.ignorePointerPosition || !this.lastPointerPosition) return null;
        return document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
    }

    private isInsideActiveHoverContext(target: Element): boolean {
        return this.isInsideActivePopover(target)
            || Boolean(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private isWordHoverActive(word: HTMLElement, options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        if (!options.ignoreCssHover && word.matches(':hover')) return true;
        if (options.ignorePointerPosition) return false;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideNode(target, word);
    }

    private hoverLookupKeyForWord(word: HTMLElement): string {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        if (!Number.isFinite(vid) || !Number.isFinite(sid)) return '';
        return `word:${vid}:${sid}:${word.dataset.sentence ?? ''}`;
    }

    private pendingPointerTextLookupKey(candidate: PointerTextLookup): string {
        return `text-pending:${this.hoverAnchorId(candidate.anchor)}:${candidate.start}:${candidate.end}:${candidate.text.length}`;
    }

    private activePointerTextLookupKey(candidate: PointerTextLookup, start: number, end: number, card: JPDBCard): string {
        return `text:${this.hoverAnchorId(candidate.anchor)}:${start}:${end}:${cardKey(card)}`;
    }

    private hoverAnchorId(anchor: HTMLElement): number {
        const existing = this.hoverAnchorIds.get(anchor);
        if (existing) return existing;
        const next = this.nextHoverAnchorId++;
        this.hoverAnchorIds.set(anchor, next);
        return next;
    }

    private isActiveHoverLookup(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && this.activePopover && this.activePopoverMode === 'hover' && this.activeHoverLookupKey === hoverLookupKey);
    }

    private isActivePointerTextLookup(candidate: PointerTextLookup): boolean {
        const active = this.activePointerTextLookup;
        if (!active || !this.hasActiveHoverPopover()) return false;
        if (!samePointerTextLookupTarget(active, candidate)) return false;
        return pointerOffsetInsideLookup(active, candidate.offset);
    }

    private hasActiveHoverPopover(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.activePopover);
    }

    private refreshActiveHoverAnchor(anchor: HTMLElement): void {
        if (!this.canRefreshActiveHoverAnchor(anchor)) return;
        if (this.activePopoverAnchor === anchor && this.activeHoverWord === anchor) return;
        this.activePopoverAnchor = anchor;
        this.activeHoverWord = anchor;
        this.captureActiveHoverAnchorRect(anchor);
        this.repositionActivePopover();
    }

    private canRefreshActiveHoverAnchor(anchor: HTMLElement): boolean {
        return Boolean(this.activePopover && this.activePopoverMode === 'hover' && anchor.isConnected);
    }

    private captureActiveHoverAnchorRect(anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
    }

    private isInsideActivePopover(node: Node | null): boolean {
        return Boolean(this.activePopover && this.isInsideNode(node, this.activePopover));
    }

    private isInsideNode(node: Node | null, root: Node): boolean {
        return Boolean(node && (node === root || root.contains(node)));
    }

    private async toggleYoutubeImmersion(): Promise<void> {
        await this.setYoutubeImmersionEnabled(!this.settings.youtubeImmersionEnabled);
    }

    private async setYoutubeImmersionEnabled(enabled: boolean): Promise<void> {
        this.settings.youtubeImmersionEnabled = enabled;
        await saveSettings(this.settings);
        this.youtube.refresh();
        log.info('YouTube immersion setting changed', { enabled });
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'youtubeToggleToastOn' : 'youtubeToggleToastOff'));
    }

    private hasOpenReaderDialog(): boolean {
        return Boolean(this.activePopover || this.activeBackdrop || document.querySelector('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop'));
    }

    private async parseJapanese(paragraphs: string[]): Promise<JPDBToken[][]> {
        log.debugThrottled('parse-japanese', 1500, 'Parsing Japanese text', { paragraphs: paragraphs.length });
        return this.parser.parse(paragraphs);
    }

    private canParseJapanese(): boolean {
        return this.parser.canParse();
    }

    private getCachedCard(vid: number, sid: number): JPDBCard | undefined {
        return this.parser.getCachedCard(vid, sid);
    }

    private isJpdbBackedCard(card: JPDBCard): boolean {
        return this.parser.isJpdbBackedCard(card);
    }

    private async lookupSelection(): Promise<void> {
        if (this.isDestroyed) return;
        if (Date.now() < this.suppressSelectionLookupUntil) return;
        const selected = this.selectionLookupText();
        if (!selected) return;
        log.debug('Looking up selected text', { length: selected.length });
        await this.lookupText(selected, getSelectionSentence());
    }

    private selectionLookupText(): string {
        const selected = getSelectionText();
        if (selected.length < 1) return '';
        if (selected.length > 120) return '';
        if (!HAS_JAPANESE.test(selected)) return '';
        if ((document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) return '';
        return selected;
    }

    private async lookupText(text: string, sentence = text, options: TextLookupOptions = {}): Promise<void> {
        const context = this.textLookupDisplayContext(text, options);
        if (!context) return;
        const done = log.time('lookupText', { length: context.selected.length, trigger: context.trigger });
        try {
            const [tokens] = await this.parseJapanese([sentence]);
            await this.showTextLookupResult(context, tokens, sentence);
        } catch (error) {
            log.warn('Lookup failed; trying local fallback', { selected: context.selected }, error);
            await this.showLocalOrFallbackLookupCard(context, sentence, error);
        } finally {
            done();
        }
    }

    private textLookupDisplayContext(text: string, options: TextLookupOptions): TextLookupDisplayContext | null {
        const selected = normalizedLookupText(text);
        if (!isLookupableJapaneseText(selected)) return null;
        const trigger = this.activeTextLookupTrigger();
        const navigation = options.navigation ?? 'reset';
        return this.createTextLookupDisplayContext(selected, trigger, navigation, options);
    }

    private createTextLookupDisplayContext(
        selected: string,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
        options: TextLookupOptions,
    ): TextLookupDisplayContext {
        return {
            selected,
            anchor: options.anchor ?? connectedElement(this.activePopoverAnchor),
            trigger,
            navigation,
            preservePosition: this.textLookupPreservePosition(navigation, options),
            previousNavigationEntry: this.textLookupPreviousNavigationEntryForOptions(trigger, navigation, options),
        };
    }

    private textLookupPreservePosition(navigation: CardNavigationMode, options: TextLookupOptions): boolean {
        return options.preservePosition ?? this.shouldPreserveLookupPosition(navigation);
    }

    private textLookupPreviousNavigationEntryForOptions(
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
        options: TextLookupOptions,
    ): PopupNavigationEntry | undefined {
        return options.previousNavigationEntry ?? this.textLookupPreviousNavigationEntry(trigger, navigation);
    }

    private activeTextLookupTrigger(): 'modal' | 'hover' {
        return this.activePopoverMode === 'hover' ? 'hover' : 'modal';
    }

    private shouldPreserveLookupPosition(navigation: CardNavigationMode): boolean {
        return navigation !== 'reset' && Boolean(this.activePopover);
    }

    private textLookupPreviousNavigationEntry(trigger: 'modal' | 'hover', navigation: CardNavigationMode): PopupNavigationEntry | undefined {
        return trigger === 'modal' && navigation === 'push-current'
            ? this.activeKanjiNavigationEntry()
            : undefined;
    }

    private async showTextLookupResult(context: TextLookupDisplayContext, tokens: JPDBToken[], sentence: string): Promise<void> {
        const selectedToken = pickTokenForSelection(tokens, context.selected);
        if (selectedToken) {
            log.debug('Lookup selected token', { selected: context.selected, term: selectedToken.card.spelling, source: selectedToken.card.source ?? 'jpdb' });
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        if (tokens.length) {
            log.debug('Lookup produced token list', { selected: context.selected, tokenCount: tokens.length });
            this.showTokenList(tokens, context.selected, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        await this.showLocalOrFallbackLookupCard(context, sentence);
    }

    private async showLocalOrFallbackLookupCard(context: TextLookupDisplayContext, sentence: string, error?: unknown): Promise<void> {
        const localEntries = await this.localLookupEntries(context.selected);
        if (localEntries.length) {
            log.debug('Lookup fell back to local dictionary entry', { selected: context.selected, entries: localEntries.length });
            void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        if (error) this.toast(error instanceof Error ? error.message : 'JPDB lookup failed.');
        else log.debug('Lookup found no entries; showing fallback card', { selected: context.selected });
        void this.showCard(this.parser.fallbackCardFromText(context.selected), sentence, context.anchor, this.textLookupCardOptions(context));
    }

    private async localLookupEntries(selected: string): Promise<YomitanTermEntry[]> {
        return this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
    }

    private textLookupCardOptions(context: TextLookupDisplayContext): Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry'> {
        return {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: context.preservePosition,
            previousNavigationEntry: context.previousNavigationEntry,
        };
    }

    private handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        const link = dictionaryLookupLink(event.target);
        if (!link) return false;
        const query = dictionaryLookupQuery(link);
        if (!query) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.lookupDictionaryReference(query, link.dataset.dictionaryReading ?? '', link.dataset.dictionary ?? '', anchor, trigger, this.isInsideActivePopover(event.target as Node | null));
        return true;
    }

    private async lookupDictionaryReference(
        query: string,
        reading: string,
        sourceDictionary: string,
        anchor: HTMLElement | undefined,
        trigger: 'modal' | 'hover',
        preservePosition = false,
    ): Promise<void> {
        if (!HAS_JAPANESE.test(query)) return;
        const normalizedReading = reading.replace(/\s+/g, ' ').trim();
        const navigation: CardNavigationMode = trigger === 'modal' ? 'push-current' : 'reset';
        const done = log.time('dictionaryReferenceLookup', { query, hasReading: Boolean(normalizedReading), sourceDictionary, trigger });
        try {
            const localEntries = await this.dictionaryReferenceLocalEntries(query, normalizedReading, sourceDictionary);
            const preferredEntry = localEntries.find(entry => entry.dictionary === sourceDictionary) ?? localEntries[0];
            if (preferredEntry) {
                await this.showCard(this.parser.localCardFromEntry(preferredEntry), query, anchor, { autoPlay: false, trigger, navigation, preservePosition });
                return;
            }
            await this.lookupText(query, query, { navigation, preservePosition });
        } finally {
            done();
        }
    }

    private async dictionaryReferenceLocalEntries(query: string, reading: string, sourceDictionary: string): Promise<YomitanTermEntry[]> {
        if (!this.settings.localDictionariesEnabled) return [];
        return await this.dictionaries.lookup(query, reading || query, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
            log.warn('Dictionary reference local lookup failed', { query, reading, sourceDictionary }, error);
            return [];
        });
    }

    private lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null): PointerTextLookup | null {
        const element = this.pointerLookupElement(x, y, eventTarget);
        if (!element) return null;
        const position = this.usablePointerTextPosition(element, x, y);
        if (!position) return null;
        const characterOffset = pointerTextCharacterOffset(position.node, position.offset, x, y);
        if (characterOffset === null) return null;
        return this.lookupCandidateFromTextPosition(position.node, characterOffset);
    }

    private pointerLookupElement(x: number, y: number, eventTarget: EventTarget | null): Element | null {
        const element = eventTarget instanceof Element ? eventTarget : document.elementFromPoint(x, y);
        return element && !this.isNativeTextLookupTarget(element) ? element : null;
    }

    private usablePointerTextPosition(element: Element, x: number, y: number): NonNullable<ReturnType<typeof caretTextPositionFromPoint>> | null {
        const position = caretTextPositionFromPoint(x, y);
        return this.isUsablePointerTextPosition(element, position) ? position : null;
    }

    private lookupCandidateFromTextPosition(node: Text, characterOffset: number): PointerTextLookup | null {
        const run = japaneseRunAt(node.data, characterOffset);
        if (!run || isLowValuePointerText(node.data, node.parentElement)) return null;
        return this.pointerTextLookupFromRun(node, run);
    }

    private isUsablePointerTextPosition(element: Element, position: ReturnType<typeof caretTextPositionFromPoint>): position is NonNullable<ReturnType<typeof caretTextPositionFromPoint>> {
        return Boolean(position
            && position.node.parentElement
            && (element.contains(position.node) || position.node.parentElement.contains(element))
            && !position.node.parentElement.closest('.jpdb-reader-word'));
    }

    private pointerTextLookupFromRun(node: Text, run: NonNullable<ReturnType<typeof japaneseRunAt>>): PointerTextLookup {
        return {
            text: node.data,
            offset: run.offset,
            start: run.start,
            end: run.end,
            anchor: node.parentElement as HTMLElement,
        };
    }

    private isNativeTextLookupTarget(target: Element): boolean {
        return Boolean(target.closest([
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            'summary',
            '[role="button"]',
            '[contenteditable="true"]',
            '.jpdb-reader-word',
        ].join(',')));
    }

    private async showLookupCandidate(candidate: PointerTextLookup, trigger: 'modal' | 'hover', options: { navigation?: CardNavigationMode; preservePosition?: boolean; hoverLookupGeneration?: number } = {}): Promise<void> {
        const sentence = lookupCandidateSentence(candidate.text);
        if (!sentence) return;
        const done = log.time('lookupTextAtPointer', { length: sentence.length, offset: candidate.offset, trigger });
        try {
            await this.showFirstPointerTextCandidate(candidate, sentence, trigger, options);
        } catch (error) {
            log.debug('Pointer text lookup failed quietly', { offset: candidate.offset }, error);
        } finally {
            done();
        }
    }

    private async showFirstPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<void> {
        if (await this.showParsedPointerTextCandidate(candidate, sentence, trigger, options)) return;
        if (await this.showLocalPointerTextCandidate(candidate, sentence, trigger, options)) return;
        if (await this.showFallbackPointerTextCandidate(candidate, sentence, trigger, options)) return;
        log.debug('Pointer text lookup found no local entry', { offset: candidate.offset });
    }

    private async showParsedPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const [tokens] = await this.parseJapanese([candidate.text]);
        const token = pointerTokenAtOffset(tokens ?? [], candidate.offset);
        if (!token) return false;
        await this.showPointerTextCard(token.card, token.sentence ?? sentence, candidate, { start: token.start, end: token.end }, trigger, options);
        return true;
    }

    private async showLocalPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const localMatch = await this.lookupLocalEntryAtOffset(candidate.text, candidate.offset);
        if (!localMatch) return false;
        const card = this.parser.localCardFromEntry(localMatch.entry);
        await this.showPointerTextCard(card, sentence, candidate, localMatch, trigger, options);
        return true;
    }

    private async showFallbackPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const fallbackTerm = fallbackLookupTermAtOffset(candidate.text, candidate.offset);
        if (!fallbackTerm) return false;
        log.debug('Pointer text lookup found no entries; showing fallback card', { fallbackTerm, offset: candidate.offset });
        const card = this.parser.fallbackCardFromText(fallbackTerm);
        await this.showPointerTextCard(card, sentence, candidate, candidate, trigger, options);
        return true;
    }

    private async showPointerTextCard(
        card: JPDBCard,
        sentence: string,
        candidate: PointerTextLookup,
        range: { start: number; end: number },
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<void> {
        const pointerTextLookup = { anchor: candidate.anchor, text: candidate.text, start: range.start, end: range.end };
        await this.showCard(card, sentence, candidate.anchor, {
            trigger,
            navigation: options.navigation ?? 'reset',
            preservePosition: options.preservePosition,
            hoverLookupKey: trigger === 'hover' ? this.activePointerTextLookupKey(candidate, range.start, range.end, card) : undefined,
            hoverLookupGeneration: options.hoverLookupGeneration,
            pointerTextLookup: trigger === 'hover' ? pointerTextLookup : undefined,
        });
    }

    private async lookupLocalEntryAtOffset(text: string, offset: number): Promise<LocalPointerTextEntryMatch | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const run = japaneseRunAt(text, offset);
        if (!run) return undefined;

        return await this.lookupLocalEntryInRun(text, run);
    }

    private async lookupLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): Promise<LocalPointerTextEntryMatch | undefined> {
        return await this.lookupForwardLocalEntryInRun(text, run)
            ?? await this.lookupBackwardLocalEntryInRun(text, run);
    }

    private async lookupForwardLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): Promise<LocalPointerTextEntryMatch | undefined> {
        const maxEnd = Math.min(run.end, run.offset + 18);
        for (let end = maxEnd; end > run.offset; end--) {
            const surface = text.slice(run.offset, end);
            const entry = await this.lookupSingleLocalSurface(surface);
            if (entry) return { entry, start: run.offset, end };
        }
        return undefined;
    }

    private async lookupBackwardLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): Promise<LocalPointerTextEntryMatch | undefined> {
        if (run.offset <= run.start) return undefined;
        for (let start = run.offset - 1; start >= run.start; start--) {
            const surface = text.slice(start, run.offset + 1);
            const entry = await this.lookupSingleLocalSurface(surface);
            if (entry) return { entry, start, end: run.offset + 1 };
        }
        return undefined;
    }

    private async lookupSingleLocalSurface(surface: string): Promise<YomitanTermEntry | undefined> {
        return (await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []))[0];
    }

    private async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        const silent = Boolean(options.silent);
        if (!this.beginVisiblePageScan()) return;
        const done = log.time('scanVisiblePage', { silent });
        try {
            await this.runVisiblePageScan(silent);
        } catch (error) {
            this.handleVisiblePageScanError(error, silent);
        } finally {
            this.finishVisiblePageScan();
            done();
        }
    }

    private beginVisiblePageScan(): boolean {
        if (!this.visiblePageScanInFlight) {
            this.visiblePageScanInFlight = true;
            return true;
        }
        log.debugThrottled('visible-page-scan-skipped', 1000, 'Visible page scan skipped because one is already running');
        return false;
    }

    private async runVisiblePageScan(silent: boolean): Promise<void> {
        const targets = collectScanTargets();
        if (!targets.length) {
            this.handleEmptyVisiblePageScan(silent);
            return;
        }

        const parsed = await this.parseJapanese(targets.map(target => target.text));
        this.applyVisiblePageScanTokens(targets, parsed);
        this.preloadVisiblePageScanTokens(parsed);
        this.logVisiblePageScanApplied(targets, parsed);
    }

    private applyVisiblePageScanTokens(targets: ScanTextTarget[], parsed: JPDBToken[][]): void {
        this.pauseAutoScanObserver(() => {
            targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
        });
    }

    private preloadVisiblePageScanTokens(parsed: JPDBToken[][]): void {
        const tokens = parsed.flat();
        this.preloadTermAudioForTokens(tokens);
        this.immersionPopover.preloadForTokens(tokens);
        void this.enrichAnkiWords(tokens);
    }

    private logVisiblePageScanApplied(targets: ScanTextTarget[], parsed: JPDBToken[][]): void {
        log.debugThrottled('visible-page-scan-applied', 2500, 'Visible page scan applied tokens', {
            targets: targets.length,
            tokens: parsed.reduce((sum, tokens) => sum + tokens.length, 0),
        });
    }

    private handleEmptyVisiblePageScan(silent: boolean): void {
        log.debug('Visible page scan found no targets', { silent });
        if (!silent) this.toast('No unscanned Japanese text found.');
    }

    private handleVisiblePageScanError(error: unknown, silent: boolean): void {
        log.warn('Visible page scan failed', error);
        if (!silent) this.toast(error instanceof Error ? error.message : 'JPDB scan failed.');
    }

    private finishVisiblePageScan(): void {
        this.visiblePageScanInFlight = false;
    }

    private async scanAsbPlayerSubtitles(): Promise<void> {
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return;

        const targets = roots.flatMap(root => collectTextTargetsIn(root, 12, false)).slice(0, 12);
        if (!targets.length) return;

        try {
            const parsed = await this.parseJapanese(targets.map(target => target.text));
            this.pauseAutoScanObserver(() => {
                targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
            });
            this.preloadTermAudioForTokens(parsed.flat());
            this.immersionPopover.preloadForTokens(parsed.flat());
            void this.enrichAnkiWords(parsed.flat());
            log.debugThrottled('asb-scan', 2500, 'ASB subtitles scanned', {
                targets: targets.length,
                tokens: parsed.reduce((sum, tokens) => sum + tokens.length, 0),
            });
        } catch (error) {
            log.debugThrottled('asb-scan-failed', 5000, 'ASB subtitle scan failed quietly', error);
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
        }
    }

    private async showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; hoverLookupGeneration?: number; previousNavigationEntry?: PopupNavigationEntry } = {}): Promise<void> {
        const card = this.cardForRenderedWord(word);
        if (!card) {
            return;
        }
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        this.rememberRenderedWordMiningContext(word, card, insideReaderPopup);
        const context = this.renderedWordDisplayContext(word, options, insideReaderPopup);
        if (context.hoverLookupKey && this.isActiveHoverLookup(context.hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return;
        }
        log.debug('Showing word card from rendered token', { term: card.spelling, trigger: context.trigger, source: card.source ?? 'jpdb' });
        this.preloadHoverWordAudio(word);
        await this.showCard(card, context.sentence, context.anchor, {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: context.insideReaderPopup,
            previousNavigationEntry: context.previousNavigationEntry,
            hoverLookupKey: context.hoverLookupKey,
            hoverLookupGeneration: options.hoverLookupGeneration,
            insideReaderPopup: context.insideReaderPopup,
        });
    }

    private cardForRenderedWord(word: HTMLElement): JPDBCard | undefined {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.getCachedCard(vid, sid);
        if (card) return card;
        log.warn('Clicked word missing from cache; scheduling page reparse', { vid, sid });
        this.scheduleVisiblePageReparse();
        return undefined;
    }

    private rememberRenderedWordMiningContext(word: HTMLElement, card: JPDBCard, insideReaderPopup: boolean): void {
        if (!insideReaderPopup || !word.closest('.jpdb-reader-example-card')) return;
        this.immersionPopover.rememberPageMiningContext(card, word.dataset.sentence || undefined, word);
    }

    private renderedWordDisplayContext(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
        insideReaderPopup: boolean,
    ): RenderedWordDisplayContext {
        const trigger = this.renderedWordTrigger(options.trigger, insideReaderPopup);
        const navigation = options.navigation ?? renderedWordNavigationMode(insideReaderPopup, trigger);
        return {
            sentence: this.renderedWordSentence(word),
            anchor: renderedWordAnchor(word, insideReaderPopup, this.activePopoverAnchor),
            trigger,
            navigation,
            hoverLookupKey: this.renderedWordHoverLookupKey(word, trigger),
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, insideReaderPopup, trigger, navigation),
            insideReaderPopup,
        };
    }

    private renderedWordSentence(word: HTMLElement): string | undefined {
        return nearestReadableSentenceForElement(word, word.dataset.sentence || '') || undefined;
    }

    private renderedWordHoverLookupKey(word: HTMLElement, trigger: 'modal' | 'hover'): string | undefined {
        return trigger === 'hover' ? this.hoverLookupKeyForWord(word) : undefined;
    }

    private renderedWordPreviousNavigationEntryForOptions(
        options: { previousNavigationEntry?: PopupNavigationEntry },
        insideReaderPopup: boolean,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): PopupNavigationEntry | undefined {
        return options.previousNavigationEntry ?? this.renderedWordPreviousNavigationEntry(insideReaderPopup, trigger, navigation);
    }

    private renderedWordTrigger(trigger: 'click' | 'hover' | undefined, insideReaderPopup: boolean): 'modal' | 'hover' {
        if (insideReaderPopup && this.activePopoverMode === 'hover') return 'hover';
        return trigger === 'hover' ? 'hover' : 'modal';
    }

    private renderedWordPreviousNavigationEntry(
        insideReaderPopup: boolean,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): PopupNavigationEntry | undefined {
        return insideReaderPopup && trigger === 'modal' && navigation === 'push-current'
            ? this.activeKanjiNavigationEntry()
            : undefined;
    }

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options: Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry'> = {}): void {
        if (!tokens.length) return;
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        this.prepareTokenListNavigation(trigger, navigation);
        log.debug('Rendering token disambiguation popup', { selected, tokens: tokens.length, trigger });
        const popover = this.createPopover();
        setInnerHtml(popover, this.renderTokenListHtml(tokens, selected));
        this.installTokenListHandlers(popover, tokens, anchor, { trigger, navigation, previousNavigationEntry: options.previousNavigationEntry });
        this.mountPopover(popover, anchor, { mode: trigger, preservePosition: options.preservePosition });
        void this.parsePopoverJapanese(popover);
    }

    private prepareTokenListNavigation(trigger: 'modal' | 'hover', navigation: CardNavigationMode): void {
        if (trigger === 'modal' && navigation === 'reset') this.clearWordNavigation();
    }

    private renderTokenListHtml(tokens: JPDBToken[], selected: string): string {
        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map(token => this.renderTokenListButton(token)).join('')}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml(selected)}</div>
        `;
    }

    private renderTokenListButton(token: JPDBToken): string {
        return `
            <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                ${escapeHtml(token.card.spelling)} ${this.renderTokenListReading(token)}
            </button>
        `;
    }

    private renderTokenListReading(token: JPDBToken): string {
        return token.card.reading !== token.card.spelling
            ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>`
            : '';
    }

    private installTokenListHandlers(
        popover: HTMLElement,
        tokens: JPDBToken[],
        anchor: HTMLElement | undefined,
        context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
    ): void {
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
            if (!button) return;
            this.showTokenListCard(button, tokens, anchor, context);
        });
    }

    private showTokenListCard(
        button: HTMLButtonElement,
        tokens: JPDBToken[],
        anchor: HTMLElement | undefined,
        context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
    ): void {
        const card = this.getCachedCard(Number(button.dataset.vid), Number(button.dataset.sid));
        if (!card) return;
        void this.showCard(card, tokens.find(token => token.card === card)?.sentence, anchor, {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: true,
            previousNavigationEntry: context.previousNavigationEntry,
        });
    }

    private showLocalDictionaryPopup(term: string, entries: YomitanTermEntry[], anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): void {
        log.debug('Rendering local dictionary popup', { term, entries: entries.length, trigger });
        const popover = this.createPopover();
        const grouped = groupTermEntriesByDictionary(entries);
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${escapeHtml(term)}</div>
                    <div class="jpdb-reader-reading">Yomitan dictionaries</div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack">
                ${renderLocalDefinitionSourcesSection(
                    Array.from(grouped.keys()),
                    grouped,
                    this.settings,
                    (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    { spelling: term, reading: '' },
                )}
            </div>
        `);
        popover.addEventListener('click', event => {
            this.handleDictionaryLookupLink(event, anchor, trigger);
        });
        this.mountPopover(popover, anchor, { mode: trigger });
        void this.parsePopoverJapanese(popover);
    }

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: CardDisplayOptions = {}): Promise<void> {
        this.lastCard = card;
        this.lastCardSentence = sentence;
        const popover = this.createPopover();
        const trigger = cardDisplayTrigger(options);
        const navigation = options.navigation ?? 'reset';
        const hoverLookupGeneration = trigger === 'hover' ? options.hoverLookupGeneration : undefined;
        const isCurrentHoverCard = () => hoverLookupGeneration === undefined || this.hoverLookupGeneration === hoverLookupGeneration;
        this.updateWordNavigation(card, sentence, trigger, navigation, options.previousNavigationEntry);
        this.clearKanjiNavigation();
        const done = log.time('showCard', { term: card.spelling, source: cardSourceLabel(card), trigger });
        this.rememberCardMiningContext(card, sentence, anchor, options);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        this.lastAnkiLookup = fallbackAnkiLookup;
        const renderData = this.loadCardRenderData(card);

        const mounted = await this.mountInitialCardShell(popover, card, sentence, anchor, {
            trigger,
            navigation,
            options,
            renderData,
            fallbackAnkiLookup,
            isCurrentHoverCard,
            hoverLookupGeneration,
        });
        if (!mounted) {
            done();
            return;
        }

        const renderState = { fullRenderCompleted: false };
        this.renderDeferredCardLocalEntries(popover, card, sentence, trigger, renderData, fallbackAnkiLookup, mounted, renderState, isCurrentHoverCard);

        const fullData = await renderData.all;
        renderState.fullRenderCompleted = true;
        if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) {
            log.debug('Discarding stale card render', { term: card.spelling, requestId: mounted.requestId });
            done();
            return;
        }
        this.renderCompletedCardPopover(popover, card, sentence, trigger, fullData);
        done();
    }

    private rememberCardMiningContext(card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: CardDisplayOptions): void {
        const hasNestedImmersionContext = options.insideReaderPopup && Boolean(this.immersionPopover.activeContextFor(card));
        if (hasNestedImmersionContext || this.immersionPopover.hasActiveContext(card, sentence)) return;
        this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
    }

    private async mountInitialCardShell(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        anchor: HTMLElement | undefined,
        context: {
            trigger: 'modal' | 'hover';
            navigation: CardNavigationMode;
            options: CardDisplayOptions;
            renderData: CardRenderDataLoad;
            fallbackAnkiLookup: AnkiLookupResult;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): Promise<MountedCardShell | null> {
        const instantLocalEntries = await waitForInstantData(context.renderData.localEntries, INSTANT_DICTIONARY_RENDER_WAIT_MS);
        if (!context.isCurrentHoverCard()) {
            log.debug('Discarding stale hover card before mount', { term: card.spelling, hoverLookupGeneration: context.hoverLookupGeneration });
            return null;
        }
        setInnerHtml(popover, this.renderCardPopoverContent(
            card,
            sentence,
            context.trigger,
            this.loadingCardRenderData(instantLocalEntries ?? [], context.fallbackAnkiLookup),
        ));
        this.installCardPopoverHandlers(popover, card, sentence, anchor, context.trigger);
        this.mountPopover(popover, anchor, {
            mode: context.trigger,
            preservePosition: this.initialCardPreservePosition(context),
            hoverLookupKey: context.options.hoverLookupKey,
            pointerTextLookup: context.options.pointerTextLookup,
        });
        const requestId = ++this.cardRenderRequest;
        log.debug('Card shell mounted', { term: card.spelling, trigger: context.trigger, instantLocalEntries: instantLocalEntries?.length ?? 0 });
        this.installInitialCardBehaviors(popover, card, sentence, context, instantLocalEntries);
        return { instantLocalEntries: instantLocalEntries ?? null, requestId };
    }

    private initialCardPreservePosition(context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; options: CardDisplayOptions }): boolean {
        return context.options.preservePosition ?? (context.trigger === 'modal' && context.navigation !== 'reset');
    }

    private installInitialCardBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        context: {
            options: CardDisplayOptions;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
        instantLocalEntries: YomitanTermEntry[] | null,
    ): void {
        this.maybeAutoPlayInitialCard(card, context);
        this.maybeParseInstantLocalEntries(popover, instantLocalEntries);
        this.installStudyTranslationLoader(popover, sentence);
        this.installStudyGrammarLoader(popover, sentence);
        this.maybeLoadImmersionExamples(popover, card);
    }

    private maybeAutoPlayInitialCard(
        card: JPDBCard,
        context: {
            options: CardDisplayOptions;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): void {
        if (!this.shouldAutoPlayInitialCard(card, context)) return;
        void this.playAudio(card, { hoverLookupGeneration: context.hoverLookupGeneration });
    }

    private shouldAutoPlayInitialCard(
        card: JPDBCard,
        context: { options: CardDisplayOptions; isCurrentHoverCard: () => boolean },
    ): boolean {
        return context.options.autoPlay !== false && context.isCurrentHoverCard() && this.shouldAutoPlay(card);
    }

    private maybeParseInstantLocalEntries(popover: HTMLElement, instantLocalEntries: YomitanTermEntry[] | null): void {
        if (instantLocalEntries?.length) void this.parsePopoverJapanese(popover);
    }

    private maybeLoadImmersionExamples(popover: HTMLElement, card: JPDBCard): void {
        if (this.settings.immersionKitEnabled) void this.immersionPopover.loadExamples(popover, card);
    }

    private renderDeferredCardLocalEntries(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        renderData: CardRenderDataLoad,
        fallbackAnkiLookup: AnkiLookupResult,
        mounted: MountedCardShell,
        renderState: { fullRenderCompleted: boolean },
        isCurrentHoverCard: () => boolean,
    ): void {
        if (mounted.instantLocalEntries !== null) return;
        void renderData.localEntries.then(localEntries => {
            if (renderState.fullRenderCompleted || !this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
            setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, this.loadingCardRenderData(localEntries, this.lastAnkiLookup ?? fallbackAnkiLookup)));
            log.debug('Card local dictionaries rendered', { term: card.spelling, localEntries: localEntries.length });
            this.repositionActivePopover();
            void this.parsePopoverJapanese(popover);
        });
    }

    private renderCompletedCardPopover(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
    ): void {
        this.lastAnkiLookup = data.ankiLookup;
        this.applyAnkiLookupToRenderedWords(card, data.ankiLookup);
        setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, { ...data, loading: false }));

        log.debug('Card rendered', {
            term: card.spelling,
            localEntries: data.localEntries.length,
            kanjiEntries: data.kanjiEntries.length,
            metaEntries: data.metaEntries.length,
            ankiState: data.ankiLookup.state,
            hasJpdb: this.isJpdbBackedCard(card),
        });
        this.repositionActivePopover();
        void this.parsePopoverJapanese(popover);
        if (this.settings.immersionKitEnabled) {
            const immersionExamples = this.immersionPopover.searchExamples(card, {
                relatedQueries: this.immersionRelatedQueries(data.jpdbVocabularyInfo),
            });
            void this.immersionPopover.loadExamples(popover, card, immersionExamples);
        }
        this.installStudyTranslationLoader(popover, sentence);
        this.installStudyGrammarLoader(popover, sentence);
    }

    private loadingCardRenderData(localEntries: YomitanTermEntry[], ankiLookup: AnkiLookupResult): CardRenderData & { loading: boolean } {
        return {
            localEntries,
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: true,
        };
    }

    private isCurrentCardRender(popover: HTMLElement, requestId: number, isCurrentHoverCard: () => boolean): boolean {
        return isCurrentHoverCard()
            && requestId === this.cardRenderRequest
            && popover.isConnected
            && this.activePopover === popover;
    }

    private immersionRelatedQueries(info: JpdbVocabularyInfo | null): string[] {
        if (!info) return [];
        return info.compounds.flatMap(compound => [compound.term, compound.reading]).filter(Boolean);
    }

    private renderCardPopoverContent(
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData & { loading: boolean },
    ): string {
        const view = this.cardPopoverRenderView(card, data);

        return `
            <div class="jpdb-reader-popover-body">
                <div class="jpdb-reader-sheet-handle"></div>
                ${this.renderWordHistoryNavigation(view.language, trigger)}
                ${this.renderCardHeader(card, data, view)}
                ${this.renderCardPartOfSpeech(view)}
                ${this.renderDefinitionSources(card, data.localEntries, sentence, data.jpdbVocabularyInfo)}
                ${view.loadingDetails}
                ${this.renderCardAnkiExistingSection(data, view)}
                ${renderKanjiDefinitions(data.kanjiEntries, (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded), name => this.dictionaryLabel(name))}
            </div>
            ${this.renderCardActions(view)}
        `;
    }

    private cardPopoverRenderView(card: JPDBCard, data: CardRenderData & { loading: boolean }): CardPopoverRenderView {
        const cardStates = normalizeCardStates(card.cardState);
        const state = primaryCardState(cardStates);
        const language = this.settings.interfaceLanguage;
        const hasJpdb = this.isJpdbBackedCard(card);
        const selectedDeckLabel = this.jpdbDeckLabel(this.settings.miningDeck.trim() || 'forq', data.jpdbDecks);
        const reviewBlockReason = !data.ankiLookup.primary?.primaryCardId ? this.reviewBlockReason(cardStates, language) : '';
        return {
            cardStates,
            state,
            storedContext: data.loading ? null : loadMiningContext(card.spelling),
            jpdbUrl: `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`,
            cardPos: formatPartOfSpeech(card.partOfSpeech),
            cardPosDetails: formatPartOfSpeechDetails(card.partOfSpeech),
            language,
            hasJpdb,
            miningActions: this.renderJpdbMiningActions(cardStates, language, data, hasJpdb),
            ankiActions: data.loading ? '' : renderAnkiActionRow(data.ankiLookup, this.settings),
            reviewButtons: this.renderCardReviewButtons(cardStates, data, hasJpdb, selectedDeckLabel, reviewBlockReason, language),
            metaItems: this.renderCardMetaItems(card, hasJpdb, state, data),
            loadingDetails: this.renderCardLoadingDetails(data.loading),
        };
    }

    private renderCardHeader(card: JPDBCard, data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        return `<div class="jpdb-reader-header">
            <div class="jpdb-reader-heading">
                ${this.renderCardTitleRow(card, view)}
                ${this.renderWordPills(card, view.jpdbUrl, data.metaEntries)}
            </div>
            <div class="jpdb-reader-card-tools">
                ${this.renderCardPitch(card, data)}
                <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button" aria-label="${uiText(view.language, 'playAudio')}" title="${uiText(view.language, 'playAudio')}">${speakerIcon()}</button>
            </div>
        </div>`;
    }

    private renderCardTitleRow(card: JPDBCard, view: CardPopoverRenderView): string {
        return `<div class="jpdb-reader-title-row">
            <div class="jpdb-reader-spelling jpdb-${view.state}">${renderSpellingForKanjiNavigation(card.spelling, view.language)}</div>
            ${this.renderCardReading(card)}
            ${this.renderCardMeta(view.metaItems)}
        </div>`;
    }

    private renderCardReading(card: JPDBCard): string {
        return card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(card.reading)}</div>` : '';
    }

    private renderCardMeta(metaItems: string[]): string {
        return metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : '';
    }

    private renderCardPitch(card: JPDBCard, data: CardRenderData & { loading: boolean }): string {
        return this.settings.showPitchAccent ? renderPitch(card, data.metaEntries) : '';
    }

    private renderCardPartOfSpeech(view: CardPopoverRenderView): string {
        return view.cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(view.cardPosDetails)}">${escapeHtml(view.cardPos)}</div>` : '';
    }

    private renderCardAnkiExistingSection(data: CardRenderData & { loading: boolean }, view: CardPopoverRenderView): string {
        return data.loading ? '' : renderAnkiExistingSection(data.ankiLookup, view.storedContext);
    }

    private renderCardActions(view: CardPopoverRenderView): string {
        return `<div class="jpdb-reader-actions${view.miningActions ? ' jpdb-reader-actions-has-mining jpdb-reader-actions-mining-collapsed' : ''}">
            ${this.renderCardMiningGutter(view.miningActions)}
            ${view.miningActions}
            ${view.ankiActions}
            ${view.reviewButtons}
        </div>`;
    }

    private renderCardMiningGutter(miningActions: string): string {
        return miningActions
            ? '<div class="jpdb-reader-actions-gutter"><button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="Show mining actions" aria-label="Show mining actions"></button></div>'
            : '';
    }

    private renderJpdbMiningActions(
        cardStates: ReturnType<typeof normalizeCardStates>,
        language: InterfaceLanguage,
        data: CardRenderData & { loading: boolean },
        hasJpdb: boolean,
    ): string {
        if (!this.canRenderJpdbMiningActions(hasJpdb)) return '';
        const state = miningActionState(cardStates, language);
        const addDeckSelect = this.renderAddDeckSelect(data, language);
        return this.renderJpdbMiningActionDetails(language, state, addDeckSelect);
    }

    private canRenderJpdbMiningActions(hasJpdb: boolean): boolean {
        return hasJpdb && Boolean(this.settings.apiKey.trim()) && this.settings.jpdbMiningEnabled;
    }

    private renderAddDeckSelect(data: CardRenderData & { loading: boolean }, language: InterfaceLanguage): string {
        const deckOptions = this.renderDeckChoiceOptions(data.jpdbDecks, data.ankiDecks, true);
        if (!deckOptions) return '';
        return `<select class="jpdb-reader-add-deck-select" data-add-deck-select aria-label="${escapeHtml(uiText(language, 'deck'))}">${deckOptions}</select>`;
    }

    private renderJpdbMiningActionDetails(language: InterfaceLanguage, state: MiningActionState, addDeckSelect: string): string {
        const addToDeckLabel = `${uiText(language, 'addToDeck')} +`;
        return `
                <div class="jpdb-reader-mining-details" role="group" aria-label="${escapeHtml(uiText(language, 'deckActions'))}">
                    <div class="jpdb-reader-row jpdb-reader-mining-action-row" style="--cols: 3">
                        <button class="jpdb-reader-btn add jpdb-reader-mining-title" data-action="deck-picker" title="${escapeHtml(uiText(language, 'addToDeckHint'))}" aria-expanded="false">${escapeHtml(addToDeckLabel)}</button>
                        <button class="jpdb-reader-btn nf${state.isNeverForget ? ' danger' : ''}" data-action="neverforget" title="${escapeHtml(state.neverForgetTitle)}" aria-pressed="${state.isNeverForget}">${state.neverForgetLabel}</button>
                        <button class="jpdb-reader-btn blacklist" data-action="blacklist" title="${escapeHtml(state.blacklistTitle)}" aria-pressed="${state.isBlacklisted}">${state.blacklistLabel}</button>
                    </div>
                    ${addDeckSelect}
                </div>
            `;
    }

    private renderCardReviewButtons(
        cardStates: ReturnType<typeof normalizeCardStates>,
        data: CardRenderData & { loading: boolean },
        hasJpdb: boolean,
        selectedDeckLabel: string,
        reviewBlockReason: string,
        language: InterfaceLanguage,
    ): string {
        if (!this.shouldRenderCardReviewButtons(data, hasJpdb, reviewBlockReason)) return '';
        return renderReviewButtons(this.settings, data.ankiLookup.primary, {
            title: cardStates.includes('not-in-deck') ? `${uiText(language, 'reviewAddsToDeck')} ${selectedDeckLabel}` : '',
        });
    }

    private shouldRenderCardReviewButtons(data: CardRenderData & { loading: boolean }, hasJpdb: boolean, reviewBlockReason: string): boolean {
        if (reviewBlockReason || data.loading || !this.settings.enableReviews) return false;
        return this.canReviewWithJpdb(hasJpdb) || Boolean(data.ankiLookup.primary?.primaryCardId);
    }

    private canReviewWithJpdb(hasJpdb: boolean): boolean {
        return hasJpdb && Boolean(this.settings.apiKey.trim()) && this.settings.jpdbMiningEnabled;
    }

    private renderCardMetaItems(card: JPDBCard, hasJpdb: boolean, state: string, data: CardRenderData & { loading: boolean }): string[] {
        return [
            card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '',
            hasJpdb ? `<span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(state)}</span>` : '',
            data.ankiLookup.primary ? `<span><span class="jpdb-reader-state-dot jpdb-${data.ankiLookup.state}"></span>Anki ${escapeHtml(data.ankiLookup.state)}</span>` : '',
        ].filter(Boolean);
    }

    private renderCardLoadingDetails(loading: boolean): string {
        return loading ? '<div class="jpdb-reader-help" data-card-details-loading>Loading dictionary details...</div>' : '';
    }

    private renderDeckChoiceOptions(jpdbDecks: JPDBDeck[], ankiDecks: string[], includeJpdb: boolean): string {
        const options: Array<[string, string]> = [];
        if (includeJpdb) this.addJpdbDeckChoiceOptions(options, jpdbDecks);
        if (this.settings.ankiEnabled) this.addAnkiDeckChoiceOptions(options, ankiDecks);
        if (!options.length) return '';
        return this.deckChoicePlaceholderOption() + options.map(renderDeckChoiceOption).join('');
    }

    private addJpdbDeckChoiceOptions(options: Array<[string, string]>, jpdbDecks: JPDBDeck[]): void {
        const selected = this.settings.miningDeck.trim() || 'forq';
        addDeckChoiceOption(options, 'jpdb', 'forq', 'JPDB: FORQ');
        addDeckChoiceOption(options, 'jpdb', selected, `JPDB: ${this.jpdbDeckLabel(selected, jpdbDecks)}`);
        for (const deck of jpdbDecks) {
            if (!this.isSpecialJpdbDeck(deck)) addDeckChoiceOption(options, 'jpdb', deck.id, `JPDB: ${deck.name}`);
        }
    }

    private addAnkiDeckChoiceOptions(options: Array<[string, string]>, ankiDecks: string[]): void {
        const configuredDeck = this.settings.ankiDeck || 'よむ';
        addDeckChoiceOption(options, 'anki', configuredDeck, `Anki: ${configuredDeck}`);
        for (const deck of ankiDecks) addDeckChoiceOption(options, 'anki', deck, `Anki: ${deck}`);
    }

    private deckChoicePlaceholderOption(): string {
        return `<option value="" disabled selected>${escapeHtml(uiText(this.settings.interfaceLanguage, 'deck'))}</option>`;
    }

    private jpdbDeckLabel(deckId: string, decks: JPDBDeck[]): string {
        if (deckId === 'forq') return 'FORQ';
        const deck = decks.find(candidate => candidate.id === deckId);
        return deck?.name || deckId;
    }

    private isSpecialJpdbDeck(deck: JPDBDeck): boolean {
        const neverForgetDeck = this.settings.neverForgetDeck.trim();
        const blacklistDeck = this.settings.blacklistDeck.trim();
        if (deck.id === neverForgetDeck || deck.id === blacklistDeck) return true;
        return /never\s*-?\s*forget|blacklist|suspend/i.test(`${deck.id} ${deck.name}`);
    }

    private reviewBlockReason(cardStates: ReturnType<typeof normalizeCardStates>, language: InterfaceLanguage): string {
        if (cardStates.includes('blacklisted')) return uiText(language, 'reviewBlockedBlacklisted');
        if (cardStates.includes('never-forget')) return uiText(language, 'reviewBlockedNeverForget');
        return '';
    }

    private loadCardRenderData(card: JPDBCard): CardRenderDataLoad {
        const key = this.cardRenderDataCacheKey(card);
        const now = Date.now();
        const cached = this.cardRenderDataCache.get(key);
        if (cached && cached.expiresAt > now) {
            log.debug('Card render data cache hit', { term: card.spelling });
            return cached.load;
        }

        const load = this.fetchCardRenderData(card);
        void load.all.catch(() => {
            if (this.cardRenderDataCache.get(key)?.load === load) this.cardRenderDataCache.delete(key);
        });
        this.cardRenderDataCache.set(key, { expiresAt: now + CARD_RENDER_DATA_CACHE_TTL_MS, load });
        return load;
    }

    private fetchCardRenderData(card: JPDBCard): CardRenderDataLoad {
        const timeoutMs = this.cardRenderDetailTimeoutMs();
        const localEntries = this.loadLocalTermRenderEntries(card, timeoutMs);
        const all = this.loadAllCardRenderData(card, timeoutMs, localEntries);
        return { localEntries, all };
    }

    private cardRenderDetailTimeoutMs(): number {
        return Math.max(CARD_RENDER_DETAIL_TIMEOUT_MS, this.settings.audioTimeoutMs + 1_000);
    }

    private withCardRenderFallback<T>(card: JPDBCard, timeoutMs: number, detail: string, promise: Promise<T>, fallback: T): Promise<T> {
        return cardRenderDetailWithFallback(detail, card, promise, fallback, timeoutMs);
    }

    private loadLocalTermRenderEntries(card: JPDBCard, timeoutMs: number): Promise<YomitanTermEntry[]> {
        if (!this.settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withCardRenderFallback(card, timeoutMs, 'local term dictionary', this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
            log.warn('Local term lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanTermEntry[]);
    }

    private loadLocalKanjiRenderEntries(card: JPDBCard, timeoutMs: number): Promise<YomitanKanjiEntry[]> {
        if (!this.settings.localDictionariesEnabled || !this.settings.localDictionaryShowKanji) return Promise.resolve([]);
        return this.withCardRenderFallback(card, timeoutMs, 'local kanji dictionary', this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
            log.warn('Local kanji lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanKanjiEntry[]);
    }

    private loadLocalMetaRenderEntries(card: JPDBCard, timeoutMs: number): Promise<YomitanMetaEntry[]> {
        if (!this.settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withCardRenderFallback(card, timeoutMs, 'local metadata dictionary', this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(error => {
            log.warn('Local metadata lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanMetaEntry[]);
    }

    private loadPublicPitchRenderData(card: JPDBCard, timeoutMs: number): Promise<string[]> {
        if (!this.settings.showPitchAccent || card.pitchAccent.length) return Promise.resolve([]);
        return this.withCardRenderFallback(card, timeoutMs, 'JPDB public pitch', this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(error => {
            log.warn('Public JPDB pitch lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private loadJpdbVocabularyRenderInfo(card: JPDBCard, timeoutMs: number): Promise<JpdbVocabularyInfo | null> {
        if (!this.settings.jpdbDefinitionsEnabled) return Promise.resolve(null);
        return this.withCardRenderFallback(card, timeoutMs, 'JPDB vocabulary details', this.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(error => {
            log.warn('JPDB vocabulary page lookup failed while rendering card', { term: card.spelling }, error);
            return null;
        }), null as JpdbVocabularyInfo | null);
    }

    private loadAnkiRenderLookup(card: JPDBCard, timeoutMs: number): Promise<AnkiLookupResult> {
        const fallback: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        if (!this.settings.ankiEnabled) return Promise.resolve(fallback);
        return this.withCardRenderFallback(card, timeoutMs, 'Anki existing cards', this.anki.findExistingCards(card).catch(error => {
            log.warn('Anki lookup failed while rendering card', { term: card.spelling }, error);
            return fallback;
        }), fallback);
    }

    private loadJpdbDeckRenderList(card: JPDBCard, timeoutMs: number): Promise<JPDBDeck[]> {
        if (!this.settings.jpdbMiningEnabled || !this.settings.apiKey.trim() || !this.isJpdbBackedCard(card)) return Promise.resolve([]);
        return this.withCardRenderFallback(card, timeoutMs, 'JPDB deck list', this.jpdb.listDecks().catch(error => {
            log.warn('JPDB deck list failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as JPDBDeck[]);
    }

    private loadAnkiDeckRenderList(card: JPDBCard, timeoutMs: number): Promise<string[]> {
        if (!this.settings.ankiEnabled) return Promise.resolve([]);
        return this.withCardRenderFallback(card, timeoutMs, 'Anki deck list', this.anki.deckNames().catch(error => {
            log.warn('Anki deck list failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private loadAllCardRenderData(card: JPDBCard, timeoutMs: number, localEntries: Promise<YomitanTermEntry[]>): Promise<CardRenderData> {
        return Promise.all([
            localEntries,
            this.loadLocalKanjiRenderEntries(card, timeoutMs),
            this.loadLocalMetaRenderEntries(card, timeoutMs),
            this.loadPublicPitchRenderData(card, timeoutMs),
            this.loadAnkiRenderLookup(card, timeoutMs),
            this.loadJpdbDeckRenderList(card, timeoutMs),
            this.loadAnkiDeckRenderList(card, timeoutMs),
            this.loadJpdbVocabularyRenderInfo(card, timeoutMs),
        ]).then(([localEntriesValue, kanjiEntries, metaEntries, jpdbPublicPitch, ankiLookup, jpdbDecks, ankiDecks, jpdbVocabularyInfo]) => {
            if (!card.pitchAccent.length && jpdbPublicPitch.length) card.pitchAccent = jpdbPublicPitch;
            return { localEntries: localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, ankiDecks, jpdbVocabularyInfo };
        });
    }

    private cardRenderDataCacheKey(card: JPDBCard): string {
        return JSON.stringify({
            card: cardKey(card),
            local: this.settings.localDictionariesEnabled,
            kanji: this.settings.localDictionaryShowKanji,
            max: this.settings.localDictionaryMaxResults,
            pitch: this.settings.showPitchAccent,
            anki: this.settings.ankiEnabled,
            dictionaries: this.settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        });
    }

    private installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
        popover.addEventListener('pointerdown', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="mining-collapse"]');
            if (!button) return;
            this.startMiningControlsDrag(event, button);
        });
        popover.addEventListener('pointermove', event => this.updateMiningControlsDrag(event));
        popover.addEventListener('pointerup', event => this.finishMiningControlsDrag(event, true));
        popover.addEventListener('pointercancel', event => this.finishMiningControlsDrag(event, false));
        popover.addEventListener('click', event => {
            if (this.handleDictionaryLookupLink(event, anchor, trigger)) return;
            const kanjiButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="kanji"]');
            if (kanjiButton) {
                event.preventDefault();
                event.stopPropagation();
                void this.showKanjiCard(card, kanjiButton.dataset.kanji ?? '', sentence, anchor, { preservePosition: true });
                return;
            }
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            if (button.dataset.action === 'word-history-back') {
                void this.showPreviousWord(anchor, trigger);
                return;
            }
            if (button.dataset.action === 'mining-collapse') {
                if (this.suppressedMiningToggleClicks.delete(button)) return;
                this.toggleMiningControls(button);
                return;
            }
            if (button.dataset.action === 'deck-picker') {
                if (this.openDeckPickerForAdd(button, card, sentence)) return;
            }
            if (button.dataset.action === 'add' && this.openDeckPickerForAdd(button, card, sentence)) return;
            void this.handleCardAction(button, card, sentence);
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

    private startMiningControlsDrag(event: PointerEvent, button: HTMLButtonElement): void {
        if (event.button !== undefined && event.button !== 0) return;
        this.miningControlsDrag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            moved: false,
            button,
        };
        button.classList.add('jpdb-reader-mining-drawer-handle-dragging');
        button.setPointerCapture?.(event.pointerId);
    }

    private updateMiningControlsDrag(event: PointerEvent): void {
        const drag = this.miningControlsDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.lastY = event.clientY;
        const delta = drag.lastY - drag.startY;
        if (Math.abs(delta) > 6) drag.moved = true;
        if (!drag.moved) return;
        event.preventDefault();
        drag.button.style.setProperty('--jpdb-reader-mining-drawer-drag-y', `${Math.max(-10, Math.min(10, delta * 0.18))}px`);
    }

    private finishMiningControlsDrag(event: PointerEvent, commit: boolean): void {
        const drag = this.currentMiningControlsDragForEvent(event);
        if (!drag) return;
        this.clearMiningControlsDrag(drag);
        if (!this.shouldCommitMiningControlsDrag(drag, commit)) return;
        this.commitMiningControlsDrag(drag);
    }

    private currentMiningControlsDragForEvent(event: PointerEvent): MiningControlsDrag | undefined {
        const drag = this.miningControlsDrag;
        return drag && event.pointerId === drag.pointerId ? drag : undefined;
    }

    private clearMiningControlsDrag(drag: MiningControlsDrag): void {
        this.miningControlsDrag = undefined;
        drag.button.releasePointerCapture?.(drag.pointerId);
        drag.button.classList.remove('jpdb-reader-mining-drawer-handle-dragging');
        drag.button.style.removeProperty('--jpdb-reader-mining-drawer-drag-y');
    }

    private commitMiningControlsDrag(drag: MiningControlsDrag): void {
        this.suppressedMiningToggleClicks.add(drag.button);
        const expanded = this.miningControlsExpandedAfterDrag(drag);
        if (expanded !== undefined) this.setMiningControlsExpanded(drag.button, expanded);
    }

    private miningControlsExpandedAfterDrag(drag: MiningControlsDrag): boolean | undefined {
        const delta = drag.lastY - drag.startY;
        if (delta <= -24) return true;
        if (delta >= 24) return false;
        return undefined;
    }

    private shouldCommitMiningControlsDrag(drag: MiningControlsDrag, commit: boolean): boolean {
        return commit && drag.moved;
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

    private updateWordNavigation(card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', mode: CardNavigationMode, previousNavigationEntry?: PopupNavigationEntry): void {
        if (trigger !== 'modal') {
            this.clearWordNavigation();
            return;
        }

        const next: CardNavigationEntry = { card, sentence };
        if (mode === 'reset') this.wordNavigationStack = [];
        else this.pushPreviousWordNavigation(mode, next, previousNavigationEntry);
        this.currentWordNavigation = next;
    }

    private pushPreviousWordNavigation(mode: CardNavigationMode, next: CardNavigationEntry, previousNavigationEntry?: PopupNavigationEntry): void {
        const previous = previousNavigationEntry ?? this.previousWordNavigationEntry(next);
        if (!this.shouldPushPreviousWordNavigation(mode, previous, next)) return;
        this.pushDistinctWordNavigationEntry(previous);
    }

    private shouldPushPreviousWordNavigation(mode: CardNavigationMode, previous: PopupNavigationEntry | undefined, next: CardNavigationEntry): previous is PopupNavigationEntry {
        if (mode !== 'push-current') return false;
        if (!previous) return false;
        return !this.isSameNavigationEntryAsWord(previous, next);
    }

    private pushDistinctWordNavigationEntry(previous: PopupNavigationEntry): void {
        const lastStackEntry = this.wordNavigationStack[this.wordNavigationStack.length - 1];
        if (!lastStackEntry || !this.isSamePopupNavigationEntry(lastStackEntry, previous)) this.wordNavigationStack.push(previous);
    }

    private previousWordNavigationEntry(next: CardNavigationEntry): PopupNavigationEntry | undefined {
        return this.currentWordNavigation && !this.isSameNavigationCard(this.currentWordNavigation, next)
            ? this.wordNavigationEntry(this.currentWordNavigation)
            : undefined;
    }

    private clearWordNavigation(): void {
        this.wordNavigationStack = [];
        this.currentWordNavigation = undefined;
    }

    private wordNavigationEntry(entry: CardNavigationEntry): PopupNavigationEntry {
        return { kind: 'word', card: entry.card, sentence: entry.sentence };
    }

    private kanjiNavigationEntry(entry: KanjiNavigationEntry): PopupNavigationEntry {
        return { kind: 'kanji', card: entry.card, sentence: entry.sentence, kanji: entry.kanji };
    }

    private activeKanjiNavigationEntry(): PopupNavigationEntry | undefined {
        if (!this.currentKanjiNavigation || !this.activePopover?.isConnected) return undefined;
        if (!this.activePopover.querySelector('.jpdb-reader-kanji-display')) return undefined;
        return this.kanjiNavigationEntry(this.currentKanjiNavigation);
    }

    private updateKanjiNavigation(card: JPDBCard, kanji: string, sentence: string | undefined, mode: CardNavigationMode): void {
        const next: KanjiNavigationEntry = { card, kanji, sentence };
        if (mode === 'reset') {
            this.kanjiNavigationStack = [];
            this.currentKanjiNavigation = next;
            return;
        }

        const previous = this.previousKanjiNavigationToPush(mode, next);
        if (previous) this.pushDistinctKanjiNavigationEntry(previous);
        this.currentKanjiNavigation = next;
    }

    private previousKanjiNavigationToPush(mode: CardNavigationMode, next: KanjiNavigationEntry): KanjiNavigationEntry | undefined {
        const current = this.currentKanjiNavigation;
        if (mode !== 'push-current') return undefined;
        if (!current) return undefined;
        return this.isSameNavigationKanji(current, next) ? undefined : current;
    }

    private pushDistinctKanjiNavigationEntry(entry: KanjiNavigationEntry): void {
        const lastStackEntry = this.kanjiNavigationStack[this.kanjiNavigationStack.length - 1];
        if (!lastStackEntry || !this.isSameNavigationKanji(lastStackEntry, entry)) this.kanjiNavigationStack.push(entry);
    }

    private clearKanjiNavigation(): void {
        this.kanjiNavigationStack = [];
        this.currentKanjiNavigation = undefined;
    }

    private isSameNavigationCard(first: CardNavigationEntry, second: CardNavigationEntry): boolean {
        return cardKey(first.card) === cardKey(second.card);
    }

    private isSameNavigationKanji(first: KanjiNavigationEntry, second: KanjiNavigationEntry): boolean {
        return this.isSameNavigationCard(first, second) && first.kanji === second.kanji;
    }

    private isSameNavigationEntryAsWord(entry: PopupNavigationEntry, word: CardNavigationEntry): boolean {
        return entry.kind === 'word' && this.isSameNavigationCard(entry, word);
    }

    private isSamePopupNavigationEntry(first: PopupNavigationEntry, second: PopupNavigationEntry): boolean {
        if (first.kind !== second.kind) return false;
        if (first.kind === 'kanji' && second.kind === 'kanji') return this.isSameNavigationKanji(first, second);
        return this.isSameNavigationCard(first, second);
    }

    private renderWordHistoryNavigation(language: InterfaceLanguage, trigger: 'modal' | 'hover'): string {
        if (trigger !== 'modal') return '';
        const previous = this.wordNavigationStack[this.wordNavigationStack.length - 1];
        if (!previous) return '';
        return this.renderModalNavigation({
            backAction: 'word-history-back',
            backTitle: previous.kind === 'kanji'
                ? `${uiText(language, 'backToKanji')}: ${previous.kanji}`
                : `${uiText(language, 'backToWord')}: ${previous.card.spelling}`,
            label: previous.kind === 'kanji' ? previous.kanji : previous.card.spelling,
        });
    }

    private renderModalNavigation(options: ModalNavigationOptions): string {
        return `
            <div class="jpdb-reader-modal-nav">
                <button class="jpdb-reader-icon-mini" type="button" data-action="${escapeHtml(options.backAction)}" title="${escapeHtml(options.backTitle)}" aria-label="${escapeHtml(options.backTitle)}">←</button>
                <span title="${escapeHtml(options.label)}">${escapeHtml(options.label)}</span>
                ${options.controlsHtml ?? ''}
            </div>
        `;
    }

    private async showPreviousWord(anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): Promise<void> {
        const previous = this.wordNavigationStack.pop();
        if (!previous) return;
        if (previous.kind === 'kanji') {
            await this.showKanjiCard(previous.card, previous.kanji, previous.sentence, anchor, {
                navigation: 'preserve',
                preservePosition: true,
            });
            return;
        }
        await this.showCard(previous.card, previous.sentence, anchor, {
            autoPlay: false,
            trigger,
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private async showPreviousKanji(anchor?: HTMLElement): Promise<void> {
        const previous = this.kanjiNavigationStack.pop();
        if (!previous) return;
        await this.showKanjiCard(previous.card, previous.kanji, previous.sentence, anchor, {
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private shouldAutoPlay(card: JPDBCard): boolean {
        if (!this.settings.autoPlayAudio) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
        this.lastAutoAudioKey = key;
        this.lastAutoAudioAt = now;
        return true;
    }

    private renderWordPills(card: JPDBCard, jpdbUrl: string, metaEntries: YomitanMetaEntry[] = [], overrideQuery?: string): string {
        const context = this.wordPillContext(card, overrideQuery);
        const query = context.query;
        const language = this.settings.interfaceLanguage;
        const linkPills = this.settings.dictionaryLookupLinks
            .filter(link => link.enabled)
            .map(link => {
                const style = pillStyle(`lookup:${link.id || link.label}`);
                if (link.action === 'copy' || link.id === 'copy') {
                    const copyTitle = uiText(language, 'copyWordTitle');
                    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-word" type="button" style="${style}" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(link.label || uiText(language, 'copyWord'))} ${copyIcon()}</button>`;
                }
                const url = link.id === 'jpdb' && (Boolean(overrideQuery) || this.isJpdbBackedCard(card))
                    ? jpdbUrl
                    : formatLookupUrl(link.urlTemplate, context);
                if (!url) return '';
                const title = link.id === 'jpdb'
                    ? (overrideQuery ? uiText(language, 'openKanjiOnJpdb') : uiText(language, 'openOnJpdb'))
                    : `Open on ${link.label}`;
                const classes = `jpdb-reader-pill jpdb-reader-action-pill${link.id === 'jpdb' ? ' jpdb-reader-jpdb-pill' : ''}`;
                return `<a class="${classes}" href="${escapeHtml(url)}" target="_blank" rel="noopener" style="${style}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
            })
            .filter(Boolean);
        const frequencyPills = renderFrequencyPills(metaEntries, this.settings, name => this.dictionaryLabel(name));
        const pills = [...linkPills, ...frequencyPills];
        return pills.length ? `<div class="jpdb-reader-word-pills">${pills.join('')}</div>` : '';
    }

    private wordPillContext(card: JPDBCard, overrideQuery?: string): WordPillContext {
        return {
            query: this.wordPillQuery(card, overrideQuery),
            word: this.wordPillWord(card, overrideQuery),
            reading: this.wordPillReading(card, overrideQuery),
            vid: String(Math.max(0, card.vid)),
            sid: String(Math.max(0, card.sid)),
        };
    }

    private wordPillQuery(card: JPDBCard, overrideQuery?: string): string {
        return overrideQuery || card.spelling || card.reading;
    }

    private wordPillWord(card: JPDBCard, overrideQuery?: string): string {
        return overrideQuery || card.spelling;
    }

    private wordPillReading(card: JPDBCard, overrideQuery?: string): string {
        return overrideQuery || card.reading || card.spelling;
    }

    private async showKanjiCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: { navigation?: CardNavigationMode; preservePosition?: boolean } = {}): Promise<void> {
        if (!isKanjiCharacter(kanji)) return;
        const navigation = options.navigation ?? 'reset';
        this.updateKanjiNavigation(card, kanji, sentence, navigation);
        log.debug('Rendering kanji card', { term: card.spelling, kanji });
        const popover = this.createPopover();
        const language = this.settings.interfaceLanguage;
        const kanjiCharacters = uniqueKanji(card.spelling);
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const detailsPromises = this.kanjiDetailPromises(kanji);
        this.renderKanjiCardShell(popover, card, kanji, kanjiCharacters, jpdbUrl, language);
        this.installKanjiCardActions(popover, card, kanji, sentence, anchor);
        this.mountPopover(popover, anchor, { preservePosition: options.preservePosition });
        this.startKanjiProgressiveRender(popover, detailsPromises, card, kanji, language);
    }

    private kanjiDetailPromises(kanji: string): KanjiDetailPromises {
        const needsKanjiVG = this.settings.kanjivgEnabled || (this.settings.kanjiOriginsEnabled && this.settings.kanjiOriginGraphEnabled);
        return {
            jpdbInfo: this.jpdbKanjiDetailPromise(kanji),
            kanjiEntries: this.localKanjiEntriesPromise(kanji),
            rtkInfo: this.rtkDetailPromise(kanji),
            kanjiVGInfo: needsKanjiVG ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
    }

    private jpdbKanjiDetailPromise(kanji: string): Promise<JpdbKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private localKanjiEntriesPromise(kanji: string): Promise<YomitanKanjiEntry[]> {
        return this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private rtkDetailPromise(kanji: string): Promise<RtkInfo | null> {
        return this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private renderKanjiCardShell(popover: HTMLElement, card: JPDBCard, kanji: string, kanjiCharacters: string[], jpdbUrl: string, language: InterfaceLanguage): void {
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            ${this.renderModalNavigation({
                ...this.kanjiModalBack(card, language),
                controlsHtml: this.renderKanjiNavigationControls(kanjiCharacters, kanji, language),
            })}
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                        <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                        <div data-kanji-keyword-mount><div class="jpdb-reader-help">Loading kanji details...</div></div>
                        ${this.renderWordPills(card, jpdbUrl, [], kanji)}
                    </div>
                    <div data-kanji-mining-mount hidden></div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                ${this.renderKanjiSourceMounts(kanji, language)}
            </div>
        `);
    }

    private renderKanjiNavigationControls(kanjiCharacters: string[], kanji: string, language: InterfaceLanguage): string {
        if (kanjiCharacters.length <= 1) return '';
        const index = Math.max(0, kanjiCharacters.indexOf(kanji));
        const previous = kanjiCharacters[(index - 1 + kanjiCharacters.length) % kanjiCharacters.length];
        const next = kanjiCharacters[(index + 1) % kanjiCharacters.length];
        return `
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}" title="${escapeHtml(uiText(language, 'previousKanji'))}">‹</button>
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}" title="${escapeHtml(uiText(language, 'nextKanji'))}">›</button>
        `;
    }

    private kanjiModalBack(card: JPDBCard, language: InterfaceLanguage): { backAction: string; backTitle: string; label: string } {
        const previousKanji = this.kanjiNavigationStack[this.kanjiNavigationStack.length - 1];
        return previousKanji
            ? {
                backAction: 'kanji-history-back',
                backTitle: `${uiText(language, 'backToKanji')}: ${previousKanji.kanji}`,
                label: previousKanji.kanji,
            }
            : {
                backAction: 'word-back',
                backTitle: `${uiText(language, 'backToWord')}: ${card.spelling}`,
                label: card.spelling,
            };
    }

    private installKanjiCardActions(popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        popover.addEventListener('click', event => {
            const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = actionButton?.dataset.action;
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === 'copy-word') {
                void copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord')));
                return;
            }
            if (action === 'jpdb-kanji-action') {
                const actionId = actionButton.dataset.kanjiActionId ?? '';
                void this.performJpdbKanjiAction(actionId, card, kanji, sentence, anchor);
                return;
            }
            if (action === 'word-back') void this.showCard(card, sentence, anchor, { autoPlay: false, navigation: 'preserve', preservePosition: true });
            if (action === 'kanji-history-back') void this.showPreviousKanji(anchor);
            if (action === 'kanji-prev' || action === 'kanji-next') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true });
            if (action === 'kanji') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true });
            if (action === 'similar-word') void this.lookupText(actionButton.dataset.expression ?? '', actionButton.dataset.expression ?? '', { navigation: 'push-current', preservePosition: true });
        });
    }

    private startKanjiProgressiveRender(popover: HTMLElement, detailsPromises: KanjiDetailPromises, card: JPDBCard, kanji: string, language: InterfaceLanguage): void {
        installKanjiDoodle(popover, () => this.settings.interfaceLanguage);
        if (this.settings.similarKanjiWords) {
            void this.renderSimilarKanjiWordsProgressively(popover, detailsPromises.jpdbInfo, kanji, card);
        }
        if (this.settings.uchisenEnabled) {
            void this.renderUchisenInto(popover, kanji);
        }
        void this.renderKanjiDetailsInto(popover, detailsPromises, card, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, detailsPromises.kanjiVGInfo, kanji, language);
        }
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (!actionId) return;
        try {
            await this.jpdbKanji.performAction(actionId);
            this.toast('JPDB kanji updated.');
            await this.showKanjiCard(card, kanji, sentence, anchor, { preservePosition: true });
        } catch (error) {
            log.warn('JPDB kanji action failed', { kanji }, error);
            this.toast('Could not update JPDB kanji. Check JPDB kanji reviews are enabled.');
        }
    }

    private renderKanjiSourceMounts(kanji: string, language: InterfaceLanguage): string {
        return orderedKanjiSourceIds(this.settings).map(sourceId => {
            if (sourceId === KANJI_STROKE_SOURCE_ID) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_STROKE_SOURCE_ID);
                return renderKanjiPractice(null, kanji, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey);
            }
            if (sourceId === KANJI_JPDB_SOURCE_ID) return '<div data-kanji-jpdb-mount></div>';
            if (sourceId === KANJI_RTK_SOURCE_ID) return '<div data-kanji-rtk-mount></div>';
            if (sourceId === KANJI_UCHISEN_SOURCE_ID) return '<div data-kanji-uchisen-mount></div>';
            if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return '<div data-kanji-definitions-mount></div>';
            const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
            if (dictionaryName) return `<div data-kanji-definitions-mount data-kanji-dictionary="${escapeHtml(dictionaryName)}" data-kanji-source-id="${escapeHtml(sourceId)}"></div>`;
            if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID);
                return renderSimilarKanjiWordsShell(
                    kanji,
                    language,
                    sourceStateKey,
                    this.isDictionarySourceOpen(sourceStateKey),
                    (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
                );
            }
            if (sourceId === KANJI_ORIGINS_SOURCE_ID) return '<div data-kanji-origin-mount></div>';
            return '';
        }).join('');
    }

    private async renderKanjiDetailsInto(
        popover: HTMLElement,
        detailsPromises: KanjiDetailPromises,
        card: JPDBCard,
        kanji: string,
        language: InterfaceLanguage,
    ): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        const keywordMount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
        const rtkMount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
        const definitionsMounts = Array.from(popover.querySelectorAll<HTMLElement>('[data-kanji-definitions-mount]'));

        const renderKeyword = () => {
            if (!popover.isConnected || !keywordMount?.isConnected) return;
            setInnerHtml(keywordMount, renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries));
            this.repositionActivePopover();
        };
        const renderRtk = () => {
            if (!popover.isConnected || !rtkMount?.isConnected) return;
            const componentSummaries = buildRtkComponentSummaries(rtkInfo, jpdbInfo, kanjiEntries);
            const sourceStateKey = kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
            setInnerHtml(rtkMount, renderRtkInfo(rtkInfo, componentSummaries, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
            this.repositionActivePopover();
        };

        const jpdbInfoPromise = detailsPromises.jpdbInfo.then(info => {
            jpdbInfo = info;
            if (!popover.isConnected) return;
            log.debug('JPDB kanji details loaded', { kanji, hasJpdbInfo: Boolean(jpdbInfo) });
            renderKeyword();
            if (miningMount?.isConnected) {
                const controls = renderJpdbKanjiMiningControls(jpdbInfo, language);
                miningMount.hidden = !controls;
                setInnerHtml(miningMount, controls);
            }
            if (jpdbMount?.isConnected) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
            }
            renderRtk();
        });
        const kanjiEntriesPromise = detailsPromises.kanjiEntries.then(entries => {
            kanjiEntries = entries;
            if (!popover.isConnected) return;
            log.debug('Local kanji details loaded', { kanji, entries: kanjiEntries.length });
            renderKeyword();
            for (const definitionsMount of definitionsMounts.filter(mount => mount.isConnected)) {
                const dictionaryName = definitionsMount.dataset.kanjiDictionary;
                const sourceId = definitionsMount.dataset.kanjiSourceId ?? KANJI_DICTIONARIES_SOURCE_ID;
                const visibleEntries = dictionaryName
                    ? kanjiEntries.filter(entry => entry.dictionary === dictionaryName)
                    : kanjiEntries;
                setInnerHtml(definitionsMount, renderKanjiDefinitions(
                    visibleEntries,
                    (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    sourceId,
                    dictionaryName ? this.dictionaryLabel(dictionaryName) : 'Kanji dictionaries',
                ));
            }
            renderRtk();
        });
        const rtkInfoPromise = detailsPromises.rtkInfo.then(info => {
            rtkInfo = info;
            if (!popover.isConnected) return;
            log.debug('RTK kanji details loaded', { kanji, hasRtkInfo: Boolean(rtkInfo) });
            renderKeyword();
            renderRtk();
        });
        const kanjiVGInfoPromise = detailsPromises.kanjiVGInfo.then(info => {
            kanjiVGInfo = info;
            if (!popover.isConnected) return;
            log.debug('KanjiVG graph metadata loaded', { kanji, components: kanjiVGInfo?.componentPositions?.length ?? 0 });
        });

        await Promise.all([jpdbInfoPromise, kanjiEntriesPromise, rtkInfoPromise, kanjiVGInfoPromise]);
        if (!popover.isConnected) return;
        log.debug('Kanji details loaded', {
            kanji,
            hasJpdbInfo: Boolean(jpdbInfo),
            localKanjiEntries: kanjiEntries.length,
            hasRtkInfo: Boolean(rtkInfo),
            hasKanjiVGInfo: Boolean(kanjiVGInfo),
        });
        const resolvedJpdbInfo = jpdbInfo as JpdbKanjiInfo | null;
        const resolvedRtkInfo = rtkInfo as RtkInfo | null;
        const resolvedKanjiVGInfo = kanjiVGInfo as KanjiVGInfo | null;

        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, resolvedJpdbInfo, resolvedRtkInfo, resolvedKanjiVGInfo, kanjiEntries);
        }
        void this.parsePopoverJapanese(popover);
        this.repositionActivePopover();
    }

    private async renderUchisenInto(popover: HTMLElement, kanji: string): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        if (!mount) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const sourceAttributes = () => this.dictionarySourceAttributes(sourceStateKey, this.isDictionarySourceOpen(sourceStateKey));
        setInnerHtml(mount, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source" ${sourceAttributes()}>
                <summary class="jpdb-reader-local-title">Uchisen</summary>
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">Loading mnemonic images...</div></div>
            </details>
        `);
        const images = await loadUchisenImages(kanji).catch(error => {
            log.debug('Uchisen kanji details failed quietly', { kanji }, error);
            return [];
        });
        if (!popover.isConnected || !mount.isConnected) return;
        if (!images.length) {
            mount.remove();
            return;
        }
        await installUchisenCarousel(mount, kanji, images, {
            sourceAttributes: sourceAttributes(),
            detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
            summaryClass: 'jpdb-reader-local-title',
            bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
        });
        this.repositionActivePopover();
    }

    private async lookupSimilarKanjiWordsWhenIdle(kanji: string): Promise<YomitanTermEntry[]> {
        await this.waitForIdle();
        return this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences);
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return new Promise(resolve => {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
                return;
            }
            setTimeout(resolve, 0);
        });
    }

    private renderSimilarKanjiWordsProgressively(popover: HTMLElement, jpdbInfoPromise: Promise<JpdbKanjiInfo | null>, kanji: string, card: JPDBCard): void {
        const section = popover.querySelector<HTMLDetailsElement>('[data-kanji-similar-words]');
        const mount = section?.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!section || !mount) return;

        let started = false;
        let jpdbLoaded = false;
        let localLoaded = !this.settings.localDictionariesEnabled;
        let jpdbVocabulary: JpdbKanjiVocabulary[] = [];
        let localEntries: YomitanTermEntry[] = [];
        const render = () => {
            if (!popover.isConnected || !section.isConnected || !mount.isConnected) return;
            const content = renderSimilarKanjiWordsContent(localEntries, jpdbVocabulary, card, this.settings, name => this.dictionaryLabel(name));
            setInnerHtml(mount, content || `<div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, jpdbLoaded && localLoaded ? 'noSimilarWords' : 'loadingSimilarWords')}</div>`);
            this.repositionActivePopover();
        };

        const load = () => {
            if (!section.open || started) return;
            started = true;
            render();

            const jpdbVocabularyPromise = jpdbInfoPromise.then(info => {
                jpdbVocabulary = info?.vocabulary ?? [];
                jpdbLoaded = true;
                render();
            }).catch(() => {
                jpdbLoaded = true;
                render();
            });

            const localEntriesPromise = this.settings.localDictionariesEnabled
                ? this.lookupSimilarKanjiWordsWhenIdle(kanji).then(entries => {
                    localEntries = entries;
                    localLoaded = true;
                    render();
                }).catch(() => {
                    localLoaded = true;
                    render();
                })
                : Promise.resolve();

            void Promise.all([jpdbVocabularyPromise, localEntriesPromise]).then(() => {
                log.debug('Similar kanji words loaded', { kanji, entries: localEntries.length, jpdbVocabulary: jpdbVocabulary.length });
            });
        };

        section.addEventListener('toggle', load);
        load();
    }

    private async renderSimilarKanjiWordsInto(popover: HTMLElement, promise: Promise<YomitanTermEntry[]>, jpdbVocabulary: JpdbKanjiVocabulary[], kanji: string, card: JPDBCard): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!mount) return;
        const entries = await promise;
        if (!popover.isConnected || !mount.isConnected) return;
        log.debug('Similar kanji words loaded', { kanji, entries: entries.length, jpdbVocabulary: jpdbVocabulary.length });
        setInnerHtml(mount, renderSimilarKanjiWordsContent(entries, jpdbVocabulary, card, this.settings, name => this.dictionaryLabel(name)));
    }

    private async renderKanjiVGInto(popover: HTMLElement, kanjiVGPromise: Promise<KanjiVGInfo | null>, kanji: string, language: InterfaceLanguage): Promise<void> {
        const info = await kanjiVGPromise;
        if (!info || !popover.isConnected) return;
        log.debug('KanjiVG loaded', { kanji, strokes: info.strokeCount });
        const elements = this.kanjiVGStageElements(popover, kanji);
        if (!elements) return;
        const { stage, ghost, help } = elements;
        setInnerHtml(ghost, info.svg);
        help.textContent = `${info.strokeCount} ${uiText(language, 'strokes')}`;
        stage.classList.remove('trace-hidden');
        const trace = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        if (trace) trace.textContent = uiText(language, 'hideTrace');
    }

    private kanjiVGStageElements(popover: HTMLElement, kanji: string): { stage: HTMLElement; ghost: HTMLElement; help: HTMLElement } | null {
        const stage = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-doodle-stage'))
            .find(candidate => candidate.dataset.kanji === kanji);
        if (!stage) return null;
        const ghost = stage.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        if (!ghost) return null;
        const help = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
        if (!help) return null;
        return { stage, ghost, help };
    }

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.lookupKanjiOriginSourceInfo(kanji);
        if (!this.canRenderKanjiOriginMount(popover, mount)) return;
        log.debug('Kanji origin rendered', { kanji, hasSourceInfo: Boolean(sourceInfo) });
        this.renderKanjiOriginMount(mount, kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        this.installKanjiOriginImageFallbacks(mount);
        installKanjiGraphDrag(mount);
    }

    private async lookupKanjiOriginSourceInfo(kanji: string): Promise<KanjiSourceInfo | null> {
        return await this.kanjiOrigin.lookup(kanji, { ...this.settings, kanjiOriginWiktionaryEnabled: false }).catch(error => {
            log.warn('Kanji origin lookup failed', { kanji }, error);
            return null;
        });
    }

    private canRenderKanjiOriginMount(popover: HTMLElement, mount: HTMLElement): boolean {
        return popover.isConnected && mount.isConnected;
    }

    private renderKanjiOriginMount(
        mount: HTMLElement,
        kanji: string,
        jpdbInfo: JpdbKanjiInfo | null,
        rtkInfo: RtkInfo | null,
        kanjiVGInfo: KanjiVGInfo | null,
        kanjiEntries: YomitanKanjiEntry[],
        sourceInfo: KanjiSourceInfo | null,
    ): void {
        const facts = buildKanjiFacts(kanji, jpdbInfo, rtkInfo, this.settings.kanjivgEnabled ? kanjiVGInfo : null, kanjiEntries, sourceInfo);
        const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, renderKanjiOrigins(
            facts,
            this.kanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo),
            sourceInfo,
            this.settings,
            this.settings.interfaceLanguage,
            this.isDictionarySourceOpen(sourceStateKey),
            sourceStateKey,
        ));
    }

    private kanjiOriginGraph(
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

    private installKanjiOriginImageFallbacks(mount: HTMLElement): void {
        mount.querySelectorAll<HTMLImageElement>('[data-radical-frame]').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
        });
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[], sentence?: string, jpdbVocabularyInfo: JpdbVocabularyInfo | null = null): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const setup = this.renderFallbackSetupSource(card);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        let renderedDictionaries = false;
        const sections = [
            setup,
            ...sourceIds
            .map(sourceId => {
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded), jpdbVocabularyInfo);
                if (sourceId === STUDY_TOOLS_SOURCE_ID) return this.renderStudyToolsSource(sentence);
                if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return this.renderStudyTranslationSource(sentence);
                if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return this.renderStudyGrammarSource(sentence);
                if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderImmersionKitMount();
                if (grouped.has(sourceId)) {
                    if (renderedDictionaries) return '';
                    renderedDictionaries = true;
                    return renderLocalDefinitionSourcesSection(
                        dictionarySourceIds,
                        grouped,
                        this.settings,
                        (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
                        name => this.dictionaryLabel(name),
                        card,
                    );
                }
                return '';
            }),
        ]
            .filter(Boolean);
        return sections.length
            ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
            : `<div class="jpdb-reader-help jpdb-reader-no-definitions">${uiText(this.settings.interfaceLanguage, 'noDefinitions')}</div>`;
    }

    private renderFallbackSetupSource(card: JPDBCard): string {
        void card;
        return '';
    }

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceAttributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private renderStudyTranslationSource(sentence?: string): string {
        if (!sentence || !this.settings.studyTranslationEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-translation ${this.dictionarySourceAttributes(definitionSourceStateKey(STUDY_TRANSLATION_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">Translation</summary>
                ${this.renderStudyTranslationPanel(sentence)}
            </details>
        `;
    }

    private renderStudyGrammarSource(sentence?: string): string {
        if (!sentence || !this.settings.studyGrammarEnabled) return '';
        const hints = detectGrammarHints(sentence);
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-grammar ${this.dictionarySourceAttributes(definitionSourceStateKey(STUDY_GRAMMAR_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">Grammar</summary>
                ${this.renderStudyGrammarPanel(sentence, hints)}
            </details>
        `;
    }

    private renderStudyToolsSource(sentence?: string): string {
        if (!sentence || !this.settings.studyTranslationEnabled || !this.settings.studyGrammarEnabled) return '';
        const sourceStateKey = definitionSourceStateKey(STUDY_TOOLS_SOURCE_ID);
        const hints = detectGrammarHints(sentence);
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source jpdb-reader-study-combined-source" data-study-tools ${this.dictionarySourceAttributes(sourceStateKey)}>
                <summary class="jpdb-reader-local-title">Translation + Grammar</summary>
                <div class="jpdb-reader-study-combined">
                    <details class="jpdb-reader-study-part" data-study-translation open>
                        <summary class="jpdb-reader-study-part-title">Translation</summary>
                        ${this.renderStudyTranslationPanel(sentence)}
                    </details>
                    <details class="jpdb-reader-study-part" data-study-grammar open>
                        <summary class="jpdb-reader-study-part-title">Grammar</summary>
                        ${this.renderStudyGrammarPanel(sentence, hints)}
                    </details>
                </div>
            </details>
        `;
    }

    private renderStudyTranslationPanel(sentence: string): string {
        return `
            <div class="jpdb-reader-study-panel jpdb-reader-study-translation-panel">
                <div class="jpdb-reader-study-block jpdb-reader-study-sentence-block">
                    <div class="jpdb-reader-study-label-row">
                        <div class="jpdb-reader-study-label">Japanese</div>
                        <button class="jpdb-reader-icon-mini" data-action="study-read-sentence" type="button" title="Read sentence aloud" aria-label="Read sentence aloud">${speakerIcon()}</button>
                    </div>
                    <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>${escapeHtml(sentence)}</div>
                </div>
                <div class="jpdb-reader-study-block jpdb-reader-study-meaning-block">
                    <div class="jpdb-reader-study-label">Meaning</div>
                    <div class="jpdb-reader-study-translation" data-study-translation-result>Open this section to translate.</div>
                </div>
            </div>
        `;
    }

    private renderStudyGrammarPanel(sentence: string, hints = detectGrammarHints(sentence)): string {
        return `
            <div class="jpdb-reader-study-panel" data-study-grammar-panel>
                ${hints.length ? renderGrammarHints(hints, sentence) : '<div class="jpdb-reader-help">Finding grammar...</div>'}
            </div>
        `;
    }

    private async detectStudyGrammarHints(sentence: string): Promise<GrammarHint[]> {
        const fallback = detectGrammarHints(sentence);
        try {
            const hanabiraHints = await detectHanabiraGrammarHints(sentence);
            return mergeGrammarHints(hanabiraHints, fallback);
        } catch (error) {
            log.warn('Hanabira grammar lookup failed; using fallback hints', { sentenceLength: sentence.length }, error);
            return fallback;
        }
    }

    private installStudyGrammarLoader(popover: HTMLElement, sentence?: string): void {
        const containers = Array.from(popover.querySelectorAll<HTMLDetailsElement>('[data-study-grammar]'));
        if (!containers.length || !sentence) return;
        for (const container of containers) {
            const load = () => {
                if (!this.isStudyDetailsOpen(container) || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
                container.dataset.loading = 'true';
                void this.loadStudyGrammar(popover, sentence, container).finally(() => {
                    if (!container.isConnected) return;
                    delete container.dataset.loading;
                    container.dataset.loaded = 'true';
                });
            };
            container.addEventListener('toggle', load);
            container.parentElement?.closest('details')?.addEventListener('toggle', load);
            load();
        }
    }

    private async loadStudyGrammar(popover: HTMLElement, sentence: string, container: HTMLElement): Promise<void> {
        const panel = container.querySelector<HTMLElement>('[data-study-grammar-panel]');
        if (!panel) return;
        try {
            const hints = await this.detectStudyGrammarHints(sentence);
            if (!this.canRenderStudyGrammar(popover, container)) return;
            if (!hints.length) {
                container.remove();
                return;
            }
            setInnerHtml(panel, renderGrammarHints(hints, sentence));
            delete popover.dataset.jpdbReaderParseKey;
            delete popover.dataset.jpdbReaderParseLoadingKey;
            void this.parsePopoverJapanese(popover);
        } catch (error) {
            log.warn('Automatic grammar lookup failed', { sentenceLength: sentence.length }, error);
        }
    }

    private canRenderStudyGrammar(popover: HTMLElement, container: HTMLElement): boolean {
        return this.isCurrentPopoverRoot(popover) && container.isConnected;
    }

    private installStudyTranslationLoader(popover: HTMLElement, sentence?: string): void {
        const containers = Array.from(popover.querySelectorAll<HTMLDetailsElement>('[data-study-translation]'));
        if (!containers.length || !sentence) return;
        for (const container of containers) {
            const load = () => {
                if (!this.isStudyDetailsOpen(container) || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
                container.dataset.loading = 'true';
                const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
                if (result) result.textContent = 'Translating...';
                void this.loadStudyTranslation(popover, sentence, container).finally(() => {
                    if (!container.isConnected) return;
                    delete container.dataset.loading;
                    container.dataset.loaded = 'true';
                });
            };
            container.addEventListener('toggle', load);
            container.parentElement?.closest('details')?.addEventListener('toggle', load);
            load();
        }
    }

    private async loadStudyTranslation(popover: HTMLElement, sentence: string | undefined, container: HTMLElement): Promise<void> {
        if (!sentence) return;
        try {
            const translation = await this.loadStudyTranslationContent(sentence);
            if (!this.canApplyStudyTranslation(popover, container)) return;
            this.applyStudyTranslation(popover, sentence, container, translation);
        } catch (error) {
            this.renderStudyTranslationError(sentence, container, error);
        }
    }

    private canApplyStudyTranslation(popover: HTMLElement, container: HTMLElement): boolean {
        return this.isCurrentPopoverRoot(popover) && container.isConnected;
    }

    private async loadStudyTranslationContent(sentence: string): Promise<StudyTranslationResult> {
        const [tokens, translated] = await Promise.all([
            this.parseJapanese([sentence]).then(([parsed]) => parsed ?? []),
            translateJapaneseSentence(sentence),
        ]);
        return { tokens, translated };
    }

    private applyStudyTranslation(
        popover: HTMLElement,
        sentence: string,
        container: HTMLElement,
        translation: StudyTranslationResult,
    ): void {
        const original = container.querySelector<HTMLElement>('[data-study-original-render]');
        if (original) setInnerHtml(original, renderTokensToHtml(sentence, translation.tokens, this.settings));
        const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
        if (result) result.textContent = translation.translated;
        void this.parsePopoverJapanese(popover);
        void this.enrichAnkiWords(translation.tokens);
    }

    private renderStudyTranslationError(sentence: string, container: HTMLElement, error: unknown): void {
        log.warn('Automatic sentence translation failed', { sentenceLength: sentence.length }, error);
        if (!container.isConnected) return;
        const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
        if (result) result.textContent = 'Translation unavailable.';
    }

    private isStudyDetailsOpen(container: HTMLDetailsElement): boolean {
        if (!container.open) return false;
        let ancestor = container.parentElement?.closest<HTMLDetailsElement>('details');
        while (ancestor) {
            if (!ancestor.open) return false;
            ancestor = ancestor.parentElement?.closest<HTMLDetailsElement>('details');
        }
        return true;
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        if (!this.isCurrentPopoverRoot(popover)) return;
        const plan = popoverNestedParsePlan(popover);
        if (!plan || nestedParseAlreadyScheduled(popover, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(popover, plan, () => this.isCurrentPopoverRoot(popover), 'Popover');
    }

    private async parseNewTabContent(root: HTMLElement): Promise<void> {
        if (!root.isConnected || !this.canParseJapanese()) return;
        const plan = newTabNestedParsePlan(root);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(root, plan, () => root.isConnected, 'New tab');
    }

    private async parseNestedJapaneseContent(
        root: HTMLElement,
        plan: NestedParsePlan,
        isCurrent: () => boolean,
        label: 'Popover' | 'New tab',
    ): Promise<void> {
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        try {
            const parsed = await this.parseJapanese(plan.targets.map(target => target.text));
            if (!isCurrent() || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
            this.afterNestedJapaneseParsed(plan, parsed, label);
        } catch (error) {
            log.debug(`${label} nested text parsing failed quietly`, error);
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey);
        }
    }

    private afterNestedJapaneseParsed(plan: NestedParsePlan, parsed: JPDBToken[][], label: 'Popover' | 'New tab'): void {
        const tokens = parsed.flat();
        this.preloadTermAudioForTokens(tokens);
        void this.enrichAnkiWords(tokens);
        log.debug(`${label} nested text parsed`, { targets: plan.targets.length, tokens: tokens.length });
    }

    private isCurrentPopoverRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activePopover && (root === this.activePopover || this.activePopover.contains(root)));
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
        if (uniqueTokens.length) log.debug('Enriching rendered words with Anki state', { tokens: uniqueTokens.length });
        for (const token of uniqueTokens) {
            const lookup = await this.anki.findExistingCards(token.card);
            this.applyAnkiLookupToRenderedWords(token.card, lookup);
        }
    }

    private preloadTermAudioForTokens(tokens: JPDBToken[]): void {
        if (!this.canPreloadReaderAudio()) return;
        this.logTermAudioPreloadsQueued(this.queueTermAudioPreloads(tokens));
    }

    private queueTermAudioPreloads(tokens: JPDBToken[]): number {
        let queued = 0;
        for (const token of tokens) {
            if (this.preloadTermAudioForToken(token)) queued++;
            if (queued >= TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        return queued;
    }

    private logTermAudioPreloadsQueued(queued: number): void {
        if (queued) log.debugThrottled('term-audio-preload', 2500, 'Term audio preloads queued', { queued });
    }

    private preloadTermAudioForToken(token: JPDBToken): boolean {
        if (!isUsefulImmersionPreloadQuery(token.card.spelling)) return false;
        const key = cardKey(token.card);
        if (this.preloadedTermAudioKeys.has(key)) return false;
        this.preloadedTermAudioKeys.add(key);
        this.audio.preload(token.card, { sourceLimit: 1, candidateLimit: 1 });
        return true;
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private isDictionarySourceOpen(sourceStateKey: string, initiallyExpanded = this.settings.dictionarySourcesInitiallyExpanded): boolean {
        return this.dictionarySourceOpenOverrides.get(sourceStateKey) ?? initiallyExpanded;
    }

    private dictionarySourceAttributes(sourceStateKey: string, initiallyExpanded = this.settings.dictionarySourcesInitiallyExpanded): string {
        const isOpen = this.isDictionarySourceOpen(sourceStateKey, initiallyExpanded);
        return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(isOpen)}"${isOpen ? ' open' : ''}`;
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void {
        if (!ankiLookup.primary) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        document.querySelectorAll<HTMLElement>(selector).forEach(word => {
            word.classList.add(`anki-${ankiLookup.state}`);
            word.dataset.ankiState = ankiLookup.state;
            word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
            word.title = `Anki: ${ankiLookup.state}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
        });
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const anchor = this.connectedActivePopoverAnchor();
        const trigger = this.activeTextLookupTrigger();
        const done = log.time('cardAction', { action, term: card.spelling, trigger });
        try {
            const shouldRefresh = await this.cardActions.perform(action, button, card, sentence);
            if (shouldRefresh) await this.showCard(card, sentence, anchor, { autoPlay: false, trigger, navigation: 'preserve', preservePosition: true });
            log.info('Card action completed', { action, term: card.spelling });
        } catch (error) {
            log.warn('Card action failed', { action, term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : 'Action failed.');
        } finally {
            done();
            button.disabled = false;
        }
    }

    private connectedActivePopoverAnchor(): HTMLElement | undefined {
        return this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
    }

    private async resolveMiningContext(card: JPDBCard, sentence?: string): Promise<MiningContext> {
        const activeContext = this.immersionPopover.activeContextFor(card);
        const storedImmersionContext = this.immersionPopover.storedContextFor(card);
        const anchor = this.activePopoverAnchor;
        const context = await resolveStoredMiningContext({
            term: card.spelling,
            sentence,
            settings: this.settings,
            activeContext,
            storedContext: storedImmersionContext,
            sourceKind: inferMiningSourceKind({
                hostname: location.hostname,
                hasVideo: Boolean(anchor?.closest('.jpdb-subtitle-player')) || Boolean(document.querySelector('video')),
            }),
            imageDataUrl: this.settings.ankiCaptureScreenshot ? this.ocr.captureSourceImageForElement(anchor ?? null) : undefined,
            videoImageDataUrl: this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : undefined,
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit.fetchDataUrl(imageUrl, timeoutMs),
        });
        log.debug('Mining context resolved', {
            term: card.spelling,
            sourceKind: context.sourceKind,
            hasImage: Boolean(context.imageDataUrl),
            hasStoredContext: Boolean(storedImmersionContext),
            hasActiveContext: Boolean(activeContext),
        });
        return context;
    }

    private async playAudio(card: JPDBCard, options: { hoverLookupGeneration?: number } = {}): Promise<void> {
        const isCurrent = options.hoverLookupGeneration === undefined
            ? undefined
            : () => this.hoverLookupGeneration === options.hoverLookupGeneration;
        const loadingPopover = this.activePopover;
        const loadingRequest = ++this.audioLoadingRequest;
        this.setAudioLoading(loadingPopover, loadingRequest);
        try {
            this.immersionPopover.stopAudio();
            const played = await this.audio.play(card, { isCurrent });
            if (!played) return;
            log.debug('Term audio playback started', { term: card.spelling });
        } catch (error) {
            log.warn('Term audio playback failed', { term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : 'Audio playback failed.');
        } finally {
            this.clearAudioLoading(loadingPopover, loadingRequest);
        }
    }

    private setAudioLoading(popover: HTMLElement | undefined, requestId: number): void {
        if (!popover?.isConnected) return;
        popover.dataset.audioLoading = 'true';
        popover.dataset.audioLoadingRequest = String(requestId);
    }

    private clearAudioLoading(popover: HTMLElement | undefined, requestId: number): void {
        if (!popover?.isConnected || popover.dataset.audioLoadingRequest !== String(requestId)) return;
        delete popover.dataset.audioLoading;
        delete popover.dataset.audioLoadingRequest;
    }

    private async playSentenceAudio(sentence?: string): Promise<void> {
        const text = sentence?.trim();
        if (!text) throw new Error('No sentence to read aloud.');
        const voice = this.settings.audioSources.find(source =>
            source.enabled && (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') && source.voice.trim()
        )?.voice.trim() ?? '';
        this.immersionPopover.stopAudio();
        await this.audio.playJapaneseText(text, voice);
        log.debug('Sentence text-to-speech playback started', { sentenceLength: text.length, voice: voice || 'auto' });
    }

    private showSettings(panel?: string): void {
        this.settingsDialog.open(panel);
    }

    private mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void {
        this.dismiss();
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activePopover = form;
        form.focus();
    }

    private createPopover(): HTMLElement {
        return createReaderPopover(APP_NAME, this.settings);
    }

    private mountPopover(
        popover: HTMLElement,
        anchor?: HTMLElement,
        options: MountPopoverOptions = {},
    ): void {
        const state = this.popoverMountState(anchor, options);
        this.dismiss({ suppressHoverTarget: false, preserveNavigation: true, preserveHoverGeneration: state.mode === 'hover' });
        this.appendMountedPopover(popover, state);
        this.activateMountedPopover(popover, state, options);
        this.installDictionarySourceStateTracking(popover);
        this.installMountedPopoverSurface(popover, state);
        this.finishMountedPopoverLifecycle(popover, state.mode);
        log.debug('Popover mounted', {
            mode: state.mode,
            sheet: popover.classList.contains('jpdb-reader-sheet'),
            hasAnchor: Boolean(state.resolvedAnchor),
            hasBackdrop: Boolean(state.backdrop),
        });
    }

    private popoverMountState(anchor: HTMLElement | undefined, options: MountPopoverOptions): PopoverMountState {
        const mode = options.mode ?? 'modal';
        const backdrop = mode === 'hover' ? undefined : createReaderBackdrop(() => this.dismiss());
        const resolvedAnchor = connectedElement(anchor) ?? connectedElement(this.activePopoverAnchor);
        const anchorRect = popoverAnchorRect(resolvedAnchor, this.activePopoverAnchorRect);
        const previousPopoverRect = options.preservePosition ? this.activePopover?.getBoundingClientRect() : undefined;
        const previousHoverPointerPosition = this.hoverPopoverPointerPosition;
        return { mode, backdrop, resolvedAnchor, anchorRect, previousPopoverRect, previousHoverPointerPosition };
    }

    private appendMountedPopover(popover: HTMLElement, state: PopoverMountState): void {
        const useBackdrop = state.mode !== 'hover';
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (state.backdrop) document.body.append(state.backdrop, popover);
        else document.body.append(popover);
    }

    private activateMountedPopover(popover: HTMLElement, state: PopoverMountState, options: MountPopoverOptions): void {
        this.activeBackdrop = state.backdrop;
        this.activePopover = popover;
        this.activePopoverMode = state.mode;
        this.activePopoverAnchor = state.resolvedAnchor;
        this.activePopoverAnchorRect = state.anchorRect;
        this.activePopoverPositionLocked = shouldLockMountedPopoverPosition(popover, state);
        this.activeHoverWord = state.mode === 'hover' ? state.resolvedAnchor : undefined;
        this.activeHoverLookupKey = state.mode === 'hover' ? options.hoverLookupKey ?? '' : '';
        this.activePointerTextLookup = state.mode === 'hover' ? options.pointerTextLookup : undefined;
        this.hoverPopoverPointerPosition = mountedHoverPointerPosition(state, this.lastPointerPosition);
    }

    private installMountedPopoverSurface(popover: HTMLElement, state: PopoverMountState): void {
        if (!popover.classList.contains('jpdb-reader-sheet')) {
            this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
            this.activePopoverResizeObserver.observe(popover);
            if (state.previousPopoverRect) {
                placePopoverAtViewportPosition(popover, state.previousPopoverRect, popoverMaxHeightSetting(this.settings));
                this.syncActivePopoverFixedHeight();
            }
            else this.repositionActivePopover();
            this.activePopoverPositionLocked = state.mode !== 'hover';
            requestAnimationFrame(() => this.repositionActivePopover());
        } else {
            installSheetHandle(popover, () => this.dismiss());
        }
    }

    private finishMountedPopoverLifecycle(popover: HTMLElement, mode: 'modal' | 'hover'): void {
        if (mode === 'hover') {
            this.installHoverPopoverLifecycle(popover);
            this.startHoverWatch();
            return;
        }
        popover.focus();
    }

    private repositionActivePopover(): void {
        const popover = this.repositionableActivePopover();
        if (!popover) return;
        this.prepareActivePopoverForPositioning(popover);
        if (this.repositionLockedActivePopoverIfNeeded(popover)) return;
        this.repositionUnlockedActivePopover(popover);
    }

    private prepareActivePopoverForPositioning(popover: HTMLElement): void {
        if (this.shouldUseFixedModalHeight(popover)) popover.style.height = '';
    }

    private repositionLockedActivePopoverIfNeeded(popover: HTMLElement): boolean {
        if (!this.activePopoverPositionLocked) return false;
        this.repositionLockedActivePopover(popover);
        return true;
    }

    private repositionUnlockedActivePopover(popover: HTMLElement): void {
        this.refreshActivePopoverAnchorRect();
        positionPopover(
            popover,
            this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
            this.activePopoverAnchorRect,
            {
                followPoint: this.shouldFollowActivePointerText() ? this.hoverPopoverPointerPosition : undefined,
                maxHeight: popoverMaxHeightSetting(this.settings),
            },
        );
        this.syncActivePopoverFixedHeight();
    }

    private repositionableActivePopover(): HTMLElement | null {
        if (!this.activePopover) return null;
        if (this.activePopover.classList.contains('jpdb-reader-sheet')) return null;
        return this.activePopover;
    }

    private repositionLockedActivePopover(popover: HTMLElement): void {
        placePopoverAtViewportPosition(popover, popover.getBoundingClientRect(), popoverMaxHeightSetting(this.settings));
        this.syncActivePopoverFixedHeight();
    }

    private refreshActivePopoverAnchorRect(): void {
        if (!this.activePopoverAnchor?.isConnected) return;
        const rect = this.activePopoverAnchor.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
    }

    private shouldFollowActivePointerText(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.activePointerTextLookup);
    }

    private shouldUseFixedModalHeight(popover: HTMLElement): boolean {
        return this.activePopoverMode !== 'hover'
            && this.settings.popoverHeightMode === 'fixed'
            && !popover.classList.contains('jpdb-reader-sheet')
            && Boolean(popover.querySelector('.jpdb-reader-popover-body'));
    }

    private syncActivePopoverFixedHeight(): void {
        const popover = this.activePopover;
        if (!popover) return;
        if (!this.shouldUseFixedModalHeight(popover)) {
            popover.style.height = '';
            return;
        }
        const maxHeight = Number.parseFloat(popover.style.maxHeight);
        if (Number.isFinite(maxHeight) && maxHeight > 0) popover.style.height = `${maxHeight}px`;
    }

    private installDictionarySourceStateTracking(popover: HTMLElement): void {
        popover.addEventListener('click', event => {
            const summary = (event.target as HTMLElement).closest?.<HTMLElement>('summary.jpdb-reader-local-title');
            const details = summary?.parentElement instanceof HTMLDetailsElement ? summary.parentElement : null;
            if (!summary || !details || !popover.contains(summary) || !details.dataset.sourceStateKey) return;
            event.preventDefault();
            event.stopPropagation();
            if (details.dataset.immersionEmpty === 'true') return;
            details.open = !details.open;
            this.rememberDictionarySourceOpenState(details);
        });
        popover.addEventListener('toggle', event => {
            if (!event.isTrusted) return;
            const details = event.target instanceof HTMLDetailsElement ? event.target : null;
            if (!details?.dataset.sourceStateKey) return;
            this.rememberDictionarySourceOpenState(details);
        }, true);
    }

    private rememberDictionarySourceOpenState(details: HTMLDetailsElement): void {
        const sourceStateKey = details.dataset.sourceStateKey;
        if (!sourceStateKey) return;
        const rememberedOpen = this.dictionarySourceOpenOverrides.get(sourceStateKey);
        if (rememberedOpen === details.open) return;
        const initialOpen = details.dataset.sourceInitialOpen === 'true';
        if (rememberedOpen === undefined && details.open === initialOpen) return;
        this.dictionarySourceOpenOverrides.set(sourceStateKey, details.open);
        log.debug('Dictionary source open state remembered', { sourceStateKey, open: details.open });
        this.repositionActivePopover();
    }

    private installHoverPopoverLifecycle(popover: HTMLElement): void {
        popover.addEventListener('pointerenter', event => {
            this.lastPointerPosition = { x: event.clientX, y: event.clientY };
            this.cancelHoverClose();
        });
        popover.addEventListener('pointerleave', event => {
            this.lastPointerPosition = { x: event.clientX, y: event.clientY };
            if (this.activeHoverWord && this.isInsideNode(event.relatedTarget as Node | null, this.activeHoverWord)) return;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        });
    }

    private startHoverWatch(): void {
        window.clearTimeout(this.hoverWatchTimer);
        const tick = () => {
            this.hoverWatchTimer = undefined;
            if (this.activePopoverMode !== 'hover') return;
            if (!this.isHoverContextActive({ ignorePointerPosition: true })) {
                this.dismiss({ suppressHoverTarget: false });
                return;
            }
            this.hoverWatchTimer = window.setTimeout(tick, Math.max(90, this.settings.hoverCloseDelayMs));
        };
        this.hoverWatchTimer = window.setTimeout(tick, Math.max(90, this.settings.hoverCloseDelayMs));
    }

    private dismiss(options: { suppressHoverTarget?: boolean; preserveNavigation?: boolean; preserveHoverGeneration?: boolean } = { suppressHoverTarget: true }): void {
        const hadDialog = Boolean(this.activePopover || this.activeBackdrop);
        const hadSettingsDialog = Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
        this.clearHoverDismissState(options);
        this.audio.stop();
        this.immersionPopover.stopAudio();
        this.updateSuppressedHoverTarget(options);
        this.cardRenderRequest++;
        this.restoreSettingsPreviewState();
        this.removeReaderDialogNodes();
        this.clearActivePopoverState();
        if (!options.preserveNavigation) {
            this.clearWordNavigation();
            this.clearKanjiNavigation();
        }
        if (hadDialog) log.debug('Reader dialog dismissed', { suppressHoverTarget: Boolean(options.suppressHoverTarget) });
        if (hadSettingsDialog) this.schedulePendingDictionaryRescan();
    }

    private clearHoverDismissState(options: { preserveHoverGeneration?: boolean }): void {
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.hoverLookupTimer = undefined;
        this.hoverCloseTimer = undefined;
        this.hoverWatchTimer = undefined;
        this.hoverPopoverPointerPosition = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        this.hoverLookupInFlightKey = '';
        if (!options.preserveHoverGeneration) this.nextHoverLookupGeneration();
    }

    private updateSuppressedHoverTarget(options: { suppressHoverTarget?: boolean }): void {
        const suppressTarget = this.activePopoverMode === 'hover' ? this.activeHoverWord : this.activePopoverAnchor;
        if (options.suppressHoverTarget && suppressTarget?.isConnected && suppressTarget.classList.contains('jpdb-reader-word')) {
            this.suppressedHoverWord = suppressTarget;
            this.suppressedHoverLookupKey = this.hoverLookupKeyForWord(suppressTarget);
        } else {
            this.suppressedHoverLookupKey = '';
        }
    }

    private restoreSettingsPreviewState(): void {
        if (!this.hasActiveSettingsPreviewPopover()) {
            this.clearSettingsPreviewOriginals();
            return;
        }
        if (this.settingsPreviewOriginalAccent !== undefined) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalLanguage !== undefined) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        if (this.settingsPreviewOriginalTheme !== undefined) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
            this.applyTheme();
        }
        this.clearSettingsPreviewOriginals();
    }

    private clearSettingsPreviewOriginals(): void {
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalLanguage = undefined;
        this.settingsPreviewOriginalTheme = undefined;
    }

    private hasActiveSettingsPreviewPopover(): boolean {
        return Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
    }

    private removeReaderDialogNodes(): void {
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
    }

    private clearActivePopoverState(): void {
        this.activePopover = undefined;
        this.activeBackdrop = undefined;
        this.activePopoverResizeObserver = undefined;
        this.activePopoverPositionLocked = false;
        this.activePopoverAnchorRect = undefined;
        this.activePopoverMode = undefined;
        this.activePopoverAnchor = undefined;
        this.activeHoverWord = undefined;
        this.activeHoverLookupKey = '';
        this.activePointerTextLookup = undefined;
    }

    private schedulePendingDictionaryRescan(): void {
        if (!this.dictionaryRescanPending) return;
        this.dictionaryRescanPending = false;
        window.setTimeout(() => this.scheduleDictionaryRescan(), 80);
    }

    private toast(message: string): void {
        log.debug('Toast shown', { message });
        const toast = document.createElement('div');
        toast.className = 'jpdb-reader-toast';
        toast.dataset.jpdbReaderRoot = 'true';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }
}

function cardRenderDetailWithFallback<T>(detail: string, card: JPDBCard, promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
    let timeout = 0;
    return Promise.race([
        promise,
        new Promise<T>(resolve => {
            timeout = window.setTimeout(() => {
                log.warn('Card detail lookup timed out', { term: card.spelling, detail, timeoutMs });
                resolve(fallback);
            }, timeoutMs);
        }),
    ]).finally(() => window.clearTimeout(timeout));
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function pointerTokenAtOffset(tokens: JPDBToken[], offset: number): JPDBToken | undefined {
    return tokens.find(token => tokenContainsPointerOffset(token, offset));
}

function tokenContainsPointerOffset(token: JPDBToken, offset: number): boolean {
    return (token.start <= offset && offset < token.end)
        || (token.start < offset && offset <= token.end);
}
