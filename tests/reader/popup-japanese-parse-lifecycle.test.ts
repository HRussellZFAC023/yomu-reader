import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { readerWordSurfaceText } from '../../src/reader/dom/index';
import type { ReaderParserParseOptions } from '../../src/reader/lookup/parser';
import { clearNestedParseState } from '../../src/reader/lookup/nested-text-parse';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(complete => { resolve = complete; });
    return { promise, resolve };
}

interface PopupParseInternals {
    activePopover?: HTMLElement;
    settings: ReaderSettings;
    parser: { parse: (texts: string[], options?: ReaderParserParseOptions) => Promise<JPDBToken[][]> };
    parsePopoverJapanese(root: HTMLElement): Promise<void>;
}

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

const apps: ReaderApp[] = [];

afterEach(() => {
    apps.splice(0).forEach(app => app.destroy());
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function popupFixture() {
    const app = new ReaderApp();
    apps.push(app);
    const internals = app as unknown as PopupParseInternals;
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'yomu-unit-test-key',
        audioEnabled: false,
        ankiEnabled: false,
        showPitchAccent: false,
        localDictionariesEnabled: false,
    };
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.innerHTML = '<div class="jpdb-reader-local-glossary jpdb-reader-parseable">日本語を読む</div>';
    document.body.append(popover);
    internals.activePopover = popover;
    return { internals, popover };
}

async function pendingLocalPopupFixture() {
    const { internals, popover } = popupFixture();
    const local = deferred<JPDBToken[][]>();
    const parse = vi.fn(() => local.promise);
    internals.parser = { parse };
    const first = internals.parsePopoverJapanese(popover);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    return { internals, popover, local, parse, first };
}

describe('popup Japanese parse lifecycle', () => {
    it('keeps an in-flight local definition when a provider sentence arrives on the same popup', async () => {
        const { internals, popover } = popupFixture();
        const local = deferred<JPDBToken[][]>();
        const provider = deferred<JPDBToken[][]>();
        const parse = vi.fn((texts: string[]) => texts.includes('日本語を読む') ? local.promise : provider.promise);
        internals.parser = { parse };

        const first = internals.parsePopoverJapanese(popover);
        await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
        // A lazy provider arrives before the local parse resolves. Its partial
        // target word must be normalized without taking the local pass's ticket.
        popover.insertAdjacentHTML('beforeend', '<div class="jpdb-reader-parseable" data-provider-example-sentence>毎日<mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-reader-example-target">読む</span></mark></div>');
        const loadingId = popover.dataset.jpdbReaderParseLoadingId;
        const second = internals.parsePopoverJapanese(popover);
        await Promise.resolve();
        expect(parse).toHaveBeenCalledTimes(1);
        expect(popover.dataset.jpdbReaderParseLoadingId).toBe(loadingId);

        local.resolve([[wordToken('日本語を読む', '日本語', 0), wordToken('日本語を読む', '読む', 4)]]);
        provider.resolve([[wordToken('毎日読む', '毎日', 0), wordToken('毎日読む', '読む', 2)]]);
        await Promise.all([first, second]);

        const surfaces = (selector: string) => Array.from(popover.querySelectorAll(`${selector} .jpdb-reader-word`)).map(readerWordSurfaceText);
        expect(surfaces('.jpdb-reader-local-glossary')).toEqual(['日本語', '読む']);
        expect(surfaces('[data-provider-example-sentence]')).toEqual(['毎日', '読む']);
        expect(popover.querySelector('[data-provider-example-sentence] mark .jpdb-reader-word')?.textContent).toBe('読む');
        expect(popover.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
        expect(popover.dataset.jpdbReaderParseLoadingId).toBeUndefined();
    });

    it('replans a replaced popup body and reuses the in-flight parsed content', async () => {
        const { internals, popover, local, parse, first } = await pendingLocalPopupFixture();

        const replaced = popover.firstElementChild!;
        clearNestedParseState(popover);
        popover.innerHTML = '<div class="jpdb-reader-local-glossary jpdb-reader-parseable">日本語を読む</div>';
        const second = internals.parsePopoverJapanese(popover);
        local.resolve([[wordToken('日本語を読む', '日本語', 0), wordToken('日本語を読む', '読む', 4)]]);
        await Promise.all([first, second]);

        expect(parse).toHaveBeenCalledTimes(1);
        expect(replaced.querySelector('.jpdb-reader-word')).toBeNull();
        expect(Array.from(popover.querySelectorAll('.jpdb-reader-word')).map(readerWordSurfaceText)).toEqual(['日本語', '読む']);
        expect(popover.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
        expect(popover.dataset.jpdbReaderParseLoadingId).toBeUndefined();
    });

    it('drains another provider commit received while the first provider pass is pending', async () => {
        const { internals, popover } = popupFixture();
        popover.insertAdjacentHTML('beforeend', '<div class="jpdb-reader-parseable" data-provider-example-sentence>毎日<mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-reader-example-target">読む</span></mark></div>');
        const firstProvider = deferred<JPDBToken[][]>();
        const parse = vi.fn((texts: string[]) => {
            if (texts.includes('日本語を読む')) return Promise.resolve([[wordToken('日本語を読む', '日本語', 0), wordToken('日本語を読む', '読む', 4)]]);
            if (texts.includes('毎日読む')) return firstProvider.promise;
            return Promise.resolve([[wordToken('明日読む', '明日', 0), wordToken('明日読む', '読む', 2)]]);
        });
        internals.parser = { parse };
        const first = internals.parsePopoverJapanese(popover);
        await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2));

        const loadingId = popover.dataset.jpdbReaderParseLoadingId;
        popover.insertAdjacentHTML('beforeend', '<div class="jpdb-reader-parseable" data-provider-example-sentence>明日<mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-reader-example-target">読む</span></mark></div>');
        const second = internals.parsePopoverJapanese(popover);
        await Promise.resolve();
        expect(parse).toHaveBeenCalledTimes(2);
        expect(popover.dataset.jpdbReaderParseLoadingId).toBe(loadingId);
        firstProvider.resolve([[wordToken('毎日読む', '毎日', 0), wordToken('毎日読む', '読む', 2)]]);
        await Promise.all([first, second]);

        expect(parse).toHaveBeenCalledTimes(3);
        expect(Array.from(popover.querySelectorAll('[data-provider-example-sentence] .jpdb-reader-word')).map(readerWordSurfaceText)).toEqual(['毎日', '読む', '明日', '読む']);
        expect(popover.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
        expect(popover.dataset.jpdbReaderParseLoadingId).toBeUndefined();
    });

    it('does not repaint a dismissed popup or run its queued follow-up', async () => {
        const { internals, popover, local, parse, first } = await pendingLocalPopupFixture();
        const second = internals.parsePopoverJapanese(popover);
        internals.activePopover = undefined;
        popover.remove();
        local.resolve([[wordToken('日本語を読む', '日本語', 0)]]);
        await Promise.all([first, second]);

        expect(parse).toHaveBeenCalledTimes(1);
        expect(popover.querySelector('.jpdb-reader-word')).toBeNull();
        expect(popover.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
        expect(popover.dataset.jpdbReaderParseLoadingId).toBeUndefined();
    });
});
