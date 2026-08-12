import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testEnSettings } from './helpers/settings-fixture';
import { withViewport } from './helpers/browser-fixtures';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = testEnSettings();
import type { CardState, JPDBToken } from '../../src/reader/app/types';
import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { documentPortalReaderWordScopeForSource } from '../../src/reader/dom/index';
import { renderedWordPrivateValue } from '../../src/reader/dom/rendered-word-private-state';

type VisiblePageScannerDependencies = ConstructorParameters<typeof VisiblePageScanner>[0];

function createVisiblePageScanner(
    overrides: Partial<VisiblePageScannerDependencies> & Pick<VisiblePageScannerDependencies, 'parseJapanese'>,
): VisiblePageScanner {
    return new VisiblePageScanner({
        getSettings: () => DEFAULT_SETTINGS,
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
        ...overrides,
    });
}

function documentPortalWordForSource(source: Element | null, selector = '.jpdb-reader-word'): HTMLElement | null {
    if (!source) return null;
    return documentPortalReaderWordScopeForSource(source)?.querySelector<HTMLElement>(selector) ?? null;
}

describe('VisiblePageScanner', () => {
    // The jsdom default URL (http://localhost:3000/) now matches the
    // yomu-hosted-docs profile — a loopback root is treated as the Yomu docs
    // homepage, which scans ONLY `.vp-doc` and disables the generic/residual
    // passes. These scheduling/enrichment tests simulate ordinary web pages, so
    // start each on a plain non-Yomu path; the hosted-docs and site-specific
    // tests below re-declare their own URL in-body and override this default.
    beforeEach(() => {
        window.history.pushState({}, '', '/reading/');
    });

    it('stops root-stamp work cleanly after page teardown removes the document root', () => {
        const scanner = createVisiblePageScanner({ parseJapanese: vi.fn(async () => []) });
        const internals = scanner as unknown as { syncPageFuriganaMode: () => void };
        const rootSpy = vi.spyOn(document, 'documentElement', 'get').mockReturnValue(null as unknown as HTMLElement);

        try {
            expect(() => internals.syncPageFuriganaMode()).not.toThrow();
            expect(() => scanner.destroy()).not.toThrow();
        } finally {
            rootSpy.mockRestore();
        }
    });

    it('scanner-isolates OCR words on the initial sparse-card paint', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <section class="jpdb-ocr-layer">
                <div class="jpdb-ocr-line" data-ocr-line data-ocr-text="冒険を始めよう。">
                    <span class="jpdb-ocr-line-text">冒険を始めよう。</span>
                </div>
            </section>
        `;
        const settings = {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all' as const,
            popupActivationMode: 'click' as const,
            lookupOnClick: true,
            lookupOnHover: false,
            lookupOnMiddleMouse: false,
        };
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
            testToken(text, '冒険', 0, 2),
            testToken(text, 'を', 2, 3),
        ]));
        const scanner = createVisiblePageScanner({
            getSettings: () => settings,
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const lineText = document.querySelector<HTMLElement>('.jpdb-ocr-line-text')!;
            const words = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')];
            const adventure = words.find(word => word.dataset.surface === '冒険')!;
            const particle = words.find(word => word.dataset.surface === 'を')!;
            expect(lineText.classList.contains('jpdb-ocr-page-scanner-isolated')).toBe(true);
            expect(document.createTreeWalker(lineText, NodeFilter.SHOW_TEXT).nextNode()).toBeNull();
            expect(adventure).toBeTruthy();
            expect(particle).toBeTruthy();
            words.forEach(word => {
                expect(document.createTreeWalker(word, NodeFilter.SHOW_TEXT).nextNode()).toBeNull();
            });
            expect([...adventure.querySelectorAll<HTMLElement>('[data-yomu-ocr-visual-text]')]
                .map(element => element.dataset.yomuOcrVisualText)
                .join('')).toBe('冒険');

            // The exact-id reading arrives later. Its furigana repaint must keep
            // both the enriched kanji word and the never-enriched particle in
            // the scanner-isolated representation.
            applyPublicVocabularyFurigana(adventure, {
                ...testToken('冒険', '冒険', 0, 2).card,
                spelling: '冒険',
                reading: 'ぼうけん',
                source: 'jiten',
            }, settings);
            expect(lineText.classList.contains('jpdb-ocr-page-scanner-isolated')).toBe(true);
            expect(document.createTreeWalker(lineText, NodeFilter.SHOW_TEXT).nextNode()).toBeNull();
            expect(adventure.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect([...adventure.querySelectorAll<HTMLElement>('.jpdb-ocr-furi [data-yomu-ocr-visual-text]')]
                .map(element => element.dataset.yomuOcrVisualText)
                .join('')).toBe('ぼうけん');
            expect(lineText.closest<HTMLElement>('.jpdb-ocr-line')?.dataset.hasFuri).toBe('true');
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps OCR text available to other lookup tools when Yomu lookup is disabled', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <section class="jpdb-ocr-layer">
                <div class="jpdb-ocr-line" data-ocr-line data-ocr-text="冒険を始めよう。">
                    <span class="jpdb-ocr-line-text">冒険を始めよう。</span>
                </div>
            </section>
        `;
        const settings = {
            ...DEFAULT_SETTINGS,
            popupActivationMode: 'off' as const,
            lookupOnClick: false,
            lookupOnHover: false,
            lookupOnMiddleMouse: false,
        };
        const scanner = createVisiblePageScanner({
            getSettings: () => settings,
            parseJapanese: vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
                testToken(text, '冒険', 0, 2),
                testToken(text, 'を', 2, 3),
            ])),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const lineText = document.querySelector<HTMLElement>('.jpdb-ocr-line-text')!;
            expect(lineText.classList.contains('jpdb-ocr-page-scanner-isolated')).toBe(false);
            expect(lineText.querySelector('[data-yomu-ocr-visual-text]')).toBeNull();
            expect(document.createTreeWalker(lineText, NodeFilter.SHOW_TEXT).nextNode()).not.toBeNull();
            expect(lineText.textContent).toBe('冒険を始めよう。');
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('does not scanner-isolate ordinary page prose', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>冒険を始めよう。</p>';
        const scanner = createVisiblePageScanner({
            parseJapanese: vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
                testToken(text, '冒険', 0, 2),
            ])),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const word = document.querySelector<HTMLElement>('.jpdb-reader-word[data-surface="冒険"]')!;
            expect(word).toBeTruthy();
            expect(word.classList.contains('jpdb-ocr-page-scanner-isolated')).toBe(false);
            expect(word.querySelector('[data-yomu-ocr-visual-text]')).toBeNull();
            expect(document.createTreeWalker(word, NodeFilter.SHOW_TEXT).nextNode()).not.toBeNull();
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('shows a Japanese toast instead of an English diagnostic when a scan fails', () => {
        const toast = vi.fn();
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' }),
            parseJapanese: vi.fn(),
            toast,
        });

        (scanner as unknown as {
            handleVisiblePageScanError(error: unknown, silent: boolean): void;
        }).handleVisiblePageScanError(new Error('JPDB request failed (500).'), false);

        expect(toast).toHaveBeenCalledWith('ページスキャンに失敗しました。');
        expect(toast.mock.calls[0]?.[0]).not.toMatch(/[A-Za-z]{2,}/);
    });

    it('parses large page scans in batches so the first targets can render sooner', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const pauseMutationObserver = vi.fn(callback => callback());
        const scanner = createVisiblePageScanner({
            parseJapanese,
            pauseMutationObserver,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese.mock.calls.map(call => call[0])).toHaveLength(3), { timeout: 10000 });
            await vi.waitFor(() => expect(pauseMutationObserver).toHaveBeenCalledTimes(5), { timeout: 10000 });

            expect(parseJapanese.mock.calls.map(call => call[0])).toHaveLength(3);
            expect(parseJapanese.mock.calls[0]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[1]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[2]?.[0]).toHaveLength(10);
            expect(parseJapanese.mock.calls[0]?.[1]).toEqual({
                jpdbTimeoutMs: 450,
                allowJpdbTimeoutFallback: true,
                includeLocalPitch: false,
                allowSegmentedFallback: true,
                publicJitenDetailLimit: 0,
            });
            // Apply chunks are 48 targets wide so the first paint covers the
            // whole parsed batch instead of arriving in 16-item waves.
            expect(pauseMutationObserver).toHaveBeenCalledTimes(5);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 15000);

    it('recovers a failed parse batch locally without dropping later page targets', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: { skipApi?: boolean }) => {
            if (parseJapanese.mock.calls.length === 1) throw new Error('provider batch failed');
            return paragraphs.map(text => [testToken(text, text, 0, text.length)]);
        });
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).toHaveBeenCalledTimes(4);
            expect(parseJapanese.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ skipApi: true }));
            expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(170);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 15000);

    it('reparses a batch whose parse threw twice instead of leaving the source bare', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 10 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: { skipApi?: boolean }) => {
            // Calls 1 and 2 are the API attempt and its local skipApi retry; both
            // throw, so the empty result is a transient failure, not a settled
            // "no Japanese". A settled-empty source would never retry — this one
            // must, exactly once, and recover on the third call.
            if (parseJapanese.mock.calls.length <= 2) throw new Error('provider and local parse both down');
            return paragraphs.map(text => [testToken(text, text, 0, text.length)]);
        });
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });

            await vi.waitFor(() => expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(10), { timeout: 10_000 });
            // API attempt + skipApi retry (both throw) + one bounded reparse.
            expect(parseJapanese).toHaveBeenCalledTimes(3);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 15_000);

    it('continues beyond the collection cap when every attempted batch rejects twice', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 250 }, (_, index) => (
            `<p id="paragraph-${index}">${index === 0
                ? `日本語の文0です。${'長い本文です。'.repeat(300)}`
                : `日本語の文${index}`}</p>`
        )).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[]) => {
            if (parseJapanese.mock.calls.length <= 6) {
                // Move a failed source between the capped pass and its
                // continuation. Continuations must exclude the exact source
                // nodes that failed, not an ordinal prefix of the new DOM.
                if (parseJapanese.mock.calls.length === 6) {
                    document.body.append(document.querySelector('#paragraph-0')!);
                }
                throw new Error('unrecoverable capped head');
            }
            return paragraphs.map(text => [testToken(text, text, 0, text.length)]);
        });
        const scanner = createVisiblePageScanner({ parseJapanese });
        const scanVisiblePage = vi.spyOn(scanner, 'scanVisiblePage');

        try {
            await scanner.scanVisiblePage({ silent: true });

            await vi.waitFor(() => {
                expect(document.querySelector('#paragraph-200 .jpdb-reader-word')).not.toBeNull();
                expect(document.querySelector('#paragraph-249 .jpdb-reader-word')).not.toBeNull();
            }, { timeout: 10_000 });
            expect(parseJapanese.mock.calls.length).toBeGreaterThan(6);
            await new Promise(resolve => setTimeout(resolve, 30));
            expect(scanVisiblePage, 'one capped pass and one uncapped tail pass').toHaveBeenCalledTimes(2);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 30_000);

    it('reaches the tail of a broad mirrored root across a manual continuation chain', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `<main id="feed">${Array.from(
            { length: 460 },
            (_, index) => `<p id="feed-${index}">日本語の文${index}</p>`,
        ).join('')}</main>`;
        const feed = document.getElementById('feed')!;
        Object.defineProperty(feed, '__reactFiber$coverage', { configurable: true, value: {} });
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
            testToken(text, text, 0, text.length),
        ]));
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: false });
            const tailSource = document.querySelector<HTMLElement>('#feed-459')!;
            await vi.waitFor(() => {
                expect(documentPortalWordForSource(tailSource)).not.toBeNull();
            }, { timeout: 15_000 });
            expect(tailSource.querySelector('.jpdb-reader-word, .jpdb-reader-text-mirror')).toBeNull();
            expect(parseJapanese.mock.calls.flatMap(call => call[0])).toContain('日本語の文459');
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 20_000);

    it('refreshes page-word contrast before yielding between apply chunks', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 50 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, '日本語', 0, 3)]));
        const refreshWordContrast = vi.fn();
        let applyChunks = 0;
        const pauseMutationObserver = <T>(callback: () => T): T => {
            const result = callback();
            applyChunks += 1;
            if (applyChunks === 1) {
                expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(48);
                expect(refreshWordContrast).toHaveBeenCalled();
            }
            return result;
        };
        const scanner = createVisiblePageScanner({
            parseJapanese,
            pauseMutationObserver,
            refreshWordContrast,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(applyChunks).toBe(2);
            expect(refreshWordContrast).toHaveBeenCalledWith(document.querySelector('p'));
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enhances YouTube comment text without dropping the native text', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-comments>
                ${Array.from({ length: 170 }, (_, index) => `
                    <ytd-comment-view-model>
                        <yt-attributed-string id="content-text">日本語コメント${index}</yt-attributed-string>
                    </ytd-comment-view-model>
                `).join('')}
            </ytd-comments>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });
            await new Promise(resolve => setTimeout(resolve, 20));

            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalled(), { timeout: 15000 });
            // Token application is async after parse resolves — wait for the word
            // to render instead of asserting immediately (CI flake: got null).
            const firstCommentText = document.querySelector<HTMLElement>('yt-attributed-string#content-text')!;
            await vi.waitFor(() => expect(documentPortalWordForSource(firstCommentText)).not.toBeNull(), { timeout: 15000 });
            expect(firstCommentText.querySelector('.jpdb-reader-word, .jpdb-reader-text-mirror')).toBeNull();
            expect(document.querySelector('ytd-comment-view-model')?.textContent).toContain('日本語コメント0');
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 40000);

    it('scans large no-key YouTube comment DOM sequentially to avoid live-page contention', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-comments>
                ${Array.from({ length: 170 }, (_, index) => `
                    <ytd-comment-view-model>
                        <yt-attributed-string id="content-text">日本語コメント${index}です。${'長いコメント本文です。'.repeat(25)}</yt-attributed-string>
                    </ytd-comment-view-model>
                `).join('')}
            </ytd-comments>
        `;
        const firstBatch = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn((paragraphs: string[]): Promise<JPDBToken[][]> => {
            if (parseJapanese.mock.calls.length === 1) return firstBatch.promise;
            return Promise.resolve(paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        });
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(parseJapanese).toHaveBeenCalledTimes(1);

            firstBatch.resolve((parseJapanese.mock.calls[0]?.[0] ?? []).map(text => [testToken(text, text, 0, text.length)]));
            await scan;
            expect(parseJapanese.mock.calls.length).toBeGreaterThan(1);
            const firstCommentText = document.querySelector<HTMLElement>('yt-attributed-string#content-text')!;
            await vi.waitFor(() => expect(documentPortalWordForSource(firstCommentText)).not.toBeNull());
            expect(firstCommentText.querySelector('.jpdb-reader-word, .jpdb-reader-text-mirror')).toBeNull();
            expect(document.querySelector('yt-attributed-string')?.textContent).toContain('日本語コメント0です');
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('prefetches keyed parse batches for large YouTube-owned comment DOM', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-comments>
                ${Array.from({ length: 170 }, (_, index) => `
                    <ytd-comment-view-model>
                        <yt-attributed-string id="content-text">日本語コメント${index}です。${'長いコメント本文です。'.repeat(25)}</yt-attributed-string>
                    </ytd-comment-view-model>
                `).join('')}
            </ytd-comments>
        `;
        const firstBatch = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn((paragraphs: string[]): Promise<JPDBToken[][]> => {
            if (parseJapanese.mock.calls.length === 1) return firstBatch.promise;
            return Promise.resolve(paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'mock-jpdb-token' }),
            parseJapanese,
        });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2), { timeout: 15_000 });

            firstBatch.resolve((parseJapanese.mock.calls[0]?.[0] ?? []).map(text => [testToken(text, text, 0, text.length)]));
            await scan;
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 20_000);

    it('prefetches remote parse batches on large generic pages while the first batch is still resolving', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                ${Array.from({ length: 8 }, (_, index) => `<p>日本語の長い本文${index}です。${'さらに詳しい説明です。'.repeat(80)}</p>`).join('')}
            </main>
        `;
        const firstBatch = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn((paragraphs: string[]): Promise<JPDBToken[][]> => {
            if (parseJapanese.mock.calls.length === 1) return firstBatch.promise;
            return Promise.resolve(paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'mock-jpdb-token' }),
            parseJapanese,
        });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2), { timeout: 5_000 });

            firstBatch.resolve((parseJapanese.mock.calls[0]?.[0] ?? []).map(text => [testToken(text, text, 0, text.length)]));
            await scan;
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enhances Bloomee styled landing-page headings and lower visible copy', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://bloomeelife.com/') as unknown as Location,
        });
        document.body.innerHTML = `
            <header>
                <nav><a href="/users/sign_up">新規登録</a><a href="/contacts/question">よくある質問</a></nav>
            </header>
            <main class="js-main">
                <section class="point">
                    <div class="point__itembox">
                        <h2 class="point__itembox-headline" style="text-align:center;font-size:22px;line-height:1.1">
                            <span>point3</span>
                            季節のお花を、かんたんに飾れる
                        </h2>
                        <p class="point__itembox-txt">食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
                    </div>
                </section>
                <div class="ctaarea">
                    <p class="amazon-pay-copy">amazon pay ご利用いただけます</p>
                </div>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForBloomeeLandingText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('季節のお花を、かんたんに飾れる'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('ご利用いただけます'))).toBe(true);

            const heading = document.querySelector<HTMLElement>('.point__itembox-headline')!;
            expect(heading.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="季節"]')?.querySelector('rt')?.textContent).toBe('きせつ');
            expect(heading.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="お花"]')?.querySelector('rt')?.textContent).toBe('はな');
            expect(document.querySelector<HTMLElement>('.ctaarea .jpdb-reader-word[data-expression="利用"]')?.querySelector('rt')?.textContent).toBe('りよう');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('preserves furigana across Bloomee product chrome, drawers, and review links', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://bloomeelife.com/products/rose-arrangement') as unknown as Location,
        });
        document.body.innerHTML = `
            <aside class="drawer-menu" style="width:340px">
                <p>保有ポイント <strong>59 pt</strong></p>
                <a href="/subscription">お花の定期便</a>
                <a href="/mypage">マイページ</a>
                <a href="/orders">購入履歴</a>
            </aside>
            <main class="product-detail">
                <nav class="breadcrumb" style="white-space:nowrap">
                    <a href="/gift">お花のギフト</a>
                    &gt;
                    <a href="/arrangement">フラワーアレンジメント</a>
                    &gt;
                    <span>【花瓶不要】 バラのみ 季節のお花アレンジメント</span>
                </nav>
                <section class="product-hero">
                    <h1 data-product-title style="font-size:38px;line-height:1.1">
                        【花瓶不要】 バラのみ 季節のお花アレンジメント
                    </h1>
                    <p class="rating" style="line-height:1.2">★★★★☆ 4.9 <a href="#reviews">（10件のレビュー）</a></p>
                    <dl class="prices">
                        <dt>一般価格</dt><dd>6,644円(税込)</dd>
                        <dt>会員価格</dt><dd>5,980円(税込)</dd>
                    </dl>
                </section>
                <article class="review-card">
                    <h2>母の誕生日に</h2>
                    <p>お花が大好きな母の誕生日にプレゼントしました🌹 とても喜んでくれました。</p>
                    <a class="review-product-link" href="/products/rose-arrangement">
                        【花瓶不要】 バラのみ 季節のお花アレンジメント
                    </a>
                </article>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForBloomeeProductText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(document.documentElement.getAttribute('data-yomu-furigana-mode')).toBe('all');
            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('【花瓶不要】 バラのみ 季節のお花アレンジメント'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('お花の定期便'))).toBe(true);

            const productTitle = document.querySelector<HTMLElement>('[data-product-title]')!;
            expect(productTitle.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="花瓶"] rt')?.textContent).toBe('かびん');
            expect(productTitle.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="季節"] rt')?.textContent).toBe('きせつ');
            expect(productTitle.closest('[data-jpdb-reader-passive-chrome="true"]')).toBeNull();
            expect(document.querySelector<HTMLElement>('.breadcrumb .jpdb-reader-word[data-expression="お花"] rt')?.textContent).toBe('はな');
            expect(document.querySelector<HTMLElement>('.drawer-menu .jpdb-reader-word[data-expression="定期便"] rt')?.textContent).toBe('ていきびん');
            expect(document.querySelector<HTMLElement>('.prices .jpdb-reader-word[data-expression="一般価格"] rt')?.textContent).toBe('いっぱんかかく');
            expect(document.querySelector<HTMLElement>('.review-card .jpdb-reader-word[data-expression="誕生日"] rt')?.textContent).toBe('たんじょうび');
            expect(document.querySelector<HTMLElement>('.review-product-link .jpdb-reader-word[data-expression="季節"] rt')?.textContent).toBe('きせつ');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('renders furigana on generic compact media-card titles while keeping them passive', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://example.test/videos') as unknown as Location,
        });
        document.body.innerHTML = `
            <main>
                <section class="video-grid">
                    <article class="video-card">
                        <a class="video-card-link" role="button" href="/watch/sample-title/">
                            <img src="/thumb.jpg" alt="">
                            <span class="video-title">人妻温泉旅行</span>
                        </a>
                    </article>
                </section>
                <p class="profile-copy">プロフィール紹介文です。</p>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForCompactMediaGridText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('人妻温泉旅行'))).toBe(true);

            const title = document.querySelector<HTMLElement>('.video-title')!;
            const word = title.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="温泉"]')!;
            expect(word).not.toBeNull();
            expect(word.dataset.jpdbReaderPassive).toBe('true');
            expect(word.querySelector('rt')).not.toBeNull();
            expect(title.closest('[data-jpdb-reader-passive-chrome="true"]')).toBeNull();
            expect(textWithoutFurigana(title)).toContain('人妻温泉旅行');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('renders furigana on compact carousel titles with sibling cover links', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://bookwalker.jp/') as unknown as Location,
        });
        document.body.innerHTML = `
            <main>
                <section class="book-carousel">
                    <article class="book-card">
                        <div class="book-tile" style="display:flex;width:149px">
                            <a class="book-cover" href="/books/nihongo-manga">
                                <img alt="日本語の漫画タイトル" src="/cover.jpg">
                            </a>
                            <h3 class="book-title">
                                <a data-book-title class="book-title-link" href="/books/nihongo-manga" style="display:flow-root;overflow:hidden;line-height:18px;height:36px">
                                    日本語の漫画タイトル
                                </a>
                            </h3>
                        </div>
                    </article>
                </section>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForCompactBookCarouselText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('日本語の漫画タイトル'))).toBe(true);

            const title = document.querySelector<HTMLElement>('[data-book-title]')!;
            const mirror = title.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror');
            const word = (mirror ?? title).querySelector<HTMLElement>('.jpdb-reader-word[data-expression="日本語"]');
            expect(word).not.toBeNull();
            expect(word?.dataset.jpdbReaderPassive).toBe('true');
            expect(word?.querySelector('rt,.jpdb-reader-furi')).not.toBeNull();
            expect(title.closest('[data-jpdb-reader-passive-chrome="true"]')).toBeNull();
            expect(textWithoutFurigana(title)).toContain('日本語の漫画タイトル');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('renders furigana on compact product-gallery titles through neutral wrappers', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://bookwalker.jp/') as unknown as Location,
        });
        document.body.innerHTML = `
            <main>
                <section class="product-gallery">
                    <article class="product-entry" style="width:160px">
                        <div class="media-shell">
                            <a class="cover-link" href="/books/free-title/">
                                <img alt="あなた達それでも先生ですかっ！" src="/cover.jpg">
                            </a>
                        </div>
                        <div class="details-shell">
                            <p class="genre-badge">マンガ</p>
                            <h3 class="title-wrap">
                                <a data-product-title class="title-link" href="/books/free-title/" style="display:block;overflow:hidden;line-height:18px;height:36px;width:148px">
                                    あなた達それでも先生ですかっ！
                                </a>
                            </h3>
                            <p class="price-label">2冊無料</p>
                            <button type="button">無料で読む</button>
                        </div>
                    </article>
                </section>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForCompactProductGalleryText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('あなた達それでも先生ですかっ'))).toBe(true);

            const title = document.querySelector<HTMLElement>('[data-product-title]')!;
            const mirror = title.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror');
            const word = (mirror ?? title).querySelector<HTMLElement>('.jpdb-reader-word[data-expression="先生"]');
            expect(word).not.toBeNull();
            expect(word?.dataset.jpdbReaderPassive).toBe('true');
            expect(word?.querySelector('rt,.jpdb-reader-furi')).not.toBeNull();
            expect(title.closest('[data-jpdb-reader-passive-chrome="true"]')).toBeNull();
            expect(textWithoutFurigana(title)).toContain('あなた達それでも先生ですかっ');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps compact image navigation labels inline while preserving furigana', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.traveldonkey.jp/blog/australia/26220/') as unknown as Location,
        });
        document.head.innerHTML = `
            <style>
                #globalnav a div span {
                    display: block !important;
                }
            </style>
        `;
        document.body.innerHTML = `
            <header>
                <nav id="globalnav">
                    <ul>
                        <li>
                            <a href="/optional_tour/">
                                <div>現地ツアー</div>
                                <span class="mobile-none"><img src="/tour.png" alt="現地ツアー・オプショナルツアー"></span>
                            </a>
                        </li>
                    </ul>
                </nav>
            </header>
            <main><p>オーストラリアの首都について読みます。</p></main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForTravelDonkeyNavText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts).toContain('現地ツアー');

            const words = Array.from(document.querySelectorAll<HTMLElement>('#globalnav .jpdb-reader-word'));
            expect(words).toHaveLength(2);
            expect(words.map(word => word.dataset.expression)).toEqual(['現地', 'ツアー']);
            expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
            expect(words[0]?.querySelector('rt,.jpdb-reader-furi')?.textContent).toBe('げんち');
            expect(words.map(word => word.style.getPropertyValue('display'))).toEqual(['inline', 'inline']);
            expect(words.map(word => word.style.getPropertyPriority('display'))).toEqual(['important', 'important']);
            expect(words.map(word => getComputedStyle(word).display)).toEqual(['inline', 'inline']);
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.head.innerHTML = '';
            document.body.innerHTML = '';
        }
    });

    it('keeps compact footer help links lookupable while preserving furigana', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://app.example/new') as unknown as Location,
        });
        document.body.innerHTML = `
            <main>
                <section class="composer-shell" style="width:760px">
                    <div class="composer" style="height:96px;overflow:hidden">本日はどのようなお手伝いをさせていただけますか？</div>
                    <footer class="composer-footer" style="height:28px;overflow:hidden;white-space:nowrap">
                        利用制限に達しました ・ リセット時刻: 13:00 ・
                        <a data-footer-help href="/help/limits">Claude Codeと共有される制限</a>
                    </footer>
                </section>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForCompactFooterText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts).toContain('Claude Codeと共有される制限');

            const link = document.querySelector<HTMLElement>('[data-footer-help]')!;
            const word = link.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="共有"]')!;
            expect(word).not.toBeNull();
            expect(word.dataset.jpdbReaderPassive).toBe('true');
            expect(word.querySelector('rt,.jpdb-reader-furi')?.textContent).toBe('きょうゆう');
            expect(textWithoutFurigana(link).replace(/\s+/g, '')).toContain('ClaudeCodeと共有される制限');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps constrained notification action-row text inside its rounded banner', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://app.example/chat') as unknown as Location,
        });
        document.body.innerHTML = `
            <main>
                <section class="toast-row" style="display:flex;align-items:center;gap:24px">
                    <div data-memory-toast role="status" class="memory-toast" style="height:76px;overflow:hidden;border-radius:32px">
                        <div data-memory-toast-message style="height:48px;overflow:hidden;line-height:24px">
                            <div>メモリがいっぱいです</div>
                            <div>回答があまりユーザーに適合しない可能性があります。アップグレードしてメモリを拡大するか、既存のメモリを管理してください。</div>
                        </div>
                    </div>
                    <div class="toast-actions">
                        <button type="button">管理する</button>
                        <button type="button">さらに使用する</button>
                    </div>
                </section>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForConstrainedNotificationText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts).toContain('メモリがいっぱいです');
            expect(parsedTexts.some(text => text.includes('回答があまりユーザー'))).toBe(true);

            const toast = document.querySelector<HTMLElement>('[data-memory-toast]')!;
            const message = document.querySelector<HTMLElement>('[data-memory-toast-message]')!;
            const words = Array.from(message.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
            expect(toast.dataset.jpdbReaderPassiveChrome).toBe('true');
            expect(words.length).toBeGreaterThan(3);
            expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
            expect(words.some(word => word.querySelector('rt,.jpdb-reader-furi')?.textContent === 'かいとう')).toBe(true);
            expect(textWithoutFurigana(message).replace(/\s+/g, '')).toContain('回答があまりユーザーに適合しない可能性があります');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enhances mobile YouTube comment text on narrow no-key viewports', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://m.youtube.com/',
            origin: 'https://m.youtube.com',
            hostname: 'm.youtube.com',
        });
        document.body.innerHTML = `
            <ytm-browse>
                ${Array.from({ length: 90 }, (_, index) => `
                    <ytm-comment-renderer>
                        <div id="content-text">日本語コメント${index}です。</div>
                    </ytm-comment-renderer>
                `).join('')}
            </ytm-browse>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '' }),
            parseJapanese,
        });

        try {
            await withViewport(390, 844, () => scanner.scanVisiblePage({ silent: true }));
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalled(), { timeout: 15_000 });
            const firstCommentText = document.querySelector<HTMLElement>('ytm-comment-renderer #content-text')!;
            await vi.waitFor(() => expect(documentPortalWordForSource(firstCommentText)).not.toBeNull(), { timeout: 15_000 });
            expect(firstCommentText.querySelector('.jpdb-reader-word, .jpdb-reader-text-mirror')).toBeNull();
            expect(document.querySelector('ytm-comment-renderer')?.textContent).toContain('日本語コメント0です');
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 20_000);

    it('enhances YouTube search chrome while preserving form and button dispatch', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-app>
                <ytd-masthead>
                    <ytd-searchbox>
                        <form id="search-form">
                            <div id="search-input">
                                <span class="placeholder">検索</span>
                                <input name="search_query" placeholder="検索" value="">
                            </div>
                            <button id="search-icon-legacy" type="submit" aria-label="検索">
                                <span class="yt-core-attributed-string ytAttributedStringHost">検索</span>
                            </button>
                        </form>
                    </ytd-searchbox>
                </ytd-masthead>
            </ytd-app>
        `;
        let submitted = false;
        let clicked = false;
        document.querySelector<HTMLFormElement>('form')?.addEventListener('submit', event => {
            event.preventDefault();
            submitted = true;
        });
        document.querySelector<HTMLButtonElement>('button')?.addEventListener('click', () => { clicked = true; });
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForYouTubeChromeText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).toHaveBeenCalled();
            expect(document.querySelector('ytd-searchbox #search-icon-legacy .jpdb-reader-word[data-expression="検索"]')).not.toBeNull();
            expect(document.querySelector('ytd-searchbox .placeholder .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('ytd-searchbox')?.textContent).toContain('検索');
            expect(document.querySelector('input .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('input + .jpdb-reader-control-text-mirror')).toBeNull();

            document.querySelector<HTMLButtonElement>('button')?.click();
            expect(clicked).toBe(true);
            expect(submitted).toBe(true);
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enhances YouTube watch title and metadata without wrapping controls', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-watch-flexy>
                <ytd-watch-metadata>
                    <h1><yt-formatted-string id="title">日本語の習慣を学ぶ</yt-formatted-string></h1>
                    <div id="owner">
                        <ytd-channel-name><a href="/@nihongo">日本語チャンネル</a></ytd-channel-name>
                        <button type="button"><span>登録</span></button>
                    </div>
                    <div id="info">
                        <span id="info-strings">視聴回数 12万回</span>
                        <div id="metadata-line"><span>日本語学習</span><span>昨日</span></div>
                    </div>
                </ytd-watch-metadata>
            </ytd-watch-flexy>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForYouTubeWatchMetadataText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const metadata = document.querySelector<HTMLElement>('ytd-watch-metadata')!;
            expect(parseJapanese).toHaveBeenCalled();
            expect(metadata.querySelector('.jpdb-reader-word')).not.toBeNull();
            expect(metadata.querySelector('.jpdb-reader-word[data-expression="日本語"]')).not.toBeNull();
            expect(metadata.querySelector('.jpdb-reader-word[data-expression="習慣"]')).not.toBeNull();
            expect(metadata.querySelector('.jpdb-reader-word[data-expression="学ぶ"]')).not.toBeNull();
            expect(metadata.textContent).toContain('チャンネル');
            expect(metadata.querySelector('.jpdb-reader-word[data-expression="視聴"]')).not.toBeNull();
            expect(metadata.textContent).toContain('回数 12万回');
            expect(metadata.querySelector('button')?.textContent).toContain('登録');
            expect(metadata.querySelector('button .jpdb-reader-word')).toBeNull();
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enhances YouTube transcript, watch sidebar, and feed rows', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-app>
                <ytd-transcript-segment-renderer>
                    <yt-formatted-string class="segment-text">字幕の行です</yt-formatted-string>
                </ytd-transcript-segment-renderer>
                <ytd-watch-next-secondary-results-renderer>
                    <ytd-compact-video-renderer>
                        <a href="/watch?v=next"><span id="video-title">おすすめ講座</span></a>
                    </ytd-compact-video-renderer>
                </ytd-watch-next-secondary-results-renderer>
                <ytd-rich-grid-renderer>
                    <ytd-rich-item-renderer data-yomu-test-nested-title>
                        <a href="/watch?v=nested">
                            <yt-touch-feedback-shape aria-hidden="true"><div>押下中</div></yt-touch-feedback-shape>
                            <span id="video-title">東京散歩と春コーデ</span>
                        </a>
                    </ytd-rich-item-renderer>
                    ${Array.from({ length: 170 }, (_, index) => `
                        <ytd-rich-item-renderer>
                            <a href="/watch?v=feed-${index}">
                                <span id="video-title">日本語フィード動画${index}</span>
                            </a>
                        </ytd-rich-item-renderer>
                    `).join('')}
                </ytd-rich-grid-renderer>
            </ytd-app>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForYouTubeWatchMetadataText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const transcriptSource = document.querySelector<HTMLElement>('ytd-transcript-segment-renderer .segment-text')!;
            const sidebarSource = document.querySelector<HTMLElement>('ytd-compact-video-renderer #video-title')!;
            const feedSource = document.querySelector<HTMLElement>('ytd-rich-item-renderer:not([data-yomu-test-nested-title]) #video-title')!;
            const nestedSource = document.querySelector<HTMLElement>('[data-yomu-test-nested-title] #video-title')!;
            expect(parseJapanese).toHaveBeenCalled();
            expect(document.querySelector('.jpdb-reader-word')).not.toBeNull();
            expect(documentPortalWordForSource(transcriptSource, '.jpdb-reader-word[data-expression="字幕"]')).not.toBeNull();
            expect(documentPortalWordForSource(transcriptSource, '.jpdb-reader-word[data-expression="行"]')).not.toBeNull();
            expect(sidebarSource.querySelector('.jpdb-reader-word[data-expression="講座"]')).not.toBeNull();
            expect(feedSource.querySelector('.jpdb-reader-word[data-expression="日本語"]')).not.toBeNull();
            expect(feedSource.querySelector('.jpdb-reader-word[data-expression="動画"]')).not.toBeNull();
            expect(nestedSource.querySelector('.jpdb-reader-word[data-expression="東京"] .jpdb-reader-furi')?.textContent).toBe('とうきょう');
            expect(nestedSource.querySelector('.jpdb-reader-word[data-expression="春"] .jpdb-reader-furi')?.textContent).toBe('はる');
            expect(transcriptSource.querySelector('.jpdb-reader-word, .jpdb-reader-text-mirror')).toBeNull();
            for (const source of [sidebarSource, feedSource, nestedSource]) {
                expect(documentPortalReaderWordScopeForSource(source)).toBeNull();
                expect(source.querySelector('.jpdb-reader-text-mirror')).not.toBeNull();
            }
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    // Heavy fixture (170 feed rows): same slow-runner allowance as the
    // comment-scan test (1.6.122) so busy build machines don't flake.
    }, 40000);

    it('enhances YouTube filter chips as passive controls without stealing clicks', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-app>
                <ytd-feed-filter-chip-bar-renderer>
                    <iron-selector id="chips" role="tablist">
                        <yt-chip-cloud-chip-renderer>
                            <chip-shape>
                                <button class="ytChipShapeButtonReset" role="tab" aria-selected="true">
                                    <div class="ytChipShapeChip"><div>すべて</div></div>
                                </button>
                            </chip-shape>
                        </yt-chip-cloud-chip-renderer>
                        <yt-chip-cloud-chip-renderer>
                            <chip-shape>
                                <button class="ytChipShapeButtonReset" role="tab" aria-selected="false">
                                    <div class="ytChipShapeChip"><div>最近アップロードされた動画</div></div>
                                </button>
                            </chip-shape>
                        </yt-chip-cloud-chip-renderer>
                    </iron-selector>
                </ytd-feed-filter-chip-bar-renderer>
            </ytd-app>
        `;
        const clicks: string[] = [];
        document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
            const nativeLabel = button.textContent?.replace(/\s+/g, '').trim() ?? '';
            button.addEventListener('click', () => clicks.push(nativeLabel));
        });
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForYouTubeChromeText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const words = [...document.querySelectorAll<HTMLElement>('ytd-feed-filter-chip-bar-renderer .jpdb-reader-word')];
            expect(words.map(word => word.dataset.expression)).toEqual(expect.arrayContaining(['すべて', '動画']));
            expect(words.every(word => word.classList.contains('jpdb-reader-passive-word'))).toBe(true);
            const video = words.find(word => word.dataset.expression === '動画');
            // Detached readings keep furigana outside YouTube's native centred
            // line box while the control remains tokenized and lookupable.
            expect(video?.querySelector('rt')).toBeNull();
            expect(video?.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('どうが');
            expect(video?.classList.contains('jpdb-pitch-heiban')).toBe(true);

            document.querySelectorAll<HTMLButtonElement>('button')[0]?.click();
            document.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
            expect(clicks).toEqual(['すべて', '最近アップロードされた動画']);
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('leaves YouTube mini-guide labels page-owned while preserving native link dispatch', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-app>
                <ytd-mini-guide-renderer role="navigation" mini-guide-visible>
                    <div id="items">
                        <ytd-mini-guide-entry-renderer>
                            <a id="endpoint" class="yt-simple-endpoint" aria-label="ホーム" title="ホーム" href="/">
                                <span class="title">ホーム</span>
                            </a>
                            <tp-yt-paper-tooltip hidden><div id="tooltip">ホーム</div></tp-yt-paper-tooltip>
                        </ytd-mini-guide-entry-renderer>
                        <ytd-mini-guide-entry-renderer>
                            <a id="endpoint" class="yt-simple-endpoint" aria-label="登録チャンネル" title="登録チャンネル" href="/feed/subscriptions">
                                <span class="title">登録チャンネル</span>
                            </a>
                            <span hidden><button type="button" id="ally-menu-button" aria-label="登録チャンネル"></button></span>
                        </ytd-mini-guide-entry-renderer>
                        <ytd-mini-guide-entry-renderer>
                            <a id="endpoint" class="yt-simple-endpoint" aria-label="マイページ" title="マイページ" href="/feed/you">
                                <span class="title">マイページ</span>
                            </a>
                        </ytd-mini-guide-entry-renderer>
                    </div>
                </ytd-mini-guide-renderer>
            </ytd-app>
        `;
        const navigations: string[] = [];
        document.querySelectorAll<HTMLAnchorElement>('a#endpoint').forEach(anchor => {
            anchor.addEventListener('click', event => {
                event.preventDefault();
                navigations.push(anchor.getAttribute('href') ?? '');
            });
        });
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForYouTubeChromeText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            const guide = document.querySelector<HTMLElement>('ytd-mini-guide-renderer')!;
            const labels = [...guide.querySelectorAll<HTMLElement>('a#endpoint .title')];
            const nativeHtml = guide.innerHTML;
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).not.toHaveBeenCalled();
            expect(guide.innerHTML).toBe(nativeHtml);
            expect(guide.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).toBeNull();
            expect(labels.every(label => documentPortalReaderWordScopeForSource(label) === null)).toBe(true);
            expect(guide.textContent).toContain('ホーム');
            expect(guide.textContent).toContain('登録チャンネル');
            expect(guide.textContent).toContain('マイページ');
            expect(guide.querySelector('tp-yt-paper-tooltip .jpdb-reader-word')).toBeNull();
            expect(guide.querySelector('span[hidden] .jpdb-reader-word')).toBeNull();

            document.querySelector<HTMLAnchorElement>('a[href="/feed/subscriptions"]')?.click();
            expect(navigations).toEqual(['/feed/subscriptions']);
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enhances YouTube topbar create button text while preserving button dispatch', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-app>
                <ytd-masthead>
                    <yt-button-shape>
                        <button class="ytSpecButtonShapeNextHost" type="button" aria-label="作成">
                            <span class="yt-core-attributed-string ytAttributedStringHost">作成</span>
                        </button>
                    </yt-button-shape>
                </ytd-masthead>
            </ytd-app>
        `;
        let clicked = false;
        document.querySelector<HTMLButtonElement>('button')?.addEventListener('click', () => { clicked = true; });
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForYouTubeChromeText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const create = document.querySelector<HTMLElement>('ytd-masthead .jpdb-reader-word[data-expression="作成"]')!;
            expect(create).not.toBeNull();
            expect(create.classList.contains('jpdb-reader-passive-word')).toBe(true);
            expect(create.classList.contains('jpdb-pitch-heiban')).toBe(true);
            // The topbar button keeps its native centred line box while a
            // detached reading paints above it without reserving a lane.
            expect(create.querySelector('rt')).toBeNull();
            expect(create.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('さくせい');

            document.querySelector<HTMLButtonElement>('button')?.click();
            expect(clicked).toBe(true);
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('mirrors Japanese labels and dropdown options without treating text-entry placeholders as content', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <p>静かな日本語の文章です。</p>
                <form>
                    <label id="sort-label">表示順
                        <select aria-labelledby="sort-label">
                            <option value="new">新しい順</option>
                            <option value="ja" selected>日本語だけ</option>
                            <option value="recommended">おすすめ</option>
                        </select>
                    </label>
                    <input id="search" placeholder="単語を検索" value="">
                </form>
                <section class="chat-shell">
                    <div role="textbox" contenteditable="true" data-placeholder="質問する">
                        <p><br></p>
                    </div>
                    <p class="placeholder">検索ヘルプ</p>
                </section>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForFormControlText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await withViewport(820, 1180, () => scanner.scanVisiblePage({ silent: true }), { visualViewport: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('静かな日本語の文章です。'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('表示順'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('日本語だけ'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('単語を検索'))).toBe(false);
            expect(parsedTexts.some(text => text.includes('質問する'))).toBe(false);
            expect(parsedTexts.some(text => text.includes('検索ヘルプ'))).toBe(false);

            const labelWord = document.querySelector<HTMLElement>('label .jpdb-reader-word[data-expression="表示順"]');
            expect(labelWord).not.toBeNull();
            expect(labelWord?.dataset.jpdbReaderPassive).toBe('true');

            const select = document.querySelector<HTMLSelectElement>('select')!;
            expect(select.querySelector('.jpdb-reader-word')).toBeNull();
            const selectMirror = select.nextElementSibling as HTMLElement | null;
            expect(selectMirror?.matches('.jpdb-reader-control-text-mirror')).toBe(true);
            const selectWord = selectMirror?.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="日本語"]') ?? null;
            expect(selectWord).not.toBeNull();
            expect(selectWord?.dataset.jpdbReaderPassive).toBe('true');

            const input = document.querySelector<HTMLInputElement>('input')!;
            expect(input.querySelector('.jpdb-reader-word')).toBeNull();
            const inputMirror = input.nextElementSibling as HTMLElement | null;
            expect(inputMirror?.matches('.jpdb-reader-control-text-mirror')).not.toBe(true);
            expect(input.hasAttribute('data-jpdb-reader-control-placeholder-hidden')).toBe(false);
            expect(document.querySelector('[role="textbox"] .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('.placeholder .jpdb-reader-word')).toBeNull();

            select.dispatchEvent(new Event('change'));
            expect(selectMirror?.isConnected).toBe(false);
            input.dispatchEvent(new Event('input'));
            expect(inputMirror?.isConnected).not.toBe(true);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('does not keep stale composer placeholder mirrors visible as page text', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <article><p data-real-prose>ヘンリーさん、お久しぶりです。</p></article>
                <section class="composer-shell">
                    <div class="wcDTda_prosemirror-parent text-token-text-primary">
                        <textarea class="wcDTda_fallbackTextarea" name="prompt-textarea" placeholder="質問してみましょう" aria-label="ChatGPT とチャットする" style="display:none"></textarea>
                        <span class="jpdb-reader-control-text-mirror" data-jpdb-reader-control-text-mirror="true" data-jpdb-reader-control-mirror-kind="inline" data-source-text="質問してみましょう / ChatGPT とチャットする">質問してみましょう / ChatGPT とチャットする</span>
                        <div contenteditable="true" class="ProseMirror" role="textbox" aria-label="ChatGPT とチャットする" data-placeholder="質問してみましょう">
                            <p data-empty-paragraph="true" data-placeholder="質問してみましょう" class="placeholder"><br></p>
                        </div>
                    </div>
                </section>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForComposerPlaceholderText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('ヘンリーさん'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('質問してみましょう'))).toBe(false);
            expect(parsedTexts.some(text => text.includes('ChatGPT'))).toBe(false);
            expect(document.querySelector('[data-real-prose] .jpdb-reader-word')).not.toBeNull();
            expect(document.querySelector('.wcDTda_prosemirror-parent .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('.wcDTda_prosemirror-parent .jpdb-reader-control-text-mirror')).toBeNull();
            expect(document.querySelector('[contenteditable] .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('.placeholder .jpdb-reader-word')).toBeNull();
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps Wikibooks-style prose inline while search controls avoid inline word rendering', async () => {
        const restoreRects = mockVisibleElementRects();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://ja.wikibooks.org/wiki/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8') as unknown as Location,
        });
        document.body.innerHTML = `
            <header>
                <div role="search" class="vector-search-box">
                    <form>
                        <label>Wikibooks内を検索
                            <input type="search" placeholder="Wikibooks内を検索" value="">
                        </label>
                        <button type="submit">検索</button>
                    </form>
                </div>
            </header>
            <main id="content">
                <article class="mw-parser-output">
                <p data-wikibooks-prose>
                    詳しい編集方法は、<a href="/wiki/Wikibooks:%E7%B7%A8%E9%9B%86%E3%81%AE%E4%BB%95%E6%96%B9">編集の仕方</a>や<a href="/wiki/Wikibooks:%E6%96%B0%E3%81%97%E3%81%84%E3%83%9A%E3%83%BC%E3%82%B8">新しいページの作り方</a>で説明しています。
                    参考になさってください。編集の仕方がピンと来ない方は<a href="/wiki/Wikibooks:%E3%82%B5%E3%83%B3%E3%83%89%E3%83%9C%E3%83%83%E3%82%AF%E3%82%B9">サンドボックス</a>で練習してみてください。
                </p>
                </article>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForWikibooksProseText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parsedTexts.some(text => text.includes('詳しい編集方法は'))).toBe(true);
            expect(parsedTexts.some(text => text.includes('Wikibooks内を検索'))).toBe(true);
            const searchWords = Array.from(document.querySelectorAll<HTMLElement>('[role="search"] .jpdb-reader-word'));
            expect(searchWords).toEqual([]);

            const prose = document.querySelector<HTMLElement>('[data-wikibooks-prose]')!;
            const words = Array.from(prose.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
            const activeWords = words.filter(word => !word.classList.contains('jpdb-reader-passive-word'));
            expect(words.length).toBeGreaterThan(4);
            expect(activeWords.length).toBeGreaterThan(0);
            expect(activeWords.every(word => word.classList.contains('jpdb-reader-prose-word'))).toBe(true);
            expect(activeWords.every(word => word.dataset.jpdbReaderProse === 'true')).toBe(true);
            expect(activeWords.every(word => word.style.getPropertyValue('display') === '')).toBe(true);
            expect(prose.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="編集"] rt')?.textContent).toBe('へんしゅう');
            const proseText = prose.textContent?.replace(/\([^)]*\)/g, '').replace(/\s+/g, '') ?? '';
            expect(proseText).toContain('詳しい編集方法は、編集の仕方や新しいページの作り方で説明しています。');
        } finally {
            scanner.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('waits longer for remote API parses before falling back on visible page scans', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>日本語の動画です。</p>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, '日本語', 0, 3)]));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
                jpdbTimeoutMs: 1200,
                allowJpdbTimeoutFallback: true,
            }));
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('paints fallback words before asynchronous pitch and ruby enrichment settles', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>先生いつもありがとうございます。</p>';
        const fallbackToken = testToken('先生いつもありがとうございます。', '先生', 0, 2);
        const order: string[] = [];
        const enrichment = deferred<void>();
        const parseJapanese = vi.fn(async () => [[fallbackToken]]);
        const pauseMutationObserver = vi.fn(callback => {
            order.push('apply');
            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            return callback();
        });
        const enrichPitchWords = vi.fn((_tokens: JPDBToken[]) => {
            order.push('pitch');
            expect(document.querySelector('.jpdb-reader-word')).not.toBeNull();
            return enrichment.promise;
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
            pauseMutationObserver,
            enrichPitchWords,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(order).toEqual(['apply', 'pitch']);
            expect(enrichPitchWords).toHaveBeenCalledTimes(1);
            expect(word.dataset.expression).toBe('先生');
            expect(word.querySelector('rt')).toBeNull();
        } finally {
            enrichment.resolve(undefined);
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('does not hold first paint behind reading-less public Jiten detail hydration', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>初心者エンジニアです。</p>';
        const sparseToken = testToken('初心者エンジニアです。', '初心者', 0, 3);
        sparseToken.card = {
            ...sparseToken.card,
            vid: 1342860,
            sid: 0,
            source: 'jiten',
            jitenWordId: 1342860,
            jitenReadingIndex: 0,
        };
        const order: string[] = [];
        const enrichment = deferred<void>();
        const parseJapanese = vi.fn(async () => [[sparseToken]]);
        const pauseMutationObserver = vi.fn(callback => {
            order.push('apply');
            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            return callback();
        });
        const enrichPitchWords = vi.fn((_tokens: JPDBToken[]) => {
            order.push('reading');
            expect(document.querySelector('.jpdb-reader-word')).not.toBeNull();
            return enrichment.promise;
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
            pauseMutationObserver,
            enrichPitchWords,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(order).toEqual(['apply', 'reading']);
            expect(enrichPitchWords).toHaveBeenCalledTimes(1);
            expect(renderedWordPrivateValue(word, 'cardSource')).toBe('jiten');
            expect(word.dataset.reading ?? '').toBe('');
            expect(word.querySelector('rt')).toBeNull();
            expect(parseJapanese).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
                publicJitenDetailLimit: 0,
            }));
        } finally {
            enrichment.resolve(undefined);
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps the 1.2s remote parse fallback independent from post-paint pitch enrichment', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>先生いつもありがとうございます。</p>';
        const fallbackToken = testToken('先生いつもありがとうございます。', '先生', 0, 2);
        const order: string[] = [];
        const enrichment = deferred<void>();
        const parseJapanese = vi.fn(async () => [[fallbackToken]]);
        const pauseMutationObserver = vi.fn(callback => {
            order.push('apply');
            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            return callback();
        });
        const enrichPitchWords = vi.fn((_tokens: JPDBToken[]) => {
            order.push('pitch');
            expect(document.querySelector('.jpdb-reader-word')).not.toBeNull();
            return enrichment.promise;
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', furiganaMode: 'all' }),
            parseJapanese,
            pauseMutationObserver,
            enrichPitchWords,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(parseJapanese).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ jpdbTimeoutMs: 1200 }));
            expect(order).toEqual(['apply', 'pitch']);
            expect(enrichPitchWords).toHaveBeenCalledTimes(1);
            expect(word.dataset.expression).toBe('先生');
            expect(word.querySelector('rt')).toBeNull();
        } finally {
            enrichment.resolve(undefined);
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('repairs clipped ruby rows as each apply chunk lands during a long scan', async () => {
        const restoreRects = mockVisibleElementRects();
        const laterParse = deferred<JPDBToken[][]>();
        document.body.innerHTML = `
            <ytd-rich-item-renderer><div id="video-title" style="height:22px;line-height:22px">日本語の動画0</div></ytd-rich-item-renderer>
            ${Array.from({ length: 89 }, (_, index) => `<p>日本語の動画${index + 1}</p>`).join('')}
        `;
        const title = document.querySelector<HTMLElement>('#video-title')!;
        mockOverflow(title, 36, 22);
        let parseCallCount = 0;
        const parseJapanese = vi.fn((paragraphs: string[]): Promise<JPDBToken[][]> => {
            parseCallCount += 1;
            const tokens = paragraphs.map(text => [rubyToken(text, '日本語', 'にほんご', 0, 3)]);
            return parseCallCount === 1 ? Promise.resolve(tokens) : laterParse.promise;
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2), { timeout: 5_000 });

            expect(title.querySelector('rt')).not.toBeNull();
            // Unclipped short row (clipped rows are clip-constrained and no
            // longer grow): 36px measured room + 1px top clearance for the
            // flush reading.
            expect(title.style.height).toBe('37px');

            laterParse.resolve(parseJapanese.mock.calls[1]![0].map((text: string) => [rubyToken(text, '日本語', 'にほんご', 0, 3)]));
            await scan;
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('paints every chunk of a long destructive target across mobile parse batches', async () => {
        const restoreRects = mockVisibleElementRects();
        const longText = Array.from({ length: 320 }, () => '日本語の説明を確認します。').join('');
        document.body.innerHTML = `<main><p>${longText}</p></main>`;
        let tokenId = 0;
        const parsedTokenIds: string[] = [];
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => {
            const token = testToken(text, '日本語', 0, 3);
            tokenId += 1;
            token.card = { ...token.card, vid: tokenId, sid: tokenId };
            parsedTokenIds.push(String(tokenId));
            return [token];
        }));
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await withViewport(390, 844, () => scanner.scanVisiblePage({ silent: true }));

            const parsedParagraphs = parseJapanese.mock.calls.flatMap(call => call[0]);
            const words = [...document.querySelectorAll<HTMLElement>('p .jpdb-reader-word')];
            expect(parsedParagraphs.length).toBeGreaterThan(1);
            expect(parseJapanese.mock.calls.length, 'the paragraph must cross the mobile parse budget').toBeGreaterThan(1);
            // The chunker may merge a sub-280-character final tail into the
            // preceding 700-character mobile chunk.
            expect(Math.max(...parsedParagraphs.map(text => text.length))).toBeLessThan(980);
            expect(parsedParagraphs.reduce((length, text) => length + text.length, 0)).toBe(longText.length);
            expect(words.map(word => renderedWordPrivateValue(word, 'vid')).sort())
                .toEqual(parsedTokenIds.sort());
            expect(document.querySelector('p .jpdb-reader-text-mirror'), 'chunk slices must not impersonate a repaint loop').toBeNull();
            expect(document.querySelector('p')?.textContent).toBe(longText);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('switches a repeatedly reverted long source to one complete mirror', async () => {
        const restoreRects = mockVisibleElementRects();
        const longText = Array.from({ length: 180 }, () => '日本語の説明を確認します。').join('');
        document.body.innerHTML = `<main><p>${longText}</p></main>`;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, '日本語', 0, 3)]));
        const scanner = createVisiblePageScanner({ parseJapanese });
        const paragraph = document.querySelector('p')!;

        try {
            for (let attempt = 0; attempt < 5 && !paragraph.querySelector('.jpdb-reader-text-mirror'); attempt += 1) {
                paragraph.textContent = longText;
                await scanner.scanVisiblePage({ silent: true });
            }

            const mirror = paragraph.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            expect(mirror, 'the full source must graduate to the repaint-loop mirror').not.toBeNull();
            expect(mirror?.textContent).toBe(longText);
            expect(parseJapanese.mock.calls.flatMap(call => call[0])).toContain(longText);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('skips stale target writes when visible text changes while parsing', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>日本語の文です。</p>';
        const parsed = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const scanner = createVisiblePageScanner({
            parseJapanese,
        });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));

            const text = document.querySelector('p')?.firstChild as Text;
            text.data = '英語の文です。';
            parsed.resolve([[{
                card: {
                    vid: 1,
                    sid: 1,
                    rid: 1,
                    spelling: '日本語',
                    reading: 'にほんご',
                    frequencyRank: null,
                    partOfSpeech: [],
                    meanings: [],
                    cardState: ['known'],
                    pitchAccent: [],
                    wordWithReading: null,
                    source: 'jpdb',
                },
                start: 0,
                end: 3,
                length: 3,
                rubies: [],
                pitchClass: '',
            }]]);
            await scan;

            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            expect(document.querySelector('p')?.textContent).toBe('英語の文です。');
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('lets an explicit annotations-off cancellation stop an in-flight visible page scan', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>日本語の文です。</p>';
        const parsed = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));

            scanner.cancelVisiblePageScan();
            parsed.resolve([[rubyToken('日本語の文です。', '日本語', 'にほんご', 0, 3)]]);
            await scan;

            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            expect(document.querySelector('p')?.textContent).toBe('日本語の文です。');
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('does not start local recovery after an explicit cancellation', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>日本語の文です。</p>';
        const parsed = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
            scanner.cancelVisiblePageScan();
            parsed.reject(new Error('provider stopped'));
            await scan;

            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('re-annotates text after a framework re-render replaces annotated nodes', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<div id="app"><p>日本語の文です。</p></div>';
        const tokenFor = (sentence: string): JPDBToken[] => [{
            card: {
                vid: 1,
                sid: 1,
                rid: 1,
                spelling: '日本語',
                reading: 'にほんご',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['known'],
                pitchAccent: [],
                wordWithReading: null,
                source: 'jpdb',
            },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: 'heiban',
            sentence,
        }];
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => tokenFor(text)));
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });
            expect(document.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();

            // A frameworky re-render: the component swaps the whole subtree
            // for fresh nodes with identical text, dropping our spans (this
            // is what the auto-scan mutation observer reacts to live).
            const app = document.querySelector('#app')!;
            const fresh = document.createElement('p');
            fresh.textContent = '日本語の文です。';
            app.replaceChildren(fresh);
            expect(document.querySelector('.jpdb-reader-word')).toBeNull();

            await scanner.scanVisiblePage({ silent: true });
            expect(fresh.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();

            // And again for an in-place text-node replacement (React updates
            // a text child without replacing the element).
            const word = fresh.querySelector('.jpdb-reader-word')!;
            word.parentElement!.replaceChildren(document.createTextNode('日本語の文です。'));
            await scanner.scanVisiblePage({ silent: true });
            expect(fresh.querySelector('.jpdb-reader-word.jpdb-known')).not.toBeNull();
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('reports page coverage and i+1 guidance for manual scans with Jiten-backed words', async () => {
        const restoreRects = mockVisibleElementRects();
        const sentence = '今日本を読む';
        document.body.innerHTML = `<main><p>${sentence}</p></main>`;
        const toast = vi.fn();
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
            stateToken(text, '今日', 0, 2, 'known', { vid: 10, sid: 1, source: 'jpdb' }),
            stateToken(text, '本', 2, 3, 'new', { vid: 42, sid: 2, source: 'jiten', jitenWordId: 42, jitenReadingIndex: 2 }),
            stateToken(text, '読む', 4, 6, 'known', { vid: 11, sid: 1, source: 'jpdb' }),
        ]));
        const scanner = createVisiblePageScanner({
            parseJapanese,
            toast,
        });

        try {
            await scanner.scanVisiblePage({ silent: false });

            expect(toast).toHaveBeenCalledWith('67% known · 2/3 · 1 new · 1 i+1');
            const insight = document.querySelector<HTMLElement>('[data-mining-insight="i-plus-one"]')!;
            expect(insight.textContent).toBe('本');
            expect(renderedWordPrivateValue(insight, 'cardSource')).toBe('jiten');
            expect(renderedWordPrivateValue(insight, 'cardId')).toBe('42');
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('enables segmented fallback for hosted Japanese text when no dictionary data is available', async () => {
        const restoreRects = mockVisibleElementRects();
        window.history.pushState({}, '', '/yomu-reader/');
        const heading = '青空の下で本を読む';
        document.body.innerHTML = `
            <main class="hosted-text-fixture vp-doc" data-yomu-runtime-surface>
                <h3>${heading}</h3>
                <p>今日は静かな喫茶店で新しい本を読みました。</p>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[], options?: { allowSegmentedFallback?: boolean }) => {
            expect(options?.allowSegmentedFallback).toBe(true);
            return paragraphs.map(text => text === heading ? [testToken(text, '下', 3, 4)] : []);
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const words = [...document.querySelectorAll<HTMLElement>('.hosted-text-fixture .jpdb-reader-word')];
            expect(words.map(word => word.textContent)).toContain('下');
            const down = words.find(word => word.textContent === '下');
            expect(down?.dataset.expression).toBe('下');
            expect(down?.classList.contains('jpdb-not-in-deck')).toBe(true);
            expect(down?.tabIndex).toBe(-1);
        } finally {
            restoreRects();
            window.history.pushState({}, '', '/');
            document.body.innerHTML = '';
        }
    });

    it('does not rescan or grow hosted Japanese docs markup on repeated scans', async () => {
        const restoreRects = mockVisibleElementRects();
        window.history.pushState({}, '', '/yomu-reader/');
        const heading = '青空の下で本を読む';
        document.body.innerHTML = `
            <main class="hosted-text-fixture vp-doc" data-yomu-runtime-surface>
                <h3>${heading}</h3>
                <p>日本語</p>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => {
            if (text === heading) return [rubyToken(text, text, 'あおぞらのしたでほんをよむ', 0, text.length)];
            return [rubyToken(text, text, readingForText(text), 0, text.length)];
        }));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja', furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });
            const hostedBlock = document.querySelector<HTMLElement>('.hosted-text-fixture')!;
            const htmlAfterFirstScan = hostedBlock.innerHTML;
            const wordCountAfterFirstScan = hostedBlock.querySelectorAll('.jpdb-reader-word').length;
            const rubyTextAfterFirstScan = [...hostedBlock.querySelectorAll('rt')].map(rt => rt.textContent);

            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(hostedBlock.innerHTML).toBe(htmlAfterFirstScan);
            expect(hostedBlock.querySelectorAll('.jpdb-reader-word')).toHaveLength(wordCountAfterFirstScan);
            expect(hostedBlock.querySelectorAll('.jpdb-reader-word .jpdb-reader-word')).toHaveLength(0);
            expect([...hostedBlock.querySelectorAll('rt')].map(rt => rt.textContent)).toEqual(rubyTextAfterFirstScan);
        } finally {
            scanner.destroy();
            restoreRects();
            window.history.pushState({}, '', '/');
            document.body.innerHTML = '';
        }
    });

    it('keeps hosted docs prose stable when VitePress content roots overlap', async () => {
        const restoreRects = mockVisibleElementRects();
        window.history.pushState({}, '', '/yomu-reader/getting-started/');
        const first = 'A userscript is a small helper. Add よむ to that manager. After that, よむ appears on Japanese pages.';
        const second = 'Short version: install よむ, open any Japanese page, then tap or hover a word.';
        document.body.innerHTML = `
            <main>
                <div class="content">
                    <div class="vp-doc" data-yomu-runtime-surface>
                        <h1>使い始める</h1>
                        <p>${first}</p>
                        <p>${second}</p>
                    </div>
                </div>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForHostedDocsText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja', furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });
            const paragraphs = [...document.querySelectorAll<HTMLParagraphElement>('.vp-doc p')];
            const htmlAfterFirstScan = document.querySelector<HTMLElement>('.vp-doc')!.innerHTML;

            await scanner.scanVisiblePage({ silent: true });

            const parsedTexts = parseJapanese.mock.calls.flatMap(call => call[0]);
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parsedTexts.filter(text => text.includes('A userscript'))).toHaveLength(1);
            expect(parsedTexts.filter(text => text.includes('Short version'))).toHaveLength(1);
            expect(paragraphs[0]?.textContent).toBe(first);
            expect(paragraphs[1]?.textContent).toBe(second);
            expect(document.querySelector<HTMLElement>('.vp-doc')!.innerHTML).toBe(htmlAfterFirstScan);
            expect(document.querySelectorAll('.vp-doc .jpdb-reader-word .jpdb-reader-word')).toHaveLength(0);
        } finally {
            scanner.destroy();
            restoreRects();
            window.history.pushState({}, '', '/');
            document.body.innerHTML = '';
        }
    });

    it('leaves hosted homepage chrome and docs copy plain while covering a declared Reader Surface', async () => {
        const restoreRects = mockVisibleElementRects();
        window.history.pushState({}, '', '/yomu-reader/');
        document.body.innerHTML = `
            <main class="jpdb-reader-word-underline-pitch jpdb-reader-word-text-pitch">
                <header class="VPNav"><a href="/getting-started">はじめる</a></header>
                <section class="VPHomeHero">
                    <h1 class="heading">日本語を読む</h1>
                    <p class="tagline">青空の下で本を読む</p>
                    <div class="actions"><a class="VPButton" href="/install/">今すぐ追加</a></div>
                </section>
                <div class="yomu-install-panel"><strong>設定を開く</strong></div>
                <div class="yomu-link-grid yomu-next-grid">
                    <a class="yomu-link-card" href="/guide/"><strong>次の手順</strong></a>
                </div>
                <div class="yomu-hosted-overflow-group"><a href="/changelog">更新履歴</a></div>
                <div class="vp-doc">
                    <p class="site-copy">辞書で設定を読む。</p>
                    <section data-yomu-runtime-surface><p>青空で本を読む。</p></section>
                </div>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(tokensForHostedCoverageText));
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja', furiganaMode: 'all' }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });
            const readerSurface = document.querySelector<HTMLElement>('[data-yomu-runtime-surface]')!;
            const surfaceHtmlAfterFirstScan = readerSurface.innerHTML;

            for (const selector of ['.VPNav', '.VPHomeHero', '.yomu-install-panel', '.yomu-next-grid', '.yomu-hosted-overflow-group']) {
                const chrome = document.querySelector<HTMLElement>(selector)!;
                expect(
                    chrome.querySelectorAll('.jpdb-reader-word, .jpdb-reader-text-mirror').length,
                    `${selector} must remain ordinary site UI`,
                ).toBe(0);
            }
            const parsedText = parseJapanese.mock.calls.flatMap(call => call[0]).join('\n');
            expect(parsedText).not.toContain('はじめる');
            expect(parsedText).not.toContain('設定を開く');
            expect(parsedText).not.toContain('辞書で設定を読む');

            expect(document.querySelector('.site-copy .jpdb-reader-word')).toBeNull();
            const readerWords = [...readerSurface.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
            const readerSurfaces = readerWords.map(word => word.dataset.expression || word.textContent?.trim() || '');
            expect(readerSurfaces).toEqual(expect.arrayContaining(['青空', '本', '読む']));
            for (const surface of ['青空', '本']) {
                const word = readerWords.find(item => item.dataset.expression === surface);
                expect(word?.querySelector('rt')?.textContent).toBe(readingForHostedCoverage(surface));
                expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            }

            // SPA remount / repeated scan stays stable and cannot escape into
            // surrounding site copy after the surface has been tokenized.
            const parseCallsAfterFirstScan = parseJapanese.mock.calls.length;
            const heroWordsAfterFirstScan = document.querySelectorAll('.VPHomeHero .jpdb-reader-word').length;
            await scanner.scanVisiblePage({ silent: true });
            expect(parseJapanese.mock.calls.length).toBe(parseCallsAfterFirstScan);
            expect(readerSurface.innerHTML).toBe(surfaceHtmlAfterFirstScan);
            expect(readerSurface.querySelectorAll('.jpdb-reader-word .jpdb-reader-word')).toHaveLength(0);
            expect(document.querySelectorAll('.jpdb-reader-word .jpdb-reader-word')).toHaveLength(0);
            expect(document.querySelectorAll('.VPHomeHero .jpdb-reader-word')).toHaveLength(heroWordsAfterFirstScan);
        } finally {
            scanner.destroy();
            restoreRects();
            window.history.pushState({}, '', '/');
            document.body.innerHTML = '';
        }
    });

    it('enables segmented fallback on normal page scans when no API key or dictionaries are available', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<main><p>青空の下で日本語を読む</p></main>';
        const parseJapanese = vi.fn(async (paragraphs: string[], options?: { allowSegmentedFallback?: boolean }) => {
            expect(options?.allowSegmentedFallback).toBe(true);
            return paragraphs.map(text => [testToken(text, '日本語', 5, 8)]);
        });
        const refreshWordContrast = vi.fn();
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false }),
            parseJapanese,
            refreshWordContrast,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ allowSegmentedFallback: true }));
            expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('日本語');
            expect(refreshWordContrast).toHaveBeenCalledWith(document.querySelector('p'));
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('renders generic Jiten status classes and hides known-status furigana during visible page scans', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<main><p>読む</p></main>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => {
            return paragraphs.map(text => [jitenRubyStateToken(text, '読む', 0, 2, 'young')]);
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: 'jiten-key',
                ankiEnabled: false,
                furiganaMode: 'known-status',
                // UT-47: young is in the configurable "learning" group, which
                // is not hidden by default.
                furiganaHiddenStateGroups: ['known', 'due', 'failed', 'learning'],
            }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(word.textContent).toBe('読む');
            expect(word.classList.contains('jpdb-young')).toBe(true);
            expect(word.classList.contains('jiten-young')).toBe(false);
            expect(renderedWordPrivateValue(word, 'cardSource')).toBe('jiten');
            expect(renderedWordPrivateValue(word, 'cardState')).toBe('young');
            expect(word.querySelector('rt')).toBeNull();
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('passes changed roots to status enrichment so rendered words can update without a page refresh', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<main><p>青空の下で日本語を読む</p></main>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => {
            return paragraphs.map(text => [testToken(text, '日本語', 5, 8)]);
        });
        const enrichAnkiWords = vi.fn((_tokens: JPDBToken[], roots?: ParentNode[]) => {
            roots?.forEach(root => {
                root.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
                    word.classList.add('anki-due');
                    word.dataset.ankiState = 'due';
                });
            });
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, apiKey: '', localDictionariesEnabled: false }),
            parseJapanese,
            enrichAnkiWords,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const paragraph = document.querySelector('p');
            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(enrichAnkiWords).toHaveBeenCalledWith(
                [expect.objectContaining({ card: expect.objectContaining({ spelling: '日本語' }) })],
                [paragraph],
            );
            expect(word.dataset.ankiState).toBe('due');
            expect(word.classList.contains('anki-due')).toBe(true);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('skips Anki status enrichment for visible page scans when Anki mining is disabled', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<main><p>青空の下で日本語を読む</p></main>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => {
            return paragraphs.map(text => [testToken(text, '日本語', 5, 8)]);
        });
        const enrichAnkiWords = vi.fn();
        const scanner = createVisiblePageScanner({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                apiKey: '',
                localDictionariesEnabled: false,
                wordTextColorSource: 'anki',
            }),
            parseJapanese,
            enrichAnkiWords,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('日本語');
            expect(enrichAnkiWords).not.toHaveBeenCalled();
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('keeps visible page status enrichment running when only Bunpro word states are active', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<main><p>青空の下で日本語を読む</p></main>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => {
            return paragraphs.map(text => [testToken(text, '日本語', 5, 8)]);
        });
        const enrichAnkiWords = vi.fn((_tokens: JPDBToken[], roots?: ParentNode[]) => {
            roots?.forEach(root => {
                root.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
                    word.classList.add('bunpro-known');
                    word.dataset.bunproState = 'known';
                });
            });
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                apiKey: '',
                localDictionariesEnabled: false,
                bunproMiningEnabled: true,
                bunproFrontendApiToken: 'bunpro-front-token',
                bunproFrontendApiTokenExpiresAt: '',
            }),
            parseJapanese,
            enrichAnkiWords,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const paragraph = document.querySelector('p');
            const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(enrichAnkiWords).toHaveBeenCalledWith(
                [expect.objectContaining({ card: expect.objectContaining({ spelling: '日本語' }) })],
                [paragraph],
            );
            expect(word.dataset.bunproState).toBe('known');
            expect(word.classList.contains('bunpro-known')).toBe(true);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('prepares asbplayer subtitle tokens and starts status coloring before the first render', async () => {
        document.body.innerHTML = '<div class="asbplayer-subtitles-container-bottom"><span>日本語を読む</span></div>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, '日本語', 0, 3)]));
        const order: string[] = [];
        const prepareSubtitleTokensBeforeRender = vi.fn((tokens: JPDBToken[]) => {
            order.push('prepare');
            expect(document.querySelector('.asbplayer-subtitles-container-bottom .jpdb-reader-word')).toBeNull();
            tokens[0]!.card = {
                ...tokens[0]!.card,
                reading: 'にほんご',
                cardState: ['known'],
                pitchAccent: ['LHHH'],
                source: 'jpdb',
            };
            tokens[0]!.rubies = [{ text: 'にほんご', start: 0, end: 3, length: 3 }];
            tokens[0]!.pitchClass = 'atamadaka';
        });
        const beginAnkiWordEnrichment = vi.fn(() => {
            order.push('background-anki');
            return () => undefined;
        });
        const prepareAnkiWordEnrichmentBeforeRender = vi.fn((tokens: JPDBToken[]) => {
            order.push('prepare-anki');
            expect(tokens[0]?.card.reading).toBe('にほんご');
            expect(tokens[0]?.pitchClass).toBe('atamadaka');
            expect(document.querySelector('.asbplayer-subtitles-container-bottom .jpdb-reader-word')).toBeNull();
            return (roots?: ParentNode[]) => {
                order.push('apply-anki');
                const word = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom .jpdb-reader-word');
                expect(word).not.toBeNull();
                roots?.forEach(root => {
                    root.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(renderedWord => {
                        renderedWord.classList.add('anki-known');
                        renderedWord.dataset.ankiState = 'known';
                    });
                });
            };
        });
        const enrichAnkiWords = vi.fn((_tokens: JPDBToken[], roots?: ParentNode[]) => {
            order.push('fallback-anki');
            const word = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom .jpdb-reader-word');
            expect(word).not.toBeNull();
            roots?.forEach(root => {
                root.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(renderedWord => {
                    renderedWord.classList.add('anki-known');
                    renderedWord.dataset.ankiState = 'known';
                });
            });
        });
        const reconcileResolvedWordEffects = vi.fn((tokens: JPDBToken[], roots: ParentNode[]) => {
            order.push('reconcile');
            expect(tokens[0]?.card.reading).toBe('にほんご');
            expect(roots).toHaveLength(1);
            expect(roots[0]?.querySelector('.jpdb-reader-word')).not.toBeNull();
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, furiganaMode: 'all' }),
            parseJapanese,
            prepareSubtitleTokensBeforeRender,
            beginAnkiWordEnrichment,
            prepareAnkiWordEnrichmentBeforeRender,
            enrichAnkiWords,
            reconcileResolvedWordEffects,
        });

        try {
            await scanner.scanAsbPlayerSubtitles();

            const word = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom .jpdb-reader-word')!;
            expect(order).toEqual(['prepare', 'prepare-anki', 'reconcile', 'apply-anki']);
            expect(reconcileResolvedWordEffects).toHaveBeenCalledTimes(1);
            expect(beginAnkiWordEnrichment).not.toHaveBeenCalled();
            expect(enrichAnkiWords).not.toHaveBeenCalled();
            expect(word.classList.contains('jpdb-known')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
            expect(word.querySelector('rt')?.textContent).toBe('にほんご');
            expect(word.dataset.ankiState).toBe('known');
        } finally {
            document.body.innerHTML = '';
        }
    });

    it('drains the asbplayer offscreen cue cache in paced batches so cues are colorized before display', async () => {
        vi.useFakeTimers();
        // asbplayer pre-renders the whole track into its offscreen cache and
        // moves the same node onscreen when current: 30 cues exceed the
        // 12-target batch, so a single pass used to leave most cues
        // uncolorized until after they were shown.
        const offscreenCues = Array.from({ length: 30 }, (_, index) => `<div><span>日本語の台詞${index}</span></div>`).join('');
        document.body.innerHTML = `
            <div class="asbplayer-offscreen">${offscreenCues}</div>
            <div class="asbplayer-subtitles-container-bottom"><span>現在の日本語字幕</span></div>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const prepareSubtitleTokensBeforeRender = vi.fn((tokens: JPDBToken[]) => {
            tokens.forEach(token => {
                token.card = {
                    ...token.card,
                    reading: 'にほんごのせりふ',
                    cardState: ['known'],
                    pitchAccent: ['LHHHHHHH'],
                    source: 'jpdb',
                };
                token.rubies = [{ text: 'にほんご', start: token.start, end: token.start + 3, length: 3 }];
                token.pitchClass = 'heiban';
            });
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, furiganaMode: 'all' }),
            parseJapanese,
            prepareSubtitleTokensBeforeRender,
        });

        try {
            await scanner.scanAsbPlayerSubtitles();

            // The visible cue is prioritized into the first batch even though
            // the offscreen cache precedes it in document order.
            expect(document.querySelector('.asbplayer-subtitles-container-bottom .jpdb-reader-word')).not.toBeNull();

            // Paced drain finishes the remaining offscreen cues.
            for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(120);
            const offscreen = document.querySelector('.asbplayer-offscreen')!;
            expect(offscreen.querySelectorAll('.jpdb-reader-word').length).toBe(30);
            offscreen.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
                expect(word.classList.contains('jpdb-known')).toBe(true);
                expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
                expect(word.querySelector('rt')?.textContent).toBe('にほんご');
            });
        } finally {
            scanner.destroy();
            vi.useRealTimers();
            document.body.innerHTML = '';
        }
    });

    it('prepares asbplayer subtitle tokens without Anki enrichment when Anki mining is disabled', async () => {
        document.body.innerHTML = '<div class="asbplayer-subtitles-container-bottom"><span>日本語を読む</span></div>';
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, '日本語', 0, 3)]));
        const prepareSubtitleTokensBeforeRender = vi.fn((tokens: JPDBToken[]) => {
            tokens[0]!.rubies = [{ text: 'にほんご', start: 0, end: 3, length: 3 }];
        });
        const enrichAnkiWords = vi.fn();
        const scanner = createVisiblePageScanner({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                furiganaMode: 'all',
                subtitleTextColorSource: 'anki',
            }),
            parseJapanese,
            prepareSubtitleTokensBeforeRender,
            enrichAnkiWords,
        });

        try {
            await scanner.scanAsbPlayerSubtitles();

            const word = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom .jpdb-reader-word')!;
            expect(prepareSubtitleTokensBeforeRender).toHaveBeenCalledTimes(1);
            expect(word.dataset.expression).toBe('日本語');
            expect(word.querySelector('rt')?.textContent).toBe('にほんご');
            expect(enrichAnkiWords).not.toHaveBeenCalled();
        } finally {
            document.body.innerHTML = '';
        }
    });

    it('uses bounded JPDB parsing with segmented fallback for API-backed page scans', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<main><p>先生いつもありがとうございました。</p></main>';
        const parseJapanese = vi.fn(async (paragraphs: string[], options?: {
            jpdbTimeoutMs?: number;
            allowJpdbTimeoutFallback?: boolean;
            allowSegmentedFallback?: boolean;
        }) => {
            expect(options).toEqual(expect.objectContaining({
                jpdbTimeoutMs: 1200,
                allowJpdbTimeoutFallback: true,
                allowSegmentedFallback: true,
            }));
            return paragraphs.map(text => [testToken(text, '先生', 0, 2)]);
        });
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'api-key', localDictionariesEnabled: true }),
            parseJapanese,
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('先生');
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('skips late target writes after the scanner is destroyed', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>日本語の文です。</p>';
        const parsed = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const preloadParsedTokens = vi.fn();
        const enrichPitchWords = vi.fn();
        const enrichAnkiWords = vi.fn();
        const scanner = createVisiblePageScanner({
            parseJapanese,
            preloadParsedTokens,
            enrichPitchWords,
            enrichAnkiWords,
        });

        try {
            const scan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));

            scanner.destroy();
            parsed.resolve([[{
                card: {
                    vid: 1,
                    sid: 1,
                    rid: 1,
                    spelling: '日本語',
                    reading: 'にほんご',
                    frequencyRank: null,
                    partOfSpeech: [],
                    meanings: [],
                    cardState: ['known'],
                    pitchAccent: [],
                    wordWithReading: null,
                    source: 'jpdb',
                },
                start: 0,
                end: 3,
                length: 3,
                rubies: [],
                pitchClass: '',
            }]]);
            await scan;

            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            expect(preloadParsedTokens).not.toHaveBeenCalled();
            expect(enrichPitchWords).not.toHaveBeenCalled();
            expect(enrichAnkiWords).not.toHaveBeenCalled();
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('runs one pending visible scan after an in-flight scan finishes', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>今日は読む。</p>';
        const firstParse = deferred<JPDBToken[][]>();
        const secondParse = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn()
            .mockImplementationOnce(() => firstParse.promise)
            .mockImplementationOnce(() => secondParse.promise);
        const scanner = createVisiblePageScanner({
            parseJapanese,
        });

        try {
            const firstScan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
            document.querySelector('p')!.textContent = '明日は書く。';

            await scanner.scanVisiblePage({ silent: true });
            expect(parseJapanese).toHaveBeenCalledTimes(1);

            firstParse.resolve([[]]);
            await firstScan;

            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2), { timeout: 5_000 });
            expect(parseJapanese.mock.calls[1]?.[0]).toEqual(['明日は書く。']);

            secondParse.resolve([[]]);
            await new Promise(resolve => window.setTimeout(resolve, 0));
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('cancels a coalesced scan that was queued for the next scheduler turn', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = '<p>今日は読む。</p>';
        const firstParse = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => firstParse.promise);
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            const firstScan = scanner.scanVisiblePage({ silent: true });
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
            await scanner.scanVisiblePage({ silent: true });

            firstParse.resolve([[]]);
            await firstScan;
            scanner.cancelVisiblePageScan();
            await new Promise(resolve => window.setTimeout(resolve, 10));

            expect(parseJapanese).toHaveBeenCalledTimes(1);
        } finally {
            scanner.destroy();
            restoreRects();
            document.body.innerHTML = '';
        }
    });
});

function mockVisibleElementRects(): () => void {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        top: 0,
        right: 100,
        bottom: 20,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect);
    return () => {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
}

function mockOverflow(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function testToken(sentence: string, spelling: string, start: number, end: number): JPDBToken {
    return {
        card: {
            vid: -start - 1,
            sid: -start - 1,
            rid: 0,
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
        },
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence,
    };
}

function tokensForFormControlText(text: string): JPDBToken[] {
    return ['表示順', '日本語', '単語'].flatMap(spelling => {
        const start = text.indexOf(spelling);
        return start >= 0 ? [testToken(text, spelling, start, start + spelling.length)] : [];
    }).sort((left, right) => left.start - right.start);
}

function tokensForWikibooksProseText(text: string): JPDBToken[] {
    const readings = new Map([
        ['詳しい', 'くわしい'],
        ['編集', 'へんしゅう'],
        ['方法', 'ほうほう'],
        ['仕方', 'しかた'],
        ['新しい', 'あたらしい'],
        ['作り方', 'つくりかた'],
        ['説明', 'せつめい'],
        ['参考', 'さんこう'],
        ['練習', 'れんしゅう'],
        ['サンドボックス', 'サンドボックス'],
    ]);
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of readings) {
        const start = text.indexOf(surface);
        if (start >= 0) tokens.push(rubyToken(text, surface, reading, start, start + surface.length));
    }
    return tokens.sort((left, right) => left.start - right.start);
}

function stateToken(
    sentence: string,
    spelling: string,
    start: number,
    end: number,
    state: CardState,
    options: {
        vid: number;
        sid: number;
        source: JPDBToken['card']['source'];
        jitenWordId?: number;
        jitenReadingIndex?: number;
    },
): JPDBToken {
    const token = testToken(sentence, spelling, start, end);
    return {
        ...token,
        card: {
            ...token.card,
            vid: options.vid,
            sid: options.sid,
            cardState: [state],
            source: options.source,
            ...(options.jitenWordId !== undefined ? { jitenWordId: options.jitenWordId } : {}),
            ...(options.jitenReadingIndex !== undefined ? { jitenReadingIndex: options.jitenReadingIndex } : {}),
        },
    };
}

function jitenRubyStateToken(sentence: string, spelling: string, start: number, end: number, state: CardState): JPDBToken {
    const token = stateToken(sentence, spelling, start, end, state, {
        vid: 42,
        sid: 0,
        source: 'jiten',
        jitenWordId: 42,
        jitenReadingIndex: 0,
    });
    return {
        ...token,
        card: {
            ...token.card,
            reading: 'よむ',
            reviewSource: 'jiten-api',
        },
        rubies: [{ text: 'よむ', start, end, length: end - start }],
        pitchClass: 'heiban',
    };
}

function rubyToken(sentence: string, spelling: string, reading: string, start: number, end: number): JPDBToken {
    return {
        card: {
            vid: -start - 1,
            sid: -start - 1,
            rid: 0,
            spelling,
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: ['LH'],
            wordWithReading: null,
            source: 'fallback',
        },
        start,
        end,
        length: end - start,
        rubies: [{ text: reading, start, end, length: end - start }],
        pitchClass: 'heiban',
        sentence,
    };
}

function readingForText(text: string): string {
    return text === '青空' ? 'あおぞら' : 'にほんご';
}

function tokensForBloomeeLandingText(text: string): JPDBToken[] {
    const targets = [
        ['季節', 'きせつ'],
        ['お花', 'おはな'],
        ['飾れる', 'かざれる'],
        ['利用', 'りよう'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForBloomeeProductText(text: string): JPDBToken[] {
    const targets = [
        ['保有', 'ほゆう'],
        ['ポイント', 'ポイント'],
        ['お花', 'はな'],
        ['定期便', 'ていきびん'],
        ['購入履歴', 'こうにゅうりれき'],
        ['花瓶', 'かびん'],
        ['不要', 'ふよう'],
        ['バラ', 'バラ'],
        ['季節', 'きせつ'],
        ['アレンジメント', 'アレンジメント'],
        ['件', 'けん'],
        ['レビュー', 'レビュー'],
        ['一般価格', 'いっぱんかかく'],
        ['会員価格', 'かいいんかかく'],
        ['税込', 'ぜいこみ'],
        ['母', 'はは'],
        ['誕生日', 'たんじょうび'],
        ['大好き', 'だいすき'],
        ['喜んで', 'よろこんで'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForCompactMediaGridText(text: string): JPDBToken[] {
    const targets = [
        ['人妻', 'ひとづま'],
        ['温泉', 'おんせん'],
        ['旅行', 'りょこう'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForCompactBookCarouselText(text: string): JPDBToken[] {
    const targets = [
        ['日本語', 'にほんご'],
        ['漫画', 'まんが'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForCompactProductGalleryText(text: string): JPDBToken[] {
    const targets = [
        ['あなた達', 'あなたたち'],
        ['先生', 'せんせい'],
        ['無料', 'むりょう'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForComposerPlaceholderText(text: string): JPDBToken[] {
    const targets = [
        ['ヘンリー', 'ヘンリー'],
        ['久しぶり', 'ひさしぶり'],
        ['質問', 'しつもん'],
        ['チャット', 'チャット'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForCompactFooterText(text: string): JPDBToken[] {
    const targets = [
        ['共有', 'きょうゆう'],
        ['制限', 'せいげん'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForConstrainedNotificationText(text: string): JPDBToken[] {
    const targets = [
        ['メモリ', 'メモリ'],
        ['回答', 'かいとう'],
        ['ユーザー', 'ユーザー'],
        ['適合', 'てきごう'],
        ['可能性', 'かのうせい'],
        ['アップグレード', 'アップグレード'],
        ['拡大', 'かくだい'],
        ['既存', 'きぞん'],
        ['管理', 'かんり'],
        ['使用', 'しよう'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForTravelDonkeyNavText(text: string): JPDBToken[] {
    const targets = [
        ['現地', 'げんち'],
        ['ツアー', 'ツアー'],
        ['首都', 'しゅと'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForHostedDocsText(text: string): JPDBToken[] {
    if (text === '使い始める') return [rubyToken(text, '使い', 'つかい', 0, 2), rubyToken(text, '始める', 'はじめる', 2, 5)];
    const tokens: JPDBToken[] = [];
    let index = text.indexOf('よむ');
    while (index >= 0) {
        tokens.push(testToken(text, 'よむ', index, index + 2));
        index = text.indexOf('よむ', index + 2);
    }
    return tokens;
}

function tokensForHostedCoverageText(text: string): JPDBToken[] {
    const targets = [
        ['日本語', 'にほんご'],
        ['読む', 'よむ'],
        ['青空', 'あおぞら'],
        ['下', 'した'],
        ['本', 'ほん'],
        ['次', 'つぎ'],
        ['手順', 'てじゅん'],
        ['辞書', 'じしょ'],
        ['追加', 'ついか'],
        ['設定', 'せってい'],
        ['開く', 'ひらく'],
        ['はじめる', ''],
        ['更新履歴', 'こうしんりれき'],
        ['今すぐ', 'いますぐ'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(rubyToken(text, surface, reading, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForYouTubeChromeText(text: string): JPDBToken[] {
    const targets = [
        ['すべて', ''],
        ['ホーム', ''],
        ['登録', 'とうろく'],
        ['チャンネル', ''],
        ['マイページ', ''],
        ['作成', 'さくせい'],
        ['検索', 'けんさく'],
        ['動画', 'どうが'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(reading
                ? rubyToken(text, surface, reading, index, index + surface.length)
                : testToken(text, surface, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function tokensForYouTubeWatchMetadataText(text: string): JPDBToken[] {
    const targets = [
        ['日本語', 'にほんご'],
        ['習慣', 'しゅうかん'],
        ['学ぶ', 'まなぶ'],
        ['チャンネル', ''],
        ['視聴', 'しちょう'],
        ['学習', 'がくしゅう'],
        ['昨日', 'きのう'],
        ['字幕', 'じまく'],
        ['行', 'ぎょう'],
        ['おすすめ', ''],
        ['講座', 'こうざ'],
        ['東京', 'とうきょう'],
        ['散歩', 'さんぽ'],
        ['春', 'はる'],
        ['コーデ', ''],
        ['動画', 'どうが'],
    ] as const;
    const tokens: JPDBToken[] = [];
    for (const [surface, reading] of targets) {
        let index = text.indexOf(surface);
        while (index >= 0) {
            tokens.push(reading
                ? rubyToken(text, surface, reading, index, index + surface.length)
                : testToken(text, surface, index, index + surface.length));
            index = text.indexOf(surface, index + surface.length);
        }
    }
    return tokens.sort((first, second) => first.start - second.start);
}

function readingForHostedCoverage(surface: string): string {
    return new Map([
        ['日本語', 'にほんご'],
        ['青空', 'あおぞら'],
        ['本', 'ほん'],
        ['辞書', 'じしょ'],
        ['設定', 'せってい'],
    ]).get(surface) ?? '';
}

describe('lossless visible-work scheduling', () => {
    // See the note in the VisiblePageScanner block: a loopback root matches the
    // hosted-docs profile, so pin these generic batching tests to a plain page.
    beforeEach(() => {
        window.history.pushState({}, '', '/reading/');
    });

    it('finishes an in-flight scan before coalescing a newer scan request', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        let resolveFirst: ((value: JPDBToken[][]) => void) | undefined;
        let call = 0;
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => {
            call += 1;
            if (call === 1) {
                return await new Promise<JPDBToken[][]>(resolve => {
                    resolveFirst = () => resolve(paragraphs.map(text => [testToken(text, text, 0, text.length)]));
                });
            }
            return paragraphs.map(text => [testToken(text, text, 0, text.length)]);
        });
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            const first = scanner.scanVisiblePage({ silent: true });
            // Collection is cooperatively chunked (perf item 4), so the first
            // parse can start a few scheduler turns in. Wait for batch 1 to
            // actually be parsing before landing the newer request — this test
            // pins the abort-BETWEEN-BATCHES contract, not collection timing
            // (an abort during collection is strictly earlier and cheaper).
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1), { timeout: 15_000 });
            // A newer request lands while batch 1 is parsing. It must queue a
            // trailing pass without invalidating the active generation.
            const second = scanner.scanVisiblePage({ silent: true });
            resolveFirst?.([]);
            await Promise.all([first, second]);
            for (let waits = 0; waits < 200 && document.querySelectorAll('.jpdb-reader-word').length < 170; waits += 1) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            expect(parseJapanese).toHaveBeenCalledTimes(3);
            expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(170);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    }, 20_000);

    it('drops targets that disappear before the next parse batch', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 95 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => {
            if (parseJapanese.mock.calls.length === 1) {
                Array.from(document.querySelectorAll('p')).slice(80).forEach(paragraph => paragraph.remove());
            }
            return paragraphs.map(() => [] as JPDBToken[]);
        });
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parseJapanese.mock.calls[0]?.[0]).toHaveLength(80);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('caps parse batches by text volume so huge paragraphs do not ride in one batch', async () => {
        const restoreRects = mockVisibleElementRects();
        const bigParagraph = `日本語${'の長文'.repeat(700)}`; // > 2000 chars each
        document.body.innerHTML = Array.from({ length: 7 }, () => `<p>${bigParagraph}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => paragraphs.map(() => [] as JPDBToken[]));
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const batchSizes = parseJapanese.mock.calls.map(callArgs => (callArgs[0] as string[]).length);
            expect(batchSizes.length).toBeGreaterThan(1);
            // Every batch respects the ~6k char budget (one oversized item may
            // ride alone, but never with companions that overflow it).
            for (const callArgs of parseJapanese.mock.calls) {
                const texts = callArgs[0] as string[];
                const chars = texts.reduce((sum, text) => sum + text.length, 0);
                if (texts.length > 1) expect(chars).toBeLessThanOrEqual(6000);
            }
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });
});

function textWithoutFurigana(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('rt,rp,.jpdb-reader-furi').forEach(node => node.remove());
    return clone.textContent ?? '';
}
