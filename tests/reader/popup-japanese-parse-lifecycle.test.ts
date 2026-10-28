import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { readerWordSurfaceText } from '../../src/reader/dom/index';
import { clearNestedParseState } from '../../src/reader/lookup/nested-text-parse';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(complete => { resolve = complete; });
    return { promise, resolve };
}

type ParseTexts = (texts: string[]) => Promise<JPDBToken[][]>;

function wordToken(text: string, spelling: string, start: number): JPDBToken {
    return {
        start,
        end: start + spelling.length,
        length: spelling.length,
        sentence: text,
        rubies: [],
        pitchClass: '',
        card: {
            vid: start + 1, sid: 0, rid: 0,
            spelling, reading: spelling,
            frequencyRank: 0, partOfSpeech: [], meanings: [],
            cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
        },
    };
}

const GLOSSARY = '<div class="jpdb-reader-local-glossary jpdb-reader-parseable">日本語を読む</div>';
const GLOSSARY_WORDS = [[wordToken('日本語を読む', '日本語', 0), wordToken('日本語を読む', '読む', 4)]];
const REPLACED_GLOSSARY = '<div class="jpdb-reader-local-glossary jpdb-reader-parseable">新しい本を読む</div>';
const REPLACED_GLOSSARY_WORDS = [[wordToken('新しい本を読む', '新しい', 0), wordToken('新しい本を読む', '本', 3), wordToken('新しい本を読む', '読む', 5)]];
const providerSentence = (lead: string) => `<div class="jpdb-reader-parseable" data-provider-example-sentence>${lead}<mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-reader-example-target">読む</span></mark></div>`;
const providerWords = (lead: string) => [[wordToken(`${lead}読む`, lead, 0), wordToken(`${lead}読む`, '読む', lead.length)]];

// Both lookup popups — the page Reader's and hosted Study's — mount a popover,
// re-render it as providers settle, and ask for nested parses on every commit.
interface PopupSurface {
    popover: HTMLElement;
    setParser(parse: ParseTexts): void;
    requestParse(): Promise<void>;
    dismiss(): void;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function mountPopover(html: string): HTMLElement {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.innerHTML = html;
    document.body.append(popover);
    return popover;
}

function readerPopup(html: string): PopupSurface {
    const app = new ReaderApp();
    cleanups.push(() => app.destroy());
    const internals = app as unknown as {
        activePopover?: HTMLElement;
        settings: ReaderSettings;
        parser: { parse: ParseTexts };
        parsePopoverJapanese(root: HTMLElement): Promise<void>;
    };
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'yomu-unit-test-key',
        audioEnabled: false,
        ankiEnabled: false,
        showPitchAccent: false,
        localDictionariesEnabled: false,
    };
    const popover = mountPopover(html);
    internals.activePopover = popover;
    return {
        popover,
        setParser: parse => { internals.parser = { parse }; },
        requestParse: () => internals.parsePopoverJapanese(popover),
        dismiss: () => {
            internals.activePopover = undefined;
            popover.remove();
        },
    };
}

function studyPopup(html: string): PopupSurface {
    const runtime = new NewTabRuntime();
    cleanups.push(() => runtime.destroy());
    const internals = runtime as unknown as {
        settings: ReaderSettings;
        parser: { canParse(): boolean; parse: ParseTexts };
        parseNewTabContent(root: HTMLElement): Promise<void>;
    };
    internals.settings = {
        ...DEFAULT_SETTINGS,
        audioEnabled: false,
        ankiEnabled: false,
        showPitchAccent: false,
        localDictionariesEnabled: false,
    };
    const popover = mountPopover(html);
    return {
        popover,
        setParser: parse => { internals.parser = { canParse: () => true, parse }; },
        requestParse: () => internals.parseNewTabContent(popover),
        dismiss: () => popover.remove(),
    };
}

const glossaryWords = (popover: HTMLElement) => surfaceWords(popover, '.jpdb-reader-local-glossary');
const exampleWords = (popover: HTMLElement) => surfaceWords(popover, '[data-provider-example-sentence]');

function surfaceWords(popover: HTMLElement, selector: string): string[] {
    return Array.from(popover.querySelectorAll(`${selector} .jpdb-reader-word`)).map(readerWordSurfaceText);
}

// Answers each parse request by the first listed text it contains.
function parserFor(answers: Record<string, Promise<JPDBToken[][]> | JPDBToken[][]>) {
    return vi.fn((texts: string[]) => Promise.resolve(Object.entries(answers).find(([text]) => texts.includes(text))?.[1] ?? []));
}

type ParseMock = ReturnType<typeof parserFor>;

function requested(parse: ParseMock, text: string): number {
    return parse.mock.calls.filter(([texts]) => texts.includes(text)).length;
}

async function startParse(surface: PopupSurface, parse: ParseMock, calls: number): Promise<{ pass: Promise<void> }> {
    surface.setParser(parse);
    const pass = surface.requestParse();
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(calls));
    return { pass };
}

// What a card re-render does before it asks for its own parse.
function rerender(popover: HTMLElement, html: string): void {
    clearNestedParseState(popover);
    popover.innerHTML = html;
}

function expectNoLoadingTicket(popover: HTMLElement): void {
    expect(popover.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
    expect(popover.dataset.jpdbReaderParseLoadingId).toBeUndefined();
}

async function settleMacrotasks(count = 5): Promise<void> {
    for (let index = 0; index < count; index += 1) await new Promise(resolve => setTimeout(resolve, 0));
}

describe.each([
    ['Reader popup', readerPopup],
    ['Study popup', studyPopup],
] as const)('%s nested Japanese parse lifecycle', (_surface, mount) => {
    // Regression guard for C03: on the unserialized owner the provider pass
    // steals the local pass's ticket and the glossary is left bare.
    it('keeps an in-flight local definition when a provider sentence arrives on the same popup', async () => {
        const surface = mount(GLOSSARY);
        const { popover } = surface;
        const local = deferred<JPDBToken[][]>();
        const provider = deferred<JPDBToken[][]>();
        const parse = parserFor({ 日本語を読む: local.promise, 毎日読む: provider.promise });
        const { pass } = await startParse(surface, parse, 1);
        // A lazy provider arrives before the local parse resolves. Its partial
        // target word must be normalized without taking the local pass's ticket.
        popover.insertAdjacentHTML('beforeend', providerSentence('毎日'));
        const loadingId = popover.dataset.jpdbReaderParseLoadingId;
        const commit = surface.requestParse();
        await Promise.resolve();
        expect(parse).toHaveBeenCalledTimes(1);
        expect(popover.dataset.jpdbReaderParseLoadingId).toBe(loadingId);

        local.resolve(GLOSSARY_WORDS);
        provider.resolve(providerWords('毎日'));
        await Promise.all([pass, commit]);

        expect(glossaryWords(popover)).toEqual(['日本語', '読む']);
        expect(exampleWords(popover)).toEqual(['毎日', '読む']);
        expect(popover.querySelector('[data-provider-example-sentence] mark .jpdb-reader-word')?.textContent).toBe('読む');
        expectNoLoadingTicket(popover);
    });

    // Regression guard: a second provider commit is drained, not dropped or overlapped.
    it('drains another provider commit received while the first provider pass is pending', async () => {
        const surface = mount(GLOSSARY + providerSentence('毎日'));
        const { popover } = surface;
        const firstProvider = deferred<JPDBToken[][]>();
        const parse = parserFor({ 日本語を読む: GLOSSARY_WORDS, 毎日読む: firstProvider.promise, 明日読む: providerWords('明日') });
        const { pass } = await startParse(surface, parse, 2);

        const loadingId = popover.dataset.jpdbReaderParseLoadingId;
        popover.insertAdjacentHTML('beforeend', providerSentence('明日'));
        const commit = surface.requestParse();
        await Promise.resolve();
        expect(parse).toHaveBeenCalledTimes(2);
        expect(popover.dataset.jpdbReaderParseLoadingId).toBe(loadingId);
        firstProvider.resolve(providerWords('毎日'));
        await Promise.all([pass, commit]);

        expect(parse).toHaveBeenCalledTimes(3);
        expect(exampleWords(popover)).toEqual(['毎日', '読む', '明日', '読む']);
        expectNoLoadingTicket(popover);
    });

    // Regression guard: a re-render must not queue behind a provider parse
    // (public Jiten detail hydration can take seconds) whose result it discarded.
    it('starts parsing a re-rendered body while the replaced provider parse is still pending', async () => {
        const surface = mount(GLOSSARY + providerSentence('毎日'));
        const { popover } = surface;
        const staleProvider = deferred<JPDBToken[][]>();
        const parse = parserFor({ 毎日読む: staleProvider.promise, 新しい本を読む: REPLACED_GLOSSARY_WORDS, 日本語を読む: GLOSSARY_WORDS });
        const { pass } = await startParse(surface, parse, 2);

        rerender(popover, REPLACED_GLOSSARY);
        const rerendered = surface.requestParse();
        await vi.waitFor(() => expect(glossaryWords(popover)).toEqual(['新しい', '本', '読む']));
        expectNoLoadingTicket(popover);

        staleProvider.resolve(providerWords('毎日'));
        await Promise.all([pass, rerendered]);
        expect(glossaryWords(popover)).toEqual(['新しい', '本', '読む']);
    });

    it('repaints an unchanged re-rendered body from the parse cache while the provider parse is pending', async () => {
        const surface = mount(GLOSSARY + providerSentence('毎日'));
        const { popover } = surface;
        const provider = deferred<JPDBToken[][]>();
        const parse = parserFor({ 毎日読む: provider.promise, 日本語を読む: GLOSSARY_WORDS });
        const { pass } = await startParse(surface, parse, 2);
        expect(glossaryWords(popover)).toEqual(['日本語', '読む']);

        // Hydration (frequency ranks, Anki, Bunpro…) re-renders the same card.
        rerender(popover, GLOSSARY + providerSentence('毎日'));
        const rerendered = surface.requestParse();
        await vi.waitFor(() => expect(glossaryWords(popover)).toEqual(['日本語', '読む']));

        provider.resolve(providerWords('毎日'));
        await Promise.all([pass, rerendered]);
        expect(exampleWords(popover)).toEqual(['毎日', '読む']);
        // The re-render reused both in-flight parses instead of asking again.
        expect(parse).toHaveBeenCalledTimes(2);
        expectNoLoadingTicket(popover);
    });

    // Hover popups ask for their parse a frame after the re-render. By then the
    // replaced pass may have settled; it must stop rather than start parsing
    // the new body's provider examples ahead of the new request.
    it('ends a pass whose ticket a re-render cleared before the next request arrives', async () => {
        const surface = mount(GLOSSARY);
        const { popover } = surface;
        const local = deferred<JPDBToken[][]>();
        const provider = deferred<JPDBToken[][]>();
        const parse = parserFor({ 日本語を読む: local.promise, 新しい本を読む: REPLACED_GLOSSARY_WORDS, 毎日読む: provider.promise });
        const { pass } = await startParse(surface, parse, 1);

        rerender(popover, REPLACED_GLOSSARY + providerSentence('毎日'));
        local.resolve(GLOSSARY_WORDS);
        await settleMacrotasks();
        expect(requested(parse, '毎日読む')).toBe(0);

        const nextFrame = surface.requestParse();
        await vi.waitFor(() => expect(glossaryWords(popover)).toEqual(['新しい', '本', '読む']));
        provider.resolve(providerWords('毎日'));
        await Promise.all([pass, nextFrame]);
        expect(exampleWords(popover)).toEqual(['毎日', '読む']);
        expect(requested(parse, '毎日読む')).toBe(1);
        expectNoLoadingTicket(popover);
    });

    // Behaviour preserved from the unserialized owner, not C03 fix evidence.
    it('replans a replaced popup body and reuses the in-flight parsed content', async () => {
        const surface = mount(GLOSSARY);
        const { popover } = surface;
        const local = deferred<JPDBToken[][]>();
        const parse = parserFor({ 日本語を読む: local.promise });
        const { pass } = await startParse(surface, parse, 1);

        const replaced = popover.firstElementChild!;
        rerender(popover, GLOSSARY);
        const rerendered = surface.requestParse();
        local.resolve(GLOSSARY_WORDS);
        await Promise.all([pass, rerendered]);

        expect(parse).toHaveBeenCalledTimes(1);
        expect(replaced.querySelector('.jpdb-reader-word')).toBeNull();
        expect(glossaryWords(popover)).toEqual(['日本語', '読む']);
        expectNoLoadingTicket(popover);
    });

    // Regression guard: a provider commit queued behind the local pass spends
    // no provider parse once the popup is dismissed.
    it('does not parse or repaint a dismissed popup', async () => {
        const surface = mount(GLOSSARY);
        const { popover } = surface;
        const local = deferred<JPDBToken[][]>();
        const parse = parserFor({ 日本語を読む: local.promise, 毎日読む: providerWords('毎日') });
        const { pass } = await startParse(surface, parse, 1);
        popover.insertAdjacentHTML('beforeend', providerSentence('毎日'));
        const commit = surface.requestParse();
        surface.dismiss();
        local.resolve(GLOSSARY_WORDS);
        await Promise.all([pass, commit]);
        await settleMacrotasks();

        expect(parse).toHaveBeenCalledTimes(1);
        expect(glossaryWords(popover)).toEqual([]);
        expectNoLoadingTicket(popover);
    });
});
