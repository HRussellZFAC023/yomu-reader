export type AudioBus = 'music' | 'ambience' | 'lesson' | 'sfx';

export type ThemeSlot =
    | 'silence'
    | 'opening.invitation'
    | 'campus.evening'
    | 'classroom.focus'
    | 'library.quiet'
    | 'lab.listening'
    | 'cafe.social'
    | 'bond.quiet'
    | 'mystery.page'
    | 'challenge.kanji'
    | 'challenge.major'
    | 'unlock.world'
    | 'support.kindness'
    | 'resolve.late'
    | 'ending.reflective'
    | 'world.courtyard'
    | 'world.classroom'
    | 'world.library'
    | 'world.cafe'
    | 'world.lab'
    | 'world.street'
    | 'world.station'
    | 'world.konbini'
    | 'world.ramen'
    | 'world.home'
    | 'world.japan-centre'
    | 'world.park';

export type SfxCue =
    | 'menu.move'
    | 'menu.confirm'
    | 'menu.cancel'
    | 'action.unavailable'
    | 'scene.advance'
    | 'page.turn'
    | 'door.open'
    | 'footstep.indoor'
    | 'footstep.wet'
    | 'feedback.correct'
    | 'feedback.repair'
    | 'feedback.hanamaru'
    | 'bond.unlock'
    | 'bond.rank'
    | 'chapter.complete'
    | 'doodle.stroke'
    | 'doodle.check'
    | 'radio.tune'
    | 'camera.capture';

export interface AudioRights {
    readonly owner: string;
    readonly licence: string;
    readonly source: string;
    readonly reviewed: true;
    readonly scope: 'private-prototype' | 'release';
}

export interface AudioTrack {
    readonly id: string;
    readonly title: string;
    readonly url: string;
    readonly loop: boolean;
    readonly gain: number;
    readonly rights: AudioRights;
}

export interface ThemeDefinition {
    readonly slot: ThemeSlot;
    readonly music?: AudioTrack;
    readonly ambience?: AudioTrack;
    readonly crossfadeMs: number;
    readonly lessonDuck: number;
}

export type AudioCatalog = Readonly<Record<ThemeSlot, ThemeDefinition>>;

export interface AudioSettings {
    readonly muted: boolean;
    readonly volumes: Readonly<Record<AudioBus, number>>;
}

export type AudioDirectorState = 'locked' | 'ready' | 'playing' | 'silent' | 'suspended' | 'disposed';

export type AudioDirectorEvent =
    | { readonly type: 'state'; readonly state: AudioDirectorState }
    | { readonly type: 'theme'; readonly slot: ThemeSlot }
    | { readonly type: 'track'; readonly bus: Exclude<AudioBus, 'sfx'>; readonly trackId: string | null }
    | { readonly type: 'duck'; readonly active: boolean }
    | { readonly type: 'sfx'; readonly cue: SfxCue }
    | { readonly type: 'settings'; readonly settings: AudioSettings }
    | { readonly type: 'error'; readonly operation: string; readonly error: unknown };

export interface MediaBusPlayback {
    play(track: AudioTrack, volume: number, fadeMs: number): Promise<void>;
    stop(fadeMs: number): void;
    setVolume(volume: number): void;
    pause(): void;
    resume(): Promise<void>;
    dispose(): void;
}

export interface SfxPlayback {
    unlock(): void;
    play(cue: SfxCue, volume: number): void;
    dispose(): void;
}

/** Imperative controls exposed to Academy shell and contextual settings UI. */
export interface AudioDirectorControl {
    playSfx(cue: SfxCue): void;
    setVolume(bus: AudioBus, value: number): void;
}

export interface LessonPlayback {
    readonly track: AudioTrack;
    readonly duck?: number;
}
