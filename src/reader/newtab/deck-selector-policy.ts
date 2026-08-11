import type { JPDBDeck, ReaderSettings } from '../app/types';
import { usesJapaneseProviders } from '../languages/character-lookup';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { JPDB_ALL_DECKS } from './controller-config';
import type { NewTabUiState } from './state';

type NewTabDeckSelectorMode = 'hidden' | 'anki' | 'jpdb';
const JPDB_UNSCOPED_MEMBERSHIP_DECK_IDS = new Set(['', JPDB_ALL_DECKS]);

interface NewTabDeckSelectorContext {
    readonly state: Pick<NewTabUiState, 'route' | 'source'>;
    readonly vocabularyStudy: boolean;
    readonly settings: ReaderSettings;
}

interface NewTabJpdbDeckSelectorContext {
    readonly state: Pick<NewTabUiState, 'jpdbDeck'>;
    readonly settings: ReaderSettings;
    readonly jpdbDecks?: readonly JPDBDeck[];
    readonly jitenDecks?: readonly JPDBDeck[];
    readonly allVocabularyLabel: string;
}

interface NewTabJpdbDeckSelectorModel {
    readonly supportsProviderDecks: boolean;
    readonly selected: string;
    readonly options: readonly { id: string; label: string }[];
}

interface NewTabAnkiDeckSelection {
    readonly id: string;
    readonly label: string;
}

/** Owns when Japanese-provider deck scope may appear on a New Tab surface. */
export function newTabDeckSelectorMode(context: NewTabDeckSelectorContext): NewTabDeckSelectorMode {
    if (!usesJapaneseProviders()) return 'hidden';
    return japaneseDeckSelectorMode(context);
}

/** Builds the complete, target-safe JPDB/Jiten deck choice model for rendering. */
export function newTabJpdbDeckSelectorModel(
    context: NewTabJpdbDeckSelectorContext,
): NewTabJpdbDeckSelectorModel {
    const supportsProviderDecks = usesJapaneseProviders();
    const selected = selectedJpdbDeck(context, supportsProviderDecks);
    const decks = targetDeckSelectorOptions(context, selected, supportsProviderDecks);
    return {
        supportsProviderDecks,
        selected,
        options: decks.map(deck => ({ id: deck.id, label: deckOptionLabel(deck) })),
    };
}

/** Loads a user's decks only when one concrete deck can own a membership label. */
export async function jpdbDeckMembershipName(
    deckId: string,
    loadDecks: () => Promise<readonly JPDBDeck[]>,
): Promise<string> {
    const normalized = deckId.trim();
    if (JPDB_UNSCOPED_MEMBERSHIP_DECK_IDS.has(normalized)) return '';
    const decks = await loadDecks();
    const deck = decks.find(candidate => candidate.id === normalized);
    return deck ? deck.name : '';
}

/** Resolves the persisted Anki scope before its asynchronous deck list arrives. */
export function newTabAnkiDeckSelection(configuredDeck: string, allVocabularyLabel: string): NewTabAnkiDeckSelection {
    const id = configuredDeck || 'all';
    return { id, label: id === 'all' ? allVocabularyLabel : id };
}

/** Builds the final Anki deck model, preserving an unavailable saved scope. */
export function newTabAnkiDeckSelectorOptions(
    deckNames: readonly string[],
    dueByDeck: ReadonlyMap<string, number>,
    selection: NewTabAnkiDeckSelection,
    allVocabularyLabel: string,
): Array<{ id: string; label: string }> {
    const options = [
        { id: 'all', label: allVocabularyLabel },
        ...deckNames.filter(Boolean).map(name => ({ id: name, label: ankiDeckOptionLabel(name, dueByDeck.get(name)) })),
    ];
    if (!options.some(option => option.id === selection.id)) options.push(selection);
    return options;
}

function japaneseDeckSelectorMode(context: NewTabDeckSelectorContext): NewTabDeckSelectorMode {
    if (context.state.route === 'search') return searchDeckSelectorMode(context.settings);
    if (!context.vocabularyStudy) return 'hidden';
    if (context.state.source === 'anki') return ankiDeckSelectorMode(context.settings);
    return jpdbDeckSelectorMode(context.state.source, context.settings);
}

function searchDeckSelectorMode(settings: ReaderSettings): NewTabDeckSelectorMode {
    return hasJpdbApiCredential(settings) ? 'jpdb' : 'hidden';
}

function ankiDeckSelectorMode(settings: ReaderSettings): NewTabDeckSelectorMode {
    return settings.ankiEnabled && settings.newTabAnkiEnabled ? 'anki' : 'hidden';
}

function jpdbDeckSelectorMode(source: NewTabUiState['source'], settings: ReaderSettings): NewTabDeckSelectorMode {
    if (!['auto', 'jpdb'].includes(source)) return 'hidden';
    return hasJpdbApiCredential(settings) || hasJitenApiCredential(settings) ? 'jpdb' : 'hidden';
}

function selectedJpdbDeck(
    context: NewTabJpdbDeckSelectorContext,
    supportsProviderDecks: boolean,
): string {
    if (!supportsProviderDecks) return JPDB_ALL_DECKS;
    return (context.state.jpdbDeck || context.settings.newTabJpdbDeck).trim() || JPDB_ALL_DECKS;
}

function targetDeckSelectorOptions(
    context: NewTabJpdbDeckSelectorContext,
    selected: string,
    supportsProviderDecks: boolean,
): JPDBDeck[] {
    if (!supportsProviderDecks) return [allVocabularyDeckOption(context.allVocabularyLabel)];
    return jpdbDeckSelectorOptions(context, selected);
}

function jpdbDeckSelectorOptions(
    context: NewTabJpdbDeckSelectorContext,
    selected: string,
): JPDBDeck[] {
    const options = [
        allVocabularyDeckOption(context.allVocabularyLabel),
        ...providerDeckSelectorOptions(context.settings),
        ...(context.jpdbDecks ?? []).filter(deck => deck.id !== JPDB_ALL_DECKS),
        ...(context.jitenDecks ?? []),
    ];
    return options.some(option => option.id === selected)
        ? options
        : [...options, { id: selected, name: selected }];
}

function allVocabularyDeckOption(name: string): JPDBDeck {
    return { id: JPDB_ALL_DECKS, name };
}

// UT-62: one-tap provider scoping appears only when both queues exist.
function providerDeckSelectorOptions(settings: ReaderSettings): JPDBDeck[] {
    return hasJpdbApiCredential(settings) && hasJitenApiCredential(settings)
        ? [
            { id: 'provider:jiten', name: 'Jiten' },
            { id: 'provider:jpdb', name: 'JPDB' },
        ]
        : [];
}

// jpdb.io Learn parity: deck entries include known progress when available.
function deckOptionLabel(deck: JPDBDeck): string {
    const parts: string[] = [];
    if (typeof deck.vocabularyCount === 'number') parts.push(`${deck.vocabularyCount}`);
    if (typeof deck.knownCoverage === 'number') parts.push(`${Math.round(deck.knownCoverage)}%`);
    return parts.length ? `${deck.name} · ${parts.join(' · ')}` : deck.name;
}

function ankiDeckOptionLabel(name: string, due: number | undefined): string {
    return typeof due === 'number' && due > 0 ? `${name} · ${due}` : name;
}
