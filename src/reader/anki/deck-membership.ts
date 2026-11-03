import type { JPDBCard, ReaderSettings } from '../app/types';
import type { AnkiConnectClient } from './index';
import { lookupKeyTermsForCard } from './field-mapping';
import { ankiMembershipIdentity } from './membership-note';
import { quoteAnkiSearch } from './search-escape';
import { isRecord } from '../core/object-utils';
import type { AnkiNoteInfo } from './types';

export type AnkiDeckMembership = ReadonlyMap<string, 'saved' | 'unknown'>;

/** Fresh, strict read for an explicitly opened private picker. Errors stay unknown. */
export async function readAnkiDeckMembership(client: Pick<AnkiConnectClient, 'invoke'>, card: JPDBCard, settings: ReaderSettings): Promise<AnkiDeckMembership> {
    const terms = lookupKeyTermsForCard(card);
    if (!terms.length) throw new Error('No Anki lookup identity');
    const ids = positiveIds(await client.invoke<unknown>('findNotes', { query: terms.map(quoteAnkiSearch).join(' OR ') }));
    if (!ids.length) return new Map();
    const notes = membershipNotes(await client.invoke<unknown>('notesInfo', { notes: ids }), ids);
    const evidence = new Map<number, 'saved' | 'unknown'>();
    for (const note of notes) {
        const identity = ankiMembershipIdentity(note, card, settings);
        if (identity !== 'different') note.cards.forEach(id => evidence.set(id, identity));
    }
    const cardIds = [...evidence.keys()];
    if (!cardIds.length) return new Map();
    return membershipDecks(await client.invoke<unknown>('cardsInfo', { cards: cardIds }), evidence);
}

function positiveIds(value: unknown): number[] {
    if (!Array.isArray(value) || !value.every((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid Anki IDs');
    return [...new Set(value)];
}

function membershipNotes(value: unknown, expected: readonly number[]): AnkiNoteInfo[] {
    if (!Array.isArray(value)) throw new Error('Invalid Anki notes');
    const notes = value.map((item: unknown): AnkiNoteInfo => {
        if (!isRecord(item) || typeof item.noteId !== 'number' || typeof item.modelName !== 'string' || !isRecord(item.fields)) throw new Error('Invalid Anki note');
        const fields: AnkiNoteInfo['fields'] = {};
        for (const [name, field] of Object.entries(item.fields)) {
            if (!isRecord(field) || typeof field.value !== 'string') throw new Error('Invalid Anki note field');
            fields[name] = { value: field.value };
        }
        return { noteId: item.noteId, modelName: item.modelName, fields, cards: positiveIds(item.cards), tags: [] };
    });
    if (notes.length !== expected.length || new Set(notes.map(note => note.noteId)).size !== expected.length || notes.some(note => !expected.includes(note.noteId))) throw new Error('Incomplete Anki notes');
    return notes;
}

function membershipDecks(value: unknown, expected: ReadonlyMap<number, 'saved' | 'unknown'>): AnkiDeckMembership {
    if (!Array.isArray(value)) throw new Error('Invalid Anki cards');
    const ids = new Set<number>();
    const decks = new Map<string, 'saved' | 'unknown'>();
    for (const item of value) {
        if (!isRecord(item) || typeof item.cardId !== 'number' || !expected.has(item.cardId) || typeof item.deckName !== 'string' || !item.deckName.trim()) throw new Error('Invalid Anki card');
        ids.add(item.cardId);
        const state = expected.get(item.cardId);
        if (state && decks.get(item.deckName) !== 'saved') decks.set(item.deckName, state);
    }
    if (ids.size !== expected.size) throw new Error('Incomplete Anki cards');
    return decks;
}
