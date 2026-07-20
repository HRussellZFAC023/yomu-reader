export interface SalvageTask { id: string; description: string }
export interface SalvageDisposition {
    status: 'pending' | 'reuse' | 'reject';
    reason: string | null;
    reusablePaths: string[];
    reusableCommits: string[];
}
export interface SalvageCandidate {
    candidateId: string;
    sourceId: string;
    kind: string;
    references: { paths: string[]; commits: string[] };
    disposition: SalvageDisposition;
}
export interface SalvageSourceRow {
    sourceId: string;
    path?: string;
    excerpts?: Array<{ line: number; text: string }>;
    statusSha256?: string;
    diffSha256?: string;
    [key: string]: unknown;
}
export interface SalvageReport {
    schema: string;
    task: SalvageTask & { sha256: string };
    baseScan: Record<string, unknown>;
    baseScanSha256: string;
    sourceSnapshot: { path: string; sha256: string } | null;
    candidateSelection: Record<string, unknown>;
    inventory: {
        categories: Record<string, SalvageSourceRow[]>;
        hashes: Record<string, string>;
        counts: Record<string, number>;
        sha256: string;
    };
    candidates: SalvageCandidate[];
    decision: { status: string; candidateCount: number; reuseCount: number; rejectCount: number };
}

export function salvageSha256(value: string | Uint8Array): string;
export function canonicalSalvageJson(value: unknown): string;
export function tokenizeSalvageTask(task: SalvageTask): { tokens: Array<{ token: string; weight: number }>; sha256: string };
export function indexRecoveryDocuments(documents: Array<{ path: string; text: string }>, query: unknown): SalvageSourceRow[];
export function buildSalvageReport(
    task: SalvageTask,
    sources?: Record<string, any[]>,
    options?: Record<string, unknown>,
): SalvageReport;
export function validateSalvageReport(report: SalvageReport, expected?: Record<string, any>): string[];
