import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard } from '../../src/reader/app/types';
import { primaryCardState } from '../../src/reader/cards/state';
import {
    registerRenderedWordPrivateState,
    renderedWordPrivateStateForCard,
} from '../../src/reader/dom/rendered-word-private-state';

// Clicking an annotated word inside the settings dialog used to show the
// cached parse skeleton (reading/pitch, no meanings) — a popup with search
// pills and an empty body. showWord must route such clicks through the fresh
// uncached-word lookup instead.

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

interface ShowWordInternals {
    parser: { cacheCards(cards: JPDBCard[]): void };
    showWord(word: HTMLElement, options?: unknown): Promise<void>;
    lookupUncachedPageWord: (word: HTMLElement, options: unknown, scope: unknown) => Promise<boolean>;
    showRenderedWordCard: (...args: unknown[]) => Promise<void>;
}

function settingsWordFixture(card: JPDBCard): { internals: ShowWordInternals; word: HTMLElement } {
    document.body.innerHTML = `
        <form class="jpdb-reader-settings" data-jpdb-reader-root>
            <label>
                <span class="jpdb-reader-settings-label-text">
                    <span class="jpdb-reader-word" data-vid="${card.vid}" data-sid="${card.sid}"
                        data-expression="${card.spelling}" data-sentence="ポップアップ${card.spelling}">${card.spelling}</span>
                </span>
            </label>
        </form>
    `;
    const app = new ReaderApp();
    const internals = app as unknown as ShowWordInternals;
    internals.parser.cacheCards([card]);
    const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
    registerRenderedWordPrivateState(word, renderedWordPrivateStateForCard(card, primaryCardState(card.cardState)));
    return { internals, word };
}

function settingsCard(meanings: JPDBCard['meanings']): JPDBCard {
    return {
        vid: 42,
        sid: 0,
        rid: 0,
        spelling: '表示',
        reading: 'ひょうじ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings,
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
    };
}

describe('settings word click lookup', () => {
    it('routes a meanings-less settings card through the fresh uncached-word lookup', async () => {
        const { internals, word } = settingsWordFixture(settingsCard([]));
        const reroute = vi.fn(async () => true);
        const showCard = vi.fn(async () => undefined);
        internals.lookupUncachedPageWord = reroute;
        internals.showRenderedWordCard = showCard;

        await internals.showWord(word, { trigger: 'click', userGesture: true });

        expect(reroute).toHaveBeenCalledTimes(1);
        expect(reroute).toHaveBeenCalledWith(
            word,
            expect.objectContaining({ stackOverSettings: true, trigger: 'click', userGesture: true }),
            expect.objectContaining({
                target: expect.objectContaining({ language: 'ja', interfaceVersion: 10 }),
                isCurrent: expect.any(Function),
            }),
        );
        expect(showCard).not.toHaveBeenCalled();
    });

    it('still shows the cached card directly when it carries meanings', async () => {
        const { internals, word } = settingsWordFixture(settingsCard([
            { partOfSpeech: [], glosses: ['display'] } as unknown as JPDBCard['meanings'][number],
        ]));
        const reroute = vi.fn(async () => true);
        const showCard = vi.fn(async () => undefined);
        internals.lookupUncachedPageWord = reroute;
        internals.showRenderedWordCard = showCard;

        await internals.showWord(word, { trigger: 'click', userGesture: true });

        expect(reroute).not.toHaveBeenCalled();
        expect(showCard).toHaveBeenCalled();
    });
});
