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
    const audio = profileOptions.audio as Record<string, unknown> | undefined;
    const general = profileOptions.general as Record<string, unknown> | undefined;
    const scanning = profileOptions.scanning as Record<string, unknown> | undefined;
    const inputs = profileOptions.inputs as { hotkeys?: Array<Record<string, unknown>> } | undefined;

    if (typeof audio?.enabled === 'boolean') settings.audioEnabled = audio.enabled;
    if (typeof audio?.autoPlay === 'boolean') settings.autoPlayAudio = audio.autoPlay;
    if (typeof audio?.enableDefaultAudioSources === 'boolean') settings.audioEnableDefaultSources = audio.enableDefaultAudioSources;
    if (Array.isArray(audio?.sources)) {
        settings.audioSources = audio.sources
            .map(normalizeAudioSource)
            .filter((source): source is NonNullable<ReturnType<typeof normalizeAudioSource>> => source !== null);
        settings.audioSourceUrl = settings.audioSources.find(source => source.url)?.url;
    }
    if (general?.popupTheme === 'dark' || general?.popupTheme === 'light') settings.theme = general.popupTheme;
    if (typeof general?.popupHeight === 'number' && general.popupHeight > 0) {
        settings.subtitleBottomOffset = Math.max(6, Math.min(24, Math.round(general.popupVerticalOffset as number || 12)));
    }
    if (typeof scanning?.selectText === 'boolean') settings.parseSelection = scanning.selectText;
    if (typeof scanning?.scanWithoutMousemove === 'boolean') settings.autoScanJapanese = scanning.scanWithoutMousemove;
    applyScanInputSettings(settings, scanning);
    if (typeof general?.maxResults === 'number') settings.localDictionaryMaxResults = Math.max(1, Math.min(64, general.maxResults));
    const dictionaryNames = readDictionaryNames(profileOptions);
    if (dictionaryNames.length) {
        settings.dictionaryPreferences = normalizeDictionaryPreferences(dictionaryNames.map((name, index) => ({
            name,
            alias: name,
            enabled: true,
            priority: index,
        })));
    }
    settings.yomitanSettingsBackup = value;

    const playAudio = inputs?.hotkeys?.find(hotkey => hotkey.action === 'playAudio' && hotkey.enabled !== false);
    if (playAudio) {
        const key = String(playAudio.key || '').replace(/^Key/, '');
        const modifiers = Array.isArray(playAudio.modifiers) ? playAudio.modifiers.map(v => String(v)) : [];
        settings.shortcuts = { ...settings.shortcuts, playAudio: [...modifiers.map(capitalize), key].filter(Boolean).join('+') };
    }
    done();
    log.info('Yomitan settings import parsed', {
        hasAudioSources: Boolean(settings.audioSources?.length),
        parseSelection: settings.parseSelection,
        autoScanJapanese: settings.autoScanJapanese,
        theme: settings.theme,
    });
    return { settings, dictionaryNames };
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
    const scanInput = Array.isArray(scanning?.inputs)
        ? (scanning.inputs as Array<Record<string, unknown>>).find(input => input && typeof input === 'object')
        : null;
    if (!scanInput) return;
    const include = String(scanInput.include ?? '').toLowerCase();
    const modifier = ['shift', 'alt', 'ctrl', 'meta'].find(key => include.includes(key));
    if (modifier) {
        settings.lookupOnHover = true;
        settings.shortcuts = { ...settings.shortcuts, hoverLookup: capitalize(modifier) };
        return;
    }
    const options = scanInput.options as Record<string, unknown> | undefined;
    if (options?.scanOnPenHover === true || options?.scanOnTouchTap === true || include === '') {
        settings.lookupOnHover = true;
        settings.shortcuts = { ...settings.shortcuts, hoverLookup: '' };
    }
}

function getYomitanProfileOptions(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const rootOptions = record.options;
    if (rootOptions && typeof rootOptions === 'object') {
        const rootOptionRecord = rootOptions as Record<string, unknown>;
        const profiles = Array.isArray(rootOptionRecord.profiles) ? rootOptionRecord.profiles as Array<Record<string, unknown>> : [];
        const profileOptions = profiles.find(item => item && typeof item === 'object')?.options;
        if (profileOptions && typeof profileOptions === 'object') return profileOptions as Record<string, unknown>;
        return rootOptionRecord;
    }
    const profiles = Array.isArray(record.profiles) ? record.profiles as Array<Record<string, unknown>> : [];
    const profile = profiles.find(item => item && typeof item === 'object') ?? record;
    const options = (profile as Record<string, unknown>).options;
    return options && typeof options === 'object' ? options as Record<string, unknown> : null;
}

function capitalize(value: string): string {
    return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}
