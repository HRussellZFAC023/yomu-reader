/**
 * One cancellable operation with independently abortable consumers.
 * The underlying work is cancelled only after its final consumer leaves.
 */
export class SharedAbortableOperation<T> {
    private readonly controller = new AbortController();
    private readonly promise: Promise<T>;
    private subscribers = 0;
    private settled = false;

    constructor(
        start: (signal: AbortSignal) => Promise<T>,
        private readonly onInactive: () => void,
    ) {
        this.promise = start(this.controller.signal).finally(() => {
            this.settled = true;
            this.onInactive();
        });
    }

    subscribe(signal?: AbortSignal): Promise<T> {
        if (signal?.aborted) {
            this.abandonIfUnobserved();
            return Promise.reject(abortSignalReason(signal));
        }
        this.subscribers += 1;
        return new Promise<T>((resolve, reject) => {
            let active = true;
            const finish = (settle: () => void): void => {
                if (!active) return;
                active = false;
                signal?.removeEventListener('abort', onAbort);
                this.unsubscribe();
                settle();
            };
            const onAbort = (): void => finish(() => reject(abortSignalReason(signal)));
            signal?.addEventListener('abort', onAbort, { once: true });
            this.promise.then(
                value => finish(() => resolve(value)),
                error => finish(() => reject(error)),
            );
        });
    }

    private unsubscribe(): void {
        this.subscribers -= 1;
        this.abandonIfUnobserved();
    }

    private abandonIfUnobserved(): void {
        if (this.subscribers > 0 || this.settled) return;
        this.onInactive();
        this.controller.abort();
    }
}

export function abortSignalReason(signal?: AbortSignal): unknown {
    if (signal?.reason !== undefined) return signal.reason;
    if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}
