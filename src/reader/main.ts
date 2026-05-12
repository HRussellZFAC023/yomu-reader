import { AudioPlayer } from './audio';
import { AnkiConnectClient, captureActiveVideoFrame, type AnkiExistingNote, type AnkiLookupResult } from './anki';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { normalizeCardStates, primaryCardState } from './card-state';
import { APP_NAME, APP_PUCK, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, NEW_TAB_PAGE_URL, SETTINGS_TITLE, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, SUPPORT_LINKS } from './constants';
import {
    HAS_JAPANESE,
    appendToDocumentHead,
    applyTokensToTextNode,
    applyTokensToScanTarget,
    collectTextTargetsIn,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    renderTokensToHtml,
    setInnerHtml,
    unwrapReaderWords,
} from './dom';
import { ImmersionKitClient, type ImmersionKitExample } from './immersion-kit';
import { JpdbClient } from './jpdb';
import { JpdbExtensionsController } from './jpdb-extensions';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    contextLabel,
    immersionContextFromElement,
    immersionContextFromExample,
    inferMiningSourceKind,
    loadMiningContext,
    normalizeMiningSentence,
    pageMiningContext,
    resolveMiningContext as resolveStoredMiningContext,
    saveMiningContext,
    type MiningContext,
    type StoredMiningContext,
} from './mining-context';
import { NewTabController } from './new-tab-controller';
import { resolveUiLanguage, uiText } from './i18n';
import { OnboardingController } from './onboarding';
import { ImageOcrController } from './ocr';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import {
    buildRtkComponentSummaries,
    copyIcon,
    externalLinkIcon,
    formatMetaFrequency,
    formatMetaPitch,
    groupTermEntriesByDictionary,
    isKanjiCharacter,
    mergeSimilarKanjiWords,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderPitch,
    renderRtkInfo,
    renderSpellingForKanjiNavigation,
    speakerIcon,
    uniqueKanji,
} from './popup-render';
import { RECOMMENDED_JAPANESE_DICTIONARIES, STARTER_DICTIONARY_IDS, findRecommendedDictionary } from './recommended-dictionaries';
import { RtkClient, type RtkInfo } from './rtk';
import { ReaderParser } from './reader-parser';
import {
    DEFAULT_SETTINGS,
    accentToRgba,
    applyUrlBootstrapSettings,
    effectiveFuriganaMode,
    effectiveWordHighlightMode,
    loadSettings,
    matchesShortcut,
    mergeDictionaryPreferences,
    sanitizeAccentColor,
    saveSettings,
    shortcutIsPressed,
} from './settings';
import {
    activateSettingsPanel,
    dateStamp,
    downloadBlob,
    getFormInterfaceLanguage,
    getReaderSettingsExport,
    installDictionarySourceDrag,
    installShortcutCapture,
    isRecommendedDictionaryInstalled,
    localizeSettingsForm,
    pickFile,
    readFormSettings,
    recommendedDictionaryFilename,
    renderDeckControls,
    renderDictionarySourceRows,
    renderAnkiTemplatePreview,
    renderRecommendedDictionaries,
    renderSettingsForm,
    syncAudioSourceRow,
    syncReviewSettingsVisibility,
    syncSubtitlePreview,
    updateAudioSourceEditor,
    updateDictionaryLookupLinkEditor,
    updateDictionarySourceEditor,
} from './settings-form';
import { collectScanTargets, collectSiteScanTargets } from './site-parsers';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_SIMILAR_WORDS_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
} from './source-sections';
import { READER_CSS } from './styles';
import { detectGrammarHints, renderGrammarHints, translateJapaneseSentence } from './study-tools';
import { SubtitlePlayerController } from './subtitles';
import type { InterfaceLanguage, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { YoutubeImmersionFilter } from './youtube';
import {
    YomitanDictionaryStore,
    glossaryToHtml,
    parseYomitanSettingsExport,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const JPDB_SETTINGS_URL = 'https://jpdb.io/settings';
const log = Logger.scope('ReaderApp');
const AUTO_SCAN_OBSERVER_OPTIONS: MutationObserverInit = { childList: true, subtree: true, characterData: true };
const JAPANESE_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]/u;
const JAPANESE_QUERY_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]+/gu;
const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+/gu;
const COMMON_PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'や', 'か', 'ね', 'よ', 'ぞ', 'ぜ', 'な', 'わ', 'から', 'まで', 'だけ', 'しか', 'より']);
const IMMERSION_FALLBACK_QUERY_LIMIT = 5;

interface PointerTextLookup {
    text: string;
    offset: number;
    anchor: HTMLElement;
}

interface KanjiDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
}

interface CardNavigationEntry {
    card: JPDBCard;
    sentence?: string;
}

type CardNavigationMode = 'reset' | 'preserve' | 'push-current';

interface CardDisplayOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
}

interface CardRenderData {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup: AnkiLookupResult;
}

type SettingsStatusSetter = (message: string) => void;

interface ModalNavigationOptions {
    backAction: string;
    backTitle: string;
    label: string;
    controlsHtml?: string;
}

interface ImmersionKitSearchResult {
    examples: ImmersionKitExample[];
    query: string;
    usedFallback: boolean;
    triedQueries: string[];
}

function cardKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}

function formatLookupUrl(template: string, values: { query: string; word: string; reading: string; vid: string; sid: string }): string {
    const replacements: Record<string, string> = {
        query: values.query,
        word: values.word,
        term: values.word,
        reading: values.reading,
        vid: values.vid,
        sid: values.sid,
    };
    const url = template.replace(/\{([a-z]+)\}/gi, (_, key: string) => encodeURIComponent(replacements[key.toLowerCase()] ?? values.query));
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
    } catch {
        return '';
    }
}

function caretTextPositionFromPoint(x: number, y: number): { node: Text; offset: number } | null {
    const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position?.offsetNode.nodeType === Node.TEXT_NODE) {
        return { node: position.offsetNode as Text, offset: position.offset };
    }

    const range = doc.caretRangeFromPoint?.(x, y);
    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
        return { node: range.startContainer as Text, offset: range.startOffset };
    }
    return null;
}

function japaneseRunAt(text: string, offset: number): { start: number; end: number; offset: number } | null {
    let index = Math.min(Math.max(offset, 0), text.length - 1);
    if (!JAPANESE_RUN_RE.test(text[index] ?? '') && index > 0 && JAPANESE_RUN_RE.test(text[index - 1] ?? '')) index--;
    if (!JAPANESE_RUN_RE.test(text[index] ?? '')) return null;

    let start = index;
    let end = index + 1;
    while (start > 0 && JAPANESE_RUN_RE.test(text[start - 1])) start--;
    while (end < text.length && JAPANESE_RUN_RE.test(text[end])) end++;
    return { start, end, offset: index };
}

function normalizeImmersionSearchQuery(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function queryKey(value: string): string {
    return normalizeImmersionSearchQuery(value).replace(/\s+/g, '').toLowerCase();
}

function queryLength(value: string): number {
    return Array.from(queryKey(value)).length;
}

function queryHasKanji(value: string): boolean {
    return /[\u3400-\u9fff々〆]/u.test(value);
}

function isUsefulImmersionFallbackQuery(query: string, exactQuery: string): boolean {
    if (!query || queryKey(query) === queryKey(exactQuery) || !HAS_JAPANESE.test(query)) return false;
    if (COMMON_PARTICLES.has(queryKey(query))) return false;
    return queryLength(query) >= 2;
}

function uniqueImmersionQueries(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const query = normalizeImmersionSearchQuery(value);
        const key = queryKey(query);
        if (!query || seen.has(key)) continue;
        seen.add(key);
        result.push(query);
    }
    return result;
}

function immersionFallbackFragments(value: string): string[] {
    const fragments: string[] = [];
    const runs = normalizeImmersionSearchQuery(value).match(JAPANESE_QUERY_RUN_RE) ?? [];
    for (const run of runs) {
        const scriptGroups = run.match(JAPANESE_SCRIPT_GROUP_RE) ?? [];
        fragments.push(...scriptGroups);
        if (scriptGroups.length > 1) {
            fragments.push(...scriptGroups.filter(queryHasKanji));
        }
    }
    return uniqueImmersionQueries(fragments)
        .sort((a, b) => Number(queryHasKanji(b)) - Number(queryHasKanji(a)) || queryLength(b) - queryLength(a));
}

export class ReaderApp {
    private abortController = new AbortController();
    public isDemo = false;
    private isDestroyed = false;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient();
    private jpdbPublicPitch = new JpdbPublicPitchClient();
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private dictionaries = new YomitanDictionaryStore();
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });
    private newTab = new NewTabController({
        getSettings: () => this.settings,
        anki: this.anki,
        jpdb: this.jpdb,
        parser: this.parser,
        dictionaries: this.dictionaries,
        ensureStarterDictionary: onProgress => this.ensureStarterDictionaryInstalled(onProgress),
        onSettingsChange: () => saveSettings(this.settings),
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
    });
    private onboarding = new OnboardingController({
        getSettings: () => this.settings,
        setSettings: settings => {
            this.settings = settings;
            this.applyTheme();
        },
        showSettings: () => this.showSettings(),
    });
    private subtitles = new SubtitlePlayerController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onSettingsChange: () => void saveSettings(this.settings),
        onToast: message => this.toast(message),
    });
    private ocr = new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onLookup: (text, sentence) => this.lookupText(text, sentence),
        onToast: message => this.toast(message),
    });
    private youtube = new YoutubeImmersionFilter({
        getSettings: () => this.settings,
        setEnabled: enabled => void this.setYoutubeImmersionEnabled(enabled),
    });
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private fab?: HTMLButtonElement;
    private lastCard?: JPDBCard;
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
    private activeHoverWord?: HTMLElement;
    private suppressedHoverWord?: HTMLElement;
    private activePopoverMode?: 'modal' | 'hover';
    private activePopoverAnchor?: HTMLElement;
    private activePopoverAnchorRect?: DOMRect;
    private activePopoverPositionLocked = false;
    private activePopoverResizeObserver?: ResizeObserver;
    private lastPointerPosition?: { x: number; y: number };
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private dictionaryStyleElement?: HTMLStyleElement;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private cardRenderRequest = 0;
    private dictionaryRescanPending = false;
    private immersionKitAudio?: HTMLAudioElement;
    private immersionKitAudioBlobUrl?: string;
    private immersionKitAudioKey = '';
    private immersionKitAudioLoadingKey = '';
    private immersionKitAudioRequestId = 0;
    private immersionPreloadTerms = new Set<string>();
    private activeMiningContext?: MiningContext;
    private wordNavigationStack: CardNavigationEntry[] = [];
    private currentWordNavigation?: CardNavigationEntry;
    private immersionContextByCardKey = new Map<string, StoredMiningContext>();
    private dictionarySourceOpenOverrides = new Map<string, boolean>();
    private pressedKeys = new Set<string>();
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
    private pressLookup?: {
        pointerId: number;
        startX: number;
        startY: number;
        active: boolean;
        source: 'primary' | 'middle';
        captureTarget?: Element;
        lastWord?: HTMLElement;
    };
    private suppressMiddleAuxClickUntil = 0;
    private starterDictionaryDownload?: Promise<boolean>;

    constructor() {
        configureLogger({ settingsProvider: () => this.settings });
    }

    async init(options?: { isDemo?: boolean }): Promise<void> {
        const done = log.time('init', { href: location.href, devMode: Logger.isDevMode() });
        this.settings = await loadSettings();
        if (options?.isDemo) {
            this.settings.onboardingSeen = true;
            
            this.isDemo = true;
        }
        this.settings = applyUrlBootstrapSettings(this.settings);
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        this.installStyles();
        this.applyTheme();
        void this.refreshDictionaryStyles();
        this.registerMenuCommands();
        this.bindEvents();
        if (this.newTab.isCurrentPage()) {
            await this.newTab.renderPage();
            done();
            return;
        }

        this.installFab();
        this.subtitles.init();
        this.ocr.init();
        this.youtube.init();
        this.jpdbExtensions.init();
        this.setupAutoScan();
        await this.onboarding.showIfNeeded();
        if (this.canParseJapanese() && (this.settings.scanVisiblePage || this.settings.autoScanJapanese)) {
            void this.scanVisiblePage({ silent: true });
        }
        done();
    }

    private registerMenuCommands(): void {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
            GM_registerMenuCommand(`${APP_NAME} scan visible page`, () => this.scanVisiblePage());
            GM_registerMenuCommand(`${APP_NAME} scan nearby images`, () => this.ocr.scanVisible());
            GM_registerMenuCommand(`${APP_NAME} connect MPV subtitles`, () => this.subtitles.connectMpv());
            GM_registerMenuCommand(`${APP_NAME} toggle YouTube filter`, () => void this.toggleYoutubeImmersion());
            GM_registerMenuCommand(`${APP_NAME} toggle puck`, () => {
                this.settings.showFloatingButton = !this.settings.showFloatingButton;
                void saveSettings(this.settings).then(() => this.installFab());
            });
        }
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
        document.documentElement.classList.toggle('jpdb-reader-hide-known', furiganaMode === 'known-status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-status', wordHighlightMode === 'status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-pitch', wordHighlightMode === 'pitch');
        document.documentElement.classList.toggle('jpdb-reader-highlight-off', wordHighlightMode === 'off');
        log.debug('Theme applied', {
            theme: this.settings.theme,
            popupMode: this.settings.popupMode,
            furiganaMode,
            wordHighlightMode,
        });
    }

    private async refreshDictionaryStyles(): Promise<void> {
        const css = this.settings.localDictionariesEnabled
            ? await this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences).catch(error => {
                log.warn('Dictionary styles unavailable', error);
                return '';
            })
            : '';
        const existing = this.dictionaryStyleElement ?? document.getElementById('jpdb-reader-yomitan-dictionary-styles') as HTMLStyleElement | null;
        if (!css.trim()) {
            existing?.remove();
            this.dictionaryStyleElement = undefined;
            log.debug('Dictionary styles cleared');
            return;
        }
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
        window.setTimeout(() => void this.reparseVisiblePage(), 120);
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
    }

    private installFab(): void {
        this.fab?.remove();
        this.fab = undefined;
        document.querySelectorAll<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-fab').forEach(element => element.remove());
        if (!this.settings.showFloatingButton) {
            log.debug('Floating puck disabled');
            return;
        }

        const button = document.createElement('button');
        button.className = 'jpdb-reader-fab';
        button.type = 'button';
        button.textContent = APP_PUCK;
        button.title = APP_NAME;
        button.dataset.jpdbReaderRoot = 'true';
        if (this.settings.puckPositionX !== undefined && this.settings.puckPositionY !== undefined) {
            button.style.left = `${this.settings.puckPositionX}px`;
            button.style.top = `${this.settings.puckPositionY}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
        }
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;
        const clampPuck = (x: number, y: number) => {
            const rect = button.getBoundingClientRect();
            const margin = 8;
            return {
                x: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, x)),
                y: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, y)),
            };
        };
        const savePuckPosition = () => {
            const rect = button.getBoundingClientRect();
            const position = clampPuck(rect.left, rect.top);
            this.settings.puckPositionX = Math.round(position.x);
            this.settings.puckPositionY = Math.round(position.y);
            void saveSettings(this.settings);
        };
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            dragging = true;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            const rect = button.getBoundingClientRect();
            originX = rect.left;
            originY = rect.top;
            button.setPointerCapture?.(event.pointerId);
        });
        button.addEventListener('pointermove', event => {
            if (!dragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.hypot(dx, dy) > 4) moved = true;
            if (!moved) return;
            event.preventDefault();
            const position = clampPuck(originX + dx, originY + dy);
            button.style.left = `${position.x}px`;
            button.style.top = `${position.y}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
        }, { passive: false });
        button.addEventListener('pointerup', event => {
            if (!dragging) return;
            dragging = false;
            button.releasePointerCapture?.(event.pointerId);
            if (moved) savePuckPosition();
        });
        button.addEventListener('click', event => {
            if (moved) {
                event.preventDefault();
                event.stopPropagation();
                moved = false;
                return;
            }
            this.showSettings();
        });
        document.body.appendChild(button);
        this.fab = button;
        log.debug('Floating puck installed', {
            restoredPosition: this.settings.puckPositionX !== undefined && this.settings.puckPositionY !== undefined,
        });
    }

    destroy(): void {
        this.isDestroyed = true;
        this.abortController.abort();
        this.autoScanObserver?.disconnect();
        window.clearTimeout(this.autoScanTimer);
        window.clearTimeout(this.asbScanTimer);
        window.clearTimeout(this.selectionTimer);
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        this.activePopoverResizeObserver?.disconnect();
        
        this.newTab.destroy();
        this.fab?.remove();
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
            else this.scheduleAutoScan(450);
        });
        this.observeAutoScanMutations();
        window.addEventListener('scroll', () => this.scheduleAutoScan(500), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(700), { passive: true });
        this.scheduleAutoScan(600);
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
        if (this.isDestroyed) return;
        if (!this.settings.autoScanJapanese || !this.canParseJapanese()) return;
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) return;

        window.clearTimeout(this.autoScanTimer);
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.autoScanTimer = undefined;
            this.autoScanDeadline = 0;
            void this.scanAsbPlayerSubtitles();
            if ((collectSiteScanTargets(1)?.length ?? 0) > 0 || collectVisibleTextTargets(1).length > 0) {
                void this.scanVisiblePage({ silent: true });
            }
        }, delay);
        log.debugThrottled('auto-scan-scheduled', 2500, 'Auto-scan scheduled', { delay });
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
                const promise = ankiCardId
                    ? this.anki.answerCard(ankiCardId, grade)
                    : this.jpdb.reviewCard(this.lastCard, grade);
                void promise.catch(error => {
                    log.warn('Shortcut review failed', { grade, ankiCardId: Number.isFinite(ankiCardId) ? ankiCardId : undefined }, error);
                    this.toast(error instanceof Error ? error.message : 'Review failed.');
                });
            }
        });
        document.addEventListener('keyup', event => {
            this.pressedKeys.delete(normalizePressedKey(event.key));
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && !this.shouldLookupOnHover(event)) {
                window.clearTimeout(this.hoverLookupTimer);
                this.hoverLookupTimer = undefined;
                this.hoverPendingWord = undefined;
                if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
            }
        });
        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
            window.clearTimeout(this.hoverLookupTimer);
            this.hoverLookupTimer = undefined;
            this.hoverPendingWord = undefined;
            if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
        });
    }

    private shortcutGrade(event: KeyboardEvent): JPDBGrade | null {
        if (!this.settings.enableReviews) return null;
        if (this.settings.twoButtonReviews) {
            if (matchesShortcut(event, this.settings.shortcuts.gradeFail)) return 'fail';
            if (matchesShortcut(event, this.settings.shortcuts.gradePass)) return 'pass';
            return null;
        }
        if (matchesShortcut(event, this.settings.shortcuts.gradeNothing)) return 'nothing';
        if (matchesShortcut(event, this.settings.shortcuts.gradeSomething)) return 'something';
        if (matchesShortcut(event, this.settings.shortcuts.gradeHard)) return 'hard';
        if (matchesShortcut(event, this.settings.shortcuts.gradeOkay)) return 'okay';
        if (matchesShortcut(event, this.settings.shortcuts.gradeEasy)) return 'easy';
        return null;
    }

    private shouldLookupOnHover(event: MouseEvent | KeyboardEvent): boolean {
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private beginPressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        if (this.isInsideActivePopover(event.target as Node | null)) return;
        const isMiddleScan = this.shouldCaptureMiddleMouseLookup(event);
        if (!isMiddleScan) {
            if (!this.settings.lookupOnClick && !this.settings.lookupOnHover) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
        }

        const word = this.wordFromEventTarget(event.target);
        if (!isMiddleScan && !word) return;
        if (isMiddleScan) this.captureMiddleMouseLookup(event);

        this.pressLookup = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: isMiddleScan,
            source: isMiddleScan ? 'middle' : 'primary',
            captureTarget: isMiddleScan && event.target instanceof Element ? event.target : undefined,
        };

        if (isMiddleScan) this.updatePressLookup(event);
    }

    private updatePressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };

        if (!pressLookup.active) {
            const distance = Math.hypot(event.clientX - pressLookup.startX, event.clientY - pressLookup.startY);
            if (distance < 8) return;
            pressLookup.active = true;
            this.suppressWordClickUntil = Date.now() + 700;
            this.suppressedHoverWord = undefined;
        }

        event.preventDefault();
        event.stopPropagation();

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
        if (word === pressLookup.lastWord) return;
        pressLookup.lastWord = word;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
        void this.showWord(word, { trigger: 'hover' });
    }

    private endPressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        if (pressLookup.active) {
            this.suppressWordClickUntil = Date.now() + 700;
            this.suppressSelectionLookupUntil = Date.now() + 350;
        }
        if (pressLookup.source === 'middle') {
            event.preventDefault();
            event.stopPropagation();
            this.finishMiddleMouseLookup(pressLookup);
            if (this.activePopoverMode === 'hover' && !this.isHoverContextActive()) this.scheduleHoverClose();
        }
        this.pressLookup = undefined;
    }

    private shouldCaptureMiddleMouseLookup(event: MouseEvent | PointerEvent): boolean {
        if (!this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
        if ('pointerType' in event && event.pointerType !== 'mouse') return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        const target = event.target instanceof Element ? event.target : null;
        return !this.isNativeMiddleClickTarget(target);
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

    private canLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer, .jpdb-reader-popover'));
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer'));
    }

    private handleHoverPointer(event: PointerEvent): void {
        if (this.isDestroyed) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (this.pressLookup?.source === 'middle') return;
        if (event.pointerType === 'touch') return;
        if (this.isInsideActivePopover(event.target as Node | null)) {
            this.cancelHoverClose();
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || !this.canHoverLookupReaderWord(word)) {
            if (this.activePopoverMode === 'hover' && !this.isHoverContextActive({ ignoreCssHover: true })) {
                this.scheduleHoverClose(undefined, { ignoreCssHover: true });
            }
            if (!this.shouldLookupOnHover(event)) return;
            const candidate = this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target);
            if (candidate) this.schedulePointerTextLookup(candidate, event);
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        this.scheduleHoverLookup(word, event);
    }

    private handleHoverPointerOut(event: PointerEvent): void {
        if (this.isDestroyed) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        const related = event.relatedTarget as Node | null;
        if (this.isInsideActivePopover(event.target as Node | null)) {
            if (this.isInsideActivePopover(related) || (this.activeHoverWord && this.isInsideNode(related, this.activeHoverWord))) return;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || (related && word.contains(related))) return;
        window.clearTimeout(this.hoverLookupTimer);
        if (this.hoverPendingWord === word) this.hoverPendingWord = undefined;
        if (this.suppressedHoverWord === word) this.suppressedHoverWord = undefined;

        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            if (this.isInsideActivePopover(related)) {
                this.cancelHoverClose();
                return;
            }
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        }
    }

    private scheduleHoverLookupAtPointer(event: KeyboardEvent): void {
        if (this.isDestroyed) return;
        if (!this.lastPointerPosition) return;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) as HTMLElement | null;
        const word = target?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || !this.canHoverLookupReaderWord(word)) {
            const candidate = this.lookupCandidateFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y, target);
            if (candidate) this.schedulePointerTextLookup(candidate, event);
            return;
        }
        this.scheduleHoverLookup(word, event);
    }

    private dismissHoverPopoverForOutsidePointer(event: PointerEvent): void {
        if (this.isDestroyed || this.activePopoverMode !== 'hover') return;
        const target = event.target as Node | null;
        if (this.isInsideActivePopover(target)) return;
        if (this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord)) return;
        this.dismiss({ suppressHoverTarget: false });
    }

    private scheduleHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent): void {
        if (this.suppressedHoverWord === word) return;
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) return;
        if (this.hoverPendingWord === word && this.hoverLookupTimer) return;

        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverPendingWord = word;
        const runLookup = () => {
            this.hoverLookupTimer = undefined;
            this.hoverPendingWord = undefined;
            let activeWord = word;
            if (!activeWord.isConnected && this.lastPointerPosition) {
                activeWord = this.wordFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) ?? activeWord;
            }
            if (!activeWord.isConnected || this.suppressedHoverWord === activeWord) return;
            if (!this.isWordHoverActive(activeWord) || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys)) return;
            if (activeWord.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(activeWord, { trigger: 'hover' });
        };
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) {
            runLookup();
            return;
        }
        this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private schedulePointerTextLookup(candidate: PointerTextLookup, event: MouseEvent | KeyboardEvent): void {
        if (this.hoverLookupTimer && this.activePopoverAnchor === candidate.anchor) return;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverPendingWord = undefined;
        const runLookup = () => {
            this.hoverLookupTimer = undefined;
            if (!candidate.anchor.isConnected || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys)) return;
            void this.showLookupCandidate(candidate, 'hover');
        };
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) {
            runLookup();
            return;
        }
        this.hoverLookupTimer = window.setTimeout(runLookup, delay);
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
        if (!options.ignoreCssHover && this.activePopover?.matches(':hover')) return true;
        if (options.ignorePointerPosition) return false;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideActivePopover(target) || Boolean(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private isWordHoverActive(word: HTMLElement, options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        if (!options.ignoreCssHover && word.matches(':hover')) return true;
        if (options.ignorePointerPosition) return false;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideNode(target, word);
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
        const selected = getSelectionText();
        if (selected.length < 1 || selected.length > 120 || !HAS_JAPANESE.test(selected)) return;
        if ((document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) return;
        log.debug('Looking up selected text', { length: selected.length });
        await this.lookupText(selected, getSelectionSentence());
    }

    private async lookupText(text: string, sentence = text, options: { navigation?: CardNavigationMode; preservePosition?: boolean } = {}): Promise<void> {
        const selected = text.replace(/\s+/g, ' ').trim();
        if (!selected || !HAS_JAPANESE.test(selected)) return;
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        const preservePosition = options.preservePosition ?? (navigation !== 'reset' && Boolean(this.activePopover));
        const done = log.time('lookupText', { length: selected.length, trigger });
        try {
            const [tokens] = await this.parseJapanese([sentence]);
            const selectedToken = pickTokenForSelection(tokens, selected);
            if (!selectedToken) {
                if (tokens.length) {
                    log.debug('Lookup produced token list', { selected, tokenCount: tokens.length });
                    this.showTokenList(tokens, selected, anchor, { trigger, navigation, preservePosition });
                    return;
                }
                const localEntries = this.settings.localDictionariesEnabled
                    ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                    : [];
                if (localEntries.length) {
                    log.debug('Lookup fell back to local dictionary entry', { selected, entries: localEntries.length });
                    void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, anchor, { trigger, navigation, preservePosition });
                    return;
                }
                log.debug('Lookup found no entries', { selected });
                return;
            }
            log.debug('Lookup selected token', { selected, term: selectedToken.card.spelling, source: selectedToken.card.source ?? 'jpdb' });
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence, anchor, { trigger, navigation, preservePosition });
        } catch (error) {
            log.warn('Lookup failed; trying local fallback', { selected }, error);
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : [];
            if (localEntries.length) void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, anchor, { trigger, navigation, preservePosition });
            else this.toast(error instanceof Error ? error.message : 'JPDB lookup failed.');
        } finally {
            done();
        }
    }

    private handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        const link = (event.target as HTMLElement).closest?.<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]');
        if (!link) return false;
        const query = link.dataset.dictionaryLookup?.replace(/\s+/g, ' ').trim() ?? '';
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
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(query, normalizedReading || query, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
                    log.warn('Dictionary reference local lookup failed', { query, reading: normalizedReading, sourceDictionary }, error);
                    return [];
                })
                : [];
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

    private lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null): PointerTextLookup | null {
        const element = eventTarget instanceof Element ? eventTarget : document.elementFromPoint(x, y);
        if (!element || this.isNativeTextLookupTarget(element)) return null;

        const position = caretTextPositionFromPoint(x, y);
        if (!position || !position.node.parentElement) return null;
        if (!element.contains(position.node) && !position.node.parentElement.contains(element)) return null;
        if (position.node.parentElement.closest('.jpdb-reader-word')) return null;

        const run = japaneseRunAt(position.node.data, position.offset);
        if (!run) return null;
        return {
            text: position.node.data,
            offset: run.offset,
            anchor: position.node.parentElement,
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

    private async showLookupCandidate(candidate: PointerTextLookup, trigger: 'modal' | 'hover', options: { navigation?: CardNavigationMode; preservePosition?: boolean } = {}): Promise<void> {
        const sentence = candidate.text.replace(/\s+/g, ' ').trim();
        if (!sentence || !HAS_JAPANESE.test(sentence)) return;
        const done = log.time('lookupTextAtPointer', { length: sentence.length, offset: candidate.offset, trigger });
        try {
            const [tokens] = await this.parseJapanese([candidate.text]);
            const token = (tokens ?? []).find(item =>
                (item.start <= candidate.offset && candidate.offset < item.end)
                || (item.start < candidate.offset && candidate.offset <= item.end),
            );
            if (token) {
                await this.showCard(token.card, token.sentence ?? sentence, candidate.anchor, { trigger, navigation: options.navigation ?? 'reset', preservePosition: options.preservePosition });
                return;
            }

            const entry = await this.lookupLocalEntryAtOffset(candidate.text, candidate.offset);
            if (entry) {
                await this.showCard(this.parser.localCardFromEntry(entry), sentence, candidate.anchor, { trigger, navigation: options.navigation ?? 'reset', preservePosition: options.preservePosition });
                return;
            }
            log.debug('Pointer text lookup found no local entry', { offset: candidate.offset });
        } catch (error) {
            log.debug('Pointer text lookup failed quietly', { offset: candidate.offset }, error);
        } finally {
            done();
        }
    }

    private async lookupLocalEntryAtOffset(text: string, offset: number): Promise<YomitanTermEntry | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const run = japaneseRunAt(text, offset);
        if (!run) return undefined;

        const maxEnd = Math.min(run.end, run.offset + 18);
        for (let end = maxEnd; end > run.offset; end--) {
            const surface = text.slice(run.offset, end);
            const entries = await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []);
            if (entries[0]) return entries[0];
        }
        if (run.offset > run.start) {
            for (let start = run.offset - 1; start >= run.start; start--) {
                const surface = text.slice(start, run.offset + 1);
                const entries = await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []);
                if (entries[0]) return entries[0];
            }
        }
        return undefined;
    }

    private async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        if (this.visiblePageScanInFlight) {
            log.debugThrottled('visible-page-scan-skipped', 1000, 'Visible page scan skipped because one is already running');
            return;
        }
        this.visiblePageScanInFlight = true;
        const done = log.time('scanVisiblePage', { silent: Boolean(options.silent) });
        try {
            const targets = collectScanTargets();
            if (!targets.length) {
                log.debug('Visible page scan found no targets', { silent: Boolean(options.silent) });
                if (!options.silent) this.toast('No unscanned Japanese text found.');
                return;
            }

            const parsed = await this.parseJapanese(targets.map(target => target.text));
            this.pauseAutoScanObserver(() => {
                targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
            });
            this.preloadImmersionKitForTokens(parsed.flat());
            void this.enrichAnkiWords(parsed.flat());
            log.debugThrottled('visible-page-scan-applied', 2500, 'Visible page scan applied tokens', {
                targets: targets.length,
                tokens: parsed.reduce((sum, tokens) => sum + tokens.length, 0),
            });
        } catch (error) {
            log.warn('Visible page scan failed', error);
            if (!options.silent) this.toast(error instanceof Error ? error.message : 'JPDB scan failed.');
        } finally {
            this.visiblePageScanInFlight = false;
            done();
        }
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
            this.preloadImmersionKitForTokens(parsed.flat());
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

    private async showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode } = {}): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.getCachedCard(vid, sid);
        if (!card) {
            log.warn('Clicked word missing from cache', { vid, sid });
            this.toast('That word is no longer in the local JPDB cache. Scan it again.');
            return;
        }
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        if (insideReaderPopup && word.closest('.jpdb-reader-example-card')) {
            this.rememberPageMiningContext(card, word.dataset.sentence || undefined, word);
        }
        const anchor = insideReaderPopup
            ? this.activePopoverAnchor ?? undefined
            : word;
        const trigger = insideReaderPopup && this.activePopoverMode === 'hover'
            ? 'hover'
            : options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? (insideReaderPopup && trigger === 'modal' ? 'push-current' : 'reset');
        log.debug('Showing word card from rendered token', { term: card.spelling, trigger, source: card.source ?? 'jpdb' });
        void this.showCard(card, word.dataset.sentence || undefined, anchor, { trigger, navigation, preservePosition: insideReaderPopup });
    }

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options: Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition'> = {}): void {
        if (!tokens.length) return;
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        if (trigger === 'modal' && (options.navigation ?? 'reset') === 'reset') this.clearWordNavigation();
        log.debug('Rendering token disambiguation popup', { selected, tokens: tokens.length, trigger });
        const popover = this.createPopover();
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map(token => `
                    <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                        ${escapeHtml(token.card.spelling)} ${token.card.reading !== token.card.spelling ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>` : ''}
                    </button>
                `).join('')}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml(selected)}</div>
        `);
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
            if (!button) return;
            const card = this.getCachedCard(Number(button.dataset.vid), Number(button.dataset.sid));
            if (card) void this.showCard(card, tokens.find(t => t.card === card)?.sentence, anchor, { trigger, navigation: options.navigation ?? 'reset', preservePosition: true });
        });
        this.mountPopover(popover, anchor, { mode: trigger, preservePosition: options.preservePosition });
        void this.parsePopoverJapanese(popover);
    }

    private showLocalDictionaryPopup(term: string, entries: YomitanTermEntry[], anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): void {
        log.debug('Rendering local dictionary popup', { term, entries: entries.length, trigger });
        const popover = this.createPopover();
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${escapeHtml(term)}</div>
                    <div class="jpdb-reader-reading">Yomitan dictionaries</div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack">
                ${Array.from(groupTermEntriesByDictionary(entries))
                    .map(([dictionary, dictionaryEntries]) => this.renderLocalDefinitionSource(dictionary, dictionaryEntries))
                    .join('')}
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
        const cardStates = normalizeCardStates(card.cardState);
        const state = primaryCardState(cardStates);
        const popover = this.createPopover();
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        this.updateWordNavigation(card, sentence, trigger, navigation);
        const done = log.time('showCard', { term: card.spelling, source: card.source ?? 'jpdb', trigger });
        if (this.activeMiningContext?.term !== card.spelling || this.activeMiningContext.sentence !== (sentence || '').replace(/\s+/g, ' ').trim()) {
            this.rememberPageMiningContext(card, sentence, anchor);
        }
        this.lastAnkiLookup = { state: 'not-in-deck', notes: [], primary: null };
        setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: this.lastAnkiLookup,
            loading: true,
        }));
        this.installCardPopoverHandlers(popover, card, sentence, anchor, trigger);
        this.mountPopover(popover, anchor, {
            mode: trigger,
            preservePosition: options.preservePosition ?? (trigger === 'modal' && navigation !== 'reset'),
        });
        const requestId = ++this.cardRenderRequest;
        log.debug('Card shell mounted', { term: card.spelling, trigger });
        if (options.autoPlay !== false && this.shouldAutoPlay(card)) void this.playAudio(card);

        const { localEntries, kanjiEntries, metaEntries, ankiLookup } = await this.loadCardRenderData(card);
        if (requestId !== this.cardRenderRequest || !popover.isConnected || this.activePopover !== popover) {
            log.debug('Discarding stale card render', { term: card.spelling, requestId });
            done();
            return;
        }
        this.lastAnkiLookup = ankiLookup;
        this.applyAnkiLookupToRenderedWords(card, ankiLookup);
        setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, {
            localEntries,
            kanjiEntries,
            metaEntries,
            ankiLookup,
            loading: false,
        }));

        log.debug('Card rendered', {
            term: card.spelling,
            localEntries: localEntries.length,
            kanjiEntries: kanjiEntries.length,
            metaEntries: metaEntries.length,
            ankiState: ankiLookup.state,
            hasJpdb: this.isJpdbBackedCard(card),
        });
        this.repositionActivePopover();
        void this.parsePopoverJapanese(popover);
        void this.loadImmersionKitExamples(popover, card);
        this.installStudyTranslationLoader(popover, sentence);
        done();
    }

    private renderCardPopoverContent(
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData & { loading: boolean },
    ): string {
        const cardStates = normalizeCardStates(card.cardState);
        const state = primaryCardState(cardStates);
        const storedContext = data.loading ? null : loadMiningContext(card.spelling);
        const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
        const cardPos = formatPartOfSpeech(card.partOfSpeech);
        const cardPosDetails = formatPartOfSpeechDetails(card.partOfSpeech);
        const language = this.settings.interfaceLanguage;
        const hasJpdb = this.isJpdbBackedCard(card);
        const jpdbActionRow = hasJpdb && this.settings.jpdbMiningEnabled ? `
                <div class="jpdb-reader-row" style="--cols: 3">
                    <button class="jpdb-reader-btn add" data-action="add">${uiText(language, 'add')}</button>
                    <button class="jpdb-reader-btn nf" data-action="neverforget" title="${uiText(language, 'neverHint')}">${cardStates.includes('never-forget') ? uiText(language, 'forget') : uiText(language, 'never')}</button>
                    <button class="jpdb-reader-btn blacklist" data-action="blacklist" title="${uiText(language, 'blacklistHint')}">${cardStates.includes('blacklisted') ? uiText(language, 'unlist') : uiText(language, 'blacklist')}</button>
                </div>
            ` : '';
        const reviewButtons = !data.loading && this.settings.enableReviews && ((hasJpdb && this.settings.jpdbMiningEnabled) || data.ankiLookup.primary?.primaryCardId)
            ? this.renderReviewButtons(data.ankiLookup.primary)
            : '';
        const metaItems = [
            card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '',
            hasJpdb ? `<span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(state)}</span>` : '',
            data.ankiLookup.primary ? `<span><span class="jpdb-reader-state-dot jpdb-${data.ankiLookup.state}"></span>Anki ${escapeHtml(data.ankiLookup.state)}</span>` : '',
        ].filter(Boolean);
        const loadingDetails = data.loading
            ? '<div class="jpdb-reader-help" data-card-details-loading>Loading dictionary details...</div>'
            : '';

        return `
            <div class="jpdb-reader-sheet-handle"></div>
            ${this.renderWordHistoryNavigation(language, trigger)}
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row">
                        <div class="jpdb-reader-spelling jpdb-${state}">${renderSpellingForKanjiNavigation(card.spelling, language)}</div>
                        ${this.renderLookupPills(card, jpdbUrl)}
                    </div>
                    ${card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(card.reading)}</div>` : ''}
                </div>
                <div class="jpdb-reader-card-tools">
                    ${this.settings.showPitchAccent ? renderPitch(card, data.metaEntries) : ''}
                    <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button" aria-label="${uiText(language, 'playAudio')}" title="${uiText(language, 'playAudio')}">${speakerIcon()}</button>
                </div>
            </div>
            ${cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(cardPosDetails)}">${escapeHtml(cardPos)}</div>` : ''}
            ${this.renderDefinitionSources(card, data.localEntries, sentence)}
            ${loadingDetails}
            ${metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : ''}
            ${this.renderTermMeta(data.metaEntries)}
            ${data.loading ? '' : this.renderAnkiExistingSection(data.ankiLookup, storedContext)}
            ${this.renderKanjiDefinitions(data.kanjiEntries)}
            <div class="jpdb-reader-actions">
                ${jpdbActionRow}
                ${data.loading ? '' : this.renderAnkiActionRow(data.ankiLookup)}
                ${reviewButtons}
            </div>
        `;
    }

    private async loadCardRenderData(card: JPDBCard): Promise<CardRenderData> {
        const localEntriesPromise = this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local term lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const kanjiEntriesPromise = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local kanji lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const metaEntriesPromise = this.settings.localDictionariesEnabled
            ? this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local metadata lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const jpdbPublicPitchPromise = this.settings.showPitchAccent && !card.pitchAccent.length
            ? this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(error => {
                log.warn('Public JPDB pitch lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const ankiLookupPromise = this.settings.ankiEnabled
            ? this.anki.findExistingCards(card).catch(error => {
                log.warn('Anki lookup failed while rendering card', { term: card.spelling }, error);
                return { state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult;
            })
            : Promise.resolve({ state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult);
        const [localEntries, kanjiEntries, metaEntries, jpdbPublicPitch, ankiLookup] = await Promise.all([
            localEntriesPromise,
            kanjiEntriesPromise,
            metaEntriesPromise,
            jpdbPublicPitchPromise,
            ankiLookupPromise,
        ]);
        if (!card.pitchAccent.length && jpdbPublicPitch.length) card.pitchAccent = jpdbPublicPitch;
        return { localEntries, kanjiEntries, metaEntries, ankiLookup };
    }

    private installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
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
            void this.handleCardAction(button, card, sentence);
        });
    }

    private updateWordNavigation(card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', mode: CardNavigationMode): void {
        if (trigger !== 'modal') {
            this.clearWordNavigation();
            return;
        }

        const next: CardNavigationEntry = { card, sentence };
        if (mode === 'reset') {
            this.wordNavigationStack = [];
            this.currentWordNavigation = next;
            return;
        }

        if (mode === 'push-current' && this.currentWordNavigation && !this.isSameNavigationCard(this.currentWordNavigation, next)) {
            const lastStackEntry = this.wordNavigationStack[this.wordNavigationStack.length - 1];
            if (!lastStackEntry || !this.isSameNavigationCard(lastStackEntry, this.currentWordNavigation)) {
                this.wordNavigationStack.push(this.currentWordNavigation);
            }
        }
        this.currentWordNavigation = next;
    }

    private clearWordNavigation(): void {
        this.wordNavigationStack = [];
        this.currentWordNavigation = undefined;
    }

    private isSameNavigationCard(first: CardNavigationEntry, second: CardNavigationEntry): boolean {
        return cardKey(first.card) === cardKey(second.card);
    }

    private renderWordHistoryNavigation(language: InterfaceLanguage, trigger: 'modal' | 'hover'): string {
        if (trigger !== 'modal') return '';
        const previous = this.wordNavigationStack[this.wordNavigationStack.length - 1];
        if (!previous) return '';
        return this.renderModalNavigation({
            backAction: 'word-history-back',
            backTitle: `${uiText(language, 'backToWord')}: ${previous.card.spelling}`,
            label: previous.card.spelling,
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
        await this.showCard(previous.card, previous.sentence, anchor, {
            autoPlay: false,
            trigger,
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

    private renderLookupPills(card: JPDBCard, jpdbUrl: string, overrideQuery?: string): string {
        const query = overrideQuery || card.spelling || card.reading;
        const language = this.settings.interfaceLanguage;
        const context = {
            query,
            word: overrideQuery || card.spelling,
            reading: overrideQuery || card.reading || card.spelling,
            vid: String(Math.max(0, card.vid)),
            sid: String(Math.max(0, card.sid)),
        };
        const links = this.settings.dictionaryLookupLinks
            .filter(link => link.enabled)
            .map(link => {
                const url = link.id === 'jpdb' && (Boolean(overrideQuery) || this.isJpdbBackedCard(card))
                    ? jpdbUrl
                    : formatLookupUrl(link.urlTemplate, context);
                if (!url) return '';
                const title = link.id === 'jpdb'
                    ? (overrideQuery ? uiText(language, 'openKanjiOnJpdb') : uiText(language, 'openOnJpdb'))
                    : `Open on ${link.label}`;
                return `<a class="jpdb-reader-jpdb-pill" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
            })
            .join('');
        const copyTitle = uiText(language, 'copyWordTitle');
        const copy = `<button class="jpdb-reader-jpdb-pill jpdb-reader-copy-pill" data-action="copy-word" type="button" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(uiText(language, 'copyWord'))} ${copyIcon()}</button>`;
        return `<div class="jpdb-reader-lookup-pills">${links}${copy}</div>`;
    }

    private async showKanjiCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: { preservePosition?: boolean } = {}): Promise<void> {
        if (!isKanjiCharacter(kanji)) return;
        log.debug('Rendering kanji card', { term: card.spelling, kanji });
        const popover = this.createPopover();
        const kanjiCharacters = uniqueKanji(card.spelling);
        const index = Math.max(0, kanjiCharacters.indexOf(kanji));
        const previous = kanjiCharacters[(index - 1 + kanjiCharacters.length) % kanjiCharacters.length];
        const next = kanjiCharacters[(index + 1) % kanjiCharacters.length];
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const language = this.settings.interfaceLanguage;
        const hasJpdbKanji = Boolean(this.settings.apiKey.trim()) && this.settings.jpdbKanjiEnabled;
        const kanjiVGPromise = this.settings.kanjivgEnabled
            ? this.kanjiVG.lookup(kanji).catch(() => null)
            : Promise.resolve(null);
        const detailsPromises: KanjiDetailPromises = {
            jpdbInfo: hasJpdbKanji ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null),
            kanjiEntries: this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
                ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            rtkInfo: this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
        const kanjiNavigationControls = kanjiCharacters.length > 1 ? `
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}" title="${escapeHtml(uiText(language, 'previousKanji'))}">‹</button>
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}" title="${escapeHtml(uiText(language, 'nextKanji'))}">›</button>
        ` : '';

        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            ${this.renderModalNavigation({
                backAction: 'word-back',
                backTitle: `${uiText(language, 'backToWord')}: ${card.spelling}`,
                label: card.spelling,
                controlsHtml: kanjiNavigationControls,
            })}
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                        <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                        <div data-kanji-keyword-mount><div class="jpdb-reader-help">Loading kanji details...</div></div>
                        ${this.renderLookupPills(card, jpdbUrl, kanji)}
                    </div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                ${this.renderKanjiSourceMounts(kanji, language)}
            </div>
        `);

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
            if (action === 'word-back') void this.showCard(card, sentence, anchor, { autoPlay: false, navigation: 'preserve', preservePosition: true });
            if (action === 'kanji-prev' || action === 'kanji-next') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { preservePosition: true });
            if (action === 'kanji') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { preservePosition: true });
            if (action === 'similar-word') void this.lookupText(actionButton.dataset.expression ?? '', actionButton.dataset.expression ?? '', { navigation: 'push-current', preservePosition: true });
        });
        this.mountPopover(popover, anchor, { preservePosition: options.preservePosition });
        installKanjiDoodle(popover, () => this.settings.interfaceLanguage);
        if (this.settings.similarKanjiWords) {
            void this.renderSimilarKanjiWordsProgressively(popover, detailsPromises.jpdbInfo, kanji, card);
        }
        void this.renderKanjiDetailsInto(popover, detailsPromises, card, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, kanjiVGPromise, kanji, language);
        }
    }

    private renderKanjiSourceMounts(kanji: string, language: InterfaceLanguage): string {
        return orderedKanjiSourceIds(this.settings).map(sourceId => {
            if (sourceId === KANJI_STROKE_SOURCE_ID) {
                const sourceStateKey = this.kanjiSourceStateKey(KANJI_STROKE_SOURCE_ID);
                return renderKanjiPractice(null, kanji, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey);
            }
            if (sourceId === KANJI_JPDB_SOURCE_ID) return '<div data-kanji-jpdb-mount></div>';
            if (sourceId === KANJI_RTK_SOURCE_ID) return '<div data-kanji-rtk-mount></div>';
            if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return '<div data-kanji-definitions-mount></div>';
            if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) return this.renderSimilarKanjiWordsShell(kanji, language);
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
        const keywordMount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
        const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
        const rtkMount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
        const definitionsMount = popover.querySelector<HTMLElement>('[data-kanji-definitions-mount]');

        const renderKeyword = () => {
            if (!popover.isConnected || !keywordMount?.isConnected) return;
            setInnerHtml(keywordMount, renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries));
            this.repositionActivePopover();
        };
        const renderRtk = () => {
            if (!popover.isConnected || !rtkMount?.isConnected) return;
            const componentSummaries = buildRtkComponentSummaries(rtkInfo, jpdbInfo, kanjiEntries);
            const sourceStateKey = this.kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
            setInnerHtml(rtkMount, renderRtkInfo(rtkInfo, componentSummaries, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
            this.repositionActivePopover();
        };

        const jpdbInfoPromise = detailsPromises.jpdbInfo.then(info => {
            jpdbInfo = info;
            if (!popover.isConnected) return;
            log.debug('JPDB kanji details loaded', { kanji, hasJpdbInfo: Boolean(jpdbInfo) });
            renderKeyword();
            if (jpdbMount?.isConnected) {
                const sourceStateKey = this.kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
            }
            renderRtk();
        });
        const kanjiEntriesPromise = detailsPromises.kanjiEntries.then(entries => {
            kanjiEntries = entries;
            if (!popover.isConnected) return;
            log.debug('Local kanji details loaded', { kanji, entries: kanjiEntries.length });
            renderKeyword();
            if (definitionsMount?.isConnected) setInnerHtml(definitionsMount, this.renderKanjiDefinitions(kanjiEntries));
            renderRtk();
        });
        const rtkInfoPromise = detailsPromises.rtkInfo.then(info => {
            rtkInfo = info;
            if (!popover.isConnected) return;
            log.debug('RTK kanji details loaded', { kanji, hasRtkInfo: Boolean(rtkInfo) });
            renderKeyword();
            renderRtk();
        });

        await Promise.all([jpdbInfoPromise, kanjiEntriesPromise, rtkInfoPromise]);
        if (!popover.isConnected) return;
        log.debug('Kanji details loaded', {
            kanji,
            hasJpdbInfo: Boolean(jpdbInfo),
            localKanjiEntries: kanjiEntries.length,
            hasRtkInfo: Boolean(rtkInfo),
        });
        const resolvedJpdbInfo = jpdbInfo as JpdbKanjiInfo | null;
        const resolvedRtkInfo = rtkInfo as RtkInfo | null;

        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, resolvedJpdbInfo, resolvedRtkInfo, null, kanjiEntries);
        }
        void this.parsePopoverJapanese(popover);
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
            const content = this.renderSimilarKanjiWordsContent(localEntries, jpdbVocabulary, card);
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
        setInnerHtml(mount, this.renderSimilarKanjiWordsContent(entries, jpdbVocabulary, card));
    }

    private async renderKanjiVGInto(popover: HTMLElement, kanjiVGPromise: Promise<KanjiVGInfo | null>, kanji: string, language: InterfaceLanguage): Promise<void> {
        const info = await kanjiVGPromise;
        if (!info || !popover.isConnected) return;
        log.debug('KanjiVG loaded', { kanji, strokes: info.strokeCount });
        const stage = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-doodle-stage'))
            .find(candidate => candidate.dataset.kanji === kanji);
        const ghost = stage?.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        const help = stage?.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
        if (!stage || !ghost || !help) return;
        setInnerHtml(ghost, info.svg);
        help.textContent = `${info.strokeCount} ${uiText(language, 'strokes')}`;
        stage.classList.remove('trace-hidden');
        const trace = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        if (trace) trace.textContent = uiText(language, 'hideTrace');
    }

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.kanjiOrigin.lookup(kanji, { ...this.settings, kanjiOriginWiktionaryEnabled: false }).catch(error => {
            log.warn('Kanji origin lookup failed', { kanji }, error);
            return null;
        });
        if (!popover.isConnected || !mount.isConnected) return;
        log.debug('Kanji origin rendered', { kanji, hasSourceInfo: Boolean(sourceInfo) });
        const facts = buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        const graph = this.settings.kanjiOriginGraphEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo)
            : null;
        const sourceStateKey = this.kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, renderKanjiOrigins(facts, graph, sourceInfo, this.settings, this.settings.interfaceLanguage, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
        mount.querySelectorAll<HTMLImageElement>('[data-radical-frame]').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
        });
        this.installKanjiGraphDrag(mount);
    }

    private installKanjiGraphDrag(root: HTMLElement): void {
        const graph = root.querySelector<HTMLElement>('.jpdb-reader-origin-graph-wrap');
        if (!graph) return;
        const nodes = Array.from(graph.querySelectorAll<HTMLElement>('[data-graph-node]'));
        const edgeGroups = Array.from(graph.querySelectorAll<SVGGElement>('.jpdb-reader-origin-edge-group[data-from][data-to]'));
        const nodeById = new Map(nodes.map(node => [node.dataset.graphNode ?? '', node]));
        let updateScheduled = false;
        const readNodeGeometry = (node: HTMLElement) => {
            const graphRect = graph.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const fallbackX = Number(node.dataset.x ?? 50);
            const fallbackY = Number(node.dataset.y ?? 50);
            if (!graphRect.width || !graphRect.height || !nodeRect.width || !nodeRect.height) {
                return {
                    x: fallbackX,
                    y: fallbackY,
                    rx: Number(node.dataset.rx ?? 6),
                    ry: Number(node.dataset.ry ?? 8),
                };
            }
            return {
                x: ((nodeRect.left + nodeRect.width / 2 - graphRect.left) / graphRect.width) * 100,
                y: ((nodeRect.top + nodeRect.height / 2 - graphRect.top) / graphRect.height) * 100,
                rx: (nodeRect.width / graphRect.width) * 50,
                ry: (nodeRect.height / graphRect.height) * 50,
            };
        };
        const edgePath = (from: ReturnType<typeof readNodeGeometry>, to: ReturnType<typeof readNodeGeometry>) => {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const sourceOffset = graphEllipseOffset(dx, dy, from.rx + 0.8, from.ry + 0.8);
            const targetOffset = graphEllipseOffset(dx, dy, to.rx + 1.75, to.ry + 1.75);
            const x1 = from.x + dx * sourceOffset;
            const y1 = from.y + dy * sourceOffset;
            const x2 = to.x - dx * targetOffset;
            const y2 = to.y - dy * targetOffset;
            const curve = graphEdgeCurveControl(x1, y1, x2, y2);
            return {
                d: `M${formatGraphCoordinate(x1)} ${formatGraphCoordinate(y1)} Q${formatGraphCoordinate(curve.x)} ${formatGraphCoordinate(curve.y)} ${formatGraphCoordinate(x2)} ${formatGraphCoordinate(y2)}`,
                points: [
                    graphQuadraticPoint(x1, y1, curve.x, curve.y, x2, y2, 0.38),
                    graphQuadraticPoint(x1, y1, curve.x, curve.y, x2, y2, 0.66),
                ],
            };
        };
        const updateLines = () => {
            for (const group of edgeGroups) {
                const from = group.dataset.from ? nodeById.get(group.dataset.from) : undefined;
                const to = group.dataset.to ? nodeById.get(group.dataset.to) : undefined;
                if (!from || !to) continue;
                const path = edgePath(readNodeGeometry(from), readNodeGeometry(to));
                group.querySelector<SVGPathElement>('.jpdb-reader-origin-edge')?.setAttribute('d', path.d);
                group.querySelectorAll<SVGCircleElement>('.jpdb-reader-origin-edge-particle').forEach((particle, index) => {
                    const point = path.points[index];
                    if (!point) return;
                    particle.setAttribute('cx', formatGraphCoordinate(point.x));
                    particle.setAttribute('cy', formatGraphCoordinate(point.y));
                });
            }
        };
        const scheduleLineUpdate = () => {
            if (updateScheduled) return;
            updateScheduled = true;
            requestAnimationFrame(() => {
                updateScheduled = false;
                updateLines();
            });
        };
        const outboundToggle = graph.querySelector<HTMLInputElement>('[data-origin-outbound-toggle]');
        if (outboundToggle) {
            const syncOutboundVisibility = () => {
                graph.classList.toggle('show-outbound', outboundToggle.checked);
                scheduleLineUpdate();
            };
            outboundToggle.addEventListener('change', syncOutboundVisibility);
            syncOutboundVisibility();
        }

        for (const node of nodes) {
            let pointerId = -1;
            let startX = 0;
            let startY = 0;
            let startLeft = Number(node.dataset.x ?? 50);
            let startTop = Number(node.dataset.y ?? 50);
            let moved = false;

            node.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                pointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                startLeft = Number(node.dataset.x ?? 50);
                startTop = Number(node.dataset.y ?? 50);
                moved = false;
                node.classList.add('dragging');
                node.setPointerCapture?.(event.pointerId);
                event.preventDefault();
            });
            node.addEventListener('pointermove', event => {
                if (event.pointerId !== pointerId) return;
                const rect = graph.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const nodeRect = node.getBoundingClientRect();
                const padX = Math.max(6, (nodeRect.width / rect.width) * 50 + 2);
                const padY = Math.max(9, (nodeRect.height / rect.height) * 50 + 2);
                const nextX = Math.max(padX, Math.min(100 - padX, startLeft + ((event.clientX - startX) / rect.width) * 100));
                const nextY = Math.max(padY, Math.min(100 - padY, startTop + ((event.clientY - startY) / rect.height) * 100));
                if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) moved = true;
                node.dataset.x = String(nextX);
                node.dataset.y = String(nextY);
                node.style.left = `${nextX}%`;
                node.style.top = `${nextY}%`;
                scheduleLineUpdate();
                event.preventDefault();
            });
            const finish = (event: PointerEvent) => {
                if (event.pointerId !== pointerId) return;
                node.releasePointerCapture?.(pointerId);
                pointerId = -1;
                node.classList.remove('dragging');
                if (moved) node.dataset.dragged = 'true';
                updateLines();
            };
            node.addEventListener('pointerup', finish);
            node.addEventListener('pointercancel', finish);
            node.addEventListener('click', event => {
                if (node.dataset.dragged !== 'true') return;
                delete node.dataset.dragged;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
        }
        requestAnimationFrame(updateLines);
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[], sentence?: string): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const sections = orderedDefinitionSourceIds(this.settings, [...grouped.keys()])
            .map(sourceId => {
                if ((card.source === 'local' || card.source === 'anki') && sourceId === JPDB_DEFINITION_SOURCE_ID) return '';
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return this.renderJpdbDefinitionSource(card);
                if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return this.renderStudyTranslationSource(sentence);
                if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return this.renderStudyGrammarSource(sentence);
                if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderImmersionKitMount();
                return this.renderLocalDefinitionSource(sourceId, grouped.get(sourceId) ?? []);
            })
            .filter(Boolean);
        return sections.length
            ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
            : `<div class="jpdb-reader-help jpdb-reader-no-definitions">${uiText(this.settings.interfaceLanguage, 'noDefinitions')}</div>`;
    }

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceAttributes(this.definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private renderStudyTranslationSource(sentence?: string): string {
        if (!sentence || !this.settings.studyTranslationEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-study-source" data-study-translation>
                <summary class="jpdb-reader-local-title">Translation</summary>
                <div class="jpdb-reader-study-panel">
                    <div class="jpdb-reader-study-title">Original</div>
                    <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>${escapeHtml(sentence)}</div>
                    <div class="jpdb-reader-study-title">Translation</div>
                    <div data-study-translation-result>Open to translate.</div>
                </div>
            </details>
        `;
    }

    private renderStudyGrammarSource(sentence?: string): string {
        if (!sentence || !this.settings.studyGrammarEnabled) return '';
        const hints = detectGrammarHints(sentence);
        if (!hints.length) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-study-source">
                <summary class="jpdb-reader-local-title">Grammar</summary>
                <div class="jpdb-reader-study-panel">
                    ${renderGrammarHints(hints, sentence)}
                </div>
            </details>
        `;
    }

    private installStudyTranslationLoader(popover: HTMLElement, sentence?: string): void {
        const container = popover.querySelector<HTMLDetailsElement>('[data-study-translation]');
        if (!container || !sentence) return;
        const load = () => {
            if (!container.open || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
            container.dataset.loading = 'true';
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = 'Translating...';
            void this.loadStudyTranslation(popover, sentence).finally(() => {
                if (!container.isConnected) return;
                delete container.dataset.loading;
                container.dataset.loaded = 'true';
            });
        };
        container.addEventListener('toggle', load);
        load();
    }

    private async loadStudyTranslation(popover: HTMLElement, sentence?: string): Promise<void> {
        const container = popover.querySelector<HTMLElement>('[data-study-translation]');
        if (!container || !sentence) return;
        try {
            const [tokens, translated] = await Promise.all([
                this.parseJapanese([sentence]).then(([parsed]) => parsed ?? []),
                translateJapaneseSentence(sentence),
            ]);
            if (!popover.isConnected || !container.isConnected) return;
            const original = container.querySelector<HTMLElement>('[data-study-original-render]');
            if (original) setInnerHtml(original, renderTokensToHtml(sentence, tokens, this.settings));
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = translated;
            void this.parsePopoverJapanese(container);
            void this.enrichAnkiWords(tokens);
        } catch (error) {
            log.warn('Automatic sentence translation failed', { sentenceLength: sentence.length }, error);
            if (!container.isConnected) return;
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = 'Translation unavailable.';
        }
    }

    private async loadImmersionKitExamples(popover: HTMLElement, card: JPDBCard): Promise<void> {
        const container = popover.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!container) return;

        try {
            const result = await this.searchImmersionKitExamples(card);
            const { examples } = result;
            if (!popover.isConnected || !container.isConnected) return;
            if (!examples.length) {
                log.debug('No Immersion Kit examples found', { term: card.spelling, triedQueries: result.triedQueries });
                this.renderCompactImmersionKitEmpty(container);
                return;
            }
            log.debug('Immersion Kit examples loaded', { term: card.spelling, query: result.query, usedFallback: result.usedFallback, examples: examples.length });

            let index = this.immersionStartIndex(card, examples);
            let renderRequest = 0;
            let hoverAudioPlayed = false;
            const render = (nextIndex: number, playAudio: boolean) => {
                const requestId = ++renderRequest;
                index = (nextIndex + examples.length) % examples.length;
                this.renderImmersionKitExample(container, card, examples, index, playAudio, result.query, () => requestId === renderRequest);
            };
            container.addEventListener('click', event => {
                const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-immersion-action]');
                if (!button) return;
                event.preventDefault();
                event.stopPropagation();
                const action = button.dataset.immersionAction;
                if (action === 'previous') render(index - 1, this.settings.immersionKitAutoPlayAudio);
                if (action === 'next') render(index + 1, this.settings.immersionKitAutoPlayAudio);
                if (action === 'audio') void this.playImmersionKitExample(examples[index]);
            });
            container.addEventListener('pointerover', event => {
                if (hoverAudioPlayed || !this.settings.immersionKitPlayOnHover) return;
                const canHover = window.matchMedia?.('(hover: hover)').matches ?? true;
                if (event.pointerType === 'touch' || !canHover) return;
                const cardElement = (event.target as HTMLElement).closest<HTMLElement>('.jpdb-reader-example-card');
                if (!cardElement || cardElement.contains(event.relatedTarget as Node | null)) return;
                hoverAudioPlayed = true;
                void this.playImmersionKitExample(examples[index], true);
            });
            render(index, false);
        } catch (error) {
            log.warn('Immersion Kit examples failed', { term: card.spelling }, error);
            if (!popover.isConnected || !container.isConnected) return;
            this.renderCompactImmersionKitEmpty(container);
        }
    }

    private async searchImmersionKitExamples(card: JPDBCard): Promise<ImmersionKitSearchResult> {
        const exactQuery = normalizeImmersionSearchQuery(card.spelling);
        const fallbackQueries = await this.immersionFallbackQueries(card, exactQuery);
        const queries = uniqueImmersionQueries([exactQuery, ...fallbackQueries]).slice(0, 1 + IMMERSION_FALLBACK_QUERY_LIMIT);
        const triedQueries: string[] = [];

        for (const query of queries) {
            if (!query) continue;
            triedQueries.push(query);
            const examples = await this.immersionKit.search(query, this.settings);
            if (examples.length) {
                return {
                    examples,
                    query,
                    usedFallback: queryKey(query) !== queryKey(exactQuery),
                    triedQueries,
                };
            }
        }

        return { examples: [], query: exactQuery, usedFallback: false, triedQueries };
    }

    private async immersionFallbackQueries(card: JPDBCard, exactQuery: string): Promise<string[]> {
        const candidates: string[] = [];
        const add = (value: string) => {
            const query = normalizeImmersionSearchQuery(value);
            if (!isUsefulImmersionFallbackQuery(query, exactQuery)) return;
            candidates.push(query);
        };

        if (card.reading !== card.spelling) add(card.reading);

        if (this.canParseJapanese()) {
            const [tokens] = await this.parseJapanese([card.spelling]).catch(error => {
                log.debug('Immersion fallback parse failed quietly', { term: card.spelling }, error);
                return [[]] as JPDBToken[][];
            });
            const tokenQueries = (tokens ?? [])
                .map(token => ({
                    token,
                    surface: card.spelling.slice(token.start, token.end),
                    length: queryLength(token.card.spelling),
                }))
                .sort((a, b) => Number(queryHasKanji(b.token.card.spelling)) - Number(queryHasKanji(a.token.card.spelling)) || b.length - a.length);
            for (const item of tokenQueries) {
                add(item.token.card.spelling);
                add(item.surface);
                if (item.token.card.reading !== item.token.card.spelling) add(item.token.card.reading);
            }
        }

        for (const fragment of immersionFallbackFragments(card.spelling)) add(fragment);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private renderCompactImmersionKitEmpty(container: HTMLElement): void {
        container.removeAttribute('open');
        container.dataset.immersionEmpty = 'true';
        setInnerHtml(container, `
            <summary class="jpdb-reader-local-title">
                <span>${uiText(this.settings.interfaceLanguage, 'immersionKit')}</span>
                <span class="jpdb-reader-source-status">${uiText(this.settings.interfaceLanguage, 'noImmersionExamplesCompact')}</span>
            </summary>
        `);
        this.repositionActivePopover();
    }

    private immersionStartIndex(card: JPDBCard, examples: ImmersionKitExample[]): number {
        const context = this.activeMiningContext?.term === card.spelling
            ? this.activeMiningContext
            : this.immersionContextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
        if (!context || context.sourceKind !== 'immersion-kit') return 0;

        const sentenceIndex = examples.findIndex(example => example.sentence === context.sentence);
        if (sentenceIndex >= 0) return sentenceIndex;

        const storedIndex = Number(context.immersionIndex);
        return Number.isFinite(storedIndex) && storedIndex >= 0 && storedIndex < examples.length ? storedIndex : 0;
    }

    private renderImmersionKitExample(
        container: HTMLElement,
        card: JPDBCard,
        examples: ImmersionKitExample[],
        index: number,
        playAudio: boolean,
        searchQuery = card.spelling,
        isCurrent: () => boolean = () => true,
    ): void {
        const example = examples[index];
        const language = this.settings.interfaceLanguage;
        const imageUrl = this.settings.immersionKitShowImages ? this.immersionKit.mediaUrl(example, 'image') : '';
        const storedContext = saveMiningContext(card.spelling, immersionContextFromExample(card.spelling, example, index, examples.length, imageUrl));
        if (storedContext) {
            this.immersionContextByCardKey.set(cardKey(card), storedContext);
            this.activeMiningContext = storedContext;
            log.debug('Immersion mining context stored', {
                term: card.spelling,
                sourceTitle: storedContext.sourceTitle,
                index,
                total: examples.length,
            });
        }
        const sentenceHtml = escapeHtml(example.sentence);
        const translation = this.settings.immersionKitShowTranslation && example.translation
            ? `<div class="jpdb-reader-example-translation jpdb-reader-parseable">${escapeHtml(example.translation)}</div>`
            : '';
        const image = imageUrl
            ? `<img class="jpdb-reader-example-image" data-immersion-image data-immersion-image-src="${escapeHtml(imageUrl)}" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async">`
            : '';
        const hasFallbackQuery = queryKey(searchQuery) !== queryKey(card.spelling);
        const fallbackQuery = hasFallbackQuery
            ? `<span class="jpdb-reader-example-query">${escapeHtml(searchQuery)}</span>`
            : '';

        delete container.dataset.immersionEmpty;
        setInnerHtml(container, `
            <summary class="jpdb-reader-local-title">${uiText(language, 'immersionKit')}</summary>
            <div class="jpdb-reader-example-card ${image ? 'has-image' : ''}" data-immersion-index="${index}" data-immersion-total="${examples.length}" data-immersion-sentence="${escapeHtml(example.sentence)}" data-immersion-source-title="${escapeHtml(example.sourceTitle)}" data-immersion-image-url="${escapeHtml(imageUrl)}">
                ${image}
                <div class="jpdb-reader-example-body">
                    <div class="jpdb-reader-example-meta ${hasFallbackQuery ? 'has-query' : ''}">
                        <span class="jpdb-reader-example-source">${escapeHtml(example.sourceTitle)}</span>
                        ${fallbackQuery}
                        <span class="jpdb-reader-example-count">${index + 1}/${examples.length}</span>
                        <div class="jpdb-reader-example-actions" role="group" aria-label="Immersion Kit example controls">
                            <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="previous" title="${uiText(language, 'previousExample')}" aria-label="${uiText(language, 'previousExample')}">‹</button>
                            <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="audio" title="${uiText(language, 'playExampleAudio')}" aria-label="${uiText(language, 'playExampleAudio')}">${speakerIcon()}</button>
                            <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="next" title="${uiText(language, 'nextExample')}" aria-label="${uiText(language, 'nextExample')}">›</button>
                        </div>
                    </div>
                    <div class="jpdb-reader-example-sentence jpdb-reader-parseable" data-immersion-sentence-render>${sentenceHtml}</div>
                    ${translation}
                </div>
            </div>
        `);

        const hideBrokenImage = (imageElement: HTMLImageElement): void => {
            imageElement.remove();
            container.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
            this.repositionActivePopover();
        };
        container.querySelectorAll<HTMLImageElement>('[data-immersion-image]').forEach(imageElement => {
            imageElement.addEventListener('error', () => hideBrokenImage(imageElement), { once: true });
            imageElement.addEventListener('load', () => this.repositionActivePopover(), { once: true });
            if (imageElement.complete && imageElement.naturalWidth > 0) this.repositionActivePopover();
            if (!imageElement.dataset.immersionImageSrc) {
                hideBrokenImage(imageElement);
            }
        });
        this.repositionActivePopover();
        void this.parseJapanese([example.sentence])
            .then(([tokens]) => {
                if (!isCurrent() || !container.isConnected) return;
                const sentence = container.querySelector<HTMLElement>('[data-immersion-sentence-render]');
                if (!sentence) return;
                setInnerHtml(sentence, renderTokensToHtml(example.sentence, tokens ?? [], this.settings));
                void this.parsePopoverJapanese(container);
                void this.enrichAnkiWords(tokens ?? []);
                this.repositionActivePopover();
            })
            .catch(error => log.debug('Immersion example sentence parse failed quietly', { term: card.spelling }, error));
        if (playAudio) void this.playImmersionKitExample(example, true);
    }

    private async playImmersionKitExample(example: ImmersionKitExample, quiet = false): Promise<void> {
        const url = this.immersionKit.mediaUrl(example, 'sound');
        if (!url) {
            log.debug('Immersion Kit example has no audio', { sourceTitle: example.sourceTitle });
            if (!quiet) this.toast('No Immersion Kit audio for this example.');
            return;
        }

        let requestId = 0;
        try {
            if (this.isImmersionKitAudioBusy(url)) {
                log.debug('Immersion Kit audio already active', { sourceTitle: example.sourceTitle });
                return;
            }

            requestId = ++this.immersionKitAudioRequestId;
            this.clearImmersionKitAudio();
            this.immersionKitAudioKey = url;
            this.immersionKitAudioLoadingKey = url;
            this.audio.stop();
            const src = this.settings.audioViaBlob
                ? await this.immersionKit.fetchBlobUrl(url, this.settings.audioTimeoutMs)
                : url;
            if (requestId !== this.immersionKitAudioRequestId || this.immersionKitAudioKey !== url) {
                if (this.settings.audioViaBlob) URL.revokeObjectURL(src);
                return;
            }

            const audio = new Audio(src);
            audio.preload = 'auto';
            audio.playbackRate = this.settings.immersionKitPlaybackRate;
            if (this.settings.audioViaBlob) this.immersionKitAudioBlobUrl = src;
            this.immersionKitAudio = audio;
            this.immersionKitAudioLoadingKey = '';
            const cleanup = () => {
                if (this.immersionKitAudio !== audio) return;
                this.clearImmersionKitAudio();
            };
            audio.addEventListener('ended', cleanup, { once: true });
            audio.addEventListener('error', cleanup, { once: true });
            await audio.play();
            log.debug('Immersion Kit audio playing', { sourceTitle: example.sourceTitle, viaBlob: this.settings.audioViaBlob });
        } catch (error) {
            if (!requestId || requestId === this.immersionKitAudioRequestId) this.clearImmersionKitAudio();
            log.warn('Immersion Kit audio failed', { sourceTitle: example.sourceTitle, quiet }, error);
            if (!quiet) this.toast(error instanceof Error ? error.message : 'Immersion Kit audio failed.');
        }
    }

    private stopImmersionKitAudio(): void {
        this.immersionKitAudioRequestId++;
        this.clearImmersionKitAudio();
    }

    private clearImmersionKitAudio(): void {
        this.immersionKitAudio?.pause();
        this.immersionKitAudio = undefined;
        this.immersionKitAudioKey = '';
        this.immersionKitAudioLoadingKey = '';
        if (this.immersionKitAudioBlobUrl) {
            URL.revokeObjectURL(this.immersionKitAudioBlobUrl);
            this.immersionKitAudioBlobUrl = undefined;
        }
    }

    private isImmersionKitAudioBusy(key: string): boolean {
        if (this.immersionKitAudioLoadingKey === key) return true;
        return Boolean(this.immersionKitAudio && this.immersionKitAudioKey === key && !this.immersionKitAudio.ended);
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        const targets = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-parseable'))
            .flatMap(root => collectTextTargetsIn(root, 24, false, { includeReaderRoot: true }))
            .slice(0, 24);
        if (!targets.length) return;

        try {
            const parsed = await this.parseJapanese(targets.map(target => target.text));
            if (!popover.isConnected) return;
            targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
            const tokens = parsed.flat();
            void this.enrichAnkiWords(tokens);
            log.debug('Popover nested text parsed', { targets: targets.length, tokens: tokens.length });
        } catch (error) {
            log.debug('Popover nested text parsing failed quietly', error);
            // The primary popup already succeeded; nested text parsing is a quiet enhancement.
        }
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

    private preloadImmersionKitForTokens(tokens: JPDBToken[]): void {
        if (!this.settings.immersionKitEnabled) return;
        let queued = 0;
        for (const token of tokens) {
            const term = token.card.spelling.trim();
            if (!term || this.immersionPreloadTerms.has(term)) continue;
            this.immersionPreloadTerms.add(term);
            this.immersionKit.preload(term, this.settings);
            queued++;
            if (queued >= 2) break;
        }
        if (queued) log.debugThrottled('immersion-preload', 2500, 'Immersion Kit preloads queued', { queued });
    }

    private renderJpdbDefinitionSource(card: JPDBCard): string {
        const meanings = card.meanings.slice(0, 6)
            .map(meaning => `<div class="jpdb-reader-meaning">${escapeHtml(meaning.glosses.join('; '))}</div>`)
            .join('');
        if (!meanings) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source="jpdb" ${this.dictionarySourceAttributes(this.definitionSourceStateKey(JPDB_DEFINITION_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">JPDB</summary>
                <div class="jpdb-reader-meanings">${meanings}</div>
            </details>
        `;
    }

    private renderLocalDefinitionSource(dictionary: string, entries: YomitanTermEntry[]): string {
        if (!entries.length) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source="${escapeHtml(dictionary)}" data-dictionary="${escapeHtml(dictionary)}" ${this.dictionarySourceAttributes(this.localDictionaryStateKey(dictionary))}>
                <summary class="jpdb-reader-local-title">${escapeHtml(this.dictionaryLabel(dictionary))}</summary>
                ${entries.map(entry => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span>${escapeHtml(entry.expression)}</span>
                            ${entry.reading && entry.reading !== entry.expression ? `<span class="jpdb-reader-local-reading">${escapeHtml(entry.reading)}</span>` : ''}
                            <span class="jpdb-reader-local-dict">${escapeHtml(entry.dictionary)}</span>
                        </div>
                        <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(entry.dictionary)}">
                            ${entry.glossary.slice(0, 4).map(item => `<div>${glossaryToHtml(item, entry.dictionary, { internalSearchLinks: true })}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </details>
        `;
    }

    private renderKanjiDefinitions(entries: YomitanKanjiEntry[]): string {
        if (!entries.length) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanji" ${this.dictionarySourceAttributes(this.kanjiSourceStateKey(KANJI_DICTIONARIES_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">Kanji dictionaries</summary>
                ${entries.map(entry => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span class="jpdb-reader-kanji-char">${escapeHtml(entry.character)}</span>
                            <span class="jpdb-reader-local-dict">${escapeHtml(this.dictionaryLabel(entry.dictionary))}</span>
                        </div>
                        <div class="jpdb-reader-kanji-readings">
                            ${entry.onyomi.length ? `<span>On ${escapeHtml(entry.onyomi.join('、'))}</span>` : ''}
                            ${entry.kunyomi.length ? `<span>Kun ${escapeHtml(entry.kunyomi.join('、'))}</span>` : ''}
                        </div>
                        <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(entry.dictionary)}">
                            ${entry.meanings.slice(0, 6).map(meaning => `<div>${escapeHtml(meaning)}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </details>
        `;
    }

    private renderSimilarKanjiWordsShell(kanji: string, language: InterfaceLanguage): string {
        const sourceStateKey = this.kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID);
        const help = uiText(language, this.isDictionarySourceOpen(sourceStateKey) ? 'loadingSimilarWords' : 'openToLoadSimilarWords');
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-similar" data-kanji-similar-words ${this.dictionarySourceAttributes(sourceStateKey)}>
                <summary class="jpdb-reader-local-title">Words using ${escapeHtml(kanji)}</summary>
                <div data-kanji-similar-mount>
                    <div class="jpdb-reader-help">${help}</div>
                </div>
            </details>
        `;
    }

    private renderSimilarKanjiWordsContent(entries: YomitanTermEntry[], jpdbVocabulary: JpdbKanjiVocabulary[], currentCard: JPDBCard): string {
        const words = mergeSimilarKanjiWords(entries, jpdbVocabulary, currentCard, name => this.dictionaryLabel(name)).slice(0, this.settings.similarKanjiWordLimit);
        if (!words.length) return '';
        return `
            <div class="jpdb-reader-similar-grid">
                ${words.map(entry => `
                    <button class="jpdb-reader-similar-word" type="button" data-action="similar-word" data-expression="${escapeHtml(entry.expression)}" title="${escapeHtml(entry.source)}${entry.meaning ? `: ${escapeHtml(entry.meaning)}` : ''}">
                        <span class="jpdb-reader-similar-word-head">
                            <span>${escapeHtml(entry.expression)}</span>
                            ${entry.frequency ? `<em>#${entry.frequency}</em>` : ''}
                        </span>
                        ${entry.reading && entry.reading !== entry.expression ? `<small class="jpdb-reader-similar-reading">${escapeHtml(entry.reading)}</small>` : ''}
                        ${entry.meaning ? `<small class="jpdb-reader-similar-meaning">${escapeHtml(entry.meaning)}</small>` : ''}
                    </button>
                `).join('')}
            </div>
        `;
    }

    private renderTermMeta(entries: YomitanMetaEntry[]): string {
        const items = entries
            .map(entry => this.renderMetaEntry(entry))
            .filter(Boolean)
            .slice(0, 8);
        if (!items.length) return '';
        return `<div class="jpdb-reader-meta jpdb-reader-dict-meta">${items.join('')}</div>`;
    }

    private renderMetaEntry(entry: YomitanMetaEntry): string {
        const label = this.dictionaryLabel(entry.dictionary);
        if (entry.mode === 'freq') {
            const value = formatMetaFrequency(entry.data);
            return value ? `<span class="jpdb-reader-chip" title="${escapeHtml(label)}">${escapeHtml(label)} ${escapeHtml(value)}</span>` : '';
        }
        if (entry.mode === 'pitch') {
            if (!this.settings.showPitchAccent) return '';
            const value = formatMetaPitch(entry.data);
            return value ? `<span class="jpdb-reader-chip" title="${escapeHtml(label)}">pitch ${escapeHtml(value)}</span>` : '';
        }
        return '';
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private definitionSourceStateKey(sourceId: string): string {
        return `definition-source:${sourceId}`;
    }

    private localDictionaryStateKey(dictionary: string): string {
        return `definition-dictionary:${dictionary}`;
    }

    private kanjiSourceStateKey(sourceId: string): string {
        return `kanji:${sourceId}`;
    }

    private isDictionarySourceOpen(sourceStateKey: string, initiallyExpanded = this.settings.dictionarySourcesInitiallyExpanded): boolean {
        return this.dictionarySourceOpenOverrides.get(sourceStateKey) ?? initiallyExpanded;
    }

    private dictionarySourceAttributes(sourceStateKey: string, initiallyExpanded = this.settings.dictionarySourcesInitiallyExpanded): string {
        return `data-source-state-key="${escapeHtml(sourceStateKey)}"${this.isDictionarySourceOpen(sourceStateKey, initiallyExpanded) ? ' open' : ''}`;
    }

    private rememberPageMiningContext(card: JPDBCard, sentence?: string, anchor?: HTMLElement): void {
        const cleanSentence = normalizeMiningSentence(sentence);
        if (!cleanSentence || cleanSentence === card.spelling) return;
        const immersionCard = anchor?.closest<HTMLElement>('.jpdb-reader-example-card') ?? null;
        if (immersionCard) {
            const stored = saveMiningContext(card.spelling, immersionContextFromElement(cleanSentence, immersionCard));
            if (stored) {
                this.activeMiningContext = stored;
                log.debug('Mining context captured from Immersion Kit', { term: card.spelling, sourceTitle: stored.sourceTitle });
            }
            return;
        }
        const sourceKind = inferMiningSourceKind({
            isImageSource: Boolean(anchor?.closest('.jpdb-ocr-line')),
            hasVideo: Boolean(anchor?.closest('.jpdb-subtitle-player')) || Boolean(document.querySelector('video')),
            hostname: location.hostname,
        });
        const stored = saveMiningContext(card.spelling, pageMiningContext(cleanSentence, sourceKind));
        if (stored) {
            this.activeMiningContext = stored;
            log.debug('Mining context captured from page', { term: card.spelling, sourceKind });
        }
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

    private renderAnkiActionRow(ankiLookup: AnkiLookupResult): string {
        if (!this.settings.ankiEnabled) return '';
        if (ankiLookup.primary) {
            return `
                <div class="jpdb-reader-row" style="--cols: 1">
                    <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${ankiLookup.primary.noteId}">Edit in Anki</button>
                </div>
            `;
        }
        return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(this.settings.interfaceLanguage, 'addToAnki')}</button></div>`;
    }

    private renderAnkiExistingSection(ankiLookup: AnkiLookupResult, storedContext: StoredMiningContext | null): string {
        const note = ankiLookup.primary;
        if (!note) return '';
        const decks = note.deckNames.length ? note.deckNames.join(', ') : 'Anki';
        const sentence = note.fields.Sentence || note.fields.Example || note.fields.SentenceExpression || '';
        const meaning = note.fields.Meaning || note.fields.Definition || note.fields.Glossary || '';
        const source = note.fields.Source || note.fields.Url || '';
        const lastContext = storedContext
            ? `<div class="jpdb-reader-anki-context"><strong>Last seen</strong><span>${escapeHtml(contextLabel(storedContext))}</span><small>${escapeHtml(storedContext.sentence)}</small></div>`
            : '';
        return `
            <details class="jpdb-reader-anki-existing">
                <summary>
                    <span><span class="jpdb-reader-state-dot jpdb-${note.state}"></span>Already in Anki</span>
                    <small>${escapeHtml(decks)} · ${escapeHtml(note.modelName)}</small>
                </summary>
                <div class="jpdb-reader-anki-card-preview">
                    ${sentence ? `<div><strong>Sentence</strong><span>${escapeHtml(sentence)}</span></div>` : ''}
                    ${meaning ? `<div><strong>Meaning</strong><span>${escapeHtml(meaning.slice(0, 420))}</span></div>` : ''}
                    ${source ? `<div><strong>Source</strong><span>${escapeHtml(source)}</span></div>` : ''}
                    ${lastContext}
                </div>
            </details>
        `;
    }

    private renderReviewButtons(ankiNote: AnkiExistingNote | null = null): string {
        const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
        if (this.settings.twoButtonReviews) {
            return `
                <div class="jpdb-reader-row" style="--cols: 2">
                    <button class="jpdb-reader-btn fail" data-action="grade" data-grade="fail"${ankiAttrs}>FAIL</button>
                    <button class="jpdb-reader-btn pass" data-action="grade" data-grade="pass"${ankiAttrs}>PASS</button>
                </div>
            `;
        }
        return `
            <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 5">
                <button class="jpdb-reader-btn nothing" data-action="grade" data-grade="nothing"${ankiAttrs}>NOTHING</button>
                <button class="jpdb-reader-btn something" data-action="grade" data-grade="something"${ankiAttrs}>SOMETHING</button>
                <button class="jpdb-reader-btn hard" data-action="grade" data-grade="hard"${ankiAttrs}>HARD</button>
                <button class="jpdb-reader-btn okay" data-action="grade" data-grade="okay"${ankiAttrs}>OKAY</button>
                <button class="jpdb-reader-btn easy" data-action="grade" data-grade="easy"${ankiAttrs}>EASY</button>
            </div>
        `;
    }

    private renderStudyTools(sentence?: string): string {
        if (!sentence || (!this.settings.studyTranslationEnabled && !this.settings.studyGrammarEnabled)) return '';
        const showGrammar = this.settings.studyGrammarEnabled && detectGrammarHints(sentence).length > 0;
        if (!this.settings.studyTranslationEnabled && !showGrammar) return '';
        return `
            <section class="jpdb-reader-study-tools">
                <div class="jpdb-reader-study-actions">
                    ${this.settings.studyTranslationEnabled ? '<button class="jpdb-reader-icon-mini" data-action="study-translate" type="button" title="Translate sentence">Translate</button>' : ''}
                    ${showGrammar ? '<button class="jpdb-reader-icon-mini" data-action="study-grammar" type="button" title="Show grammar hints">Grammar</button>' : ''}
                </div>
                <div class="jpdb-reader-study-panel" data-study-panel hidden></div>
            </section>
        `;
    }

    private async renderStudyToolResult(button: HTMLButtonElement, action: string, sentence?: string): Promise<void> {
        const panel = button.closest('.jpdb-reader-study-tools')?.querySelector<HTMLElement>('[data-study-panel]');
        if (!panel || !sentence) return;
        panel.hidden = false;
        panel.textContent = action === 'study-translate' ? 'Translating...' : 'Finding grammar...';
        const done = log.time('studyTool', { action, sentenceLength: sentence.length });
        if (action === 'study-translate') {
            try {
                const translated = await translateJapaneseSentence(sentence);
                setInnerHtml(panel, `<div class="jpdb-reader-study-title">Translation</div><div>${escapeHtml(translated)}</div>`);
                return;
            } finally {
                done();
            }
        }
        const hints = detectGrammarHints(sentence);
        if (!hints.length) {
            panel.hidden = true;
            panel.textContent = '';
            done();
            return;
        }
        setInnerHtml(panel, `<div class="jpdb-reader-study-title">Grammar</div>${renderGrammarHints(hints, sentence)}`);
        done();
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
        const done = log.time('cardAction', { action, term: card.spelling, trigger });
        try {
            const shouldRefresh = await this.performCardAction(action, button, card, sentence);
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

    private async performCardAction(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<boolean> {
        switch (action) {
            case 'study-translate':
            case 'study-grammar':
                await this.renderStudyToolResult(button, action, sentence);
                return false;
            case 'copy-word':
                await copyText(card.spelling);
                this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord'));
                return false;
            case 'audio':
                await this.playAudio(card);
                return false;
            case 'add':
                await this.addToJpdb(card, sentence);
                return true;
            case 'anki':
                await this.addToAnki(card, sentence);
                return true;
            case 'anki-edit':
                await this.openAnkiNote(button);
                return true;
            case 'neverforget':
                await this.changeJpdbDeckState(card, 'never-forget', this.settings.neverForgetDeck, 'Add a JPDB API key to change JPDB deck state.');
                return true;
            case 'blacklist':
                await this.changeJpdbDeckState(card, 'blacklisted', this.settings.blacklistDeck, 'Add a JPDB API key to change JPDB deck state.');
                return true;
            case 'grade':
                await this.gradeCard(button, card);
                return true;
            default:
                return Boolean(action);
        }
    }

    private assertJpdbActionAllowed(card: JPDBCard, message: string): void {
        if (!this.settings.jpdbMiningEnabled) throw new Error('JPDB mining actions are disabled in settings.');
        if (!this.isJpdbBackedCard(card)) throw new Error(message);
    }

    private async addToJpdb(card: JPDBCard, sentence?: string): Promise<void> {
        this.assertJpdbActionAllowed(card, 'Add a JPDB API key to add cards to JPDB, or use Add to Anki.');
        await this.jpdb.addToDeck(this.settings.miningDeck || 'forq', card, sentence);
        if (this.settings.addToForq && this.settings.miningDeck !== 'forq') await this.jpdb.addToDeck('forq', card, sentence);
        if (this.settings.ankiEnabled && this.settings.ankiMineWithJpdb) await this.addToAnki(card, sentence);
        this.toast(`${uiText(this.settings.interfaceLanguage, 'add')} JPDB.`);
    }

    private async openAnkiNote(button: HTMLButtonElement): Promise<void> {
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw new Error('Anki note not found.');
        await this.anki.browseNote(noteId);
        this.toast('Opened in Anki.');
    }

    private async changeJpdbDeckState(card: JPDBCard, state: 'never-forget' | 'blacklisted', deck: string, message: string): Promise<void> {
        this.assertJpdbActionAllowed(card, message);
        await this.toggleDeck(card, state, deck);
    }

    private async gradeCard(button: HTMLButtonElement, card: JPDBCard): Promise<void> {
        const grade = button.dataset.grade as JPDBGrade;
        const ankiCardId = Number(button.dataset.ankiCardId);
        if (Number.isFinite(ankiCardId) && ankiCardId > 0) {
            await this.anki.answerCard(ankiCardId, grade);
            return;
        }
        this.assertJpdbActionAllowed(card, 'Add a JPDB API key to review JPDB cards.');
        await this.jpdb.reviewCard(card, grade);
    }

    private async addToAnki(card: JPDBCard, sentence?: string): Promise<void> {
        const done = log.time('addToAnki', { term: card.spelling, hasSentence: Boolean(sentence) });
        const existing = await this.anki.findExistingCards(card);
        if (existing.primary) {
            log.info('Anki add skipped because note already exists', { term: card.spelling, noteId: existing.primary.noteId });
            this.toast('Already in Anki. Use Edit in Anki instead.');
            await this.showCard(card, sentence, this.activePopoverAnchor, { autoPlay: false, trigger: this.activePopoverMode === 'hover' ? 'hover' : 'modal', navigation: 'preserve', preservePosition: true });
            done();
            return;
        }
        const [localEntries, kanjiEntries, metaEntries] = await Promise.all([
            this.settings.localDictionariesEnabled
                ? this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
                ? this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            this.settings.localDictionariesEnabled
                ? this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
        ]);
        const context = await this.resolveMiningContext(card, sentence);
        await this.anki.addCard(card, context.sentence || sentence, {
            imageDataUrl: context.imageDataUrl,
            localEntries,
            kanjiEntries,
            metaEntries,
            dictionaryPreferences: this.settings.dictionaryPreferences,
            sourceTitle: context.sourceTitle || document.title,
            sourceUrl: context.sourceUrl || location.href,
        });
        log.info('Card sent to Anki', {
            term: card.spelling,
            sourceKind: context.sourceKind,
            hasImage: Boolean(context.imageDataUrl),
            localEntries: localEntries.length,
            kanjiEntries: kanjiEntries.length,
            metaEntries: metaEntries.length,
        });
        this.toast(context.imageDataUrl ? 'Sent to Anki with context image.' : 'Sent to Anki.');
        done();
    }

    private async resolveMiningContext(card: JPDBCard, sentence?: string): Promise<MiningContext> {
        const activeContext = this.activeMiningContext?.term === card.spelling ? this.activeMiningContext : undefined;
        const storedImmersionContext = this.immersionContextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
        const anchor = this.activePopoverAnchor;
        const mpvImageDataUrl = this.settings.ankiCaptureScreenshot && anchor?.closest('.jpdb-subtitle-player')
            ? await this.subtitles.captureCurrentMpvFrame(sentence)
            : undefined;
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
            videoImageDataUrl: this.settings.ankiCaptureScreenshot ? (captureActiveVideoFrame() ?? mpvImageDataUrl) : undefined,
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

    private async toggleDeck(card: JPDBCard, state: 'never-forget' | 'blacklisted', deck: string): Promise<void> {
        if (normalizeCardStates(card.cardState).includes(state)) {
            await this.jpdb.removeFromDeck(deck, card);
            log.info('Card removed from deck', { term: card.spelling, deck, state });
            this.toast('Removed from deck.');
        } else {
            await this.jpdb.addToDeck(deck, card);
            log.info('Card added to deck', { term: card.spelling, deck, state });
            this.toast('Added to deck.');
        }
    }

    private async playAudio(card: JPDBCard): Promise<void> {
        try {
            this.stopImmersionKitAudio();
            await this.audio.play(card);
            log.debug('Term audio playback started', { term: card.spelling });
        } catch (error) {
            log.warn('Term audio playback failed', { term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : 'Audio playback failed.');
        }
    }

    private showSettings(panel?: string): void {
        log.info('Opening settings', { panel: panel ?? 'default' });
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.setAttribute('role', 'dialog');
        form.setAttribute('aria-modal', 'true');
        form.setAttribute('aria-label', SETTINGS_TITLE);
        form.tabIndex = -1;
        setInnerHtml(form, renderSettingsForm(this.settings, JPDB_SETTINGS_URL));
        localizeSettingsForm(form, this.settings.interfaceLanguage);
        if (panel) activateSettingsPanel(form, panel);

        const backdrop = this.createBackdrop();
        form.addEventListener('submit', event => {
            event.preventDefault();
            const data = new FormData(form);
            const previousInitialOpen = this.settings.dictionarySourcesInitiallyExpanded;
            this.settings = readFormSettings(data, this.settings);
            if (this.settings.dictionarySourcesInitiallyExpanded !== previousInitialOpen) {
                this.dictionarySourceOpenOverrides.clear();
            }
            void saveSettings(this.settings).then(() => {
                log.info('Settings saved', loggingSettingsSummary(this.settings));
                this.jpdb.clear();
                this.applyTheme();
                void this.refreshDictionaryStyles();
                this.installFab();
                this.subtitles.refresh();
                this.ocr.refresh();
                this.youtube.refresh();
                this.jpdbExtensions.refresh();
                this.settingsPreviewOriginalAccent = undefined;
                this.settingsPreviewOriginalLanguage = undefined;
                this.dismiss();
                this.scheduleDictionaryRescan();
                if (this.newTab.isCurrentPage()) void this.newTab.renderPage();
                this.toast('Settings saved.');
            }).catch(error => {
                log.error('Settings save failed', error);
                this.toast(error instanceof Error ? error.message : 'Settings save failed.');
            });
        });
        form.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dismiss());
        form.querySelector<HTMLInputElement>('input[name="accentColor"]')?.addEventListener('input', event => {
            this.applyAccentColor((event.currentTarget as HTMLInputElement).value);
        });
        form.querySelectorAll<HTMLInputElement>('input[name^="wordColor"]').forEach(input => {
            input.addEventListener('input', () => this.applyWordColors(readFormSettings(new FormData(form), this.settings)));
        });
        syncSubtitlePreview(form);
        form.addEventListener('input', event => {
            const name = (event.target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
            if (name.startsWith('subtitle')) syncSubtitlePreview(form);
        });
        form.addEventListener('change', event => {
            const name = (event.target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
            if (name.startsWith('subtitle')) syncSubtitlePreview(form);
        });
        form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (value === 'auto' || value === 'en' || value === 'ja') {
                this.settings.interfaceLanguage = value;
                localizeSettingsForm(form, value);
                syncSubtitlePreview(form);
                this.installFab();
            }
        });
        form.querySelector<HTMLSelectElement>('select[name="ocrProvider"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            form.querySelectorAll<HTMLElement>('[data-local-ocr]').forEach(node => { node.hidden = value !== 'local-service'; });
            form.querySelectorAll<HTMLElement>('[data-cloud-ocr]').forEach(node => { node.hidden = value !== 'cloud-vision'; });
        });
        form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.addEventListener('change', () => void this.refreshDeckControls(form));
        form.addEventListener('change', event => {
            const sourceSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
            if (sourceSelect) syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
            const templateSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name="ankiTemplateMode"]');
            if (templateSelect) {
                const preview = form.querySelector<HTMLElement>('[data-anki-template-preview]');
                if (preview) setInnerHtml(preview, renderAnkiTemplatePreview(readFormSettings(new FormData(form), this.settings)));
            }
        });
        installShortcutCapture(form);
        installDictionarySourceDrag(form);
        form.addEventListener('click', event => {
            const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = control?.dataset.action;
            if (!action || action === 'cancel') return;
            event.preventDefault();
            event.stopPropagation();
            void this.handleSettingsAction(form, action, control);
        });
        this.dismiss();
        this.settingsPreviewOriginalAccent = this.settings.accentColor;
        this.settingsPreviewOriginalLanguage = this.settings.interfaceLanguage;
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activePopover = form;
        form.focus();
        void this.refreshDictionaryStatus(form);
        void this.refreshDeckControls(form);
    }

    private async refreshDeckControls(form: HTMLFormElement): Promise<void> {
        const container = form.querySelector<HTMLElement>('[data-jpdb-decks]');
        if (!container) return;
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.value.trim() ?? this.settings.apiKey.trim();
        if (!apiKey) {
            log.debug('Deck controls rendered without API key');
            setInnerHtml(container, renderDeckControls(this.settings, [], false));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return;
        }

        const originalKey = this.settings.apiKey;
        this.settings.apiKey = apiKey;
        try {
            const decks = await this.jpdb.listDecks();
            log.debug('Deck controls loaded', { decks: decks.length });
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), decks, true));
        } catch (error) {
            log.warn('Deck controls failed to load', error);
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), [], true));
        } finally {
            this.settings.apiKey = originalKey;
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        }
    }

    private async refreshDictionaryStatus(form: HTMLFormElement): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-dictionary-status]');
        const priorities = form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities');
        const recommended = form.querySelector<HTMLElement>('[data-recommended-dictionaries]');
        try {
            const summary = await this.dictionaries.summary();
            log.debug('Dictionary status loaded', summary);
            const names = summary.dictionaries.map(item => item.title);
            const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names);
            if (merged.length !== this.settings.dictionaryPreferences.length) {
                this.settings.dictionaryPreferences = merged;
                await saveSettings(this.settings);
            }
            await this.refreshDictionaryStyles();
            if (status) {
                status.textContent = summary.dictionaries.length
                    ? `${summary.dictionaries.length} dictionaries, ${summary.terms.toLocaleString()} terms, ${summary.kanji.toLocaleString()} kanji, ${summary.termMeta.toLocaleString()} metadata rows.`
                    : 'No local dictionaries imported yet.';
            }
            if (priorities) setInnerHtml(priorities, renderDictionarySourceRows(this.settings));
            if (recommended) setInnerHtml(recommended, renderRecommendedDictionaries(summary.dictionaries));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        } catch (error) {
            log.warn('Dictionary status unavailable', error);
            if (status) status.textContent = error instanceof Error ? error.message : 'Dictionary status unavailable.';
        }
    }

    private async ensureStarterDictionaryInstalled(onProgress?: (message: string) => void, force = false): Promise<boolean> {
        if (this.starterDictionaryDownload) return this.starterDictionaryDownload;
        this.starterDictionaryDownload = this.downloadStarterDictionaries(onProgress, force)
            .finally(() => {
                this.starterDictionaryDownload = undefined;
            });
        return this.starterDictionaryDownload;
    }

    private async downloadStarterDictionaries(onProgress?: (message: string) => void, force = false): Promise<boolean> {
        const summary = await this.dictionaries.summary();
        const missing = RECOMMENDED_JAPANESE_DICTIONARIES
            .filter(dictionary => STARTER_DICTIONARY_IDS.includes(dictionary.id))
            .filter(dictionary => !isRecommendedDictionaryInstalled(dictionary, summary.dictionaries));
        if (!missing.length || (!force && summary.terms > 0)) return false;

        let importedEntries = 0;
        for (const [index, dictionary] of missing.entries()) {
            onProgress?.(`Downloading ${dictionary.name} (${index + 1}/${missing.length})...`);
            log.info('Downloading starter dictionary', { dictionary: dictionary.name, index: index + 1, total: missing.length });
            const imported = await this.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => onProgress?.(message));
            importedEntries += imported.entries;
            this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, imported.dictionaries);
            this.settings.localDictionariesEnabled = true;
            await saveSettings(this.settings);
            await this.refreshDictionaryStyles();
            this.scheduleDictionaryRescan();
        }
        onProgress?.(`JMdict ready: ${importedEntries.toLocaleString()} records imported.`);
        log.info('Starter dictionaries downloaded', { dictionaries: missing.length, importedEntries });
        return true;
    }

    private async handleSettingsAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-import-status]');
        const setStatus: SettingsStatusSetter = (message: string) => {
            if (status) status.textContent = message;
        };

        try {
            if (this.handleSettingsEditorAction(form, action, control)) return;
            if (await this.handleSettingsDictionaryAction(form, action, control, setStatus)) return;
            if (await this.handleSettingsImportExportAction(form, action, setStatus)) return;
            if (await this.handleSettingsConnectionAction(form, action, control)) return;
            await this.handleSettingsSupportAction(action, setStatus);
        } catch (error) {
            log.warn('Settings action failed', { action }, error);
            if (action === 'download-recommended-dictionary' || action === 'download-starter-dictionaries' || action === 'delete-yomitan-dictionary') control?.removeAttribute('disabled');
            setStatus(error instanceof Error ? error.message : 'Import failed.');
        }
    }

    private handleSettingsEditorAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): boolean {
        if (action === 'settings-panel') {
            log.debug('Settings panel selected', { panel: control?.dataset.panel ?? 'basics' });
            activateSettingsPanel(form, control?.dataset.panel ?? 'basics');
            return true;
        }
        if (action === 'dictionary-source-up' || action === 'dictionary-source-down') {
            log.debug('Dictionary source order changed', { action });
            updateDictionarySourceEditor(form, action, control);
            return true;
        }
        if (action === 'audio-source-add' || action === 'audio-source-remove' || action === 'audio-source-up' || action === 'audio-source-down') {
            log.debug('Audio source editor changed', { action });
            updateAudioSourceEditor(form, action, control);
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return true;
        }
        if (action === 'lookup-link-add' || action === 'lookup-link-remove' || action === 'lookup-link-up' || action === 'lookup-link-down') {
            log.debug('Lookup link editor changed', { action });
            updateDictionaryLookupLinkEditor(form, action, control);
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return true;
        }
        return false;
    }

    private async handleSettingsDictionaryAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'refresh-dictionaries') {
            log.info('Refreshing dictionary status from settings');
            setStatus('Refreshing installed dictionaries...');
            await this.refreshDictionaryStatus(form);
            setStatus('Dictionary list refreshed.');
            return true;
        }
        if (action === 'delete-yomitan-dictionary') {
            await this.deleteDictionaryFromSettings(form, control, setStatus);
            return true;
        }
        if (action === 'download-starter-dictionaries') {
            control?.setAttribute('disabled', 'true');
            const installed = await this.ensureStarterDictionaryInstalled(setStatus, true);
            if (!installed) setStatus('JMdict is already installed.');
            await this.refreshDictionaryStatus(form);
            return true;
        }
        if (action === 'import-yomitan-dictionary') {
            await this.importDictionaryFromSettings(form, setStatus);
            return true;
        }
        if (action === 'download-recommended-dictionary') {
            await this.downloadRecommendedDictionaryFromSettings(form, control, setStatus);
            return true;
        }
        if (action === 'export-yomitan-dictionary') {
            const blob = await this.dictionaries.exportJson();
            downloadBlob(blob, `yomu-dictionaries-${dateStamp()}.json`);
            setStatus('Dictionaries exported.');
            log.info('Dictionaries exported');
            return true;
        }
        return false;
    }

    private async handleSettingsImportExportAction(form: HTMLFormElement, action: string, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'import-yomitan-settings') {
            await this.importReaderSettingsFromFile(form, setStatus);
            return true;
        }
        if (action === 'export-reader-settings') {
            downloadBlob(new Blob([JSON.stringify({
                formatName: 'yomu-reader-settings',
                formatVersion: 1,
                exportedAt: new Date().toISOString(),
                settings: this.settings,
            }, null, 2)], { type: 'application/json' }), `yomu-settings-${dateStamp()}.json`);
            setStatus('Settings exported.');
            log.info('Settings exported');
            return true;
        }
        return false;
    }

    private async handleSettingsConnectionAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<boolean> {
        if (action !== 'test-anki') return false;
        const ankiStatus = form.querySelector<HTMLElement>('[data-anki-status]');
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const button = control instanceof HTMLButtonElement ? control : control?.closest<HTMLButtonElement>('button');
        const setAnkiStatus = (message: string, tone: 'pending' | 'success' | 'error') => {
            if (!ankiStatus) return;
            ankiStatus.textContent = message;
            ankiStatus.dataset.statusTone = tone;
        };
        const previous = this.settings;
        this.settings = readFormSettings(new FormData(form), this.settings);
        button?.setAttribute('disabled', 'true');
        setAnkiStatus(uiText(language, 'ankiTesting'), 'pending');
        try {
            const connected = await this.anki.isConnected();
            if (!connected) throw new Error(uiText(language, 'ankiUnreachable'));
            await this.anki.ensureDeckAndModel();
            const readyMessage = resolveUiLanguage(language) === 'ja'
                ? `接続できました。デッキ「${this.settings.ankiDeck}」とノートタイプ「${this.settings.ankiModel}」を準備しました。`
                : `Connected. Deck "${this.settings.ankiDeck}" and note type "${this.settings.ankiModel}" are ready.`;
            setAnkiStatus(readyMessage, 'success');
            log.info('Anki settings test succeeded', { deck: this.settings.ankiDeck, model: this.settings.ankiModel });
        } catch (error) {
            const message = error instanceof Error ? error.message : uiText(language, 'ankiUnreachable');
            log.warn('Anki settings test failed', error);
            setAnkiStatus(message, 'error');
            this.toast(message);
        } finally {
            this.settings = previous;
            button?.removeAttribute('disabled');
        }
        return true;
    }

    private async handleSettingsSupportAction(action: string, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'copy-discord') {
            await copyText(SUPPORT_LINKS.discordUsername);
            log.debug('Support Discord username copied');
            this.toast(`Copied Discord username: ${SUPPORT_LINKS.discordUsername}`);
            return true;
        }
        if (action === 'copy-newtab-url') {
            await copyText(NEW_TAB_PAGE_URL);
            log.debug('New tab URL copied');
            this.toast('New tab address copied.');
            return true;
        }
        setStatus('');
        return false;
    }

    private async deleteDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionary = control?.dataset.dictionaryName;
        if (!dictionary) throw new Error('Dictionary not found.');
        if (!window.confirm(`Remove "${dictionary}" and all of its imported entries?`)) return;
        control?.setAttribute('disabled', 'true');
        setStatus(`Removing ${dictionary}...`);
        await this.dictionaries.deleteDictionary(dictionary);
        this.settings.dictionaryPreferences = this.settings.dictionaryPreferences.filter(item => item.name !== dictionary);
        await saveSettings(this.settings);
        await this.refreshDictionaryStyles();
        this.scheduleDictionaryRescan();
        await this.refreshDictionaryStatus(form);
        setStatus(`Removed ${dictionary}.`);
        log.info('Dictionary removed', { dictionary });
    }

    private async importDictionaryFromSettings(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'dictionary');
        if (!file) return;
        const summary = await this.dictionaries.importFile(file, message => setStatus(message));
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
        await saveSettings(this.settings);
        await this.refreshDictionaryStyles();
        this.scheduleDictionaryRescan();
        setStatus(`Imported ${summary.entries.toLocaleString()} records from ${summary.dictionaries.length} dictionary source${summary.dictionaries.length === 1 ? '' : 's'}.`);
        log.info('Dictionary file imported', summary);
        await this.refreshDictionaryStatus(form);
    }

    private async downloadRecommendedDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionaryId = control?.dataset.dictionaryId;
        const dictionary = dictionaryId ? findRecommendedDictionary(dictionaryId) : undefined;
        if (!dictionary) throw new Error('Recommended dictionary not found.');
        control?.setAttribute('disabled', 'true');
        setStatus(`${control?.dataset.installed === 'true' ? 'Updating' : 'Downloading'} ${dictionary.name}...`);
        log.info('Downloading selected dictionary', { dictionary: dictionary.name });
        const summary = await this.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => setStatus(message));
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
        await saveSettings(this.settings);
        await this.refreshDictionaryStyles();
        this.scheduleDictionaryRescan();
        setStatus(`${dictionary.name}: ${summary.entries.toLocaleString()} records imported.`);
        await this.refreshDictionaryStatus(form);
        log.info('Selected dictionary downloaded', { dictionary: dictionary.name, entries: summary.entries });
    }

    private async importReaderSettingsFromFile(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'settings');
        if (!file) return;
        const json = JSON.parse(await file.text()) as unknown;
        const readerSettings = getReaderSettingsExport(json);
        if (readerSettings) {
            this.settings = { ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } };
        } else {
            const imported = parseYomitanSettingsExport(json);
            this.settings = {
                ...this.settings,
                ...imported.settings,
                shortcuts: {
                    ...this.settings.shortcuts,
                    ...(imported.settings.shortcuts ?? {}),
                },
            };
        }
        const importedNames = (await this.dictionaries.summary().catch(() => ({ dictionaries: [] }))).dictionaries.map(item => item.title);
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames);
        await saveSettings(this.settings);
        setStatus('Settings imported.');
        this.applyTheme();
        void this.refreshDictionaryStyles();
        this.scheduleDictionaryRescan();
        this.installFab();
        this.subtitles.refresh();
        this.youtube.refresh();
        this.jpdbExtensions.refresh();
        this.settingsPreviewOriginalAccent = undefined;
        log.info('Settings imported', loggingSettingsSummary(this.settings));
        this.showSettings();
    }

    private createPopover(): HTMLElement {
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', `${APP_NAME} lookup`);
        popover.setAttribute('aria-modal', 'true');
        popover.tabIndex = -1;
        if (this.shouldUseSheet()) popover.classList.add('jpdb-reader-sheet');
        return popover;
    }

    private mountPopover(popover: HTMLElement, anchor?: HTMLElement, options: { mode?: 'modal' | 'hover'; preservePosition?: boolean } = {}): void {
        const mode = options.mode ?? 'modal';
        const useBackdrop = mode !== 'hover';
        const backdrop = useBackdrop ? this.createBackdrop() : undefined;
        const previousRect = this.activePopoverAnchorRect;
        const previousPopoverRect = options.preservePosition ? this.activePopover?.getBoundingClientRect() : undefined;
        const resolvedAnchor = anchor?.isConnected
            ? anchor
            : this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const resolvedRect = resolvedAnchor ? resolvedAnchor.getBoundingClientRect() : undefined;
        const anchorRect = resolvedRect && (resolvedRect.width > 0 || resolvedRect.height > 0)
            ? resolvedRect
            : previousRect;
        this.dismiss({ suppressHoverTarget: false, preserveNavigation: true });
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (backdrop) document.body.append(backdrop, popover);
        else document.body.append(popover);
        this.activeBackdrop = backdrop;
        this.activePopover = popover;
        this.activePopoverMode = mode;
        this.activePopoverAnchor = resolvedAnchor;
        this.activePopoverAnchorRect = anchorRect;
        this.activePopoverPositionLocked = Boolean(previousPopoverRect && !popover.classList.contains('jpdb-reader-sheet'));
        this.activeHoverWord = mode === 'hover' ? resolvedAnchor : undefined;
        this.installDictionarySourceStateTracking(popover);

        if (!popover.classList.contains('jpdb-reader-sheet')) {
            this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
            this.activePopoverResizeObserver.observe(popover);
            if (previousPopoverRect) this.placePopoverAtViewportPosition(popover, previousPopoverRect);
            else this.repositionActivePopover();
            requestAnimationFrame(() => this.repositionActivePopover());
        } else {
            this.installSheetHandle(popover);
        }
        if (mode === 'hover') {
            this.installHoverPopoverLifecycle(popover);
            this.startHoverWatch();
        }
        else popover.focus();
        log.debug('Popover mounted', {
            mode,
            sheet: popover.classList.contains('jpdb-reader-sheet'),
            hasAnchor: Boolean(resolvedAnchor),
            hasBackdrop: Boolean(backdrop),
        });
    }

    private repositionActivePopover(): void {
        if (!this.activePopover || this.activePopover.classList.contains('jpdb-reader-sheet')) return;
        if (this.activePopoverPositionLocked) {
            this.placePopoverAtViewportPosition(this.activePopover, this.activePopover.getBoundingClientRect());
            return;
        }
        if (this.activePopoverAnchor?.isConnected) {
            const rect = this.activePopoverAnchor.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
        }
        positionPopover(this.activePopover, this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined, this.activePopoverAnchorRect);
    }

    private placePopoverAtViewportPosition(popover: HTMLElement, rect: DOMRect): void {
        const margin = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const width = popover.offsetWidth;
        const minHeight = Math.min(180, Math.max(0, viewportHeight - margin * 2));
        const maxTop = Math.max(margin, viewportHeight - minHeight - margin);
        const top = Math.max(margin, Math.min(rect.top, maxTop));
        const maxLeft = Math.max(margin, viewportWidth - width - margin);
        const left = Math.max(margin, Math.min(rect.left, maxLeft));
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.maxHeight = `${Math.max(minHeight, viewportHeight - top - margin)}px`;
    }

    private installDictionarySourceStateTracking(popover: HTMLElement): void {
        popover.addEventListener('toggle', event => {
            if (!event.isTrusted) return;
            const details = event.target instanceof HTMLDetailsElement ? event.target : null;
            const sourceStateKey = details?.dataset.sourceStateKey;
            if (!sourceStateKey) return;
            this.dictionarySourceOpenOverrides.set(sourceStateKey, details.open);
            log.debug('Dictionary source open state remembered', { sourceStateKey, open: details.open });
            this.repositionActivePopover();
        }, true);
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

    private installSheetHandle(popover: HTMLElement): void {
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle');
        if (!handle) return;
        handle.setAttribute('role', 'button');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-label', 'Drag to close, or tap to expand');
        handle.setAttribute('aria-expanded', String(popover.classList.contains('jpdb-reader-sheet-expanded')));
        let startY = 0;
        let lastY = 0;
        let pointerId = 0;
        let dragging = false;
        let moved = false;

        const reset = () => {
            popover.style.transition = 'transform .16s ease';
            popover.style.transform = '';
            window.setTimeout(() => { popover.style.transition = ''; }, 180);
        };
        const toggleExpanded = () => {
            const expanded = !popover.classList.contains('jpdb-reader-sheet-expanded');
            popover.classList.toggle('jpdb-reader-sheet-expanded', expanded);
            handle.setAttribute('aria-expanded', String(expanded));
        };
        const finish = () => {
            handle.releasePointerCapture?.(pointerId);
            if (!dragging) return;
            const delta = Math.max(0, lastY - startY);
            dragging = false;
            if (delta > 90) this.dismiss();
            else reset();
        };

        handle.addEventListener('click', event => {
            event.preventDefault();
            if (moved) {
                moved = false;
                return;
            }
            toggleExpanded();
        });
        handle.addEventListener('pointerdown', event => {
            startY = event.clientY;
            lastY = event.clientY;
            pointerId = event.pointerId;
            dragging = true;
            moved = false;
            popover.style.transition = '';
            handle.setPointerCapture?.(event.pointerId);
        });
        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            lastY = event.clientY;
            const delta = Math.max(0, lastY - startY);
            if (delta > 8) moved = true;
            popover.style.transform = `translateY(${delta}px)`;
        });
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', () => {
            dragging = false;
            moved = false;
            handle.releasePointerCapture?.(pointerId);
            reset();
        });
        handle.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleExpanded();
            }
            if (event.key === 'Escape') this.dismiss();
        });
    }

    private createBackdrop(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'jpdb-reader-backdrop';
        backdrop.dataset.jpdbReaderRoot = 'true';
        backdrop.addEventListener('click', () => this.dismiss());
        return backdrop;
    }

    private shouldUseSheet(): boolean {
        if (this.settings.popupMode === 'sheet') return true;
        if (this.settings.popupMode === 'popover') return false;
        return window.innerWidth <= 768 || matchMedia('(pointer: coarse)').matches;
    }

    private dismiss(options: { suppressHoverTarget?: boolean; preserveNavigation?: boolean } = { suppressHoverTarget: true }): void {
        const hadDialog = Boolean(this.activePopover || this.activeBackdrop);
        const hadSettingsDialog = Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        this.hoverLookupTimer = undefined;
        this.hoverCloseTimer = undefined;
        this.hoverWatchTimer = undefined;
        this.hoverPendingWord = undefined;
        const suppressTarget = this.activePopoverMode === 'hover' ? this.activeHoverWord : this.activePopoverAnchor;
        if (options.suppressHoverTarget && suppressTarget?.isConnected && suppressTarget.classList.contains('jpdb-reader-word')) {
            this.suppressedHoverWord = suppressTarget;
        }
        this.cardRenderRequest++;
        if (this.settingsPreviewOriginalAccent !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalLanguage !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalLanguage = undefined;
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
        this.activePopover = undefined;
        this.activeBackdrop = undefined;
        this.activePopoverResizeObserver = undefined;
        this.activePopoverPositionLocked = false;
        this.activePopoverAnchorRect = undefined;
        this.activePopoverMode = undefined;
        this.activePopoverAnchor = undefined;
        this.activeHoverWord = undefined;
        if (!options.preserveNavigation) this.clearWordNavigation();
        if (hadDialog) log.debug('Reader dialog dismissed', { suppressHoverTarget: Boolean(options.suppressHoverTarget) });
        if (hadSettingsDialog && this.dictionaryRescanPending) {
            this.dictionaryRescanPending = false;
            window.setTimeout(() => this.scheduleDictionaryRescan(), 80);
        }
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

function graphEllipseOffset(dx: number, dy: number, rx: number, ry: number): number {
    const denominator = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return denominator > 0 ? Math.min(0.48, 1 / denominator) : 0;
}

function formatGraphCoordinate(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function graphEdgeCurveControl(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const bend = Math.min(4.6, Math.max(1.8, distance * 0.08));
    const sign = y1 <= y2 ? 1 : -1;
    return {
        x: (x1 + x2) / 2 - (dy / distance) * bend * sign,
        y: (y1 + y2) / 2 + (dx / distance) * bend * sign,
    };
}

function graphQuadraticPoint(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number): { x: number; y: number } {
    const mt = 1 - t;
    return {
        x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
        y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
    };
}

function mutationTouchesAsbPlayer(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    return nodes.some(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
    });
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

type YomuBootWindow = typeof window & {
    __yomuReaderAppInitialized?: boolean;
    __jpdbPopupReaderInitialized?: boolean;
    __yomuDemoApp?: ReaderApp;
    __yomuRealApp?: ReaderApp;
    __yomuRuntimeKind?: YomuRuntimeKind;
    __yomuRuntimeOwnerId?: string;
};

type YomuRuntimeKind = 'demo' | 'userscript' | 'extension';

const RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';

export function bootReaderApp(): void {
    const bootWindow = window as YomuBootWindow;
    const runtimeKind = detectYomuRuntimeKind();
    const ownerId = claimYomuRuntime(runtimeKind);
    if (!ownerId) return;
    const isRealRuntime = runtimeKind !== 'demo';

    if (bootWindow.__yomuReaderAppInitialized && bootWindow.__yomuDemoApp && isRealRuntime) {
        bootWindow.__yomuDemoApp.destroy();
        delete bootWindow.__yomuDemoApp;
        bootWindow.__yomuReaderAppInitialized = false;
    }

    if (bootWindow.__yomuReaderAppInitialized) {
        const existingPriority = runtimePriority(bootWindow.__yomuRuntimeKind ?? 'demo');
        if (existingPriority >= runtimePriority(runtimeKind)) return;
        bootWindow.__yomuRealApp?.destroy();
        bootWindow.__yomuDemoApp?.destroy();
    }

    bootWindow.__yomuReaderAppInitialized = true;
    bootWindow.__jpdbPopupReaderInitialized = true;
    bootWindow.__yomuRuntimeKind = runtimeKind;
    bootWindow.__yomuRuntimeOwnerId = ownerId;
    const app = new ReaderApp();
    bindRuntimeClaims(app, ownerId, runtimeKind);
    if (isRealRuntime) {
        bootWindow.__yomuRealApp = app;
        window.dispatchEvent(new CustomEvent('yomu-extension-loaded'));
    } else {
        bootWindow.__yomuDemoApp = app;
        window.addEventListener('yomu-extension-loaded', () => {
            if (bootWindow.__yomuDemoApp === app) {
                app.destroy();
                delete bootWindow.__yomuDemoApp;
            }
        });
    }
    void app.init().catch(error => {
        releaseYomuRuntime(ownerId);
        log.error('Initialization failed', error);
        throw error;
    });
}

function detectYomuRuntimeKind(): YomuRuntimeKind {
    if (typeof GM_getValue === 'function') return 'userscript';
    const global = globalThis as {
        chrome?: { runtime?: { id?: string } };
        browser?: { runtime?: { id?: string } };
    };
    return global.chrome?.runtime?.id || global.browser?.runtime?.id ? 'extension' : 'demo';
}

function runtimePriority(kind: YomuRuntimeKind): number {
    if (kind === 'extension') return 3;
    if (kind === 'userscript') return 2;
    return 1;
}

function claimYomuRuntime(kind: YomuRuntimeKind): string | null {
    const ownerId = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const existing = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    const existingKind = normalizeRuntimeKind(existing?.dataset.yomuRuntimeKind);
    if (existing && runtimePriority(existingKind) >= runtimePriority(kind)) {
        log.debug('Skipping boot because another Yomu runtime owns the page', { existingKind, kind });
        return null;
    }

    window.dispatchEvent(new CustomEvent('yomu-reader-runtime-claim', {
        detail: { ownerId, kind, priority: runtimePriority(kind) },
    }));
    const marker = existing ?? document.createElement('meta');
    marker.id = RUNTIME_MARKER_ID;
    marker.dataset.yomuRuntimeKind = kind;
    marker.dataset.yomuRuntimeOwner = ownerId;
    marker.setAttribute('name', RUNTIME_MARKER_ID);
    marker.setAttribute('content', kind);
    if (!marker.isConnected) appendToDocumentHead(marker);
    return ownerId;
}

function bindRuntimeClaims(app: ReaderApp, ownerId: string, kind: YomuRuntimeKind): void {
    window.addEventListener('yomu-reader-runtime-claim', event => {
        const detail = (event as CustomEvent).detail as Partial<{ ownerId: string; kind: YomuRuntimeKind; priority: number }> | undefined;
        if (!detail || detail.ownerId === ownerId) return;
        const nextKind = normalizeRuntimeKind(detail.kind);
        if (runtimePriority(nextKind) < runtimePriority(kind)) return;
        log.info('Yielding to another Yomu runtime', { current: kind, next: nextKind });
        app.destroy();
        releaseYomuRuntime(ownerId);
        const bootWindow = window as YomuBootWindow;
        if (bootWindow.__yomuRuntimeOwnerId === ownerId) {
            bootWindow.__yomuReaderAppInitialized = false;
            delete bootWindow.__yomuRuntimeOwnerId;
            delete bootWindow.__yomuRuntimeKind;
            if (bootWindow.__yomuDemoApp === app) delete bootWindow.__yomuDemoApp;
            if (bootWindow.__yomuRealApp === app) delete bootWindow.__yomuRealApp;
        }
    });
}

function releaseYomuRuntime(ownerId: string): void {
    const marker = document.getElementById(RUNTIME_MARKER_ID) as HTMLElement | null;
    if (marker?.dataset.yomuRuntimeOwner === ownerId) marker.remove();
}

function normalizeRuntimeKind(value: unknown): YomuRuntimeKind {
    return value === 'extension' || value === 'userscript' || value === 'demo' ? value : 'demo';
}
