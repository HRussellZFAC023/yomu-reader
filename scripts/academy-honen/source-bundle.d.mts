export interface SourceLedgerEntry {
    readonly entryKind: string;
    readonly relativePath: string;
    readonly byteLength: number;
    readonly sha256?: string | null;
    readonly state?: string;
    readonly classification?: {
        readonly extension?: string;
        readonly kind?: string;
        readonly state?: string;
    };
}

export interface SourceLedger {
    readonly libraryRoot?: string;
    readonly summary?: {
        readonly uniquePayloadCount?: number;
    };
    readonly entries: readonly SourceLedgerEntry[];
}

export interface HonenSourceRow {
    readonly sourceId: string;
    readonly relativePath: string;
    readonly sha256: string | null;
    readonly byteLength: number;
    readonly kind: string;
    readonly state: string;
    readonly extension: string;
    readonly curriculumBand: string;
    readonly honenDirect: boolean;
}

export interface HonenUploadFile {
    readonly sourceId: string;
    readonly relativePath: string;
    readonly sha256: string | null;
    readonly byteLength: number;
}

export interface HonenUploadBatch {
    readonly id: string;
    readonly group: string;
    readonly byteLength: number;
    readonly files: readonly HonenUploadFile[];
}

export interface HonenSourceSummary {
    readonly schema: string;
    readonly generatedAt: string;
    readonly regularFiles: number;
    readonly regularFileBytes: number;
    readonly uniquePayloadCount: number;
    readonly honenDirectFiles: number;
    readonly honenDirectBytes: number;
    readonly companionOnlyFiles: number;
    readonly companionOnlyBytes: number;
    readonly byCurriculumBand: Readonly<Record<string, number>>;
    readonly bytesByCurriculumBand: Readonly<Record<string, number>>;
    readonly byDirectImport: Readonly<Record<string, number>>;
    readonly bytesByDirectImport: Readonly<Record<string, number>>;
    readonly byKind: Readonly<Record<string, number>>;
    readonly byState: Readonly<Record<string, number>>;
}

export const HONEN_DIRECT_EXTENSIONS: ReadonlySet<string>;

export function inferCurriculumBand(relativePath: string): string;

export function canImportDirectlyToHonen(extension: string | null | undefined): boolean;

export function buildSourceRows(ledger: SourceLedger): HonenSourceRow[];

export function buildUploadBatches(
    rows: readonly HonenSourceRow[],
    options?: {
        readonly maxFiles?: number;
        readonly maxBytes?: number;
    },
): HonenUploadBatch[];

export function buildSummary(
    ledger: SourceLedger,
    rows: readonly HonenSourceRow[],
): HonenSourceSummary;

export function buildHonenSourceBundle(options: {
    readonly ledgerPath: string;
    readonly outputDir: string;
}): {
    readonly summary: HonenSourceSummary;
    readonly batches: readonly HonenUploadBatch[];
    readonly outputDir: string;
};
