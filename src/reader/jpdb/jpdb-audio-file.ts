import { requestAudioUrl as requestUrl } from '../audio-request';
import { normalizeAttemptedAudioUrl } from '../audio-source-resolution';
import { uiText } from '../i18n';
import type { ReaderSettings } from '../types';

const JPDB_AUDIO_BASE_URL = 'https://jpdb.io/static/v';
const JPDB_AUDIO_ACCESS_HEADER = "please don't steal these files";
const JPDB_AUDIO_XOR_BYTES = [0x06, 0x23, 0x54, 0x0f] as const;
const JPDB_AUDIO_ID_RE = /^(?:\/static\/user\/)?[A-Za-z0-9_./-]+$/;
const LOOPBACK_AUDIO_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface JpdbAudioPlaybackCandidate {
    audioIds: string[];
    deckId: string;
}

export interface JpdbAudioRequest {
    url: string;
    headers?: Record<string, string>;
    encoded: boolean;
}

export function normalizeJpdbAudioIds(value: string | string[]): string[] {
    return uniqueJpdbAudioValues(normalizeJpdbAudioGroups(value)
        .flatMap(group => group.split('+')));
}

export function jpdbAudioPlaybackCandidates(value: string | string[]): JpdbAudioPlaybackCandidate[] {
    const groups = normalizeJpdbAudioGroups(value);
    return groups.map(group => ({ audioIds: group.split('+'), deckId: `jpdb:${group}` }));
}

export function jpdbAudioRequest(audioId: string, language: ReaderSettings['interfaceLanguage'] = 'en'): JpdbAudioRequest {
    if (!isValidJpdbAudioId(audioId)) throw new Error(uiText(language, 'invalidJpdbAudioId'));
    if (audioId.startsWith('/static/user/')) {
        return { url: new URL(audioId, 'https://jpdb.io').toString(), encoded: false };
    }
    const devUrl = localDevJpdbAudioUrl(audioId);
    if (devUrl) {
        return {
            url: devUrl,
            headers: jpdbAudioHeaders(),
            encoded: true,
        };
    }
    return {
        url: `${JPDB_AUDIO_BASE_URL}/${encodeJpdbAudioPath(audioId)}`,
        headers: jpdbAudioHeaders(),
        encoded: true,
    };
}

export async function fetchJpdbAudioBlob(audioId: string, settings: ReaderSettings): Promise<Blob> {
    const request = jpdbAudioRequest(audioId, settings.interfaceLanguage);
    const response = await requestUrl(request.url, 'blob', settings.audioTimeoutMs, {
        headers: request.headers,
        proxyUrl: settings.corsProxyUrl,
        language: settings.interfaceLanguage,
        credentials: 'same-origin',
        withCredentials: true,
    });
    if (!(response instanceof Blob)) throw new Error(uiText(settings.interfaceLanguage, 'jpdbAudioPlayableFileMissing'));
    return decodeJpdbAudioBlob(response, request.encoded, settings.interfaceLanguage);
}

export async function decodeJpdbAudioBlob(response: Blob, encoded: boolean, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<Blob> {
    const bytes = new Uint8Array(await blobArrayBuffer(response, language));
    const decoded = encoded ? decodeJpdbAudioBytes(bytes) : bytes;
    const sniffedType = jpdbAudioMimeTypeForBytes(decoded);
    if (!sniffedType) {
        if (!encoded && isAudioBlobType(response.type)) return new Blob([blobPart(decoded)], { type: response.type });
        throw new Error(uiText(language, 'jpdbAudioResponseNotPlayable'));
    }
    return new Blob([blobPart(decoded)], { type: sniffedType });
}

export function jpdbAudioPageSourceUrl(audioId: string): string {
    return audioId.startsWith('/static/user/') ? 'https://jpdb.io/' : JPDB_AUDIO_BASE_URL;
}

function normalizeJpdbAudioGroups(value: string | string[]): string[] {
    const values = Array.isArray(value) ? value : value.split(',');
    return uniqueJpdbAudioValues(values
        .map(normalizeJpdbAudioGroup)
        .filter(Boolean));
}

function normalizeJpdbAudioGroup(value: string): string {
    const ids = value.split('+')
        .map(item => item.trim())
        .filter(Boolean);
    return ids.length && ids.every(isValidJpdbAudioId) ? ids.join('+') : '';
}

function blobArrayBuffer(blob: Blob, language: ReaderSettings['interfaceLanguage'] = 'en'): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error(uiText(language, 'couldNotReadAudioBlob')));
        reader.readAsArrayBuffer(blob);
    });
}

function jpdbAudioHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Access': JPDB_AUDIO_ACCESS_HEADER };
    if (shouldForceJpdbCafAudio()) headers['X-ForceCAF'] = '1';
    return headers;
}

function shouldForceJpdbCafAudio(): boolean {
    const audio = document.createElement('audio');
    return audio.canPlayType('audio/ogg; codecs=opus') === ''
        && audio.canPlayType('audio/x-caf') !== '';
}

function decodeJpdbAudioBytes(bytes: Uint8Array): Uint8Array {
    const decoded = new Uint8Array(bytes);
    JPDB_AUDIO_XOR_BYTES.forEach((mask, index) => {
        if (index < decoded.length) decoded[index] = decoded[index] ^ mask;
    });
    return decoded;
}

function jpdbAudioMimeTypeForBytes(bytes: Uint8Array): string {
    if (startsWithAscii(bytes, 'OggS')) return 'audio/ogg; codecs=opus';
    if (startsWithAscii(bytes, 'caff')) return 'audio/x-caf';
    if (startsWithAscii(bytes, 'RIFF')) return 'audio/wav';
    if (startsWithAscii(bytes, 'ID3') || isMp3Frame(bytes)) return 'audio/mpeg';
    if (asciiAt(bytes, 4, 'ftyp')) return 'audio/mp4';
    return '';
}

function startsWithAscii(bytes: Uint8Array, signature: string): boolean {
    return asciiAt(bytes, 0, signature);
}

function asciiAt(bytes: Uint8Array, offset: number, signature: string): boolean {
    if (bytes.length < offset + signature.length) return false;
    return Array.from(signature).every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function isMp3Frame(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function isAudioBlobType(type: string): boolean {
    return /^audio\//i.test(type.trim());
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function localDevJpdbAudioUrl(audioId: string): string {
    if (!isLocalNewTabDevOrigin()) return '';
    const url = new URL(`/__yomu-jpdb-audio/${encodeJpdbAudioPath(audioId)}`, location.href);
    if (shouldForceJpdbCafAudio()) url.searchParams.set('force_caf', '1');
    return url.toString();
}

function isLocalNewTabDevOrigin(): boolean {
    if (typeof window === 'undefined' || typeof location === 'undefined') return false;
    if ((window as typeof window & { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ !== 'newtab') return false;
    return /^https?:$/.test(location.protocol)
        && LOOPBACK_AUDIO_HOSTS.has(location.hostname.replace(/^\[|\]$/g, ''));
}

function encodeJpdbAudioPath(value: string): string {
    return value.split('/').map(encodeURIComponent).join('/');
}

function isValidJpdbAudioId(value: string): boolean {
    return Boolean(value && JPDB_AUDIO_ID_RE.test(value) && !value.includes('..') && !value.startsWith('//'));
}

function uniqueJpdbAudioValues(values: string[]): string[] {
    const seen = new Set<string>();
    return values.filter(value => {
        const key = normalizeAttemptedAudioUrl(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
