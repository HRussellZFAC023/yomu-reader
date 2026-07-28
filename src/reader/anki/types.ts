import type { YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import type { CardState, DictionaryPreference, ReaderSettings, ReviewGradeIntervals } from '../app/types';

export interface AnkiResponse<T> {
    result: T;
    error: string | null;
}

export interface AnkiNote {
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

export type AnkiPicture = NonNullable<AnkiNote['picture']>[number];

// Which audio slot a mined media file belongs to. Word audio is the term
// pronunciation; context audio is the sentence/example clip. Note types that
// expose both (Lapis, jp-mining-note) must not collapse them into one field.
export type AnkiAudioKind = 'word' | 'context';

export interface AnkiMediaFile {
    filename: string;
    fields: string[];
    data?: string;
    url?: string;
    skipHash?: string;
    // Internal routing metadata only: the note is built before the target
    // model's field names are known, so the kind has to survive until the
    // retarget pass picks a field. Stripped before it reaches AnkiConnect.
    yomuAudioKind?: AnkiAudioKind;
}

export interface AnkiNoteInfo {
    noteId: number;
    modelName: string;
    tags: string[];
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

export interface AnkiCardInfo {
    cardId: number;
    deckName: string;
    card?: string;
    cardName?: string;
    name?: string;
    ord?: number;
    template?: string;
    queue: number;
    type: number;
    isDue?: boolean;
    question?: string;
    answer?: string;
    due?: number;
    reps?: number;
    lapses?: number;
    interval?: number;
    factor?: number;
    buttons?: number[];
    nextReviews?: string[];
    note?: number;
}

export interface AnkiDeckStats {
    total_in_deck?: number;
}

export interface AnkiMultiAction {
    action: string;
    params?: Record<string, unknown>;
}

export interface AnkiRenderedCard {
    cardId: number;
    deckName: string;
    cardName?: string;
    question: string;
    answer: string;
    mediaDataUrls?: Record<string, string>;
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
    detailsUnavailable?: boolean;
    tags: string[];
    reps: number;
    lapses: number;
    reviewGradeIntervals?: ReviewGradeIntervals;
}

export interface AnkiLookupResult {
    state: CardState;
    notes: AnkiExistingNote[];
    primary: AnkiExistingNote | null;
    trusted?: boolean;
}

export type AnkiFieldRole = 'expression' | 'reading' | 'meaning' | 'sentence' | 'audio' | 'sentenceAudio' | 'image';

// Order matters: scanAnkiModelFields claims fields role by role, so `audio`
// (word audio) resolves before `sentenceAudio` and the two cannot both land on
// the same field of a note type that exposes one of each.
export const ANKI_FIELD_ROLES: AnkiFieldRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'sentenceAudio', 'image'];

export interface AnkiFieldSuggestion {
    role: AnkiFieldRole;
    fieldName: string | null;
    confidence: 'high' | 'medium' | 'low';
}

export interface AnkiModelScanResult {
    modelName: string;
    fields: string[];
    suggestions: AnkiFieldSuggestion[];
    score: number;
}

export interface AnkiLibraryScanResult {
    deckNames: string[];
    models: AnkiModelScanResult[];
    suggestedModel: AnkiModelScanResult | null;
}

// A Yomu-managed note type from an earlier release and the fields this
// release would add to it. Null instead of an empty plan: nothing to offer.
export interface AnkiModelUpdatePlan {
    modelName: string;
    missingFields: string[];
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
    sentenceTarget?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    interfaceLanguage?: ReaderSettings['interfaceLanguage'];
}

export interface AnkiFieldContext {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    dictionaryPreferences: DictionaryPreference[];
    sentenceTarget: string;
    sourceUrl: string;
    sourceTitle: string;
    interfaceLanguage: ReaderSettings['interfaceLanguage'];
}

export interface ParsedAnkiImageDataUrl {
    extension: string;
    data: string;
}

export interface ParsedAnkiAudioDataUrl {
    extension: string;
    data: string;
}

export interface AnkiNoteUpdate {
    id: number;
    fields: Record<string, string>;
    audio?: AnkiMediaFile[];
    picture?: AnkiPicture[];
}

export interface AnkiStatusIndexEntry {
    state: CardState;
    noteId: number;
    primaryCardId: number | null;
    deckNames: string[];
    reps: number;
    lapses: number;
    modelName: string;
    updatedAt?: number;
}

export interface AnkiStatusIndex {
    version: number;
    settingsKey: string;
    syncedAt: number;
    checkedAt: number;
    cardCount: number;
    entryCount?: number;
    entryStore?: 'indexeddb';
    entries: Record<string, AnkiStatusIndexEntry>;
    readingKeys?: boolean;
    dirtyAt?: number;
}

export interface AnkiStatusIndexRebuildLease {
    owner: string;
    settingsKey: string;
    startedAt: number;
    expiresAt: number;
}

export type StoredAnkiStatusIndexMeta = Omit<AnkiStatusIndex, 'entries'> & {
    id: 'current';
    entries?: Record<string, never>;
};

export interface StoredAnkiStatusIndexEntry {
    key: string;
    entry: AnkiStatusIndexEntry;
}

export interface AnkiStatusIndexCardSets {
    all: Set<number>;
    due: Set<number>;
    learning: Set<number>;
    new: Set<number>;
    suspended: Set<number>;
}

export interface AnkiStatusIndexCardData {
    sets: AnkiStatusIndexCardSets;
    cardsByNote: Map<number, AnkiCardInfo[]>;
}

export interface AnkiFieldContentSample {
    raw: string;
    text: string;
}

export type AnkiFieldContentSamples = Record<string, AnkiFieldContentSample[]>;
