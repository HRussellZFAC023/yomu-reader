import { isYouTubePage } from './subtitle-youtube';
import { getUserscriptHttpRequest, requestViaUserscriptManager } from '../userscript/index';
import { SubtitleRequestPolicy } from './subtitle-request-policy';
import { isAbortError } from '../core/errors';

const SUBTITLE_REQUEST_TIMEOUT_MS = 8000;
const SUBTITLE_REQUEST_RETRY_DELAY_MS = 250;

class SubtitleRequestError extends Error {
    constructor(message: string, readonly retryable: boolean, readonly status?: number) {
        super(message);
        this.name = 'SubtitleRequestError';
    }
}

const subtitleRequestPolicy = new SubtitleRequestPolicy({
    classifyFailure: error => ({ status: error instanceof SubtitleRequestError ? error.status : undefined }),
});

export function requestSubtitleText(url: string, signal?: AbortSignal): Promise<string> {
    if (/^(blob|data):/i.test(url)) {
        return fetchSubtitleText(url, 'include', signal);
    }
    return subtitleRequestPolicy.run(url, requestSignal => requestSubtitleTextWithRetry(url, requestSignal), signal);
}

async function requestSubtitleTextWithRetry(url: string, signal: AbortSignal): Promise<string> {
    try {
        return await requestSubtitleTextOnce(url, signal);
    } catch (error) {
        if (!shouldRetrySubtitleRequest(error)) throw error;
        await delaySubtitleRetry(signal);
        return requestSubtitleTextOnce(url, signal);
    }
}

function requestSubtitleTextOnce(url: string, signal: AbortSignal): Promise<string> {
    if (isYouTubeTimedTextUrl(url)) {
        return requestSubtitleTextWithUserscript(url, undefined, signal).catch(error => shouldTryAlternateSubtitleTransport(error)
            ? fetchSubtitleText(url, 'include', signal)
            : Promise.reject(error));
    }
    if (shouldFetchSubtitleInPageContext(url)) {
        return fetchSubtitleText(url, 'include', signal).catch(error => shouldTryAlternateSubtitleTransport(error)
            ? requestSubtitleTextWithUserscript(url, error, signal)
            : Promise.reject(error));
    }
    return fetchSubtitleText(url, 'omit', signal)
        .catch(error => shouldTryAlternateSubtitleTransport(error)
            ? requestSubtitleTextWithUserscript(url, error, signal)
            : Promise.reject(error));
}

export function subtitleRequestFailureDetails(url: string): Record<string, string> {
    try {
        const parsed = new URL(url, location.href);
        return {
            host: parsed.hostname,
            path: parsed.pathname,
            format: parsed.searchParams.get('fmt') ?? '',
            language: parsed.searchParams.get('lang') ?? '',
        };
    } catch {
        return { url: 'invalid' };
    }
}

function requestSubtitleTextWithUserscript(
    url: string,
    pageFetchError?: unknown,
    signal?: AbortSignal,
): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        // SUBTITLE_REQUEST_TIMEOUT_MS used to be handed to the manager only, and
        // the promise-returning managers (GM4 / Safari Userscripts / the hosted
        // bridge) were not bridged at all — caption loading hung with no retry.
        // The helper enforces the same 8 s locally and bridges both shapes.
        return requestViaUserscriptManager<string>(userscriptRequest, {
            details: {
                method: 'GET',
                url,
                responseType: 'text',
                timeout: SUBTITLE_REQUEST_TIMEOUT_MS,
            },
            readResponse: response => {
                assertCompleteSubtitleStatus(response.status);
                return String(response.responseText ?? response.response ?? '');
            },
            onError: () => new SubtitleRequestError('Subtitle request failed during transport.', true),
            onTimeout: () => new SubtitleRequestError('Subtitle request timed out.', true),
            signal,
        });
    }
    if (pageFetchError) return Promise.reject(pageFetchError);
    return fetchSubtitleText(url, 'include', signal);
}

async function fetchSubtitleText(
    url: string,
    credentials: RequestCredentials = 'include',
    signal?: AbortSignal,
): Promise<string> {
    const request = subtitleRequestAbortScope(signal);
    try {
        const response = await fetch(url, { credentials, signal: request.signal });
        assertCompleteSubtitleStatus(response.status);
        return await response.text();
    } finally {
        request.dispose();
    }
}

function assertCompleteSubtitleStatus(status: number): void {
    if (status >= 200 && status < 300 && status !== 206) return;
    if (status === 206) throw new SubtitleRequestError('Subtitle request returned a partial response (206).', true, status);
    throw new SubtitleRequestError(`Subtitle request failed (${status}).`, isTransientSubtitleStatus(status), status);
}

function isTransientSubtitleStatus(status: number): boolean {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableSubtitleRequestError(error: unknown): boolean {
    return !(error instanceof SubtitleRequestError) || error.retryable;
}

function shouldRetrySubtitleRequest(error: unknown): boolean {
    // A 429 is an instruction to slow down, not a transport interruption.
    // Retrying it 250 ms later only deepens the rate limit; the shared policy
    // schedules the next probe instead.
    return !isAbortError(error)
        && isRetryableSubtitleRequestError(error)
        && (!(error instanceof SubtitleRequestError) || error.status !== 429);
}

function shouldTryAlternateSubtitleTransport(error: unknown): boolean {
    if (isAbortError(error)) return false;
    if (!(error instanceof SubtitleRequestError)) return true;
    return error.status === undefined || error.status === 0 || error.status === 401 || error.status === 403;
}

function delaySubtitleRetry(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(subtitleAbortReason(signal));
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => finish(resolve), SUBTITLE_REQUEST_RETRY_DELAY_MS);
        const onAbort = (): void => finish(() => reject(subtitleAbortReason(signal)));
        const finish = (settle: () => void): void => {
            globalThis.clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            settle();
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

function subtitleRequestAbortScope(signal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const relayAbort = (): void => controller.abort(subtitleAbortReason(signal));
    if (signal?.aborted) relayAbort();
    else signal?.addEventListener('abort', relayAbort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), SUBTITLE_REQUEST_TIMEOUT_MS);
    return {
        signal: controller.signal,
        dispose: () => {
            globalThis.clearTimeout(timeout);
            signal?.removeEventListener('abort', relayAbort);
        },
    };
}

function subtitleAbortReason(signal?: AbortSignal): unknown {
    return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}

function shouldFetchSubtitleInPageContext(url: string): boolean {
    try {
        const parsed = new URL(url, location.href);
        return parsed.origin === location.origin;
    } catch {
        return false;
    }
}

function isYouTubeTimedTextUrl(url: string): boolean {
    if (!isYouTubePage()) return false;
    try {
        const parsed = new URL(url, location.href);
        return /(^|\.)youtube\.com$/i.test(parsed.hostname)
            && /\/api\/timedtext$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}
