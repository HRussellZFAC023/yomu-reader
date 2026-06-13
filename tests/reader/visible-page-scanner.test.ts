import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS: typeof BASE_DEFAULT_SETTINGS = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' };
import type { CardState, JPDBToken } from '../../src/reader/app/types';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';

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

describe('VisiblePageScanner', () => {
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
            for (let waits = 0; waits < 200 && parseJapanese.mock.calls.length < 3; waits += 1) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            for (let waits = 0; waits < 200 && pauseMutationObserver.mock.calls.length < 5; waits += 1) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            expect(parseJapanese.mock.calls.map(call => call[0])).toHaveLength(3);
            expect(parseJapanese.mock.calls[0]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[1]?.[0]).toHaveLength(40);
            expect(parseJapanese.mock.calls[2]?.[0]).toHaveLength(50);
            expect(parseJapanese.mock.calls[0]?.[1]).toEqual({
                jpdbTimeoutMs: 450,
                allowJpdbTimeoutFallback: true,
                includeLocalPitch: false,
                allowSegmentedFallback: true,
            });
            // Apply chunks are 48 targets wide so the first paint covers the
            // whole parsed batch instead of arriving in 16-item waves.
            expect(pauseMutationObserver).toHaveBeenCalledTimes(5);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

    it('does not continue draining full YouTube page scans after the first pass', async () => {
        const restoreRects = mockVisibleElementRects();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-watch-metadata>
                ${Array.from({ length: 170 }, (_, index) => `<button>日本語ボタン${index}</button>`).join('')}
            </ytd-watch-metadata>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [testToken(text, text, 0, text.length)]));
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            await scanner.scanVisiblePage({ silent: true });
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(parseJapanese.mock.calls.map(call => call[0].length)).toEqual([80, 40]);
        } finally {
            scanner.destroy();
            vi.unstubAllGlobals();
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

            expect(toast).toHaveBeenCalledWith('Coverage 67% known · 2/3 words · 1 new · 1 i+1');
            const insight = document.querySelector<HTMLElement>('[data-mining-insight="i-plus-one"]')!;
            expect(insight.textContent).toBe('本');
            expect(insight.dataset.cardSource).toBe('jiten');
            expect(insight.dataset.cardId).toBe('42');
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
            <main class="hosted-text-fixture">
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
            <main class="hosted-text-fixture">
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
                    <div class="vp-doc">
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

    it('renders Jiten status classes and hides known-status furigana during visible page scans', async () => {
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
            expect(word.classList.contains('jiten-young')).toBe(true);
            expect(word.dataset.cardSource).toBe('jiten');
            expect(word.dataset.cardState).toBe('young');
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
        const scanner = createVisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, furiganaMode: 'all' }),
            parseJapanese,
            prepareSubtitleTokensBeforeRender,
            beginAnkiWordEnrichment,
            prepareAnkiWordEnrichmentBeforeRender,
            enrichAnkiWords,
        });

        try {
            await scanner.scanAsbPlayerSubtitles();

            const word = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom .jpdb-reader-word')!;
            expect(order).toEqual(['prepare', 'prepare-anki', 'apply-anki']);
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
                jpdbTimeoutMs: 450,
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

            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2));
            expect(parseJapanese.mock.calls[1]?.[0]).toEqual(['明日は書く。']);

            secondParse.resolve([[]]);
            await new Promise(resolve => window.setTimeout(resolve, 0));
        } finally {
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(settle => { resolve = settle; });
    return { promise, resolve };
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

describe('abortable visible-work scheduling (P1)', () => {
    it('stops an in-flight scan between batches when a newer scan is requested', async () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        let resolveFirst: ((value: JPDBToken[][]) => void) | undefined;
        let call = 0;
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => {
            call += 1;
            if (call === 1) {
                return await new Promise<JPDBToken[][]>(resolve => { resolveFirst = () => resolve(paragraphs.map(() => [])); });
            }
            return paragraphs.map(text => [testToken(text, text, 0, text.length)]);
        });
        const scanner = createVisiblePageScanner({ parseJapanese });

        try {
            const first = scanner.scanVisiblePage({ silent: true });
            await Promise.resolve();
            // A newer request lands while batch 1 of the old scan is parsing.
            const second = scanner.scanVisiblePage({ silent: true });
            resolveFirst?.([]);
            await Promise.all([first, second]);
            // The queued rescan runs detached after a scheduler turn.
            for (let waits = 0; waits < 200 && parseJapanese.mock.calls.length < 4; waits += 1) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            // Old scan: 1 batch then aborted (stale generation); fresh scan
            // re-collects and parses all 3 batches => 4 total, not 6.
            expect(parseJapanese).toHaveBeenCalledTimes(4);
        } finally {
            restoreRects();
            document.body.innerHTML = '';
        }
    });

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
