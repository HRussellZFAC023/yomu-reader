export interface PopupCloseObservation {
    attempted: boolean;
    armedAt: number;
    escapeAt: number | null;
    removedAt: number | null;
    settledAt: number | null;
    deadlineMs: number;
    visibleAtSettle: number | null;
    latencyMs: number | null;
    longTasks: Array<{ startTime: number; duration: number }>;
}

export function installPopupCloseProbe(deadlineMs: number): PopupCloseObservation;

export function popupCloseFailure(
    observation: PopupCloseObservation | null | undefined,
    deadlineMs: number,
): string | null;
