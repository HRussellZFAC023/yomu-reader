import { uiText } from '../app/i18n';
import type { ApiDeck, JPDBDeck, ReaderSettings } from '../app/types';
import type { CollectionDestinationId } from './srs-providers';

export type DeckChoiceSource = Exclude<CollectionDestinationId, 'wanikani'>;

/**
 * One deck the popup's "Add to deck…" offers. The label names the service and
 * the learner's deck, so it travels only in a private capability and the
 * picker's closed shadow root, never in an ordinary page's DOM (ADR-0020).
 */
export interface DeckChoice {
    source: DeckChoiceSource;
    id: string;
    label: string;
}

export interface DeckLists {
    jpdbDecks: readonly JPDBDeck[];
    jitenDecks: readonly ApiDeck[];
    ankiDecks: readonly string[];
}

/**
 * The decks of the destinations that can take a word, in the destinations'
 * order, so the first choice is where the word would go by default: the
 * default destination's Settings deck.
 */
export function deckChoices(settings: ReaderSettings, destinations: readonly CollectionDestinationId[], lists: DeckLists): DeckChoice[] {
    const choices: DeckChoice[] = [];
    const add = (source: DeckChoiceSource, id: string, label: string): void => {
        const deckId = id.trim();
        if (deckId && !choices.some(choice => choice.source === source && choice.id === deckId)) choices.push({ source, id: deckId, label });
    };
    for (const destination of destinations) {
        if (destination === 'jpdb') {
            const configured = settings.miningDeck.trim() || 'forq';
            add('jpdb', configured, `JPDB: ${jpdbDeckLabel(configured, lists.jpdbDecks)}`);
            add('jpdb', 'forq', 'JPDB: FORQ');
            for (const deck of lists.jpdbDecks) if (!isSpecialJpdbDeck(settings, deck)) add('jpdb', deck.id, `JPDB: ${deck.name}`);
        } else if (destination === 'jiten') {
            for (const deck of lists.jitenDecks) add('jiten', deck.id, `Jiten: ${deck.name}`);
        } else if (destination === 'anki') {
            const configured = settings.ankiDeck || 'よむ';
            add('anki', configured, `Anki: ${configured}`);
            for (const deck of lists.ankiDecks) add('anki', deck, `Anki: ${deck}`);
        } else if (destination === 'bunpro') {
            add('bunpro', 'bunpro', 'Bunpro');
        } else if (destination === 'yomu-local') {
            add('yomu-local', 'yomu-local', uiText(settings.interfaceLanguage, 'defaultDeck'));
        }
    }
    return choices;
}

function jpdbDeckLabel(deckId: string, decks: readonly JPDBDeck[]): string {
    if (deckId === 'forq') return 'FORQ';
    return decks.find(candidate => candidate.id === deckId)?.name || deckId;
}

function isSpecialJpdbDeck(settings: ReaderSettings, deck: JPDBDeck): boolean {
    const neverForgetDeck = settings.neverForgetDeck.trim();
    const blacklistDeck = settings.blacklistDeck.trim();
    if (deck.id === neverForgetDeck || deck.id === blacklistDeck) return true;
    return /never\s*-?\s*forget|blacklist|suspend/i.test(`${deck.id} ${deck.name}`);
}
