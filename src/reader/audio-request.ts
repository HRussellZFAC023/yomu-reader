import { uiText } from './i18n';
import { requestBlob, requestText } from './reader-http';
import type { ReaderSettings } from './types';

export interface AudioRequestOptions {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    data?: string;
    proxyUrl?: string;
    language?: ReaderSettings['interfaceLanguage'];
    allowDirectCrossOrigin?: boolean;
    preferFetch?: boolean;
    credentials?: RequestCredentials;
    withCredentials?: boolean;
}

export function requestAudioUrl(responseUrl: string, responseType: 'blob' | 'text', timeoutMs: number, options: AudioRequestOptions = {}): Promise<unknown> {
    const language = options.language ?? 'en';
    const requestOptions = {
        method: options.method ?? 'GET',
        headers: options.headers,
        data: options.data,
        proxyUrl: options.proxyUrl,
        allowDirectCrossOrigin: options.allowDirectCrossOrigin ?? true,
        preferFetch: options.preferFetch ?? shouldPreferFetchForAudioRequests(),
        credentials: options.credentials,
        withCredentials: options.withCredentials,
        timeoutMs,
        failureLabel: uiText(language, 'audioRequest'),
        timeoutLabel: uiText(language, 'audioRequestTimedOut'),
    };
    return responseType === 'blob'
        ? requestBlob(responseUrl, requestOptions)
        : requestText(responseUrl, requestOptions);
}

function shouldPreferFetchForAudioRequests(): boolean {
    return typeof window !== 'undefined'
        && (window as typeof window & { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ === 'newtab';
}
