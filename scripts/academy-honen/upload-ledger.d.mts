export interface HonenUploadReceipt {
    workspaceId: string;
    parentId: string;
    itemId: string;
    versionId: string | null;
    title: string;
    importedAt: string;
}

export interface HonenUploadEntry {
    sourceId: string;
    sourceRoot: string;
    relativePath: string;
    absolutePath?: string;
    sha256: string;
    byteLength: number;
    batchId: string | null;
    group: string;
    origin?: 'external';
    status: 'pending' | 'imported' | 'failed';
    receipt: HonenUploadReceipt | null;
}

export interface HonenUploadLedger {
    schema: 'yomu-academy.honen-upload-ledger.v1';
    generatedAt: string;
    sourceGeneratedAt: string;
    libraryRoot: string;
    entries: HonenUploadEntry[];
}

export function initialiseUploadLedger(
    batchDocument: {
        generatedAt: string;
        libraryRoot: string;
        batches: Array<{
            id: string;
            group: string;
            files: Array<{
                sourceId: string;
                relativePath: string;
                sha256: string;
                byteLength: number;
            }>;
        }>;
    },
    existing?: HonenUploadLedger | {
        entries?: Array<{
            sourceId: string;
            relativePath: string;
            sha256: string;
            status?: string;
            receipt?: { itemId?: string } & Partial<HonenUploadReceipt> | null;
            origin?: 'external';
            [key: string]: unknown;
        }>;
    } | null,
): HonenUploadLedger;

export function summariseUploadLedger(ledger: HonenUploadLedger): {
    total: number;
    imported: number;
    pending: number;
    failed: number;
    importedBytes: number;
    pendingBytes: number;
};

export function recordImport(
    ledger: HonenUploadLedger,
    options: {
        sourceId: string;
        workspaceId: string;
        parentId: string;
        itemId: string;
        versionId?: string | null;
        title: string;
        absolutePath?: string | null;
        importedAt?: string;
    },
): HonenUploadEntry;

export function appendExternalSource(
    ledger: HonenUploadLedger,
    options: {
        absolutePath: string;
        logicalPath: string;
        sourceId?: string | null;
    },
): HonenUploadEntry;
