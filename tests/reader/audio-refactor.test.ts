import { describe, expect, it, vi } from 'vitest';
import { renderAnkiExistingSection } from '../../src/reader/anki/render';
import { resolveAnkiWordAudio } from '../../src/reader/anki/audio';
import { AudioPlayer, getAudioCandidates } from '../../src/reader/audio/player';
import {
    shouldFetchCandidateAsBlob,
    shouldFetchDirectMediaAsBlob,
    shouldForceBlobAudioCandidate,
} from '../../src/reader/audio/candidates';
import { ReaderAudioActions } from '../../src/reader/audio/actions';
import { audioCandidateSelectionMode, getOrderedAudioSources, orderAudioSources, preloadableAudioSources } from '../../src/reader/audio/source-resolution';
import { reserveGestureAudioElement } from '../../src/reader/audio/media-activation';
import { createPageMediaUrl } from '../../src/reader/app/page-media-url';
import { builtInProxyUrls } from '../../src/reader/network/proxy-fetch-rules';
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

    it('keeps Yomu hosted audio as the sole default lookup source', () => {
        expect(getOrderedAudioSources({ ...DEFAULT_SETTINGS, audioSources: [] }).map(source => source.type))
            .toEqual(['custom-json']);
    });

    it('shuffles API text-to-speech voices even when source order is fixed', () => {
        expect(audioCandidateSelectionMode('jiten-tts', 'first')).toBe('random');
        expect(audioCandidateSelectionMode('jpdb-tts', 'first')).toBe('random');
        expect(audioCandidateSelectionMode('jisho', 'first')).toBe('first');
    });

    it('keeps Yomu-hosted audio first while preserving explicitly enabled configured sources', () => {
        const custom = customJsonSource('http://localhost:9090/?term={term}&reading={reading}');
        const ordered = getOrderedAudioSources({ ...DEFAULT_SETTINGS, audioSources: [custom, jishoSource()] });

        expect(ordered[0]).toMatchObject({
            type: 'custom-json',
            url: 'https://audio.yomureader.com/?term={term}&reading={reading}',
        });
        expect(ordered[1]).toMatchObject({ type: 'custom-json', url: 'http://localhost:9090/?term={term}&reading={reading}' });
        expect(ordered[2]?.type).toBe('jisho');
        expect(ordered.map(source => source.type)).toEqual(['custom-json', 'custom-json', 'jisho']);
    });

    it('plays sources strictly in their authored order without reshuffling the priority list', () => {
        const sources = [
            customJsonSource('http://localhost:9090/?term={term}&reading={reading}'),
            { type: 'jpod101' as const, url: '', voice: '', enabled: true },
            jishoSource(),
        ];

        expect(orderAudioSources(sources, card('猫', 'ねこ')).map(entry => entry.source.type))
            .toEqual(['custom-json', 'jpod101', 'jisho']);
        // Deterministic across cards and repeated calls — the list is the priority, not a shuffle bag.
        expect(orderAudioSources(sources, card('犬', 'いぬ')).map(entry => entry.source.type))
            .toEqual(['custom-json', 'jpod101', 'jisho']);
    });

    it('resolves a custom JSON audio server (e.g. http://localhost:9090) into ordered clips', async () => {
        const requested = stubAudioServerJson({
            type: 'audioSourceList',
            audioSources: [
                { name: 'daijisen ね＼こ [1]', url: 'http://localhost:9090/audio/daijisen/media/s1.mp3' },
                { name: 'nhk16 ネ＼コ [1]', url: 'http://localhost:9090/audio/nhk16/media/x.mp3' },
                { name: 'forvo_jp akitomo', url: 'http://localhost:9090/audio/forvo_jp/akitomo/neko.mp3' },
            ],
        });

        try {
            const source = customJsonSource('http://localhost:9090/?term={term}&reading={reading}');
            const candidates = await getAudioCandidates(source, card('猫', 'ねこ'), 1000, '');

            expect(candidates.map(candidate => candidate.url)).toEqual([
                'http://localhost:9090/audio/daijisen/media/s1.mp3',
                'http://localhost:9090/audio/nhk16/media/x.mp3',
                'http://localhost:9090/audio/forvo_jp/akitomo/neko.mp3',
            ]);
            expect(requested[0]).toContain('localhost:9090');
            expect(requested[0]).toContain(encodeURIComponent('猫'));
            expect(requested[0]).toContain(encodeURIComponent('ねこ'));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps loopback audio on direct media playback so hosted Study does not fetch-CORS fail before playing', () => {
        expect(shouldForceBlobAudioCandidate({
            url: 'http://localhost:9090/audio/jpod/media/clip.mp3',
            sourceUrl: 'http://localhost:9090/?term=%E6%B7%B7%E6%B5%B4&reading=%E3%81%93%E3%82%93%E3%82%88%E3%81%8F',
        })).toBe(false);
        expect(shouldFetchCandidateAsBlob({
            url: 'http://localhost:9090/audio/jpod/media/clip.mp3',
            sourceUrl: 'http://localhost:9090/?term=%E6%B7%B7%E6%B5%B4&reading=%E3%81%93%E3%82%93%E3%82%88%E3%81%8F',
        }, true)).toBe(false);
        expect(shouldFetchDirectMediaAsBlob('http://localhost:9090/audio/jpod/media/clip.mp3')).toBe(false);
        expect(shouldFetchCandidateAsBlob({
            url: 'https://audio.example.test/audio/clip.mp3',
            sourceUrl: 'https://audio.example.test/audio/clip.mp3',
        }, true)).toBe(true);
    });

    it('appends term/reading to a bare custom JSON server URL so it does not 400', async () => {
        const requested = stubAudioServerJson({
            type: 'audioSourceList',
            audioSources: [{ name: 'daijisen よ＼む [1]', url: 'http://localhost:9090/audio/daijisen/media/s1.mp3' }],
        });

        try {
            const source = customJsonSource('http://localhost:9090/');
            const candidates = await getAudioCandidates(source, card('読む', 'よむ'), 1000, '');

            expect(candidates.map(candidate => candidate.url)).toEqual(['http://localhost:9090/audio/daijisen/media/s1.mp3']);
            expect(requested[0]).toBe(`http://localhost:9090/?term=${encodeURIComponent('読む')}&reading=${encodeURIComponent('よむ')}`);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('joins auto-added term/reading with & when the server URL already has a query', async () => {
        const requested = stubAudioServerJson({ type: 'audioSourceList', audioSources: [] });

        try {
            await getAudioCandidates(customJsonSource('http://localhost:9090/?user=henry'), card('読む', 'よむ'), 1000, '');
            expect(requested[0]).toBe(`http://localhost:9090/?user=henry&term=${encodeURIComponent('読む')}&reading=${encodeURIComponent('よむ')}`);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('leaves an explicit {term}/{reading} server URL untouched', async () => {
        const requested = stubAudioServerJson({ type: 'audioSourceList', audioSources: [] });

        try {
            await getAudioCandidates(customJsonSource('http://localhost:9090/?reading={reading}&term={term}'), card('読む', 'よむ'), 1000, '');
            expect(requested[0]).toBe(`http://localhost:9090/?reading=${encodeURIComponent('よむ')}&term=${encodeURIComponent('読む')}`);
        } finally {
            vi.unstubAllGlobals();
        }
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


    it('does not suppress successful autoplay for a fresh hover generation', async () => {
        let hoverGeneration = 1;
        const play = vi.fn(async () => true);
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => hoverGeneration,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        await actions.playTermAudio(card('猫', 'ねこ'), { hoverLookupGeneration: 1, autoPlay: true });
        hoverGeneration = 2;
        await actions.playTermAudio(card('猫', 'ねこ'), { hoverLookupGeneration: 2, autoPlay: true });

        expect(play).toHaveBeenCalledTimes(2);
        expect(play).toHaveBeenNthCalledWith(1, expect.any(Object), expect.objectContaining({
            reservedGesture: true,
            isCurrent: expect.any(Function),
        }));
    });

    it('starts each fresh hover autoplay generation even when earlier hover audio is still pending', async () => {
        let hoverGeneration = 1;
        const resolvePlay: Array<(played: boolean) => void> = [];
        const playOptions: Array<{ reservedGesture?: boolean; isCurrent?: () => boolean } | undefined> = [];
        const play = vi.fn((_card: JPDBCard, options?: { reservedGesture?: boolean; isCurrent?: () => boolean }) => {
            playOptions.push(options);
            return new Promise<boolean>(resolve => { resolvePlay.push(resolve); });
        });
        const actions = new ReaderAudioActions({
            audio: { play } as unknown as AudioPlayer,
            getSettings: () => ({ ...DEFAULT_SETTINGS, audioEnabled: true }),
            getActivePopover: () => undefined,
            getHoverLookupGeneration: () => hoverGeneration,
            stopImmersionAudio: vi.fn(),
            toast: vi.fn(),
        });

        const first = actions.playTermAudio(card('猫', 'ねこ'), { hoverLookupGeneration: 1, autoPlay: true });
        hoverGeneration = 2;
        const second = actions.playTermAudio(card('猫', 'ねこ'), { hoverLookupGeneration: 2, autoPlay: true });
        hoverGeneration = 3;
        const third = actions.playTermAudio(card('犬', 'いぬ'), { hoverLookupGeneration: 3, autoPlay: true });

        expect(play).toHaveBeenCalledTimes(3);
        resolvePlay.forEach(resolve => resolve(true));
        await Promise.all([first, second, third]);
        expect(playOptions).toEqual([
            expect.objectContaining({ reservedGesture: true, isCurrent: expect.any(Function) }),
            expect.objectContaining({ reservedGesture: true, isCurrent: expect.any(Function) }),
            expect.objectContaining({ reservedGesture: true, isCurrent: expect.any(Function) }),
        ]);
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

    it('skips proxying Jisho HTML lookup when no custom proxy or userscript bridge is available', async () => {
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
            expect(requestedUrl).not.toContain('?url=');
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
            await expect(getAudioCandidates(jitenSource('asmr'), card('猫', 'ねこ'), 1000, 'https://proxy.example/fetch'))
                .resolves.toEqual([{
                    url: 'https://api.jiten.moe/api/tts/word/1467640/0?voice=asmr',
                    sourceUrl: 'https://api.jiten.moe/api/tts/word/1467640/0?voice=asmr',
                }]);
            expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.jiten.moe%2Fapi%2Fvocabulary%2Fsearch');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('provides built-in public proxy URLs for Jiten sentence TTS on any origin', () => {
        const targetUrl = 'https://api.jiten.moe/api/tts/sentence/803776181?voice=asmr';
        expect(builtInProxyUrls(targetUrl, { method: 'GET' })).toEqual([
            `https://edge.yomureader.com/?url=${encodeURIComponent(targetUrl)}`,
            `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(targetUrl)}`,
        ]);
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
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
            pathname: '/yomu-reader/',
        });

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
        }, { trustedAccountDataSurface: true });

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

    it('lets autoplay consume a recent gesture audio reservation', async () => {
        const plays: Array<{ element: HTMLMediaElement; loop: boolean; src: string }> = [];
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            plays.push({ element: this, loop: this.loop, src: this.src });
            return Promise.resolve();
        });
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'custom', url: 'http://x.test/hover-word.mp3', voice: '', enabled: true }],
            }));

            expect(player.primeUserGesture()).toBe(true);
            await expect(player.play(card('読む', 'よむ'), { reservedGesture: true })).resolves.toBe(true);

            expect(plays).toHaveLength(2);
            expect(plays[0]?.loop).toBe(true);
            expect(plays[0]?.src).toContain('data:audio/wav;base64,');
            expect(plays[1]?.element).toBe(plays[0]?.element);
            expect(plays[1]?.loop).toBe(false);
            expect(plays[1]?.src).toBe('http://x.test/hover-word.mp3');
        } finally {
            play.mockRestore();
            pause.mockRestore();
            load.mockRestore();
        }
    });

    it('releases a pending gesture reservation when its runtime is destroyed', () => {
        vi.useFakeTimers();
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const player = new AudioPlayer(() => ({ ...DEFAULT_SETTINGS, audioEnabled: true }));

        try {
            expect(player.primeUserGesture()).toBe(true);
            expect(vi.getTimerCount()).toBe(1);

            player.destroy();

            expect(vi.getTimerCount()).toBe(0);
            expect(pause).toHaveBeenCalledTimes(1);
        } finally {
            player.destroy();
            play.mockRestore();
            pause.mockRestore();
            vi.useRealTimers();
        }
    });

    it('reuses the Safari-authorized media element after hover closes and opens again', async () => {
        let authorizedAudio: HTMLMediaElement | undefined;
        const playedElements: HTMLMediaElement[] = [];
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            if (!authorizedAudio) authorizedAudio = this;
            if (this !== authorizedAudio) return Promise.reject(new DOMException('Playback requires user activation', 'NotAllowedError'));
            playedElements.push(this);
            return Promise.resolve();
        });
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'custom', url: 'http://x.test/repeated-hover.mp3', voice: '', enabled: true }],
            }));

            await expect(player.play(card('読む', 'よむ'), { reservedGesture: true })).resolves.toBe(true);
            player.stop();
            await expect(player.play(card('読む', 'よむ'), { reservedGesture: true })).resolves.toBe(true);

            expect(playedElements).toHaveLength(2);
            expect(playedElements[1]).toBe(playedElements[0]);
            expect(pause).toHaveBeenCalled();
        } finally {
            play.mockRestore();
            pause.mockRestore();
            load.mockRestore();
        }
    });

    it('keeps the popover audio accent active until playback ends or is stopped', async () => {
        let activeAudio: HTMLMediaElement | undefined;
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            activeAudio = this;
            return Promise.resolve();
        });
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);

        try {
            const settings: ReaderSettings = {
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
                audioEnableDefaultSources: false,
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'custom', url: 'http://x.test/playing-state.mp3', voice: '', enabled: true }],
            };
            const player = new AudioPlayer(() => settings);
            const actions = new ReaderAudioActions({
                audio: player,
                getSettings: () => settings,
                getActivePopover: () => popover,
                getHoverLookupGeneration: () => 0,
                stopImmersionAudio: vi.fn(),
                toast: vi.fn(),
            });

            await actions.playTermAudio(card('猫', 'ねこ'));

            expect(popover.dataset.audioLoading).toBeUndefined();
            expect(popover.dataset.audioPlaying).toBe('true');
            activeAudio?.dispatchEvent(new Event('ended'));
            expect(popover.dataset.audioPlaying).toBeUndefined();

            await actions.playTermAudio(card('犬', 'いぬ'));
            expect(popover.dataset.audioPlaying).toBe('true');
            player.stop();
            expect(popover.dataset.audioPlaying).toBeUndefined();
        } finally {
            popover.remove();
            play.mockRestore();
            pause.mockRestore();
            load.mockRestore();
        }
    });

    it('keeps a gesture-primed audio channel reusable across repeated hover stops', async () => {
        const authorizedAudio = new WeakSet<HTMLMediaElement>();
        const playedElements: HTMLMediaElement[] = [];
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
            if (this.src.startsWith('data:audio/wav;base64,')) authorizedAudio.add(this);
            if (!authorizedAudio.has(this)) return Promise.reject(new DOMException('Playback requires user activation', 'NotAllowedError'));
            playedElements.push(this);
            return Promise.resolve();
        });
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: false,
                audioFallbackChimeEnabled: false,
                audioSources: [{ type: 'custom', url: 'http://x.test/pencil-hover.mp3', voice: '', enabled: true }],
            }));

            expect(player.primeUserGesture()).toBe(true);
            await expect(player.play(card('猫', 'ねこ'), { reservedGesture: true })).resolves.toBe(true);
            player.stop();
            await expect(player.play(card('犬', 'いぬ'), { reservedGesture: true })).resolves.toBe(true);

            expect(playedElements).toHaveLength(3);
            expect(new Set(playedElements).size).toBe(1);
        } finally {
            play.mockRestore();
            pause.mockRestore();
            load.mockRestore();
        }
    });

    it('does not let a stale hover retarget the shared Safari audio channel', async () => {
        const player = new AudioPlayer(() => ({ ...DEFAULT_SETTINGS, audioEnabled: true }));
        const audio = document.createElement('audio');
        audio.src = 'http://x.test/current-hover.mp3';
        const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
        const internals = player as unknown as {
            createReadyAudioForRequest(
                audioUrl: string,
                audio: HTMLAudioElement,
                requestId?: number,
                isCurrent?: () => boolean,
            ): Promise<HTMLAudioElement>;
        };

        try {
            await expect(internals.createReadyAudioForRequest(
                'http://x.test/stale-hover.mp3',
                audio,
                0,
                () => false,
            )).resolves.toBe(audio);

            expect(audio.src).toBe('http://x.test/current-hover.mp3');
            expect(load).not.toHaveBeenCalled();
        } finally {
            load.mockRestore();
        }
    });

    it('does not wait on Web Audio fallback when hover autoplay has no browser activation', async () => {
        const previousActivation = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
        Object.defineProperty(navigator, 'userActivation', {
            configurable: true,
            value: { hasBeenActive: false, isActive: false },
        });
        const previousAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        let audioContexts = 0;
        class BlockedAudioContext {
            state = 'suspended';
            constructor() {
                audioContexts += 1;
            }
            resume(): Promise<void> {
                return new Promise(() => undefined);
            }
            close(): Promise<void> {
                return Promise.resolve();
            }
        }
        vi.stubGlobal('AudioContext', BlockedAudioContext);
        Object.defineProperty(window, 'AudioContext', {
            configurable: true,
            value: BlockedAudioContext,
        });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            arrayBuffer: async () => new ArrayBuffer(4),
        })));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
            }));
            const internals = player as unknown as {
                playPreparedAudio(audio: HTMLAudioElement, requestId: number, isCurrent: () => boolean): Promise<boolean>;
            };
            const blockedPlay = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
            const audio = {
                src: 'blob:http://localhost/blocked-hover-audio',
                readyState: HTMLMediaElement.HAVE_NOTHING,
                currentTime: 0,
                pause: vi.fn(),
                play: blockedPlay,
            } as unknown as HTMLAudioElement;

            const result = await Promise.race([
                internals.playPreparedAudio(audio, 0, () => true).then(
                    () => 'played',
                    error => error instanceof Error ? error.message : String(error),
                ),
                new Promise(resolve => window.setTimeout(() => resolve('pending'), 0)),
            ]);

            expect(result).toBe('NotAllowedError');
            expect(blockedPlay).toHaveBeenCalledTimes(1);
            expect(audioContexts).toBe(0);
        } finally {
            if (previousActivation) Object.defineProperty(navigator, 'userActivation', previousActivation);
            else delete (navigator as unknown as { userActivation?: Navigator['userActivation'] }).userActivation;
            if (previousAudioContext) Object.defineProperty(window, 'AudioContext', previousAudioContext);
            else delete (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
            vi.unstubAllGlobals();
        }
    });

    it('retries a repeated single API audio source before falling through to browser TTS', async () => {
        const media = recordMediaElementPlayback();
        const { speak } = stubJapaneseSpeechSynthesis();

        try {
            const player = new AudioPlayer(() => jitenThenBrowserTtsSettings());
            const target = jitenAudioCard('猫', 'ねこ');

            await expect(player.play(target, { userGesture: true })).resolves.toBe(true);
            media.playedSources.length = 0;
            speak.mockClear();

            await expect(player.play(target, { userGesture: true })).resolves.toBe(true);

            expect(media.playedSources.some(src => src.includes('/api/tts/word/1467640/0?voice=asmr'))).toBe(true);
            expect(speak).not.toHaveBeenCalled();
        } finally {
            media.restore();
            vi.unstubAllGlobals();
        }
    });

    it('does not cache empty fallible API candidate lookups before TTS fallback', async () => {
        const media = recordMediaElementPlayback();
        const { speak } = stubJapaneseSpeechSynthesis();
        let networkAvailable = false;
        const fetchMock = vi.fn(async () => {
            if (!networkAvailable) throw new TypeError('temporary network failure');
            return new Response(JSON.stringify({
                results: [{
                    wordId: 1467640,
                    readingIndex: 0,
                    text: '猫',
                    rubyText: '猫[ねこ]',
                }],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const player = new AudioPlayer(() => jitenThenBrowserTtsSettings({
                corsProxyUrl: 'https://proxy.example/fetch',
            }));
            const target = card('猫', 'ねこ');

            await expect(player.play(target, { userGesture: true })).resolves.toBe(true);
            expect(speak).toHaveBeenCalledTimes(1);
            const failedLookupAttempts = fetchMock.mock.calls.length;

            networkAvailable = true;
            media.playedSources.length = 0;
            speak.mockClear();

            await expect(player.play(target, { userGesture: true })).resolves.toBe(true);

            expect(fetchMock.mock.calls.length).toBeGreaterThan(failedLookupAttempts);
            expect(media.playedSources.some(src => src.includes('/api/tts/word/1467640/0?voice=asmr'))).toBe(true);
            expect(speak).not.toHaveBeenCalled();
        } finally {
            media.restore();
            vi.unstubAllGlobals();
        }
    });

    it('falls back to Jiten TTS for Jiten-backed kana words when hosted audio has no clip', async () => {
        const requested = stubAudioServerJson({ type: 'audioSourceList', audioSources: [] });
        const media = recordMediaElementPlayback();
        const { speak } = stubJapaneseSpeechSynthesis();

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
                audioEnableDefaultSources: true,
                audioSources: [],
                audioFallbackChimeEnabled: false,
                audioTtsMode: 'fallback',
            }));
            const target: JPDBCard = {
                ...card('よむ', 'よむ'),
                vid: 1456360,
                sid: 3,
                source: 'jiten',
                jitenWordId: 1456360,
                jitenReadingIndex: 3,
            };

            await expect(player.play(target, { userGesture: true })).resolves.toBe(true);

            expect(requested[0]).toBe(`https://audio.yomureader.com/?term=${encodeURIComponent('よむ')}&reading=${encodeURIComponent('よむ')}`);
            expect(media.playedSources.some(src => src.includes('/api/tts/word/1456360/3?voice='))).toBe(true);
            expect(speak).not.toHaveBeenCalled();
        } finally {
            media.restore();
            vi.unstubAllGlobals();
        }
    });

    it('decodes the retained blob bytes for the Web Audio fallback without re-fetching the URL', async () => {
        const previousActivation = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
        Object.defineProperty(navigator, 'userActivation', {
            configurable: true,
            value: { hasBeenActive: true, isActive: true },
        });
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotSupportedError'));
        const previousAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        let decodedBytes = -1;
        let started = 0;
        class WorkingAudioContext {
            state = 'running';
            currentTime = 0;
            resume(): Promise<void> { return Promise.resolve(); }
            close(): Promise<void> { return Promise.resolve(); }
            async decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer> {
                decodedBytes = buffer.byteLength;
                return { length: 3 } as unknown as AudioBuffer;
            }
            createBufferSource() {
                const node: { buffer: AudioBuffer | null; connect: () => void; start: () => void; onended: null | (() => void) } = {
                    buffer: null,
                    connect() { return undefined; },
                    start() { started += 1; node.onended?.(); },
                    onended: null,
                };
                return node as unknown as AudioBufferSourceNode;
            }
            get destination() { return {} as AudioDestinationNode; }
        }
        Object.defineProperty(window, 'AudioContext', { configurable: true, value: WorkingAudioContext });
        // jsdom omits the object-URL APIs; provide stand-ins for createPageMediaUrl.
        const previousCreate = (URL as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
        const previousRevoke = (URL as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
        let objectUrlSeq = 0;
        URL.createObjectURL = () => `blob:http://localhost/retained-${++objectUrlSeq}`;
        URL.revokeObjectURL = () => undefined;
        // A strict page CSP refuses fetch() of a blob: URL — the fallback must not rely on it.
        const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        vi.stubGlobal('fetch', fetchMock);

        try {
            // Registers the source bytes behind the blob: URL, the way real playback does.
            // jsdom's Blob omits arrayBuffer() (a real browser API, exercised by the smoke
            // test), so provide it on the instance the registry will hand back.
            const sourceBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: 'audio/mpeg' });
            Object.defineProperty(sourceBlob, 'arrayBuffer', { configurable: true, value: async () => new Uint8Array([1, 2, 3, 4, 5, 6]).buffer });
            const audioUrl = await createPageMediaUrl(sourceBlob, 'https://audio.example.test/clip.mp3');
            const player = new AudioPlayer(() => ({ ...DEFAULT_SETTINGS, audioEnabled: true }));
            const internals = player as unknown as {
                playPreparedAudio(audio: HTMLAudioElement, requestId: number, isCurrent: () => boolean, options?: { userGesture?: boolean }): Promise<boolean>;
            };
            const audio = document.createElement('audio');
            audio.src = audioUrl;

            await expect(internals.playPreparedAudio(audio, 0, () => true, { userGesture: true })).resolves.toBe(true);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(decodedBytes).toBe(6);
            expect(started).toBe(1);
        } finally {
            if (previousActivation) Object.defineProperty(navigator, 'userActivation', previousActivation);
            else delete (navigator as unknown as { userActivation?: Navigator['userActivation'] }).userActivation;
            if (previousAudioContext) Object.defineProperty(window, 'AudioContext', previousAudioContext);
            else delete (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
            if (previousCreate) URL.createObjectURL = previousCreate;
            else delete (URL as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
            if (previousRevoke) URL.revokeObjectURL = previousRevoke;
            else delete (URL as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
            play.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('recovers a media-src-blocked candidate through the Web Audio fallback in playMediaCandidates', async () => {
        const previousActivation = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
        Object.defineProperty(navigator, 'userActivation', {
            configurable: true,
            value: { hasBeenActive: true, isActive: true },
        });
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotSupportedError'));
        const previousAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        let decodedBytes = -1;
        let started = 0;
        class WorkingAudioContext {
            state = 'running';
            currentTime = 0;
            resume(): Promise<void> { return Promise.resolve(); }
            close(): Promise<void> { return Promise.resolve(); }
            async decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer> {
                decodedBytes = buffer.byteLength;
                return { length: 3 } as unknown as AudioBuffer;
            }
            createBufferSource() {
                const node: { buffer: AudioBuffer | null; connect: () => void; start: () => void; onended: null | (() => void) } = {
                    buffer: null,
                    connect() { return undefined; },
                    start() { started += 1; node.onended?.(); },
                    onended: null,
                };
                return node as unknown as AudioBufferSourceNode;
            }
            get destination() { return {} as AudioDestinationNode; }
        }
        Object.defineProperty(window, 'AudioContext', { configurable: true, value: WorkingAudioContext });
        const previousCreate = (URL as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
        const previousRevoke = (URL as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
        let objectUrlSeq = 0;
        URL.createObjectURL = () => `blob:http://localhost/immersion-${++objectUrlSeq}`;
        URL.revokeObjectURL = () => undefined;
        const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        vi.stubGlobal('fetch', fetchMock);

        try {
            const sourceBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: 'audio/mpeg' });
            Object.defineProperty(sourceBlob, 'arrayBuffer', { configurable: true, value: async () => new Uint8Array([1, 2, 3, 4, 5, 6]).buffer });
            const blobUrl = await createPageMediaUrl(sourceBlob, 'https://media.test/line.mp3');
            const player = new AudioPlayer(() => ({ ...DEFAULT_SETTINGS, audioEnabled: true }));

            await expect(player.playMediaCandidates([blobUrl], { playbackRate: 1.5 })).resolves.toBe(true);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(decodedBytes).toBe(6);
            expect(started).toBe(1);
        } finally {
            if (previousActivation) Object.defineProperty(navigator, 'userActivation', previousActivation);
            else delete (navigator as unknown as { userActivation?: Navigator['userActivation'] }).userActivation;
            if (previousAudioContext) Object.defineProperty(window, 'AudioContext', previousAudioContext);
            else delete (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
            if (previousCreate) URL.createObjectURL = previousCreate;
            else delete (URL as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
            if (previousRevoke) URL.revokeObjectURL = previousRevoke;
            else delete (URL as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
            play.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('stops waiting when media playback never starts', async () => {
        vi.useFakeTimers();
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise(() => undefined));
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
            }));
            const internals = player as unknown as {
                playPreparedAudio(audio: HTMLAudioElement, requestId: number, isCurrent: () => boolean): Promise<boolean>;
            };
            const audio = document.createElement('audio');
            audio.src = 'https://audio.example.test/stuck.mp3';

            const result = internals.playPreparedAudio(audio, 0, () => true);
            await vi.advanceTimersByTimeAsync(2000);

            await expect(result).resolves.toBe(false);
            expect(play).toHaveBeenCalledTimes(1);
            expect(pause).toHaveBeenCalledTimes(1);
        } finally {
            play.mockRestore();
            pause.mockRestore();
            vi.useRealTimers();
        }
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

function browserTextToSpeechSource(): Parameters<typeof getAudioCandidates>[0] {
    return { type: 'text-to-speech', url: '', voice: '', enabled: true };
}

function customJsonSource(url: string): Parameters<typeof getAudioCandidates>[0] {
    return { type: 'custom-json', url, voice: '', enabled: true };
}

function jitenAudioCard(spelling: string, reading: string): JPDBCard {
    return {
        ...card(spelling, reading),
        jitenWordId: 1467640,
        jitenReadingIndex: 0,
    };
}

function jitenThenBrowserTtsSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        audioEnabled: true,
        audioEnableDefaultSources: false,
        audioSelectionMode: 'random',
        audioTtsMode: 'fallback',
        audioViaBlob: false,
        audioFallbackChimeEnabled: false,
        audioSources: [jitenSource('asmr'), browserTextToSpeechSource()],
        ...overrides,
    };
}

function recordMediaElementPlayback(): {
    playedSources: string[];
    restore: () => void;
} {
    const playedSources: string[] = [];
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
        playedSources.push(this.src);
        return Promise.resolve();
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    return {
        playedSources,
        restore: () => {
            play.mockRestore();
            pause.mockRestore();
            load.mockRestore();
        },
    };
}

function stubJapaneseSpeechSynthesis() {
    class FakeSpeechSynthesisUtterance {
        lang = '';
        voice: SpeechSynthesisVoice | null = null;
        onend: ((event: SpeechSynthesisEvent) => void) | null = null;
        onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
        constructor(public text: string) {}
    }
    const speak = vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
        utterance.onend?.call(utterance as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent);
    });
    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
    vi.stubGlobal('speechSynthesis', {
        getVoices: () => [{ name: 'Kyoko', lang: 'ja-JP' }],
        speak,
        cancel: vi.fn(),
    });
    return { speak };
}

function stubAudioServerJson(payload: unknown): string[] {
    const requested: string[] = [];
    vi.stubGlobal('GM', {
        xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
            requested.push(details.url);
            details.onload?.({
                status: 200,
                responseText: JSON.stringify(payload),
                response: '',
            });
        },
    });
    return requested;
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
