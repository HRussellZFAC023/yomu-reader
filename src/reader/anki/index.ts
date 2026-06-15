import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';
import { yomuAnkiCompanion } from '../companions/registry';
import { getUserscriptHttpRequest } from '../userscript/index';
import type { AnkiWordAudioMedia } from './audio';
import type {
    AnkiAudioMergeMode,
    AnkiCardContext,
    AnkiExistingNote,
    AnkiLibraryScanResult,
    AnkiLookupResult,
    AnkiMergeYomuResult,
    AnkiStatusIndex,
} from './types';

export type {
    AnkiAudioMergeMode,
    AnkiCardContext,
    AnkiExistingNote,
    AnkiLibraryScanResult,
    AnkiLookupResult,
    AnkiMergeYomuResult,
    AnkiRenderedCard,
} from './types';
export type { AnkiNoteFieldTargetPlan } from './client';

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

export const ANKI_NEVER_FORGET_TAG = 'yomu-never-forget';

export interface AnkiConnectClient {
    destroy(): void;
    isConnected(): Promise<boolean>;
    isAvailableForBackground(): Promise<boolean>;
    deckNames(): Promise<string[]>;
    modelNames(): Promise<string[]>;
    noteFieldTargetPlan(): Promise<import('./client').AnkiNoteFieldTargetPlan | null>;
    scanLibrary(): Promise<AnkiLibraryScanResult>;
    warmStatusIndex(): Promise<AnkiStatusIndex | null>;
    findExistingCards(card: JPDBCard): Promise<AnkiLookupResult>;
    findCachedStatusBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]>;
    findExistingCardsBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]>;
    rebuildStatusIndex(cardIds?: number[], now?: number, rebuildLeaseOwner?: string): Promise<AnkiStatusIndex | null>;
    answerCard(cardId: number, grade: JPDBGrade): Promise<void>;
    setCardsSuspended(cardIds: number[], suspended: boolean): Promise<void>;
    setNotesTag(noteIds: number[], tag: string, present: boolean): Promise<void>;
    browseNote(noteId: number): Promise<void>;
    mediaFileDataUrl(filename: string): Promise<string>;
    mergeYomuData(noteId: number, card: JPDBCard, sentence?: string, options?: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode }): Promise<AnkiMergeYomuResult>;
    addCard(card: JPDBCard, sentence?: string, options?: AnkiCardContext): Promise<number | null>;
    addCardViaMobileHandoff(card: JPDBCard, sentence?: string, options?: AnkiCardContext): Promise<null>;
    ensureDeckAndModel(deckOverride?: string): Promise<void>;
    invoke<T>(action: string, params?: Record<string, unknown>): Promise<T>;
}

export class AnkiConnectClient {
    constructor(getSettings: () => ReaderSettings) {
        const companion = yomuAnkiCompanion();
        if (!companion) return new DisabledAnkiConnectClient() as AnkiConnectClient;
        const Client = companion.AnkiConnectClient;
        return new Client(getSettings) as AnkiConnectClient;
    }
}

class DisabledAnkiConnectClient implements AnkiConnectClient {
    destroy(): void {}
    isConnected(): Promise<boolean> { return Promise.resolve(false); }
    isAvailableForBackground(): Promise<boolean> { return Promise.resolve(false); }
    deckNames(): Promise<string[]> { return Promise.resolve([]); }
    modelNames(): Promise<string[]> { return Promise.resolve([]); }
    noteFieldTargetPlan(): Promise<import('./client').AnkiNoteFieldTargetPlan | null> { return Promise.resolve(null); }
    scanLibrary(): Promise<AnkiLibraryScanResult> { return Promise.resolve({ deckNames: [], models: [], suggestedModel: null }); }
    warmStatusIndex(): Promise<AnkiStatusIndex | null> { return Promise.resolve(null); }
    findExistingCards(_card: JPDBCard): Promise<AnkiLookupResult> { return Promise.resolve(untrustedAnkiLookupResult()); }
    findCachedStatusBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]> { return Promise.resolve(cards.map(() => untrustedAnkiLookupResult())); }
    findExistingCardsBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]> { return Promise.resolve(cards.map(() => untrustedAnkiLookupResult())); }
    rebuildStatusIndex(): Promise<AnkiStatusIndex | null> { return Promise.resolve(null); }
    answerCard(): Promise<void> { return Promise.reject(ankiCompanionUnavailableError()); }
    setCardsSuspended(): Promise<void> { return Promise.reject(ankiCompanionUnavailableError()); }
    setNotesTag(): Promise<void> { return Promise.reject(ankiCompanionUnavailableError()); }
    browseNote(): Promise<void> { return Promise.reject(ankiCompanionUnavailableError()); }
    mediaFileDataUrl(): Promise<string> { return Promise.reject(ankiCompanionUnavailableError()); }
    mergeYomuData(): Promise<AnkiMergeYomuResult> { return Promise.reject(ankiCompanionUnavailableError()); }
    addCard(): Promise<number | null> { return Promise.reject(ankiCompanionUnavailableError()); }
    addCardViaMobileHandoff(): Promise<null> { return Promise.reject(ankiCompanionUnavailableError()); }
    ensureDeckAndModel(): Promise<void> { return Promise.reject(ankiCompanionUnavailableError()); }
    invoke<T>(): Promise<T> { return Promise.reject(ankiCompanionUnavailableError()); }
}

function ankiCompanionUnavailableError(): Error {
    return new Error('Yomu Anki companion is unavailable.');
}

export class AnkiDuplicateNoteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnkiDuplicateNoteError';
    }
}

export function isAnkiDuplicateNoteError(error: unknown): error is AnkiDuplicateNoteError {
    return error instanceof AnkiDuplicateNoteError
        || yomuAnkiCompanion()?.isAnkiDuplicateNoteError(error)
        || (error instanceof Error && error.name === 'AnkiDuplicateNoteError')
        || false;
}

export function hasUserscriptAnkiBridge(): boolean {
    return Boolean(getUserscriptHttpRequest());
}

export function isAnkiConnectAvailabilityError(error: unknown): boolean {
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isAnkiConnectAvailabilityError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /timed out|failed to fetch|networkerror|request bridge/i.test(error.message);
}

export function canDirectFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    const current = readAnkiUrl(currentHref);
    if (!current) return false;
    const target = readAnkiUrl(url, current.href);
    if (!target || !isHttpUrl(target)) return false;
    return target.origin === current.origin;
}

export function ankiLookupWithUnavailableDetails(lookup: AnkiLookupResult): AnkiLookupResult {
    return yomuAnkiCompanion()?.ankiLookupWithUnavailableDetails(lookup) ?? localAnkiLookupWithUnavailableDetails(lookup);
}

export function untrustedAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null, trusted: false };
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

export function buildYomuAnkiFields(card: JPDBCard, sentence = '', context: AnkiCardContext = {}): Record<string, string> {
    return yomuAnkiCompanion()?.buildYomuAnkiFields(card, sentence, context) ?? {};
}

export function buildYomuAnkiPreviewFields(
    card: JPDBCard,
    sentence: string,
    settings: ReaderSettings,
    context: AnkiCardContext = {},
    fieldTargetPlan?: import('./client').AnkiNoteFieldTargetPlan | null,
): Record<string, string> {
    return yomuAnkiCompanion()?.buildYomuAnkiPreviewFields(card, sentence, settings, context, fieldTargetPlan) ?? {};
}

export function canUseMobileAnkiHandoff(settings: ReaderSettings): boolean {
    return yomuAnkiCompanion()?.canUseMobileAnkiHandoff(settings) ?? false;
}

export function mobileAnkiHandoffAppName(): string {
    return yomuAnkiCompanion()?.mobileAnkiHandoffAppName() ?? 'AnkiMobile';
}

export function captureActiveVideoFrame(): string | undefined {
    return yomuAnkiCompanion()?.captureActiveVideoFrame();
}

export async function resolveAnkiWordAudio(card: JPDBCard, settings: ReaderSettings): Promise<AnkiWordAudioMedia | null> {
    return yomuAnkiCompanion()?.resolveAnkiWordAudio(card, settings) ?? null;
}

function localAnkiLookupWithUnavailableDetails(lookup: AnkiLookupResult): AnkiLookupResult {
    const mark = (note: AnkiExistingNote): AnkiExistingNote => ankiNoteHasRenderableDetails(note)
        ? note
        : { ...note, detailsUnavailable: true };
    const notes = lookup.notes.map(mark);
    const primary = lookup.primary ? mark(lookup.primary) : null;
    return { ...lookup, notes, primary };
}

function ankiNoteHasRenderableDetails(note: AnkiExistingNote): boolean {
    if (note.renderedCards?.some(card => card.question.trim() || card.answer.trim())) return true;
    return Object.values(note.fields).some(value => value.trim());
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
