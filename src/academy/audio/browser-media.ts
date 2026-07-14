import type { AudioTrack, MediaBusPlayback } from './types';

type MediaFactory = () => HTMLAudioElement;

/**
 * Owns one browser media element for one semantic bus. Track changes are
 * serialized through that element so stale fades cannot leave orphan audio.
 */
export class BrowserMediaBus implements MediaBusPlayback {
    private readonly media: HTMLAudioElement;
    private operation = 0;
    private currentTrackId: string | null = null;
    private targetVolume = 0;
    private disposed = false;

    constructor(createMedia: MediaFactory = () => new Audio()) {
        this.media = createMedia();
        this.media.preload = 'metadata';
        this.media.crossOrigin = 'anonymous';
    }

    async play(track: AudioTrack, volume: number, fadeMs: number): Promise<void> {
        this.assertActive();
        const operation = ++this.operation;
        const nextVolume = clamp(volume);

        if (this.currentTrackId === track.id) {
            this.media.loop = track.loop;
            this.targetVolume = nextVolume;
            await this.media.play();
            if (operation === this.operation) await this.rampTo(nextVolume, fadeMs, operation);
            return;
        }

        if (this.currentTrackId) await this.rampTo(0, Math.floor(fadeMs / 2), operation);
        if (operation !== this.operation || this.disposed) return;

        this.media.pause();
        this.media.src = track.url;
        this.media.loop = track.loop;
        this.media.currentTime = 0;
        this.media.volume = 0;
        this.media.load();
        this.currentTrackId = track.id;
        this.targetVolume = nextVolume;
        await this.media.play();
        if (operation === this.operation) await this.rampTo(nextVolume, Math.ceil(fadeMs / 2), operation);
    }

    stop(fadeMs: number): void {
        if (this.disposed) return;
        const operation = ++this.operation;
        void this.rampTo(0, fadeMs, operation).finally(() => {
            if (operation !== this.operation || this.disposed) return;
            this.media.pause();
            this.media.removeAttribute('src');
            this.media.load();
            this.currentTrackId = null;
            this.targetVolume = 0;
        });
    }

    setVolume(volume: number): void {
        if (this.disposed) return;
        this.targetVolume = clamp(volume);
        this.media.volume = this.targetVolume;
    }

    pause(): void {
        if (!this.disposed) this.media.pause();
    }

    async resume(): Promise<void> {
        if (this.disposed || !this.currentTrackId) return;
        await this.media.play();
        this.media.volume = this.targetVolume;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.operation += 1;
        this.media.pause();
        this.media.removeAttribute('src');
        this.media.load();
        this.currentTrackId = null;
    }

    private async rampTo(target: number, durationMs: number, operation: number): Promise<void> {
        const start = this.media.volume;
        const end = clamp(target);
        if (durationMs <= 0 || start === end) {
            if (operation === this.operation && !this.disposed) this.media.volume = end;
            return;
        }

        const startedAt = performance.now();
        await new Promise<void>(resolve => {
            const step = (now: number) => {
                if (operation !== this.operation || this.disposed) {
                    resolve();
                    return;
                }
                // RAF and performance.now normally share a clock, but embedded
                // browsers can hand us one stale frame during activation. Clamp
                // both the interpolation factor and the final media value so a
                // harmless clock skew never aborts an otherwise valid track.
                const progress = clamp((now - startedAt) / durationMs);
                this.media.volume = clamp(start + (end - start) * progress);
                if (progress >= 1) resolve();
                else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    private assertActive(): void {
        if (this.disposed) throw new Error('Audio bus has been disposed.');
    }
}

function clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
