import { isYouTubePage } from './subtitle-youtube';
import { getUserscriptHttpRequest, requestViaUserscriptManager } from '../userscript/index';
import { SubtitleRequestPolicy } from './subtitle-request-policy';

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

export function requestSubtitleText(url: string): Promise<string> {
    if (/^(blob|data):/i.test(url)) {
        return fetchSubtitleText(url);
    }
    return subtitleRequestPolicy.run(url, () => requestSubtitleTextWithRetry(url));
}

async function requestSubtitleTextWithRetry(url: string): Promise<string> {
    try {
        return await requestSubtitleTextOnce(url);
    } catch (error) {
        if (!shouldRetrySubtitleRequest(error)) throw error;
        await delaySubtitleRetry();
        return requestSubtitleTextOnce(url);
    }
}

function requestSubtitleTextOnce(url: string): Promise<string> {
    if (isYouTubeTimedTextUrl(url)) {
        return requestSubtitleTextWithUserscript(url).catch(error => shouldTryAlternateSubtitleTransport(error)
            ? fetchSubtitleText(url)
            : Promise.reject(error));
    }
    if (shouldFetchSubtitleInPageContext(url)) {
        return fetchSubtitleText(url).catch(error => shouldTryAlternateSubtitleTransport(error)
            ? requestSubtitleTextWithUserscript(url, error)
            : Promise.reject(error));
    }
    return fetchSubtitleText(url, 'omit')
        .catch(error => shouldTryAlternateSubtitleTransport(error)
            ? requestSubtitleTextWithUserscript(url, error)
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

function requestSubtitleTextWithUserscript(url: string, pageFetchError?: unknown): Promise<string> {
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
        });
    }
    if (pageFetchError) return Promise.reject(pageFetchError);
    return fetchSubtitleText(url);
}

function fetchSubtitleText(url: string, credentials: RequestCredentials = 'include'): Promise<string> {
    return fetch(url, { credentials, signal: subtitleRequestSignal() }).then(response => {
        assertCompleteSubtitleStatus(response.status);
        return response.text();
    });
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
    return isRetryableSubtitleRequestError(error)
        && (!(error instanceof SubtitleRequestError) || error.status !== 429);
}

function shouldTryAlternateSubtitleTransport(error: unknown): boolean {
    if (!(error instanceof SubtitleRequestError)) return true;
    return error.status === undefined || error.status === 0 || error.status === 401 || error.status === 403;
}

function delaySubtitleRetry(): Promise<void> {
    return new Promise(resolve => globalThis.setTimeout(resolve, SUBTITLE_REQUEST_RETRY_DELAY_MS));
}

function subtitleRequestSignal(): AbortSignal | undefined {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(SUBTITLE_REQUEST_TIMEOUT_MS)
        : undefined;
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
