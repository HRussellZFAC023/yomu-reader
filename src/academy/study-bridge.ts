import type { AcademyConcept, AcademyCopy, ConceptDomain, ConceptVariant } from './content';
import type { JsonValue, ReviewItem } from './progress';
import type { YomuSrsImportBatch, YomuSrsImportItem } from '../reader/srs/types';

export const ACADEMY_STUDY_BUNDLE_VERSION = 1 as const;
export const ACADEMY_STUDY_IMPORT_SOURCE = 'academy-study-bridge:v1';
export const ACADEMY_STUDY_ITEM_QUERY_PARAM = 'academy-item';
/** Comma-joined item ids for a batch review deep link. */
export const ACADEMY_STUDY_ITEMS_QUERY_PARAM = 'academy-items';
export const ACADEMY_STUDY_RETURN_QUERY_PARAM = 'return-to';
/** Tag stamped on every local import so a Yomu review can be traced back here. */
export const ACADEMY_ITEM_TAG_PREFIX = 'academy:item:';

const DEFAULT_STUDY_BASE_URL = '/study';
const DEFAULT_ACADEMY_BASE_URL = '/academy';

export type AcademyStudyTextInput = string | AcademyCopy;
export type AcademyStudyItemKind = 'vocabulary' | 'missed-answer' | 'lesson-concept' | 'srs-checkpoint';
export type AcademyStudyProvenanceKind = 'vocabulary-sheet' | 'missed-answer' | 'lesson-concept' | 'srs-checkpoint';

export interface AcademyStudyText {
    text: string;
    translation?: string;
    reading?: string;
}

export interface AcademyStudyProvenance {
    source: 'academy';
    kind: AcademyStudyProvenanceKind;
    sourceId: string;
    lessonId: string;
    taskId?: string;
    responseId?: string;
    conceptId?: string;
}

export interface AcademyStudyLinks {
    study: string;
    academy: string;
}

export interface AcademyStudyItemBase {
    id: string;
    kind: AcademyStudyItemKind;
    front: AcademyStudyText;
    back: AcademyStudyText;
    tags: readonly string[];
    provenance: readonly AcademyStudyProvenance[];
    links: AcademyStudyLinks;
}

export interface AcademyVocabularyStudyItem extends AcademyStudyItemBase {
    kind: 'vocabulary';
    expression: string;
    reading: string;
    meanings: readonly AcademyStudyText[];
    sentence?: AcademyStudyText;
}

export interface AcademyMissedAnswerStudyItem extends AcademyStudyItemBase {
    kind: 'missed-answer';
    prompt: AcademyStudyText;
    acceptedAnswers: readonly AcademyStudyText[];
    learnerAnswers: readonly AcademyStudyText[];
    explanation?: AcademyStudyText;
}

export interface AcademyLessonConceptStudyItem extends AcademyStudyItemBase {
    kind: 'lesson-concept';
    conceptId: string;
    variantId?: string;
    domain: ConceptDomain;
    title: AcademyStudyText;
    summary: AcademyStudyText;
    form?: string;
    examples: readonly AcademyStudyText[];
}

export interface AcademySrsCheckpoint {
    lessonId: string;
    taskId: string;
    dueAt: number;
    intervalDays: number;
    lapseCount: number;
    lastAttemptAt: number;
    completedAt: number | null;
    context?: JsonValue;
    prompt?: AcademyStudyTextInput;
    summary?: AcademyStudyTextInput;
    tags?: readonly string[];
}

export interface AcademySrsCheckpointStudyItem extends AcademyStudyItemBase {
    kind: 'srs-checkpoint';
    checkpoint: Omit<AcademySrsCheckpoint, 'prompt' | 'summary' | 'tags'>;
}

export type AcademyStudyItem =
    | AcademyVocabularyStudyItem
    | AcademyMissedAnswerStudyItem
    | AcademyLessonConceptStudyItem
    | AcademySrsCheckpointStudyItem;

export interface AcademyVocabularyEntry {
    id: string;
    expression: string;
    reading?: string;
    meanings: readonly AcademyStudyTextInput[];
    sentence?: AcademyStudyTextInput;
    tags?: readonly string[];
}

export interface AcademyVocabularySheet {
    id: string;
    lessonId: string;
    entries: readonly AcademyVocabularyEntry[];
    tags?: readonly string[];
}

export interface AcademyMissedAnswer {
    id: string;
    lessonId: string;
    taskId: string;
    responseId?: string;
    prompt: AcademyStudyTextInput;
    acceptedAnswers: AcademyStudyTextInput | readonly AcademyStudyTextInput[];
    learnerAnswer?: AcademyStudyTextInput | readonly AcademyStudyTextInput[];
    explanation?: AcademyStudyTextInput;
    tags?: readonly string[];
}

export interface AcademyLessonConcept {
    lessonId: string;
    taskId?: string;
    concept: AcademyConcept;
    variant?: ConceptVariant;
    tags?: readonly string[];
}

export interface AcademyStudyRoutes {
    studyBaseUrl?: string;
    academyBaseUrl?: string;
}

export interface AcademyStudyBridgeInput {
    vocabularySheets?: readonly AcademyVocabularySheet[];
    missedAnswers?: readonly AcademyMissedAnswer[];
    lessonConcepts?: readonly AcademyLessonConcept[];
    checkpoints?: readonly AcademySrsCheckpoint[];
    routes?: AcademyStudyRoutes;
}

export interface AcademyStudyBundle {
    version: typeof ACADEMY_STUDY_BUNDLE_VERSION;
    items: readonly AcademyStudyItem[];
}

export interface AcademyLocalYomuSrsImport {
    batch: YomuSrsImportBatch;
    excludedCheckpointItemIds: readonly string[];
}

export interface AcademyStudyLocalImportTarget {
    importBatch(batch: YomuSrsImportBatch): Promise<{ imported: number; skipped: number }>;
}

export interface AcademyStudyLocalImportReceipt extends AcademyLocalYomuSrsImport {
    imported: number;
    skipped: number;
}

interface NormalizedRoutes {
    studyBaseUrl: string;
    academyBaseUrl: string;
}

interface MergedItemBase {
    id: string;
    tags: string[];
    provenance: AcademyStudyProvenance[];
    links: AcademyStudyLinks;
}

export function createAcademyStudyBundle(input: AcademyStudyBridgeInput = {}): AcademyStudyBundle {
    const routes = normalizeRoutes(input.routes);
    const items: AcademyStudyItem[] = [];

    for (const sheet of input.vocabularySheets ?? []) {
        items.push(...studyItemsFromVocabularySheet(sheet, routes));
    }
    for (const missedAnswer of input.missedAnswers ?? []) {
        const item = studyItemFromMissedAnswer(missedAnswer, routes);
        if (item) items.push(item);
    }
    for (const concept of input.lessonConcepts ?? []) {
        const item = studyItemFromLessonConcept(concept, routes);
        if (item) items.push(item);
    }
    for (const checkpoint of input.checkpoints ?? []) {
        const item = studyItemFromSrsCheckpoint(checkpoint, routes);
        if (item) items.push(item);
    }

    return {
        version: ACADEMY_STUDY_BUNDLE_VERSION,
        items: deduplicateAcademyStudyItems(items, routes),
    };
}

export const buildAcademyStudyBundle = createAcademyStudyBundle;

export function studyItemsFromVocabularySheet(
    sheet: AcademyVocabularySheet,
    routes: AcademyStudyRoutes | NormalizedRoutes = {},
): AcademyVocabularyStudyItem[] {
    const normalizedRoutes = normalizeRoutes(routes);
    const sheetId = normalizeText(sheet.id);
    const lessonId = normalizeText(sheet.lessonId);
    if (!sheetId || !lessonId) return [];

    return sheet.entries.flatMap(entry => {
        const entryId = normalizeText(entry.id);
        const expression = normalizeText(entry.expression);
        const reading = normalizeText(entry.reading ?? '') || expression;
        const meanings = uniqueStudyTexts(entry.meanings.map(toStudyText).filter(isDefined));
        if (!entryId || !expression || !meanings.length) return [];

        const sentence = toStudyText(entry.sentence);
        const provenance: AcademyStudyProvenance[] = [{
            source: 'academy',
            kind: 'vocabulary-sheet',
            sourceId: `${sheetId}:${entryId}`,
            lessonId,
        }];
        const id = academyStudyItemId('vocabulary', lessonId, expression, reading);
        const base = mergedItemBase(id, [
            ...sheet.tags ?? [],
            ...entry.tags ?? [],
            'academy',
            'academy:vocabulary',
            `academy:lesson:${lessonId}`,
        ], provenance, normalizedRoutes);
        const item: AcademyVocabularyStudyItem = {
            ...base,
            kind: 'vocabulary',
            expression,
            reading,
            meanings,
            front: reading === expression ? { text: expression } : { text: expression, reading },
            back: studyTextListSide(meanings),
        };
        if (sentence) item.sentence = sentence;
        return [item];
    });
}

export function studyItemFromMissedAnswer(
    missedAnswer: AcademyMissedAnswer,
    routes: AcademyStudyRoutes | NormalizedRoutes = {},
): AcademyMissedAnswerStudyItem | null {
    const normalizedRoutes = normalizeRoutes(routes);
    const lessonId = normalizeText(missedAnswer.lessonId);
    const taskId = normalizeText(missedAnswer.taskId);
    const sourceId = normalizeText(missedAnswer.id);
    const prompt = toStudyText(missedAnswer.prompt);
    const acceptedAnswers = uniqueStudyTexts(toStudyTextList(missedAnswer.acceptedAnswers));
    if (!lessonId || !taskId || !sourceId || !prompt || !acceptedAnswers.length) return null;

    const responseId = normalizeText(missedAnswer.responseId ?? '');
    const learnerAnswers = uniqueStudyTexts(toStudyTextList(missedAnswer.learnerAnswer));
    const explanation = toStudyText(missedAnswer.explanation);
    const provenance: AcademyStudyProvenance[] = [{
        source: 'academy',
        kind: 'missed-answer',
        sourceId,
        lessonId,
        taskId,
        ...(responseId ? { responseId } : {}),
    }];
    const id = academyStudyItemId('missed-answer', lessonId, taskId, sourceId);
    const base = mergedItemBase(id, [
        ...missedAnswer.tags ?? [],
        'academy',
        'academy:missed-answer',
        `academy:lesson:${lessonId}`,
        `academy:task:${taskId}`,
    ], provenance, normalizedRoutes);
    const item: AcademyMissedAnswerStudyItem = {
        ...base,
        kind: 'missed-answer',
        prompt,
        acceptedAnswers,
        learnerAnswers,
        front: prompt,
        back: studyTextListSide(acceptedAnswers),
    };
    if (explanation) item.explanation = explanation;
    return item;
}

export function studyItemFromLessonConcept(
    lessonConcept: AcademyLessonConcept,
    routes: AcademyStudyRoutes | NormalizedRoutes = {},
): AcademyLessonConceptStudyItem | null {
    const normalizedRoutes = normalizeRoutes(routes);
    const lessonId = normalizeText(lessonConcept.lessonId);
    const taskId = normalizeText(lessonConcept.taskId ?? '');
    const conceptId = normalizeText(lessonConcept.concept.id);
    if (!lessonId || !conceptId) return null;

    const variant = lessonConcept.variant && normalizeText(lessonConcept.variant.conceptId) === conceptId
        ? lessonConcept.variant
        : undefined;
    const sourceId = normalizeText(variant?.id ?? lessonConcept.concept.id);
    const title = toStudyText(variant?.label ?? lessonConcept.concept.title);
    const summary = toStudyText(variant?.explanation ?? lessonConcept.concept.summary);
    if (!sourceId || !title || !summary) return null;

    const form = normalizeText(variant?.form ?? '') || undefined;
    const examples = uniqueStudyTexts([toStudyText(variant?.example)].filter(isDefined));
    const provenance: AcademyStudyProvenance[] = [{
        source: 'academy',
        kind: 'lesson-concept',
        sourceId,
        lessonId,
        ...(taskId ? { taskId } : {}),
        conceptId,
    }];
    const id = academyStudyItemId('lesson-concept', sourceId);
    const base = mergedItemBase(id, [
        ...lessonConcept.tags ?? [],
        'academy',
        'academy:lesson-concept',
        `academy:concept:${conceptId}`,
        `academy:domain:${lessonConcept.concept.domain}`,
        `academy:lesson:${lessonId}`,
    ], provenance, normalizedRoutes);
    return {
        ...base,
        kind: 'lesson-concept',
        conceptId,
        ...(variant ? { variantId: sourceId } : {}),
        domain: lessonConcept.concept.domain,
        title,
        summary,
        ...(form ? { form } : {}),
        examples,
        front: conceptFront(title, form),
        back: summary,
    };
}

export function studyItemFromSrsCheckpoint(
    checkpoint: AcademySrsCheckpoint | ReviewItem,
    routes: AcademyStudyRoutes | NormalizedRoutes = {},
): AcademySrsCheckpointStudyItem | null {
    const normalizedRoutes = normalizeRoutes(routes);
    const normalizedCheckpoint = normalizeCheckpoint(checkpoint);
    if (!normalizedCheckpoint) return null;

    const prompt = toStudyText('prompt' in checkpoint ? checkpoint.prompt : undefined)
        ?? { text: `Review ${normalizedCheckpoint.taskId}` };
    const summary = toStudyText('summary' in checkpoint ? checkpoint.summary : undefined)
        ?? { text: 'Return to Academy for this scheduled review.' };
    const tags = 'tags' in checkpoint ? checkpoint.tags : undefined;
    const provenance: AcademyStudyProvenance[] = [{
        source: 'academy',
        kind: 'srs-checkpoint',
        sourceId: `${normalizedCheckpoint.lessonId}:${normalizedCheckpoint.taskId}`,
        lessonId: normalizedCheckpoint.lessonId,
        taskId: normalizedCheckpoint.taskId,
    }];
    const id = academyStudyItemId('srs-checkpoint', normalizedCheckpoint.lessonId, normalizedCheckpoint.taskId);
    const base = mergedItemBase(id, [
        ...tags ?? [],
        'academy',
        'academy:srs-checkpoint',
        `academy:lesson:${normalizedCheckpoint.lessonId}`,
        `academy:task:${normalizedCheckpoint.taskId}`,
    ], provenance, normalizedRoutes);
    return {
        ...base,
        kind: 'srs-checkpoint',
        checkpoint: normalizedCheckpoint,
        front: prompt,
        back: summary,
    };
}

export function deduplicateAcademyStudyItems(
    items: readonly AcademyStudyItem[],
    routes: AcademyStudyRoutes | NormalizedRoutes = {},
): AcademyStudyItem[] {
    const normalizedRoutes = normalizeRoutes(routes);
    const grouped = new Map<string, AcademyStudyItem[]>();
    for (const item of items) {
        const key = `${item.kind}\u0000${item.id}`;
        const group = grouped.get(key);
        if (group) group.push(item);
        else grouped.set(key, [item]);
    }

    return Array.from(grouped.values())
        .map(group => mergeStudyItemGroup(group, normalizedRoutes))
        .sort(compareStudyItems);
}

export function academyStudyItemId(kind: AcademyStudyItemKind, ...identity: readonly string[]): string {
    return ['academy', kind, ...identity.map(stableIdSegment)].join(':');
}

export function toLocalYomuSrsImport(
    bundle: AcademyStudyBundle,
    importedAt: number,
): AcademyLocalYomuSrsImport {
    const timestamp = normalizedTimestamp(importedAt, 'importedAt');
    const items = [...bundle.items].sort(compareStudyItems);
    const excludedCheckpointItemIds = items
        .filter((item): item is AcademySrsCheckpointStudyItem => item.kind === 'srs-checkpoint')
        .map(item => item.id);

    return {
        batch: {
            source: ACADEMY_STUDY_IMPORT_SOURCE,
            importedAt: timestamp,
            items: items
                .filter((item): item is Exclude<AcademyStudyItem, AcademySrsCheckpointStudyItem> => item.kind !== 'srs-checkpoint')
                .map(studyItemToLocalImport),
        },
        excludedCheckpointItemIds,
    };
}

export function toLocalYomuSrsImportBatch(bundle: AcademyStudyBundle, importedAt: number): YomuSrsImportBatch {
    return toLocalYomuSrsImport(bundle, importedAt).batch;
}

export async function importAcademyStudyBundle(
    target: AcademyStudyLocalImportTarget,
    bundle: AcademyStudyBundle,
    importedAt: number,
): Promise<AcademyStudyLocalImportReceipt> {
    const projection = toLocalYomuSrsImport(bundle, importedAt);
    const result = await target.importBatch(projection.batch);
    return { ...projection, ...result };
}

function mergeStudyItemGroup(items: readonly AcademyStudyItem[], routes: NormalizedRoutes): AcademyStudyItem {
    const [first] = items;
    if (!first) throw new Error('Cannot merge an empty Academy study-item group.');

    switch (first.kind) {
        case 'vocabulary':
            return mergeVocabularyItems(items.filter(isVocabularyStudyItem), routes);
        case 'missed-answer':
            return mergeMissedAnswerItems(items.filter(isMissedAnswerStudyItem), routes);
        case 'lesson-concept':
            return mergeLessonConceptItems(items.filter(isLessonConceptStudyItem), routes);
        case 'srs-checkpoint':
            return mergeCheckpointItems(items.filter(isCheckpointStudyItem), routes);
    }
}

function mergeVocabularyItems(items: readonly AcademyVocabularyStudyItem[], routes: NormalizedRoutes): AcademyVocabularyStudyItem {
    const base = mergeBase(items, routes);
    const expression = preferredString(items.map(item => item.expression));
    const reading = preferredString(items.map(item => item.reading)) || expression;
    const meanings = uniqueStudyTexts(items.flatMap(item => item.meanings));
    const sentence = preferredStudyText(items.map(item => item.sentence).filter(isDefined));
    const item: AcademyVocabularyStudyItem = {
        ...base,
        kind: 'vocabulary',
        expression,
        reading,
        meanings,
        front: reading === expression ? { text: expression } : { text: expression, reading },
        back: studyTextListSide(meanings),
    };
    if (sentence) item.sentence = sentence;
    return item;
}

function mergeMissedAnswerItems(items: readonly AcademyMissedAnswerStudyItem[], routes: NormalizedRoutes): AcademyMissedAnswerStudyItem {
    const base = mergeBase(items, routes);
    const prompt = preferredStudyText(items.map(item => item.prompt)) ?? { text: '' };
    const acceptedAnswers = uniqueStudyTexts(items.flatMap(item => item.acceptedAnswers));
    const learnerAnswers = uniqueStudyTexts(items.flatMap(item => item.learnerAnswers));
    const explanation = preferredStudyText(items.map(item => item.explanation).filter(isDefined));
    const item: AcademyMissedAnswerStudyItem = {
        ...base,
        kind: 'missed-answer',
        prompt,
        acceptedAnswers,
        learnerAnswers,
        front: prompt,
        back: studyTextListSide(acceptedAnswers),
    };
    if (explanation) item.explanation = explanation;
    return item;
}

function mergeLessonConceptItems(items: readonly AcademyLessonConceptStudyItem[], routes: NormalizedRoutes): AcademyLessonConceptStudyItem {
    const base = mergeBase(items, routes);
    const title = preferredStudyText(items.map(item => item.title)) ?? { text: '' };
    const summary = preferredStudyText(items.map(item => item.summary)) ?? { text: '' };
    const form = preferredString(items.map(item => item.form ?? '')) || undefined;
    const variantId = preferredString(items.map(item => item.variantId ?? '')) || undefined;
    return {
        ...base,
        kind: 'lesson-concept',
        conceptId: preferredString(items.map(item => item.conceptId)),
        ...(variantId ? { variantId } : {}),
        domain: [...items].sort((left, right) => compareText(left.domain, right.domain))[0]!.domain,
        title,
        summary,
        ...(form ? { form } : {}),
        examples: uniqueStudyTexts(items.flatMap(item => item.examples)),
        front: conceptFront(title, form),
        back: summary,
    };
}

function mergeCheckpointItems(items: readonly AcademySrsCheckpointStudyItem[], routes: NormalizedRoutes): AcademySrsCheckpointStudyItem {
    const base = mergeBase(items, routes);
    const selected = [...items].sort(compareCheckpointItems)[0]!;
    return {
        ...base,
        kind: 'srs-checkpoint',
        checkpoint: cloneCheckpoint(selected.checkpoint),
        front: selected.front,
        back: selected.back,
    };
}

function mergeBase(items: readonly AcademyStudyItem[], routes: NormalizedRoutes): MergedItemBase {
    const [first] = [...items].sort(compareStudyItems);
    if (!first) throw new Error('Cannot merge an empty Academy study-item group.');
    const provenance = uniqueProvenance(items.flatMap(item => item.provenance));
    return mergedItemBase(
        first.id,
        items.flatMap(item => item.tags),
        provenance,
        routes,
    );
}

function mergedItemBase(
    id: string,
    tags: readonly string[],
    provenance: readonly AcademyStudyProvenance[],
    routes: NormalizedRoutes,
): MergedItemBase {
    const normalizedProvenance = uniqueProvenance(provenance);
    return {
        id,
        tags: uniqueStrings(tags),
        provenance: normalizedProvenance,
        links: studyLinksFor(id, normalizedProvenance, routes),
    };
}

function studyItemToLocalImport(item: Exclude<AcademyStudyItem, AcademySrsCheckpointStudyItem>): YomuSrsImportItem {
    const meanings = localMeaningsFor(item);
    const expression = item.front.text;
    const reading = item.front.reading ?? expression;
    const sentence = localSentenceFor(item);
    const localItem: YomuSrsImportItem = {
        expression,
        reading,
        meanings,
        sourceUrl: item.links.academy,
        tags: uniqueStrings([
            ...item.tags,
            'academy',
            `${ACADEMY_ITEM_TAG_PREFIX}${item.id}`,
        ]),
    };
    if (sentence) localItem.sentence = sentence;
    return localItem;
}

function localMeaningsFor(item: Exclude<AcademyStudyItem, AcademySrsCheckpointStudyItem>): string[] {
    switch (item.kind) {
        case 'vocabulary':
            return uniqueStrings(item.meanings.map(text => text.translation ?? text.text));
        case 'missed-answer':
            return uniqueStrings(item.acceptedAnswers.map(text => text.text));
        case 'lesson-concept':
            return uniqueStrings([
                item.summary.translation ?? item.summary.text,
                ...item.examples.map(text => text.translation ?? text.text),
            ]);
    }
}

function localSentenceFor(item: Exclude<AcademyStudyItem, AcademySrsCheckpointStudyItem>): string | undefined {
    switch (item.kind) {
        case 'vocabulary':
            return item.sentence?.text;
        case 'missed-answer':
            return item.explanation?.text;
        case 'lesson-concept':
            return item.examples[0]?.text;
    }
}

function normalizeCheckpoint(checkpoint: AcademySrsCheckpoint | ReviewItem): Omit<AcademySrsCheckpoint, 'prompt' | 'summary' | 'tags'> | null {
    const lessonId = normalizeText(checkpoint.lessonId);
    const taskId = normalizeText(checkpoint.taskId);
    if (!lessonId || !taskId) return null;
    if (!isFiniteNumber(checkpoint.dueAt)
        || !isFiniteNumber(checkpoint.intervalDays)
        || !isFiniteNumber(checkpoint.lapseCount)
        || !isFiniteNumber(checkpoint.lastAttemptAt)
        || (checkpoint.completedAt !== null && !isFiniteNumber(checkpoint.completedAt))) {
        return null;
    }

    const normalized: Omit<AcademySrsCheckpoint, 'prompt' | 'summary' | 'tags'> = {
        lessonId,
        taskId,
        dueAt: Math.trunc(checkpoint.dueAt),
        intervalDays: Math.trunc(checkpoint.intervalDays),
        lapseCount: Math.max(0, Math.trunc(checkpoint.lapseCount)),
        lastAttemptAt: Math.trunc(checkpoint.lastAttemptAt),
        completedAt: checkpoint.completedAt === null ? null : Math.trunc(checkpoint.completedAt),
    };
    if (checkpoint.context !== undefined) normalized.context = cloneJsonValue(checkpoint.context);
    return normalized;
}

function cloneCheckpoint(checkpoint: Omit<AcademySrsCheckpoint, 'prompt' | 'summary' | 'tags'>): Omit<AcademySrsCheckpoint, 'prompt' | 'summary' | 'tags'> {
    const copy = { ...checkpoint };
    if (checkpoint.context !== undefined) copy.context = cloneJsonValue(checkpoint.context);
    return copy;
}

function studyLinksFor(id: string, provenance: readonly AcademyStudyProvenance[], routes: NormalizedRoutes): AcademyStudyLinks {
    const source = provenance[0];
    const study = appendQuery(routes.studyBaseUrl, [
        ['source', 'academy'],
        [ACADEMY_STUDY_ITEM_QUERY_PARAM, id],
    ]);
    const academy = appendQuery(routes.academyBaseUrl, [
        [ACADEMY_STUDY_ITEM_QUERY_PARAM, id],
        ['lesson', source?.lessonId],
        ['task', source?.taskId],
        ['response', source?.responseId],
        ['concept', source?.conceptId],
    ]);
    return {
        study: appendQuery(study, [[ACADEMY_STUDY_RETURN_QUERY_PARAM, academy]]),
        academy: appendQuery(academy, [[ACADEMY_STUDY_RETURN_QUERY_PARAM, study]]),
    };
}

function appendQuery(base: string, entries: ReadonlyArray<readonly [string, string | undefined]>): string {
    const parameters = entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    if (!parameters.length) return base;
    const hashIndex = base.indexOf('#');
    const beforeHash = hashIndex < 0 ? base : base.slice(0, hashIndex);
    const hash = hashIndex < 0 ? '' : base.slice(hashIndex);
    const separator = beforeHash.includes('?') ? '&' : '?';
    const query = parameters.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    return `${beforeHash}${separator}${query}${hash}`;
}

function normalizeRoutes(routes: AcademyStudyRoutes | NormalizedRoutes | undefined): NormalizedRoutes {
    return {
        studyBaseUrl: safeRouteBase(routes?.studyBaseUrl, DEFAULT_STUDY_BASE_URL),
        academyBaseUrl: safeRouteBase(routes?.academyBaseUrl, DEFAULT_ACADEMY_BASE_URL),
    };
}

function safeRouteBase(value: string | undefined, fallback: string): string {
    const candidate = normalizeText(value ?? '');
    if (!candidate) return fallback;
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : fallback;
    } catch {
        return fallback;
    }
}

function conceptFront(title: AcademyStudyText, form: string | undefined): AcademyStudyText {
    return form ? { text: form } : title;
}

function studyTextListSide(texts: readonly AcademyStudyText[]): AcademyStudyText {
    const normalized = uniqueStudyTexts(texts);
    const text = normalized.map(item => item.text).join(' / ');
    const translations = uniqueStrings(normalized.map(item => item.translation ?? ''));
    return translations.length ? { text, translation: translations.join(' / ') } : { text };
}

function toStudyText(value: AcademyStudyTextInput | undefined): AcademyStudyText | undefined {
    if (typeof value === 'string') {
        const text = normalizeText(value);
        return text ? { text } : undefined;
    }
    if (!value || typeof value !== 'object') return undefined;
    const english = normalizeText(value.en);
    const japanese = normalizeText(value.ja ?? '');
    if (japanese) return english ? { text: japanese, translation: english } : { text: japanese };
    return english ? { text: english } : undefined;
}

function toStudyTextList(value: AcademyStudyTextInput | readonly AcademyStudyTextInput[] | undefined): AcademyStudyText[] {
    if (value === undefined) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.map(toStudyText).filter(isDefined);
}

function uniqueStudyTexts(values: readonly AcademyStudyText[]): AcademyStudyText[] {
    const byText = new Map<string, AcademyStudyText>();
    for (const value of values) {
        const text = normalizeText(value.text);
        if (!text) continue;
        const candidate: AcademyStudyText = { text };
        const translation = normalizeText(value.translation ?? '');
        const reading = normalizeText(value.reading ?? '');
        if (translation) candidate.translation = translation;
        if (reading) candidate.reading = reading;
        const key = canonicalText(text);
        const existing = byText.get(key);
        byText.set(key, existing ? mergeStudyText(existing, candidate) : candidate);
    }
    return [...byText.values()].sort(compareStudyTexts);
}

function mergeStudyText(left: AcademyStudyText, right: AcademyStudyText): AcademyStudyText {
    const translation = preferredString([left.translation ?? '', right.translation ?? '']);
    const reading = preferredString([left.reading ?? '', right.reading ?? '']);
    return {
        text: preferredString([left.text, right.text]),
        ...(translation ? { translation } : {}),
        ...(reading ? { reading } : {}),
    };
}

function preferredStudyText(values: readonly AcademyStudyText[]): AcademyStudyText | undefined {
    return uniqueStudyTexts(values)[0];
}

function uniqueProvenance(values: readonly AcademyStudyProvenance[]): AcademyStudyProvenance[] {
    const byKey = new Map<string, AcademyStudyProvenance>();
    for (const value of values) {
        const candidate = normalizeProvenance(value);
        if (!candidate) continue;
        const key = provenanceKey(candidate);
        const existing = byKey.get(key);
        byKey.set(key, existing ? preferredProvenance(existing, candidate) : candidate);
    }
    return [...byKey.values()].sort(compareProvenance);
}

function normalizeProvenance(value: AcademyStudyProvenance): AcademyStudyProvenance | null {
    const sourceId = normalizeText(value.sourceId);
    const lessonId = normalizeText(value.lessonId);
    if (!sourceId || !lessonId) return null;
    const taskId = normalizeText(value.taskId ?? '');
    const responseId = normalizeText(value.responseId ?? '');
    const conceptId = normalizeText(value.conceptId ?? '');
    return {
        source: 'academy',
        kind: value.kind,
        sourceId,
        lessonId,
        ...(taskId ? { taskId } : {}),
        ...(responseId ? { responseId } : {}),
        ...(conceptId ? { conceptId } : {}),
    };
}

function preferredProvenance(left: AcademyStudyProvenance, right: AcademyStudyProvenance): AcademyStudyProvenance {
    return compareProvenance(left, right) <= 0 ? left : right;
}

function provenanceKey(value: AcademyStudyProvenance): string {
    return [
        value.source,
        value.kind,
        value.sourceId,
        value.lessonId,
        value.taskId ?? '',
        value.responseId ?? '',
        value.conceptId ?? '',
    ].map(canonicalText).join('\u0000');
}

function compareProvenance(left: AcademyStudyProvenance, right: AcademyStudyProvenance): number {
    return compareText(provenanceKey(left), provenanceKey(right));
}

function compareStudyItems(left: AcademyStudyItem, right: AcademyStudyItem): number {
    return compareText(left.id, right.id) || compareText(left.kind, right.kind);
}

function compareCheckpointItems(left: AcademySrsCheckpointStudyItem, right: AcademySrsCheckpointStudyItem): number {
    return right.checkpoint.lastAttemptAt - left.checkpoint.lastAttemptAt
        || right.checkpoint.dueAt - left.checkpoint.dueAt
        || right.checkpoint.intervalDays - left.checkpoint.intervalDays
        || right.checkpoint.lapseCount - left.checkpoint.lapseCount
        || compareText(stableJson(left.checkpoint.context), stableJson(right.checkpoint.context));
}

function compareStudyTexts(left: AcademyStudyText, right: AcademyStudyText): number {
    return compareText(left.text, right.text)
        || compareText(left.translation ?? '', right.translation ?? '')
        || compareText(left.reading ?? '', right.reading ?? '');
}

function compareText(left: string, right: string): number {
    const canonicalComparison = canonicalText(left) < canonicalText(right)
        ? -1
        : canonicalText(left) > canonicalText(right)
            ? 1
            : 0;
    if (canonicalComparison) return canonicalComparison;
    return left < right ? -1 : left > right ? 1 : 0;
}

function preferredString(values: readonly string[]): string {
    return values
        .map(normalizeText)
        .filter(Boolean)
        .sort((left, right) => right.length - left.length || compareText(left, right))[0] ?? '';
}

function uniqueStrings(values: readonly string[]): string[] {
    const byKey = new Map<string, string>();
    for (const value of values) {
        const normalized = normalizeText(value);
        if (!normalized) continue;
        const key = canonicalText(normalized);
        const existing = byKey.get(key);
        byKey.set(key, existing ? preferredString([existing, normalized]) : normalized);
    }
    return [...byKey.values()].sort(compareText);
}

function stableIdSegment(value: string): string {
    return encodeURIComponent(canonicalText(value) || '_');
}

function canonicalText(value: string): string {
    return normalizeText(value).toLowerCase();
}

function normalizeText(value: string): string {
    return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function normalizedTimestamp(value: number, label: string): number {
    if (!isFiniteNumber(value)) throw new RangeError(`${label} must be a finite timestamp.`);
    return Math.trunc(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function cloneJsonValue(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(cloneJsonValue);
    if (value && typeof value === 'object') {
        const copy: Record<string, JsonValue> = {};
        for (const key of Object.keys(value).sort(compareText)) copy[key] = cloneJsonValue(value[key]!);
        return copy;
    }
    return value;
}

function stableJson(value: JsonValue | undefined): string {
    if (value === undefined) return '';
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${stableJson(value[key]!)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

function isVocabularyStudyItem(item: AcademyStudyItem): item is AcademyVocabularyStudyItem {
    return item.kind === 'vocabulary';
}

function isMissedAnswerStudyItem(item: AcademyStudyItem): item is AcademyMissedAnswerStudyItem {
    return item.kind === 'missed-answer';
}

function isLessonConceptStudyItem(item: AcademyStudyItem): item is AcademyLessonConceptStudyItem {
    return item.kind === 'lesson-concept';
}

function isCheckpointStudyItem(item: AcademyStudyItem): item is AcademySrsCheckpointStudyItem {
    return item.kind === 'srs-checkpoint';
}

/* ============================================================================
 * Deep links + SRS round-trip.
 *
 * The pieces above turn Academy material into Yomu study items and import them
 * locally. These add the two directions that make it a loop:
 *
 *   forward — one deep link that opens a whole set of items in /study, and a
 *             seed schedule so missed answers and vocab become SRS checkpoints;
 *   back    — read a /study or /academy link's parameters, and fold Yomu review
 *             outcomes back onto Academy items so the app can mark them known
 *             and reschedule.
 *
 * Everything here is pure and deterministic; the app owns persistence.
 * ========================================================================== */

const DAY_MS = 86_400_000;

/** Review ladder, mirroring the Academy progression engine so schedules line up. */
export const ACADEMY_SRS_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export interface AcademyStudyBatchLinkInput {
    items: readonly string[];
    lessonId?: string;
    taskId?: string;
    routes?: AcademyStudyRoutes;
}

/**
 * One /study deep link that opens every item in a bundle (or an explicit id
 * list) for review, paired with the /academy link to return to. Item order is
 * preserved; duplicates and blanks are dropped.
 */
export function studyReviewLink(
    input: AcademyStudyBundle | AcademyStudyBatchLinkInput,
    routes: AcademyStudyRoutes = {},
): AcademyStudyLinks {
    const isBatch = isBatchLinkInput(input);
    const normalizedRoutes = normalizeRoutes(isBatch ? input.routes ?? routes : routes);
    const ids = uniqueStrings(collectItemIds(input));
    const lessonId = isBatch ? normalizeText(input.lessonId ?? '') : firstLessonId(input);
    const taskId = isBatch ? normalizeText(input.taskId ?? '') : '';

    const study = appendQuery(normalizedRoutes.studyBaseUrl, [
        ['source', 'academy'],
        [ACADEMY_STUDY_ITEMS_QUERY_PARAM, ids.length ? ids.join(',') : undefined],
        [ACADEMY_STUDY_ITEM_QUERY_PARAM, ids[0]],
    ]);
    const academy = appendQuery(normalizedRoutes.academyBaseUrl, [
        [ACADEMY_STUDY_ITEMS_QUERY_PARAM, ids.length ? ids.join(',') : undefined],
        [ACADEMY_STUDY_ITEM_QUERY_PARAM, ids[0]],
        ['lesson', lessonId || undefined],
        ['task', taskId || undefined],
    ]);
    return {
        study: appendQuery(study, [[ACADEMY_STUDY_RETURN_QUERY_PARAM, academy]]),
        academy: appendQuery(academy, [[ACADEMY_STUDY_RETURN_QUERY_PARAM, study]]),
    };
}

export interface AcademyStudyLinkParams {
    source: string | null;
    itemIds: readonly string[];
    lessonId: string | null;
    taskId: string | null;
    responseId: string | null;
    conceptId: string | null;
    returnTo: string | null;
}

/**
 * Read the Academy parameters off an incoming link — the "back" direction, used
 * when /study hands control back to Academy (or vice versa). Accepts a full URL,
 * a bare query string, or `URLSearchParams`; never throws on malformed input.
 */
export function parseAcademyStudyLink(input: string | URLSearchParams): AcademyStudyLinkParams {
    const params = toSearchParams(input);
    const single = normalizeText(params.get(ACADEMY_STUDY_ITEM_QUERY_PARAM) ?? '');
    const many = (params.get(ACADEMY_STUDY_ITEMS_QUERY_PARAM) ?? '')
        .split(',')
        .map(normalizeText)
        .filter(Boolean);
    return {
        source: normalizeText(params.get('source') ?? '') || null,
        itemIds: uniqueStrings([...many, single].filter(Boolean)),
        lessonId: normalizeText(params.get('lesson') ?? '') || null,
        taskId: normalizeText(params.get('task') ?? '') || null,
        responseId: normalizeText(params.get('response') ?? '') || null,
        conceptId: normalizeText(params.get('concept') ?? '') || null,
        returnTo: normalizeText(params.get(ACADEMY_STUDY_RETURN_QUERY_PARAM) ?? '') || null,
    };
}

/** Recover the Academy item id from a Yomu import item's tags, if present. */
export function academyItemIdFromTags(tags: readonly string[] | undefined): string | null {
    for (const tag of tags ?? []) {
        const normalized = normalizeText(tag);
        if (normalized.startsWith(ACADEMY_ITEM_TAG_PREFIX)) {
            const id = normalized.slice(ACADEMY_ITEM_TAG_PREFIX.length).trim();
            if (id) return id;
        }
    }
    return null;
}

/** Recover the Academy item id from a source URL carrying the item query param. */
export function academyItemIdFromUrl(url: string | undefined): string | null {
    const id = normalizeText(toSearchParams(url ?? '').get(ACADEMY_STUDY_ITEM_QUERY_PARAM) ?? '');
    return id || null;
}

export interface AcademyCheckpointSeedOptions {
    /** Clock for the seed's timestamps. */
    now: number;
    /** Which item kinds seed checkpoints. Defaults to vocabulary + missed-answer. */
    kinds?: readonly AcademyStudyItemKind[];
}

/**
 * Seed SRS checkpoints from a bundle so missed answers and vocab flow into
 * /study's scheduler. Missed answers come due immediately (just got them
 * wrong); vocabulary comes due after the first interval. The item id rides in
 * `context.itemId` so a later review can be folded back with
 * `applyYomuSrsReview`.
 */
export function academySrsCheckpointsFromBundle(
    bundle: AcademyStudyBundle,
    options: AcademyCheckpointSeedOptions,
): AcademySrsCheckpoint[] {
    const now = normalizedTimestamp(options.now, 'now');
    const kinds = new Set<AcademyStudyItemKind>(options.kinds ?? ['vocabulary', 'missed-answer']);
    const firstInterval = ACADEMY_SRS_INTERVAL_DAYS[0];

    return [...bundle.items]
        .filter(item => item.kind !== 'srs-checkpoint' && kinds.has(item.kind))
        .sort(compareStudyItems)
        .map(item => {
            const source = item.provenance[0];
            const lessonId = source?.lessonId || item.id;
            const taskId = source?.taskId || item.id;
            const dueOffset = item.kind === 'missed-answer' ? 0 : firstInterval * DAY_MS;
            const checkpoint: AcademySrsCheckpoint = {
                lessonId,
                taskId,
                dueAt: now + dueOffset,
                intervalDays: firstInterval,
                lapseCount: 0,
                lastAttemptAt: now,
                completedAt: null,
                context: { itemId: item.id, kind: item.kind },
                prompt: sideToInput(item.front),
                summary: sideToInput(item.back),
                tags: uniqueStrings([...item.tags, 'academy:seeded-checkpoint']),
            };
            return checkpoint;
        });
}

export interface AcademyReviewOutcome {
    /** Academy item id. If absent, resolved from `tags` then `sourceUrl`. */
    itemId?: string;
    tags?: readonly string[];
    sourceUrl?: string;
    correct: boolean;
    reviewedAt: number;
}

export interface AcademyReviewProjection {
    itemId: string;
    reviewedAt: number;
    intervalIndex: number;
    intervalDays: number;
    dueAt: number;
    lapseCount: number;
    /** Graduated: a correct review at the top of the ladder. Ready to mark known. */
    known: boolean;
}

export interface AcademyReviewPriorState {
    intervalIndex: number;
    lapseCount: number;
}

export interface AcademyReviewSyncResult {
    projections: readonly AcademyReviewProjection[];
    /** Item ids whose latest review graduated them — mark these known locally. */
    knownItemIds: readonly string[];
    /** Outcomes whose Academy item id could not be resolved. */
    unmatched: readonly AcademyReviewOutcome[];
}

/**
 * Fold Yomu SRS review outcomes back onto Academy items — the closing half of
 * the loop. Outcomes are grouped by item and replayed in time order; each item
 * advances up the interval ladder on a correct review and drops to the bottom
 * (with a lapse) on a wrong one. Pass `prior` to continue from a stored
 * schedule. Deterministic for any given input.
 */
export function applyYomuSrsReview(
    outcomes: readonly AcademyReviewOutcome[],
    options: {
        prior?: ReadonlyMap<string, AcademyReviewPriorState> | Readonly<Record<string, AcademyReviewPriorState>>;
    } = {},
): AcademyReviewSyncResult {
    const prior = toPriorMap(options.prior);
    const grouped = new Map<string, AcademyReviewOutcome[]>();
    const unmatched: AcademyReviewOutcome[] = [];

    for (const outcome of outcomes) {
        const itemId = resolveOutcomeItemId(outcome);
        if (!itemId || !isFiniteNumber(outcome.reviewedAt)) {
            unmatched.push(outcome);
            continue;
        }
        const bucket = grouped.get(itemId);
        if (bucket) bucket.push(outcome);
        else grouped.set(itemId, [outcome]);
    }

    const lastIndex = ACADEMY_SRS_INTERVAL_DAYS.length - 1;
    const projections: AcademyReviewProjection[] = [];
    for (const [itemId, itemOutcomes] of grouped) {
        const seed = prior.get(itemId);
        let intervalIndex = seed ? clampIndex(seed.intervalIndex, -1, lastIndex) : -1;
        let lapseCount = seed ? Math.max(0, Math.trunc(seed.lapseCount)) : 0;
        let lastCorrect = false;
        let reviewedAt = 0;

        for (const outcome of [...itemOutcomes].sort((left, right) => left.reviewedAt - right.reviewedAt)) {
            reviewedAt = Math.trunc(outcome.reviewedAt);
            lastCorrect = outcome.correct;
            if (outcome.correct) {
                intervalIndex = Math.min(intervalIndex + 1, lastIndex);
            } else {
                intervalIndex = 0;
                lapseCount += 1;
            }
        }

        const intervalDays = ACADEMY_SRS_INTERVAL_DAYS[Math.max(0, intervalIndex)];
        projections.push({
            itemId,
            reviewedAt,
            intervalIndex,
            intervalDays,
            dueAt: reviewedAt + intervalDays * DAY_MS,
            lapseCount,
            known: lastCorrect && intervalIndex >= lastIndex,
        });
    }

    projections.sort((left, right) => compareText(left.itemId, right.itemId));
    return {
        projections,
        knownItemIds: projections.filter(projection => projection.known).map(projection => projection.itemId),
        unmatched,
    };
}

function collectItemIds(input: AcademyStudyBundle | AcademyStudyBatchLinkInput): string[] {
    if (isBatchLinkInput(input)) return input.items.map(value => normalizeText(value)).filter(Boolean);
    return input.items.map(item => item.id);
}

function isBatchLinkInput(input: AcademyStudyBundle | AcademyStudyBatchLinkInput): input is AcademyStudyBatchLinkInput {
    const first = input.items[0];
    if (first !== undefined) return typeof first === 'string';
    return 'lessonId' in input || 'taskId' in input || 'routes' in input;
}

function firstLessonId(bundle: AcademyStudyBundle): string {
    for (const item of [...bundle.items].sort(compareStudyItems)) {
        const lessonId = normalizeText(item.provenance[0]?.lessonId ?? '');
        if (lessonId) return lessonId;
    }
    return '';
}

function sideToInput(side: AcademyStudyText): AcademyStudyTextInput {
    return side.translation ? { en: side.translation, ja: side.text } : { en: side.text };
}

function resolveOutcomeItemId(outcome: AcademyReviewOutcome): string | null {
    return normalizeText(outcome.itemId ?? '')
        || academyItemIdFromTags(outcome.tags)
        || academyItemIdFromUrl(outcome.sourceUrl)
        || null;
}

function toPriorMap(
    prior: ReadonlyMap<string, AcademyReviewPriorState> | Readonly<Record<string, AcademyReviewPriorState>> | undefined,
): Map<string, AcademyReviewPriorState> {
    const map = new Map<string, AcademyReviewPriorState>();
    if (!prior) return map;
    const entries = prior instanceof Map ? prior.entries() : Object.entries(prior);
    for (const [id, state] of entries) {
        const key = normalizeText(id);
        if (key && state) map.set(key, { intervalIndex: state.intervalIndex, lapseCount: state.lapseCount });
    }
    return map;
}

function clampIndex(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function toSearchParams(input: string | URLSearchParams): URLSearchParams {
    if (input instanceof URLSearchParams) return input;
    const value = String(input ?? '').trim();
    if (!value) return new URLSearchParams();
    const queryStart = value.indexOf('?');
    if (queryStart >= 0) {
        const afterQuery = value.slice(queryStart + 1);
        const hashStart = afterQuery.indexOf('#');
        return new URLSearchParams(hashStart >= 0 ? afterQuery.slice(0, hashStart) : afterQuery);
    }
    // No '?' — treat a bare `a=b&c=d` string as a query, but not a plain path.
    return value.includes('=') ? new URLSearchParams(value) : new URLSearchParams();
}
