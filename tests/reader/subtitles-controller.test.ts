import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { SubtitlePlayerController } from '../../src/reader/subtitles';

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
});
