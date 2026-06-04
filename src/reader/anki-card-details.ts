import type { CardState } from './types';
import {
    type AnkiCardInfo,
    type AnkiExistingNote,
    type AnkiLookupResult,
    type AnkiNoteInfo,
    type AnkiRenderedCard,
} from './anki-types';
import { flattenNoteFields } from './anki-field-mapping';

export function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}

export function untrustedAnkiLookupResult(): AnkiLookupResult {
    return { ...emptyAnkiLookupResult(), trusted: false };
}

export function cardsByNoteId(cards: AnkiCardInfo[]): Map<number, AnkiCardInfo[]> {
    const cardsByNote = new Map<number, AnkiCardInfo[]>();
    for (const cardInfo of cards) addCardInfoByNoteId(cardsByNote, cardInfo);
    return cardsByNote;
}

export function ankiExistingNoteFromInfo(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): AnkiExistingNote {
    const state = stateFromAnkiCards(noteCards);
    return {
        noteId: note.noteId,
        modelName: note.modelName,
        deckNames: ankiNoteDeckNames(noteCards),
        cardIds: note.cards ?? [],
        primaryCardId: ankiNotePrimaryCardId(note, noteCards),
        state,
        fields: flattenNoteFields(note.fields),
        renderedCards: ankiRenderedCards(noteCards),
        tags: note.tags ?? [],
        ...ankiNoteReviewMetrics(noteCards),
    };
}

export function ankiNoteHasRenderableDetails(note: AnkiExistingNote): boolean {
    if (note.renderedCards?.some(card => card.question.trim() || card.answer.trim())) return true;
    return Object.values(note.fields).some(value => value.trim());
}

export function ankiRenderedCardMediaFilenames(card: AnkiRenderedCard): string[] {
    return unique([card.question, card.answer]
        .flatMap(ankiCardHtmlMediaFilenames)
        .filter(shouldHydrateRenderedAnkiMedia));
}

export function ankiMediaFilenameFromCardUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('\\')) return null;
    if (/^(?:https?|data|blob|file|mailto|tel|javascript|vbscript):/i.test(trimmed)) return null;
    const filename = trimmed.split(/[?#]/, 1)[0]?.replace(/^\.\//, '') ?? '';
    if (!filename || filename.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(filename)) return null;
    try {
        return decodeURIComponent(filename);
    } catch {
        return filename;
    }
}

export function ankiMediaMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() ?? '';
    return ANKI_MEDIA_MIME_TYPES[extension] ?? 'audio/mpeg';
}

export function stateFromAnkiCards(cards: AnkiCardInfo[]): CardState {
    if (!cards.length) return 'known';
    if (cards.some(card => card.type === 3 || card.queue === 3)) return 'failed';
    if (cards.some(isAnkiCardDue)) return 'due';
    if (cards.some(card => card.queue === 1 || card.type === 1)) return 'learning';
    if (cards.some(card => card.queue === 0 || card.type === 0)) return 'new';
    if (cards.every(card => card.queue === -1)) return 'suspended';
    return 'known';
}

export function stateFromExistingNotes(notes: AnkiExistingNote[]): CardState {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'suspended'];
    return order.find(state => notes.some(note => note.state === state)) ?? (notes.length ? 'known' : 'not-in-deck');
}

export function pickPrimaryCard(cards: AnkiCardInfo[]): AnkiCardInfo | null {
    const order = (card: AnkiCardInfo) => {
        if (card.type === 3 || card.queue === 3) return 0;
        if (isAnkiCardDue(card)) return 1;
        if (card.queue === 1 || card.type === 1) return 2;
        if (card.queue === 0 || card.type === 0) return 3;
        return 4;
    };
    return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}

export function isAnkiCardDue(card: AnkiCardInfo): boolean {
    if (card.queue !== 2) return false;
    if (typeof card.isDue === 'boolean') return card.isDue;
    return Number(card.due ?? 0) <= 0;
}

export function pickPrimaryExistingNote(notes: AnkiExistingNote[]): AnkiExistingNote | null {
    const order = (note: AnkiExistingNote) => {
        if (note.state === 'failed') return 0;
        if (note.state === 'due') return 1;
        if (note.state === 'learning') return 2;
        if (note.state === 'new') return 3;
        if (note.state === 'known') return 4;
        return 5;
    };
    return [...notes].sort((a, b) => order(a) - order(b))[0] ?? null;
}

function addCardInfoByNoteId(cardsByNote: Map<number, AnkiCardInfo[]>, cardInfo: AnkiCardInfo): void {
    const noteId = Number(cardInfo.note);
    if (!Number.isFinite(noteId)) return;
    const list = cardsByNote.get(noteId) ?? [];
    list.push(cardInfo);
    cardsByNote.set(noteId, list);
}

function ankiRenderedCards(noteCards: AnkiCardInfo[]): AnkiRenderedCard[] {
    return noteCards
        .filter(card => card.question || card.answer)
        .map(card => ({
            cardId: card.cardId,
            deckName: card.deckName,
            question: String(card.question ?? ''),
            answer: String(card.answer ?? ''),
        }));
}

function ankiCardHtmlMediaFilenames(html: string): string[] {
    return Array.from(html.matchAll(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi), match =>
        ankiMediaFilenameFromCardUrl(match[1] ?? match[2] ?? match[3] ?? ''),
    ).filter((filename): filename is string => Boolean(filename));
}

function shouldHydrateRenderedAnkiMedia(filename: string): boolean {
    return ankiMediaMimeType(filename).startsWith('image/');
}

function ankiNoteDeckNames(noteCards: AnkiCardInfo[]): string[] {
    return unique(noteCards.map(item => item.deckName).filter(Boolean));
}

function ankiNotePrimaryCardId(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): number | null {
    return pickPrimaryCard(noteCards)?.cardId ?? note.cards?.[0] ?? null;
}

function ankiNoteReviewMetrics(noteCards: AnkiCardInfo[]): Pick<AnkiExistingNote, 'reps' | 'lapses'> {
    return {
        reps: sumAnkiCardMetric(noteCards, 'reps'),
        lapses: sumAnkiCardMetric(noteCards, 'lapses'),
    };
}

function sumAnkiCardMetric(cards: AnkiCardInfo[], metric: 'reps' | 'lapses'): number {
    return cards.reduce((sum, item) => sum + Number(item[metric] || 0), 0);
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

const ANKI_MEDIA_MIME_TYPES: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'jfif': 'image/jpeg',
    'pjpeg': 'image/jpeg',
    'pjp': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
    'svg': 'image/svg+xml',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'oga': 'audio/ogg',
    'opus': 'audio/ogg',
    'webm': 'audio/webm',
    'm4a': 'audio/mp4',
    'mp4': 'audio/mp4',
    'aac': 'audio/mp4',
    'flac': 'audio/flac',
};
