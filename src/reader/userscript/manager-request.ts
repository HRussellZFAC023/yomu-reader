import { isPromiseLike } from './request-source';

/**
 * The one way to await a userscript manager's HTTP request.
 *
 * Every call site used to hand-roll its own `new Promise` around
 * GM_xmlhttpRequest, and each hand-rolled copy carried some subset of three
 * defects that end in a promise which never settles — i.e. a reader that hangs
 * with no error anywhere ("settings companion did not load", a study card stuck
 * on "Translating...", OCR latched on "Could not read text"):
 *
 *   (a) No local deadline. The `timeout` field is only a REQUEST to the
 *       manager, and several transports drop it — the hosted DOM-event bridge,
 *       Violentmonkey/GM4/Safari-Userscripts promise shapes, managers that
 *       predate the field. A dropped callback then never settles the promise
 *       and every await above it hangs forever. The deadline is enforced HERE,
 *       transport behaviour notwithstanding.
 *   (b) The abort handle taken only in the non-thenable branch. Violentmonkey's
 *       GM.xmlHttpRequest returns a thenable that ALSO carries abort(); letting
 *       the promise branch claim the result left the deadline with nothing to
 *       cancel, so the transfer ran on orphaned and its bytes were discarded.
 *       The handle is taken whenever one is offered, independent of thenability.
 *   (c) No teardown on a synchronous throw. A manager can refuse synchronously
 *       (a host outside @connect, a dead page-world binding); letting that
 *       escape the executor rejects the promise but leaves the deadline timer
 *       and the abort listener alive holding the closure for the whole budget.
 *
 * Settlement is single-shot, so a manager that both resolves its promise and
 * fires onload — or answers after we already gave up — cannot settle twice or
 * run teardown against a request that no longer exists.
 */
export function requestViaUserscriptManager<T>(
    request: UserscriptHttpRequest,
    config: UserscriptManagerRequestConfig<T>,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const signal = config.signal;
        if (signal?.aborted) {
            reject(abortReason(config));
            return;
        }
        let handle: UserscriptHttpRequestHandle | undefined;
        let aborted = false;
        const tryAbort = () => {
            // The manager's own ontimeout can land after the local deadline has
            // already cancelled; aborting a second time is at best wasted and at
            // worst reported again by the manager.
            if (aborted) return;
            aborted = true;
            try { handle?.abort?.(); } catch { /* ignore */ }
        };
        let settled = false;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const finish = (settle: () => void) => {
            if (settled) return;
            settled = true;
            if (deadline !== undefined) clearTimeout(deadline);
            if (signal) signal.removeEventListener('abort', onAbort);
            // Everything that settles is caller code: readResponse carries each
            // caller's status check and body decode, and the reason mappers build
            // each caller's error. All of them can throw, and by here the deadline
            // is cleared and the abort listener is gone, so a throw that escaped
            // would leave nothing able to settle this promise — pending forever,
            // the exact hang this module exists to prevent.
            try {
                settle();
            } catch (error) {
                reject(error);
            }
        };
        const handleLoad = (response: UserscriptHttpResponse) => finish(() => {
            resolve(config.readResponse(response));
        });
        const handleError = (error: unknown) => finish(() => reject(errorReason(config, error)));
        // Settle first, then cancel. abort() is third-party code that may report
        // synchronously through onerror; letting it run first lets that report win
        // the single-shot race and hand the caller a transport failure in place of
        // the timeout or the abort it actually got.
        const handleTimeout = () => {
            finish(() => reject(timeoutReason(config)));
            tryAbort();
        };
        const onAbort = () => {
            finish(() => reject(abortReason(config)));
            tryAbort();
        };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        deadline = setTimeout(handleTimeout, localDeadlineMs(config));
        // A progress event proves the transport is alive, so the deadline is
        // rearmed from it rather than counted from dispatch. The budget exists to
        // catch a DROPPED callback, not a slow-but-live transfer: a large
        // dictionary on a thin connection legitimately runs past any fixed wall,
        // and cutting it there would be a new failure rather than a fix. Only the
        // sites that ask for progress get this; the rest keep a hard budget.
        const reportProgress = (config.details as { onprogress?: (event: unknown) => void }).onprogress;
        const onprogress = reportProgress === undefined ? undefined : (event: unknown) => {
            if (!settled) {
                if (deadline !== undefined) clearTimeout(deadline);
                deadline = setTimeout(handleTimeout, localDeadlineMs(config));
            }
            reportProgress(event);
        };
        try {
            const result = request({
                ...config.details,
                ...(onprogress === undefined ? {} : { onprogress }),
                onload: handleLoad,
                onerror: handleError,
                ontimeout: handleTimeout,
            });
            // (b): claim the handle before the thenable check, never inside its
            // else. Both reads touch a manager-world object, so they stay inside
            // the guard — a throwing accessor must not escape the executor and
            // leave the deadline and the abort listener alive behind it.
            if (result && typeof (result as UserscriptHttpRequestHandle).abort === 'function') {
                handle = result as UserscriptHttpRequestHandle;
            }
            if (isPromiseLike(result)) result.then(handleLoad, handleError);
        } catch (error) {
            // (c): settling through finish tears the deadline and the abort
            // listener down; a bare throw out of the executor leaves both alive.
            handleError(error);
        }
    });
}

/**
 * Callers that name no budget still must not be able to hang the page when the
 * manager drops the callback. This backstop sits far above every real budget in
 * the reader (the widest explicit one is WaniKani's 30 s, and the dictionary
 * download's 120 s is passed explicitly), so it can only ever fire on a dead
 * transport.
 */
export const DROPPED_CALLBACK_DEADLINE_MS = 120_000;

/** The manager details a caller supplies; the three callbacks are ours. */
export type UserscriptManagerRequestDetails = Omit<
    Parameters<UserscriptHttpRequest>[0],
    'onload' | 'onerror' | 'ontimeout'
>;

export interface UserscriptManagerRequestConfig<T> {
    details: UserscriptManagerRequestDetails;
    /** Reads (and validates) a successful manager response; a throw rejects. */
    readResponse: (response: UserscriptHttpResponse) => T;
    /**
     * Local deadline in ms. Defaults to `details.timeout`, and to
     * DROPPED_CALLBACK_DEADLINE_MS when neither names a positive budget.
     */
    deadlineMs?: number;
    signal?: AbortSignal;
    /** Maps a transport failure (or a synchronous refusal) to a rejection reason. */
    onError?: (error: unknown) => unknown;
    /** Maps the deadline (local or manager-reported) to a rejection reason. */
    onTimeout?: () => unknown;
    /** Maps an aborted signal to a rejection reason. */
    onAbort?: () => unknown;
}

function localDeadlineMs(config: UserscriptManagerRequestConfig<unknown>): number {
    const budget = config.deadlineMs ?? config.details.timeout;
    return budget && budget > 0 ? budget : DROPPED_CALLBACK_DEADLINE_MS;
}

function errorReason(config: UserscriptManagerRequestConfig<unknown>, error: unknown): unknown {
    if (config.onError) return config.onError(error);
    return error instanceof Error ? error : new Error('Request failed.');
}

function timeoutReason(config: UserscriptManagerRequestConfig<unknown>): unknown {
    return config.onTimeout ? config.onTimeout() : new Error('Request timed out.');
}

function abortReason(config: UserscriptManagerRequestConfig<unknown>): unknown {
    if (config.onAbort) return config.onAbort();
    if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}
