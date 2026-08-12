import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    filterJitenKanjiWords,
    loadMoreJitenKanjiWords,
    runJitenKanjiWordsAction,
    type JitenKanjiWordsActionContext,
} from '../../src/reader/jiten/jiten-kanji-words-actions';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import type { JitenKanjiWordsPage } from '../../src/reader/dictionaries/jiten';
import { bindPrivateCommandCapability } from '../../src/reader/dom/private-command-capabilities';

function jitenWordsRoot(): {
    root: HTMLElement;
    filter: HTMLButtonElement;
    more: HTMLButtonElement;
    grid: HTMLElement;
} {
    const root = document.createElement('section');
    root.className = 'jpdb-reader-jiten-kanji';
    root.innerHTML = `
        <button
            type="button"
            data-action="jiten-kanji-reading"
            data-jiten-kanji-character="学"
            data-jiten-kanji-reading="がく"
            aria-pressed="false"
        >がく</button>
        <div class="jpdb-reader-jiten-kanji-vocabulary">
            <span data-existing>existing</span>
            <button
                type="button"
                data-action="jiten-kanji-more"
                data-jiten-kanji-character="学"
                data-jiten-kanji-page="2"
                data-jiten-kanji-page-size="9"
            >more</button>
        </div>
    `;
    document.body.append(root);
    const filter = root.querySelector<HTMLButtonElement>('[data-action="jiten-kanji-reading"]')!;
    const more = root.querySelector<HTMLButtonElement>('[data-action="jiten-kanji-more"]')!;
    bindPrivateCommandCapability(filter, {
        kind: 'jiten-kanji-words',
        action: 'filter',
        character: '学',
        reading: 'がく',
    });
    bindPrivateCommandCapability(more, {
        kind: 'jiten-kanji-words',
        action: 'more',
        character: '学',
        reading: '',
        page: 2,
        pageSize: 9,
    });
    return {
        root,
        filter,
        more,
        grid: root.querySelector('.jpdb-reader-jiten-kanji-vocabulary')!,
    };
}

function context(lookupKanjiWords: JitenKanjiWordsActionContext['lookupKanjiWords']): JitenKanjiWordsActionContext {
    return {
        lookupKanjiWords,
        language: () => 'en',
    };
}

afterEach(() => {
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
});

describe('Jiten kanji word actions', () => {
    it('routes shared filter and paging commands and treats an unavailable provider as inert', async () => {
        const lookupKanjiWords = vi.fn(async () => null);
        const fixture = jitenWordsRoot();

        await runJitenKanjiWordsAction(fixture.filter, 'filter', context(lookupKanjiWords));
        await runJitenKanjiWordsAction(fixture.more, 'more', context(lookupKanjiWords));
        await runJitenKanjiWordsAction(fixture.more, 'more', null);

        expect(lookupKanjiWords).toHaveBeenCalledTimes(2);
    });

    it('does not call the Japanese character provider for stale controls on another target', async () => {
        setActiveLearningTargetLanguage('zh');
        const lookupKanjiWords = vi.fn(async () => null);
        const fixture = jitenWordsRoot();

        await filterJitenKanjiWords(fixture.filter, context(lookupKanjiWords));
        await loadMoreJitenKanjiWords(fixture.more, context(lookupKanjiWords));

        expect(lookupKanjiWords).not.toHaveBeenCalled();
        expect(fixture.grid.textContent).toContain('existing');
        expect(fixture.filter.getAttribute('aria-pressed')).toBe('false');
        expect(fixture.filter.disabled).toBe(false);
        expect(fixture.more.disabled).toBe(false);
    });

    it('drops a filtered response when the target changes while Jiten is in flight', async () => {
        let resolve!: (page: JitenKanjiWordsPage | null) => void;
        const lookupKanjiWords = vi.fn(() => new Promise<JitenKanjiWordsPage | null>(settle => { resolve = settle; }));
        const afterRender = vi.fn();
        const fixture = jitenWordsRoot();
        const pending = filterJitenKanjiWords(fixture.filter, {
            ...context(lookupKanjiWords),
            afterRender,
        });
        expect(fixture.filter.disabled).toBe(true);

        setActiveLearningTargetLanguage('zh');
        resolve({
            items: [],
            total: 0,
            pageSize: 9,
            offset: 0,
        });
        await pending;

        expect(fixture.grid.textContent).toContain('existing');
        expect(afterRender).not.toHaveBeenCalled();
        expect(fixture.filter.disabled).toBe(false);
    });
});
