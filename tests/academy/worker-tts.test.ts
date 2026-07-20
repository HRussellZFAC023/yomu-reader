import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioDirector } from '../../src/academy/audio/director';
import type {
    ExactLearningVoiceResult,
    LearningVoiceLineIdentity,
    LearningVoicePlayback,
} from '../../src/academy/audio/learning-voice';
import { WorkerTtsPronunciationService } from '../../src/academy/audio/worker-tts';
import type { Disposable, PronunciationService } from '../../src/academy/integration/yomu-bridge';

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>(next => { resolve = next; });
    return { promise, resolve };
}

function disposable(): Disposable {
    return { dispose: vi.fn() };
}

function learningPlayback() {
    let fail: () => void = () => undefined;
    const playback: LearningVoicePlayback = {
        dispose: vi.fn(),
        failure: new Promise<void>(resolve => { fail = resolve; }),
        completion: new Promise<void>(() => undefined),
    };
    return { playback, fail };
}

function playing(playback: LearningVoicePlayback): ExactLearningVoiceResult {
    return { status: 'playing', playback };
}

function identity(lineId: string, japanese: string): LearningVoiceLineIdentity {
    return { lineId, japanese, sourceSha256: '0'.repeat(64) };
}

function director() {
    const releases: ReturnType<typeof vi.fn>[] = [];
    const target = {
        unlock: vi.fn(async () => undefined),
        beginExternalLesson: vi.fn(() => {
            const release = vi.fn();
            releases.push(release);
            return release;
        }),
        settings: {
            muted: false,
            volumes: { music: 0.7, ambience: 0.6, lesson: 0.65, sfx: 0.8 },
        },
    } as unknown as AudioDirector;
    return { target, releases };
}

class FakeAudio {
    src = '';
    volume = 1;
    readonly pause = vi.fn();
    readonly play = vi.fn(async () => undefined);
    private readonly listeners = new Map<'ended' | 'error', Set<EventListener>>();

    addEventListener(type: 'ended' | 'error', listener: EventListener): void {
        const set = this.listeners.get(type) ?? new Set<EventListener>();
        set.add(listener);
        this.listeners.set(type, set);
    }

    removeEventListener(type: 'ended' | 'error', listener: EventListener): void {
        this.listeners.get(type)?.delete(listener);
    }

    emit(type: 'ended' | 'error'): void {
        for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
    }
}

function installWorkerMedia() {
    const media: FakeAudio[] = [];
    vi.stubGlobal('Audio', vi.fn(() => {
        const element = new FakeAudio();
        media.push(element);
        return element;
    }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['audio']), { status: 200 })));
    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => `blob:voice-${media.length}`),
        revokeObjectURL: vi.fn(),
    });
    return media;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Academy pronunciation request ownership', () => {
    it('uses an exact line-addressed learning voice without touching network or browser fallback', async () => {
        const exact = learningPlayback();
        const staticVoice = {
            playExact: vi.fn(async () => ({ status: 'miss' as const })),
            playLine: vi.fn(async () => playing(exact.playback)),
        };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);
        const source = identity('world-practice:cafe-coffee-price', 'コーヒーは三百円です。');

        const result = await service.playLine(source);
        expect(result.status).toBe('playing');
        expect(staticVoice.playLine).toHaveBeenCalledWith(source, expect.any(AbortSignal));
        expect(staticVoice.playExact).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(fallback.play).not.toHaveBeenCalled();
        if (result.status === 'playing') result.playback.dispose();
        expect(exact.playback.dispose).toHaveBeenCalledOnce();
    });

    it('does not let a stale line miss fall back or dispose newer audio', async () => {
        const pending = deferred<ExactLearningVoiceResult>();
        const current = learningPlayback();
        const staticVoice = {
            playExact: vi.fn(async () => ({ status: 'miss' as const })),
            playLine: vi.fn()
                .mockReturnValueOnce(pending.promise)
                .mockResolvedValueOnce(playing(current.playback)),
        };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        vi.stubGlobal('fetch', vi.fn());
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        const first = service.playLine(identity('line:old', '古い'));
        await service.playLine(identity('line:new', '新しい'));
        pending.resolve({ status: 'miss' });
        await first;

        expect(fetch).not.toHaveBeenCalled();
        expect(fallback.play).not.toHaveBeenCalled();
        expect(current.playback.dispose).not.toHaveBeenCalled();
    });

    it('aborts a stale static request before its late resolution can start duplicate playback', async () => {
        const releaseStale = deferred<void>();
        const stalePlayback = learningPlayback();
        const current = learningPlayback();
        const starts: string[] = [];
        let staleSignal: AbortSignal | undefined;
        const staticVoice = {
            playExact: vi.fn(async () => ({ status: 'miss' as const })),
            playLine: vi.fn()
                .mockImplementationOnce((_identity: LearningVoiceLineIdentity, signal?: AbortSignal) => {
                    staleSignal = signal;
                    return releaseStale.promise.then(() => {
                        if (signal?.aborted) return { status: 'superseded' as const };
                        starts.push('stale');
                        return playing(stalePlayback.playback);
                    });
                })
                .mockImplementationOnce(async (_identity: LearningVoiceLineIdentity, signal?: AbortSignal) => {
                    if (!signal?.aborted) starts.push('new');
                    return playing(current.playback);
                }),
        };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        const stale = service.playLine(identity('line:stale', '古い'));
        await vi.waitFor(() => expect(staleSignal).toBeDefined());
        const newest = await service.playLine(identity('line:new', '新しい'));
        releaseStale.resolve();

        expect(newest.status).toBe('playing');
        await expect(stale).resolves.toEqual({ status: 'superseded' });
        expect(staleSignal?.aborted).toBe(true);
        expect(starts).toEqual(['new']);
        expect(stalePlayback.playback.dispose).not.toHaveBeenCalled();
        expect(current.playback.dispose).not.toHaveBeenCalled();
        expect(fallback.play).not.toHaveBeenCalled();
    });

    it('aborts a stale worker fetch before the newer request can play', async () => {
        const staticVoice = { playExact: vi.fn(async () => ({ status: 'miss' as const })) };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        let staleSignal: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn()
            .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
                staleSignal = init?.signal ?? undefined;
                return new Promise<Response>((_resolve, reject) => {
                    staleSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                });
            })
            .mockResolvedValueOnce(new Response(null, { status: 503 })));
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        const stale = service.play('古い');
        await vi.waitFor(() => expect(staleSignal).toBeDefined());
        const newest = await service.play('新しい');
        await stale;

        expect(staleSignal?.aborted).toBe(true);
        expect(staticVoice.playExact).not.toHaveBeenCalled();
        expect(fallback.play).toHaveBeenCalledWith('新しい', undefined, expect.any(AbortSignal));
        newest.dispose();
    });

    it('preserves worker then browser fallback for ordinary pronunciation', async () => {
        const fallbackPlayback = disposable();
        const fallback: PronunciationService = { play: vi.fn(async () => fallbackPlayback) };
        const staticVoice = { playExact: vi.fn(async () => ({ status: 'miss' as const })) };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        await expect(service.play('未収録の語')).resolves.toBeDefined();
        expect(staticVoice.playExact).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledOnce();
        expect(fallback.play).toHaveBeenCalledWith('未収録の語', undefined, expect.any(AbortSignal));
    });

    it('aborts pending browser fallback ownership before a stale completion can start', async () => {
        const releaseStale = deferred<void>();
        const stalePlayback = disposable();
        const newestPlayback = disposable();
        const starts: string[] = [];
        let staleSignal: AbortSignal | undefined;
        const fallback: PronunciationService = {
            play: vi.fn()
                .mockImplementationOnce((_term: string, _reading?: string, signal?: AbortSignal) => {
                    staleSignal = signal;
                    return releaseStale.promise.then(() => {
                        if (!signal?.aborted) starts.push('stale');
                        return stalePlayback;
                    });
                })
                .mockImplementationOnce(async (_term: string, _reading?: string, signal?: AbortSignal) => {
                    if (!signal?.aborted) starts.push('new');
                    return newestPlayback;
                }),
        };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
        const service = new WorkerTtsPronunciationService(
            director().target,
            fallback,
            { playExact: vi.fn(async () => ({ status: 'miss' as const })) },
        );

        const stale = service.play('古い');
        await vi.waitFor(() => expect(staleSignal).toBeDefined());
        await service.play('新しい');
        releaseStale.resolve();
        await stale;

        expect(staleSignal?.aborted).toBe(true);
        expect(starts).toEqual(['new']);
        expect(stalePlayback.dispose).toHaveBeenCalledOnce();
        expect(newestPlayback.dispose).not.toHaveBeenCalled();
    });

    it('does not bypass a stale binding miss through generic static text lookup', async () => {
        const fallbackPlayback = disposable();
        const fallback: PronunciationService = { play: vi.fn(async () => fallbackPlayback) };
        const staticVoice = {
            playExact: vi.fn(async () => ({ status: 'playing' as const, playback: learningPlayback().playback })),
            playLine: vi.fn(async () => ({ status: 'miss' as const })),
        };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);
        const identity: LearningVoiceLineIdentity = {
            lineId: 'world-practice:stale',
            japanese: 'もう一度お願いします。',
            sourceSha256: '0'.repeat(64),
        };

        const result = await service.playLine(identity);

        expect(result.status).toBe('playing');
        expect(staticVoice.playLine).toHaveBeenCalledWith(identity, expect.any(AbortSignal));
        expect(staticVoice.playExact).not.toHaveBeenCalled();
        expect(fallback.play).toHaveBeenCalledWith(identity.japanese, undefined, expect.any(AbortSignal));
        if (result.status === 'playing') result.playback.dispose();
    });

    it('recovers a late static-media error through the worker without browser speech', async () => {
        const exact = learningPlayback();
        const staticVoice = {
            playExact: vi.fn(async () => ({ status: 'miss' as const })),
            playLine: vi.fn(async () => playing(exact.playback)),
        };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        const media = installWorkerMedia();
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        await service.playLine(identity('world-practice:lab-classroom-repair', 'もう一度お願いします。'));
        exact.fail();
        await vi.waitFor(() => expect(media).toHaveLength(1));
        expect(media[0].play).toHaveBeenCalledOnce();
        expect(fallback.play).not.toHaveBeenCalled();
    });

    it('recovers a late worker-media error through browser speech', async () => {
        const staticVoice = { playExact: vi.fn(async () => ({ status: 'miss' as const })) };
        const fallbackPlayback = disposable();
        const fallback: PronunciationService = { play: vi.fn(async () => fallbackPlayback) };
        const media = installWorkerMedia();
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        await service.play('未収録の語');
        media[0].emit('error');
        await vi.waitFor(() => expect(fallback.play).toHaveBeenCalledOnce());
        expect(fallback.play).toHaveBeenCalledWith('未収録の語', undefined, expect.any(AbortSignal));
    });

    it('ignores a late error from static audio that has already been superseded', async () => {
        const first = learningPlayback();
        const second = learningPlayback();
        const staticVoice = {
            playExact: vi.fn(async () => ({ status: 'miss' as const })),
            playLine: vi.fn()
                .mockResolvedValueOnce(playing(first.playback))
                .mockResolvedValueOnce(playing(second.playback)),
        };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        vi.stubGlobal('fetch', vi.fn());
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        await service.playLine(identity('line:first', '一つ目'));
        await service.playLine(identity('line:second', '二つ目'));
        first.fail();
        await Promise.resolve();

        expect(first.playback.dispose).toHaveBeenCalledOnce();
        expect(second.playback.dispose).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
        expect(fallback.play).not.toHaveBeenCalled();
    });

    it('falls back when worker media rejects its initial play promise', async () => {
        const staticVoice = { playExact: vi.fn(async () => ({ status: 'miss' as const })) };
        const fallback: PronunciationService = { play: vi.fn(async () => disposable()) };
        const media = installWorkerMedia();
        const audioConstructor = vi.mocked(globalThis.Audio);
        audioConstructor.mockImplementationOnce(() => {
            const element = new FakeAudio();
            element.play.mockRejectedValueOnce(new Error('blocked'));
            media.push(element);
            return element as unknown as HTMLAudioElement;
        });
        const service = new WorkerTtsPronunciationService(director().target, fallback, staticVoice);

        await service.play('未収録の語');
        expect(fallback.play).toHaveBeenCalledOnce();
    });
});
