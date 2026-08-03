import { yomuAudioCompanion, type AudioPlayerInstance } from '../companions/registry';
import type { ReaderSettings } from '../app/types';

// Core-side facade for the Yomu Audio companion (ADR-0003 split). The real
// player — candidate discovery, blob fetching, JPDB audio files, browser and
// API text-to-speech — is several tens of kilobytes of executable code that
// only runs when a user plays pronunciation audio, so it ships as a companion
// library and core keeps this delegating shell inside the Greasy Fork budget.
// Without the companion every playback entry point resolves to "nothing
// played" instead of throwing, so lookups keep working silently.
class DisabledAudioPlayer {
    clearCaches(): void {}

    play(): Promise<boolean> {
        return Promise.resolve(false);
    }

    primeUserGestureIfUnprimed(): boolean {
        return false;
    }

    primeUserGesture(): boolean {
        return false;
    }

    preload(): boolean {
        return false;
    }

    stop(): void {}

    destroy(): void {}

    playJapaneseText(): Promise<void> {
        return Promise.resolve();
    }

    playJpdbAudio(): Promise<boolean> {
        return Promise.resolve(false);
    }

    playMediaUrl(): Promise<boolean> {
        return Promise.resolve(false);
    }

    playMediaCandidates(): Promise<boolean> {
        return Promise.resolve(false);
    }
}

const CompanionBackedAudioPlayer = class {
    constructor(getSettings: () => ReaderSettings) {
        const Player = yomuAudioCompanion()?.AudioPlayer;
        return Player
            ? new Player(getSettings)
            : new DisabledAudioPlayer() as unknown as AudioPlayerInstance;
    }
};

export { CompanionBackedAudioPlayer as AudioPlayer };
