import { uiText } from '../../app/i18n';
import { userFacingError } from '../../app/user-facing-errors';
import { Logger } from '../../app/logger';
import { fetchWithCorsFallbacks } from '../../network/proxy-fetch';
import type { InterfaceLanguage } from '../../app/types';
import { getUserscriptHttpRequest, requestViaUserscriptManager } from '../../userscript/index';
import { localBytesFromView } from '../../platform/binary-realm';

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
    // A dictionary archive legitimately needs the widest budget in the reader, so
    // the 120 s stays exactly as it was — it is now enforced locally too, because
    // a manager that drops the callback used to leave the import dialog on its
    // progress line forever with no error and no way back.
    return requestViaUserscriptManager<Blob>(userscriptRequest, {
        details: {
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
        },
        readResponse: response => {
            if (response.response instanceof Blob && (response.status === 0 || (response.status >= 200 && response.status < 300))) {
                log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: response.response.size });
                done();
                return response.response;
            }
            if (response.status < 200 || response.status >= 300) {
                log.warn('Dictionary download HTTP error', { host: safeHost(url), status: response.status });
                done();
                throw userFacingError('dictionaryDownloadFailed', { diagnostic: formatDictionaryDownloadFailed(language, response.status) });
            }
            log.warn('Dictionary download payload failed', { host: safeHost(url), status: response.status });
            done();
            throw userFacingError('dictionaryDownloadNotZip', { diagnostic: `Dictionary download payload was not a ZIP (status ${response.status}).` });
        },
        onError: () => {
            log.warn('Dictionary download failed', { host: safeHost(url) });
            done();
            return userFacingError('dictionaryDownloadFailed', { diagnostic: 'The userscript manager reported a request error.' });
        },
        onTimeout: () => {
            log.warn('Dictionary download timed out', { host: safeHost(url) });
            done();
            return userFacingError('dictionaryDownloadTimedOut', { diagnostic: 'The dictionary download exceeded its 120s budget.' });
        },
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
        return handleDictionaryFetchError(url, downloadUrl, error, done);
    }
}

function throwMissingDictionaryDownloadBridge(done: () => void, language: InterfaceLanguage): never {
    done();
    throw userFacingError('dictionaryDownloadNeedsBridge', {
        diagnostic: uiText(language, 'dictionaryDownloadNeedsBridge'),
    });
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
        const chunk = localBytesFromView(value);
        chunks.push(chunk);
        loaded += chunk.byteLength;
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
    throw userFacingError('dictionaryDownloadFailed', { diagnostic: formatDictionaryDownloadFailed(language, status) });
}

function handleDictionaryFetchError(url: string, downloadUrl: string, error: unknown, done: () => void): never {
    const host = safeHost(url);
    if (isDictionaryCorsError(error)) {
        log.warn('Dictionary download CORS failed', { host, downloadUrl });
        done();
        throw userFacingError('dictionaryDownloadBlocked', { diagnostic: `Cross-origin dictionary download was blocked for ${host}.` });
    }
    log.warn('Dictionary download fetch failed', { host, error });
    done();
    throw userFacingError('dictionaryDownloadFailed', { cause: error, diagnostic: error instanceof Error ? error.message : String(error) });
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
