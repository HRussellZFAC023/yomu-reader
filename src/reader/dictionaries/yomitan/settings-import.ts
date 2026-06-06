import { uiText } from '../../i18n';
import { Logger } from '../../logger';
import { normalizeAudioSource, normalizeDictionaryPreferences } from '../../settings';
import type { DictionaryPreference, InterfaceLanguage, ReaderSettings, ScanModifierKey } from '../../types';
import type { YomitanSettingsImport } from './types';

const log = Logger.scope('YomitanSettingsImport');

type ImportedSettings = YomitanSettingsImport['settings'];
type ImportSection = Record<string, unknown> | undefined;
type BooleanSettingImport = { sourceKey: string; targetKey: keyof ImportedSettings };

const AUDIO_BOOLEAN_IMPORTS: BooleanSettingImport[] = [
    { sourceKey: 'enabled', targetKey: 'audioEnabled' },
    { sourceKey: 'autoPlay', targetKey: 'autoPlayAudio' },
    { sourceKey: 'enableDefaultAudioSources', targetKey: 'audioEnableDefaultSources' },
];
const ANKI_BOOLEAN_IMPORTS: BooleanSettingImport[] = [
    { sourceKey: 'enable', targetKey: 'ankiEnabled' },
];

export function parseYomitanSettingsExport(value: unknown, language: InterfaceLanguage = 'en'): YomitanSettingsImport {
    const done = log.time('Yomitan settings export parse');
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) {
        done();
        log.warn('Yomitan settings export rejected', { reason: 'missing-profile-options' });
        throw new Error(uiText(language, 'yomitanSettingsInvalid'));
    }

    const settings: YomitanSettingsImport['settings'] = {};
    const sections = readYomitanProfileSections(profileOptions);
    applyAudioSettings(settings, sections.audio);
    applyGeneralSettings(settings, sections.general);
    applyScanningSettings(settings, sections.scanning);
    applyAnkiSettings(settings, sections.anki);
    const dictionaryPreferences = readDictionaryPreferences(profileOptions);
    applyDictionarySettings(settings, dictionaryPreferences);
    const dictionaryNames = dictionaryPreferences.filter(item => item.enabled).map(item => item.name);
    settings.yomitanSettingsBackup = value;
    applyInputShortcuts(settings, sections.inputs);

    done();
    log.info('Yomitan settings import parsed', {
        hasAudioSources: Boolean(settings.audioSources?.length),
        parseSelection: settings.parseSelection,
        theme: settings.theme,
    });
    return { settings, dictionaryNames };
}

function readYomitanProfileSections(profileOptions: Record<string, unknown>): {
    audio: ImportSection;
    general: ImportSection;
    scanning: ImportSection;
    anki: ImportSection;
    inputs: { hotkeys?: Array<Record<string, unknown>> } | undefined;
} {
    return {
        audio: profileOptions.audio as Record<string, unknown> | undefined,
        general: profileOptions.general as Record<string, unknown> | undefined,
        scanning: profileOptions.scanning as Record<string, unknown> | undefined,
        anki: profileOptions.anki as Record<string, unknown> | undefined,
        inputs: profileOptions.inputs as { hotkeys?: Array<Record<string, unknown>> } | undefined,
    };
}

function applyAudioSettings(settings: ImportedSettings, audio: ImportSection): void {
    applyBooleanSettingImports(settings, audio, AUDIO_BOOLEAN_IMPORTS);
    applyAudioFallbackChimeSetting(settings, audio?.fallbackSoundType);
    applyAudioSourceSettings(settings, audio?.sources);
}

function applyBooleanSettingImports(settings: ImportedSettings, source: ImportSection, imports: BooleanSettingImport[]): void {
    for (const item of imports) {
        if (typeof source?.[item.sourceKey] === 'boolean') assignImportedSetting(settings, item.targetKey, source[item.sourceKey]);
    }
}

function applyTrimmedStringSetting(settings: ImportedSettings, value: unknown, targetKey: keyof ImportedSettings): void {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) assignImportedSetting(settings, targetKey, trimmed);
}

function assignImportedSetting(settings: ImportedSettings, key: keyof ImportedSettings, value: unknown): void {
    (settings as Record<string, unknown>)[key] = value;
}

function applyAudioFallbackChimeSetting(settings: ImportedSettings, value: unknown): void {
    if (typeof value === 'string') settings.audioFallbackChimeEnabled = value !== 'none';
}

function applyAudioSourceSettings(settings: ImportedSettings, sources: unknown): void {
    if (!Array.isArray(sources)) return;
    settings.audioSources = sources
        .map(normalizeAudioSource)
        .filter((source): source is NonNullable<ReturnType<typeof normalizeAudioSource>> => source !== null);
    settings.audioSourceUrl = settings.audioSources.find(source => source.url)?.url;
}

function applyGeneralSettings(settings: ImportedSettings, general: ImportSection): void {
    applyImportedLanguage(settings, general?.language);
    applyImportedTheme(settings, general);
    applyGeneralPopupSizeSettings(settings, general);
    applyLocalDictionaryMaxResults(settings, general?.maxResults);
    applyPitchDisplaySetting(settings, general);
}

function applyImportedLanguage(settings: ImportedSettings, value: unknown): void {
    const language = importedInterfaceLanguage(value);
    if (language) settings.interfaceLanguage = language;
}

function applyImportedTheme(settings: ImportedSettings, general: ImportSection): void {
    const theme = importedPopupTheme(general);
    if (theme) settings.theme = theme;
}

function applyGeneralPopupSizeSettings(settings: ImportedSettings, general: ImportSection): void {
    applyPositiveNumberSetting(settings, general?.popupWidth, 'popoverWidth', 280, 900);
    applyPositiveNumberSetting(settings, general?.popupHeight, 'popoverHeight', 220, 900);
    if (hasPositiveNumber(general?.popupVerticalOffset)) settings.subtitleBottomOffset = importedPopupVerticalOffset(general);
}

function applyPositiveNumberSetting(
    settings: ImportedSettings,
    value: unknown,
    targetKey: keyof ImportedSettings,
    min: number,
    max: number,
): void {
    if (hasPositiveNumber(value)) assignImportedSetting(settings, targetKey, clampNumber(value, min, max));
}

function applyLocalDictionaryMaxResults(settings: ImportedSettings, value: unknown): void {
    if (typeof value === 'number') settings.localDictionaryMaxResults = Math.max(1, Math.min(64, value));
}

function applyPitchDisplaySetting(settings: ImportedSettings, general: ImportSection): void {
    const pitchEnabled = importedPitchDisplayEnabled(general);
    if (typeof pitchEnabled === 'boolean') settings.showPitchAccent = pitchEnabled;
}

function importedInterfaceLanguage(value: unknown): ReaderSettings['interfaceLanguage'] | '' {
    return value === 'en' || value === 'ja' || value === 'auto' ? value : '';
}

function importedPopupTheme(general: Record<string, unknown> | undefined): 'dark' | 'light' | '' {
    return general?.popupTheme === 'dark' || general?.popupTheme === 'light' ? general.popupTheme : '';
}

function hasPositiveNumber(value: unknown): boolean {
    return typeof value === 'number' && value > 0;
}

function importedPopupVerticalOffset(general: Record<string, unknown> | undefined): number {
    return Math.max(6, Math.min(24, Math.round(Number(general?.popupVerticalOffset) || 12)));
}

function importedPitchDisplayEnabled(general: Record<string, unknown> | undefined): boolean | undefined {
    const values = [
        general?.showPitchAccentDownstepNotation,
        general?.showPitchAccentPositionNotation,
        general?.showPitchAccentGraph,
    ].filter((value): value is boolean => typeof value === 'boolean');
    return values.length ? values.some(Boolean) : undefined;
}

function applyScanningSettings(settings: ImportedSettings, scanning: ImportSection): void {
    if (typeof scanning?.selectText === 'boolean') settings.parseSelection = scanning.selectText;
    if (typeof scanning?.delay === 'number') settings.hoverOpenDelayMs = clampNumber(scanning.delay, 0, 1500);
    if (typeof scanning?.hideDelay === 'number') settings.hoverCloseDelayMs = clampNumber(scanning.hideDelay, 0, 3000);
    applyScanInputSettings(settings, scanning);
}

function applyAnkiSettings(settings: ImportedSettings, anki: ImportSection): void {
    applyBooleanSettingImports(settings, anki, ANKI_BOOLEAN_IMPORTS);
    applyTrimmedStringSetting(settings, anki?.server, 'ankiConnectUrl');
    applyAnkiTagsSetting(settings, anki?.tags);
    applyAnkiCardFormatSettings(settings, firstYomitanTermCardFormat(anki?.cardFormats));
    applyAnkiScreenshotSetting(settings, anki?.screenshot);
}

function applyAnkiTagsSetting(settings: ImportedSettings, value: unknown): void {
    if (Array.isArray(value)) settings.ankiTags = value.map(tag => String(tag).trim()).filter(Boolean).join(' ');
}

function applyAnkiCardFormatSettings(settings: ImportedSettings, cardFormat: Record<string, unknown> | null): void {
    if (!cardFormat) return;
    applyTrimmedStringSetting(settings, cardFormat.deck, 'ankiDeck');
    applyTrimmedStringSetting(settings, cardFormat.model, 'ankiModel');
}

function applyAnkiScreenshotSetting(settings: ImportedSettings, value: unknown): void {
    if (isObjectRecord(value)) settings.ankiCaptureScreenshot = true;
}

function firstYomitanTermCardFormat(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value)) return null;
    return value.find(item => isObjectRecord(item) && (item.type === 'term' || item.type == null)) ?? null;
}

function applyDictionarySettings(settings: YomitanSettingsImport['settings'], preferences: DictionaryPreference[]): void {
    if (!preferences.length) return;
    settings.dictionaryPreferences = normalizeDictionaryPreferences(preferences);
}

function applyInputShortcuts(settings: YomitanSettingsImport['settings'], inputs: { hotkeys?: Array<Record<string, unknown>> } | undefined): void {
    applyYomitanShortcut(settings, inputs, 'playAudio', 'playAudio');
    applyYomitanShortcut(settings, inputs, 'close', 'closePopup');
}

function applyYomitanShortcut(
    settings: YomitanSettingsImport['settings'],
    inputs: { hotkeys?: Array<Record<string, unknown>> } | undefined,
    action: string,
    target: keyof ReaderSettings['shortcuts'],
): void {
    const hotkey = inputs?.hotkeys?.find(item => item.action === action && item.enabled !== false);
    if (!hotkey) return;
    const key = String(hotkey.key || '').replace(/^Key/, '');
    const modifiers = Array.isArray(hotkey.modifiers) ? hotkey.modifiers.map(v => String(v)) : [];
    settings.shortcuts = {
        ...settings.shortcuts,
        [target]: [...modifiers.map(capitalize), key].filter(Boolean).join('+'),
    };
}

function readDictionaryPreferences(profileOptions: Record<string, unknown>): DictionaryPreference[] {
    const dictionaries = Array.isArray(profileOptions.dictionaries)
        ? profileOptions.dictionaries as Array<Record<string, unknown>>
        : [];
    return dictionaries
        .map((item, index): DictionaryPreference | null => {
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (!name) return null;
            return {
                name,
                alias: typeof item.alias === 'string' && item.alias.trim() ? item.alias.trim() : name,
                enabled: item.enabled !== false,
                priority: index,
                allowSecondarySearches: item.allowSecondarySearches === true,
            };
        })
        .filter((item): item is DictionaryPreference => item !== null);
}

function applyScanInputSettings(settings: YomitanSettingsImport['settings'], scanning: Record<string, unknown> | undefined): void {
    const scanInput = firstScanInput(scanning);
    if (!scanInput) return;
    const include = String(scanInput.include ?? '').toLowerCase();
    const modifier = ['shift', 'alt', 'ctrl', 'meta'].find(key => include.includes(key));
    if (modifier) {
        settings.lookupOnHover = true;
        settings.popupActivationMode = 'modifier';
        settings.scanModifierKey = modifier as ScanModifierKey;
        settings.shortcuts = { ...settings.shortcuts, hoverLookup: capitalize(modifier) };
        return;
    }
    const options = scanInput.options as Record<string, unknown> | undefined;
    if (shouldEnablePlainHoverScan(options, include)) {
        settings.lookupOnHover = true;
        settings.popupActivationMode = 'hover';
        settings.shortcuts = { ...settings.shortcuts, hoverLookup: '' };
    }
}

function firstScanInput(scanning: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!Array.isArray(scanning?.inputs)) return null;
    return (scanning.inputs as Array<Record<string, unknown>>).find(isRecordScanInput) ?? null;
}

function isRecordScanInput(input: unknown): input is Record<string, unknown> {
    return Boolean(input && typeof input === 'object');
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function shouldEnablePlainHoverScan(options: Record<string, unknown> | undefined, include: string): boolean {
    return options?.scanOnPenHover === true || options?.scanOnTouchTap === true || include === '';
}

function getYomitanProfileOptions(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return profileOptionsFromRoot(record.options)
        ?? profileOptionsFromProfiles(record.profiles, record);
}

function profileOptionsFromRoot(rootOptions: unknown): Record<string, unknown> | null {
    if (!rootOptions || typeof rootOptions !== 'object') return null;
    const rootOptionRecord = rootOptions as Record<string, unknown>;
    return nestedProfileOptions(rootOptionRecord.profiles, rootOptionRecord.profileCurrent) ?? rootOptionRecord;
}

function profileOptionsFromProfiles(profilesValue: unknown, fallback: Record<string, unknown>): Record<string, unknown> | null {
    const profile = selectedProfileRecord(profilesValue, fallback.profileCurrent) ?? fallback;
    const options = profile.options;
    return options && typeof options === 'object' ? options as Record<string, unknown> : null;
}

function nestedProfileOptions(profilesValue: unknown, profileCurrent: unknown): Record<string, unknown> | null {
    const options = selectedProfileRecord(profilesValue, profileCurrent)?.options;
    return options && typeof options === 'object' ? options as Record<string, unknown> : null;
}

function selectedProfileRecord(value: unknown, profileCurrent: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value)) return null;
    const index = Number(profileCurrent);
    const selected = Number.isInteger(index) && index >= 0 && index < value.length ? value[index] : null;
    const profile = selected && typeof selected === 'object'
        ? selected
        : value.find(item => item && typeof item === 'object');
    return profile ? profile as Record<string, unknown> : null;
}

function capitalize(value: string): string {
    return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}

function clampNumber(value: unknown, min: number, max: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}
