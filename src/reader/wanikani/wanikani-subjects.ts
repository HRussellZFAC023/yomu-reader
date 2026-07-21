// Normalizes raw WaniKani API v2 subject/assignment/study-material records
// into small, render-friendly shapes. Kept separate from wanikani.ts (the
// transport client) so parsing logic can be unit tested without a network seam.

export type WanikaniSubjectType = 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary';

export interface WanikaniMeaning {
    meaning: string;
    primary: boolean;
    acceptedAsCorrect: boolean;
}

export interface WanikaniReading {
    reading: string;
    primary: boolean;
    acceptedAsCorrect: boolean;
    type?: 'onyomi' | 'kunyomi' | 'nanori';
}

export interface WanikaniContextSentence {
    en: string;
    ja: string;
}

export interface WanikaniAuxiliaryMeaning {
    meaning: string;
    type: 'whitelist' | 'blacklist' | 'unknown';
}

export interface WanikaniAudio {
    url: string;
    contentType: string;
    sourceId?: number;
    pronunciation?: string;
    voiceGender?: string;
    voiceActorName?: string;
    voiceDescription?: string;
}

export interface WanikaniSubject {
    id: number;
    type: WanikaniSubjectType;
    level: number;
    slug: string;
    characters: string | null;
    documentUrl: string;
    meanings: WanikaniMeaning[];
    auxiliaryMeanings: WanikaniAuxiliaryMeaning[];
    readings: WanikaniReading[];
    meaningMnemonic: string;
    meaningHint?: string;
    readingMnemonic?: string;
    readingHint?: string;
    componentSubjectIds: number[];
    amalgamationSubjectIds: number[];
    visuallySimilarSubjectIds: number[];
    contextSentences: WanikaniContextSentence[];
    audio: WanikaniAudio[];
    hiddenAt: string | null;
}

// fallow-ignore-next-line complexity
export function parseWanikaniSubject(raw: unknown): WanikaniSubject | null {
    if (!isRecord(raw)) return null;
    const type = typeof raw.object === 'string' ? raw.object : '';
    if (!isSubjectType(type)) return null;
    const data = isRecord(raw.data) ? raw.data : {};
    const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
    if (!Number.isFinite(id)) return null;
    return {
        id,
        type,
        level: typeof data.level === 'number' ? data.level : 0,
        slug: typeof data.slug === 'string' ? data.slug : '',
        characters: typeof data.characters === 'string' ? data.characters : null,
        documentUrl: typeof data.document_url === 'string' ? data.document_url : '',
        meanings: parseMeanings(data.meanings),
        auxiliaryMeanings: parseAuxiliaryMeanings(data.auxiliary_meanings),
        readings: type === 'radical' ? [] : parseReadings(data.readings),
        meaningMnemonic: typeof data.meaning_mnemonic === 'string' ? data.meaning_mnemonic : '',
        meaningHint: typeof data.meaning_hint === 'string' ? data.meaning_hint : undefined,
        readingMnemonic: typeof data.reading_mnemonic === 'string' ? data.reading_mnemonic : undefined,
        readingHint: typeof data.reading_hint === 'string' ? data.reading_hint : undefined,
        componentSubjectIds: parseNumberArray(data.component_subject_ids),
        amalgamationSubjectIds: parseNumberArray(data.amalgamation_subject_ids),
        visuallySimilarSubjectIds: parseNumberArray(data.visually_similar_subject_ids),
        contextSentences: parseContextSentences(data.context_sentences),
        audio: type === 'vocabulary' || type === 'kana_vocabulary' ? parseAudio(data.pronunciation_audios) : [],
        hiddenAt: typeof data.hidden_at === 'string' ? data.hidden_at : null,
    };
}

export function primaryMeaning(subject: WanikaniSubject): string {
    return subject.meanings.find(meaning => meaning.primary)?.meaning ?? subject.meanings[0]?.meaning ?? '';
}

export function primaryReading(subject: WanikaniSubject): string {
    return subject.readings.find(reading => reading.primary)?.reading ?? subject.readings[0]?.reading ?? '';
}

/** Filters subjects to only those within the account's effective level cap
 * (subscription.max_level_granted, already floored to the free tier for any
 * unrecognized subscription.type upstream). Never trust caller-supplied data
 * beyond this cap. */
export function subjectsWithinLevel(subjects: WanikaniSubject[], maxLevel: number): WanikaniSubject[] {
    return subjects.filter(subject => subject.level <= maxLevel);
}

function isSubjectType(value: string): value is WanikaniSubjectType {
    return value === 'radical' || value === 'kanji' || value === 'vocabulary' || value === 'kana_vocabulary';
}

function parseMeanings(raw: unknown): WanikaniMeaning[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).map(item => ({
        meaning: typeof item.meaning === 'string' ? item.meaning : '',
        primary: item.primary === true,
        acceptedAsCorrect: item.accepted_answer === true || item.accepted_as_correct === true,
    })).filter(item => item.meaning);
}

function parseAuxiliaryMeanings(raw: unknown): WanikaniAuxiliaryMeaning[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).map(item => ({
        meaning: typeof item.meaning === 'string' ? item.meaning : '',
        type: item.type === 'whitelist' || item.type === 'blacklist' ? item.type : 'unknown',
    } satisfies WanikaniAuxiliaryMeaning)).filter(item => item.meaning);
}

function parseReadings(raw: unknown): WanikaniReading[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).map(item => {
        const type: WanikaniReading['type'] = item.type === 'onyomi' || item.type === 'kunyomi' || item.type === 'nanori'
            ? item.type
            : undefined;
        return {
            reading: typeof item.reading === 'string' ? item.reading : '',
            primary: item.primary === true,
            acceptedAsCorrect: item.accepted_answer === true || item.accepted_as_correct === true,
            type,
        };
    }).filter(item => item.reading);
}

function parseNumberArray(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is number => typeof item === 'number');
}

function parseContextSentences(raw: unknown): WanikaniContextSentence[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).map(item => ({
        en: typeof item.en === 'string' ? item.en : '',
        ja: typeof item.ja === 'string' ? item.ja : '',
    })).filter(item => item.en || item.ja);
}

function parseAudio(raw: unknown): WanikaniAudio[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).map(item => {
        const metadata = isRecord(item.metadata) ? item.metadata : {};
        return {
            url: typeof item.url === 'string' ? item.url : '',
            contentType: typeof item.content_type === 'string' ? item.content_type : '',
            sourceId: typeof metadata.source_id === 'number' ? metadata.source_id : undefined,
            pronunciation: typeof metadata.pronunciation === 'string' ? metadata.pronunciation : undefined,
            voiceGender: typeof metadata.gender === 'string' ? metadata.gender : undefined,
            voiceActorName: typeof metadata.voice_actor_name === 'string' ? metadata.voice_actor_name : undefined,
            voiceDescription: typeof metadata.voice_description === 'string' ? metadata.voice_description : undefined,
        };
    }).filter(item => item.url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
