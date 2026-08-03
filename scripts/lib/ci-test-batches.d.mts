export function boundedSizeBalancedBatches<T>(
    items: readonly T[],
    maxItemsPerBatch: number,
    sizeForItem: (item: T) => number,
): T[][];

export function firstNonzeroStatus(statuses: readonly number[]): number;
