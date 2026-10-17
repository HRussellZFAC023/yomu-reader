import type { Page } from 'playwright';

export type GeometryBox = [number, number, number, number];
export interface GeometrySignature {
    viewport: { width: number; height: number };
    document: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number };
    blocks: Array<{ key: string; box?: GeometryBox; missing?: boolean }>;
    paragraphs: Array<{ key: string; lineCount?: number; lines?: GeometryBox[]; missing?: boolean }>;
    paged: Array<{ key: string; columnCount: string; columnWidth: string; scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number; pages: number }>;
}
export interface GeometryDiff { kind: 'document' | 'block' | 'paragraph' | 'paged'; key: string; delta: number; detail: string }

export function selectGeometryKeys(page: Page, options?: { count?: number; root?: string | null }): Promise<string[]>;
export function captureGeometrySignature(page: Page, options: { keys: string[]; root?: string | null; maxLines?: number }): Promise<GeometrySignature>;
export function compareGeometrySignatures(
    expected: GeometrySignature,
    actual: GeometrySignature,
    options?: { tolerancePx?: number; ignore?: Array<'document' | 'blocks' | 'paragraphs' | 'paged'> },
): { ok: boolean; maxDelta: number; diffs: GeometryDiff[] };
