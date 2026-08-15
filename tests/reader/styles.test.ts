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
const HOSTED_FALLBACK_URL = `https://yomureader.com/yomu.css?v=${__YOMU_VERSION__}`;
const RAW_FALLBACK_URL = `https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.css?v=${__YOMU_VERSION__}`;
const READER_CSS_CACHE_KEY = 'yomu:reader-css-cache:v3';

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

function notFoundResponse(): Response {
    return { ok: false, status: 404, text: async () => 'Not Found' } as Response;
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

        // The sheet ships verbatim; the host-CSS armour layer is appended after
        // it so a host page's `!important` cannot outrank Yomu's own paint.
        expect(css.startsWith(CRITICAL_READER_CSS)).toBe(true);
        expect(css).toContain('@layer jpdb-reader-armour-strong,jpdb-reader-armour;');
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

    it('carries ruby geometry in the critical subset so shadow-root and pre-fallback ruby never wedge', () => {
        // The shared shadow sheet and the pre-fallback inline sheet both use this
        // subset. Without ruby-align the base of a wide reading (技術/ぎじゅつ)
        // fell back to the initial space-around and split apart; without the furi
        // rule the reading rendered at full body size.
        const css = initialReaderCss('');

        expect(css).toContain('.jpdb-reader-word ruby{');
        expect(css).toContain('ruby-align:center!important');
        expect(css).toContain('ruby-position:over!important');
        expect(css).toContain('.jpdb-reader-furi{font-size:.58em');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-has-furi{line-height:2.15}');
        // `-webkit-ruby-align` never existed in any engine and only parse-fails;
        // it must not reappear in the critical subset.
        expect(css).not.toContain('-webkit-ruby-align');
    });

    it("keeps a word's own furigana pressable, because it is part of the word", () => {
        // MEASURED 2026-08-02 in Chromium: at 18px the word's client rects are
        // 51-72 and its reading sits at 40-52, so with pointer-events:none the top
        // 12px of a 32px word — 37% of what the reader sees and aims at —
        // hit-tested to the surrounding paragraph. A word is display:inline so its
        // rects never include the ruby annotation, every fallback in
        // readerWordForPointerEvent is rect-based, and the raw-text fallback
        // refuses a caret inside a reader word: pressing a word's furigana did
        // nothing whatsoever. `inherit` needs no geometry — the rt box belongs to
        // exactly one word, so target.closest('.jpdb-reader-word') resolves it.
        const css = initialReaderCss('');

        const rtRule = css.split('\n').find(line => line.startsWith('.jpdb-reader-word rt{'));
        expect(rtRule).toBeDefined();
        expect(rtRule).toContain('pointer-events:inherit');
        expect(rtRule).not.toContain('pointer-events:none');
        // Never a flat `auto`. pointer-events is an inherited property, so `auto`
        // on the reading re-arms hit testing inside the additive mirrors and OCR
        // layers that switch it off on THEMSELVES to leave host interaction to the
        // page — those surfaces would start swallowing presses they must pass
        // through. Inheriting makes the reading exactly as pressable as its word.
        expect(rtRule).not.toContain('pointer-events:auto');
        // Scoped inside a reader word, so a host page's own ruby keeps its own
        // pointer behaviour and Yomu does not start swallowing its presses.
        expect(css).not.toContain('\nrt{');
    });

    it('agrees with the critical subset in the full sheet, which overrides it', () => {
        // The regression this locks down: the measured pointer-events fix landed
        // ONLY in the critical subset above. The subset is used while the full
        // sheet is unavailable — so on every page that COULD load the full sheet,
        // this file's own `pointer-events: none` won the cascade and the reading
        // stayed a dead tap target. Two sheets, one contract: assert both.
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const rtRule = css.match(/\.jpdb-reader-word rt \{[^}]*\}/)?.[0] ?? '';

        expect(rtRule).toContain('pointer-events: inherit');
        expect(rtRule).not.toContain('pointer-events: none');
        expect(rtRule).not.toContain('pointer-events: auto');
    });

    it('keeps the no-input Settings launcher intrinsic inside coarse fixed chrome', () => {
        const css = readFileSync('src/reader/styles/settings.css', 'utf8');
        const finalDrawerHeight = css.lastIndexOf('height: var(--jpdb-reader-settings-drawer-height, 88svh);');
        const launcherRule = css.match(
            /@media \(hover: none\), \(pointer: coarse\) \{\s*\.jpdb-reader-settings\.jpdb-reader-settings-launcher \{([^}]*)\}/,
        );

        expect(finalDrawerHeight).toBeGreaterThan(-1);
        expect(launcherRule).not.toBeNull();
        expect(css.indexOf(launcherRule![0])).toBeGreaterThan(finalDrawerHeight);
        expect(launcherRule![1]).toContain('height: auto;');
        expect(launcherRule![1]).toContain('min-height: 0;');
        expect(launcherRule![1]).toContain('max-height: 100%;');
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
            url: HOSTED_FALLBACK_URL,
        }));
        expect(fetcher).not.toHaveBeenCalled();
        expect([...stored.values()]).toContain(FULL_READER_CSS);
    });

    it('uses cached full reader CSS when fetch is unavailable', async () => {
        stubGmStorage(new Map([[READER_CSS_CACHE_KEY, FULL_READER_CSS]]));

        await expect(loadReaderCssFallback(undefined, 'https://example.com/article'))
            .resolves.toBe(FULL_READER_CSS);
    });

    // A release can reach users before the docs deploy publishes the pinned
    // content-addressed sheet; then EVERY install of that build falls back over
    // the network. raw.githubusercontent is blocked in China and on plenty of
    // corporate networks, so it must never be the only entry — with one URL the
    // reader lands on the ~5KB critical subset (no furigana, no pitch
    // underlines, settings degraded to native selects).
    it('offers the first-party sheet before the blockable GitHub raw mirror off the hosted site', () => {
        expect(readerCssFallbackUrls('https://example.com/article'))
            .toEqual([HOSTED_FALLBACK_URL, RAW_FALLBACK_URL]);
    });

    it('tries the page origin first on hosted pages and never lists a URL twice', () => {
        expect(readerCssFallbackUrls('https://hrussellzfac023.github.io/yomu-reader/')).toEqual([
            `https://hrussellzfac023.github.io/yomu-reader/yomu.css?v=${__YOMU_VERSION__}`,
            HOSTED_FALLBACK_URL,
            RAW_FALLBACK_URL,
        ]);
        // yomureader.com's own origin URL IS the first-party fallback URL.
        expect(readerCssFallbackUrls('https://yomureader.com/guide/'))
            .toEqual([HOSTED_FALLBACK_URL, RAW_FALLBACK_URL]);
    });

    it('walks past a dead first-party URL to the next fallback instead of giving up', async () => {
        const stored = stubGmStorage();
        const fetcher = vi.fn(async (url: string) => url === RAW_FALLBACK_URL ? cssResponse(FULL_READER_CSS) : notFoundResponse());

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://example.com/article'))
            .resolves.toBe(FULL_READER_CSS);

        expect(fetcher.mock.calls.map(call => call[0])).toEqual([HOSTED_FALLBACK_URL, RAW_FALLBACK_URL]);
        expect(stored.get(READER_CSS_CACHE_KEY)).toBe(FULL_READER_CSS);
    });

    // The cache key is version-independent on purpose: a per-version key started
    // every upgrade cold, which is exactly when a freshly hashed @resource is
    // most likely to be undeployed. A stale-but-complete sheet beats the stub.
    it('serves a last-good sheet cached by an earlier release and refreshes it in the background', async () => {
        const stored = stubGmStorage(new Map([[READER_CSS_CACHE_KEY, FULL_READER_CSS]]));
        const nextCss = `${FULL_READER_CSS} .jpdb-reader-next{}`;
        const fetcher = vi.fn(async () => cssResponse(nextCss));

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://example.com/article'))
            .resolves.toBe(FULL_READER_CSS);

        expect([...stored.keys()]).toEqual([READER_CSS_CACHE_KEY]);
        expect([...stored.keys()].some(key => key.includes(__YOMU_VERSION__))).toBe(false);
        await vi.waitFor(() => expect(stored.get(READER_CSS_CACHE_KEY)).toBe(nextCss));
    });

    it('never caches or serves a truncated body as the last-good sheet', async () => {
        const stored = stubGmStorage(new Map([[READER_CSS_CACHE_KEY, '.jpdb-reader-popover{}']]));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetcher = vi.fn(async () => cssResponse('<html>404 Not Found</html>'));

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://example.com/article'))
            .resolves.toBe('');

        expect(stored.get(READER_CSS_CACHE_KEY)).toBe('.jpdb-reader-popover{}');
        consoleError.mockRestore();
    });

    // Nothing used to report this: the resource getter catches to '', each
    // fallback URL catches per URL, and the consumer treats '' as "nothing to
    // swap in" so its .catch never fires. The owner-visible symptom (dead-looking
    // popover, no furigana) had no breadcrumb at all.
    it('logs an error when the resource, the cache and every fallback URL have failed', async () => {
        stubGmStorage();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetcher = vi.fn(async () => {
            throw new Error('offline');
        });

        await expect(loadReaderCssFallback(fetcher as unknown as typeof fetch, 'https://example.com/article'))
            .resolves.toBe('');

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(String(consoleError.mock.calls[0]?.[0])).toContain('Reader CSS unavailable');
        expect(consoleError.mock.calls[0]?.[1]).toEqual({ fallbackUrls: [HOSTED_FALLBACK_URL, RAW_FALLBACK_URL] });
        consoleError.mockRestore();
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

        // Passive CONTENT words keep the status highlight at rest exactly like
        // active words (owner report 2026-07-19: docs cards / link-wrapped
        // words showed their state only on hover and read as bare host links
        // at rest). The 1.6.2 blanket hover-only rule must NOT come back.
        expect(css).not.toMatch(/\n\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)\s*\{[^}]*\}/);
        expect(css).not.toMatch(/\n\.jpdb-reader-word\.jpdb-reader-passive-word:not\(:hover\):not\(:focus\):not\(\.jpdb-reader-keyboard-active\)::after/);
        // Chrome passive words honour the user's highlight setting at rest
        // like content words (owner reports: YouTube 作成/共有/質問する, Reddit
        // sort chips / timestamps / 参加 / 共有, 2026-07-19). No rule may strip
        // the highlight channel behind a chrome or passive-chrome scope, and
        // the old per-site carve-out list must stay gone with it.
        expect(css).not.toMatch(/passive-chrome[^{]*\{[^}]*--jpdb-reader-word-highlight-source: transparent/);
        expect(css).not.toMatch(/passive-chrome[^{]*:hover[^{]*\{[^}]*background-image: none/);
        expect(css).not.toContain('yt-chip-cloud-chip-renderer');
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
        // Mirrored and ordinary words deliberately share one synthetic border
        // channel: ordinary/mirrored words use ::after and source-projected
        // words inherit the same value onto their exact Range fragments.
        // Mixing native decoration with that overlay put adjacent segments on
        // different WebKit baselines and broke atomic ruby/control underlines.
        expect(css).toContain('.jpdb-reader-text-mirror.jpdb-reader-additive-text-mirror .jpdb-reader-word {\n  text-decoration-color: transparent !important;\n}');
        expect(css).toContain('--jpdb-reader-word-decoration-source: var(--jpdb-reader-source-pitch-decoration, transparent);');
        expect(css).not.toContain('--jpdb-reader-additive-decoration');
        expect(css).not.toMatch(/\.jpdb-reader-word-underline-pitch[\s\S]*?\.jpdb-reader-text-mirror[\s\S]*?\.jpdb-reader-word::after\s*\{\s*content: none !important;/);
        expect(css).not.toContain('jpdb-reader-pitch-compound');
    });

    it('attaches projected underlines and furigana directly to their source glyphs', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const fragmentLine = css.match(/\.jpdb-reader-source-fragment::after\s*\{[^}]*\}/)?.[0] ?? '';
        const detachedSource = css.match(/\.jpdb-reader-detached-furi:not\(\[data-yomu-projected-reading\]\)\s*\{[^}]*\}/)?.[0] ?? '';
        const projectedFuri = css.match(/\.jpdb-reader-projected-furi\s*\{[^}]*\}/)?.[0] ?? '';

        expect(fragmentLine).toContain('inset-block-end: 0');
        expect(fragmentLine).toContain('border-block-end: var(--jpdb-reader-word-underline-thickness)');
        expect(fragmentLine).toContain('var(--jpdb-reader-word-underline, transparent)');
        expect(detachedSource).toContain('display: none !important');
        expect(projectedFuri).toContain('position: fixed !important');
        expect(projectedFuri).toContain('display: block !important');
        expect(css).not.toContain('calc(100% + 5px)');
        expect(css).toMatch(/data-yomu-source-projected="true"[^}]*\.jpdb-reader-detached-ruby\s*\{[^}]*text-decoration: none !important/s);
        expect(css).toMatch(/data-pitch-components="true"[^}]*\.jpdb-reader-source-fragment::after\s*\{[^}]*var\(--jpdb-reader-inline-pitch-gradient\)[^}]*var\(--jpdb-reader-source-gradient-width\)[^}]*var\(--jpdb-reader-source-gradient-offset\)/s);
    });

    it('paints additive highlights only on exact source fragments', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const projectedWord = css.match(/\.jpdb-reader-additive-text-mirror\s+\.jpdb-reader-word\[data-yomu-source-projected="true"\]\s*\{[^}]*\}/)?.[0] ?? '';
        const sourceFragment = css.match(/\.jpdb-reader-source-fragment\s*\{[^}]*\}/)?.[0] ?? '';

        expect(projectedWord).toContain('background: none !important');
        expect(sourceFragment).toContain('var(--jpdb-reader-mirror-status-soft, transparent)');
        expect(css).not.toMatch(/jpdb-reader-text-mirror\.jpdb-reader-additive-text-mirror \.jpdb-reader-word\s*\{[^}]*background-image:/s);
    });



    it('keeps pointer-focused OCR text passive until hover or explicit activation', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');

        expect(css).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active)');
        expect(css).not.toMatch(/jpdb-ocr-line[^{}]*:focus(?!-visible)/u);
    });

    it('paints owned OCR glyphs without exposing caret-scannable page text', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const visualTextRule = css.match(/\.jpdb-ocr-visual-text::before\s*\{[^}]*\}/u)?.[0] ?? '';
        const isolatedTextRule = css.match(/\.jpdb-ocr-line-text\.jpdb-ocr-page-scanner-isolated\s*\{[^}]*\}/u)?.[0] ?? '';

        expect(visualTextRule).toContain('content: attr(data-yomu-ocr-visual-text)');
        expect(isolatedTextRule).toContain('user-select: none');
        expect(isolatedTextRule).toContain('cursor: pointer');
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
