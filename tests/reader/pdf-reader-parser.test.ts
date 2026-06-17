import { afterEach, describe, expect, it } from 'vitest';

import { isYomuHostedPdfReaderPage } from '../../src/reader/app/pages';
import { collectScanTargets, getMatchingSiteParsers } from '../../src/reader/app/site-parsers';

// The hosted PDF reader renders each page to <canvas> (fidelity) plus PDF.js's
// transparent, absolutely-positioned text layer (real selectable text). The
// runtime must recognise the /pdf-reader/ route and scan that text layer so
// popups, mining and furigana work without the userscript installed.

const HOSTED_PDF_URL = 'https://hrussellzfac023.github.io/yomu-reader/pdf-reader/';
const HOSTED_PDF_INDEX_URL = 'https://hrussellzfac023.github.io/yomu-reader/pdf-reader/index.html';
const LOCAL_PDF_URL = 'http://127.0.0.1:5175/yomu-reader/pdf-reader/';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('hosted PDF reader route + parser', () => {
    it('recognises the hosted PDF reader page (hosted, index.html and local)', () => {
        expect(isYomuHostedPdfReaderPage(HOSTED_PDF_URL)).toBe(true);
        expect(isYomuHostedPdfReaderPage(HOSTED_PDF_INDEX_URL)).toBe(true);
        expect(isYomuHostedPdfReaderPage(LOCAL_PDF_URL)).toBe(true);
        expect(isYomuHostedPdfReaderPage('https://hrussellzfac023.github.io/yomu-reader/video-player/')).toBe(false);
        expect(isYomuHostedPdfReaderPage('https://example.com/pdf-reader/')).toBe(false);
    });

    it('matches the dedicated PDF reader parser on the pdf-reader route', () => {
        const profiles = getMatchingSiteParsers(HOSTED_PDF_URL);
        const parser = profiles.find(profile => profile.id === 'yomu-pdf-reader-parser');
        expect(parser).toBeDefined();
        expect(parser?.roots).toContain('.textLayer');
        expect(getMatchingSiteParsers(LOCAL_PDF_URL).some(p => p.id === 'yomu-pdf-reader-parser')).toBe(true);
    });

    it('scans Japanese text inside the PDF.js text layer', () => {
        const restoreRects = mockVisibleElementRects();
        // Mirror the PDF.js text layer shape: a .textLayer with positioned spans.
        document.body.innerHTML = `
            <section class="viewer">
                <div class="pdf-page">
                    <canvas></canvas>
                    <div class="textLayer">
                        <span>これは日本語のテストです。</span>
                        <span>本を読みましょう。</span>
                    </div>
                </div>
            </section>
        `;
        try {
            const texts = collectScanTargets(50, HOSTED_PDF_URL).map(target => target.text).join('');
            expect(texts).toContain('日本語');
            expect(texts).toContain('本を読みましょう');
        } finally {
            restoreRects();
        }
    });
});

function mockVisibleElementRects(): () => void {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 180,
        height: 32,
        top: 0,
        right: 180,
        bottom: 32,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect);
    return () => {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
}
