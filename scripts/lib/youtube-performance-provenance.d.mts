export interface ProfileFileDescriptor {
    path: string;
    bytes: number;
    sha256: string;
}

export function transitiveLocalImportFiles(entryPath: string, repositoryRoot: string): string[];
export function profileDriverProvenance(
    entryPath: string,
    repositoryRoot: string,
): {
    sourceSha256: string;
    environmentSha256: string;
    gitCommit: string;
    dirtyPaths: string[];
    files: ProfileFileDescriptor[];
    toolFiles: ProfileFileDescriptor[];
    runtime: Record<string, string | null | undefined>;
    tools: Record<string, Record<string, string | null> | null>;
    browserRegistry: Record<string, unknown> | null;
};
