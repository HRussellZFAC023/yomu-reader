import { canUseMobileAnkiHandoff, type AnkiConnectClient } from './anki';
import { Logger } from './logger';
import type { CardState, JPDBCard, ReaderSettings } from './types';

const log = Logger.scope('AnkiNewTab');
let unavailableUntil = 0;

interface AnkiNoteInfo {
    noteId: number;
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

interface AnkiCardInfo {
    cardId: number;
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

export async function listNewTabAnkiCards(client: AnkiConnectClient, settings: ReaderSettings, limit = 80): Promise<JPDBCard[]> {
    if (!settings.ankiEnabled || canUseMobileAnkiHandoff(settings) || Date.now() < unavailableUntil) return [];

    try {
        const done = log.time('listNewTabCards', { deck: settings.ankiDeck, model: settings.ankiModel, limit });
        const cards = await loadNewTabAnkiCards(client, settings, limit);
        done();
        return cards;
    } catch (error) {
        log.warn('Anki new tab lookup failed; entering cooldown', error);
        unavailableUntil = Date.now() + 30000;
        return [];
    }
}

async function loadNewTabAnkiCards(client: AnkiConnectClient, settings: ReaderSettings, limit: number): Promise<JPDBCard[]> {
    const query = newTabAnkiQuery(settings);
    const candidateCardIds = ankiCandidateIds(await client.invoke<number[]>('findCards', { query }), Math.max(1, limit * 8));
    if (!candidateCardIds.length) return [];

    const dueCards = await loadDueNewTabAnkiCards(client, candidateCardIds);
    if (!dueCards.length) return [];

    const noteIds = unique(dueCards.map(cardInfo => Number(cardInfo.note)).filter(Number.isFinite));
    const notes = await client.invoke<AnkiNoteInfo[]>('notesInfo', { notes: noteIds });
    const notesById = notesByNoteId(notes);
    const cardsByNote = cardsByNoteId(dueCards);
    return noteIds
        .map(noteId => {
            const note = notesById.get(noteId);
            return note ? ankiNoteToCard(note, cardsByNote.get(noteId) ?? []) : null;
        })
        .filter((card): card is JPDBCard => card !== null)
        .slice(0, Math.max(1, limit));
}

async function loadDueNewTabAnkiCards(client: AnkiConnectClient, candidateCardIds: number[]): Promise<AnkiCardInfo[]> {
    const dueFlags = await client.invoke<boolean[]>('areDue', { cards: candidateCardIds }).catch(() => candidateCardIds.map(() => true));
    const dueByCardId = new Map(candidateCardIds.map((cardId, index) => [Number(cardId), dueFlags[index]]));
    const cards = await client.invoke<AnkiCardInfo[]>('cardsInfo', { cards: candidateCardIds }).catch((): AnkiCardInfo[] => []);
    return orderAnkiReviewCards(
        cards.filter(cardInfo => isReviewableAnkiCard(cardInfo, dueByCardId.get(Number(cardInfo.cardId)))),
        candidateCardIds,
    );
}

function newTabAnkiQuery(settings: ReaderSettings): string {
    return [
        settings.ankiDeck ? `deck:${quoteAnkiSearch(settings.ankiDeck)}` : '',
        settings.ankiModel ? `note:${quoteAnkiSearch(settings.ankiModel)}` : '',
        '-is:suspended',
        '(is:due OR is:new OR is:learn)',
    ].filter(Boolean).join(' ');
}

function quoteAnkiSearch(term: string): string {
    return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function ankiCandidateIds(ids: number[], limit: number): number[] {
    const uniqueIds = unique(ids).filter(id => Number.isFinite(Number(id)));
    return uniqueIds.slice(0, limit);
}

function isReviewableAnkiCard(cardInfo: AnkiCardInfo, dueFlag: boolean | undefined): boolean {
    if (cardInfo.queue === -1) return false;
    if ([0, 1, 3].includes(cardInfo.queue) || [0, 1, 3].includes(cardInfo.type)) return true;
    return Boolean(dueFlag);
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
