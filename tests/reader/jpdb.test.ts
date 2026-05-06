import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { findAudioUrl, findAudioUrls, formatAudioUrl } from '../../src/reader/audio';
import { applyTokensToTextNode, collectTextTargetsIn, renderTokensToHtml } from '../../src/reader/dom';
import { splitJapaneseSentences } from '../../src/reader/jpdb';
import { normalizeOcrResult, readFallbackOcrResult } from '../../src/reader/ocr';
import { formatPartOfSpeech } from '../../src/reader/pos';
import { DEFAULT_SETTINGS, matchesShortcut, normalizeAudioSources } from '../../src/reader/settings';
import { parseSubtitleText } from '../../src/reader/subtitles';
import { YomitanDictionaryStore, glossaryToHtml, glossaryToText, parseYomitanSettingsExport } from '../../src/reader/yomitan';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

const card: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '食べる',
    reading: 'たべる',
    frequencyRank: 100,
    partOfSpeech: ['v1'],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: ['LHH'],
    wordWithReading: null,
};

describe('reader helpers', () => {
    it('formats Yomitan-compatible audio URLs', () => {
        expect(formatAudioUrl('http://x.test/?term={term}&reading={reading}&language={language}', card))
            .toBe('http://x.test/?term=%E9%A3%9F%E3%81%B9%E3%82%8B&reading=%E3%81%9F%E3%81%B9%E3%82%8B&language=ja');
    });

    it('extracts nested audio URLs from JSON-ish responses', () => {
        expect(findAudioUrl({ sources: [{ name: 'miss' }, { audio: [{ url: 'http://x.test/audio.mp3' }] }] }))
            .toBe('http://x.test/audio.mp3');
        expect(findAudioUrls({ audioSources: [{ url: 'http://x.test/1.mp3' }, { url: 'http://x.test/2.mp3' }] }))
            .toEqual(['http://x.test/1.mp3', 'http://x.test/2.mp3']);
    });

    it('rewrites localhost audio URLs returned by a Tailnet custom-json source', () => {
        expect(findAudioUrl(
            { audioSources: [{ url: 'http://localhost:8080/audio/nhk\\media\\x.mp3' }] },
            'http://desktop-vp4io57.tail099f7d.ts.net:8080/?term=青空&reading=あおぞら',
        )).toBe('http://desktop-vp4io57.tail099f7d.ts.net:8080/audio/nhk/media/x.mp3');
    });

    it('keeps quoted Japanese sentences together', () => {
        expect(splitJapaneseSentences('これは犬です。「本当ですか？」はい。')).toEqual([
            'これは犬です。',
            '「本当ですか？」',
            'はい。',
        ]);
    });

    it('matches configurable shortcuts', () => {
        const event = new KeyboardEvent('keydown', { key: 'J', altKey: true, shiftKey: true });
        expect(matchesShortcut(event, 'Alt+Shift+J')).toBe(true);
        expect(matchesShortcut(event, 'Alt+J')).toBe(false);
    });

    it('preserves an intentionally empty Yomitan-style audio source list', () => {
        expect(normalizeAudioSources([])).toEqual([]);
        expect(normalizeAudioSources(undefined, 'http://localhost:9090/?term={term}')).toMatchObject([
            { type: 'custom-json', url: 'http://localhost:9090/?term={term}', enabled: true },
        ]);
    });

    it('imports useful settings from a Yomitan backup', () => {
        const imported = parseYomitanSettingsExport({
            options: {
                profiles: [{
                    options: {
                        audio: {
                            autoPlay: true,
                            sources: [{ type: 'custom-json', url: 'http://localhost:9090/?term={term}&reading={reading}' }],
                        },
                        general: { popupTheme: 'dark', maxResults: 20 },
                        scanning: { selectText: true, scanWithoutMousemove: true },
                        dictionaries: [{ name: 'Jitendex', enabled: true }],
                    },
                }],
            },
        });
        expect(imported.settings.audioSources?.[0]).toMatchObject({
            type: 'custom-json',
            url: 'http://localhost:9090/?term={term}&reading={reading}',
        });
        expect(imported.settings.audioEnableDefaultSources).toBeUndefined();
        expect(imported.settings.autoPlayAudio).toBe(true);
        expect(imported.settings.localDictionaryMaxResults).toBe(20);
        expect(imported.dictionaryNames).toEqual(['Jitendex']);
        expect(imported.settings.dictionaryPreferences?.[0]).toMatchObject({ name: 'Jitendex', enabled: true, priority: 0 });
    });

    it('flattens Yomitan structured glossary content for the compact popup', () => {
        expect(glossaryToText({ type: 'structured-content', content: ['to read ', { tag: 'ruby', content: ['読', { tag: 'rt', content: 'よ' }] }] }))
            .toContain('to read');
        expect(glossaryToHtml({ tag: 'ul', content: [{ tag: 'li', content: 'definition' }] }))
            .toContain('<ul>');
    });

    it('renders JPDB part-of-speech codes as readable labels', () => {
        expect(formatPartOfSpeech(['vt', 'v5', 'v5m'])).toBe('transitive verb, godan verb, mu ending');
    });

    it('parses primary and native VTT subtitle files', () => {
        const japanese = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n今日は本を読む。\n');
        const native = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nToday I read a book.\n');

        expect(japanese).toMatchObject([{ start: 1, end: 3, text: '今日は本を読む。' }]);
        expect(native).toMatchObject([{ start: 1, end: 3, text: 'Today I read a book.' }]);
    });

    it('renders subtitle words as tappable JPDB spans with status classes', () => {
        const token: JPDBToken = {
            card: { ...card, cardState: ['never-forget'], spelling: '読む', reading: 'よむ' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        };

        expect(renderTokensToHtml('読む', [token], DEFAULT_SETTINGS))
            .toContain('jpdb-reader-word jpdb-never-forget');
    });

    it('can parse asbplayer-style subtitle DOM nodes', () => {
        document.body.innerHTML = '<div class="asbplayer-subtitles-container-bottom"><span>今日は読む</span></div>';
        const [target] = collectTextTargetsIn(document.querySelector('.asbplayer-subtitles-container-bottom')!, 12, false);
        const token: JPDBToken = {
            card: { ...card, cardState: ['known'], spelling: '読む', reading: 'よむ' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '今日は読む',
        };

        applyTokensToTextNode(target, [token], DEFAULT_SETTINGS);

        expect(document.querySelector('.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-known')?.textContent)
            .toBe('読む');
    });

    it('normalizes YomiNinja-shaped OCR responses for image overlays', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 800, height: 1200 },
            results: [{
                text_lines: [{ content: '学校へ行く' }],
                is_vertical: true,
                box: {
                    top_left: { x: 650, y: 120 },
                    top_right: { x: 720, y: 120 },
                    bottom_right: { x: 720, y: 760 },
                    bottom_left: { x: 650, y: 760 },
                },
            }],
        });

        expect(result?.lines[0]).toMatchObject({
            text: '学校へ行く',
            vertical: true,
            box: { left: 650, top: 120, width: 70, height: 640 },
        });
    });

    it('uses image OCR metadata as a no-endpoint fallback for fixtures and accessible manga pages', () => {
        const image = document.createElement('img');
        Object.defineProperty(image, 'naturalWidth', { value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { value: 1400 });
        image.dataset.ocrLines = JSON.stringify([
            { text: '今日は学校です', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 }, vertical: true },
        ]);

        expect(readFallbackOcrResult(image)?.lines[0]).toMatchObject({
            text: '今日は学校です',
            vertical: true,
            box: { left: 100, top: 280, width: 300, height: 560 },
        });
    });

    it('imports Yomitan Dexie exports with term, kanji, and metadata tables', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'dictionaries',
                        rows: [
                            { $: [1, { title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }] },
                            { $: [2, { title: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 }] },
                        ],
                    },
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 8, dictionary: 'Jitendex' }] },
                        ],
                    },
                    {
                        tableName: 'kanji',
                        rows: [
                            { $: [1, { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], meanings: ['read'], dictionary: 'KANJIDIC' }] },
                        ],
                    },
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'JPDBv2' }] },
                        ],
                    },
                ],
            },
        })], 'yomitan-dictionaries.json', { type: 'application/json' });

        const summary = await store.importFile(file);
        expect(summary).toMatchObject({ terms: 1, kanji: 1, termMeta: 1 });
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Jitendex', glossary: ['to read'] }]);
        expect(await store.lookupKanji('読む', 5)).toMatchObject([{ dictionary: 'KANJIDIC', meanings: ['read'] }]);
        expect(await store.lookupTermMeta('読む', 5)).toMatchObject([{ dictionary: 'JPDBv2', mode: 'freq' }]);
    });
});
