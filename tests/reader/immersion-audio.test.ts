import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewTabImmersionAudioPlayer, type NewTabImmersionAudioPlayerDeps } from '../../src/reader/newtab/immersion-audio';
import type { ImmersionKitClient } from '../../src/reader/immersion/kit';
import type { ReaderSettings } from '../../src/reader/app/types';

class FakeAudio {
    static instances: FakeAudio[] = [];
    static playBehavior: (src: string) => Promise<void> = async () => {};
    playbackRate = 1;
    ended = false;
    paused = false;
    private listeners: Record<string, Array<() => void>> = {};
    constructor(public src: string) { FakeAudio.instances.push(this); }
    addEventListener(type: string, cb: () => void): void { (this.listeners[type] ??= []).push(cb); }
    pause(): void { this.paused = true; }
    play(): Promise<void> { return FakeAudio.playBehavior(this.src); }
    dispatch(type: string): void { (this.listeners[type] ?? []).forEach(cb => cb()); }
}

function makePlayer(over: Partial<NewTabImmersionAudioPlayerDeps> = {}) {
    const fetchBlobUrl = vi.fn(async (): Promise<string> => '');
    const player = new NewTabImmersionAudioPlayer({
        getSettings: () => ({ immersionKitPlaybackRate: 1.5, audioTimeoutMs: 1000, corsProxyUrl: '', interfaceLanguage: 'en' }) as ReaderSettings,
        immersionKit: { fetchBlobUrl } as unknown as ImmersionKitClient,
        ...over,
    });
    return { player, fetchBlobUrl };
}

describe('NewTabImmersionAudioPlayer', () => {
    beforeEach(() => {
        FakeAudio.instances = [];
        FakeAudio.playBehavior = async () => {};
        vi.stubGlobal('Audio', FakeAudio);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('plays the first candidate at the configured rate and reports playing for its key', async () => {
        const { player, fetchBlobUrl } = makePlayer();
        await player.playSource({ urls: ['a.mp3', 'b.mp3'], key: 'k1' }, () => true);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3']);
        expect(FakeAudio.instances[0]?.playbackRate).toBe(1.5);
        expect(player.isPlaying('k1')).toBe(true);
        expect(player.isPlaying('other')).toBe(false);
        expect(fetchBlobUrl).not.toHaveBeenCalled();
    });

    it('falls through to the next candidate when play() rejects', async () => {
        const { player } = makePlayer();
        FakeAudio.playBehavior = async src => { if (src === 'a.mp3') throw new Error('autoplay blocked'); };
        await player.playSource({ urls: ['a.mp3', 'b.mp3'], key: 'k1' }, () => true);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3', 'b.mp3']);
        expect(player.isPlaying('k1')).toBe(true);
    });

    it('fetches a blob fallback when every direct candidate fails', async () => {
        const { player, fetchBlobUrl } = makePlayer();
        fetchBlobUrl.mockResolvedValue('blob:fallback');
        FakeAudio.playBehavior = async src => { if (src !== 'blob:fallback') throw new Error('direct blocked'); };
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(fetchBlobUrl).toHaveBeenCalledTimes(1);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3', 'blob:fallback']);
        expect(FakeAudio.instances[1]?.paused).toBe(false); // the blob did play
        // Faithful quirk: unlike the direct-candidate path (which returns early), the blob path
        // falls through to clearRequest(), so the element plays but tracking is cleared.
        expect(player.isPlaying('k1')).toBe(false);
    });

    it('deduplicates and trims candidate urls', async () => {
        const { player } = makePlayer();
        FakeAudio.playBehavior = async () => { throw new Error('blocked'); };
        await player.playSource({ urls: [' a.mp3 ', 'a.mp3', ''], key: 'k1' }, () => true);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3']);
    });

    it('does not attach audio when the card is no longer current', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => false);
        expect(FakeAudio.instances).toHaveLength(0);
        expect(player.isPlaying('k1')).toBe(false);
    });

    it('clears playback when the active element fires ended or error', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(player.isPlaying('k1')).toBe(true);
        FakeAudio.instances[0]?.dispatch('ended');
        expect(player.isPlaying('k1')).toBe(false);

        await player.playSource({ urls: ['b.mp3'], key: 'k2' }, () => true);
        expect(player.isPlaying('k2')).toBe(true);
        FakeAudio.instances[1]?.dispatch('error');
        expect(player.isPlaying('k2')).toBe(false);
    });

    it('ignores ended from a stale element after a newer source begins', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        const stale = FakeAudio.instances[0];
        await player.playSource({ urls: ['b.mp3'], key: 'k2' }, () => true);
        expect(player.isPlaying('k2')).toBe(true);
        stale?.dispatch('ended'); // identity guard: not the current element
        expect(player.isPlaying('k2')).toBe(true);
    });

    it('does not keep a direct candidate that resolves after the request was invalidated', async () => {
        const { player } = makePlayer();
        let resolvePlay = (): void => {};
        FakeAudio.playBehavior = () => new Promise<void>(res => { resolvePlay = res; });
        const pending = player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        player.reset(); // a newer card arrives while k1's play() is still pending
        resolvePlay();
        await pending;
        expect(player.isPlaying('k1')).toBe(false);
        expect(FakeAudio.instances[0]?.paused).toBe(true);
    });

    it('reset() stops playback and reports not playing', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(player.isPlaying('k1')).toBe(true);
        player.reset();
        expect(player.isPlaying('k1')).toBe(false);
        expect(FakeAudio.instances[0]?.paused).toBe(true);
    });

    it('does not play a blob that resolves after the request was invalidated', async () => {
        let invalidate = (): void => {};
        const fetchBlobUrl = vi.fn(async (): Promise<string> => { invalidate(); return 'blob:late'; });
        const { player } = makePlayer({ immersionKit: { fetchBlobUrl } as unknown as ImmersionKitClient });
        invalidate = () => player.reset(); // a newer card arrives while the blob is in flight
        FakeAudio.playBehavior = async src => { if (src !== 'blob:late') throw new Error('direct blocked'); };
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(FakeAudio.instances.some(a => a.src === 'blob:late')).toBe(false);
        expect(player.isPlaying('k1')).toBe(false);
    });
});
