import { uiText } from '../../app/i18n';
import { isUserFacingError, userFacingError } from '../../app/user-facing-errors';
import { Logger } from '../../app/logger';
import { fetchWithCorsFallbacks } from '../../network/proxy-fetch';
import type { InterfaceLanguage } from '../../app/types';
import { getUserscriptHttpRequest, requestViaUserscriptManager } from '../../userscript/index';
import { localBytesFromView } from '../../platform/binary-realm';
import { isYomuNewTabUrl } from '../../newtab/url';

const log = Logger.scope('Yomitan');
// A dictionary archive legitimately needs the widest budget in the reader. A
// page fetch also spends it per chunk, so a stalled body cannot hang an install.
const DICTIONARY_DOWNLOAD_TIMEOUT_MS = 120000;

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
    if (!userscriptRequest) return await requestBlobViaFetch(url, proxyUrl, done, onProgress, language);
    if (!studyPageCanFetch(url)) return requestBlobViaUserscript(url, userscriptRequest, done, onProgress, language);
    return await requestBlobOnStudyPage(url, userscriptRequest, done, onProgress, language);
}

/**
 * On Study the page itself reads any host that sends CORS, streaming its
 * progress. The Reader bridge carries the whole archive in one message, which a
 * 51 MB dictionary outlasts, so it only serves hosts the page may not read.
 */
function studyPageCanFetch(url: string): boolean {
    return url.startsWith('https://') && isYomuNewTabUrl(location.href);
}

async function requestBlobOnStudyPage(
    url: string,
    userscriptRequest: NonNullable<ReturnType<typeof getUserscriptHttpRequest>>,
    done: () => void,
    onProgress: ((message: string) => void) | undefined,
    language: InterfaceLanguage,
): Promise<Blob> {
    try {
        return await fetchDictionaryBlob(url, url, '', done, onProgress, language);
    } catch (error) {
        if (isDictionaryCorsError(error)) return requestBlobViaUserscript(url, userscriptRequest, done, onProgress, language);
        return handleDictionaryFetchError(url, url, error, done);
    }
}

function requestBlobViaUserscript(
    url: string,
    userscriptRequest: NonNullable<ReturnType<typeof getUserscriptHttpRequest>>,
    done: () => void,
    onProgress?: (message: string) => void,
    language: InterfaceLanguage = 'en',
): Promise<Blob> {
    // The 120 s is enforced locally too, because a manager that drops the
    // callback used to leave the import dialog on its progress line forever
    // with no error and no way back.
    return requestViaUserscriptManager<Blob>(userscriptRequest, {
        details: {
            method: 'GET',
            url,
            headers: { accept: 'application/zip,application/octet-stream,*/*' },
            responseType: 'blob',
            timeout: DICTIONARY_DOWNLOAD_TIMEOUT_MS,
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
            return userFacingError('dictionaryDownloadFailed', { diagnostic: `The userscript manager's request to ${safeHost(url)} failed.` });
        },
        onTimeout: () => {
            log.warn('Dictionary download timed out', { host: safeHost(url) });
            done();
            return userFacingError('dictionaryDownloadTimedOut');
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
    // Direct first: the dictionary mirror answers any origin, and an extension
    // page holds host permission for the rest. Without it a cross-origin archive
    // had no candidate at all unless a proxy was configured, so every install on
    // Study failed at once with "No configured proxy."
    const response = await fetchWithCorsFallbacks(downloadUrl, proxyUrl, {
        credentials: 'omit',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        timeoutMs: DICTIONARY_DOWNLOAD_TIMEOUT_MS,
        allowDirectCrossOrigin: true,
    });
    if (!response.ok) throwDictionaryHttpError(url, response.status, language);
    const blob = await readDictionaryBody(response, onProgress, language);
    log.info('Dictionary download completed', { host: safeHost(url), status: response.status, size: blob.size });
    done();
    return blob;
}

/**
 * A body that breaks off is a failed download, never a host the page may not
 * read: it must not look like CORS, or Study would fetch it all again through
 * the Reader bridge.
 */
async function readDictionaryBody(response: Response, onProgress: ((message: string) => void) | undefined, language: InterfaceLanguage): Promise<Blob> {
    try {
        return await responseBlobWithProgress(response, onProgress, language);
    } catch (error) {
        if (isUserFacingError(error)) throw error;
        throw userFacingError('dictionaryDownloadFailed', { cause: error, diagnostic: error instanceof Error ? error.message : String(error) });
    }
}

async function responseBlobWithProgress(response: Response, onProgress: ((message: string) => void) | undefined, language: InterfaceLanguage): Promise<Blob> {
    if (!response.body) return response.blob();
    const total = Number(response.headers.get('content-length') ?? 0);
    const type = response.headers.get('content-type') || 'application/zip';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { value, done } = await readChunkWithinBudget(reader);
        if (done) break;
        const chunk = localBytesFromView(value);
        chunks.push(chunk);
        loaded += chunk.byteLength;
        onProgress?.(formatDictionaryDownloadProgress(language, loaded, total));
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new Blob([bytes.buffer.slice(0)], { type });
}

/** Cancelling ends the pending read as if the body were complete, so the flag tells them apart. */
async function readChunkWithinBudget(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ReadableStreamReadResult<Uint8Array>> {
    let stalled = false;
    const timer = setTimeout(() => {
        stalled = true;
        void reader.cancel().catch(() => undefined);
    }, DICTIONARY_DOWNLOAD_TIMEOUT_MS);
    try {
        const result = await reader.read();
        if (stalled) throw userFacingError('dictionaryDownloadTimedOut');
        return result;
    } finally {
        clearTimeout(timer);
    }
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
    // An HTTP status or a stalled body already says what happened.
    if (isUserFacingError(error)) throw error;
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
