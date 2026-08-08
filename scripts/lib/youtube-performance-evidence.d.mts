export interface StressLookupTarget {
    id: string;
    expression: string;
    lane: string;
    occurrence?: number;
    sourceText?: string;
    scrollOffset?: number;
}

export type PlannedStressLookup<T extends StressLookupTarget = StressLookupTarget> = T & {
    sampleIndex: number;
    sequenceIndex: number;
};

export interface StressSample {
    request?: PlannedStressLookup;
    target?: {
        expression?: string;
        lane?: string;
        occurrence?: number;
        sourceText?: string;
    };
    skipped?: boolean;
    reason?: string;
    opened?: boolean;
    expectedMs?: number | null;
    wrongPopoverVisible?: boolean;
    wrongPopoverText?: string;
}

export interface StressSummary {
    count: number;
    opened: number;
    skipped: number;
    timedOut: number;
    wrongPopover: number;
    targetMismatch: number;
    p50Ms: number | null;
    p95Ms: number | null;
    maxMs: number | null;
    over250Ms: number;
    over1000Ms: number;
}

export function fixedStressLookupPlan<T extends StressLookupTarget>(
    sequence: readonly T[],
    sampleCount: number,
): Array<PlannedStressLookup<T>>;

export function summarizeCpuProfile(profile: {
    nodes?: Array<Record<string, unknown>>;
    samples?: number[];
    timeDeltas?: number[];
}): {
    sampleCount: number;
    sampledMs: number;
    framesWithSelfTime: number;
    selfTime: Array<Record<string, unknown>>;
};

export function summarizePreciseCoverage(
    scripts: Array<Record<string, unknown>>,
    trackedFunctionNames?: readonly string[],
): {
    functionsCalled: number;
    totalCalls: number;
    callCounts: Array<Record<string, unknown>>;
    trackedCallCounts: Array<Record<string, unknown>>;
};

export function summarizeStressSamples(samples: readonly StressSample[]): StressSummary;

export function assertCompleteStressInteraction(
    interaction: { samples?: StressSample[]; summary?: StressSummary } | null | undefined,
    expectedPlan: readonly PlannedStressLookup[],
    context?: string,
): StressSummary;
