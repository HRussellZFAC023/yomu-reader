import { uiText } from './i18n';
import { Logger } from './logger';
import { normalizeAudioSource, normalizeDictionaryPreferences } from './settings';
import type { DictionaryPreference, InterfaceLanguage, ReaderSettings, ScanModifierKey } from './types';
import type { YomitanSettingsImport } from './yomitan-types';

const log = Logger.scope('YomitanSettingsImport');

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
    audio: Record<string, unknown> | undefined;
    general: Record<string, unknown> | undefined;
    scanning: Record<string, unknown> | undefined;
    anki: Record<string, unknown> | undefined;
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

function applyAudioSettings(settings: YomitanSettingsImport['settings'], audio: Record<string, unknown> | undefined): void {
    if (typeof audio?.enabled === 'boolean') settings.audioEnabled = audio.enabled;
    if (typeof audio?.autoPlay === 'boolean') settings.autoPlayAudio = audio.autoPlay;
    if (typeof audio?.enableDefaultAudioSources === 'boolean') settings.audioEnableDefaultSources = audio.enableDefaultAudioSources;
    if (typeof audio?.fallbackSoundType === 'string') settings.audioFallbackChimeEnabled = audio.fallbackSoundType !== 'none';
    if (!Array.isArray(audio?.sources)) return;
    settings.audioSources = audio.sources
        .map(normalizeAudioSource)
        .filter((source): source is NonNullable<ReturnType<typeof normalizeAudioSource>> => source !== null);
    settings.audioSourceUrl = settings.audioSources.find(source => source.url)?.url;
}

function applyGeneralSettings(settings: YomitanSettingsImport['settings'], general: Record<string, unknown> | undefined): void {
    const language = importedInterfaceLanguage(general?.language);
    if (language) settings.interfaceLanguage = language;
    const theme = importedPopupTheme(general);
    if (theme) settings.theme = theme;
    if (hasPositiveNumber(general?.popupWidth)) settings.popoverWidth = clampNumber(general?.popupWidth, 280, 900);
    if (hasPositiveNumber(general?.popupHeight)) settings.popoverHeight = clampNumber(general?.popupHeight, 220, 900);
    if (hasPositiveNumber(general?.popupVerticalOffset)) settings.subtitleBottomOffset = importedPopupVerticalOffset(general);
    if (typeof general?.maxResults === 'number') settings.localDictionaryMaxResults = Math.max(1, Math.min(64, general.maxResults));
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

function applyScanningSettings(settings: YomitanSettingsImport['settings'], scanning: Record<string, unknown> | undefined): void {
    if (typeof scanning?.selectText === 'boolean') settings.parseSelection = scanning.selectText;
    if (typeof scanning?.delay === 'number') settings.hoverOpenDelayMs = clampNumber(scanning.delay, 0, 1500);
    if (typeof scanning?.hideDelay === 'number') settings.hoverCloseDelayMs = clampNumber(scanning.hideDelay, 0, 3000);
    applyScanInputSettings(settings, scanning);
}

function applyAnkiSettings(settings: YomitanSettingsImport['settings'], anki: Record<string, unknown> | undefined): void {
    if (typeof anki?.enable === 'boolean') settings.ankiEnabled = anki.enable;
    if (typeof anki?.server === 'string' && anki.server.trim()) settings.ankiConnectUrl = anki.server.trim();
    if (Array.isArray(anki?.tags)) settings.ankiTags = anki.tags.map(tag => String(tag).trim()).filter(Boolean).join(' ');
    const cardFormat = firstYomitanTermCardFormat(anki?.cardFormats);
    if (cardFormat) {
        if (typeof cardFormat.deck === 'string' && cardFormat.deck.trim()) settings.ankiDeck = cardFormat.deck.trim();
        if (typeof cardFormat.model === 'string' && cardFormat.model.trim()) settings.ankiModel = cardFormat.model.trim();
    }
    if (isObjectRecord(anki?.screenshot)) settings.ankiCaptureScreenshot = true;
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
