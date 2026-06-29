import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    CRITICAL_READER_CSS,
    initialReaderCss,
    loadReaderCssFallback,
    readerCssFallbackUrls,
    readerCssNeedsFallback,
    READER_CSS,
} from '../../src/reader/styles/index';

const FULL_READER_CSS = '.jpdb-reader-popover{} .jpdb-reader-settings{} .jpdb-reader-source-card{} .jpdb-subtitle-player{} .jpdb-ocr-layer{}';

function stubGmStorage(values = new Map<string, unknown>()): Map<string, unknown> {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => {
        values.set(key, value);
    }));
    return values;
}

function cssResponse(css: string): Response {
    return {
        ok: true,
        text: async () => css,
    } as Response;
}

describe('reader stylesheet loading', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('detects when userscript GM resource CSS is unavailable', () => {
        expect(READER_CSS).toBe('');
        expect(readerCssNeedsFallback(READER_CSS)).toBe(true);
    });

    it('uses scoped critical control CSS while the full reader CSS is unavailable', () => {
        const css = initialReaderCss('');

        expect(css).toBe(CRITICAL_READER_CSS);
        expect(css).toContain('[data-jpdb-reader-root] :where(button)');
        expect(css).toContain('all:unset;');
        expect(css).toContain('cursor:pointer;');
        expect(css).toContain(':is(.jpdb-reader-popover,.jpdb-reader-settings) .jpdb-reader-icon-btn');
        expect(css).toContain(':is(.jpdb-reader-popover,.jpdb-reader-settings) .jpdb-reader-icon-btn svg');
        expect(css).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse');
        expect(css).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse::before');
        expect(css).toContain('.jpdb-reader-word:is(.jpdb-pitch-heiban,[data-pitch-class=heiban])');
        expect(css).toContain('--d2:var(--pc,#0000)');
        expect(css).toContain('.jpdb-reader-word:is(.jpdb-pitch-unknown,[data-pitch-class=unknown]){--pc:var(--jpdb-reader-pitch-unknown);');
        expect(css).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-text-pitch .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-passive-word{--yt:currentColor}:is(button,[role=button],[role=tab],summary,label,.jpdb-reader-control-text-mirror,[data-jpdb-reader-passive-chrome=true]) .jpdb-reader-word.jpdb-reader-passive-word{--yh:#0000}');
        expect(css).toContain('--yu:var(--d2,#0000)');
        expect(css).toContain('color:var(--yt,currentColor)!important');
        expect(css).toContain('--yi:.08em;');
        expect(css).toContain('inset-inline:var(--yi);');
        expect(css).toContain('border-block-end:var(--yw) var(--ys) var(--yu,#0000);');
    });

    it('uses the full reader CSS when the userscript resource is available', () => {
        expect(initialReaderCss(FULL_READER_CSS)).toBe(FULL_READER_CSS);
    });

    it('loads and caches the hosted full reader CSS without userscript GM resource APIs', async () => {
        const stored = stubGmStorage();
        const fetcher = vi.fn(async () => cssResponse(FULL_READER_CSS));

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://hrussellzfac023.github.io/yomu-reader/'))
            .resolves.toBe(FULL_READER_CSS);

        expect(fetcher).toHaveBeenCalledWith('https://hrussellzfac023.github.io/yomu-reader/yomu.css', expect.objectContaining({
            cache: 'force-cache',
            credentials: 'omit',
        }));
        expect([...stored.values()]).toContain(FULL_READER_CSS);
    });

    it('loads hosted full reader CSS through the userscript HTTP bridge before page fetch', async () => {
        const stored = stubGmStorage();
        const fetcher = vi.fn(async () => {
            throw new Error('Discord-style page fetch blocked by CSP');
        });
        const userscriptRequest = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            details.onload?.({
                status: 200,
                response: FULL_READER_CSS,
                responseText: FULL_READER_CSS,
            });
        });
        vi.stubGlobal('GM_xmlhttpRequest', userscriptRequest);

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://discord.com/channels/@me/1'))
            .resolves.toBe(FULL_READER_CSS);

        expect(userscriptRequest).toHaveBeenCalledWith(expect.objectContaining({
            anonymous: true,
            method: 'GET',
            responseType: 'text',
            url: 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css',
        }));
        expect(fetcher).not.toHaveBeenCalled();
        expect([...stored.values()]).toContain(FULL_READER_CSS);
    });

    it('uses cached full reader CSS when fetch is unavailable', async () => {
        stubGmStorage(new Map([[
            `yomu:reader-css-cache:v2:${__YOMU_VERSION__}`,
            FULL_READER_CSS,
        ]]));

        await expect(loadReaderCssFallback(undefined, 'https://example.com/article'))
            .resolves.toBe(FULL_READER_CSS);
    });

    it('falls back to the raw CSS asset off the hosted site', () => {
        expect(readerCssFallbackUrls('https://example.com/article'))
            .toEqual(['https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css']);
    });

    it('lets scanned prose wrap while keeping passive/mirror labels compact with furigana', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const scanRule = css.match(/\.jpdb-reader-word\.jpdb-reader-scan-word:not\(\.jpdb-reader-passive-word\)[^{]*\{[^}]*\}/)?.[0] ?? '';

        expect(scanRule).toContain('word-break: normal');
        expect(scanRule).toContain('overflow-wrap: anywhere !important');
        expect(scanRule).toContain('line-break: auto');
        expect(scanRule).toContain('.VwiC3b .jpdb-reader-word.jpdb-reader-scan-word');
        expect(css).toContain('.jpdb-reader-text-mirror .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('.jpdb-reader-control-text-mirror .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-passive-word');
        expect(css).toContain('.jpdb-reader-control-text-mirror .jpdb-reader-word.jpdb-reader-scan-word');
        expect(css).toContain('word-break: keep-all');
        expect(css).toContain('overflow-wrap: normal');
        expect(css).toContain('line-height: inherit;');
    });

    it('keeps hover layered over highlights while passive chrome strips highlight paint', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const hoverRule = css.match(/\.jpdb-reader-word:hover,\s*\.jpdb-reader-word:focus\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

        expect(hoverRule).toContain('linear-gradient(var(--jpdb-reader-hover)');
        expect(hoverRule).toContain('var(--jpdb-reader-word-accessible-highlight');
        expect(hoverRule).toContain('var(--jpdb-reader-word-highlight-source, transparent)');
        expect(css).toContain('[data-jpdb-reader-passive-chrome="true"]) .jpdb-reader-word.jpdb-reader-passive-word:hover');
        expect(css).toContain('[data-jpdb-reader-passive-chrome="true"]) .jpdb-reader-word.jpdb-reader-passive-word:focus');
    });

    it('keeps dark OCR auto overlays readable without an opaque accent block', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const darkAutoVisibleRule = css.match(/\.jpdb-ocr-layer\[data-ocr-overlay-theme="dark"\]\[data-ocr-overlay-variant="auto"\]\s*\.jpdb-ocr-line-visible\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
        const darkAutoRule = css.match(/\.jpdb-ocr-layer\[data-ocr-overlay-theme="dark"\]\[data-ocr-overlay-variant="auto"\]\s*\.jpdb-ocr-line:is\(:hover, :focus, \.jpdb-ocr-line-active\)\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
        const darkAutoWordRule = css.match(/\.jpdb-ocr-layer\[data-ocr-overlay-theme="dark"\]\[data-ocr-overlay-variant="auto"\]\s*\.jpdb-ocr-line:is\(:hover, :focus, \.jpdb-ocr-line-active\)\s*\.jpdb-reader-word\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

        expect(css).toContain('--jpdb-ocr-auto-dark-surface');
        expect(css).toContain('--jpdb-ocr-auto-dark-visible');
        expect(css).toContain('--jpdb-ocr-auto-dark-active');
        expect(darkAutoVisibleRule).toContain('color: var(--jpdb-reader-video-text, #ffffff)');
        expect(darkAutoVisibleRule).toContain('background: var(--jpdb-ocr-auto-dark-visible)');
        expect(darkAutoRule).toContain('color: var(--jpdb-reader-video-text, #ffffff)');
        expect(darkAutoRule).toContain('background: var(--jpdb-ocr-auto-dark-active)');
        expect(darkAutoRule).toContain('var(--jpdb-reader-video-outline, rgba(0, 0, 0, 0.88))');
        expect(css).toContain('.jpdb-ocr-line:focus-visible');
        expect(darkAutoWordRule).toContain('--jpdb-reader-subtitle-fallback: var(--jpdb-reader-video-text, #ffffff)');
        expect(darkAutoWordRule).toContain('var(--jpdb-reader-video-text, #ffffff)');
        expect(darkAutoWordRule).toContain('text-shadow: inherit');
    });
});
