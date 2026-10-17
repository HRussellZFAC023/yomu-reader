// Stand-in media for redacted recordings: blank images that keep a picture's
// pixel size, and a blank video clip the YouTube mechanism fixture can play.
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

const BLANK_GREY = 0xd8;

/** An opaque light-grey PNG of the given size (so blanked pictures still show their box). */
export function blankPng(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const row = Buffer.alloc(1 + w * 3, BLANK_GREY);
    row[0] = 0;
    const raw = Buffer.concat(Array.from({ length: h }, () => row));
    const header = Buffer.alloc(13);
    header.writeUInt32BE(w, 0);
    header.writeUInt32BE(h, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed), 0);
    return Buffer.concat([length, typed, crc]);
}

let crcTable = null;
function crc32(bytes) {
    crcTable ??= Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

// Each reader returns [width, height], or null when the bytes are not its format.
const IMAGE_SIZE_READERS = [
    buffer => (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47 ? [buffer.readUInt32BE(16), buffer.readUInt32BE(20)] : null),
    buffer => (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF' ? [buffer.readUInt16LE(6), buffer.readUInt16LE(8)] : null),
    buffer => (buffer.length > 30 && buffer.toString('ascii', 8, 12) === 'WEBP' ? webpSize(buffer) : null),
    buffer => (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 ? jpegSize(buffer) : null),
    buffer => svgSize(buffer.toString('utf8', 0, Math.min(buffer.length, 4096))),
];

/** Width and height of a PNG, GIF, WebP, JPEG or SVG, or null when it is none of those. */
export function imageSize(bytes) {
    const buffer = Buffer.from(bytes);
    for (const read of IMAGE_SIZE_READERS) {
        const size = read(buffer);
        if (size) return size;
    }
    return null;
}

const WEBP_SIZE = {
    VP8X: buffer => [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)],
    VP8L: buffer => {
        const bits = buffer.readUInt32LE(21);
        return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    },
};

function webpSize(buffer) {
    const read = WEBP_SIZE[buffer.toString('ascii', 12, 16)];
    return read ? read(buffer) : [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
}

// Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) share the range but do not.
const isStartOfFrame = marker => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

function jpegSize(buffer) {
    for (let offset = 2; offset + 9 < buffer.length && buffer[offset] === 0xff; offset += 2 + buffer.readUInt16BE(offset + 2)) {
        if (isStartOfFrame(buffer[offset + 1])) return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    }
    return null;
}

function svgSize(head) {
    const tag = /<svg\b[^>]*>/iu.exec(head);
    return tag ? svgTagSize(tag[0]) : null;
}

function svgTagSize(tag) {
    const viewBox = /viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/u.exec(tag) ?? [];
    return [svgSide(tag, 'width', viewBox[1]), svgSide(tag, 'height', viewBox[2])];
}

function svgSide(tag, name, viewBoxValue) {
    const value = Number.parseFloat(new RegExp(`\\s${name}="([\\d.]+)`, 'u').exec(tag)?.[1]);
    return Math.round(value || Number(viewBoxValue) || 24);
}

export function blankSvg(width, height) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"/>\n`);
}

/**
 * A black clip of the given length, 30 fps, tiny frame: VP8/WebM for Chromium
 * and Firefox, H.264/MP4 for WebKit. Needs ffmpeg on PATH (recording only).
 */
export function blankClips(seconds, outputBase) {
    const common = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=160x90:r=30:d=${seconds}`];
    execFileSync('ffmpeg', [...common, '-c:v', 'libvpx', '-b:v', '20k', '-g', '300', `${outputBase}.webm`]);
    execFileSync('ffmpeg', [...common, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-g', '300', '-movflags', '+faststart', `${outputBase}.mp4`]);
}
