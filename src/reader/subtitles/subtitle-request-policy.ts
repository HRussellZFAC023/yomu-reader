const SUBTITLE_REQUEST_BACKOFF_INITIAL_MS = 5_000;
const SUBTITLE_REQUEST_BACKOFF_MAX_MS = 60_000;
const SUBTITLE_REQUEST_BACKOFF_RETENTION_MS = SUBTITLE_REQUEST_BACKOFF_MAX_MS * 2;
const SUBTITLE_REQUEST_BACKOFF_MAX_FAILURES = 5;

interface SubtitleRequestFailureClassification {
    status?: number;
}

interface SubtitleRequestPolicyOptions {
    classifyFailure: (error: unknown) => SubtitleRequestFailureClassification;
    now?: () => number;
}

interface SubtitleRequestBackoffState {
    failures: number;
    retryAt: number;
    status?: number;
    version: number;
}

const EMPTY_SUBTITLE_REQUEST_BACKOFF: SubtitleRequestBackoffState = {
    failures: 0,
    retryAt: 0,
    version: 0,
};

/**
 * Coordinates subtitle transport calls across track reloads.
 *
 * The interface deliberately accepts the transport operation rather than
 * knowing about fetch or userscript managers. That keeps single-flight and
 * backoff identical for every subtitle source while the caller retains the
 * existing transport-choice rules.
 */
export class SubtitleRequestPolicy {
    private readonly inFlight = new Map<string, Promise<unknown>>();
    private readonly endpointTails = new Map<string, Promise<void>>();
    private readonly backoff = new Map<string, SubtitleRequestBackoffState>();
    private readonly now: () => number;

    constructor(private readonly options: SubtitleRequestPolicyOptions) {
        this.now = options.now ?? (() => Date.now());
    }

    run<T>(url: string, operation: () => Promise<T>): Promise<T> {
        const resourceKey = subtitleRequestResourceKey(url);
        const endpointKey = subtitleRequestEndpointKey(url);
        const existing = this.inFlight.get(resourceKey);
        if (existing) return existing as Promise<T>;

        const now = this.now();
        this.pruneBackoff(now);
        const cooling = this.activeBackoff(endpointKey, now);
        if (cooling) return Promise.reject(new SubtitleRequestCooldownError(cooling.retryAt - now, cooling.status));

        const request = this.enqueueEndpointOperation(endpointKey, operation);
        const tracked = request.finally(() => {
            if (this.inFlight.get(resourceKey) === tracked) this.inFlight.delete(resourceKey);
        });
        this.inFlight.set(resourceKey, tracked);
        return tracked;
    }

    private enqueueEndpointOperation<T>(endpointKey: string, operation: () => Promise<T>): Promise<T> {
        const predecessor = this.endpointTails.get(endpointKey) ?? Promise.resolve();
        const request = predecessor.then(() => this.runEndpointOperation(endpointKey, operation));
        const tail = request.then(() => undefined, () => undefined);
        this.endpointTails.set(endpointKey, tail);
        void tail.then(() => {
            if (this.endpointTails.get(endpointKey) === tail) this.endpointTails.delete(endpointKey);
        });
        return request;
    }

    private async runEndpointOperation<T>(endpointKey: string, operation: () => Promise<T>): Promise<T> {
        const now = this.now();
        this.pruneBackoff(now);
        const cooling = this.activeBackoff(endpointKey, now);
        if (cooling) throw new SubtitleRequestCooldownError(cooling.retryAt - now, cooling.status);

        const backoffVersion = (this.backoff.get(endpointKey) || EMPTY_SUBTITLE_REQUEST_BACKOFF).version;
        try {
            const result = await operation();
            this.clearBackoff(endpointKey, backoffVersion);
            return result;
        } catch (error) {
            this.recordFailure(endpointKey, error);
            throw error;
        }
    }

    private activeBackoff(endpointKey: string, now: number): SubtitleRequestBackoffState | undefined {
        const state = this.backoff.get(endpointKey);
        return state && state.retryAt > now ? state : undefined;
    }

    private recordFailure(endpointKey: string, error: unknown): void {
        const failure = this.options.classifyFailure(error);
        // Only an explicit rate-limit response justifies suppressing a future
        // request. Network failures and 5xx responses keep their existing
        // one-retry behaviour and remain immediately recoverable by the next
        // independent controller selection.
        if (failure.status !== 429) return;
        const previous = this.backoff.get(endpointKey) || EMPTY_SUBTITLE_REQUEST_BACKOFF;
        const failures = Math.min(previous.failures + 1, SUBTITLE_REQUEST_BACKOFF_MAX_FAILURES);
        this.backoff.set(endpointKey, {
            failures,
            retryAt: this.now() + subtitleRequestBackoffMs(failures),
            status: failure.status,
            version: previous.version + 1,
        });
    }

    private clearBackoff(endpointKey: string, operationVersion: number): void {
        const current = this.backoff.get(endpointKey);
        // A response may outlive the state it observed. Never let an older
        // success erase a newer rate-limit epoch recorded for this endpoint.
        if (!current || current.version === operationVersion) this.backoff.delete(endpointKey);
    }

    private pruneBackoff(now: number): void {
        for (const [key, state] of this.backoff) {
            if (state.retryAt + SUBTITLE_REQUEST_BACKOFF_RETENTION_MS <= now) this.backoff.delete(key);
        }
    }
}

class SubtitleRequestCooldownError extends Error {
    constructor(readonly retryAfterMs: number, readonly status?: number) {
        super(`Subtitle request is cooling down for ${Math.max(1, Math.ceil(retryAfterMs))} ms.`);
        this.name = 'SubtitleRequestCooldownError';
    }
}

function subtitleRequestBackoffMs(failures: number): number {
    return Math.min(
        SUBTITLE_REQUEST_BACKOFF_INITIAL_MS * (2 ** Math.max(0, failures - 1)),
        SUBTITLE_REQUEST_BACKOFF_MAX_MS,
    );
}

function subtitleRequestResourceKey(url: string): string {
    return `resource:${normalizedSubtitleRequestUrl(url)}`;
}

function subtitleRequestEndpointKey(url: string): string {
    try {
        const parsed = new URL(url, subtitleRequestBaseUrl());
        return `endpoint:${parsed.origin}${parsed.pathname}`;
    } catch {
        return subtitleRequestResourceKey(url);
    }
}

function normalizedSubtitleRequestUrl(url: string): string {
    try {
        const parsed = new URL(url, subtitleRequestBaseUrl());
        parsed.hash = '';
        parsed.searchParams.sort();
        return parsed.href;
    } catch {
        return url;
    }
}

function subtitleRequestBaseUrl(): string {
    return typeof location === 'undefined' ? 'https://invalid.local/' : location.href;
}
