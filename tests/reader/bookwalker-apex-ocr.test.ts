import { describe, expect, it } from 'vitest';

import {
    canUseReaderCanvasSourceImageFallback,
    isBookwalkerViewerHost,
    isKnownCanvasReaderHost,
    isReaderRasterPage,
} from '../../src/reader/ocr/canvas-readers';

// Regression guard for the iPad BookWalker OCR failure: the browser reader is
// served from the apex `bookwalker.jp` (per-book `/de…/` paths) as well as the
// `viewer.`/`viewer-trial.` subdomains, and iOS Safari hides the subdomain in its
// address bar. `isKnownCanvasReaderHost` already matched the apex, but
// `isBookwalkerViewerHost` (and a duplicate in canvas-mirror) did not — so the page
// canvas was detected yet the tainted-canvas descramble pipeline was gated off and
// OCR silently produced no overlay on the comic.
describe('BookWalker reader host coverage', () => {
    const READER_HOSTS = [
        'bookwalker.jp',
        'www.bookwalker.jp',
        'viewer.bookwalker.jp',
        'viewer-trial.bookwalker.jp',
        'r.bookwalker.jp',
    ];
    const NON_READER_HOSTS = [
        'example.com',
        'bookwalker.com',
        'notbookwalker.jp',
        'evil-bookwalker.jp',
        'bookwalker.jp.evil.com',
    ];

    it('treats the apex bookwalker.jp as a reader host (the regression)', () => {
        expect(isBookwalkerViewerHost('bookwalker.jp')).toBe(true);
    });

    it('matches every BookWalker reader host, apex and subdomains alike', () => {
        for (const host of READER_HOSTS) expect(isBookwalkerViewerHost(host)).toBe(true);
    });

    it('rejects non-BookWalker and look-alike hosts', () => {
        for (const host of NON_READER_HOSTS) expect(isBookwalkerViewerHost(host)).toBe(false);
    });

    it('stays aligned with isKnownCanvasReaderHost on the apex (the two disagreeing caused the bug)', () => {
        expect(isKnownCanvasReaderHost('bookwalker.jp')).toBe(true);
        expect(isBookwalkerViewerHost('bookwalker.jp')).toBe(isKnownCanvasReaderHost('bookwalker.jp'));
    });

    it('routes apex tainted canvases through the descramble mirror, not the scrambled source-image fallback', () => {
        expect(canUseReaderCanvasSourceImageFallback('bookwalker.jp')).toBe(false);
        expect(canUseReaderCanvasSourceImageFallback('viewer.bookwalker.jp')).toBe(false);
    });

    it('classifies the apex as a reader raster page so OCR scanning engages', () => {
        expect(isReaderRasterPage('bookwalker.jp')).toBe(true);
    });
});
