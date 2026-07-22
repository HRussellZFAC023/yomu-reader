import { ConcurrencyGate } from '../core/async-utils';

const DEFAULT_MAX_BATCH_BYTES = 16_384;
const DEFAULT_MAX_BATCH_ITEMS = 80;
const DEFAULT_CONCURRENCY = 2;
const JSON_STRING_OVERHEAD_BYTES = 7;
const utf8Encoder = new TextEncoder();

interface PendingParagraph<Result> {
    paragraph: string;
    promise: Promise<Result>;
    resolve(value: Result): void;
    reject(error: unknown): void;
}

export interface JitenParseBatcherOptions<Result> {
    loadBatch(paragraphs: string[]): Promise<Result[]>;
    emptyResult(): Result;
    maxBatchBytes?: number;
    maxBatchItems?: number;
    concurrency?: number;
}

/**
 * Coalesces parse calls made during the same browser turn. Reader scans,
 * subtitle warm-up and popup fallback can overlap; Jiten accepts many text
 * rows in one reader/parse request, so each unique row gets one shared promise
 * and the provider sees bounded batches rather than one request per caller.
 */
export class JitenParseBatcher<Result> {
    private readonly pending = new Map<string, PendingParagraph<Result>>();
    private readonly inFlight = new Map<string, Promise<Result>>();
    private readonly gate: ConcurrencyGate;
    private flushScheduled = false;

    constructor(private readonly options: JitenParseBatcherOptions<Result>) {
        this.gate = new ConcurrencyGate(options.concurrency ?? DEFAULT_CONCURRENCY);
    }

    load(paragraphs: readonly string[]): Promise<Result[]> {
        return Promise.all(paragraphs.map(paragraph => paragraph.trim()
            ? this.loadParagraph(paragraph)
            : Promise.resolve(this.options.emptyResult())));
    }

    private loadParagraph(paragraph: string): Promise<Result> {
        const existing = this.inFlight.get(paragraph);
        if (existing) return existing;

        let resolve!: (value: Result) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        const entry = { paragraph, promise, resolve, reject };
        this.pending.set(paragraph, entry);
        this.inFlight.set(paragraph, promise);
        void promise.then(
            () => this.forgetInFlight(paragraph, promise),
            () => this.forgetInFlight(paragraph, promise),
        );
        this.scheduleFlush();
        return promise;
    }

    private scheduleFlush(): void {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        queueMicrotask(() => this.flush());
    }

    private flush(): void {
        this.flushScheduled = false;
        const entries = [...this.pending.values()];
        this.pending.clear();
        for (const batch of this.batches(entries)) this.loadQueuedBatch(batch);
    }

    private loadQueuedBatch(batch: PendingParagraph<Result>[]): void {
        const paragraphs = batch.map(entry => entry.paragraph);
        const request = this.gate.run(() => this.options.loadBatch(paragraphs));
        batch.forEach((entry, index) => {
            void request.then(
                results => entry.resolve(results[index] ?? this.options.emptyResult()),
                error => entry.reject(error),
            );
        });
    }

    private batches(entries: PendingParagraph<Result>[]): Array<Array<PendingParagraph<Result>>> {
        const maxBytes = Math.max(1, this.options.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES);
        const maxItems = Math.max(1, this.options.maxBatchItems ?? DEFAULT_MAX_BATCH_ITEMS);
        const batches: Array<Array<PendingParagraph<Result>>> = [];
        let batch: Array<PendingParagraph<Result>> = [];
        let batchBytes = 0;
        for (const entry of entries) {
            const bytes = utf8Encoder.encode(entry.paragraph).length + JSON_STRING_OVERHEAD_BYTES;
            if (batch.length && (batch.length >= maxItems || batchBytes + bytes > maxBytes)) {
                batches.push(batch);
                batch = [];
                batchBytes = 0;
            }
            batch.push(entry);
            batchBytes += bytes;
        }
        if (batch.length) batches.push(batch);
        return batches;
    }

    private forgetInFlight(paragraph: string, promise: Promise<Result>): void {
        if (this.inFlight.get(paragraph) === promise) this.inFlight.delete(paragraph);
    }
}
