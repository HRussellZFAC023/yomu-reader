import type { AudioSourceSetting, AudioSourceType, DictionaryPreference, OcrProvider, ReaderSettings } from './types';

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
    accentColor: DEFAULT_ACCENT_COLOR,
    audioEnabled: true,
    autoPlayAudio: true,
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    parseSelection: true,
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
    localDictionariesEnabled: true,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    dictionaryPreferences: [],
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleMiningPause: true,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: false,
    youtubeShowFilterNotice: true,
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
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
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
    return {
        ...DEFAULT_SETTINGS,
        ...(value ?? {}),
        accentColor: sanitizeAccentColor(value?.accentColor),
        audioSources,
        audioSourceUrl: audioSources.find(source => source.url)?.url ?? value?.audioSourceUrl ?? DEFAULT_AUDIO_URL,
        ocrProvider: normalizeOcrProvider(value?.ocrProvider),
        ocrEngine: normalizeOcrEngine(value?.ocrEngine),
        dictionaryPreferences: normalizeDictionaryPreferences(value?.dictionaryPreferences),
        shortcuts: {
            ...DEFAULT_SETTINGS.shortcuts,
            ...(value?.shortcuts ?? {}),
        },
    };
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
    if (value === 'fast') return 'page-text';
    if (value === 'custom-json') return 'local-service';
    if (value === 'google-lens' || value === 'cloud-vision' || value === 'local-service' || value === 'page-text' || value === 'off') return value;
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

    const parts = shortcut.split('+').map(part => part.trim()).filter(Boolean);
    const key = parts.at(-1)?.toLowerCase();
    if (!key) return false;

    const wants = new Set(parts.slice(0, -1).map(part => part.toLowerCase()));
    const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();

    return eventKey === key
        && event.altKey === wants.has('alt')
        && event.ctrlKey === wants.has('ctrl')
        && event.metaKey === wants.has('meta')
        && event.shiftKey === wants.has('shift');
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
