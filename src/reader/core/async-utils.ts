export function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function isPromiseLike<T = unknown>(value: unknown): value is Promise<T> {
    return Boolean(value && typeof (value as PromiseLike<T>).then === 'function');
}

export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeoutId = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([
        promise,
        timeout,
    ]).finally(() => window.clearTimeout(timeoutId));
}

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

// Result-returning bounded map: like Promise.all(items.map(worker)) but with at
// most `concurrency` workers in flight, preserving input order. Used to keep
// IndexedDB-backed enrichment fan-out from flooding the main thread.
export async function mapLimited<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R> | R,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    await runLimited(items, concurrency, async (item, index) => {
        results[index] = await worker(item, index);
    });
    return results;
}

// Shared concurrency gate: serializes work across DIFFERENT call sites (e.g.
// every cue being warmed in parallel) so the aggregate in-flight count stays
// bounded, not just the per-call fan-out.
export class ConcurrencyGate {
    private active = 0;
    private readonly queue: Array<() => void> = [];

    constructor(private readonly limit: number) {}

    async run<R>(task: () => Promise<R> | R): Promise<R> {
        if (this.active >= this.limit) {
            await new Promise<void>(resolve => this.queue.push(resolve));
        }
        this.active += 1;
        try {
            return await task();
        } finally {
            this.active -= 1;
            this.queue.shift()?.();
        }
    }
}
