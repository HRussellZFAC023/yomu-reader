import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { AudioDirector } from './director';

/** Release-safe pronunciation fallback using the browser's Japanese voice. */
export class BrowserSpeechPronunciationService implements PronunciationService {
    constructor(private readonly director: AudioDirector) {}

    async play(term: string, reading?: string, signal?: AbortSignal): Promise<Disposable> {
        if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
            throw new Error('Japanese browser speech is unavailable.');
        }
        throwIfAborted(signal);
        await waitForAbort(this.director.unlock(), signal);
        throwIfAborted(signal);
        const utterance = new SpeechSynthesisUtterance(reading?.trim() || term.trim());
        utterance.lang = 'ja-JP';
        utterance.rate = 0.84;
        utterance.volume = this.director.settings.muted ? 0 : this.director.settings.volumes.lesson;
        const releaseDuck = this.director.beginExternalLesson();
        let disposed = false;
        let resolveCompletion: () => void = () => undefined;
        const completion = new Promise<void>(resolve => { resolveCompletion = resolve; });
        const release = (completed: boolean) => {
            if (disposed) return;
            disposed = true;
            signal?.removeEventListener('abort', onAbort);
            utterance.removeEventListener('end', onEnd);
            utterance.removeEventListener('error', onError);
            releaseDuck();
            if (completed) resolveCompletion();
        };
        const onEnd = () => release(true);
        const onError = () => release(true);
        const onAbort = () => {
            speechSynthesis.cancel();
            release(false);
        };
        utterance.addEventListener('end', onEnd, { once: true });
        utterance.addEventListener('error', onError, { once: true });
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) {
            onAbort();
            throw abortError(signal);
        }
        try {
            speechSynthesis.cancel();
            speechSynthesis.speak(utterance);
        } catch (error) {
            release(false);
            throw error;
        }
        return {
            completion,
            dispose() {
                if (!disposed) speechSynthesis.cancel();
                release(false);
            },
        };
    }
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw abortError(signal);
}

function abortError(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('Playback aborted.', 'AbortError');
}

function waitForAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
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
