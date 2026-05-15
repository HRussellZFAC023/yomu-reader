export interface TranscriptHydrationPlanOptions {
    preferredIndex: number;
    rowCount: number;
    cursor: number;
    scroller?: HTMLElement | null;
    activeBehind: number;
    activeAhead: number;
    maxRows: number;
    backgroundBatch: number;
    fallbackRows?: number;
}

export interface TranscriptHydrationPlan {
    indexes: number[];
    nextCursor: number;
}

export function planTranscriptHydrationIndexes(options: TranscriptHydrationPlanOptions): TranscriptHydrationPlan {
    const indexes = new Set<number>();
    addPreferredIndexes(indexes, options);
    addVisibleIndexes(indexes, options);
    const nextCursor = addBackgroundIndexes(indexes, options);
    return { indexes: [...indexes].sort((a, b) => a - b), nextCursor };
}

function addPreferredIndexes(indexes: Set<number>, options: TranscriptHydrationPlanOptions): void {
    if (options.preferredIndex >= 0) {
        for (const index of preferredHydrationRange(options)) {
            addHydrationIndex(indexes, index, options);
            if (indexes.size >= options.maxRows) break;
        }
        return;
    }
    for (let index = 0; index < fallbackHydrationRows(options); index++) indexes.add(index);
}

function preferredHydrationRange(options: TranscriptHydrationPlanOptions): number[] {
    const start = options.preferredIndex - options.activeBehind;
    const end = options.preferredIndex + options.activeAhead;
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => start + offset);
}

function addHydrationIndex(indexes: Set<number>, index: number, options: TranscriptHydrationPlanOptions): void {
    if (index >= 0 && index < options.rowCount) indexes.add(index);
}

function fallbackHydrationRows(options: TranscriptHydrationPlanOptions): number {
    return Math.min(options.fallbackRows ?? 6, options.rowCount);
}

function addVisibleIndexes(indexes: Set<number>, options: TranscriptHydrationPlanOptions): void {
    const scrollerRect = options.scroller?.getBoundingClientRect();
    if (!options.scroller || !scrollerRect) return;
    for (const row of Array.from(options.scroller.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'))) {
        const index = visibleTranscriptRowIndex(row, scrollerRect, options.rowCount);
        if (index !== null) indexes.add(index);
        if (indexes.size >= options.maxRows) break;
    }
}

function visibleTranscriptRowIndex(row: HTMLElement, scrollerRect: DOMRect, rowCount: number): number | null {
    const rect = row.getBoundingClientRect();
    if (rect.bottom < scrollerRect.top || rect.top > scrollerRect.bottom) return null;
    const index = Number(row.dataset.rowIndex);
    return Number.isInteger(index) && index >= 0 && index < rowCount ? index : null;
}

function addBackgroundIndexes(indexes: Set<number>, options: TranscriptHydrationPlanOptions): number {
    let nextCursor = options.cursor;
    for (let count = 0; count < options.backgroundBatch && options.rowCount && indexes.size < options.maxRows; count++) {
        const index = nextCursor % options.rowCount;
        nextCursor = (nextCursor + 1) % options.rowCount;
        indexes.add(index);
    }
    return nextCursor;
}
