import type { ReaderHttpOptions } from './reader-http-options';
import { requestHttp } from './reader-http-request';

export type { ReaderHttpOptions } from './reader-http-options';

export async function requestText(url: string, options: ReaderHttpOptions = {}): Promise<string> {
    const value = await requestHttp(url, { ...options, responseType: 'text' });
    return typeof value === 'string' ? value : String(value ?? '');
}

export async function requestBlob(url: string, options: ReaderHttpOptions = {}): Promise<Blob> {
    const value = await requestHttp(url, { ...options, responseType: 'blob' });
    if (value instanceof Blob) return value;
    if (isBlobLike(value)) return new Blob([await value.arrayBuffer()], { type: value.type });
    throw new Error(options.blobFailureMessage ?? `${options.failureLabel ?? 'Request'} did not return a blob.`);
}

export async function requestJson(url: string, options: ReaderHttpOptions = {}): Promise<unknown> {
    const value = await requestHttp(url, { ...options, responseType: 'json' });
    return value;
}

function isBlobLike(value: unknown): value is { arrayBuffer: () => Promise<ArrayBuffer>; type: string } {
    return Boolean(value
        && typeof value === 'object'
        && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
        && typeof (value as { type?: unknown }).type === 'string');
}
