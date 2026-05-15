import { escapeHtml } from './dom';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import { Logger } from './logger';
import type { CardState, DictionaryPreference, JPDBCard, JPDBGrade, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import {
    glossaryToHtml,
    glossaryToText,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const ANKI_VERSION = 6;
const log = Logger.scope('Anki');
const ANKI_EASE_BY_GRADE: Record<JPDBGrade, number> = {
    nothing: 1,
    fail: 1,
    something: 2,
    hard: 2,
    okay: 3,
    pass: 3,
    easy: 4,
};
export const YOMU_MODEL_FIELDS = [
    'Expression',
    'Reading',
    'Meaning',
    'Sentence',
    'Url',
    'Frequency',
    'PartOfSpeech',
    'Image',
    'JPDB',
    'Status',
    'Pitch',
    'DictionaryDefinitions',
    'Kanji',
    'Source',
];

interface AnkiResponse<T> {
    result: T;
    error: string | null;
}

interface AnkiNote {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags?: string[];
    options?: {
        allowDuplicate?: boolean;
        duplicateScope?: string;
    };
    picture?: Array<{
        filename: string;
        data: string;
        fields: string[];
    }>;
}

type AnkiPicture = NonNullable<AnkiNote['picture']>[number];

interface AnkiNoteInfo {
    noteId: number;
    modelName: string;
    tags: string[];
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

interface AnkiCardInfo {
    cardId: number;
    deckName: string;
    queue: number;
    type: number;
    due?: number;
    reps?: number;
    lapses?: number;
    interval?: number;
    note?: number;
}

export interface AnkiExistingNote {
    noteId: number;
    modelName: string;
    deckNames: string[];
    cardIds: number[];
    primaryCardId: number | null;
    state: CardState;
    fields: Record<string, string>;
    tags: string[];
    reps: number;
    lapses: number;
}

export interface AnkiLookupResult {
    state: CardState;
    notes: AnkiExistingNote[];
    primary: AnkiExistingNote | null;
}

export interface AnkiCardContext {
    deckName?: string;
    imageDataUrl?: string;
    localEntries?: YomitanTermEntry[];
    kanjiEntries?: YomitanKanjiEntry[];
    metaEntries?: YomitanMetaEntry[];
    dictionaryPreferences?: DictionaryPreference[];
    sourceUrl?: string;
    sourceTitle?: string;
}

interface AnkiFieldContext {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    dictionaryPreferences: DictionaryPreference[];
    sourceUrl: string;
    sourceTitle: string;
}

interface ParsedAnkiImageDataUrl {
    extension: string;
    data: string;
}

export class AnkiConnectClient {
    private lookupCache = new Map<string, { at: number; result: AnkiLookupResult }>();
    private unavailableUntil = 0;

    constructor(private getSettings: () => ReaderSettings) {}

    async isConnected(): Promise<boolean> {
        try {
            await this.invoke<number>('version');
            return true;
        } catch (error) {
            log.warnOnce('connection-unavailable', 'AnkiConnect unavailable', error);
            return false;
        }
    }

    async deckNames(): Promise<string[]> {
        const decks = await this.invoke<string[]>('deckNames');
        return decks;
    }

    async modelNames(): Promise<string[]> {
        const models = await this.invoke<string[]>('modelNames');
        return models;
    }

    async findExistingCards(card: JPDBCard): Promise<AnkiLookupResult> {
        const empty = emptyAnkiLookupResult();
        if (canUseMobileAnkiHandoff(this.getSettings())) return empty;
        if (this.isLookupCoolingDown()) return empty;
        const cacheKey = `${card.spelling}|${card.reading}`;
        const cached = this.readLookupCache(cacheKey);
        if (cached) return cached;
        return await this.findExistingCardsUncached(card, cacheKey, empty);
    }

    private isLookupCoolingDown(): boolean {
        if (Date.now() >= this.unavailableUntil) return false;
        return true;
    }

    private async findExistingCardsUncached(card: JPDBCard, cacheKey: string, empty: AnkiLookupResult): Promise<AnkiLookupResult> {
        try {
            const done = log.time('findExistingCards', { term: card.spelling });
            const noteIds = await this.findCandidateNoteIds(card);
            if (!noteIds.size) {
                this.writeLookupCache(cacheKey, empty);
                done();
                return empty;
            }

            const { existing } = await this.loadExistingNotes(card, noteIds);
            if (!existing.length) {
                this.writeLookupCache(cacheKey, empty);
                done();
                return empty;
            }

            const result: AnkiLookupResult = {
                state: stateFromExistingNotes(existing),
                notes: existing,
                primary: pickPrimaryExistingNote(existing),
            };
            this.writeLookupCache(cacheKey, result);
            done();
            return result;
        } catch (error) {
            log.warn('Anki lookup failed; entering cooldown', { term: card.spelling }, error);
            this.unavailableUntil = Date.now() + 30000;
            return empty;
        }
    }

    private readLookupCache(cacheKey: string): AnkiLookupResult | null {
        const cached = this.lookupCache.get(cacheKey);
        if (!cached || Date.now() - cached.at >= 45000) return null;
        return cached.result;
    }

    private writeLookupCache(cacheKey: string, result: AnkiLookupResult): void {
        this.lookupCache.set(cacheKey, { at: Date.now(), result });
    }

    private async findCandidateNoteIds(card: JPDBCard): Promise<Set<number>> {
        const noteIds = new Set<number>();
        for (const term of unique([card.spelling, card.reading].filter(Boolean))) {
            const ids = await this.invoke<number[]>('findNotes', { query: quoteAnkiSearch(term) }).catch((): number[] => []);
            ids.forEach(id => noteIds.add(id));
        }
        return noteIds;
    }

    private async loadExistingNotes(card: JPDBCard, noteIds: Set<number>): Promise<{ existing: AnkiExistingNote[]; candidateNotes: number }> {
        const notes = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [...noteIds] });
        const matchingNotes = notes.filter(note => noteLooksLikeCard(note, card));
        const cardsByNote = await this.loadCardsByNote(matchingNotes);
        return {
            existing: matchingNotes.map(note => ankiExistingNoteFromInfo(note, cardsByNote.get(note.noteId) ?? [])),
            candidateNotes: notes.length,
        };
    }

    private async loadCardsByNote(notes: AnkiNoteInfo[]): Promise<Map<number, AnkiCardInfo[]>> {
        const cardIds = unique(notes.flatMap(note => note.cards ?? []));
        const cards = cardIds.length
            ? await this.invoke<AnkiCardInfo[]>('cardsInfo', { cards: cardIds }).catch((): AnkiCardInfo[] => [])
            : [];
        return cardsByNoteId(cards);
    }

    async answerCard(cardId: number, grade: JPDBGrade): Promise<void> {
        const ease = ankiEaseFromGrade(grade);
        log.info('Answering Anki card', { cardId, grade, ease });
        await this.invoke<null>('answerCards', { answers: [{ cardId, ease }] });
    }

    async browseNote(noteId: number): Promise<void> {
        log.info('Opening Anki note browser', { noteId });
        await this.invoke<unknown>('guiBrowse', { query: `nid:${noteId}` });
    }

    async addCard(card: JPDBCard, sentence = '', options: AnkiCardContext = {}): Promise<number | null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) {
            return null;
        }
        const note = this.buildAnkiNote(card, sentence, settings, options);
        this.logAnkiNoteAdd(card, note);
        if (this.openMobileHandoffIfPreferred(settings, note, card)) return null;

        try {
            return await this.addNoteViaConnect(note, card);
        } catch (error) {
            return this.addCardWithFallback(error, settings, note, card);
        }
    }

    private buildAnkiNote(card: JPDBCard, sentence: string, settings: ReaderSettings, options: AnkiCardContext): AnkiNote {
        const note: AnkiNote = {
            deckName: this.ankiDeckName(options, settings),
            modelName: settings.ankiModel || 'よむ Japanese',
            fields: buildYomuAnkiFields(card, sentence, this.ankiFieldContext(options, settings)),
            tags: tagsFromString(settings.ankiTags),
            options: {
                allowDuplicate: false,
                duplicateScope: 'collection',
            },
        };
        this.attachAnkiNoteImage(note, options.imageDataUrl, card);
        return note;
    }

    private ankiDeckName(options: AnkiCardContext, settings: ReaderSettings): string {
        return options.deckName?.trim() || settings.ankiDeck || 'よむ';
    }

    private ankiFieldContext(options: AnkiCardContext, settings: ReaderSettings): AnkiCardContext {
        return {
            ...options,
            sourceUrl: options.sourceUrl ?? safeLocationHref(),
            sourceTitle: options.sourceTitle ?? safeDocumentTitle(),
            dictionaryPreferences: options.dictionaryPreferences ?? settings.dictionaryPreferences,
        };
    }

    private attachAnkiNoteImage(note: AnkiNote, imageDataUrl: string | undefined, card: JPDBCard): void {
        const image = imageDataUrl ? imageFromDataUrl(imageDataUrl, card) : null;
        if (image) note.picture = [image];
    }

    private logAnkiNoteAdd(card: JPDBCard, note: AnkiNote): void {
        log.info('Adding Anki note', {
            term: card.spelling,
            deck: note.deckName,
            model: note.modelName,
            hasImage: Boolean(note.picture?.length),
            tags: note.tags,
        });
    }

    private openMobileHandoffIfPreferred(settings: ReaderSettings, note: AnkiNote, card: JPDBCard): boolean {
        if (!canUseMobileAnkiHandoff(settings)) return false;
        log.info('Opening mobile Anki handoff', { term: card.spelling });
        if (!openMobileAnkiHandoff(note)) throw new Error('Anki handoff cancelled.');
        return true;
    }

    private async addNoteViaConnect(note: AnkiNote, card: JPDBCard): Promise<number | null> {
        await this.ensureDeckAndModel(note.deckName);
        const noteId = await this.invoke<number | null>('addNote', { note });
        log.info('Anki note added', { term: card.spelling, noteId });
        return noteId;
    }

    private addCardWithFallback(error: unknown, settings: ReaderSettings, note: AnkiNote, card: JPDBCard): null {
        if (!settings.ankiMobileHandoff || !isMobileUserAgent()) throw error;
        log.warn('AnkiConnect add failed; trying mobile handoff', { term: card.spelling }, error);
        if (!openMobileAnkiHandoff(note)) throw new Error('Anki handoff cancelled.');
        return null;
    }

    async ensureDeckAndModel(deckOverride?: string): Promise<void> {
        const settings = this.getSettings();
        const deckName = resolvedAnkiDeckName(deckOverride, settings);
        const modelName = resolvedAnkiModelName(settings);
        await this.ensureDeck(deckName);
        const modelNames = await this.modelNames().catch((): string[] => []);
        await this.ensureYomuModel(modelNames, modelName, settings);
    }

    private async ensureDeck(deckName: string): Promise<void> {
        await this.invoke<null>('createDeck', { deck: deckName }).catch(() => {
            return null;
        });
    }

    private async updateExistingModel(modelName: string, settings: ReaderSettings): Promise<void> {
        await this.ensureModelFields(modelName);
        await this.invoke<null>('updateModelTemplates', { model: { name: modelName, templates: yomuCardTemplates(settings.ankiTemplateMode) } });
        await this.invoke<null>('updateModelStyling', { model: { name: modelName, css: yomuCardCss() } });
    }

    private async ensureYomuModel(modelNames: string[], modelName: string, settings: ReaderSettings): Promise<void> {
        return modelNames.includes(modelName)
            ? await this.updateExistingModel(modelName, settings)
            : await this.createYomuModel(modelName, settings);
    }

    private async createYomuModel(modelName: string, settings: ReaderSettings): Promise<void> {
        await this.invoke<unknown>('createModel', {
            modelName,
            inOrderFields: YOMU_MODEL_FIELDS,
            css: yomuCardCss(),
            cardTemplates: Object.entries(yomuCardTemplates(settings.ankiTemplateMode)).map(([Name, template]) => ({ Name, ...template })),
        });
        log.info('Anki model created', { modelName });
    }

    private async ensureModelFields(modelName: string): Promise<void> {
        const fieldNames = await this.invoke<string[]>('modelFieldNames', { modelName }).catch((): string[] => []);
        const existing = new Set(fieldNames);
        for (const fieldName of YOMU_MODEL_FIELDS) {
            if (!existing.has(fieldName)) {
                await this.invoke<null>('modelFieldAdd', { modelName, fieldName });
            }
        }
    }

    async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
        const settings = this.getSettings();
        const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
        const body = JSON.stringify({ action, version: ANKI_VERSION, params });
        const response = await postJson<AnkiResponse<T>>(url, body);
        if (response.error) {
            log.warn('AnkiConnect action returned error', { action, error: response.error });
            throw new Error(response.error);
        }
        return response.result;
    }
}

export function captureActiveVideoFrame(): string | undefined {
    const video = Array.from(document.querySelectorAll('video'))
        .filter(item => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0)
        .sort((a, b) => visibleArea(b) - visibleArea(a))[0];
    if (!video) {
        return undefined;
    }
    try {
        const canvas = document.createElement('canvas');
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        return dataUrl;
    } catch (error) {
        log.warn('Active video frame capture failed', error);
        return undefined;
    }
}

function postJson<T>(url: string, body: string): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.status >= 200 && response.status < 300) resolve(response.response as T);
                else reject(new Error(`AnkiConnect request failed (${response.status}).`));
            };
            const result = userscriptRequest({
                method: 'POST',
                url,
                headers: { 'Content-Type': 'application/json' },
                data: body,
                responseType: 'json',
                timeout: 5000,
                onload: handleLoad,
                onerror: reject,
                ontimeout: () => reject(new Error('AnkiConnect timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, reject);
            }
        });
    }

    if (!canFetchAnkiConnect(url)) {
        return Promise.reject(new Error('AnkiConnect needs the userscript request bridge on content pages.'));
    }

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    }).then(async response => {
        if (!response.ok) throw new Error(`AnkiConnect request failed (${response.status}).`);
        return response.json() as Promise<T>;
    });
}

function resolvedAnkiDeckName(deckOverride: string | undefined, settings: ReaderSettings): string {
    return deckOverride?.trim() || settings.ankiDeck || 'よむ';
}

function resolvedAnkiModelName(settings: ReaderSettings): string {
    return settings.ankiModel || 'よむ Japanese';
}

function canFetchAnkiConnect(url: string): boolean {
    try {
        const target = new URL(url, location.href);
        if (target.origin === location.origin) return true;
        return ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    } catch {
        return false;
    }
}

export function buildYomuAnkiFields(card: JPDBCard, sentence = '', context: AnkiCardContext = {}): Record<string, string> {
    const fieldContext = ankiFieldContext(context);
    const jpdbUrl = jpdbVocabularyUrl(card);
    return {
        Expression: escapeHtml(card.spelling),
        Reading: renderCardReading(card),
        Meaning: renderJpdbMeanings(card),
        Sentence: renderSentence(sentence, card.spelling),
        Url: escapeHtml(fieldContext.sourceUrl),
        Frequency: renderFrequency(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        PartOfSpeech: renderPartOfSpeech(card.partOfSpeech),
        Image: '',
        JPDB: renderJpdbLink(jpdbUrl),
        Status: renderCardStatus(card),
        Pitch: renderPitchField(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        DictionaryDefinitions: renderDictionaryDefinitions(fieldContext.localEntries, fieldContext.dictionaryPreferences),
        Kanji: renderKanjiDefinitions(fieldContext.kanjiEntries, fieldContext.dictionaryPreferences),
        Source: renderSource(fieldContext.sourceUrl, fieldContext.sourceTitle),
    };
}

function renderCardReading(card: JPDBCard): string {
    return card.reading && card.reading !== card.spelling ? escapeHtml(card.reading) : '';
}

function renderPartOfSpeech(partOfSpeech: string[]): string {
    return escapeHtml(formatPartOfSpeech(partOfSpeech) || formatPartOfSpeechDetails(partOfSpeech));
}

function renderJpdbLink(jpdbUrl: string): string {
    return jpdbUrl ? `<a href="${jpdbUrl}">Open on JPDB</a>` : '';
}

function ankiFieldContext(context: AnkiCardContext): AnkiFieldContext {
    return {
        localEntries: fallbackArray(context.localEntries),
        kanjiEntries: fallbackArray(context.kanjiEntries),
        metaEntries: fallbackArray(context.metaEntries),
        dictionaryPreferences: fallbackArray(context.dictionaryPreferences),
        sourceUrl: fallbackString(context.sourceUrl),
        sourceTitle: fallbackString(context.sourceTitle),
    };
}

function fallbackArray<T>(value: T[] | undefined): T[] {
    return value ?? [];
}

function fallbackString(value: string | undefined): string {
    return value ?? '';
}

function jpdbVocabularyUrl(card: JPDBCard): string {
    return card.source === 'local' || card.source === 'anki'
        ? ''
        : `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
}

function renderCardStatus(card: JPDBCard): string {
    if (card.source === 'local') return '<span class="yomu-chip">local dictionary</span>';
    if (card.source === 'anki') return '<span class="yomu-chip">Anki</span>';
    return card.cardState.map(state => `<span class="yomu-chip">${escapeHtml(state)}</span>`).join(' ');
}

function tagsFromString(value: string): string[] {
    return value.split(/[,\s]+/).map(tag => tag.trim()).filter(Boolean);
}

function imageFromDataUrl(dataUrl: string, card: JPDBCard): AnkiPicture | null {
    const parsed = parseAnkiImageDataUrl(dataUrl);
    if (!parsed) return null;
    return {
        filename: `yomu_${safeAnkiImageName(card)}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Image'],
    };
}

function parseAnkiImageDataUrl(dataUrl: string): ParsedAnkiImageDataUrl | null {
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiImageExtension(match[1]), data: match[2] } : null;
}

function ankiImageExtension(rawExtension: string): string {
    const extension = rawExtension.toLowerCase();
    if (extension === 'jpeg') return 'jpg';
    return extension === 'svg+xml' ? 'svg' : extension;
}

function safeAnkiImageName(card: JPDBCard): string {
    return card.spelling.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 24) || 'yomu';
}

function isMobileUserAgent(): boolean {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /iPad|iPhone|iPod|Android/i.test(userAgent);
}

function isMobileAnkiHandoffEnvironment(): boolean {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /iPad|iPhone|iPod/i.test(userAgent)
        || (/Android/i.test(userAgent) && /Chrome|Firefox|Firefox\/|FxiOS|EdgA/i.test(userAgent));
}

export function canUseMobileAnkiHandoff(settings: ReaderSettings): boolean {
    return settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
}

function openMobileAnkiHandoff(note: AnkiNote): boolean {
    const handoff = mobileAnkiHandoffTarget(note);
    if (!window.confirm(mobileAnkiHandoffPrompt(note, handoff.appName))) return false;
    location.href = handoff.url;
    return true;
}

function mobileAnkiHandoffTarget(note: AnkiNote): { appName: string; url: string } {
    if (isAndroidUserAgent()) return { appName: 'AnkiDroid', url: androidAnkiDroidIntentUrl(note) };
    return { appName: 'AnkiMobile', url: iosAnkiMobileUrl(note) };
}

function isAndroidUserAgent(): boolean {
    return /Android/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);
}

function mobileAnkiHandoffPrompt(note: AnkiNote, appName: string): string {
    const title = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || 'this note');
    return `Open ${appName} to add "${title}"?`;
}

function iosAnkiMobileUrl(note: AnkiNote): string {
    const params = new URLSearchParams();
    params.set('type', note.modelName);
    params.set('deck', note.deckName);
    params.set('dupes', '1');
    if (note.tags?.length) params.set('tags', note.tags.join(' '));
    Object.entries(note.fields).forEach(([field, value]) => {
        const handoffValue = iosAnkiMobileFieldValue(field, value);
        if (handoffValue !== null) params.set(`fld${field}`, handoffValue);
    });
    return `anki://x-callback-url/addnote?${params.toString()}`;
}

function iosAnkiMobileFieldValue(field: string, value: string): string | null {
    if (field !== 'Image') return value;
    const trimmed = value.trim();
    if (!trimmed || /^data:/i.test(trimmed)) return null;
    return trimmed;
}

function androidAnkiDroidIntentUrl(note: AnkiNote): string {
    const front = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || '');
    const back = stripForMobileHandoff([
        note.fields.Reading,
        note.fields.Meaning,
        note.fields.DictionaryDefinitions,
        note.fields.Source,
    ].filter(Boolean).join('\n\n'));
    return [
        'intent:#Intent',
        'action=android.intent.action.SEND',
        'type=text/plain',
        'package=com.ichi2.anki',
        `S.android.intent.extra.SUBJECT=${encodeURIComponent(front)}`,
        `S.android.intent.extra.TEXT=${encodeURIComponent(back)}`,
        `S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.ichi2.anki')}`,
        'end',
    ].join(';');
}

function stripForMobileHandoff(value: string): string {
    return stripHtml(value).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function visibleArea(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
}

function quoteAnkiSearch(term: string): string {
    return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function flattenNoteFields(fields: AnkiNoteInfo['fields']): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(fields ?? {}).forEach(([name, value]) => {
        out[name] = stripHtml(String(value?.value ?? ''));
    });
    return out;
}

function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}

function cardsByNoteId(cards: AnkiCardInfo[]): Map<number, AnkiCardInfo[]> {
    const cardsByNote = new Map<number, AnkiCardInfo[]>();
    for (const cardInfo of cards) addCardInfoByNoteId(cardsByNote, cardInfo);
    return cardsByNote;
}

function addCardInfoByNoteId(cardsByNote: Map<number, AnkiCardInfo[]>, cardInfo: AnkiCardInfo): void {
    const noteId = Number(cardInfo.note);
    if (!Number.isFinite(noteId)) return;
    const list = cardsByNote.get(noteId) ?? [];
    list.push(cardInfo);
    cardsByNote.set(noteId, list);
}

function ankiExistingNoteFromInfo(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): AnkiExistingNote {
    const state = stateFromAnkiCards(noteCards);
    return {
        noteId: note.noteId,
        modelName: note.modelName,
        deckNames: ankiNoteDeckNames(noteCards),
        cardIds: note.cards ?? [],
        primaryCardId: ankiNotePrimaryCardId(note, noteCards),
        state,
        fields: flattenNoteFields(note.fields),
        tags: note.tags ?? [],
        ...ankiNoteReviewMetrics(noteCards),
    };
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

function noteLooksLikeCard(note: AnkiNoteInfo, card: JPDBCard): boolean {
    const fields = flattenNoteFields(note.fields);
    const exactTargets = noteCardExactTargets(card);
    return noteHasExactTarget(fields, exactTargets)
        || noteExpressionContainsTarget(fields, exactTargets)
        || noteReadingContainsTarget(fields, card);
}

function noteCardExactTargets(card: JPDBCard): string[] {
    return unique([card.spelling, card.reading].filter(Boolean));
}

function noteFieldValues(fields: Record<string, string>): string[] {
    return Object.values(fields).map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function noteHasExactTarget(fields: Record<string, string>, exactTargets: string[]): boolean {
    const values = noteFieldValues(fields);
    return exactTargets.some(target => values.some(value => value === target));
}

function noteExpressionContainsTarget(fields: Record<string, string>, exactTargets: string[]): boolean {
    const expression = firstNoteField(fields, ['Expression', 'Front', 'Word', 'Vocab', 'Term', 'Expression Reading']);
    return Boolean(expression && exactTargets.some(target => expression.includes(target)));
}

function firstNoteField(fields: Record<string, string>, names: string[]): string {
    return names.map(name => fields[name]).find(Boolean) ?? '';
}

function noteReadingContainsTarget(fields: Record<string, string>, card: JPDBCard): boolean {
    const reading = firstNoteReading(fields);
    return Boolean(reading && card.reading && reading.includes(card.reading));
}

function firstNoteReading(fields: Record<string, string>): string {
    return firstNoteField(fields, ['Reading', 'Kana', 'Yomi']);
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

function stateFromExistingNotes(notes: AnkiExistingNote[]): CardState {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'suspended'];
    return order.find(state => notes.some(note => note.state === state)) ?? (notes.length ? 'known' : 'not-in-deck');
}

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

function pickPrimaryExistingNote(notes: AnkiExistingNote[]): AnkiExistingNote | null {
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

function ankiEaseFromGrade(grade: JPDBGrade): number {
    return ANKI_EASE_BY_GRADE[grade] ?? 3;
}

function yomuCardTemplates(mode: ReaderSettings['ankiTemplateMode'] = 'recognition'): Record<string, { Front: string; Back: string }> {
    const recognitionFront = `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
    {{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}
    {{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}
</main>`;
    const contextFront = `
<main class="yomu-card yomu-front">
    {{#Sentence}}<div class="yomu-sentence yomu-sentence-front">{{Sentence}}</div>{{/Sentence}}
    {{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}
    <div class="yomu-prompt">Recall the highlighted word.</div>
</main>`;
    const back = `
{{FrontSide}}
<main class="yomu-card yomu-back">
    <section class="yomu-section yomu-answer">
        <div class="yomu-expression">{{Expression}}</div>
        {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
    </section>
    {{#Meaning}}<section class="yomu-section"><h2>Meaning</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>Dictionaries</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>Kanji</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>Frequency</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>Pitch</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>Part of speech</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#Status}}<div><strong>Status</strong><span>{{Status}}</span></div>{{/Status}}
        {{#JPDB}}<div><strong>Links</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>Source</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`;
    return {
        [mode === 'context' ? 'Context' : 'Recognition']: {
            Front: mode === 'context' ? contextFront : recognitionFront,
            Back: back,
        },
    };
}

function yomuCardCss(): string {
    return `
.card {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 20px;
    line-height: 1.45;
    text-align: left;
    color: #f4f7fb;
    background: #15181e;
}
.yomu-card { max-width: 760px; margin: 0 auto; padding: 22px; }
.yomu-expression { font-size: 44px; font-weight: 850; letter-spacing: 0; line-height: 1.1; }
.yomu-reading { margin-top: 6px; color: #bac3d0; font-size: 24px; }
.yomu-prompt { margin-top: 14px; color: #bac3d0; font-size: 16px; }
.yomu-sentence {
    margin-top: 18px;
    padding: 14px 16px;
    border: 1px solid #323843;
    border-radius: 12px;
    background: #1e232b;
    color: #d8dee8;
}
.yomu-highlight { color: #7ad119; font-weight: 800; }
.yomu-sentence-front { font-size: 28px; }
.yomu-image img, .yomu-image { max-width: 100%; border-radius: 10px; margin-top: 16px; }
.yomu-section {
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px solid #303641;
    border-radius: 12px;
    background: #1b2028;
}
.yomu-section h2 {
    margin: 0 0 10px;
    color: #c2cad7;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
}
.yomu-definition, .yomu-dict-entry, .yomu-kanji-entry { margin-top: 12px; }
.yomu-definition:first-child, .yomu-dict-entry:first-child, .yomu-kanji-entry:first-child { margin-top: 0; }
.yomu-pos, .yomu-dict-label, .yomu-tags {
    display: inline-block;
    margin: 0 8px 6px 0;
    color: #92a0b3;
    font-size: 14px;
    font-style: italic;
}
.yomu-glossary div { margin-top: 4px; }
.yomu-dict-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.yomu-dict-expression, .yomu-kanji-char { color: #fff; font-size: 24px; font-weight: 800; }
.yomu-dict-reading, .yomu-kanji-reading { color: #aab4c2; }
.yomu-kanji-char { font-size: 34px; }
.yomu-chip {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 2px 8px;
    border: 1px solid #4b5565;
    border-radius: 999px;
    color: #cdd5e1;
    font-size: 14px;
}
.yomu-meta > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.yomu-meta > div:first-child { margin-top: 0; }
.yomu-meta strong { min-width: 112px; color: #8f9aaa; }
a { color: #7ad119; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 6px 0 0 22px; padding: 0; }
table { max-width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #353c47; padding: 4px 6px; }
`;
}

function renderJpdbMeanings(card: JPDBCard): string {
    return card.meanings.slice(0, 8).map(meaning => {
        const pos = formatPartOfSpeech(meaning.partOfSpeech);
        return `<div class="yomu-definition">
            ${pos ? `<span class="yomu-pos">${escapeHtml(pos)}</span>` : ''}
            <div>${escapeHtml(meaning.glosses.join('; '))}</div>
        </div>`;
    }).join('');
}

function renderSentence(sentence: string, expression: string): string {
    if (!sentence) return '';
    if (!expression || !sentence.includes(expression)) return escapeHtml(sentence);
    return sentence.split(expression)
        .map(part => escapeHtml(part))
        .join(`<span class="yomu-highlight">${escapeHtml(expression)}</span>`);
}

function renderDictionaryDefinitions(entries: YomitanTermEntry[], preferences: DictionaryPreference[]): string {
    const groups = groupTermEntriesByDictionary(entries).slice(0, 6);
    return groups.map(([dictionary, items]) => `
        <div class="yomu-dict-group">
            <h3 class="yomu-dict-label">${escapeHtml(dictionaryLabel(dictionary, preferences))}</h3>
            ${items.slice(0, 6).map(entry => `
                <div class="yomu-dict-entry">
                    <div class="yomu-dict-head">
                        <span class="yomu-dict-expression">${escapeHtml(entry.expression)}</span>
                        ${entry.reading && entry.reading !== entry.expression ? `<span class="yomu-dict-reading">${escapeHtml(entry.reading)}</span>` : ''}
                        ${entry.definitionTags || entry.rules || entry.termTags ? `<span class="yomu-tags">${escapeHtml([entry.definitionTags, entry.rules, entry.termTags].filter(Boolean).join(' · '))}</span>` : ''}
                    </div>
                    <div class="yomu-glossary" data-dictionary="${escapeHtml(entry.dictionary)}">${entry.glossary.slice(0, 5).map(item => `<div>${safeGlossaryHtml(item, entry.dictionary)}</div>`).join('')}</div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderKanjiDefinitions(entries: YomitanKanjiEntry[], preferences: DictionaryPreference[]): string {
    const byCharacter = new Map<string, YomitanKanjiEntry[]>();
    for (const entry of entries) {
        const group = byCharacter.get(entry.character) ?? [];
        group.push(entry);
        byCharacter.set(entry.character, group);
    }
    return Array.from(byCharacter.entries()).slice(0, 8).map(([character, items]) => `
        <div class="yomu-kanji-entry">
            <div class="yomu-dict-head">
                <span class="yomu-kanji-char">${escapeHtml(character)}</span>
                <span class="yomu-dict-label">${escapeHtml(items.map(item => dictionaryLabel(item.dictionary, preferences)).filter(uniqueValue).slice(0, 3).join(' · '))}</span>
            </div>
            ${items.slice(0, 3).map(item => `
                <div>
                    ${item.onyomi.length ? `<span class="yomu-kanji-reading">On ${escapeHtml(item.onyomi.join('、'))}</span>` : ''}
                    ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> Kun ${escapeHtml(item.kunyomi.join('、'))}</span>` : ''}
                    <div>${item.meanings.slice(0, 8).map(meaning => escapeHtml(meaning)).join('; ')}</div>
                    ${item.tags.length ? `<span class="yomu-tags">${escapeHtml(item.tags.join(' · '))}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderFrequency(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips: string[] = [];
    if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
    for (const entry of entries) {
        appendFrequencyChip(chips, entry, preferences);
        if (chips.length >= 8) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function appendFrequencyChip(chips: string[], entry: YomitanMetaEntry, preferences: DictionaryPreference[]): void {
    if (entry.mode !== 'freq') return;
    const value = formatMetaFrequency(entry.data);
    if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
}

function renderPitchField(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips = card.pitchAccent.slice(0, 4).map(pitch => `<span class="yomu-chip">JPDB ${escapeHtml(pitch)}</span>`);
    for (const entry of entries) {
        appendPitchChip(chips, entry, preferences);
        if (chips.length >= 8) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function appendPitchChip(chips: string[], entry: YomitanMetaEntry, preferences: DictionaryPreference[]): void {
    if (entry.mode !== 'pitch') return;
    const value = formatMetaPitch(entry.data);
    if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
}

function renderSource(sourceUrl: string, sourceTitle: string): string {
    const source = ankiSourceLink(sourceUrl, sourceTitle);
    if (!source.label) return '';
    return source.href ? `<a href="${escapeHtml(source.href)}">${escapeHtml(source.label)}</a>` : escapeHtml(source.label);
}

function ankiSourceLink(sourceUrl: string, sourceTitle: string): { href: string; label: string } {
    return { href: sourceUrl, label: sourceTitle || sourceUrl };
}

function groupTermEntriesByDictionary(entries: YomitanTermEntry[]): Array<[string, YomitanTermEntry[]]> {
    const grouped = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const group = grouped.get(entry.dictionary) ?? [];
        group.push(entry);
        grouped.set(entry.dictionary, group);
    }
    return Array.from(grouped.entries());
}

function dictionaryLabel(name: string, preferences: DictionaryPreference[]): string {
    return preferences.find(item => item.name === name)?.alias || name;
}

function uniqueValue<T>(value: T, index: number, array: T[]): boolean {
    return array.indexOf(value) === index;
}

function safeGlossaryHtml(value: unknown, dictionary: string): string {
    const html = glossaryToHtml(value, dictionary);
    return html || escapeHtml(glossaryToText(value));
}

function formatMetaFrequency(value: unknown): string {
    const display = metaFrequencyDisplayValue(value);
    return display == null ? '' : `#${display}`;
}

function metaFrequencyDisplayValue(value: unknown): string | null {
    if (typeof value === 'number' || typeof value === 'string') return String(value);
    return scalarMetaValue(nestedMetaScalarValue(value));
}

function scalarMetaValue(value: unknown): string | null {
    if (typeof value === 'number' || typeof value === 'string') return String(value);
    const nested = nestedMetaScalarValue(value);
    return nested === undefined ? null : scalarMetaValue(nested);
}

function nestedMetaScalarValue(value: unknown): unknown {
    const record = metaRecord(value);
    return record ? record.displayValue ?? record.frequency ?? record.value : undefined;
}

function formatMetaPitch(value: unknown): string {
    const record = metaRecord(value);
    if (!record) return '';
    const positions = metaPitchPositions(record);
    return positions.length ? formatPitchPositions(positions) : formatPitchPosition(record.position);
}

function metaRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function metaPitchPositions(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function formatPitchPositions(positions: unknown[]): string {
    return positions.slice(0, 4).map(String).join(', ');
}

function formatPitchPosition(position: unknown): string {
    return typeof position === 'number' ? String(position) : '';
}

function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}

function safeDocumentTitle(): string {
    return typeof document === 'undefined' ? '' : document.title;
}
