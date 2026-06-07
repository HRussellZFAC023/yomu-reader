import { isYouTubePage } from './subtitle-youtube';
import { getUserscriptHttpRequest } from '../userscript/index';

const SUBTITLE_REQUEST_TIMEOUT_MS = 8000;

export function requestSubtitleText(url: string): Promise<string> {
    if (/^(blob|data):/i.test(url)) {
        return fetchSubtitleText(url);
    }
    if (isYouTubeTimedTextUrl(url)) {
        return requestSubtitleTextWithUserscript(url).catch(error => fetchSubtitleText(url).catch(() => Promise.reject(error)));
    }
    if (shouldFetchSubtitleInPageContext(url)) {
        return fetchSubtitleText(url).catch(error => requestSubtitleTextWithUserscript(url, error));
    }
    return requestSubtitleTextWithUserscript(url);
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
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'text',
                timeout: SUBTITLE_REQUEST_TIMEOUT_MS,
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(String(response.responseText ?? response.response ?? ''))
                    : reject(new Error(`Subtitle request failed (${response.status}).`)),
                onerror: reject,
                ontimeout: () => reject(new Error('Subtitle request timed out.')),
            });
        });
    }
    if (pageFetchError) return Promise.reject(pageFetchError);
    return fetchSubtitleText(url);
}

function fetchSubtitleText(url: string): Promise<string> {
    return fetch(url, { credentials: 'include', signal: subtitleRequestSignal() }).then(response => {
        if (!response.ok) throw new Error(`Subtitle request failed (${response.status}).`);
        return response.text();
    });
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
