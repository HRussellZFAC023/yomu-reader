import type { AudioCatalog, AudioTrack, ThemeDefinition, ThemeSlot } from './types';

const SLOT_SETTINGS: Readonly<Record<ThemeSlot, Omit<ThemeDefinition, 'slot' | 'music' | 'ambience'>>> = {
    silence: { crossfadeMs: 600, lessonDuck: 0.3 },
    'opening.invitation': { crossfadeMs: 1200, lessonDuck: 0.28 },
    'campus.evening': { crossfadeMs: 1200, lessonDuck: 0.3 },
    'classroom.focus': { crossfadeMs: 900, lessonDuck: 0.25 },
    'library.quiet': { crossfadeMs: 900, lessonDuck: 0.2 },
    'lab.listening': { crossfadeMs: 700, lessonDuck: 0.18 },
    'cafe.social': { crossfadeMs: 1000, lessonDuck: 0.28 },
    'bond.quiet': { crossfadeMs: 1300, lessonDuck: 0.24 },
    'mystery.page': { crossfadeMs: 1000, lessonDuck: 0.2 },
    'challenge.kanji': { crossfadeMs: 450, lessonDuck: 0.35 },
    'challenge.major': { crossfadeMs: 450, lessonDuck: 0.35 },
    'unlock.world': { crossfadeMs: 800, lessonDuck: 0.3 },
    'support.kindness': { crossfadeMs: 1200, lessonDuck: 0.22 },
    'resolve.late': { crossfadeMs: 1000, lessonDuck: 0.28 },
    'ending.reflective': { crossfadeMs: 1500, lessonDuck: 0.2 },
    'world.courtyard': { crossfadeMs: 1050, lessonDuck: 0.3 },
    'world.classroom': { crossfadeMs: 800, lessonDuck: 0.25 },
    'world.library': { crossfadeMs: 1100, lessonDuck: 0.2 },
    'world.cafe': { crossfadeMs: 950, lessonDuck: 0.28 },
    'world.lab': { crossfadeMs: 750, lessonDuck: 0.18 },
    'world.street': { crossfadeMs: 900, lessonDuck: 0.25 },
    'world.station': { crossfadeMs: 700, lessonDuck: 0.24 },
    'world.konbini': { crossfadeMs: 850, lessonDuck: 0.27 },
    'world.ramen': { crossfadeMs: 1050, lessonDuck: 0.28 },
    'world.home': { crossfadeMs: 1300, lessonDuck: 0.22 },
    'world.japan-centre': { crossfadeMs: 950, lessonDuck: 0.24 },
    'world.park': { crossfadeMs: 1250, lessonDuck: 0.2 },
};

export const SILENT_AUDIO_CATALOG: AudioCatalog = createAudioCatalog();

export function createAudioCatalog(overrides: Partial<Record<ThemeSlot, Partial<ThemeDefinition>>> = {}): AudioCatalog {
    return Object.freeze(Object.fromEntries(Object.entries(SLOT_SETTINGS).map(([key, settings]) => {
        const slot = key as ThemeSlot;
        const override = overrides[slot] ?? {};
        const definition: ThemeDefinition = {
            slot,
            crossfadeMs: finiteDuration(override.crossfadeMs, settings.crossfadeMs),
            lessonDuck: volume(override.lessonDuck, settings.lessonDuck),
            ...(override.music ? { music: validateTrack(override.music) } : {}),
            ...(override.ambience ? { ambience: validateTrack(override.ambience) } : {}),
        };
        return [slot, Object.freeze(definition)];
    })) as Record<ThemeSlot, ThemeDefinition>);
}

export function trackCanPlay(track: AudioTrack, releaseMode: boolean): boolean {
    const rights = track.rights;
    if (!rights.reviewed || !rights.owner.trim() || !rights.licence.trim() || !rights.source.trim()) return false;
    if (releaseMode && rights.scope !== 'release') return false;
    try {
        const url = new URL(track.url, globalThis.location?.origin ?? 'https://yomureader.com');
        return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'blob:';
    } catch {
        return false;
    }
}

function validateTrack(track: AudioTrack): AudioTrack {
    if (!track.id.trim() || !track.title.trim() || !track.url.trim()) throw new TypeError('Audio tracks need id, title, and URL.');
    if (!Number.isFinite(track.gain) || track.gain < 0 || track.gain > 1) throw new TypeError(`Audio track ${track.id} has invalid gain.`);
    return structuredClone(track);
}

function finiteDuration(value: number | undefined, fallback: number): number {
    return value === undefined ? fallback : Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function volume(value: number | undefined, fallback: number): number {
    return value === undefined ? fallback : Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
