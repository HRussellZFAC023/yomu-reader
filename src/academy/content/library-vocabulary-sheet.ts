import { createLessonOneSourceVocabularyActivities } from './lesson-one-greeting-worksheet';
import { createLessonTwoSourceVocabularyActivities } from './lesson-two-profile-board';
import { createLessonThreeSourceVocabularyActivities } from './lesson-three-profile-questions';
import { createLessonFourSourceVocabularyActivities } from './lesson-four-object-distance';
import { createLessonFiveSourceVocabularyActivities } from './lesson-five-possession-phrases';
import { createLessonSixSourceVocabularyActivities } from './lesson-six-place-and-owner';
import { loadAuthoredWeekPackage } from './lesson-content-registry';
import { exactLibraryVocabularyDefinition } from './lesson-27-31-library-vocabulary';
import { earlyLibraryVocabularyStudyDefinition } from './lesson-8-10-library-vocabulary';
import type { ReviewSeed } from '../domain/activity-runtime';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';

const BUNDLED_SOURCE_SHEETS: Readonly<Record<string, () => readonly SourceVocabularySheetModel[]>> = {
    'l1-l01': createLessonOneSourceVocabularyActivities,
    'l1-l02': createLessonTwoSourceVocabularyActivities,
    'l1-l03': createLessonThreeSourceVocabularyActivities,
    'l1-l04': createLessonFourSourceVocabularyActivities,
    'l1-l05': createLessonFiveSourceVocabularyActivities,
    'l1-l06': createLessonSixSourceVocabularyActivities,
};

export interface LibraryVocabularySheetItem {
    readonly id: string;
    readonly expression: string;
    readonly studyExpression: string;
    readonly reading: string;
    readonly meaning: string;
    /** Dictionary-facing definition, kept distinct from a literal source meaning cell. */
    readonly studyMeaning?: string;
    readonly studyStatus?: 'canonical' | 'quarantined-source-ambiguity' | 'quarantined-source-gap';
    readonly sourcePronunciation: string | null;
    readonly sourceMeaning: string | null;
    readonly fieldProvenance: {
        readonly words: string;
        readonly reading: string;
        readonly meaning: string;
    };
    readonly source: {
        readonly id: string;
        readonly title: string;
        readonly page: number;
        readonly row: number;
    };
    /** Stable identity shared with the source-row activity and local SRS. */
    readonly reviewSeed: Pick<ReviewSeed, 'id' | 'conceptId' | 'sourceQuestionId'>;
}

export interface LibraryVocabularySheet {
    readonly id: string;
    readonly lessonId: string;
    readonly title: string;
    readonly sourceId: string;
    readonly sourceStatus: 'exact-source' | 'not-provided';
    readonly items: readonly LibraryVocabularySheetItem[];
}

export interface LibraryStudyVocabulary {
    readonly id: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meaning: string;
    readonly source: string;
    readonly audioAvailable: true;
}

/** Source cells remain distinct from Yomu's reading/meaning support. */
export function createLibraryVocabularySheet(
    activities: readonly SourceVocabularySheetModel[] = createLessonOneSourceVocabularyActivities(),
): LibraryVocabularySheet {
    const first = activities[0];
    if (!first) throw new TypeError('The Library vocabulary sheet cannot be empty.');
    let previousPage = 0;
    let previousRow = 0;
    for (const activity of activities) {
        if (activity.provenance.packageId !== first.provenance.packageId
            || activity.provenance.componentId !== first.provenance.componentId
            || activity.provenance.sourceId !== first.provenance.sourceId
            || activity.provenance.sourceTitle !== first.provenance.sourceTitle) {
            throw new TypeError('The Library vocabulary rows must come from one source sheet.');
        }
        const { page, row } = activity.provenance.locus;
        if (page < previousPage || (page === previousPage && row <= previousRow)) {
            throw new TypeError('The Library vocabulary rows must remain in exact source order.');
        }
        previousPage = page;
        previousRow = row;
    }

    return Object.freeze({
        id: `${first.provenance.packageId}:${first.provenance.componentId}`,
        lessonId: first.provenance.packageId,
        title: first.provenance.sourceTitle,
        sourceId: first.provenance.sourceId,
        sourceStatus: 'exact-source' as const,
        items: Object.freeze(activities.map(activity => Object.freeze({
            id: activity.id,
            expression: activity.payload.exact.words,
            studyExpression: activity.payload.support.words,
            reading: activity.payload.support.reading,
            meaning: activity.payload.exact.meaning ?? activity.payload.support.meaning,
            studyMeaning: activity.payload.support.meaning,
            studyStatus: 'canonical' as const,
            sourcePronunciation: activity.payload.exact.pronunciation,
            sourceMeaning: activity.payload.exact.meaning,
            fieldProvenance: Object.freeze({ ...activity.payload.fieldProvenance }),
            source: Object.freeze({
                id: activity.sourceQuestionId,
                title: activity.provenance.sourceTitle,
                page: activity.provenance.locus.page,
                row: activity.provenance.locus.row,
            }),
            reviewSeed: Object.freeze(sourceVocabularyReviewSeed(activity)),
        }))),
    });
}

/**
 * Loads only the selected lesson shard. Early playable lessons use their
 * already-audited factories; later lessons are projected from the same exact
 * source-row schema without pulling the rest of the curriculum into Library.
 */
export async function loadLibraryVocabularySheet(
    lessonId: string,
    fetcher: typeof fetch = fetch,
): Promise<LibraryVocabularySheet> {
    const packageId = authoredPackageId(lessonId);
    const bundled = BUNDLED_SOURCE_SHEETS[packageId];
    if (bundled) return createLibraryVocabularySheet(bundled());

    const { value } = await loadAuthoredWeekPackage(packageId, fetcher);
    return createLibraryVocabularySheetFromPackage(value, packageId);
}

export function createLibraryVocabularySheetFromPackage(input: unknown, packageId: string): LibraryVocabularySheet {
    const root = record(input, `${packageId} package`);
    if (root.id !== packageId) throw new TypeError(`Library package ${packageId} resolved to another lesson.`);
    const exactDefinition = exactLibraryVocabularyDefinition(packageId, input);
    if (exactDefinition) return createLibraryVocabularySheetFromDefinition(exactDefinition);
    const earlyStudyDefinition = earlyLibraryVocabularyStudyDefinition(packageId, input);
    const components = array(root.components, `${packageId} components`)
        .map((value, index) => record(value, `${packageId} component ${index}`));
    const vocabulary = components
        .filter(component => component.type === 'vocabulary');
    if (!earlyStudyDefinition && vocabulary.length === 0) return emptySheet(packageId);
    const sourceVocabulary = earlyStudyDefinition
        ? components.filter(component => component.type === earlyStudyDefinition.componentType
            && sourceIdForComponent(component) === earlyStudyDefinition.sourceId)
        : vocabulary.filter(isExactSourceVocabularyComponent);
    if (sourceVocabulary.length === 0) return emptySheet(packageId, vocabulary[0]);
    if (sourceVocabulary.length !== 1) {
        throw new TypeError(`${packageId} must have exactly one exact-source Library vocabulary component.`);
    }
    const component = sourceVocabulary[0]!;
    const rows = array(component.items, `${packageId} vocabulary rows`);
    if (!rows.length) return emptySheet(packageId, component);

    const provenance = record(component.provenance, `${packageId} vocabulary provenance`);
    const sourceId = text(provenance.sourceId, `${packageId} sourceId`);
    const title = text(provenance.title, `${packageId} source title`);
    const payloadSha256 = digest(provenance.payloadSha256, `${packageId} source digest`);
    const componentId = optionalText(component.id) ?? `source-vocabulary:${payloadSha256}`;
    let previousPage = 0;
    let previousRow = 0;
    const seenIds = new Set<string>();
    const items = rows.map((candidate, index): LibraryVocabularySheetItem => {
        const row = record(candidate, `${packageId} vocabulary row ${index + 1}`);
        const source = record(row.source, `${packageId} vocabulary row ${index + 1} source`);
        const id = text(source.itemId, `${packageId} vocabulary row ${index + 1} itemId`);
        if (seenIds.has(id)) throw new TypeError(`Duplicate Library vocabulary source row ${id}.`);
        seenIds.add(id);
        if (digest(source.payloadSha256, `${id} digest`) !== payloadSha256
            || text(source.title, `${id} title`) !== title
            || source.answerVisibility !== 'after-attempt') {
            throw new TypeError(`Library vocabulary source identity changed for ${id}.`);
        }
        const locus = record(source.locus, `${id} locus`);
        const page = positiveInteger(locus.page, `${id} page`);
        const sourceRow = positiveInteger(locus.row, `${id} row`);
        if (page < previousPage || (page === previousPage && sourceRow <= previousRow)) {
            throw new TypeError(`${packageId} Library vocabulary rows are not in exact source order.`);
        }
        previousPage = page;
        previousRow = sourceRow;
        const exact = record(source.exact, `${id} exact fields`);
        const fieldProvenance = record(source.fieldProvenance, `${id} field provenance`);
        const studySupport = earlyStudyDefinition?.rows[index];
        const studyExpression = studySupport?.expression
            ?? optionalText(source.normalizedStudySurface)
            ?? text(row.ja, `${id} Yomu expression`);
        const reading = studySupport?.reading ?? text(row.reading, `${id} Yomu reading`);
        const supportMeaning = studySupport?.meaning ?? text(row.en, `${id} Yomu meaning`);
        const sourceMeaning = nullableText(exact.meaning, `${id} source meaning`);
        return Object.freeze({
            id: `authored:${packageId}/library:${id}`,
            expression: text(exact.words, `${id} source words`),
            studyExpression,
            reading,
            meaning: sourceMeaning ?? supportMeaning,
            studyMeaning: supportMeaning,
            studyStatus: studySupport?.studyStatus ?? 'canonical',
            sourcePronunciation: nullableText(exact.pronunciation, `${id} source pronunciation`),
            sourceMeaning,
            fieldProvenance: Object.freeze({
                words: text(fieldProvenance.words, `${id} words provenance`),
                reading: text(fieldProvenance.reading, `${id} reading provenance`),
                meaning: text(fieldProvenance.meaning, `${id} meaning provenance`),
            }),
            source: Object.freeze({ id, title, page, row: sourceRow }),
            reviewSeed: Object.freeze({
                id: `review:${packageId}:${componentId}:p${page}:r${sourceRow}`,
                conceptId: `concept:${packageId}:source-vocabulary:${componentId}:p${page}:r${sourceRow}`,
                sourceQuestionId: id,
            }),
        });
    });
    return Object.freeze({
        id: `${packageId}:${payloadSha256}`,
        lessonId: packageId,
        title,
        sourceId,
        sourceStatus: 'exact-source' as const,
        items: Object.freeze(items),
    });
}

function sourceIdForComponent(component: Readonly<Record<string, unknown>>): string | undefined {
    const provenance = component.provenance && typeof component.provenance === 'object' && !Array.isArray(component.provenance)
        ? component.provenance as Readonly<Record<string, unknown>>
        : undefined;
    return optionalText(provenance?.sourceId);
}

function isExactSourceVocabularyComponent(component: Readonly<Record<string, unknown>>): boolean {
    const provenance = component.provenance && typeof component.provenance === 'object' && !Array.isArray(component.provenance)
        ? component.provenance as Readonly<Record<string, unknown>>
        : undefined;
    return Boolean(
        optionalText(provenance?.sourceId)
        && optionalText(provenance?.title)
        && /^[a-f0-9]{64}$/u.test(optionalText(provenance?.payloadSha256) ?? ''),
    );
}

export function libraryStudyVocabulary(sheet: LibraryVocabularySheet): readonly LibraryStudyVocabulary[] {
    return Object.freeze(sheet.items
        .filter(isLibraryStudyEligible)
        .map(item => Object.freeze({
            id: item.id,
            expression: item.studyExpression,
            ...(item.reading !== item.studyExpression ? { reading: item.reading } : {}),
            meaning: item.studyMeaning ?? item.meaning,
            source: item.source.id,
            audioAvailable: true as const,
        })));
}

/**
 * Seeds are projected from preserved rows, not learner answers. Their ids match
 * the source-vocabulary activity plugin so entering the lesson later is idempotent.
 */
export function libraryVocabularyReviewSeeds(sheet: LibraryVocabularySheet): readonly ReviewSeed[] {
    if (sheet.sourceStatus !== 'exact-source') return Object.freeze([]);
    return Object.freeze(sheet.items
        .filter(isLibraryStudyEligible)
        .map(item => Object.freeze({
            id: item.reviewSeed.id,
            conceptId: item.reviewSeed.conceptId,
            reason: 'new-learning' as const,
            sourceQuestionId: item.reviewSeed.sourceQuestionId,
            content: Object.freeze({
                expression: item.studyExpression,
                ...(item.reading !== item.studyExpression ? { reading: item.reading } : {}),
                meanings: Object.freeze([item.studyMeaning ?? item.meaning]),
            }),
        })));
}

function isLibraryStudyEligible(item: LibraryVocabularySheetItem): boolean {
    return item.studyStatus !== 'quarantined-source-ambiguity'
        && item.studyStatus !== 'quarantined-source-gap';
}

function createLibraryVocabularySheetFromDefinition(
    definition: import('./lesson-27-31-library-vocabulary').ExactLibraryVocabularyDefinition,
): LibraryVocabularySheet {
    const sourceId = `moodle-vocabulary:${definition.moduleId}:${definition.payloadSha256}`;
    const componentId = `source-vocabulary:${definition.payloadSha256}`;
    return Object.freeze({
        id: `${definition.packageId}:${definition.payloadSha256}`,
        lessonId: definition.packageId,
        title: definition.title,
        sourceId,
        sourceStatus: 'exact-source' as const,
        items: Object.freeze(definition.rows.map(row => {
            const sourceQuestionId = `${sourceId}:p${row.page}:row-${row.row}`;
            const studyMeaning = definition.requireSourceMeaning && row.sourceMeaning
                ? row.sourceMeaning
                : row.studyMeaning;
            return Object.freeze({
                id: `authored:${definition.packageId}/library:${sourceQuestionId}`,
                expression: row.exactWords,
                studyExpression: row.studyExpression,
                reading: row.reading,
                meaning: row.sourceMeaning ?? row.studyMeaning,
                studyMeaning,
                studyStatus: row.studyStatus,
                sourcePronunciation: null,
                sourceMeaning: row.sourceMeaning,
                fieldProvenance: Object.freeze({
                    words: 'source-provided',
                    reading: 'yomu-support',
                    meaning: row.sourceMeaning ? 'source-provided' : 'yomu-support',
                }),
                source: Object.freeze({
                    id: sourceQuestionId,
                    title: definition.title,
                    page: row.page,
                    row: row.row,
                }),
                reviewSeed: Object.freeze({
                    id: `review:${definition.packageId}:${componentId}:p${row.page}:r${row.row}`,
                    conceptId: `concept:${definition.packageId}:source-vocabulary:${componentId}:p${row.page}:r${row.row}`,
                    sourceQuestionId,
                }),
            });
        })),
    });
}

function sourceVocabularyReviewSeed(activity: SourceVocabularySheetModel): Pick<ReviewSeed, 'id' | 'conceptId' | 'sourceQuestionId'> {
    return {
        id: `review:${activity.provenance.packageId}:${activity.provenance.componentId}:p${activity.provenance.locus.page}:r${activity.provenance.locus.row}`,
        conceptId: activity.conceptIds[0]!,
        sourceQuestionId: activity.sourceQuestionId,
    };
}

function emptySheet(packageId: string, component?: Readonly<Record<string, unknown>>): LibraryVocabularySheet {
    const localizedTitle = component?.title && typeof component.title === 'object' && !Array.isArray(component.title)
        ? component.title as Readonly<Record<string, unknown>>
        : undefined;
    const title = optionalText(localizedTitle?.en) ?? optionalText(localizedTitle?.ja) ?? `${packageId} vocabulary`;
    return Object.freeze({
        id: `${packageId}:no-exact-source-vocabulary`,
        lessonId: packageId,
        title,
        sourceId: `academy:${packageId}:no-exact-source-vocabulary`,
        sourceStatus: 'not-provided' as const,
        items: Object.freeze([]),
    });
}

function authoredPackageId(lessonId: string): string {
    const packageId = lessonId.startsWith('authored-week:') ? lessonId.slice('authored-week:'.length) : lessonId;
    if (!packageId.trim()) throw new TypeError('Library lesson id must be nonempty.');
    return packageId;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function optionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function nullableText(value: unknown, label: string): string | null {
    return value === null ? null : text(value, label);
}

function positiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer.`);
    }
    return value;
}

function digest(value: unknown, label: string): string {
    const result = text(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${label} must be a SHA-256 digest.`);
    return result;
}
