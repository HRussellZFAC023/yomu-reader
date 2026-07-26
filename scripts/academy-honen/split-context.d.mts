export interface ContextPart {
    readonly partNumber: number;
    readonly filename: string;
    readonly outputPath: string;
    readonly payloadBytes: number;
    readonly outputBytes: number;
    readonly sha256: string;
}

export interface SplitContextFileOptions {
    readonly inputPath: string;
    readonly outputDir: string;
    readonly maxBytes?: number;
}

export interface SplitContextFileResult {
    readonly sourcePath: string;
    readonly sourceBytes: number;
    readonly sourceSha256: string;
    readonly maxPayloadBytes: number;
    readonly partCount: number;
    readonly parts: readonly ContextPart[];
}

export function splitUtf8Buffer(
    buffer: Buffer,
    maxBytes?: number,
): Buffer[];

export function splitContextFile(
    options: SplitContextFileOptions,
): SplitContextFileResult;
