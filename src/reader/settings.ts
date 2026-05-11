import { Logger } from './logger';
import type { AnkiTemplateMode, AudioSourceSetting, AudioSourceType, DictionaryLookupLink, DictionaryPreference, ImmersionKitCategory, ImmersionKitSort, InterfaceLanguage, OcrProvider, ReaderSettings } from './types';

const STORAGE_KEY = 'jpdb-popup-reader-settings';
const log = Logger.scope('Settings');

export const DEFAULT_AUDIO_URL =
    'http://localhost:9090/?term={term}&reading={reading}';

export const DEFAULT_ACCENT_COLOR = '#5ea780';

export const DEFAULT_WORD_COLORS = {
    new: '#58a6ff',
    learning: '#ffd166',
    known: '#7bd88f',
    due: '#ffb454',
    failed: '#ff6b6b',
    ignored: '#b8a7ff',
} as const;

export const AUDIO_GUIDE_URL = 'https://yomitan.wiki/advanced/#audio';

export const AUDIO_SOURCE_LABELS: Record<AudioSourceType, string> = {
    jpod101: 'JapanesePod101',
    'language-pod-101': 'LanguagePod101',
    jisho: 'Jisho.org',
    'lingua-libre': '(Commons) Lingua Libre',
    wiktionary: '(Commons) Wiktionary',
    'text-to-speech': 'Text-to-speech',
    'text-to-speech-reading': 'Text-to-speech (Kana reading)',
    custom: 'Custom URL',
    'custom-json': 'Custom URL (audio list)',
};

export const AUDIO_SOURCE_OPTIONS = Object.entries(AUDIO_SOURCE_LABELS) as [AudioSourceType, string][];

export const DEFAULT_AUDIO_SOURCES: AudioSourceSetting[] = [
    { type: 'jpod101', url: '', voice: '', enabled: true },
    { type: 'language-pod-101', url: '', voice: '', enabled: true },
    { type: 'jisho', url: '', voice: '', enabled: true },
    { type: 'text-to-speech', url: '', voice: '', enabled: true },
];

export const MAX_DICTIONARY_LOOKUP_LINKS = 8;

export const JPDB_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jpdb',
    label: 'JPDB',
    urlTemplate: 'https://jpdb.io/search?q={query}',
    enabled: false,
};

export const JISHO_LOOKUP_LINK: DictionaryLookupLink = {
    id: 'jisho',
    label: 'Jisho',
    urlTemplate: 'https://jisho.org/search/{query}',
    enabled: true,
};

export const DEFAULT_DICTIONARY_LOOKUP_LINKS: DictionaryLookupLink[] = [
    JPDB_LOOKUP_LINK,
    JISHO_LOOKUP_LINK,
];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_OPTIONS.map(([value]) => value));

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    onboardingSeen: false,
    interfaceLanguage: 'auto',
    accentColor: DEFAULT_ACCENT_COLOR,
    wordColorNew: DEFAULT_WORD_COLORS.new,
    wordColorLearning: DEFAULT_WORD_COLORS.learning,
    wordColorKnown: DEFAULT_WORD_COLORS.known,
    wordColorDue: DEFAULT_WORD_COLORS.due,
    wordColorFailed: DEFAULT_WORD_COLORS.failed,
    wordColorIgnored: DEFAULT_WORD_COLORS.ignored,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    jpdbExtensionsEnabled: true,
    jpdbUchisenEnabled: true,
    jpdbRtkEnabled: true,
    jpdbImmersionKitEnabled: true,
    jpdbLocalDictionariesEnabled: true,
    jpdbReviewUiEnabled: true,
    jpdbAutoRevealSentenceEnabled: true,
    jpdbKanjiDoodleEnabled: true,
    jpdbKanjiEnabled: true,
    jpdbKanjiPriority: 10,
    rtkEnabled: true,
    rtkPriority: 20,
    kanjivgEnabled: true,
    kanjivgPriority: 0,
    kanjiOriginsEnabled: true,
    kanjiOriginsPriority: 50,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginWiktionaryEnabled: false,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordsPriority: 40,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioFallbackChimeEnabled: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    immersionKitEnabled: true,
    immersionKitPriority: 80,
    immersionKitLimit: 3,
    immersionKitMinLength: 4,
    immersionKitMaxLength: 80,
    immersionKitCategory: 'all',
    immersionKitSort: 'sentence_length:asc',
    immersionKitExactMatch: false,
    immersionKitShowTranslation: false,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlaybackRate: 1,
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    lookupOnMiddleMouse: true,
    hoverOpenDelayMs: 120,
    hoverCloseDelayMs: 260,
    popupActivationMode: 'hover',
    scanModifierKey: 'shift',
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: true,
    newTabEnabled: false,
    newTabSource: 'auto',
    newTabJpdbDeck: 'never-forget',
    puckPositionX: undefined,
    puckPositionY: undefined,
    showFurigana: true,
    showPitchAccent: true,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: false,
    ocrProvider: 'google-lens',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrCloudVisionApiKey: '',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 45000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: '#ffffff',
    ocrOutlineColor: '#000000',
    ocrBackgroundColor: '#181b20',
    ocrBackgroundOpacity: 0.36,
    ocrFontScale: 1,
    localDictionariesEnabled: true,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    kanjiDictionariesPriority: 30,
    dictionarySourcesInitiallyExpanded: true,
    dictionaryPreferences: [],
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => ({ ...link })),
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleControlsMode: 'auto',
    subtitleFontSize: 32,
    subtitleBottomOffset: 12,
    subtitleTextColor: '#ffffff',
    subtitleOutlineColor: '#000000',
    subtitleBackgroundColor: '#181b20',
    subtitleBackgroundOpacity: 0.32,
    subtitleFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    subtitleFontWeight: 850,
    subtitleMiningPause: false,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: false,
    youtubeShowFilterNotice: true,
    ankiEnabled: false,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'よむ',
    ankiModel: 'よむ Japanese',
    ankiTemplateMode: 'recognition',
    ankiMobileHandoff: true,
    studyTranslationEnabled: true,
    studyGrammarEnabled: true,
    enableLogging: false,
    ankiTags: 'yomu',
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    theme: 'auto',
    popupMode: 'auto',
    miningDeck: 'forq',
    neverForgetDeck: 'never-forget',
    blacklistDeck: 'blacklist',
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    studyTranslationPriority: 10,
    studyGrammarPriority: 20,
    shortcuts: {
        scanPage: 'Alt+J',
        hoverLookup: '',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
        toggleYoutubeImmersion: 'Alt+Y',
        scanImages: 'Alt+I',
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

function mergeSettings(value: Partial<ReaderSettings> | null): ReaderSettings {
    const hasSavedAudioSources = value && Object.prototype.hasOwnProperty.call(value, 'audioSources');
    const audioSources = hasSavedAudioSources || value?.audioSourceUrl
        ? normalizeAudioSources(value?.audioSources, value?.audioSourceUrl)
        : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
    const shortcuts = {
        ...DEFAULT_SETTINGS.shortcuts,
        ...(value?.shortcuts ?? {}),
    };
    if (value && value.shortcuts && !Object.prototype.hasOwnProperty.call(value.shortcuts, 'hoverLookup')) {
        shortcuts.hoverLookup = value.popupActivationMode === 'modifier' ? shortcutFromLegacyModifier(value.scanModifierKey) : '';
    }
    const hasSavedLookupLinks = Boolean(value && Object.prototype.hasOwnProperty.call(value, 'dictionaryLookupLinks'));
    const dictionaryLookupLinks = normalizeDictionaryLookupLinks(
        value?.dictionaryLookupLinks,
        !hasSavedLookupLinks && Boolean(value?.apiKey?.trim()),
    );
    return {
        ...DEFAULT_SETTINGS,
        ...(value ?? {}),
        interfaceLanguage: normalizeInterfaceLanguage(value?.interfaceLanguage),
        jpdbDefinitionsPriority: clampNumber(value?.jpdbDefinitionsPriority, 0, 999, DEFAULT_SETTINGS.jpdbDefinitionsPriority),
        lookupOnClick: typeof value?.lookupOnClick === 'boolean' ? value.lookupOnClick : true,
        lookupOnHover: typeof value?.lookupOnHover === 'boolean' ? value.lookupOnHover : value?.popupActivationMode !== 'click',
        lookupOnMiddleMouse: typeof value?.lookupOnMiddleMouse === 'boolean' ? value.lookupOnMiddleMouse : true,
        hoverOpenDelayMs: clampNumber(value?.hoverOpenDelayMs, 0, 1500, DEFAULT_SETTINGS.hoverOpenDelayMs),
        hoverCloseDelayMs: clampNumber(value?.hoverCloseDelayMs, 0, 3000, DEFAULT_SETTINGS.hoverCloseDelayMs),
        newTabEnabled: typeof value?.newTabEnabled === 'boolean' ? value.newTabEnabled : DEFAULT_SETTINGS.newTabEnabled,
        newTabSource: normalizeNewTabSource(value?.newTabSource),
        newTabJpdbDeck: normalizeDeckIdSetting(value?.newTabJpdbDeck, DEFAULT_SETTINGS.newTabJpdbDeck),
        accentColor: sanitizeAccentColor(value?.accentColor),
        wordColorNew: sanitizeAccentColor(value?.wordColorNew, DEFAULT_SETTINGS.wordColorNew),
        wordColorLearning: sanitizeAccentColor(value?.wordColorLearning, DEFAULT_SETTINGS.wordColorLearning),
        wordColorKnown: sanitizeAccentColor(value?.wordColorKnown, DEFAULT_SETTINGS.wordColorKnown),
        wordColorDue: sanitizeAccentColor(value?.wordColorDue, DEFAULT_SETTINGS.wordColorDue),
        wordColorFailed: sanitizeAccentColor(value?.wordColorFailed, DEFAULT_SETTINGS.wordColorFailed),
        wordColorIgnored: sanitizeAccentColor(value?.wordColorIgnored, DEFAULT_SETTINGS.wordColorIgnored),
        puckPositionX: normalizeOptionalCoordinate(value?.puckPositionX),
        puckPositionY: normalizeOptionalCoordinate(value?.puckPositionY),
        audioSources,
        audioSourceUrl: audioSources.find(source => source.url)?.url ?? value?.audioSourceUrl ?? DEFAULT_AUDIO_URL,
        audioFallbackChimeEnabled: typeof value?.audioFallbackChimeEnabled === 'boolean' ? value.audioFallbackChimeEnabled : DEFAULT_SETTINGS.audioFallbackChimeEnabled,
        immersionKitPriority: clampNumber(value?.immersionKitPriority, 0, 999, DEFAULT_SETTINGS.immersionKitPriority),
        immersionKitLimit: clampNumber(value?.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
        immersionKitMinLength: clampNumber(value?.immersionKitMinLength, 0, 120, DEFAULT_SETTINGS.immersionKitMinLength),
        immersionKitMaxLength: clampNumber(value?.immersionKitMaxLength, 0, 240, DEFAULT_SETTINGS.immersionKitMaxLength),
        immersionKitCategory: normalizeImmersionKitCategory(value?.immersionKitCategory),
        immersionKitSort: normalizeImmersionKitSort(value?.immersionKitSort),
        immersionKitPlaybackRate: clampNumber(value?.immersionKitPlaybackRate, 0.5, 2, DEFAULT_SETTINGS.immersionKitPlaybackRate),
        ocrProvider: normalizeOcrProvider(value?.ocrProvider),
        ocrEngine: normalizeOcrEngine(value?.ocrEngine),
        ocrTextColor: sanitizeAccentColor(value?.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(value?.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(value?.ocrBackgroundColor, DEFAULT_SETTINGS.ocrBackgroundColor),
        ocrBackgroundOpacity: clampNumber(value?.ocrBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.ocrBackgroundOpacity),
        ocrFontScale: clampNumber(value?.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale),
        subtitleControlsMode: normalizeSubtitleControlsMode(value?.subtitleControlsMode),
        subtitleTextColor: sanitizeAccentColor(value?.subtitleTextColor, DEFAULT_SETTINGS.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(value?.subtitleOutlineColor, DEFAULT_SETTINGS.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(value?.subtitleBackgroundColor, DEFAULT_SETTINGS.subtitleBackgroundColor),
        subtitleBackgroundOpacity: clampNumber(value?.subtitleBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.subtitleBackgroundOpacity),
        subtitleFontFamily: typeof value?.subtitleFontFamily === 'string' && value.subtitleFontFamily.trim() ? value.subtitleFontFamily.trim() : DEFAULT_SETTINGS.subtitleFontFamily,
        subtitleFontWeight: clampNumber(value?.subtitleFontWeight, 100, 900, DEFAULT_SETTINGS.subtitleFontWeight),
        jpdbKanjiEnabled: typeof value?.jpdbKanjiEnabled === 'boolean' ? value.jpdbKanjiEnabled : DEFAULT_SETTINGS.jpdbKanjiEnabled,
        jpdbKanjiPriority: clampNumber(value?.jpdbKanjiPriority, 0, 999, DEFAULT_SETTINGS.jpdbKanjiPriority),
        rtkPriority: clampNumber(value?.rtkPriority, 0, 999, DEFAULT_SETTINGS.rtkPriority),
        kanjivgPriority: clampNumber(value?.kanjivgPriority, 0, 999, DEFAULT_SETTINGS.kanjivgPriority),
        kanjiOriginsPriority: clampNumber(value?.kanjiOriginsPriority, 0, 999, DEFAULT_SETTINGS.kanjiOriginsPriority),
        kanjiDictionariesPriority: clampNumber(value?.kanjiDictionariesPriority, 0, 999, DEFAULT_SETTINGS.kanjiDictionariesPriority),
        similarKanjiWordsPriority: clampNumber(value?.similarKanjiWordsPriority, 0, 999, DEFAULT_SETTINGS.similarKanjiWordsPriority),
        similarKanjiWordLimit: clampNumber(value?.similarKanjiWordLimit, 2, 24, DEFAULT_SETTINGS.similarKanjiWordLimit),
        ankiConnectUrl: normalizeUrl(value?.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
        ankiDeck: normalizeAnkiName(value?.ankiDeck, DEFAULT_SETTINGS.ankiDeck, 'Yomu'),
        ankiModel: normalizeAnkiName(value?.ankiModel, DEFAULT_SETTINGS.ankiModel, 'Yomu Japanese'),
        ankiTemplateMode: normalizeAnkiTemplateMode(value?.ankiTemplateMode),
        ankiMobileHandoff: typeof value?.ankiMobileHandoff === 'boolean' ? value.ankiMobileHandoff : DEFAULT_SETTINGS.ankiMobileHandoff,
        studyTranslationEnabled: typeof value?.studyTranslationEnabled === 'boolean' ? value.studyTranslationEnabled : DEFAULT_SETTINGS.studyTranslationEnabled,
        studyTranslationPriority: clampNumber(value?.studyTranslationPriority, 0, 999, DEFAULT_SETTINGS.studyTranslationPriority),
        studyGrammarEnabled: typeof value?.studyGrammarEnabled === 'boolean' ? value.studyGrammarEnabled : DEFAULT_SETTINGS.studyGrammarEnabled,
        studyGrammarPriority: clampNumber(value?.studyGrammarPriority, 0, 999, DEFAULT_SETTINGS.studyGrammarPriority),
        enableLogging: typeof value?.enableLogging === 'boolean' ? value.enableLogging : DEFAULT_SETTINGS.enableLogging,
        ankiTags: typeof value?.ankiTags === 'string' ? value.ankiTags.trim() : DEFAULT_SETTINGS.ankiTags,
        miningDeck: normalizeDeckIdSetting(value?.miningDeck, DEFAULT_SETTINGS.miningDeck),
        neverForgetDeck: normalizeDeckIdSetting(value?.neverForgetDeck, DEFAULT_SETTINGS.neverForgetDeck),
        blacklistDeck: normalizeDeckIdSetting(value?.blacklistDeck, DEFAULT_SETTINGS.blacklistDeck),
        dictionarySourcesInitiallyExpanded: typeof value?.dictionarySourcesInitiallyExpanded === 'boolean' ? value.dictionarySourcesInitiallyExpanded : DEFAULT_SETTINGS.dictionarySourcesInitiallyExpanded,
        dictionaryPreferences: normalizeDictionaryPreferences(value?.dictionaryPreferences),
        dictionaryLookupLinks,
        shortcuts,
    };
}

function normalizeOptionalCoordinate(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function normalizeAnkiName(value: unknown, fallback: string, oldDefault: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldDefault) return fallback;
    return trimmed;
}

function normalizeAnkiTemplateMode(value: unknown): AnkiTemplateMode {
    return value === 'context' || value === 'recognition' ? value : DEFAULT_SETTINGS.ankiTemplateMode;
}

function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : DEFAULT_SETTINGS.interfaceLanguage;
}

function normalizeImmersionKitCategory(value: unknown): ImmersionKitCategory {
    return value === 'anime' || value === 'drama' || value === 'games' || value === 'all'
        ? value
        : DEFAULT_SETTINGS.immersionKitCategory;
}

function normalizeImmersionKitSort(value: unknown): ImmersionKitSort {
    return value === 'sentence_length:desc' || value === 'random' || value === 'sentence_length:asc'
        ? value
        : DEFAULT_SETTINGS.immersionKitSort;
}

function normalizeUrl(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
        return new URL(value.trim()).toString().replace(/\/$/, '');
    } catch {
        return fallback;
    }
}

function shortcutFromLegacyModifier(value: unknown): string {
    if (value === 'alt') return 'Alt';
    if (value === 'ctrl') return 'Ctrl';
    if (value === 'meta') return 'Meta';
    return value === 'shift' ? 'Shift' : '';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeSubtitleControlsMode(value: unknown): ReaderSettings['subtitleControlsMode'] {
    return value === 'always' || value === 'hidden' || value === 'auto' ? value : DEFAULT_SETTINGS.subtitleControlsMode;
}

function normalizeNewTabSource(value: unknown): ReaderSettings['newTabSource'] {
    return value === 'jpdb' || value === 'anki' || value === 'auto' ? value : DEFAULT_SETTINGS.newTabSource;
}

function normalizeDeckIdSetting(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function sanitizeAccentColor(value: unknown, fallback = DEFAULT_ACCENT_COLOR): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
}

export function accentToRgba(color: string, alpha: number): string {
    const safe = sanitizeAccentColor(color);
    const red = parseInt(safe.slice(1, 3), 16);
    const green = parseInt(safe.slice(3, 5), 16);
    const blue = parseInt(safe.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
}

export function applyUrlBootstrapSettings(settings: ReaderSettings, search = location.search): ReaderSettings {
    const params = new URLSearchParams(search);
    const apiKey = params.get('apiKey')?.trim();
    const audio = params.get('audio')?.trim();
    const ocr = params.get('ocr')?.trim();
    if (!apiKey && !audio && !ocr) return settings;
    log.info('Applying URL bootstrap settings', {
        hasApiKey: Boolean(apiKey),
        hasAudio: Boolean(audio),
        hasOcr: Boolean(ocr),
    });

    const audioSources = audio
        ? [{ type: 'custom-json', url: audio, voice: '', enabled: true } satisfies AudioSourceSetting, ...settings.audioSources.filter(source => source.url !== audio)]
        : settings.audioSources;

    return {
        ...settings,
        apiKey: apiKey || settings.apiKey,
        audioSources,
        audioSourceUrl: audio || settings.audioSourceUrl,
        ocrEndpointUrl: ocr || settings.ocrEndpointUrl,
    };
}

export function normalizeOcrProvider(value: unknown): OcrProvider {
    if (value === 'auto') return 'google-lens';
    if (value === 'fast') return 'google-lens';
    if (value === 'page-text') return 'google-lens';
    if (value === 'custom-json') return 'local-service';
    if (value === 'google-lens' || value === 'cloud-vision' || value === 'local-service' || value === 'off') return value;
    return DEFAULT_SETTINGS.ocrProvider;
}

export function normalizeOcrEngine(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return DEFAULT_SETTINGS.ocrEngine;
    const normalized = value.trim();
    if (normalized === 'MangaOcrAdapter') return 'MangaOCR';
    if (normalized === 'PpOcrAdapter') return 'PaddleOCR';
    if (normalized === 'AppleVisionAdapter') return 'AppleVision';
    if (normalized === 'Google Lens') return 'auto';
    return normalized;
}

export async function loadSettings(): Promise<ReaderSettings> {
    if (typeof GM_getValue === 'function') {
        try {
            const settings = mergeSettings(await GM_getValue<Partial<ReaderSettings> | null>(STORAGE_KEY, null));
            log.debug('Loaded settings from userscript storage', settingsSummary(settings));
            return settings;
        } catch (error) {
            log.warn('Userscript settings load failed, using defaults', { error });
            return mergeSettings(null);
        }
    }

    try {
        const settings = mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
        log.debug('Loaded settings from localStorage', settingsSummary(settings));
        return settings;
    } catch (error) {
        log.warn('Local settings load failed, using defaults', { error });
        return mergeSettings(null);
    }
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
    if (typeof GM_setValue === 'function') {
        try {
            await GM_setValue(STORAGE_KEY, settings);
            log.debug('Saved settings to userscript storage', settingsSummary(settings));
            return;
        } catch (error) {
            log.warn('Userscript settings save failed', { error });
            throw error;
        }
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        log.debug('Saved settings to localStorage', settingsSummary(settings));
    } catch (error) {
        log.warn('Local settings save failed', { error });
        throw error;
    }
}

export function matchesShortcut(event: KeyboardEvent, shortcut = ''): boolean {
    if (!shortcut) return false;

    const parts = parseShortcut(shortcut);
    const key = parts.key?.toLowerCase();
    if (!key) return false;

    const eventKey = normalizeEventKey(event.key).toLowerCase();

    return eventKey === key
        && event.altKey === parts.modifiers.has('alt')
        && event.ctrlKey === parts.modifiers.has('ctrl')
        && event.metaKey === parts.modifiers.has('meta')
        && event.shiftKey === parts.modifiers.has('shift');
}

export function formatShortcutEvent(event: KeyboardEvent): string {
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    const key = normalizeEventKey(event.key);
    if (!isModifierKey(key) || parts.length === 0) {
        if (!isModifierKey(key)) parts.push(key);
    }
    return dedupeShortcutParts(parts).join('+');
}

export function shortcutIsPressed(shortcut = '', event: MouseEvent | KeyboardEvent, pressedKeys = new Set<string>()): boolean {
    if (!shortcut.trim()) return true;
    const parts = parseShortcut(shortcut);
    if (parts.modifiers.has('alt') !== event.altKey) return false;
    if (parts.modifiers.has('ctrl') !== event.ctrlKey) return false;
    if (parts.modifiers.has('meta') !== event.metaKey) return false;
    if (parts.modifiers.has('shift') !== event.shiftKey) return false;
    if (!parts.key) return parts.modifiers.size > 0;
    return pressedKeys.has(parts.key.toLowerCase()) || ('key' in event && normalizeEventKey(event.key).toLowerCase() === parts.key.toLowerCase());
}

function parseShortcut(shortcut: string): { key: string; modifiers: Set<string> } {
    const parts = shortcut.split('+').map(part => normalizeShortcutPart(part)).filter(Boolean);
    const modifiers = new Set(parts.filter(isModifierKey).map(part => part.toLowerCase()));
    const key = [...parts].reverse().find(part => !isModifierKey(part)) ?? '';
    return { key: key.toLowerCase(), modifiers };
}

function normalizeShortcutPart(part: string): string {
    const value = part.trim();
    if (!value) return '';
    const lower = value.toLowerCase();
    if (lower === 'control') return 'Ctrl';
    if (lower === 'cmd' || lower === 'command' || lower === 'win' || lower === 'windows') return 'Meta';
    if (lower === 'option') return 'Alt';
    if (lower === 'esc') return 'Escape';
    if (lower === 'spacebar' || lower === ' ') return 'Space';
    if (value.length === 1) return value.toUpperCase();
    return value[0]?.toUpperCase() + value.slice(1);
}

function normalizeEventKey(key: string): string {
    if (key === ' ') return 'Space';
    return normalizeShortcutPart(key);
}

function isModifierKey(key: string): boolean {
    return key === 'Alt' || key === 'Ctrl' || key === 'Meta' || key === 'Shift';
}

function dedupeShortcutParts(parts: string[]): string[] {
    return parts.filter((part, index) => parts.indexOf(part) === index);
}

export function isAudioSourceType(value: unknown): value is AudioSourceType {
    return typeof value === 'string' && AUDIO_SOURCE_TYPES.has(value as AudioSourceType);
}

export function normalizeAudioSource(value: unknown): AudioSourceSetting | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<AudioSourceSetting> & { type?: unknown; url?: unknown; voice?: unknown; enabled?: unknown };
    if (!isAudioSourceType(record.type)) return null;
    return {
        type: record.type,
        url: typeof record.url === 'string' ? record.url : '',
        voice: typeof record.voice === 'string' ? record.voice : '',
        enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    };
}

export function normalizeAudioSources(value: unknown, legacyUrl?: string): AudioSourceSetting[] {
    const sources = Array.isArray(value)
        ? value.map(normalizeAudioSource).filter((source): source is AudioSourceSetting => source !== null)
        : [];
    if (Array.isArray(value)) return sources;

    if (typeof legacyUrl === 'string' && legacyUrl.trim()) {
        return [{ type: 'custom-json', url: legacyUrl.trim(), voice: '', enabled: true }];
    }
    return DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

export function normalizeDictionaryPreferences(value: unknown): DictionaryPreference[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item, index): DictionaryPreference | null => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Partial<DictionaryPreference> & { name?: unknown; alias?: unknown; enabled?: unknown; priority?: unknown };
            if (typeof record.name !== 'string' || !record.name.trim()) return null;
            return {
                name: record.name,
                alias: typeof record.alias === 'string' && record.alias.trim() ? record.alias : record.name,
                enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
                priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : index,
                allowSecondarySearches: typeof record.allowSecondarySearches === 'boolean' ? record.allowSecondarySearches : false,
            };
        })
        .filter((item): item is DictionaryPreference => item !== null)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function defaultDictionaryLookupLinks(mode: 'jpdb' | 'local' = 'local'): DictionaryLookupLink[] {
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map(link => ({
        ...link,
        enabled: link.id === 'jpdb' ? mode === 'jpdb' : mode !== 'jpdb',
    }));
}

export function normalizeDictionaryLookupLinks(value: unknown, preferJpdb = false): DictionaryLookupLink[] {
    const builtIns = defaultDictionaryLookupLinks(preferJpdb ? 'jpdb' : 'local');
    if (!Array.isArray(value)) return builtIns;

    const normalized: DictionaryLookupLink[] = [];
    const seen = new Set<string>();
    const add = (link: DictionaryLookupLink) => {
        const id = link.id.trim();
        if (!id || seen.has(id) || normalized.length >= MAX_DICTIONARY_LOOKUP_LINKS) return;
        seen.add(id);
        normalized.push({ ...link, id });
    };

    for (const item of value) {
        const link = normalizeDictionaryLookupLink(item);
        if (link) add(link);
    }

    for (const builtIn of builtIns) {
        if (!seen.has(builtIn.id)) add(builtIn);
    }

    return normalized.slice(0, MAX_DICTIONARY_LOOKUP_LINKS);
}

export function normalizeDictionaryLookupLink(value: unknown): DictionaryLookupLink | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<DictionaryLookupLink> & { id?: unknown; label?: unknown; urlTemplate?: unknown; enabled?: unknown };
    const id = typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : typeof record.label === 'string'
            ? `custom-${stableLookupLinkId(record.label)}`
            : '';
    const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim().slice(0, 24) : id;
    const urlTemplate = typeof record.urlTemplate === 'string' ? record.urlTemplate.trim() : '';
    if (!id || !label || !urlTemplate || !isSafeLookupUrlTemplate(urlTemplate)) return null;
    return {
        id,
        label,
        urlTemplate,
        enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    };
}

function stableLookupLinkId(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return slug || 'lookup';
}

function isSafeLookupUrlTemplate(value: string): boolean {
    try {
        const url = new URL(value.replace(/\{[^}]+\}/g, 'x'));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export function mergeDictionaryPreferences(current: DictionaryPreference[], names: string[]): DictionaryPreference[] {
    const merged = new Map(current.map(item => [item.name, item]));
    for (const name of names) {
        if (!merged.has(name)) {
            merged.set(name, {
                name,
                alias: name,
                enabled: true,
                priority: merged.size,
                allowSecondarySearches: false,
            });
        }
    }
    return normalizeDictionaryPreferences([...merged.values()]);
}

function settingsSummary(settings: ReaderSettings): Record<string, unknown> {
    return {
        enableLogging: settings.enableLogging,
        hasApiKey: Boolean(settings.apiKey.trim()),
        dictionaries: settings.dictionaryPreferences.length,
        localDictionariesEnabled: settings.localDictionariesEnabled,
        ocrEnabled: settings.ocrEnabled,
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        youtubeImmersionEnabled: settings.youtubeImmersionEnabled,
        ankiEnabled: settings.ankiEnabled,
        theme: settings.theme,
    };
}
