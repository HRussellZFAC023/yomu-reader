import { describe, expect, it, vi } from 'vitest';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    JpdbKanjiClient,
    KANJI_CSS,
    KANJI_STROKE_SOURCE_ID,
    ReaderApp,
    YomitanDictionaryStore,
    buildKanjiFacts,
    buildKanjiOriginGraph,
    card,
    collectPageSubtitleSources,
    currentPageTermTarget,
    deferred,
    deinflectJapaneseTerm,
    findActiveSubtitleCue,
    formatPartOfSpeech,
    graphNodeDataGeometry,
    graphNodeDataPosition,
    graphNodeStylePosition,
    installUchisenCarousel,
    isCurrentKanjiSurface,
    isKanjiReviewBack,
    isKanjiReviewFront,
    kanjiGraphDistance,
    kanjiGraphPoint,
    kanjiGraphPositions,
    loadSubtitleTrackCues,
    loadUchisenImages,
    loadYouTubeTrackCues,
    mountTestUchisenCarousel,
    normalizeSubtitleCues,
    parseJpdbKanjiHtml,
    parseJpdbReviewCardValue,
    parseKanjiMapInfo,
    parseKanjiVGSvg,
    parseRtkSearchIndex,
    parseSubtitleText,
    parseUchisenComponents,
    parseUchisenData,
    parseUchisenImages,
    parseUchisenKanjiKeyword,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderKanjiSourceMounts,
    renderRtkInfo,
    stubHostedProxyFetch,
    termRulesMatch,
    visibleJpdbKanjiActions,
} from './fixtures';
import type {
    JPDBCard,
    LocalDictionaryTarget,
    YomitanTermEntry,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('keeps independent JMdict-style words clickable around example-sentence particles', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '君', reading: 'きみ', glossary: ['you'], score: 10, dictionary: 'JMdict' }] },
                            { $: [2, { expression: 'どれ位', reading: 'どれくらい', glossary: ['how much'], score: 10, dictionary: 'JMdict' }] },
                            { $: [3, { expression: '海外', reading: 'かいがい', glossary: ['abroad'], score: 10, dictionary: 'JMdict' }] },
                            { $: [4, { expression: '行く', reading: 'いく', rules: 'v5k', glossary: ['to go'], score: 10, dictionary: 'JMdict' }] },
                        ],
                    },
                ],
            },
        })], 'jmdict-example.json', { type: 'application/json' });

        await store.importFile(file);
        const matches = await store.findTermMatches('君はどれくらいよく海外に行きますか。', 8);

        expect(matches.map(match => [match.surface, match.entry.expression])).toEqual([
            ['君', '君'],
            ['どれくらい', 'どれ位'],
            ['海外', '海外'],
            ['行きます', '行く'],
        ]);
    });

    it('deinflects local dictionary terms using Yomitan term rules', async () => {
        expect(deinflectJapaneseTerm('読んだ')).toEqual(expect.arrayContaining([
            expect.objectContaining({ term: '読む', rules: expect.arrayContaining(['v5m']) }),
        ]));
        expect(deinflectJapaneseTerm('読んでいる')).toEqual(expect.arrayContaining([
            expect.objectContaining({ term: '読む', rules: expect.arrayContaining(['v5m']), reasons: expect.arrayContaining(['progressive']) }),
        ]));
        expect(deinflectJapaneseTerm('食べてる')).toEqual(expect.arrayContaining([
            expect.objectContaining({ term: '食べる', rules: expect.arrayContaining(['v1']), reasons: expect.arrayContaining(['contracted progressive']) }),
        ]));
        expect(deinflectJapaneseTerm('やっちゃった')).toEqual(expect.arrayContaining([
            expect.objectContaining({ term: 'やる', rules: expect.arrayContaining(['v5r']), reasons: expect.arrayContaining(['contracted completion past']) }),
        ]));
        expect(deinflectJapaneseTerm('読みなさい')).toEqual(expect.arrayContaining([
            expect.objectContaining({ term: '読む', rules: expect.arrayContaining(['v5m']), reasons: expect.arrayContaining(['polite request']) }),
        ]));
        expect(termRulesMatch('v5m vt', ['v5m', 'v5'])).toBe(true);
        expect(termRulesMatch('', ['v5m', 'v5'])).toBe(false);

        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '読む', reading: 'よむ', rules: 'v5m', glossary: ['to read'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [2, { expression: '食べる', reading: 'たべる', rules: 'v1', glossary: ['to eat'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [3, { expression: '高い', reading: 'たかい', rules: 'adj-i', glossary: ['high'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [4, { expression: '勉強する', reading: 'べんきょうする', rules: 'vs', glossary: ['to study'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [5, { expression: 'やる', reading: 'やる', rules: 'v5r', glossary: ['to do'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [6, { expression: '読む', reading: 'よむ', rules: '', glossary: ['uninflectable duplicate'], score: 99, dictionary: 'Names' }] },
                        ],
                    },
                ],
            },
        })], 'local-terms.json', { type: 'application/json' });

        await store.importFile(file);
        const matches = await store.findTermMatches('本を読んだ。寿司を食べました。高かった。勉強している。読んでいる。食べてる。やっちゃった。読みなさい。', 12);

        expect(matches.map(match => [match.surface, match.entry.expression, match.entry.dictionary, match.deinflected?.term])).toEqual([
            ['読んだ', '読む', 'Jitendex', '読む'],
            ['食べました', '食べる', 'Jitendex', '食べる'],
            ['高かった', '高い', 'Jitendex', '高い'],
            ['勉強している', '勉強する', 'Jitendex', '勉強する'],
            ['読んでいる', '読む', 'Jitendex', '読む'],
            ['食べてる', '食べる', 'Jitendex', '食べる'],
            ['やっちゃった', 'やる', 'Jitendex', 'やる'],
            ['読みなさい', '読む', 'Jitendex', '読む'],
        ]);
    });

    it('renders JPDB part-of-speech codes as readable labels', () => {
        expect(formatPartOfSpeech(['vt', 'v5', 'v5m'])).toBe('transitive verb, godan verb, mu ending');
        expect(formatPartOfSpeech(['n', 'uk', 'abbr', 'arch'])).toBe('noun, usually written using kana alone, abbreviation, archaic');
    });

    it('extracts compact kanji details from a JPDB kanji page', () => {
        const info = parseJpdbKanjiHtml(`
            <meta name="description" content="Dictionary definition of kanji 読 (よ) — read">
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
            <table class="cross-table">
                <tr><td>Frequency</td><td>Top 400-500</td></tr>
                <tr><td>Type</td><td>Jōyō kanji ?</td></tr>
                <tr><td>Heisig</td><td>372</td></tr>
                <tr><td>Readings</td><td class="kanji-reading-list-common"><div><a href="/kanji-reading/読/よ">よ</a><div>(82%)</div></div></td></tr>
            </table>
            <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Composed of</h6><div class="subsection">
                <div><div class="spelling"><a href="/kanji/言">言</a></div><div class="description">say</div></div>
            </div></div>
            <div class="subsection-composed-of-kanji"><h6 class="subsection-label">Used in kanji (1 in total)</h6><div class="subsection">
                <div class="used-in"><div class="spelling"><a href="/kanji/讀">讀</a></div><div class="description">read</div></div>
            </div></div>
            <div class="subsection-used-in"><div class="used-in">
                <div class="jp"><a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a"><ruby>読<rt>よ</rt></ruby>む</a></div>
                <div class="en">to read</div>
            </div></div>
        `, '読');

        expect(info).toMatchObject({
            keyword: 'read',
            frequency: 'Top 400-500',
            type: 'Jōyō kanji',
            heisig: '372',
            readings: [{ reading: 'よ', share: '(82%)', common: true }],
            components: [{ kanji: '言', keyword: 'say' }],
            usedInKanji: [{ kanji: '讀', keyword: 'read' }],
            vocabulary: [{ expression: '読む', reading: 'よむ', meaning: 'to read' }],
        });
    });

    it('renders JPDB kanji facts without leaking table help markers', () => {
        const html = renderJpdbKanjiInfo({
            kanji: '読',
            keyword: 'read',
            frequency: 'Top 400-500',
            type: 'Jōyō kanji',
            kanken: '9',
            heisig: '372',
            oldForms: [],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, 'en');

        expect(html).toContain('Keyword');
        expect(html).toContain('read');
        expect(html).toContain('Jōyō kanji');
        expect(html).not.toContain('Jōyō kanji ?');
    });

    it('keeps RTK components in the compact elements row only', () => {
        const html = renderRtkInfo({
            kanji: '迎',
            keyword: 'welcome',
            frameNumber: 'Frame number V4: 1702',
            onYomi: 'ゲイ',
            kunYomi: 'むか.える',
            elements: '匕 welcome, 卩 stamp album, road',
            componentKanji: ['匕', '卩'],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [
            { kanji: '匕', keyword: 'spoon', meaning: 'spoon' },
            { kanji: '卩', keyword: 'crooked seal', meaning: 'crooked seal' },
        ], 'en');

        expect(html).toContain('jpdb-reader-rtk-elements');
        expect(html).not.toContain('jpdb-reader-component-grid');
    });

    it('maps RTK component aliases without showing the current keyword or plus separators', () => {
        const html = renderRtkInfo({
            kanji: '習',
            keyword: 'learn',
            frameNumber: 'Frame number V4: 574',
            onYomi: 'シュウ',
            kunYomi: 'なら.う',
            elements: 'learn, feathers, wings, white, dove',
            componentKanji: [],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [
            { kanji: '羽', keyword: 'feathers', meaning: 'feathers' },
            { kanji: '白', keyword: 'white', meaning: 'white' },
        ], 'en');

        expect(html).not.toContain('<span>learn</span>');
        expect(html).not.toContain('<span>+</span>');
        expect(html).toContain('data-kanji="羽"');
        expect(html).toContain('<strong>羽</strong><span>wings</span>');
        expect(html).toContain('data-kanji="白"');
        expect(html).toContain('<strong>白</strong><span>dove</span>');
        expect(KANJI_CSS).not.toContain('content: "+"');
    });

    it('renders actual RTK primitive glyphs beside keyword-only elements', () => {
        const html = renderRtkInfo({
            kanji: '必',
            keyword: 'invariably',
            frameNumber: 'Frame number V4: 635',
            onYomi: 'ヒツ',
            kunYomi: 'かなら.ず',
            elements: 'invariably, heart, stick, drop, fishhook, drop3',
            componentKanji: [],
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [], 'en');

        expect(html).not.toContain('<span>invariably</span>');
        expect(html).toContain('data-kanji="心"');
        expect(html).toContain('<strong>心</strong><span>heart</span>');
        expect(html).toContain('<strong>丨</strong><span>stick</span>');
        expect(html).toContain('<strong>丶</strong><span>drop</span>');
        expect(html).toContain('data-kanji="乙"');
        expect(html).toContain('<strong>乙</strong><span>fishhook</span>');
        expect(html).not.toContain('drop3');
    });

    it('renders RTK aliases learned from the search index', () => {
        const html = renderRtkInfo({
            kanji: '収',
            keyword: 'income',
            frameNumber: 'Frame number V4: 1510',
            onYomi: 'シュウ',
            kunYomi: 'おさ.める',
            elements: 'income, cornucopia, crotch',
            componentKanji: [],
            elementGlyphs: {
                crotch: { glyph: '又', kanji: '又' },
            },
            heisigStory: '',
            heisigComment: '',
            koohiiStories: [],
        }, [], 'en');

        expect(html).toContain('<strong>丩</strong><span>cornucopia</span>');
        expect(html).toContain('data-kanji="又"');
        expect(html).toContain('<strong>又</strong><span>crotch</span>');
    });

    it('keeps duplicate RTK search keywords out of the reverse index', () => {
        const index = parseRtkSearchIndex(`
            var docs = [
                { "kanji" : "心", "keyword" : "heart", "elements" : "heart" },
                { "kanji" : "羽", "keyword" : "feathers", "elements" : "feathers, wings" },
                { "kanji" : "白", "keyword" : "white", "elements" : "white" },
                { "kanji" : "偽", "keyword" : "heart", "elements" : "fake duplicate" }
            ];
        `);

        expect(index.get('feathers')).toBe('羽');
        expect(index.get('heart')).toBeUndefined();
    });

    it('indexes RTK element aliases at the kanji where they are introduced', () => {
        const index = parseRtkSearchIndex(`
            var docs = [
                { "kanji" : "一", "keyword" : "one", "elements" : "one" },
                { "kanji" : "十", "keyword" : "ten", "elements" : "ten, needle" },
                { "kanji" : "古", "keyword" : "old", "elements" : "old, tombstone, gravestone, church, ten, needle, mouth" },
                { "kanji" : "白", "keyword" : "white", "elements" : "white, drop, sun, day" },
                { "kanji" : "百", "keyword" : "hundred", "elements" : "hundred, one, ceiling, white, dove" },
                { "kanji" : "又", "keyword" : "or again", "elements" : "or again, crotch" },
                { "kanji" : "収", "keyword" : "income", "elements" : "income, cornucopia, crotch" },
                { "kanji" : "仮", "keyword" : "provisional", "elements" : "sham, provisional, person" },
                { "kanji" : "碑", "keyword" : "tombstone", "elements" : "tombstone, stone, old" }
            ];
        `);

        expect(index.get('needle')).toBe('十');
        expect(index.get('gravestone')).toBe('古');
        expect(index.get('church')).toBe('古');
        expect(index.get('ceiling')).toBe('一');
        expect(index.get('dove')).toBe('白');
        expect(index.get('crotch')).toBe('又');
        expect(index.get('sham')).toBe('仮');
        expect(index.get('tombstone')).toBe('碑');
    });

    it('surfaces JPDB kanji mining controls only when the kanji page exposes them', () => {
        const info = parseJpdbKanjiHtml(`
            <meta name="description" content="Dictionary definition of kanji 読 (よ) — read">
            <div class="result kanji">
                <div class="menu">
                    <form action="/kanji/%E8%AA%AD" method="post">
                        <input type="hidden" name="csrf" value="token">
                        <button name="action" value="add">Add to kanji deck</button>
                        <button name="action" value="never">Never forget</button>
                    </form>
                    <a href="/kanji/%E8%AA%AD?blacklist=1">Blacklist</a>
                </div>
            </div>
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
        `, '読');

        expect(info?.loggedIn).toBe(true);
        expect(info?.kanjiReviewsEnabled).toBe(true);
        expect(visibleJpdbKanjiActions(info).map(action => [action.label, action.role, action.method, action.payload.action])).toEqual([
            ['Add to kanji deck', 'mine', 'POST', 'add'],
            ['Never forget', 'neverforget', 'POST', 'never'],
            ['Blacklist', 'blacklist', 'GET', undefined],
        ]);

        const controls = renderJpdbKanjiMiningControls(info, 'en');
        expect(controls).toContain('jpdb-reader-mining-details jpdb-reader-kanji-mining');
        expect(controls).toContain('jpdb-reader-mining-action-row jpdb-reader-kanji-mining-row');
        expect(controls).toContain('data-action="jpdb-kanji-action"');
    });

    it('does not execute a stale JPDB kanji action after the learning target changes', async () => {
        const app = new ReaderApp();
        const performAction = vi.fn(async () => undefined);
        const showKanjiCard = vi.fn(async () => undefined);
        const toast = vi.fn();
        const internals = app as unknown as {
            jpdbKanji: { performAction: typeof performAction };
            showKanjiCard: typeof showKanjiCard;
            toast: typeof toast;
            performJpdbKanjiAction(
                actionId: string,
                lookupCard: JPDBCard,
                kanji: string,
                sentence?: string,
            ): Promise<void>;
        };
        internals.jpdbKanji = { performAction };
        internals.showKanjiCard = showKanjiCard;
        internals.toast = toast;
        setActiveLearningTargetLanguage('zh');

        try {
            await internals.performJpdbKanjiAction('stale-action', card, '読', '読む。');

            expect(performAction).not.toHaveBeenCalled();
            expect(showKanjiCard).not.toHaveBeenCalled();
            expect(toast).not.toHaveBeenCalled();
        } finally {
            resetActiveLearningTargetLanguage();
            app.destroy();
        }
    });

    it('does not treat JPDB kanji setup links as mining controls', () => {
        const info = parseJpdbKanjiHtml(`
            <a href="/login">Login</a>
            <div class="result kanji"><div class="menu"><a href="/settings">Enable kanji reviews</a></div></div>
            <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
        `, '読');

        expect(info?.loggedIn).toBe(false);
        expect(info?.kanjiReviewsEnabled).toBe(false);
        expect(visibleJpdbKanjiActions(info)).toEqual([]);
    });

    it('loads hosted new-tab JPDB kanji info through a configured proxy', async () => {
        const target = 'https://jpdb.io/kanji/%E5%9B%B3';
        const { proxyUrl, fetchMock } = stubHostedProxyFetch(target, `
            <meta name="description" content="Dictionary definition of kanji 図 — diagram">
            <div class="result kanji">
                <h6 class="subsection-label">Keyword</h6><div class="subsection">diagram</div>
                <table class="cross-table"><tr><td>Frequency</td><td>1,234</td></tr></table>
            </div>
        `);

        try {
            const client = new JpdbKanjiClient(() => proxyUrl);

            await expect(client.lookup('図')).resolves.toMatchObject({
                kanji: '図',
                keyword: 'diagram',
                frequency: '1,234',
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not send logged-in JPDB kanji actions to configured or public proxies', async () => {
        const target = 'https://jpdb.io/kanji/%E8%AA%AD';
        const { proxyUrl, fetchMock } = stubHostedProxyFetch(target, `
            <meta name="description" content="Dictionary definition of kanji 読 — read">
            <div class="result kanji">
                <h6 class="subsection-label">Keyword</h6><div class="subsection">read</div>
                <div class="menu">
                    <form action="/kanji/%E8%AA%AD" method="post">
                        <input type="hidden" name="csrf" value="private-token">
                        <button name="action" value="known">Mark known</button>
                    </form>
                </div>
            </div>
        `);

        try {
            const client = new JpdbKanjiClient(() => proxyUrl);
            const info = await client.lookup('読');
            const action = visibleJpdbKanjiActions(info)[0];

            await expect(client.performAction(action.id)).rejects.toThrow(/configured proxy|userscript/i);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls.map(([url]) => String(url)).join('\n')).not.toContain('private-token');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('parses and de-duplicates Uchisen mnemonic images', () => {
        const images = parseUchisenImages(`
            <div class="kanji_image_loader" data-large="/kanji/1/main.png"></div>
            <div id="mnemonic_story">Main story</div>
            <div class="mnemonic_card">
                <input class="image_url" value="https://ik.imagekit.io/uchisen//kanji/1/main.png?tr=w-300">
                <input class="story" value="Duplicate story">
            </div>
            <div class="mnemonic_card">
                <input class="image_url" value="generated_sample.jpg">
                <input class="story" value="A &lt;b&gt;second&lt;/b&gt; story">
            </div>
        `);

        expect(images).toEqual([
            { url: 'https://ik.imagekit.io/uchisen/kanji/1/main.png', story: 'Main story' },
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_sample.jpg', story: 'A second story' },
        ]);
    });

    it('moves Uchisen enrollment paywall cards behind free mnemonics', () => {
        const images = parseUchisenImages(`
            <div class="kanji_image_loader" data-large="https://dhblqbsgkimuk.cloudfront.net/kanji/enrollment.png"></div>
            <div id="mnemonic_story">Please subscribe to <a href="/enroll">uchisenPRO</a> to be able to view this mnemonic and hand-drawn picture, along with hundreds more!</div>
            <div class="mnemonic_card selected_mnemonic">
                <input class="story" value="Please subscribe to &lt;a href=&quot;/enroll&quot;&gt;uchisenPRO&lt;/a&gt; to be able to view this mnemonic and hand-drawn picture, along with hundreds more!">
                <input class="image_url" value="/kanji/enrollment.png">
                <input class="can_show_current_mnemonic" value="false">
            </div>
            <div class="mnemonic_card">
                <input class="story" value="Free story one">
                <input class="image_url" value="generated_free_one.jpg">
                <input class="can_show_current_mnemonic" value="true">
            </div>
            <div class="mnemonic_card">
                <input class="story" value="Free story two">
                <input class="image_url" value="generated_free_two.jpg">
                <input class="can_show_current_mnemonic" value="true">
            </div>
        `);

        expect(images).toEqual([
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_free_one.jpg', story: 'Free story one' },
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_free_two.jpg', story: 'Free story two' },
            {
                url: 'https://dhblqbsgkimuk.cloudfront.net/kanji/enrollment.png',
                story: 'Please subscribe to uchisenPRO to be able to view this mnemonic and hand-drawn picture, along with hundreds more!',
            },
        ]);
    });

    it('parses Uchisen kanji prime and compound component groups', () => {
        const groups = parseUchisenComponents(`
            <div class="kanji_info_container">
                <div class="components">
                    <div class="KP_primes">
                        <div class="prime_label prime_color"><span class="eng_transl">Kanji Primes</span></div>
                        <div class="name_combo"><a href="/primes/dwarf">dwarf: &nbsp;<span class="component_symbol">⺍</span></a></div>
                        <div class="name_combo"><a href="/primes/crown">crown: &nbsp;<span class="component_symbol">冖</span></a></div>
                    </div>
                    <div class="KP_primes">
                        <div class="compound_label kanji_color"><span class="eng_transl">Compound Kanji</span></div>
                        <div class="name_combo flex_end black_font"><a href="/kanji/子">Child: &nbsp;<span class="component_symbol">子</span></a></div>
                    </div>
                </div>
            </div>
            <div class="mnemonic_studio_right">
                <div class="components">
                    <div class="KP_primes">
                        <div class="name_combo"><a href="/primes/ignored">ignored: <span class="component_symbol">火</span></a></div>
                    </div>
                </div>
            </div>
        `);

        expect(groups).toEqual([
            {
                title: 'Kanji Primes',
                components: [
                    { name: 'dwarf', symbol: '⺍', url: 'https://uchisen.com/primes/dwarf' },
                    { name: 'crown', symbol: '冖', url: 'https://uchisen.com/primes/crown' },
                ],
            },
            {
                title: 'Compound Kanji',
                components: [
                    { name: 'Child', symbol: '子', url: 'https://uchisen.com/kanji/%E5%AD%90' },
                ],
            },
        ]);
    });

    it('parses the Uchisen kanji keyword separately from prime keywords', () => {
        expect(parseUchisenKanjiKeyword(`
            <div class="kanji_info_container">
                <div class="kanji_info" id="kanji_keyword_container">
                    <span>後 - After</span>
                </div>
                <div class="components">
                    <div class="KP_primes">
                        <div class="prime_label prime_color"><span class="eng_transl">Kanji Primes</span></div>
                        <div class="name_combo"><a href="/primes/water+slide">water slide: &nbsp;<span class="component_symbol">彳</span></a></div>
                    </div>
                </div>
            </div>
        `)).toEqual({
            kanji: '後',
            keyword: 'After',
            url: 'https://uchisen.com/kanji/%E5%BE%8C',
        });
    });

    it('detects Uchisen generation fields from kanji pages', () => {
        const authenticated = parseUchisenData(`
            <input id="user_id" value="42">
            <input id="kanji_id" value="1177">
            <div class="kanji_info" id="kanji_keyword_container"><span>甘 - Sweet</span></div>
        `);
        const loggedOut = parseUchisenData(`
            <div id="lo_links"><a href="/login">Login</a></div>
            <input id="kanji_id" value="1177">
        `);

        expect(authenticated.kanjiId).toBe('1177');
        expect(authenticated.canGenerateImages).toBe(true);
        expect(loggedOut.canGenerateImages).toBe(true);
    });

    it('renders the Uchisen kanji keyword before prime chips', async () => {
        const carousel = await mountTestUchisenCarousel('後', [
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_after.jpg', story: 'After story' },
        ], {
            kanjiKeyword: { kanji: '後', keyword: 'After', url: 'https://uchisen.com/kanji/%E5%BE%8C' },
            componentGroups: [{
                title: 'Kanji Primes',
                components: [
                    { name: 'water slide', symbol: '彳', url: 'https://uchisen.com/primes/water+slide' },
                ],
            }],
        });

        try {
            const groups = Array.from(carousel.mount.querySelectorAll<HTMLElement>('.yomu-jpdb-component-group'));
            expect(groups.map(group => group.querySelector('.yomu-jpdb-component-group-label')?.textContent)).toEqual([
                'Kanji Keyword',
                'Kanji Primes',
            ]);
            expect(groups[0]?.textContent).toContain('後');
            expect(groups[0]?.textContent).toContain('After');
            expect(groups[1]?.textContent).toContain('water slide');
        } finally {
            carousel.cleanup();
        }
    });

    it('renders authenticated Uchisen generation beside the external link', async () => {
        const carousel = await mountTestUchisenCarousel('甘', [
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_sweet.jpg', story: 'Sweet story' },
        ], {
            kanjiId: '1177',
            canGenerateImages: true,
        });

        try {
            const linkRow = carousel.mount.querySelector<HTMLElement>('.yomu-jpdb-uchisen-link-row');
            const externalLink = linkRow?.querySelector<HTMLAnchorElement>('a.yomu-jpdb-uchisen-summary-link');
            const generateLink = linkRow?.querySelector<HTMLButtonElement>('button.yomu-jpdb-uchisen-generate-link');

            expect(externalLink?.textContent).toContain('View on Uchisen');
            expect(generateLink?.textContent).toBe('Generate image +');
            expect(Array.from(linkRow?.children ?? [])).toEqual([externalLink, generateLink]);
            expect(generateLink?.classList.contains('yomu-jpdb-uchisen-summary-link')).toBe(true);
        } finally {
            carousel.cleanup();
        }
    });

    it('renders the Uchisen controls and external link outside the summary', async () => {
        const carousel = await mountTestUchisenCarousel('着', [
            { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_wear.jpg', story: 'Wear story' },
        ]);

        try {
            const summary = carousel.mount.querySelector<HTMLElement>('summary.jpdb-reader-local-head');
            const body = carousel.mount.querySelector<HTMLElement>('.yomu-jpdb-uchisen-body');
            const controls = Array.from(body?.querySelectorAll<HTMLElement>('[data-uchisen-action]') ?? []);
            const link = body?.querySelector<HTMLAnchorElement>('.yomu-jpdb-uchisen-summary-link');

            expect(summary?.querySelector('.yomu-jpdb-counter')?.textContent).toBe('1/1');
            expect(summary?.querySelector('[data-uchisen-action]')).toBeNull();
            expect(summary?.querySelector('a[href*="uchisen.com/kanji"]')).toBeNull();
            expect(controls.map(control => control.dataset.uchisenAction)).toEqual(['previous', 'next']);
            expect(link?.textContent).toContain('View on Uchisen');
            expect(link?.querySelector('svg')).not.toBeNull();
        } finally {
            carousel.cleanup();
        }
    });

    it('falls back to the direct Uchisen image URL when no image proxy is configured', async () => {
        const imageUrl = 'https://ik.imagekit.io/uchisen/generated/saved/generated_many.jpg';
        const fetchMock = vi.fn(() => Promise.reject(new Error('proxy offline')));
        vi.stubGlobal('fetch', fetchMock);
        const mount = document.createElement('div');
        let cleanup: (() => void) | null = null;

        try {
            document.body.append(mount);
            cleanup = await installUchisenCarousel(mount, '多', [
                { url: imageUrl, story: 'Too many cigs' },
            ]);

            await vi.waitFor(() => {
                expect(mount.querySelector<HTMLImageElement>('[data-uchisen-image]')?.src).toBe(imageUrl);
            });
            // Built-in public proxies are attempted first; when they fail the
            // carousel still falls back to the direct image URL.
            const attempted = (fetchMock as unknown as { mock: { calls: Array<[RequestInfo | URL]> } }).mock.calls.map(([url]) => String(url));
            expect(attempted.every(url => url.startsWith('https://edge.yomureader.com/') || url.startsWith('https://yomu-jpdb-public-proxy.'))).toBe(true);
        } finally {
            cleanup?.();
            mount.remove();
            vi.unstubAllGlobals();
        }
    });

    it('restores the last selected Uchisen index without a star control', async () => {
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/uchisen'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))));
        localStorage.setItem('yomu-jpdb-uchisen-index:具', JSON.stringify(1));
        const mount = document.createElement('div');
        let cleanup: (() => void) | null = null;

        try {
            document.body.append(mount);
            cleanup = await installUchisenCarousel(mount, '具', [
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_free.jpg', story: 'Free mnemonic' },
                {
                    url: 'https://ik.imagekit.io/uchisen/kanji/enrollment.png',
                    story: 'Please subscribe to uchisenPRO to be able to view this mnemonic and hand-drawn picture, along with hundreds more!',
                },
            ]);

            expect(mount.querySelector('[data-uchisen-action="star"]')).toBeNull();
            expect(mount.querySelector('.yomu-jpdb-counter')?.textContent).toBe('2/2');
            expect(mount.querySelector('.yomu-jpdb-story')?.textContent).toContain('Please subscribe');
        } finally {
            cleanup?.();
            mount.remove();
            localStorage.removeItem('yomu-jpdb-uchisen-index:具');
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            vi.unstubAllGlobals();
        }
    });

    it('loads Uchisen mnemonic HTML through a configured proxy', async () => {
        const target = 'https://uchisen.com/kanji/%E5%9B%B3';
        const { proxyUrl, fetchMock } = stubHostedProxyFetch(target, `
            <div class="kanji_image_loader" data-large="generated_diagram.jpg"></div>
            <div id="mnemonic_story">Picture the diagram.</div>
        `);

        try {
            await expect(loadUchisenImages('図', proxyUrl)).resolves.toEqual([
                { url: 'https://ik.imagekit.io/uchisen/generated/saved/generated_diagram.jpg', story: 'Picture the diagram.' },
            ]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('detects JPDB kanji review card phases from the hidden card value', () => {
        expect(parseJpdbReviewCardValue('kb,読')).toEqual({
            kind: 'kb',
            kanji: '読',
            isKanji: true,
            phase: 'before',
        });
        expect(parseJpdbReviewCardValue('kb,%E8%AA%AD', '1')).toMatchObject({
            kanji: '読',
            isKanji: true,
            phase: 'after',
        });
        expect(parseJpdbReviewCardValue('vf,1227560,665431007')).toMatchObject({
            kind: 'vf',
            isKanji: false,
            phase: 'none',
        });
    });

    it('treats JPDB kanji reveal DOM as the back side even before the URL response flag updates', () => {
        window.history.replaceState(null, '', '/review?c=kb,%E8%AA%AD#a');
        document.body.innerHTML = `
            <div class="review-reveal">
                <input name="c" value="kb,読">
                <div class="answer-box">
                    <a class="kanji plain" href="/kanji/%E8%AA%AD">読</a>
                </div>
            </div>
        `;

        expect(isKanjiReviewFront()).toBe(false);
        expect(isKanjiReviewBack()).toBe(true);
    });

    it('treats unrevealed JPDB kanji review fronts as kanji enhancement surfaces', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/review?c=kb,%E5%AD%90#a',
            hostname: 'jpdb.io',
            pathname: '/review',
            search: '?c=kb,%E5%AD%90',
        });
        document.body.innerHTML = `
            <main>
                <input name="c" value="kb,子">
                <div class="prompt">Kanji</div>
                <div class="answer-box">child</div>
            </main>
        `;

        try {
            expect(isKanjiReviewFront()).toBe(true);
            expect(isCurrentKanjiSurface()).toBe(true);
            expect(currentPageTermTarget()).toMatchObject({
                term: '子',
                reading: '子',
                queries: ['子'],
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('remembers the JPDB review examples toggle state', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/review?c=v%2C1%2C2&r=1#a',
            hostname: 'jpdb.io',
            pathname: '/review',
            search: '?c=v%2C1%2C2&r=1',
        });
        const key = 'yomu:jpdb-review-examples-visible:v1';
        localStorage.setItem(key, 'true');
        document.body.innerHTML = `
            <input id="show-checkbox-examples" type="checkbox">
            <label id="show-checkbox-examples-label" for="show-checkbox-examples">
                <div>Click to toggle examples...</div>
            </label>
        `;
        const checkbox = document.querySelector<HTMLInputElement>('#show-checkbox-examples')!;
        const changes: boolean[] = [];
        checkbox.addEventListener('change', () => changes.push(checkbox.checked));
        const app = new ReaderApp();
        const internals = app as unknown as { installJpdbReviewExamplesToggleMemory(): void };

        try {
            internals.installJpdbReviewExamplesToggleMemory();
            expect(checkbox.checked).toBe(true);
            expect(changes).toEqual([true]);

            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            expect(localStorage.getItem(key)).toBe('false');
        } finally {
            app.destroy();
            localStorage.removeItem(key);
            vi.unstubAllGlobals();
        }
    });

    it('renders JPDB word page addons with local, Jiten, and JPDB definition data', async () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/review?c=v%2C1391940%2C864903531&r=1#a',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/review',
            search: '?c=v%2C1391940%2C864903531&r=1',
        });
        document.body.innerHTML = '<main><div class="answer-box"><div class="subsection-meanings">meaning</div></div></main>';
        const anchor = document.querySelector<HTMLElement>('.subsection-meanings')!;
        const renderEntry: YomitanTermEntry = {
            expression: '時間',
            reading: 'じかん',
            glossary: ['time'],
            dictionary: 'Jitendex',
        };
        const variantEntry: YomitanTermEntry = {
            expression: '時',
            reading: 'とき',
            glossary: ['time'],
            dictionary: 'AltDict',
        };
        const jpdbVocabularyInfo = { examples: [{ sentence: '時間です。', translation: 'It is time.', audioIds: [] }] } as never;
        const jitenVocabularyInfo = { senses: [{ glosses: ['time'] }] } as never;
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPageEnhancementGeneration: number;
            cardRenderData: {
                loadDefinitionSources(card: JPDBCard): {
                    localEntries: Promise<YomitanTermEntry[]>;
                    hydrateLocalEntries(): Promise<YomitanTermEntry[]>;
                    jpdbVocabularyInfo: Promise<unknown>;
                    jitenVocabularyInfo: Promise<unknown>;
                    bunproDefinitionInfo: Promise<null>;
                    settled: Promise<void>;
                };
            };
            lookupJpdbPageLocalEntries(target: LocalDictionaryTarget): Promise<YomitanTermEntry[]>;
            renderDefinitionSources(
                card: JPDBCard,
                entries: YomitanTermEntry[],
                sentence?: string,
                jpdbInfo?: unknown,
                jitenInfo?: unknown,
            ): string;
            parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void>;
            installJpdbWordPageEnhancement(target: LocalDictionaryTarget, generation: number): void;
        };
        const renderDefinitionSources = vi.fn(() => '<div class="full-word-info">full-info</div>');
        internals.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true, immersionKitEnabled: false };
        internals.jpdbPageEnhancementGeneration = 1;
        internals.cardRenderData = {
            loadDefinitionSources: () => ({
                localEntries: Promise.resolve([renderEntry]),
                hydrateLocalEntries: () => Promise.resolve([renderEntry]),
                jpdbVocabularyInfo: Promise.resolve(jpdbVocabularyInfo),
                jitenVocabularyInfo: Promise.resolve(jitenVocabularyInfo),
                bunproDefinitionInfo: Promise.resolve(null),
                settled: Promise.resolve(),
            }),
        };
        internals.lookupJpdbPageLocalEntries = vi.fn(async () => [variantEntry]);
        internals.renderDefinitionSources = renderDefinitionSources;
        internals.parseJpdbPageAddonJapanese = vi.fn(async () => undefined);

        try {
            internals.installJpdbWordPageEnhancement({
                term: '時間',
                reading: 'じかん',
                alternates: ['時'],
                compounds: [],
                examples: [{ sentence: '時間です。', translation: 'It is time.' }],
                anchor,
            }, 1);

            await vi.waitFor(() => expect(renderDefinitionSources).toHaveBeenCalledWith(
                expect.objectContaining({ spelling: '時間', reading: 'じかん', source: 'jpdb' }),
                expect.arrayContaining([renderEntry, variantEntry]),
                '時間です。',
                jpdbVocabularyInfo,
                jitenVocabularyInfo,
                null,
            ));

            expect(document.querySelector('.yomu-jpdb-word-addon .full-word-info')?.textContent).toBe('full-info');
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('mounts the review Immersion shell before any dictionary or provider request settles', () => {
        vi.stubGlobal('location', {
            href: 'https://jiten.moe/srs/study',
            origin: 'https://jiten.moe',
            hostname: 'jiten.moe',
            pathname: '/srs/study',
            search: '',
        });
        document.body.innerHTML = '<main><div data-case="review-answer"><div data-case="anchor">native answer</div></div></main>';
        const anchor = document.querySelector<HTMLElement>('[data-case="anchor"]')!;
        const localEntries = deferred<YomitanTermEntry[]>();
        const jpdbInfo = deferred<null>();
        const jitenInfo = deferred<null>();
        const bunproInfo = deferred<null>();
        const variantEntries = deferred<YomitanTermEntry[]>();
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbPageEnhancementGeneration: number;
            cardRenderData: {
                loadDefinitionSources(): {
                    localEntries: Promise<YomitanTermEntry[]>;
                    hydrateLocalEntries(): Promise<YomitanTermEntry[]>;
                    jpdbVocabularyInfo: Promise<null>;
                    jitenVocabularyInfo: Promise<null>;
                    bunproDefinitionInfo: Promise<null>;
                    settled: Promise<void>;
                };
            };
            lookupJpdbPageLocalEntries(): Promise<YomitanTermEntry[]>;
            renderDefinitionSources(
                card: JPDBCard,
                entries: YomitanTermEntry[],
                sentence?: string,
                jpdbInfo?: unknown,
                jitenInfo?: unknown,
                bunproInfo?: unknown,
            ): string;
            installJpdbPageImmersionExamples(root: HTMLElement, card: JPDBCard, relatedQueries?: string[]): void;
            parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void>;
            installJpdbWordPageEnhancement(target: LocalDictionaryTarget, generation: number): void;
        };
        const renderDefinitionSources = vi.fn(() => `
            <div class="jpdb-reader-definition-stack">
                <details class="jpdb-reader-immersion" data-immersion-kit open>
                    <summary>Immersion Kit</summary>
                    <div class="jpdb-reader-help">Loading examples…</div>
                </details>
            </div>
        `);
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true };
        internals.jpdbPageEnhancementGeneration = 1;
        internals.cardRenderData = {
            loadDefinitionSources: () => ({
                localEntries: localEntries.promise,
                hydrateLocalEntries: () => localEntries.promise,
                jpdbVocabularyInfo: jpdbInfo.promise,
                jitenVocabularyInfo: jitenInfo.promise,
                bunproDefinitionInfo: bunproInfo.promise,
                settled: Promise.allSettled([
                    localEntries.promise,
                    jpdbInfo.promise,
                    jitenInfo.promise,
                    bunproInfo.promise,
                ]).then(() => undefined),
            }),
        };
        internals.lookupJpdbPageLocalEntries = () => variantEntries.promise;
        internals.renderDefinitionSources = renderDefinitionSources;
        internals.installJpdbPageImmersionExamples = vi.fn();
        internals.parseJpdbPageAddonJapanese = vi.fn(async () => undefined);

        try {
            internals.installJpdbWordPageEnhancement({
                term: '時間',
                reading: 'じかん',
                alternates: [],
                compounds: [],
                examples: [],
                anchor,
            }, 1);

            expect(renderDefinitionSources).toHaveBeenCalledWith(
                expect.objectContaining({ spelling: '時間', source: 'jiten' }),
                [],
                undefined,
                null,
                null,
                null,
            );
            expect(document.querySelector('[data-yomu-jpdb-addon] [data-immersion-kit]')).not.toBeNull();
            expect(internals.installJpdbPageImmersionExamples).toHaveBeenCalledTimes(1);
        } finally {
            localEntries.resolve([]);
            jpdbInfo.resolve(null);
            jitenInfo.resolve(null);
            bunproInfo.resolve(null);
            variantEntries.resolve([]);
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('routes Jiten audio buttons in JPDB page addons through card actions', () => {
        const app = new ReaderApp();
        const root = document.createElement('div');
        root.dataset.jpdbReaderRoot = 'true';
        root.dataset.yomuJpdbAddon = 'word';
        root.innerHTML = `
            <button type="button" data-action="jiten-audio" data-study-sentence="サッカーをする。" data-jiten-audio-urls='["https://audio.example.test/soccer.mp3"]'>audio</button>
        `;
        document.body.append(root);
        const fallbackCard = { ...card, spelling: 'サッカー', reading: 'サッカー' };
        const handleCardAction = vi.fn(async () => undefined);
        const internals = app as unknown as {
            handleCardAction(button: HTMLButtonElement, actionCard: JPDBCard, sentence?: string): Promise<void>;
            handleJpdbPageAddonClick(event: MouseEvent, pageAddonRoot: HTMLElement, actionCard: JPDBCard): void;
        };
        internals.handleCardAction = handleCardAction;

        try {
            root.addEventListener('click', event => internals.handleJpdbPageAddonClick(event as MouseEvent, root, fallbackCard));
            const button = root.querySelector<HTMLButtonElement>('[data-action="jiten-audio"]')!;
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });

            button.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(handleCardAction).toHaveBeenCalledWith(button, fallbackCard, 'サッカー');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('sanitizes stroke-order SVGs before embedding them', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <path d="M10,10 C20,20 30,20 40,10" onclick="alert(1)" />
                <path d="bad url(javascript:alert(1))" />
                <text transform="matrix(1 0 0 1 8 12)">1</text>
                <script>alert(1)</script>
            </svg>
        `, '読');

        expect(info?.strokeCount).toBe(1);
        expect(info?.strokeShapes?.[0].length).toBeGreaterThan(2);
        expect(info?.svg).toContain('jpdb-reader-kanjivg-svg');
        expect(info?.svg).toContain('<text transform=');
        expect(info?.svg).not.toContain('onclick');
        expect(info?.svg).not.toContain('script');
        expect(info?.svg).not.toContain('javascript');
    });

    it('renders the new-tab doodle result hook in popover kanji practice cards', () => {
        const root = document.createElement('div');
        root.innerHTML = renderKanjiPractice({
            kanji: '嵐',
            strokeCount: 12,
            svg: '<svg class="jpdb-reader-kanjivg-svg"></svg>',
        }, '嵐', 'en');

        const result = root.querySelector<HTMLElement>('.jpdb-reader-kanjivg [data-newtab-doodle-result]');
        expect(result).not.toBeNull();
        expect(result?.classList.contains('jpdb-reader-newtab-doodle-result')).toBe(true);
    });

    it('renders JPDB page kanji practice doodles with the trace hidden by default', () => {
        const root = document.createElement('div');
        root.innerHTML = renderKanjiSourceMounts({
            settings: {
                ...DEFAULT_SETTINGS,
                kanjivgEnabled: true,
                kanjivgPriority: 0,
                jpdbKanjiEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
                immersionKitEnabled: false,
            },
            kanji: '子',
            language: 'en',
            isSourceOpen: () => true,
            sourceAttributes: () => 'open',
            sourceTitle: sourceId => sourceId === KANJI_STROKE_SOURCE_ID ? 'Stroke practice' : sourceId,
        });

        const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage');
        const ghost = root.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        const trace = root.querySelector<HTMLButtonElement>('[data-doodle-trace]');

        expect(stage?.classList.contains('trace-hidden')).toBe(true);
        expect(ghost?.hidden).toBe(true);
        expect(trace?.textContent).toBe('Show trace');
    });

    it('uses KanjiVG component positions for straight origin graph arrows', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="思">
                    <g kvg:element="田" kvg:position="top">
                        <path d="M10,10 L20,20" />
                    </g>
                    <g kvg:element="心" kvg:position="bottom">
                        <path d="M30,70 L40,80" />
                    </g>
                </g>
            </svg>
        `, '思');
        const graph = buildKanjiOriginGraph('思', null, null, [], null, info);

        expect(graph.nodes.find(node => node.id === '田')?.position).toBe('top');
        expect(graph.nodes.find(node => node.id === '心')?.position).toBe('bottom');

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('data-target-zone="top"');
        expect(html).toContain('data-target-zone="bottom"');
        expect(html).not.toMatch(/class="jpdb-reader-origin-edge" d="[^"]*[QC]/);
    });

    it('uses KanjiVG component geometry for the initial origin graph layout', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 100 100">
                <g kvg:element="線">
                    <g kvg:element="糸" kvg:position="left">
                        <path d="M8,15 L32,15 L32,92 L8,92 Z" />
                    </g>
                    <g kvg:element="泉" kvg:position="right">
                        <g kvg:element="白" kvg:position="top">
                            <path d="M58,8 L93,8 L93,38 L58,38 Z" />
                        </g>
                        <g kvg:element="水" kvg:position="bottom">
                            <path d="M55,55 L96,55 L96,98 L55,98 Z" />
                        </g>
                    </g>
                </g>
            </svg>
        `, '線');
        const graph = buildKanjiOriginGraph('線', null, null, [], null, info);
        const byId = new Map(graph.nodes.map(node => [node.id, node]));

        expect(info?.componentPositions?.find(component => component.component === '糸')?.center).toEqual({ x: 0.2, y: 0.535 });
        expect(byId.get('糸')?.geometry?.x).toBeLessThan(byId.get('泉')?.geometry?.x ?? 0);
        expect(byId.get('白')?.geometry?.y).toBeLessThan(byId.get('水')?.geometry?.y ?? 0);

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const thread = graphNodeDataPosition(html, '糸');
        const spring = graphNodeDataPosition(html, '泉');
        const white = graphNodeDataPosition(html, '白');
        const water = graphNodeDataPosition(html, '水');

        expect(thread.x).toBeLessThan(spring.x);
        expect(white.x).toBeGreaterThan(thread.x);
        expect(water.x).toBeGreaterThan(thread.x);
        expect(white.y).toBeLessThan(water.y);
    });

    it('projects close KanjiVG geometry anchors away from the current node', () => {
        const graph = {
            nodes: [
                { id: '波', label: '波', kind: 'current' as const, detail: 'a wave', source: 'current lookup' },
                { id: '皮', label: '皮', kind: 'component' as const, detail: 'skin', source: 'JPDB', position: 'right', geometry: { x: 0.5303, y: 0.2761 } },
                { id: '氵', label: '氵', kind: 'component' as const, detail: 'water drops', source: 'JPDB', position: 'left', geometry: { x: 0.087, y: 0.517 } },
                { id: '婆', label: '婆', kind: 'component' as const, detail: 'old woman', source: 'JPDB' },
                { id: '菠', label: '菠', kind: 'component' as const, detail: 'spinach', source: 'JPDB' },
            ],
            edges: [
                { from: '皮', to: '波', label: 'JPDB component' },
                { from: '氵', to: '波', label: 'JPDB component' },
                { from: '波', to: '婆', label: 'used in kanji' },
                { from: '波', to: '菠', label: 'used in kanji' },
            ],
        };
        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const wave = graphNodeDataGeometry(html, '波');
        const skin = graphNodeDataGeometry(html, '皮');

        const separated = Math.abs(skin.x - wave.x) > skin.rx + wave.rx
            || Math.abs(skin.y - wave.y) > skin.ry + wave.ry;
        expect(separated).toBe(true);
    });

    it('carries KanjiVG radical variant positions onto JPDB component nodes', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="険">
                    <g kvg:element="⻖" kvg:original="阜" kvg:position="left">
                        <path d="M13,20 L32,17 L16,96" />
                    </g>
                    <g kvg:element="㑒" kvg:position="right">
                        <path d="M62,11 L41,45 M62,16 L93,42" />
                    </g>
                </g>
            </svg>
        `, '険');
        const graph = buildKanjiOriginGraph('険', {
            kanji: '険',
            keyword: 'risky and steep',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '阝', keyword: 'mound' }, { kanji: '㑒', keyword: 'all together' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, [], null, info);

        expect(graph.nodes.find(node => node.id === '阝')?.position).toBe('left');

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('data-graph-node="阝"');
        expect(html).toContain('data-from="阝" data-to="険" data-label="JPDB component" data-target-zone="left"');
    });

    it('keeps nested KanjiVG components inside edge-side parents instead of stacking on the edge', () => {
        const graph = buildKanjiOriginGraph('憾', null, null, [], null, {
            kanji: '憾',
            svg: '<svg></svg>',
            strokeCount: 16,
            componentPositions: [
                { component: '忄', original: '心', position: 'left', direct: true, depth: 1 },
                { component: '感', position: 'right', direct: true, depth: 1 },
                { component: '咸', parent: '感', position: 'top', direct: false, depth: 2 },
                { component: '心', parent: '感', position: 'bottom', direct: false, depth: 2 },
                { component: '口', parent: '咸', position: 'left', direct: false, depth: 3 },
                { component: '戍', parent: '咸', position: 'center', direct: false, depth: 3 },
            ],
        });
        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const leftRadical = graphNodeStylePosition(html, '忄');
        const rightParent = graphNodeStylePosition(html, '感');
        const innerChild = graphNodeStylePosition(html, '口');
        const sibling = graphNodeStylePosition(html, '戍');

        expect(leftRadical.x).toBeGreaterThan(16);
        expect(leftRadical.x).toBeLessThan(36);
        expect(rightParent.x).toBeGreaterThan(60);
        expect(innerChild.x).toBeLessThan(rightParent.x);
        expect(Math.abs(innerChild.y - sibling.y)).toBeGreaterThan(12);
    });

    it('adds nested KanjiVG subcomponents as a separate graph layer', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="敬">
                    <g kvg:element="苟" kvg:position="left">
                        <g kvg:element="艹" kvg:position="top">
                            <path d="M10,20 L45,20" />
                        </g>
                        <g kvg:element="句" kvg:position="bottom">
                            <path d="M15,50 L45,50" />
                            <g kvg:element="口" kvg:position="right">
                                <path d="M30,62 L44,62 L44,78 L30,78 Z" />
                            </g>
                        </g>
                    </g>
                    <g kvg:element="攵" kvg:position="right">
                        <path d="M64,20 L92,88" />
                    </g>
                </g>
            </svg>
        `, '敬');
        const graph = buildKanjiOriginGraph('敬', null, null, [], null, info);

        expect(info?.componentPositions).toEqual(expect.arrayContaining([
            expect.objectContaining({ component: '苟', direct: true, depth: 1 }),
            expect.objectContaining({ component: '艹', parent: '苟', position: 'top', direct: false, depth: 2 }),
            expect.objectContaining({ component: '口', parent: '句', position: 'right', direct: false, depth: 3 }),
        ]));
        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '苟', to: '敬', label: 'KanjiVG component' },
            { from: '艹', to: '苟', label: 'subcomponent' },
            { from: '句', to: '苟', label: 'subcomponent' },
            { from: '口', to: '句', label: 'subcomponent' },
        ]));

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('data-origin-has-subcomponents="true"');
        expect(html).toContain('data-origin-subcomponent-toggle');
        expect(html).toContain('data-origin-subcomponent="true"');
        expect(html).toContain('class="jpdb-reader-origin-edge-group subcomponent"');
        expect(html).toContain('data-graph-node="口"');
        expect(html).toContain('data-target-zone="right"');
    });

    it('keeps direct components out of the KanjiVG subcomponent layer', () => {
        const graph = buildKanjiOriginGraph('即', {
            kanji: '即',
            keyword: 'instant',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '厶', keyword: 'private' }, { kanji: '日', keyword: 'sun' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, [], null, {
            kanji: '即',
            svg: '<svg></svg>',
            strokeCount: 7,
            componentPositions: [
                { component: '卩', position: 'right', direct: true, depth: 1 },
                { component: '厶', parent: '卩', position: 'center', direct: false, depth: 2 },
            ],
        });

        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '厶', to: '即', label: 'JPDB component' },
        ]));
        expect(graph.edges).not.toEqual(expect.arrayContaining([
            { from: '厶', to: '卩', label: 'subcomponent' },
        ]));
    });

    it('does not treat nested KanjiVG variant wrappers as subcomponents', () => {
        const info = parseKanjiVGSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net" viewBox="0 0 109 109">
                <g kvg:element="即">
                    <g kvg:element="艮" kvg:position="left">
                        <path d="M16,17 L45,18" />
                    </g>
                    <g kvg:element="卩" kvg:position="right">
                        <g kvg:element="厶" kvg:variant="true" kvg:original="厶">
                            <path d="M61,23 L87,21" />
                        </g>
                    </g>
                </g>
            </svg>
        `, '即');
        const graph = buildKanjiOriginGraph('即', null, null, [], null, info);

        expect(info?.componentPositions).toEqual(expect.arrayContaining([
            expect.objectContaining({ component: '厶', parent: '卩', direct: false, variant: true }),
        ]));
        expect(graph.edges).not.toEqual(expect.arrayContaining([
            { from: '厶', to: '卩', label: 'subcomponent' },
        ]));

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        expect(html).not.toContain('data-origin-subcomponent-toggle');
        expect(html).not.toContain('data-origin-subcomponent="true"');
    });

    it('keeps 友 components visually anchored and distinguishes outbound graph links', () => {
        const graph = buildKanjiOriginGraph('友', {
            kanji: '友',
            keyword: 'friend',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: 'ナ', keyword: "by one's side" }, { kanji: '又', keyword: 'once again' }],
            usedInKanji: [
                { kanji: '髪', keyword: 'hair' },
                { kanji: '抜', keyword: 'extract' },
            ],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, [], null, null);

        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');

        expect(html).toContain('data-graph-node="ナ"');
        expect(html).toContain('data-graph-node="又"');
        expect(html).toContain('data-target-zone="upper"');
        expect(html).toContain('data-target-zone="bottom"');
        expect(html).toContain('jpdb-reader-origin-edge-arrow-outbound');
        expect(html).toContain('-outbound');
        expect(html).toContain('class="jpdb-reader-origin-edge-group outbound"');
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
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
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
            { label: 'Strokes', value: '14', source: 'KanjiVG' },
            { label: 'Frequency', value: 'Top 400-500', source: 'JPDB' },
        ]));
        expect(facts.some(fact => fact.label === 'RTK frame' || fact.label === 'Old forms')).toBe(false);
        expect(facts.some(fact => fact.source === 'Kanji Grid' || fact.label === 'Learning')).toBe(false);
    });

    it('keeps kanji facts useful when only map and stroke data are available', () => {
        const sourceInfo = {
            kanjiMap: parseKanjiMapInfo({
                kanjialiveData: {
                    grade: 1,
                    kstroke: 5,
                    radical: {
                        character: '立',
                        strokes: 5,
                        name: { hiragana: 'たつ', romaji: 'tatsu' },
                        meaning: { english: 'stand' },
                    },
                },
                jishoData: {
                    meaning: 'stand up',
                    jlptLevel: 'N4',
                    taughtIn: 'grade 1',
                    strokeCount: 5,
                    newspaperFrequencyRank: '58',
                    parts: ['亠'],
                },
            }, '立', 'https://example.test/立.json'),
        };
        const facts = buildKanjiFacts('立', null, null, {
            kanji: '立',
            svg: '<svg></svg>',
            strokeCount: 5,
        }, [], sourceInfo);

        expect(facts).toEqual(expect.arrayContaining([
            { label: 'Meaning', value: 'stand up', source: 'Kanji Alive / Jisho' },
            { label: 'JLPT', value: 'N4', source: 'Jisho' },
            { label: 'Grade', value: 'Grade 1', source: 'Kanji Alive / Jisho' },
            { label: 'Strokes', value: '5', source: 'KanjiVG' },
            { label: 'Frequency', value: '#58', source: 'Jisho' },
        ]));
        expect(facts.some(fact => fact.source === 'Kanji Grid' || fact.label === 'Learning')).toBe(false);
    });

    it('builds a small 2D kanji origin graph from component sources', () => {
        const sourceInfo = {
            kanjiMap: parseKanjiMapInfo({
                kanjialiveData: {
                    radical: {
                        character: '言',
                        strokes: 7,
                        image: 'https://media.kanjialive.com/radical_character/gonben.svg',
                        name: { hiragana: 'ごんべん', romaji: 'gonben' },
                        meaning: { english: 'words, to speak, say' },
                    },
                },
                jishoData: {
                    meaning: 'read',
                    jlptLevel: 'N5',
                    taughtIn: 'grade 2',
                    strokeCount: 14,
                    newspaperFrequencyRank: '618',
                    parts: ['言', '売', '讠'],
                },
            }, '読', 'https://example.test/読.json'),
        };
        const graph = buildKanjiOriginGraph('読', {
            kanji: '読',
            keyword: 'read',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '言', keyword: 'say' }, { kanji: '買', keyword: 'buy' }],
            usedInKanji: [{ kanji: '讀', keyword: 'traditional read' }],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, {
            kanji: '読',
            keyword: 'read',
            frameNumber: '372',
            onYomi: '',
            kunYomi: '',
            elements: 'words + sell',
            componentKanji: ['言', '売', '買'],
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
        }], sourceInfo);

        expect(graph.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['読', '言', '売']));
        expect(graph.edges).toEqual(expect.arrayContaining([
            { from: '言', to: '読', label: 'radical' },
            { from: '売', to: '読', label: 'structural part' },
            { from: '言', to: '読', label: 'JPDB component' },
            { from: '売', to: '読', label: 'RTK element' },
            { from: '読', to: '讀', label: 'used in kanji' },
        ]));

        const html = renderKanjiOrigins([], graph, sourceInfo, DEFAULT_SETTINGS, 'en');
        expect(html).toContain('preserveAspectRatio="none"');
        expect(html).not.toContain('<line ');
        expect(html.match(/class="jpdb-reader-origin-edge"/g)).toHaveLength(3);
        expect(html).toContain('data-origin-outbound="true"');
        expect(html).toContain('data-origin-outbound-toggle');
        expect(html).toContain('data-rx=');
        expect(html).not.toContain('jpdb-reader-origin-edge-particle');
        expect(html).not.toContain('data-graph-node="買"');
        expect(html).not.toContain('data-graph-node="讠"');
    });

    it('spaces crowded outbound kanji graph nodes apart', () => {
        const graph = {
            nodes: [
                { id: '川', label: '川', kind: 'current' as const, detail: 'river', source: 'test' },
                { id: '訓', label: '訓', kind: 'component' as const, detail: 'instruction', source: 'test' },
                { id: '州', label: '州', kind: 'component' as const, detail: 'state', source: 'test' },
                { id: '順', label: '順', kind: 'component' as const, detail: 'order', source: 'test' },
                { id: '馴', label: '馴', kind: 'component' as const, detail: 'tame', source: 'test' },
            ],
            edges: [
                { from: '川', to: '訓', label: 'used in kanji' },
                { from: '川', to: '州', label: 'used in kanji' },
                { from: '川', to: '順', label: 'used in kanji' },
                { from: '川', to: '馴', label: 'used in kanji' },
            ],
        };
        const html = renderKanjiOrigins([], graph, null, DEFAULT_SETTINGS, 'en');
        const positionByNode = kanjiGraphPositions(html);
        const instruction = kanjiGraphPoint(positionByNode, '訓');
        const state = kanjiGraphPoint(positionByNode, '州');
        const order = kanjiGraphPoint(positionByNode, '順');
        const tame = kanjiGraphPoint(positionByNode, '馴');

        expect(instruction.y).toBeLessThan(state.y);
        expect(state.y).toBeLessThan(order.y);
        expect(order.y).toBeLessThan(tame.y);
        expect(kanjiGraphDistance(positionByNode, '訓', '州')).toBeGreaterThan(21);
        expect(kanjiGraphDistance(positionByNode, '州', '順')).toBeGreaterThan(21);
        expect(kanjiGraphDistance(positionByNode, '順', '馴')).toBeGreaterThan(21);
    });

    it('normalizes Kanji Alive and Kanji Map data for compact kanji cards', () => {
        const info = parseKanjiMapInfo({
            kanjialiveData: {
                grade: 2,
                kstroke: 14,
                radical: {
                    image: 'https://media.kanjialive.com/radical_character/gonben.svg',
                    animation: ['https://media.kanjialive.com/rad_frames/gonben0.svg'],
                    name: { hiragana: 'ごんべん', romaji: 'gonben' },
                    meaning: { english: 'words, to speak, say' },
                    position: { hiragana: 'へん' },
                },
                examples: [{ japanese: '読む（よむ）', meaning: { english: 'read' } }],
            },
            jishoData: {
                meaning: 'read',
                jlptLevel: 'N5',
                taughtIn: 'grade 2',
                strokeCount: 14,
                newspaperFrequencyRank: '618',
                kunyomi: ['よ.む'],
                onyomi: ['ドク'],
                parts: ['言', '売'],
                radical: { symbol: '言', forms: ['訁'], meaning: 'speech' },
                uri: 'https://jisho.org/search/%E8%AA%AD%23kanji',
            },
        }, '読', 'https://example.test/読.json');

        expect(info).toMatchObject({
            meaning: 'read',
            jlpt: 'N5',
            grade: 'Grade 2',
            strokeCount: 14,
            frequencyRank: '#618',
            parts: ['言', '売'],
            radical: {
                symbol: '言',
                forms: ['訁'],
                reading: 'ごんべん',
                name: 'gonben',
                meaning: 'words, to speak, say',
                image: 'https://media.kanjialive.com/radical_character/gonben.svg',
            },
        });
    });

    it('parses primary and native VTT subtitle files', () => {
        const japanese = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n今日は本を読む。\n');
        const native = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nToday I read a book.\n');

        expect(japanese).toMatchObject([{ start: 1, end: 3, text: '今日は本を読む。' }]);
        expect(native).toMatchObject([{ start: 1, end: 3, text: 'Today I read a book.' }]);
    });

    it('parses SRT subtitle files from page download buttons', () => {
        const cues = parseSubtitleText('1\n00:00:01,250 --> 00:00:03,500\n今日は本を読む。\n\n2\n00:00:04,000 --> 00:00:05,000\n終わり。');

        expect(cues).toMatchObject([
            { start: 1.25, end: 3.5, text: '今日は本を読む。' },
            { start: 4, end: 5, text: '終わり。' },
        ]);
    });

    it('parses BOM-prefixed SRT files with whole-second timestamps', () => {
        const cues = parseSubtitleText('\uFEFF1\r\n00:00:01 --> 00:00:03\r\n今日は本を読む。\r\n\r\n2\r\n00:00:04 --> 00:00:05\r\n終わり。');

        expect(cues).toMatchObject([
            { start: 1, end: 3, text: '今日は本を読む。' },
            { start: 4, end: 5, text: '終わり。' },
        ]);
    });

    it('discovers page VTT and SRT subtitle sources without site-specific selectors', () => {
        document.body.innerHTML = `
            <video>
                <track kind="subtitles" srclang="ja-JP" label="日本語" src="/media/subtitles.vtt?filename=%E5%B0%8F%E4%BA%BA.vtt&v=123">
            </video>
            <a href="https://media.test/lesson/native.srt" download="native.srt">SRT</a>
            <a href="/lesson/video.mp4">MP4</a>
        `;

        expect(collectPageSubtitleSources(document)).toMatchObject([
            {
                url: expect.stringContaining('/media/subtitles.vtt'),
                label: '小人',
                language: 'ja',
            },
            {
                url: 'https://media.test/lesson/native.srt',
                label: 'native',
                language: undefined,
            },
        ]);
    });

    it('splits multi-sentence subtitle cues with proportional timing', () => {
        const cues = normalizeSubtitleCues([{ start: 10, end: 16, text: '今日は本を読む。明日は学校へ行く。' }]);

        expect(cues).toMatchObject([
            { start: 10, text: '今日は本を読む。', originalText: '今日は本を読む。明日は学校へ行く。' },
            { text: '明日は学校へ行く。', originalText: '今日は本を読む。明日は学校へ行く。' },
        ]);
        expect(cues[0].end).toBeGreaterThan(10);
        expect(cues[1].start).toBe(cues[0].end);
        expect(cues[1].end).toBe(16);
    });

    it('splits overlong subtitle cues without punctuation', () => {
        const cues = normalizeSubtitleCues([{ start: 0, end: 8, text: 'これはとても長い自動生成字幕で句読点がなくても画面からはみ出さないように分割されます' }]);

        expect(cues.length).toBeGreaterThan(1);
        expect(cues[0].start).toBe(0);
        expect(cues.at(-1)?.end).toBe(8);
        expect(cues.every(cue => cue.text.length <= 48)).toBe(true);
    });

    it('finds active subtitle cues without sorting the whole cue list on every tick', () => {
        const cues = Array.from({ length: 5000 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `字幕${index}`,
        }));
        cues.splice(1200, 0,
            { start: 1200.1, end: 1204, text: '長い字幕' },
            { start: 1203.5, end: 1204.4, text: '新しい字幕' },
        );
        cues.sort((a, b) => a.start - b.start || a.end - b.end);

        expect(findActiveSubtitleCue(cues, 1203.6)?.text).toBe('新しい字幕');
        expect(findActiveSubtitleCue(cues, 1203.9)?.text).toBe('新しい字幕');
        expect(findActiveSubtitleCue(cues, 1204.3)?.text).toBe('字幕1204');
        expect(findActiveSubtitleCue(cues, 5001)).toBeUndefined();
    });

    it('parses WebVTT timestamp tags into word timings', () => {
        const [cue] = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<00:00:01.500>今日<00:00:02.500>読む\n');

        expect(cue.text).toBe('今日読む');
        expect(cue.wordTimingsExact).toBe(true);
        expect(cue.words?.[0]).toMatchObject({ text: '今日', start: 1.5 });
        expect(cue.words?.at(-1)?.end).toBe(4);
    });

    it('does not invent karaoke timings for line-level subtitle cues', () => {
        const [plain] = normalizeSubtitleCues([{ start: 1, end: 4, text: 'bottom line. Okay, Nvidia is right now' }]);
        const [phraseTimed] = parseSubtitleText('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<00:00:01.500>bottom line <00:00:02.500>Okay\n');

        expect(plain.wordTimingsExact).toBe(false);
        expect(plain.words).toBeUndefined();
        expect(phraseTimed.wordTimingsExact).not.toBe(true);
        expect(phraseTimed.words).toBeUndefined();
    });

    it('parses YouTube timedtext JSON and XML subtitle payloads', () => {
        const json = parseSubtitleText(JSON.stringify({
            events: [
                { tStartMs: 1250, dDurationMs: 1750, segs: [{ utf8: '今日は' }, { utf8: '本を読む。' }] },
            ],
        }));
        const xml = parseSubtitleText('<transcript><text start="4.5" dur="2">明日 &amp; 勉強</text></transcript>');
        const srv3 = parseSubtitleText('<timedtext><body><p t="1000" d="3000"><s t="0">今日</s><s t="1200">読む</s></p></body></timedtext>');

        expect(json).toMatchObject([{ start: 1.25, end: 3, text: '今日は本を読む。' }]);
        expect(xml).toMatchObject([{ start: 4.5, end: 6.5, text: '明日 & 勉強' }]);
        expect(srv3).toMatchObject([{ start: 1, end: 4, text: '今日読む' }]);
        expect(json[0].wordTimingsExact).toBe(false);
        expect(json[0].words).toBeUndefined();
        expect(srv3[0].wordTimingsExact).toBe(true);
        expect(srv3[0].words).toMatchObject([{ text: '今日', start: 1, end: 2.2 }, { text: '読む', start: 2.2, end: 4 }]);
    });

    it('loads YouTube captions through ordered timedtext fallbacks', async () => {
        const requestedFormats: Array<string | null> = [];
        const requestErrors: Array<{ format: string | null; message: string }> = [];
        const cues = await loadYouTubeTrackCues({
            kind: 'youtube',
            label: 'Japanese (ja)',
            language: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
        }, {
            requestText: async url => {
                const format = new URL(url).searchParams.get('fmt');
                requestedFormats.push(format);
                if (format === 'srv3') return '';
                if (format !== 'json3') throw new Error('try the next format');
                return '<timedtext><body><p t="1000" d="3000"><s t="0">今日</s><s t="1200">読む</s></p></body></timedtext>';
            },
            onRequestError: (_track, url, error) => requestErrors.push({
                format: new URL(url).searchParams.get('fmt'),
                message: error instanceof Error ? error.message : String(error),
            }),
        });

        expect(requestedFormats).toEqual(['srv3', 'json3']);
        expect(requestErrors).toEqual([{ format: 'srv3', message: 'YouTube timedtext response was empty.' }]);
        expect(cues).toMatchObject([{ start: 1, end: 4, text: '今日読む' }]);
    });

    it('reuses loaded remote and YouTube subtitle cues without refetching', async () => {
        const remoteTrack = {
            id: 'remote-ja',
            kind: 'remote' as const,
            label: 'Remote Japanese',
            url: 'https://example.test/captions.xml',
        };
        const youtubeTrack = {
            id: 'youtube-ja',
            kind: 'youtube' as const,
            label: 'Japanese',
            language: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=ja',
        };
        const remoteRequest = vi.fn(async () => '<transcript><text start="1" dur="2">日本語</text></transcript>');
        const youtubeRequest = vi.fn(async () => '<transcript><text start="4" dur="1.5">字幕</text></transcript>');

        const firstRemote = await loadSubtitleTrackCues(remoteTrack, {
            tracks: [remoteTrack],
            transcriptEligible: true,
            requestText: remoteRequest,
        });
        const secondRemote = await loadSubtitleTrackCues(remoteTrack, {
            tracks: [remoteTrack],
            transcriptEligible: true,
            requestText: remoteRequest,
        });
        const firstYoutube = await loadSubtitleTrackCues(youtubeTrack, {
            tracks: [youtubeTrack],
            transcriptEligible: true,
            requestText: youtubeRequest,
        });
        const secondYoutube = await loadSubtitleTrackCues(youtubeTrack, {
            tracks: [youtubeTrack],
            transcriptEligible: true,
            requestText: youtubeRequest,
        });

        expect(remoteRequest).toHaveBeenCalledTimes(1);
        expect(youtubeRequest).toHaveBeenCalledTimes(1);
        expect(firstRemote.cues).toBe(secondRemote.cues);
        expect(firstYoutube.cues).toBe(secondYoutube.cues);
        expect(secondRemote.cues).toMatchObject([{ start: 1, end: 3, text: '日本語' }]);
        expect(secondYoutube.cues).toMatchObject([{ start: 4, end: 5.5, text: '字幕' }]);
    });

});
