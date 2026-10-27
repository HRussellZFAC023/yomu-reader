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
