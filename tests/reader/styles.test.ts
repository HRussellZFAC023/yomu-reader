import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    CRITICAL_READER_CSS,
    initialReaderCss,
    loadReaderCssFallback,
    readerCssFallbackUrls,
    readerCssNeedsFallback,
    READER_CSS,
    shouldLoadReaderCssFallback,
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
        expect(css).toContain('.jpdb-reader-word:is(.jpdb-pitch-unknown,[data-pitch-class=unknown],.jpdb-pitch-particle,[data-pitch-class=particle]){--pc:var(--jpdb-reader-pitch-unknown);--pr:var(--jpdb-reader-pitch-unknown-readable);--c2:var(--pr,var(--pc,currentColor));--d2:#0000}');
        expect(css).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word-text-pitch .jpdb-reader-word');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-passive-word{--yt:currentColor}:is(button,[role=button],[role=tab],summary,label,.jpdb-reader-control-text-mirror,[data-jpdb-reader-passive-chrome=true]) .jpdb-reader-word.jpdb-reader-passive-word{--yh:#0000}');
        expect(css).toContain('--yu:var(--d2,#0000)');
        expect(css).toContain('color:var(--yt,currentColor)!important');
        expect(css).toContain('--yi:.08em;');
        expect(css).toContain('inset-inline:var(--yi);');
        expect(css).toContain('border-block-end:var(--yw) var(--ys) var(--yu,#0000);');
        expect(css).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-text-mirror .jpdb-reader-word{text-decoration-color:var(--yu,#0000)!important}');
        expect(css).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-text-mirror .jpdb-reader-word::after{content:none!important}');
    });

    it('uses the full reader CSS when the userscript resource is available', () => {
        expect(initialReaderCss(FULL_READER_CSS)).toBe(FULL_READER_CSS);
    });



    it('keeps a linked hosted stylesheet authoritative over network fallback CSS', () => {
        expect(shouldLoadReaderCssFallback(true, '')).toBe(false);
        expect(shouldLoadReaderCssFallback(false, '')).toBe(true);
        expect(shouldLoadReaderCssFallback(false, FULL_READER_CSS)).toBe(false);
    });

    it('loads and caches the hosted full reader CSS without userscript GM resource APIs', async () => {
        const stored = stubGmStorage();
        const fetcher = vi.fn(async () => cssResponse(FULL_READER_CSS));

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://hrussellzfac023.github.io/yomu-reader/'))
            .resolves.toBe(FULL_READER_CSS);

        expect(fetcher).toHaveBeenCalledWith(`https://hrussellzfac023.github.io/yomu-reader/yomu.css?v=${__YOMU_VERSION__}`, expect.objectContaining({
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
            url: `https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=${__YOMU_VERSION__}`,
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
            .toEqual([`https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=${__YOMU_VERSION__}`]);
    });

    it('lets scanned prose wrap while keeping passive/mirror labels compact with furigana', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const scanRule = css.match(/\.jpdb-reader-word\.jpdb-reader-scan-word:not\(\.jpdb-reader-passive-word\)[^{]*\{[^}]*\}/)?.[0] ?? '';

        expect(scanRule).toContain('word-break: normal');
        // break-word, never anywhere: anywhere collapses min-content sizing and
        // stacks annotated flex/grid text one character per line.
        expect(scanRule).toContain('overflow-wrap: break-word !important');
        expect(scanRule).not.toContain('overflow-wrap: anywhere');
        expect(scanRule).toContain('line-break: auto');
        expect(scanRule).toContain('.VwiC3b .jpdb-reader-word.jpdb-reader-scan-word');
        expect(css).toContain('.jpdb-reader-text-mirror .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('.jpdb-reader-control-text-mirror .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('.jpdb-reader-text-mirror .jpdb-reader-furi,\n.jpdb-reader-control-text-mirror .jpdb-reader-furi {\n  line-height: 1.08;\n}');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-passive-word');
        expect(css).toContain('.jpdb-reader-control-text-mirror .jpdb-reader-word.jpdb-reader-scan-word');
        expect(css).toContain('word-break: keep-all');
        expect(css).toContain('overflow-wrap: normal');
        expect(css).toContain('line-height: inherit;');
    });

    it('keeps furigana readings legible and reserves line height for scanned text', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');

        // A wrapped reading renders as stacked kana fragments (ひょう/じゅん)
        // inside narrow flex chrome — rt must never break across lines.
        const furiRtRule = css.match(/\.jpdb-reader-word rt\.jpdb-reader-furi\s*\{[^}]*\}/g)?.join('\n') ?? '';
        expect(furiRtRule).toContain('white-space: nowrap');
        expect(css).not.toMatch(/rt\.jpdb-reader-furi\s*\{[^}]*white-space: normal/);
        expect(css).not.toMatch(/rt[^{,]*\{[^}]*overflow-wrap: anywhere/);

        expect(css).toContain('.jpdb-reader-word.jpdb-reader-has-furi {\n  line-height: 2.15;\n}');
        expect(css).not.toContain('.jpdb-reader-word.jpdb-reader-scan-word.jpdb-reader-has-furi:not(.jpdb-reader-prose-word) {\n  line-height: inherit;\n}');
        const furiRule = Array.from(css.matchAll(/\.jpdb-reader-furi\s*\{[^}]*\}/g), match => match[0])
            .find(rule => rule.includes('font-size')) ?? '';
        expect(furiRule).toContain('font-size: 0.58em');
        expect(furiRule).toContain('font-weight: 700');
        expect(furiRule).toContain('line-height: 1.08');
    });

    it('hides clip-constrained readings at rest and re-shows them once the row has grown', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        // Sweep blocker (2026-07-10): mirror/in-place rt painted outside
        // overflow-hidden and line-clamped one-line rows at rest.
        expect(css).toContain('[data-yomu-clip-constrained="true"]:not(.jpdb-reader-text-mirror) .jpdb-reader-word rt.jpdb-reader-furi');
        const hideRule = css.match(/\[data-yomu-clip-constrained="true"\]:not\(\.jpdb-reader-text-mirror\) \.jpdb-reader-word rt\.jpdb-reader-furi\s*\{[^}]*\}/)?.[0] ?? '';
        expect(hideRule).toContain('display: none');
        expect(hideRule).toContain('visibility: hidden');
        expect(css).toContain(':not(.jpdb-reader-text-mirror) .jpdb-reader-word.jpdb-reader-has-furi');
        expect(css).toContain('line-height: inherit');
        // A ruby-room-grown row has real room: readings stay visible at rest.
        expect(css).toContain('[data-yomu-ruby-room="true"] [data-yomu-clip-constrained="true"]');
        expect(css).toContain('[data-yomu-ruby-room="true"][data-yomu-clip-constrained="true"]');
    });

    it('keeps pitch underline and state decorations on passive content words at rest', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');

        // The base passive rule must stay layout-neutral WITHOUT stripping
        // decoration sources: link-wrapped prose (news headlines, Wikipedia
        // links) is passive for interaction but still content for display.
        const baseRule = css.match(/\n\.jpdb-reader-word\.jpdb-reader-passive-word\s*\{[^}]*\}/)?.[0] ?? '';
        expect(baseRule).toContain('--jpdb-reader-word-color-source: currentColor');
        expect(baseRule).toContain('overflow-wrap: inherit !important');
        expect(baseRule).not.toContain('--jpdb-reader-word-underline: transparent');
        expect(baseRule).not.toContain('--jpdb-reader-word-decoration-source: transparent');
        expect(baseRule).not.toContain('background-image: none');

        // Only the highlight (background) channel may go bare-until-hover on
        // ALL passive words; the underline/text channels must stay visible at
        // rest — stripping them globally regresses pitch underlines on
        // link-heavy sites into hover-only flicker (1.5.4 regression).
        const bareRestRule = css.match(/\n\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)\s*\{[^}]*\}/)?.[0] ?? '';
        expect(bareRestRule).toContain('--jpdb-reader-word-highlight-source: transparent');
        expect(bareRestRule).not.toContain('--jpdb-reader-word-underline');
        expect(bareRestRule).not.toContain('--jpdb-reader-word-decoration-source');
        expect(bareRestRule).not.toContain('text-decoration-color');
        expect(css).not.toMatch(/\n\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)::after/);
        const strippedAtRest = css.match(/:is\([^)]*\[data-jpdb-reader-passive-chrome="true"\]\s*\)\s*\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)(?::not\([^{]*?\))?\s*\{[^}]*\}/)?.[0] ?? '';
        // Chrome bare-until-hover strips only the highlight (background) paint;
        // the text/underline channels stay visible at rest (pitch underlines on
        // Shorts subscribe buttons must survive), and the base colour honours the
        // contrast-computed accessible colour so ruby base glyphs stay legible.
        expect(strippedAtRest).toContain('--jpdb-reader-word-highlight-source: transparent');
        expect(strippedAtRest).toContain('color: var(--jpdb-reader-word-accessible-color, currentColor) !important');
        expect(strippedAtRest).not.toContain('--jpdb-reader-word-underline: transparent');
        expect(strippedAtRest).toContain('nav');
        expect(strippedAtRest).toContain('[role="navigation"]');
        // YouTube chrome roots without a button/nav ancestor live in the CSS
        // scope (not a scanner-side mark) because the stylesheet ships outside
        // the 2 MB userscript bundle.
        expect(strippedAtRest).toContain('ytm-pivot-bar-renderer');
        // These YouTube surfaces are carved OUT of bare-until-hover: their
        // Japanese is reading material, so pitch underlines stay on at rest.
        expect(strippedAtRest).toContain(':not(:is(yt-chip-cloud-chip-renderer, yt-chip-cloud-chip-view-model, yt-chip-cloud-renderer, ytd-feed-filter-chip-bar-renderer, ytm-feed-filter-chip-bar-renderer, ytd-engagement-panel-section-list-renderer, ytm-engagement-panel-section-list-renderer, ytd-watch-metadata, ytd-live-chat-frame, ytd-masthead, ytd-mini-guide-renderer, ytd-guide-renderer, yt-page-header-view-model, ytd-c4-tabbed-header-renderer, yt-tab-shape, ytm-slim-video-action-bar-renderer, .jpdb-reader-text-mirror) .jpdb-reader-word)');
        expect(strippedAtRest.slice(0, strippedAtRest.indexOf(':not('))).not.toContain('yt-chip-cloud-chip-view-model');
    });

    it('keeps passive-chrome ruby base glyphs legible at rest via the contrast-computed colour', () => {
        // YouTube Shorts channel/title pills mark their words passive chrome, so
        // the bare-until-hover rule paints them. It must NOT discard the
        // contrast system's --jpdb-reader-word-accessible-color: forcing the base
        // to raw currentColor collapses the base glyphs into the pill background
        // while the furigana (which inherits the base word's colour) stays
        // visible — "floating readings" with no base text (Discord/YT bug).
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const chromeRestRule = css.match(/:is\([^)]*\[data-jpdb-reader-passive-chrome="true"\]\s*\)\s*\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)(?::not\([^{]*?\))?\s*\{[^}]*\}/)?.[0] ?? '';

        // The rule must never reset the accessible colour to currentColor (that
        // clobbers the contrast var so the fallback below can never fire) …
        expect(chromeRestRule).not.toContain('--jpdb-reader-word-accessible-color: currentColor');
        // … and the base text paint must honour the accessible colour (falling
        // back to currentColor only when contrast has not computed one).
        expect(chromeRestRule).toContain('color: var(--jpdb-reader-word-accessible-color, currentColor) !important');
        expect(chromeRestRule).toContain('-webkit-text-fill-color: var(--jpdb-reader-word-accessible-color, currentColor)');
        expect(chromeRestRule).not.toContain('color: currentColor !important');
    });

    it('keeps the pitch-accent underline on passive chrome at rest like subtitles', () => {
        // The Shorts subscribe button (チャンネル登録) carries furigana AND a pitch
        // underline; subtitles on the same screen keep their pitch underline at
        // rest, so the chrome button must too. The bare-until-hover rule zeroed
        // --jpdb-reader-word-underline and the ::after border, so only chrome
        // lost its pitch underline until hover.
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const chromeRestRule = css.match(/:is\([^)]*\[data-jpdb-reader-passive-chrome="true"\]\s*\)\s*\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)(?::not\([^{]*?\))?\s*\{[^}]*\}/)?.[0] ?? '';
        // The underline channel must stay driven by the decoration source, not
        // forced transparent at rest.
        expect(chromeRestRule).not.toContain('--jpdb-reader-word-underline: transparent');
        expect(chromeRestRule).not.toContain('text-decoration-color: transparent !important');
        // The ::after pitch-underline border must not be zeroed at rest for
        // passive chrome (the only remaining border-block-end-color rule scoped
        // to this chrome selector was the one that hid the pitch underline).
        const chromeAfterRule = css.match(/:is\([^)]*\[data-jpdb-reader-passive-chrome="true"\]\s*\)\s*\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)(?::not\([^{]*?\))?\s*::after\s*\{[^}]*\}/)?.[0] ?? '';
        expect(chromeAfterRule).toBe('');
        // Mirrored words can inherit a tall control/ruby line box. Their
        // absolute ::after line would anchor to that box edge; pitch mode uses
        // native decoration instead, directly under the base glyphs.
        expect(css).toContain('.jpdb-reader-word-underline-pitch\n  .jpdb-reader-text-mirror\n  .jpdb-reader-word::after');
        expect(css).toMatch(/\.jpdb-reader-word-underline-pitch[\s\S]*?\.jpdb-reader-text-mirror[\s\S]*?\.jpdb-reader-word::after\s*\{\s*content: none !important;/);
        expect(css).toContain('text-decoration-color: var(--jpdb-reader-word-underline, transparent) !important');
        expect(css).not.toContain('jpdb-reader-pitch-compound');
    });



    it('keeps pointer-focused OCR text passive until hover or explicit activation', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');

        expect(css).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active)');
        expect(css).not.toMatch(/jpdb-ocr-line[^{}]*:focus(?!-visible)/u);
    });

    it('allows whole and component popup headwords to show pitch underlines without decorating furigana', () => {
        const wordCss = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const popoverCss = readFileSync('src/reader/styles/popover-core.css', 'utf8');

        expect(wordCss).toContain('.jpdb-reader-pitch-component-headword.jpdb-pitch-heiban');
        expect(wordCss).toContain('.jpdb-reader-word-underline-pitch .jpdb-reader-pitch-component-headword:is(');
        expect(wordCss).toContain('text-decoration-color: var(--jpdb-reader-pitch-color, transparent)');
        expect(popoverCss).not.toContain('.jpdb-reader-header:has(.jpdb-reader-pitch) .jpdb-reader-spelling');
        expect(popoverCss).toMatch(/\.jpdb-reader-spelling rt\s*\{[^}]*text-decoration: none !important;/s);
    });
});
