import type { SubtitleTranscriptPanel, TranscriptPanelRenderState, TranscriptRow } from './transcript-panel';

export interface TranscriptVirtualPatch {
    virtual: NonNullable<TranscriptPanelRenderState['virtual']>;
    rowCount: number;
}

interface TranscriptVirtualPatchContext {
    isVirtualScroller: boolean;
    lastStructureSignature: string;
    previousRowCount: number | undefined;
}

export function transcriptVirtualPatch(
    state: TranscriptPanelRenderState,
    context: TranscriptVirtualPatchContext,
): TranscriptVirtualPatch | undefined {
    if (!transcriptVirtualStructureMatches(state, context)) return undefined;
    const rowCount = growingTranscriptVirtualRowCount(state, context.previousRowCount);
    if (rowCount === undefined) return undefined;
    return { virtual: state.virtual!, rowCount };
}

function transcriptVirtualStructureMatches(
    state: TranscriptPanelRenderState,
    context: TranscriptVirtualPatchContext,
): boolean {
    return [
        Boolean(state.virtual),
        context.isVirtualScroller,
        state.structureSignature === context.lastStructureSignature,
    ].every(Boolean);
}

function growingTranscriptVirtualRowCount(
    state: TranscriptPanelRenderState,
    previousRowCount: number | undefined,
): number | undefined {
    if (previousRowCount === undefined) return undefined;
    const rowCount = transcriptPanelRowCount(state);
    return rowCount < previousRowCount ? undefined : rowCount;
}

function transcriptPanelRowCount(state: TranscriptPanelRenderState): number {
    return state.totalRowCount ?? state.rows.length;
}

export function transcriptWarmupRows(state: TranscriptPanelRenderState): TranscriptRow[] {
    return state.warmupRows ?? state.rows;
}

export function renderTranscriptVirtualRows(
    state: TranscriptPanelRenderState,
    rowIndexOffset: number,
    transcriptRows: TranscriptRow[],
    panel: SubtitleTranscriptPanel,
): string {
    if (!state.rows.length) return panel.renderWaitingState();
    return state.rows.map((row, index) => (
        panel.renderRow(row, rowIndexOffset + index, state.currentRowIndex, transcriptRows)
    )).join('');
}

export function panelRenderAlreadyCurrent(force: boolean, signature: string, previousSignature: string): boolean {
    return !force && signature === previousSignature;
}
