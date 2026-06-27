import { describe, expect, it } from 'vitest';

import { collectPageSubtitleSources, inferSubtitleLanguage } from '../../src/reader/subtitles/subtitle-sources';
import { compareSubtitleTrackOptions, isEnglishSubtitleTrack, isJapaneseSubtitleTrack } from '../../src/reader/subtitles/subtitle-track-metadata';

describe('subtitle language inference', () => {
    it('recognizes fuzzy Japanese and native-language subtitle labels generically', () => {
        const tracks = [
            { kind: 'native' as const, label: '[Fansub] Show.Name.S01E02.JPN.ass' },
            { kind: 'remote' as const, label: 'Show Name - JP subtitles' },
            { kind: 'remote' as const, label: '日語字幕' },
            { kind: 'native' as const, label: 'English subtitles for 君の名は' },
            { kind: 'remote' as const, label: 'native.en-US.srt' },
        ];

        expect(tracks.slice(0, 3).every(isJapaneseSubtitleTrack)).toBe(true);
        expect(isEnglishSubtitleTrack(tracks[3])).toBe(true);
        expect(isJapaneseSubtitleTrack(tracks[3])).toBe(false);
        expect(isEnglishSubtitleTrack(tracks[4])).toBe(true);

        const sorted = [...tracks].sort(compareSubtitleTrackOptions);
        expect(sorted.slice(0, 3).every(isJapaneseSubtitleTrack)).toBe(true);
        expect(sorted.slice(3).every(isEnglishSubtitleTrack)).toBe(true);
    });

    it('applies the same inference to page subtitle sources discovered on any site', () => {
        document.body.innerHTML = `
            <video>
                <track kind="captions" label="Show Name JP" src="/subs/show.episode.01.jp.vtt">
                <track kind="subtitles" label="English subtitles for 君の名は" src="/subs/kimi-no-na-wa.en.srt">
            </video>
            <a href="/downloads/episode-02.jpn.ass">ASS</a>
        `;

        expect(collectPageSubtitleSources(document).map(source => ({
            label: source.label,
            language: source.language,
        }))).toEqual([
            { label: 'Show Name JP', language: 'ja' },
            { label: 'English subtitles for 君の名は', language: 'en' },
            { label: 'episode 02.jpn', language: 'ja' },
        ]);
    });

    it('keeps explicit English hints ahead of Japanese title fallback', () => {
        expect(inferSubtitleLanguage('English subtitles for 葬送のフリーレン')).toBe('en');
        expect(inferSubtitleLanguage('葬送のフリーレン')).toBe('ja');
    });
});
