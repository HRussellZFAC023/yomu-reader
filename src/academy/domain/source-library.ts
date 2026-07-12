export interface LocalizedText {
    readonly en: string;
    readonly ja: string;
}

export interface SourceDocument {
    readonly id: string;
    readonly sha256: string;
    readonly mediaType: string;
    readonly originalName: string;
    readonly extractionRevision: string;
}

export interface SourceOccurrence {
    readonly id: string;
    readonly documentId: string;
    readonly courseId: string;
    readonly sectionId: string;
    readonly weekId?: string;
    readonly sourcePath: string;
}

export interface SourceLocus {
    readonly page: number;
    readonly printedNumber?: string;
    readonly bbox?: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export type SourceMediaRole =
    | 'prompt-image'
    | 'map'
    | 'menu'
    | 'table'
    | 'diagram'
    | 'worked-example'
    | 'listening'
    | 'answer-key';

export interface SourceMedia {
    readonly id: string;
    readonly documentId: string;
    readonly locus: SourceLocus;
    readonly role: SourceMediaRole;
    readonly mediaType: string;
    readonly sha256: string;
    readonly exactSource: boolean;
    readonly alt: LocalizedText;
    readonly runtimeUrl?: string;
}

export interface SourceQuestion {
    readonly id: string;
    readonly documentId: string;
    readonly occurrenceIds: readonly string[];
    readonly locus: SourceLocus;
    readonly instructions: LocalizedText;
    readonly prompt: LocalizedText;
    readonly responseKind: string;
    readonly mediaIds: readonly string[];
    readonly answerKeyRef?: string;
    readonly extractionRevision: string;
}

export interface QuestionAugmentation {
    readonly sourceQuestionId: string;
    readonly conceptIds: readonly string[];
    readonly activityId: string;
    readonly explanationIds: readonly string[];
    readonly hintIds: readonly string[];
    readonly feedbackIds: readonly string[];
    readonly reviewSeedIds: readonly string[];
    readonly storyBindingId?: string;
}

export interface SourceLibrary {
    getDocument(id: string): Promise<SourceDocument>;
    getQuestion(id: string): Promise<SourceQuestion>;
    questionsForOccurrence(id: string): AsyncIterable<SourceQuestion>;
    mediaForQuestion(id: string): Promise<readonly SourceMedia[]>;
}

export interface SourceLibraryData {
    readonly documents: readonly SourceDocument[];
    readonly occurrences: readonly SourceOccurrence[];
    readonly questions: readonly SourceQuestion[];
    readonly media: readonly SourceMedia[];
}

export function createSourceLibrary(data: SourceLibraryData): SourceLibrary {
    const documents = indexById(data.documents, validateDocument, 'document');
    const occurrences = indexById(data.occurrences, validateOccurrence, 'occurrence');
    const questions = indexById(data.questions, validateQuestion, 'question');
    const media = indexById(data.media, validateMedia, 'media');

    for (const occurrence of occurrences.values()) {
        if (!documents.has(occurrence.documentId)) missing('document', occurrence.documentId, `occurrence ${occurrence.id}`);
    }
    for (const question of questions.values()) {
        if (!documents.has(question.documentId)) missing('document', question.documentId, `question ${question.id}`);
        for (const occurrenceId of question.occurrenceIds) {
            const occurrence = occurrences.get(occurrenceId);
            if (!occurrence) missing('occurrence', occurrenceId, `question ${question.id}`);
            if (occurrence.documentId !== question.documentId) {
                throw new Error(`Question ${question.id} crosses source documents through occurrence ${occurrenceId}.`);
            }
        }
        for (const mediaId of question.mediaIds) {
            const item = media.get(mediaId);
            if (!item) missing('media', mediaId, `question ${question.id}`);
            if (item.documentId !== question.documentId) {
                throw new Error(`Question ${question.id} references media ${mediaId} from another document.`);
            }
        }
    }

    return {
        async getDocument(id) {
            return clone(required(documents, id, 'document'));
        },
        async getQuestion(id) {
            return clone(required(questions, id, 'question'));
        },
        async *questionsForOccurrence(id) {
            required(occurrences, id, 'occurrence');
            const matching = [...questions.values()]
                .filter(question => question.occurrenceIds.includes(id))
                .sort(compareQuestions);
            for (const question of matching) yield clone(question);
        },
        async mediaForQuestion(id) {
            const question = required(questions, id, 'question');
            return question.mediaIds.map(mediaId => clone(required(media, mediaId, 'media')));
        },
    };
}

function validateDocument(value: SourceDocument): SourceDocument {
    requireId(value.id, 'document.id');
    if (!/^[a-f0-9]{64}$/iu.test(value.sha256)) throw new TypeError(`Document ${value.id} has an invalid SHA-256.`);
    requireText(value.mediaType, 'document.mediaType');
    requireText(value.originalName, 'document.originalName');
    requireText(value.extractionRevision, 'document.extractionRevision');
    return clone(value);
}

function validateOccurrence(value: SourceOccurrence): SourceOccurrence {
    requireId(value.id, 'occurrence.id');
    requireId(value.documentId, 'occurrence.documentId');
    requireId(value.courseId, 'occurrence.courseId');
    requireId(value.sectionId, 'occurrence.sectionId');
    if (value.weekId !== undefined) requireId(value.weekId, 'occurrence.weekId');
    requireText(value.sourcePath, 'occurrence.sourcePath');
    return clone(value);
}

function validateQuestion(value: SourceQuestion): SourceQuestion {
    requireId(value.id, 'question.id');
    requireId(value.documentId, 'question.documentId');
    requireNonEmptyIds(value.occurrenceIds, 'question.occurrenceIds');
    validateLocus(value.locus, `question ${value.id}`);
    validateLocalizedText(value.instructions, `question ${value.id} instructions`);
    validateLocalizedText(value.prompt, `question ${value.id} prompt`);
    requireText(value.responseKind, 'question.responseKind');
    uniqueIds(value.mediaIds, 'question.mediaIds');
    requireText(value.extractionRevision, 'question.extractionRevision');
    return clone(value);
}

function validateMedia(value: SourceMedia): SourceMedia {
    requireId(value.id, 'media.id');
    requireId(value.documentId, 'media.documentId');
    validateLocus(value.locus, `media ${value.id}`);
    requireText(value.role, 'media.role');
    requireText(value.mediaType, 'media.mediaType');
    if (!/^[a-f0-9]{64}$/iu.test(value.sha256)) throw new TypeError(`Media ${value.id} has an invalid SHA-256.`);
    validateLocalizedText(value.alt, `media ${value.id} alt`);
    return clone(value);
}

function validateLocus(value: SourceLocus, label: string): void {
    if (!Number.isSafeInteger(value.page) || value.page < 1) throw new TypeError(`${label} must use a one-based page.`);
    if (value.bbox) {
        const coordinates = [value.bbox.x, value.bbox.y, value.bbox.width, value.bbox.height];
        if (coordinates.some(coordinate => !Number.isFinite(coordinate)) || value.bbox.width <= 0 || value.bbox.height <= 0) {
            throw new TypeError(`${label} has an invalid bounding box.`);
        }
    }
}

function validateLocalizedText(value: LocalizedText, label: string): void {
    requireText(value.en, `${label}.en`);
    requireText(value.ja, `${label}.ja`);
}

function indexById<T extends { readonly id: string }>(
    values: readonly T[],
    validate: (value: T) => T,
    label: string,
): Map<string, T> {
    if (!Array.isArray(values)) throw new TypeError(`${label}s must be an array.`);
    const index = new Map<string, T>();
    for (const candidate of values) {
        const value = validate(candidate);
        if (index.has(value.id)) throw new Error(`Duplicate ${label} id: ${value.id}`);
        index.set(value.id, value);
    }
    return index;
}

function required<T>(values: ReadonlyMap<string, T>, id: string, label: string): T {
    const normalized = requireId(id, label);
    const value = values.get(normalized);
    if (!value) throw new Error(`Unknown ${label}: ${normalized}`);
    return value;
}

function missing(kind: string, id: string, owner: string): never {
    throw new Error(`Unknown ${kind} ${id} referenced by ${owner}.`);
}

function compareQuestions(left: SourceQuestion, right: SourceQuestion): number {
    return left.locus.page - right.locus.page
        || (left.locus.printedNumber ?? '').localeCompare(right.locus.printedNumber ?? '')
        || left.id.localeCompare(right.id);
}

function requireNonEmptyIds(values: readonly string[], label: string): void {
    if (!values.length) throw new TypeError(`${label} must not be empty.`);
    uniqueIds(values, label);
}

function uniqueIds(values: readonly string[], label: string): void {
    const ids = values.map(value => requireId(value, label));
    if (new Set(ids).size !== ids.length) throw new TypeError(`${label} contains duplicates.`);
}

function requireId(value: string, label: string): string {
    const normalized = requireText(value, label);
    if (!/^[a-z0-9][a-z0-9._:-]*$/iu.test(normalized)) throw new TypeError(`${label} contains unsupported characters.`);
    return normalized;
}

function requireText(value: string, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty.`);
    return value.trim();
}

function clone<T>(value: T): T {
    return structuredClone(value);
}
