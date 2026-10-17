import type { Page } from 'playwright';

export interface SpinSummary { wallMs: number; otherMsPerSec: number; longGaps: number; longGapMs: number; longestGapMs: number }
export interface CdpRates {
    taskMsPerSec: number;
    scriptMsPerSec: number;
    recalcStyleMsPerSec: number;
    layoutMsPerSec: number;
    recalcStylesPerSec: number;
    layoutsPerSec: number;
    nodes: number | null;
}
export function startMainThreadSampler(
    page: Page,
    options?: { engine?: string; spin?: boolean; cdp?: boolean },
): Promise<{ stop(): Promise<{ elapsedMs: number; spin?: SpinSummary | null; cdp?: CdpRates }> }>;
export function cdpPerSecond(before: Record<string, number>, after: Record<string, number>, seconds: number): CdpRates;
export function spinSummary(raw: { wallMs: number; spunMs: number; gaps: number[] }, longGapMs?: number): SpinSummary;
