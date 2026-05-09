import type { AudioSourceSetting, AudioSourceType, DictionaryPreference, InterfaceLanguage, OcrProvider, ReaderSettings } from './types';

const STORAGE_KEY = 'jpdb-popup-reader-settings';

export const DEFAULT_AUDIO_URL =
    'http://localhost:9090/?term={term}&reading={reading}';

export const DEFAULT_ACCENT_COLOR = '#5ea780';

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
];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_OPTIONS.map(([value]) => value));

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    onboardingSeen: false,
    interfaceLanguage: 'auto',
    accentColor: DEFAULT_ACCENT_COLOR,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginWiktionaryEnabled: true,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 120,
    hoverCloseDelayMs: 260,
    popupActivationMode: 'hover',
    scanModifierKey: 'shift',
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: true,
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
    dictionaryPreferences: [],
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
    subtitleMiningPause: true,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: false,
    youtubeShowFilterNotice: true,
    ankiEnabled: false,
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiDeck: 'よむ',
    ankiModel: 'よむ Japanese',
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
    return {
        ...DEFAULT_SETTINGS,
        ...(value ?? {}),
        interfaceLanguage: normalizeInterfaceLanguage(value?.interfaceLanguage),
        jpdbDefinitionsPriority: clampNumber(value?.jpdbDefinitionsPriority, 0, 999, DEFAULT_SETTINGS.jpdbDefinitionsPriority),
        lookupOnClick: typeof value?.lookupOnClick === 'boolean' ? value.lookupOnClick : true,
        lookupOnHover: typeof value?.lookupOnHover === 'boolean' ? value.lookupOnHover : value?.popupActivationMode !== 'click',
        hoverOpenDelayMs: clampNumber(value?.hoverOpenDelayMs, 0, 1500, DEFAULT_SETTINGS.hoverOpenDelayMs),
        hoverCloseDelayMs: clampNumber(value?.hoverCloseDelayMs, 0, 3000, DEFAULT_SETTINGS.hoverCloseDelayMs),
        accentColor: sanitizeAccentColor(value?.accentColor),
        audioSources,
        audioSourceUrl: audioSources.find(source => source.url)?.url ?? value?.audioSourceUrl ?? DEFAULT_AUDIO_URL,
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
        similarKanjiWordLimit: clampNumber(value?.similarKanjiWordLimit, 2, 24, DEFAULT_SETTINGS.similarKanjiWordLimit),
        ankiConnectUrl: normalizeUrl(value?.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
        ankiDeck: normalizeAnkiName(value?.ankiDeck, DEFAULT_SETTINGS.ankiDeck, 'Yomu'),
        ankiModel: normalizeAnkiName(value?.ankiModel, DEFAULT_SETTINGS.ankiModel, 'Yomu Japanese'),
        ankiTags: typeof value?.ankiTags === 'string' ? value.ankiTags.trim() : DEFAULT_SETTINGS.ankiTags,
        dictionaryPreferences: normalizeDictionaryPreferences(value?.dictionaryPreferences),
        shortcuts,
    };
}

function normalizeAnkiName(value: unknown, fallback: string, oldDefault: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldDefault) return fallback;
    return trimmed;
}

function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : DEFAULT_SETTINGS.interfaceLanguage;
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
        return mergeSettings(await GM_getValue<Partial<ReaderSettings> | null>(STORAGE_KEY, null));
    }

    try {
        return mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch {
        return mergeSettings(null);
    }
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
    if (typeof GM_setValue === 'function') {
        await GM_setValue(STORAGE_KEY, settings);
        return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
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

export function shortcutIsPressed(shortcut: string, event: MouseEvent | KeyboardEvent, pressedKeys = new Set<string>()): boolean {
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
