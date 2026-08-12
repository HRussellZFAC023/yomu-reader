import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import {
    hydrateYomuLocalSrsCardStates,
    repaintYomuLocalSrsRenderedWords,
} from '../../src/reader/srs/local-yomu-state';
import {
    readRenderedWordPrivateState,
    registerRenderedWordPrivateState,
    renderedWordPrivateValue,
} from '../../src/reader/dom/rendered-word-private-state';
import type { YomuSrsLookupItem, YomuSrsReviewable } from '../../src/reader/srs/types';

function card(expression: string, reading: string, overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 10,
        sid: 20,
        rid: 0,
        spelling: expression,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        provisionalState: true,
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
        ...overrides,
    };
}

function token(value: JPDBCard): JPDBToken {
    return { card: value, start: 0, end: value.spelling.length, length: value.spelling.length, rubies: [], pitchClass: '', sentence: value.spelling };
}

function reviewable(expression: string, reading: string, state: JPDBCard['cardState']): YomuSrsReviewable {
    return {
        providerId: 'yomu-local',
        providerCardId: `${expression}\u0000${reading}`,
        kind: 'vocabulary',
        expression,
        reading,
        meanings: [],
        state,
        dueAt: 2_000_000,
        lastReviewAt: 1_000_000,
    };
}

describe('Academy local SRS state hydration', () => {
    it('performs one batch lookup and applies authoritative state to every semantic occurrence', async () => {
        const first = card('読む', 'よむ', { vid: 1, sid: 1 });
        const duplicate = card('読む', 'よむ', { vid: 2, sid: 2, source: 'jiten' });
        const otherReading = card('生', 'せい');
        const lookupCards = vi.fn(async (_items: readonly YomuSrsLookupItem[]) => [reviewable('読む', 'よむ', ['due'])]);

        const parsed = await hydrateYomuLocalSrsCardStates([
            [token(first), token(duplicate), token(otherReading)],
        ], { lookupCards });

        expect(lookupCards).toHaveBeenCalledTimes(1);
        expect(lookupCards.mock.calls[0]?.[0]).toHaveLength(2);
        expect(parsed[0]?.[0]?.card).toMatchObject({ cardState: ['due'], reviewSource: 'yomu-local', dueAt: 2_000_000, lastReviewAt: 1_000_000 });
        expect(parsed[0]?.[1]?.card).toMatchObject({ cardState: ['due'], reviewSource: 'yomu-local' });
        expect(parsed[0]?.[0]?.card.provisionalState).toBeUndefined();
        expect(parsed[0]?.[2]?.card).toMatchObject({ cardState: ['not-in-deck'], provisionalState: true });
    });

    it('repaints every matching rendered word by expression and reading without changing provider ids', () => {
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '#ffffff' } as never);
        document.body.innerHTML = `
            <span class="jpdb-reader-word jpdb-not-in-deck" data-expression="読む" data-reading="よむ"></span>
            <span class="jpdb-reader-word jpdb-known" data-expression="読む" data-reading="よむ"></span>
            <span class="jpdb-reader-word jpdb-new" data-expression="生" data-reading="せい"></span>`;
        const [first, second, other] = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
        registerRenderedWordPrivateState(first!, { vid: '1', sid: '1', cardSource: 'local', cardState: 'not-in-deck' });
        registerRenderedWordPrivateState(second!, { vid: '99', sid: '4', cardSource: 'jiten', cardState: 'known' });
        registerRenderedWordPrivateState(other!, { vid: '3', sid: '3', cardSource: 'local', cardState: 'new' });
        const academy = card('読む', 'よむ', { cardState: ['due'], reviewSource: 'yomu-local', provisionalState: false });

        expect(repaintYomuLocalSrsRenderedWords(academy)).toBe(2);
        const matches = [...document.querySelectorAll<HTMLElement>('[data-expression="読む"]')];
        expect(matches.every(word => word.classList.contains('jpdb-due') && !word.classList.contains('yomu-local-due'))).toBe(true);
        expect(matches.map(word => {
            const state = readRenderedWordPrivateState(word);
            return [state?.vid, state?.sid];
        })).toEqual([['1', '1'], ['99', '4']]);
        expect(matches.every(word => {
            const state = readRenderedWordPrivateState(word);
            return state?.srsProvider === 'yomu-local' && state.stateProvenance === 'authoritative';
        })).toBe(true);
        expect(renderedWordPrivateValue(other!, 'cardState')).toBe('new');
        getContext.mockRestore();
    });
});
