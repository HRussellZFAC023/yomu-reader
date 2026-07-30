#!/usr/bin/env node
// Builds docs/public/favicon.ico from the PNG favicons already in docs/public.
//
// Browsers, feed readers and link unfurlers request /favicon.ico unconditionally,
// whatever <link rel="icon"> declares. The declared icons all resolved, but the
// root .ico path did not: measured 2026-07-30, https://yomureader.com/favicon.ico
// returned 404 and served the 11,989-byte HTML error page to every one of them.
//
// A committed binary nobody can regenerate is a mystery, so it is generated from
// the two PNGs that are already the source of truth. ICO has allowed embedded
// PNG payloads since Vista, so no re-encoding is needed — the entries are the
// PNG bytes verbatim, which keeps this dependency-free.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCES = ['favicon-16x16.png', 'favicon-32x32.png'];
const OUTPUT = path.join(ROOT, 'docs', 'public', 'favicon.ico');

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

const images = SOURCES.map(name => {
    const data = readFileSync(path.join(ROOT, 'docs', 'public', name));
    return { name, data, ...pngDimensions(data, name) };
});

const header = Buffer.alloc(HEADER_BYTES);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = HEADER_BYTES + ENTRY_BYTES * images.length;
const directory = images.map(image => {
    const entry = Buffer.alloc(ENTRY_BYTES);
    // 256 is encoded as 0 in this field; nothing here is that large, but the
    // modulo keeps the encoding correct if a 256px source is ever added.
    entry.writeUInt8(image.width % 256, 0);
    entry.writeUInt8(image.height % 256, 1);
    entry.writeUInt8(0, 2); // palette size: 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.data.length;
    return entry;
});

writeFileSync(OUTPUT, Buffer.concat([header, ...directory, ...images.map(image => image.data)]));
console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${images.map(i => `${i.width}x${i.height}`).join(', ')})`);

function pngDimensions(data, name) {
    // A truncated or non-PNG source would otherwise produce an .ico whose
    // directory claims sizes the payload does not have, which renders as a
    // blank tab icon rather than an error.
    if (data.readUInt32BE(0) !== 0x89504e47) throw new Error(`${name} is not a PNG`);
    if (data.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${name} has no IHDR chunk`);
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
