export interface FixedAmbientOperation {
    cycle: number;
    phase: 'playing' | 'paused';
    scrollOffset: number;
    playbackTicks: number;
}

export function fixedAmbientOperationPlan(cycles: number): FixedAmbientOperation[];

export function exerciseYoutubeFixedChurn(
    page: any,
    options: {
        cycles: number;
        label: string;
        lookupPlan: readonly unknown[];
        waitForLookupPlanReady(page: any, lookupPlan: readonly unknown[]): Promise<void>;
    },
): Promise<Record<string, any>>;

export function exerciseYoutubeAmbientSoak(page: any, options: { durationMs: number; label: string }): Promise<Record<string, any>>;
