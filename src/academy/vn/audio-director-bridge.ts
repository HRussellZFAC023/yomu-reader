import { SHINDAY_SFX_ASSETS } from '../audio/sfx-catalog';
import type { AudioDirectorState, SfxCue, ThemeSlot } from '../audio/types';
import type {
    VnAudioMixEvent,
    VnFixedSoundCaption,
    VnMusicEvent,
    VnPerformanceHooks,
    VnSoundCue,
} from './performance-contract';

export interface VnAudioDirectorTarget {
    readonly state: AudioDirectorState;
    setTheme(slot: ThemeSlot): Promise<void>;
    beginExternalLesson(duck?: number): () => void;
    playSfx(cue: SfxCue): void;
}

export interface VnSoundCaptionEvent {
    readonly soundId: string;
    readonly caption: VnFixedSoundCaption;
    readonly durationMs: number;
    readonly reducedMotion: boolean;
}

export interface VnAudioDirectorBridgeOptions {
    readonly director: VnAudioDirectorTarget;
    readonly reducedMotion?: boolean;
    readonly now?: () => number;
    readonly onCaption?: (event: VnSoundCaptionEvent) => void;
    readonly onGap?: (sound: Extract<VnSoundCue, { status: 'gap' }>) => void;
    readonly onError?: (error: unknown) => void;
}

export type VnSoundPlayResult =
    | { readonly status: 'played'; readonly played: true }
    | { readonly status: 'gap' | 'busy' | 'locked' | 'disposed'; readonly played: false };

export interface VnAudioDirectorBridge {
    readonly performanceHooks: Pick<VnPerformanceHooks, 'onAudioMix' | 'onMusic' | 'onSfx' | 'onSound'>;
    playSound(sound: VnSoundCue): VnSoundPlayResult;
    dispose(): void;
}

interface TemporaryDuck {
    readonly release: () => void;
    readonly timer: ReturnType<typeof setTimeout>;
}

const PLAYABLE_STATES = new Set<AudioDirectorState>(['ready', 'playing', 'silent']);
const FALLBACK_SFX_DURATION_MS = 180;

const SHINDAY_DURATION_BY_DIRECTOR_CUE = new Map<SfxCue, number>();
for (const asset of Object.values(SHINDAY_SFX_ASSETS)) {
    const durationMs = Math.ceil(asset.durationSeconds * 1_000);
    for (const cue of asset.directorCues) SHINDAY_DURATION_BY_DIRECTOR_CUE.set(cue, durationMs);
}

/**
 * Adapts VN semantic hooks to the existing AudioDirector. The director remains
 * the sole owner of theme crossfades and music ducking; this boundary only
 * sequences finite one-shot cues so BrowserSfxPlayback cannot overlap them.
 */
export function createVnAudioDirectorBridge(options: VnAudioDirectorBridgeOptions): VnAudioDirectorBridge {
    const now = options.now ?? (() => Date.now());
    let busyUntil = 0;
    let persistentDuck: (() => void) | undefined;
    let semanticDuck: TemporaryDuck | undefined;
    let transientMixDuck: TemporaryDuck | undefined;
    let pendingTransientMix: VnAudioMixEvent | undefined;
    let disposed = false;

    const reportError = (error: unknown): void => options.onError?.(error);

    const releasePersistentDuck = (): void => {
        const release = persistentDuck;
        persistentDuck = undefined;
        release?.();
    };

    const releaseTemporaryDuck = (active: TemporaryDuck | undefined): void => {
        if (!active) return;
        clearTimeout(active.timer);
        active.release();
    };

    const beginDuck = (gain: number): (() => void) | undefined => {
        if (gain >= 1 || !PLAYABLE_STATES.has(options.director.state)) return undefined;
        try {
            return options.director.beginExternalLesson(gain);
        } catch (error) {
            reportError(error);
            return undefined;
        }
    };

    const beginTemporaryDuck = (
        gain: number,
        durationMs: number,
        current: TemporaryDuck | undefined,
        setCurrent: (duck: TemporaryDuck | undefined) => void,
    ): void => {
        releaseTemporaryDuck(current);
        setCurrent(undefined);
        const release = beginDuck(gain);
        if (!release) return;
        const timer = setTimeout(() => {
            setCurrent(undefined);
            release();
        }, durationMs);
        setCurrent({ release, timer });
    };

    const playOneShot = (cue: SfxCue, durationMs: number): VnSoundPlayResult => {
        if (disposed || options.director.state === 'disposed') return { status: 'disposed', played: false };
        if (!PLAYABLE_STATES.has(options.director.state)) return { status: 'locked', played: false };
        if (now() < busyUntil) return { status: 'busy', played: false };
        options.director.playSfx(cue);
        busyUntil = now() + durationMs;
        return { status: 'played', played: true };
    };

    const playSound = (sound: VnSoundCue): VnSoundPlayResult => {
        if (disposed || options.director.state === 'disposed') return { status: 'disposed', played: false };
        if (sound.status === 'gap') {
            options.onGap?.(sound);
            return { status: 'gap', played: false };
        }
        const result = playOneShot(sound.sfx, sound.durationMs);
        if (!result.played) return result;
        beginTemporaryDuck(
            sound.duckMusicTo,
            sound.durationMs,
            semanticDuck,
            duck => { semanticDuck = duck; },
        );
        options.onCaption?.({
            soundId: sound.id,
            caption: sound.caption,
            durationMs: sound.durationMs,
            reducedMotion: options.reducedMotion ?? false,
        });
        return result;
    };

    const onMusic = (event: VnMusicEvent): void => {
        if (disposed || options.director.state === 'disposed') return;
        try {
            void options.director.setTheme(event.music.theme).catch(reportError);
        } catch (error) {
            reportError(error);
        }
    };

    const onAudioMix = (event: VnAudioMixEvent): void => {
        if (disposed) return;
        if (event.releaseAfterMs !== undefined) {
            pendingTransientMix = event;
            queueMicrotask(() => {
                if (pendingTransientMix === event) pendingTransientMix = undefined;
            });
            return;
        }
        pendingTransientMix = undefined;
        releasePersistentDuck();
        persistentDuck = beginDuck(event.mix.musicGain);
    };

    const onSfx = (cue: SfxCue): void => {
        const transientMix = pendingTransientMix;
        pendingTransientMix = undefined;
        const durationMs = SHINDAY_DURATION_BY_DIRECTOR_CUE.get(cue) ?? FALLBACK_SFX_DURATION_MS;
        const result = playOneShot(cue, durationMs);
        if (result.played && transientMix?.releaseAfterMs !== undefined) {
            beginTemporaryDuck(
                transientMix.mix.musicGain,
                transientMix.releaseAfterMs,
                transientMixDuck,
                duck => { transientMixDuck = duck; },
            );
        }
    };

    const performanceHooks = Object.freeze({
        onMusic,
        onAudioMix,
        onSfx,
        onSound: (event: { readonly sound: VnSoundCue }) => { playSound(event.sound); },
    });

    return {
        performanceHooks,
        playSound,
        dispose() {
            if (disposed) return;
            disposed = true;
            busyUntil = 0;
            pendingTransientMix = undefined;
            releaseTemporaryDuck(semanticDuck);
            semanticDuck = undefined;
            releaseTemporaryDuck(transientMixDuck);
            transientMixDuck = undefined;
            releasePersistentDuck();
        },
    };
}
