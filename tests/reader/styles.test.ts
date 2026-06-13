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
        expect(css).toContain('width: auto;');
        expect(css).toContain('max-width: none;');
        expect(css).toContain('.jpdb-reader-popover .jpdb-reader-icon-btn');
        expect(css).toContain('.jpdb-reader-popover .jpdb-reader-icon-btn svg');
        expect(css).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse');
        expect(css).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse::before');
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

    it('uses cached full reader CSS when fetch is unavailable', async () => {
        stubGmStorage(new Map([[
            'yomu:reader-css-cache:v1',
            FULL_READER_CSS,
        ]]));

        await expect(loadReaderCssFallback(undefined, 'https://example.com/article'))
            .resolves.toBe(FULL_READER_CSS);
    });

    it('falls back to the raw CSS asset off the hosted site', () => {
        expect(readerCssFallbackUrls('https://example.com/article'))
            .toEqual(['https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css']);
    });
});
