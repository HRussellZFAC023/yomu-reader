import type { AudioBus, AudioSettings } from './types';

export const ACADEMY_AUDIO_SETTINGS_KEY = 'yomu:academy:audio:v1';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = Object.freeze({
    muted: false,
    volumes: Object.freeze({ music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 }),
});

export function loadAudioSettings(storage: Storage | null): AudioSettings {
    if (!storage) return cloneDefaults();
    try {
        const value: unknown = JSON.parse(storage.getItem(ACADEMY_AUDIO_SETTINGS_KEY) ?? 'null');
        if (!isRecord(value) || !isRecord(value.volumes)) return cloneDefaults();
        return {
            muted: typeof value.muted === 'boolean' ? value.muted : false,
            volumes: {
                music: volume(value.volumes.music, DEFAULT_AUDIO_SETTINGS.volumes.music),
                ambience: volume(value.volumes.ambience, DEFAULT_AUDIO_SETTINGS.volumes.ambience),
                lesson: volume(value.volumes.lesson, DEFAULT_AUDIO_SETTINGS.volumes.lesson),
                sfx: volume(value.volumes.sfx, DEFAULT_AUDIO_SETTINGS.volumes.sfx),
            },
        };
    } catch {
        return cloneDefaults();
    }
}

export function saveAudioSettings(storage: Storage | null, settings: AudioSettings): void {
    try {
        storage?.setItem(ACADEMY_AUDIO_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Preferences remain usable for this session when local storage is unavailable.
    }
}

export function withAudioVolume(settings: AudioSettings, bus: AudioBus, value: number): AudioSettings {
    return { ...settings, volumes: { ...settings.volumes, [bus]: clampVolume(value) } };
}

export function clampVolume(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function volume(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? clampVolume(value) : fallback;
}

function cloneDefaults(): AudioSettings {
    return { muted: DEFAULT_AUDIO_SETTINGS.muted, volumes: { ...DEFAULT_AUDIO_SETTINGS.volumes } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
