import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBToken } from '../../src/reader/types';
import { VisiblePageScanner } from '../../src/reader/visible-page-scanner';

describe('VisiblePageScanner', () => {
    it('parses large page scans in batches so the first targets can render sooner', async () => {
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
        document.body.innerHTML = Array.from({ length: 170 }, (_, index) => `<p>日本語の文${index}</p>`).join('');
        const parseJapanese = vi.fn(async (paragraphs: string[], _options?: unknown) => paragraphs.map(() => [] as JPDBToken[]));
        const pauseMutationObserver = vi.fn(callback => callback());
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese,
            pauseMutationObserver,
            preloadParsedTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            expect(parseJapanese.mock.calls.map(call => call[0])).toHaveLength(3);
            expect(parseJapanese.mock.calls[0]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[1]?.[0]).toHaveLength(80);
            expect(parseJapanese.mock.calls[2]?.[0]).toHaveLength(10);
            expect(parseJapanese.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, includeLocalPitch: false });
            expect(pauseMutationObserver).toHaveBeenCalledTimes(11);
        } finally {
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            document.body.innerHTML = '';
        }
    });

    it('skips stale target writes when visible text changes while parsing', async () => {
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
        document.body.innerHTML = '<p>日本語の文です。</p>';
        const parsed = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese,
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
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
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            document.body.innerHTML = '';
        }
    });

    it('enables segmented fallback for hosted Try Me text when no dictionary data is available', async () => {
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
        window.history.pushState({}, '', '/yomu-reader/');
        const heading = '青空の下で日本語を読む';
        document.body.innerHTML = `
            <main data-yomu-demo-lookup>
                <h3>${heading}</h3>
                <p>今日は静かな喫茶店で新しい本を読みました。</p>
            </main>
        `;
        const parseJapanese = vi.fn(async (paragraphs: string[], options?: { allowSegmentedFallback?: boolean }) => {
            expect(options?.allowSegmentedFallback).toBe(true);
            return paragraphs.map(text => text === heading ? [testToken(text, '下', 3, 4)] : []);
        });
        const scanner = new VisiblePageScanner({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false }),
            parseJapanese,
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
        });

        try {
            await scanner.scanVisiblePage({ silent: true });

            const words = [...document.querySelectorAll<HTMLElement>('[data-yomu-demo-lookup] .jpdb-reader-word')];
            expect(words.map(word => word.textContent)).toContain('下');
            const down = words.find(word => word.textContent === '下');
            expect(down?.dataset.expression).toBe('下');
            expect(down?.classList.contains('jpdb-not-in-deck')).toBe(true);
            expect(down?.tabIndex).toBe(0);
        } finally {
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            window.history.pushState({}, '', '/');
            document.body.innerHTML = '';
        }
    });

    it('skips late target writes after the scanner is destroyed', async () => {
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
        document.body.innerHTML = '<p>日本語の文です。</p>';
        const parsed = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const preloadParsedTokens = vi.fn();
        const enrichPitchWords = vi.fn();
        const enrichAnkiWords = vi.fn();
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese,
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens,
            enrichPitchWords,
            enrichAnkiWords,
            toast: vi.fn(),
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
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            document.body.innerHTML = '';
        }
    });

    it('runs one pending visible scan after an in-flight scan finishes', async () => {
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
        document.body.innerHTML = '<p>今日は読む。</p>';
        const firstParse = deferred<JPDBToken[][]>();
        const secondParse = deferred<JPDBToken[][]>();
        const parseJapanese = vi.fn()
            .mockImplementationOnce(() => firstParse.promise)
            .mockImplementationOnce(() => secondParse.promise);
        const scanner = new VisiblePageScanner({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese,
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            toast: vi.fn(),
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
            HTMLElement.prototype.getBoundingClientRect = originalRect;
            document.body.innerHTML = '';
        }
    });
});

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
