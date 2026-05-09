import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { buildYomuAnkiFields, YOMU_MODEL_FIELDS } from '../../src/reader/anki';
import { findAudioUrl, findAudioUrls, formatAudioUrl, isUnavailableJapanesePod101Audio } from '../../src/reader/audio';
import { applyTokensToTextNode, collectTextTargetsIn, renderTokensToHtml } from '../../src/reader/dom';
import { splitJapaneseSentences } from '../../src/reader/jpdb';
import { parseJpdbKanjiHtml } from '../../src/reader/jpdb-kanji';
import { buildKanjiFacts, buildKanjiOriginGraph } from '../../src/reader/kanji-origin';
import { parseKanjiVGSvg } from '../../src/reader/kanjivg';
import { normalizeOcrResult, readFallbackOcrResult } from '../../src/reader/ocr';
import { formatPartOfSpeech } from '../../src/reader/pos';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary } from '../../src/reader/recommended-dictionaries';
import { DEFAULT_SETTINGS, matchesShortcut, normalizeAudioSources, normalizeOcrProvider, sanitizeAccentColor } from '../../src/reader/settings';
import { parseSubtitleText, readPageCaptionText } from '../../src/reader/subtitles';
import { collectYouTubeVideoCards, isProbablyJapaneseYouTubeText, readYouTubeCardText } from '../../src/reader/youtube';
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

    it('rewrites localhost audio URLs returned by a remote custom source', () => {
        expect(findAudioUrl(
            { audioSources: [{ url: 'http://localhost:8080/audio/nhk\\media\\x.mp3' }] },
            'http://tailnet-audio.example:8080/?term=青空&reading=あおぞら',
        )).toBe('http://tailnet-audio.example:8080/audio/nhk/media/x.mp3');
    });

    it('does not treat normal-sized JapanesePod101 audio as unavailable', async () => {
        await expect(isUnavailableJapanesePod101Audio(new Blob([new Uint8Array(1512)]))).resolves.toBe(false);
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

    it('migrates older OCR provider names to the current readable options', () => {
        expect(normalizeOcrProvider('auto')).toBe('google-lens');
        expect(normalizeOcrProvider('fast')).toBe('google-lens');
        expect(normalizeOcrProvider('custom-json')).toBe('local-service');
    });

    it('ships direct Japanese recommended dictionary downloads from Yomitan', () => {
        expect(findRecommendedDictionary('jitendex')?.downloadUrl).toContain('jitendex-yomitan.zip');
        expect(findRecommendedDictionary('jpdbv2-kana')?.downloadUrl).toContain('JPDB_v2.2_Frequency_Kana.zip');
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.map(item => item.name)).toEqual([
            'Jitendex',
            'JMnedict',
            'KANJIDIC',
            'JPDBv2㋕',
            'BCCWJ',
            'Jiten',
        ]);
    });

    it('sanitizes configurable accent colors', () => {
        expect(sanitizeAccentColor('#7c3aed')).toBe('#7c3aed');
        expect(sanitizeAccentColor('#abc')).toBe('#aabbcc');
        expect(sanitizeAccentColor('lime')).toBe(DEFAULT_SETTINGS.accentColor);
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

    it('builds rich Anki fields from JPDB and imported dictionary context', () => {
        const fields = buildYomuAnkiFields({
            ...card,
            vid: 1456360,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: 400,
            meanings: [{ glosses: ['to read'], partOfSpeech: ['vt', 'v5', 'v5m'] }],
            pitchAccent: ['LHH'],
            cardState: ['known'],
        }, '今日は本を読む。', {
            sourceUrl: 'https://example.test/article',
            sourceTitle: 'Example article',
            dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
            localEntries: [{
                expression: '読む',
                reading: 'よむ',
                glossary: [{ tag: 'ul', content: [{ tag: 'li', content: 'to read aloud' }] }],
                dictionary: 'Jitendex',
                definitionTags: 'common',
            }],
            kanjiEntries: [{
                character: '読',
                onyomi: ['ドク'],
                kunyomi: ['よ.む'],
                tags: ['grade 2'],
                meanings: ['read'],
                dictionary: 'KANJIDIC',
            }],
            metaEntries: [
                { expression: '読む', mode: 'freq', data: { displayValue: 123 }, dictionary: 'JPDBv2' },
                { expression: '読む', mode: 'pitch', data: { pitches: [1] }, dictionary: 'Pitch' },
            ],
        });

        expect(YOMU_MODEL_FIELDS).toContain('DictionaryDefinitions');
        expect(fields.Meaning).toContain('to read');
        expect(fields.Meaning).toContain('transitive verb');
        expect(fields.Sentence).toContain('yomu-highlight');
        expect(fields.DictionaryDefinitions).toContain('Jitendex');
        expect(fields.DictionaryDefinitions).toContain('to read aloud');
        expect(fields.Kanji).toContain('読');
        expect(fields.Kanji).toContain('read');
        expect(fields.Frequency).toContain('JPDB #400');
        expect(fields.Frequency).toContain('JPDBv2 #123');
        expect(fields.Pitch).toContain('LHH');
        expect(fields.Source).toContain('Example article');
    });

    it('renders JPDB part-of-speech codes as readable labels', () => {
        expect(formatPartOfSpeech(['vt', 'v5', 'v5m'])).toBe('transitive verb, godan verb, mu ending');
    });

    it('extracts compact kanji details from a JPDB kanji page', () => {
        const info = parseJpdbKanjiHtml(`
            <meta name="description" content="Dictionary definition of kanji 読 (よ) — read">
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
            <table class="cross-table">
                <tr><td>Frequency</td><td>Top 400-500</td></tr>
                <tr><td>Heisig</td><td>372</td></tr>
                <tr><td>Readings</td><td class="kanji-reading-list-common"><div><a href="/kanji-reading/読/よ">よ</a><div>(82%)</div></div></td></tr>
            </table>
            <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection">
                <div><div class="spelling"><a href="/kanji/言">言</a></div><div class="description">say</div></div>
            </div></div>
            <div class="subsection-used-in"><div class="used-in">
                <div class="jp"><a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a"><ruby>読<rt>よ</rt></ruby>む</a></div>
                <div class="en">to read</div>
            </div></div>
        `, '読');

        expect(info).toMatchObject({
            keyword: 'read',
            frequency: 'Top 400-500',
            heisig: '372',
            readings: [{ reading: 'よ', share: '(82%)', common: true }],
            components: [{ kanji: '言', keyword: 'say' }],
            vocabulary: [{ expression: '読む', reading: 'よむ', meaning: 'to read' }],
        });
    });

    it('sanitizes stroke-order SVGs before embedding them', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109">
                <path d="M10,10 C20,20 30,20 40,10" onclick="alert(1)" />
                <path d="bad url(javascript:alert(1))" />
                <text transform="matrix(1 0 0 1 8 12)">1</text>
                <script>alert(1)</script>
            </svg>
        `, '読');

        expect(info?.strokeCount).toBe(1);
        expect(info?.svg).toContain('jpdb-reader-kanjivg-svg');
        expect(info?.svg).toContain('<text transform=');
        expect(info?.svg).not.toContain('onclick');
        expect(info?.svg).not.toContain('script');
        expect(info?.svg).not.toContain('javascript');
    });

    it('builds compact kanji facts from JPDB, stroke, and local dictionary data', () => {
        const facts = buildKanjiFacts('読', {
            kanji: '読',
            keyword: 'read',
            frequency: 'Top 400-500',
            type: 'Jouyou grade 2',
            kanken: 'Level 9',
            heisig: '372',
            oldForms: ['讀'],
            readings: [],
            components: [],
            mnemonic: '',
            vocabulary: [],
        }, { kanji: '読', keyword: 'read', frameNumber: '372', onYomi: '', kunYomi: '', elements: '', componentKanji: [], heisigStory: '', heisigComment: '', koohiiStories: [] }, {
            kanji: '読',
            svg: '<svg></svg>',
            strokeCount: 14,
        }, [{
            character: '読',
            onyomi: ['ドク'],
            kunyomi: ['よ.む'],
            tags: ['jlpt n4', 'grade 2', 'freq 618'],
            meanings: ['read'],
            stats: { jlpt: 4, grade: 2, strokes: 14 },
            dictionary: 'KANJIDIC',
        }]);

        expect(facts).toEqual(expect.arrayContaining([
            { label: 'Type', value: 'Jōyō kanji', source: 'JPDB' },
            { label: 'JLPT', value: 'N4', source: 'KANJIDIC' },
            { label: 'Grade', value: 'Grade 2', source: 'KANJIDIC' },
            { label: 'Strokes', value: '14', source: 'stroke trace' },
            { label: 'RTK frame', value: '372', source: 'RTK' },
            { label: 'Old forms', value: '讀', source: 'JPDB' },
        ]));
    });

    it('builds a small 2D kanji origin graph from component sources', () => {
        const graph = buildKanjiOriginGraph('読', {
            kanji: '読',
            keyword: 'read',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '言', keyword: 'say' }],
            mnemonic: '',
            vocabulary: [],
        }, {
            kanji: '読',
            keyword: 'read',
            frameNumber: '372',
            onYomi: '',
            kunYomi: '',
            elements: 'words + sell',
            componentKanji: ['言', '売'],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [{
            character: '読',
            onyomi: ['ドク'],
            kunyomi: ['よ.む'],
            tags: [],
            meanings: ['read'],
            dictionary: 'KANJIDIC',
        }]);

        expect(graph.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['読', '言', '売']));
        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '言', to: '読', label: 'JPDB component' },
            { from: '売', to: '読', label: 'RTK element' },
        ]));
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

    it('ignores overlapping token ranges instead of duplicating text', () => {
        const tokens: JPDBToken[] = [
            {
                card: { ...card, spelling: '日本語', reading: 'にほんご', cardState: ['learning'] },
                start: 0,
                end: 3,
                length: 3,
                rubies: [],
                pitchClass: '',
                sentence: '日本語',
            },
            {
                card: { ...card, spelling: '本', reading: 'ほん', cardState: ['known'] },
                start: 1,
                end: 2,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence: '日本語',
            },
        ];

        expect(renderTokensToHtml('日本語', tokens, DEFAULT_SETTINGS).replace(/<[^>]+>/g, ''))
            .toBe('日本語');
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

    it('does not scan into existing ruby annotations', () => {
        document.body.innerHTML = '<p><ruby>事故<rt>じこ</rt></ruby>がありました。</p>';
        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['がありました。']);
    });

    it('does not scan form labels, required badges, or compact UI chips', () => {
        document.body.innerHTML = `
            <form><label>パスワードの設定<span class="required">必須</span></label></form>
            <span class="badge">予約</span>
            <p>今日は本を読みます。</p>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['今日は本を読みます。']);
    });

    it('does not rewrite short centered display headings that can break page layout', () => {
        document.body.innerHTML = `
            <h2 style="text-align:center;font-size:22px;line-height:1.1">ポストに届いて、受取ラクラク</h2>
            <p>食卓やリビングなど、おうちのちょっとしたところに飾れる。</p>
        `;

        const targets = collectTextTargetsIn(document.body, 10, false);
        expect(targets.map(target => target.text)).toEqual(['食卓やリビングなど、おうちのちょっとしたところに飾れる。']);
    });

    it('detects Japanese page captions near a video without site-specific selectors', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span>今日は花を見ます。</span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 380, bottom: 420, width: 480, height: 40 }),
        });

        expect(readPageCaptionText(video)).toBe('今日は花を見ます。');
    });

    it('identifies Japanese-looking YouTube cards without showing English-only cards', () => {
        document.body.innerHTML = `
            <ytd-rich-item-renderer><a id="video-title" aria-label="今日は花を見ます">今日は花を見ます</a></ytd-rich-item-renderer>
            <ytd-rich-item-renderer><a id="video-title" aria-label="10 habits for learning Japanese">10 habits for learning Japanese</a></ytd-rich-item-renderer>
            <ytd-rich-item-renderer><a id="video-title" aria-label="study with me">study with me</a><div id="channel-name">日本語チャンネル</div></ytd-rich-item-renderer>
        `;
        const cards = collectYouTubeVideoCards(document);

        expect(cards).toHaveLength(3);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[0]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[1]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[2]))).toBe(false);
    });

    it('normalizes structured OCR responses for image overlays', () => {
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

    it('normalizes YomiNinja scalable OCR regions from native engines', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 1000, height: 1200 },
            ocr_regions: [{
                id: '0',
                position: { left: 0, top: 0 },
                size: { width: 100, height: 100 },
                results: [{
                    id: 'line',
                    box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    text: [{
                        content: '花が咲く',
                        box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    }],
                }],
            }],
        }, 1000, 1200);

        expect(result?.lines[0]).toMatchObject({
            text: '花が咲く',
            box: { left: 200, top: 120, width: 300, height: 96 },
        });
    });

    it('positions YomiNinja OCR template regions relative to the source image', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 1000, height: 1200 },
            ocr_regions: [{
                id: 'manga-panel',
                position: { left: 0.25, top: 0.1 },
                size: { width: 0.5, height: 0.5 },
                results: [{
                    id: 'line',
                    box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    text: [{
                        content: '花が咲く',
                        box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    }],
                }],
            }],
        }, 1000, 1200);

        expect(result?.lines[0]).toMatchObject({
            text: '花が咲く',
            box: { left: 350, top: 180, width: 150, height: 48 },
        });
    });

    it('normalizes Google Cloud Vision OCR responses', () => {
        const result = normalizeOcrResult({
            responses: [{
                fullTextAnnotation: {
                    pages: [{
                        width: 800,
                        height: 600,
                        blocks: [{
                            paragraphs: [{
                                words: [{
                                    symbols: [
                                        { text: '花', boundingBox: { vertices: [{ x: 100, y: 50 }, { x: 130, y: 50 }, { x: 130, y: 90 }, { x: 100, y: 90 }] } },
                                        { text: '火', property: { detectedBreak: { type: 'LINE_BREAK' } }, boundingBox: { vertices: [{ x: 132, y: 50 }, { x: 160, y: 50 }, { x: 160, y: 90 }, { x: 132, y: 90 }] } },
                                    ],
                                }],
                            }],
                        }],
                    }],
                },
            }],
        }, 800, 600);

        expect(result?.lines[0]).toMatchObject({
            text: '花火',
            box: { left: 100, top: 50, width: 60, height: 40 },
        });
    });

    it('uses image OCR metadata as an instant no-endpoint fallback for fixtures', () => {
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

    it('does not treat image alt text as OCR output', () => {
        const image = document.createElement('img');
        image.alt = '箱を開ける、お花の定期便';
        Object.defineProperty(image, 'naturalWidth', { value: 1200 });
        Object.defineProperty(image, 'naturalHeight', { value: 800 });

        expect(readFallbackOcrResult(image, false)).toBeNull();
        expect(readFallbackOcrResult(image, true)).toBeNull();
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

    it('imports direct Dexie rows from current Yomitan dictionary exports', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'dictionaries',
                        inbound: true,
                        rows: [
                            { title: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0 },
                        ],
                    },
                    {
                        tableName: 'terms',
                        inbound: true,
                        rows: [
                            { expression: '青空', reading: 'あおぞら', glossary: [{ tag: 'ul', content: [{ tag: 'li', content: 'blue sky' }] }], score: 10, dictionary: 'Jitendex.org [2025-12-02]' },
                        ],
                    },
                ],
            },
        })], 'yomitan-direct-dictionaries.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookup('青空', 'あおぞら', 5);
        expect(entries).toMatchObject([{ dictionary: 'Jitendex.org [2025-12-02]', expression: '青空' }]);
        expect(glossaryToHtml(entries[0].glossary[0])).toContain('blue sky');
    });

    it('sorts local frequency metadata with JPDB dictionaries first', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 10 }, dictionary: 'BCCWJ' }] },
                            { $: [2, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'JPDBv2㋕' }] },
                            { $: [3, { expression: '読む', mode: 'pitch', data: { pitches: [1] }, dictionary: 'Pitch' }] },
                        ],
                    },
                ],
            },
        })], 'freq.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookupTermMeta('読む', 5, [
            { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 0 },
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 5 },
            { name: 'Pitch', alias: 'Pitch', enabled: true, priority: 1 },
        ]);
        expect(entries.map(entry => entry.dictionary)).toEqual(['JPDBv2㋕', 'BCCWJ', 'Pitch']);
    });

    it('downloads and imports a recommended dictionary ZIP via userscript requests', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const zip = new JSZip();
        zip.file('index.json', JSON.stringify({ title: 'Tiny Dictionary', format: 3, revision: 'test' }));
        zip.file('term_bank_1.json', JSON.stringify([
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
        ]));
        const blob = await zip.generateAsync({ type: 'blob' });
        vi.stubGlobal('GM_xmlhttpRequest', (details: {
            onload?: (response: { status: number; response: Blob }) => void;
        }) => details.onload?.({ status: 200, response: blob }));

        try {
            const summary = await store.importFromUrl('https://example.test/tiny.zip', 'tiny.zip');
            const dictionaries = (await store.summary()).dictionaries;

            expect(summary).toMatchObject({ dictionaries: ['Tiny Dictionary'], terms: 1 });
            expect(dictionaries[0]).toMatchObject({ title: 'Tiny Dictionary', revision: 'test', downloadUrl: 'https://example.test/tiny.zip' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
