import { describe, expect, it, vi } from 'vitest';
import { renderAnkiExistingSection } from '../../src/reader/anki/render';
import { resolveAnkiWordAudio } from '../../src/reader/anki/audio';
import { getAudioCandidates } from '../../src/reader/audio/player';
import { audioCandidateSelectionMode, getOrderedAudioSources, preloadableAudioSources } from '../../src/reader/audio/source-resolution';
import { reserveGestureAudioElement } from '../../src/reader/audio/media-activation';
import { builtInProxyUrls, DEFAULT_YOMU_PUBLIC_PROXY_URL } from '../../src/reader/network/proxy-fetch-rules';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { AnkiExistingNote, AnkiLookupResult } from '../../src/reader/anki/index';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

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
            .toEqual(['jpod101', 'language-pod-101', 'jisho', 'jiten-tts', 'jpdb-tts', 'text-to-speech']);
    });

    it('shuffles API text-to-speech voices even when source order is fixed', () => {
        expect(audioCandidateSelectionMode('jiten-tts', 'first')).toBe('random');
        expect(audioCandidateSelectionMode('jpdb-tts', 'first')).toBe('random');
        expect(audioCandidateSelectionMode('jisho', 'first')).toBe('first');
    });

    it('keeps generated API text-to-speech out of fallback preloads', () => {
        const sources = [
            jishoSource(),
            jitenSource(),
            { type: 'jpdb-tts' as const, url: '', voice: '', enabled: true },
            { type: 'text-to-speech' as const, url: '', voice: '', enabled: true },
        ];

        expect(preloadableAudioSources(sources, { ...DEFAULT_SETTINGS, audioTtsMode: 'fallback' }).map(source => source.type))
            .toEqual(['jisho']);
        expect(preloadableAudioSources(sources, { ...DEFAULT_SETTINGS, audioTtsMode: 'source-order' }).map(source => source.type))
            .toEqual(['jisho', 'jiten-tts', 'jpdb-tts']);
    });

    it('keeps term audio and automatic lookup playback enabled by default', () => {
        expect(DEFAULT_SETTINGS.audioEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.autoPlayAudio).toBe(true);
        expect(DEFAULT_SETTINGS.audioAutoPlayMode).toBe('all');
        expect(DEFAULT_SETTINGS.audioEnableDefaultSources).toBe(true);
    });

    it('keeps Anki opt-in on fresh installs and factory resets', () => {
        expect(DEFAULT_SETTINGS.ankiEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.ankiSectionEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.newTabAnkiEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.ankiMobileHandoff).toBe(false);
        expect(DEFAULT_SETTINGS.ankiMineWithJpdb).toBe(false);
    });

    it('extracts Jisho candidates through the userscript path without executing remote HTML', async () => {
        let executed = false;
        (window as typeof window & { __yomuJishoScriptRan?: () => void }).__yomuJishoScriptRan = () => { executed = true; };
        const requested = stubJishoHtml(`
            <script>window.__yomuJishoScriptRan()</script>
            <audio id="audio_読む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3" type="audio/mpeg">
            </audio>
        `);

        try {
            await expectJishoCandidates('読む', 'よむ', [jishoCandidate('yomu')]);
            expect(requested).toEqual(['https://jisho.org/search/%E8%AA%AD%E3%82%80']);
            expect(executed).toBe(false);
        } finally {
            delete (window as typeof window & { __yomuJishoScriptRan?: () => void }).__yomuJishoScriptRan;
            vi.unstubAllGlobals();
        }
    });

    it('keeps all playable source URLs from the exact Jisho audio element', async () => {
        stubJishoHtml(`
            <audio id="audio_読む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3" type="audio/mpeg">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio_ogg/yomu.ogg" type="audio/ogg">
            </audio>
        `);

        try {
            await expectJishoCandidates('読む', 'よむ', [
                jishoCandidate('yomu'),
                {
                    url: 'https://d1vjc5dkcd3yh2.cloudfront.net/audio_ogg/yomu.ogg',
                    sourceUrl: 'https://d1vjc5dkcd3yh2.cloudfront.net/audio_ogg/yomu.ogg',
                },
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses the CORS-readable Jisho text fallback without a proxy or userscript bridge', async () => {
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response('', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(getAudioCandidates(jishoSource(), card('読む', 'よむ'), 1000, ''))
                .resolves.toEqual([]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://r.jina.ai/http://jisho.org/search/');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('skips the default Yomu proxy for Jisho HTML lookup when the userscript bridge is unavailable', async () => {
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(`
            Common word [Audio](http://d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3)
            * よ 読む
        `, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(getAudioCandidates(jishoSource(), card('読む', 'よむ'), 1000, DEFAULT_SETTINGS.corsProxyUrl))
                .resolves.toEqual([jishoCandidate('yomu')]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
            expect(requestedUrl).toContain('https://r.jina.ai/http://jisho.org/search/');
            expect(requestedUrl).not.toContain(DEFAULT_SETTINGS.corsProxyUrl);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('resolves Jiten TTS by public vocabulary lookup for non-Jiten cards', async () => {
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(JSON.stringify({
            results: [{
                wordId: 1467640,
                readingIndex: 0,
                text: '猫',
                rubyText: '猫[ねこ]',
            }],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(getAudioCandidates(jitenSource('asmr'), card('猫', 'ねこ'), 1000, DEFAULT_SETTINGS.corsProxyUrl))
                .resolves.toEqual([{
                    url: 'https://api.jiten.moe/api/tts/word/1467640/0?voice=asmr',
                    sourceUrl: 'https://api.jiten.moe/api/tts/word/1467640/0?voice=asmr',
                }]);
            expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.jiten.moe%2Fapi%2Fvocabulary%2Fsearch');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('routes Jiten sentence TTS through the public proxy when needed', () => {
        const targetUrl = 'https://api.jiten.moe/api/tts/sentence/803776181?voice=asmr';
        const [proxyUrl] = builtInProxyUrls(targetUrl, { method: 'GET' });
        const parsed = new URL(proxyUrl ?? '');

        expect(parsed.origin).toBe(DEFAULT_YOMU_PUBLIC_PROXY_URL);
        expect(parsed.searchParams.get('url')).toBe(targetUrl);
    });

    it('uses a custom proxy for Jisho lookup when the userscript bridge is unavailable', async () => {
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(`
            <audio id="audio_読む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3" type="audio/mpeg">
            </audio>
        `, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(getAudioCandidates(jishoSource(), card('読む', 'よむ'), 1000, 'https://proxy.example/fetch'))
                .resolves.toEqual([jishoCandidate('yomu')]);
            const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
            expect(requestedUrl).toContain('https://proxy.example/fetch?url=');
            expect(requestedUrl).toContain('jisho.org%2Fsearch%2F');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('matches Jisho audio by exact term and reading id instead of reading-only fallbacks', async () => {
        stubJishoHtml(`
            <audio id="audio_違う:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/wrong.mp3" type="audio/mpeg">
            </audio>
        `);

        try {
            await expectJishoCandidates('読む', 'よむ', []);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('allows kana-only Jisho lookups to use the matching reading audio id', async () => {
        stubJishoHtml(`
            <audio id="audio_読む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3" type="audio/mpeg">
            </audio>
        `);

        try {
            await expectJishoCandidates('よむ', 'よむ', [jishoCandidate('yomu')]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('skips ambiguous kana-only Jisho reading matches instead of choosing a homophone', async () => {
        stubJishoHtml(`
            <audio id="audio_読む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/read.mp3" type="audio/mpeg">
            </audio>
            <audio id="audio_詠む:よむ" preload="none">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/recite.mp3" type="audio/mpeg">
            </audio>
        `);

        try {
            await expectJishoCandidates('よむ', 'よむ', []);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('ignores non-audio Jisho source URLs from remote HTML', async () => {
        stubJishoHtml(`
            <audio id="audio_読む:よむ" preload="none">
                <source src="javascript:window.__yomuJishoScriptRan()" type="audio/mpeg">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3" type="audio/mpeg">
            </audio>
        `);

        try {
            await expectJishoCandidates('読む', 'よむ', [jishoCandidate('yomu')]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('ignores malformed Jisho source URLs without failing the exact match', async () => {
        stubJishoHtml(`
            <audio id="audio_読む:よむ" preload="none">
                <source src="http://[not-valid" type="audio/mpeg">
                <source src="//d1vjc5dkcd3yh2.cloudfront.net/audio/yomu.mp3" type="audio/mpeg">
            </audio>
        `);

        try {
            await expectJishoCandidates('読む', 'よむ', [jishoCandidate('yomu')]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps rendered Anki card audio separate from lookup audio actions', () => {
        const note = existingAnkiNote({
            fields: { Audio: '[sound:core-start.mp3]' },
            renderedCards: [{
                cardId: 2050,
                deckName: 'Core',
                question: '<div>始める [sound:core-start.mp3]</div><audio src="core-start.mp3"></audio>',
                answer: '<div>to start</div>',
            }],
        });
        const container = document.createElement('div');
        const lookup: AnkiLookupResult = { state: note.state, primary: note, notes: [note], trusted: true };
        container.innerHTML = renderAnkiExistingSection(lookup, null, {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiSectionEnabled: true,
        });

        expect(container.querySelector('[data-action="anki-media-audio"][data-anki-media-name="core-start.mp3"]')).not.toBeNull();
        expect(container.querySelector('[data-action="search-word-audio"], [data-action="jpdb-example-audio"], [data-action="audio"]')).toBeNull();
        expect(container.textContent).not.toContain('[sound:core-start.mp3]');
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

type AudioCandidate = Awaited<ReturnType<typeof getAudioCandidates>>[number];

function jishoSource(): Parameters<typeof getAudioCandidates>[0] {
    return { type: 'jisho', url: '', voice: '', enabled: true };
}

function jitenSource(voice = ''): Parameters<typeof getAudioCandidates>[0] {
    return { type: 'jiten-tts', url: '', voice, enabled: true };
}

function jishoCandidate(filename: string): AudioCandidate {
    const url = `https://d1vjc5dkcd3yh2.cloudfront.net/audio/${filename}.mp3`;
    return { url, sourceUrl: url };
}

async function expectJishoCandidates(spelling: string, reading: string, candidates: AudioCandidate[]): Promise<void> {
    await expect(getAudioCandidates(jishoSource(), card(spelling, reading), 1000, ''))
        .resolves.toEqual(candidates);
}

function stubJishoHtml(responseText: string): string[] {
    const requested: string[] = [];
    vi.stubGlobal('GM', {
        xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
            requested.push(details.url);
            details.onload?.({
                status: 200,
                responseText,
                response: '',
            });
        },
    });
    return requested;
}

function existingAnkiNote(overrides: Partial<AnkiExistingNote> = {}): AnkiExistingNote {
    return {
        noteId: 99,
        modelName: 'Core 2k',
        deckNames: ['Mining'],
        cardIds: [2050],
        primaryCardId: 2050,
        state: 'due',
        fields: {
            Expression: '始める',
            Reading: 'はじめる',
            Meaning: 'to start',
        },
        renderedCards: [],
        tags: [],
        reps: 3,
        lapses: 0,
        ...overrides,
    };
}
