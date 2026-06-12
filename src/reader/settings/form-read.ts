import { Logger } from '../app/logger';
import { COPY_LOOKUP_LINK, DEFAULT_AUDIO_SOURCES, MAX_DICTIONARY_LOOKUP_LINKS, normalizeAudioSource, normalizeDictionaryLookupLinks, normalizeOcrProvider, normalizeReaderSettings, sanitizeAccentColor } from './index';
import { normalizeAnkiFieldMappings } from './anki-field-mappings';
import { combinedApiCredentialLabel, readApiCredentialsFromFormData } from './api-credential';
import { createSettingsFormReader, type SettingsFormReader } from './form-data';
import type { AnkiFieldMappings, AudioSourceSetting, DictionaryLookupLink, DictionaryPreference, ReaderColorSource, ReaderSettings } from '../app/types';

const log = Logger.scope('SettingsForm');
export const CUSTOM_FONT_FAMILY_VALUE = '__custom_font_family__';
type FontFamilySettingName = 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily';
type SourcePriorityFormRow = readonly [string, keyof ReaderSettings, keyof ReaderSettings];
export type SelectableReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
export type ColorSourceSettingName =
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource';

export const COLOR_SOURCE_VALUES: readonly SelectableReaderColorSource[] = ['status', 'jpdb', 'anki', 'pitch', 'off'];
const COLOR_SOURCE_OPTIONS: [SelectableReaderColorSource, string][] = [
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
const ACCENT_COLOR_SETTING_NAMES = [
    'accentColor',
    'wordColorNew',
    'wordColorLearning',
    'wordColorKnown',
    'wordColorDue',
    'wordColorFailed',
    'wordColorIgnored',
    'pitchColorHeiban',
    'pitchColorAtamadaka',
    'pitchColorNakadaka',
    'pitchColorOdaka',
    'pitchColorKifuku',
    'pitchColorUnknown',
] as const satisfies readonly (keyof ReaderSettings & string)[];
type AccentColorSettingName = typeof ACCENT_COLOR_SETTING_NAMES[number];
type ShortcutSettingName = keyof ReaderSettings['shortcuts'] & string;
const COLOR_SOURCE_SETTING_NAMES = [
    'wordHighlightColorSource',
    'wordUnderlineColorSource',
    'wordTextColorSource',
    'subtitleHighlightColorSource',
    'subtitleUnderlineColorSource',
    'subtitleTextColorSource',
] as const satisfies readonly ColorSourceSettingName[];
const SHORTCUT_SETTING_NAMES = [
    'scanPage',
    'hoverLookup',
    'massReviewVisible',
    'openSettings',
    'playAudio',
    'closePopup',
    'previousLookupWord',
    'nextLookupWord',
    'previousSubtitle',
    'nextSubtitle',
    'copySubtitle',
    'toggleOcr',
    'toggleYoutubeImmersion',
    'scanImages',
    'gradeNothing',
    'gradeSomething',
    'gradeHard',
    'gradeOkay',
    'gradeEasy',
    'gradeFail',
    'gradePass',
] as const satisfies readonly ShortcutSettingName[];
const KANJI_ADDON_SOURCE_ROWS = [
    ['jpdbKanji', 'jpdbKanjiEnabled', 'jpdbKanjiPriority'],
    ['kanjiImmersionKit', 'kanjiImmersionKitEnabled', 'kanjiImmersionKitPriority'],
    ['uchisen', 'uchisenEnabled', 'uchisenPriority'],
    ['rtk', 'rtkEnabled', 'rtkPriority'],
    ['kanjivg', 'kanjivgEnabled', 'kanjivgPriority'],
    ['kanjiOrigins', 'kanjiOriginsEnabled', 'kanjiOriginsPriority'],
] as const satisfies readonly SourcePriorityFormRow[];

export function settingsColorSourceValue(settings: ReaderSettings, name: ColorSourceSettingName): SelectableReaderColorSource {
    const source = settings[name];
    return source === 'auto' ? DEFAULT_COLOR_SOURCE_VALUES[name] : source;
}

export function colorSourceOptions(settings: Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>): [SelectableReaderColorSource, string][] {
    const apiLabel = combinedApiCredentialLabel(settings);
    return COLOR_SOURCE_OPTIONS.map(([value, label]) => [
        value,
        value === 'status'
            ? `${apiLabel} + Anki status`
            : value === 'jpdb'
                ? `${apiLabel} status`
                : label,
    ]);
}

export function readFormSettings(data: FormData, current: ReaderSettings): ReaderSettings {
    const colorSource = (key: string, fallback: ReaderColorSource) =>
        readOption(String(data.get(key) ?? ''), COLOR_SOURCE_VALUES, colorSourceFallback(key, fallback));
    const reader = createSettingsFormReader(data, colorSource);
    const { get, has } = reader;
    const audioSources = readAudioSources(data);
    const furiganaMode = readOption(get('furiganaMode'), ['auto', 'all', 'difficult-kanji', 'known-status', 'hover', 'off'] as const, current.furiganaMode);
    const jpdbDefinitionsRowPresent = hasJpdbDefinitionsRow(has);
    const dictionaryPreferences = readDictionaryPreferences(data, current.dictionaryPreferences, reader);
    const kanjiDictionaryPreferences = dictionaryPreferences.filter(preference => preference.type === 'kanji');
    const apiCredentials = readApiCredentialsFromFormData(data);
    const settings: ReaderSettings = {
        ...current,
        ...apiCredentials,
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
        shortcuts: readShortcutFormSettings(reader, current),
    };
    const normalized = normalizeReaderSettings(settings);
    log.info('Read settings form data', {
        enableLogging: normalized.enableLogging,
        dictionaries: normalized.dictionaryPreferences.length,
        lookupLinks: normalized.dictionaryLookupLinks.length,
        audioSources: normalized.audioSources.length,
        ocrEnabled: normalized.ocrEnabled,
        subtitlePlayerEnabled: normalized.subtitlePlayerEnabled,
        ankiEnabled: normalized.ankiEnabled,
    });
    return normalized;
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
    const { has, clamped } = reader;
    const jpdbPageEnhancementsEnabled = has('jpdbPageEnhancementsEnabled');
    return {
        jpdbDefinitionsEnabled: definitionsRowPresent ? has('jpdbDefinitions.enabled') : has('jpdbDefinitionsEnabled'),
        jpdbDefinitionsPriority: clamped('jpdbDefinitions.priority', 0, 999, current.jpdbDefinitionsPriority),
        jpdbPageEnhancementsEnabled,
        jpdbPageWordEnhancementsEnabled: jpdbPageEnhancementsEnabled && has('jpdbPageWordEnhancementsEnabled'),
        jpdbPageKanjiEnhancementsEnabled: jpdbPageEnhancementsEnabled && has('jpdbPageKanjiEnhancementsEnabled'),
    };
}

function readKanjiAddonFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, clamped } = reader;
    return {
        ...readSourcePriorityRows(reader, current, KANJI_ADDON_SOURCE_ROWS),
        kanjiOriginKanjiMapEnabled: has('kanjiOriginKanjiMapEnabled'),
        kanjiOriginGraphEnabled: has('kanjiOriginGraphEnabled'),
        kanjiOriginRadicalImagesEnabled: has('kanjiOriginRadicalImagesEnabled'),
        similarKanjiWords: has('similarKanjiWords.enabled'),
        similarKanjiWordsPriority: clamped('similarKanjiWords.priority', 0, 999, current.similarKanjiWordsPriority),
        similarKanjiWordLimit: clamped('similarKanjiWordLimit', 2, 24, current.similarKanjiWordLimit),
    };
}

function readSourcePriorityRows(
    reader: SettingsFormReader,
    current: ReaderSettings,
    rows: readonly SourcePriorityFormRow[],
): Partial<ReaderSettings> {
    const settings: Partial<ReaderSettings> = {};
    const out = settings as Record<string, unknown>;
    for (const [rowName, enabledKey, priorityKey] of rows) {
        out[enabledKey] = reader.has(`${rowName}.enabled`);
        out[priorityKey] = reader.clamped(`${rowName}.priority`, 0, 999, Number(current[priorityKey]));
    }
    return settings;
}

function readAudioFormSettings(reader: SettingsFormReader, current: ReaderSettings, audioSources: AudioSourceSetting[]): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
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
        audioTimeoutMs: clamped('audioTimeoutMs', 1000, 30000, current.audioTimeoutMs),
        audioSelectionMode: readOption(get('audioSelectionMode'), ['first', 'random'] as const, current.audioSelectionMode),
        audioTtsMode: readOption(get('audioTtsMode'), ['fallback', 'source-order'] as const, current.audioTtsMode),
    };
}

function readColorFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    return {
        ...readAccentColorSettings(reader, current),
        ...readColorSourceSettings(reader, current),
    };
}

function readAccentColorSettings(reader: SettingsFormReader, current: ReaderSettings): Pick<ReaderSettings, AccentColorSettingName> {
    const settings = {} as Pick<ReaderSettings, AccentColorSettingName>;
    ACCENT_COLOR_SETTING_NAMES.forEach(name => {
        settings[name] = sanitizeAccentColor(reader.get(name), current[name]);
    });
    return settings;
}

function readColorSourceSettings(reader: SettingsFormReader, current: ReaderSettings): Pick<ReaderSettings, ColorSourceSettingName> {
    const settings = {} as Pick<ReaderSettings, ColorSourceSettingName>;
    COLOR_SOURCE_SETTING_NAMES.forEach(name => {
        settings[name] = reader.colorSource(name, current[name]);
    });
    return settings;
}

function readLookupBehaviorFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, clamped } = reader;
    return {
        parseSelection: has('parseSelection'),
        lookupOnClick: has('lookupOnClick'),
        lookupOnHover: has('lookupOnHover'),
        lookupOnMiddleMouse: has('lookupOnMiddleMouse'),
        hoverOpenDelayMs: clamped('hoverOpenDelayMs', 0, 1500, current.hoverOpenDelayMs),
        hoverCloseDelayMs: clamped('hoverCloseDelayMs', 0, 3000, current.hoverCloseDelayMs),
        popupActivationMode: current.popupActivationMode,
        scanModifierKey: current.scanModifierKey,
        showFloatingButton: has('showFloatingButton'),
    };
}

function readNewTabFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    return {
        // UT-74: no form control anymore (userscripts can't override the
        // browser new tab) — preserve the stored value instead of wiping it.
        newTabEnabled: current.newTabEnabled,
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
        newTabOfflineLimit: clamped('newTabOfflineLimit', 0, 500, current.newTabOfflineLimit),
        newTabDailyGoalMinutes: clamped('newTabDailyGoalMinutes', 0, 1440, current.newTabDailyGoalMinutes),
        newTabKanjiUnlockEnabled: has('newTabKanjiUnlockEnabled'),
        newTabStopAtBatchEnd: has('newTabStopAtBatchEnd'),
        newTabSwipeReviews: has('newTabSwipeReviews'),
        newTabKanjiAutogradeEnabled: has('newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: has('newTabKanjiAutoSubmit'),
    };
}

function readReadingDisplayFormSettings(
    reader: SettingsFormReader,
    furiganaMode: ReaderSettings['furiganaMode'],
): Partial<ReaderSettings> {
    const { has } = reader;
    const { get } = reader;
    return {
        showFurigana: furiganaMode !== 'off',
        furiganaMode,
        furiganaHiddenStateGroups: (['new', 'learning', 'known', 'due', 'failed'] as const).filter(group => has(`furiganaHide-${group}`)),
        wordColorStates: readOption(get('wordColorStates'), ['all', 'new-only'] as const, 'all'),
        showPitchAccent: has('showPitchAccent'),
        suppressRedundantWordUi: has('suppressRedundantWordUi'),
        sheetCloseButtonOnLeft: has('sheetCloseButtonOnLeft'),
        hideKnownFurigana: furiganaMode === 'known-status',
    };
}

function readLocalDictionaryFormSettings(reader: SettingsFormReader, current: ReaderSettings, kanjiPreferences: DictionaryPreference[]): Partial<ReaderSettings> {
    const { has, clamped } = reader;
    return {
        localDictionariesEnabled: has('localDictionariesEnabled'),
        localDictionaryShowKanji: has('kanjiDictionaries.enabled') || kanjiPreferences.some(preference => preference.enabled),
        kanjiDictionariesPriority: clamped('kanjiDictionaries.priority', 0, 999, current.kanjiDictionariesPriority),
        dictionarySourcesInitiallyExpanded: has('dictionarySourcesInitiallyExpanded'),
        localDictionaryMaxResults: clamped('localDictionaryMaxResults', 1, 64, current.localDictionaryMaxResults),
    };
}

function readAnkiFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has } = reader;
    const ankiEnabled = has('ankiEnabled');
    return {
        ankiEnabled,
        ...readAnkiSectionFormSettings(reader, current, ankiEnabled),
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

function readAnkiSectionFormSettings(
    reader: SettingsFormReader,
    current: ReaderSettings,
    ankiEnabled: boolean,
): Pick<ReaderSettings, 'ankiSectionEnabled' | 'ankiSectionPriority'> {
    if (!ankiSectionRowPresent(reader)) {
        return {
            ankiSectionEnabled: current.ankiSectionEnabled,
            ankiSectionPriority: current.ankiSectionPriority,
        };
    }
    return {
        ankiSectionEnabled: reader.has('ankiSection.enabled') || shouldAutoEnableAnkiSection(ankiEnabled, current),
        ankiSectionPriority: reader.clamped('ankiSection.priority', 0, 999, current.ankiSectionPriority),
    };
}

function ankiSectionRowPresent(reader: SettingsFormReader): boolean {
    return formReaderValuePresent(reader, 'ankiSection.name')
        || formReaderValuePresent(reader, 'ankiSection.priority')
        || reader.has('ankiSection.enabled');
}

function formReaderValuePresent(reader: SettingsFormReader, name: string): boolean {
    return Boolean(reader.get(name));
}

function shouldAutoEnableAnkiSection(ankiEnabled: boolean, current: ReaderSettings): boolean {
    return ankiEnabled && !current.ankiEnabled && !current.ankiSectionEnabled;
}

function readAnkiFieldMappings(value: string, fallback: AnkiFieldMappings): AnkiFieldMappings {
    if (!value.trim()) return fallback;
    try {
        const parsed = JSON.parse(value) as unknown;
        return normalizeAnkiFieldMappings(parsed);
    } catch {
        return fallback;
    }
}

function readStudyToolFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { has, clamped } = reader;
    return {
        studyTranslationEnabled: has('studyTranslation.enabled'),
        studyTranslationPriority: clamped('studyTranslation.priority', 0, 999, current.studyTranslationPriority),
        studyGrammarEnabled: has('studyGrammar.enabled'),
        studyGrammarPriority: clamped('studyGrammar.priority', 0, 999, current.studyGrammarPriority),
    };
}

function readPopupFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    const popupMode = readOption(get('popupMode'), ['auto', 'sheet', 'popover'] as const, current.popupMode);
    return {
        theme: readOption(get('theme'), ['auto', 'dark', 'light'] as const, current.theme),
        popupMode,
        stickyBottomSheet: has('stickyBottomSheet'),
        popoverBackdropEnabled: has('popoverBackdropEnabled'),
        popoverWidth: clamped('popoverWidth', 280, 900, current.popoverWidth),
        popoverHeight: clamped('popoverHeight', 220, 900, current.popoverHeight),
        popoverHeightMode: readOption(get('popoverHeightMode'), ['available', 'fixed'] as const, current.popoverHeightMode),
        readerFontFamily: readFontFamilySetting(reader, 'readerFontFamily', current.readerFontFamily),
        popupFontFamily: readFontFamilySetting(reader, 'popupFontFamily', current.popupFontFamily),
        popupFontWeight: clamped('popupFontWeight', 300, 900, current.popupFontWeight),
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
        autoMineOnReview: has('autoMineOnReview'),
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
    };
}

function readOcrFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    return {
        ocrEnabled: has('ocrEnabled'),
        ocrAutoScanImages: formReaderValuePresent(reader, 'ocrAutoScanImages') ? has('ocrAutoScanImages') : current.ocrAutoScanImages,
        ocrShowTextOverlay: has('ocrShowTextOverlay'),
        ocrProvider: normalizeOcrProvider(get('ocrProvider')),
        ocrEndpointUrl: get('ocrEndpointUrl').trim(),
        ocrEngine: get('ocrEngine').trim() || 'auto',
        ocrCloudVisionApiKey: get('ocrCloudVisionApiKey').trim(),
        ocrLanguage: get('ocrLanguage').trim() || 'ja-JP',
        ocrMaxImagePixels: clamped('ocrMaxImagePixels', 160000, 2800000, current.ocrMaxImagePixels),
        ocrMinImageArea: clamped('ocrMinImageArea', 10000, 800000, current.ocrMinImageArea),
        ocrMaxImagesPerPage: clamped('ocrMaxImagesPerPage', 1, 30, current.ocrMaxImagesPerPage),
        ocrPrefetchMargin: clamped('ocrPrefetchMargin', 0, 3000, current.ocrPrefetchMargin),
        ocrTextColor: sanitizeAccentColor(get('ocrTextColor'), current.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(get('ocrOutlineColor'), current.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(get('ocrBackgroundColor'), current.ocrBackgroundColor),
        ocrBackgroundOpacity: clamped('ocrBackgroundOpacity', 0, 1, current.ocrBackgroundOpacity),
        ocrFontScale: clamped('ocrFontScale', 0.7, 1.8, current.ocrFontScale),
    };
}

function readSubtitleFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
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
        subtitleFontSize: clamped('subtitleFontSize', 16, 64, current.subtitleFontSize),
        subtitleBottomOffset: clamped('subtitleBottomOffset', 2, 40, current.subtitleBottomOffset),
        subtitleTextColor: sanitizeAccentColor(get('subtitleTextColor'), current.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(get('subtitleOutlineColor'), current.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(get('subtitleBackgroundColor'), current.subtitleBackgroundColor),
        subtitleBackgroundOpacity: clamped('subtitleBackgroundOpacity', 0, 1, current.subtitleBackgroundOpacity),
        subtitleFontFamily: readFontFamilySetting(reader, 'subtitleFontFamily', current.subtitleFontFamily),
        subtitleFontWeight: clamped('subtitleFontWeight', 100, 900, current.subtitleFontWeight),
        subtitleMiningPause: has('subtitleMiningPause'),
        subtitleSeekPadding: clamped('subtitleSeekPadding', -2, 2, current.subtitleSeekPadding),
    };
}

function readImmersionKitFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    const mediaEnabled = has('immersionKitEnabled');
    const sourceRowPresent = Boolean(get('immersionKit.name') || get('immersionKit.priority'));
    const sourceEnabled = sourceRowPresent ? has('immersionKit.enabled') : true;
    return {
        immersionKitEnabled: mediaEnabled && sourceEnabled,
        immersionKitExampleSource: readOption(get('immersionKitExampleSource'), ['immersion-kit', 'nadeshiko', 'combined'] as const, current.immersionKitExampleSource),
        nadeshikoApiKey: get('nadeshikoApiKey').trim(),
        immersionKitPriority: clamped('immersionKit.priority', 0, 999, current.immersionKitPriority),
        immersionKitLimitEnabled: get('immersionKitLimitEnabled') === 'on',
        immersionKitLimit: clamped('immersionKitLimit', 1, 12, current.immersionKitLimit),
        immersionKitMinLength: clamped('immersionKitMinLength', 0, 120, current.immersionKitMinLength),
        immersionKitMaxLength: clamped('immersionKitMaxLength', 0, 240, current.immersionKitMaxLength),
        immersionKitCategory: readOption(get('immersionKitCategory'), ['all', 'anime', 'drama', 'games'] as const, current.immersionKitCategory),
        immersionKitSort: readOption(get('immersionKitSort'), ['sentence_length:asc', 'sentence_length:desc'] as const, current.immersionKitSort),
        immersionKitExactMatch: has('immersionKitExactMatch'),
        immersionKitShowTranslation: has('immersionKitShowTranslation'),
        immersionKitRevealTranslationOnClick: has('immersionKitShowTranslation') && has('immersionKitRevealTranslationOnClick'),
        immersionKitShowImages: has('immersionKitShowImages'),
        immersionKitAutoPlayAudio: has('immersionKitAutoPlayAudio'),
        immersionKitPlayOnHover: has('immersionKitPlayOnHover'),
        immersionKitPlayOnImageClick: has('immersionKitPlayOnImageClick'),
        immersionKitPlaybackRate: clamped('immersionKitPlaybackRate', 0.5, 2, current.immersionKitPlaybackRate),
    };
}

function readYoutubeFormSettings(reader: SettingsFormReader): Partial<ReaderSettings> {
    const { has } = reader;
    return {
        youtubeImmersionEnabled: has('youtubeImmersionEnabled'),
        preferJapaneseSiteLanguage: has('preferJapaneseSiteLanguage'),
        youtubeShowChannelRecommendations: has('youtubeShowChannelRecommendations'),
        youtubeShowFilterNotice: has('youtubeShowFilterNotice'),
    };
}

function readShortcutFormSettings(reader: SettingsFormReader, current: ReaderSettings): ReaderSettings['shortcuts'] {
    return Object.fromEntries(SHORTCUT_SETTING_NAMES.map(name => {
        const key = `shortcuts.${name}`;
        return [name, reader.has(key) ? reader.get(key) : current.shortcuts[name]];
    })) as ReaderSettings['shortcuts'];
}

export function readOption<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? value as T : fallback;
}

function readDictionaryPreferences(data: FormData, current: DictionaryPreference[], reader: SettingsFormReader): DictionaryPreference[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('dictionaryPreferenceCount')) || 0);
    if (!count) return current;

    return Array.from({ length: count }, (_, index) => ({
        name: get(`dictionaryPreferences.${index}.name`).trim(),
        alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
        enabled: data.has(`dictionaryPreferences.${index}.enabled`),
        priority: reader.number(`dictionaryPreferences.${index}.priority`, index),
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
