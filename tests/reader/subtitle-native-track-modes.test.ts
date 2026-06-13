import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySubtitleNativeTrackModes } from '../../src/reader/subtitles/subtitle-native-track-modes';

describe('subtitle native track modes', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('turns Plyr captions off while keeping selected native tracks readable for Yomu', () => {
        document.body.innerHTML = `
            <div class="plyr">
                <video></video>
                <button type="button" data-plyr="captions" aria-pressed="true" class="plyr__control plyr__control--pressed"></button>
            </div>
        `;
        const video = document.querySelector('video')!;
        const primary = { mode: 'showing' } as TextTrack;
        const defaultCaption = { mode: 'showing' } as TextTrack;
        const toggleCaptions = vi.fn(() => {
            document.querySelector('[data-plyr="captions"]')?.setAttribute('aria-pressed', 'false');
        });
        vi.stubGlobal('player', {
            media: video,
            captions: { active: true, toggled: true },
            currentTrack: 0,
            toggleCaptions,
        });

        const active = applySubtitleNativeTrackModes({
            tracks: [
                { id: 'native-ja', label: 'Japanese', kind: 'native', track: primary },
                { id: 'native-default', label: 'Default CC', kind: 'native', track: defaultCaption },
            ],
            selectedTrackId: 'native-ja',
            secondaryTrackId: '',
            overlayVisible: false,
            suppressNativeCaptions: true,
            video,
            hasPrimaryCues: false,
            currentCueText: undefined,
            youtubeDomCaptionFallbackTrackId: '',
            lastYomuCaptionsActive: false,
        });

        expect(active).toBe(false);
        expect(primary.mode).toBe('hidden');
        expect(defaultCaption.mode).toBe('disabled');
        expect(toggleCaptions).toHaveBeenCalledWith(false);
        expect(document.querySelector('[data-plyr="captions"]')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('disables page CC even when Yomu has not selected a track yet', () => {
        const defaultCaption = { mode: 'showing' } as TextTrack;

        applySubtitleNativeTrackModes({
            tracks: [{ id: 'native-default', label: 'Default CC', kind: 'native', track: defaultCaption }],
            selectedTrackId: '',
            secondaryTrackId: '',
            overlayVisible: false,
            suppressNativeCaptions: true,
            video: document.createElement('video'),
            hasPrimaryCues: false,
            currentCueText: undefined,
            youtubeDomCaptionFallbackTrackId: '',
            lastYomuCaptionsActive: false,
        });

        expect(defaultCaption.mode).toBe('disabled');
    });

    it('does not operate a caption player attached to a different video', () => {
        const selectedVideo = document.createElement('video');
        const otherVideo = document.createElement('video');
        const track = { mode: 'showing' } as TextTrack;
        const toggleCaptions = vi.fn();
        vi.stubGlobal('player', {
            media: otherVideo,
            captions: { active: true, toggled: true },
            currentTrack: 0,
            toggleCaptions,
        });

        applySubtitleNativeTrackModes({
            tracks: [{ id: 'native-ja', label: 'Japanese', kind: 'native', track }],
            selectedTrackId: 'native-ja',
            secondaryTrackId: '',
            overlayVisible: false,
            suppressNativeCaptions: true,
            video: selectedVideo,
            hasPrimaryCues: false,
            currentCueText: undefined,
            youtubeDomCaptionFallbackTrackId: '',
            lastYomuCaptionsActive: false,
        });

        expect(track.mode).toBe('hidden');
        expect(toggleCaptions).not.toHaveBeenCalled();
    });
});
