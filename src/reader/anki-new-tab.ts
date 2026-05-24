import { canUseMobileAnkiHandoff, type AnkiConnectClient } from './anki';
import { Logger } from './logger';
import type { CardState, JPDBCard, ReaderSettings } from './types';

const log = Logger.scope('AnkiNewTab');
const ANKI_CARD_INFO_CHUNK_SIZE = 250;
const ANKI_NOTE_INFO_CHUNK_SIZE = 100;
let unavailableUntil = 0;

interface AnkiNoteInfo {
    noteId: number;
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

interface AnkiCardInfo {
    cardId: number;
    deckName?: string;
    queue: number;
    type: number;
    due?: number;
    note?: number;
}

interface AnkiNoteCardFields {
    spelling: string;
    reading: string;
    meaning: string;
    partOfSpeech: string;
    sentence: string;
}

type AnkiNewTabQueryKind = 'due' | 'new';

export async function listNewTabAnkiCards(client: AnkiConnectClient, settings: ReaderSettings, limit = 80): Promise<JPDBCard[]> {
    if (!settings.newTabAnkiEnabled || canUseMobileAnkiHandoff(settings) || Date.now() < unavailableUntil) return [];

    try {
        const done = log.time('listNewTabCards', { deck: settings.ankiDeck, model: settings.ankiModel, limit });
        const deckNames = await newTabAnkiDeckNames(client, settings);
        const dueCards = await loadNewTabAnkiCards(client, settings, deckNames, limit, 'due');
        const newCards = dueCards.length >= limit
            ? []
            : await loadNewTabAnkiCards(client, settings, deckNames, limit - dueCards.length, 'new');
        const cards = [...dueCards, ...newCards].slice(0, Math.max(1, limit));
        done();
        return cards;
    } catch (error) {
        log.warn('Anki new tab lookup failed; entering cooldown', error);
        unavailableUntil = Date.now() + 30000;
        return [];
    }
}

async function loadNewTabAnkiCards(client: AnkiConnectClient, settings: ReaderSettings, deckNames: string[], limit: number, kind: AnkiNewTabQueryKind): Promise<JPDBCard[]> {
    const cards: JPDBCard[] = [];
    const seenCards = new Set<number>();
    const seenNotes = new Set<number>();
    for (const query of newTabAnkiQueries(settings, deckNames, kind)) {
        const loadedCards = await loadNewTabAnkiCardsForQuery(client, query, limit - cards.length, kind, seenCards, seenNotes);
        cards.push(...loadedCards);
        if (cards.length >= limit) break;
    }
    return cards.slice(0, Math.max(1, limit));
}

async function loadNewTabAnkiCardsForQuery(
    client: AnkiConnectClient,
    query: string,
    limit: number,
    kind: AnkiNewTabQueryKind,
    seenCards: Set<number>,
    seenNotes: Set<number>,
): Promise<JPDBCard[]> {
    if (limit <= 0) return [];
    const candidateCardIds = ankiCandidateIds(await client.invoke<number[]>('findCards', { query }))
        .filter(cardId => !seenCards.has(Number(cardId)));
    if (!candidateCardIds.length) return [];

    const reviewCards = await loadReviewableNewTabAnkiCards(client, candidateCardIds, kind);
    if (!reviewCards.length) return [];

    const noteIds = unique(reviewCards.map(cardInfo => Number(cardInfo.note)).filter(Number.isFinite))
        .filter(noteId => !seenNotes.has(noteId));
    const cardsByNote = cardsByNoteId(reviewCards);
    const cards: JPDBCard[] = [];
    for (const chunk of chunks(noteIds, ANKI_NOTE_INFO_CHUNK_SIZE)) {
        const notes = await client.invoke<AnkiNoteInfo[]>('notesInfo', { notes: chunk }).catch((): AnkiNoteInfo[] => []);
        const notesById = notesByNoteId(notes);
        for (const noteId of chunk) {
            const note = notesById.get(noteId);
            const card = note ? ankiNoteToCard(note, cardsByNote.get(noteId) ?? []) : null;
            if (card) {
                cards.push(card);
                seenNotes.add(noteId);
                const cardId = Number(card.ankiCardId ?? card.rid);
                if (Number.isFinite(cardId)) seenCards.add(cardId);
            }
            if (cards.length >= limit) return cards.slice(0, Math.max(1, limit));
        }
    }
    return cards.slice(0, Math.max(1, limit));
}

async function newTabAnkiDeckNames(client: AnkiConnectClient, settings: ReaderSettings): Promise<string[]> {
    const names = await client.invoke<unknown>('deckNames').catch(() => []);
    const deckNames = Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())) : [];
    const fallbackDeck = settings.ankiDeck.trim();
    return deckNames.length ? deckNames : fallbackDeck ? [fallbackDeck] : [];
}

async function loadReviewableNewTabAnkiCards(client: AnkiConnectClient, candidateCardIds: number[], kind: AnkiNewTabQueryKind): Promise<AnkiCardInfo[]> {
    const dueByCardId = kind === 'due'
        ? await ankiDueFlags(client, candidateCardIds)
        : new Map<number, boolean>();
    const cards = (await Promise.all(chunks(candidateCardIds, ANKI_CARD_INFO_CHUNK_SIZE)
        .map(chunk => client.invoke<AnkiCardInfo[]>('cardsInfo', { cards: chunk }).catch((): AnkiCardInfo[] => []))))
        .flat();
    return orderAnkiReviewCards(
        cards.filter(cardInfo => isReviewableAnkiCard(cardInfo, kind, dueByCardId.get(Number(cardInfo.cardId)))),
        candidateCardIds,
    );
}

async function ankiDueFlags(client: AnkiConnectClient, candidateCardIds: number[]): Promise<Map<number, boolean>> {
    const flags = new Map<number, boolean>();
    for (const chunk of chunks(candidateCardIds, ANKI_CARD_INFO_CHUNK_SIZE)) {
        const dueFlags = await client.invoke<boolean[]>('areDue', { cards: chunk }).catch((): boolean[] => []);
        chunk.forEach((cardId, index) => flags.set(Number(cardId), dueFlags[index] === true));
    }
    return flags;
}

function newTabAnkiQueries(settings: ReaderSettings, deckNames: string[], kind: AnkiNewTabQueryKind): string[] {
    const broadQuery = newTabAnkiQuery(deckNames, '', kind);
    const model = settings.ankiModel.trim();
    const modelQuery = model ? newTabAnkiQuery(deckNames, model, kind) : '';
    return [...new Set([broadQuery, modelQuery].filter(Boolean))];
}

function newTabAnkiQuery(deckNames: string[], model: string, kind: AnkiNewTabQueryKind): string {
    return [
        deckNames.length ? `(${deckNames.map(deck => `deck:${quoteAnkiSearch(deck)}`).join(' OR ')})` : '',
        model ? `note:${quoteAnkiSearch(model)}` : '',
        '-is:suspended',
        kind === 'due' ? '(is:due OR is:learn)' : 'is:new',
    ].filter(Boolean).join(' ');
}

function quoteAnkiSearch(term: string): string {
    return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function ankiCandidateIds(ids: number[]): number[] {
    const uniqueIds = unique(ids).filter(id => Number.isFinite(Number(id)));
    return uniqueIds;
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let index = 0; index < items.length; index += Math.max(1, size)) {
        out.push(items.slice(index, index + Math.max(1, size)));
    }
    return out;
}

function isReviewableAnkiCard(cardInfo: AnkiCardInfo, kind: AnkiNewTabQueryKind, dueFlag: boolean | undefined): boolean {
    if (cardInfo.queue === -1) return false;
    if (kind === 'new') return cardInfo.queue === 0 || cardInfo.type === 0;
    if (!dueFlag) return false;
    return [1, 2, 3].includes(cardInfo.queue) || [1, 2, 3].includes(cardInfo.type);
}

function cardsByNoteId(cards: AnkiCardInfo[]): Map<number, AnkiCardInfo[]> {
    const cardsByNote = new Map<number, AnkiCardInfo[]>();
    for (const cardInfo of cards) {
        const noteId = Number(cardInfo.note);
        if (!Number.isFinite(noteId)) continue;
        cardsByNote.set(noteId, [...(cardsByNote.get(noteId) ?? []), cardInfo]);
    }
    return cardsByNote;
}

function notesByNoteId(notes: AnkiNoteInfo[]): Map<number, AnkiNoteInfo> {
    return new Map(notes.map(note => [Number(note.noteId), note]));
}

function orderAnkiReviewCards(cards: AnkiCardInfo[], requestedIds: number[]): AnkiCardInfo[] {
    const requestOrder = new Map(requestedIds.map((cardId, index) => [Number(cardId), index]));
    return [...cards].sort((a, b) =>
        ankiReviewQueueRank(a) - ankiReviewQueueRank(b)
        || ankiDueValue(a) - ankiDueValue(b)
        || (requestOrder.get(Number(a.cardId)) ?? Number.MAX_SAFE_INTEGER) - (requestOrder.get(Number(b.cardId)) ?? Number.MAX_SAFE_INTEGER)
        || Number(a.cardId) - Number(b.cardId),
    );
}

function ankiReviewQueueRank(card: AnkiCardInfo): number {
    if (card.type === 3 || card.queue === 3) return 0;
    if (card.queue === 1 || card.type === 1) return 1;
    if (card.queue === 2) return 2;
    if (card.queue === 0 || card.type === 0) return 3;
    return 4;
}

function ankiDueValue(card: AnkiCardInfo): number {
    const due = Number(card.due);
    return Number.isFinite(due) ? due : Number.POSITIVE_INFINITY;
}

function ankiNoteToCard(note: AnkiNoteInfo, cards: AnkiCardInfo[]): JPDBCard | null {
    const fields = ankiNoteCardFields(note);
    if (!fields) return null;
    const primaryCardId = pickPrimaryCard(cards)?.cardId ?? note.cards?.[0];
    const partOfSpeech = fields.partOfSpeech ? [fields.partOfSpeech] : [];
    return {
        vid: -stableAnkiId(String(note.noteId)),
        sid: -stableAnkiId(`${note.noteId}:${fields.spelling}`),
        rid: primaryCardId ?? 0,
        spelling: fields.spelling,
        reading: fields.reading,
        frequencyRank: null,
        partOfSpeech,
        meanings: [{ glosses: meaningToGlosses(fields.meaning), partOfSpeech }],
        cardState: [stateFromAnkiCards(cards)],
        pitchAccent: [],
        wordWithReading: null,
        source: 'anki',
        sentence: fields.sentence,
        reviewSource: 'anki',
        ankiCardId: primaryCardId ?? undefined,
    };
}

function ankiNoteCardFields(note: AnkiNoteInfo): AnkiNoteCardFields | null {
    const fields = flattenNoteFields(note.fields);
    const spelling = firstField(fields, ['Expression', 'Word', 'Vocab', 'Vocabulary', 'Term', 'Front', 'Expression Reading'])
        || firstJapaneseValue(fields);
    if (!spelling) return null;
    return {
        spelling,
        reading: firstField(fields, ['Reading', 'Kana', 'Yomi', 'Pronunciation']) || spelling,
        meaning: firstField(fields, ['Meaning', 'Definition', 'Definitions', 'Glossary', 'Back', 'DictionaryDefinitions']),
        partOfSpeech: firstField(fields, ['PartOfSpeech', 'Part of Speech', 'POS']),
        sentence: firstField(fields, ['Sentence', 'Example', 'Context', 'ExpressionSentence', 'SentenceAudio']),
    };
}

function flattenNoteFields(fields: AnkiNoteInfo['fields']): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(fields ?? {}).forEach(([name, value]) => {
        out[name] = stripHtml(String(value?.value ?? ''));
    });
    return out;
}

function firstField(fields: Record<string, string>, names: string[]): string {
    for (const name of names) {
        const value = fields[name]?.replace(/\s+/g, ' ').trim();
        if (value) return value;
    }
    return '';
}

function firstJapaneseValue(fields: Record<string, string>): string {
    for (const value of Object.values(fields)) {
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (/[\u3040-\u30ff\u3400-\u9fff]/.test(normalized)) return normalized.slice(0, 80);
    }
    return '';
}

function meaningToGlosses(value: string): string[] {
    return value
        .split(/\n+|[;；]/)
        .map(item => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 8);
}

function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function stableAnkiId(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
}

function stateFromAnkiCards(cards: AnkiCardInfo[]): CardState {
    if (!cards.length) return 'known';
    return ANKI_CARD_STATE_RULES.find(rule => cards.some(rule.matches))?.state ?? 'known';
}

const ANKI_CARD_STATE_RULES: Array<{ state: CardState; matches: (card: AnkiCardInfo) => boolean }> = [
    { state: 'suspended', matches: card => card.queue === -1 },
    { state: 'failed', matches: card => card.type === 3 || card.queue === 3 },
    { state: 'learning', matches: card => card.queue === 1 || card.type === 1 },
    { state: 'new', matches: card => card.queue === 0 || card.type === 0 },
    { state: 'due', matches: card => card.queue === 2 && Number(card.due ?? 0) <= 0 },
];

function pickPrimaryCard(cards: AnkiCardInfo[]): AnkiCardInfo | null {
    const order = (card: AnkiCardInfo) => {
        if (card.type === 3 || card.queue === 3) return 0;
        if (card.queue === 2 && Number(card.due ?? 0) <= 0) return 1;
        if (card.queue === 1 || card.type === 1) return 2;
        if (card.queue === 0 || card.type === 0) return 3;
        return 4;
    };
    return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}
