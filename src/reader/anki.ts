import { escapeHtml } from './dom';
import type { AnkiWordAudioMedia } from './audio';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import { isYomuHostedAppUrl } from './app-pages';
import { GITHUB_PAGES_ORIGIN } from './constants';
import { resolveUiLanguage, uiText } from './i18n';
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
    'Audio',
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
    audio?: AnkiMediaFile[];
}

type AnkiPicture = NonNullable<AnkiNote['picture']>[number];

interface AnkiMediaFile {
    filename: string;
    fields: string[];
    data?: string;
    url?: string;
    skipHash?: string;
}

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
    question?: string;
    answer?: string;
    due?: number;
    reps?: number;
    lapses?: number;
    interval?: number;
    note?: number;
}

export interface AnkiRenderedCard {
    cardId: number;
    deckName: string;
    question: string;
    answer: string;
}

export type AnkiAudioMergeMode = 'both' | 'theirs' | 'ours';

export interface AnkiMergeYomuResult {
    noteId: number;
    modelName: string;
    updatedFields: string[];
    audioAdded: boolean;
    imageAdded: boolean;
}

export interface AnkiExistingNote {
    noteId: number;
    modelName: string;
    deckNames: string[];
    cardIds: number[];
    primaryCardId: number | null;
    state: CardState;
    fields: Record<string, string>;
    renderedCards?: AnkiRenderedCard[];
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
    audioDataUrl?: string;
    audioUrl?: string;
    wordAudioDataUrl?: string;
    wordAudioUrl?: string;
    localEntries?: YomitanTermEntry[];
    kanjiEntries?: YomitanKanjiEntry[];
    metaEntries?: YomitanMetaEntry[];
    dictionaryPreferences?: DictionaryPreference[];
    sourceUrl?: string;
    sourceTitle?: string;
    interfaceLanguage?: ReaderSettings['interfaceLanguage'];
}

interface AnkiFieldContext {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    dictionaryPreferences: DictionaryPreference[];
    sourceUrl: string;
    sourceTitle: string;
    interfaceLanguage: ReaderSettings['interfaceLanguage'];
}

interface ParsedAnkiImageDataUrl {
    extension: string;
    data: string;
}

interface ParsedAnkiAudioDataUrl {
    extension: string;
    data: string;
}

interface AnkiNoteUpdate {
    id: number;
    fields: Record<string, string>;
    audio?: AnkiMediaFile[];
    picture?: AnkiPicture[];
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
        if (canUseMobileAnkiHandoff(this.getSettings())) return [];
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
        const cacheKey = this.lookupCacheKey(card);
        const cached = this.readLookupCache(cacheKey);
        if (cached) return cached;
        return await this.findExistingCardsUncached(card, cacheKey, empty);
    }

    private lookupCacheKey(card: JPDBCard): string {
        return `${card.spelling}|${card.reading}`;
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

    async mediaFileDataUrl(filename: string): Promise<string> {
        const cleanFilename = filename.trim();
        if (!cleanFilename) throw new Error(this.text('ankiAudioFileNotFound'));
        const data = await this.invoke<string | false>('retrieveMediaFile', { filename: cleanFilename });
        if (!data) throw new Error(this.text('ankiAudioFileNotFound'));
        return `data:${ankiMediaMimeType(cleanFilename)};base64,${data}`;
    }

    async mergeYomuData(noteId: number, card: JPDBCard, sentence = '', options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode } = {}): Promise<AnkiMergeYomuResult> {
        const settings = this.getSettings();
        if (canUseMobileAnkiHandoff(settings)) throw new Error(this.text('ankiMergeNeedsDesktop'));
        const [note] = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [noteId] });
        if (!note) throw new Error(this.text('ankiNoteNotFound'));

        const merge = this.buildYomuNoteMerge(note, card, sentence, options);
        if (!merge.updatedFields.length && !merge.audioAdded && !merge.imageAdded) {
            return merge;
        }

        await this.invoke<null>('updateNoteFields', { note: merge.note });
        this.lookupCache.delete(this.lookupCacheKey(card));
        return merge;
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
        this.attachAnkiNoteAudio(note, options, card);
        return note;
    }

    private buildYomuNoteMerge(note: AnkiNoteInfo, card: JPDBCard, sentence: string, options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode }): AnkiMergeYomuResult & { note: AnkiNoteUpdate } {
        const settings = this.getSettings();
        const fieldNames = Object.keys(note.fields ?? {});
        const existingFields = flattenNoteFields(note.fields);
        const yomuFields = buildYomuAnkiFields(card, sentence, this.ankiFieldContext(options, settings));
        const canOwnYomuFields = noteLooksLikeYomuModel(note.modelName, settings, fieldNames);
        const fields = mergedYomuFields(fieldNames, existingFields, yomuFields, canOwnYomuFields);
        const audio = mergeAudioFilesForNote(fieldNames, options, card);
        const picture = mergePictureFilesForNote(fieldNames, existingFields, options, card, canOwnYomuFields);
        applyMediaFieldClears(fields, audio, picture, options.audioMergeMode, canOwnYomuFields);
        return {
            noteId: note.noteId,
            modelName: note.modelName,
            updatedFields: Object.keys(fields),
            audioAdded: Boolean(audio.length),
            imageAdded: Boolean(picture.length),
            note: {
                id: note.noteId,
                fields,
                ...(audio.length ? { audio } : {}),
                ...(picture.length ? { picture } : {}),
            },
        };
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
            interfaceLanguage: options.interfaceLanguage ?? settings.interfaceLanguage,
        };
    }

    private attachAnkiNoteImage(note: AnkiNote, imageDataUrl: string | undefined, card: JPDBCard): void {
        const image = imageDataUrl ? imageFromDataUrl(imageDataUrl, card) : null;
        if (image) note.picture = [image];
    }

    private attachAnkiNoteAudio(note: AnkiNote, options: AnkiCardContext, card: JPDBCard): void {
        const audio = audioFilesFromContext(options, card);
        if (audio.length) note.audio = audio;
    }

    private logAnkiNoteAdd(card: JPDBCard, note: AnkiNote): void {
        log.info('Adding Anki note', {
            term: card.spelling,
            deck: note.deckName,
            model: note.modelName,
            hasImage: Boolean(note.picture?.length),
            hasAudio: Boolean(note.audio?.length),
            tags: note.tags,
        });
    }

    private openMobileHandoffIfPreferred(settings: ReaderSettings, note: AnkiNote, card: JPDBCard): boolean {
        if (!canUseMobileAnkiHandoff(settings)) return false;
        log.info('Opening mobile Anki handoff', { term: card.spelling });
        if (!openMobileAnkiHandoff(note)) throw new Error(this.text('ankiHandoffCancelled'));
        return true;
    }

    private async addNoteViaConnect(note: AnkiNote, card: JPDBCard): Promise<number | null> {
        await this.ensureDeckAndModel(note.deckName);
        const noteId = await this.invoke<number | null>('addNote', { note });
        log.info('Anki note added', { term: card.spelling, noteId });
        await this.refreshLookupCacheAfterAdd(card, noteId);
        return noteId;
    }

    private async refreshLookupCacheAfterAdd(card: JPDBCard, noteId: number | null): Promise<void> {
        const cacheKey = this.lookupCacheKey(card);
        if (!noteId) {
            this.lookupCache.delete(cacheKey);
            return;
        }
        try {
            const { existing } = await this.loadExistingNotes(card, new Set([noteId]));
            const result: AnkiLookupResult = {
                state: stateFromExistingNotes(existing),
                notes: existing,
                primary: pickPrimaryExistingNote(existing),
            };
            this.writeLookupCache(cacheKey, result);
        } catch (error) {
            log.warn('Anki lookup refresh after add failed', { term: card.spelling, noteId }, error);
            this.lookupCache.delete(cacheKey);
        }
    }

    private addCardWithFallback(error: unknown, settings: ReaderSettings, note: AnkiNote, card: JPDBCard): null {
        if (!settings.ankiMobileHandoff || !isMobileUserAgent()) throw error;
        log.warn('AnkiConnect add failed; trying mobile handoff', { term: card.spelling }, error);
        if (!openMobileAnkiHandoff(note)) throw new Error(this.text('ankiHandoffCancelled'));
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
        await this.invoke<null>('updateModelTemplates', { model: { name: modelName, templates: yomuCardTemplates(settings) } });
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
            cardTemplates: Object.entries(yomuCardTemplates(settings)).map(([Name, template]) => ({ Name, ...template })),
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
        const response = await postJson<AnkiResponse<T>>(url, body).catch(error => {
            throw this.localizedConnectError(error);
        });
        if (response.error) {
            log.warn('AnkiConnect action returned error', { action, error: response.error });
            throw new Error(resolveUiLanguage(settings.interfaceLanguage) === 'ja' ? this.text('ankiConnectActionFailed') : response.error);
        }
        return response.result;
    }

    private text(key: Parameters<typeof uiText>[1]): string {
        return uiText(this.getSettings().interfaceLanguage, key);
    }

    private localizedConnectError(error: unknown): Error {
        const language = this.getSettings().interfaceLanguage;
        if (resolveUiLanguage(language) !== 'ja') return error instanceof Error ? error : new Error(this.text('ankiConnectRequestFailed'));
        if (error instanceof Error && /timed out/i.test(error.message)) return new Error(this.text('ankiConnectTimedOut'));
        const status = error instanceof Error ? error.message.match(/\((\d{3})\)/)?.[1] : '';
        const suffix = status ? `（${status}）` : '';
        return new Error(`${this.text('ankiConnectRequestFailed')}${suffix}`);
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
    return canFetchAnkiConnectFrom(url, safeLocationHref());
}

export function canFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    const current = readAnkiUrl(currentHref);
    if (!current) return false;
    const target = readAnkiUrl(url, current.href);
    if (!target) return false;
    if (target.origin === current.origin) return true;
    if (isLoopbackHostname(current.hostname)) return true;
    return isYomuHostedAppUrl(current.href) && isHttpUrl(target);
}

export function needsHostedAnkiConnectSetupHint(url: string, currentHref = safeLocationHref()): boolean {
    if (getUserscriptHttpRequest()) return false;
    const current = readAnkiUrl(currentHref);
    if (!current || current.origin !== GITHUB_PAGES_ORIGIN || !isYomuHostedAppUrl(current.href)) return false;
    const target = readAnkiUrl(url, current.href);
    return Boolean(target && target.origin !== current.origin && isHttpUrl(target));
}

function readAnkiUrl(value: string, base?: string): URL | null {
    try {
        return new URL(value, base);
    } catch {
        return null;
    }
}

function isHttpUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
}

function isLoopbackHostname(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
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
        Audio: '',
        JPDB: renderJpdbLink(jpdbUrl, fieldContext.interfaceLanguage),
        Status: renderCardStatus(card, fieldContext.interfaceLanguage),
        Pitch: renderPitchField(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        DictionaryDefinitions: renderDictionaryDefinitions(fieldContext.localEntries, fieldContext.dictionaryPreferences),
        Kanji: renderKanjiDefinitions(fieldContext.kanjiEntries, fieldContext.dictionaryPreferences, fieldContext.interfaceLanguage),
        Source: renderSource(fieldContext.sourceUrl, fieldContext.sourceTitle),
    };
}

function renderCardReading(card: JPDBCard): string {
    return card.reading && card.reading !== card.spelling ? escapeHtml(card.reading) : '';
}

function renderPartOfSpeech(partOfSpeech: string[]): string {
    return escapeHtml(formatPartOfSpeech(partOfSpeech) || formatPartOfSpeechDetails(partOfSpeech));
}

function renderJpdbLink(jpdbUrl: string, language: ReaderSettings['interfaceLanguage']): string {
    return jpdbUrl ? `<a href="${jpdbUrl}">${escapeHtml(uiText(language, 'openOnJpdb'))}</a>` : '';
}

function ankiFieldContext(context: AnkiCardContext): AnkiFieldContext {
    return {
        localEntries: fallbackArray(context.localEntries),
        kanjiEntries: fallbackArray(context.kanjiEntries),
        metaEntries: fallbackArray(context.metaEntries),
        dictionaryPreferences: fallbackArray(context.dictionaryPreferences),
        sourceUrl: fallbackString(context.sourceUrl),
        sourceTitle: fallbackString(context.sourceTitle),
        interfaceLanguage: context.interfaceLanguage ?? 'en',
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

function renderCardStatus(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.source === 'local') return `<span class="yomu-chip">${escapeHtml(uiText(language, 'ankiLocalDictionaryStatus'))}</span>`;
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
        filename: `yomu_${safeAnkiMediaName(card)}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Image'],
    };
}

function mergedYomuFields(fieldNames: string[], existingFields: Record<string, string>, yomuFields: Record<string, string>, canOwnYomuFields: boolean): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const fieldName of fieldNames) {
        const value = yomuValueForExistingField(fieldName, yomuFields);
        if (!value) continue;
        if (!canOwnYomuFields && existingFields[fieldName]) continue;
        fields[fieldName] = value;
    }
    return fields;
}

function yomuValueForExistingField(fieldName: string, yomuFields: Record<string, string>): string {
    return yomuFields[fieldName] ?? yomuFields[yomuFieldAlias(fieldName)] ?? '';
}

function yomuFieldAlias(fieldName: string): string {
    const normalized = fieldName.replace(/[_\s-]+/g, '').toLowerCase();
    return YOMU_FIELD_ALIASES[normalized] ?? '';
}

const YOMU_FIELD_ALIASES: Record<string, string> = {
    word: 'Expression',
    vocab: 'Expression',
    vocabulary: 'Expression',
    term: 'Expression',
    front: 'Expression',
    readings: 'Reading',
    kana: 'Reading',
    yomi: 'Reading',
    definition: 'Meaning',
    definitions: 'Meaning',
    glossary: 'Meaning',
    translation: 'Meaning',
    translation1: 'Meaning',
    back: 'Meaning',
    example: 'Sentence',
    sentenceexpression: 'Sentence',
    sourceurl: 'Url',
    url: 'Url',
    pos: 'PartOfSpeech',
    partofspeech: 'PartOfSpeech',
    pitchaccent: 'Pitch',
    dictionary: 'DictionaryDefinitions',
    dictionaries: 'DictionaryDefinitions',
    dictionarydefinition: 'DictionaryDefinitions',
    dictionarydefinitions: 'DictionaryDefinitions',
};

function noteLooksLikeYomuModel(modelName: string, settings: ReaderSettings, fieldNames: string[]): boolean {
    const configuredModel = resolvedAnkiModelName(settings);
    if (modelName === configuredModel) return true;
    const fieldSet = new Set(fieldNames);
    return ['Expression', 'Meaning', 'Sentence', 'DictionaryDefinitions'].every(field => fieldSet.has(field));
}

function mergeAudioFilesForNote(fieldNames: string[], options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode }, card: JPDBCard): AnkiMediaFile[] {
    if (options.audioMergeMode === 'theirs') return [];
    const fieldName = mediaFieldName(fieldNames, ['Audio', 'audio', 'Sound', 'sound', 'Voice', 'Pronunciation']);
    if (!fieldName) return [];
    return retargetMediaFiles(audioFilesFromContext(options, card), fieldName);
}

function mergePictureFilesForNote(
    fieldNames: string[],
    existingFields: Record<string, string>,
    options: AnkiCardContext,
    card: JPDBCard,
    canOwnYomuFields: boolean,
): AnkiPicture[] {
    const fieldName = mediaFieldName(fieldNames, ['Image', 'image', 'Picture', 'picture', 'Screenshot', 'screenshot']);
    if (!fieldName || !options.imageDataUrl) return [];
    if (!canOwnYomuFields && existingFields[fieldName]) return [];
    const image = imageFromDataUrl(options.imageDataUrl, card);
    return image ? [{ ...image, fields: [fieldName] }] : [];
}

function applyMediaFieldClears(
    fields: Record<string, string>,
    audio: AnkiMediaFile[],
    picture: AnkiPicture[],
    audioMergeMode: AnkiAudioMergeMode | undefined,
    canOwnYomuFields: boolean,
): void {
    if (audio.length && audioMergeMode === 'ours') fields[audio[0].fields[0]] = '';
    if (picture.length && canOwnYomuFields) fields[picture[0].fields[0]] = '';
}

function mediaFieldName(fieldNames: string[], preferredNames: string[]): string {
    const exact = preferredNames.find(name => fieldNames.includes(name));
    if (exact) return exact;
    const preferredLower = new Set(preferredNames.map(name => name.toLowerCase()));
    return fieldNames.find(name => preferredLower.has(name.toLowerCase())) ?? '';
}

function retargetMediaFiles<T extends AnkiMediaFile | AnkiPicture>(files: T[], fieldName: string): T[] {
    return files.map(file => ({ ...file, fields: [fieldName] }));
}

function audioFilesFromContext(options: AnkiCardContext, card: JPDBCard): AnkiMediaFile[] {
    const files = [
        audioFromMedia({ dataUrl: options.wordAudioDataUrl, url: options.wordAudioUrl, kind: 'word' }, card),
        audioFromMedia({ dataUrl: options.audioDataUrl, url: options.audioUrl, kind: 'context' }, card),
    ].filter((file): file is AnkiMediaFile => Boolean(file));
    return uniqueAnkiAudioFiles(files);
}

function audioFromMedia(media: AnkiWordAudioMedia & { kind: string }, card: JPDBCard): AnkiMediaFile | null {
    const fromData = media.dataUrl ? audioFromDataUrl(media.dataUrl, card, media.kind) : null;
    if (fromData) return fromData;
    return media.url ? audioFromUrl(media.url, card, media.kind) : null;
}

function audioFromDataUrl(dataUrl: string, card: JPDBCard, kind: string): AnkiMediaFile | null {
    const parsed = parseAnkiAudioDataUrl(dataUrl);
    if (!parsed) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Audio'],
    };
}

function audioFromUrl(url: string, card: JPDBCard, kind: string): AnkiMediaFile | null {
    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}${audioUrlExtension(cleanUrl)}`,
        url: cleanUrl,
        fields: ['Audio'],
    };
}

function uniqueAnkiAudioFiles(files: AnkiMediaFile[]): AnkiMediaFile[] {
    const seen = new Set<string>();
    return files.filter(file => {
        const key = file.data ? `data:${file.data}` : `url:${file.url ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseAnkiImageDataUrl(dataUrl: string): ParsedAnkiImageDataUrl | null {
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiImageExtension(match[1]), data: match[2] } : null;
}

function parseAnkiAudioDataUrl(dataUrl: string): ParsedAnkiAudioDataUrl | null {
    const match = /^data:audio\/([a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiAudioExtension(match[1]), data: match[2] } : null;
}

function ankiImageExtension(rawExtension: string): string {
    const extension = rawExtension.toLowerCase();
    if (extension === 'jpeg') return 'jpg';
    return extension === 'svg+xml' ? 'svg' : extension;
}

function ankiAudioExtension(rawExtension: string): string {
    const extension = rawExtension.toLowerCase();
    if (extension === 'mpeg' || extension === 'mp3') return 'mp3';
    if (extension === 'wav' || extension === 'wave' || extension === 'x-wav') return 'wav';
    if (extension === 'ogg' || extension === 'oga') return 'ogg';
    if (extension === 'webm') return 'webm';
    if (extension === 'mp4' || extension === 'aac' || extension === 'flac') return extension;
    return 'mp3';
}

function audioUrlExtension(url: string): string {
    try {
        const pathname = new URL(url, location.href).pathname;
        const match = /\.([a-z0-9]+)$/i.exec(pathname);
        if (match) return `.${ankiAudioExtension(match[1])}`;
    } catch {
        // Fall through to the common Immersion Kit format.
    }
    return '.mp3';
}

function ankiMediaMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() ?? '';
    if (extension === 'mp3') return 'audio/mpeg';
    if (extension === 'wav') return 'audio/wav';
    if (extension === 'ogg' || extension === 'oga' || extension === 'opus') return 'audio/ogg';
    if (extension === 'webm') return 'audio/webm';
    if (extension === 'm4a' || extension === 'mp4' || extension === 'aac') return 'audio/mp4';
    if (extension === 'flac') return 'audio/flac';
    return 'audio/mpeg';
}

function safeAnkiMediaName(card: JPDBCard): string {
    return card.spelling.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 24) || 'yomu';
}

function isMobileUserAgent(): boolean {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /iPad|iPhone|iPod|Android/i.test(userAgent) || isIpadOSDesktopUserAgent();
}

function isMobileAnkiHandoffEnvironment(): boolean {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /iPad|iPhone|iPod/i.test(userAgent)
        || isIpadOSDesktopUserAgent()
        || (/Android/i.test(userAgent) && /Chrome|Firefox|Firefox\/|FxiOS|EdgA/i.test(userAgent));
}

export function canUseMobileAnkiHandoff(settings: ReaderSettings): boolean {
    return settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
}

function isIpadOSDesktopUserAgent(): boolean {
    if (typeof navigator === 'undefined') return false;
    const maxTouchPoints = navigator.maxTouchPoints ?? 0;
    const platform = navigator.platform ?? '';
    return maxTouchPoints > 1
        && /Mac/i.test(platform)
        && /Macintosh/i.test(navigator.userAgent ?? '');
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
        renderedCards: ankiRenderedCards(noteCards),
        tags: note.tags ?? [],
        ...ankiNoteReviewMetrics(noteCards),
    };
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

function yomuCardTemplates(settings: ReaderSettings): Record<string, { Front: string; Back: string }> {
    const language = settings.interfaceLanguage;
    const recognitionFront = `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    ${settings.ankiFrontReading ? '{{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}' : ''}
    ${settings.ankiFrontSentence ? '{{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}' : ''}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ''}
</main>`;
    const contextFront = `
<main class="yomu-card yomu-front">
    {{#Sentence}}<div class="yomu-sentence yomu-sentence-front">{{Sentence}}</div>{{/Sentence}}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ''}
    <div class="yomu-prompt">${escapeHtml(uiText(language, 'ankiPromptRecallWord'))}</div>
</main>`;
    const back = `
{{FrontSide}}
<main class="yomu-card yomu-back">
    <section class="yomu-section yomu-answer">
        <div class="yomu-expression">{{Expression}}</div>
        {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
        {{#Audio}}<div class="yomu-audio">{{Audio}}</div>{{/Audio}}
    </section>
    {{#Meaning}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'ankiMeaningHeading'))}</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'dictionaries'))}</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'kanji'))}</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>${escapeHtml(uiText(language, 'factFrequency'))}</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>${escapeHtml(uiText(language, 'ankiPitchHeading'))}</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>${escapeHtml(uiText(language, 'ankiPartOfSpeechHeading'))}</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#JPDB}}<div><strong>${escapeHtml(uiText(language, 'ankiLinksHeading'))}</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>${escapeHtml(uiText(language, 'ankiSourceHeading'))}</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`;
    return {
        [settings.ankiTemplateMode === 'context' ? uiText(language, 'ankiTemplateContext') : uiText(language, 'ankiTemplateRecognition')]: {
            Front: settings.ankiTemplateMode === 'context' ? contextFront : recognitionFront,
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

function renderKanjiDefinitions(entries: YomitanKanjiEntry[], preferences: DictionaryPreference[], language: ReaderSettings['interfaceLanguage']): string {
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
                    ${item.onyomi.length ? `<span class="yomu-kanji-reading">${escapeHtml(uiText(language, 'onReading'))} ${escapeHtml(item.onyomi.join('、'))}</span>` : ''}
                    ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> ${escapeHtml(uiText(language, 'kunReading'))} ${escapeHtml(item.kunyomi.join('、'))}</span>` : ''}
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
    const chips = firstJpdbPitchChip(card);
    for (const entry of entries) {
        appendPitchChip(chips, entry, preferences);
        if (chips.length >= 4) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function firstJpdbPitchChip(card: JPDBCard): string[] {
    const pitch = card.pitchAccent.find(Boolean);
    if (!pitch) return [];
    const reading = card.reading && card.reading !== card.spelling ? `${card.reading} ` : '';
    return [`<span class="yomu-chip">JPDB ${escapeHtml(reading)}${escapeHtml(pitch)}</span>`];
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
