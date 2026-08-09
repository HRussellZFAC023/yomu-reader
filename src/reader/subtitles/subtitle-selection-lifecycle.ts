import { isAbortError } from '../core/errors';
import type { SubtitleTrackSelectionRole } from './subtitle-track-options';

interface SubtitleSelectionState {
    requestId: number;
    controller?: AbortController;
}

/** Owns currentness and cancellation for the two independently selected tracks. */
export class SubtitleSelectionLifecycle {
    private readonly states: Record<SubtitleTrackSelectionRole, SubtitleSelectionState> = {
        primary: { requestId: 0 },
        secondary: { requestId: 0 },
    };

    begin(role: SubtitleTrackSelectionRole): number {
        const state = this.states[role];
        this.supersede(state);
        state.controller = new AbortController();
        return state.requestId;
    }

    invalidate(role: SubtitleTrackSelectionRole): void {
        this.supersede(this.states[role]);
    }

    abortAll(): void {
        for (const state of Object.values(this.states)) this.supersede(state);
    }

    signal(role: SubtitleTrackSelectionRole, requestId: number): AbortSignal | undefined {
        const state = this.states[role];
        return state.requestId === requestId ? state.controller?.signal : undefined;
    }

    isCurrent(role: SubtitleTrackSelectionRole, requestId: number): boolean {
        return this.states[role].requestId === requestId;
    }

    private supersede(state: SubtitleSelectionState): void {
        const controller = state.controller;
        state.controller = undefined;
        state.requestId += 1;
        controller?.abort();
    }
}

export function settleSubtitleSelectionFailure(signal: AbortSignal, error: unknown): null {
    if (signal.aborted || isAbortError(error)) return null;
    throw error;
}
