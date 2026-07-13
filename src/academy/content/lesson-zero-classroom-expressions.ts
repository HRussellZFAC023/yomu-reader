import { validateAnswerSupportContract } from '../domain/activity-runtime';
import type {
    ClassroomExpressionItem,
    ClassroomExpressionPhase,
    ClassroomExpressionSessionDefinition,
    ClassroomExpressionTeachingBlock,
} from '../domain/classroom-expression-session';

export const LESSON_ZERO_CLASSROOM_EXPRESSIONS_URL =
    '/academy/content/lessons/lesson-zero-classroom-expressions.v1.json';

export const LESSON_ZERO_CLASSROOM_EXPRESSION_SOURCE_IDS = Object.freeze(
    Array.from({ length: 14 }, (_, index) =>
        `source-question:classroom-phrase-${String(index + 1).padStart(2, '0')}`),
);

const PHASE_IDS = [
    'room-rhythm',
    'understanding-and-repair',
    'feedback',
    'desk-language',
] as const;

const TEACHING_CONCEPT_IDS = [
    'concept:classroom-start-stop-break',
    'concept:classroom-look-say-listen-write',
    'concept:classroom-understanding',
    'concept:classroom-repair-repeat',
    'concept:classroom-feedback',
    'concept:classroom-desk-nouns',
] as const;

const CANONICAL_PROBE_MODELS: Readonly<Record<string, readonly string[]>> = {
    'expression:classroom-01': ['はじめましょう'],
    'expression:classroom-02': ['おわりましょう'],
    'expression:classroom-03': ['やすみましょう'],
    'expression:classroom-04': ['みてください'],
    'expression:classroom-05': ['みなさんでいってください'],
    'expression:classroom-06': ['きいてください'],
    'expression:classroom-07': ['かいてください'],
    'expression:classroom-08': ['わかりますか', 'はい、わかります', 'いいえ、わかりません'],
    'expression:classroom-09': ['もう一度お願いします'],
    'expression:classroom-10': ['いいです'],
    'expression:classroom-11': ['そうです', 'あってます'],
    'expression:classroom-12': ['ちがいます'],
    'expression:classroom-13': ['しゅくだい'],
    'expression:classroom-14': ['れい'],
};

const FORBIDDEN_INTERACTION_KEYS = new Set([
    'audioAssetId', 'inputScriptId', 'voiceAssetId', 'browserTtsAllowed',
    'choices', 'options', 'distractors',
]);

let defaultLoad: Promise<ClassroomExpressionSessionDefinition> | null = null;

export function loadLessonZeroClassroomExpressions(
    fetcher: typeof fetch = fetch,
): Promise<ClassroomExpressionSessionDefinition> {
    if (fetcher !== fetch) return load(fetcher);
    defaultLoad ??= load(fetcher).catch(error => {
        defaultLoad = null;
        throw error;
    });
    return defaultLoad;
}

async function load(fetcher: typeof fetch): Promise<ClassroomExpressionSessionDefinition> {
    const response = await fetcher(LESSON_ZERO_CLASSROOM_EXPRESSIONS_URL);
    if (!response.ok) {
        throw new Error(`Could not load Lesson 0 classroom expressions (${response.status}).`);
    }
    return validateLessonZeroClassroomExpressions(await response.json());
}

export function validateLessonZeroClassroomExpressions(value: unknown): ClassroomExpressionSessionDefinition {
    rejectForbiddenInteractionKeys(value);
    const definition = record(value, 'classroom-expression session') as unknown as ClassroomExpressionSessionDefinition;
    if (definition.schemaVersion !== 1) fail('Classroom-expression session must use schemaVersion 1.');
    if (definition.id !== 'session:lesson-zero-classroom-expressions') fail('Classroom-expression session has the wrong id.');
    text(definition.contentVersion, 'contentVersion');
    if (definition.responseKind !== 'constructed-japanese' || definition.inputMode !== 'ime') {
        fail('Classroom expressions require constructed Japanese entered with an IME.');
    }
    if (definition.completionPolicy !== 'all-probes-pass') fail('Every classroom-expression probe must pass.');
    if (definition.navigationPolicy !== 'free-with-resume') fail('Classroom-expression navigation must remain free and resumable.');
    const supportIssues = validateAnswerSupportContract(definition.answerSupport);
    if (supportIssues.length) fail(`Unsafe answer support: ${supportIssues.map(issue => issue.message).join('; ')}`);
    exactList(definition.phaseIds, PHASE_IDS, 'phaseIds');

    const teachingBlocks = array<ClassroomExpressionTeachingBlock>(definition.teachingBlocks, 'teachingBlocks');
    if (teachingBlocks.length !== TEACHING_CONCEPT_IDS.length) {
        fail('Classroom expressions need six pre-assessment teaching blocks.');
    }
    const teachingById = uniqueIndex(teachingBlocks, 'teaching block');
    exactList(
        teachingBlocks.map(block => block.conceptId),
        TEACHING_CONCEPT_IDS,
        'teaching conceptIds',
    );
    for (const block of teachingById.values()) validateTeachingBlock(block);

    const phases = array<ClassroomExpressionPhase>(definition.phases, 'phases');
    if (phases.length !== PHASE_IDS.length) fail('Classroom-expression session needs four phases.');
    const phaseById = uniqueIndex(phases, 'phase');
    exactList([...phaseById.keys()], PHASE_IDS, 'phases');
    phases.forEach((phase, index) => {
        if (phase.order !== index + 1) fail(`Phase ${phase.id} has the wrong order.`);
        localized(phase.title, `phase ${phase.id} title`);
        nonEmpty(phase.expressionIds, `phase ${phase.id} expressionIds`);
    });

    const expressions = array<ClassroomExpressionItem>(definition.expressions, 'expressions');
    if (expressions.length !== 14) fail('Classroom-expression session must preserve all fourteen expressions.');
    const expressionById = uniqueIndex(expressions, 'expression');
    const sourceIds = expressions.map(expression => text(expression.sourceQuestionId, `${expression.id} sourceQuestionId`));
    exactList([...sourceIds].sort(), [...LESSON_ZERO_CLASSROOM_EXPRESSION_SOURCE_IDS].sort(), 'sourceQuestionIds');
    const assigned = phases.flatMap(phase => phase.expressionIds);
    exactList(assigned, expressions.map(expression => expression.id), 'phase expression order');
    if (new Set(assigned).size !== expressions.length) fail('Each expression must appear in one phase.');
    const taught = teachingBlocks.flatMap(block => block.expressionIds);
    exactList([...taught].sort(), expressions.map(expression => expression.id).sort(), 'teaching expression coverage');
    if (new Set(taught).size !== expressions.length) fail('Each expression needs one pre-assessment teaching block.');

    const probeIds = new Set<string>();
    let probeCount = 0;
    expressions.forEach((expression, index) => {
        const suffix = String(index + 1).padStart(2, '0');
        if (expression.id !== `expression:classroom-${suffix}`
            || expression.sourceQuestionId !== `source-question:classroom-phrase-${suffix}`) {
            fail(`Expression ${index + 1} does not match its canonical source record.`);
        }
        validateExpression(expression, index, phaseById, probeIds);
        probeCount += expression.probes.length;
    });
    validateNoCrossAnswerLeak(expressions, teachingBlocks);
    if (probeCount !== 17) fail('Classroom-expression session must contain seventeen constructed-response probes.');
    requireVariantCoverage(expressionById);
    return structuredClone(definition);
}

function validateNoCrossAnswerLeak(
    expressions: readonly ClassroomExpressionItem[],
    teachingBlocks: readonly ClassroomExpressionTeachingBlock[],
): void {
    const answers = expressions.flatMap(expression => expression.probes.flatMap(probe =>
        probe.acceptedAnswers.map(answer => ({ answer: normalized(answer), owner: probe.id }))));
    for (const block of teachingBlocks) {
        const teachingText = normalized(JSON.stringify(block));
        const leaked = answers.find(candidate => teachingText.includes(candidate.answer));
        if (leaked) fail(`Teaching block ${block.id} exposes the answer to ${leaked.owner} before commitment.`);
    }
    for (const expression of expressions) {
        for (const probe of expression.probes) {
            const prompt = normalized(JSON.stringify(probe.prompt));
            const leaked = answers.find(candidate => prompt.includes(candidate.answer));
            if (leaked) fail(`Probe ${probe.id} exposes the answer to ${leaked.owner} before commitment.`);
        }
    }
}

function validateTeachingBlock(block: ClassroomExpressionTeachingBlock): void {
    text(block.conceptId, `teaching block ${block.id} conceptId`);
    nonEmpty(block.expressionIds, `teaching block ${block.id} expressionIds`);
    localized(block.explanation, `teaching block ${block.id} explanation`);
    const example = record(block.workedExample, `teaching block ${block.id} workedExample`);
    localized(example.context, `teaching block ${block.id} workedExample.context`);
    const japanese = text(example.japanese, `teaching block ${block.id} workedExample.japanese`);
    text(example.reading, `teaching block ${block.id} workedExample.reading`);
    localized(example.meaning, `teaching block ${block.id} workedExample.meaning`);
    if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(japanese)) {
        fail(`Teaching block ${block.id} needs a Japanese worked example.`);
    }
}

function validateExpression(
    expression: ClassroomExpressionItem,
    index: number,
    phases: ReadonlyMap<string, ClassroomExpressionSessionDefinition['phases'][number]>,
    probeIds: Set<string>,
): void {
    if (expression.order !== index + 1) fail(`Expression ${expression.id} has the wrong order.`);
    if (!phases.has(expression.phaseId)) fail(`Expression ${expression.id} has an unknown phase.`);
    if (!phases.get(expression.phaseId)?.expressionIds.includes(expression.id)) {
        fail(`Expression ${expression.id} is not assigned to its declared phase.`);
    }
    if (expression.responseKind !== 'constructed-japanese' || expression.inputMode !== 'ime') {
        fail(`Expression ${expression.id} is not a constructed response.`);
    }
    if (!['writing', 'repair'].includes(expression.skill)) fail(`Expression ${expression.id} has an invalid skill.`);
    nonEmpty(expression.conceptIds, `expression ${expression.id} conceptIds`);
    nonEmpty(expression.probes, `expression ${expression.id} probes`);
    for (const probe of expression.probes) {
        text(probe.id, `expression ${expression.id} probe id`);
        if (probeIds.has(probe.id)) fail(`Duplicate probe id: ${probe.id}`);
        probeIds.add(probe.id);
        localized(probe.prompt, `probe ${probe.id} prompt`);
        nonEmpty(probe.acceptedAnswers, `probe ${probe.id} acceptedAnswers`);
        const accepted = probe.acceptedAnswers.map((answer, answerIndex) => {
            const candidate = text(answer, `probe ${probe.id} acceptedAnswers.${answerIndex}`);
            if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(candidate)) {
                fail(`Probe ${probe.id} has a non-Japanese answer.`);
            }
            return normalized(candidate);
        });
        if (new Set(accepted).size !== accepted.length) fail(`Probe ${probe.id} repeats an accepted answer.`);
        if (!accepted.includes(normalized(probe.modelAnswer))) fail(`Probe ${probe.id} model answer is not accepted.`);
        if (accepted.some(answer => normalized(probe.prompt.en).includes(answer)
            || normalized(probe.prompt.ja).includes(answer))) {
            fail(`Probe ${probe.id} exposes an accepted answer before commitment.`);
        }
        text(probe.repair.errorTag, `probe ${probe.id} repair.errorTag`);
        localized(probe.repair.contrast, `probe ${probe.id} repair.contrast`);
        localized(probe.repair.retryPrompt, `probe ${probe.id} repair.retryPrompt`);
        localized(probe.repair.nearbyExample, `probe ${probe.id} repair.nearbyExample`);
    }
}

function requireVariantCoverage(expressions: ReadonlyMap<string, ClassroomExpressionItem>): void {
    const understanding = expressions.get('expression:classroom-08');
    const confirmation = expressions.get('expression:classroom-11');
    if (understanding?.probes.length !== 3) {
        fail('Expression 8 must assess the question, affirmative response, and negative response separately.');
    }
    if (confirmation?.probes.length !== 2) {
        fail('Expression 11 must assess both source confirmation variants.');
    }
    for (const expression of expressions.values()) {
        exactList(
            expression.probes.map(probe => probe.modelAnswer),
            CANONICAL_PROBE_MODELS[expression.id] ?? [],
            `${expression.id} canonical probe models`,
        );
        if (expression.id !== 'expression:classroom-08'
            && expression.id !== 'expression:classroom-11'
            && expression.probes.length !== 1) {
            fail(`Expression ${expression.id} has unexpected probe duplication.`);
        }
    }
}

function rejectForbiddenInteractionKeys(value: unknown, path = 'session'): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => rejectForbiddenInteractionKeys(item, `${path}.${index}`));
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_INTERACTION_KEYS.has(key)) {
            fail(`${path}.${key} introduces choices or unverified audio.`);
        }
        rejectForbiddenInteractionKeys(child, `${path}.${key}`);
    }
}

function uniqueIndex<T extends { readonly id: string }>(values: readonly T[], label: string): Map<string, T> {
    const result = new Map<string, T>();
    for (const value of values) {
        text(value.id, `${label}.id`);
        if (result.has(value.id)) fail(`Duplicate ${label} id: ${value.id}`);
        result.set(value.id, value);
    }
    return result;
}

function exactList(actual: readonly string[], expected: readonly string[], label: string): void {
    if (!Array.isArray(actual) || actual.length !== expected.length
        || actual.some((value, index) => value !== expected[index])) {
        fail(`${label} does not match the authored contract.`);
    }
}

function localized(value: unknown, label: string): void {
    const candidate = record(value, label);
    text(candidate.en, `${label}.en`);
    text(candidate.ja, `${label}.ja`);
}

function nonEmpty(values: readonly unknown[], label: string): void {
    if (!Array.isArray(values) || !values.length) fail(`${label} must not be empty.`);
}

function array<T>(value: unknown, label: string): readonly T[] {
    if (!Array.isArray(value)) fail(`${label} must be an array.`);
    return value as readonly T[];
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(`${label} must be non-empty.`);
    return value.trim();
}

function normalized(value: string): string {
    return value.normalize('NFKC').replace(/[\s。！？!?.,、]/gu, '').toLocaleLowerCase('ja-JP');
}

function fail(message: string): never {
    throw new TypeError(message);
}
