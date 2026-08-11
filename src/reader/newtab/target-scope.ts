import type { ReaderSettings } from '../app/types';
import { targetLanguageOf } from '../languages/selection';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
import {
    activeLearningTarget,
    activeLearningTargetGeneration,
} from '../languages/target-runtime';
import { DEFAULT_SETTINGS } from '../settings/index';

export interface ActiveTargetSnapshot {
    readonly generation: number;
    readonly target: ReturnType<typeof activeLearningTarget>;
}

export function captureActiveTarget(): ActiveTargetSnapshot {
    return {
        generation: activeLearningTargetGeneration(),
        target: activeLearningTarget(),
    };
}

export function isCurrentActiveTarget(snapshot: ActiveTargetSnapshot): boolean {
    return snapshot.generation === activeLearningTargetGeneration()
        && snapshot.target === activeLearningTarget();
}

export interface LookupTargetSnapshot extends ActiveTargetSnapshot {
    readonly language: string;
    readonly scopeGeneration: number;
}

/**
 * Owns the New Tab lookup epoch. A global target can change away and back to
 * the same language, so neither a language comparison nor a render id alone is
 * enough to decide whether an async result still belongs to the active lookup.
 */
export class NewTabLookupTargetScope {
    private language = targetLanguageOf(DEFAULT_SETTINGS);
    private runtimeGeneration = activeLearningTargetGeneration();
    private scopeGeneration = 0;
    private renderRequest = 0;
    private renderTarget?: LookupTargetSnapshot;

    capture(): LookupTargetSnapshot {
        return {
            ...captureActiveTarget(),
            language: this.language,
            scopeGeneration: this.scopeGeneration,
        };
    }

    isCurrent(snapshot: LookupTargetSnapshot): boolean {
        return snapshot.language === this.language
            && snapshot.scopeGeneration === this.scopeGeneration
            && isCurrentActiveTarget(snapshot);
    }

    sync(settings: ReaderSettings): boolean {
        const language = adoptLearningTargetFromSettings(settings).language;
        const runtimeGeneration = activeLearningTargetGeneration();
        if (language === this.language && runtimeGeneration === this.runtimeGeneration) return false;
        this.language = language;
        this.runtimeGeneration = runtimeGeneration;
        this.scopeGeneration += 1;
        this.invalidateRender();
        return true;
    }

    nextRender(): number {
        this.renderRequest += 1;
        this.renderTarget = this.capture();
        return this.renderRequest;
    }

    isCurrentRender(requestId: number): boolean {
        return requestId === this.renderRequest
            && Boolean(this.renderTarget && this.isCurrent(this.renderTarget));
    }

    currentRenderRequest(): number {
        return this.renderRequest;
    }

    invalidateRender(): void {
        this.renderRequest += 1;
        this.renderTarget = undefined;
    }
}
