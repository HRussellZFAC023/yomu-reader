import { yomuAudioCompanion, type ReaderAudioActionsInstance } from '../companions/registry';
import type { ReaderAudioActionsDependencies } from './actions';

// Core-side facade for the Yomu Audio companion (ADR-0003 split): the reader's
// audio orchestration (loading state on the popover, stale-hover guards, JPDB
// example audio) lives with the player it drives. Without the companion every
// action resolves quietly so popovers still render.
class DisabledReaderAudioActions {
    playTermAudio(): Promise<void> {
        return Promise.resolve();
    }

    playSentenceAudio(): Promise<void> {
        return Promise.resolve();
    }

    playJpdbExampleAudio(): Promise<void> {
        return Promise.resolve();
    }

    playMediaUrl(): Promise<boolean> {
        return Promise.resolve(false);
    }
}

const CompanionBackedReaderAudioActions = class {
    constructor(dependencies: ReaderAudioActionsDependencies) {
        const Actions = yomuAudioCompanion()?.ReaderAudioActions;
        return Actions
            ? new Actions(dependencies)
            : new DisabledReaderAudioActions() as unknown as ReaderAudioActionsInstance;
    }
};

export { CompanionBackedReaderAudioActions as ReaderAudioActions };
