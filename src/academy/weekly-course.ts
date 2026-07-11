/**
 * Read-only access to the generated weekly course corpus.
 *
 * The index is the course spine. Week JSON is an optional overlay: a planned
 * week remains visible when its file is absent or cannot be read.
 */

export const WEEK_INDEX_PATH = 'content/weeks/index.json';
export const WEEK_CONTENT_DIRECTORY = 'content/weeks/';

export type WeeklyCourseOrdering = 'class' | 'genki' | 'minna' | 'jlpt';

export interface WeeklyCourseFetchResponse {
    readonly ok?: boolean;
    readonly status?: number;
    json(): Promise<unknown>;
}

export type WeeklyCourseFetch = (path: string) => Promise<WeeklyCourseFetchResponse>;

export interface WeeklyCourseIndexEntry {
    readonly order: number;
    readonly id: string;
    readonly file: string | null;
    readonly weekKind: string;
    readonly title: { readonly en: string; readonly ja?: string };
    readonly academyYear: number;
    readonly termId: string;
    readonly termLabel: string;
    readonly courseYear: string | null;
    readonly weekNumberInTerm: number | null;
    readonly minnaChapters: readonly number[];
    readonly jlpt: string;
    readonly isCheckpoint: boolean;
    readonly prerequisiteWeekIds: readonly string[];
    readonly mapping: { readonly ucl: string; readonly minna: string | null };
}

export interface WeeklyCourseIndex {
    readonly schema: string;
    readonly orderings?: {
        readonly chronology?: readonly string[];
        readonly minna?: readonly string[];
    };
    readonly weeks: readonly WeeklyCourseIndexEntry[];
}

export interface WeeklyCourseWeek {
    readonly schema: string;
    readonly id: string;
    readonly order: number;
    readonly weekKind: string;
    readonly title: { readonly en: string; readonly ja?: string };
    readonly estimatedMinutes?: number;
    readonly identity: Readonly<Record<string, unknown>>;
    readonly sourceCoverage?: Readonly<Record<string, unknown>>;
    readonly mapping?: Readonly<Record<string, unknown>>;
    readonly provenance?: Readonly<Record<string, unknown>>;
    readonly explanation?: Readonly<Record<string, unknown>>;
    readonly components?: readonly Readonly<Record<string, unknown>>[];
    readonly [key: string]: unknown;
}

export type WeeklyCourseAvailability =
    | { readonly state: 'present'; readonly content: WeeklyCourseWeek }
    | { readonly state: 'missing'; readonly reason: 'not-planned' | 'not-authored' | 'unavailable' | 'invalid'; readonly detail?: string };

export interface WeeklyCourseRecord extends WeeklyCourseIndexEntry {
    readonly availability: WeeklyCourseAvailability;
}

export interface WeeklyCourseSearchResult {
    readonly week: WeeklyCourseRecord;
    readonly matchedFields: readonly WeeklyCourseSearchField[];
}

export type WeeklyCourseSearchField =
    | 'english'
    | 'japanese'
    | 'title'
    | 'grammar'
    | 'kanji'
    | 'source';

export interface WeeklyCourseRepository {
    readonly plannedWeeks: readonly WeeklyCourseRecord[];
    readonly presentWeeks: readonly WeeklyCourseRecord[];
    readonly missingWeeks: readonly WeeklyCourseRecord[];
    readonly warnings: readonly string[];
    getWeek(id: string): WeeklyCourseRecord | undefined;
    search(query: string): readonly WeeklyCourseSearchResult[];
    orderBy(ordering: WeeklyCourseOrdering): readonly WeeklyCourseRecord[];
}

export class WeeklyCourseDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WeeklyCourseDataError';
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isStringArray = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.every(isString);

const isNumberArray = (value: unknown): value is readonly number[] =>
    Array.isArray(value) && value.every(isNumber);

function validateIndex(value: unknown): WeeklyCourseIndex {
    if (!isRecord(value) || !isString(value.schema) || !Array.isArray(value.weeks)) {
        throw new WeeklyCourseDataError('Week index is malformed.');
    }

    const weeks: WeeklyCourseIndexEntry[] = [];
    for (const [position, candidate] of value.weeks.entries()) {
        if (!isRecord(candidate)
            || !isNumber(candidate.order)
            || !isString(candidate.id)
            || (candidate.file !== null && !isString(candidate.file))
            || !isString(candidate.weekKind)
            || !isRecord(candidate.title)
            || !isString(candidate.title.en)
            || (candidate.title.ja !== undefined && !isString(candidate.title.ja))
            || !isNumber(candidate.academyYear)
            || !isString(candidate.termId)
            || !isString(candidate.termLabel)
            || (candidate.courseYear !== null && !isString(candidate.courseYear))
            || (candidate.weekNumberInTerm !== null && !isNumber(candidate.weekNumberInTerm))
            || !isNumberArray(candidate.minnaChapters)
            || !isString(candidate.jlpt)
            || typeof candidate.isCheckpoint !== 'boolean'
            || !isStringArray(candidate.prerequisiteWeekIds)
            || !isRecord(candidate.mapping)
            || !isString(candidate.mapping.ucl)
            || (candidate.mapping.minna !== null && !isString(candidate.mapping.minna))) {
            throw new WeeklyCourseDataError(`Week index entry ${position} is malformed.`);
        }
        weeks.push(candidate as unknown as WeeklyCourseIndexEntry);
    }
    return { schema: value.schema, orderings: value.orderings as WeeklyCourseIndex['orderings'], weeks };
}

function validateWeek(value: unknown, planned: WeeklyCourseIndexEntry): WeeklyCourseWeek {
    if (!isRecord(value)
        || !isString(value.schema)
        || !isString(value.id)
        || value.id !== planned.id
        || !isNumber(value.order)
        || !isString(value.weekKind)
        || !isRecord(value.title)
        || !isString(value.title.en)
        || (value.title.ja !== undefined && !isString(value.title.ja))) {
        throw new WeeklyCourseDataError(`Week ${planned.id} is malformed.`);
    }
    return value as unknown as WeeklyCourseWeek;
}

function pathForWeek(file: string): string {
    return `${WEEK_CONTENT_DIRECTORY}${file}`;
}

function stringsAt(value: unknown, field: WeeklyCourseSearchField, output: Map<WeeklyCourseSearchField, string[]>): void {
    if (typeof value === 'string') {
        output.get(field)?.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) stringsAt(item, field, output);
        return;
    }
    if (!isRecord(value)) return;
    for (const [key, item] of Object.entries(value)) {
        const nextField: WeeklyCourseSearchField =
            /^ja$|japanese|reading/i.test(key) ? 'japanese'
                : /^en$|english/i.test(key) ? 'english'
                    : /character|kanji/i.test(key) || /kanji/i.test(String(item)) ? 'kanji'
                        : /grammar|pattern|explanation|meaning/i.test(key) ? 'grammar'
                    : /source|provenance|member|coverage|reference|role|mapping|ucl|minna|genki|jlpt/i.test(key) ? 'source'
                        : field;
        stringsAt(item, nextField, output);
    }
}

function searchableText(record: WeeklyCourseRecord): Map<WeeklyCourseSearchField, string[]> {
    const fields = new Map<WeeklyCourseSearchField, string[]>([
        ['english', []], ['japanese', []], ['title', []], ['grammar', []], ['kanji', []], ['source', []],
    ]);
    fields.get('english')?.push(record.title.en, record.termLabel, record.courseYear ?? '', record.jlpt);
    fields.get('japanese')?.push(record.title.ja ?? '');
    fields.get('title')?.push(record.title.en, record.title.ja ?? '', record.weekKind);
    fields.get('source')?.push(record.mapping.ucl, record.mapping.minna ?? '', ...record.minnaChapters.map(String));
    if (record.availability.state === 'present') stringsAt(record.availability.content, 'english', fields);
    return fields;
}

function normalise(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase();
}

function projectionRank(record: WeeklyCourseRecord, ordering: WeeklyCourseOrdering, indexOrder: ReadonlyMap<string, number>): readonly [number, string, number] {
    if (ordering === 'class' || ordering === 'minna') {
        const position = indexOrder.get(record.id);
        return [position === undefined ? 1 : 0, String(position ?? ''), record.order];
    }
    if (ordering === 'jlpt') return [0, record.jlpt, record.order];
    const value = record.availability.state === 'present' && isString(record.availability.content.mapping?.genki)
            ? record.availability.content.mapping.genki
            : null;
    return [value === null ? 1 : 0, value ?? '', record.order];
}

export async function loadWeeklyCourseRepository(fetcher: WeeklyCourseFetch): Promise<WeeklyCourseRepository> {
    let indexResponse: WeeklyCourseFetchResponse;
    try {
        indexResponse = await fetcher(WEEK_INDEX_PATH);
        if (indexResponse.ok === false) throw new Error(`HTTP ${indexResponse.status ?? 'error'}`);
        return await buildRepository(validateIndex(await indexResponse.json()), fetcher);
    } catch (error) {
        if (error instanceof WeeklyCourseDataError) throw error;
        throw new WeeklyCourseDataError(`Unable to load week index: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
}

async function buildRepository(index: WeeklyCourseIndex, fetcher: WeeklyCourseFetch): Promise<WeeklyCourseRepository> {
    const warnings: string[] = [];
    const plannedWeeks: WeeklyCourseRecord[] = [];
    for (const planned of [...index.weeks].sort((a, b) => a.order - b.order)) {
        if (!planned.file) {
            plannedWeeks.push({ ...planned, availability: { state: 'missing', reason: 'not-authored' } });
            continue;
        }
        try {
            const response = await fetcher(pathForWeek(planned.file));
            if (response.ok === false) throw new Error(`HTTP ${response.status ?? 'error'}`);
            const content = validateWeek(await response.json(), planned);
            plannedWeeks.push({ ...planned, availability: { state: 'present', content } });
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'unknown error';
            const reason = error instanceof WeeklyCourseDataError ? 'invalid' : 'unavailable';
            warnings.push(`${planned.id}: ${detail}`);
            plannedWeeks.push({ ...planned, availability: { state: 'missing', reason, detail } });
        }
    }

    const immutableWeeks = Object.freeze(plannedWeeks.slice());
    const presentWeeks = Object.freeze(immutableWeeks.filter((week) => week.availability.state === 'present'));
    const missingWeeks = Object.freeze(immutableWeeks.filter((week) => week.availability.state === 'missing'));
    const byId = new Map(immutableWeeks.map((week) => [week.id, week]));
    const classOrder = new Map((index.orderings?.chronology ?? immutableWeeks.map((week) => week.id)).map((id, position) => [id, position]));
    const minnaOrder = new Map((index.orderings?.minna ?? []).map((id, position) => [id, position]));
    return {
        plannedWeeks: immutableWeeks,
        presentWeeks,
        missingWeeks,
        warnings: Object.freeze(warnings),
        getWeek: (id) => byId.get(id),
        search: (query) => {
            const needle = normalise(query.trim());
            if (!needle) return [];
            return Object.freeze(immutableWeeks.flatMap((week) => {
                const matchedFields = [...searchableText(week).entries()]
                    .filter(([, values]) => values.some((value) => normalise(value).includes(needle)))
                    .map(([field]) => field);
                return matchedFields.length ? [{ week, matchedFields: Object.freeze(matchedFields) }] : [];
            }));
        },
        orderBy: (ordering) => Object.freeze([...immutableWeeks].sort((a, b) => {
            const indexOrder = ordering === 'minna' ? minnaOrder : classOrder;
            const left = projectionRank(a, ordering, indexOrder);
            const right = projectionRank(b, ordering, indexOrder);
            return left[0] - right[0] || left[1].localeCompare(right[1], undefined, { numeric: true }) || left[2] - right[2];
        })),
    };
}

export const createWeeklyCourseRepository = loadWeeklyCourseRepository;
