import { describe, expect, it, vi } from 'vitest';
import { renderAnkiExistingSection } from '../../src/reader/anki-render';
import { resolveAnkiWordAudio } from '../../src/reader/anki/audio';
import { getAudioCandidates } from '../../src/reader/audio';
import { getOrderedAudioSources } from '../../src/reader/audio-source-resolution';
import { reserveGestureAudioElement } from '../../src/reader/media-activation';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { AnkiExistingNote, AnkiLookupResult } from '../../src/reader/anki';
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
