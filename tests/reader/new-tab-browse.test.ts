import { describe, expect, it } from 'vitest';

import { browseStateCounts, filterBrowseCards, renderBrowseChips, renderBrowseList } from '../../src/reader/newtab/browse-view';
import type { CardState, JPDBCard } from '../../src/reader/app/types';

function card(spelling: string, states: CardState[], overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: spelling.length * 100 + states.length,
        sid: 0,
        rid: 0,
        spelling,
        reading: spelling,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: [`${spelling} meaning`], partOfSpeech: [] }],
        cardState: states,
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

describe('study-page card browser (SH-3)', () => {
    const pool = [
        card('読む', ['known'], { vid: 1, reading: 'よむ', frequencyRank: 590 }),
        card('書く', ['due'], { vid: 2, reading: 'かく' }),
        card('話す', ['learning'], { vid: 3, reading: 'はなす' }),
        card('聞く', ['new'], { vid: 4, reading: 'きく' }),
        card('見る', ['blacklisted'], { vid: 5, reading: 'みる' }),
    ];

    it('counts primary states for the filter chips', () => {
        const counts = browseStateCounts(pool);
        expect(counts.get('known')).toBe(1);
        expect(counts.get('due')).toBe(1);
        expect(counts.get('blacklisted')).toBe(1);
    });

    it('filters by state and by spelling/reading query', () => {
        expect(filterBrowseCards(pool, 'due', '').map(c => c.spelling)).toEqual(['書く']);
        expect(filterBrowseCards(pool, 'all', 'よむ').map(c => c.spelling)).toEqual(['読む']);
        expect(filterBrowseCards(pool, 'known', 'かく')).toHaveLength(0);
    });

    it('renders chips in JPDB Show-only order with counts and marks the active one', () => {
        const chips = renderBrowseChips(pool, 'due', 'en', 'All');
        const labels = [...chips.querySelectorAll('button')].map(button => button.textContent);
        expect(labels[0]).toBe('All 5');
        // new before learning before due (JPDB deck-browse order), zero-count states omitted
        expect(labels.join('|')).toMatch(/New 1.*Learning 1.*Due 1/);
        const active = chips.querySelector('[aria-pressed="true"]');
        expect(active?.textContent).toContain('Due');
    });

    it('renders rows with state badge, frequency and lookup dataset, and paginates past 50', () => {
        const many = Array.from({ length: 60 }, (_, index) => card(`語${index}`, ['known'], { vid: 1000 + index }));
        const list = renderBrowseList(many, 0, 'en', {
            empty: 'none',
            previous: 'Previous page',
            next: 'Next page',
            showing: (from, to, total) => `${from}-${to} of ${total}`,
        });
        expect(list.querySelectorAll('.jpdb-reader-newtab-browse-row')).toHaveLength(50);
        expect(list.textContent).toContain('1-50 of 60');
        const pager = [...list.querySelectorAll('[data-newtab-action="browse-page"]')];
        expect(pager).toHaveLength(2);
        expect((pager[0] as HTMLButtonElement).disabled).toBe(true);
        expect((pager[1] as HTMLButtonElement).dataset.browsePage).toBe('1');

        const single = renderBrowseList([pool[0]], 0, 'en', {
            empty: 'none', previous: 'p', next: 'n', showing: () => '',
        });
        const row = single.querySelector<HTMLElement>('.jpdb-reader-newtab-browse-row')!;
        expect(row.dataset.newtabAction).toBe('browse-card');
        expect(row.dataset.expression).toBe('読む');
        expect(row.dataset.reading).toBe('よむ');
        expect(row.textContent).toContain('Top 590');
        expect(row.querySelector('.jpdb-reader-state-dot.jpdb-known')).not.toBeNull();
    });

    it('shows the empty message when the filter matches nothing', () => {
        const list = renderBrowseList([], 0, 'en', { empty: 'No cards match this filter yet.', previous: 'p', next: 'n', showing: () => '' });
        expect(list.textContent).toBe('No cards match this filter yet.');
    });
});
