// What a finished OCR scan leaves behind for the next request of the same image.
//
// Only a provider's real answer is remembered: lines, or an empty answer the
// provider gave (a 200 with no text). A scan that threw or timed out is never
// remembered, so the next tap asks again instead of meeting a remembered
// "no text". Answers are kept per provider, because one provider's empty answer
// says nothing about another's, and a press on an image never settles for a
// remembered empty answer: the learner asked, so the image is read again.
// Answers with text outlive the page in Yomu's private storage
// (ocr-cache-store.ts); empty answers last for this page visit only.
import { loadPersistedOcrCache, persistOcrCacheSoon } from './ocr-cache-store';
import type { OcrResult } from './response-shared';

const MAX_ANSWERS = 36;

export class OcrAnswerCache {
    private readonly answers = new Map<string, OcrResult | null>();
    private readonly hydrated: Promise<void>;

    /** `provider` names the provider whose answers a key reads and writes now. */
    constructor(private readonly provider: () => string) {
        // Answers moved from the old page cache belong to the provider in use now.
        this.hydrated = loadPersistedOcrCache(key => this.key(key))
            .then(stored => {
                // Answers given while storage was loading are newer than stored ones.
                for (const [key, result] of stored) if (!this.answers.has(key)) this.answers.set(key, result);
                this.evict();
            })
            .catch(() => undefined);
    }

    /** Resolves once answers from earlier visits are in. */
    ready(): Promise<void> {
        return this.hydrated;
    }

    has(cacheKey: string): boolean {
        return this.answers.has(this.key(cacheKey));
    }

    /** The provider's remembered answer: OcrResult, null for an empty answer, undefined for none. */
    get(cacheKey: string): OcrResult | null | undefined {
        return this.answers.get(this.key(cacheKey));
    }

    /** Remember what the provider answered. Call it only with an answer, never after a failure. */
    remember(cacheKey: string, result: OcrResult | null): void {
        // Paused-video frames key by their data: URL — far too large to keep.
        if (cacheKey.startsWith('data:')) return;
        const key = this.key(cacheKey);
        this.answers.delete(key);
        this.answers.set(key, result?.lines.length ? result : null);
        this.evict();
        this.persist();
    }

    forget(cacheKey: string): void {
        if (this.answers.delete(this.key(cacheKey))) this.persist();
    }

    /** A press reads the image again: drop a remembered empty answer, keep text. */
    forgetEmpty(cacheKey: string): void {
        if (this.get(cacheKey) === null) this.forget(cacheKey);
    }

    private key(cacheKey: string): string {
        return answerKey(cacheKey, this.provider());
    }

    private evict(): void {
        while (this.answers.size > MAX_ANSWERS) {
            const oldest = this.answers.keys().next().value;
            if (oldest === undefined) break;
            this.answers.delete(oldest);
        }
    }

    private persist(): void {
        persistOcrCacheSoon(this.answers, Date.now());
    }
}

function answerKey(cacheKey: string, provider: string): string {
    return `${cacheKey}\n@ocr-provider:${provider}`;
}
