import { createAudioCatalog, trackCanPlay } from './catalog';
import type { AudioCatalog, AudioRights, AudioTrack, SfxCue, ThemeDefinition, ThemeSlot } from './types';
import authorizedManifestJson from './manifest.json';

/**
 * Checked-in audio manifest: the single authorized source for which tracks
 * and SFX the Academy may play. Every entry carries a reviewed rights block
 * and a protected media key served by the yomu-academy Worker; anything that
 * fails validation or the rights gate is simply absent — never synthesized.
 */
export interface AudioManifest {
    readonly version: 1;
    readonly themes: readonly ThemeTrackEntry[];
    readonly sfx: readonly SfxEntry[];
}

export interface ThemeTrackEntry {
    readonly slot: ThemeSlot;
    readonly bus: 'music' | 'ambience';
    readonly trackId: string;
    readonly title: string;
    readonly mediaKey: string;
    readonly loop: boolean;
    readonly gain: number;
    readonly rights: AudioRights;
}

export interface SfxEntry {
    readonly cue: SfxCue;
    readonly mediaKey: string;
    readonly gain: number;
    readonly rights: AudioRights;
}

export interface SfxSource {
    readonly url: string;
    readonly gain: number;
}

export const MEDIA_KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,199}$/;
const MEDIA_ROUTE_PREFIX = '/academy/media/audio/';
const THEME_SLOTS = new Set<ThemeSlot>([
    'silence', 'opening.invitation', 'campus.evening', 'classroom.focus', 'library.quiet',
    'lab.listening', 'cafe.social', 'bond.quiet', 'mystery.page', 'challenge.kanji',
    'challenge.major', 'unlock.world', 'support.kindness', 'resolve.late', 'ending.reflective',
]);
const SFX_CUES = new Set<SfxCue>([
    'menu.move', 'menu.confirm', 'menu.cancel', 'action.unavailable', 'scene.advance', 'page.turn',
    'door.open', 'footstep.indoor', 'footstep.wet', 'feedback.correct', 'feedback.repair',
    'feedback.hanamaru', 'bond.unlock', 'bond.rank', 'chapter.complete', 'doodle.stroke',
    'doodle.check', 'radio.tune', 'camera.capture',
]);

export function parseAudioManifest(value: unknown): AudioManifest {
    if (!isRecord(value) || value.version !== 1) throw new TypeError('Audio manifest must declare version 1.');
    if (!Array.isArray(value.themes) || !Array.isArray(value.sfx)) {
        throw new TypeError('Audio manifest needs themes and sfx arrays.');
    }
    const manifest = {
        version: 1,
        themes: value.themes.map(parseThemeEntry),
        sfx: value.sfx.map(parseSfxEntry),
    } satisfies AudioManifest;
    assertUnique(manifest.themes.map(entry => `${entry.slot}:${entry.bus}`), 'theme slot/bus');
    assertUnique(manifest.sfx.map(entry => entry.cue), 'SFX cue');
    return manifest;
}

export function mediaUrlFor(mediaKey: string): string {
    return `${MEDIA_ROUTE_PREFIX}${mediaKey}`;
}

/**
 * Build the AudioDirector catalog from the manifest. Rights are re-checked
 * per track through the existing trackCanPlay gate, so unreviewed or
 * prototype-scoped audio never reaches a release build.
 */
export function catalogFromManifest(manifest: AudioManifest, releaseMode = true): AudioCatalog {
    const overrides: Partial<Record<ThemeSlot, Partial<ThemeDefinition>>> = {};
    for (const entry of manifest.themes) {
        const track = manifestTrack(entry);
        if (!trackCanPlay(track, releaseMode)) continue;
        overrides[entry.slot] = { ...overrides[entry.slot], [entry.bus]: track };
    }
    return createAudioCatalog(overrides);
}

/** Map SFX cues to authorized sources, dropping entries that fail the rights gate. */
export function sfxSourcesFromManifest(manifest: AudioManifest, releaseMode = true): ReadonlyMap<SfxCue, SfxSource> {
    const sources = new Map<SfxCue, SfxSource>();
    for (const entry of manifest.sfx) {
        const probe: AudioTrack = {
            id: `sfx:${entry.cue}`,
            title: entry.cue,
            url: mediaUrlFor(entry.mediaKey),
            loop: false,
            gain: entry.gain,
            rights: entry.rights,
        };
        if (!trackCanPlay(probe, releaseMode)) continue;
        sources.set(entry.cue, { url: probe.url, gain: entry.gain });
    }
    return sources;
}

function parseThemeEntry(value: unknown): ThemeTrackEntry {
    if (!isRecord(value)) throw new TypeError('Theme entry must be an object.');
    const { slot, bus, trackId, title, mediaKey, loop, gain } = value;
    if (
        typeof slot !== 'string' || !THEME_SLOTS.has(slot as ThemeSlot)
        || typeof trackId !== 'string' || !trackId.trim()
        || typeof title !== 'string' || !title.trim()
    ) {
        throw new TypeError('Theme entry needs slot, trackId, and title.');
    }
    if (bus !== 'music' && bus !== 'ambience') throw new TypeError(`Theme entry ${trackId} has invalid bus.`);
    return {
        slot: slot as ThemeSlot,
        bus,
        trackId,
        title,
        mediaKey: parseMediaKey(mediaKey, trackId),
        loop: loop !== false,
        gain: parseGain(gain, trackId),
        rights: parseRights(value.rights, trackId),
    };
}

function parseSfxEntry(value: unknown): SfxEntry {
    if (!isRecord(value) || typeof value.cue !== 'string' || !SFX_CUES.has(value.cue as SfxCue)) {
        throw new TypeError('SFX entry needs a cue name.');
    }
    return {
        cue: value.cue as SfxCue,
        mediaKey: parseMediaKey(value.mediaKey, value.cue),
        gain: parseGain(value.gain, value.cue),
        rights: parseRights(value.rights, value.cue),
    };
}

function manifestTrack(entry: ThemeTrackEntry): AudioTrack {
    return {
        id: entry.trackId,
        title: entry.title,
        url: mediaUrlFor(entry.mediaKey),
        loop: entry.loop,
        gain: entry.gain,
        rights: entry.rights,
    };
}

function parseMediaKey(value: unknown, owner: string): string {
    if (typeof value !== 'string' || !MEDIA_KEY_PATTERN.test(value) || value.includes('..')) {
        throw new TypeError(`Entry ${owner} has an invalid media key.`);
    }
    return value;
}

function parseGain(value: unknown, owner: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError(`Entry ${owner} has an invalid gain.`);
    }
    return value;
}

function parseRights(value: unknown, owner: string): AudioRights {
    if (
        !isRecord(value)
        || typeof value.owner !== 'string' || !value.owner.trim()
        || typeof value.licence !== 'string' || !value.licence.trim()
        || typeof value.source !== 'string' || !value.source.trim()
        || value.reviewed !== true
        || (value.scope !== 'private-prototype' && value.scope !== 'release')
    ) {
        throw new TypeError(`Entry ${owner} is missing a complete reviewed rights block.`);
    }
    return { owner: value.owner, licence: value.licence, source: value.source, reviewed: true, scope: value.scope };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertUnique(values: readonly string[], label: string): void {
    if (new Set(values).size !== values.length) throw new TypeError(`Audio manifest has a duplicate ${label}.`);
}

export const AUTHORIZED_AUDIO_MANIFEST = parseAudioManifest(authorizedManifestJson);
export const AUTHORIZED_AUDIO_CATALOG = catalogFromManifest(AUTHORIZED_AUDIO_MANIFEST, true);
export const AUTHORIZED_SFX_SOURCES = sfxSourcesFromManifest(AUTHORIZED_AUDIO_MANIFEST, true);
