import type { SfxSource } from './manifest';
import type { SfxCue, SfxPlayback } from './types';

type MediaFactory = (url: string) => HTMLAudioElement;

/**
 * Real browser SFX playback over the authorized manifest sources. One media
 * element per cue with a small overlap pool for rapid retriggers. Cues with
 * no authorized source stay silent — there is deliberately no synthesized
 * (oscillator/drone) fallback anywhere in the audio stack.
 */
export class BrowserSfxPlayback implements SfxPlayback {
    private readonly pools = new Map<SfxCue, HTMLAudioElement[]>();
    private unlocked = false;
    private disposed = false;

    constructor(
        private readonly sources: ReadonlyMap<SfxCue, SfxSource>,
        private readonly createMedia: MediaFactory = url => new Audio(url),
        private readonly poolSize = 3,
    ) {}

    /**
     * Record the user gesture without fetching every cue. Eagerly loading a
     * three-element pool for every cue can occupy all browser connections
     * before the invite exchange has had a chance to establish its cookie.
     * The first actual cue creates its small pool lazily.
     */
    unlock(): void {
        if (this.disposed || this.unlocked) return;
        this.unlocked = true;
    }

    play(cue: SfxCue, volume: number): void {
        if (this.disposed || !this.unlocked) return;
        const source = this.sources.get(cue);
        const pool = this.poolFor(cue);
        if (!source || !pool) return;
        const media = pool.find(candidate => candidate.paused || candidate.ended) ?? pool[0];
        media.volume = clamp(volume * source.gain);
        media.currentTime = 0;
        // Autoplay/decoding rejections are expected on some devices; a missed
        // sound effect must never surface as an app error.
        void media.play().catch(() => undefined);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const pool of this.pools.values()) {
            for (const media of pool) {
                media.pause();
                media.removeAttribute('src');
                media.load();
            }
        }
        this.pools.clear();
    }

    private poolFor(cue: SfxCue): HTMLAudioElement[] | null {
        const existing = this.pools.get(cue);
        if (existing) return existing;
        const source = this.sources.get(cue);
        if (!source) return null;
        const pool = Array.from({ length: this.poolSize }, () => {
            const media = this.createMedia(source.url);
            media.preload = 'auto';
            media.crossOrigin = 'use-credentials';
            return media;
        });
        this.pools.set(cue, pool);
        return pool;
    }
}

function clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
