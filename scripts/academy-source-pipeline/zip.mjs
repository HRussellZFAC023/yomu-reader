import { readFileSync } from 'node:fs';
import { inflateSync } from 'fflate';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const UTF8_NAME_FLAG = 0x0800;
const CRC32_TABLE = buildCrc32Table();

/**
 * Minimal, dependency-light ZIP reader. Parses the central directory directly
 * so the ledger can record exact compressed/uncompressed sizes, compression
 * method, and name-encoding flags — metadata `fflate.unzipSync` discards.
 * Handles the plain (non-ZIP64, single-disk) archives Moodle produces.
 */
export function readZipMembers(zipInput, zipPath = typeof zipInput === 'string' ? zipInput : '<zip buffer>') {
    const buffer = typeof zipInput === 'string'
        ? readFileSync(zipInput)
        : Buffer.isBuffer(zipInput) ? zipInput : Buffer.from(zipInput);
    const eocd = findEndOfCentralDirectory(buffer, zipPath);
    const members = [];
    let offset = eocd.centralDirectoryOffset;
    for (let index = 0; index < eocd.entryCount; index += 1) {
        if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
            throw new Error(`Corrupt central directory entry ${index} in ${zipPath}`);
        }
        const flags = buffer.readUInt16LE(offset + 8);
        const method = buffer.readUInt16LE(offset + 10);
        const crc32 = buffer.readUInt32LE(offset + 16);
        const compressedBytes = buffer.readUInt32LE(offset + 20);
        const uncompressedBytes = buffer.readUInt32LE(offset + 24);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const nameBytes = buffer.subarray(offset + 46, offset + 46 + nameLength);
        const nameEncoding = (flags & UTF8_NAME_FLAG) !== 0 ? 'utf8' : 'cp437';
        const name = nameBytes.toString('utf8');
        members.push({
            centralDirectoryIndex: index + 1,
            name,
            nameEncoding,
            memberKind: name.endsWith('/') ? 'directory' : 'file',
            method,
            compression: method === 0 ? 'store' : method === 8 ? 'deflate' : `method-${method}`,
            crc32,
            compressedBytes,
            uncompressedBytes,
            localHeaderOffset,
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return { buffer, members };
}

/** Decompress one member's payload, verifying its recorded size and CRC32. */
export function readMemberPayload(buffer, member, zipPath) {
    const headerOffset = member.localHeaderOffset;
    if (buffer.readUInt32LE(headerOffset) !== LOCAL_SIGNATURE) {
        throw new Error(`Corrupt local header for ${member.name} in ${zipPath}`);
    }
    const nameLength = buffer.readUInt16LE(headerOffset + 26);
    const extraLength = buffer.readUInt16LE(headerOffset + 28);
    const dataStart = headerOffset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + member.compressedBytes);
    let payload;
    if (member.method === 0) {
        payload = raw;
    } else if (member.method === 8) {
        payload = Buffer.from(inflateSync(new Uint8Array(raw)));
    } else {
        throw new Error(`Unsupported compression ${member.compression} for ${member.name} in ${zipPath}`);
    }
    if (payload.length !== member.uncompressedBytes) {
        throw new Error(`Size mismatch for ${member.name} in ${zipPath}: expected ${member.uncompressedBytes}, got ${payload.length}`);
    }
    const actualCrc32 = crc32(payload);
    if (actualCrc32 !== member.crc32) {
        throw new Error(`CRC32 mismatch for ${member.name} in ${zipPath}: expected ${member.crc32.toString(16).padStart(8, '0')}, got ${actualCrc32.toString(16).padStart(8, '0')}`);
    }
    return payload;
}

function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
}

function buildCrc32Table() {
    return Uint32Array.from({ length: 256 }, (_, index) => {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        return value >>> 0;
    });
}

function findEndOfCentralDirectory(buffer, zipPath) {
    const scanFloor = Math.max(0, buffer.length - 22 - 0xffff);
    for (let offset = buffer.length - 22; offset >= scanFloor; offset -= 1) {
        if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
        const entryCount = buffer.readUInt16LE(offset + 10);
        const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);
        if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
            throw new Error(`ZIP64 archives are not supported: ${zipPath}`);
        }
        return { entryCount, centralDirectoryOffset };
    }
    throw new Error(`No end-of-central-directory record found in ${zipPath}`);
}
