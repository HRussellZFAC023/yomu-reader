import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnkiExistingNote, AnkiLookupResult } from '../../src/reader/anki';
import { renderAnkiExistingSection } from '../../src/reader/anki/render';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { CardPopoverRenderer } from '../../src/reader/cards/popover-renderer';
import { setInnerHtml, renderTokensToHtml } from '../../src/reader/dom';
import {
    readRenderedWordPrivateState,
    renderedWordPrivateValue,
} from '../../src/reader/dom/rendered-word-private-state';
import { renderedWordElementKey } from '../../src/reader/dom/rendered-word-state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { testCardActionController } from './jpdb/fixtures';

const PRIVATE_DECK = 'Private::Deck Ω';
const PRIVATE_MODEL = 'Private Model Ω';
const PRIVATE_QUESTION = 'Private question Ω';
const PRIVATE_ANSWER = 'Private answer Ω';
const PRIVATE_FIELD = 'Private field Ω';

const settings: ReaderSettings = {
    ...DEFAULT_SETTINGS,
    interfaceLanguage: 'en',
    ankiEnabled: true,
    ankiSectionEnabled: true,
    enableReviews: true,
    jpdbMiningEnabled: true,
    apiKey: 'private-jpdb-key',
    miningDeck: 'private-jpdb-deck-id',
    ankiDeck: PRIVATE_DECK,
    ankiModel: PRIVATE_MODEL,
};

const card: JPDBCard = {
    vid: 112_233,
    sid: 44,
    rid: 55,
    spelling: '機密語',
    reading: 'きみつご',
    frequencyRank: 99,
    partOfSpeech: ['n'],
    meanings: [{ glosses: ['confidential word'], partOfSpeech: ['n'] }],
    cardState: ['due'],
    pitchAccent: ['LHHH'],
    wordWithReading: null,
    source: 'jpdb',
};

const note: AnkiExistingNote = {
    noteId: 909_090,
    modelName: PRIVATE_MODEL,
    deckNames: [PRIVATE_DECK],
    cardIds: [808_080],
    primaryCardId: 808_080,
    state: 'due',
    fields: { Secret: PRIVATE_FIELD },
    renderedCards: [{
        cardId: 808_080,
        deckName: PRIVATE_DECK,
        cardName: 'Private template Ω',
        question: `<div>${PRIVATE_QUESTION}</div>`,
        answer: `<div>${PRIVATE_ANSWER}</div>`,
    }],
    tags: ['private-tag'],
    reps: 99,
    lapses: 7,
    reviewGradeIntervals: {
        easy: {
            buttonLabel: '1 private month',
            intervalLabel: '1 private month',
            label: '1 private month',
            source: 'anki-next-reviews',
        },
    },
};

const lookup: AnkiLookupResult = { state: 'due', notes: [note], primary: note, trusted: true };

beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal('location', { href: 'https://www.youtube.com/watch?v=hostile' });
});

describe('offhost account-data privacy', () => {
    it('replaces full Anki account detail with one provider-neutral owned-surface launcher', () => {
        const offhost = renderAnkiExistingSection(lookup, null, settings, { trustedAccountDataSurface: false });
        const root = document.createElement('div');
        setInnerHtml(root, offhost);

        expectAccountSecretsAbsent(root);
        const launcher = root.querySelector<HTMLButtonElement>('[data-yomu-owned-study-launcher]');
        expect(launcher).not.toBeNull();
        expect(launcher?.hasAttribute('href')).toBe(false);
        expect(launcher?.dataset).not.toHaveProperty('url');
        expect(root.querySelectorAll('[data-account-private-launcher]')).toHaveLength(1);

        const trusted = document.createElement('div');
        setInnerHtml(trusted, renderAnkiExistingSection(lookup, null, settings, { trustedAccountDataSurface: true }));
        expect(trusted.textContent).toContain(PRIVATE_QUESTION);
        expect(trusted.textContent).toContain(PRIVATE_ANSWER);
        expect(trusted.textContent).toContain(PRIVATE_DECK);
        expect(trusted.innerHTML).toContain('data-anki-note-id="909090"');
        expect(trusted.innerHTML).toContain('data-anki-card-id="808080"');
    });

    it('keeps popup dictionary content and generic grading while removing provider/deck/account selectors and status', () => {
        const offhostRenderer = popupRenderer(false);
        const offhost = document.createElement('div');
        setInnerHtml(offhost, offhostRenderer.render(card, '機密語を読む。', 'modal', richRenderData()));

        expect(offhost.textContent).toContain('機密語');
        expectAccountSecretsAbsent(offhost);
        expect(offhost.querySelector('.jpdb-reader-provider-status')).toBeNull();
        expect(offhost.querySelector('.jpdb-reader-add-deck-select')).toBeNull();
        expect(offhost.querySelector('[data-review-target-select]')).toBeNull();
        expect(offhost.querySelector('[data-review-target], [data-newtab-review-target]')).toBeNull();
        expect(offhost.querySelector('[data-deck-source], [data-deck-id]')).toBeNull();
        expect(offhost.querySelector('[data-anki-note-id], [data-anki-card-id]')).toBeNull();
        expect(offhost.querySelector('.jpdb-reader-grade-interval')).toBeNull();
        expect(offhost.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')).not.toHaveLength(0);
        expect(offhost.querySelector('[data-account-private-launcher]')).not.toBeNull();

        const trusted = document.createElement('div');
        setInnerHtml(trusted, popupRenderer(true).render(card, '機密語を読む。', 'modal', richRenderData()));
        expect(trusted.querySelector('.jpdb-reader-provider-status')).not.toBeNull();
        expect(trusted.querySelector('.jpdb-reader-add-deck-select')).not.toBeNull();
        expect(trusted.querySelector('[data-review-target-select]')).not.toBeNull();
        expect(trusted.querySelector('[data-anki-card-id="808080"]')).not.toBeNull();
        expect(trusted.textContent).toContain(PRIVATE_DECK);
    });

    it('mines to the private default deck without reading deck authority from hostile DOM', async () => {
        const addToDeck = vi.fn(async () => undefined);
        const controller = testCardActionController({
            getSettings: () => settings,
            jpdb: { addToDeck } as never,
        });
        const neutralButton = document.createElement('button');

        await expect(controller.perform(
            { kind: 'card-action', action: 'add-default' },
            neutralButton,
            card,
            '機密語を読む。',
        )).resolves.toBe(true);

        expect(neutralButton.attributes).toHaveLength(0);
        expect(addToDeck).toHaveBeenCalledWith('private-jpdb-deck-id', card, '機密語を読む。');
    });

    it('keeps annotated-word identity private offhost while preserving generic state and membership styling', () => {
        const privateCard: JPDBCard = {
            ...card,
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 112_233,
            jitenReadingIndex: 44,
            deckNames: [PRIVATE_DECK],
            sourceDeckName: PRIVATE_DECK,
        };
        const token = {
            card: privateCard,
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '機密語',
        };
        const offhostHtml = renderTokensToHtml('機密語', [token], settings);
        expect(offhostHtml).not.toContain('112233');
        expect(offhostHtml).not.toContain(PRIVATE_DECK);
        expect(offhostHtml).not.toContain('data-card-source');
        expect(offhostHtml).not.toContain('data-state-provenance');

        setInnerHtml(document.body, offhostHtml);
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.outerHTML).not.toContain('data-yomu-private-token');
        expect(word.outerHTML).not.toContain('112233');
        expect(word.outerHTML).not.toContain(PRIVATE_DECK);
        expect(word.outerHTML).not.toContain('jiten-due');
        expect(word.outerHTML).not.toContain('jiten-deck');
        expect(word.classList.contains('jpdb-due')).toBe(true);
        expect(word.classList.contains('yomu-deck-member')).toBe(true);
        expect(renderedWordElementKey(word)).toBe('112233:44');
        expect(renderedWordPrivateValue(word, 'cardSource')).toBe('jiten');
        expect(renderedWordPrivateValue(word, 'stateProvenance')).toBe('authoritative');

        const hostileClone = word.cloneNode(true) as HTMLElement;
        expect(readRenderedWordPrivateState(hostileClone)).toBeUndefined();

        vi.stubGlobal('location', { href: 'https://yomureader.com/study/' });
        setInnerHtml(document.body, renderTokensToHtml('機密語', [token], settings));
        const trustedWord = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(trustedWord.dataset.vid).toBe('112233');
        expect(trustedWord.dataset.sid).toBe('44');
        expect(trustedWord.dataset.cardSource).toBe('jiten');
        expect(trustedWord.dataset.stateProvenance).toBe('authoritative');
        expect(trustedWord.dataset.deckNames).toBe(PRIVATE_DECK);
        expect(trustedWord.classList.contains('jiten-due')).toBe(true);
    });
});

function popupRenderer(trusted: boolean): CardPopoverRenderer {
    return new CardPopoverRenderer({
        getSettings: () => settings,
        isJpdbBackedCard: () => true,
        renderWordHistory: () => '',
        renderWordPills: () => '',
        renderDefinitionSources: (_card, _entries, _sentence, _jpdb, _jiten, _bunpro, extraSections = {}) => Object.values(extraSections).join(''),
        dictionarySourceAttributes: (_key, initiallyExpanded = true) => initiallyExpanded ? 'open' : '',
        dictionaryLabel: name => name,
        accountDataSurfaceTrusted: () => trusted,
    });
}

function richRenderData() {
    return {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: lookup,
        jpdbDecks: [{ id: 'private-jpdb-deck-id', name: 'Private JPDB Deck Ω' }],
        jitenDecks: [],
        ankiDecks: [PRIVATE_DECK],
        jpdbVocabularyInfo: null,
        jitenVocabularyInfo: null,
        loading: false,
    };
}

function expectAccountSecretsAbsent(root: HTMLElement): void {
    const serialized = root.outerHTML;
    for (const secret of [
        PRIVATE_DECK,
        PRIVATE_MODEL,
        PRIVATE_QUESTION,
        PRIVATE_ANSWER,
        PRIVATE_FIELD,
        '909090',
        '808080',
        'private-tag',
        '99 reviews',
        '7 lapses',
        '1 private month',
    ]) {
        expect(serialized).not.toContain(secret);
    }
}
