// AbortError predicate covering both the DOMException raised by fetch/
// AbortController and plain Error objects whose name is 'AbortError' (some
// environments/polyfills reject with an Error rather than a DOMException).
export function isAbortError(error: unknown): boolean {
    return (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError';
}

export class RetryableTimeoutError extends Error {
    constructor(message = 'Request timed out.') {
        super(message);
        this.name = 'RetryableTimeoutError';
    }
}
