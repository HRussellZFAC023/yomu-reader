export interface RedactionHashList { algorithm: string; normalization: string; hashes: string[] }

export const VISIBLE_ATTRIBUTES: readonly string[];
export const STRUCTURAL_ATTRIBUTES: readonly string[];
export const ARIA_STATE_ATTRIBUTES: readonly string[];
export function attributeSelectorIndex(cssTexts: string[]): Record<string, Array<{ op: string; value: string; insensitive: boolean }>>;
export function isHiddenCopy(text: string | null | undefined): boolean;
export function normalizeTextRun(text: string | null | undefined): string | null;
export function hashTextRun(run: string): string;
export function redactionHashList(originalRuns: string[]): RedactionHashList;
export function textRunsFromHtml(html: string): string[];
export function siteCodeInHtml(html: string): string[];
export function findRedactionLeaks(recordingDir: string, hashList: RedactionHashList): Array<{ file: string; hash: string; length: number }>;
export function textRunsFromCss(cssText: string): string[];
export function generatedCopyInCss(cssText: string): string[];
export function findGeneratedCopy(recordingDir: string): Array<{ file: string; hash: string; length: number }>;
