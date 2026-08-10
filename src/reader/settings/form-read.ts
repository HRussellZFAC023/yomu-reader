import { COPY_LOOKUP_LINK, DEFAULT_AUDIO_SOURCES, DEFAULT_SETTINGS, dictionaryLookupLinksForTarget, MAX_LOOKUP_LINK_ROWS, normalizeAudioSource, normalizeDictionaryLookupLinks, normalizeOcrProvider, normalizeReaderSettings, sanitizeAccentColor } from './index';
import { normalizeAnkiFieldMappings } from './anki-field-mappings';
import { readApiCredentialsFromFormData } from './api-credential';
import { createSettingsFormReader, type SettingsFormReader } from './form-data';
import { FURIGANA_HIDE_STATE_GROUPS, WORD_COLOR_HIDE_STATE_GROUPS } from '../app/constants';
import type { AnkiFieldMappings, AudioSourceSetting, DictionaryLookupLink, DictionaryPreference, NewTabStudyChallengeStep, ReaderColorSource, ReaderSettings } from '../app/types';
import { ocrInteractionModeFromSettings } from '../ocr/mode';
import {
    applyNativeSubtitleDisplayMode,
    nativeSubtitleDisplayMode,
    NATIVE_SUBTITLE_DISPLAY_MODES,
} from '../subtitles/native-subtitle-display';
import {
    activateLanguageProfileForOutputLanguage,
    activeLanguageProfile,
    canonicalTagForLearningTarget,
    canonicalTagForSlice1Language,
    isLearningTargetRosterId,
    learningTargetRosterIdForTag,
    slice1LanguageIdForTag,
    type LearningTargetRosterId,
} from '../languages';
import { availableInterfaceLocales, isLearnerLanguageId, type LearnerLanguageId } from '../locales';
import { readingAnnotationModeForTarget } from './reading-annotation-mode';


/**
 * D43 — what may be STORED as the interface language is exactly what the locale
 * manifest says is available, plus `auto`.
 *
 * The picker already renders a blocked locale as a disabled option, but
 * `disabled` only stops a *user* from choosing it: assigning `select.value` in
 * script, a hand-edited settings export, or a profile written by a build with a
 * different ledger all reach this function with a tag we cannot speak. Any of
 * those falls back to the value already in effect, so the one outcome D43
 * forbids — a locale accepted and then silently answered in English — cannot
 * happen through the settings form.
 *
 * `tests/reader/locales/rtl-interim.test.ts` pins this list to `auto/en/ja`, so
 * enabling a locale in the ledger without widening `InterfaceLanguage` fails
 * loudly instead of storing a value the type says is impossible.
 */
export const SELECTABLE_INTERFACE_LANGUAGES = Object.freeze([
    'auto',
    ...availableInterfaceLocales().map(locale => locale.tag),
]) as readonly ReaderSettings['interfaceLanguage'][];
export const CUSTOM_FONT_FAMILY_VALUE = '__custom_font_family__';
type FontFamilySettingName = 'readerFontFamily' | 'popupFontFamily' | 'subtitleFontFamily';
type SourcePriorityFormRow = readonly [string, keyof ReaderSettings, keyof ReaderSettings, (keyof ReaderSettings)?];
export type SelectableReaderColorSource = Exclude<ReaderColorSource, 'auto'>;
export type ColorSourceSettingName =
    | 'wordHighlightColorSource'
    | 'wordUnderlineColorSource'
    | 'wordTextColorSource'
    | 'subtitleHighlightColorSource'
    | 'subtitleUnderlineColorSource'
    | 'subtitleTextColorSource';

export const COLOR_SOURCE_VALUES: readonly SelectableReaderColorSource[] = ['status', 'jpdb', 'anki', 'pitch', 'off'];
type PageScanMode = 'off' | 'auto' | 'manual';
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
    'toggleSubtitleOverlay',
    'toggleYoutubeImmersion',
    'scanImages',
    'studyReveal',
    'studyRevealAlternate',
    'studyUndo',
    'studyPrevious',
    'studyPreviousAlternate',
    'studyNext',
    'studyNextAlternate',
    'gradeNothing',
    'gradeSomething',
    'gradeHard',
    'gradeOkay',
    'gradeEasy',
    'gradeFail',
    'gradePass',
] as const satisfies readonly ShortcutSettingName[];
const KANJI_ADDON_SOURCE_ROWS = [
    ['jpdbKanji', 'jpdbKanjiEnabled', 'jpdbKanjiPriority', 'jpdbKanjiAlias'],
    ['kanjiImmersionKit', 'kanjiImmersionKitEnabled', 'kanjiImmersionKitPriority', 'kanjiImmersionKitAlias'],
    ['uchisen', 'uchisenEnabled', 'uchisenPriority', 'uchisenAlias'],
    ['wanikaniKanji', 'wanikaniKanjiEnabled', 'wanikaniKanjiPriority', 'wanikaniKanjiAlias'],
    ['rtk', 'rtkEnabled', 'rtkPriority', 'rtkAlias'],
    ['kanjivg', 'kanjivgEnabled', 'kanjivgPriority', 'kanjivgAlias'],
    ['kanjiOrigins', 'kanjiOriginsEnabled', 'kanjiOriginsPriority', 'kanjiOriginsAlias'],
] as const satisfies readonly SourcePriorityFormRow[];
const NEW_TAB_STUDY_CHALLENGE_STEPS = [
    'kanji-doodle',
    'word',
    'recall-cloze',
    'listen-pitch',
    'speaking',
    'type-word',
] as const satisfies readonly NewTabStudyChallengeStep[];

export function settingsColorSourceValue(settings: ReaderSettings, name: ColorSourceSettingName): SelectableReaderColorSource {
    const source = settings[name];
    return source === 'auto' ? DEFAULT_COLOR_SOURCE_VALUES[name] : source;
}

export function readFormSettings(data: FormData, current: ReaderSettings): ReaderSettings {
    const colorSource = (key: string, fallback: ReaderColorSource) =>
        readOption(String(data.get(key) ?? ''), COLOR_SOURCE_VALUES, colorSourceFallback(key, fallback));
    const reader = createSettingsFormReader(data, colorSource);
    const { get, has } = reader;
    const audioSources = readAudioSources(data);
    const furiganaMode = readOption(get('furiganaMode'), ['all', 'difficult-kanji', 'known-status', 'hover', 'off'] as const, current.furiganaMode === 'auto' ? DEFAULT_SETTINGS.furiganaMode : current.furiganaMode);
    const apiDefinitionRowsPresent = {
        jpdb: hasSourceRow(has, 'jpdbDefinitions'),
        jiten: hasSourceRow(has, 'jitenDefinitions'),
        bunpro: hasSourceRow(has, 'bunproDefinitions'),
        wanikani: hasSourceRow(has, 'wanikaniDefinitions'),
    };
    const dictionaryLookupLinks = readTargetAwareDictionaryLookupLinks(data, current);
    const dictionaryPreferences = reorderLocalFrequencyDictionaryPreferences(
        readDictionaryPreferences(data, current.dictionaryPreferences, reader),
        dictionaryLookupLinks,
    );
    const kanjiDictionaryPreferences = dictionaryPreferences.filter(preference => preference.type === 'kanji');
    const apiCredentials = readApiCredentialsFromFormData(data);
    const interfaceLanguage = readOption(
        get('interfaceLanguage'),
        SELECTABLE_INTERFACE_LANGUAGES,
        current.interfaceLanguage,
    );
    const settings: ReaderSettings = {
        ...current,
        ...apiCredentials,
        // The deprecated key is no longer shown because Bunpro's full Yomu
        // integration uses only the frontend token. Preserve an older saved
        // value so opening Settings does not silently destroy user data.
        bunproApiKey: apiCredentials.bunproApiKey || current.bunproApiKey,
        interfaceLanguage,
        ...readLanguageProfileFormSettings(
            data,
            current,
            interfaceLanguage,
            dictionaryPreferences,
        ),
        ...readApiDefinitionFormSettings(reader, current, apiDefinitionRowsPresent),
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
        dictionaryLookupLinks,
        ...readSubtitleFormSettings(reader, current),
        ...readYoutubeFormSettings(reader, current),
        ...readAnkiFormSettings(reader, current),
        ...readStudyToolFormSettings(reader, current),
        enableLogging: has('enableLogging'),
        ...readPopupFormSettings(reader, current),
        ...readMiningFormSettings(reader, current),
        shortcuts: readShortcutFormSettings(reader, current),
    };
    preserveDetachedJapaneseSettings(settings, current, data);
    enforceTargetReadingAnnotationMode(settings);
    return normalizeReaderSettings(settings);
}

function readLanguageProfileFormSettings(
    data: FormData,
    current: ReaderSettings,
    interfaceLanguage: ReaderSettings['interfaceLanguage'],
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
): Pick<ReaderSettings, 'languageProfiles' | 'activeLanguageProfileId'> {
    const active = activeLanguageProfile(current.languageProfiles, current.activeLanguageProfileId);
    if (!active) {
        return {
            languageProfiles: current.languageProfiles,
            activeLanguageProfileId: current.activeLanguageProfileId,
        };
    }

    // OUTPUT axis. The control is still named `learnerLanguage` in the form,
    // because a form field name is part of the rendered contract the dialog
    // controller and its tests already speak; the persisted axis is
    // `outputLanguage`.
    const fallbackOutputLanguage = slice1LanguageIdForTag(active.outputLanguage) ?? 'en';
    const outputLanguage = readOutputLanguage(data, fallbackOutputLanguage);
    const outputLanguageTag = outputLanguage === fallbackOutputLanguage
        ? active.outputLanguage
        : canonicalTagForSlice1Language(outputLanguage);
    const fallbackTargetLanguage = learningTargetRosterIdForTag(active.targetLanguage) ?? 'ja';
    const targetLanguageId = readTargetLanguage(data, fallbackTargetLanguage);
    const targetLanguage = canonicalTagForLearningTarget(targetLanguageId);
    const parserProvider = readOption(
        String(data.get('parserProvider') ?? ''),
        ['local', 'jiten', 'jpdb', 'auto'] as const,
        current.parserProvider,
    );
    const definitionTranslationProviderIds = data.has('definitionTranslationControlsPresent')
        ? normalizedStringIds(data.getAll('definitionTranslationProviderIds'))
        : [...active.definitionTranslationProviderIds];
    const dictionaries = languageProfileDictionariesFromPreferences(dictionaryPreferences);

    if (outputLanguage !== fallbackOutputLanguage) {
        const activated = activateLanguageProfileForOutputLanguage(
            current.languageProfiles,
            current.activeLanguageProfileId,
            outputLanguageTag,
            {
                uiLocale: interfaceLanguage,
                parserProvider,
                targetLanguage,
                dictionaries,
                definitionTranslationProviderIds,
            },
        );
        return {
            languageProfiles: activated.profiles,
            activeLanguageProfileId: activated.activeProfileId,
        };
    }

    return {
        languageProfiles: current.languageProfiles.map(profile => profile.id === active.id
            ? {
                ...profile,
                // Keep an existing supported script/region variant when the
                // roster selection did not change (zh-Hant-TW, pt-BR, ko-KR).
                outputLanguage: outputLanguageTag,
                learnerLanguage: outputLanguageTag,
                targetLanguage,
                uiLocale: interfaceLanguage,
                parserProvider,
                dictionaries,
                definitionTranslationProviderIds,
            }
            : profile),
        activeLanguageProfileId: active.id,
    };
}

function languageProfileDictionariesFromPreferences(
    preferences: ReaderSettings['dictionaryPreferences'],
): ReaderSettings['languageProfiles'][number]['dictionaries'] {
    const ordered = [...preferences].sort((left, right) => left.priority - right.priority);
    return {
        installed: ordered.map(preference => preference.name),
        enabled: ordered.filter(preference => preference.enabled).map(preference => preference.name),
        order: ordered.map(preference => preference.name),
    };
}

function readOutputLanguage(data: FormData, fallback: LearnerLanguageId): LearnerLanguageId {
    const value = String(data.get('learnerLanguage') ?? '');
    return isLearnerLanguageId(value) ? value : fallback;
}

function readTargetLanguage(data: FormData, fallback: LearningTargetRosterId): LearningTargetRosterId {
    const value = String(data.get('targetLanguage') ?? '');
    return isLearningTargetRosterId(value) ? value : fallback;
}

function preserveDetachedJapaneseSettings(
    settings: ReaderSettings,
    current: ReaderSettings,
    data: FormData,
): void {
    if (!data.has('furiganaMode')) {
        settings.furiganaMode = current.furiganaMode;
        settings.clampedRowReadings = current.clampedRowReadings;
        settings.furiganaHiddenStateGroups = [...current.furiganaHiddenStateGroups];
    }
    if (!data.has('showPitchAccent')) settings.showPitchAccent = current.showPitchAccent;
    if (!data.has('pitchColorHeiban')) {
        settings.pitchColorHeiban = current.pitchColorHeiban;
        settings.pitchColorAtamadaka = current.pitchColorAtamadaka;
        settings.pitchColorNakadaka = current.pitchColorNakadaka;
        settings.pitchColorOdaka = current.pitchColorOdaka;
        settings.pitchColorUnknown = current.pitchColorUnknown;
    }
    // Pitch remains a Japanese-only colour channel. Its <option> is physically
    // detached for another target, so the browser selects the first remaining
    // option; keep the stored Japanese choice until that option exists again.
    if (readTargetLanguage(data, 'ja') !== 'ja') {
        for (const name of COLOR_SOURCE_SETTING_NAMES) {
            if (current[name] === 'pitch') settings[name] = current[name];
        }
    }
}

function enforceTargetReadingAnnotationMode(settings: ReaderSettings): void {
    const active = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const targetLanguage = learningTargetRosterIdForTag(active?.targetLanguage) ?? 'ja';
    const mode = readingAnnotationModeForTarget(settings.furiganaMode, targetLanguage);
    if (mode === settings.furiganaMode) return;
    settings.furiganaMode = mode;
    settings.showFurigana = mode !== 'off';
    settings.hideKnownFurigana = mode === 'known-status';
}

function normalizedStringIds(values: FormDataEntryValue[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach(value => {
        if (typeof value !== 'string') return;
        const id = value.trim();
        if (!id || id.length > 160 || seen.has(id)) return;
        seen.add(id);
        result.push(id);
    });
    return result;
}

function colorSourceFallback(key: string, fallback: ReaderColorSource): SelectableReaderColorSource {
    if (fallback !== 'auto') return fallback;
    return isColorSourceSettingName(key) ? DEFAULT_COLOR_SOURCE_VALUES[key] : 'jpdb';
}

function isColorSourceSettingName(value: string): value is ColorSourceSettingName {
    return Object.prototype.hasOwnProperty.call(DEFAULT_COLOR_SOURCE_VALUES, value);
}

function hasSourceRow(has: (key: string) => boolean, prefix: string): boolean {
    return has(`${prefix}.name`) || has(`${prefix}.priority`) || has(`${prefix}.enabled`);
}

function readApiDefinitionFormSettings(
    reader: SettingsFormReader,
    current: ReaderSettings,
    rowsPresent: { jpdb: boolean; jiten: boolean; bunpro: boolean; wanikani: boolean },
): Partial<ReaderSettings> {
    const { has, clamped } = reader;
    const jpdbPageEnhancementsEnabled = has('jpdbPageEnhancementsEnabled');
    return {
        jpdbDefinitionsEnabled: rowsPresent.jpdb ? has('jpdbDefinitions.enabled') : current.jpdbDefinitionsEnabled,
        jpdbDefinitionsAlias: readSourceAlias(reader, 'jpdbDefinitions', current.jpdbDefinitionsAlias),
        jpdbDefinitionsPriority: clamped('jpdbDefinitions.priority', 0, 999, current.jpdbDefinitionsPriority),
        jitenDefinitionsEnabled: rowsPresent.jiten ? has('jitenDefinitions.enabled') : current.jitenDefinitionsEnabled,
        jitenDefinitionsAlias: readSourceAlias(reader, 'jitenDefinitions', current.jitenDefinitionsAlias),
        jitenDefinitionsPriority: clamped('jitenDefinitions.priority', 0, 999, current.jitenDefinitionsPriority),
        bunproDefinitionsEnabled: rowsPresent.bunpro ? has('bunproDefinitions.enabled') : current.bunproDefinitionsEnabled,
        bunproDefinitionsAlias: readSourceAlias(reader, 'bunproDefinitions', current.bunproDefinitionsAlias),
        bunproDefinitionsPriority: clamped('bunproDefinitions.priority', 0, 999, current.bunproDefinitionsPriority),
        wanikaniDefinitionsEnabled: rowsPresent.wanikani ? has('wanikaniDefinitions.enabled') : current.wanikaniDefinitionsEnabled,
        wanikaniDefinitionsAlias: readSourceAlias(reader, 'wanikaniDefinitions', current.wanikaniDefinitionsAlias),
        wanikaniDefinitionsPriority: clamped('wanikaniDefinitions.priority', 0, 999, current.wanikaniDefinitionsPriority),
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
    for (const [rowName, enabledKey, priorityKey, aliasKey] of rows) {
        out[enabledKey] = reader.has(`${rowName}.enabled`);
        out[priorityKey] = reader.clamped(`${rowName}.priority`, 0, 999, Number(current[priorityKey]));
        if (aliasKey) out[aliasKey] = readSourceAlias(reader, rowName, String(current[aliasKey] ?? ''));
    }
    return settings;
}

function readSourceAlias(reader: SettingsFormReader, prefix: string, current: string): string {
    const key = `${prefix}.alias`;
    return reader.has(key) ? reader.get(key).trim() : current;
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
    const { get, has, clamped } = reader;
    const pageScanMode = readOption(get('pageScanMode'), ['off', 'auto', 'manual'] as const, pageScanModeFromSettings(current));
    return {
        lookupOnClick: has('lookupOnClick'),
        lookupOnHover: has('lookupOnHover'),
        lookupOnMiddleMouse: has('lookupOnMiddleMouse'),
        hoverOpenDelayMs: clamped('hoverOpenDelayMs', 0, 1500, current.hoverOpenDelayMs),
        hoverCloseDelayMs: clamped('hoverCloseDelayMs', 0, 3000, current.hoverCloseDelayMs),
        popupActivationMode: has('popupLookupEnabled')
            ? current.popupActivationMode === 'off' ? DEFAULT_SETTINGS.popupActivationMode : current.popupActivationMode
            : 'off',
        scanModifierKey: current.scanModifierKey,
        showFloatingButton: has('showFloatingButton'),
        annotationsPaused: pageScanMode === 'off',
        manualScanEnabled: pageScanMode === 'manual',
    };
}

function pageScanModeFromSettings(settings: ReaderSettings): PageScanMode {
    if (settings.annotationsPaused) return 'off';
    return settings.manualScanEnabled ? 'manual' : 'auto';
}

function readNewTabFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    return {
        // Kept in storage for backwards compatibility with older extension
        // builds. The main extension no longer declares a new-tab override, so
        // Settings must preserve rather than expose or mutate this legacy flag.
        newTabEnabled: current.newTabEnabled,
        newTabAnkiEnabled: has('newTabAnkiEnabled'),
        newTabAnkiDisabledDecks: get('newTabAnkiDisabledDecks').split(',').map(deck => deck.trim()).filter(Boolean),
        newTabSource: readOption(get('newTabSource'), ['auto', 'jpdb', 'bunpro', 'wanikani', 'yomu-local', 'anki', 'dictionary'] as const, current.newTabSource),
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
        newTabShortcutHintsEnabled: has('newTabShortcutHintsEnabled'),
        newTabKanjiAutogradeEnabled: has('newTabKanjiAutogradeEnabled'),
        newTabKanjiAutoSubmit: has('newTabKanjiAutoSubmit'),
        newTabStudyStepOrder: readNewTabStudyStepOrder(reader, current),
        newTabStudyDisabledSteps: readNewTabStudyDisabledSteps(reader, current),
        newTabStudyTourSeen: get('newTabStudyTourSeen') === 'true',
    };
}

function readNewTabStudyStepOrder(reader: SettingsFormReader, current: ReaderSettings): NewTabStudyChallengeStep[] {
    const ordered = reader.getAll('newTabStudyStepOrder')
        .filter(isNewTabStudyChallengeStep);
    return ordered.length ? ordered : current.newTabStudyStepOrder;
}

function readNewTabStudyDisabledSteps(reader: SettingsFormReader, current: ReaderSettings): NewTabStudyChallengeStep[] {
    const ordered = readNewTabStudyStepOrder(reader, current);
    const enabled = new Set(reader.getAll('newTabStudyEnabledStep').filter(isNewTabStudyChallengeStep));
    return ordered.filter(step => !enabled.has(step));
}

function isNewTabStudyChallengeStep(value: string): value is NewTabStudyChallengeStep {
    return (NEW_TAB_STUDY_CHALLENGE_STEPS as readonly string[]).includes(value);
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
        furiganaHiddenStateGroups: FURIGANA_HIDE_STATE_GROUPS.filter(group => has(`furiganaHide-${group}`)),
        wordColorStates: readOption(get('wordColorStates'), ['all', 'new-only'] as const, 'all'),
        clampedRowReadings: readOption(get('clampedRowReadings'), ['show', 'hover'] as const, 'show'),
        wordColorHiddenStateGroups: WORD_COLOR_HIDE_STATE_GROUPS.filter(group => has(`colorHide-${group}`)),
        showPitchAccent: has('showPitchAccent'),
        showLookupPillFrequency: has('showLookupPillFrequency'),
        suppressRedundantWordUi: has('suppressRedundantWordUi'),
        sheetCloseButtonOnLeft: has('sheetCloseButtonOnLeft'),
        hideKnownFurigana: furiganaMode === 'known-status',
    };
}

function readLocalDictionaryFormSettings(reader: SettingsFormReader, current: ReaderSettings, kanjiPreferences: DictionaryPreference[]): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    return {
        localDictionariesEnabled: has('localDictionariesEnabled'),
        parserProvider: readOption(get('parserProvider'), ['local', 'jiten', 'jpdb', 'auto'] as const, current.parserProvider),
        localDictionaryShowKanji: has('kanjiDictionaries.enabled') || kanjiPreferences.some(preference => preference.enabled),
        kanjiDictionariesAlias: readSourceAlias(reader, 'kanjiDictionaries', current.kanjiDictionariesAlias),
        kanjiDictionariesPriority: clamped('kanjiDictionaries.priority', 0, 999, current.kanjiDictionariesPriority),
        dictionarySourcesInitiallyExpanded: true,
        localDictionaryMaxResults: DEFAULT_SETTINGS.localDictionaryMaxResults,
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
): Pick<ReaderSettings, 'ankiSectionEnabled' | 'ankiSectionAlias' | 'ankiSectionPriority'> {
    if (!ankiSectionRowPresent(reader)) {
        return {
            ankiSectionEnabled: current.ankiSectionEnabled,
            ankiSectionAlias: current.ankiSectionAlias,
            ankiSectionPriority: current.ankiSectionPriority,
        };
    }
    return {
        ankiSectionEnabled: reader.has('ankiSection.enabled') || shouldAutoEnableAnkiSection(ankiEnabled, current),
        ankiSectionAlias: readSourceAlias(reader, 'ankiSection', current.ankiSectionAlias),
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
        studyTranslationAlias: readSourceAlias(reader, 'studyTranslation', current.studyTranslationAlias),
        studyTranslationPriority: clamped('studyTranslation.priority', 0, 999, current.studyTranslationPriority),
        studyGrammarEnabled: has('studyGrammar.enabled'),
        studyGrammarAlias: readSourceAlias(reader, 'studyGrammar', current.studyGrammarAlias),
        studyGrammarPriority: clamped('studyGrammar.priority', 0, 999, current.studyGrammarPriority),
    };
}

function readPopupFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    const popupMode = readOption(get('popupMode'), ['auto', 'sheet', 'popover'] as const, current.popupMode);
    return {
        theme: readOption(get('theme'), ['auto', 'dark', 'light'] as const, current.theme),
        popupMode,
        hoverPopupMode: readOption(get('hoverPopupMode'), ['auto', 'sheet', 'popover'] as const, current.hoverPopupMode),
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

function readMiningFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has } = reader;
    return {
        jpdbMiningEnabled: has('jpdbMiningEnabled'),
        bunproMiningEnabled: has('bunproMiningEnabled'),
        wanikaniReviewEnabled: has('wanikaniReviewEnabled'),
        yomuLocalSrsEnabled: has('yomuLocalSrsEnabled'),
        autoMineOnReview: has('autoMineOnReview'),
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
        apiGradingProvider: readOption(get('apiGradingProvider'), ['jiten', 'jpdb'] as const, current.apiGradingProvider === 'jpdb' ? 'jpdb' : 'jiten'),
    };
}

function readOcrFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    const ocrInteractionMode = readOption(get('ocrInteractionMode'), ['auto', 'manual', 'off'] as const, ocrInteractionModeFromSettings(current));
    return {
        ocrEnabled: ocrInteractionMode !== 'off',
        ocrAutoScanImages: ocrInteractionMode === 'auto',
        ocrShowTextOverlay: has('ocrShowTextOverlay'),
        ocrVideoPauseFrames: has('ocrVideoPauseFrames'),
        ocrInvertDarkPanels: has('ocrInvertDarkPanels'),
        ocrOverlayTheme: readOption(get('ocrOverlayTheme'), ['auto', 'dark', 'light'] as const, current.ocrOverlayTheme),
        ocrProvider: normalizeOcrProvider(get('ocrProvider')),
        ocrEndpointUrl: get('ocrEndpointUrl').trim(),
        ocrEngine: get('ocrEngine').trim() || 'auto',
        ocrCloudVisionApiKey: get('ocrCloudVisionApiKey').trim(),
        // Blank means "follow the language being studied" and has to SURVIVE
        // the round trip. Resolving it to a literal here turned the sentinel
        // into whichever target happened to be active the first time anything
        // in the dialog was saved, and the field is hidden, so nothing could
        // ever unpin it again. Read it back exactly as rendered.
        ocrLanguage: get('ocrLanguage').trim(),
        ocrMaxImagePixels: clamped('ocrMaxImagePixels', 160000, 2800000, current.ocrMaxImagePixels),
        ocrMinImageArea: clamped('ocrMinImageArea', 10000, 800000, current.ocrMinImageArea),
        ocrMaxImagesPerPage: clamped('ocrMaxImagesPerPage', 1, 30, current.ocrMaxImagesPerPage),
        ocrPrefetchMargin: clamped('ocrPrefetchMargin', 0, 3000, current.ocrPrefetchMargin),
        ocrPrefetchPages: clamped('ocrPrefetchPages', 0, 10, current.ocrPrefetchPages),
        ocrConcurrency: clamped('ocrConcurrency', 1, 8, current.ocrConcurrency),
        ocrTextColor: sanitizeAccentColor(get('ocrTextColor'), current.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(get('ocrOutlineColor'), current.ocrOutlineColor),
        ocrBackgroundOpacity: clamped('ocrBackgroundOpacity', 0, 1, current.ocrBackgroundOpacity),
        ocrFontScale: clamped('ocrFontScale', 0.7, 1.8, current.ocrFontScale),
    };
}

function readSubtitleFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has, clamped } = reader;
    const overlayVisible = has('subtitleOverlayVisible');
    const currentNativeDisplay = nativeSubtitleDisplayMode(current);
    const nativeDisplay = readOption(get('subtitleNativeDisplay'), NATIVE_SUBTITLE_DISPLAY_MODES, currentNativeDisplay);
    const nativeDisplaySettings = {
        subtitleSecondaryVisible: current.subtitleSecondaryVisible,
        subtitleSecondaryVisibleChosen: current.subtitleSecondaryVisibleChosen,
        subtitleNativeBlurred: current.subtitleNativeBlurred,
    };
    applyNativeSubtitleDisplayMode(nativeDisplaySettings, nativeDisplay, {
        markVisibilityChosen: nativeDisplay !== currentNativeDisplay,
    });
    return {
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: overlayVisible,
        ...nativeDisplaySettings,
        // Only a flip is a deliberate choice: saving the dialog after editing
        // something unrelated must not freeze an overlay the user never touched
        // out of the automatic reveal that first shows it.
        subtitleOverlayVisibleChosen: current.subtitleOverlayVisibleChosen || overlayVisible !== current.subtitleOverlayVisible,
        subtitleKaraokeMode: has('subtitleKaraokeMode'),
        subtitleTranscriptVisible: has('subtitleTranscriptVisible'),
        subtitlePausePanel: has('subtitlePausePanel'),
        subtitleShadowAutoPause: has('subtitleShadowAutoPause'),
        subtitleTranscriptPlacement: readOption(get('subtitleTranscriptPlacement'), ['right', 'left', 'bottom'] as const, current.subtitleTranscriptPlacement),
        subtitleTranscriptAutoScroll: has('subtitleTranscriptAutoScroll'),
        subtitleTranscriptAutoScrollResumeSeconds: clamped('subtitleTranscriptAutoScrollResumeSeconds', 1, 30, current.subtitleTranscriptAutoScrollResumeSeconds),
        subtitleAutoCopyLine: has('subtitleAutoCopyLine'),
        subtitleCopyIncludeTranslation: has('subtitleCopyIncludeTranslation'),
        subtitleControlsMode: readOption(get('subtitleControlsMode'), ['auto', 'always', 'hidden'] as const, current.subtitleControlsMode),
        subtitleFontSize: clamped('subtitleFontSize', 16, 64, current.subtitleFontSize),
        // The drag gesture may park the line anywhere on screen, which for a short
        // frame near the bottom of a tall viewport is far above 100% of the frame
        // height; only guard against garbage, not against legitimate positions.
        subtitleBottomOffset: clamped('subtitleBottomOffset', -200, 500, current.subtitleBottomOffset),
        subtitleTextColor: sanitizeAccentColor(get('subtitleTextColor'), current.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(get('subtitleOutlineColor'), current.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(get('subtitleBackgroundColor'), current.subtitleBackgroundColor),
        subtitleBackgroundOpacity: clamped('subtitleBackgroundOpacity', 0, 1, current.subtitleBackgroundOpacity),
        subtitleNativeBlurStrength: clamped('subtitleNativeBlurStrength', 4, 20, current.subtitleNativeBlurStrength),
        subtitleFontFamily: readFontFamilySetting(reader, 'subtitleFontFamily', current.subtitleFontFamily),
        subtitleFontWeight: clamped('subtitleFontWeight', 100, 900, current.subtitleFontWeight),
        subtitleMiningPause: has('subtitleMiningPause'),
        subtitleHoverPause: has('subtitleHoverPause'),
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
        immersionKitAlias: readSourceAlias(reader, 'immersionKit', current.immersionKitAlias),
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

function readYoutubeFormSettings(reader: SettingsFormReader, current: ReaderSettings): Partial<ReaderSettings> {
    const { get, has } = reader;
    const youtubeControlsPresent = has('youtubeImmersionSettingsPresent');
    // The channel suggestions have their OWN presence marker because they are gated
    // separately from the filter: the filter follows the active target since A48 and
    // is offered to every learner, while the suggestion corpus really is 100 Japanese
    // channels and stays Japanese-only. Without a marker of its own, a detached
    // checkbox reads as a deliberate uncheck and silently turns the setting off.
    const channelControlsPresent = has('youtubeChannelSuggestionSettingsPresent');
    const immersionEnabled = youtubeControlsPresent
        ? has('youtubeImmersionEnabled')
        : current.youtubeImmersionEnabled;
    const initialImmersionEnabled = get('youtubeImmersionEnabledInitial') === 'on';
    const immersionChanged = youtubeControlsPresent
        && has('youtubeImmersionEnabledInitial')
        && immersionEnabled !== initialImmersionEnabled;
    const channelRecommendations = channelControlsPresent
        ? has('youtubeShowChannelRecommendations')
        : current.youtubeShowChannelRecommendations;
    const siteLanguageSettingPresent = has('preferJapaneseSiteLanguageSettingPresent');
    return {
        // Site-language navigation is opt-in. The checkbox renders the effective
        // state, so an unchanged save preserves it while a real toggle records
        // the submitted value as an explicit choice.
        youtubeImmersionEnabled: immersionChanged ? immersionEnabled : current.youtubeImmersionEnabled,
        youtubeImmersionEnabledChosen: current.youtubeImmersionEnabledChosen || immersionChanged,
        preferJapaneseSiteLanguage: siteLanguageSettingPresent
            ? has('preferJapaneseSiteLanguage')
            : current.preferJapaneseSiteLanguage,
        youtubeShowChannelRecommendations: channelRecommendations,
        youtubeShowChannelRecommendationsChosen: current.youtubeShowChannelRecommendationsChosen
            || (channelControlsPresent && channelRecommendations !== current.youtubeShowChannelRecommendations),
        youtubeShowFilterNotice: youtubeControlsPresent
            ? has('youtubeShowFilterNotice')
            : current.youtubeShowFilterNotice,
    };
}

function readShortcutFormSettings(reader: SettingsFormReader, current: ReaderSettings): ReaderSettings['shortcuts'] {
    return Object.fromEntries(SHORTCUT_SETTING_NAMES.map(name => {
        const key = `shortcuts.${name}`;
        return [name, reader.has(key) ? readShortcutFormValue(reader, key, current.shortcuts[name]) : current.shortcuts[name]];
    })) as ReaderSettings['shortcuts'];
}

function readShortcutFormValue(reader: SettingsFormReader, key: string, currentValue: string): string {
    const values = reader.getAll(key);
    if (!values.length) return currentValue;
    const changedValues = Array.from(new Set(values.filter(value => value !== currentValue)));
    if (changedValues.length === 1) return changedValues[0] ?? '';
    return values.at(-1) ?? '';
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

function reorderLocalFrequencyDictionaryPreferences(
    preferences: DictionaryPreference[],
    lookupLinks: DictionaryLookupLink[],
): DictionaryPreference[] {
    // Frequency dictionaries share the lookup-pill order editor, but older
    // installs also persist their order in dictionaryPreferences. Move the
    // linked frequency entries through their existing slots so both arrays
    // agree without disturbing term, kanji, or pronunciation dictionaries.
    const localFrequencyPrefix = 'frequency-local:';
    const preferenceByName = new Map(preferences
        .filter(preference => preference.type === 'frequency')
        .map(preference => [preference.name, preference]));
    const ordered = lookupLinks
        .filter(link => link.action === 'frequency-local' && link.id.startsWith(localFrequencyPrefix))
        .map(link => preferenceByName.get(link.id.slice(localFrequencyPrefix.length)))
        .filter((preference): preference is DictionaryPreference => preference !== undefined);
    if (ordered.length < 2) return preferences;

    const orderedNames = new Set(ordered.map(preference => preference.name));
    let next = 0;
    return preferences.map(slot => {
        if (slot.type !== 'frequency' || !orderedNames.has(slot.name)) return slot;
        return { ...ordered[next++]!, priority: slot.priority };
    });
}

function readDictionaryType(value: string): DictionaryPreference['type'] {
    return value === 'kanji'
        || value === 'frequency'
        || value === 'pronunciation'
        || value === 'metadata'
        ? value
        : 'terms';
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
        subSources: readAudioSubSources(data, get, index),
    });
}

export function readAudioSubSources(data: FormData, get: (key: string) => string, index: number): Array<{ name: string; enabled: boolean }> {
    const count = Math.max(0, Number(get(`audioSources.${index}.subSourceCount`)) || 0);
    const subSources: Array<{ name: string; enabled: boolean }> = [];
    for (let subIndex = 0; subIndex < count; subIndex++) {
        const name = get(`audioSources.${index}.subSources.${subIndex}.name`).trim();
        if (!name) continue;
        subSources.push({ name, enabled: data.has(`audioSources.${index}.subSources.${subIndex}.enabled`) });
    }
    return subSources;
}

function shouldSkipAudioSourceRow(source: AudioSourceSetting, builtInTypes: Set<string>): boolean {
    return !source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type);
}

/**
 * The submitted pill row, normalized against the TARGET the same form declares.
 *
 * The target is read out of the FormData rather than passed in, so every caller
 * — the dialog, the row editor, Yomu Gaming — stays a one-argument call and none
 * of them can accidentally normalize a Spanish row against Japanese built-ins
 * and have Jiten, JPDB and Bunpro appended to it. A form with no target select
 * (the gaming surface, older fixtures) reads as Japanese, which is what it is.
 */
export function readDictionaryLookupLinks(data: FormData): DictionaryLookupLink[] {
    return normalizeDictionaryLookupLinks(lookupLinkRows(data), false, readTargetLanguage(data, 'ja'));
}

export function lookupLinkRows(data: FormData): DictionaryLookupLink[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Math.min(MAX_LOOKUP_LINK_ROWS, Number(get('dictionaryLookupLinkCount')) || 0));
    const links: DictionaryLookupLink[] = [];

    for (let index = 0; index < count; index++) {
        const link = readDictionaryLookupLinkRow(data, get, index);
        if (link) links.push(link);
    }

    return links;
}

/**
 * The pill row this submit should persist, given the target it also declares.
 *
 * When the target is unchanged the submitted rows win, exactly as before. When
 * it changed, the row is rebuilt from the new target's verified hotlinks, which
 * is the whole point of a per-target set: the outgoing target's sites cannot
 * answer for the incoming one, so keeping them would leave a Spanish learner
 * clicking `dict.naver.com`.
 */
function readTargetAwareDictionaryLookupLinks(data: FormData, current: ReaderSettings): DictionaryLookupLink[] {
    const active = activeLanguageProfile(current.languageProfiles, current.activeLanguageProfileId);
    const previous = learningTargetRosterIdForTag(active?.targetLanguage) ?? 'ja';
    const next = readTargetLanguage(data, previous);
    return next === previous
        ? readDictionaryLookupLinks(data)
        : dictionaryLookupLinksForTarget(lookupLinkRows(data), next);
}

function readDictionaryLookupLinkRow(
    data: FormData,
    get: (key: string) => string,
    index: number,
): DictionaryLookupLink | null {
    // `Number(...) || index` read a submitted priority of 0 -- the FIRST row --
    // as "absent" and replaced it with the row index. Harmless while the two
    // agreed, wrong the moment they did not, which is every row order the editor
    // renumbers.
    const priority = readSubmittedRowPriority(get(`dictionaryLookupLinks.${index}.priority`), index);
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
        priority,
    };
}

function readSubmittedRowPriority(value: string, index: number): number {
    if (!value.trim()) return index;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : index;
}

function dictionaryLookupLinkAction(value: string): DictionaryLookupLink['action'] {
    if (value === 'copy') return 'copy';
    if (value === 'frequency-live') return 'frequency-live';
    if (value === 'frequency-local') return 'frequency-local';
    return 'open';
}

function shouldKeepDictionaryLookupLink(label: string, urlTemplate: string, action: DictionaryLookupLink['action']): boolean {
    return Boolean(label || urlTemplate || action === 'copy' || action === 'frequency-live' || action === 'frequency-local');
}

function dictionaryLookupLinkLabel(label: string, action: DictionaryLookupLink['action']): string {
    return action === 'copy' && !label ? COPY_LOOKUP_LINK.label : label;
}

function dictionaryLookupLinkUrlTemplate(urlTemplate: string, action: DictionaryLookupLink['action']): string {
    return action === 'copy' || action === 'frequency-live' || action === 'frequency-local' ? '' : urlTemplate;
}
