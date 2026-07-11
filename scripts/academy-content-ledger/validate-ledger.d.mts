export interface ValidateLedgerOptions {
    sampleExistence?: number;
    checkExistence?: boolean;
}

export interface ValidateLedgerCoverage {
    fileAssets: number;
    bulkDatasets: number;
    uniquePayloads: number;
    rawFileCount: number;
    rawBulkCount: number;
}

export interface ValidateLedgerResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    coverage: ValidateLedgerCoverage;
}

export function validate(options?: ValidateLedgerOptions): Promise<ValidateLedgerResult>;
