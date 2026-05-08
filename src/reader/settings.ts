import type { AudioSourceSetting, AudioSourceType, DictionaryPreference, ReaderSettings } from './types';

const STORAGE_KEY = 'jpdb-popup-reader-settings';

export const DEFAULT_AUDIO_URL =
    'http://localhost:9090/?term={term}&reading={reading}';

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
    'custom-json': 'Custom URL (JSON)',
};

export const AUDIO_SOURCE_OPTIONS = Object.entries(AUDIO_SOURCE_LABELS) as [AudioSourceType, string][];

export const DEFAULT_AUDIO_SOURCES: AudioSourceSetting[] = [];

const AUDIO_SOURCE_TYPES = new Set<AudioSourceType>(AUDIO_SOURCE_OPTIONS.map(([value]) => value));

export const DEFAULT_SETTINGS: ReaderSettings = {
    apiKey: '',
    audioEnabled: true,
    autoPlayAudio: true,
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'first',
    parseSelection: true,
    popupActivationMode: 'click',
    scanModifierKey: 'shift',
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: true,
    showFurigana: true,
    showPitchAccent: true,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: true,
    ocrTapToScan: false,
    ocrProvider: 'custom-json',
    ocrEndpointUrl: '',
    ocrEngine: 'MangaOCR',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 45000,
    ocrMaxImagesPerPage: 8,
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
    },
};

function mergeSettings(value: Partial<ReaderSettings> | null): ReaderSettings {
    const audioSources = normalizeAudioSources(value?.audioSources, value?.audioSourceUrl);
    return {
        ...DEFAULT_SETTINGS,
        ...(value ?? {}),
        audioSources,
        audioSourceUrl: audioSources.find(source => source.url)?.url ?? value?.audioSourceUrl ?? DEFAULT_AUDIO_URL,
        dictionaryPreferences: normalizeDictionaryPreferences(value?.dictionaryPreferences),
        shortcuts: {
            ...DEFAULT_SETTINGS.shortcuts,
            ...(value?.shortcuts ?? {}),
        },
    };
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
    return [];
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
