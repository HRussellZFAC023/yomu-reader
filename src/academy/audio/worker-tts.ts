import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { AudioDirector } from './director';
import { BrowserSpeechPronunciationService } from './browser-speech';

const TTS_ENDPOINT = 'https://audio.yomureader.com/audio/tts';

/**
 * Pronunciation via the deployed yomu-audio worker (pitch-aware Polly/Azure/
 * MeloTTS ladder — see workers/yomu-audio/src/tts.ts). Falls back to the
 * browser's speechSynthesis voice on network error or a non-200 response, so
 * hosts with zero installed ja voices (the release QA finding) still get
 * sound. Object URLs are cached per (term, reading) for the session so a
 * repeated Listen tap doesn't re-fetch.
 */
export class WorkerTtsPronunciationService implements PronunciationService {
    private readonly fallback: PronunciationService;
    private readonly cache = new Map<string, string>();
    private audio: HTMLAudioElement | null = null;

    constructor(
        private readonly director: AudioDirector,
        fallback: PronunciationService = new BrowserSpeechPronunciationService(director),
    ) {
        this.fallback = fallback;
    }

    async play(term: string, reading?: string): Promise<Disposable> {
        const cacheKey = `${term.trim()}|${(reading ?? '').trim()}`;
        let objectUrl = this.cache.get(cacheKey);
        if (!objectUrl) {
            const fetchedObjectUrl = await this.fetchObjectUrl(term, reading);
            if (!fetchedObjectUrl) return this.fallback.play(term, reading);
            objectUrl = fetchedObjectUrl;
            this.cache.set(cacheKey, objectUrl);
        }

        await this.director.unlock();
        const releaseDuck = this.director.beginExternalLesson();
        let disposed = false;
        const release = () => {
            if (disposed) return;
            disposed = true;
            releaseDuck();
        };

        const element = this.audio ?? (this.audio = new Audio());
        element.pause();
        element.src = objectUrl;
        element.volume = this.director.settings.muted ? 0 : this.director.settings.volumes.lesson;
        element.addEventListener('ended', release, { once: true });
        element.addEventListener('error', release, { once: true });
        try {
            await element.play();
        } catch (error) {
            release();
            return this.fallback.play(term, reading);
        }

        return {
            dispose() {
                if (!disposed) element.pause();
                release();
            },
        };
    }

    private async fetchObjectUrl(term: string, reading?: string): Promise<string | null> {
        const params = new URLSearchParams({ term, reading: (reading ?? term) });
        try {
            const response = await fetch(`${TTS_ENDPOINT}?${params.toString()}`);
            if (!response.ok) return null;
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch {
            return null;
        }
    }
}
