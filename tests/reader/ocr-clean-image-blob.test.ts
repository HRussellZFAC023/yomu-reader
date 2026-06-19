import { describe, expect, it } from 'vitest';

import {
    blobFromUserscriptResponse,
    imageRequestHeaders,
    imageMimeTypeFromUrl,
    sniffImageMimeType,
} from '../../src/reader/ocr/controller';

// Regression: BookWalker (and any tainted cross-origin image) OCR was dead on iPad/Safari
// because the GM-fetched clean source image was wrapped in a TYPELESS Blob. The reader
// turns that Blob into a `blob:` object-URL <img> to decode (loadCleanMirrorImage /
// imageBlobToCanvas). WebKit/Safari refuses to decode a blob: <img> whose Blob has no (or
// a non-image) MIME type — so the decode fails, the canvas mirror rebuilds nothing,
// captureCanvasMirror returns undefined, and no OCR frame/overlay/spinner ever appears.
// Chrome content-sniffs and tolerates the typeless blob (and never enters this branch
// anyway, since it can read the canvas directly), which is why only iPad was broken.

// Mimics WebKit's stricter rule: an <img> only decodes a blob: object URL when the Blob
// carries an image MIME type. Returns false the way Safari fails the load.
function decodableByWebKit(blob: Blob): boolean {
    return typeof blob.type === 'string' && blob.type.startsWith('image/');
}

function jpegBytes(): Uint8Array {
    // SOI + APP0 marker — enough for the byte sniffer; the trailing bytes are padding.
    return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 0, 0, 0, 0, 0]);
}
function pngBytes(): Uint8Array {
    return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
}

describe('blobFromUserscriptResponse (clean mirror/source image fetch)', () => {
    it('gives an arraybuffer JPEG response an image MIME type so WebKit can decode it', () => {
        const buffer = jpegBytes().buffer;
        const blob = blobFromUserscriptResponse({ status: 200, response: buffer }, 'image/jpeg');
        expect(blob.type).toBe('image/jpeg');
        // The actual regression assertion: the old code produced type === '' here.
        expect(decodableByWebKit(blob)).toBe(true);
    });

    it('gives a typed-array (Uint8Array) response a decodable image MIME type', () => {
        const blob = blobFromUserscriptResponse({ status: 200, response: pngBytes() }, 'image/jpeg');
        expect(blob.type).toBe('image/png'); // sniffed from the PNG signature
        expect(decodableByWebKit(blob)).toBe(true);
    });

    it('prefers the sniffed type over the URL-derived fallback (bytes win)', () => {
        // URL says .png but the bytes are JPEG — trust the bytes.
        const blob = blobFromUserscriptResponse({ status: 200, response: jpegBytes().buffer }, imageMimeTypeFromUrl('https://cdn/x.png'));
        expect(blob.type).toBe('image/jpeg');
    });

    it('falls back to the URL-derived type when the bytes are not a known image signature', () => {
        const blob = blobFromUserscriptResponse({ status: 200, response: new Uint8Array([1, 2, 3, 4]) }, 'image/webp');
        expect(blob.type).toBe('image/webp');
        expect(decodableByWebKit(blob)).toBe(true);
    });

    it('tags an already-typeless Blob response so it stays decodable', () => {
        const blob = blobFromUserscriptResponse({ status: 200, response: new Blob([jpegBytes()] as BlobPart[]) }, 'image/jpeg');
        expect(decodableByWebKit(blob)).toBe(true);
    });

    it('preserves an existing image MIME type on a Blob response', () => {
        const blob = blobFromUserscriptResponse({ status: 200, response: new Blob([pngBytes()] as BlobPart[], { type: 'image/png' }) }, 'image/jpeg');
        expect(blob.type).toBe('image/png');
    });
});

describe('imageMimeTypeFromUrl', () => {
    it('maps common extensions and defaults to jpeg', () => {
        expect(imageMimeTypeFromUrl('https://cdn/item/xhtml/p-001.xhtml/abc.jpeg')).toBe('image/jpeg');
        expect(imageMimeTypeFromUrl('https://cdn/p.png?v=2')).toBe('image/png');
        expect(imageMimeTypeFromUrl('https://cdn/p.webp#frag')).toBe('image/webp');
        expect(imageMimeTypeFromUrl('https://cdn/page')).toBe('image/jpeg'); // no extension
    });
});

describe('imageRequestHeaders', () => {
    it('sends browser-like image headers for protected manga source fetches', () => {
        expect(imageRequestHeaders('https://cdn.example.test/page.webp')).toEqual({
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            Referer: location.href,
        });
    });

    it('does not attach a page referer to inline image URLs', () => {
        expect(imageRequestHeaders('data:image/png;base64,AA==')).toEqual({
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        });
    });
});

describe('sniffImageMimeType', () => {
    it('detects JPEG/PNG/GIF/WEBP and returns undefined otherwise', () => {
        expect(sniffImageMimeType(jpegBytes())).toBe('image/jpeg');
        expect(sniffImageMimeType(pngBytes())).toBe('image/png');
        expect(sniffImageMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
        expect(sniffImageMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
        expect(sniffImageMimeType(new Uint8Array([0, 1, 2, 3]))).toBeUndefined();
    });
});
