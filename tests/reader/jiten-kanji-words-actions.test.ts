import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    runJitenKanjiWordsAction,
    type JitenKanjiWordsActionContext,
} from '../../src/reader/jiten/jiten-kanji-words-actions';
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
});
