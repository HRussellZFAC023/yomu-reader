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
        state.controller?.abort();
        state.requestId += 1;
        state.controller = new AbortController();
        return state.requestId;
    }

    invalidate(role: SubtitleTrackSelectionRole): void {
        const state = this.states[role];
        state.controller?.abort();
        state.controller = undefined;
        state.requestId += 1;
    }

    abortAll(): void {
        for (const state of Object.values(this.states)) {
            state.controller?.abort();
            state.controller = undefined;
        }
    }

    current(role: SubtitleTrackSelectionRole): number {
        return this.states[role].requestId;
    }

    signal(role: SubtitleTrackSelectionRole, requestId: number): AbortSignal | undefined {
        const state = this.states[role];
        return state.requestId === requestId ? state.controller?.signal : undefined;
    }

    isCurrent(role: SubtitleTrackSelectionRole, requestId: number): boolean {
        return this.states[role].requestId === requestId;
    }
}
