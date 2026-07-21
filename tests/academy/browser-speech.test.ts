import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioDirector } from '../../src/academy/audio/director';
import { BrowserSpeechPronunciationService } from '../../src/academy/audio/browser-speech';

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>(next => { resolve = next; });
    return { promise, resolve };
}

class FakeUtterance extends EventTarget {
    lang = '';
    rate = 1;
    volume = 1;

    constructor(readonly text: string) {
        super();
    }
}

function harness(unlock: Promise<void> = Promise.resolve()) {
    const release = vi.fn();
    const director = {
        unlock: vi.fn(() => unlock),
        beginExternalLesson: vi.fn(() => release),
        settings: {
            muted: false,
            volumes: { music: 0.7, ambience: 0.6, lesson: 0.65, sfx: 0.8 },
        },
    } as unknown as AudioDirector;
    const synthesis = { cancel: vi.fn(), speak: vi.fn() };
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', synthesis);
    return { director, release, synthesis };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('browser speech playback ownership', () => {
    it('aborts while unlock is pending without creating speech or lesson ducking', async () => {
        const pendingUnlock = deferred<void>();
        const { director, synthesis } = harness(pendingUnlock.promise);
        const service = new BrowserSpeechPronunciationService(director);
        const owner = new AbortController();

        const playback = service.play('古い', undefined, owner.signal);
        await vi.waitFor(() => expect(director.unlock).toHaveBeenCalledOnce());
        owner.abort();

        await expect(playback).rejects.toMatchObject({ name: 'AbortError' });
        expect(director.beginExternalLesson).not.toHaveBeenCalled();
        expect(synthesis.speak).not.toHaveBeenCalled();
        pendingUnlock.resolve();
    });

    it('cancels active speech and removes its abort listener on disposal', async () => {
        const { director, release, synthesis } = harness();
        const service = new BrowserSpeechPronunciationService(director);
        const owner = new AbortController();
        const removeAbortListener = vi.spyOn(owner.signal, 'removeEventListener');

        const playback = await service.play('新しい', undefined, owner.signal);
        expect(synthesis.speak).toHaveBeenCalledOnce();
        owner.abort();

        expect(synthesis.cancel).toHaveBeenCalledTimes(2);
        expect(release).toHaveBeenCalledOnce();
        expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
        playback.dispose();
        expect(release).toHaveBeenCalledOnce();
    });

    it('resolves natural completion and releases ownership exactly once', async () => {
        const { director, release, synthesis } = harness();
        const service = new BrowserSpeechPronunciationService(director);
        const owner = new AbortController();
        const playback = await service.play('完了', undefined, owner.signal);
        const utterance = vi.mocked(synthesis.speak).mock.calls[0][0] as unknown as FakeUtterance;

        utterance.dispatchEvent(new Event('end'));
        await expect(playback.completion).resolves.toBeUndefined();
        expect(release).toHaveBeenCalledOnce();
        owner.abort();
        expect(release).toHaveBeenCalledOnce();
    });

    it('cancels active speech on service disposal and rejects later playback', async () => {
        const { director, release, synthesis } = harness();
        const service = new BrowserSpeechPronunciationService(director);
        await service.play('停止');

        service.dispose();
        service.dispose();

        expect(synthesis.cancel).toHaveBeenCalledTimes(2);
        expect(release).toHaveBeenCalledOnce();
        await expect(service.play('遅い')).rejects.toThrow('disposed');
    });
});
