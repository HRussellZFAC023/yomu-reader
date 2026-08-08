import { afterEach, describe, expect, it } from 'vitest';

import { languageSubtag } from '../../src/reader/languages/locale';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { LEARNING_TARGET_ROSTER, type LearningTargetRosterId } from '../../src/reader/languages/roster';
import { collectPageSubtitleSources } from '../../src/reader/subtitles/subtitle-sources';
import { inferSubtitleLanguage, normalizeSubtitleLanguage } from '../../src/reader/subtitles/subtitle-language';
import { compareSubtitleTrackOptions, isEnglishSubtitleTrack, isTargetLanguageSubtitleTrack } from '../../src/reader/subtitles/subtitle-track-metadata';

const ISO_639_2_ALIAS: Readonly<Record<LearningTargetRosterId, string>> = Object.freeze({
    ja: 'jpn',
    sq: 'sqi',
    grc: 'grc',
    ar: 'ara',
    yue: 'yue',
    zh: 'zho',
    da: 'dan',
    nl: 'nld',
    en: 'eng',
    fi: 'fin',
    fr: 'fra',
    de: 'deu',
    el: 'ell',
    hu: 'hun',
    id: 'ind',
    it: 'ita',
    km: 'khm',
    ko: 'kor',
    lo: 'lao',
    la: 'lat',
    mn: 'mon',
    fa: 'fas',
    pl: 'pol',
    pt: 'por',
    ro: 'ron',
    ru: 'rus',
    sh: 'srp',
    es: 'spa',
    sv: 'swe',
    tl: 'tgl',
    th: 'tha',
    tr: 'tur',
    vi: 'vie',
});

describe('subtitle language inference', () => {
    afterEach(() => resetActiveLearningTargetLanguage());

    it('normalizes codes and recognizes names for every one of the 33 learning targets', () => {
        expect(LEARNING_TARGET_ROSTER).toHaveLength(33);

        for (const target of LEARNING_TARGET_ROSTER) {
            const expectedTag = languageSubtag(target.runtimeLocale)!;
            const regionalTag = new Intl.Locale(target.runtimeLocale).maximize().baseName;
            const isoAlias = ISO_639_2_ALIAS[target.id];

            expect(normalizeSubtitleLanguage(target.id), `${target.id} roster code`).toBe(expectedTag);
            expect(normalizeSubtitleLanguage(regionalTag), `${target.id} regional code`).toBe(expectedTag);
            expect(normalizeSubtitleLanguage(isoAlias), `${target.id} ISO-639-2 alias`).toBe(expectedTag);
            expect(inferSubtitleLanguage(`${target.englishName} subtitles`), `${target.id} English name`).toBe(expectedTag);
            expect(inferSubtitleLanguage(target.nativeName), `${target.id} native name`).toBe(expectedTag);
            expect(
                inferSubtitleLanguage('', `https://media.example/episode.${isoAlias}.vtt`),
                `${target.id} filename alias`,
            ).toBe(expectedTag);

            expect(setActiveLearningTargetLanguage(target.runtimeLocale), `${target.id} activation`).not.toBeNull();
            expect(isTargetLanguageSubtitleTrack({
                kind: 'remote',
                label: target.nativeName,
            }), `${target.id} active target match`).toBe(true);
        }
    });

    it('recognizes fuzzy Japanese and native-language subtitle labels generically', () => {
        const tracks = [
            { kind: 'native' as const, label: '[Fansub] Show.Name.S01E02.JPN.ass' },
            { kind: 'remote' as const, label: 'Show Name - JP subtitles' },
            { kind: 'remote' as const, label: '日語字幕' },
            { kind: 'native' as const, label: 'English subtitles for 君の名は' },
            { kind: 'remote' as const, label: 'native.en-US.srt' },
        ];

        expect(tracks.slice(0, 3).every(isTargetLanguageSubtitleTrack)).toBe(true);
        expect(isEnglishSubtitleTrack(tracks[3])).toBe(true);
        expect(isTargetLanguageSubtitleTrack(tracks[3])).toBe(false);
        expect(isEnglishSubtitleTrack(tracks[4])).toBe(true);

        const sorted = [...tracks].sort(compareSubtitleTrackOptions);
        expect(sorted.slice(0, 3).every(isTargetLanguageSubtitleTrack)).toBe(true);
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

    it('discovers subtitle files declared inside custom player config props', () => {
        document.body.innerHTML = `
            <astro-island props='${JSON.stringify({
                manifest: [0, 'https://media.example/show/master.m3u8'],
                thumbnails: [0, 'https://media.example/show/preview.vtt'],
                subtitles: [1, [
                    [0, { language: [0, 'eng'], name: [0, 'English'], src: [0, 'https://subs.example/show/episode.en.vtt'] }],
                    [0, { language: [0, 'jpn'], name: [0, '日本語'], src: [0, 'https://subs.example/show/episode.ja.ass'] }],
                ]],
            }).replace(/'/g, '&apos;')}'></astro-island>
        `;

        expect(collectPageSubtitleSources(document).map(source => ({
            url: source.url,
            label: source.label,
            language: source.language,
        }))).toEqual([
            {
                url: 'https://subs.example/show/episode.en.vtt',
                label: 'English',
                language: 'en',
            },
            {
                url: 'https://subs.example/show/episode.ja.ass',
                label: '日本語',
                language: 'ja',
            },
        ]);
    });

    it('keeps explicit English hints ahead of Japanese title fallback', () => {
        expect(inferSubtitleLanguage('English subtitles for 葬送のフリーレン')).toBe('en');
        expect(inferSubtitleLanguage('英文字幕')).toBe('en');
        expect(inferSubtitleLanguage('葬送のフリーレン')).toBe('ja');
    });

    it('distinguishes named Han languages instead of treating all Han as Japanese', () => {
        expect(inferSubtitleLanguage('中文字幕')).toBe('zh');
        expect(inferSubtitleLanguage('粵語字幕')).toBe('yue');
        expect(inferSubtitleLanguage('漢字')).toBeUndefined();
    });
});
