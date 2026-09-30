import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyExamples, type StudyExamplesDependencies } from '../../src/reader/newtab/study-examples';
import type { ImmersionKitClient, ImmersionKitExample } from '../../src/reader/immersion/kit';
import { DEFAULT_SETTINGS, newTabTestCard } from './new-tab-review/fixtures';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/target-runtime';

const sessions: StudyExamples[] = [];
function example(sentence: string, id = sentence): ImmersionKitExample {
    return { id, sentence, sentenceWithFurigana: '', translation: `Translation ${id}`, sourceTitle: `Source ${id}`,
        titleSlug: id, category: 'anime', soundFile: '', imageFile: '', soundUrl: '', imageUrl: '' };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture(overrides: Partial<StudyExamplesDependencies> = {}) {
    const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitShowImages: false,
        immersionKitAutoPlayAudio: false, immersionKitMinLength: 0, jpdbDefinitionsEnabled: false };
    const search = vi.fn(async (_query: string) => [example('私は中学生です。', 'one'), example('中学生になりました。', 'two')]);
    const kit = { searchResult: async (query: string) => ({ examples: await search(query), status: 'complete' as const }), mediaUrls: (value: ImmersionKitExample, kind: string) =>
        [kind === 'sound' ? value.soundUrl : value.imageUrl].filter(Boolean), fetchBlobUrl: vi.fn(async () => 'blob:media') } as unknown as ImmersionKitClient;
    const deps: StudyExamplesDependencies = { getSettings: () => settings, immersionKit: kit,
        parser: { canParse: () => false, fallbackCardFromText: (text: string) => newTabTestCard({ spelling: text, reading: text }) } as never,
        sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} }, ...overrides };
    const module = new StudyExamples(deps); sessions.push(module);
    const mount = document.createElement('div'); mount.dataset.newtabMeaning = 'true'; document.body.append(mount);
    const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
    return { module, settings, search, mount, card, deps };
}
afterEach(() => { sessions.splice(0).forEach(module => module.dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); resetActiveLearningTargetLanguage(); });

describe('StudyExamples Interface', () => {
    it('keeps sibling Search panels registered while their section is assembled off-document', async () => {
        const f = fixture();
        const section = document.createElement('section');
        const panels = ['中', '学'].map(kanji => {
            const mount = document.createElement('div');
            mount.innerHTML = '<details data-newtab-kanji-immersion-details><div data-newtab-kanji-immersion-body>Loading</div></details>';
            section.append(mount);
            f.module.presentSearch({ mount, card: f.card, mode: 'kanji', kanji, revealed: true });
            return mount;
        });
        document.body.append(section);
        for (const panel of panels) {
            const details = panel.querySelector('details')!;
            details.open = true;
            details.dispatchEvent(new Event('toggle'));
        }
        await vi.waitFor(() => {
            for (const panel of panels) expect(panel.textContent).toContain('Source one');
        });
        f.module.act('next', panels[0]!.querySelector<HTMLElement>('[data-newtab-kanji-immersion]')!);
        await vi.waitFor(() => expect(panels[0]!.textContent).toContain('Source two'));
        expect(panels[1]!.textContent).toContain('Source one');
    });

    it('observes DOM removals only while Search panels are mounted', async () => {
        const observe = vi.spyOn(MutationObserver.prototype, 'observe');
        const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
        const f = fixture();
        expect(observe).not.toHaveBeenCalled();
        f.module.presentSearch({ ...f, mode: 'kanji', kanji: '中', revealed: true });
        const second = document.createElement('div'); document.body.append(second);
        f.module.presentSearch({ mount: second, card: f.card, mode: 'kanji', kanji: '学', revealed: true });
        expect(observe).toHaveBeenCalledTimes(1);
        f.mount.remove(); second.remove();
        await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
        const next = document.createElement('div'); document.body.append(next);
        f.module.presentSearch({ mount: next, card: f.card, mode: 'kanji', kanji: '生', revealed: true });
        expect(observe).toHaveBeenCalledTimes(2);
        f.module.present(null);
        expect(disconnect).toHaveBeenCalledTimes(2);
    });

    it('keeps a usable partial JPDB front for the normal lifetime, then refreshes it', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const lookup = vi.fn(async () => ({ info: { meanings: [], compounds: [], examples: [{ sentence: '私は中学生でした。', translation: '' }] }, status: 'partial' as 'partial' | 'complete' }));
        const f = fixture({ jpdbVocabulary: { lookup } });
        f.settings.apiKey = 'jpdb-key'; f.settings.jpdbDefinitionsEnabled = true;
        const card = { ...f.card, source: 'jpdb' as const };
        expect(await f.module.frontSentence(card)).toBe('私は中学生でした。');
        lookup.mockResolvedValue({ info: { meanings: [], compounds: [], examples: [{ sentence: '私は中学生になります。', translation: '' }] }, status: 'complete' });
        now += 2_000;
        expect(await f.module.frontSentence(card)).toBe('私は中学生でした。');
        now += 27_999;
        expect(await f.module.frontSentence(card)).toBe('私は中学生でした。');
        expect(lookup).toHaveBeenCalledOnce();
        now += 2;
        expect(await f.module.frontSentence(card)).toBe('私は中学生になります。');
        expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('keeps a usable fallback front for the normal lifetime when JPDB examples are incomplete', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const lookup = vi.fn(async () => ({ info: { meanings: [], compounds: [], examples: [] }, status: 'partial' as const }));
        const f = fixture({ jpdbVocabulary: { lookup } });
        f.settings.apiKey = 'jpdb-key'; f.settings.jpdbDefinitionsEnabled = true;
        const card = { ...f.card, source: 'jpdb' as const };
        expect(await f.module.frontSentence(card)).toBe('私は中学生です。');
        now += 29_999; expect(await f.module.frontSentence(card)).toBe('私は中学生です。'); expect(lookup).toHaveBeenCalledOnce();
        now += 2; await f.module.frontSentence(card); expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('still retries an empty partial JPDB front a second later', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const lookup = vi.fn(async () => ({ info: { meanings: [], compounds: [], examples: [] }, status: 'partial' as const }));
        const f = fixture({ jpdbVocabulary: { lookup } });
        f.settings.apiKey = 'jpdb-key'; f.settings.jpdbDefinitionsEnabled = true; f.settings.immersionKitEnabled = false;
        const card = { ...f.card, source: 'jpdb' as const };
        expect(await f.module.frontSentence(card)).toBe('');
        now += 999; await f.module.frontSentence(card); expect(lookup).toHaveBeenCalledOnce();
        now += 2; await f.module.frontSentence(card); expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('keeps compound-query examples stable for the session when JPDB discovery was partial', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const lookup = vi.fn(async () => ({ info: { meanings: [], compounds: [{ term: '中学生', reading: 'ちゅうがくせい', meaning: '', url: '' }], examples: [] }, status: 'partial' as const }));
        const f = fixture({ jpdbVocabulary: { lookup } });
        f.settings.apiKey = 'jpdb-key'; f.settings.jpdbDefinitionsEnabled = true;
        f.search.mockImplementation(async query => query === '中学生' ? [example('私は中学生です。')] : []);
        const card = newTabTestCard({ spelling: '学生', reading: 'がくせい' });
        const first = await f.module.examples(card);
        expect(first.map(value => value.sentence)).toEqual(['私は中学生です。']);
        const searches = f.search.mock.calls.length;
        now += 2_000; expect(await f.module.examples(card)).toBe(first);
        now += 600_000; expect(await f.module.examples(card)).toBe(first);
        expect(lookup).toHaveBeenCalledOnce();
        expect(f.search).toHaveBeenCalledTimes(searches);
    });

    it('retries failed fallback discovery instead of caching it as complete emptiness', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const parse = vi.fn(async () => { throw new Error('Parser temporarily unavailable'); });
        const f = fixture({ parser: { canParse: () => true, parse,
            fallbackCardFromText: text => newTabTestCard({ spelling: text }) } });
        f.search.mockResolvedValue([]);
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(parse).toHaveBeenCalledTimes(1);
        now += 500;
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(parse).toHaveBeenCalledTimes(1);
        now += 501;
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(parse).toHaveBeenCalledTimes(2);
    });

    it.each(['mode', 'kanji'] as const)('stops started audio when the selected %s changes within one card', async change => {
        const f = fixture();
        const play = vi.fn(async () => undefined);
        const pause = vi.fn();
        vi.stubGlobal('Audio', function () { return { play, pause, addEventListener() {}, ended: false }; });
        f.search.mockResolvedValue([{ ...example('私は中学生です。'), soundUrl: 'http://127.0.0.1/voice.ogg' }]);
        f.mount.innerHTML = '<details data-newtab-kanji-immersion-details open><div data-newtab-kanji-immersion-body></div></details>';
        if (change === 'mode') f.module.present({ ...f, mode: 'word', revealed: true });
        else f.module.present({ ...f, mode: 'kanji', kanji: '中', revealed: true });
        await vi.waitFor(() => expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).not.toBeNull());
        f.module.act('audio');
        await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
        expect(pause).not.toHaveBeenCalled();
        f.module.present({ ...f, mode: 'kanji', kanji: '学', revealed: true });
        expect(pause).toHaveBeenCalledTimes(1);
    });

    it('uses cheap reading fallback before parser work', async () => {
        const parse = vi.fn(async () => { throw new Error('must not parse'); });
        const f = fixture({ parser: { canParse: () => true, parse } as never });
        f.search.mockImplementation(async query => query === 'たべもの' ? [example('たべものを買います。')] : []);
        expect(await f.module.examples(newTabTestCard({ spelling: '食べ物', reading: 'たべもの' }))).toHaveLength(1);
        expect(f.search.mock.calls.map(([query]) => query)).toEqual(['食べ物', 'たべもの']);
        expect(parse).not.toHaveBeenCalled();
    });

    it('keeps local cards Immersion-first and never scrapes JPDB without credentials', async () => {
        const lookup = vi.fn(async () => ({ info: { meanings: [], compounds: [], examples: [{ sentence: '私は中学生でした。', translation: '' }] }, status: 'complete' as const }));
        const f = fixture({ jpdbVocabulary: { lookup } as never });
        f.settings.jpdbDefinitionsEnabled = true; f.settings.apiKey = 'jpdb-key';
        expect(await f.module.frontSentence(f.card)).toBe('私は中学生です。');
        expect(lookup).not.toHaveBeenCalled();
        f.settings.apiKey = '';
        expect(await f.module.frontSentence({ ...f.card, source: 'jpdb' })).toBe('私は中学生です。');
        expect(lookup).not.toHaveBeenCalled();
    });

    it('only populates the latest connected mount for the same card', async () => {
        const pending = deferred<ImmersionKitExample[]>();
        const f = fixture(); f.search.mockReturnValue(pending.promise);
        const latest = document.createElement('div'); document.body.append(latest);
        f.module.present({ mount: f.mount, card: f.card, mode: 'word', revealed: true });
        f.module.present({ mount: latest, card: f.card, mode: 'word', revealed: true });
        pending.resolve([example('私は中学生です。')]);
        await vi.waitFor(() => expect(latest.querySelector('.jpdb-reader-newtab-immersion')).not.toBeNull());
        expect(f.mount.childElementCount).toBe(0);
    });

    it('keeps usable fallback examples when accuracy filtering empties an earlier partial query', async () => {
        vi.useFakeTimers();
        const searchResult = vi.fn(async (query: string) => query === '多'
            ? { examples: [example('私は中学生です。')], status: 'partial' as const }
            : { examples: [example('たくさんあります。')], status: 'complete' as const });
        const f = fixture({ immersionKit: { searchResult, mediaUrls: () => [], fetchBlobUrl: async () => '' } });
        const card = newTabTestCard({ spelling: '多', reading: 'たくさん' });
        const first = await f.module.examples(card);
        expect(first.map(value => value.sentence)).toEqual(['たくさんあります。']);
        const calls = searchResult.mock.calls.length;
        await vi.advanceTimersByTimeAsync(2_000);
        expect(await f.module.examples(card)).toBe(first);
        expect(searchResult).toHaveBeenCalledTimes(calls);
    });

    it('keeps the acquisition cache bounded at 160 entries', async () => {
        const f = fixture(); f.search.mockImplementation(async query => [example(`${query}です。`)]);
        const cards = Array.from({ length: 161 }, (_, index) => newTabTestCard({ spelling: `単語${index}`, reading: `たんご${index}` }));
        for (const card of cards) await f.module.examples(card);
        expect(f.search).toHaveBeenCalledTimes(161);
        await f.module.examples(cards[160]!); expect(f.search).toHaveBeenCalledTimes(161);
        await f.module.examples(cards[0]!); expect(f.search).toHaveBeenCalledTimes(162);
    });

    it('prefetches without revealing and inserts the example before dictionaries on reveal', async () => {
        const f = fixture();
        const dictionaries = document.createElement('div'); dictionaries.className = 'jpdb-reader-newtab-reveal-dictionaries'; f.mount.append(dictionaries);
        f.module.present({ ...f, mode: 'word', revealed: false });
        f.module.prefetch([f.card]); await f.module.examples(f.card);
        expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
        f.module.present({ ...f, mode: 'word', revealed: true });
        await vi.waitFor(() => expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).not.toBeNull());
        expect(f.mount.firstElementChild?.classList.contains('jpdb-reader-newtab-immersion')).toBe(true);
        expect(f.search).toHaveBeenCalledOnce();
    });

    it('keeps metadata once and rotates immediately while sentence parsing remains pending', async () => {
        const parse = deferred<boolean>();
        const f = fixture({ sentences: { peek: () => undefined, prepare: async () => [], enrich: () => parse.promise, highlight() {} } });
        f.module.present({ ...f, mode: 'word', revealed: true });
        await vi.waitFor(() => expect(f.mount.textContent).toContain('Source one'));
        expect(f.mount.querySelectorAll('.jpdb-reader-example-title')).toHaveLength(1);
        expect(f.mount.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/2');
        expect(f.mount.querySelector('.jpdb-reader-example-inline-source')).toBeNull();
        expect([...f.mount.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-immersion-search-link')].map(link => link.getAttribute('href'))).toEqual([
            'https://www.immersionkit.com/dictionary?keyword=%E4%B8%AD%E5%AD%A6%E7%94%9F&sort=sentence_length:asc&page=1',
            'https://nadeshiko.co/search/%E4%B8%AD%E5%AD%A6%E7%94%9F',
        ]);
        expect(f.mount.querySelector('[data-immersion-sentence-render]')?.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(f.mount.querySelector('.jpdb-reader-example-translation')?.getAttribute('data-yomu-immersion-translation-blurred')).toBe('true');
        f.module.act('next');
        await vi.waitFor(() => expect(f.mount.textContent).toContain('Source two'));
        expect(f.mount.querySelectorAll('.jpdb-reader-newtab-immersion')).toHaveLength(1);
        expect(f.mount.querySelectorAll('[data-immersion-action="audio"]')).toHaveLength(0);
        f.module.act('previous');
        await vi.waitFor(() => expect(f.mount.textContent).toContain('Source one'));
        parse.resolve(true);
    });

    it('owns an explicit second kanji and accepts the kanji mount itself', async () => {
        const f = fixture();
        f.search.mockResolvedValue([example('語を読みます。', '語1'), example('日本語です。', '語2')]);
        f.mount.dataset.newtabKanjiImmersionMount = 'true';
        f.mount.innerHTML = '<details data-newtab-kanji-immersion-details open><div data-newtab-kanji-immersion-body></div></details>';
        const card = newTabTestCard({ spelling: '日本語', reading: 'にほんご' });
        f.module.present({ mount: f.mount, card, mode: 'kanji', kanji: '語', revealed: true });
        await vi.waitFor(() => expect(f.mount.querySelector('[data-newtab-kanji-immersion]')?.getAttribute('data-newtab-kanji')).toBe('語'));
        expect(f.search.mock.calls[0]?.[0]).toBe('語');
        f.module.act('next');
        await vi.waitFor(() => expect(f.mount.textContent).toContain('Source 語2'));
        expect(f.mount.querySelector('[data-newtab-kanji-immersion]')?.getAttribute('data-newtab-kanji')).toBe('語');
    });

    it('does not apply delayed word content after concealment or disposal', async () => {
        const pending = deferred<ImmersionKitExample[]>(); const f = fixture(); f.search.mockReturnValue(pending.promise);
        f.module.present({ ...f, mode: 'word', revealed: true });
        f.module.present({ ...f, mode: 'word', revealed: false });
        pending.resolve([example('私は中学生です。')]); await f.module.examples(f.card);
        expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
        f.module.dispose(); f.module.present({ ...f, mode: 'word', revealed: true });
        expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
    });

    it('filters single-character hits and invalidates delayed kanji target changes', async () => {
        const f = fixture(); const card = newTabTestCard({ spelling: '多', reading: 'た' });
        f.search.mockResolvedValue([example('多く読みます。', 'good'), example('私は中学生です。', 'wrong')]);
        expect((await f.module.examples(card)).map(value => value.id)).toEqual(['good']);
        f.module.reset(); const pending = deferred<ImmersionKitExample[]>(); f.search.mockReturnValue(pending.promise);
        f.mount.innerHTML = '<details data-newtab-kanji-immersion-details open><div data-newtab-kanji-immersion-body>Loading</div></details>';
        f.module.present({ mount: f.mount, card, mode: 'kanji', kanji: '多', revealed: true });
        setActiveLearningTargetLanguage('ko'); setActiveLearningTargetLanguage('ja');
        pending.resolve([example('多く読みます。')]); await f.module.examples(card);
        expect(f.mount.querySelector('[data-newtab-kanji-immersion]')).toBeNull();
    });

    it('updates the visible example while images hydrate and ignores the previous image completion', async () => {
        const first = deferred<string>(); const second = deferred<string>(); const f = fixture(); f.settings.immersionKitShowImages = true;
        f.search.mockResolvedValue([
            { ...example('私は中学生です。', 'one'), imageUrl: 'http://127.0.0.1/one.webp' },
            { ...example('中学生になりました。', 'two'), imageUrl: 'http://127.0.0.1/two.webp' },
        ]);
        vi.spyOn(f.deps.immersionKit, 'fetchBlobUrl').mockImplementation(urls => String(urls).includes('one.webp') ? first.promise : second.promise);
        f.module.present({ ...f, mode: 'word', revealed: true });
        await vi.waitFor(() => expect(f.mount.textContent).toContain('Source one'));
        f.module.act('next'); await vi.waitFor(() => expect(f.mount.textContent).toContain('Source two'));
        first.resolve('blob:old'); await Promise.resolve();
        expect(f.mount.querySelector('img')?.getAttribute('src')).not.toBe('blob:old');
        second.resolve('blob:current'); await vi.waitFor(() => expect(f.mount.querySelector('img')?.getAttribute('src')).toBe('blob:current'));
    });

    it('times out a hung search without making its empty fallback permanent', async () => {
        vi.useFakeTimers(); const f = fixture(); f.settings.audioTimeoutMs = 100;
        f.search.mockReturnValue(new Promise(() => undefined));
        const first = f.module.examples(f.card); await vi.advanceTimersByTimeAsync(1_100);
        expect(await first).toEqual([]);
        f.search.mockResolvedValue([example('私は中学生です。')]); await vi.advanceTimersByTimeAsync(1_001);
        expect((await f.module.examples(f.card)).length).toBe(1);
    });

    it('invalidates away-and-back target results even when the language matches again', async () => {
        const pending = deferred<ImmersionKitExample[]>(); const f = fixture(); f.search.mockReturnValue(pending.promise);
        f.module.present({ ...f, mode: 'word', revealed: true });
        setActiveLearningTargetLanguage('ko'); setActiveLearningTargetLanguage('ja');
        pending.resolve([example('私は中学生です。')]); await Promise.resolve(); await Promise.resolve();
        expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
    });

    it('keeps A→B→A audio requests tied to their original presentation generation', async () => {
        const pending = deferred<ImmersionKitExample[]>(); const f = fixture(); f.search.mockReturnValue(pending.promise);
        const play = vi.fn(async () => undefined);
        vi.stubGlobal('Audio', function () { return { play, pause() {}, addEventListener() {}, ended: false }; });
        f.module.present({ ...f, mode: 'word', revealed: true }); f.module.act('audio');
        f.module.present({ mount: f.mount, card: newTabTestCard({ spelling: '別' }), mode: 'word', revealed: true });
        f.module.present({ ...f, mode: 'word', revealed: true });
        pending.resolve([{ ...example('私は中学生です。'), soundUrl: 'http://127.0.0.1/voice.ogg' }]);
        await vi.waitFor(() => expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).not.toBeNull());
        expect(play).not.toHaveBeenCalled();
        expect(f.mount.querySelectorAll('.jpdb-reader-newtab-immersion')).toHaveLength(1);
    });

    it('pauses an old audio element again if its play promise resolves after replacement', async () => {
        const pending = deferred<void>();
        const f = fixture();
        const play = vi.fn(() => pending.promise);
        const pause = vi.fn();
        const Audio = vi.fn(function () { return { play, pause, addEventListener() {}, ended: false }; });
        vi.stubGlobal('Audio', Audio);
        f.search.mockResolvedValue([{ ...example('私は中学生です。'), soundUrl: 'http://127.0.0.1/voice.ogg' }]);
        f.module.present({ ...f, mode: 'word', revealed: true });
        await vi.waitFor(() => expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).not.toBeNull());
        f.module.act('audio');
        await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
        f.module.present({ ...f, mode: 'word', revealed: false });
        expect(pause).toHaveBeenCalledTimes(1);
        pending.resolve();
        await vi.waitFor(() => expect(pause).toHaveBeenCalledTimes(2));
        expect(Audio).toHaveBeenCalledOnce();
    });

    it('does not start late blob fallback audio after the presentation is disposed', async () => {
        const pending = deferred<string>();
        const f = fixture();
        const Audio = vi.fn(function () {
            return { play: vi.fn(async () => { throw new Error('Direct playback rejected'); }),
                pause() {}, addEventListener() {}, ended: false };
        });
        vi.stubGlobal('Audio', Audio);
        const fetchBlob = vi.spyOn(f.deps.immersionKit, 'fetchBlobUrl').mockReturnValue(pending.promise);
        f.search.mockResolvedValue([{ ...example('私は中学生です。'), soundUrl: 'http://127.0.0.1/voice.ogg' }]);
        f.module.present({ ...f, mode: 'word', revealed: true });
        await vi.waitFor(() => expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).not.toBeNull());
        f.module.act('audio');
        await vi.waitFor(() => expect(fetchBlob).toHaveBeenCalledOnce());
        expect(Audio).toHaveBeenCalledOnce();
        f.module.dispose();
        pending.resolve('blob:late-audio');
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        expect(Audio).toHaveBeenCalledOnce();
    });

    it('uses short negative/failure/partial lifetimes without retrying on every request', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const f = fixture(); f.search.mockRejectedValue(new Error('unavailable'));
        expect(await f.module.examples(f.card)).toEqual([]); const failures = f.search.mock.calls.length;
        await f.module.examples(f.card); expect(f.search).toHaveBeenCalledTimes(failures);
        now += 1_001; f.search.mockResolvedValue([]);
        await f.module.examples(f.card); const emptyCalls = f.search.mock.calls.length;
        now += 1_001; await f.module.examples(f.card); expect(f.search).toHaveBeenCalledTimes(emptyCalls);
        now += 10_001; await f.module.examples(f.card); expect(f.search.mock.calls.length).toBeGreaterThan(emptyCalls);
    });

    it('does not turn a front-sentence transport failure into a permanent empty sentence', async () => {
        const f = fixture(); f.search.mockRejectedValue(new Error('unavailable'));
        expect(await f.module.frontSentence(f.card)).toBe('');
        f.search.mockResolvedValue([example('私は中学生です。')]); window.dispatchEvent(new Event('online'));
        expect(await f.module.frontSentence(f.card)).toBe('私は中学生です。');
    });

    it('uses the actual replacement credential in acquisition identity', async () => {
        const f = fixture(); f.settings.nadeshikoApiKey = 'first';
        await f.module.examples(f.card); expect(f.search).toHaveBeenCalledOnce();
        f.settings.nadeshikoApiKey = 'replacement'; await f.module.examples(f.card);
        expect(f.search).toHaveBeenCalledTimes(2);
    });

    it('keeps JPDB-first front provenance while allowing a failed provider to fall back', async () => {
        const lookup = vi.fn(async () => ({ info: { meanings: [], compounds: [], examples: [{ sentence: '私は中学生でした。', translation: '' }] }, status: 'complete' as const }));
        const f = fixture({ jpdbVocabulary: { lookup } as never }); f.settings.apiKey = 'jpdb-key'; f.settings.jpdbDefinitionsEnabled = true;
        const card = newTabTestCard({ spelling: '中学生', source: 'jpdb', reviewSource: 'jpdb-api' });
        expect(await f.module.frontSentence(card)).toBe('私は中学生でした。'); expect(f.search).not.toHaveBeenCalled();
        f.module.reset(); lookup.mockRejectedValue(new Error('offline'));
        expect(await f.module.frontSentence(card)).toBe('私は中学生です。');
    });
});
