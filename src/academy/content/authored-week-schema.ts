export interface AuthoredLocalizedText {
    readonly en: string;
    readonly ja: string;
}

export interface AuthoredChoiceOption {
    readonly id: string;
    readonly label: AuthoredLocalizedText;
    readonly correct: boolean;
}

/**
 * Package phases retain the pedagogical classification supplied by curriculum
 * authoring. They are intentionally broader than the runtime audit taxonomy.
 */
export type AuthoredExercisePhase =
    | 'context'
    | 'instruction'
    | 'guided-practice'
    | 'constrained-practice'
    | 'assessed-production'
    | 'supported-production'
    | 'transfer'
    | 'prestudy';

export interface AuthoredChoiceExercise {
    readonly id: string;
    readonly kind: 'choice';
    readonly prompt: AuthoredLocalizedText;
    readonly explanation: string;
    readonly reviewTag?: string;
    readonly phase?: AuthoredExercisePhase;
    readonly autoGraded: true;
    readonly options: readonly AuthoredChoiceOption[];
}

export interface AuthoredExactExercise {
    readonly id: string;
    readonly kind: 'exact';
    readonly prompt: AuthoredLocalizedText;
    readonly explanation: string;
    readonly reviewTag?: string;
    readonly phase?: AuthoredExercisePhase;
    readonly autoGraded: true;
    readonly answer: {
        readonly primary: string;
        readonly alternatives: readonly string[];
    };
}

export interface AuthoredAudio {
    readonly assetId: string;
    readonly locator: string;
    readonly durationSeconds: number;
    readonly script: string;
}

export interface AuthoredSourceVocabularyItem {
    readonly ja: string;
    readonly reading: string;
    readonly en: string;
    readonly source: {
        readonly itemId: string;
        readonly payloadSha256: string;
        readonly title: string;
        readonly locus: { readonly page: number; readonly row: number };
        readonly exact: {
            readonly words: string;
            readonly pronunciation: string | null;
            readonly meaning: string | null;
        };
        readonly fieldProvenance: {
            readonly words: string;
            readonly reading: string;
            readonly meaning: string;
        };
        readonly answerVisibility: 'after-attempt';
    };
}

export interface AuthoredSourceVocabularySheet {
    readonly componentId: string;
    readonly title: AuthoredLocalizedText;
    readonly sourceInstructions: AuthoredLocalizedText;
    readonly provenance: {
        readonly sourceId: string;
        readonly payloadSha256: string;
        readonly title: string;
    };
    readonly items: readonly AuthoredSourceVocabularyItem[];
}

export interface AuthoredComponent {
    readonly type: string;
    readonly order: number;
    readonly exercises?: readonly unknown[];
    readonly audio?: AuthoredAudio;
    readonly sourceVocabularySheet?: AuthoredSourceVocabularySheet;
    readonly teachingSupport: import('../domain/activity-runtime').ActivityTeachingSupport;
}

export interface AuthoredWeekPackage {
    readonly schema: 'yomu-academy.week.v1';
    readonly id: string;
    readonly identity: Readonly<Record<string, unknown>>;
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly components: readonly AuthoredComponent[];
}

export function parseAuthoredWeekPackage(value: unknown): AuthoredWeekPackage {
    const root = record(value, 'package');
    if (root.schema !== 'yomu-academy.week.v1') fail('package.schema', 'must be yomu-academy.week.v1');
    const id = text(root.id, 'package.id');
    const sourceItemIds = new Set<string>();
    const components = array(root.components, 'package.components').map((candidate, index) => {
        const component = record(candidate, `package.components[${index}]`);
        const path = `package.components[${index}]`;
        const exercises = component.exercises === undefined
            ? undefined
            : array(component.exercises, `${path}.exercises`);
        return {
            type: text(component.type, `${path}.type`),
            order: finiteNumber(component.order, `${path}.order`),
            teachingSupport: parseTeachingSupport(component, path),
            ...(exercises ? { exercises } : {}),
            ...(component.audio === undefined ? {} : { audio: parseAudio(component.audio, `${path}.audio`) }),
            ...(component.type === 'source-vocabulary-reference'
                ? { sourceVocabularySheet: parseSourceVocabularySheet(component, path, sourceItemIds) }
                : {}),
        };
    });
    return {
        schema: 'yomu-academy.week.v1',
        id,
        identity: record(root.identity, 'package.identity'),
        provenance: record(root.provenance, 'package.provenance'),
        components,
    };
}

function parseTeachingSupport(
    component: Readonly<Record<string, unknown>>,
    path: string,
): import('../domain/activity-runtime').ActivityTeachingSupport {
    const title = isLocalized(component.title)
        ? localized(component.title, `${path}.title`)
        : { ja: 'この問題の前に', en: 'Before this question' };
    const reading = optionalRecord(component.reading);
    const passage = optionalRecord(component.passage);
    const lineSource = reading ?? passage;
    const lines = lineSource && Array.isArray(lineSource.lines)
        ? lineSource.lines.flatMap(candidate => {
            const line = optionalRecord(candidate);
            if (!line || typeof line.ja !== 'string' || !line.ja.trim()) return [];
            return [{
                japanese: line.ja.trim(),
                ...(typeof line.reading === 'string' && line.reading.trim() ? { reading: line.reading.trim() } : {}),
                ...(typeof line.en === 'string' && line.en.trim() ? { translation: line.en.trim() } : {}),
            }];
        })
        : [];
    if (lines.length) return { kind: 'example', title, entries: lines };

    const instruction = optionalRecord(component.instruction);
    const instructionExamples = [
        instruction?.workedExample,
        ...textArray(component.workedExamples),
        ...textArray(component.sourceWorkedExamplesExact),
        ...pointExamples(component.points),
        typeof component.passage === 'string' ? component.passage : undefined,
    ].flatMap(value => typeof value === 'string' && value.trim()
        ? [{ japanese: value.trim() }]
        : []);
    if (instructionExamples.length) return { kind: 'pattern', title, entries: instructionExamples };

    const practiceFor = Array.isArray(component.practiceFor)
        ? component.practiceFor.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [];
    if (practiceFor.length) {
        return {
            kind: 'pattern',
            title,
            entries: practiceFor.map(japanese => ({ japanese })),
        };
    }

    const items = component.type === 'source-vocabulary-reference' || !Array.isArray(component.items)
        ? []
        : component.items.flatMap(candidate => {
            const item = optionalRecord(candidate);
            if (!item) return [];
            const example = optionalRecord(item.exampleWord);
            const source = example ?? item;
            if (typeof source.ja !== 'string' || !source.ja.trim()) return [];
            return [{
                japanese: source.ja.trim(),
                ...(typeof source.reading === 'string' && source.reading.trim() ? { reading: source.reading.trim() } : {}),
                ...(typeof source.en === 'string' && source.en.trim() ? { translation: source.en.trim() } : {}),
            }];
        });
    if (items.length) return { kind: 'vocabulary', title, entries: items };

    return { kind: 'context', title, entries: [{ japanese: title.ja, translation: title.en }] };
}

function textArray(value: unknown): readonly string[] {
    return Array.isArray(value)
        ? value.filter((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()))
        : [];
}

function pointExamples(value: unknown): readonly string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(candidate => {
        const point = optionalRecord(candidate);
        if (!point || !Array.isArray(point.examples)) return [];
        return point.examples.flatMap(exampleValue => {
            const example = optionalRecord(exampleValue);
            return example && typeof example.ja === 'string' && example.ja.trim() ? [example.ja.trim()] : [];
        });
    });
}

function optionalRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Readonly<Record<string, unknown>>
        : undefined;
}

function parseSourceVocabularySheet(
    component: Readonly<Record<string, unknown>>,
    path: string,
    sourceItemIds: Set<string>,
): AuthoredSourceVocabularySheet {
    const provenance = record(component.provenance, `${path}.provenance`);
    const payloadSha256 = sha256(provenance.payloadSha256, `${path}.provenance.payloadSha256`);
    const sourceTitle = text(provenance.title, `${path}.provenance.title`);
    let previousPage = 0;
    let previousRow = 0;
    const items = array(component.items, `${path}.items`).map((candidate, index) => {
        const itemPath = `${path}.items[${index}]`;
        const item = record(candidate, itemPath);
        const source = record(item.source, `${itemPath}.source`);
        const itemId = text(source.itemId, `${itemPath}.source.itemId`);
        if (sourceItemIds.has(itemId)) fail(`${itemPath}.source.itemId`, 'must be unique in the package');
        sourceItemIds.add(itemId);
        if (sha256(source.payloadSha256, `${itemPath}.source.payloadSha256`) !== payloadSha256) {
            fail(`${itemPath}.source.payloadSha256`, 'must match the component payload SHA-256');
        }
        if (text(source.title, `${itemPath}.source.title`) !== sourceTitle) {
            fail(`${itemPath}.source.title`, 'must match the component source title');
        }
        const locus = record(source.locus, `${itemPath}.source.locus`);
        const page = positiveInteger(locus.page, `${itemPath}.source.locus.page`);
        const row = positiveInteger(locus.row, `${itemPath}.source.locus.row`);
        if (page < previousPage || (page === previousPage && row <= previousRow)) {
            fail(`${itemPath}.source.locus`, 'must follow the exact increasing source page and row order');
        }
        previousPage = page;
        previousRow = row;
        const exact = record(source.exact, `${itemPath}.source.exact`);
        const fieldProvenance = record(source.fieldProvenance, `${itemPath}.source.fieldProvenance`);
        if (source.answerVisibility !== 'after-attempt') {
            fail(`${itemPath}.source.answerVisibility`, 'must be after-attempt');
        }
        return {
            ja: text(item.ja, `${itemPath}.ja`),
            reading: text(item.reading, `${itemPath}.reading`),
            en: text(item.en, `${itemPath}.en`),
            source: {
                itemId,
                payloadSha256,
                title: sourceTitle,
                locus: { page, row },
                exact: {
                    words: text(exact.words, `${itemPath}.source.exact.words`),
                    pronunciation: nullableText(exact.pronunciation, `${itemPath}.source.exact.pronunciation`),
                    meaning: nullableText(exact.meaning, `${itemPath}.source.exact.meaning`),
                },
                fieldProvenance: {
                    words: text(fieldProvenance.words, `${itemPath}.source.fieldProvenance.words`),
                    reading: text(fieldProvenance.reading, `${itemPath}.source.fieldProvenance.reading`),
                    meaning: text(fieldProvenance.meaning, `${itemPath}.source.fieldProvenance.meaning`),
                },
                answerVisibility: 'after-attempt' as const,
            },
        };
    });
    if (!items.length) fail(`${path}.items`, 'must contain at least one source row');
    return {
        componentId: text(component.id, `${path}.id`),
        title: localized(component.title, `${path}.title`),
        sourceInstructions: localized(component.sourceInstructions ?? component.title, `${path}.sourceInstructions`),
        provenance: {
            sourceId: text(provenance.sourceId, `${path}.provenance.sourceId`),
            payloadSha256,
            title: sourceTitle,
        },
        items,
    };
}

export function parseChoiceExercise(value: unknown, path: string): AuthoredChoiceExercise | undefined {
    const exercise = record(value, path);
    if (exercise.kind !== 'choice') return undefined;
    if (!isLocalized(exercise.prompt)) return undefined;
    const rawOptions = array(exercise.options, `${path}.options`);
    if (!rawOptions.every(candidate => isChoiceLabel(record(candidate, `${path}.options[]`).label))) return undefined;
    if (exercise.autoGraded !== true) fail(`${path}.autoGraded`, 'must be true');
    const options = rawOptions.map((candidate, index) => {
        const option = record(candidate, `${path}.options[${index}]`);
        if (typeof option.correct !== 'boolean') fail(`${path}.options[${index}].correct`, 'must be boolean');
        return {
            id: text(option.id, `${path}.options[${index}].id`),
            label: localized(option.label, `${path}.options[${index}].label`),
            correct: option.correct,
        };
    });
    return {
        id: text(exercise.id, `${path}.id`),
        kind: 'choice',
        prompt: localized(exercise.prompt, `${path}.prompt`),
        explanation: text(exercise.explanation, `${path}.explanation`),
        ...(exercise.reviewTag === undefined ? {} : { reviewTag: text(exercise.reviewTag, `${path}.reviewTag`) }),
        ...(exercise.phase === undefined ? {} : { phase: exercisePhase(exercise.phase, `${path}.phase`) }),
        autoGraded: true,
        options,
    };
}

export function parseExactExercise(value: unknown, path: string): AuthoredExactExercise | undefined {
    const exercise = record(value, path);
    if (exercise.kind !== 'exact') return undefined;
    if (!isLocalized(exercise.prompt)) return undefined;
    if (exercise.autoGraded !== true) fail(`${path}.autoGraded`, 'must be true');
    const answer = record(exercise.answer, `${path}.answer`);
    const alternatives = answer.alternatives === undefined
        ? []
        : array(answer.alternatives, `${path}.answer.alternatives`).map((candidate, index) =>
            text(candidate, `${path}.answer.alternatives[${index}]`));
    return {
        id: text(exercise.id, `${path}.id`),
        kind: 'exact',
        prompt: localized(exercise.prompt, `${path}.prompt`),
        explanation: text(exercise.explanation, `${path}.explanation`),
        ...(exercise.reviewTag === undefined ? {} : { reviewTag: text(exercise.reviewTag, `${path}.reviewTag`) }),
        ...(exercise.phase === undefined ? {} : { phase: exercisePhase(exercise.phase, `${path}.phase`) }),
        autoGraded: true,
        answer: {
            primary: text(answer.primary, `${path}.answer.primary`),
            alternatives,
        },
    };
}

function isLocalized(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Readonly<Record<string, unknown>>;
    return typeof item.en === 'string' && item.en.trim().length > 0
        && typeof item.ja === 'string' && item.ja.trim().length > 0;
}

function isChoiceLabel(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Readonly<Record<string, unknown>>;
    if (item.en === null || item.ja === null) return false;
    return (typeof item.en === 'string' && item.en.trim().length > 0)
        || (typeof item.ja === 'string' && item.ja.trim().length > 0);
}

function parseAudio(value: unknown, path: string): AuthoredAudio {
    const audio = record(value, path);
    return {
        assetId: text(audio.assetId, `${path}.assetId`),
        locator: text(audio.locator, `${path}.locator`),
        durationSeconds: finiteNumber(audio.durationSeconds, `${path}.durationSeconds`),
        script: text(audio.script, `${path}.script`),
    };
}

function localized(value: unknown, path: string): AuthoredLocalizedText {
    const item = record(value, path);
    const en = nonEmptyText(item.en) ?? text(item.ja, `${path}.ja`);
    const ja = nonEmptyText(item.ja) ?? text(item.en, `${path}.en`);
    return { en, ja };
}

function nonEmptyText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function record(value: unknown, path: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) fail(path, 'must be an array');
    return value;
}

function text(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'must be non-empty text');
    return value;
}

function finiteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
    return value;
}

function exercisePhase(value: unknown, path: string): AuthoredExercisePhase {
    const phase = text(value, path);
    if ([
        'context', 'instruction', 'guided-practice', 'constrained-practice',
        'assessed-production', 'supported-production', 'transfer', 'prestudy',
    ].includes(phase)) return phase as AuthoredExercisePhase;
    fail(path, 'must be a supported curriculum phase');
}

function positiveInteger(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) fail(path, 'must be a positive integer');
    return value;
}

function nullableText(value: unknown, path: string): string | null {
    if (value === null) return null;
    return text(value, path);
}

function sha256(value: unknown, path: string): string {
    const digest = text(value, path);
    if (!/^[a-f0-9]{64}$/u.test(digest)) fail(path, 'must be a SHA-256 digest');
    return digest;
}

function fail(path: string, message: string): never {
    throw new TypeError(`${path} ${message}.`);
}
