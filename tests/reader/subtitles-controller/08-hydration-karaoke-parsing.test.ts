import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubtitleParseOptions } from '../../../src/reader/subtitles/subtitle-parse-policy';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS,
    controllerInternals,
    createInstalledSubtitleController,
    setupTranscriptCueController,
    deferred,
    makeSubtitleToken,
    SubtitlePlayerController,
} from './fixtures';
import type {
    JPDBToken,
    ReaderSettings,
    SubtitleParsedHtmlCache,
} from './fixtures';

function subtitleParseCacheKey(text: string, settings: ReaderSettings): string {
    const controller = new SubtitlePlayerController({
        getSettings: () => DEFAULT_SETTINGS,
        parseJapanese: async () => [],
        onSettingsChange: () => undefined,
    });
    return controllerInternals<{
        parseCacheKey: (value: string, valueSettings: ReaderSettings) => string;
    }>(controller).parseCacheKey(text, settings);
}

describe('SubtitlePlayerController — transcript hydration, karaoke & authoritative parsing', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
        document.documentElement.classList.remove(
            'jpdb-subtitle-native-captions-suppressed',
            'jpdb-subtitle-yomu-captions-active',
        );
    });

    it('hydrates transcript rows with parsed subtitle words when the lines panel renders', async () => {
        vi.useFakeTimers();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const token: JPDBToken = {
                card: {
                    vid: 1,
                    sid: 2,
                    rid: 3,
                    spelling: '読む',
                    reading: 'よむ',
                    frequencyRank: null,
                    partOfSpeech: [],
                    meanings: [],
                    cardState: ['known'],
                    pitchAccent: [],
                    wordWithReading: null,
                },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
                pitchClass: 'heiban',
                sentence: '読む',
            };
            const parseJapanese = vi.fn(async () => [token]);
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const { internals } = setupTranscriptCueController([cue], {
                hooks: { parseJapanese },
                selectedTrackId: 'file-primary',
                settings: {
                    subtitleTranscriptAutoScroll: false,
                    apiKey: 'test-key',
                    furiganaMode: 'all',
                },
            });

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).toBe('読む');

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(parseJapanese).toHaveBeenCalledWith('読む', AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
            expect(row?.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('hydrates visible transcript rows with reader words when a token spans adjacent cues', async () => {
        vi.useFakeTimers();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const cues = [
                { start: 0, end: 1, text: '大', transcriptEligible: true },
                { start: 1, end: 2, text: '学', transcriptEligible: true },
            ];
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => text === '大学'
                ? [makeSubtitleToken('大学', {
                    cardState: ['known'],
                    pitchClass: 'heiban',
                    reading: 'だいがく',
                    rubies: [{ start: 0, end: 2, length: 2, text: 'だいがく' }],
                })]
                : []));
            const { internals } = setupTranscriptCueController(cues, {
                hooks: { parseJapaneseBatch },
                selectedTrackId: 'file-primary',
                settings: {
                    subtitleTranscriptAutoScroll: false,
                    apiKey: 'test-key',
                    furiganaMode: 'all',
                },
            });

            internals.openLinesPanel();
            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            const rows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-row-text'));
            expect(parseJapaneseBatch.mock.calls.flatMap(call => call[0] as string[])).toContain('大学');
            expect(rows).toHaveLength(2);
            for (const row of rows) {
                expect(row.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
                expect(row.querySelector('.jpdb-reader-furi')?.textContent).toBe('だいがく');
            }
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('refreshes cheap provisional transcript rows with enriched furigana when they become visible', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=provisional') as unknown as Location,
        });
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const cue = { start: 0, end: 2, text: '日本語', transcriptEligible: true };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                tokens[0].card.reading = 'にほんご';
                tokens[0].card.pitchAccent = ['LHHH'];
                tokens[0].rubies = [{ start: 0, end: 3, length: 3, text: 'にほんご' }];
                tokens[0].pitchClass = 'heiban';
            });
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean },
                ) => Promise<Array<{ html: string; provisional?: boolean }>>;
                htmlCache: SubtitleParsedHtmlCache;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: {
                    subtitleTranscriptAutoScroll: false,
                    apiKey: '',
                    jitenApiKey: '',
                    localDictionariesEnabled: false,
                    furiganaMode: 'all',
                },
            });
            const key = internals.parseCacheKey('日本語', settings);

            await internals.parseCueHtmlBatch(['日本語'], settings, { enrichBeforeRender: false });
            expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-word');
            expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).not.toContain('jpdb-reader-furi');

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).not.toContain('jpdb-reader-furi');

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            expect(parseJapaneseBatch).toHaveBeenCalledTimes(2);
            expect(beforeRenderTokens).toHaveBeenCalledTimes(1);
            await vi.waitFor(() => {
                expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word.jpdb-pitch-heiban')).not.toBeNull();
            });
            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(row?.querySelector('.jpdb-reader-word.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('にほんご');
            expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-furi');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('returns canonical enriched html to a late transcript warmup instead of repainting partial furigana', async () => {
        const cue = { start: 0, end: 2, text: '悪口', transcriptEligible: true };
        const cheapParse = deferred<JPDBToken[]>();
        const enrichedParse = deferred<JPDBToken[]>();
        const parseJapanese = vi.fn<[string, SubtitleParseOptions?], Promise<JPDBToken[]>>()
            .mockImplementationOnce(() => cheapParse.promise)
            .mockImplementationOnce(() => enrichedParse.promise);
        const { settings, internals } = setupTranscriptCueController<typeof cue, {
            parseProvisionalCueHtml: (
                text: string,
                settings: ReaderSettings,
                key: string,
                options: {
                    authoritativeUpgrade?: boolean;
                    enrichBeforeRender?: boolean;
                    refreshProvisional?: boolean;
                    requireEnrichedProvisional?: boolean;
                },
            ) => Promise<string>;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            hydrateTranscriptRows: (preferredIndex: number) => Promise<void>;
            scheduleTranscriptCacheWarmup: () => void;
            transcriptPanel: HTMLElement;
            updateTranscriptRowsForParseKey: (
                key: string,
                html: string,
                options: { provisional?: boolean; refreshProvisional?: boolean },
            ) => void;
        }>([cue], {
            hooks: { parseJapanese },
            selectedTrackId: 'youtube-0',
            settings: {
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
                furiganaMode: 'all',
            },
        });
        internals.hydrateTranscriptRows = async () => undefined;
        internals.scheduleTranscriptCacheWarmup = () => undefined;
        internals.openLinesPanel();
        const key = internals.parseCacheKey(cue.text, settings);
        const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!;

        const cheapResult = internals.parseProvisionalCueHtml(cue.text, settings, key, {
            authoritativeUpgrade: false,
            enrichBeforeRender: false,
        });
        await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
        const enrichedResult = internals.parseProvisionalCueHtml(cue.text, settings, key, {
            authoritativeUpgrade: false,
            enrichBeforeRender: true,
            refreshProvisional: true,
            requireEnrichedProvisional: true,
        });
        await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2));

        enrichedParse.resolve([
            makeSubtitleToken('悪口', {
                reading: 'わるぐち',
                rubies: [{ start: 0, end: 2, length: 2, text: 'わるぐち' }],
            }),
        ]);
        const enriched = await enrichedResult;
        internals.updateTranscriptRowsForParseKey(key, enriched, {
            provisional: true,
            refreshProvisional: true,
        });
        expect(row.querySelector('.jpdb-reader-furi')?.textContent).toBe('わるぐち');

        cheapParse.resolve([makeSubtitleToken('悪口')]);
        const late = await cheapResult;
        expect(late).toBe(enriched);
        internals.updateTranscriptRowsForParseKey(key, late, {
            provisional: true,
            refreshProvisional: true,
        });

        expect(row.dataset.parsedKey).toBe(key);
        expect(row.querySelector('.jpdb-reader-furi')?.textContent).toBe('わるぐち');
    });

    it('leaves a keyless cue re-hydratable while a fallback kanji word still lacks furigana, then marks it enriched once the reading resolves', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=enrich-gate') as unknown as Location,
        });
        try {
            const cue = { start: 0, end: 2, text: '戦う', transcriptEligible: true };
            // The local tokenizer returns 戦う as an unresolved fallback word
            // (no reading): furigana depends on the public lookup resolving it.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => {
                const token = makeSubtitleToken(text);
                token.card.source = 'fallback';
                return [token];
            }));
            let resolveReading = false;
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                if (!resolveReading) return; // first pass: public lookup misses 戦う
                tokens[0].card.reading = 'たたかう';
                tokens[0].rubies = [{ start: 0, end: 2, length: 2, text: 'たたかう' }];
            });
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean; refreshProvisional?: boolean },
                ) => Promise<Array<{ html: string; provisional?: boolean }>>;
                htmlCache: SubtitleParsedHtmlCache;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: { subtitleTranscriptAutoScroll: false, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
            });
            const key = internals.parseCacheKey('戦う', settings);

            // First enrichment leaves 戦う without furigana — the cue must NOT be
            // marked enriched, so a later hydration pass (e.g. after orientation)
            // can retry instead of freezing the missing ruby forever.
            await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
            expect(internals.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(false);

            // The retry resolves the reading: now the cue is fully enriched and
            // becomes sticky.
            resolveReading = true;
            await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
            expect(internals.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(true);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('paints partially-enriched provisional rows immediately instead of leaving visible lines bare while one fallback word is unresolved', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=partial-enrich') as unknown as Location,
        });
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;
        try {
            const cue = { start: 0, end: 2, text: '戦う', transcriptEligible: true };
            // The local tokenizer returns 戦う as an unresolved fallback word and
            // the public lookup never resolves it: the cue can never become
            // fully enriched, but its provisional html (word state + pitch
            // colour) must still reach the visible row.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => {
                const token = makeSubtitleToken(text, { pitchClass: 'heiban' });
                token.card.source = 'fallback';
                return [token];
            }));
            const beforeRenderTokens = vi.fn(async () => undefined);
            const { internals } = setupTranscriptCueController<typeof cue, {
                hydrateTranscriptRows: (preferredIndex: number) => Promise<void>;
                scheduleTranscriptCacheWarmup: () => void;
                htmlCache: SubtitleParsedHtmlCache;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: { subtitleTranscriptAutoScroll: false, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
            });
            // Isolate the hydration path: the background warmup can also paint
            // rows and would mask a hydration drop.
            internals.scheduleTranscriptCacheWarmup = () => undefined;

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).toBe('戦う');
            await internals.hydrateTranscriptRows(0);

            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(row?.querySelector('.jpdb-reader-word.jpdb-pitch-heiban')).not.toBeNull();
            // The row stays re-hydratable so later passes keep improving it.
            expect(row?.dataset.parsedProvisional).toBe('true');
            expect(internals.htmlCache.enrichedProvisionalParsedHtmlKeys.size).toBe(0);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
            vi.useRealTimers();
        }
    });

    it('stops re-hydrating a permanently-unresolvable fallback word after the retry cap so it settles instead of re-requesting forever', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=enrich-cap') as unknown as Location,
        });
        try {
            const cue = { start: 0, end: 2, text: '戦う', transcriptEligible: true };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => {
                const token = makeSubtitleToken(text);
                token.card.source = 'fallback';
                return [token];
            }));
            // Public lookup never resolves 戦う (genuinely absent from Jiten).
            const beforeRenderTokens = vi.fn(async () => undefined);
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean; refreshProvisional?: boolean },
                ) => Promise<unknown>;
                htmlCache: SubtitleParsedHtmlCache;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: { subtitleTranscriptAutoScroll: false, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
            });
            const key = internals.parseCacheKey('戦う', settings);

            // Each hydration pass re-attempts; the cue stays re-hydratable for a
            // bounded number of attempts, then settles to enriched (bare) so it
            // is no longer re-parsed/re-looked-up on every tick.
            for (let attempt = 0; attempt < 5; attempt++) {
                await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
                expect(internals.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(false);
            }
            await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
            expect(internals.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(true);
            expect(internals.htmlCache.provisionalParsedHtmlCache.has(key)).toBe(true);
            expect(Object.keys(sessionStorage).some(storageKey => storageKey.startsWith('yomu:subtitle-parse:v4:'))).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('updates transcript rows through the parse-key index instead of scanning every row', () => {
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { settings, internals } = setupTranscriptCueController<typeof cue, {
            parseCacheKey: (text: string, settings: typeof DEFAULT_SETTINGS) => string;
            updateTranscriptRowsForParseKey(key: string, html: string): void;
        }>([cue], {
            selectedTrackId: 'file-primary',
            settings: {
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
            },
        });

        internals.openLinesPanel();
        const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
        const originalQuerySelectorAll = panel.querySelectorAll.bind(panel);
        const querySelectorAll = vi.spyOn(panel, 'querySelectorAll');
        querySelectorAll.mockImplementation(((selector: string) => {
            if (selector === '[data-transcript-text]' || selector === '[data-transcript-text][data-parse-key]') {
                throw new Error('unexpected full transcript scan');
            }
            return originalQuerySelectorAll(selector);
        }) as typeof panel.querySelectorAll);

        const key = internals.parseCacheKey('読む', settings);
        internals.updateTranscriptRowsForParseKey(key, '<span class="jpdb-reader-word jpdb-known">読む</span>');

        expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word')?.textContent).toBe('読む');
        expect(querySelectorAll).not.toHaveBeenCalledWith('[data-transcript-text]');
    });

    it('uses visible word surface text for parsed subtitle karaoke timing', () => {
        const { controller } = createInstalledSubtitleController();
        try {
            const subtitle = document.querySelector<HTMLElement>('.jpdb-subtitle-lines')!;
            subtitle.innerHTML = `
                <div class="jpdb-subtitle-primary">
                    <span class="jpdb-reader-word">読<rt>よ</rt>む</span><span class="jpdb-reader-word">今日</span>
                </div>
            `;
            const cue = {
                start: 0,
                end: 3,
                text: '読む今日',
                words: [
                    { text: '読む', start: 0, end: 1 },
                    { text: '今日', start: 1, end: 2 },
                ],
                wordTimingsExact: true,
                transcriptEligible: true,
            };

            controllerInternals<{
                karaokeSampler: { applyKaraokeStateToPrimary: (cueArg: unknown, time: number) => void };
            }>(controller).karaokeSampler.applyKaraokeStateToPrimary(cue, 1.2);

            const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word'));
            expect(words[0]?.classList.contains('jpdb-subtitle-word-spoken')).toBe(true);
            expect(words[1]?.classList.contains('jpdb-subtitle-word-current')).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('applies karaoke state after parsed subtitle replacement', () => {
        let controller: SubtitlePlayerController | undefined;
        try {
            const cue = {
                start: 1,
                end: 4,
                text: '今日読む',
                words: [
                    { text: '今日', start: 1, end: 2 },
                    { text: '読む', start: 2, end: 4 },
                ],
                wordTimingsExact: true,
                transcriptEligible: true,
            };
            const setup = setupTranscriptCueController<typeof cue, {
                subtitleEl: HTMLElement;
                parseCacheKey(text: string, settings: ReaderSettings): string;
                htmlCache: SubtitleParsedHtmlCache;
                render(): void;
            }>([cue], {
                currentTime: 1.5,
                selectedTrackId: 'youtube-0',
                settings: {
                    subtitleKaraokeMode: true,
                    apiKey: 'test-key',
                },
            });
            controller = setup.controller;
            const { internals, settings } = setup;
            internals.htmlCache.parsedHtmlCache.set(
                internals.parseCacheKey(cue.text, settings),
                '<span class="jpdb-reader-word jpdb-pitch-heiban">今日</span><span class="jpdb-reader-word jpdb-pitch-odaka">読む</span>',
            );
            internals.render();

            const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word'));
            expect(words[0]?.textContent).toContain('今日');
            expect(words[1]?.textContent).toContain('読む');
            expect(words[0]?.classList.contains('jpdb-subtitle-word-current')).toBe(true);
            expect(words[1]?.classList.contains('jpdb-subtitle-word-pending')).toBe(true);
        } finally {
            controller?.destroy();
        }
    });

    it('keeps cached provisional subtitle hidden until ruby and pitch are enriched for the first primary paint', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const parseJapanese = vi.fn(async () => []);
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                htmlCache: SubtitleParsedHtmlCache;
                render: () => void;
            }>([cue], {
                hooks: { parseJapanese },
                selectedTrackId: 'youtube-0',
                settings: {
                    apiKey: '',
                    jitenApiKey: '',
                    subtitleKaraokeMode: false,
                },
            });
            const key = internals.parseCacheKey('読む', settings);
            internals.htmlCache.provisionalParsedHtmlCache.set(
                key,
                '<span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi"><ruby><span class="jpdb-reader-ruby-base">読</span><rt class="jpdb-reader-furi">よ</rt></ruby>む</span>',
            );

            internals.render();
            expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).toBeNull();

            internals.htmlCache.enrichedProvisionalParsedHtmlKeys.add(key);
            internals.render();

            const word = document.querySelector<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word')!;
            expect(word).not.toBeNull();
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(word.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parseJapanese).toHaveBeenCalledWith('読む', {
                allowSegmentedFallback: true,
                includeLocalPitch: true,
                skipJpdb: true,
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('makes annotations-off captions plain immediately and rejects late parse work', async () => {
        const parsed = deferred<JPDBToken[]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const beforeRenderTokens = vi.fn(async () => undefined);
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const initialSettings: Partial<ReaderSettings> = {
            annotationsPaused: false,
            subtitleTranscriptAutoScroll: false,
        };
        const { controller, settings } = createInstalledSubtitleController(initialSettings, { parseJapanese, beforeRenderTokens });
        const internals = controllerInternals<{
            currentCue: typeof cue;
            cues: Array<typeof cue>;
        }>(controller);

        try {
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            // The parser owns the final shape of this cue, so a cache miss has
            // no paintable primary frame yet. In particular, the final words
            // are not exposed plain and then decorated later.
            expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('');

            settings.annotationsPaused = true;
            controller.refresh();

            const primary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary')!;
            expect(primary.textContent).toBe('読む');
            expect(primary.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(primary.querySelector('.jpdb-reader-word')).toBeNull();
            expect(document.querySelector('.jpdb-subtitle-player')?.classList.contains('jpdb-subtitle-annotations-paused')).toBe(true);
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-annotations-paused')).toBe(true);

            parsed.resolve([makeSubtitleToken('読む', { reading: 'よむ' })]);
            await Promise.resolve();
            await Promise.resolve();

            expect(beforeRenderTokens).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).toBeNull();

            parseJapanese.mockClear();
            internals.currentCue = { ...cue, text: '見る' };
            controller.refresh();
            expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('見る');
            expect(parseJapanese).not.toHaveBeenCalled();

            settings.annotationsPaused = false;
            controller.refresh();
            expect(document.querySelector('.jpdb-subtitle-player')?.classList.contains('jpdb-subtitle-annotations-paused')).toBe(false);
            expect(document.querySelector('.jpdb-subtitle-list')?.classList.contains('jpdb-subtitle-annotations-paused')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    const nativeVisualCommitTrack = { mode: 'disabled' } as TextTrack;
    it.each([
        {
            surface: 'imported file',
            id: 'file-primary',
            kind: 'file' as const,
            pageUrl: 'https://example.test/video',
            track: undefined,
            expectPendingOwner: (): void => undefined,
            expectCommittedOwner: (): void => undefined,
            expectReleasedOwner: (): void => undefined,
        },
        {
            surface: 'native text track',
            id: 'native-primary',
            kind: 'native' as const,
            pageUrl: 'https://example.test/video',
            track: nativeVisualCommitTrack,
            expectPendingOwner: (): void => { expect(nativeVisualCommitTrack.mode).toBe('showing'); },
            expectCommittedOwner: (): void => { expect(nativeVisualCommitTrack.mode).toBe('hidden'); },
            expectReleasedOwner: (): void => { expect(nativeVisualCommitTrack.mode).toBe('disabled'); },
        },
        {
            surface: 'YouTube cue stream',
            id: 'youtube-primary',
            kind: 'youtube' as const,
            pageUrl: 'https://www.youtube.com/watch?v=visual-commit',
            track: undefined,
            expectPendingOwner: (): void => {
                expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(false);
            },
            expectCommittedOwner: (): void => {
                expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(true);
            },
            expectReleasedOwner: (): void => {
                expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(false);
            },
        },
    ])('publishes the first $surface frame only after async annotation enrichment settles', async surface => {
        const { id, kind, pageUrl, track, expectPendingOwner, expectCommittedOwner, expectReleasedOwner } = surface;
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL(pageUrl) as unknown as Location,
        });
        const parsed = deferred<JPDBToken[]>();
        const enrichment = deferred<void>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const beforeRenderTokens = vi.fn(() => enrichment.promise);
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { controller, internals } = setupTranscriptCueController<typeof cue, {
            render: () => void;
            setNativeTrackModes: () => void;
            subtitleEl: HTMLElement;
            tracks: Array<{
                id: string;
                label: string;
                kind: 'file' | 'native' | 'youtube';
                language: string;
                track?: TextTrack;
            }>;
        }>([cue], {
            hooks: { parseJapanese, beforeRenderTokens },
            selectedTrackId: id,
            settings: {
                apiKey: '',
                jitenApiKey: '',
                furiganaMode: 'all',
                showPitchAccent: true,
                subtitleKaraokeMode: false,
            },
        });
        internals.tracks = [{
            id,
            label: 'Japanese',
            kind,
            language: 'ja',
            track,
        }];
        const paintedFrames: string[] = [];
        const observer = new MutationObserver(() => {
            const primary = internals.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
            paintedFrames.push(primary?.innerHTML ?? '');
        });
        observer.observe(internals.subtitleEl, { childList: true, subtree: true });

        try {
            controller.refresh();
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('');
            expectPendingOwner();

            parsed.resolve([makeSubtitleToken('読む', {
                reading: 'よむ',
                pitchClass: 'heiban',
                rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
            })]);
            await vi.waitFor(() => expect(beforeRenderTokens).toHaveBeenCalledTimes(1));
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('');

            enrichment.resolve();
            await vi.waitFor(() => {
                expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();
            });
            await Promise.resolve();

            const primary = internals.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary')!;
            expect(primary.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
            expect(primary.querySelector('.jpdb-reader-word')?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            const visibleFrames = paintedFrames.filter(frame => frame.trim());
            expect(visibleFrames.length).toBeGreaterThan(0);
            expect(visibleFrames.every(frame => frame.includes('jpdb-reader-word') && frame.includes('jpdb-reader-furi'))).toBe(true);
            expectCommittedOwner();

            controller.destroy();
            expectReleasedOwner();
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(false);
            expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(false);
        } finally {
            observer.disconnect();
            controller.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('hands generic native captions back across a cache miss without switching off the host player', async () => {
        const secondParse = deferred<JPDBToken[]>();
        const parseJapanese = vi.fn(() => secondParse.promise);
        const firstCue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const secondCue = { start: 2, end: 4, text: '見る', transcriptEligible: true };
        const nativeTrack = { mode: 'showing' } as TextTrack;
        const { controller, internals, settings, video } = setupTranscriptCueController<typeof firstCue, {
            render: () => void;
            subtitleEl: HTMLElement;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
            tracks: Array<{
                id: string;
                label: string;
                kind: 'native' | 'remote';
                language?: string;
                track?: TextTrack;
                url?: string;
            }>;
            trackSelections: { begin: (role: 'primary') => number };
            loadTrackSelection: (request: {
                id: string;
                requestId: number;
                role: 'primary';
                transcriptEligible: true;
            }) => Promise<unknown>;
        }>([firstCue, secondCue], {
            hooks: { parseJapanese },
            selectedTrackId: 'native-primary',
            settings: { subtitleKaraokeMode: false },
        });
        internals.tracks = [{
            id: 'native-primary',
            label: 'Japanese',
            kind: 'native',
            language: 'ja',
            track: nativeTrack,
        }];
        internals.htmlCache.parsedHtmlCache.set(
            internals.parseCacheKey(firstCue.text, settings),
            '<span class="jpdb-reader-word jpdb-pitch-heiban">読む</span>',
        );
        const player = document.createElement('div');
        player.className = 'plyr';
        const captionButton = document.createElement('button');
        captionButton.dataset.plyr = 'captions';
        captionButton.setAttribute('aria-pressed', 'true');
        const captionButtonClick = vi.fn();
        captionButton.addEventListener('click', captionButtonClick);
        video.before(player);
        player.append(video, captionButton);
        const toggleCaptions = vi.fn();
        vi.stubGlobal('player', {
            media: video,
            captions: { active: true, toggled: true },
            currentTrack: 0,
            toggleCaptions,
        });
        const expectYomuOwnsNativeCaption = (): void => {
            expect(nativeTrack.mode).toBe('hidden');
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(true);
            expect(toggleCaptions).not.toHaveBeenCalled();
            expect(captionButton.getAttribute('aria-pressed')).toBe('true');
        };

        try {
            controller.refresh();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')?.textContent).toBe('読む');
            expectYomuOwnsNativeCaption();

            internals.currentCue = secondCue;
            controller.refresh();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('');
            expect(nativeTrack.mode).toBe('showing');
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(false);
            expect(toggleCaptions).not.toHaveBeenCalled();
            expect(captionButton.getAttribute('aria-pressed')).toBe('true');

            secondParse.resolve([makeSubtitleToken(secondCue.text, {
                reading: 'みる',
                pitchClass: 'heiban',
                rubies: [{ start: 0, end: 1, length: 1, text: 'み' }],
            })]);
            await vi.waitFor(() => {
                expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-furi')?.textContent).toBe('み');
            });
            expectYomuOwnsNativeCaption();

            const replacementAborted = vi.fn();
            const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                signal?.addEventListener('abort', () => {
                    replacementAborted();
                    reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            }));
            vi.stubGlobal('fetch', fetchMock);
            internals.tracks.push({
                id: 'remote-replacement',
                label: 'Delayed replacement',
                kind: 'remote',
                language: 'ja',
                url: new URL('/destroy-caption-replacement-p1.vtt', window.location.href).href,
            });
            const requestId = internals.trackSelections.begin('primary');
            const replacement = internals.loadTrackSelection({
                id: 'remote-replacement',
                requestId,
                role: 'primary',
                transcriptEligible: true,
            });
            await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
            document.documentElement.classList.add('jpdb-subtitle-yomu-captions-active');

            controller.destroy();
            await expect(replacement).resolves.toBeNull();

            expect(replacementAborted).toHaveBeenCalledTimes(1);
            expect(nativeTrack.mode).toBe('showing');
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(false);
            expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(false);
            expect(toggleCaptions).not.toHaveBeenCalled();
            expect(captionButtonClick).not.toHaveBeenCalled();
            expect(captionButton.getAttribute('aria-pressed')).toBe('true');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('discards an incomplete provisional cue and settles a rejected enrichment to one stable plain frame', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=rejected-enrichment') as unknown as Location,
        });
        const parsed = deferred<JPDBToken[]>();
        const parseJapanese = vi.fn(() => parsed.promise);
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { controller, internals, settings } = setupTranscriptCueController<typeof cue, {
            render: () => void;
            subtitleEl: HTMLElement;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
        }>([cue], { hooks: { parseJapanese }, selectedTrackId: 'youtube-primary' });
        const key = internals.parseCacheKey(cue.text, settings);
        internals.htmlCache.rememberParsedCueHtml(
            key,
            '<span class="jpdb-reader-word">読む</span>',
            [makeSubtitleToken('読む')],
            { provisional: true, enriched: false },
        );
        const paintedFrames: string[] = [];
        const observer = new MutationObserver(() => {
            const primary = internals.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
            if (primary?.innerHTML.trim()) paintedFrames.push(primary.innerHTML);
        });
        observer.observe(internals.subtitleEl, { childList: true, subtree: true });

        try {
            controller.refresh();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('');
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            parsed.reject(new Error('enrichment unavailable'));
            await vi.waitFor(() => expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('読む'));
            const committed = internals.subtitleEl.querySelector('.jpdb-subtitle-primary');
            expect(committed?.querySelector('.jpdb-reader-word')).toBeNull();
            expect(paintedFrames).toEqual(['読む']);
            expect(internals.htmlCache.provisionalParsedHtmlCache.has(key)).toBe(false);
            expect(internals.htmlCache.freshEmptyParsedHtml(key)).toBe('読む');

            internals.render();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBe(committed);
            expect(parseJapanese).toHaveBeenCalledTimes(1);
        } finally {
            observer.disconnect();
            controller.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('reconciles cached overlay and transcript markup after an annotations pause cycle', () => {
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const parsedHtml = '<span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban">読む</span>';
        const { controller, internals, settings } = setupTranscriptCueController<typeof cue, {
            htmlCache: SubtitleParsedHtmlCache;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
        }>([cue], {
            selectedTrackId: 'file-primary',
            settings: { annotationsPaused: false, subtitleTranscriptAutoScroll: false },
        });
        const key = internals.parseCacheKey(cue.text, settings);
        internals.htmlCache.parsedHtmlCache.set(key, parsedHtml);

        controller.refresh();
        internals.openLinesPanel();
        expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();
        expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word')).not.toBeNull();

        // ReaderApp's global annotation teardown replaces these descendants
        // before asking the subtitle controller to refresh.
        document.querySelectorAll('.jpdb-reader-word').forEach(word => word.replaceWith(word.textContent ?? ''));
        settings.annotationsPaused = true;
        controller.refresh();
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toBe(cue.text);
        expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word')).toBeNull();

        settings.annotationsPaused = false;
        controller.refresh();
        expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();
        expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word')).not.toBeNull();
    });

    it('does not rebuild the subtitle DOM when a render tick produces identical html', () => {
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { internals, settings } = setupTranscriptCueController<typeof cue, {
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
            render: () => void;
        }>([cue], {
            selectedTrackId: 'youtube-0',
            settings: { apiKey: 'test-key', subtitleKaraokeMode: false },
        });
        const key = internals.parseCacheKey(cue.text, settings);
        internals.htmlCache.parsedHtmlCache.set(key, '<span class="jpdb-reader-word">読む</span>');

        internals.render();
        const firstPrimary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        expect(firstPrimary).not.toBeNull();
        // Time-driven ticks re-render the same cue: the DOM nodes must be
        // reused, otherwise async word-state/pitch coloring is wiped each
        // tick (user-reported flicker).
        internals.render();
        const secondPrimary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        expect(secondPrimary).toBe(firstPrimary);
    });

    it('updates the active transcript line without replacing existing rows', () => {
        const cues = [
            { start: 0, end: 1, text: '一番', transcriptEligible: true },
            { start: 1, end: 2, text: '二番', transcriptEligible: true },
        ];
        const { internals, video } = setupTranscriptCueController<typeof cues[number], {
            renderTranscriptPanel(force?: boolean): void;
        }>(cues, {
            selectedTrackId: 'file-primary',
            settings: { subtitleTranscriptAutoScroll: false },
        });

        internals.openLinesPanel();
        const initialRows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
        expect(initialRows[0]?.classList.contains('active')).toBe(true);

        internals.currentCue = cues[1]!;
        video.currentTime = 1.2;
        internals.renderTranscriptPanel();

        const updatedRows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
        expect(updatedRows[0]).toBe(initialRows[0]);
        expect(updatedRows[1]).toBe(initialRows[1]);
        expect(updatedRows[0]?.classList.contains('active')).toBe(false);
        expect(updatedRows[1]?.classList.contains('active')).toBe(true);
    });

    it('keeps the open sidebar on the later adjacent cue when native cuechange reports the earlier cue', () => {
        const cues = [
            { start: 10, end: 13.12, text: '一番', transcriptEligible: true },
            { start: 13.1, end: 15, text: '二番', transcriptEligible: true },
        ];
        const nativeCues = cues.map(cue => ({
            startTime: cue.start,
            endTime: cue.end,
            text: cue.text,
        }));
        const track = {
            mode: 'hidden',
            cues: nativeCues,
            activeCues: [nativeCues[0]],
        } as unknown as TextTrack;
        const { internals, video } = setupTranscriptCueController<typeof cues[number], {
            currentCue: typeof cues[number] | undefined;
            renderTranscriptPanel(force?: boolean): void;
            tracks: Array<{ id: string; label: string; kind: 'native'; language: string; track: TextTrack }>;
            updateFromLoadedCues: () => void;
            updateFromNativeTrack: (track: TextTrack) => void;
        }>(cues, {
            currentCue: cues[0],
            currentTime: 13.055,
            selectedTrackId: 'native-0',
            settings: { subtitleTranscriptAutoScroll: true },
        });
        internals.tracks = [{
            id: 'native-0',
            label: 'Japanese captions',
            kind: 'native',
            language: 'ja',
            track,
        }];

        internals.openLinesPanel();
        video.currentTime = 13.055;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('二番');

        internals.updateFromNativeTrack(track);

        expect(internals.currentCue?.text).toBe('二番');
        const rows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
        expect(rows.filter(row => row.classList.contains('active'))).toEqual([rows[1]]);
    });

    it('does not re-scroll the transcript when the active line is unchanged', () => {
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const scrollSpy = vi.fn();
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (cb: FrameRequestCallback) => { cb(0); return 1; },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollSpy });

        try {
            const cue = { start: 0, end: 2, text: '同じ行', transcriptEligible: true };
            const { internals } = setupTranscriptCueController<typeof cue, {
                openLinesPanel(): void;
                renderTranscriptPanel(force?: boolean): void;
            }>([cue], {
                selectedTrackId: 'file-primary',
                settings: { subtitleTranscriptAutoScroll: true },
            });

            internals.openLinesPanel();
            scrollSpy.mockClear();
            const active = document.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active')!;

            internals.renderTranscriptPanel();

            const activeRows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active'));
            expect(activeRows).toEqual([active]);
            expect(scrollSpy).not.toHaveBeenCalled();
        } finally {
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
            else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
        }
    });

    it('does not cache empty subtitle parse results as parsed word HTML', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const token: JPDBToken = {
            card: {
                vid: 1,
                sid: 2,
                rid: 3,
                spelling: '読む',
                reading: 'よむ',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['known'],
                pitchAccent: [],
                wordWithReading: null,
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '読む',
        };
        const parseJapanese = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([token]);
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            parseCueHtml: (text: string, settings: ReaderSettings) => Promise<string>;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
        };
        const key = internals.parseCacheKey('読む', settings);

        await expect(internals.parseCueHtml('読む', settings)).resolves.toBe('読む');
        expect(internals.htmlCache.parsedHtmlCache.has(key)).toBe(false);
        await expect(internals.parseCueHtml('読む', settings)).resolves.toBe('読む');
        expect(parseJapanese).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2501);
        const parsed = await internals.parseCueHtml('読む', settings);
        expect(parsed).toContain('jpdb-reader-word jpdb-known jpdb-pitch-heiban');
        expect(internals.htmlCache.parsedHtmlCache.get(key)).toContain('jpdb-reader-word');
        expect(parseJapanese).toHaveBeenCalledTimes(2);
    });

    it('hydrates cache and transcript without changing an active cue after authoritative parsing finishes', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                // This test pins hydration, not furigana policy (UT-47 made
                // auto hide known-state ruby by default).
                furiganaMode: 'all' as const,
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const authoritative = deferred<JPDBToken[]>();
            const provisionalToken = makeSubtitleToken('読む', {
                cardState: ['not-in-deck'],
                vid: 1,
            });
            const finalToken = makeSubtitleToken('読む', {
                cardState: ['known'],
                pitchClass: 'heiban',
                reading: 'よむ',
                rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
                vid: 2,
            });
            const parseJapanese = vi.fn((_text: string, options?: { requireJpdb?: boolean; skipJpdb?: boolean }) => {
                if (options?.requireJpdb) return authoritative.promise;
                if (options?.skipJpdb) return Promise.resolve([provisionalToken]);
                return Promise.resolve([]);
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const internals = controller as unknown as {
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                panelMode: 'lines' | 'tracks';
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtml: (text: string, settings: ReaderSettings) => Promise<string>;
                htmlCache: SubtitleParsedHtmlCache;
                selectedTrackId: string;
                subtitleEl: HTMLElement;
                transcriptPanel: HTMLElement;
                video: HTMLVideoElement;
            };
            const key = internals.parseCacheKey('読む', settings);
            internals.video = document.createElement('video');
            internals.selectedTrackId = 'youtube-0';
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.panelMode = 'lines';
            internals.transcriptPanel.hidden = false;
            internals.subtitleEl.innerHTML = '<div class="jpdb-subtitle-primary">読む</div>';

            const rowText = document.createElement('strong');
            rowText.className = 'jpdb-subtitle-row-text';
            rowText.setAttribute('data-transcript-text', '');
            rowText.dataset.parseKey = key;
            rowText.textContent = '読む';
            internals.transcriptPanel.replaceChildren(rowText);

            const provisionalHtml = await internals.parseCueHtml('読む', settings);
            const pendingAuthoritativeHtml = internals.htmlCache.pendingParsedHtml.get(key);

            expect(parseJapanese).toHaveBeenNthCalledWith(1, '読む', { skipJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(parseJapanese).toHaveBeenNthCalledWith(2, '読む', { requireJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(provisionalHtml).toContain('jpdb-not-in-deck');
            expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).toContain('jpdb-not-in-deck');
            expect(pendingAuthoritativeHtml).toBeDefined();

            authoritative.resolve([finalToken]);
            await expect(pendingAuthoritativeHtml).resolves.toContain('jpdb-known jpdb-pitch-heiban');

            expect(internals.htmlCache.parsedHtmlCache.get(key)).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.provisionalParsedHtmlCache.has(key)).toBe(false);
            expect(rowText.dataset.parsedProvisional).toBeUndefined();
            expect(rowText.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(rowText.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
            expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).toBeNull();
            expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('読む');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('renders batched provisional transcript rows before scheduling authoritative upgrades', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=batch-provisional') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const authoritative = deferred<JPDBToken[][]>();
            const parseJapaneseBatch = vi.fn((texts: string[], options?: { requireJpdb?: boolean; skipJpdb?: boolean }) => {
                if (options?.requireJpdb) return authoritative.promise;
                if (options?.skipJpdb) return Promise.resolve(texts.map((text, index) => [makeSubtitleToken(text, { cardState: ['not-in-deck'], vid: index + 1 })]));
                return Promise.resolve(texts.map(() => []));
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                parseJapaneseBatch,
                onSettingsChange: () => undefined,
            });
            const internals = controller as unknown as {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtmlBatch: (texts: string[], settings: ReaderSettings) => Promise<Array<{ key: string; html: string; provisional?: boolean }>>;
                htmlCache: SubtitleParsedHtmlCache;
            };
            const firstKey = internals.parseCacheKey('一番', settings);

            const parsed = await internals.parseCueHtmlBatch(['一番', '二番'], settings);
            const pendingAuthoritativeHtml = internals.htmlCache.pendingParsedHtml.get(firstKey);

            expect(parseJapaneseBatch).toHaveBeenNthCalledWith(1, ['一番', '二番'], { skipJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(parseJapaneseBatch).toHaveBeenNthCalledWith(2, ['一番', '二番'], { requireJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(parsed.map(item => item.provisional)).toEqual([true, true]);
            expect(parsed[0]?.html).toContain('jpdb-not-in-deck');
            expect(internals.htmlCache.provisionalParsedHtmlCache.get(firstKey)).toContain('jpdb-not-in-deck');
            expect(pendingAuthoritativeHtml).toBeDefined();

            authoritative.resolve([
                [makeSubtitleToken('一番', { cardState: ['known'], pitchClass: 'heiban', vid: 10 })],
                [makeSubtitleToken('二番', { cardState: ['known'], pitchClass: 'heiban', vid: 11 })],
            ]);
            await expect(pendingAuthoritativeHtml).resolves.toContain('jpdb-known jpdb-pitch-heiban');

            expect(internals.htmlCache.parsedHtmlCache.get(firstKey)).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.provisionalParsedHtmlCache.has(firstKey)).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('uses strict authoritative parsing for credentialed enriched YouTube subtitle primary HTML', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=authoritative-primary') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const fallbackToken = makeSubtitleToken('読む', { cardState: ['not-in-deck'] });
            const authoritativeToken = makeSubtitleToken('読む', { cardState: ['known'], pitchClass: 'heiban', reading: 'よむ' });
            const parseJapanese = vi.fn((_text: string, options?: { requireJpdb?: boolean; skipJpdb?: boolean }) => {
                if (options?.requireJpdb) return Promise.resolve([authoritativeToken]);
                if (options?.skipJpdb) return Promise.resolve([fallbackToken]);
                return Promise.resolve([fallbackToken]);
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            const internals = controller as unknown as {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtml: (
                    text: string,
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean; requireEnrichedProvisional?: boolean },
                ) => Promise<string>;
                htmlCache: SubtitleParsedHtmlCache;
            };
            const key = internals.parseCacheKey('読む', settings);

            const html = await internals.parseCueHtml('読む', settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });

            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parseJapanese).toHaveBeenCalledWith('読む', { requireJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(html).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.parsedHtmlCache.get(key)).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.provisionalParsedHtmlCache.has(key)).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('uses one strict authoritative batch for credentialed enriched YouTube transcript rows', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=authoritative-batch') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const parseJapaneseBatch = vi.fn((texts: string[], options?: { requireJpdb?: boolean; skipJpdb?: boolean }) => {
                if (options?.requireJpdb) return Promise.resolve(texts.map((text, index) => [
                    makeSubtitleToken(text, { cardState: ['known'], pitchClass: 'heiban', vid: index + 10 }),
                ]));
                if (options?.skipJpdb) return Promise.resolve(texts.map((text, index) => [
                    makeSubtitleToken(text, { cardState: ['not-in-deck'], vid: index + 1 }),
                ]));
                return Promise.resolve(texts.map((text, index) => [
                    makeSubtitleToken(text, { cardState: ['not-in-deck'], vid: index + 1 }),
                ]));
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                parseJapaneseBatch,
                onSettingsChange: () => undefined,
            });
            const internals = controller as unknown as {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean; requireEnrichedProvisional?: boolean; refreshProvisional?: boolean },
                ) => Promise<Array<{ key: string; html: string; provisional?: boolean }>>;
                htmlCache: SubtitleParsedHtmlCache;
            };
            const firstKey = internals.parseCacheKey('一番', settings);

            const parsed = await internals.parseCueHtmlBatch(['一番', '二番'], settings, {
                enrichBeforeRender: true,
                requireEnrichedProvisional: true,
                refreshProvisional: true,
            });

            expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
            expect(parseJapaneseBatch).toHaveBeenCalledWith(['一番', '二番'], { requireJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(parsed.map(item => item.provisional)).toEqual([undefined, undefined]);
            expect(parsed[0]?.html).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.parsedHtmlCache.get(firstKey)).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.provisionalParsedHtmlCache.has(firstKey)).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('returns the latest keyed cache winner when another authoritative batch item resolves later', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const secondParse = deferred<JPDBToken[][]>();
        const parseJapaneseBatch = vi.fn((_texts: string[]) => secondParse.promise);
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            parseJapaneseBatch,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            parseCueHtmlBatch: (
                texts: string[],
                settings: ReaderSettings,
                options: { enrichBeforeRender: boolean; requireEnrichedProvisional: boolean },
            ) => Promise<Array<{ key: string; html: string; provisional?: boolean }>>;
            htmlCache: SubtitleParsedHtmlCache;
        };
        const firstKey = internals.parseCacheKey('一番', settings);
        const oldFirstHtml = '<span class="jpdb-reader-word">old first</span>';
        const latestFirstHtml = '<span class="jpdb-reader-word">latest first</span>';
        internals.htmlCache.parsedHtmlCache.set(firstKey, oldFirstHtml);

        const pending = internals.parseCueHtmlBatch(['一番', '二番'], settings, {
            enrichBeforeRender: true,
            requireEnrichedProvisional: true,
        });
        await vi.waitFor(() => expect(parseJapaneseBatch).toHaveBeenCalledTimes(1));
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['二番']);
        await Promise.resolve();
        internals.htmlCache.parsedHtmlCache.set(firstKey, latestFirstHtml);
        secondParse.resolve([[makeSubtitleToken('二番', { cardState: ['known'] })]]);

        const parsed = await pending;

        expect(parsed[0]).toEqual({ key: firstKey, html: latestFirstHtml });
        expect(parsed[1]?.html).toContain('jpdb-reader-word');
    });

    it('keeps an enriched provisional transcript row retryable when the authoritative batch is empty', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=authoritative-empty-provisional') as unknown as Location,
        });

        try {
            const cue = { start: 0, end: 2, text: '悪口', transcriptEligible: true };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(() => [] as JPDBToken[]));
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                htmlCache: SubtitleParsedHtmlCache;
                hydrateTranscriptRows: (preferredIndex: number) => Promise<void>;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                scheduleTranscriptCacheWarmup: () => void;
                scheduleTranscriptHydration: () => void;
            }>([cue], {
                hooks: { parseJapaneseBatch },
                selectedTrackId: 'youtube-0',
                settings: {
                    apiKey: 'test-key',
                    furiganaMode: 'all',
                    localDictionariesEnabled: false,
                    subtitleTranscriptAutoScroll: false,
                },
            });
            const key = internals.parseCacheKey(cue.text, settings);
            const provisionalHtml = [
                '<span class="jpdb-reader-word jpdb-reader-has-furi">',
                '<ruby><span class="jpdb-reader-ruby-base">悪口</span><rt class="jpdb-reader-furi">わるぐち</rt></ruby>',
                '</span>',
            ].join('');
            const provisionalToken = makeSubtitleToken(cue.text, {
                reading: 'わるぐち',
                rubies: [{ start: 0, end: 2, length: 2, text: 'わるぐち' }],
            });
            internals.htmlCache.rememberParsedCueHtml(key, provisionalHtml, [provisionalToken], {
                provisional: true,
                enriched: true,
            });
            // Drive hydration explicitly so transcript warmup cannot mask
            // whether the authoritative-empty result leaves this row retryable.
            internals.scheduleTranscriptHydration = () => undefined;
            internals.scheduleTranscriptCacheWarmup = () => undefined;
            internals.openLinesPanel();
            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!;
            expect(row.dataset.parsedProvisional).toBe('true');
            expect(row.querySelector('.jpdb-reader-furi')?.textContent).toBe('わるぐち');

            await internals.hydrateTranscriptRows(0);

            expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
            expect(row.dataset.parsedProvisional).toBe('true');
            expect(row.querySelector('.jpdb-reader-furi')?.textContent).toBe('わるぐち');

            // No authoritative HTML won, so the provisional marker must make
            // the next hydration retry instead of treating the row as final.
            await internals.hydrateTranscriptRows(0);
            expect(parseJapaneseBatch).toHaveBeenCalledTimes(2);
            expect(row.dataset.parsedProvisional).toBe('true');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('uses strict authoritative parsing for credentialed non-provisional transcript warmup', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=authoritative-warmup') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const parseJapaneseBatch = vi.fn((texts: string[], options?: { requireJpdb?: boolean }) => {
                if (options?.requireJpdb) return Promise.resolve(texts.map((text, index) => [
                    makeSubtitleToken(text, { cardState: ['known'], pitchClass: 'heiban', vid: index + 20 }),
                ]));
                return Promise.resolve(texts.map((text, index) => [
                    makeSubtitleToken(text, { cardState: ['not-in-deck'], vid: index + 1 }),
                ]));
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                parseJapaneseBatch,
                onSettingsChange: () => undefined,
            });
            const internals = controller as unknown as {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { allowProvisional?: boolean; enrichBeforeRender?: boolean },
                ) => Promise<Array<{ key: string; html: string; provisional?: boolean }>>;
                htmlCache: SubtitleParsedHtmlCache;
            };
            const key = internals.parseCacheKey('今日は読む', settings);

            const parsed = await internals.parseCueHtmlBatch(['今日は読む'], settings, {
                allowProvisional: false,
                enrichBeforeRender: true,
            });

            expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
            expect(parseJapaneseBatch).toHaveBeenCalledWith(['今日は読む'], { requireJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(parsed[0]?.provisional).toBeUndefined();
            expect(parsed[0]?.html).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.parsedHtmlCache.get(key)).toContain('jpdb-known jpdb-pitch-heiban');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('replaces fallback-poisoned credentialed subtitle parse cache entries with authoritative HTML', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=authoritative-cache') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const parseJapanese = vi.fn(async () => [
                makeSubtitleToken('読む', { cardState: ['known'], pitchClass: 'heiban', vid: 30 }),
            ]);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            const internals = controller as unknown as {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtml: (
                    text: string,
                    settings: ReaderSettings,
                    options?: { allowProvisional?: boolean; enrichBeforeRender?: boolean },
                ) => Promise<string>;
                htmlCache: SubtitleParsedHtmlCache;
            };
            const key = internals.parseCacheKey('読む', settings);
            internals.htmlCache.parsedHtmlCache.set(
                key,
                '<span class="jpdb-reader-word jpdb-not-in-deck fallback-not-in-deck jpdb-pitch-unknown" data-card-source="fallback">読む</span>',
            );

            const html = await internals.parseCueHtml('読む', settings, {
                allowProvisional: false,
                enrichBeforeRender: true,
            });

            expect(parseJapanese).toHaveBeenCalledWith('読む', { requireJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(html).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.htmlCache.parsedHtmlCache.get(key)).toContain('jpdb-known jpdb-pitch-heiban');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('notifies parsed subtitle tokens with the updated transcript row root', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const token = makeSubtitleToken('読む', { cardState: ['known'] });
        const afterParseTokens = vi.fn();
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            afterParseTokens,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            panelMode: 'lines' | 'tracks';
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
            transcriptPanel: HTMLElement;
            transcriptPanelClosing: boolean;
            updateTranscriptRowsForParseKey(key: string, html: string): void;
        };
        const key = internals.parseCacheKey('読む', settings);
        const rowText = document.createElement('strong');
        rowText.className = 'jpdb-subtitle-row-text';
        rowText.setAttribute('data-transcript-text', '');
        rowText.dataset.parseKey = key;
        rowText.textContent = '読む';
        const panel = document.createElement('div');
        panel.className = 'jpdb-subtitle-list';
        panel.append(rowText);
        document.body.append(panel);
        internals.panelMode = 'lines';
        internals.transcriptPanel = panel;
        internals.transcriptPanelClosing = false;
        internals.htmlCache.parsedTokenCache.set(key, [token]);

        try {
            internals.updateTranscriptRowsForParseKey(
                key,
                '<span class="jpdb-reader-word jpdb-known" data-vid="1" data-sid="1">読む</span>',
            );

            expect(afterParseTokens).toHaveBeenCalledWith([token], [rowText]);
        } finally {
            panel.remove();
        }
    });

    it('invalidates subtitle parse cache keys when the parser source changes', () => {
        const localEmpty = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: true,
            dictionaryPreferences: [],
        };
        const withApi = {
            ...localEmpty,
            apiKey: 'test-key',
        };
        const withDictionary = {
            ...localEmpty,
            dictionaryPreferences: [{
                name: 'Jitendex',
                alias: '',
                enabled: true,
                priority: 0,
            }],
        };

        expect(subtitleParseCacheKey('読む', localEmpty)).not.toBe(subtitleParseCacheKey('読む', withApi));
        expect(subtitleParseCacheKey('読む', localEmpty)).not.toBe(subtitleParseCacheKey('読む', withDictionary));
    });

    it('keys subtitle html by pitch visibility and hidden furigana state groups', () => {
        const visible = {
            ...DEFAULT_SETTINGS,
            showPitchAccent: true,
            furiganaHiddenStateGroups: ['known', 'learning'] as typeof DEFAULT_SETTINGS.furiganaHiddenStateGroups,
        };

        expect(subtitleParseCacheKey('読む', visible)).not.toBe(subtitleParseCacheKey('読む', {
            ...visible,
            showPitchAccent: false,
        }));
        expect(subtitleParseCacheKey('読む', visible)).not.toBe(subtitleParseCacheKey('読む', {
            ...visible,
            furiganaHiddenStateGroups: ['known'],
        }));
        expect(subtitleParseCacheKey('読む', visible)).toBe(subtitleParseCacheKey('読む', {
            ...visible,
            furiganaHiddenStateGroups: ['learning', 'known'],
        }));
    });
});
