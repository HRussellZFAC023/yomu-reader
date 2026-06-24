import { describe, expect, it, vi } from 'vitest';
import { renderAnkiExistingSection } from '../../src/reader/anki/render';
import { resolveAnkiWordAudio } from '../../src/reader/anki/audio';
import { AudioPlayer, getAudioCandidates } from '../../src/reader/audio/player';
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

    it('keeps built-in lookup source fallbacks in source resolution', () => {
        expect(getOrderedAudioSources({ ...DEFAULT_SETTINGS, audioSources: [] }).map(source => source.type))
            .toEqual(['jpod101', 'language-pod-101', 'jisho', 'jiten-tts', 'jpdb-tts', 'text-to-speech']);
    });

    it('shuffles API text-to-speech voices even when source order is fixed', () => {
        expect(audioCandidateSelectionMode('jiten-tts', 'first')).toBe('random');
        expect(audioCandidateSelectionMode('jpdb-tts', 'first')).toBe('random');
        expect(audioCandidateSelectionMode('jisho', 'first')).toBe('first');
    });

    it('keeps the configured source list at the front, appending only missing built-in defaults', () => {
        const custom = customJsonSource('http://localhost:9090/?term={term}&reading={reading}');
        const ordered = getOrderedAudioSources({ ...DEFAULT_SETTINGS, audioSources: [custom, jishoSource()] })
            .map(source => source.type);

        expect(ordered[0]).toBe('custom-json');
        expect(ordered[1]).toBe('jisho');
        // Defaults are appended after the user's list, never reordered ahead of it.
        expect(ordered).toContain('jpod101');
        expect(ordered.indexOf('custom-json')).toBeLessThan(ordered.indexOf('jpod101'));
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

    it('does not provide built-in public proxy URLs for Jiten sentence TTS', () => {
        const targetUrl = 'https://api.jiten.moe/api/tts/sentence/803776181?voice=asmr';
        expect(builtInProxyUrls(targetUrl, { method: 'GET' })).toEqual([]);
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

    it('does not wait on Web Audio fallback when hover autoplay has no browser activation', async () => {
        const previousActivation = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
        Object.defineProperty(navigator, 'userActivation', {
            configurable: true,
            value: { hasBeenActive: false, isActive: false },
        });
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
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
            const audio = document.createElement('audio');
            audio.src = 'blob:http://localhost/blocked-hover-audio';

            const result = await Promise.race([
                internals.playPreparedAudio(audio, 0, () => true).then(
                    () => 'played',
                    error => error instanceof Error ? error.message : String(error),
                ),
                new Promise(resolve => window.setTimeout(() => resolve('pending'), 0)),
            ]);

            expect(result).toBe('NotAllowedError');
            expect(audioContexts).toBe(0);
        } finally {
            if (previousActivation) Object.defineProperty(navigator, 'userActivation', previousActivation);
            else delete (navigator as unknown as { userActivation?: Navigator['userActivation'] }).userActivation;
            if (previousAudioContext) Object.defineProperty(window, 'AudioContext', previousAudioContext);
            else delete (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
            play.mockRestore();
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

function customJsonSource(url: string): Parameters<typeof getAudioCandidates>[0] {
    return { type: 'custom-json', url, voice: '', enabled: true };
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
