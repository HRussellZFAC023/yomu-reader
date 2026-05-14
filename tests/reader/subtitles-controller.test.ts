import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { SubtitlePlayerController } from '../../src/reader/subtitles';
import type { JPDBToken } from '../../src/reader/types';

describe('SubtitlePlayerController', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('ignores stale secondary cues after moving the same track to Japanese', async () => {
        vi.useFakeTimers();
        const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleOverlayVisible: true,
                subtitleSecondaryVisible: true,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
            (controller as unknown as { video: HTMLVideoElement }).video = video;

            const trackState = {
                mode: 'disabled',
                cues: [] as Array<{ startTime: number; endTime: number; text: string }>,
            };
            const track = trackState as unknown as TextTrack;

            (controller as unknown as {
                tracks: Array<{ id: string; label: string; kind: 'native'; language: string; track: TextTrack }>;
            }).tracks = [{
                id: 'native-0',
                label: 'English captions',
                kind: 'native',
                language: 'en',
                track,
            }];

            const secondarySelection = (controller as unknown as {
                selectSecondaryTrack: (id: string) => Promise<void>;
            }).selectSecondaryTrack('native-0');
            const primarySelection = (controller as unknown as {
                selectTrack: (id: string) => Promise<void>;
            }).selectTrack('native-0');

            trackState.cues = [{ startTime: 0, endTime: 2, text: 'Hello there' }];
            await vi.advanceTimersByTimeAsync(1000);
            await Promise.all([secondarySelection, primarySelection]);

            const internals = controller as unknown as {
                selectedTrackId: string;
                secondaryTrackId: string;
                cues: Array<{ text: string }>;
                secondaryCues: Array<{ text: string }>;
                secondaryCue?: { text: string };
                updateFromLoadedCues: () => void;
            };
            internals.updateFromLoadedCues();

            expect(internals.selectedTrackId).toBe('native-0');
            expect(internals.secondaryTrackId).toBe('');
            expect(internals.cues.map(cue => cue.text)).toEqual(['Hello there']);
            expect(internals.secondaryCues).toEqual([]);
            expect(internals.secondaryCue).toBeUndefined();
            expect(document.querySelector('.jpdb-subtitle-secondary')).toBeNull();
        } finally {
            if (scrollIntoViewDescriptor) {
                Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor);
            } else {
                delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
            }
        }
    });

    it('clears auto-detected subtitles when a CIJ video route changes', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://cijapanese.com/video/560') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleOverlayVisible: true,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();
            const internals = controller as unknown as {
                syncSubtitleSourceContext: () => boolean;
                tracks: Array<{ id: string; label: string; kind: 'remote' | 'file'; language?: string; url?: string; sourceKey?: string; cues?: Array<{ text: string }> }>;
                selectedTrackId: string;
                cues: Array<{ text: string }>;
                currentCue?: { text: string };
            };
            internals.tracks = [
                {
                    id: 'remote-0',
                    label: 'Old CIJ video',
                    kind: 'remote',
                    language: 'ja',
                    url: 'https://cijapanese.com/media/old.vtt',
                    sourceKey: 'track:https://cijapanese.com/media/old.vtt',
                },
                {
                    id: 'file-primary',
                    label: 'Manual file',
                    kind: 'file',
                    cues: [{ text: '手動字幕' }],
                },
            ];
            internals.selectedTrackId = 'remote-0';
            internals.cues = [{ text: '前の動画の字幕' }];
            internals.currentCue = { text: '前の動画の字幕' };

            expect(internals.syncSubtitleSourceContext()).toBe(false);

            Object.defineProperty(window, 'location', {
                configurable: true,
                value: new URL('https://cijapanese.com/video/652') as unknown as Location,
            });

            expect(internals.syncSubtitleSourceContext()).toBe(true);
            expect(internals.tracks).toMatchObject([{ id: 'file-primary', kind: 'file' }]);
            expect(internals.selectedTrackId).toBe('');
            expect(internals.cues).toEqual([]);
            expect(internals.currentCue).toBeUndefined();
            expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('hydrates transcript rows with parsed subtitle words when the lines panel renders', async () => {
        vi.useFakeTimers();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
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
                rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
                pitchClass: 'heiban',
                sentence: '読む',
            };
            const parseJapanese = vi.fn(async () => [token]);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                selectedTrackId: string;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.selectedTrackId = 'file-primary';
            internals.cues = [cue];
            internals.currentCue = cue;

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).toBe('読む');

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(parseJapanese).toHaveBeenCalledWith('読む');
            expect(row?.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
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

            expect(parseJapanese).toHaveBeenCalledWith('字幕23');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
        }
    });

    it('paces YouTube transcript warmup while still parsing ahead', async () => {
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

            await Promise.resolve();
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parseJapanese).toHaveBeenCalledWith('字幕0');

            await vi.advanceTimersByTimeAsync(119);
            expect(parseJapanese).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();
            expect(parseJapanese).toHaveBeenCalledTimes(2);
            expect(parseJapanese).toHaveBeenCalledWith('字幕1');

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

    it('seeks using the source cue index when transcript rows are filtered', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });
        (controller as unknown as { install: () => void }).install();

        const video = document.createElement('video');
        Object.defineProperty(video, 'currentTime', { configurable: true, value: 0, writable: true });
        const cues = [
            { start: 2, end: 3, text: 'native line', transcriptEligible: false },
            { start: 90, end: 92, text: '日本語の行', transcriptEligible: true },
        ];
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
        internals.currentCue = cues[1];

        internals.openLinesPanel();
        document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(video.currentTime).toBeCloseTo(90 + settings.subtitleSeekPadding);
    });
});
