export interface AsyncReconciliation {
    request: () => void;
    stop: () => void;
}

/**
 * Coalesce an event burst into one active reconciliation plus at most one
 * trailing read. These events are wake-up hints, never an authorization
 * channel, so redundant requests should not amplify privileged storage work.
 */
export function createAsyncReconciliation(
    reconcile: () => Promise<void>,
    onError?: (error: unknown) => void,
): AsyncReconciliation {
    let active = true;
    let running = false;
    let trailing = false;

    const request = (): void => {
        if (!active) return;
        if (running) {
            trailing = true;
            return;
        }
        running = true;
        void reconcile()
            .catch(error => onError?.(error))
            .finally(() => {
                running = false;
                if (!active || !trailing) return;
                trailing = false;
                request();
            });
    };

    return {
        request,
        stop: () => {
            active = false;
            trailing = false;
        },
    };
}
