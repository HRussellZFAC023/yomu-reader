import { describe, expect, it } from 'vitest';

import { browseStateCounts, filterBrowseCards, renderBrowseChips, renderBrowseControls, renderBrowseList, sortBrowseCards } from '../../src/reader/newtab/browse-view';
import { renderSearchWordResults } from '../../src/reader/newtab/search-view';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
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

    it('filters by state sets and by spelling/reading query', () => {
        expect(filterBrowseCards(pool, new Set(['due']), '').map(c => c.spelling)).toEqual(['書く']);
        expect(filterBrowseCards(pool, new Set(), 'よむ').map(c => c.spelling)).toEqual(['読む']);
        expect(filterBrowseCards(pool, new Set(['known']), 'かく')).toHaveLength(0);
        // Multi-select chips: due OR learning.
        expect(filterBrowseCards(pool, new Set(['due', 'learning']), '').map(c => c.spelling)).toEqual(['書く', '話す']);
    });

    it('ranks prefix matches ahead of substring matches (typing よ)', () => {
        const extended = [...pool, card('およぐ', ['known'], { vid: 9, reading: 'およぐ' })];
        const results = filterBrowseCards(extended, new Set(), 'よ');
        expect(results.map(c => c.spelling)).toEqual(['読む', 'およぐ']);
    });

    it('sorts by queue order (due_at), alphabetically, and by frequency, with descending flips', () => {
        const sortable = [
            card('一', ['due'], { vid: 11, reading: 'いち', dueAt: 300, frequencyRank: 30 }),
            card('二', ['due'], { vid: 12, reading: 'に', dueAt: 100, frequencyRank: 10 }),
            card('三', ['new'], { vid: 13, reading: 'さん', dueAt: null, frequencyRank: 20 }),
        ];
        expect(sortBrowseCards(sortable, 'queue', false).map(c => c.spelling)).toEqual(['二', '一', '三']);
        expect(sortBrowseCards(sortable, 'queue', true).map(c => c.spelling)).toEqual(['三', '一', '二']);
        expect(sortBrowseCards(sortable, 'alpha', false).map(c => c.spelling)).toEqual(['一', '三', '二']);
        expect(sortBrowseCards(sortable, 'frequency', false).map(c => c.spelling)).toEqual(['二', '三', '一']);
    });

    it('renders compact sort/direction/select controls', () => {
        const controls = renderBrowseControls('queue', false, false, {
            sortLabel: 'Sort', sortQueue: 'Queue order', sortAlpha: 'A→Z', sortFrequency: 'Frequency',
            directionAscending: 'Ascending', directionDescending: 'Descending', select: 'Select',
        });
        const select = controls.querySelector<HTMLSelectElement>('[data-newtab-action="browse-sort"]')!;
        expect([...select.options].map(option => option.value)).toEqual(['queue', 'alpha', 'frequency']);
        expect(controls.querySelector('[data-newtab-action="browse-sort-direction"]')?.getAttribute('aria-pressed')).toBe('false');
        expect(controls.querySelector('[data-newtab-action="browse-select-mode"]')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('renders chips in JPDB Show-only order with counts and marks the active one', () => {
        const chips = renderBrowseChips(pool, new Set(['due']), 'en', 'All');
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

    it('respects furigana mode exactly in search result terms', () => {
        const difficult = card('鬱', ['not-in-deck'], { reading: 'うつ' });
        const easy = card('日本語', ['not-in-deck'], { reading: 'にほんご' });
        const off = renderSearchWordResults([difficult], searchContext('off'));
        const difficultOnly = renderSearchWordResults([difficult, easy], searchContext('difficult-kanji'));
        const all = renderSearchWordResults([easy], searchContext('all'));

        expect(off.querySelector('rt')).toBeNull();
        expect(difficultOnly.querySelector('[data-expression="鬱"] rt')?.textContent).toBe('うつ');
        expect(difficultOnly.querySelector('[data-expression="日本語"] rt')).toBeNull();
        expect(all.querySelector('[data-expression="日本語"] rt')?.textContent).toBe('にほんご');
    });

    it('renders search result terms with pitch classes when pitch data is already available', () => {
        const result = renderSearchWordResults([
            card('学習能力', ['not-in-deck'], {
                vid: 1932050,
                reading: 'がくしゅうのうりょく',
                pitchAccent: ['LHHHHHHHH'],
            }),
        ], searchContext('all'));

        const word = result.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="学習能力"]');
        expect(word?.dataset.pitchClass).toBe('heiban');
        expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(word?.classList.contains('jpdb-pitch-unknown')).toBe(false);
        expect(word?.querySelector('rt')?.textContent).toBe('がくしゅうのうりょく');
    });
});

function searchContext(furiganaMode: typeof DEFAULT_SETTINGS.furiganaMode) {
    return {
        language: 'en' as const,
        settings: { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false, furiganaMode },
        text: (key: 'words' | 'kanji' | 'dictionary') => key,
    };
}
