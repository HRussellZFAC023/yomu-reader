export async function runLimited<T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void> | void,
): Promise<void> {
    if (!items.length) return;
    const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
    let nextIndex = 0;
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            await worker(items[index], index);
        }
    }));
}
