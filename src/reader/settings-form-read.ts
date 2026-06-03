import { Logger } from './logger';
import { COPY_LOOKUP_LINK, DEFAULT_AUDIO_SOURCES, MAX_DICTIONARY_LOOKUP_LINKS, normalizeAudioSource, normalizeDictionaryLookupLinks, normalizeOcrProvider, sanitizeAccentColor } from './settings';
import type { AnkiFieldMapping, AnkiFieldMappingRole, AnkiFieldMappings, AudioSourceSetting, DictionaryLookupLink, DictionaryPreference, ReaderColorSource, ReaderSettings } from './types';

const log = Logger.scope('SettingsForm');
export const CUSTOM_FONT_FAMILY_VALUE = '__custom_font_family__';
type FontFamilySettingName = 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily';
export type SelectableReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
export type ColorSourceSettingName =
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource';

export const COLOR_SOURCE_VALUES: readonly SelectableReaderColorSource[] = ['status', 'jpdb', 'anki', 'pitch', 'off'];
export const COLOR_SOURCE_OPTIONS: [SelectableReaderColorSource, string][] = [
    ['status', 'JPDB + Anki status'],
    ['jpdb', 'JPDB status'],
    ['anki', 'Anki status'],
    ['pitch', 'Pitch accent'],
    ['off', 'Off'],
];
const DEFAULT_COLOR_SOURCE_VALUES: Record<ColorSourceSettingName, SelectableReaderColorSource> = {
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'anki',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'anki',
};

interface SettingsFormReader {
    get: (key: string) => string;
    has: (key: string) => boolean;
    number: (key: string, fallback: number) => number;
    colorSource: (key: string, fallback: ReaderColorSource) => ReaderColorSource;
}

export function settingsColorSourceValue(settings: ReaderSettings, name: ColorSourceSettingName): SelectableReaderColorSource {
    const source = settings[name];
    return source === 'auto' ? DEFAULT_COLOR_SOURCE_VALUES[name] : source;
}

export function readFormSettings(data: FormData, current: ReaderSettings): ReaderSettings {
    const get = (key: string) => String(data.get(key) ?? '');
    const has = (key: string) => data.has(key);
    const number = (key: string, fallback: number) => readNumber(get(key), fallback);
    const audioSources = readAudioSources(data);
    const furiganaMode = readOption(get('furiganaMode'), ['auto', 'all', 'difficult-kanji', 'known-status', 'off'] as const, current.furiganaMode);
    const colorSource = (key: string, fallback: ReaderColorSource) =>
        readOption(get(key), COLOR_SOURCE_VALUES, colorSourceFallback(key, fallback));
    const reader: SettingsFormReader = { get, has, number, colorSource };
    const jpdbDefinitionsRowPresent = hasJpdbDefinitionsRow(has);
    const dictionaryPreferences = readDictionaryPreferences(data, current.dictionaryPreferences);
    const kanjiDictionaryPreferences = dictionaryPreferences.filter(preference => preference.type === 'kanji');
    const settings: ReaderSettings = {
        ...current,
        apiKey: get('apiKey').trim(),
        interfaceLanguage: readOption(get('interfaceLanguage'), ['auto', 'en', 'ja'] as const, current.interfaceLanguage),
        ...readJpdbFormSettings(reader, current, jpdbDefinitionsRowPresent),
        ...readKanjiAddonFormSettings(reader, current),
        ...readAudioFormSettings(reader, current, audioSources),
        ...readColorFormSettings(reader, current),
        ...readImmersionKitFormSettings(reader, current),
        ...readLookupBehaviorFormSettings(reader, current),
        ...readNewTabFormSettings(reader, current),
        ...readReadingDisplayFormSettings(reader, furiganaMode),
        ...readOcrFormSettings(reader, current),
        ...readLocalDictionaryFormSettings(reader, current, kanjiDictionaryPreferences),
        dictionaryPreferences,
        dictionaryLookupLinks: readDictionaryLookupLinks(data),
        ...readSubtitleFormSettings(reader, current),
        ...readYoutubeFormSettings(reader),
        ...readAnkiFormSettings(reader, current),
        ...readStudyToolFormSettings(reader, current),
        enableLogging: has('enableLogging'),
        ...readPopupFormSettings(reader, current),
        ...readMiningFormSettings(reader),
        shortcuts: readShortcutFormSettings(reader),
    };
    log.info('Read settings form data', {
        enableLogging: settings.enableLogging,
        dictionaries: settings.dictionaryPreferences.length,
        lookupLinks: settings.dictionaryLookupLinks.length,
        audioSources: settings.audioSources.length,
        ocrEnabled: settings.ocrEnabled,
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        ankiEnabled: settings.ankiEnabled,
    });
    return settings;
}

function colorSourceFallback(key: string, fallback: ReaderColorSource): SelectableReaderColorSource {
    if (fallback !== 'auto') return fallback;
    return isColorSourceSettingName(key) ? DEFAULT_COLOR_SOURCE_VALUES[key] : 'jpdb';
}

function isColorSourceSettingName(value: string): value is ColorSourceSettingName {
    return Object.prototype.hasOwnProperty.call(DEFAULT_COLOR_SOURCE_VALUES, value);
}

function hasJpdbDefinitionsRow(has: (key: string) => boolean): boolean {
    return has('jpdbDefinitions.name') || has('jpdbDefinitions.priority') || has('jpdbDefinitions.enabled');
}

function readJpdbFormSettings(reader: SettingsFormReader, current: ReaderSettings, definitionsRowPresent: boolean): Partial<ReaderSettings> {
    const { has, number } = reader;
    const jpdbPageEnhancementsEnabled = has('jpdbPageEnhancementsEnabled');
    return {
        jpdbDefinitionsEnabled: definitionsRowPresent ? has('jpdbDefinitions.enabled') : has('jpdbDefinitionsEnabled'),
        jpdbDefinitionsPriority: Math.max(0, Math.min(999, number('jpdbDefinitions.priority', current.jpdbDefinitionsPriority))),
        jpdbPageEnhancementsEnabled,
        jpdbPageWordEnhancementsEnabled: jpdbPageEnhancementsEnabled && has('jpdbPageWordEnhancementsEnabled'),
        jpdbPageKanjiEnhancementsEnabled: jpdbPageEnhancementsEnabled && has('jpdbPageKanjiEnhancementsEnabled'),
    };
}

function readKanjiAddonFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        jpdbKanjiEnabled: has('jpdbKanji.enabled'),
        jpdbKanjiPriority: Math.max(0, Math.min(999, number('jpdbKanji.priority', current.jpdbKanjiPriority))),
        kanjiImmersionKitEnabled: has('kanjiImmersionKit.enabled'),
        kanjiImmersionKitPriority: Math.max(0, Math.min(999, number('kanjiImmersionKit.priority', current.kanjiImmersionKitPriority))),
        uchisenEnabled: has('uchisen.enabled'),
        uchisenPriority: Math.max(0, Math.min(999, number('uchisen.priority', current.uchisenPriority))),
        rtkEnabled: has('rtk.enabled'),
        rtkPriority: Math.max(0, Math.min(999, number('rtk.priority', current.rtkPriority))),
        kanjivgEnabled: has('kanjivg.enabled'),
        kanjivgPriority: Math.max(0, Math.min(999, number('kanjivg.priority', current.kanjivgPriority))),
        kanjiOriginsEnabled: has('kanjiOrigins.enabled'),
        kanjiOriginsPriority: Math.max(0, Math.min(999, number('kanjiOrigins.priority', current.kanjiOriginsPriority))),
        kanjiOriginKanjiMapEnabled: has('kanjiOriginKanjiMapEnabled'),
        kanjiOriginGraphEnabled: has('kanjiOriginGraphEnabled'),
        kanjiOriginRadicalImagesEnabled: has('kanjiOriginRadicalImagesEnabled'),
        similarKanjiWords: has('similarKanjiWords.enabled'),
        similarKanjiWordsPriority: Math.max(0, Math.min(999, number('similarKanjiWords.priority', current.similarKanjiWordsPriority))),
        similarKanjiWordLimit: Math.max(2, Math.min(24, number('similarKanjiWordLimit', current.similarKanjiWordLimit))),
    };
}

function readAudioFormSettings(reader: SettingsFormReader, current: ReaderSettings, audioSources: AudioSourceSetting[]): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    const audioAutoPlayMode = readOption(get('audioAutoPlayMode'), ['off', 'all', 'hover', 'tap'] as const, current.audioAutoPlayMode);
    return {
        audioEnabled: has('audioEnabled'),
        autoPlayAudio: has('autoPlayAudio') && audioAutoPlayMode !== 'off',
        suppressAutoAudioOnVideo: has('suppressAutoAudioOnVideo'),
        audioAutoPlayMode,
        audioSources,
        audioEnableDefaultSources: has('audioEnableDefaultSources'),
        audioSourceUrl: audioSources.find(source => source.url.trim())?.url.trim() ?? current.audioSourceUrl,
        audioViaBlob: current.audioViaBlob,
        audioFallbackChimeEnabled: has('audioFallbackChimeEnabled'),
        audioTimeoutMs: Math.max(1000, Math.min(30000, number('audioTimeoutMs', current.audioTimeoutMs))),
        audioSelectionMode: readOption(get('audioSelectionMode'), ['first', 'random'] as const, current.audioSelectionMode),
        audioTtsMode: readOption(get('audioTtsMode'), ['fallback', 'source-order'] as const, current.audioTtsMode),
    };
}

function readColorFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, colorSource } = reader;
    return {
        accentColor: sanitizeAccentColor(get('accentColor'), current.accentColor),
        wordColorNew: sanitizeAccentColor(get('wordColorNew'), current.wordColorNew),
        wordColorLearning: sanitizeAccentColor(get('wordColorLearning'), current.wordColorLearning),
        wordColorKnown: sanitizeAccentColor(get('wordColorKnown'), current.wordColorKnown),
        wordColorDue: sanitizeAccentColor(get('wordColorDue'), current.wordColorDue),
        wordColorFailed: sanitizeAccentColor(get('wordColorFailed'), current.wordColorFailed),
        wordColorIgnored: sanitizeAccentColor(get('wordColorIgnored'), current.wordColorIgnored),
        pitchColorHeiban: sanitizeAccentColor(get('pitchColorHeiban'), current.pitchColorHeiban),
        pitchColorAtamadaka: sanitizeAccentColor(get('pitchColorAtamadaka'), current.pitchColorAtamadaka),
        pitchColorNakadaka: sanitizeAccentColor(get('pitchColorNakadaka'), current.pitchColorNakadaka),
        pitchColorOdaka: sanitizeAccentColor(get('pitchColorOdaka'), current.pitchColorOdaka),
        pitchColorKifuku: sanitizeAccentColor(get('pitchColorKifuku'), current.pitchColorKifuku),
        pitchColorUnknown: sanitizeAccentColor(get('pitchColorUnknown'), current.pitchColorUnknown),
        wordHighlightColorSource: colorSource('wordHighlightColorSource', current.wordHighlightColorSource),
        wordUnderlineColorSource: colorSource('wordUnderlineColorSource', current.wordUnderlineColorSource),
        wordTextColorSource: colorSource('wordTextColorSource', current.wordTextColorSource),
        subtitleHighlightColorSource: colorSource('subtitleHighlightColorSource', current.subtitleHighlightColorSource),
        subtitleUnderlineColorSource: colorSource('subtitleUnderlineColorSource', current.subtitleUnderlineColorSource),
        subtitleTextColorSource: colorSource('subtitleTextColorSource', current.subtitleTextColorSource),
    };
}

function readLookupBehaviorFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        parseSelection: has('parseSelection'),
        lookupOnClick: has('lookupOnClick'),
        lookupOnHover: has('lookupOnHover'),
        lookupOnMiddleMouse: has('lookupOnMiddleMouse'),
        hoverOpenDelayMs: Math.max(0, Math.min(1500, number('hoverOpenDelayMs', current.hoverOpenDelayMs))),
        hoverCloseDelayMs: Math.max(0, Math.min(3000, number('hoverCloseDelayMs', current.hoverCloseDelayMs))),
        popupActivationMode: current.popupActivationMode,
        scanModifierKey: current.scanModifierKey,
        showFloatingButton: has('showFloatingButton'),
    };
}

function readNewTabFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
        newTabEnabled: has('newTabEnabled'),
        newTabAnkiEnabled: has('newTabAnkiEnabled'),
        newTabAnkiDisabledDecks: get('newTabAnkiDisabledDecks').split(',').map(deck => deck.trim()).filter(Boolean),
        newTabSource: readOption(get('newTabSource'), ['auto', 'jpdb', 'anki', 'dictionary'] as const, current.newTabSource),
        newTabJpdbDeck: get('newTabJpdbDeck').trim() || current.newTabJpdbDeck,
        newTabJpdbReviewMode: readOption(get('newTabJpdbReviewMode'), ['auto', 'api-vocabulary', 'live-review'] as const, current.newTabJpdbReviewMode),
        corsProxyUrl: get('corsProxyUrl').trim(),
        newTabKanjiKeywordSource: readOption(get('newTabKanjiKeywordSource'), ['auto', 'rtk', 'jpdb', 'local'] as const, current.newTabKanjiKeywordSource),
        newTabParsingEnabled: has('newTabParsingEnabled'),
        newTabFrontSentenceEnabled: has('newTabFrontSentenceEnabled'),
        newTabOfflineEnabled: has('newTabOfflineEnabled'),
        newTabOfflineLimit: Math.max(0, Math.min(500, number('newTabOfflineLimit', current.newTabOfflineLimit))),
        newTabKanjiAutogradeEnabled: has('newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: has('newTabKanjiAutoSubmit'),
    };
}

function readReadingDisplayFormSettings(
    reader: SettingsFormReader,
    furiganaMode: ReaderSettings['furiganaMode'],
): Partial<ReaderSettings> {
    const { has } = reader;
    return {
        showFurigana: furiganaMode !== 'off',
        furiganaMode,
        showPitchAccent: has('showPitchAccent'),
        hideKnownFurigana: furiganaMode === 'known-status',
    };
}

function readLocalDictionaryFormSettings(reader: SettingsFormReader, current: ReaderSettings, kanjiPreferences: DictionaryPreference[]): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        localDictionariesEnabled: has('localDictionariesEnabled'),
        localDictionaryShowKanji: has('kanjiDictionaries.enabled') || kanjiPreferences.some(preference => preference.enabled),
        kanjiDictionariesPriority: Math.max(0, Math.min(999, number('kanjiDictionaries.priority', current.kanjiDictionariesPriority))),
        dictionarySourcesInitiallyExpanded: has('dictionarySourcesInitiallyExpanded'),
        localDictionaryMaxResults: Math.max(1, Math.min(64, number('localDictionaryMaxResults', current.localDictionaryMaxResults))),
    };
}

function readAnkiFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has } = reader;
    const sectionRowPresent = Boolean(get('ankiSection.name') || get('ankiSection.priority') || has('ankiSection.enabled'));
    return {
        ankiEnabled: has('ankiEnabled'),
        ankiSectionEnabled: sectionRowPresent ? has('ankiSection.enabled') : current.ankiSectionEnabled,
        ankiSectionPriority: sectionRowPresent ? Math.max(0, Math.min(999, reader.number('ankiSection.priority', current.ankiSectionPriority))) : current.ankiSectionPriority,
        ankiConnectUrl: get('ankiConnectUrl').trim() || current.ankiConnectUrl,
        ankiDeck: get('ankiDeck').trim() || current.ankiDeck,
        ankiModel: get('ankiModel').trim() || current.ankiModel,
        ankiTemplateMode: readOption(get('ankiTemplateMode'), ['recognition', 'context'] as const, current.ankiTemplateMode),
        ankiFrontReading: has('ankiFrontReading'),
        ankiFrontSentence: has('ankiFrontSentence'),
        ankiFrontImage: has('ankiFrontImage'),
        ankiFieldMappings: readAnkiFieldMappings(get('ankiFieldMappings'), current.ankiFieldMappings),
        ankiTags: get('ankiTags').trim(),
        ankiMineWithJpdb: has('ankiMineWithJpdb'),
        ankiCaptureScreenshot: has('ankiCaptureScreenshot'),
        ankiMobileHandoff: has('ankiMobileHandoff'),
    };
}

const ANKI_FIELD_MAPPING_ROLES: readonly AnkiFieldMappingRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'image'];

function readAnkiFieldMappings(value: string, fallback: AnkiFieldMappings): AnkiFieldMappings {
    if (!value.trim()) return fallback;
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
        const out: AnkiFieldMappings = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([modelName, mapping]) => {
            const normalizedModelName = modelName.trim();
            if (!normalizedModelName || !mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
            const normalizedMapping: AnkiFieldMapping = {};
            for (const role of ANKI_FIELD_MAPPING_ROLES) {
                const fieldName = (mapping as Record<string, unknown>)[role];
                if (typeof fieldName !== 'string') continue;
                const normalizedFieldName = fieldName.trim();
                if (normalizedFieldName) normalizedMapping[role] = normalizedFieldName;
            }
            if (Object.keys(normalizedMapping).length) out[normalizedModelName] = normalizedMapping;
        });
        return out;
    } catch {
        return fallback;
    }
}

function readStudyToolFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, number } = reader;
    return {
        studyTranslationEnabled: has('studyTranslation.enabled'),
        studyTranslationPriority: Math.max(0, Math.min(999, number('studyTranslation.priority', current.studyTranslationPriority))),
        studyGrammarEnabled: has('studyGrammar.enabled'),
        studyGrammarPriority: Math.max(0, Math.min(999, number('studyGrammar.priority', current.studyGrammarPriority))),
    };
}

function readPopupFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    const popupMode = readOption(get('popupMode'), ['auto', 'sheet', 'popover'] as const, current.popupMode);
    return {
        theme: readOption(get('theme'), ['auto', 'dark', 'light'] as const, current.theme),
        popupMode,
        stickyBottomSheet: has('stickyBottomSheet'),
        popoverBackdropEnabled: has('popoverBackdropEnabled'),
        popoverWidth: Math.max(280, Math.min(900, number('popoverWidth', current.popoverWidth))),
        popoverHeight: Math.max(220, Math.min(900, number('popoverHeight', current.popoverHeight))),
        popoverHeightMode: readOption(get('popoverHeightMode'), ['available', 'fixed'] as const, current.popoverHeightMode),
        readerFontFamily: readFontFamilySetting(reader, 'readerFontFamily', current.readerFontFamily),
        popupFontFamily: readFontFamilySetting(reader, 'popupFontFamily', current.popupFontFamily),
        popupFontWeight: Math.max(300, Math.min(900, number('popupFontWeight', current.popupFontWeight))),
    };
}

function readFontFamilySetting(reader: SettingsFormReader, name: FontFamilySettingName, fallback: string): string {
    const value = reader.get(name).trim();
    if (value === CUSTOM_FONT_FAMILY_VALUE) return reader.get(`${name}Custom`).trim() || fallback;
    return value || fallback;
}

function readMiningFormSettings(reader: SettingsFormReader): Partial<ReaderSettings> {
    const { get, has } = reader;
    return {
        jpdbMiningEnabled: has('jpdbMiningEnabled'),
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
    };
}

function readOcrFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
        ocrEnabled: has('ocrEnabled'),
        ocrAutoScanImages: has('ocrAutoScanImages'),
        ocrShowTextOverlay: has('ocrShowTextOverlay'),
        ocrProvider: normalizeOcrProvider(get('ocrProvider')),
        ocrEndpointUrl: get('ocrEndpointUrl').trim(),
        ocrEngine: get('ocrEngine').trim() || 'auto',
        ocrCloudVisionApiKey: get('ocrCloudVisionApiKey').trim(),
        ocrLanguage: get('ocrLanguage').trim() || 'ja-JP',
        ocrMaxImagePixels: Math.max(160000, Math.min(2800000, number('ocrMaxImagePixels', current.ocrMaxImagePixels))),
        ocrMinImageArea: Math.max(10000, Math.min(800000, number('ocrMinImageArea', current.ocrMinImageArea))),
        ocrMaxImagesPerPage: Math.max(1, Math.min(30, number('ocrMaxImagesPerPage', current.ocrMaxImagesPerPage))),
        ocrPrefetchMargin: Math.max(0, Math.min(3000, number('ocrPrefetchMargin', current.ocrPrefetchMargin))),
        ocrTextColor: sanitizeAccentColor(get('ocrTextColor'), current.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(get('ocrOutlineColor'), current.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(get('ocrBackgroundColor'), current.ocrBackgroundColor),
        ocrBackgroundOpacity: Math.max(0, Math.min(1, number('ocrBackgroundOpacity', current.ocrBackgroundOpacity))),
        ocrFontScale: Math.max(0.7, Math.min(1.8, number('ocrFontScale', current.ocrFontScale))),
    };
}

function readSubtitleFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    return {
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: has('subtitleOverlayVisible'),
        subtitleSecondaryVisible: has('subtitleSecondaryVisible'),
        subtitleNativeBlurred: has('subtitleNativeBlurred'),
        subtitleKaraokeMode: has('subtitleKaraokeMode'),
        subtitleTranscriptVisible: has('subtitleTranscriptVisible'),
        subtitlePausePanel: has('subtitlePausePanel'),
        subtitleTranscriptPlacement: readOption(get('subtitleTranscriptPlacement'), ['right', 'left', 'bottom'] as const, current.subtitleTranscriptPlacement),
        subtitleTranscriptAutoScroll: has('subtitleTranscriptAutoScroll'),
        subtitleAutoCopyLine: has('subtitleAutoCopyLine'),
        subtitleControlsMode: readOption(get('subtitleControlsMode'), ['auto', 'always', 'hidden'] as const, current.subtitleControlsMode),
        subtitleFontSize: Math.max(16, Math.min(64, number('subtitleFontSize', current.subtitleFontSize))),
        subtitleBottomOffset: Math.max(2, Math.min(40, number('subtitleBottomOffset', current.subtitleBottomOffset))),
        subtitleTextColor: sanitizeAccentColor(get('subtitleTextColor'), current.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(get('subtitleOutlineColor'), current.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(get('subtitleBackgroundColor'), current.subtitleBackgroundColor),
        subtitleBackgroundOpacity: Math.max(0, Math.min(1, number('subtitleBackgroundOpacity', current.subtitleBackgroundOpacity))),
        subtitleFontFamily: readFontFamilySetting(reader, 'subtitleFontFamily', current.subtitleFontFamily),
        subtitleFontWeight: Math.max(100, Math.min(900, number('subtitleFontWeight', current.subtitleFontWeight))),
        subtitleMiningPause: has('subtitleMiningPause'),
        subtitleSeekPadding: Math.max(-2, Math.min(2, number('subtitleSeekPadding', current.subtitleSeekPadding))),
    };
}

function readImmersionKitFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, number } = reader;
    const mediaEnabled = has('immersionKitEnabled');
    const sourceRowPresent = Boolean(get('immersionKit.name') || get('immersionKit.priority'));
    const sourceEnabled = sourceRowPresent ? has('immersionKit.enabled') : true;
    return {
        immersionKitEnabled: mediaEnabled && sourceEnabled,
        immersionKitExampleSource: readOption(get('immersionKitExampleSource'), ['immersion-kit', 'nadeshiko', 'combined'] as const, current.immersionKitExampleSource),
        nadeshikoApiKey: get('nadeshikoApiKey').trim(),
        immersionKitPriority: Math.max(0, Math.min(999, number('immersionKit.priority', current.immersionKitPriority))),
        immersionKitLimitEnabled: get('immersionKitLimitEnabled') === 'on',
        immersionKitLimit: Math.max(1, Math.min(12, number('immersionKitLimit', current.immersionKitLimit))),
        immersionKitMinLength: Math.max(0, Math.min(120, number('immersionKitMinLength', current.immersionKitMinLength))),
        immersionKitMaxLength: Math.max(0, Math.min(240, number('immersionKitMaxLength', current.immersionKitMaxLength))),
        immersionKitCategory: readOption(get('immersionKitCategory'), ['all', 'anime', 'drama', 'games'] as const, current.immersionKitCategory),
        immersionKitSort: readOption(get('immersionKitSort'), ['sentence_length:asc', 'sentence_length:desc'] as const, current.immersionKitSort),
        immersionKitExactMatch: has('immersionKitExactMatch'),
        immersionKitShowTranslation: has('immersionKitShowTranslation'),
        immersionKitRevealTranslationOnClick: has('immersionKitShowTranslation') && has('immersionKitRevealTranslationOnClick'),
        immersionKitShowImages: has('immersionKitShowImages'),
        immersionKitAutoPlayAudio: has('immersionKitAutoPlayAudio'),
        immersionKitPlayOnHover: has('immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: has('immersionKitPlayOnImageClick'),
        immersionKitPlaybackRate: Math.max(0.5, Math.min(2, number('immersionKitPlaybackRate', current.immersionKitPlaybackRate))),
    };
}

function readYoutubeFormSettings(reader: SettingsFormReader): Partial<ReaderSettings> {
    const { has } = reader;
    return {
        youtubeImmersionEnabled: has('youtubeImmersionEnabled'),
        preferJapaneseSiteLanguage: has('preferJapaneseSiteLanguage'),
        youtubeShowFilterNotice: has('youtubeShowFilterNotice'),
    };
}

function readShortcutFormSettings(reader: SettingsFormReader): ReaderSettings['shortcuts'] {
    const { get } = reader;
    return {
        scanPage: get('shortcuts.scanPage'),
        hoverLookup: get('shortcuts.hoverLookup'),
        openSettings: get('shortcuts.openSettings'),
        playAudio: get('shortcuts.playAudio'),
        closePopup: get('shortcuts.closePopup'),
        previousLookupWord: get('shortcuts.previousLookupWord'),
        nextLookupWord: get('shortcuts.nextLookupWord'),
        previousSubtitle: get('shortcuts.previousSubtitle'),
        nextSubtitle: get('shortcuts.nextSubtitle'),
        copySubtitle: get('shortcuts.copySubtitle'),
        toggleOcr: get('shortcuts.toggleOcr'),
        toggleYoutubeImmersion: get('shortcuts.toggleYoutubeImmersion'),
        scanImages: get('shortcuts.scanImages'),
        gradeNothing: get('shortcuts.gradeNothing'),
        gradeSomething: get('shortcuts.gradeSomething'),
        gradeHard: get('shortcuts.gradeHard'),
        gradeOkay: get('shortcuts.gradeOkay'),
        gradeEasy: get('shortcuts.gradeEasy'),
        gradeFail: get('shortcuts.gradeFail'),
        gradePass: get('shortcuts.gradePass'),
    };
}

function readNumber(value: string, fallback: number): number {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function readOption<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? value as T : fallback;
}

function readDictionaryPreferences(data: FormData, current: DictionaryPreference[]): DictionaryPreference[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('dictionaryPreferenceCount')) || 0);
    if (!count) return current;

    return Array.from({ length: count }, (_, index) => ({
        name: get(`dictionaryPreferences.${index}.name`).trim(),
        alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
        enabled: data.has(`dictionaryPreferences.${index}.enabled`),
        priority: readNumber(get(`dictionaryPreferences.${index}.priority`), index),
        type: readDictionaryType(get(`dictionaryPreferences.${index}.type`)),
    }))
        .filter(item => item.name)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function readDictionaryType(value: string): DictionaryPreference['type'] {
    return value === 'kanji' || value === 'frequency' || value === 'metadata' ? value : 'terms';
}

export function readAudioSources(data: FormData): AudioSourceSetting[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('audioSourceCount')) || 0);
    const sources: AudioSourceSetting[] = [];
    const builtInTypes = new Set(DEFAULT_AUDIO_SOURCES.map(source => source.type));

    for (let index = 0; index < count; index++) {
        const source = readAudioSourceRow(data, get, index);
        if (!source || shouldSkipAudioSourceRow(source, builtInTypes)) continue;
        sources.push(source);
    }

    return sources;
}

function readAudioSourceRow(data: FormData, get: (key: string) => string, index: number): AudioSourceSetting | null {
    return normalizeAudioSource({
        type: get(`audioSources.${index}.type`),
        url: get(`audioSources.${index}.url`).trim(),
        voice: get(`audioSources.${index}.voice`).trim(),
        enabled: data.has(`audioSources.${index}.enabled`),
    });
}

function shouldSkipAudioSourceRow(source: AudioSourceSetting, builtInTypes: Set<string>): boolean {
    return !source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type);
}

export function readDictionaryLookupLinks(data: FormData): DictionaryLookupLink[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Math.min(MAX_DICTIONARY_LOOKUP_LINKS, Number(get('dictionaryLookupLinkCount')) || 0));
    const links: DictionaryLookupLink[] = [];

    for (let index = 0; index < count; index++) {
        const link = readDictionaryLookupLinkRow(data, get, index);
        if (link) links.push(link);
    }

    return normalizeDictionaryLookupLinks(links);
}

function readDictionaryLookupLinkRow(
    data: FormData,
    get: (key: string) => string,
    index: number,
): DictionaryLookupLink | null {
    const label = get(`dictionaryLookupLinks.${index}.label`).trim();
    const urlTemplate = get(`dictionaryLookupLinks.${index}.urlTemplate`).trim();
    const action = dictionaryLookupLinkAction(get(`dictionaryLookupLinks.${index}.action`));
    if (!shouldKeepDictionaryLookupLink(label, urlTemplate, action)) return null;
    return {
        id: get(`dictionaryLookupLinks.${index}.id`).trim() || `custom-${index}`,
        label: dictionaryLookupLinkLabel(label, action),
        urlTemplate: dictionaryLookupLinkUrlTemplate(urlTemplate, action),
        enabled: data.has(`dictionaryLookupLinks.${index}.enabled`),
        action,
    };
}

function dictionaryLookupLinkAction(value: string): DictionaryLookupLink['action'] {
    return value === 'copy' ? 'copy' : 'open';
}

function shouldKeepDictionaryLookupLink(label: string, urlTemplate: string, action: DictionaryLookupLink['action']): boolean {
    return Boolean(label || urlTemplate || action === 'copy');
}

function dictionaryLookupLinkLabel(label: string, action: DictionaryLookupLink['action']): string {
    return action === 'copy' && !label ? COPY_LOOKUP_LINK.label : label;
}

function dictionaryLookupLinkUrlTemplate(urlTemplate: string, action: DictionaryLookupLink['action']): string {
    return action === 'copy' ? '' : urlTemplate;
}
