import { deflateSync } from 'fflate';

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const DEFLATE_METHOD = 8;

const encoder = new TextEncoder();

export function yomitanZipBlob(files: Record<string, unknown>, options: { compression?: 'store' | 'deflate' } = {}): Blob {
    return new Blob(
        [arrayBufferSlice(yomitanZipBytes(files, options))],
        { type: 'application/zip' },
    );
}

export function yomitanZipBytes(
    files: Record<string, unknown>,
    options: { compression?: 'store' | 'deflate' } = {},
): Uint8Array {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const [name, value] of Object.entries(files)) {
        const nameBytes = encoder.encode(name);
        const uncompressed = zipFixtureData(value);
        const compressed = options.compression === 'deflate' ? deflateSync(uncompressed) : uncompressed;
        const method = options.compression === 'deflate' ? DEFLATE_METHOD : STORE_METHOD;
        localParts.push(localHeader(nameBytes, compressed.length, uncompressed.length, method), compressed);
        centralParts.push(centralHeader(nameBytes, compressed.length, uncompressed.length, offset, method));
        offset += 30 + nameBytes.length + compressed.length;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const parts = [
        ...localParts,
        ...centralParts,
        endRecord(Object.keys(files).length, centralSize, centralOffset),
    ];
    const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let writeOffset = 0;
    for (const part of parts) {
        bytes.set(part, writeOffset);
        writeOffset += part.length;
    }
    return bytes;
}

function zipFixtureData(value: unknown): Uint8Array {
    return encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
}

function localHeader(name: Uint8Array, compressedSize: number, uncompressedSize: number, method: number): Uint8Array {
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, LOCAL_FILE_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, method, true);
    view.setUint32(18, compressedSize, true);
    view.setUint32(22, uncompressedSize, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    return header;
}

function centralHeader(name: Uint8Array, compressedSize: number, uncompressedSize: number, offset: number, method: number): Uint8Array {
    const header = new Uint8Array(46 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, CENTRAL_FILE_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, UTF8_FLAG, true);
    view.setUint16(10, method, true);
    view.setUint32(20, compressedSize, true);
    view.setUint32(24, uncompressedSize, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
    header.set(name, 46);
    return header;
}

function endRecord(entries: number, centralSize: number, centralOffset: number): Uint8Array {
    const header = new Uint8Array(22);
    const view = new DataView(header.buffer);
    view.setUint32(0, END_SIGNATURE, true);
    view.setUint16(8, entries, true);
    view.setUint16(10, entries, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    return header;
}

function arrayBufferSlice(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
