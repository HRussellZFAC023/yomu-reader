import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    attachVideo,
    controllerInternals,
    createInstalledSubtitleController,
    registerSubtitleControllerCleanup,
    type TestSubtitleCue,
} from './fixtures';

// Owner report (2026-10-07, "Japanese Listening Practice With A Story #1"):
// Yomu showed the story's first line, おかえり。, long before it was spoken —
// "we even saw it in the ads". A line may only show inside its own [start, end)
// window on the content clock: never before the first line starts, never on an
// ad's clock (YouTube plays ads in the watch player's own <video>), and always
// the line under the playhead after a seek, pause, rate change or next video.
const STORY_CUES: TestSubtitleCue[] = [
    { start: 8, end: 10, text: 'おかえり。', transcriptEligible: true },
    { start: 11, end: 13, text: 'ただいま。', transcriptEligible: true },
];
const STORY_TRANSLATION: TestSubtitleCue[] = [
    { start: 8, end: 10, text: 'Welcome back.', transcriptEligible: false },
    { start: 11, end: 13, text: "I'm home.", transcriptEligible: false },
];

interface PlaybackClockInternals {
    tracks: Array<{ id: string; kind: string; label: string; language: string; cues?: TestSubtitleCue[] }>;
    cues: TestSubtitleCue[];
    secondaryCues: TestSubtitleCue[];
    currentCue: TestSubtitleCue | undefined;
    secondaryCue: TestSubtitleCue | undefined;
    selectedTrackId: string;
    secondaryTrackId: string;
    shadowLoopEnabled: boolean;
    shadowLoopCue: TestSubtitleCue | undefined;
    observeVideoLayout: (video: HTMLVideoElement) => void;
    syncShadowLoop: () => void;
    updateYouTubeDiscoveryVideo: (videoId: string) => void;
}

function mountYouTubeWatchPlayer() {
    document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video class="html5-main-video"></video></div>';
    const player = document.querySelector<HTMLElement>('#movie_player')!;
    const video = document.querySelector<HTMLVideoElement>('video')!;
    let paused = false;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    const { controller } = createInstalledSubtitleController({
        annotationsPaused: true,
        subtitlePlayerEnabled: true,
        subtitleOverlayVisible: true,
        subtitleSecondaryVisible: true,
    });
    attachVideo(controller, { video, currentTime: 0 });
    const internals = controllerInternals<PlaybackClockInternals>(controller);
    internals.tracks = [
        { id: 'youtube-0', kind: 'youtube', label: '日本語', language: 'ja', cues: STORY_CUES },
        { id: 'youtube-1', kind: 'youtube', label: 'English', language: 'en', cues: STORY_TRANSLATION },
    ];
    internals.selectedTrackId = 'youtube-0';
    internals.secondaryTrackId = 'youtube-1';
    internals.cues = STORY_CUES;
    internals.secondaryCues = STORY_TRANSLATION;
    // Bind the production media listeners: the playhead below moves only
    // through the events a real <video> fires.
    internals.observeVideoLayout(video);

    const playheadAt = (time: number, ...events: string[]) => {
        video.currentTime = time;
        for (const type of events.length ? events : ['timeupdate']) video.dispatchEvent(new Event(type));
    };
    const shown = () => ({
        primary: document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim() ?? '',
        secondary: document.querySelector('.jpdb-subtitle-secondary')?.textContent?.trim() ?? '',
        cue: internals.currentCue?.text ?? '',
    });
    const nothing = { primary: '', secondary: '', cue: '' };
    const line = (index: number) => ({
        primary: STORY_CUES[index]!.text,
        secondary: STORY_TRANSLATION[index]!.text,
        cue: STORY_CUES[index]!.text,
    });
    return {
        controller,
        internals,
        player,
        video,
        playheadAt,
        shown,
        nothing,
        line,
        setPaused: (value: boolean) => { paused = value; },
    };
}

describe('SubtitlePlayerController — playback clock', () => {
    registerSubtitleControllerCleanup();

    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('shows no line before the first line starts, and each line only inside its window', () => {
        const { playheadAt, shown, nothing, line } = mountYouTubeWatchPlayer();

        for (const time of [0, 3, 7.9]) {
            playheadAt(time);
            expect(shown(), `t=${time}`).toEqual(nothing);
        }
        playheadAt(8);
        expect(shown()).toEqual(line(0));
        playheadAt(10.5);
        expect(shown()).toEqual(nothing);
        playheadAt(11.5);
        expect(shown()).toEqual(line(1));
        playheadAt(14);
        expect(shown()).toEqual(nothing);
    });

    it('shows nothing while a YouTube ad plays and the line under the playhead once the video resumes', () => {
        const { player, playheadAt, shown, nothing, line } = mountYouTubeWatchPlayer();

        // Pre-roll: the element's clock is the ad's. Ad time 8.5 falls inside the
        // first line's window, which must not make that line appear.
        player.classList.add('ad-showing', 'ad-interrupting');
        for (const adTime of [0, 8.5, 11.5]) {
            playheadAt(adTime);
            expect(shown(), `ad t=${adTime}`).toEqual(nothing);
        }
        player.classList.remove('ad-showing', 'ad-interrupting');
        playheadAt(0, 'loadstart', 'timeupdate');
        expect(shown()).toEqual(nothing);
        playheadAt(8.5);
        expect(shown()).toEqual(line(0));

        // Mid-roll while a line shows, with the ad clock landing inside that
        // same line's window: the line still clears for the whole ad.
        playheadAt(12);
        expect(shown()).toEqual(line(1));
        player.classList.add('ad-showing', 'ad-interrupting');
        for (const adTime of [12, 12.5, 8.5]) {
            playheadAt(adTime);
            expect(shown(), `mid-roll ad t=${adTime}`).toEqual(nothing);
        }
        player.classList.remove('ad-showing', 'ad-interrupting');
        playheadAt(12.2);
        expect(shown()).toEqual(line(1));
    });

    it('never seeks an ad back to a looped shadowing line', () => {
        const { internals, player, video, playheadAt } = mountYouTubeWatchPlayer();
        playheadAt(8.5);
        internals.shadowLoopEnabled = true;
        internals.shadowLoopCue = STORY_CUES[0];

        player.classList.add('ad-showing');
        playheadAt(3);
        internals.syncShadowLoop();

        expect(video.currentTime).toBe(3);
        expect(internals.currentCue).toBeUndefined();
    });

    it('follows the playhead through seeks, pause and a playback-rate change', () => {
        const { video, playheadAt, shown, nothing, line, setPaused } = mountYouTubeWatchPlayer();

        playheadAt(8.5);
        expect(shown()).toEqual(line(0));
        // Back to before the first line: blank, not a preview of it.
        playheadAt(2, 'seeking', 'seeked');
        expect(shown()).toEqual(nothing);
        playheadAt(12, 'seeking', 'seeked');
        expect(shown()).toEqual(line(1));

        setPaused(true);
        video.dispatchEvent(new Event('pause'));
        expect(shown()).toEqual(line(1));
        playheadAt(9, 'seeking', 'seeked');
        expect(shown()).toEqual(line(0));
        playheadAt(5, 'seeking', 'seeked');
        expect(shown()).toEqual(nothing);

        setPaused(false);
        video.playbackRate = 2;
        playheadAt(10.6, 'play', 'ratechange', 'timeupdate');
        expect(shown()).toEqual(nothing);
        playheadAt(11.1);
        expect(shown()).toEqual(line(1));
    });

    it('drops the previous video\'s lines on the next video and shows the new ones only on time', () => {
        const { internals, playheadAt, shown, nothing } = mountYouTubeWatchPlayer();
        playheadAt(8.5);
        expect(shown().cue).toBe('おかえり。');

        // Autoplay moves to the next video. Its clock restarts at 0, where the
        // previous video's lines must not be matched; discovery forgets them.
        internals.updateYouTubeDiscoveryVideo('next-video');
        playheadAt(0, 'loadstart', 'timeupdate');
        expect(shown()).toEqual(nothing);
        expect(internals.cues).toEqual([]);

        const nextCues: TestSubtitleCue[] = [{ start: 1.5, end: 3, text: 'いってきます。', transcriptEligible: true }];
        internals.tracks = [{ id: 'youtube-2', kind: 'youtube', label: '日本語', language: 'ja', cues: nextCues }];
        internals.selectedTrackId = 'youtube-2';
        internals.cues = nextCues;
        playheadAt(0.4);
        expect(shown()).toEqual(nothing);
        playheadAt(1.6);
        expect(shown().cue).toBe('いってきます。');
    });
});
