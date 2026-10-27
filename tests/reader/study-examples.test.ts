import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyExamples, type StudyExamplesDependencies } from '../../src/reader/newtab/study-examples';
import { ImmersionKitClient, type ImmersionKitExample } from '../../src/reader/immersion/kit';
import { DEFAULT_SETTINGS, newTabTestCard } from './new-tab-review/fixtures';
import { newTabFallbackCardFromText, newTabImmersionExample } from "./new-tab-review/fixtures";
import * as http from "../../src/reader/network/http";
import type { ReaderSettings } from "../../src/reader/app/types";
import { beforeEach } from "vitest";
import { NewTabImmersionAudioPlayer, type NewTabImmersionAudioPlayerDeps } from "../../src/reader/newtab/immersion-audio";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS2 } from "../../src/reader/settings";
import { installProviderExampleBehaviors, renderProviderExamples, type ProviderExampleView } from "../../src/reader/sources/provider-examples";

const sessions: StudyExamples[] = [];
function example(sentence: string, id = sentence): ImmersionKitExample {
    return { id, sentence, sentenceWithFurigana: '', translation: `Translation ${id}`, sourceTitle: `Source ${id}`,
        titleSlug: id, category: 'anime', soundFile: '', imageFile: '', soundUrl: '', imageUrl: '' };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture(overrides: Partial<StudyExamplesDependencies> = {}) {
    const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitShowImages: false,
        immersionKitAutoPlayAudio: false, jpdbDefinitionsEnabled: false };
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
afterEach(() => { sessions.splice(0).forEach(module => module.dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

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

    it('filters single-character hits', async () => {
        const f = fixture(); const card = newTabTestCard({ spelling: '多', reading: 'た' });
        f.search.mockResolvedValue([example('多く読みます。', 'good'), example('私は中学生です。', 'wrong')]);
        expect((await f.module.examples(card)).map(value => value.id)).toEqual(['good']);
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
        vi.useFakeTimers(); const f = fixture();
        f.search.mockReturnValue(new Promise(() => undefined));
        const first = f.module.examples(f.card); await vi.advanceTimersByTimeAsync(7_000);
        expect(await first).toEqual([]);
        f.search.mockResolvedValue([example('私は中学生です。')]); await vi.advanceTimersByTimeAsync(1_001);
        expect((await f.module.examples(f.card)).length).toBe(1);
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

describe("study examples panels", () => {
    const owners: StudyExamples[] = [];
    afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    function deferred<T>() {
        let resolve!: (value: T) => void;
        const promise = new Promise<T>(done => { resolve = done; });
        return { promise, resolve };
    }
    function fixture() {
        const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, kanjiImmersionKitEnabled: true,
            immersionKitShowImages: false, immersionKitAutoPlayAudio: false };
        const searchResult = vi.fn(async (query: string) => ({ status: 'complete' as const, examples: [
            { ...newTabImmersionExample(query), id: `${query}-one`, sentence: `${query}を読みます。`, soundUrl: `https://audio.test/${query}-one.mp3` },
            { ...newTabImmersionExample(query), id: `${query}-two`, sentence: `${query}を読みました。`, soundUrl: `https://audio.test/${query}-two.mp3` },
        ] }));
        const fetchBlobUrl = vi.fn(async () => 'blob:audio');
        const owner = new StudyExamples({ getSettings: () => settings,
            immersionKit: { searchResult, fetchBlobUrl, mediaUrls: (example, kind) => kind === 'sound' ? [example.soundUrl!] : [] },
            parser: { canParse: () => false, parse: async () => [], fallbackCardFromText: newTabFallbackCardFromText },
            sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} },
        });
        owners.push(owner);
        function panel(kanji = '好') {
            const mount = document.createElement('div');
            mount.innerHTML = '<details data-newtab-kanji-immersion-details><div data-newtab-kanji-immersion-body></div></details>';
            document.body.append(mount);
            owner.presentSearch({ mount, kanji, card: newTabFallbackCardFromText(kanji), mode: 'kanji', revealed: true });
            const details = mount.querySelector('details')!;
            return { mount, open() { details.open = true; details.dispatchEvent(new Event('toggle')); },
                surface() { return mount.querySelector<HTMLElement>('[data-newtab-kanji-immersion]')!; } };
        }
        return { owner, panel, searchResult, fetchBlobUrl };
    }

    it('shares acquisition but not cursors between connected Search panels', async () => {
        const f = fixture(); const first = f.panel(); const second = f.panel();
        first.open(); second.open();
        await vi.waitFor(() => { expect(first.mount.textContent).toContain('好を読みます。'); expect(second.mount.textContent).toContain('好を読みます。'); });
        expect(f.searchResult).toHaveBeenCalledOnce();
        f.owner.act('next', first.surface());
        await vi.waitFor(() => expect(first.mount.textContent).toContain('好を読みました。'));
        expect(second.mount.textContent).toContain('好を読みます。');
        f.owner.act('next', second.surface());
        await vi.waitFor(() => expect(second.mount.textContent).toContain('好を読みました。'));
        expect(f.searchResult).toHaveBeenCalledOnce();
    });

    it('disposes removed mounts and their toggle listeners without invalidating a sibling', async () => {
        const f = fixture(); const removed = f.panel(); const live = f.panel('学');
        removed.mount.remove(); await Promise.resolve();
        document.body.append(removed.mount); removed.open(); live.open();
        await vi.waitFor(() => expect(live.mount.textContent).toContain('学を読みます。'));
        expect(f.searchResult.mock.calls.map(([query]) => query)).toEqual(['学']);
        expect(removed.surface()).toBeNull();
        f.owner.dispose();
        expect(live.surface()).toBeNull();
        window.dispatchEvent(new Event('online')); live.open();
        await Promise.resolve(); expect(f.searchResult).toHaveBeenCalledOnce();
    });

    it('rejects a pending removed panel while a sibling renders the shared result, then clears all panels on Study entry', async () => {
        const f = fixture();
        const result = await f.searchResult('好'); f.searchResult.mockClear();
        const pending = deferred<typeof result>(); f.searchResult.mockReturnValue(pending.promise);
        const removed = f.panel(); const sibling = f.panel(); removed.open(); sibling.open();
        removed.mount.remove(); await Promise.resolve();
        pending.resolve(result);
        await vi.waitFor(() => expect(sibling.surface()).not.toBeNull());
        expect(removed.surface()).toBeNull(); expect(f.searchResult).toHaveBeenCalledOnce();
        f.owner.present(null);
        expect(sibling.surface()).toBeNull();
        sibling.open(); await Promise.resolve();
        expect(sibling.surface()).toBeNull();
    });

    it('refreshes every connected panel on online recovery without duplicating shared acquisition', async () => {
        const f = fixture(); f.searchResult.mockRejectedValueOnce(new Error('offline'));
        const first = f.panel(); const second = f.panel(); first.open(); second.open();
        await vi.waitFor(() => {
            expect(first.mount.querySelector('details')!.dataset.immersionFailed).toBe('true');
            expect(second.mount.querySelector('details')!.dataset.immersionFailed).toBe('true');
        });
        expect(f.searchResult).toHaveBeenCalledOnce();
        window.dispatchEvent(new Event('online'));
        await vi.waitFor(() => { expect(first.surface()).not.toBeNull(); expect(second.surface()).not.toBeNull(); });
        expect(f.searchResult).toHaveBeenCalledTimes(2);
    });

    it('allows only one audible panel and rejects late play and blob fallbacks after ownership changes', async () => {
        const f = fixture(); const first = f.panel(); const second = f.panel('学');
        const pendingPlay = deferred<void>(); const pendingBlob = deferred<string>();
        const audio: { src: string; pause: ReturnType<typeof vi.fn> }[] = [];
        vi.stubGlobal('Audio', class {
            ended = false; playbackRate = 1; pause = vi.fn(); addEventListener() {}
            constructor(public src: string) { audio.push(this); }
            play() { return audio.length === 1 ? pendingPlay.promise : Promise.resolve(); }
        });
        first.open(); second.open();
        await vi.waitFor(() => { expect(first.surface()).not.toBeNull(); expect(second.surface()).not.toBeNull(); });
        f.owner.act('audio', first.surface());
        await vi.waitFor(() => expect(audio).toHaveLength(1));
        f.owner.act('audio', second.surface());
        await vi.waitFor(() => expect(audio).toHaveLength(2));
        expect(audio[0]!.pause).toHaveBeenCalled();
        pendingPlay.resolve(); await Promise.resolve(); await Promise.resolve();
        expect(audio[0]!.pause.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(audio[1]!.pause).not.toHaveBeenCalled();

        // A failed direct candidate may load a blob, but cannot regain audio ownership.
        vi.stubGlobal('Audio', class {
            ended = false; playbackRate = 1; pause = vi.fn(); addEventListener() {}
            constructor(public src: string) { audio.push(this); }
            play() { return this.src.includes('好') ? Promise.reject(new Error('direct rejected')) : Promise.resolve(); }
        });
        f.fetchBlobUrl.mockReturnValue(pendingBlob.promise);
        f.owner.act('audio', first.surface());
        await vi.waitFor(() => expect(f.fetchBlobUrl).toHaveBeenCalledOnce());
        f.owner.act('audio', second.surface());
        const count = audio.length;
        pendingBlob.resolve('blob:stale'); await Promise.resolve(); await Promise.resolve();
        expect(audio).toHaveLength(count);
        expect(audio.some(item => item.src === 'blob:stale')).toBe(false);
        second.mount.remove(); await Promise.resolve();
        expect(audio.at(-1)!.pause).toHaveBeenCalled();
    });
});

describe('Study examples transport recovery', () => {
    afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });


    it('keeps usable partial results for the normal lifetime and separate from a complete empty response', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async url => {
            if (String(url).includes('nadeshiko')) throw new Error('Temporary Nadeshiko failure');
            return { examples: [{ id: 'one', sentence: '私は中学生です。' }] };
        });
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitExampleSource: 'combined' as const,
            nadeshikoApiKey: 'test-key', };
        const partial = await client.searchResult('中学生', settings);
        expect(partial.status).toBe('partial'); expect(partial.examples).toHaveLength(1);
        const firstCalls = transport.mock.calls.length;
        now += 2_000;
        expect(await client.searchResult('中学生', settings)).toBe(partial);
        expect(transport).toHaveBeenCalledTimes(firstCalls);
        now += 298_001;
        transport.mockResolvedValue({ examples: [] });
        expect(await client.searchResult('中学生', settings)).toEqual({ examples: [], status: 'complete' });
        expect(transport.mock.calls.length).toBeGreaterThan(firstCalls);
    });

    it('caches a combined fast-first winner instead of re-querying both providers a second later', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async url => String(url).includes('nadeshiko')
            ? { segments: [{ publicId: 'n', textJa: { content: '妹は中学生になりました。' } }] }
            : { examples: [{ id: 'one', sentence: '私は中学生です。' }] });
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitExampleSource: 'combined' as const,
            nadeshikoApiKey: 'test-key', };
        const providerCalls = () => {
            const nadeshiko = transport.mock.calls.filter(([url]) => String(url).includes('nadeshiko')).length;
            return { immersionKit: transport.mock.calls.length - nadeshiko, nadeshiko };
        };
        const first = await client.searchResult('中学生', settings, { fastFirst: true });
        expect(first).toMatchObject({ status: 'complete', examples: [expect.anything()] });
        expect(providerCalls()).toEqual({ immersionKit: 1, nadeshiko: 1 });
        now += 2_000;
        expect(await client.searchResult('中学生', settings, { fastFirst: true })).toBe(first);
        expect(providerCalls()).toEqual({ immersionKit: 1, nadeshiko: 1 });
    });

    it('retains client rate-limit backoff while allowing a later successful retry', async () => {
        let now = 100_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('Immersion Kit failed (429)'));
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitExampleSource: 'immersion-kit' as const, };
        await expect(client.searchResult('中学生', settings)).rejects.toThrow(/429/);
        const failedCalls = transport.mock.calls.length;
        now += 500; await expect(client.searchResult('中学生', settings)).rejects.toThrow();
        expect(transport).toHaveBeenCalledTimes(failedCalls);
        now += 1_001; transport.mockResolvedValue({ examples: [{ sentence: '私は中学生です。' }] });
        expect((await client.searchResult('中学生', settings)).examples).toHaveLength(1);
        expect(transport.mock.calls.length).toBeGreaterThan(failedCalls);
    });

    it('retries the same card after a transient transport failure across both cache layers', async () => {
        const transport = vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('Temporary network failure'));
        const client = new ImmersionKitClient();
        const settings = { ...DEFAULT_SETTINGS,
            immersionKitEnabled: true, immersionKitExampleSource: 'immersion-kit',
            jpdbDefinitionsEnabled: false, immersionKitShowImages: false,
        } as typeof DEFAULT_SETTINGS;
        const examples = new StudyExamples({ getSettings: () => settings, immersionKit: client,
            parser: { canParse: () => false } as never,
            sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} },
        });
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const mount = document.createElement('div');
        mount.dataset.newtabMeaning = 'true';
        document.body.append(mount);
        try {
            examples.present({ mount, card, mode: 'word', revealed: true });
            expect(await examples.examples(card)).toEqual([]);
            const failedRequests = transport.mock.calls.length;
            expect(failedRequests).toBeGreaterThan(0);
            transport.mockResolvedValue({ examples: [{ id: 'recovered', sentence: '私は中学生です。', translation: 'I am a middle school student.' }] });
            window.dispatchEvent(new Event('online'));
            await vi.waitFor(() => expect(mount.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('私は中学生です。'));
            expect(transport.mock.calls.length).toBeGreaterThan(failedRequests);
        } finally { examples.dispose(); }
    });
});

describe('StudyExamples with the real example client', () => {
    const sessions: StudyExamples[] = [];
    const firstSentence = '私は中学生です。';
    const nextSentence = '妹は中学生になりました。';
    function immersionResponse(sentence: string) { return { examples: [{ id: sentence, sentence }] }; }
    function nadeshikoResponse(sentence: string) { return { segments: [{ publicId: sentence, textJa: { content: sentence } }] }; }

    function fixture(source: ReaderSettings['immersionKitExampleSource']) {
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true,
            immersionKitExampleSource: source, nadeshikoApiKey: 'fixture-first-key',
            immersionKitShowImages: false, immersionKitAutoPlayAudio: false,
            jpdbDefinitionsEnabled: false };
        const client = new ImmersionKitClient();
        const module = new StudyExamples({ getSettings: () => settings, immersionKit: client,
            parser: { canParse: () => false, parse: async () => [],
                fallbackCardFromText: text => newTabTestCard({ spelling: text }) },
            sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} },
        });
        sessions.push(module);
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const mount = document.createElement('div');
        document.body.append(mount);
        const reveal = () => module.present({ card, mount, mode: 'word', revealed: true });
        const expectSentence = (sentence: string) => vi.waitFor(() =>
            expect(mount.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain(sentence));
        return { settings, client, module, card, mount, reveal, expectSentence };
    }

    afterEach(() => {
        sessions.splice(0).forEach(module => module.dispose());
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });


    it('reveals the fast-first example prepared on the front even when providers later answer differently', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let recovered = false;
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async url => {
            if (url.includes('nadeshiko')) {
                if (!recovered) throw new Error('Temporary provider failure');
                return nadeshikoResponse(nextSentence);
            }
            return recovered ? { examples: [] } : immersionResponse(firstSentence);
        });
        const f = fixture('combined');
        const search = vi.spyOn(f.client, 'searchResult');
        f.module.present({ card: f.card, mount: f.mount, mode: 'word', revealed: false });
        f.module.prefetch([f.card]);
        expect((await f.module.examples(f.card)).map(example => example.sentence)).toEqual([firstSentence]);
        expect(search.mock.calls[0]?.[2]).toMatchObject({ fastFirst: true });
        const preparedCalls = transport.mock.calls.length;
        expect(preparedCalls).toBe(2);
        recovered = true;
        now += 2_000;
        f.reveal();
        await f.expectSentence(firstSentence);
        now += 600_000;
        f.reveal();
        await f.expectSentence(firstSentence);
        expect(transport).toHaveBeenCalledTimes(preparedCalls);
        expect(f.mount.textContent).not.toContain(nextSentence);
    });

    it('does not retry a rate-limited card until expiry, then renders recovered results', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('Immersion Kit failed (429)'));
        const f = fixture('immersion-kit');
        f.reveal();
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(transport).toHaveBeenCalledTimes(1);
        expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
        now += 999;
        f.reveal();
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(transport).toHaveBeenCalledTimes(1);
        now += 2;
        transport.mockResolvedValue(immersionResponse(nextSentence));
        f.reveal();
        await f.expectSentence(nextSentence);
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('keeps Nadeshiko available while Immersion Kit is still in its backoff', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async (url, options) => {
            if (!url.includes('nadeshiko')) throw new Error('Immersion Kit failed (429)');
            const query = (JSON.parse(String(options?.data)) as { query: { search: string } }).query.search;
            return nadeshikoResponse(query === '中学生' ? firstSentence : '兄は高校生になりました。');
        });
        const f = fixture('combined');
        f.reveal();
        await f.expectSentence(firstSentence);
        const immersionKitCalls = () => transport.mock.calls.filter(([url]) => !url.includes('nadeshiko')).length;
        expect(immersionKitCalls()).toBe(1);
        now += 500;
        const other = newTabTestCard({ spelling: '高校生', reading: 'こうこうせい' });
        f.module.present({ card: other, mount: f.mount, mode: 'word', revealed: true });
        await f.expectSentence('兄は高校生になりました。');
        expect(immersionKitCalls()).toBe(1);
        now += 1_001;
        f.reveal();
        await f.expectSentence(firstSentence);
        expect(transport.mock.calls.filter(([url]) => url.includes('nadeshiko'))).toHaveLength(2);
    });

    it('uses the replacement credential and rejects the late result from the old credential', async () => {
        let resolveOld!: (data: unknown) => void;
        const oldResponse = new Promise<unknown>(resolve => { resolveOld = resolve; });
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async (_url, options) => {
            if (new Headers(options?.headers).get('Authorization') === 'Bearer fixture-first-key') return oldResponse;
            return nadeshikoResponse(nextSentence);
        });
        const f = fixture('nadeshiko');
        f.reveal();
        const oldRead = f.module.examples(f.card);
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
        f.settings.nadeshikoApiKey = 'fixture-replacement-key';
        f.reveal();
        await f.expectSentence(nextSentence);
        expect(transport.mock.calls.map(([, options]) => new Headers(options?.headers).get('Authorization')))
            .toEqual(['Bearer fixture-first-key', 'Bearer fixture-replacement-key']);
        resolveOld(nadeshikoResponse(firstSentence));
        expect(await oldRead).toEqual([]);
        expect(f.mount.textContent).toContain(nextSentence);
        expect(f.mount.textContent).not.toContain(firstSentence);
        expect(await f.module.examples(f.card)).toHaveLength(1);
        expect(transport).toHaveBeenCalledTimes(2);
    });
});

describe('NewTabImmersionAudioPlayer', () => {
    class FakeAudio {
        static instances: FakeAudio[] = [];
        static playBehavior: (src: string) => Promise<void> = async () => {};
        playbackRate = 1;
        ended = false;
        paused = false;
        private listeners: Record<string, Array<() => void>> = {};
        constructor(public src: string) { FakeAudio.instances.push(this); }
        addEventListener(type: string, cb: () => void): void { (this.listeners[type] ??= []).push(cb); }
        pause(): void { this.paused = true; }
        play(): Promise<void> { return FakeAudio.playBehavior(this.src); }
        dispatch(type: string): void { (this.listeners[type] ?? []).forEach(cb => cb()); }
    }

    function makePlayer(over: Partial<NewTabImmersionAudioPlayerDeps> = {}) {
        const fetchBlobUrl = vi.fn(async (): Promise<string> => '');
        const player = new NewTabImmersionAudioPlayer({
            getSettings: () => ({ ...DEFAULT_SETTINGS2, immersionKitPlaybackRate: 1.5, corsProxyUrl: '', interfaceLanguage: 'en' }) as ReaderSettings,
            immersionKit: { fetchBlobUrl } as unknown as ImmersionKitClient,
            ...over,
        });
        return { player, fetchBlobUrl };
    }


    beforeEach(() => {
        FakeAudio.instances = [];
        FakeAudio.playBehavior = async () => {};
        vi.stubGlobal('Audio', FakeAudio);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('plays the first candidate at the configured rate and reports playing for its key', async () => {
        const { player, fetchBlobUrl } = makePlayer();
        await player.playSource({ urls: ['a.mp3', 'b.mp3'], key: 'k1' }, () => true);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3']);
        expect(FakeAudio.instances[0]?.playbackRate).toBe(1.5);
        expect(player.isPlaying('k1')).toBe(true);
        expect(player.isPlaying('other')).toBe(false);
        expect(fetchBlobUrl).not.toHaveBeenCalled();
    });

    it('restarts the same key when playSource is requested again', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        const first = FakeAudio.instances[0];

        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);

        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3', 'a.mp3']);
        expect(first?.paused).toBe(true);
        expect(player.isPlaying('k1')).toBe(true);
    });

    it('falls through to the next candidate when play() rejects', async () => {
        const { player } = makePlayer();
        FakeAudio.playBehavior = async src => { if (src === 'a.mp3') throw new Error('autoplay blocked'); };
        await player.playSource({ urls: ['a.mp3', 'b.mp3'], key: 'k1' }, () => true);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3', 'b.mp3']);
        expect(player.isPlaying('k1')).toBe(true);
    });

    it('fetches a blob fallback when every direct candidate fails', async () => {
        const { player, fetchBlobUrl } = makePlayer();
        fetchBlobUrl.mockResolvedValue('blob:fallback');
        FakeAudio.playBehavior = async src => { if (src !== 'blob:fallback') throw new Error('direct blocked'); };
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(fetchBlobUrl).toHaveBeenCalledTimes(1);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3', 'blob:fallback']);
        expect(FakeAudio.instances[1]?.paused).toBe(false); // the blob did play
        expect(player.isPlaying('k1')).toBe(true);
    });

    it('uses direct media playback for loopback audio urls to avoid hosted CORS fetch noise', async () => {
        const { player, fetchBlobUrl } = makePlayer();
        await player.playSource({ urls: ['http://localhost:9090/audio/jpod/media/line.mp3'], key: 'k1' }, () => true);
        expect(fetchBlobUrl).not.toHaveBeenCalled();
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['http://localhost:9090/audio/jpod/media/line.mp3']);
        expect(player.isPlaying('k1')).toBe(true);
    });

    it('deduplicates and trims candidate urls', async () => {
        const { player } = makePlayer();
        FakeAudio.playBehavior = async () => { throw new Error('blocked'); };
        await player.playSource({ urls: [' a.mp3 ', 'a.mp3', ''], key: 'k1' }, () => true);
        expect(FakeAudio.instances.map(a => a.src)).toEqual(['a.mp3']);
    });

    it('does not attach audio when the card is no longer current', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => false);
        expect(FakeAudio.instances).toHaveLength(0);
        expect(player.isPlaying('k1')).toBe(false);
    });

    it('clears playback when the active element fires ended or error', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(player.isPlaying('k1')).toBe(true);
        FakeAudio.instances[0]?.dispatch('ended');
        expect(player.isPlaying('k1')).toBe(false);

        await player.playSource({ urls: ['b.mp3'], key: 'k2' }, () => true);
        expect(player.isPlaying('k2')).toBe(true);
        FakeAudio.instances[1]?.dispatch('error');
        expect(player.isPlaying('k2')).toBe(false);
    });

    it('ignores ended from a stale element after a newer source begins', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        const stale = FakeAudio.instances[0];
        await player.playSource({ urls: ['b.mp3'], key: 'k2' }, () => true);
        expect(player.isPlaying('k2')).toBe(true);
        stale?.dispatch('ended'); // identity guard: not the current element
        expect(player.isPlaying('k2')).toBe(true);
    });

    it('does not keep a direct candidate that resolves after the request was invalidated', async () => {
        const { player } = makePlayer();
        let resolvePlay = (): void => {};
        FakeAudio.playBehavior = () => new Promise<void>(res => { resolvePlay = res; });
        const pending = player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        player.reset(); // a newer card arrives while k1's play() is still pending
        resolvePlay();
        await pending;
        expect(player.isPlaying('k1')).toBe(false);
        expect(FakeAudio.instances[0]?.paused).toBe(true);
    });

    it('stops a direct candidate that resolves after the surface is no longer current', async () => {
        const { player, fetchBlobUrl } = makePlayer();
        let current = true;
        let resolvePlay = (): void => {};
        FakeAudio.playBehavior = () => new Promise<void>(res => { resolvePlay = res; });
        const pending = player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => current);
        current = false;
        resolvePlay();
        await pending;
        expect(player.isPlaying('k1')).toBe(false);
        expect(FakeAudio.instances[0]?.paused).toBe(true);
        expect(fetchBlobUrl).not.toHaveBeenCalled();
    });

    it('reset() stops playback and reports not playing', async () => {
        const { player } = makePlayer();
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(player.isPlaying('k1')).toBe(true);
        player.reset();
        expect(player.isPlaying('k1')).toBe(false);
        expect(FakeAudio.instances[0]?.paused).toBe(true);
    });

    it('does not play a blob that resolves after the request was invalidated', async () => {
        let invalidate = (): void => {};
        const fetchBlobUrl = vi.fn(async (): Promise<string> => { invalidate(); return 'blob:late'; });
        const { player } = makePlayer({ immersionKit: { fetchBlobUrl } as unknown as ImmersionKitClient });
        invalidate = () => player.reset(); // a newer card arrives while the blob is in flight
        FakeAudio.playBehavior = async src => { if (src !== 'blob:late') throw new Error('direct blocked'); };
        await player.playSource({ urls: ['a.mp3'], key: 'k1' }, () => true);
        expect(FakeAudio.instances.some(a => a.src === 'blob:late')).toBe(false);
        expect(player.isPlaying('k1')).toBe(false);
    });
});

describe('provider example translations', () => {
    function renderExample(provider: 'bunpro' | 'jiten' | 'jpdb', translation: string): HTMLElement {
        const example: ProviderExampleView = {
            id: 'example-1',
            sentence: '毎日復習する。',
            sentenceHtml: '毎日復習する。',
            translation,
        };
        document.body.innerHTML = renderProviderExamples(
            provider,
            provider,
            { availability: 'loaded', items: [example] },
            key => `data-source-state-key="${key}"`,
            'en',
        );
        return document.body.querySelector<HTMLElement>('details')!;
    }


    afterEach(() => {
        document.body.innerHTML = '';
    });

    it.each(['bunpro', 'jiten', 'jpdb'] as const)('blurs native %s translations until click', provider => {
        const root = renderExample(provider, 'I review every day.');
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;

        installProviderExampleBehaviors(root, {
            interfaceLanguage: 'en',
            outputLanguage: 'en',
            blurTranslations: true,
            translate: vi.fn(),
        });

        expect(translation.dataset.providerTranslationBlurred).toBe('true');
        expect(translation.textContent).toBe('I review every day.');
        translation.click();
        expect(translation.dataset.providerTranslationBlurred).toBeUndefined();
        expect(translation.getAttribute('role')).toBeNull();
    });

    it('fills a missing provider translation and keeps it blurred until keyboard reveal', async () => {
        const root = renderExample('jiten', '');
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;
        const translate = vi.fn(async () => 'I review every day.');

        installProviderExampleBehaviors(root, {
            interfaceLanguage: 'en',
            outputLanguage: 'en',
            blurTranslations: true,
            translate,
        });

        await vi.waitFor(() => expect(translation.hidden).toBe(false));
        expect(translate).toHaveBeenCalledWith('毎日復習する。', 'en');
        expect(translation.textContent).toBe('I review every day.');
        expect(translation.dataset.providerTranslationBlurred).toBe('true');
        translation.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(translation.dataset.providerTranslationBlurred).toBeUndefined();
    });

    it('shows provider translations immediately when translation blur is disabled', async () => {
        const root = renderExample('jiten', '');
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;

        installProviderExampleBehaviors(root, {
            interfaceLanguage: 'en',
            outputLanguage: 'en',
            blurTranslations: false,
            translate: async () => 'I review every day.',
        });

        await vi.waitFor(() => expect(translation.hidden).toBe(false));
        expect(translation.dataset.providerTranslationBlurred).toBeUndefined();
    });
});
