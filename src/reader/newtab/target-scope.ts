import { activeLearningTarget } from '../languages/target-runtime';

export interface ActiveTargetSnapshot {
    readonly target: ReturnType<typeof activeLearningTarget>;
}

export function captureActiveTarget(): ActiveTargetSnapshot {
    return { target: activeLearningTarget() };
}

export function isCurrentActiveTarget(snapshot: ActiveTargetSnapshot): boolean {
    return snapshot.target === activeLearningTarget();
}

export type LookupTargetSnapshot = ActiveTargetSnapshot;

/**
 * Owns the New Tab lookup render epoch: an async result may paint only the
 * lookup render that requested it.
 */
export class NewTabLookupTargetScope {
    private renderRequest = 0;
    private renderTarget?: LookupTargetSnapshot;

    capture(): LookupTargetSnapshot {
        return captureActiveTarget();
    }

    isCurrent(snapshot: LookupTargetSnapshot): boolean {
        return isCurrentActiveTarget(snapshot);
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
