// The root /favicon.ico, built as a container around the PNGs the site already
// ships.
//
// WHY THE FILE HAS TO EXIST AT ALL
//
// Browsers, feed readers and link unfurlers request /favicon.ico unconditionally
// — before parsing the document, and regardless of the `rel="icon"` links in the
// head. The declared icons were all present and the root .ico was not, so every
// one of those clients took a 200-shaped HTML error page for an icon.
//
// WHY IT WRAPS THE COMMITTED PNGs BYTE FOR BYTE
//
// An ICO directory entry can carry a PNG payload verbatim, so there is no second
// rasterizer and no second artwork: the 16px and 32px favicons the SVG already
// renders to are the images inside the container. That also makes the file
// reproducible without a browser, which is how the contract test can recompute
// it and prove the committed bytes still match the committed PNGs.
const HEADER_BYTES = 6;
const DIRECTORY_ENTRY_BYTES = 16;

/**
 * ICO bytes for `images`, in the given order. Each entry is a PNG buffer whose
 * IHDR width and height are read back out for the directory entry, so a resized
 * source cannot silently claim the wrong dimensions.
 */
function faviconIcoBytes(images) {
    if (!images.length) throw new Error('An ICO needs at least one image.');
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);

    let offset = HEADER_BYTES + DIRECTORY_ENTRY_BYTES * images.length;
    const directory = [];
    for (const image of images) {
        const { width, height } = pngDimensions(image);
        const entry = Buffer.alloc(DIRECTORY_ENTRY_BYTES);
        // 0 means 256 in a one-byte dimension field; nothing here is that large,
        // but the encoding is part of the format so keep it honest.
        entry.writeUInt8(width === 256 ? 0 : width, 0);
        entry.writeUInt8(height === 256 ? 0 : height, 1);
        entry.writeUInt8(0, 2); // palette colours: none, the PNG owns its colours
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // colour planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(image.length, 8);
        entry.writeUInt32LE(offset, 12);
        directory.push(entry);
        offset += image.length;
    }
    return Buffer.concat([header, ...directory, ...images]);
}

/** IHDR width and height of a PNG buffer. */
function pngDimensions(png) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (png.length < 24 || !png.subarray(0, 8).equals(signature)) throw new Error('Not a PNG.');
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** The sizes, in order, that /favicon.ico carries. */
const FAVICON_ICO_SOURCES = ['favicon-16x16.png', 'favicon-32x32.png'];

module.exports = { FAVICON_ICO_SOURCES, faviconIcoBytes, pngDimensions };
