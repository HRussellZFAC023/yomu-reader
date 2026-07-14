import { trackCanPlay } from './catalog';
import { loadAudioSettings, saveAudioSettings, withAudioVolume } from './settings';
import type {
    AudioBus,
    AudioCatalog,
    AudioDirectorControl,
    AudioDirectorEvent,
    AudioDirectorState,
    AudioSettings,
    AudioTrack,
    LessonPlayback,
    MediaBusPlayback,
    SfxCue,
    SfxPlayback,
    ThemeSlot,
} from './types';

export interface AudioDirectorOptions {
    readonly catalog: AudioCatalog;
    readonly music: MediaBusPlayback;
    readonly ambience: MediaBusPlayback;
    readonly lesson: MediaBusPlayback;
    readonly sfx: SfxPlayback;
    readonly storage?: Storage | null;
    readonly releaseMode?: boolean;
}

type Listener = (event: AudioDirectorEvent) => void;

/**
 * The Academy's sole audio state machine. Views request semantic slots; this
 * module owns unlock, rights gates, transitions, ducking, suspension and cleanup.
 */
export class AudioDirector implements AudioDirectorControl {
    private readonly catalog: AudioCatalog;
    private readonly buses: Record<Exclude<AudioBus, 'sfx'>, MediaBusPlayback>;
    private readonly sfx: SfxPlayback;
    private readonly storage: Storage | null;
    private readonly releaseMode: boolean;
    private readonly listeners = new Set<Listener>();
    private readonly currentTracks: Record<Exclude<AudioBus, 'sfx'>, AudioTrack | null> = {
        music: null,
        ambience: null,
        lesson: null,
    };

    private settingsValue: AudioSettings;
    private stateValue: AudioDirectorState = 'locked';
    private requestedTheme: ThemeSlot = 'silence';
    private transition = 0;
    private ownedLessonDuck = 1;
    private readonly externalLessonDucks = new Map<number, number>();
    private nextExternalLessonId = 0;
    private duckActive = false;
    private suspendedFrom: AudioDirectorState | null = null;

    constructor(options: AudioDirectorOptions) {
        this.catalog = options.catalog;
        this.buses = { music: options.music, ambience: options.ambience, lesson: options.lesson };
        this.sfx = options.sfx;
        this.storage = options.storage ?? null;
        this.releaseMode = options.releaseMode ?? true;
        this.settingsValue = loadAudioSettings(this.storage);
    }

    get state(): AudioDirectorState {
        return this.stateValue;
    }

    get theme(): ThemeSlot {
        return this.requestedTheme;
    }

    get settings(): AudioSettings {
        return { ...this.settingsValue, volumes: { ...this.settingsValue.volumes } };
    }

    onEvent(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async unlock(): Promise<void> {
        this.assertActive();
        if (this.stateValue !== 'locked') return;
        this.sfx.unlock();
        this.setState('ready');
        await this.applyTheme();
    }

    async setTheme(slot: ThemeSlot): Promise<void> {
        this.assertActive();
        if (!this.catalog[slot]) throw new RangeError(`Unknown audio theme: ${slot}`);
        this.requestedTheme = slot;
        this.emit({ type: 'theme', slot });
        if (this.stateValue !== 'locked' && this.stateValue !== 'suspended') await this.applyTheme();
    }

    async startLesson(playback: LessonPlayback): Promise<boolean> {
        this.assertReady('Lesson audio');
        if (!trackCanPlay(playback.track, this.releaseMode)) return false;

        const definition = this.catalog[this.requestedTheme];
        this.ownedLessonDuck = clamp(playback.duck ?? definition.lessonDuck);
        this.syncDuck(true);
        try {
            await this.buses.lesson.play(playback.track, this.trackVolume('lesson', playback.track), 120);
            this.setTrack('lesson', playback.track);
            this.syncDuck();
            this.refreshPlaybackState();
            return true;
        } catch (error) {
            this.setTrack('lesson', null);
            this.ownedLessonDuck = 1;
            this.syncDuck();
            this.emit({ type: 'error', operation: 'start-lesson', error });
            return false;
        }
    }

    finishLesson(): void {
        if (this.stateValue === 'disposed') return;
        this.buses.lesson.stop(120);
        this.setTrack('lesson', null);
        this.ownedLessonDuck = 1;
        this.syncDuck();
        this.refreshPlaybackState();
    }

    /** Duck the owned music bus while browser speech or recording plays. */
    beginExternalLesson(duck = this.catalog[this.requestedTheme].lessonDuck): () => void {
        this.assertReady('External lesson audio');
        const lessonId = ++this.nextExternalLessonId;
        this.externalLessonDucks.set(lessonId, clamp(duck));
        this.syncDuck();
        this.setState('playing');
        let released = false;
        return () => {
            if (released || this.stateValue === 'disposed') return;
            released = true;
            this.externalLessonDucks.delete(lessonId);
            this.syncDuck();
            this.refreshPlaybackState();
        };
    }

    playSfx(cue: SfxCue): void {
        if (!this.canPlay()) return;
        this.sfx.play(cue, this.effectiveVolume('sfx'));
        this.emit({ type: 'sfx', cue });
    }

    setMuted(muted: boolean): void {
        this.updateSettings({ ...this.settingsValue, muted });
    }

    setVolume(bus: AudioBus, value: number): void {
        this.updateSettings(withAudioVolume(this.settingsValue, bus, value));
    }

    async handleVisibility(hidden: boolean): Promise<void> {
        this.assertActive();
        if (hidden) {
            if (this.stateValue === 'suspended' || this.stateValue === 'locked') return;
            this.suspendedFrom = this.stateValue;
            Object.values(this.buses).forEach(bus => bus.pause());
            this.setState('suspended');
            return;
        }
        if (this.stateValue !== 'suspended') return;
        try {
            await Promise.all(Object.values(this.buses).map(bus => bus.resume()));
            this.setState(this.suspendedFrom ?? 'ready');
            this.refreshPlaybackState();
        } catch (error) {
            this.emit({ type: 'error', operation: 'resume', error });
            this.setState('silent');
        } finally {
            this.suspendedFrom = null;
        }
    }

    dispose(): void {
        if (this.stateValue === 'disposed') return;
        this.transition += 1;
        Object.values(this.buses).forEach(bus => bus.dispose());
        this.sfx.dispose();
        this.listeners.clear();
        this.stateValue = 'disposed';
    }

    private async applyTheme(): Promise<void> {
        const transition = ++this.transition;
        const definition = this.catalog[this.requestedTheme];
        const pairs = [
            ['music', definition.music],
            ['ambience', definition.ambience],
        ] as const;

        await Promise.all(pairs.map(async ([busName, track]) => {
            const bus = this.buses[busName];
            if (!track || !trackCanPlay(track, this.releaseMode)) {
                bus.stop(definition.crossfadeMs);
                this.setTrack(busName, null);
                return;
            }
            try {
                const duck = busName === 'music' ? this.currentDuckFactor() : 1;
                await bus.play(track, this.trackVolume(busName, track) * duck, definition.crossfadeMs);
                if (transition === this.transition) this.setTrack(busName, track);
            } catch (error) {
                if (transition !== this.transition) return;
                this.setTrack(busName, null);
                this.emit({ type: 'error', operation: `theme-${busName}`, error });
            }
        }));

        if (transition === this.transition) this.refreshPlaybackState();
    }

    private syncDuck(pendingOwnedLesson = false): void {
        const factors = [...this.externalLessonDucks.values()];
        if (pendingOwnedLesson || this.currentTracks.lesson) factors.push(this.ownedLessonDuck);
        const active = factors.length > 0;
        const factor = active ? Math.min(...factors) : 1;
        this.buses.music.setVolume(this.currentMusicVolume(factor));
        if (active !== this.duckActive) this.emit({ type: 'duck', active });
        this.duckActive = active;
    }

    private updateSettings(settings: AudioSettings): void {
        this.settingsValue = { ...settings, volumes: { ...settings.volumes } };
        saveAudioSettings(this.storage, this.settingsValue);
        this.buses.music.setVolume(this.currentMusicVolume(this.currentDuckFactor()));
        this.buses.ambience.setVolume(this.currentTrackVolume('ambience'));
        this.buses.lesson.setVolume(this.currentTrackVolume('lesson'));
        this.emit({ type: 'settings', settings: this.settings });
    }

    private currentMusicVolume(duckFactor: number): number {
        const track = this.catalog[this.requestedTheme].music;
        return track ? this.trackVolume('music', track) * duckFactor : 0;
    }

    private currentDuckFactor(): number {
        const factors = [...this.externalLessonDucks.values()];
        if (this.currentTracks.lesson) factors.push(this.ownedLessonDuck);
        return factors.length ? Math.min(...factors) : 1;
    }

    private currentTrackVolume(bus: 'ambience' | 'lesson'): number {
        const track = this.currentTracks[bus];
        return track ? this.trackVolume(bus, track) : this.effectiveVolume(bus);
    }

    private trackVolume(bus: Exclude<AudioBus, 'sfx'>, track: AudioTrack): number {
        return clamp(this.effectiveVolume(bus) * track.gain);
    }

    private effectiveVolume(bus: AudioBus): number {
        return this.settingsValue.muted ? 0 : this.settingsValue.volumes[bus];
    }

    private setTrack(bus: Exclude<AudioBus, 'sfx'>, track: AudioTrack | null): void {
        if (this.currentTracks[bus]?.id === track?.id) return;
        this.currentTracks[bus] = track;
        this.emit({ type: 'track', bus, trackId: track?.id ?? null });
    }

    private refreshPlaybackState(): void {
        if (this.stateValue === 'locked' || this.stateValue === 'suspended' || this.stateValue === 'disposed') return;
        const audible = Object.values(this.currentTracks).some(Boolean);
        this.setState(audible ? 'playing' : 'silent');
    }

    private canPlay(): boolean {
        return this.stateValue !== 'locked' && this.stateValue !== 'suspended' && this.stateValue !== 'disposed';
    }

    private assertReady(operation: string): void {
        this.assertActive();
        if (!this.canPlay()) throw new Error(`${operation} requires an unlocked, visible audio director.`);
    }

    private assertActive(): void {
        if (this.stateValue === 'disposed') throw new Error('Audio director has been disposed.');
    }

    private setState(state: AudioDirectorState): void {
        if (this.stateValue === state) return;
        this.stateValue = state;
        this.emit({ type: 'state', state });
    }

    private emit(event: AudioDirectorEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}

function clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
