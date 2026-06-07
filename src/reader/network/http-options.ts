import type { ProxyFetchOptions } from './proxy-fetch';

export interface ReaderHttpOptions extends Omit<ProxyFetchOptions, 'body'> {
    data?: string | Blob | FormData | ArrayBuffer;
    proxyUrl?: string;
    responseType?: 'text' | 'blob' | 'json' | 'arraybuffer';
    failureLabel?: string;
    failureMessage?: string;
    statusFailureMessage?: (status: number) => string;
    timeoutLabel?: string;
    blobFailureMessage?: string;
    preferFetch?: boolean;
    anonymous?: boolean;
    withCredentials?: boolean;
    cookie?: string;
}
