import { describe, expect, it, vi } from 'vitest';
import { resolveAnkiWordAudio } from '../../src/reader/anki-audio';
import { getOrderedAudioSources } from '../../src/reader/audio-source-resolution';
import { reserveGestureAudioElement } from '../../src/reader/media-activation';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/types';

describe('audio module boundaries', () => {
    it('keeps Anki word audio resolution separate from lookup playback', async () => {
        const dataUrl = 'data:audio/mpeg;base64,YW5raQ==';
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            audioEnableDefaultSources: false,
            audioSources: [{ type: 'custom', url: dataUrl, voice: '', enabled: true }],
        };

        await expect(resolveAnkiWordAudio(card('猫', 'ねこ'), settings)).resolves.toEqual({ dataUrl });
    });

    it('does not resolve Anki word audio when term audio is disabled', async () => {
        await expect(resolveAnkiWordAudio(card('猫', 'ねこ'), {
            ...DEFAULT_SETTINGS,
            audioEnabled: false,
            audioSources: [{ type: 'custom', url: 'data:audio/mpeg;base64,YW5raQ==', voice: '', enabled: true }],
        })).resolves.toBeNull();
    });

    it('keeps built-in lookup source fallbacks in source resolution', () => {
        expect(getOrderedAudioSources({ ...DEFAULT_SETTINGS, audioSources: [] }).map(source => source.type))
            .toEqual(['jpod101', 'language-pod-101', 'jisho', 'jpdb-tts', 'text-to-speech']);
    });

    it('reserves a reusable silent audio element for gesture-gated playback', () => {
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

        const audio = reserveGestureAudioElement(audioUrl => {
            const element = document.createElement('audio');
            element.src = audioUrl;
            return element;
        });

        expect(audio.loop).toBe(true);
        expect(audio.src).toContain('data:audio/wav;base64,');
        expect(play).toHaveBeenCalledTimes(1);
    });
});

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        meanings: [],
        partOfSpeech: [],
        frequencyRank: 0,
        pitchAccent: [],
        cardState: ['new'],
        wordWithReading: null,
        source: 'jpdb',
    };
}
