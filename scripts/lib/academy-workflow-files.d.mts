export function readJson(filePath: string): unknown;
export function resolveConfinedFile(
    candidate: string,
    roots: string[],
): { absolute: string; root: string; realRoot: string };
export function canonicalizeReservationPath(repoRoot: string, candidate: string): string;
