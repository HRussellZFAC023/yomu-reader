export interface RedactionHashList { algorithm: string; normalization: string; hashes: string[] }

export const VISIBLE_ATTRIBUTES: readonly string[];
export function normalizeTextRun(text: string | null | undefined): string | null;
export function hashTextRun(run: string): string;
export function redactionHashList(originalRuns: string[]): RedactionHashList;
export function textRunsFromHtml(html: string): string[];
export function findRedactionLeaks(recordingDir: string, hashList: RedactionHashList): Array<{ file: string; hash: string; length: number }>;
