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
        expect(css).toContain('width: auto;');
        expect(css).toContain('max-width: none;');
        expect(css).toContain('.jpdb-reader-popover .jpdb-reader-icon-btn');
        expect(css).toContain('.jpdb-reader-popover .jpdb-reader-icon-btn svg');
        expect(css).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse');
        expect(css).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse::before');
        expect(css).toContain('.jpdb-reader-word:is(.jpdb-pitch-heiban,[data-pitch-class=heiban])');
        expect(css).toContain('--d2:var(--pc,#0000);');
        expect(css).toContain('.jpdb-reader-word:is(.jpdb-pitch-unknown,[data-pitch-class=unknown]){--pc:var(--jpdb-reader-pitch-unknown);');
        expect(css).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-text-pitch .jpdb-reader-word');
        expect(css).toContain('[data-card-state=new]');
        expect(css).toContain('[data-anki-state=new]');
        expect(css).toContain('[data-card-source=jiten]');
        expect(css).toContain('.jpdb-reader-word-highlight-status .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-highlight-jpdb .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-highlight-anki .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-highlight-pitch .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word{background:linear-gradient(var(--yh),var(--yh))');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-passive-word{--yt:currentColor}:is(button,[role=button],[role=tab],summary,label,.jpdb-reader-control-text-mirror,[data-jpdb-reader-passive-chrome=true]) .jpdb-reader-word.jpdb-reader-passive-word{--yh:#0000}');
        expect(css).toContain('.jpdb-reader-word-underline-status .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-underline-anki .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-text-anki .jpdb-reader-word');
        expect(css).toContain('--yu:var(--d2,#0000)');
        expect(css).toContain('color:var(--yt,currentColor)!important');
        expect(css).toContain('background:linear-gradient(var(--yh),var(--yh)) center/var(--yz) 100% no-repeat!important');
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

    it('keeps parsed app-label words atomic and compact when furigana is injected', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const scanRule = css.match(/\.jpdb-reader-word\.jpdb-reader-scan-word:not\(\.jpdb-reader-passive-word\)\s*\{[^}]*\}/)?.[0] ?? '';

        expect(scanRule).toContain('word-break: keep-all');
        expect(scanRule).toContain('overflow-wrap: normal !important');
        expect(css).toContain('.jpdb-reader-text-mirror .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('.jpdb-reader-control-text-mirror .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('line-height: inherit;');
    });
});
