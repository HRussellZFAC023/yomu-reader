import type { AudioSettings, ThemeSlot } from '../audio/types';
import type { WorldPlaceId } from '../domain/world-locations';
import {
    createVnAudioDirectorBridge,
    type VnAudioDirectorTarget,
    type VnSoundCaptionEvent,
    type VnSoundPlayResult,
} from './audio-director-bridge';
import {
    shindayVnSound,
    type ShindayVnAmbienceId,
    type ShindayVnSoundId,
} from './shinday-sound-profile';

export const CURRENT_WORLD_AUDIO_PLACE_IDS = [
    'courtyard',
    'classroom',
    'library',
    'cafe',
    'lab',
    'street',
    'station',
    'konbini',
    'ramen',
    'japan-centre',
    'home',
    'park',
    'station-platform',
] as const satisfies readonly WorldPlaceId[];

export type CurrentWorldAudioPlaceId = typeof CURRENT_WORLD_AUDIO_PLACE_IDS[number];

export interface WorldLocationAudioProfile {
    readonly place: WorldPlaceId;
    readonly music: ThemeSlot;
    readonly arrival: ShindayVnSoundId;
    readonly departure: ShindayVnSoundId;
    readonly confirm: ShindayVnSoundId;
    readonly success: ShindayVnSoundId;
    readonly ambience?: ShindayVnAmbienceId;
    readonly object?: ShindayVnSoundId;
    readonly reducedMotion: 'same-audio';
    readonly offlineFallback: 'silence';
}

const PROFILE_DEFAULTS = Object.freeze({
    arrival: 'scene.enter' as const,
    departure: 'scene.exit' as const,
    confirm: 'choice.confirm' as const,
    success: 'feedback.correct' as const,
    reducedMotion: 'same-audio' as const,
    offlineFallback: 'silence' as const,
});

/**
 * Current-place audio only. Music slots resolve through the authorized
 * AudioDirector catalog; unavailable ambience remains an explicit Shinday gap.
 */
export const WORLD_LOCATION_AUDIO_PROFILES = Object.freeze({
    courtyard: profile('courtyard', 'world.courtyard', { ambience: 'ambience.rain' }),
    classroom: profile('classroom', 'world.classroom', { ambience: 'ambience.rain' }),
    library: profile('library', 'world.library', { ambience: 'ambience.library' }),
    cafe: profile('cafe', 'world.cafe', { ambience: 'ambience.cafe', object: 'object.radio-tune' }),
    lab: profile('lab', 'world.lab', { object: 'focus.move' }),
    street: profile('street', 'world.street', { ambience: 'ambience.rain' }),
    station: profile('station', 'world.station'),
    konbini: profile('konbini', 'world.konbini', { object: 'object.register-tick' }),
    ramen: profile('ramen', 'world.ramen', { ambience: 'ambience.cafe', object: 'object.menu-page' }),
    'japan-centre': profile('japan-centre', 'world.japan-centre', { object: 'object.menu-page' }),
    home: profile('home', 'world.home', { ambience: 'ambience.rain', object: 'object.radio-tune' }),
    park: profile('park', 'world.park', { ambience: 'ambience.rain', object: 'object.sketch-stroke' }),
    'station-platform': profile('station-platform', 'challenge.major', { object: 'object.radio-tune' }),
} satisfies Readonly<Record<CurrentWorldAudioPlaceId, WorldLocationAudioProfile>>);

/** Deferred world locations share a reviewed theme only after current places have one each. */
export const WORLD_EXPANSION_AUDIO_PROFILES = Object.freeze({
    bookshop: profile('bookshop', 'mystery.page', { ambience: 'ambience.library', object: 'object.menu-page' }),
} satisfies Readonly<Record<'bookshop', WorldLocationAudioProfile>>);

export function worldLocationAudioProfile(place: WorldPlaceId): WorldLocationAudioProfile | undefined {
    return WORLD_LOCATION_AUDIO_PROFILES[place as CurrentWorldAudioPlaceId]
        ?? WORLD_EXPANSION_AUDIO_PROFILES[place as keyof typeof WORLD_EXPANSION_AUDIO_PROFILES];
}

/** Planned or unsupported places fail closed to silence rather than borrowing a copyrighted theme. */
export function worldLocationTheme(place: WorldPlaceId): ThemeSlot {
    return worldLocationAudioProfile(place)?.music ?? 'silence';
}

interface WorldLocationAudioTarget extends VnAudioDirectorTarget {
    readonly settings?: AudioSettings;
}

export interface WorldLocationAudioSessionOptions {
    readonly director: WorldLocationAudioTarget;
    readonly isOnline?: () => boolean;
    readonly reducedMotion?: boolean;
    readonly now?: () => number;
    readonly onCaption?: (event: VnSoundCaptionEvent) => void;
}

export type WorldLocationAudioResult = VnSoundPlayResult | {
    readonly status: 'unchanged' | 'offline' | 'muted' | 'gap';
    readonly played: false;
};

export interface WorldLocationAudioSession {
    enter(place: WorldPlaceId): WorldLocationAudioResult;
    leave(place: WorldPlaceId): WorldLocationAudioResult;
    confirm(place: WorldPlaceId): WorldLocationAudioResult;
    succeed(place: WorldPlaceId): WorldLocationAudioResult;
    toggleObject(place: WorldPlaceId): WorldLocationAudioResult;
    dispose(): void;
}

/** One deduplicated location session over the existing Shinday/AudioDirector bridge. */
export function createWorldLocationAudioSession(
    options: WorldLocationAudioSessionOptions,
): WorldLocationAudioSession {
    const isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false);
    const bridge = createVnAudioDirectorBridge({
        director: options.director,
        reducedMotion: options.reducedMotion ?? prefersReducedMotion(),
        ...(options.now ? { now: options.now } : {}),
        ...(options.onCaption ? { onCaption: options.onCaption } : {}),
    });
    let activePlace: WorldPlaceId | undefined;

    const play = (soundId: ShindayVnSoundId | undefined): WorldLocationAudioResult => {
        if (!soundId) return { status: 'gap', played: false };
        if (!isOnline()) return { status: 'offline', played: false };
        const settings = options.director.settings;
        if (settings?.muted || settings?.volumes.sfx === 0) return { status: 'muted', played: false };
        return bridge.playSound(shindayVnSound(soundId));
    };

    const cue = (
        place: WorldPlaceId,
        select: (profile: WorldLocationAudioProfile) => ShindayVnSoundId | undefined,
    ): WorldLocationAudioResult => {
        const placeProfile = worldLocationAudioProfile(place);
        return placeProfile ? play(select(placeProfile)) : { status: 'gap', played: false };
    };

    return {
        enter(place) {
            if (activePlace === place) return { status: 'unchanged', played: false };
            activePlace = place;
            return cue(place, placeProfile => placeProfile.arrival);
        },
        leave(place) {
            if (activePlace !== place) return { status: 'unchanged', played: false };
            activePlace = undefined;
            return cue(place, placeProfile => placeProfile.departure);
        },
        confirm: place => cue(place, placeProfile => placeProfile.confirm),
        succeed: place => cue(place, placeProfile => placeProfile.success),
        toggleObject: place => cue(place, placeProfile => placeProfile.object),
        dispose: () => bridge.dispose(),
    };
}

function profile(
    place: WorldPlaceId,
    music: ThemeSlot,
    sounds: Pick<WorldLocationAudioProfile, 'ambience' | 'object'> = {},
): WorldLocationAudioProfile {
    return Object.freeze({ place, music, ...PROFILE_DEFAULTS, ...sounds });
}

function prefersReducedMotion(): boolean {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
