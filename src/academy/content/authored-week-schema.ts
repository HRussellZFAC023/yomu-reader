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

export interface AuthoredMultiChoiceExercise {
    readonly id: string;
    readonly kind: 'multi-choice';
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

export interface AuthoredClozeBlank {
    readonly id: string;
    readonly answer: {
        readonly primary: string;
        readonly alternatives: readonly string[];
    };
}

export interface AuthoredClozeExercise {
    readonly id: string;
    readonly kind: 'cloze';
    readonly prompt: AuthoredLocalizedText;
    readonly japanese: string;
    readonly explanation: string;
    readonly reviewTag?: string;
    readonly phase?: AuthoredExercisePhase;
    readonly autoGraded: true;
    readonly blanks: readonly AuthoredClozeBlank[];
}

export interface AuthoredMatchingExercise {
    readonly id: string;
    readonly kind: 'matching';
    readonly prompt: AuthoredLocalizedText;
    readonly explanation: string;
    readonly reviewTag?: string;
    readonly phase?: AuthoredExercisePhase;
    readonly autoGraded: true;
    readonly pluginTarget: 'academy-drag-sort';
    readonly sourceItemsExact: readonly string[];
    readonly values: readonly string[];
}

export interface AuthoredTileOrderingExercise {
    readonly id: string;
    readonly kind: 'ordering';
    readonly mode: 'tiles';
    readonly prompt: AuthoredLocalizedText;
    readonly explanation: string;
    readonly reviewTag?: string;
    readonly phase?: AuthoredExercisePhase;
    readonly autoGraded: true;
    readonly pluginTarget: 'academy-sequence';
    readonly tiles: readonly string[];
    readonly answer: {
        readonly primary: string;
        readonly alternatives: readonly string[];
    };
}

export interface AuthoredCueOrderingExercise {
    readonly id: string;
    readonly kind: 'ordering';
    readonly mode: 'cues';
    readonly prompt: AuthoredLocalizedText;
    readonly explanation: string;
    readonly reviewTag?: string;
    readonly phase?: AuthoredExercisePhase;
    readonly autoGraded: true;
    readonly pluginTarget: 'academy-sequence';
    readonly sourceItemsExact: readonly string[];
    readonly values: readonly string[];
    readonly workedExampleExact?: string;
}

export type AuthoredOrderingExercise = AuthoredTileOrderingExercise | AuthoredCueOrderingExercise;

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

export interface AuthoredWeekExposureText {
    readonly en?: string;
    readonly ja?: string;
    readonly reading?: string;
}

export interface AuthoredWeekExposure {
    readonly id: string;
    readonly kind: 'explanation' | 'passage' | 'prompt' | 'mission';
    readonly order: number;
    readonly title: AuthoredWeekExposureText;
    readonly entries: readonly AuthoredWeekExposureText[];
}

export interface AuthoredWeekPackage {
    readonly schema: 'yomu-academy.week.v1';
    readonly id: string;
    readonly identity: Readonly<Record<string, unknown>>;
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly components: readonly AuthoredComponent[];
    readonly preAssessment: readonly AuthoredWeekExposure[];
}

export function parseAuthoredWeekPackage(value: unknown): AuthoredWeekPackage {
    const root = record(value, 'package');
    if (root.schema !== 'yomu-academy.week.v1') fail('package.schema', 'must be yomu-academy.week.v1');
    const id = text(root.id, 'package.id');
    const sourceItemIds = new Set<string>();
    const rawComponents = array(root.components, 'package.components');
    const components = rawComponents.map((candidate, index) => {
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
        preAssessment: parsePreAssessmentExposure(root, rawComponents),
    };
}

function parsePreAssessmentExposure(
    root: Readonly<Record<string, unknown>>,
    components: readonly unknown[],
): readonly AuthoredWeekExposure[] {
    const exposures: Array<AuthoredWeekExposure & { readonly sourceIndex: number }> = [];
    const weekTitle = exposureText(root.title) ?? { en: 'Week teaching', ja: '今週のポイント' };
    const explanation = optionalRecord(root.explanation);
    if (explanation) {
        const entries = [
            exposureText(explanation.recap),
            exposureText(explanation.intro),
            ...arrayOrEmpty(explanation.grammarPoints).flatMap(candidate => {
                const point = optionalRecord(candidate);
                if (!point) return [];
                const japanese = [nonEmptyText(point.nameJa), nonEmptyText(point.pattern)]
                    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
                    .join(' / ');
                const en = [point.meaning, point.explanation, point.watchFor, point.commonError]
                    .flatMap(value => nonEmptyText(value) ?? [])
                    .join(' ');
                return japanese || en ? [{ ...(japanese ? { ja: japanese } : {}), ...(en ? { en } : {}) }] : [];
            }),
        ].filter((entry): entry is AuthoredWeekExposureText => Boolean(entry));
        if (entries.length) {
            exposures.push({
                id: 'explanation',
                kind: 'explanation',
                order: optionalFiniteNumber(explanation.order) ?? 5,
                title: weekTitle,
                entries,
                sourceIndex: -1,
            });
        }
    } else if (typeof root.explanation === 'string' && root.explanation.trim()) {
        exposures.push({
            id: 'explanation',
            kind: 'explanation',
            order: 5,
            title: weekTitle,
            entries: [{ en: root.explanation.trim() }],
            sourceIndex: -1,
        });
    }

    components.forEach((candidate, index) => {
        const component = record(candidate, `package.components[${index}]`);
        const order = finiteNumber(component.order, `package.components[${index}].order`);
        const title = exposureText(component.title) ?? {
            en: component.type === 'speaking' ? 'Speaking prompt' : component.type === 'writing' ? 'Writing prompt' : 'Passage',
        };
        const passageEntries = parsePassageExposure(component.passage);
        if (passageEntries.length) {
            exposures.push({
                id: `component-${index}-passage`,
                kind: 'passage',
                order,
                title,
                entries: passageEntries,
                sourceIndex: index,
            });
        }
        if ((component.type === 'speaking' || component.type === 'writing') && component.prompt !== undefined) {
            const prompt = exposureText(component.prompt);
            if (prompt) {
                exposures.push({
                    id: `component-${index}-prompt`,
                    kind: 'prompt',
                    order,
                    title,
                    entries: [prompt],
                    sourceIndex: index,
                });
            }
        }
    });

    const mission = optionalRecord(root.mission);
    if (mission) {
        const prompt = exposureText(mission.prompt);
        if (prompt) {
            exposures.push({
                id: 'mission',
                kind: 'mission',
                order: Math.max(5, ...components.map((candidate, index) =>
                    finiteNumber(record(candidate, `package.components[${index}]`).order, `package.components[${index}].order`))) + 1,
                title: exposureText(mission.title) ?? { en: 'Mission', ja: 'ミッション' },
                entries: [prompt],
                sourceIndex: components.length,
            });
        }
    }

    return exposures
        .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
        .map(({ sourceIndex: _sourceIndex, ...exposure }) => exposure);
}

function parsePassageExposure(value: unknown): readonly AuthoredWeekExposureText[] {
    if (typeof value === 'string' && value.trim()) return [{ ja: value.trim() }];
    const passage = optionalRecord(value);
    if (!passage) return [];
    if (Array.isArray(passage.lines)) {
        return passage.lines.flatMap(candidate => {
            const line = optionalRecord(candidate);
            if (!line) return [];
            const entry = exposureText(line);
            return entry ? [entry] : [];
        });
    }
    const entry = exposureText(passage);
    return entry ? [entry] : [];
}

function exposureText(value: unknown): AuthoredWeekExposureText | undefined {
    if (typeof value === 'string' && value.trim()) return { en: value.trim() };
    const candidate = optionalRecord(value);
    if (!candidate) return undefined;
    const en = nonEmptyText(candidate.en);
    const ja = nonEmptyText(candidate.ja);
    const reading = nonEmptyText(candidate.reading);
    if (!en && !ja) return undefined;
    return {
        ...(en ? { en } : {}),
        ...(ja ? { ja } : {}),
        ...(reading ? { reading } : {}),
    };
}

function arrayOrEmpty(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

function optionalFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

export function parseMultiChoiceExercise(value: unknown, path: string): AuthoredMultiChoiceExercise | undefined {
    const exercise = record(value, path);
    if (exercise.kind !== 'multi-choice') return undefined;
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
    if (!options.some(option => option.correct)) fail(`${path}.options`, 'must contain at least one correct option');
    return {
        id: text(exercise.id, `${path}.id`),
        kind: 'multi-choice',
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

export function parseClozeExercise(value: unknown, path: string): AuthoredClozeExercise | undefined {
    const exercise = record(value, path);
    if (exercise.kind !== 'cloze') return undefined;
    if (exercise.autoGraded !== true) {
        if (exercise.autoGraded === false) return undefined;
        fail(`${path}.autoGraded`, 'must be true or false');
    }
    assertAfterAttemptVisibility(exercise.answerVisibility, `${path}.answerVisibility`);
    const ids = new Set<string>();
    const wrongAnswers = wrongAnswerTriggers(exercise.wrongAnswerExplanations, `${path}.wrongAnswerExplanations`);
    const blanks = array(exercise.blanks, `${path}.blanks`).map((candidate, index) => {
        const blankPath = `${path}.blanks[${index}]`;
        const blank = record(candidate, blankPath);
        const id = text(blank.id, `${blankPath}.id`);
        if (ids.has(id)) fail(`${blankPath}.id`, 'is a duplicate cloze blank id');
        ids.add(id);
        return { id, answer: parseExactAnswer(blank.answer, `${blankPath}.answer`, wrongAnswers) };
    });
    if (!blanks.length) fail(`${path}.blanks`, 'must contain at least one blank');
    return {
        ...exerciseIdentity(exercise, path),
        kind: 'cloze',
        japanese: text(exercise.japanese, `${path}.japanese`),
        autoGraded: true,
        blanks,
    };
}

export function parseMatchingExercise(value: unknown, path: string): AuthoredMatchingExercise | undefined {
    const exercise = record(value, path);
    if (exercise.kind !== 'matching') return undefined;
    if (exercise.autoGraded !== true) {
        if (exercise.autoGraded === false) return undefined;
        fail(`${path}.autoGraded`, 'must be true or false');
    }
    if (exercise.pluginTarget !== 'academy-drag-sort') {
        fail(`${path}.pluginTarget`, 'must be academy-drag-sort');
    }
    assertAfterAttemptVisibility(exercise.answerVisibility, `${path}.answerVisibility`);
    const sourceItemsExact = stringArray(exercise.sourceItemsExact, `${path}.sourceItemsExact`);
    const answers = record(exercise.answers, `${path}.answers`);
    assertAfterAttemptVisibility(answers.visibility, `${path}.answers.visibility`);
    const values = stringArray(answers.values, `${path}.answers.values`);
    if (sourceItemsExact.length < 2 || sourceItemsExact.length !== values.length) {
        fail(path, 'must have the same number of source items and matching values');
    }
    if (new Set(values).size !== values.length) {
        fail(`${path}.answers.values`, 'must be unique for deterministic matching');
    }
    return {
        ...exerciseIdentity(exercise, path),
        kind: 'matching',
        autoGraded: true,
        pluginTarget: 'academy-drag-sort',
        sourceItemsExact,
        values,
    };
}

export function parseOrderingExercise(value: unknown, path: string): AuthoredOrderingExercise | undefined {
    const exercise = record(value, path);
    if (exercise.kind !== 'ordering') return undefined;
    if (exercise.autoGraded !== true) {
        if (exercise.autoGraded === false) return undefined;
        fail(`${path}.autoGraded`, 'must be true or false');
    }
    if (exercise.pluginTarget !== 'academy-sequence') {
        fail(`${path}.pluginTarget`, 'must be academy-sequence');
    }
    assertAfterAttemptVisibility(exercise.answerVisibility, `${path}.answerVisibility`);
    const identity = exerciseIdentity(exercise, path);
    const hasTiles = exercise.tiles !== undefined || exercise.answer !== undefined;
    const hasCues = exercise.sourceItemsExact !== undefined || exercise.answers !== undefined;
    if (hasTiles === hasCues) fail(path, 'must define exactly one ordering source shape');
    if (hasTiles) {
        const tiles = stringArray(exercise.tiles, `${path}.tiles`);
        if (tiles.length < 2 || new Set(tiles).size !== tiles.length) {
            fail(`${path}.tiles`, 'must contain at least two unique tiles');
        }
        return {
            ...identity,
            kind: 'ordering',
            mode: 'tiles',
            autoGraded: true,
            pluginTarget: 'academy-sequence',
            tiles,
            answer: parseExactAnswer(exercise.answer, `${path}.answer`),
        };
    }
    const sourceItemsExact = stringArray(exercise.sourceItemsExact, `${path}.sourceItemsExact`);
    const answers = record(exercise.answers, `${path}.answers`);
    assertAfterAttemptVisibility(answers.visibility, `${path}.answers.visibility`);
    const values = stringArray(answers.values, `${path}.answers.values`);
    if (!sourceItemsExact.length || sourceItemsExact.length !== values.length) {
        fail(path, 'must have the same number of ordering cues and values');
    }
    return {
        ...identity,
        kind: 'ordering',
        mode: 'cues',
        autoGraded: true,
        pluginTarget: 'academy-sequence',
        sourceItemsExact,
        values,
        ...(exercise.workedExampleExact === undefined
            ? {}
            : { workedExampleExact: text(exercise.workedExampleExact, `${path}.workedExampleExact`) }),
    };
}

function exerciseIdentity(
    exercise: Readonly<Record<string, unknown>>,
    path: string,
): Pick<AuthoredClozeExercise, 'id' | 'prompt' | 'explanation' | 'reviewTag' | 'phase'> {
    return {
        id: text(exercise.id, `${path}.id`),
        prompt: localized(exercise.prompt, `${path}.prompt`),
        explanation: text(exercise.explanation, `${path}.explanation`),
        ...(exercise.reviewTag === undefined ? {} : { reviewTag: text(exercise.reviewTag, `${path}.reviewTag`) }),
        ...(exercise.phase === undefined ? {} : { phase: exercisePhase(exercise.phase, `${path}.phase`) }),
    };
}

function parseExactAnswer(
    value: unknown,
    path: string,
    rejected: ReadonlySet<string> = new Set(),
): AuthoredExactExercise['answer'] {
    const answer = record(value, path);
    const primary = text(answer.primary, `${path}.primary`);
    const alternatives = answer.alternatives === undefined
        ? []
        : stringArray(answer.alternatives, `${path}.alternatives`);
    return {
        primary,
        alternatives: alternatives.filter(candidate => !rejected.has(normalizeAnswer(candidate))),
    };
}

function wrongAnswerTriggers(value: unknown, path: string): ReadonlySet<string> {
    if (value === undefined) return new Set();
    return new Set(array(value, path).map((candidate, index) => {
        const item = record(candidate, `${path}[${index}]`);
        return normalizeAnswer(text(item.trigger, `${path}[${index}].trigger`));
    }));
}

function normalizeAnswer(value: string): string {
    return value.normalize('NFKC').replace(/[\s。、！？!?]/gu, '').toLocaleLowerCase('ja');
}

function stringArray(value: unknown, path: string): readonly string[] {
    return array(value, path).map((candidate, index) => text(candidate, `${path}[${index}]`));
}

function assertAfterAttemptVisibility(value: unknown, path: string): void {
    if (value !== undefined && value !== 'after-attempt') fail(path, 'must be after-attempt');
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
