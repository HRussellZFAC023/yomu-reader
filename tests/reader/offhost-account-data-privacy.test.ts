import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnkiExistingNote, AnkiLookupResult } from '../../src/reader/anki';
import { applyAnkiLookupToRenderedWord } from '../../src/reader/app/dom-helpers';
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
import { readCardCommandCapability, readCardUiCommandCapability, type CardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { noteScannedShadowRoot } from '../../src/reader/dom/shadow-scan-registry';
import { refreshReaderWordContrast } from '../../src/reader/dom/word-contrast';
import { reviewShortcutButton } from '../../src/reader/dom/review-shortcuts';
import { applyReaderTheme, resetReaderRootClassGuardForTests } from '../../src/reader/theme/reader-theme';
import { testCardActionController } from './jpdb/fixtures';
import { showReaderToast } from '../../src/reader/ui/toast';
import { userFacingError, userFacingErrorText } from '../../src/reader/app/user-facing-errors';
import { LocalYomuSrsStorageError } from '../../src/reader/srs/local-yomu';

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
    it.each(['removed', 'cloned', 'other-group'])('rejects click and keyboard review with a %s selector and an unhidden alternate row', async replacement => {
        const jitenSettings = { ...settings, apiKey: '', jitenApiKey: 'private-jiten-key' };
        const jitenCard: JPDBCard = { ...card, source: 'jiten', reviewSource: 'jiten-api' };
        const root = document.createElement('div');
        setInnerHtml(root, popupRenderer(true, jitenSettings).render(jitenCard, '', 'modal', richRenderData()));
        const button = root.querySelector<HTMLButtonElement>('[data-review-grade-profile="anki"] [data-grade="hard"]')!;
        const selector = root.querySelector<HTMLSelectElement>('[data-review-target-select]')!;
        if (replacement === 'removed') selector.remove();
        else if (replacement === 'cloned') {
            const clone = selector.cloneNode(false) as HTMLSelectElement;
            clone.append(...selector.options);
            selector.replaceWith(clone);
        } else {
            const other = document.createElement('div');
            setInnerHtml(other, popupRenderer(true, jitenSettings).render(jitenCard, '', 'modal', richRenderData()));
            selector.replaceWith(other.querySelector('[data-review-target-select]')!);
        }
        button.closest<HTMLElement>('[data-review-target-row]')!.hidden = false;
        const reviewCard = vi.fn(async () => undefined);
        const answerCard = vi.fn(async () => undefined);
        const controller = testCardActionController({ getSettings: () => jitenSettings, jiten: { reviewCard } as never, anki: { answerCard } as never });
        const click = controller.perform(readCardCommandCapability(button), button, jitenCard).catch(() => false);
        const keyboard = reviewShortcutButton(root, new KeyboardEvent('keydown', { key: '2' }), jitenSettings);
        if (keyboard) await controller.perform(readCardCommandCapability(keyboard), keyboard, jitenCard).catch(() => false);
        await click;
        expect(reviewCard).not.toHaveBeenCalled();
        expect(answerCard).not.toHaveBeenCalled();
        expect(keyboard).toBeUndefined();
    });

    it('renders only the initial profile when switching is disabled, and still reviews without a selector', async () => {
        const jitenSettings = { ...settings, apiKey: '', jitenApiKey: 'private-jiten-key' };
        const renderer = popupRenderer(true, jitenSettings) as unknown as {
            renderTargetedReviewButtons(targets: unknown[], language: string, canSwitch: boolean, provider: null): { gutter: string; buttons: string };
        };
        const root = document.createElement('div');
        root.className = 'jpdb-reader-actions';
        const controls = renderer.renderTargetedReviewButtons([
            { id: 'jiten', kind: 'jiten', gradeProfile: 'jiten', label: 'Grades Jiten', shortLabel: 'Jiten' },
            { id: 'anki', kind: 'anki', gradeProfile: 'anki', label: 'Grades Anki', shortLabel: 'Anki', ankiCardId: 404 },
        ], 'en', false, null);
        setInnerHtml(root, `${controls.gutter}${controls.buttons}`);
        expect(root.querySelector('select')).toBeNull();
        expect(root.querySelectorAll('[data-review-target-row]')).toHaveLength(1);
        expect(root.querySelector('[data-grade="something"]')).toBeNull();
        const button = reviewShortcutButton(root, new KeyboardEvent('keydown', { key: '2' }), jitenSettings)!;
        const reviewCard = vi.fn(async () => undefined);
        const controller = testCardActionController({ getSettings: () => jitenSettings, jiten: { reviewCard } as never });
        const jitenCard: JPDBCard = { ...card, source: 'jiten', reviewSource: 'jiten-api' };
        await controller.perform(readCardCommandCapability(button), button, jitenCard);
        expect(reviewCard).toHaveBeenCalledTimes(1);
        expect(reviewCard).toHaveBeenCalledWith(jitenCard, 'hard');
    });
    it('rejects a privately bound off-target row even when the host unhides and relabels it', async () => {
        const jitenSettings = { ...settings, apiKey: '', jitenApiKey: 'private-jiten-key' };
        const jitenCard: JPDBCard = { ...card, source: 'jiten', reviewSource: 'jiten-api' };
        const root = document.createElement('div');
        setInnerHtml(root, popupRenderer(true, jitenSettings).render(jitenCard, '', 'modal', richRenderData()));
        const button = root.querySelector<HTMLButtonElement>('[data-review-grade-profile="anki"] [data-grade="hard"]')!;
        const row = button.closest<HTMLElement>('[data-review-target-row]')!;
        row.hidden = false;
        row.dataset.reviewGradeProfile = 'jiten';
        button.dataset.grade = 'easy';
        const reviewCard = vi.fn();
        const answerCard = vi.fn();
        const controller = testCardActionController({ getSettings: () => jitenSettings, jiten: { reviewCard } as never, anki: { answerCard } as never });
        await expect(controller.perform(readCardCommandCapability(button), button, jitenCard)).rejects.toThrow();
        expect(reviewCard).not.toHaveBeenCalled();
        expect(answerCard).not.toHaveBeenCalled();
    });
    it.each([false, true])('renders the Jiten scale with private commands on trusted=%s surfaces', trusted => {
        const jitenSettings = { ...settings, apiKey: '', jitenApiKey: 'private-jiten-key', ankiEnabled: false };
        const root = document.createElement('div');
        setInnerHtml(root, popupRenderer(trusted, jitenSettings).render({ ...card, source: 'jiten', reviewSource: 'jiten-api' }, '', 'modal', richRenderData()));
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];
        expect(buttons.map(button => button.textContent)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
        expect(['1', '2', '3', '4', '5'].map(key => readCardCommandCapability(reviewShortcutButton(root, new KeyboardEvent('keydown', { key }), jitenSettings))?.grade))
            .toEqual(['nothing', 'hard', 'okay', 'easy', undefined]);
        if (!trusted) {
            expectAccountSecretsAbsent(root);
            expect(root.querySelector('[data-review-target], [data-review-target-select], [data-review-grade-profile], [data-anki-card-id], .jpdb-reader-grade-interval')).toBeNull();
            expect(root.textContent).not.toContain('Grades Jiten');
        }
    });
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
        // "Add to deck…" carries its decks privately; none reaches the page's DOM.
        const addToDeck = offhost.querySelector<HTMLButtonElement>('.jpdb-reader-deck-select');
        expect(addToDeck?.textContent).toBe('Add to deck…');
        expect(readCardUiCommandCapability(addToDeck)?.choices).toContainEqual({ source: 'anki', id: PRIVATE_DECK, label: `Anki: ${PRIVATE_DECK}` });
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
        expect(readCardUiCommandCapability(trusted.querySelector('.jpdb-reader-deck-select'))?.choices?.[0]).toEqual({ source: 'jpdb', id: 'private-jpdb-deck-id', label: 'JPDB: Private JPDB Deck Ω' });
        expect(trusted.querySelector('[data-review-target-select]')).not.toBeNull();
        expect(trusted.querySelector('[data-anki-card-id="808080"]')).not.toBeNull();
        expect(trusted.textContent).toContain(PRIVATE_DECK);
    });

    it('mines to the private default deck without reading deck authority from hostile DOM', async () => {
        const offhost = document.createElement('div');
        setInnerHtml(offhost, popupRenderer(false).render(card, '機密語を読む。', 'modal', richRenderData()));
        const button = offhost.querySelector<HTMLButtonElement>('.jpdb-reader-deck-select')!;
        // A page rewrites what it can see; the decks never were there.
        button.dataset.deckSource = 'anki';
        button.dataset.deckId = 'attacker';
        const [first] = readCardUiCommandCapability(button)?.choices ?? [];
        const addToDeck = vi.fn(async () => undefined);
        const controller = testCardActionController({
            getSettings: () => settings,
            jpdb: { addToDeck } as never,
        });

        await expect(controller.perform(
            { kind: 'card-action', action: 'add', deckSource: first!.source, deckId: first!.id },
            button,
            card,
            '機密語を読む。',
        )).resolves.toBe(true);

        expect(addToDeck).toHaveBeenCalledWith('private-jpdb-deck-id', card, '機密語を読む。');
    });

    // An ordinary page can read every toast. Whatever deck "Add to deck…"
    // reaches, and however it fails, what it reports names no service, deck or
    // Anki state; Study keeps the named copy.
    describe('collection outcomes', () => {
        const keyless = { ...settings, apiKey: '', jitenApiKey: '', jpdbMiningEnabled: false, ankiEnabled: false, yomuLocalSrsEnabled: false, localDictionariesEnabled: false, audioEnabled: false };
        const jitenCard: JPDBCard = { ...card, source: 'jiten', jitenWordId: 77, jitenReadingIndex: 0 };
        const miningContext = async (word: JPDBCard, sentence?: string) => ({ term: word.spelling, sentence: sentence ?? '', sourceKind: 'page' as const, sourceTitle: 'Fixture', sourceUrl: 'https://example.test', updatedAt: 0 });
        const anki = (existing: boolean, addCard: () => Promise<number>) => ({ findExistingCards: async () => existing ? lookup : { state: 'not-in-deck', notes: [], primary: null }, addCard });
        const destinations: Array<[string, Partial<ReaderSettings>, Partial<Parameters<typeof testCardActionController>[0]>, JPDBCard?]> = [
            ['JPDB', { apiKey: 'private-jpdb-key', jpdbMiningEnabled: true }, { jpdb: { addToDeck: async () => undefined } as never }],
            ['Jiten', { jitenApiKey: 'private-jiten-key', jpdbMiningEnabled: true }, { jiten: { addToStudyDeck: async () => undefined, listReaderStudyDecks: async () => [{ userStudyDeckId: 3, name: PRIVATE_DECK, deckType: 2 }] } as never }, jitenCard],
            ['Jiten without a word list', { jitenApiKey: 'private-jiten-key', jpdbMiningEnabled: true }, { jiten: { listReaderStudyDecks: async () => [{ userStudyDeckId: 3, name: PRIVATE_DECK, deckType: 0 }] } as never }, jitenCard],
            ['Jiten without a word list, saved to Academy', { jitenApiKey: 'private-jiten-key', jpdbMiningEnabled: true, yomuLocalSrsEnabled: true }, { jiten: { listReaderStudyDecks: async () => [] } as never, srsAdapters: { 'yomu-local': { id: 'yomu-local', hasCredential: () => true, mine: async () => ({}) } as never } }, jitenCard],
            ['Bunpro', { bunproMiningEnabled: true, bunproFrontendApiToken: 'private-bunpro-token' }, { srsAdapters: { bunpro: { id: 'bunpro', hasCredential: () => true, mine: async () => ({}) } as never } }],
            ['Bunpro without the word', { bunproMiningEnabled: true, bunproFrontendApiToken: 'private-bunpro-token' }, { srsAdapters: { bunpro: { id: 'bunpro', hasCredential: () => true, mine: async () => { throw userFacingError('bunproNoMatchingWord'); } } as never } }],
            ['Academy', { yomuLocalSrsEnabled: true }, { srsAdapters: { 'yomu-local': { id: 'yomu-local', hasCredential: () => true, mine: async () => ({}) } as never } }],
            ['Academy storage failure', { yomuLocalSrsEnabled: true }, { srsAdapters: { 'yomu-local': { id: 'yomu-local', hasCredential: () => true, mine: async () => { throw new LocalYomuSrsStorageError(); } } as never } }],
            ['Anki', { ankiEnabled: true }, { anki: anki(false, async () => 1001) as never }],
            ['Anki, already holding the word', { ankiEnabled: true }, { anki: anki(true, async () => 1001) as never }],
            ['Anki, duplicate', { ankiEnabled: true }, { anki: anki(false, async () => { throw Object.assign(new Error('duplicate'), { name: 'AnkiDuplicateNoteError' }); }) as never }],
            ['Anki unreachable', { ankiEnabled: true }, { anki: anki(false, async () => { throw new Error(`AnkiConnect refused ${PRIVATE_DECK}`); }) as never }],
        ];

        async function saveOnPage(language: 'en' | 'ja', learner: Partial<ReaderSettings>, services: Partial<Parameters<typeof testCardActionController>[0]>, word: JPDBCard, trusted = false, wordLists = [{ id: '3', name: PRIVATE_DECK }]): Promise<string[]> {
            document.body.replaceChildren();
            const chosen = { ...keyless, ...learner, interfaceLanguage: language };
            const controller = testCardActionController({ getSettings: () => chosen, toast: message => showReaderToast(message), resolveMiningContext: miningContext,
                isJpdbBackedCard: candidate => candidate.source === 'jpdb', accountDataSurfaceTrusted: () => trusted, ...services });
            await controller.perform(pickedDeck(chosen, word, wordLists), document.createElement('button'), { ...word }, '機密語を読む。')
                .catch((error: unknown) => showReaderToast(userFacingErrorText(language, 'actionFailed', error)));
            return [...document.querySelectorAll('.jpdb-reader-toast')].map(toast => toast.textContent ?? '');
        }

        // The deck "Add to deck…" offers first, as the learner would pick it.
        // With no word list Jiten is not offered; a picker opened before the
        // learner deleted their last word list still names an empty one.
        function pickedDeck(chosen: ReaderSettings, word: JPDBCard, wordLists: Array<{ id: string; name: string }>): CardCommandCapability {
            const html = popupRenderer(false, chosen).render(word, '機密語を読む。', 'modal', richRenderData({ jitenDecks: wordLists }));
            const root = document.createElement('div');
            setInnerHtml(root, html);
            const [first] = readCardUiCommandCapability(root.querySelector('.jpdb-reader-deck-select'))?.choices ?? [];
            return { kind: 'card-action', action: 'add', deckSource: first?.source ?? 'jiten', deckId: first?.id ?? '' };
        }

        const cases = destinations.flatMap(([name, learner, services, word = card]) => (['en', 'ja'] as const)
            .map(language => ({ name, language, learner, services, word })));
        it.each(cases)('names no service for $name ($language)', async ({ name, language, learner, services, word }) => {
            const toasts = await saveOnPage(language, learner, services, word, false, name.includes('without a word list') ? [] : undefined);
            expect(toasts.length).toBeGreaterThan(0);
            for (const toast of toasts) {
                expect(toast).not.toMatch(/anki|jpdb|jiten|bunpro|wanikani|academy/i);
                expect(toast).not.toContain(PRIVATE_DECK);
                expect(toast).not.toContain('未翻訳');
            }
        });

        it('keeps the named confirmation on Study', async () => {
            expect(await saveOnPage('en', destinations[0]![1], destinations[0]![2], card, true)).toEqual(['Added to JPDB.']);
        });
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

// ADR-0020: a colour source the learner chose must paint. On an ordinary page
// the "Anki" channel paints the word's Anki state through the provider-neutral
// review lane, and only Anki state reaches that lane.
describe('offhost Anki colour channel', () => {
    const READER_WORD_CSS = ['reader-words-ocr.css', 'subtitles-youtube.css']
        .map(file => readFileSync(`src/reader/styles/${file}`, 'utf8'))
        .join('\n');
    const ankiTextColour: ReaderSettings = {
        ...settings,
        wordTextColorSource: 'anki',
        wordHighlightColorSource: 'off',
        wordUnderlineColorSource: 'off',
    };
    const noAnkiColour: ReaderSettings = {
        ...settings,
        wordTextColorSource: 'status',
        wordHighlightColorSource: 'jpdb',
        wordUnderlineColorSource: 'pitch',
        subtitleTextColorSource: 'status',
        subtitleHighlightColorSource: 'jpdb',
        subtitleUnderlineColorSource: 'pitch',
    };
    const jpdbUnknownCard: JPDBCard = { ...card, cardState: ['not-in-deck'] };
    const noAnkiCard: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null, trusted: true };
    const STUDY_URL = 'https://yomureader.com/study/';

    beforeEach(() => {
        const style = document.createElement('style');
        style.textContent = READER_WORD_CSS;
        document.head.append(style);
    });

    afterEach(() => {
        resetReaderRootClassGuardForTests();
        document.head.replaceChildren();
        document.documentElement.removeAttribute('class');
        document.documentElement.removeAttribute('style');
    });

    it('paints an Anki-due word as due without naming the provider', () => {
        applyReaderTheme(ankiTextColour);
        const word = renderedWord(jpdbUnknownCard);

        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        expect(rootValue('--jpdb-reader-state-due-readable')).toMatch(/^#[0-9a-f]{6}$/u);
        expect(wordTextColour(word)).toBe(rootValue('--jpdb-reader-state-due-readable'));
        expect(word.classList.contains('jpdb-due')).toBe(true);
        expect(declaredCustomPropertyNames(word)).toContain('--jpdb-reader-review-color');
        expectPageCarriesNoProviderIdentity(word);
    });

    it('keeps a due word only JPDB holds off the Anki channel', () => {
        applyReaderTheme(ankiTextColour);
        const word = renderedWord(card);

        applyAnkiLookupToRenderedWord(word, noAnkiCard, 'en');

        expect(word.classList.contains('jpdb-due')).toBe(true);
        expect(wordTextColour(word)).toBe('currentColor');
        expectPageCarriesNoProviderIdentity(word);
    });

    it('drops the Anki colour with the Anki state', () => {
        applyReaderTheme(ankiTextColour);
        const word = renderedWord(jpdbUnknownCard);
        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        applyAnkiLookupToRenderedWord(word, noAnkiCard, 'en');

        expect(word.classList.contains('jpdb-due')).toBe(false);
        expect(wordTextColour(word)).toBe('currentColor');
    });

    it('paints an Anki-due subtitle word on the Anki subtitle channel', () => {
        applyReaderTheme({ ...ankiTextColour, subtitleTextColorSource: 'anki', subtitleHighlightColorSource: 'off', subtitleUnderlineColorSource: 'off' });
        const word = renderedWord(jpdbUnknownCard, 'jpdb-subtitle-row-text');

        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        expect(resolveCssVariables(word, 'var(--jpdb-reader-subtitle-text)')).toBe(rootValue('--jpdb-reader-state-due-readable'));
        expectPageCarriesNoProviderIdentity(word);
    });

    it('keeps the Anki colour, unnamed, when a later empty lookup must not clear it', () => {
        applyReaderTheme(ankiTextColour);
        const word = renderedWord(jpdbUnknownCard);
        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        applyAnkiLookupToRenderedWord(word, noAnkiCard, 'en', { preserveExistingEmpty: true });

        expect(wordTextColour(word)).toBe(rootValue('--jpdb-reader-state-due-readable'));
        expectPageCarriesNoProviderIdentity(word);
    });

    // Only a channel that paints the "Anki" source may mark which words Anki
    // holds a card for; otherwise the page could read the learner's collection
    // word by word with nothing on screen.
    it('marks no word with Anki state while no colour channel paints the Anki source', () => {
        applyReaderTheme(noAnkiColour);
        const word = renderedWord(jpdbUnknownCard);

        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        expect(word.className).not.toMatch(/review/u);
        // "Text colour: Status" still shows the state, through the projection
        // every provider shares.
        expect(word.classList.contains('jpdb-due')).toBe(true);
        expect(wordTextColour(word)).toBe(rootValue('--jpdb-reader-state-due-readable'));
    });

    it('keeps a word\'s Anki state through an empty lookup without marking the word on the page', () => {
        applyReaderTheme(noAnkiColour);
        const word = renderedWord(jpdbUnknownCard);
        const pageAttributes = word.getAttributeNames().sort();
        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        applyAnkiLookupToRenderedWord(word, noAnkiCard, 'en', { preserveExistingEmpty: true });

        expect(renderedWordPrivateValue(word, 'ankiState')).toBe('due');
        expect(word.getAttributeNames().sort()).toEqual(pageAttributes);
    });

    it('holds the kept Anki contrast for exactly one refresh', () => {
        applyReaderTheme(ankiTextColour);
        const word = renderedWord(jpdbUnknownCard);
        applyAnkiLookupToRenderedWord(word, lookup, 'en');
        word.style.setProperty('--jpdb-reader-word-accessible-color', '#123456');

        applyAnkiLookupToRenderedWord(word, noAnkiCard, 'en', { preserveExistingEmpty: true });
        refreshReaderWordContrast(document);
        const preserved = word.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        refreshReaderWordContrast(document);

        expect(preserved).toBe('#123456');
        expect(word.style.getPropertyValue('--jpdb-reader-word-accessible-color')).not.toBe('#123456');
    });

    it('repaints the Anki colour when the learner switches the text colour to Anki and back', () => {
        applyReaderTheme(noAnkiColour);
        const word = renderedWord(jpdbUnknownCard);
        const shadowWord = renderedShadowWord(jpdbUnknownCard);
        applyAnkiLookupToRenderedWord(word, lookup, 'en');
        applyAnkiLookupToRenderedWord(shadowWord, lookup, 'en');

        applyReaderTheme(ankiTextColour);

        expect(wordTextColour(word)).toBe(rootValue('--jpdb-reader-state-due-readable'));
        expect(shadowWord.className).toBe(word.className);
        expectPageCarriesNoProviderIdentity(word);

        applyReaderTheme(noAnkiColour);

        expect([word.className, shadowWord.className].join(' ')).not.toMatch(/review/u);
        expect(word.classList.contains('jpdb-due')).toBe(true);
    });

    it('keeps Study on its Anki classes and colours', () => {
        vi.stubGlobal('location', { href: STUDY_URL });
        applyReaderTheme(ankiTextColour);
        const word = renderedWord(jpdbUnknownCard);

        applyAnkiLookupToRenderedWord(word, lookup, 'en');

        expect(word.classList.contains('anki-due')).toBe(true);
        expect(word.classList.contains('jpdb-due')).toBe(false);
        expect(word.dataset.ankiState).toBe('due');
        expect(word.title).toBe(`Anki: Due (${PRIVATE_DECK})`);
        expect(wordTextColour(word)).toBe(rootValue('--jpdb-reader-state-due-readable'));
    });

    function renderedWord(wordCard: JPDBCard, containerClass = 'yomu-test-page-text'): HTMLElement {
        const container = wordContainer(wordCard, containerClass);
        document.body.replaceChildren(container);
        return container.querySelector<HTMLElement>('.jpdb-reader-word')!;
    }

    // A word in a page's open shadow root the reader has scanned.
    function renderedShadowWord(wordCard: JPDBCard): HTMLElement {
        const host = document.createElement('div');
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        noteScannedShadowRoot(shadow);
        const container = wordContainer(wordCard, 'yomu-test-page-text');
        shadow.append(container);
        return container.querySelector<HTMLElement>('.jpdb-reader-word')!;
    }

    function wordContainer(wordCard: JPDBCard, containerClass: string): HTMLElement {
        const token = {
            card: wordCard,
            start: 0,
            end: wordCard.spelling.length,
            length: wordCard.spelling.length,
            rubies: [],
            pitchClass: 'heiban',
            sentence: wordCard.spelling,
        };
        const container = document.createElement('div');
        container.className = containerClass;
        setInnerHtml(container, renderTokensToHtml(wordCard.spelling, [token], ankiTextColour));
        return container;
    }
});

function rootValue(name: string): string {
    return document.documentElement.style.getPropertyValue(name).trim();
}

// jsdom loads no layout but does cascade custom properties from a stylesheet;
// it never substitutes var(), so resolve the colour-source chain the way the
// browser would to judge what the word paints.
function wordTextColour(word: HTMLElement): string {
    return resolveCssVariables(word, 'var(--jpdb-reader-word-color-source)');
}

function resolveCssVariables(element: HTMLElement, value: string): string {
    const start = value.indexOf('var(');
    if (start < 0) return value.trim();
    const end = matchingParenthesis(value, start + 3);
    const [name, fallback] = splitVarArguments(value.slice(start + 4, end));
    const declared = inheritedCustomProperty(element, name);
    const replacement = declared ? resolveCssVariables(element, declared) : resolveCssVariables(element, fallback ?? '');
    return resolveCssVariables(element, `${value.slice(0, start)}${replacement}${value.slice(end + 1)}`);
}

function matchingParenthesis(value: string, open: number): number {
    let depth = 0;
    for (let index = open; index < value.length; index += 1) {
        if (value[index] === '(') depth += 1;
        if (value[index] === ')' && --depth === 0) return index;
    }
    throw new Error(`Unbalanced var() in ${value}`);
}

function splitVarArguments(args: string): [string, string | undefined] {
    const comma = args.indexOf(',');
    return comma < 0 ? [args.trim(), undefined] : [args.slice(0, comma).trim(), args.slice(comma + 1)];
}

function inheritedCustomProperty(element: Element, name: string): string {
    for (let node: Element | null = element; node; node = node.parentElement) {
        const value = (node instanceof HTMLElement ? node.style.getPropertyValue(name) : '')
            || getComputedStyle(node).getPropertyValue(name);
        if (value.trim()) return value.trim();
    }
    return '';
}

// Everything an ordinary page can read about the word: its markup, the root
// classes and inline style Yomu sets on <html>, and the custom properties the
// reader stylesheet declares on the word.
function expectPageCarriesNoProviderIdentity(word: HTMLElement): void {
    const root = document.documentElement;
    const pageReadable = [
        document.body.outerHTML,
        root.className,
        root.getAttribute('style') ?? '',
        ...declaredCustomPropertyNames(word),
    ].join('\n');
    expect(pageReadable).not.toMatch(/anki/i);
    for (const secret of [PRIVATE_DECK, PRIVATE_MODEL, '909090', '808080', '112233']) {
        expect(pageReadable).not.toContain(secret);
    }
}

function declaredCustomPropertyNames(element: HTMLElement): string[] {
    return [...document.styleSheets].flatMap(sheet => [...sheet.cssRules])
        .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && safeMatches(element, rule.selectorText))
        .flatMap(rule => rule.style.cssText.match(/--[\w-]+(?=\s*:)/gu) ?? []);
}

function safeMatches(element: HTMLElement, selector: string): boolean {
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
}

function popupRenderer(trusted: boolean, selectedSettings = settings): CardPopoverRenderer {
    return new CardPopoverRenderer({
        getSettings: () => selectedSettings,
        isJpdbBackedCard: () => true,
        renderWordHistory: () => '',
        renderWordPills: () => '',
        renderDefinitionSources: (_card, _entries, _sentence, _jpdb, _jiten, _bunpro, extraSections = {}) => Object.values(extraSections).join(''),
        dictionarySourceAttributes: (_key, initiallyExpanded = true) => initiallyExpanded ? 'open' : '',
        dictionaryLabel: name => name,
        accountDataSurfaceTrusted: () => trusted,
    });
}

function richRenderData(overrides = {}) {
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
        ...overrides,
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
