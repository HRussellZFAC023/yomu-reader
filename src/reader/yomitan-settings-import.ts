import { Logger } from './logger';
import { normalizeAudioSource, normalizeDictionaryPreferences } from './settings';
import type { YomitanSettingsImport } from './yomitan-types';

const log = Logger.scope('YomitanSettingsImport');

export function parseYomitanSettingsExport(value: unknown): YomitanSettingsImport {
    const done = log.time('Yomitan settings export parse');
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) {
        done();
        log.warn('Yomitan settings export rejected', { reason: 'missing-profile-options' });
        throw new Error('This does not look like a Yomitan settings export.');
    }

    const settings: YomitanSettingsImport['settings'] = {};
    const sections = readYomitanProfileSections(profileOptions);
    applyAudioSettings(settings, sections.audio);
    applyGeneralSettings(settings, sections.general);
    applyScanningSettings(settings, sections.scanning);
    const dictionaryNames = readDictionaryNames(profileOptions);
    applyDictionarySettings(settings, dictionaryNames);
    settings.yomitanSettingsBackup = value;
    applyPlayAudioShortcut(settings, sections.inputs);

    done();
    log.info('Yomitan settings import parsed', {
        hasAudioSources: Boolean(settings.audioSources?.length),
        parseSelection: settings.parseSelection,
        autoScanJapanese: settings.autoScanJapanese,
        theme: settings.theme,
    });
    return { settings, dictionaryNames };
}

function readYomitanProfileSections(profileOptions: Record<string, unknown>): {
    audio: Record<string, unknown> | undefined;
    general: Record<string, unknown> | undefined;
    scanning: Record<string, unknown> | undefined;
    inputs: { hotkeys?: Array<Record<string, unknown>> } | undefined;
} {
    return {
        audio: profileOptions.audio as Record<string, unknown> | undefined,
        general: profileOptions.general as Record<string, unknown> | undefined,
        scanning: profileOptions.scanning as Record<string, unknown> | undefined,
        inputs: profileOptions.inputs as { hotkeys?: Array<Record<string, unknown>> } | undefined,
    };
}

function applyAudioSettings(settings: YomitanSettingsImport['settings'], audio: Record<string, unknown> | undefined): void {
    if (typeof audio?.enabled === 'boolean') settings.audioEnabled = audio.enabled;
    if (typeof audio?.autoPlay === 'boolean') settings.autoPlayAudio = audio.autoPlay;
    if (typeof audio?.enableDefaultAudioSources === 'boolean') settings.audioEnableDefaultSources = audio.enableDefaultAudioSources;
    if (!Array.isArray(audio?.sources)) return;
    settings.audioSources = audio.sources
        .map(normalizeAudioSource)
        .filter((source): source is NonNullable<ReturnType<typeof normalizeAudioSource>> => source !== null);
    settings.audioSourceUrl = settings.audioSources.find(source => source.url)?.url;
}

function applyGeneralSettings(settings: YomitanSettingsImport['settings'], general: Record<string, unknown> | undefined): void {
    const theme = importedPopupTheme(general);
    if (theme) settings.theme = theme;
    if (hasPositiveNumber(general?.popupHeight)) settings.subtitleBottomOffset = importedPopupVerticalOffset(general);
    if (typeof general?.maxResults === 'number') settings.localDictionaryMaxResults = Math.max(1, Math.min(64, general.maxResults));
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

function applyScanningSettings(settings: YomitanSettingsImport['settings'], scanning: Record<string, unknown> | undefined): void {
    if (typeof scanning?.selectText === 'boolean') settings.parseSelection = scanning.selectText;
    if (typeof scanning?.scanWithoutMousemove === 'boolean') settings.autoScanJapanese = scanning.scanWithoutMousemove;
    applyScanInputSettings(settings, scanning);
}

function applyDictionarySettings(settings: YomitanSettingsImport['settings'], dictionaryNames: string[]): void {
    if (!dictionaryNames.length) return;
    settings.dictionaryPreferences = normalizeDictionaryPreferences(dictionaryNames.map((name, index) => ({
        name,
        alias: name,
        enabled: true,
        priority: index,
    })));
}

function applyPlayAudioShortcut(settings: YomitanSettingsImport['settings'], inputs: { hotkeys?: Array<Record<string, unknown>> } | undefined): void {
    const playAudio = inputs?.hotkeys?.find(hotkey => hotkey.action === 'playAudio' && hotkey.enabled !== false);
    if (!playAudio) return;
    const key = String(playAudio.key || '').replace(/^Key/, '');
    const modifiers = Array.isArray(playAudio.modifiers) ? playAudio.modifiers.map(v => String(v)) : [];
    settings.shortcuts = { ...settings.shortcuts, playAudio: [...modifiers.map(capitalize), key].filter(Boolean).join('+') };
}

function readDictionaryNames(profileOptions: Record<string, unknown>): string[] {
    const dictionaries = Array.isArray(profileOptions.dictionaries)
        ? profileOptions.dictionaries as Array<Record<string, unknown>>
        : [];
    return dictionaries
        .filter(item => item.enabled !== false)
        .map(item => typeof item.name === 'string' ? item.name.trim() : '')
        .filter(Boolean);
}

function applyScanInputSettings(settings: YomitanSettingsImport['settings'], scanning: Record<string, unknown> | undefined): void {
    const scanInput = firstScanInput(scanning);
    if (!scanInput) return;
    const include = String(scanInput.include ?? '').toLowerCase();
    const modifier = ['shift', 'alt', 'ctrl', 'meta'].find(key => include.includes(key));
    if (modifier) {
        settings.lookupOnHover = true;
        settings.shortcuts = { ...settings.shortcuts, hoverLookup: capitalize(modifier) };
        return;
    }
    const options = scanInput.options as Record<string, unknown> | undefined;
    if (shouldEnablePlainHoverScan(options, include)) {
        settings.lookupOnHover = true;
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
    return firstNestedProfileOptions(rootOptionRecord.profiles) ?? rootOptionRecord;
}

function profileOptionsFromProfiles(profilesValue: unknown, fallback: Record<string, unknown>): Record<string, unknown> | null {
    const profile = firstProfileRecord(profilesValue) ?? fallback;
    const options = profile.options;
    return options && typeof options === 'object' ? options as Record<string, unknown> : null;
}

function firstNestedProfileOptions(profilesValue: unknown): Record<string, unknown> | null {
    const options = firstProfileRecord(profilesValue)?.options;
    return options && typeof options === 'object' ? options as Record<string, unknown> : null;
}

function firstProfileRecord(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value)) return null;
    const profile = value.find(item => item && typeof item === 'object');
    return profile ? profile as Record<string, unknown> : null;
}

function capitalize(value: string): string {
    return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}
