import { describe, expect, it, vi } from 'vitest';
import {
    fallbackJapaneseSegments,
    fallbackLookupTermAtOffset,
    fallbackLookupTermsForText,
    ReaderParser,
} from '../../src/reader/lookup/parser';
import { renderTokensToHtml } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { deinflectJapaneseTerm } from '../../src/reader/lookup/deinflect';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import type {
    YomitanExactTermCandidateRequest,
    YomitanTermEntry,
    YomitanTermMatch,
} from '../../src/reader/dictionaries/yomitan';
import type { LearningTargetModule } from '../../src/reader/languages/types';

function deinflected(surface: string, lemma: string) {
    const candidate = deinflectJapaneseTerm(surface).find(item => item.term === lemma);
    expect(candidate, `${surface} should deinflect to ${lemma}`).toBeTruthy();
    return candidate!;
}

/**
 * Regression coverage for the keyless local segmenter that drives parsing when
 * no Jiten/JPDB key is available. These guard against the misparses reported in
 * the 2026-06-14 P0 backlog (P0-02): dangling kana stems and over-isolated
 * single-character tiles. They assert linguistic coherence properties rather
 * than re-deriving the segmenter, so the parser keeps choosing whole words from
 * sentence context instead of fragmenting continuous Japanese.
 */
function surfaces(text: string): string[] {
    return fallbackJapaneseSegments(text).map(segment => segment.surface);
}

function publicProviderToken(text: string, spelling: string, start: number, end: number): JPDBToken {
    return {
        card: {
            vid: start + 1,
            sid: 1,
            rid: 0,
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten',
        },
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence: text,
    };
}

function exactCandidateLookup(entries: readonly YomitanTermEntry[]) {
    return vi.fn(async (
        requests: readonly YomitanExactTermCandidateRequest[],
        _preferences: unknown,
        target: LearningTargetModule,
    ) => requests.flatMap((request, requestIndex) => {
        const term = target.normalizeText(request.lookupCandidate.term);
        const entry = entries.find(candidate => (
            [candidate.expression, candidate.reading]
                .some(value => target.normalizeText(value) === term)
            && (!request.lookupCandidate.rules.length
                || target.matchesLookupCandidateRules(candidate.rules ?? '', request.lookupCandidate.rules))
        ));
        return entry ? [{ request, requestIndex, entry }] : [];
    }));
}

function exactCardLookup(currentCards: () => readonly JPDBCard[]) {
    return vi.fn(async (terms: readonly string[]) => {
        const result = new Map<string, JPDBCard>();
        for (const term of terms) {
            const card = currentCards().find(candidate => (
                candidate.spelling === term || candidate.reading === term
            ));
            if (card) result.set(term, card);
        }
        return result;
    });
}

function sequencedPublicVocabulary(
    parsedResults: readonly (readonly JPDBToken[])[],
    exactResults: readonly (readonly JPDBCard[])[] = parsedResults.map(tokens => tokens.map(token => token.card)),
) {
    let callIndex = 0;
    let currentExactCards: readonly JPDBCard[] = [];
    const parse = vi.fn(async (paragraphs: readonly string[]): Promise<JPDBToken[][]> => {
        const index = callIndex;
        callIndex += 1;
        currentExactCards = exactResults[index] ?? [];
        return paragraphs.map((_, paragraphIndex) => (
            paragraphIndex === 0 ? [...(parsedResults[index] ?? [])] : []
        ));
    });
    return { parse, lookupMany: exactCardLookup(() => currentExactCards) };
}

describe('fallback Japanese segmentation coherence (P0-02)', () => {
    it('keeps supplementary kanji reachable at either UTF-16 code-unit offset', () => {
        const text = 'A𠮟B';
        expect(surfaces('𠮟る')).toContain('𠮟');
        expect(fallbackLookupTermAtOffset(text, 1)).toBe('𠮟');
        expect(fallbackLookupTermAtOffset(text, 2)).toBe('𠮟');
    });

    it('does not leave a dangling さし stem for ややさしい', () => {
        const segs = surfaces('ややさしい');
        expect(segs).toEqual(['や', 'やさしい']);
        expect(segs).not.toContain('さし');
        // The whole continuous run is still offered as a single lookup term.
        expect(fallbackLookupTermsForText('ややさしい')).toContain('ややさしい');
    });

    it('keeps 読み取る as a single compound verb instead of 読み + 取る', () => {
        expect(surfaces('読み取る')).toEqual(['読み取る']);
    });

    // ICU's keyless 'ja' word segmenter has no kana dictionary, so it
    // over-fragments hiragana-only words on phonetic guesses (にほんご→に|ほん|ご).
    // mergeContiguousKanaSegments collapses those bogus intra-kana boundaries
    // while preserving real particle / content-word splits.
    it('collapses over-segmented kana-only nouns into one token', () => {
        expect(surfaces('にほんご')).toEqual(['にほんご']);
        expect(surfaces('じかん')).toEqual(['じかん']);
        expect(surfaces('がっこう')).toEqual(['がっこう']);
        expect(surfaces('たべもの')).toEqual(['たべもの']);
        expect(surfaces('ｶﾀｶﾅ')).toEqual(['ｶﾀｶﾅ']);
    });

    it('collapses over-segmented katakana compounds into one token', () => {
        // ICU splits loanword compounds phonetically (イ|マージ|ョン|キット —
        // ョン even starts on a small kana). A contiguous katakana run has no
        // particles or grammar, so it always reads as one orthographic word.
        expect(surfaces('イマージョンキット')).toEqual(['イマージョンキット']);
        expect(surfaces('イマージョンキットで学ぶ')).toContain('イマージョンキット');
        // Mixed-script boundaries stay intact: katakana merging never eats
        // the surrounding kanji/hiragana segments.
        expect(surfaces('東京タワーを見る')).toEqual(['東京タワー', 'を', '見る']);
        expect(surfaces('アニメで日本語')).toEqual(['アニメ', 'で', '日本語']);
    });

    it('keeps a real particle boundary when merging kana-only runs', () => {
        expect(surfaces('にほんごのじかん')).toEqual(['にほんご', 'の', 'じかん']);
    });

    it('does not over-merge a kana adjective behind a leading particle', () => {
        // やさしい independently deinflects to a content word, so its boundary
        // survives the kana merge (regression guard against gluing や+やさしい).
        expect(surfaces('ややさしい')).toEqual(['や', 'やさしい']);
    });

    it('parses a long mixed sentence into coherent words, not isolated tiles', () => {
        const segs = surfaces('好きなものを読んで日本語を学ぶ');
        expect(segs).toEqual(['好き', 'な', 'もの', 'を', '読んで', '日本語', 'を', '学ぶ']);
        // Specifically guard against the over-isolation the user reported.
        expect(segs).toContain('日本語');
        expect(segs).toContain('読んで');
        expect(segs).toContain('学ぶ');
        for (const fragment of ['日', '本', '語', '読', 'ん', 'で', '学', 'ぶ']) {
            expect(segs).not.toContain(fragment);
        }
    });

    it('uses public Jiten parsing for no-key full-page batches before segmented fallback', async () => {
        const seeingText = '猫を見る。';
        const seeingToken = publicProviderToken(seeingText, '見る', 2, 4);
        seeingToken.card.vid = 1259290;
        seeingToken.card.jitenWordId = 1259290;
        seeingToken.card.jitenReadingIndex = 0;
        const publicParse = vi.fn(async (paragraphs: readonly string[]): Promise<JPDBToken[][]> => paragraphs.map(text => text.includes('猫')
            ? [seeingToken]
            : []));
        const jpdbParse = vi.fn();
        const findTermMatches = vi.fn();
        const publicLookupMany = exactCardLookup(() => [seeingToken.card]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { parse: jpdbParse } as never,
            jitenPublicVocabulary: { parse: publicParse, lookupMany: publicLookupMany },
            dictionaries: { findTermMatches } as never,
        });

        const parsed = await parser.parse(['本を読む。', '猫を見る。'], { allowSegmentedFallback: true });

        expect(publicParse).toHaveBeenCalledTimes(1);
        expect(publicParse).toHaveBeenCalledWith(['本を読む。', '猫を見る。']);
        expect(publicLookupMany).toHaveBeenCalledTimes(1);
        expect(jpdbParse).not.toHaveBeenCalled();
        expect(findTermMatches).not.toHaveBeenCalled();
        expect(parsed[1]?.find(token => token.card.source === 'jiten')?.card).toMatchObject({ source: 'jiten', jitenWordId: 1259290 });
        expect(parsed[0]?.map(token => token.card.spelling)).toEqual(['本', 'を', '読む']);
    });

    it('does not let a later sparse parse erase cached reading and pitch evidence', async () => {
        const text = '名古屋城';
        const complete = publicProviderToken(text, text, 0, text.length);
        complete.card.vid = 90360;
        complete.card.sid = 0;
        complete.card.jitenWordId = 90360;
        complete.card.jitenReadingIndex = 0;
        complete.card.reading = 'なごやじょう';
        complete.card.frequencyRank = 4200;
        complete.card.partOfSpeech = ['n'];
        complete.card.meanings = [{ glosses: ['Nagoya Castle'], partOfSpeech: ['n'] }];
        complete.card.pitchAccent = ['LHHHLL'];
        complete.card.wordWithReading = '名[な]古[ご]屋[や]城[じょう]';
        complete.pitchClass = 'nakadaka';
        const sparse = publicProviderToken(text, text, 0, text.length);
        sparse.card.vid = 90360;
        sparse.card.sid = 0;
        sparse.card.jitenWordId = 90360;
        sparse.card.jitenReadingIndex = 0;
        const publicVocabulary = sequencedPublicVocabulary([[sparse]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            jitenPublicVocabulary: publicVocabulary,
            dictionaries: {} as never,
        });

        // The real enrichment/click path publishes the detail card through
        // cacheCards before a later page scan returns the sparse record.
        parser.cacheCards([complete.card]);
        const [recycled] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(recycled?.[0]).toMatchObject({
            card: {
                spelling: text,
                reading: 'なごやじょう',
                frequencyRank: 4200,
                partOfSpeech: ['n'],
                meanings: [{ glosses: ['Nagoya Castle'], partOfSpeech: ['n'] }],
                pitchAccent: ['LHHHLL'],
                wordWithReading: '名[な]古[ご]屋[や]城[じょう]',
            },
            pitchClass: 'nakadaka',
        });
        expect(parser.getCachedCard(90360, 0)).toMatchObject({
            reading: 'なごやじょう',
            pitchAccent: ['LHHHLL'],
        });
        const recycledHtml = renderTokensToHtml(text, recycled ?? [], DEFAULT_SETTINGS);
        expect(recycledHtml).toContain('jpdb-pitch-nakadaka');
        expect(recycledHtml).toContain('data-pitch-accent="LHHHLL"');
        expect(recycledHtml).toContain('なごやじょう');
    });

    it('keeps compatible canonical evidence while painting an inflected DOM surface and bounds', async () => {
        const canonicalText = '話す';
        const inflectedText = '話した';
        const complete = publicProviderToken(canonicalText, canonicalText, 0, canonicalText.length);
        complete.card.vid = 741;
        complete.card.sid = 0;
        complete.card.jitenWordId = 741;
        complete.card.jitenReadingIndex = 0;
        complete.card.reading = 'はなす';
        complete.card.pitchAccent = ['LHL'];
        complete.card.wordWithReading = '話[はな]す';
        const sparseInflection = publicProviderToken(inflectedText, inflectedText, 0, inflectedText.length);
        sparseInflection.card.vid = 741;
        sparseInflection.card.sid = 0;
        sparseInflection.card.jitenWordId = 741;
        sparseInflection.card.jitenReadingIndex = 0;
        // Public parse can retain a reading while omitting the detail pitch.
        // The cached canonical spelling is still needed to align that reading
        // against the inflected DOM slice rather than ruby the whole surface.
        sparseInflection.card.reading = 'はなす';
        const sparseCanonicalCard: JPDBCard = {
            ...sparseInflection.card,
            spelling: canonicalText,
            partOfSpeech: ['v5s'],
        };
        const publicVocabulary = sequencedPublicVocabulary(
            [[complete], [sparseInflection]],
            [[complete.card], [sparseCanonicalCard]],
        );
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            jitenPublicVocabulary: publicVocabulary,
            dictionaries: {} as never,
        });

        await parser.parse([canonicalText], { allowSegmentedFallback: true });
        const [inflected] = await parser.parse([inflectedText], { allowSegmentedFallback: true });
        const token = inflected?.[0];

        expect(token).toMatchObject({
            start: 0,
            end: inflectedText.length,
            length: inflectedText.length,
            sentence: inflectedText,
            pitchClass: 'nakadaka',
            card: {
                spelling: canonicalText,
                reading: 'はなす',
                pitchAccent: ['LHL'],
            },
        });
        const container = document.createElement('div');
        container.innerHTML = renderTokensToHtml(inflectedText, inflected ?? [], DEFAULT_SETTINGS);
        const word = container.querySelector<HTMLElement>('.jpdb-reader-word');
        expect(word?.dataset).toMatchObject({
            surface: inflectedText,
            expression: canonicalText,
            reading: 'はなす',
            tokenStart: '0',
            tokenEnd: String(inflectedText.length),
            pitchClass: 'nakadaka',
        });
        expect(word?.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('話');
        expect(word?.lastChild?.textContent).toBe('した');
    });

    it('rejects cached lexical evidence when the same provider id has an incompatible reading or surface', async () => {
        const complete = publicProviderToken('箸', '箸', 0, 1);
        complete.card.vid = 882;
        complete.card.sid = 0;
        complete.card.reading = 'はし';
        complete.card.pitchAccent = ['LH'];
        complete.card.meanings = [{ glosses: ['chopsticks'], partOfSpeech: ['n'] }];
        const incompatibleReading = publicProviderToken('橋', '橋', 0, 1);
        incompatibleReading.card.vid = 882;
        incompatibleReading.card.sid = 0;
        incompatibleReading.card.reading = 'きょう';
        const publicVocabulary = sequencedPublicVocabulary([[complete], [incompatibleReading]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            jitenPublicVocabulary: publicVocabulary,
            dictionaries: {} as never,
        });

        await parser.parse(['箸'], { allowSegmentedFallback: true });
        const [collision] = await parser.parse(['橋'], { allowSegmentedFallback: true });

        expect(collision?.[0]).toMatchObject({
            card: {
                spelling: '橋',
                reading: 'きょう',
                pitchAccent: [],
                meanings: [],
            },
            pitchClass: '',
        });
    });

    it('does not treat a same-reading kanji suffix as an inflection of cached spelling', async () => {
        const complete = publicProviderToken('接続', '接続', 0, 2);
        complete.card.vid = 883;
        complete.card.sid = 0;
        complete.card.reading = 'せつぞく';
        complete.card.pitchAccent = ['LHHH'];
        const compound = publicProviderToken('接続先', '接続先', 0, 3);
        compound.card.vid = 883;
        compound.card.sid = 0;
        compound.card.reading = 'せつぞく';
        const publicVocabulary = sequencedPublicVocabulary([[complete], [compound]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            jitenPublicVocabulary: publicVocabulary,
            dictionaries: {} as never,
        });

        await parser.parse(['接続'], { allowSegmentedFallback: true });
        const [collision] = await parser.parse(['接続先'], { allowSegmentedFallback: true });

        expect(collision?.[0]).toMatchObject({
            card: {
                spelling: '接続先',
                reading: 'せつぞく',
                pitchAccent: [],
            },
            pitchClass: '',
        });
    });

    it('isolates same-number evidence by provider and language while keeping legacy lookup latest-writer-wins', async () => {
        const japaneseJiten = publicProviderToken('城', '城', 0, 1);
        japaneseJiten.card.vid = 991;
        japaneseJiten.card.sid = 0;
        japaneseJiten.card.language = 'ja';
        japaneseJiten.card.reading = 'しろ';
        japaneseJiten.card.pitchAccent = ['LH'];
        const fallbackCollision = publicProviderToken('城', '城', 0, 1);
        fallbackCollision.card.vid = 991;
        fallbackCollision.card.sid = 0;
        fallbackCollision.card.language = 'ja';
        fallbackCollision.card.source = 'fallback';
        const englishJitenCollision = publicProviderToken('城', '城', 0, 1);
        englishJitenCollision.card.vid = 991;
        englishJitenCollision.card.sid = 0;
        englishJitenCollision.card.language = 'en';
        const sparseJapaneseJiten = publicProviderToken('城', '城', 0, 1);
        sparseJapaneseJiten.card.vid = 991;
        sparseJapaneseJiten.card.sid = 0;
        sparseJapaneseJiten.card.language = 'ja';
        const publicVocabulary = sequencedPublicVocabulary([
            [japaneseJiten],
            [fallbackCollision],
            [englishJitenCollision],
            [sparseJapaneseJiten],
        ]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { getCard: vi.fn(() => undefined) } as never,
            jitenPublicVocabulary: publicVocabulary,
            dictionaries: {} as never,
        });

        await parser.parse(['城'], { allowSegmentedFallback: true });
        const [fallback] = await parser.parse(['城'], { allowSegmentedFallback: true });
        expect(fallback?.[0]?.card).toMatchObject({ source: 'fallback', reading: '', pitchAccent: [] });
        expect(parser.getCachedCard(991, 0)).toBe(fallback?.[0]?.card);

        const [english] = await parser.parse(['城'], { allowSegmentedFallback: true });
        expect(english?.[0]?.card).toMatchObject({ source: 'jiten', language: 'en', reading: '', pitchAccent: [] });
        expect(parser.getCachedCard(991, 0)).toBe(english?.[0]?.card);

        const [japaneseAgain] = await parser.parse(['城'], { allowSegmentedFallback: true });
        expect(japaneseAgain?.[0]?.card).toMatchObject({
            source: 'jiten',
            language: 'ja',
            reading: 'しろ',
            pitchAccent: ['LH'],
        });
        expect(parser.getCachedCard(991, 0)).toBe(japaneseAgain?.[0]?.card);
    });

    it('preserves one parse result per input when a provider returns a short response', async () => {
        const firstText = '日本語';
        const publicToken: JPDBToken = {
            card: {
                vid: 1, sid: 1, rid: 0, spelling: firstText, reading: 'にほんご',
                frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['not-in-deck'],
                pitchAccent: [], wordWithReading: null, source: 'jiten',
            },
            start: 0,
            end: firstText.length,
            length: firstText.length,
            rubies: [],
            pitchClass: '',
            sentence: firstText,
        };
        const publicParse = vi.fn(async (): Promise<JPDBToken[][]> => [[publicToken]]);
        const publicLookupMany = exactCardLookup(() => [publicToken.card]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: {} as never,
            jitenPublicVocabulary: { parse: publicParse, lookupMany: publicLookupMany },
            dictionaries: {} as never,
        });

        const paragraphs = [firstText, 'フィード', '参加'];
        const parsed = await parser.parse(paragraphs, { allowSegmentedFallback: true });

        expect(parsed).toHaveLength(paragraphs.length);
        expect(parsed[0]?.[0]).toBe(publicToken);
        expect(parsed[1]?.map(token => token.card.spelling)).toEqual(['フィード']);
        expect(parsed[2]?.map(token => token.card.spelling)).toEqual(['参加']);
    });

    it('parses 好きなものを読む coherently', () => {
        expect(surfaces('好きなものを読む')).toEqual(['好き', 'な', 'もの', 'を', '読む']);
    });

    it('keeps 日本語 and 学ぶ whole', () => {
        expect(surfaces('日本語を学ぶ')).toEqual(['日本語', 'を', '学ぶ']);
    });

    it('keeps 時間 whole after a number (duration word, not a glued counter)', () => {
        expect(surfaces('2時間前')).toEqual(['時間', '前']);
    });

    it('splits leading particles from Segmenter particle+noun compounds', () => {
        expect(surfaces('日本語の森')).toEqual(['日本語', 'の', '森']);
    });

    it('segments compound nouns like 管理拡張を追加 without fragmenting kanji words', () => {
        expect(surfaces('管理拡張を追加')).toEqual(['管理', '拡張', 'を', '追加']);
    });

    it('does not glue episode counters into the following title words', () => {
        const text = 'ぼっちの先輩にサークル勧誘された 1〜5話おまとめ版';
        const segs = surfaces(text);

        expect(segs).toContain('話');
        expect(segs).toContain('お');
        expect(segs).toContain('まとめ');
        expect(segs).toContain('版');
        expect(segs).not.toContain('話おまとめ');
        expect(segs).not.toContain('話おまとめ版');
        expect(fallbackLookupTermAtOffset(text, text.indexOf('話'))).toBe('話');
        expect(fallbackLookupTermAtOffset(text, text.indexOf('おまとめ'))).not.toMatch(/^話/u);
    });

    it('keeps duration words whole after a number (時間/年間/分間 are words, not glued counters)', () => {
        // 3時間前 shattered into 時|間|前 on the keyless/segmented path
        // (Reddit time-ago labels), each shard coloured as its own word.
        expect(surfaces('3時間前')).toEqual(['時間', '前']);
        expect(surfaces('1時間前')).toEqual(['時間', '前']);
        expect(surfaces('5年間の記録')).toContain('年間');
        expect(surfaces('30分間待つ')).toContain('分間');
        // The glued-counter split itself must survive: 3時半 is 時 + 半.
        expect(surfaces('3時半')).toEqual(['時', '半']);
    });

    it('keeps numeric counters separate after 第-prefixed numbers too', () => {
        const text = '第12話おまけ';

        expect(surfaces(text)).not.toContain('話おまけ');
        expect(fallbackLookupTermAtOffset(text, text.indexOf('話'))).toBe('話');
    });

    // Names like 紫音 (read しおん / しいん / しのん / むらさき depending on the
    // person) must be resolved by a name dictionary, never by a hand-coded
    // reading table. The parser only emits a reading the dictionary actually
    // returns; it must never invent one. See https://jpdb.io/search?q=紫音 for
    // why a single hard-coded reading is wrong.
    function nameAwareParser(matches: readonly YomitanTermMatch[]): ReaderParser {
        const lookupExactTermCandidates = exactCandidateLookup(matches.map(match => match.entry));
        return new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                showPitchAccent: false,
            }),
            jpdb: {} as never,
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => true),
                findTermMatches: vi.fn(async () => [...matches]),
                lookupExactTermCandidates,
                lookupTermMeta: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
        });
    }

    it('resolves 紫音 as one token using the reading a name dictionary supplies', async () => {
        // The paragraph parse may decorate the match, but the exact candidate
        // query is what keeps the compound together with its verified reading.
        const parser = nameAwareParser([
            {
                entry: { expression: '紫音', reading: 'しおん', glossary: ['Shion (name)'], dictionary: 'JMnedict' },
                start: 0,
                end: 2,
                surface: '紫音',
            },
        ]);

        const [tokens] = await parser.parse(['紫音'], { allowSegmentedFallback: true });

        expect(tokens).toHaveLength(1);
        expect(tokens[0]?.card.spelling).toBe('紫音');
        expect(tokens[0]?.card.reading).toBe('しおん');
        expect(tokens[0]?.rubies).toEqual([{ text: 'しおん', start: 0, end: 2, length: 2 }]);
    });

    it('never fabricates a name reading the dictionaries do not provide', async () => {
        // Without a name dictionary the lookups only know the single kanji, so
        // the parser must faithfully reflect them — it must NOT invent 紫音→しおん.
        const parser = nameAwareParser([
            {
                entry: { expression: '紫', reading: 'むらさき', glossary: ['purple'], dictionary: 'JMdict' },
                start: 0,
                end: 1,
                surface: '紫',
            },
            {
                entry: { expression: '音', reading: 'おと', glossary: ['sound'], dictionary: 'JMdict' },
                start: 1,
                end: 2,
                surface: '音',
            },
        ]);

        const [tokens] = await parser.parse(['紫音'], { allowSegmentedFallback: true });

        expect(tokens.map(token => token.card.spelling)).toEqual(['紫', '音']);
        expect(tokens.map(token => token.card.reading)).toEqual(['むらさき', 'おと']);
        expect(tokens.some(token => token.card.spelling === '紫音')).toBe(false);
        expect(tokens.some(token => token.card.reading === 'しおん')).toBe(false);
    });

    it('fills remote coverage gaps with deinflected local-dictionary tokens, not bare segments', async () => {
        const sentence = 'パスキーを使って本人確認を行います';
        const localMatches: YomitanTermMatch[] = [
            {
                entry: { expression: '使う', reading: 'つかう', rules: 'v5u', glossary: ['to use'], dictionary: 'Jitendex' },
                start: 5,
                end: 8,
                surface: '使って',
                deinflected: deinflected('使って', '使う'),
            },
            {
                entry: { expression: '行う', reading: 'おこなう', rules: 'v5u', glossary: ['to carry out'], dictionary: 'Jitendex' },
                start: 13,
                end: 17,
                surface: '行います',
                deinflected: deinflected('行います', '行う'),
            },
        ];
        const findTermMatches = vi.fn(async (text: string) => text === sentence ? localMatches : []);
        const lookupExactTermCandidates = exactCandidateLookup(localMatches.map(match => match.entry));
        const lookupTermMeta = vi.fn(async () => []);
        const providerTokens = [
            publicProviderToken(sentence, 'パスキー', 0, 4),
            publicProviderToken(sentence, '本人確認', 8, 12),
        ];
        let paragraphParsePending = true;
        const jpdbParse = vi.fn(async (paragraphs: string[]): Promise<JPDBToken[][]> => {
            if (paragraphParsePending) {
                paragraphParsePending = false;
                return [providerTokens];
            }
            return paragraphs.map(term => {
                const token = providerTokens.find(candidate => candidate.card.spelling === term);
                return token ? [{
                    ...token,
                    start: 0,
                    end: term.length,
                    length: term.length,
                    rubies: [],
                    sentence: term,
                }] : [];
            });
        });
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                parserProvider: 'jpdb',
            }),
            jpdb: { parse: jpdbParse } as never,
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => true),
                findTermMatches,
                lookupExactTermCandidates,
                lookupTermMeta,
                lookupKanji: vi.fn(async () => []),
            } as never,
        });

        const [tokens] = await parser.parse([sentence], { requireJpdb: true, allowSegmentedFallback: true });

        const used = tokens.find(token => sentence.slice(token.start, token.end) === '使って');
        expect(used).toMatchObject({
            card: { spelling: '使う', reading: 'つかう', source: 'local' },
            rubies: [{ text: 'つか', start: 5, end: 6, length: 1 }],
        });
        const performed = tokens.find(token => sentence.slice(token.start, token.end) === '行います');
        expect(performed).toMatchObject({
            card: { spelling: '行う', reading: 'おこなう', source: 'local' },
            rubies: [{ text: 'おこな', start: 13, end: 14, length: 1 }],
        });
        // Provider tokens keep their identity; the gaps never regress to
        // reading-less fallback cards.
        expect(tokens.find(token => token.card.spelling === 'パスキー')?.card.source).toBe('jiten');
        expect(tokens.find(token => token.card.spelling === '本人確認')?.card.source).toBe('jiten');
        expect(tokens.filter(token => token.card.source === 'fallback').every(token =>
            !/[一-龯]/.test(sentence.slice(token.start, token.end)))).toBe(true);
    });
});
