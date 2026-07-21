import type { AudioDirectorEvent, AudioDirectorState, AudioSettings } from '../../src/academy/audio/types';
import {
    createStoryVoicePlayback,
    parseStoryVoicePlaybackCatalog,
    resolveStoryVoicePlaybackEntry,
    type StoryVoiceAudioDirector,
    type StoryVoiceMedia,
    type StoryVoicePlaybackCatalog,
    type StoryVoicePlaybackEntry,
} from '../../src/academy/audio/voice-lines';

const exactEntry: StoryVoicePlaybackEntry = {
    lineId: 'line:pilot:exact',
    speakerId: 'rie',
    japanese: '聞いてください。',
    band: 'n5',
    sourceSha256: 'a'.repeat(64),
    assetSha256: 'b'.repeat(64),
    bytes: 12_345,
    url: '/academy/audio/story-pilot/pilot-exact__rie.opus',
    reviewStatus: 'locked',
};
const nextEntry: StoryVoicePlaybackEntry = {
    ...exactEntry,
    lineId: 'line:pilot:next',
    japanese: '次の文です。',
    sourceSha256: 'c'.repeat(64),
    assetSha256: 'd'.repeat(64),
    url: '/academy/audio/story-pilot/pilot-next__rie.opus',
};
const catalog: StoryVoicePlaybackCatalog = {
    schema: 'yomu-academy.story-voice-playback.v1',
    entries: [exactEntry, nextEntry],
};

class FakeMedia implements StoryVoiceMedia {
    preload = '';
    volume = 1;
    currentTime = 0;
    readonly play = vi.fn(async () => undefined);
    readonly pause = vi.fn();
    private readonly listeners = new Map<'ended' | 'error', Set<EventListener>>();

    addEventListener(type: 'ended' | 'error', listener: EventListener): void {
        const listeners = this.listeners.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type: 'ended' | 'error', listener: EventListener): void {
        this.listeners.get(type)?.delete(listener);
    }

    emit(type: 'ended' | 'error'): void {
        const event = new Event(type);
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}

function fakeDirector(state: AudioDirectorState = 'ready', muted = false) {
    let stateValue = state;
    let settingsValue: AudioSettings = {
        muted,
        volumes: { music: 0.7, ambience: 0.6, lesson: 0.65, sfx: 0.8 },
    };
    const listeners = new Set<(event: AudioDirectorEvent) => void>();
    const releases: ReturnType<typeof vi.fn>[] = [];
    const target: StoryVoiceAudioDirector = {
        get state() { return stateValue; },
        get settings() { return settingsValue; },
        beginExternalLesson: vi.fn(() => {
            const release = vi.fn();
            releases.push(release);
            return release;
        }),
        onEvent(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return {
        target,
        releases,
        listenerCount: () => listeners.size,
        setState(next: AudioDirectorState) {
            stateValue = next;
            for (const listener of listeners) listener({ type: 'state', state: next });
        },
        setSettings(next: AudioSettings) {
            settingsValue = next;
            for (const listener of listeners) listener({ type: 'settings', settings: next });
        },
    };
}

function exactLine(overrides: Partial<Parameters<typeof resolveStoryVoicePlaybackEntry>[1]> = {}) {
    return {
        lineId: exactEntry.lineId,
        speakerId: exactEntry.speakerId,
        japanese: exactEntry.japanese,
        band: exactEntry.band,
        sourceSha256: exactEntry.sourceSha256,
        ...overrides,
    };
}

describe('Academy static story voice playback', () => {
    it('resolves and plays only an exact locked catalog identity', async () => {
        expect(resolveStoryVoicePlaybackEntry(catalog, exactLine())).toEqual(exactEntry);
        expect(resolveStoryVoicePlaybackEntry(catalog, exactLine({ japanese: '聞いてください！' }))).toBeNull();
        expect(resolveStoryVoicePlaybackEntry(catalog, exactLine({ speakerId: 'learner' }))).toBeNull();
        expect(resolveStoryVoicePlaybackEntry(catalog, exactLine({ band: 'n4' }))).toBeNull();
        expect(resolveStoryVoicePlaybackEntry(catalog, exactLine({ sourceSha256: 'e'.repeat(64) }))).toBeNull();

        const director = fakeDirector();
        const media = new FakeMedia();
        const createMedia = vi.fn(() => media);
        const playback = createStoryVoicePlayback({ director: director.target, catalog, createMedia });

        expect(await playback.setLine(exactLine())).toBe(true);
        expect(playback.snapshot.status).toBe('available');
        expect(await playback.play()).toBe(true);
        expect(createMedia).toHaveBeenCalledWith(exactEntry.url);
        expect(media.volume).toBe(0.65);
        expect(media.preload).toBe('auto');
        expect(playback.snapshot.status).toBe('playing');
        media.emit('ended');
        expect(director.releases[0]).toHaveBeenCalledOnce();
        expect(playback.snapshot.status).toBe('ended');
    });

    it('keeps stale or mismatched text unavailable without creating media', async () => {
        const director = fakeDirector();
        const createMedia = vi.fn(() => new FakeMedia());
        const playback = createStoryVoicePlayback({ director: director.target, catalog, createMedia });

        expect(await playback.setLine(exactLine({ japanese: '古い台詞です。' }))).toBe(false);
        expect(playback.snapshot.status).toBe('unavailable');
        expect(await playback.play()).toBe(false);
        expect(createMedia).not.toHaveBeenCalled();
        expect(director.releases).toHaveLength(0);
    });

    it('stops and unducks the old voice synchronously when the line changes', async () => {
        const director = fakeDirector();
        const first = new FakeMedia();
        const second = new FakeMedia();
        const createMedia = vi.fn()
            .mockReturnValueOnce(first)
            .mockReturnValueOnce(second);
        const playback = createStoryVoicePlayback({ director: director.target, catalog, createMedia });

        await playback.setLine(exactLine());
        await playback.play();
        const nextLine = {
            lineId: nextEntry.lineId,
            speakerId: nextEntry.speakerId,
            japanese: nextEntry.japanese,
            band: nextEntry.band,
            sourceSha256: nextEntry.sourceSha256,
        };
        const availability = playback.setLine(nextLine);

        expect(first.pause).toHaveBeenCalledOnce();
        expect(first.currentTime).toBe(0);
        expect(director.releases[0]).toHaveBeenCalledOnce();
        expect(await availability).toBe(true);
        expect(await playback.play()).toBe(true);
        expect(createMedia).toHaveBeenCalledTimes(2);
    });

    it('is safe while muted or locked and releases ducking when playback fails', async () => {
        const mutedDirector = fakeDirector('ready', true);
        const mutedMedia = vi.fn(() => new FakeMedia());
        const muted = createStoryVoicePlayback({ director: mutedDirector.target, catalog, createMedia: mutedMedia });
        await muted.setLine(exactLine());
        expect(await muted.play()).toBe(false);
        expect(muted.snapshot.status).toBe('muted');
        expect(mutedMedia).not.toHaveBeenCalled();

        const lockedDirector = fakeDirector('locked');
        const lockedMedia = vi.fn(() => new FakeMedia());
        const locked = createStoryVoicePlayback({ director: lockedDirector.target, catalog, createMedia: lockedMedia });
        await locked.setLine(exactLine());
        expect(await locked.play()).toBe(false);
        expect(locked.snapshot.status).toBe('locked');
        expect(lockedMedia).not.toHaveBeenCalled();

        const errorDirector = fakeDirector();
        const failedMedia = new FakeMedia();
        failedMedia.play.mockRejectedValueOnce(new Error('media failed'));
        const failed = createStoryVoicePlayback({
            director: errorDirector.target,
            catalog,
            createMedia: () => failedMedia,
        });
        await failed.setLine(exactLine());
        expect(await failed.play()).toBe(false);
        expect(failed.snapshot).toMatchObject({ status: 'error', error: expect.any(Error) });
        expect(failedMedia.pause).toHaveBeenCalledOnce();
        expect(errorDirector.releases[0]).toHaveBeenCalledOnce();
    });

    it('tracks AudioDirector settings and disposal without leaving media or ducking active', async () => {
        const director = fakeDirector();
        const media = new FakeMedia();
        const playback = createStoryVoicePlayback({ director: director.target, catalog, createMedia: () => media });
        await playback.setLine(exactLine());
        await playback.play();

        director.setSettings({
            muted: false,
            volumes: { music: 0.7, ambience: 0.6, lesson: 0.2, sfx: 0.8 },
        });
        expect(media.volume).toBe(0.2);
        director.setSettings({
            muted: true,
            volumes: { music: 0.7, ambience: 0.6, lesson: 0.2, sfx: 0.8 },
        });
        expect(media.pause).toHaveBeenCalledOnce();
        expect(director.releases[0]).toHaveBeenCalledOnce();
        expect(playback.snapshot.status).toBe('muted');
        director.setSettings({
            muted: false,
            volumes: { music: 0.7, ambience: 0.6, lesson: 0.4, sfx: 0.8 },
        });
        expect(await playback.play()).toBe(true);
        playback.dispose();

        expect(media.pause).toHaveBeenCalledTimes(2);
        expect(director.releases[1]).toHaveBeenCalledOnce();
        expect(director.listenerCount()).toBe(0);
        expect(playback.snapshot.status).toBe('disposed');
        expect(await playback.setLine(exactLine())).toBe(false);
    });

    it('rejects non-pilot, unreviewed, learner, and duplicate public catalog entries', () => {
        expect(() => parseStoryVoicePlaybackCatalog({
            schema: catalog.schema,
            entries: [{ ...exactEntry, url: '/voice/line?id=admin' }],
        })).toThrow('Invalid story voice playback entry');
        expect(() => parseStoryVoicePlaybackCatalog({
            schema: catalog.schema,
            entries: [{ ...exactEntry, reviewStatus: 'pending' }],
        })).toThrow('Invalid story voice playback entry');
        expect(() => parseStoryVoicePlaybackCatalog({
            schema: catalog.schema,
            entries: [{ ...exactEntry, speakerId: 'learner' }],
        })).toThrow('Invalid story voice playback entry');
        expect(() => parseStoryVoicePlaybackCatalog({
            schema: catalog.schema,
            entries: [exactEntry, exactEntry],
        })).toThrow('Duplicate story voice playback entry');
    });
});
