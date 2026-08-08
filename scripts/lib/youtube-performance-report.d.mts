export interface PerformanceEvidenceJournal {
    update(patch: Record<string, unknown>): void;
    markStep(step: Record<string, unknown>): void;
    complete<T extends Record<string, unknown>>(report: T): T & Record<string, unknown>;
    fail(error: unknown, extra?: Record<string, unknown>): Record<string, unknown> | null;
}

export function createPerformanceEvidenceJournal(outputRoot: string, initial?: Record<string, unknown>): PerformanceEvidenceJournal;
export function serializeError(error: unknown): Record<string, unknown>;
export function capturePerformancePageFailure(
    page: import('playwright').Page,
    outputRoot: string,
    stem: string,
    diagnostics?: Record<string, unknown>,
): Promise<Record<string, unknown>>;
