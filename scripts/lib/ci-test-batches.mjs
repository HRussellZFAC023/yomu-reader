/**
 * Split work into a hard-bounded number of items per batch while keeping both
 * item counts and estimated weights balanced. Input order is retained within
 * each batch so callers keep deterministic test ordering.
 */
export function boundedSizeBalancedBatches(items, maxItemsPerBatch, sizeForItem) {
    if (!Number.isInteger(maxItemsPerBatch) || maxItemsPerBatch < 1) {
        throw new Error('maxItemsPerBatch must be a positive integer');
    }
    if (!items.length) return [];

    const batchCount = Math.ceil(items.length / maxItemsPerBatch);
    const baseCapacity = Math.floor(items.length / batchCount);
    const largerBatchCount = items.length % batchCount;
    const batches = Array.from({ length: batchCount }, (_, index) => ({
        capacity: baseCapacity + (index < largerBatchCount ? 1 : 0),
        size: 0,
        entries: [],
    }));
    const weighted = items.map((item, index) => ({ item, index, size: sizeForItem(item) }));
    weighted.sort((left, right) => right.size - left.size || left.index - right.index);

    for (const entry of weighted) {
        const candidates = batches.filter(batch => batch.entries.length < batch.capacity);
        const target = candidates.reduce((smallest, candidate) => (
            candidate.size < smallest.size ? candidate : smallest
        ), candidates[0]);
        target.entries.push(entry);
        target.size += entry.size;
    }

    return batches.map(batch => batch.entries
        .sort((left, right) => left.index - right.index)
        .map(entry => entry.item));
}

/** Keep running every pass, then retain the first failure for the process exit. */
export function firstNonzeroStatus(statuses) {
    return statuses.find(status => status !== 0) ?? 0;
}
