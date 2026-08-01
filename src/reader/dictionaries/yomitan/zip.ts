import { inflateSync } from 'fflate';
import { localBytesFromArrayBuffer, localBytesFromBlob, localBytesFromView } from '../../platform/binary-realm';

export interface ZipFileEntry {
    name: string;
    compressedSize: number;
    uncompressedSize: number;
}

export interface ZipReadProgress {
    phase: 'read' | 'directory';
    loaded: number;
    total: number;
    entries?: number;
}

export interface ZipEntryProgress {
    name: string;
    loaded: number;
    total: number;
}

interface ZipCentralEntry extends ZipFileEntry {
    compressionMethod: number;
    encrypted: boolean;
    localHeaderOffset: number;
}

const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_ENCRYPTED_FLAG = 0x0001;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

const textDecoder = new TextDecoder();

export class ZipArchive {
    constructor(private readonly archiveBytes: Uint8Array, private readonly files: Map<string, ZipCentralEntry>) {}

    entries(): ZipFileEntry[] {
        return [...this.files.values()].map(({ name, compressedSize, uncompressedSize }) => ({ name, compressedSize, uncompressedSize }));
    }

    async text(name: string, onProgress?: (progress: ZipEntryProgress) => void): Promise<string> {
        const entry = this.files.get(name);
        if (!entry) throw new Error(`${name} not found.`);
        onProgress?.({ name, loaded: 0, total: zipEntryProgressTotal(entry) });
        const bytes = await this.fileBytes(entry);
        onProgress?.({ name, loaded: bytes.byteLength, total: zipEntryProgressTotal(entry) });
        return textDecoder.decode(bytes);
    }

    async bytes(name: string): Promise<Uint8Array> {
        const entry = this.files.get(name);
        if (!entry) throw new Error(`${name} not found.`);
        return this.fileBytes(entry);
    }

    private async fileBytes(entry: ZipCentralEntry): Promise<Uint8Array> {
        if (entry.encrypted) throw new Error(`Encrypted ZIP entries are not supported: ${entry.name}`);
        const compressed = localFileBytes(this.archiveBytes, entry);
        if (entry.compressionMethod === ZIP_STORE_METHOD) return compressed;
        if (entry.compressionMethod === ZIP_DEFLATE_METHOD) return inflateRaw(compressed);
        throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}: ${entry.name}`);
    }
}

export async function readZipArchive(
    file: Blob,
    onProgress?: (progress: ZipReadProgress) => void,
    validateBytes?: (bytes: Uint8Array<ArrayBuffer>) => void | Promise<void>,
): Promise<ZipArchive> {
    const bytes = await readBlobBytes(file, onProgress);
    // Catalogue integrity runs here so the same one-time local byte copy feeds
    // both SHA-256 and ZIP parsing. Validating before directory parsing also
    // keeps malformed remote bytes away from the importer.
    await validateBytes?.(bytes);
    const archive = readZipArchiveBytes(bytes);
    onProgress?.({
        phase: 'directory',
        loaded: bytes.byteLength,
        total: file.size || bytes.byteLength,
        entries: archive.entries().length,
    });
    return archive;
}

/** Parse already-read ZIP bytes without another Blob/cross-realm copy. */
export function readZipArchiveBytes(bytes: Uint8Array): ZipArchive {
    bytes = localBytesFromView(bytes);
    return new ZipArchive(bytes, readZipCentralDirectory(bytes));
}

async function readBlobBytes(file: Blob, onProgress?: (progress: ZipReadProgress) => void): Promise<Uint8Array<ArrayBuffer>> {
    const total = file.size;
    if (!onProgress || typeof file.stream !== 'function') {
        const bytes = await localBytesFromBlob(file);
        onProgress?.({ phase: 'read', loaded: bytes.byteLength, total: total || bytes.byteLength });
        return bytes;
    }
    const reader = file.stream().getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let loaded = 0;
    onProgress({ phase: 'read', loaded, total });
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = localBytesFromView(value);
        chunks.push(chunk);
        loaded += chunk.byteLength;
        onProgress({ phase: 'read', loaded, total });
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function readZipCentralDirectory(bytes: Uint8Array): Map<string, ZipCentralEntry> {
    const view = dataView(bytes);
    const endOffset = findZipEndRecord(view);
    const entryCount = view.getUint16(endOffset + 10, true);
    const directorySize = view.getUint32(endOffset + 12, true);
    const directoryOffset = view.getUint32(endOffset + 16, true);
    if (entryCount === ZIP64_MARKER_16 || directorySize === ZIP64_MARKER_32 || directoryOffset === ZIP64_MARKER_32) {
        throw new Error('ZIP64 dictionaries are not supported.');
    }

    const files = new Map<string, ZipCentralEntry>();
    const directoryEnd = directoryOffset + directorySize;
    let offset = directoryOffset;
    for (let index = 0; index < entryCount && offset < directoryEnd; index++) {
        const entry = readCentralEntry(bytes, view, offset);
        offset = entry.nextOffset;
        if (!entry.file.name.endsWith('/')) files.set(entry.file.name, entry.file);
    }
    return files;
}

function findZipEndRecord(view: DataView): number {
    const minOffset = Math.max(0, view.byteLength - MAX_ZIP_COMMENT_BYTES - 22);
    for (let offset = view.byteLength - 22; offset >= minOffset; offset--) {
        if (view.getUint32(offset, true) === ZIP_END_SIGNATURE) return offset;
    }
    throw new Error('Invalid ZIP archive: end record not found.');
}

function readCentralEntry(bytes: Uint8Array, view: DataView, offset: number): { file: ZipCentralEntry; nextOffset: number } {
    assertSignature(view, offset, ZIP_CENTRAL_SIGNATURE, 'central directory entry');
    const flags = view.getUint16(offset + 8, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const name = decodeZipName(bytes.subarray(nameStart, nameStart + nameLength), flags);
    return {
        file: {
            name,
            compressionMethod: view.getUint16(offset + 10, true),
            encrypted: Boolean(flags & ZIP_ENCRYPTED_FLAG),
            compressedSize: view.getUint32(offset + 20, true),
            uncompressedSize: view.getUint32(offset + 24, true),
            localHeaderOffset: view.getUint32(offset + 42, true),
        },
        nextOffset: nameStart + nameLength + extraLength + commentLength,
    };
}

function localFileBytes(bytes: Uint8Array, entry: ZipCentralEntry): Uint8Array {
    const view = dataView(bytes);
    assertSignature(view, entry.localHeaderOffset, ZIP_LOCAL_SIGNATURE, 'local file header');
    const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const start = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > bytes.length) throw new Error(`Invalid ZIP entry bounds: ${entry.name}`);
    return bytes.subarray(start, end);
}

function zipEntryProgressTotal(entry: ZipCentralEntry): number {
    return entry.uncompressedSize || entry.compressedSize;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'function') {
        try {
            return await inflateRawWithStream(bytes);
        } catch {
            // Some mobile WebKit/Tampermonkey combinations expose the API but fail while piping.
        }
    }
    try {
        return inflateSync(bytes);
    } catch (error) {
        throw error instanceof Error
            ? new Error(`This browser could not import compressed ZIP dictionaries: ${error.message}`)
            : new Error('This browser could not import compressed ZIP dictionaries.');
    }
}

async function inflateRawWithStream(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([arrayBufferSlice(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return localBytesFromArrayBuffer(await new Response(stream).arrayBuffer());
}

function assertSignature(view: DataView, offset: number, expected: number, label: string): void {
    if (offset < 0 || offset + 4 > view.byteLength || view.getUint32(offset, true) !== expected) {
        throw new Error(`Invalid ZIP archive: ${label} not found.`);
    }
}

function decodeZipName(bytes: Uint8Array, flags: number): string {
    return new TextDecoder(flags & ZIP_UTF8_FLAG ? 'utf-8' : undefined).decode(bytes);
}

function dataView(bytes: Uint8Array): DataView {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function arrayBufferSlice(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
