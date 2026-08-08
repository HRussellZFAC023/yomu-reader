import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerWordSurfaceText } from '../../../src/reader/dom';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS,
    stubFullscreenElement,
    mockElementRect,
    makeSubtitleSettings,
    controllerInternals,
    createSubtitleController,
    installController,
    createInstalledSubtitleController,
    attachVideo,
    setupTranscriptCueController,
    deferred,
    pointerEvent,
    makeSubtitleToken,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';
import type {
    JPDBToken,
    ReaderSettings,
    SubtitleParsedHtmlCache,
} from './fixtures';

describe('SubtitlePlayerController — parse cache, warmup & seek', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('keeps parsed transcript cache entries for long tracks instead of evicting after 180 rows', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const { controller } = createSubtitleController(settings);
        const cues = Array.from({ length: 260 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `字幕${index}`,
            transcriptEligible: true,
        }));
        const internals = controllerInternals<{
            cues: typeof cues;
            htmlCache: SubtitleParsedHtmlCache;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
        }>(controller);
        internals.cues = cues;

        for (let index = 0; index < 240; index++) {
            internals.htmlCache.parsedHtmlCache.set(
                internals.parseCacheKey(`字幕${index}`, settings),
                `<span class="jpdb-reader-word">字幕${index}</span>`,
            );
        }

        internals.htmlCache.pruneParsedSubtitleCaches();

        expect(internals.htmlCache.parsedHtmlCache.size).toBe(240);
        expect(internals.htmlCache.parsedHtmlCache.has(internals.parseCacheKey('字幕0', settings))).toBe(true);
        expect(internals.htmlCache.parsedHtmlCache.has(internals.parseCacheKey('字幕239', settings))).toBe(true);
    });

    it('batches active subtitle warmup instead of parsing cues one by one', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const parseJapanese = vi.fn(async () => []);
        const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: unknown) => texts.map(() => [] as JPDBToken[]));
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese,
            parseJapaneseBatch,
            onSettingsChange: () => undefined,
        });
        const cues = [
            { start: 0, end: 1, text: '一番', transcriptEligible: true },
            { start: 1, end: 2, text: '二番', transcriptEligible: true },
            { start: 2, end: 3, text: '三番', transcriptEligible: true },
            { start: 3, end: 4, text: '四番', transcriptEligible: true },
        ];
        const internals = controller as unknown as {
            cues: typeof cues;
            currentCue: typeof cues[number];
            warmParseAroundActiveCue: () => void;
        };
        internals.cues = cues;
        internals.currentCue = cues[1]!;

        internals.warmParseAroundActiveCue();
        await Promise.resolve();
        await Promise.resolve();

        expect(parseJapanese).not.toHaveBeenCalled();
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['一番', '二番', '三番', '四番']);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual(AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
    });

    it('reserves the initial and immediately upcoming YouTube cues outside the enrichment batch tail', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=priority-next') as unknown as Location,
        });
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            };
            const parseJapanese = vi.fn(async (text: string) => [makeSubtitleToken(text)]);
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
            let releasePriorityEnrichment!: () => void;
            const priorityEnrichment = new Promise<void>(resolve => {
                releasePriorityEnrichment = resolve;
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                parseJapaneseBatch,
                beforeRenderTokens: vi.fn(async tokens => {
                    await priorityEnrichment;
                    for (const token of tokens) token.card.reading = 'かな';
                }),
                onSettingsChange: () => undefined,
            });
            const cues = [
                { start: 0, end: 1, text: '一番', transcriptEligible: true },
                { start: 1, end: 2, text: '申し訳ありません', transcriptEligible: true },
                { start: 2, end: 3, text: '三番', transcriptEligible: true },
            ];
            const internals = controller as unknown as {
                cues: typeof cues;
                currentCue?: typeof cues[number];
                selectedTrackId: string;
                warmParseAroundActiveCue: () => void;
                scheduleTranscriptCacheWarmup: () => void;
            };
            internals.cues = cues;
            internals.currentCue = undefined;
            internals.selectedTrackId = 'remote-priority-next';

            internals.warmParseAroundActiveCue();
            internals.scheduleTranscriptCacheWarmup();
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));

            expect(parseJapanese).toHaveBeenCalledWith('一番', {
                allowSegmentedFallback: true,
                includeLocalPitch: true,
                skipJpdb: true,
            });
            // Neither the overlay batch tail nor the hidden transcript cache
            // nor the successor may multiply public-detail concurrency while
            // the active first-paint cue is still enriching.
            expect(parseJapaneseBatch).not.toHaveBeenCalled();

            releasePriorityEnrichment();
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(2));
            expect(parseJapanese).toHaveBeenCalledWith('申し訳ありません', {
                allowSegmentedFallback: true,
                includeLocalPitch: true,
                skipJpdb: true,
            });
            await vi.waitFor(() => expect(parseJapaneseBatch).toHaveBeenCalled());
            expect(parseJapaneseBatch.mock.calls.map(call => call[0])).toEqual([
                ['三番'],
                ['一番申し訳ありません', '一番申し訳ありません三番', '申し訳ありません三番'],
            ]);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('serializes first-paint enrichment and keeps every reading when playback advances', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=first-paint-prewarm') as unknown as Location,
        });
        try {
            const reportedCue = '私も彼らの悪口を言いたくない';
            let releaseActiveEnrichment!: () => void;
            const activeEnrichment = new Promise<void>(resolve => {
                releaseActiveEnrichment = resolve;
            });
            let releaseSuccessorEnrichment!: () => void;
            const successorEnrichment = new Promise<void>(resolve => {
                releaseSuccessorEnrichment = resolve;
            });
            const settings = makeSubtitleSettings({
                apiKey: '',
                jitenApiKey: '',
                furiganaMode: 'all' as const,
                localDictionariesEnabled: false,
            });
            const cueToken = (
                surface: string,
                start: number,
                end: number,
                reading = '',
                ruby = reading ? { end, text: reading } : undefined,
            ): JPDBToken => {
                const token = makeSubtitleToken(surface, {
                    reading,
                    pitchClass: reading ? 'heiban' : '',
                    rubies: ruby ? [{ start, end: ruby.end, length: ruby.end - start, text: ruby.text }] : [],
                    vid: start + 1,
                });
                token.start = start;
                token.end = end;
                token.length = end - start;
                token.sentence = reportedCue;
                return token;
            };
            const successorTokens = [
                cueToken('私', 0, 1, 'わたし'),
                cueToken('も', 1, 2),
                cueToken('彼ら', 2, 4, 'かれら', { end: 3, text: 'かれ' }),
                cueToken('の', 4, 5),
                cueToken('悪口', 5, 7, 'わるぐち'),
                cueToken('を', 7, 8),
                cueToken('言いたくない', 8, 14, 'いいたくない', { end: 9, text: 'い' }),
            ];
            const parseJapanese = vi.fn(async (text: string) => {
                if (text === reportedCue) return successorTokens;
                return [makeSubtitleToken(text, {
                    reading: 'せんせい',
                    pitchClass: 'heiban',
                    rubies: [{ start: 0, end: 2, length: 2, text: 'せんせい' }],
                })];
            });
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                const sentence = tokens[0]?.sentence;
                if (sentence === '先生') await activeEnrichment;
                if (sentence === reportedCue) await successorEnrichment;
            });
            const { controller } = createInstalledSubtitleController(settings, { parseJapanese, beforeRenderTokens });
            const video = attachVideo(controller, { currentTime: 1, rect: new DOMRect(0, 0, 960, 540) });
            const cues = [
                { start: 0, end: 4, text: '先生', transcriptEligible: true },
                { start: 4, end: 8, text: reportedCue, transcriptEligible: true },
            ];
            const internals = controllerInternals<{
                cues: typeof cues;
                currentCue?: typeof cues[number];
                selectedTrackId: string;
                selectTrack: (id: string) => Promise<void>;
                subtitleEl: HTMLElement;
                htmlCache: SubtitleParsedHtmlCache;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                updateFromLoadedCues: () => void;
                render: () => void;
                tracks: Array<{
                    id: string;
                    label: string;
                    kind: 'file';
                    cues: typeof cues;
                    loadingState?: string;
                }>;
            }>(controller);
            internals.tracks = [{ id: 'file-ja', label: 'Japanese', kind: 'file', cues }];

            const selection = internals.selectTrack('file-ja');
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledWith('先生', {
                allowSegmentedFallback: true,
                includeLocalPitch: true,
                skipJpdb: true,
            }));
            expect(parseJapanese.mock.calls.some(([text]) => text === reportedCue)).toBe(false);

            expect(internals.cues).toEqual([]);
            expect(internals.currentCue).toBeUndefined();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();

            releaseActiveEnrichment();
            await selection;
            await vi.waitFor(() => expect(parseJapanese.mock.calls.some(([text]) => text === reportedCue)).toBe(true));
            expect(parseJapanese.mock.calls.map(([text]) => text)).toEqual(['先生', reportedCue]);

            const primary = internals.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
            expect(primary?.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(primary?.querySelector('.jpdb-reader-word.jpdb-pitch-heiban')).not.toBeNull();
            expect(primary?.querySelector('.jpdb-reader-furi')?.textContent).toBe('せんせい');
            expect(internals.currentCue?.text).toBe('先生');
            video.currentTime = 5;
            internals.updateFromLoadedCues();
            expect(primary?.textContent).toContain('先生');
            expect(primary?.textContent).not.toContain('悪口');
            expect(primary?.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            releaseSuccessorEnrichment();
            const successorKey = internals.parseCacheKey(reportedCue, settings);
            await vi.waitFor(() => expect(internals.htmlCache.enrichedProvisionalParsedHtmlKeys.has(successorKey)).toBe(true));
            await vi.waitFor(() => expect(primary?.textContent).toContain('悪口'));
            const annotationSignature = () => Array.from(primary?.querySelectorAll<HTMLElement>('.jpdb-reader-word') ?? [])
                .map(word => [
                    readerWordSurfaceText(word),
                    Array.from(word.querySelectorAll<HTMLElement>('.jpdb-reader-furi')).map(furi => furi.textContent),
                ]);
            const expectedSignature = [
                ['私', ['わたし']],
                ['も', []],
                ['彼ら', ['かれ']],
                ['の', []],
                ['悪口', ['わるぐち']],
                ['を', []],
                ['言いたくない', ['い']],
            ];
            expect(annotationSignature()).toEqual(expectedSignature);
            for (let tick = 0; tick < 3; tick++) {
                internals.updateFromLoadedCues();
                internals.render();
                expect(primary?.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
                expect(annotationSignature()).toEqual(expectedSignature);
            }
            expect(parseJapanese.mock.calls.filter(([text]) => text === '先生')).toHaveLength(1);
            expect(parseJapanese.mock.calls.filter(([text]) => text === reportedCue)).toHaveLength(1);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('hands first-paint prewarm to the successor when active enrichment rejects', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=first-paint-rejection') as unknown as Location,
        });
        try {
            const settings = makeSubtitleSettings({
                apiKey: '',
                jitenApiKey: '',
                furiganaMode: 'all' as const,
                localDictionariesEnabled: false,
            });
            const parseJapanese = vi.fn(async (text: string) => [makeSubtitleToken(text, {
                reading: text === '先生' ? 'せんせい' : 'しごと',
                pitchClass: 'heiban',
                rubies: [{ start: 0, end: 2, length: 2, text: text === '先生' ? 'せんせい' : 'しごと' }],
            })]);
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                if (tokens[0]?.sentence === '先生') throw new Error('active enrichment failed');
            });
            const { controller } = createInstalledSubtitleController(settings, { parseJapanese, beforeRenderTokens });
            attachVideo(controller, { currentTime: 1, rect: new DOMRect(0, 0, 960, 540) });
            const cues = [
                { start: 0, end: 4, text: '先生', transcriptEligible: true },
                { start: 4, end: 8, text: '仕事', transcriptEligible: true },
            ];
            const internals = controllerInternals<{
                cues: typeof cues;
                selectTrack: (id: string) => Promise<void>;
                tracks: Array<{
                    id: string;
                    label: string;
                    kind: 'file';
                    cues: typeof cues;
                    loadingState?: string;
                }>;
            }>(controller);
            internals.tracks = [{ id: 'file-ja', label: 'Japanese', kind: 'file', cues }];

            await internals.selectTrack('file-ja');

            await vi.waitFor(() => expect(parseJapanese.mock.calls.some(([text]) => text === '仕事')).toBe(true));
            // Applying the track may immediately retry the failed active cue;
            // the successor must receive the first handoff before that retry.
            expect(parseJapanese.mock.calls.slice(0, 2).map(([text]) => text)).toEqual(['先生', '仕事']);
            expect(internals.cues).toEqual(cues);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('prewarms the cue the live selector shows at an adjacent boundary', async () => {
        const settings = makeSubtitleSettings({
            apiKey: '',
            jitenApiKey: '',
            furiganaMode: 'all' as const,
            localDictionariesEnabled: false,
        });
        const parseJapanese = vi.fn(async (text: string) => [makeSubtitleToken(text, {
            reading: text === '次' ? 'つぎ' : 'まえ',
            pitchClass: 'heiban',
            rubies: [{ start: 0, end: 1, length: 1, text: text === '次' ? 'つぎ' : 'まえ' }],
        })]);
        const { controller } = createInstalledSubtitleController(settings, { parseJapanese });
        attachVideo(controller, { currentTime: 4, rect: new DOMRect(0, 0, 960, 540) });
        const cues = [
            { start: 0, end: 4, text: '前', transcriptEligible: true },
            { start: 4, end: 8, text: '次', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            selectTrack: (id: string) => Promise<void>;
            tracks: Array<{
                id: string;
                label: string;
                kind: 'file';
                cues: typeof cues;
                loadingState?: string;
            }>;
        }>(controller);
        internals.tracks = [{ id: 'file-boundary', label: 'Boundary', kind: 'file', cues }];

        await internals.selectTrack('file-boundary');

        expect(parseJapanese.mock.calls.map(([text]) => text)).toEqual(['次']);
    });

    it('does not start a stale successor after track selection changes during prewarm', async () => {
        const settings = makeSubtitleSettings({
            apiKey: '',
            jitenApiKey: '',
            furiganaMode: 'all' as const,
            localDictionariesEnabled: false,
        });
        let releaseStaleActive!: () => void;
        const staleActiveGate = new Promise<void>(resolve => {
            releaseStaleActive = resolve;
        });
        const parseJapanese = vi.fn(async (text: string) => [makeSubtitleToken(text, {
            reading: 'よみ',
            pitchClass: 'heiban',
            rubies: [{ start: 0, end: 1, length: 1, text: 'よみ' }],
        })]);
        const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
            if (tokens[0]?.sentence === '古い現在') await staleActiveGate;
        });
        const { controller } = createInstalledSubtitleController(settings, { parseJapanese, beforeRenderTokens });
        attachVideo(controller, { currentTime: 1, rect: new DOMRect(0, 0, 960, 540) });
        const staleCues = [
            { start: 0, end: 4, text: '古い現在', transcriptEligible: true },
            { start: 4, end: 8, text: '古い次', transcriptEligible: true },
        ];
        const currentCues = [
            { start: 0, end: 4, text: '新しい現在', transcriptEligible: true },
            { start: 4, end: 8, text: '新しい次', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            selectTrack: (id: string) => Promise<void>;
            tracks: Array<{
                id: string;
                label: string;
                kind: 'file';
                cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                loadingState?: string;
            }>;
        }>(controller);
        internals.tracks = [
            { id: 'file-stale', label: 'Stale', kind: 'file', cues: staleCues },
            { id: 'file-current', label: 'Current', kind: 'file', cues: currentCues },
        ];

        const staleSelection = internals.selectTrack('file-stale');
        await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledWith('古い現在', expect.any(Object)));
        await internals.selectTrack('file-current');
        releaseStaleActive();
        await staleSelection;
        await Promise.resolve();

        expect(parseJapanese.mock.calls.some(([text]) => text === '古い次')).toBe(false);
        expect(parseJapanese.mock.calls.slice(0, 3).map(([text]) => text)).toEqual([
            '古い現在',
            '新しい現在',
            '新しい次',
        ]);
    });

    it('enriches priority YouTube subtitle batches before rendering cached html', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=priority') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                furiganaMode: 'all' as const,
                localDictionariesEnabled: false,
            };
            const token = makeSubtitleToken('本', { cardState: ['known'] });
            const parseJapaneseBatch = vi.fn(async () => [[token]]);
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                tokens[0].card.reading = 'ほん';
                tokens[0].card.pitchAccent = ['HL'];
                tokens[0].pitchClass = 'atamadaka';
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch, beforeRenderTokens });
            const internals = controller as unknown as {
                parseCueHtmlBatch: (texts: string[], settings: ReaderSettings, options?: { enrichBeforeRender?: boolean }) => Promise<Array<{ html: string }>>;
            };

            const parsed = await internals.parseCueHtmlBatch(['本'], settings, { enrichBeforeRender: true });

            expect(beforeRenderTokens).toHaveBeenCalledWith([token]);
            expect(parsed[0]?.html).toContain('jpdb-pitch-atamadaka');
            expect(parsed[0]?.html).toContain('<rt class="jpdb-reader-furi">ほん</rt>');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('enriches subtitle parse batches together before rendering any row html', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            furiganaMode: 'all' as const,
            localDictionariesEnabled: false,
        };
        const tokens = [
            makeSubtitleToken('本', { cardState: ['known'] }),
            makeSubtitleToken('先生', { cardState: ['known'] }),
        ];
        const parseJapaneseBatch = vi.fn(async () => [[tokens[0]], [tokens[1]]]);
        const beforeRenderTokens = vi.fn(async (batch: JPDBToken[]) => {
            expect(batch).toEqual(tokens);
            tokens[0].card.reading = 'ほん';
            tokens[0].pitchClass = 'atamadaka';
            tokens[1].card.reading = 'せんせい';
            tokens[1].pitchClass = 'heiban';
        });
        const { controller } = createSubtitleController(settings, { parseJapaneseBatch, beforeRenderTokens });
        const internals = controller as unknown as {
            parseCueHtmlBatch: (texts: string[], settings: ReaderSettings, options?: { enrichBeforeRender?: boolean }) => Promise<Array<{ html: string }>>;
        };

        const parsed = await internals.parseCueHtmlBatch(['本', '先生'], settings, { enrichBeforeRender: true });

        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(beforeRenderTokens).toHaveBeenCalledTimes(1);
        expect(beforeRenderTokens).toHaveBeenCalledWith(tokens);
        expect(parsed[0]?.html).toContain('jpdb-pitch-atamadaka');
        expect(parsed[1]?.html).toContain('jpdb-pitch-heiban');
    });

    it('continues parsing transcript rows beyond the visible hydration window', async () => {
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callback(performance.now());
            return 1;
        }) as typeof window.requestAnimationFrame;

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapanese = vi.fn(async () => []);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
            const cues = Array.from({ length: 24 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                selectedTrackId: string;
                cues: typeof cues;
                currentCue: typeof cues[number];
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.selectedTrackId = 'youtube-0';
            internals.cues = cues;
            internals.currentCue = cues[0];

            internals.openLinesPanel();
            for (let index = 0; index < cues.length * 12; index++) await Promise.resolve();

            expect(parseJapanese).toHaveBeenCalledWith('字幕23', AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
        }
    });

    it('parses the transcript warmup head immediately and paces only the background tail', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapanese = vi.fn(async () => []);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            const cues = Array.from({ length: 80 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `字幕${index}`,
                transcriptEligible: true,
            }));
            const rows = cues.map((cue, cueIndex) => ({ cue, cueIndex }));
            type WarmupRows = typeof rows;
            type WarmupSettings = typeof settings;
            const internals = controller as unknown as {
                transcriptCacheWarmupSerial: number;
                warmTranscriptParseCache: (
                    rows: WarmupRows,
                    preferredIndex: number,
                    settings: WarmupSettings,
                    serial: number,
                ) => Promise<void>;
            };

            internals.transcriptCacheWarmupSerial = 1;
            const warmup = internals.warmTranscriptParseCache(rows, 0, settings, 1);

            // The priority head (visible + lookahead rows) parses immediately
            // without pacing so playback colorises instantly; only the
            // background tail is paced.
            await vi.advanceTimersByTimeAsync(0);
            expect(parseJapanese.mock.calls.length).toBeGreaterThanOrEqual(49);
            expect(parseJapanese).toHaveBeenCalledWith('字幕0', AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
            expect(parseJapanese).toHaveBeenCalledWith('字幕48', AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
            const afterPriorityHead = parseJapanese.mock.calls.length;

            await vi.advanceTimersByTimeAsync(119);
            expect(parseJapanese.mock.calls.length).toBe(afterPriorityHead);

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();
            expect(parseJapanese.mock.calls.length).toBeGreaterThan(afterPriorityHead);

            internals.transcriptCacheWarmupSerial = 2;
            await vi.runOnlyPendingTimersAsync();
            await warmup;
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps every cue pre-parsed ahead of playback so display never waits on a parse', async () => {
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            // Realistic parse latency: each batch takes 30ms, far less than one
            // cue duration but enough to catch display-time parsing.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            const cues = Array.from({ length: 40 }, (_, index) => ({
                start: index * 2,
                end: index * 2 + 1.8,
                text: `再生中の字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;

            // Track selection warms the initial window.
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // Continuous playback: every cue must already be warmed (parsed or
            // known-empty) by the moment it becomes the active cue.
            const misses: number[] = [];
            for (let index = 1; index < cues.length; index++) {
                (video as { currentTime: number }).currentTime = cues[index].start + 0.1;
                if (internals.subtitleWarmupTexts(index, index + 1, settings).length) misses.push(index);
                internals.updateFromLoadedCues();
                // One active tick (250ms) of background time between cues.
                await vi.advanceTimersByTimeAsync(250);
            }

            expect(misses).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('pre-parses pending DOM captions during the stability window', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
        const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
        const internals = controllerInternals<{
            isDomCaptionStable: (text: string, nowMs: number) => boolean;
            pendingDomCaption: { text: string; firstSeenAt: number; parseSettled: boolean } | undefined;
        }>(controller);

        // First sighting starts the stability clock AND the parse.
        expect(internals.isDomCaptionStable('新しい字幕です', 1000)).toBe(false);
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['新しい字幕です']);

        // Stability passing renders from the already-warmed cache; the same
        // text does not restart the parse.
        await vi.waitFor(() => expect(internals.pendingDomCaption?.parseSettled).toBe(true));
        expect(internals.isDomCaptionStable('新しい字幕です', 1300)).toBe(true);
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
    });

    it('recovers the parse window within one warmup turn after a long seek', async () => {
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            const cues = Array.from({ length: 60 }, (_, index) => ({
                start: index * 2,
                end: index * 2 + 1.8,
                text: `シーク字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // Seek far outside the warmed window.
            (video as { currentTime: number }).currentTime = cues[45].start + 0.1;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // One warmup turn later the active cue and its lookahead are warm.
            expect(internals.subtitleWarmupTexts(45, 46, settings)).toEqual([]);
            expect(internals.subtitleWarmupTexts(46, 52, settings)).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps every cue pre-parsed ahead of keyless playback through the provisional tier', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=keyless') as unknown as Location,
        });
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: { skipJpdb?: boolean }) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const parseJapanese = vi.fn(async (text: string, _options?: { skipJpdb?: boolean }) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return [makeSubtitleToken(text)];
            });
            const { controller } = createSubtitleController(settings, { parseJapanese, parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            const cues = Array.from({ length: 40 }, (_, index) => ({
                start: index * 2,
                end: index * 2 + 1.8,
                text: `無鍵再生の字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
                htmlCache: SubtitleParsedHtmlCache;
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;

            internals.updateFromLoadedCues();
            // Active and successor are deliberately enriched in playback
            // order so their independent public-detail fan-outs cannot stack.
            await vi.advanceTimersByTimeAsync(80);

            const misses: number[] = [];
            for (let index = 1; index < cues.length; index++) {
                (video as { currentTime: number }).currentTime = cues[index].start + 0.1;
                if (internals.subtitleWarmupTexts(index, index + 1, settings).length) misses.push(index);
                internals.updateFromLoadedCues();
                await vi.advanceTimersByTimeAsync(250);
            }

            expect(misses).toEqual([]);
            // Keyless results live in the provisional tier (it IS the final
            // tier without a key); nothing may dangle waiting on an upgrade.
            expect(internals.htmlCache.provisionalParsedHtmlCache.size).toBeGreaterThan(0);
            // No call may demand the JPDB API keyless...
            expect(parseJapaneseBatch.mock.calls.some(call => (call[1] as { requireJpdb?: boolean })?.requireJpdb === true)).toBe(false);
            // ...and no cue text is tokenized twice: the provisional result is
            // final, so the transcript-tail warmup must reuse it instead of
            // re-parsing every cue through its non-provisional path.
            const parsedTexts = [
                ...parseJapanese.mock.calls.map(call => call[0] as string),
                ...parseJapaneseBatch.mock.calls.flatMap(call => call[0] as string[]),
            ];
            expect(new Set(parsedTexts).size).toBe(parsedTexts.length);
        } finally {
            vi.useRealTimers();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('re-anchors the warmup window at the playhead when seeks land between cues', async () => {
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: { skipJpdb?: boolean }) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            // 2s cues with real 2s gaps between them, so a seek can land
            // clear of the boundary grace/tolerance windows.
            const cues = Array.from({ length: 60 }, (_, index) => ({
                start: index * 4,
                end: index * 4 + 2,
                text: `間隙シーク字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                currentCue: typeof cues[number] | undefined;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // Forward seek into the middle of the gap AFTER cue 45 (no active
            // cue there): the stale cue clears and the upcoming cue 46 plus
            // its lookahead warm within one turn.
            (video as { currentTime: number }).currentTime = cues[45].end + 1;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);
            expect(internals.currentCue).toBeUndefined();
            expect(internals.subtitleWarmupTexts(46, 57, settings)).toEqual([]);

            // A second gap-landing seek (no cue-state change at all) must
            // still re-anchor: backward into the gap after cue 20.
            (video as { currentTime: number }).currentTime = cues[20].end + 1;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);
            expect(internals.subtitleWarmupTexts(21, 32, settings)).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('clears a stale cue when seeking backward to before it started', () => {
        const settings = makeSubtitleSettings();
        const { controller } = createSubtitleController(settings);
        installController(controller);
        const video = attachVideo(controller, { currentTime: 100.5 });
        const cues = [
            { start: 10, end: 12, text: '前の字幕', transcriptEligible: true },
            { start: 100, end: 102, text: '後の字幕', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            cues: typeof cues;
            currentCue: typeof cues[number] | undefined;
            selectedTrackId: string;
            updateFromLoadedCues: () => void;
            lastDomCaption: string;
        }>(controller);
        internals.selectedTrackId = 'file-0';
        internals.cues = cues;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('後の字幕');

        // Backward seek into the gap between the cues: the later cue must not
        // keep rendering (it used to persist because time < its end).
        (video as { currentTime: number }).currentTime = 50;
        internals.updateFromLoadedCues();
        expect(internals.currentCue).toBeUndefined();
        // The clear also resets the DOM-caption dedupe so an identical
        // caption can re-apply after the seek.
        expect(internals.lastDomCaption).toBe('');
    });

    it('keeps the primary line on screen while its auto-translated secondary cue still shows', () => {
        // Auto-generated YouTube captions and their `&tlang=` translation are
        // normalized independently, so the Japanese cue ends a beat before its
        // English translation. The Japanese line used to vanish while the
        // English one kept showing alone (user-reported).
        const settings = makeSubtitleSettings({ subtitleSecondaryVisible: true });
        const { controller } = createSubtitleController(settings);
        installController(controller);
        const video = attachVideo(controller, { currentTime: 0.5 });
        const cues = [
            { start: 0, end: 1, text: 'おはよう', transcriptEligible: true },
            { start: 3, end: 4, text: 'こんにちは', transcriptEligible: true },
        ];
        const secondaryCues = [
            { start: 0, end: 2.5, text: 'Good morning', transcriptEligible: true },
            { start: 3, end: 4, text: 'Hello', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            cues: typeof cues;
            secondaryCues: typeof secondaryCues;
            currentCue: typeof cues[number] | undefined;
            selectedTrackId: string;
            secondaryTrackId: string;
            updateFromLoadedCues: () => void;
        }>(controller);
        internals.selectedTrackId = 'yt-ja';
        internals.secondaryTrackId = 'yt-en';
        internals.cues = cues;
        internals.secondaryCues = secondaryCues;

        // Both lines active.
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('おはよう');
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('おはよう');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Good morning');

        // The Japanese cue has ended, but its translation still spans this
        // moment: the Japanese line must stay rather than leave English alone.
        (video as { currentTime: number }).currentTime = 2;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('おはよう');
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('おはよう');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Good morning');

        // Once the translation also ends, both lines clear together.
        (video as { currentTime: number }).currentTime = 2.8;
        internals.updateFromLoadedCues();
        expect(internals.currentCue).toBeUndefined();
        expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-secondary')).toBeNull();

        // The next pair takes over cleanly.
        (video as { currentTime: number }).currentTime = 3.5;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('こんにちは');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Hello');

        controller.destroy();
    });

    it('surfaces the aligned primary line when its auto-translated native cue starts first', () => {
        // Mirror of the hold case for the not-yet-shown direction: independent
        // normalization can make the Japanese cue START a beat after its English
        // translation, so the playhead sits inside the English cue while the
        // Japanese cue's own start is still ahead. The English line used to
        // appear alone until the Japanese cue began (user-reported); surface the
        // aligned Japanese cue so the pair shows together from the first frame.
        const settings = makeSubtitleSettings({ subtitleSecondaryVisible: true });
        const { controller } = createSubtitleController(settings);
        installController(controller);
        const video = attachVideo(controller, { currentTime: 0.5 });
        const cues = [
            { start: 0, end: 1, text: 'おはよう', transcriptEligible: true },
            { start: 3.3, end: 4.2, text: 'こんにちは', transcriptEligible: true },
        ];
        const secondaryCues = [
            { start: 0, end: 1, text: 'Good morning', transcriptEligible: true },
            { start: 3.0, end: 4.2, text: 'Hello', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            cues: typeof cues;
            secondaryCues: typeof secondaryCues;
            currentCue: typeof cues[number] | undefined;
            selectedTrackId: string;
            secondaryTrackId: string;
            updateFromLoadedCues: () => void;
        }>(controller);
        internals.selectedTrackId = 'yt-ja';
        internals.secondaryTrackId = 'yt-en';
        internals.cues = cues;
        internals.secondaryCues = secondaryCues;

        // English cue [3.0,4.2] is active; the Japanese cue starts later (3.3)
        // and is in a gap relative to the playhead, yet the pair must show.
        (video as { currentTime: number }).currentTime = 3.1;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('こんにちは');
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('こんにちは');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Hello');

        controller.destroy();
    });

    it('caches keyless empty parses in the retry TTL instead of re-parsing every tick', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=empty') as unknown as Location,
        });
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
            };
            // A cue with no annotatable words: every parse returns no tokens.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(() => []));
            const parseJapanese = vi.fn(async () => []);
            const totalParseCalls = () => parseJapaneseBatch.mock.calls.length + parseJapanese.mock.calls.length;
            const { controller } = createSubtitleController(settings, { parseJapanese, parseJapaneseBatch });
            installController(controller);
            attachVideo(controller, { currentTime: 0.5 });
            const cues = [{ start: 0, end: 4, text: '12345', transcriptEligible: true }];
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleEl: HTMLElement;
                render: () => void;
                htmlCache: SubtitleParsedHtmlCache;
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;

            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(10);
            const initialParseCalls = totalParseCalls();
            expect(initialParseCalls).toBeGreaterThan(0);
            expect(internals.htmlCache.emptyParsedHtmlCache.size).toBe(1);

            // Within the TTL the cue is known-empty: ticks neither re-parse
            // nor render the loading shimmer.
            for (let tick = 0; tick < 6; tick++) {
                internals.updateFromLoadedCues();
                internals.render();
                await vi.advanceTimersByTimeAsync(250);
            }
            expect(totalParseCalls()).toBe(initialParseCalls);
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(internals.subtitleEl.textContent).toContain('12345');

            // After the TTL lapses the cue re-parses (periodic retry).
            await vi.advanceTimersByTimeAsync(2600);
            internals.updateFromLoadedCues();
            internals.render();
            await vi.advanceTimersByTimeAsync(10);
            expect(totalParseCalls()).toBeGreaterThan(initialParseCalls);
        } finally {
            vi.useRealTimers();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('warms the normalized cue parts of a pending DOM caption so the split render hits the cache', async () => {
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=split') as unknown as Location);
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: true,
        };
        const batch = deferred<JPDBToken[][]>();
        const parseJapaneseBatch = vi.fn(() => batch.promise);
        const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
        installController(controller);
        attachVideo(controller, { currentTime: 30 });
        const internals = controllerInternals<{
            isDomCaptionStable: (text: string, nowMs: number) => boolean;
            applyDomCaptionFallback: (text: string, selected: undefined) => void;
            subtitleEl: HTMLElement;
            currentCue: { start: number; end: number; text: string } | undefined;
            keepDomCaptionCueAlive: (text: string) => void;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
            pendingDomCaption: { text: string; firstSeenAt: number; parseSettled: boolean } | undefined;
        }>(controller);

        // First sighting starts the parse DURING the stability window —
        // for the texts that will render (normalized sentence parts),
        // not the raw caption string.
        const caption = 'こんにちは先生。元気ですか。';
        expect(internals.isDomCaptionStable(caption, 1000)).toBe(false);
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch).toHaveBeenCalledWith(
            ['こんにちは先生。', '元気ですか。'],
            expect.any(Object),
        );
        // The stability delay alone is not permission to paint a plain
        // cue. Wait for the exact parse that will become the first frame.
        expect(internals.isDomCaptionStable(caption, 1300)).toBe(false);
        expect(internals.pendingDomCaption!.parseSettled).toBe(false);

        batch.resolve([
            [makeSubtitleToken('こんにちは先生。')],
            [makeSubtitleToken('元気ですか。')],
        ]);
        const firstPartKey = internals.parseCacheKey('こんにちは先生。', settings);
        await vi.waitFor(() => expect(internals.htmlCache.provisionalParsedHtmlCache.has(firstPartKey)).toBe(true));
        expect(internals.pendingDomCaption!.parseSettled).toBe(true);

        // Stability passing renders the first part pre-parsed: no loading
        // shimmer, reader words present immediately.
        expect(internals.isDomCaptionStable(caption, 1300)).toBe(true);
        internals.applyDomCaptionFallback(caption, undefined);
        expect(internals.currentCue!.text).toBe('こんにちは先生。');
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);

        // While the page keeps showing the same caption, the synthetic cue is
        // renewed instead of expiring at its 4s guess.
        const cue = internals.currentCue!;
        const initialEnd = cue.end;
        (controllerInternals<{ video: { currentTime: number } }>(controller)).video.currentTime = initialEnd - 0.5;
        internals.keepDomCaptionCueAlive(caption);
        expect(internals.currentCue!.end).toBeGreaterThan(initialEnd);
    });

    it('re-bakes cache and transcript without mutating an active cue after first paint', async () => {
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=rebake') as unknown as Location);
        // The parse returns a token with no pitch yet (local dictionaries did
        // not know it) — pitch arrives later via public enrichment.
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { controller, internals, settings } = setupTranscriptCueController<typeof cue, {
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            parseCueHtmlBatch: (texts: string[]) => Promise<unknown>;
            htmlCache: SubtitleParsedHtmlCache;
            render: () => void;
            subtitleEl: HTMLElement;
            transcriptPanel: HTMLElement;
        }>([cue], {
            hooks: { parseJapaneseBatch },
            selectedTrackId: 'file-0',
            settings: {
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                furiganaMode: 'all',
            },
        });
        const key = internals.parseCacheKey('読む', settings);

        await internals.parseCueHtmlBatch(['読む']);
        expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-word');
        expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).not.toContain('jpdb-pitch-heiban');
        // The cue is on screen with the pre-enrichment html.
        internals.render();
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();

        // A transcript row already hydrated with the pre-enrichment html.
        const rowText = document.createElement('strong');
        rowText.className = 'jpdb-subtitle-row-text';
        rowText.setAttribute('data-transcript-text', '');
        rowText.dataset.parseKey = key;
        rowText.dataset.parsedKey = key;
        rowText.dataset.parsedProvisional = 'true';
        rowText.innerHTML = internals.htmlCache.provisionalParsedHtmlCache.get(key) ?? '';
        internals.transcriptPanel.hidden = false;
        internals.transcriptPanel.replaceChildren(rowText);

        // Late enrichment mutates the cached tokens (public jpdb pitch).
        const tokens = internals.htmlCache.parsedTokenCache.get(key)!;
        tokens[0].pitchClass = 'heiban';
        tokens[0].card.pitchAccent = ['LHL'];
        controller.refreshParsedCueTexts(['読む']);

        // Cache and transcript can improve in the background, but the cue
        // already on screen is frozen so furigana/pitch never pop in late.
        expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).toContain('jpdb-pitch-heiban');
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-pitch-heiban')).toBeNull();
        expect(rowText.querySelector('.jpdb-pitch-heiban')).not.toBeNull();

        // A later visit starts a new visual lifetime and uses the enriched
        // cache from its first frame.
        controllerInternals<{ currentCue: typeof cue | undefined }>(controller).currentCue = undefined;
        internals.render();
        internals.currentCue = cue;
        internals.render();
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-pitch-heiban')).not.toBeNull();
    });

    it('repaints an active cue when its parse-affecting settings key changes', async () => {
        const token = makeSubtitleToken('読む', {
            reading: 'よむ',
            rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
        });
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(() => [token]));
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { internals, settings } = setupTranscriptCueController<typeof cue, {
            parseCueHtmlBatch: (texts: string[], settings: ReaderSettings) => Promise<unknown>;
            render: () => void;
            subtitleEl: HTMLElement;
        }>([cue], {
            hooks: { parseJapaneseBatch },
            selectedTrackId: 'file-0',
            settings: {
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                showFurigana: true,
                furiganaMode: 'all',
            },
        });

        await internals.parseCueHtmlBatch(['読む'], settings);
        internals.render();
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary rt')).not.toBeNull();

        settings.furiganaMode = 'off';
        settings.showFurigana = false;
        await internals.parseCueHtmlBatch(['読む'], settings);
        internals.render();

        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();
        expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary rt')).toBeNull();
    });

    it('batches transcript cache warmup when a batch parser is available', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const parseJapanese = vi.fn(async () => []);
        const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: unknown) => texts.map(() => [] as JPDBToken[]));
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese,
            parseJapaneseBatch,
            onSettingsChange: () => undefined,
        });
        const cues = Array.from({ length: 9 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `字幕${index}`,
            transcriptEligible: true,
        }));
        const rows = cues.map((cue, cueIndex) => ({ cue, cueIndex }));
        type WarmupRows = typeof rows;
        type WarmupSettings = typeof settings;
        const internals = controller as unknown as {
            transcriptCacheWarmupSerial: number;
            warmTranscriptParseCache: (
                rows: WarmupRows,
                preferredIndex: number,
                settings: WarmupSettings,
                serial: number,
            ) => Promise<void>;
        };

        internals.transcriptCacheWarmupSerial = 1;
        await internals.warmTranscriptParseCache(rows, 0, settings, 1);

        expect(parseJapanese).not.toHaveBeenCalled();
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['字幕0', '字幕1', '字幕2', '字幕3', '字幕4', '字幕5', '字幕6', '字幕7']);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual(AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
        expect(parseJapaneseBatch.mock.calls[1]?.[0]).toEqual(['字幕8']);
    });

    it('warms adjacent transcript row context so split tokens keep reader metadata in both row caches', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
            furiganaMode: 'all' as const,
        };
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => text === '大学'
            ? [makeSubtitleToken('大学', {
                cardState: ['known'],
                pitchClass: 'heiban',
                reading: 'だいがく',
                rubies: [{ start: 0, end: 2, length: 2, text: 'だいがく' }],
            })]
            : []));
        const { controller } = createSubtitleController(settings, {
            parseJapanese: async () => [],
            parseJapaneseBatch,
        });
        const rows = [
            { cue: { start: 0, end: 1, text: '大', transcriptEligible: true }, cueIndex: 0 },
            { cue: { start: 1, end: 2, text: '学', transcriptEligible: true }, cueIndex: 1 },
        ];
        type WarmupRows = typeof rows;
        type WarmupSettings = typeof settings;
        const internals = controller as unknown as {
            transcriptCacheWarmupSerial: number;
            warmTranscriptParseCache: (
                rows: WarmupRows,
                preferredIndex: number,
                settings: WarmupSettings,
                serial: number,
            ) => Promise<void>;
            transcriptRowParseKey: (row: WarmupRows[number], rowIndex: number, rows: WarmupRows, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
        };

        internals.transcriptCacheWarmupSerial = 1;
        await internals.warmTranscriptParseCache(rows, 0, settings, 1);

        expect(parseJapaneseBatch.mock.calls.flatMap(call => call[0] as string[])).toContain('大学');
        const firstHtml = internals.htmlCache.parsedHtmlCache.get(internals.transcriptRowParseKey(rows[0], 0, rows, settings)) ?? '';
        const secondHtml = internals.htmlCache.parsedHtmlCache.get(internals.transcriptRowParseKey(rows[1], 1, rows, settings)) ?? '';
        expect(firstHtml).toContain('jpdb-reader-word jpdb-known jpdb-pitch-heiban');
        expect(firstHtml).toContain('<rt class="jpdb-reader-furi">だいがく</rt>');
        expect(secondHtml).toContain('jpdb-reader-word jpdb-known jpdb-pitch-heiban');
        expect(secondHtml).toContain('<rt class="jpdb-reader-furi">だいがく</rt>');
    });

    it('keeps long YouTube transcript background warmup provisional and keyless', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=long-transcript') as unknown as Location,
        });
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: { skipJpdb?: boolean; requireJpdb?: boolean }) => texts.map(text => [makeSubtitleToken(text)]));
            const beforeRenderTokens = vi.fn(async () => undefined);
            const { controller } = createSubtitleController(settings, {
                parseJapanese: async () => [],
                parseJapaneseBatch,
                beforeRenderTokens,
            });
            const cues = Array.from({ length: 300 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `長い字幕${index}`,
                transcriptEligible: true,
            }));
            const rows = cues.slice(0, 48).map((cue, cueIndex) => ({ cue, cueIndex }));
            type WarmupRows = typeof rows;
            type WarmupSettings = typeof settings;
            const internals = controller as unknown as {
                cues: typeof cues;
                transcriptCacheWarmupSerial: number;
                warmTranscriptParseCache: (
                    rows: WarmupRows,
                    preferredIndex: number,
                    settings: WarmupSettings,
                    serial: number,
                ) => Promise<void>;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                htmlCache: SubtitleParsedHtmlCache;
            };

            internals.cues = cues;
            internals.transcriptCacheWarmupSerial = 1;
            await internals.warmTranscriptParseCache(rows, 0, settings, 1);

            expect(parseJapaneseBatch).toHaveBeenCalled();
            expect(parseJapaneseBatch.mock.calls.every(call => (call[1] as { skipJpdb?: boolean })?.skipJpdb === true)).toBe(true);
            expect(parseJapaneseBatch.mock.calls.some(call => (call[1] as { requireJpdb?: boolean })?.requireJpdb === true)).toBe(false);
            expect(beforeRenderTokens).not.toHaveBeenCalled();
            const key = internals.parseCacheKey('長い字幕0', settings);
            expect(internals.htmlCache.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-word');
            expect(internals.htmlCache.parsedHtmlCache.has(key)).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('enriches transcript background warmup html before caching future subtitle lines', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            furiganaMode: 'all' as const,
        };
        const token = makeSubtitleToken('本', { cardState: ['known'] });
        const parseJapaneseBatch = vi.fn(async () => [[token]]);
        const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
            tokens[0].card.reading = 'ほん';
            tokens[0].card.pitchAccent = ['HL'];
            tokens[0].pitchClass = 'atamadaka';
        });
        const { controller } = createSubtitleController(settings, {
            parseJapanese: async () => [],
            parseJapaneseBatch,
            beforeRenderTokens,
        });
        const rows = [{ cue: { start: 0, end: 1, text: '本', transcriptEligible: true }, cueIndex: 0 }];
        type WarmupRows = typeof rows;
        type WarmupSettings = typeof settings;
        const internals = controller as unknown as {
            transcriptCacheWarmupSerial: number;
            warmTranscriptParseCache: (
                rows: WarmupRows,
                preferredIndex: number,
                settings: WarmupSettings,
                serial: number,
            ) => Promise<void>;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
        };

        internals.transcriptCacheWarmupSerial = 1;
        await internals.warmTranscriptParseCache(rows, 0, settings, 1);

        const html = internals.htmlCache.parsedHtmlCache.get(internals.parseCacheKey('本', settings)) ?? '';
        expect(beforeRenderTokens).toHaveBeenCalledWith([token]);
        expect(html).toContain('jpdb-pitch-atamadaka');
        expect(html).toContain('<rt class="jpdb-reader-furi">ほん</rt>');
    });

    it('reuses pending transcript cue parses across batch hydration requests', async () => {
        const testSettings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        let resolveBatch!: (tokens: JPDBToken[][]) => void;
        const parseJapaneseBatch = vi.fn((_texts: string[], _options?: unknown) => new Promise<JPDBToken[][]>(resolve => {
            resolveBatch = resolve;
        }));
        const controller = new SubtitlePlayerController({
            getSettings: () => testSettings,
            parseJapanese: async () => [],
            parseJapaneseBatch,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            parseCueHtmlBatch: (texts: string[], settings: ReaderSettings) => Promise<Array<{ key: string; html: string }>>;
        };

        const first = internals.parseCueHtmlBatch(['字幕0'], testSettings);
        const second = internals.parseCueHtmlBatch(['字幕0'], testSettings);

        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual(AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS);
        resolveBatch([[]]);

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult[0]?.html).toContain('字幕0');
        expect(secondResult[0]?.html).toContain('字幕0');
    });

    it('seeks using the source cue index when transcript rows are filtered', () => {
        const cues = [
            { start: 2, end: 3, text: 'native line', transcriptEligible: false },
            { start: 90, end: 92, text: '日本語の行', transcriptEligible: true },
        ];
        const { internals, video } = setupTranscriptCueController(cues, {
            currentCue: cues[1],
            currentTime: 0,
            selectedTrackId: 'youtube-0',
            settings: { subtitleTranscriptAutoScroll: false },
        });

        internals.openLinesPanel();
        const row = document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!;
        row.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" tabindex="-1">日本語</span>の行';
        row.querySelector<HTMLElement>('.jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(video.currentTime).toBe(0);

        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(video.currentTime).toBeCloseTo(90);

        video.currentTime = 0;
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

        expect(video.currentTime).toBeCloseTo(90);
    });

    it('keeps fullscreen transcript pointer and click events out of the player host', () => {
        withViewport(1280, 720, () => {
            const { controller } = createInstalledSubtitleController({ subtitleTranscriptAutoScroll: false });
            const fullscreen = stubFullscreenElement(null);
            try {
                document.body.insertAdjacentHTML('beforeend', `
                    <section class="video-card">
                        <video></video>
                    </section>
                `);
                const frame = document.querySelector<HTMLElement>('.video-card')!;
                const video = document.querySelector<HTMLVideoElement>('.video-card video')!;
                mockElementRect(frame, new DOMRect(0, 0, 1280, 720));
                mockElementRect(video, new DOMRect(0, 0, 1280, 720));
                attachVideo(controller, { currentTime: 0, video });
                const cue = { start: 12, end: 14, text: '日本語の行', transcriptEligible: true };
                const internals = controllerInternals<{
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                    syncFullscreenState: () => void;
                }>(controller);
                internals.cues = [cue];
                internals.currentCue = cue;

                fullscreen.set(frame);
                internals.syncFullscreenState();
                internals.openLinesPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                const row = panel.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!;
                const hostClick = vi.fn();
                const hostPointerDown = vi.fn();
                frame.addEventListener('click', hostClick);
                frame.addEventListener('pointerdown', hostPointerDown);

                row.dispatchEvent(pointerEvent('pointerdown'));
                expect(hostPointerDown).not.toHaveBeenCalled();

                row.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" tabindex="-1">日本語</span>の行';
                row.querySelector<HTMLElement>('.jpdb-reader-word')!
                    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                expect(hostClick).not.toHaveBeenCalled();
                expect(video.currentTime).toBe(0);

                const rowClick = new MouseEvent('click', { bubbles: true, cancelable: true });
                row.dispatchEvent(rowClick);
                expect(rowClick.defaultPrevented).toBe(true);
                expect(hostClick).not.toHaveBeenCalled();
                expect(video.currentTime).toBeCloseTo(12);

                const link = document.createElement('a');
                link.href = 'https://www.youtube.com/watch?v=native-link';
                link.target = '_blank';
                link.textContent = 'native link';
                panel.append(link);
                const linkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
                link.dispatchEvent(linkClick);
                expect(linkClick.defaultPrevented).toBe(false);
                expect(hostClick).not.toHaveBeenCalled();
            } finally {
                fullscreen.restore();
                controller.destroy();
            }
        });
    });

    it('resumes a playing video after transcript row seeking pauses it', () => {
        const { controller } = createInstalledSubtitleController({ subtitleTranscriptAutoScroll: false });

        const video = document.createElement('video');
        let currentTime = 0;
        let paused = false;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTime,
            set: value => {
                currentTime = Number(value);
                paused = true;
            },
        });
        Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        const play = vi.fn(async () => {
            paused = false;
        });
        Object.defineProperty(video, 'play', { configurable: true, value: play });

        const cues = [{ start: 12, end: 14, text: '日本語の行', transcriptEligible: true }];
        const internals = controllerInternals<{
            cues: typeof cues;
            currentCue: typeof cues[number];
            openLinesPanel: () => void;
        }>(controller);
        attachVideo(controller, { video });
        internals.cues = cues;
        internals.currentCue = cues[0];

        internals.openLinesPanel();
        document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(currentTime).toBeCloseTo(12);
        expect(play).toHaveBeenCalledTimes(1);
    });
});
