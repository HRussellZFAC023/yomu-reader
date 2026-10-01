export interface LongTaskSpan {
    startTime: number;
    duration: number;
}

export function splitLongTasksAt(
    tasks: readonly LongTaskSpan[],
    boundary: number,
): { before: LongTaskSpan[]; after: LongTaskSpan[] };
