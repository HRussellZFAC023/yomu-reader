import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OcrStatusAnnouncer } from '../../src/reader/ocr/ocr-status-announcer';

const OCR_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');

function cssBlock(selector: string, css = OCR_CSS): string {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`Missing CSS rule ${selector}`);
    return css.slice(start, css.indexOf('}', start) + 1);
}

function reducedMotionCss(): string {
    const start = OCR_CSS.indexOf('@media (prefers-reduced-motion: reduce) {\n  .jpdb-ocr-video-frame-status-loading::before');
    if (start < 0) throw new Error('Missing reduced-motion rule for the OCR status indicator');
    return OCR_CSS.slice(start, OCR_CSS.indexOf('\n}\n', start) + 2);
}

describe('OCR status indicator styles', () => {
    it('draws a small corner mark with no pill surface or visible label', () => {
        const indicator = cssBlock('.jpdb-ocr-video-frame-status');
        expect(indicator).toMatch(/width: 16px;/);
        expect(indicator).toMatch(/height: 16px;/);
        expect(indicator).toMatch(/pointer-events: none;/);
        expect(indicator).toMatch(/--jpdb-ocr-status-ink: var\(--jpdb-reader-success/);
        // Contrast comes from a rim around the mark, not from a surface behind it.
        expect(indicator).toMatch(/filter: drop-shadow\(0 0 1px rgba\(0, 0, 0, 0\.8\)\) drop-shadow\(0 0 1px rgba\(255, 255, 255, 0\.45\)\)/);
        expect(indicator).not.toMatch(/background|border|box-shadow|padding|font/);
        expect(OCR_CSS).not.toContain('jpdb-ocr-video-frame-status-label');
        expect(OCR_CSS).not.toContain('jpdb-ocr-canvas-status');
        expect(OCR_CSS).not.toContain('--jpdb-ocr-status-surface');
    });

    it('turns the reading arc only when motion is allowed', () => {
        expect(cssBlock('.jpdb-ocr-video-frame-status-loading::before')).toMatch(/animation: jpdb-ocr-video-frame-status-spin 1s linear infinite;/);
        const reduced = reducedMotionCss();
        expect(reduced).toMatch(/animation: jpdb-ocr-video-frame-status-fade 1\.6s ease-in-out infinite alternate;/);
        expect(reduced).not.toContain('status-spin');
        expect(reduced).toMatch(/\.jpdb-ocr-video-frame-status \{\s*transition: none;/);
        const fade = OCR_CSS.slice(OCR_CSS.indexOf('@keyframes jpdb-ocr-video-frame-status-fade'));
        expect(fade.slice(0, fade.indexOf('\n}\n'))).not.toContain('transform');
    });

    it('keeps hidden and gated indicators out of sight and out of the way', () => {
        expect(cssBlock('.jpdb-ocr-video-frame-status[hidden]')).toMatch(/display: none !important;/);
        const pending = cssBlock('.jpdb-ocr-video-frame-pending');
        expect(pending).toMatch(/opacity: 0\.001;/);
        expect(pending).toMatch(/pointer-events: none !important;/);
        expect(cssBlock('.jpdb-ocr-video-frame-status-fade-out')).toMatch(/opacity: 0;/);
    });

    it('gives a reader page retry button a real target and a focus ring', () => {
        const retry = cssBlock('.jpdb-ocr-video-frame-status[data-yomu-ocr-retry="true"]');
        expect(retry).toMatch(/width: 24px;/);
        expect(retry).toMatch(/pointer-events: auto;/);
        expect(cssBlock('.jpdb-ocr-video-frame-status[data-yomu-ocr-retry="true"]:focus-visible')).toMatch(/outline: 2px solid/);
    });
});

describe('OcrStatusAnnouncer', () => {
    let announcer: OcrStatusAnnouncer;

    beforeEach(() => {
        vi.useFakeTimers();
        announcer = new OcrStatusAnnouncer();
    });

    afterEach(() => {
        announcer.remove();
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    function region(): HTMLElement | null {
        return document.querySelector<HTMLElement>('.jpdb-ocr-status-announcer');
    }

    it('speaks from one visually hidden polite status region', () => {
        announcer.announce('Scanning...', false);
        const live = region()!;
        expect(live.getAttribute('role')).toBe('status');
        expect(live.getAttribute('aria-live')).toBe('polite');
        expect(live.classList.contains('jpdb-reader-sr-only')).toBe(true);
        expect(live.dataset.jpdbReaderRoot).toBe('true');
        // The region exists before its first message lands, so screen readers hear it.
        expect(live.textContent).toBe('');
        vi.advanceTimersByTime(150);
        expect(live.textContent).toBe('Scanning...');
    });

    it('ends a run of scans in one outcome instead of narrating each image', () => {
        announcer.announce('Scanning...', false);
        vi.advanceTimersByTime(150);
        const observer = new MutationObserver(() => undefined);
        observer.observe(region()!, { childList: true });

        for (let image = 0; image < 4; image++) {
            announcer.announce('Scanning...', false);
            vi.advanceTimersByTime(200);
            announcer.announce('Text ready', true);
            vi.advanceTimersByTime(300);
        }
        vi.advanceTimersByTime(600);
        announcer.announce('Text ready', true);
        vi.advanceTimersByTime(600);

        const spoken = observer.takeRecords().flatMap(record => [...record.addedNodes].map(node => node.textContent));
        observer.disconnect();
        expect(spoken).toEqual(['Text ready']);
        expect(document.querySelectorAll('.jpdb-ocr-status-announcer')).toHaveLength(1);
    });

    it('never announces a scan that a cached result settles at once', () => {
        announcer.announce('Scanning...', false);
        announcer.announce('Text ready', true);
        vi.advanceTimersByTime(150);
        expect(region()!.textContent).toBe('');
        vi.advanceTimersByTime(450);
        expect(region()!.textContent).toBe('Text ready');
    });

    it('leaves the page when OCR clears', () => {
        announcer.announce('Could not read text', true);
        announcer.remove();
        vi.advanceTimersByTime(1000);
        expect(region()).toBeNull();
    });
});
