import { uiText } from '../app/i18n';
import { requestBlob, requestText } from '../network/http';
import type { ReaderSettings } from '../app/types';

export interface AudioRequestOptions {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    data?: string;
    proxyUrl?: string;
    language?: ReaderSettings['interfaceLanguage'];
    allowDirectCrossOrigin?: boolean;
    allowPublicProxies?: boolean;
    allowConfiguredProxy?: boolean;
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
        allowPublicProxies: options.allowPublicProxies,
        allowConfiguredProxy: options.allowConfiguredProxy,
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
