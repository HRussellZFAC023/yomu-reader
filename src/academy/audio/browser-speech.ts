import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import type { AudioDirector } from './director';

/** Release-safe pronunciation fallback using the browser's Japanese voice. */
export class BrowserSpeechPronunciationService implements PronunciationService {
    constructor(private readonly director: AudioDirector) {}

    async play(term: string, reading?: string): Promise<Disposable> {
        if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
            throw new Error('Japanese browser speech is unavailable.');
        }
        await this.director.unlock();
        const releaseDuck = this.director.beginExternalLesson();
        let disposed = false;
        const utterance = new SpeechSynthesisUtterance(reading?.trim() || term.trim());
        utterance.lang = 'ja-JP';
        utterance.rate = 0.84;
        utterance.volume = this.director.settings.muted ? 0 : this.director.settings.volumes.lesson;
        const release = () => {
            if (disposed) return;
            disposed = true;
            releaseDuck();
        };
        utterance.addEventListener('end', release, { once: true });
        utterance.addEventListener('error', release, { once: true });
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
        return {
            dispose() {
                if (!disposed) speechSynthesis.cancel();
                release();
            },
        };
    }
}
