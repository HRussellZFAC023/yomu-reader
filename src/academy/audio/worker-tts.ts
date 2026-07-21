import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { AudioDirector } from './director';
import { BrowserSpeechPronunciationService } from './browser-speech';
import {
    StaticLearningVoiceService,
    type ExactLearningVoiceResult,
    type ExactLearningVoiceService,
    type LearningVoiceLineIdentity,
    type LearningVoicePlayback,
} from './learning-voice';

const TTS_ENDPOINT = 'https://audio.yomureader.com/audio/tts';
export const WORKER_TTS_CACHE_LIMIT = 8;

class RequestPlayback implements LearningVoicePlayback {
    readonly failure = new Promise<void>(() => undefined);
    readonly completion: Promise<void>;
    private readonly abortController = new AbortController();
    private playback: Disposable | null = null;
    private stopped = false;
    private resolveCompletion: () => void = () => undefined;
    private readonly onExternalAbort = () => this.dispose();

    constructor(
        private readonly onStop: () => void,
        private readonly externalSignal?: AbortSignal,
    ) {
        this.completion = new Promise<void>(resolve => { this.resolveCompletion = resolve; });
        if (!externalSignal?.aborted) {
            externalSignal?.addEventListener('abort', this.onExternalAbort, { once: true });
        }
    }

    get disposed(): boolean {
        return this.stopped;
    }

    get signal(): AbortSignal {
        return this.abortController.signal;
    }

    replace(playback: Disposable): boolean {
        if (this.stopped) {
            playback.dispose();
            return false;
        }
        this.playback?.dispose();
        this.playback = playback;
        void playback.completion?.then(() => {
            if (!this.stopped && this.playback === playback) {
                this.resolveCompletion();
                this.dispose();
            }
        });
        return true;
    }

    dispose(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.externalSignal?.removeEventListener('abort', this.onExternalAbort);
        this.abortController.abort(this.externalSignal?.reason);
        this.playback?.dispose();
        this.playback = null;
        this.onStop();
    }
}

/**
 * Stable line bindings use reviewed static Academy audio; misses and ordinary
 * pronunciation use the deployed worker, then browser speech. One request
 * owner spans the ladder so stale work can never stop newer playback.
 */
export class WorkerTtsPronunciationService implements PronunciationService {
    private readonly fallback: PronunciationService;
    private readonly cache = new Map<string, string>();
    private active: RequestPlayback | null = null;
    private disposed = false;

    constructor(
        private readonly director: AudioDirector,
        fallback: PronunciationService = new BrowserSpeechPronunciationService(director),
        private readonly staticVoice: ExactLearningVoiceService = new StaticLearningVoiceService(director),
    ) {
        this.fallback = fallback;
    }

    async play(term: string, reading?: string, signal?: AbortSignal): Promise<Disposable> {
        this.throwIfDisposed();
        const request = this.beginRequest(signal);
        if (!this.isCurrent(request)) return request;
        try {
            await this.startWorkerOrBrowser(request, term, reading);
            return request;
        } catch (error) {
            const aborted = request.disposed || signal?.aborted;
            request.dispose();
            if (aborted) return request;
            throw error;
        }
    }

    /** A binding miss bypasses generic static lookup and enters the worker/browser ladder directly. */
    async playLine(identity: LearningVoiceLineIdentity, signal?: AbortSignal): Promise<ExactLearningVoiceResult> {
        this.throwIfDisposed();
        const request = this.beginRequest(signal);
        if (!this.isCurrent(request)) return { status: 'superseded' };
        let exact: ExactLearningVoiceResult;
        try {
            exact = this.staticVoice.playLine
                ? await this.staticVoice.playLine(identity, request.signal)
                : { status: 'miss' as const };
        } catch {
            if (!this.isCurrent(request)) return { status: 'superseded' };
            exact = { status: 'miss' };
        }
        if (!this.isCurrent(request)) {
            this.disposeExactResult(exact);
            return { status: 'superseded' };
        }
        if (exact.status === 'superseded') {
            request.dispose();
            return exact;
        }
        if (exact.status === 'miss') {
            try {
                await this.startWorkerOrBrowser(request, identity.japanese);
            } catch (error) {
                request.dispose();
                throw error;
            }
            return this.isCurrent(request)
                ? { status: 'playing', playback: request }
                : { status: 'superseded' };
        }
        this.useStaticPlayback(request, exact.playback, identity.japanese);
        return { status: 'playing', playback: request };
    }

    private beginRequest(signal?: AbortSignal): RequestPlayback {
        this.active?.dispose();
        let request: RequestPlayback;
        request = new RequestPlayback(() => {
            if (this.active === request) this.active = null;
        }, signal);
        this.active = request;
        if (signal?.aborted) request.dispose();
        return request;
    }

    private isCurrent(request: RequestPlayback): boolean {
        return !this.disposed && this.active === request && !request.disposed;
    }

    private useStaticPlayback(
        request: RequestPlayback,
        playback: LearningVoicePlayback,
        term: string,
        reading?: string,
    ): void {
        if (!request.replace(playback)) return;
        void playback.failure.then(async () => {
            if (!this.isCurrent(request)) return;
            try {
                await this.startWorkerOrBrowser(request, term, reading);
            } catch {
                request.dispose();
            }
        });
    }

    private async startWorkerOrBrowser(
        request: RequestPlayback,
        term: string,
        reading?: string,
    ): Promise<void> {
        const worker = await this.startWorkerPlayback(request, term, reading);
        if (!this.isCurrent(request)) {
            worker?.dispose();
            return;
        }
        if (!worker) {
            await this.startBrowserPlayback(request, term, reading);
            return;
        }
        if (!request.replace(worker)) return;
        void worker.failure.then(async () => {
            if (!this.isCurrent(request)) return;
            try {
                await this.startBrowserPlayback(request, term, reading);
            } catch {
                request.dispose();
            }
        });
    }

    private async startBrowserPlayback(
        request: RequestPlayback,
        term: string,
        reading?: string,
    ): Promise<void> {
        if (!this.isCurrent(request)) return;
        const playback = await this.fallback.play(term, reading, request.signal);
        if (!this.isCurrent(request)) {
            playback.dispose();
            return;
        }
        request.replace(playback);
    }

    private async startWorkerPlayback(
        request: RequestPlayback,
        term: string,
        reading?: string,
    ): Promise<LearningVoicePlayback | null> {
        const cacheKey = `${term.trim()}|${(reading ?? '').trim()}`;
        let objectUrl = this.cachedObjectUrl(cacheKey);
        if (!objectUrl) {
            const fetchedObjectUrl = await this.fetchObjectUrl(term, reading, request.signal);
            if (!fetchedObjectUrl) return null;
            if (!this.isCurrent(request)) {
                URL.revokeObjectURL(fetchedObjectUrl);
                return null;
            }
            objectUrl = fetchedObjectUrl;
            // Reuse successful worker audio for the app-lifetime service; canceled
            // fetches are revoked above before they can enter this bounded replay cache.
            this.cacheObjectUrl(cacheKey, objectUrl);
        }
        if (!this.isCurrent(request)) return null;

        try {
            await waitForAbort(this.director.unlock(), request.signal);
        } catch {
            return null;
        }
        if (!this.isCurrent(request)) return null;

        const element = new Audio();
        element.src = objectUrl;
        element.volume = this.director.settings.muted ? 0 : this.director.settings.volumes.lesson;
        let releaseDuck: () => void;
        try {
            releaseDuck = this.director.beginExternalLesson();
        } catch {
            return null;
        }
        let stopped = false;
        let resolveFailure: () => void = () => undefined;
        let resolveCompletion: () => void = () => undefined;
        const failure = new Promise<void>(resolve => { resolveFailure = resolve; });
        const completion = new Promise<void>(resolve => { resolveCompletion = resolve; });
        const release = (pause: boolean) => {
            if (stopped) return;
            stopped = true;
            if (pause) element.pause();
            element.removeEventListener('ended', onEnded);
            element.removeEventListener('error', onError);
            request.signal.removeEventListener('abort', onAbort);
            releaseDuck();
        };
        const onEnded: EventListener = () => {
            resolveCompletion();
            release(false);
        };
        const onError: EventListener = () => {
            resolveFailure();
            release(false);
        };
        const onAbort = () => release(true);
        const playback: LearningVoicePlayback = {
            failure,
            completion,
            dispose: () => release(true),
        };
        element.addEventListener('ended', onEnded, { once: true });
        element.addEventListener('error', onError, { once: true });
        request.signal.addEventListener('abort', onAbort, { once: true });
        if (!this.isCurrent(request)) {
            playback.dispose();
            return null;
        }
        try {
            await waitForAbort(element.play(), request.signal);
        } catch {
            playback.dispose();
            return null;
        }
        if (!this.isCurrent(request)) {
            playback.dispose();
            return null;
        }
        return playback;
    }

    private disposeExactResult(result: ExactLearningVoiceResult): void {
        if (result.status === 'playing') result.playback.dispose();
    }

    private async fetchObjectUrl(
        term: string,
        reading: string | undefined,
        signal: AbortSignal,
    ): Promise<string | null> {
        const params = new URLSearchParams({ term, reading: (reading ?? term) });
        try {
            const response = await fetch(`${TTS_ENDPOINT}?${params.toString()}`, { signal });
            if (!response.ok) return null;
            const blob = await response.blob();
            if (signal.aborted) return null;
            return URL.createObjectURL(blob);
        } catch {
            return null;
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.active?.dispose();
        this.active = null;
        this.staticVoice.dispose?.();
        this.fallback.dispose?.();
        for (const objectUrl of this.cache.values()) URL.revokeObjectURL(objectUrl);
        this.cache.clear();
    }

    private throwIfDisposed(): void {
        if (this.disposed) throw new Error('Pronunciation service has been disposed.');
    }

    private cachedObjectUrl(cacheKey: string): string | undefined {
        const objectUrl = this.cache.get(cacheKey);
        if (!objectUrl) return undefined;
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, objectUrl);
        return objectUrl;
    }

    private cacheObjectUrl(cacheKey: string, objectUrl: string): void {
        this.cache.set(cacheKey, objectUrl);
        while (this.cache.size > WORKER_TTS_CACHE_LIMIT) {
            const oldest = this.cache.entries().next().value as [string, string] | undefined;
            if (!oldest) return;
            this.cache.delete(oldest[0]);
            URL.revokeObjectURL(oldest[1]);
        }
    }
}

function abortError(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('Playback aborted.', 'AbortError');
}

function waitForAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError(signal));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(abortError(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void promise.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}
