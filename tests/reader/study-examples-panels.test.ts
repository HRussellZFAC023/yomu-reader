import { afterEach, expect, it, vi } from 'vitest';
import { StudyExamples } from '../../src/reader/newtab/study-examples';
import { DEFAULT_SETTINGS, newTabFallbackCardFromText, newTabImmersionExample } from './new-tab-review/fixtures';

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
