import type { AudioDirectorEvent, AudioDirectorState, AudioSettings } from './types';

export const STORY_VOICE_PLAYBACK_CATALOG_URL = '/academy/audio/story-voice-playback.json';
export const STORY_VOICE_PLAYBACK_SCHEMA = 'yomu-academy.story-voice-playback.v1';

export interface StoryVoiceLine {
    readonly lineId: string;
    readonly speakerId: string;
    readonly japanese: string;
    readonly band?: string;
    readonly sourceSha256?: string;
}

export interface StoryVoicePlaybackEntry extends StoryVoiceLine {
    readonly band: string;
    readonly sourceSha256: string;
    readonly assetSha256: string;
    readonly bytes: number;
    readonly url: string;
    readonly reviewStatus: 'locked';
}

export interface StoryVoicePlaybackCatalog {
    readonly schema: typeof STORY_VOICE_PLAYBACK_SCHEMA;
    readonly entries: readonly StoryVoicePlaybackEntry[];
}

export type StoryVoicePlaybackStatus =
    | 'idle'
    | 'loading'
    | 'available'
    | 'playing'
    | 'ended'
    | 'stopped'
    | 'unavailable'
    | 'muted'
    | 'locked'
    | 'error'
    | 'disposed';

export interface StoryVoicePlaybackSnapshot {
    readonly status: StoryVoicePlaybackStatus;
    readonly lineId?: string;
    readonly url?: string;
    readonly error?: unknown;
}

export interface StoryVoicePlayback {
    readonly snapshot: StoryVoicePlaybackSnapshot;
    setLine(line: StoryVoiceLine | null): Promise<boolean>;
    play(): Promise<boolean>;
    stop(): void;
    onStatus(listener: (snapshot: StoryVoicePlaybackSnapshot) => void): () => void;
    dispose(): void;
}

export interface StoryVoiceMedia {
    preload: string;
    volume: number;
    currentTime: number;
    play(): Promise<void>;
    pause(): void;
    addEventListener(type: 'ended' | 'error', listener: EventListener): void;
    removeEventListener(type: 'ended' | 'error', listener: EventListener): void;
}

export interface StoryVoiceAudioDirector {
    readonly state: AudioDirectorState;
    readonly settings: AudioSettings;
    beginExternalLesson(duck?: number): () => void;
    onEvent(listener: (event: AudioDirectorEvent) => void): () => void;
}

export interface StoryVoicePlaybackOptions {
    readonly director: StoryVoiceAudioDirector;
    readonly catalog?: StoryVoicePlaybackCatalog | Promise<StoryVoicePlaybackCatalog>;
    readonly loadCatalog?: () => Promise<unknown>;
    readonly createMedia?: (url: string) => StoryVoiceMedia;
}

interface ActivePlayback {
    readonly media: StoryVoiceMedia;
    readonly releaseDuck: () => void;
    readonly onEnded: EventListener;
    readonly onError: EventListener;
}

const PLAYABLE_DIRECTOR_STATES = new Set<AudioDirectorState>(['ready', 'playing', 'silent']);
const SHA256 = /^[a-f0-9]{64}$/u;
const PILOT_URL = /^\/academy\/audio\/story-pilot\/[a-z0-9][a-z0-9._-]*\.opus$/u;

export async function loadStoryVoicePlaybackCatalog(
    url = STORY_VOICE_PLAYBACK_CATALOG_URL,
    fetcher: typeof fetch = fetch,
): Promise<StoryVoicePlaybackCatalog> {
    const response = await fetcher(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Story voice catalog request failed (${response.status}).`);
    return parseStoryVoicePlaybackCatalog(await response.json());
}

export function parseStoryVoicePlaybackCatalog(value: unknown): StoryVoicePlaybackCatalog {
    if (!isRecord(value) || value.schema !== STORY_VOICE_PLAYBACK_SCHEMA || !Array.isArray(value.entries)) {
        throw new TypeError('Invalid story voice playback catalog.');
    }
    const seen = new Set<string>();
    const entries = value.entries.map((candidate, index) => {
        if (!isPlaybackEntry(candidate)) throw new TypeError(`Invalid story voice playback entry at index ${index}.`);
        const identity = [candidate.lineId, candidate.speakerId, candidate.japanese, candidate.band].join('\n');
        if (seen.has(identity)) throw new TypeError(`Duplicate story voice playback entry: ${candidate.lineId}.`);
        seen.add(identity);
        return Object.freeze({ ...candidate });
    });
    return Object.freeze({ schema: STORY_VOICE_PLAYBACK_SCHEMA, entries: Object.freeze(entries) });
}

export function resolveStoryVoicePlaybackEntry(
    catalog: StoryVoicePlaybackCatalog,
    line: StoryVoiceLine,
): StoryVoicePlaybackEntry | null {
    return catalog.entries.find(entry => (
        entry.lineId === line.lineId
        && entry.speakerId === line.speakerId
        && entry.japanese === line.japanese
        && (line.band === undefined || entry.band === line.band)
        && (line.sourceSha256 === undefined || entry.sourceSha256 === line.sourceSha256)
    )) ?? null;
}

/** Plays only exact, locked static story assets while AudioDirector owns mix state. */
export function createStoryVoicePlayback(options: StoryVoicePlaybackOptions): StoryVoicePlayback {
    const listeners = new Set<(snapshot: StoryVoicePlaybackSnapshot) => void>();
    const createMedia = options.createMedia ?? (url => new Audio(url));
    const catalogPromise = (options.catalog
        ? Promise.resolve(options.catalog)
        : (options.loadCatalog?.() ?? loadStoryVoicePlaybackCatalog()))
        .then(parseStoryVoicePlaybackCatalog);
    let currentLine: StoryVoiceLine | null = null;
    let currentEntry: StoryVoicePlaybackEntry | null = null;
    let active: ActivePlayback | null = null;
    let lineToken = 0;
    let disposed = false;
    let snapshotValue: StoryVoicePlaybackSnapshot = { status: 'idle' };

    const emit = (status: StoryVoicePlaybackStatus, error?: unknown): void => {
        snapshotValue = {
            status,
            ...(currentLine ? { lineId: currentLine.lineId } : {}),
            ...(currentEntry ? { url: currentEntry.url } : {}),
            ...(error === undefined ? {} : { error }),
        };
        for (const listener of listeners) listener({ ...snapshotValue });
    };

    const releaseActive = (status: StoryVoicePlaybackStatus, pause: boolean, error?: unknown): void => {
        const playback = active;
        if (!playback) return;
        active = null;
        playback.media.removeEventListener('ended', playback.onEnded);
        playback.media.removeEventListener('error', playback.onError);
        if (pause) {
            playback.media.pause();
            try {
                playback.media.currentTime = 0;
            } catch {
                // Some browser media implementations reject seeking before metadata is loaded.
            }
        }
        playback.releaseDuck();
        emit(status, error);
    };

    const resolveCurrent = async (token: number): Promise<StoryVoicePlaybackEntry | null> => {
        if (!currentLine || token !== lineToken || disposed) return null;
        if (currentEntry) return currentEntry;
        try {
            const catalog = await catalogPromise;
            if (!currentLine || token !== lineToken || disposed) return null;
            currentEntry = resolveStoryVoicePlaybackEntry(catalog, currentLine);
            emit(currentEntry ? 'available' : 'unavailable');
            return currentEntry;
        } catch (error) {
            if (token === lineToken && !disposed) emit('error', error);
            return null;
        }
    };

    const unsubscribeDirector = options.director.onEvent(event => {
        if (!active) return;
        if (event.type === 'settings') {
            if (event.settings.muted || event.settings.volumes.lesson <= 0) {
                releaseActive('muted', true);
                return;
            }
            active.media.volume = event.settings.volumes.lesson;
            return;
        }
        if (event.type === 'state' && !PLAYABLE_DIRECTOR_STATES.has(event.state)) {
            releaseActive('locked', true);
        }
    });

    return {
        get snapshot() {
            return { ...snapshotValue };
        },
        async setLine(line) {
            if (disposed) return false;
            lineToken += 1;
            releaseActive('stopped', true);
            currentLine = line ? { ...line } : null;
            currentEntry = null;
            if (!currentLine) {
                emit('idle');
                return false;
            }
            emit('loading');
            return Boolean(await resolveCurrent(lineToken));
        },
        async play() {
            if (disposed || !currentLine) return false;
            const token = lineToken;
            const entry = await resolveCurrent(token);
            if (!entry || token !== lineToken || disposed) return false;
            const settings = options.director.settings;
            if (settings.muted || settings.volumes.lesson <= 0) {
                emit('muted');
                return false;
            }
            if (!PLAYABLE_DIRECTOR_STATES.has(options.director.state)) {
                emit('locked');
                return false;
            }
            releaseActive('stopped', true);
            let media: StoryVoiceMedia;
            let releaseDuck: () => void;
            try {
                media = createMedia(entry.url);
                media.preload = 'auto';
                media.volume = settings.volumes.lesson;
                releaseDuck = options.director.beginExternalLesson();
            } catch (error) {
                emit('error', error);
                return false;
            }
            const onEnded: EventListener = () => {
                if (active?.media === media) releaseActive('ended', false);
            };
            const onError: EventListener = event => {
                if (active?.media === media) releaseActive('error', true, event);
            };
            active = { media, releaseDuck, onEnded, onError };
            media.addEventListener('ended', onEnded);
            media.addEventListener('error', onError);
            emit('playing');
            try {
                await media.play();
                return active?.media === media && token === lineToken && !disposed;
            } catch (error) {
                if (active?.media === media) releaseActive('error', true, error);
                return false;
            }
        },
        stop() {
            if (!disposed) releaseActive('stopped', true);
        },
        onStatus(listener) {
            if (disposed) {
                listener({ ...snapshotValue });
                return () => undefined;
            }
            listeners.add(listener);
            listener({ ...snapshotValue });
            return () => listeners.delete(listener);
        },
        dispose() {
            if (disposed) return;
            lineToken += 1;
            releaseActive('stopped', true);
            disposed = true;
            currentLine = null;
            currentEntry = null;
            unsubscribeDirector();
            emit('disposed');
            listeners.clear();
        },
    };
}

function isPlaybackEntry(value: unknown): value is StoryVoicePlaybackEntry {
    if (!isRecord(value)) return false;
    return (
        typeof value.lineId === 'string'
        && value.lineId.startsWith('line:')
        && typeof value.speakerId === 'string'
        && value.speakerId !== 'learner'
        && value.speakerId !== 'narrator'
        && typeof value.japanese === 'string'
        && value.japanese.length > 0
        && typeof value.band === 'string'
        && SHA256.test(String(value.sourceSha256))
        && SHA256.test(String(value.assetSha256))
        && typeof value.bytes === 'number'
        && Number.isSafeInteger(value.bytes)
        && value.bytes > 0
        && typeof value.url === 'string'
        && PILOT_URL.test(value.url)
        && value.reviewStatus === 'locked'
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
