import {
    ANKI_EXPRESSION_FIELD_NAMES,
    ANKI_MEANING_FIELD_NAMES,
    ANKI_READING_FIELD_NAMES,
    ANKI_SENTENCE_FIELD_NAMES,
    type AnkiConnectClient,
} from './anki';
import { flattenNoteFields, normalizeAnkiFieldName } from './anki-field-mapping';
import { Logger } from './logger';
import { stablePositiveHashId } from './stable-hash';
import type { AnkiCardKind, AnkiFieldMapping, CardState, JPDBCard, ReaderSettings } from './types';

const log = Logger.scope('AnkiNewTab');
const ANKI_CARD_INFO_CHUNK_SIZE = 250;
const ANKI_NOTE_INFO_CHUNK_SIZE = 100;
const ANKI_CARD_INFO_CONCURRENCY = 2;
const ANKI_CANDIDATE_OVERFETCH = 3;
const ANKI_CANDIDATE_MIN_WINDOW_SIZE = 24;
const ANKI_CANDIDATE_MAX_WINDOW_SIZE = ANKI_CARD_INFO_CHUNK_SIZE * ANKI_CARD_INFO_CONCURRENCY;
const ANKI_NEW_TAB_EXPRESSION_FIELD_NAMES = [
    'Vocabulary-Kanji',
    'Vocabulary Kanji',
    'Vocab Kanji',
    'Japanese_Word',
    'Jlab-Kanji',
    ...ANKI_EXPRESSION_FIELD_NAMES,
];
const ANKI_NEW_TAB_READING_FIELD_NAMES = [
    'Vocabulary-Kana',
    'Vocabulary Kana',
    'Vocabulary-Furigana',
    'Vocabulary Furigana',
    'Readings',
    'Jlab-Hiragana',
    ...ANKI_READING_FIELD_NAMES,
];
const ANKI_NEW_TAB_MEANING_FIELD_NAMES = [
    'Vocabulary-English',
    'Vocabulary English',
    'Vocabulary-Meaning',
    'Vocabulary Meaning',
    'Translation_1',
    'Jlab-Translation',
    'Jlab-Remarks',
    'RemarksBack',
    'Other-Back',
    'Jlab-DictionaryLookup',
    'Keyword',
    ...ANKI_MEANING_FIELD_NAMES,
];
let unavailableUntil = 0;

interface AnkiNoteInfo {
    noteId: number;
    modelName: string;
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

interface AnkiCardInfo {
    cardId: number;
    deckName?: string;
    queue: number;
    type: number;
    due?: number;
    reps?: number;
    lapses?: number;
    question?: string;
    answer?: string;
    note?: number;
    isDue?: boolean;
}

interface AnkiNoteCardFields {
    spelling: string;
    reading: string;
    meaning: string;
    partOfSpeech: string;
    sentence: string;
    kind: AnkiCardKind;
}

interface AnkiNewTabCardIdentity {
    primaryCard: AnkiCardInfo | null;
    vid: number;
    sid: number;
    rid: number;
    ankiCardId: number | undefined;
}

interface JapaneseTextStats {
    japaneseLength: number;
    kanaLength: number;
    kanjiLength: number;
    characterLength: number;
}

type AnkiNewTabQueryKind = 'due' | 'new';

type AnkiRenderedCard = NonNullable<JPDBCard['ankiRenderedCards']>[number];

const ANKI_KANJI_FIELD_NAME_PATTERN = /^(?:kanji|keyword|onyomi|kunyomi|on|kun|heisig|frame(?:no|number)?|stroke(?:order|diagram|count)?)$/;
const ANKI_WORD_FIELD_NAME_PATTERN = /vocab|vocabulary|expression|word|term|headword/;
const ANKI_KANA_FIELD_NAME_PATTERN = /^(?:katakana|hiragana|kana|mnemonic)$/;
const ANKI_SENTENCE_FIELD_NAME_PATTERN = /^(?:sentence|sentkanji|sentencetext|japanesesentence|selectiontext|contextsentence)$/;
const ANKI_KANJI_MODEL_PATTERN = /(?:rtk|heisig|kanji)/;

export async function listNewTabAnkiCards(client: AnkiConnectClient, settings: ReaderSettings, limit = 80): Promise<JPDBCard[]> {
    if (!settings.newTabAnkiEnabled || Date.now() < unavailableUntil) return [];
    if (!await client.isAvailableForBackground()) return [];

    try {
        const done = log.time('listNewTabCards', { deck: settings.ankiDeck, model: settings.ankiModel, limit });
        const deckNames = await newTabAnkiDeckNames(client, settings);
        if (!deckNames.length) {
            done();
            return [];
        }
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
    for (const query of newTabAnkiQueries(settings, deckNames, kind)) {
        const loadedCards = await loadNewTabAnkiCardsForQuery(client, settings, query, limit - cards.length, kind, deckNames, seenCards);
        cards.push(...loadedCards);
        if (cards.length >= limit) break;
    }
    return cards.slice(0, Math.max(1, limit));
}

async function loadNewTabAnkiCardsForQuery(
    client: AnkiConnectClient,
    settings: ReaderSettings,
    query: string,
    limit: number,
    kind: AnkiNewTabQueryKind,
    deckNames: string[],
    seenCards: Set<number>,
): Promise<JPDBCard[]> {
    if (limit <= 0) return [];
    const candidateCardIds = ankiCandidateIds(await client.invoke<number[]>('findCards', { query }))
        .filter(cardId => !seenCards.has(Number(cardId)));
    if (!candidateCardIds.length) return [];

    const cards: JPDBCard[] = [];
    let offset = 0;
    let windowSize = newTabAnkiCandidateWindowSize(limit);
    while (offset < candidateCardIds.length && cards.length < limit) {
        const candidateWindow = candidateCardIds.slice(offset, offset + windowSize);
        offset += candidateWindow.length;
        candidateWindow.forEach(cardId => seenCards.add(Number(cardId)));
        const beforeWindow = cards.length;
        cards.push(...await loadNewTabAnkiCardsFromCandidateWindow(
            client,
            settings,
            candidateWindow,
            limit - cards.length,
            kind,
            deckNames,
        ));
        if (cards.length === beforeWindow) {
            windowSize = Math.min(ANKI_CANDIDATE_MAX_WINDOW_SIZE, windowSize * 2);
        }
    }
    return cards.slice(0, Math.max(1, limit));
}

async function loadNewTabAnkiCardsFromCandidateWindow(
    client: AnkiConnectClient,
    settings: ReaderSettings,
    candidateCardIds: number[],
    limit: number,
    kind: AnkiNewTabQueryKind,
    deckNames: string[],
): Promise<JPDBCard[]> {
    if (limit <= 0 || !candidateCardIds.length) return [];
    const reviewCards = await loadReviewableNewTabAnkiCards(client, candidateCardIds, kind, deckNames);
    if (!reviewCards.length) return [];

    const noteIds = unique(reviewCards.map(cardInfo => Number(cardInfo.note)).filter(Number.isFinite));
    const notesById = new Map<number, AnkiNoteInfo>();
    for (const chunk of chunks(noteIds, ANKI_NOTE_INFO_CHUNK_SIZE)) {
        const notes = await client.invoke<AnkiNoteInfo[]>('notesInfo', { notes: chunk }).catch((): AnkiNoteInfo[] => []);
        notes.forEach(note => notesById.set(Number(note.noteId), note));
    }

    const cards: JPDBCard[] = [];
    for (const cardInfo of reviewCards) {
        const noteId = Number(cardInfo.note);
        const note = notesById.get(noteId);
        const card = note ? ankiNoteToCard(note, [cardInfo], settings) : null;
        if (card) cards.push(card);
        if (cards.length >= limit) return cards.slice(0, Math.max(1, limit));
    }
    return cards.slice(0, Math.max(1, limit));
}

function newTabAnkiCandidateWindowSize(limit: number): number {
    return Math.min(
        ANKI_CANDIDATE_MAX_WINDOW_SIZE,
        Math.max(ANKI_CANDIDATE_MIN_WINDOW_SIZE, Math.max(1, limit) * ANKI_CANDIDATE_OVERFETCH),
    );
}

async function newTabAnkiDeckNames(client: AnkiConnectClient, settings: ReaderSettings): Promise<string[]> {
    const names = await client.invoke<unknown>('deckNames').catch(() => []);
    const deckNames = Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())) : [];
    const disabled = (settings.newTabAnkiDisabledDecks ?? []).map(deck => deck.trim()).filter(Boolean);
    const enabledDeckNames = deckNames.filter(deck => !isAnkiDeckDisabled(deck, disabled));
    const fallbackDeck = settings.ankiDeck.trim();
    return deckNames.length ? enabledDeckNames : fallbackDeck && !isAnkiDeckDisabled(fallbackDeck, disabled) ? [fallbackDeck] : [];
}

function isAnkiDeckDisabled(deck: string, disabledDecks: string[]): boolean {
    return disabledDecks.some(disabled => deck === disabled || Boolean(disabled && deck.startsWith(`${disabled}::`)));
}

async function loadReviewableNewTabAnkiCards(client: AnkiConnectClient, candidateCardIds: number[], kind: AnkiNewTabQueryKind, deckNames: string[]): Promise<AnkiCardInfo[]> {
    const dueByCardId = kind === 'due'
        ? await ankiDueFlags(client, candidateCardIds)
        : new Map<number, boolean>();
    const cards = await loadCardInfoChunks(client, chunks(candidateCardIds, ANKI_CARD_INFO_CHUNK_SIZE));
    const cardsById = new Map(cards.map(cardInfo => [Number(cardInfo.cardId), cardInfo]));
    const reviewableCards = candidateCardIds
        .map(cardId => {
            const cardInfo = cardsById.get(Number(cardId));
            if (!cardInfo) return null;
            return kind === 'due' && dueByCardId.has(Number(cardInfo.cardId))
                ? { ...cardInfo, isDue: dueByCardId.get(Number(cardInfo.cardId)) === true }
                : cardInfo;
        })
        .filter((cardInfo): cardInfo is AnkiCardInfo => Boolean(cardInfo))
        .filter(cardInfo => isEnabledAnkiCardDeck(cardInfo, deckNames))
        .filter(cardInfo => isReviewableAnkiCard(cardInfo, kind));
    return orderReviewableNewTabAnkiCards(reviewableCards, candidateCardIds);
}

function isEnabledAnkiCardDeck(cardInfo: AnkiCardInfo, deckNames: string[]): boolean {
    const deckName = cardInfo.deckName?.trim();
    if (!deckName) return true;
    return deckNames.includes(deckName);
}

async function loadCardInfoChunks(client: AnkiConnectClient, cardChunks: number[][]): Promise<AnkiCardInfo[]> {
    const results: AnkiCardInfo[] = [];
    let nextIndex = 0;
    const workerCount = Math.min(ANKI_CARD_INFO_CONCURRENCY, cardChunks.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < cardChunks.length) {
            const chunk = cardChunks[nextIndex++] ?? [];
            results.push(...await client.invoke<AnkiCardInfo[]>('cardsInfo', { cards: chunk }).catch((): AnkiCardInfo[] => []));
        }
    }));
    return results;
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

function isReviewableAnkiCard(cardInfo: AnkiCardInfo, kind: AnkiNewTabQueryKind): boolean {
    if (cardInfo.queue === -1) return false;
    if (kind === 'new') return cardInfo.queue === 0 || cardInfo.type === 0;
    if (cardInfo.queue === 1 || cardInfo.type === 1 || cardInfo.queue === 3 || cardInfo.type === 3) return true;
    return isDueReviewAnkiCard(cardInfo);
}

function orderReviewableNewTabAnkiCards(cards: AnkiCardInfo[], requestedIds: number[]): AnkiCardInfo[] {
    const requestOrder = new Map(requestedIds.map((cardId, index) => [Number(cardId), index]));
    return [...cards].sort((a, b) =>
        newTabAnkiQueueRank(a) - newTabAnkiQueueRank(b)
        || ankiDueValue(a) - ankiDueValue(b)
        || (requestOrder.get(Number(a.cardId)) ?? Number.MAX_SAFE_INTEGER) - (requestOrder.get(Number(b.cardId)) ?? Number.MAX_SAFE_INTEGER)
        || Number(a.cardId) - Number(b.cardId),
    );
}

function newTabAnkiQueueRank(card: AnkiCardInfo): number {
    if (card.type === 3 || card.queue === 3) return 0;
    if (isDueReviewAnkiCard(card)) return 1;
    if (card.queue === 1 || card.type === 1) return 2;
    if (card.queue === 0 || card.type === 0) return 3;
    return 4;
}

function ankiDueValue(card: AnkiCardInfo): number {
    const due = Number(card.due);
    return Number.isFinite(due) ? due : Number.POSITIVE_INFINITY;
}

function ankiNoteToCard(note: AnkiNoteInfo, cards: AnkiCardInfo[], settings: ReaderSettings): JPDBCard | null {
    const noteFields = flattenNoteFields(note.fields);
    const fields = ankiNoteCardFields(note, settings, noteFields);
    if (!fields) return null;
    const identity = ankiNewTabCardIdentity(note, cards, fields.spelling);
    const partOfSpeech = ankiPartOfSpeech(fields);
    return {
        vid: identity.vid,
        sid: identity.sid,
        rid: identity.rid,
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
        ankiCardId: identity.ankiCardId,
        ankiNoteId: note.noteId,
        ankiDeckNames: ankiDeckNames(cards),
        ankiModelName: note.modelName,
        ankiCardKind: fields.kind,
        ankiReps: ankiPrimaryCardReps(identity.primaryCard),
        ankiLapses: ankiPrimaryCardLapses(identity.primaryCard),
        ankiRenderedCards: ankiRenderedCards(cards),
        ankiAudioFilenames: ankiAudioFilenamesFromFields(noteFields),
    };
}

function ankiNewTabCardIdentity(note: AnkiNoteInfo, cards: AnkiCardInfo[], spelling: string): AnkiNewTabCardIdentity {
    const primaryCard = pickPrimaryCard(cards);
    const primaryCardId = primaryCard?.cardId ?? note.cards?.[0];
    return {
        primaryCard,
        vid: -stablePositiveHashId(String(note.noteId)),
        sid: -stablePositiveHashId(`${note.noteId}:${primaryCardId ?? spelling}`),
        rid: primaryCardId ?? 0,
        ankiCardId: primaryCardId ?? undefined,
    };
}

function ankiPartOfSpeech(fields: AnkiNoteCardFields): string[] {
    return fields.partOfSpeech ? [fields.partOfSpeech] : [];
}

function ankiDeckNames(cards: AnkiCardInfo[]): string[] {
    const deckNames: string[] = [];
    for (const card of cards) {
        if (card.deckName) deckNames.push(card.deckName);
    }
    return unique(deckNames);
}

function ankiPrimaryCardReps(card: AnkiCardInfo | null): number {
    return card?.reps ?? 0;
}

function ankiPrimaryCardLapses(card: AnkiCardInfo | null): number {
    return card?.lapses ?? 0;
}

function ankiRenderedCards(cards: AnkiCardInfo[]): AnkiRenderedCard[] {
    const rendered: AnkiRenderedCard[] = [];
    for (const card of cards) {
        if (!card.question && !card.answer) continue;
        rendered.push({
            cardId: card.cardId,
            deckName: card.deckName ?? '',
            question: card.question ?? '',
            answer: card.answer ?? '',
        });
    }
    return rendered;
}

function ankiNoteCardFields(note: AnkiNoteInfo, settings: ReaderSettings, fields = flattenNoteFields(note.fields)): AnkiNoteCardFields | null {
    const mapping = settings.ankiFieldMappings?.[note.modelName];
    const spelling = mappedField(fields, mapping, 'expression')
        || firstField(fields, ANKI_NEW_TAB_EXPRESSION_FIELD_NAMES)
        || firstJapaneseValue(fields);
    if (!spelling) return null;
    return {
        spelling,
        reading: mappedField(fields, mapping, 'reading') || firstField(fields, ANKI_NEW_TAB_READING_FIELD_NAMES) || spelling,
        meaning: mappedField(fields, mapping, 'meaning') || firstField(fields, ANKI_NEW_TAB_MEANING_FIELD_NAMES),
        partOfSpeech: firstField(fields, ['PartOfSpeech', 'Part of Speech', 'POS']),
        sentence: mappedField(fields, mapping, 'sentence') || firstField(fields, ANKI_SENTENCE_FIELD_NAMES),
        kind: classifyAnkiNoteCard(fields, spelling, note.modelName),
    };
}

function ankiAudioFilenamesFromFields(fields: Record<string, string>): string[] | undefined {
    const filenames = unique(Object.values(fields)
        .flatMap(value => Array.from(value.matchAll(/\[sound:([^\]]+)]/gi), match => match[1]?.trim() ?? ''))
        .filter(Boolean));
    return filenames.length ? filenames : undefined;
}

function classifyAnkiNoteCard(fields: Record<string, string>, spelling: string, modelName: string): AnkiCardKind {
    const fieldNames = normalizedAnkiFieldNames(fields);
    const normalizedSpelling = compactAnkiSpelling(spelling);
    const stats = japaneseTextStats(normalizedSpelling);
    if (isAnkiKanjiNote(fieldNames, modelName, stats)) return 'kanji';
    if (isAnkiKanaNote(fieldNames, normalizedSpelling, stats)) return 'kana';
    if (isAnkiSentenceNote(fieldNames, spelling)) return 'sentence';
    return stats.japaneseLength ? 'word' : 'other';
}

function normalizedAnkiFieldNames(fields: Record<string, string>): string[] {
    return Object.keys(fields).map(normalizeAnkiFieldName);
}

function compactAnkiSpelling(spelling: string): string {
    return spelling.replace(/\s+/g, '').trim();
}

function japaneseTextStats(value: string): JapaneseTextStats {
    return {
        japaneseLength: japaneseCharacterCount(value),
        kanaLength: kanaCharacterCount(value),
        kanjiLength: kanjiCharacterCount(value),
        characterLength: Array.from(value).length,
    };
}

function hasAnkiFieldName(fieldNames: string[], pattern: RegExp): boolean {
    return fieldNames.some(name => pattern.test(name));
}

function isAnkiKanjiNote(fieldNames: string[], modelName: string, stats: JapaneseTextStats): boolean {
    if (!isAnkiKanjiDeckLike(fieldNames, modelName)) return false;
    if (isSingleKanjiSpelling(stats)) return true;
    return !hasAnkiFieldName(fieldNames, ANKI_WORD_FIELD_NAME_PATTERN);
}

function isAnkiKanjiDeckLike(fieldNames: string[], modelName: string): boolean {
    return hasAnkiFieldName(fieldNames, ANKI_KANJI_FIELD_NAME_PATTERN)
        || ANKI_KANJI_MODEL_PATTERN.test(normalizeAnkiFieldName(modelName));
}

function isSingleKanjiSpelling(stats: JapaneseTextStats): boolean {
    return stats.japaneseLength === 1
        && stats.kanjiLength === 1
        && stats.characterLength === 1;
}

function isAnkiKanaNote(fieldNames: string[], spelling: string, stats: JapaneseTextStats): boolean {
    return stats.kanaLength > 0
        && stats.kanaLength === stats.japaneseLength
        && spelling.length <= 3
        && hasAnkiFieldName(fieldNames, ANKI_KANA_FIELD_NAME_PATTERN);
}

function isAnkiSentenceNote(fieldNames: string[], spelling: string): boolean {
    if (japaneseSentenceLike(spelling)) return true;
    if (!hasAnkiFieldName(fieldNames, ANKI_SENTENCE_FIELD_NAME_PATTERN)) return false;
    return japaneseCharacterCount(spelling) >= 8;
}

function japaneseCharacterCount(value: string): number {
    return (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
}

function kanjiCharacterCount(value: string): number {
    return (value.match(/[\u3400-\u9fff]/gu) ?? []).length;
}

function kanaCharacterCount(value: string): number {
    return (value.match(/[\u3040-\u30ff]/gu) ?? []).length;
}

function japaneseSentenceLike(value: string): boolean {
    if (/[。！？!?]/u.test(value)) return true;
    if (japaneseCharacterCount(value) >= 12) return true;
    return /(?:^|[\s　]).{2,}[\s　].{2,}/u.test(value) && japaneseCharacterCount(value) >= 8;
}

function firstField(fields: Record<string, string>, names: string[]): string {
    for (const name of names) {
        const value = fields[name]?.replace(/\s+/g, ' ').trim();
        if (value) return value;
    }
    const normalizedNames = new Set(names.map(normalizeAnkiFieldName));
    for (const [fieldName, value] of Object.entries(fields)) {
        if (!normalizedNames.has(normalizeAnkiFieldName(fieldName))) continue;
        const normalizedValue = value.replace(/\s+/g, ' ').trim();
        if (normalizedValue) return normalizedValue;
    }
    return '';
}

function mappedField(fields: Record<string, string>, mapping: AnkiFieldMapping | undefined, role: keyof AnkiFieldMapping): string {
    const mappedName = mapping?.[role]?.trim();
    if (!mappedName) return '';
    const exact = fields[mappedName];
    if (exact?.trim()) return exact.replace(/\s+/g, ' ').trim();
    const normalizedName = normalizeAnkiFieldName(mappedName);
    for (const [fieldName, value] of Object.entries(fields)) {
        if (normalizeAnkiFieldName(fieldName) !== normalizedName) continue;
        const normalizedValue = value.replace(/\s+/g, ' ').trim();
        if (normalizedValue) return normalizedValue;
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

function stateFromAnkiCards(cards: AnkiCardInfo[]): CardState {
    if (!cards.length) return 'known';
    return ANKI_CARD_STATE_RULES.find(rule => cards.some(rule.matches))?.state ?? 'known';
}

const ANKI_CARD_STATE_RULES: Array<{ state: CardState; matches: (card: AnkiCardInfo) => boolean }> = [
    { state: 'suspended', matches: card => card.queue === -1 },
    { state: 'failed', matches: card => card.type === 3 || card.queue === 3 },
    { state: 'learning', matches: card => card.queue === 1 || card.type === 1 },
    { state: 'new', matches: card => card.queue === 0 || card.type === 0 },
    { state: 'due', matches: card => isDueReviewAnkiCard(card) },
];

function pickPrimaryCard(cards: AnkiCardInfo[]): AnkiCardInfo | null {
    const order = (card: AnkiCardInfo) => {
        if (card.type === 3 || card.queue === 3) return 0;
        if (isDueReviewAnkiCard(card)) return 1;
        if (card.queue === 1 || card.type === 1) return 2;
        if (card.queue === 0 || card.type === 0) return 3;
        return 4;
    };
    return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}

function isDueReviewAnkiCard(card: AnkiCardInfo): boolean {
    return card.queue === 2 && card.isDue === true;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}
