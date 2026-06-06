import type { CardState, JPDBGrade, ReviewGradeInterval, ReviewGradeIntervals } from '../types';
import {
    type AnkiCardInfo,
    type AnkiExistingNote,
    type AnkiLookupResult,
    type AnkiNoteInfo,
    type AnkiRenderedCard,
    type AnkiStatusIndexEntry,
} from './types';
import { flattenNoteFields } from './field-mapping';

const ANKI_CARD_STATE_PRIORITY: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'suspended', 'in-deck', 'not-in-deck'];

type AnkiCardStateInfo = Pick<AnkiCardInfo, 'queue' | 'type' | 'due' | 'isDue'>;
type AnkiPrimaryCardInfo = AnkiCardStateInfo & Pick<AnkiCardInfo, 'cardId'>;
type AnkiReviewGradeCardInfo = AnkiPrimaryCardInfo & Pick<AnkiCardInfo, 'buttons' | 'nextReviews'>;

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
    const reviewGradeIntervals = reviewGradeIntervalsFromAnkiCards(noteCards);
    return {
        noteId: note.noteId,
        modelName: note.modelName,
        cardIds: note.cards ?? [],
        fields: flattenNoteFields(note.fields),
        renderedCards: ankiRenderedCards(noteCards),
        tags: note.tags ?? [],
        ...(reviewGradeIntervals ? { reviewGradeIntervals } : {}),
        ...ankiCardDetailSummary(note, noteCards),
    };
}

export function ankiStatusIndexEntryFromInfo(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): AnkiStatusIndexEntry {
    return {
        noteId: note.noteId,
        modelName: note.modelName,
        ...ankiCardDetailSummary(note, noteCards),
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

export function ankiCardTemplateLabel(card: Pick<AnkiCardInfo, 'card' | 'cardName' | 'name' | 'ord' | 'template'>): string {
    const explicit = [card.cardName, card.card, card.template, card.name]
        .map(value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
        .find(Boolean);
    if (explicit) return explicit;
    const ordinal = Number(card.ord);
    return Number.isInteger(ordinal) && ordinal >= 0 ? `Card ${ordinal + 1}` : '';
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

export function stateFromAnkiCards(cards: AnkiCardStateInfo[]): CardState {
    if (!cards.length) return 'known';
    if (cards.some(card => card.type === 3 || card.queue === 3)) return 'failed';
    if (cards.some(isAnkiCardDue)) return 'due';
    if (cards.some(card => card.queue === 1 || card.type === 1)) return 'learning';
    if (cards.some(card => card.queue === 0 || card.type === 0)) return 'new';
    if (cards.every(card => card.queue === -1)) return 'suspended';
    return 'known';
}

export function stateFromExistingNotes(notes: AnkiExistingNote[]): CardState {
    return ANKI_CARD_STATE_PRIORITY
        .slice(0, 6)
        .find(state => notes.some(note => note.state === state)) ?? (notes.length ? 'known' : 'not-in-deck');
}

export function pickPrimaryCard<T extends AnkiPrimaryCardInfo>(cards: T[]): T | null {
    const order = (card: AnkiCardStateInfo) => {
        if (card.type === 3 || card.queue === 3) return 0;
        if (isAnkiCardDue(card)) return 1;
        if (card.queue === 1 || card.type === 1) return 2;
        if (card.queue === 0 || card.type === 0) return 3;
        return 4;
    };
    return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}

export function reviewGradeIntervalsFromAnkiCards(cards: AnkiReviewGradeCardInfo[]): ReviewGradeIntervals | undefined {
    return reviewGradeIntervalsFromAnkiCard(pickPrimaryCard(cards));
}

function reviewGradeIntervalsFromAnkiCard(card: AnkiReviewGradeCardInfo | null | undefined): ReviewGradeIntervals | undefined {
    const nextReviews = Array.isArray(card?.nextReviews)
        ? card.nextReviews.map(normalizeAnkiReviewIntervalLabel).filter(Boolean)
        : [];
    if (!nextReviews.length) return undefined;
    const buttons = ankiReviewButtons(card?.buttons, nextReviews.length);
    const labels = ankiReviewButtonLabels(buttons);
    const intervals: ReviewGradeIntervals = {};
    nextReviews.forEach((intervalLabel, index) => {
        const button = buttons[index];
        if (!button) return;
        const buttonLabel = labels[index] ?? ankiReviewButtonLabel(button);
        const interval = reviewGradeInterval(buttonLabel, intervalLabel);
        for (const grade of ankiGradesForButton(button)) intervals[grade] = interval;
    });
    return Object.keys(intervals).length ? intervals : undefined;
}

function normalizeAnkiReviewIntervalLabel(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function ankiReviewButtons(value: unknown, count: number): number[] {
    const explicit = Array.isArray(value)
        ? value.map(Number).filter(button => Number.isInteger(button) && button > 0)
        : [];
    if (explicit.length === count) return explicit;
    if (count === 4) return [1, 2, 3, 4];
    if (count === 3) return [1, 2, 3];
    if (count === 2) return [1, 2];
    return Array.from({ length: count }, (_, index) => index + 1);
}

function ankiReviewButtonLabels(buttons: number[]): string[] {
    if (buttons.length === 3 && buttons.every((button, index) => button === index + 1)) {
        return ['Again', 'Good', 'Easy'];
    }
    if (buttons.length === 2 && buttons.every((button, index) => button === index + 1)) {
        return ['Again', 'Good'];
    }
    return buttons.map(ankiReviewButtonLabel);
}

function ankiReviewButtonLabel(button: number): string {
    return ANKI_REVIEW_BUTTON_LABELS[button] ?? `Button ${button}`;
}

function ankiGradesForButton(button: number): JPDBGrade[] {
    return ANKI_GRADES_BY_BUTTON[button] ?? [];
}

function reviewGradeInterval(buttonLabel: string, intervalLabel: string): ReviewGradeInterval {
    return {
        buttonLabel,
        intervalLabel,
        label: `${buttonLabel} ${intervalLabel}`,
        source: 'anki-next-reviews',
    };
}

function isAnkiCardDue(card: AnkiCardStateInfo): boolean {
    if (card.queue !== 2) return false;
    if (typeof card.isDue === 'boolean') return card.isDue;
    return Number(card.due ?? 0) <= 0;
}

export function pickPrimaryExistingNote(notes: AnkiExistingNote[]): AnkiExistingNote | null {
    return [...notes].sort((a, b) => ankiCardStateRank(a.state) - ankiCardStateRank(b.state))[0] ?? null;
}

export function ankiCardStateRank(state: CardState): number {
    const index = ANKI_CARD_STATE_PRIORITY.indexOf(state);
    return index < 0 ? ANKI_CARD_STATE_PRIORITY.length : index;
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
        .map(card => {
            const cardName = ankiCardTemplateLabel(card);
            return {
                cardId: card.cardId,
                deckName: card.deckName,
                ...(cardName ? { cardName } : {}),
                question: String(card.question ?? ''),
                answer: String(card.answer ?? ''),
            };
        });
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

function ankiCardDetailSummary(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): Pick<AnkiExistingNote, 'deckNames' | 'primaryCardId' | 'state' | 'reps' | 'lapses'> {
    return {
        deckNames: ankiNoteDeckNames(noteCards),
        primaryCardId: ankiNotePrimaryCardId(note, noteCards),
        state: stateFromAnkiCards(noteCards),
        ...ankiNoteReviewMetrics(noteCards),
    };
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

const ANKI_REVIEW_BUTTON_LABELS: Record<number, string> = {
    1: 'Again',
    2: 'Hard',
    3: 'Good',
    4: 'Easy',
};

const ANKI_GRADES_BY_BUTTON: Record<number, JPDBGrade[]> = {
    1: ['nothing', 'fail'],
    2: ['something', 'hard'],
    3: ['okay', 'pass'],
    4: ['easy'],
};
