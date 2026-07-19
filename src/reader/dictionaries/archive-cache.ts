import { Logger } from '../app/logger';
import { gmStorageDelete, gmStorageGet, gmStorageSet } from '../app/storage';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';

const log = Logger.scope('DictionaryArchiveCache');

// Imported dictionaries live in page IndexedDB, which is per-origin for a
// userscript: an import on one site is invisible everywhere else. The archive
// cache keeps the source of each imported dictionary in GM storage — which IS
// shared across origins — so any origin can rebuild its local store without
// user action (see replication.ts). URL imports store only the URL (the
// download is HTTP-cached); file imports persist the ZIP bytes in chunks.
const ARCHIVE_INDEX_KEY = 'yomu-dictionary-archives';
const ARCHIVE_CHUNK_PREFIX = 'yomu-dictionary-archive:';
// GM values are strings in every manager; 4MB of decoded bytes per chunk keeps
// each stored value (~5.3MB of base64) well inside per-value comfort zones.
const ARCHIVE_CHUNK_BYTES = 4 * 1024 * 1024;
// Beyond this the base64 copies risk userscript-manager storage pressure; the
// dictionary still works on the origin that imported it, it just cannot
// replicate automatically. Jitendex-size archives (~80MB) fit comfortably.
const MAX_ARCHIVE_BYTES = 192 * 1024 * 1024;

export interface DictionaryArchiveMeta {
    title: string;
    filename: string;
    downloadUrl?: string;
    size: number;
    chunkCount: number;
}

export type DictionaryArchiveIndex = Record<string, DictionaryArchiveMeta>;

export async function listDictionaryArchives(): Promise<DictionaryArchiveIndex> {
    const index = await gmStorageGet<DictionaryArchiveIndex | null>(ARCHIVE_INDEX_KEY, null);
    return index && typeof index === 'object' ? index : {};
}

export async function persistDictionaryArchive(input: {
    title: string;
    filename: string;
    downloadUrl?: string;
    file?: Blob;
}): Promise<void> {
    const identity = yomitanDictionaryIdentity(input.title);
    try {
        const previous = (await listDictionaryArchives())[identity];
        const meta = await writeArchivePayload(identity, input);
        if (!meta) return;
        await updateArchiveIndex(index => ({ ...index, [identity]: meta }));
        if (previous && previous.chunkCount > meta.chunkCount) {
            await deleteArchiveChunks(identity, previous.chunkCount, meta.chunkCount);
        }
        log.info('Dictionary archive persisted', { identity, title: input.title, size: meta.size, chunkCount: meta.chunkCount, viaUrl: Boolean(meta.downloadUrl) });
    } catch (error) {
        // Archive persistence is best-effort: a failure only means this
        // dictionary cannot auto-replicate to other origins.
        log.warn('Dictionary archive persist failed', { identity, title: input.title }, error);
    }
}

export async function readDictionaryArchiveFile(identity: string): Promise<File | null> {
    const meta = (await listDictionaryArchives())[identity];
    if (!meta || !meta.chunkCount) return null;
    const parts: Uint8Array[] = [];
    for (let chunk = 0; chunk < meta.chunkCount; chunk++) {
        const encoded = await gmStorageGet<string>(archiveChunkKey(identity, chunk), '');
        if (!encoded) {
            log.warn('Dictionary archive chunk missing', { identity, chunk });
            return null;
        }
        parts.push(base64ToBytes(encoded));
    }
    return new File(parts as BlobPart[], meta.filename || `${identity}.zip`, { type: 'application/zip' });
}

export async function deleteDictionaryArchive(title: string): Promise<void> {
    const identity = yomitanDictionaryIdentity(title);
    const meta = (await listDictionaryArchives())[identity];
    if (!meta) return;
    await updateArchiveIndex(index => {
        const next = { ...index };
        delete next[identity];
        return next;
    });
    await deleteArchiveChunks(identity, meta.chunkCount, 0);
    log.info('Dictionary archive deleted', { identity });
}

async function writeArchivePayload(identity: string, input: { title: string; filename: string; downloadUrl?: string; file?: Blob }): Promise<DictionaryArchiveMeta | null> {
    if (input.downloadUrl) {
        return { title: input.title, filename: input.filename, downloadUrl: input.downloadUrl, size: input.file?.size ?? 0, chunkCount: 0 };
    }
    if (!input.file) return null;
    if (input.file.size > MAX_ARCHIVE_BYTES) {
        log.warn('Dictionary archive too large to replicate across origins', { identity, size: input.file.size, max: MAX_ARCHIVE_BYTES });
        return null;
    }
    const bytes = await blobBytes(input.file);
    const chunkCount = Math.ceil(bytes.length / ARCHIVE_CHUNK_BYTES) || 1;
    for (let chunk = 0; chunk < chunkCount; chunk++) {
        const slice = bytes.subarray(chunk * ARCHIVE_CHUNK_BYTES, (chunk + 1) * ARCHIVE_CHUNK_BYTES);
        await gmStorageSet(archiveChunkKey(identity, chunk), bytesToBase64(slice));
    }
    return { title: input.title, filename: input.filename, size: bytes.length, chunkCount };
}

async function updateArchiveIndex(update: (index: DictionaryArchiveIndex) => DictionaryArchiveIndex): Promise<void> {
    const index = await listDictionaryArchives();
    await gmStorageSet(ARCHIVE_INDEX_KEY, update(index));
}

async function deleteArchiveChunks(identity: string, fromCount: number, keep: number): Promise<void> {
    for (let chunk = keep; chunk < fromCount; chunk++) {
        await gmStorageDelete(archiveChunkKey(identity, chunk));
    }
}

function archiveChunkKey(identity: string, chunk: number): string {
    return `${ARCHIVE_CHUNK_PREFIX}${identity}:${chunk}`;
}

// Blob.arrayBuffer is universal in target browsers; the FileReader path keeps
// jsdom-based tests honest.
async function blobBytes(blob: Blob): Promise<Uint8Array> {
    if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read dictionary archive blob.'));
        reader.readAsArrayBuffer(blob);
    });
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
