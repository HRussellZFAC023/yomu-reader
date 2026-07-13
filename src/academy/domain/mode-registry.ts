import type { LocalizedText } from './source-library';
import { validateAnswerSupportContract, type AnswerSupportContract } from './activity-runtime';

export type AcademyModeId =
    | 'normal-challenge'
    | 'mastery-conquest'
    | 'inferno-pressure'
    | 'repair-review'
    | 'mixed-range'
    | 'learner-deck'
    | 'shiritori'
    | 'kanji-stroke-play'
    | 'listening'
    | 'pronunciation'
    | 'dictionary-discovery'
    | 'kanji-discovery'
    | 'example-discovery'
    | 'random-discovery';

export interface ModeAccessibility {
    readonly keyboard: boolean;
    readonly touch: boolean;
    readonly screenReader: boolean;
    readonly reducedMotion: boolean;
    readonly captions: 'required' | 'available' | 'not-applicable';
    readonly timeLimit: 'none' | 'optional';
}

export interface AcademyModeDefinition {
    readonly id: AcademyModeId;
    readonly delivery: 'engine-only' | 'authored' | 'playable';
    readonly recommendationEligible: boolean;
    readonly optIn: boolean;
    readonly teaches: LocalizedText;
    readonly learnerAction: LocalizedText;
    readonly feedbackAndRepair: LocalizedText;
    readonly projections: readonly string[];
    readonly evidenceKinds: readonly ['learning-evidence-recorded'];
    readonly accessibility: ModeAccessibility;
    readonly journeys: readonly AcademyContentJourney[];
    readonly origin: {
        readonly project: 'mistval/kotoba';
        readonly commit: '08064bc387d6b56647f1fea89e8cfbfe3c94ec9a';
        readonly loci: readonly string[];
    };
}

export interface AcademyModeRegistry {
    readonly schemaVersion: 1;
    readonly registryId: 'yomu-academy-practice-modes';
    readonly revision: number;
    readonly contentContract: {
        readonly requiredAuditStatus: 'cleared';
        readonly secureAssessmentPolicy: 'exclude-from-practice';
    };
    readonly answerSupportContract: AnswerSupportContract;
    readonly modes: readonly AcademyModeDefinition[];
}

export type AcademyContentJourney = 'lesson' | 'listening' | 'repair' | 'checkpoint' | 'transfer' | 'exam-season';

export interface AcademyModeContentCandidate {
    readonly journey: AcademyContentJourney;
    readonly auditStatus: 'candidate' | 'cleared' | 'rejected';
    readonly exposure: 'practice-cleared' | 'published-assessment' | 'secure-assessment';
}

const IDS: readonly AcademyModeId[] = [
    'normal-challenge', 'mastery-conquest', 'inferno-pressure', 'repair-review', 'mixed-range',
    'learner-deck', 'shiritori', 'kanji-stroke-play', 'listening', 'pronunciation',
    'dictionary-discovery', 'kanji-discovery', 'example-discovery', 'random-discovery',
];

export function validateModeRegistry(input: unknown): AcademyModeRegistry {
    const registry = object(input, 'registry');
    if (registry.schemaVersion !== 1) throw new TypeError('Mode registry schemaVersion must be 1.');
    if (registry.registryId !== 'yomu-academy-practice-modes') throw new TypeError('Unexpected mode registry id.');
    positiveInteger(registry.revision, 'revision');
    const contentContract = object(registry.contentContract, 'contentContract');
    if (contentContract.requiredAuditStatus !== 'cleared' || contentContract.secureAssessmentPolicy !== 'exclude-from-practice') {
        throw new TypeError('Practice content must be cleared and secure assessment forms must be excluded.');
    }
    const answerSupportIssues = validateAnswerSupportContract(registry.answerSupportContract);
    if (answerSupportIssues.length) throw new TypeError(`Invalid mode answer-support contract: ${answerSupportIssues.map(issue => issue.message).join('; ')}`);
    const modes = array(registry.modes, 'modes').map((value, index) => validateMode(value, index));
    const ids = modes.map(mode => mode.id);
    if (new Set(ids).size !== ids.length) throw new TypeError('Mode ids must be unique.');
    const missing = IDS.filter(id => !ids.includes(id));
    const extra = ids.filter(id => !IDS.includes(id));
    if (missing.length || extra.length || modes.length !== IDS.length) {
        throw new TypeError(`Mode registry must contain exactly the Academy modes (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}).`);
    }
    return structuredClone({ ...registry, modes }) as unknown as AcademyModeRegistry;
}

export function isContentEligibleForMode(mode: AcademyModeDefinition, candidate: AcademyModeContentCandidate): boolean {
    return candidate.auditStatus === 'cleared'
        && candidate.exposure !== 'secure-assessment'
        && mode.journeys.includes(candidate.journey);
}

function validateMode(value: unknown, index: number): AcademyModeDefinition {
    const mode = object(value, `modes[${index}]`);
    const id = text(mode.id, `modes[${index}].id`) as AcademyModeId;
    if (!IDS.includes(id)) throw new TypeError(`Unknown Academy mode: ${id}.`);
    if (!['engine-only', 'authored', 'playable'].includes(String(mode.delivery))) throw new TypeError(`${id} needs an honest delivery state.`);
    boolean(mode.recommendationEligible, `${id}.recommendationEligible`);
    boolean(mode.optIn, `${id}.optIn`);
    localized(mode.teaches, `${id}.teaches`);
    localized(mode.learnerAction, `${id}.learnerAction`);
    localized(mode.feedbackAndRepair, `${id}.feedbackAndRepair`);
    nonEmptyTextArray(mode.projections, `${id}.projections`);
    const journeys = array(mode.journeys, `${id}.journeys`);
    if (!journeys.length || journeys.some(journey => !['lesson', 'listening', 'repair', 'checkpoint', 'transfer', 'exam-season'].includes(String(journey)))) {
        throw new TypeError(`${id} needs valid content journeys.`);
    }
    const evidenceKinds = array(mode.evidenceKinds, `${id}.evidenceKinds`);
    if (evidenceKinds.length !== 1 || evidenceKinds[0] !== 'learning-evidence-recorded') throw new TypeError(`${id} must emit canonical learning evidence.`);
    const accessibility = object(mode.accessibility, `${id}.accessibility`);
    for (const field of ['keyboard', 'touch', 'screenReader', 'reducedMotion']) boolean(accessibility[field], `${id}.accessibility.${field}`);
    if (!['required', 'available', 'not-applicable'].includes(String(accessibility.captions))) throw new TypeError(`${id} needs a captions contract.`);
    if (!['none', 'optional'].includes(String(accessibility.timeLimit))) throw new TypeError(`${id} needs a time-limit contract.`);
    if (id === 'inferno-pressure' && (!mode.optIn || mode.recommendationEligible || accessibility.timeLimit !== 'optional')) {
        throw new TypeError('Inferno must be opt-in, never recommended, and offer an untimed path.');
    }
    const origin = object(mode.origin, `${id}.origin`);
    if (origin.project !== 'mistval/kotoba' || origin.commit !== '08064bc387d6b56647f1fea89e8cfbfe3c94ec9a') {
        throw new TypeError(`${id} must cite the pinned Kotoba revision.`);
    }
    nonEmptyTextArray(origin.loci, `${id}.origin.loci`);
    return structuredClone(mode) as unknown as AcademyModeDefinition;
}

function localized(value: unknown, label: string): void {
    const localizedText = object(value, label);
    text(localizedText.en, `${label}.en`);
    text(localizedText.ja, `${label}.ja`);
}

function nonEmptyTextArray(value: unknown, label: string): void {
    const values = array(value, label);
    if (!values.length) throw new TypeError(`${label} must not be empty.`);
    values.forEach((item, index) => text(item, `${label}[${index}]`));
}

function object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value.trim();
}

function boolean(value: unknown, label: string): void {
    if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
}

function positiveInteger(value: unknown, label: string): void {
    if (!Number.isSafeInteger(value) || Number(value) < 1) throw new TypeError(`${label} must be a positive integer.`);
}
