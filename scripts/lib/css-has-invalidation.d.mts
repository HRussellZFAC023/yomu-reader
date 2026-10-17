export interface HasInvalidationFinding {
    line: number;
    selector: string;
    reason: string;
    allowed: boolean;
}

export function findHasInvalidationRisks(css: string): HasInvalidationFinding[];

export function readerStylesheetFiles(entry: string): string[];
