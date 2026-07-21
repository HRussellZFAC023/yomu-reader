import type { JPDBCard } from '../app/types';
import { WanikaniClient } from './wanikani';
import { parseWanikaniSubject, type WanikaniSubject } from './wanikani-subjects';

export interface WanikaniAssignmentStatus {
    id: number;
    srsStage: number;
    availableAt: string | null;
    burnedAt: string | null;
    unlockedAt: string | null;
}

export interface WanikaniStudyMaterial {
    meaningNote: string;
    readingNote: string;
    meaningSynonyms: string[];
}

export interface WanikaniReviewStatistic {
    meaningCorrect: number;
    meaningIncorrect: number;
    readingCorrect: number;
    readingIncorrect: number;
    percentageCorrect: number;
}

export interface WanikaniLookupInfo {
    subject: WanikaniSubject;
    assignment: WanikaniAssignmentStatus | null;
    studyMaterial: WanikaniStudyMaterial | null;
    reviewStatistic: WanikaniReviewStatistic | null;
    components: WanikaniSubject[];
    visuallySimilar: WanikaniSubject[];
    relatedVocabulary: WanikaniSubject[];
}

export class WanikaniLookupClient {
    private readonly pending = new Map<string, Promise<WanikaniLookupInfo | null>>();

    constructor(private readonly client: WanikaniClient) {}

    lookupCard(card: JPDBCard): Promise<WanikaniLookupInfo | null> {
        const key = [this.client.tokenFingerprint(), card.wanikaniSubjectId ?? '', card.spelling.trim(), card.reading.trim()].join(':');
        const cached = this.pending.get(key);
        if (cached) return cached;
        const promise = this.lookup(card).finally(() => this.pending.delete(key));
        this.pending.set(key, promise);
        return promise;
    }

    lookupKanji(kanji: string): Promise<WanikaniLookupInfo | null> {
        return this.lookupCard({
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: kanji,
            reading: kanji,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: [],
            pitchAccent: [],
            wordWithReading: kanji,
            source: 'fallback',
        });
    }

    private async lookup(card: JPDBCard): Promise<WanikaniLookupInfo | null> {
        if (!this.client.hasCredential()) return null;
        const spelling = card.spelling.trim();
        if (!spelling && !card.wanikaniSubjectId) return null;
        const rawSubjects = await this.client.getSubjects(card.wanikaniSubjectId
            ? { ids: [card.wanikaniSubjectId] }
            : { slugs: unique([spelling, card.reading.trim()]), types: subjectTypesFor(spelling) });
        const subjects = rawSubjects.map(parseWanikaniSubject).filter((subject): subject is WanikaniSubject => Boolean(subject && !subject.hiddenAt));
        const subject = exactSubject(subjects, spelling, card.reading.trim());
        if (!subject) return null;

        const [assignments, materials, statistics, relatedRaw] = await Promise.all([
            this.client.getAssignments({ subjectIds: [subject.id] }),
            this.client.getStudyMaterials({ subjectIds: [subject.id] }),
            this.client.getReviewStatistics({ subjectIds: [subject.id] }),
            this.relatedSubjects(subject),
        ]);
        const related = relatedRaw.map(parseWanikaniSubject).filter((item): item is WanikaniSubject => Boolean(item && !item.hiddenAt));
        const components = related.filter(item => subject.componentSubjectIds.includes(item.id));
        const visuallySimilar = related.filter(item => subject.visuallySimilarSubjectIds.includes(item.id));
        const relatedVocabulary = related.filter(item => subject.amalgamationSubjectIds.includes(item.id));
        return {
            subject,
            assignment: parseAssignment(assignments[0]),
            studyMaterial: parseStudyMaterial(materials[0]),
            reviewStatistic: parseReviewStatistic(statistics[0]),
            components,
            visuallySimilar,
            relatedVocabulary,
        };
    }

    private relatedSubjects(subject: WanikaniSubject): Promise<unknown[]> {
        const ids = uniqueNumbers([
            ...subject.componentSubjectIds,
            ...subject.visuallySimilarSubjectIds,
            ...subject.amalgamationSubjectIds.slice(0, 24),
        ]);
        return ids.length ? this.client.getSubjects({ ids }) : Promise.resolve([]);
    }
}

function exactSubject(subjects: WanikaniSubject[], spelling: string, reading: string): WanikaniSubject | null {
    const exactCharacters = subjects.filter(subject => subject.characters === spelling || subject.slug === spelling);
    if (!exactCharacters.length) return subjects.length === 1 ? subjects[0] : null;
    if (!reading || reading === spelling) {
        return exactCharacters.find(subject => subject.type === 'kanji') ?? exactCharacters[0];
    }
    return exactCharacters.find(subject => subject.readings.some(candidate => candidate.reading === reading)) ?? exactCharacters[0];
}

function subjectTypesFor(spelling: string): string[] {
    return Array.from(spelling).length === 1 && /[\u3400-\u9fff\uf900-\ufaff]/u.test(spelling)
        ? ['kanji', 'vocabulary', 'kana_vocabulary']
        : ['vocabulary', 'kana_vocabulary'];
}

function parseAssignment(raw: unknown): WanikaniAssignmentStatus | null {
    const record = dataRecord(raw);
    const outer = asRecord(raw);
    const id = numberValue(outer?.id);
    if (!record || id === null) return null;
    return {
        id,
        srsStage: numberValue(record.srs_stage) ?? 0,
        availableAt: stringValue(record.available_at),
        burnedAt: stringValue(record.burned_at),
        unlockedAt: stringValue(record.unlocked_at),
    };
}

function parseStudyMaterial(raw: unknown): WanikaniStudyMaterial | null {
    const data = dataRecord(raw);
    if (!data) return null;
    return {
        meaningNote: stringValue(data.meaning_note) ?? '',
        readingNote: stringValue(data.reading_note) ?? '',
        meaningSynonyms: Array.isArray(data.meaning_synonyms) ? data.meaning_synonyms.filter((value): value is string => typeof value === 'string') : [],
    };
}

function parseReviewStatistic(raw: unknown): WanikaniReviewStatistic | null {
    const data = dataRecord(raw);
    if (!data) return null;
    return {
        meaningCorrect: numberValue(data.meaning_correct) ?? 0,
        meaningIncorrect: numberValue(data.meaning_incorrect) ?? 0,
        readingCorrect: numberValue(data.reading_correct) ?? 0,
        readingIncorrect: numberValue(data.reading_incorrect) ?? 0,
        percentageCorrect: numberValue(data.percentage_correct) ?? 0,
    };
}

function dataRecord(value: unknown): Record<string, unknown> | null {
    const record = asRecord(value);
    return asRecord(record?.data);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function unique(values: string[]): string[] {
    return values.filter((value, index) => Boolean(value) && values.indexOf(value) === index);
}

function uniqueNumbers(values: number[]): number[] {
    return values.filter((value, index) => Number.isFinite(value) && value > 0 && values.indexOf(value) === index);
}
