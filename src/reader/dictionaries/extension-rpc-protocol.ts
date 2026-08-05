import { localBytesFromBlob } from '../platform/binary-realm';

export const EXTENSION_DICTIONARY_RPC_CHANNEL = 'yomu.dictionary-store.v1';
export const EXTENSION_DICTIONARY_RPC_PORT = `${EXTENSION_DICTIONARY_RPC_CHANNEL}.operation`;
export const EXTENSION_DICTIONARY_RPC_VERSION = 1;
export const EXTENSION_DICTIONARY_BACKGROUND_MARKER = 'yomu-extension-dictionary-background';
export const EXTENSION_DICTIONARY_PROBE_TIMEOUT_MS = 250;
export const EXTENSION_DICTIONARY_KEEPALIVE_MS = 20_000;

// Base64 expands by 4/3. Keeping source chunks at 256 KiB leaves each JSON
// message far below Chrome's runtime-message ceiling even after metadata.
const BINARY_CHUNK_BYTES = 256 * 1024;
const VALUE_TAG = '__yomuDictionaryRpcValue';

export interface DictionaryRpcTarget {
    readonly id: string;
    readonly language: string;
    readonly interfaceVersion: number;
}

export interface DictionaryRpcError {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
    readonly code?: string;
    readonly yomuUiCopyKey?: string;
    readonly epochMayHaveCommitted?: boolean;
    readonly cause?: DictionaryRpcError;
}

export type DictionaryRpcValue = unknown;

export interface DictionaryRpcBinaryAttachment {
    readonly id: string;
    readonly value: Blob;
}

export interface PreparedDictionaryRpcValue {
    readonly value: DictionaryRpcValue;
    readonly binaries: readonly DictionaryRpcBinaryAttachment[];
}

export interface DictionaryRpcBinaryChunk {
    readonly kind: 'binary';
    readonly id: string;
    readonly data: string;
    readonly final: boolean;
}

interface DictionaryRpcValueMarker extends Record<string, unknown> {
    readonly [VALUE_TAG]: string;
}

interface DictionaryRpcBinaryMarker extends DictionaryRpcValueMarker {
    readonly id: string;
    readonly binaryKind: 'blob' | 'file';
    readonly size: number;
    readonly type: string;
    readonly name?: string;
    readonly lastModified?: number;
}

interface DictionaryRpcCallbackMarker extends DictionaryRpcValueMarker {
    readonly id: number;
}

interface DictionaryRpcTargetMarker extends DictionaryRpcValueMarker, DictionaryRpcTarget {}

export interface DictionaryRpcCodecOptions {
    callbackId?: (callback: (...args: unknown[]) => unknown) => number;
}

export interface DictionaryRpcDecodeOptions {
    binary?: (marker: DictionaryRpcBinaryMarker) => Blob;
    callback?: (id: number) => (...args: unknown[]) => unknown;
    target?: (target: DictionaryRpcTarget) => unknown;
}

export function prepareDictionaryRpcValue(
    input: unknown,
    options: DictionaryRpcCodecOptions = {},
): PreparedDictionaryRpcValue {
    const binaries: DictionaryRpcBinaryAttachment[] = [];
    const ancestors = new Set<object>();
    let binarySequence = 0;

    const encode = (value: unknown): unknown => {
        if (value === undefined) return marker('undefined');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            if (Number.isFinite(value)) return value;
            return { ...marker('number'), value: String(value) };
        }
        if (typeof value === 'function') {
            if (!options.callbackId) throw new TypeError('Dictionary RPC cannot serialize a function outside a callback slot.');
            return { ...marker('callback'), id: options.callbackId(value as (...args: unknown[]) => unknown) };
        }
        if (typeof value !== 'object') throw new TypeError(`Dictionary RPC cannot serialize ${typeof value}.`);
        if (isLearningTargetModule(value)) {
            return {
                ...marker('target'),
                id: value.id,
                language: value.language,
                interfaceVersion: value.interfaceVersion,
            } satisfies DictionaryRpcTargetMarker;
        }
        if (isBlobLike(value)) {
            const id = `binary-${++binarySequence}`;
            binaries.push({ id, value });
            const file = isFileLike(value);
            return {
                ...marker('binary'),
                id,
                binaryKind: file ? 'file' : 'blob',
                size: value.size,
                type: value.type || '',
                ...(file ? { name: value.name, lastModified: value.lastModified } : {}),
            } satisfies DictionaryRpcBinaryMarker;
        }
        if (value instanceof Date) return { ...marker('date'), value: value.toISOString() };
        if (ancestors.has(value)) throw new TypeError('Dictionary RPC cannot serialize a cyclic value.');
        ancestors.add(value);
        try {
            if (Array.isArray(value)) return value.map(encode);
            const encoded: Record<string, unknown> = {};
            for (const [key, child] of Object.entries(value)) encoded[key] = encode(child);
            return encoded;
        } finally {
            ancestors.delete(value);
        }
    };

    return { value: encode(input), binaries };
}

export function decodeDictionaryRpcValue(
    input: DictionaryRpcValue,
    options: DictionaryRpcDecodeOptions = {},
): unknown {
    const decode = (value: unknown): unknown => {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(decode);
        const tagged = value as DictionaryRpcValueMarker;
        switch (tagged[VALUE_TAG]) {
            case 'undefined':
                return undefined;
            case 'number':
                return Number((tagged as Record<string, unknown>).value);
            case 'date':
                return new Date(String((tagged as Record<string, unknown>).value));
            case 'binary':
                if (!options.binary) throw new Error('Dictionary RPC binary payload was not supplied.');
                return options.binary(tagged as DictionaryRpcBinaryMarker);
            case 'callback':
                if (!options.callback) throw new Error('Dictionary RPC callback channel was not supplied.');
                return options.callback((tagged as DictionaryRpcCallbackMarker).id);
            case 'target':
                if (!options.target) throw new Error('Dictionary RPC learning-target resolver was not supplied.');
                return options.target(tagged as DictionaryRpcTargetMarker);
            default: {
                const decoded: Record<string, unknown> = {};
                for (const [key, child] of Object.entries(value)) decoded[key] = decode(child);
                return decoded;
            }
        }
    };
    return decode(input);
}

export async function sendDictionaryRpcBinaries(
    binaries: readonly DictionaryRpcBinaryAttachment[],
    send: (message: DictionaryRpcBinaryChunk) => void,
): Promise<void> {
    for (const attachment of binaries) {
        const size = attachment.value.size;
        if (size === 0) {
            send({ kind: 'binary', id: attachment.id, data: '', final: true });
            continue;
        }
        for (let offset = 0; offset < size; offset += BINARY_CHUNK_BYTES) {
            const end = Math.min(size, offset + BINARY_CHUNK_BYTES);
            const bytes = await localBytesFromBlob(attachment.value.slice(offset, end));
            send({
                kind: 'binary',
                id: attachment.id,
                data: bytesToBase64(bytes),
                final: end >= size,
            });
        }
    }
}

export class DictionaryRpcBinaryReceiver {
    private readonly chunks = new Map<string, Uint8Array[]>();
    private readonly completed = new Set<string>();

    accept(message: DictionaryRpcBinaryChunk): void {
        if (this.completed.has(message.id)) throw new Error(`Dictionary RPC binary ${message.id} was already complete.`);
        const chunks = this.chunks.get(message.id) ?? [];
        chunks.push(base64ToBytes(message.data));
        this.chunks.set(message.id, chunks);
        if (message.final) this.completed.add(message.id);
    }

    has(id: string): boolean {
        return this.completed.has(id);
    }

    value(marker: DictionaryRpcBinaryMarker): Blob {
        if (!this.has(marker.id)) throw new Error(`Dictionary RPC binary ${marker.id} is incomplete.`);
        const parts = this.chunks.get(marker.id) ?? [];
        const blob = new Blob(parts as BlobPart[], { type: marker.type });
        if (blob.size !== marker.size) {
            throw new Error(`Dictionary RPC binary ${marker.id} has ${blob.size} bytes; expected ${marker.size}.`);
        }
        if (marker.binaryKind !== 'file') return blob;
        if (typeof File === 'function') {
            return new File([blob], marker.name || 'dictionary.bin', {
                type: marker.type,
                lastModified: marker.lastModified,
            });
        }
        Object.defineProperties(blob, {
            name: { value: marker.name || 'dictionary.bin', configurable: true },
            lastModified: { value: marker.lastModified ?? Date.now(), configurable: true },
        });
        return blob;
    }
}

export function dictionaryRpcBinaryIds(input: DictionaryRpcValue): string[] {
    const ids: string[] = [];
    const visit = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        const tagged = value as DictionaryRpcValueMarker;
        if (tagged[VALUE_TAG] === 'binary') {
            ids.push(String((tagged as unknown as DictionaryRpcBinaryMarker).id));
            return;
        }
        Object.values(value).forEach(visit);
    };
    visit(input);
    return ids;
}

export function dictionaryRpcError(error: unknown, depth = 0): DictionaryRpcError {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const message = typeof record.message === 'string' ? record.message : String(error || 'Dictionary background request failed.');
    return {
        name: typeof record.name === 'string' ? record.name : 'Error',
        message,
        ...(typeof record.stack === 'string' ? { stack: record.stack } : {}),
        ...(typeof record.code === 'string' ? { code: record.code } : {}),
        ...(typeof record.yomuUiCopyKey === 'string' ? { yomuUiCopyKey: record.yomuUiCopyKey } : {}),
        ...(typeof record.epochMayHaveCommitted === 'boolean' ? { epochMayHaveCommitted: record.epochMayHaveCommitted } : {}),
        ...(depth < 2 && record.cause !== undefined ? { cause: dictionaryRpcError(record.cause, depth + 1) } : {}),
    };
}

export function reviveDictionaryRpcError(value: DictionaryRpcError): Error {
    const error = new Error(value.message, value.cause ? { cause: reviveDictionaryRpcError(value.cause) } : undefined);
    error.name = value.name || 'Error';
    if (value.stack) error.stack = value.stack;
    const record = error as Error & Record<string, unknown>;
    if (value.code) record.code = value.code;
    if (value.yomuUiCopyKey) record.yomuUiCopyKey = value.yomuUiCopyKey;
    if (value.epochMayHaveCommitted !== undefined) record.epochMayHaveCommitted = value.epochMayHaveCommitted;
    return error;
}

/** Restore request-object identity for result contracts that expose an index. */
export function rebindDictionaryRpcInputReferences(args: readonly unknown[], result: unknown): unknown {
    const requests = Array.isArray(args[0]) ? args[0] : null;
    if (!requests || !Array.isArray(result)) return result;
    return result.map(item => {
        if (!item || typeof item !== 'object') return item;
        const record = item as Record<string, unknown>;
        const index = record.requestIndex;
        if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= requests.length || !('request' in record)) {
            return item;
        }
        return { ...record, request: requests[index as number] };
    });
}

export function isDictionaryRpcBinaryChunk(value: unknown): value is DictionaryRpcBinaryChunk {
    const record = value && typeof value === 'object' ? value as Partial<DictionaryRpcBinaryChunk> : null;
    return record?.kind === 'binary'
        && typeof record.id === 'string'
        && typeof record.data === 'string'
        && typeof record.final === 'boolean';
}

function marker(kind: string): DictionaryRpcValueMarker {
    return { [VALUE_TAG]: kind };
}

function isBlobLike(value: object): value is Blob {
    try {
        const candidate = value as Partial<Blob>;
        return typeof candidate.size === 'number'
            && typeof candidate.type === 'string'
            && typeof candidate.slice === 'function';
    } catch {
        return false;
    }
}

function isFileLike(value: Blob): value is File {
    try {
        const candidate = value as Partial<File>;
        return typeof candidate.name === 'string' && typeof candidate.lastModified === 'number';
    } catch {
        return false;
    }
}

function isLearningTargetModule(value: object): value is DictionaryRpcTarget & Record<string, unknown> {
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.language === 'string'
        && typeof candidate.interfaceVersion === 'number'
        && typeof candidate.normalizeText === 'function'
        && typeof candidate.lookupCandidates === 'function';
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}
