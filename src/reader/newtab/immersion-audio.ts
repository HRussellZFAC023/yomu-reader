import type { ReaderSettings } from '../app/types';
import { shouldFetchMediaUrlAsBlobBeforePlayback } from '../audio/candidates';
import { uniqueTrimmedStrings } from '../core/string-utils';
import type { ImmersionKitClient } from '../immersion/kit';

export interface NewTabImmersionAudioPlayerDeps {
    getSettings: () => ReaderSettings;
    immersionKit: ImmersionKitClient;
}

// Plays one immersion-example audio source at a time, keyed by card. A monotonic
// request id invalidates in-flight loads when the card changes, so a slow fetch
// never plays over a newer card; the isCurrent() callback lets the caller cancel
// mid-flight (e.g. when the answer is hidden again). Note: after a successful blob
// fallback the element keeps playing but tracking is cleared, so isPlaying() then
// reports false — treat it as "is a tracked direct candidate playing", not a gate.
export class NewTabImmersionAudioPlayer {
    private audio?: HTMLAudioElement;
    private key = '';
    private requestId = 0;

    constructor(private readonly deps: NewTabImmersionAudioPlayerDeps) {}

    isPlaying(key: string): boolean {
        return Boolean(this.key === key && this.audio && !this.audio.ended);
    }

    async playSource(source: { urls: string[]; key: string }, isCurrent: () => boolean): Promise<void> {
        const requestId = this.begin(source.key);
        const urls = uniqueTrimmedStrings(source.urls);
        const directUrls = urls.filter(url => !shouldFetchMediaUrlAsBlobBeforePlayback(url));
        const blobFirstUrls = urls.filter(shouldFetchMediaUrlAsBlobBeforePlayback);
        if (directUrls.length && await this.playCandidates(directUrls, requestId, source.key, isCurrent)) return;
        if (!this.isCurrentRequest(requestId, source.key) || !isCurrent()) return;
        const blobSrc = await this.fetchBlob(blobFirstUrls.length ? blobFirstUrls : urls);
        if (blobSrc && await this.playCandidates([blobSrc], requestId, source.key, isCurrent)) return;
        if (!this.isCurrentRequest(requestId, source.key) || !isCurrent()) return;
        if (blobFirstUrls.length && await this.playCandidates(blobFirstUrls, requestId, source.key, isCurrent)) return;
        if (this.isCurrentRequest(requestId, source.key)) this.clearRequest();
    }

    reset(): void {
        this.audio?.pause();
        this.audio = undefined;
        this.key = '';
        this.requestId++;
    }

    private async playCandidates(urls: string[], requestId: number, key: string, isCurrent: () => boolean): Promise<boolean> {
        for (const src of uniqueTrimmedStrings(urls)) {
            if (!this.isCurrentRequest(requestId, key) || !isCurrent()) return false;
            const audio = this.attach(src);
            const cleanup = (): void => this.clearIfCurrent(audio);
            audio.addEventListener('ended', cleanup, { once: true });
            audio.addEventListener('error', cleanup, { once: true });
            try {
                await audio.play();
                if (!this.isCurrentRequest(requestId, key) || !isCurrent()) {
                    audio.pause();
                    this.clearIfCurrent(audio);
                    return false;
                }
                return true;
            } catch {
                this.detachFailed(audio);
            }
        }
        return false;
    }

    private begin(key: string): number {
        const requestId = ++this.requestId;
        this.audio?.pause();
        this.audio = undefined;
        this.key = key;
        return requestId;
    }

    private fetchBlob(urls: string[]): Promise<string> {
        const settings = this.deps.getSettings();
        return this.deps.immersionKit
            .fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage)
            .catch(() => '');
    }

    private isCurrentRequest(requestId: number, key: string): boolean {
        return requestId === this.requestId && this.key === key;
    }

    private attach(src: string): HTMLAudioElement {
        const audio = new Audio(src);
        audio.playbackRate = this.deps.getSettings().immersionKitPlaybackRate;
        this.audio = audio;
        return audio;
    }

    private clearIfCurrent(audio: HTMLAudioElement): void {
        if (this.audio !== audio) return;
        this.clearRequest();
    }

    private detachFailed(audio: HTMLAudioElement): void {
        if (this.audio === audio) this.audio = undefined;
    }

    private clearRequest(): void {
        this.audio = undefined;
        this.key = '';
    }
}
