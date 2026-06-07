import { uiText } from '../../app/i18n';
import { Logger } from '../../app/logger';
import { fetchWithCorsFallbacks } from '../../network/proxy-fetch';
import type { InterfaceLanguage } from '../../app/types';
import { getUserscriptHttpRequest } from '../../userscript/index';

const log = Logger.scope('Yomitan');

export function filenameFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const pathName = parsed.pathname.split('/').filter(Boolean).pop();
        return pathName && /\.zip$/i.test(pathName) ? decodeURIComponent(pathName) : 'dictionary.zip';
    } catch {
        return 'dictionary.zip';
    }
}

export function fileSummary(file: File, sourceUrl = ''): Record<string, unknown> {
    return {
        name: file.name,
        size: file.size,
        type: file.type,
        sourceHost: sourceUrl ? safeHost(sourceUrl) : '',
    };
}

export function safeHost(url: string): string {
    try {
        return new URL(url, location.href).host;
    } catch {
        return '';
    }
}

export function namedBlobFile(blob: Blob, name: string, type: string): File {
    if (typeof File === 'function') return new File([blob], name, { type });
    Object.defineProperty(blob, 'name', { value: name, configurable: true });
    Object.defineProperty(blob, 'lastModified', { value: Date.now(), configurable: true });
    return blob as File;
}

export function formatPercent(loaded: number, total: number): string {
    if (total <= 0) return '100%';
    return `${Math.max(0, Math.min(100, Math.round((loaded / total) * 100)))}%`;
}

export function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'] as const;
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }
    const precision = unit === 0 || size >= 10 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unit]}`;
}

export async function requestBlob(url: string, proxyUrl: string, onProgress?: (message: string) => void, language: InterfaceLanguage = 'en'): Promise<Blob> {
    const done = log.time('Dictionary download', { host: safeHost(url) });
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return requestBlobViaUserscript(url, userscriptRequest, done, onProgress, language);
    return await requestBlobViaFetch(url, proxyUrl, done, onProgress, language);
}

function requestBlobViaUserscript(
    url: string,
    userscriptRequest: NonNullable<ReturnType<typeof getUserscriptHttpRequest>>,
    done: () => void,
    onProgress?: (message: string) => void,
    language: InterfaceLanguage = 'en',
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const handleLoad = (response: UserscriptHttpResponse) => {
            if (response.response instanceof Blob && (response.status === 0 || (response.status >= 200 && response.status < 300))) {
                log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: response.response.size });
                done();
                resolve(response.response);
                return;
            }
            if (response.status < 200 || response.status >= 300) {
                log.warn('Dictionary download HTTP error', { host: safeHost(url), status: response.status });
                done();
                reject(new Error(formatDictionaryDownloadFailed(language, response.status)));
                return;
            }
            log.warn('Dictionary download payload failed', { host: safeHost(url), status: response.status });
            done();
            reject(new Error(uiText(language, 'dictionaryDownloadNotZip')));
        };
        const result = userscriptRequest({
            method: 'GET',
            url,
            headers: { accept: 'application/zip,application/octet-stream,*/*' },
            responseType: 'blob',
            timeout: 120000,
            onprogress: event => {
                if (event.lengthComputable && event.total > 0) {
                    onProgress?.(`${uiText(language, 'dictionaryDownloadProgress')} ${Math.round((event.loaded / event.total) * 100)}%...`);
                }
            },
            onload: handleLoad,
            onerror: () => {
                log.warn('Dictionary download failed', { host: safeHost(url) });
                done();
                reject(new Error(uiText(language, 'dictionaryDownloadFailed')));
            },
            ontimeout: () => {
                log.warn('Dictionary download timed out', { host: safeHost(url) });
                done();
                reject(new Error(uiText(language, 'dictionaryDownloadTimedOut')));
            },
        });
        if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
            (result as Promise<UserscriptHttpResponse>).then(handleLoad, () => {
                log.warn('Dictionary download failed', { host: safeHost(url) });
                done();
                reject(new Error(uiText(language, 'dictionaryDownloadFailed')));
            });
        }
    });
}

async function requestBlobViaFetch(
    url: string,
    proxyUrl: string,
    done: () => void,
    onProgress: ((message: string) => void) | undefined,
    language: InterfaceLanguage,
): Promise<Blob> {
    const downloadUrl = dictionaryDownloadUrl(url);
    if (!downloadUrl) return throwMissingDictionaryDownloadBridge(done, language);
    try {
        return await fetchDictionaryBlob(url, downloadUrl, proxyUrl, done, onProgress, language);
    } catch (error) {
        return handleDictionaryFetchError(url, downloadUrl, error, done, language);
    }
}

function throwMissingDictionaryDownloadBridge(done: () => void, language: InterfaceLanguage): never {
    done();
    throw new Error(uiText(language, 'dictionaryDownloadNeedsBridge'));
}

async function fetchDictionaryBlob(
    url: string,
    downloadUrl: string,
    proxyUrl: string,
    done: () => void,
    onProgress: ((message: string) => void) | undefined,
    language: InterfaceLanguage,
): Promise<Blob> {
    const response = await fetchWithCorsFallbacks(downloadUrl, proxyUrl, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', timeoutMs: 120000 });
    if (!response.ok) throwDictionaryHttpError(url, response.status, language);
    const blob = await responseBlobWithProgress(response, onProgress, language);
    log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: blob.size });
    done();
    return blob;
}

async function responseBlobWithProgress(response: Response, onProgress: ((message: string) => void) | undefined, language: InterfaceLanguage): Promise<Blob> {
    if (!response.body || !onProgress) return response.blob();
    const total = Number(response.headers.get('content-length') ?? 0);
    const type = response.headers.get('content-type') || 'application/zip';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress(formatDictionaryDownloadProgress(language, loaded, total));
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new Blob([bytes.buffer.slice(0)], { type });
}

function formatDictionaryDownloadProgress(language: InterfaceLanguage, loaded: number, total: number): string {
    const label = uiText(language, 'dictionaryDownloadProgress');
    if (total > 0) return `${label} ${formatPercent(loaded, total)} (${formatBytes(loaded)} / ${formatBytes(total)})...`;
    return `${label} ${formatBytes(loaded)}...`;
}

function throwDictionaryHttpError(url: string, status: number, language: InterfaceLanguage): never {
    log.warn('Dictionary download HTTP error', { host: safeHost(url), status });
    throw new Error(formatDictionaryDownloadFailed(language, status));
}

function handleDictionaryFetchError(url: string, downloadUrl: string, error: unknown, done: () => void, language: InterfaceLanguage): never {
    const host = safeHost(url);
    if (isDictionaryCorsError(error)) {
        log.warn('Dictionary download CORS failed', { host, downloadUrl });
        done();
        throw new Error(uiText(language, 'dictionaryDownloadBlocked'));
    }
    log.warn('Dictionary download fetch failed', { host, error });
    done();
    throw language === 'ja' ? new Error(uiText(language, 'dictionaryDownloadFailed')) : error;
}

function formatDictionaryDownloadFailed(language: InterfaceLanguage, status: number): string {
    return language === 'ja'
        ? `${uiText(language, 'dictionaryDownloadFailed')}（${status}）`
        : `Dictionary download failed (${status}).`;
}

function isDictionaryCorsError(error: unknown): boolean {
    return error instanceof Error && error.name === 'TypeError';
}

function dictionaryDownloadUrl(url: string): string | null {
    try {
        const target = new URL(url, location.href);
        const current = new URL(location.href);
        if (target.origin === current.origin) return target.href;
        if (target.protocol === 'https:' || target.protocol === 'http:') return target.href;
        return null;
    } catch {
        return url;
    }
}
