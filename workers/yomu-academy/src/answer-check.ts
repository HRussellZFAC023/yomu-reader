import type { Clock, Env } from './env';
import { hmacSha256Hex } from './crypto';
import { enforceRateLimit, type RateRule } from './rate-limit';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { requireAcademyAccessSession } from './profiles';

export const ANSWER_CHECK_CONTRACT_VERSION = 'answer-check.v1';

const ANSWER_CHECK_MAX_BYTES = 16 * 1024;
const ANSWER_CHECK_RATE: RateRule = { bucket: 'answer-check', limit: 20, windowMs: 10 * 60_000 };
const SKILLS = ['recognition', 'reading', 'listening', 'speaking', 'writing', 'grammar', 'vocabulary', 'kanji'] as const;
const RESPONSE_KINDS = ['text', 'choice', 'boolean', 'number', 'tokens'] as const;
const EVIDENCE_KINDS = ['observation', 'interaction', 'source_context'] as const;
const CRITERION_OUTCOMES = ['met', 'partially_met', 'not_met', 'uncertain'] as const;
const VERDICT_OUTCOMES = ['correct', 'partially_correct', 'incorrect', 'uncertain', 'unavailable'] as const;
const REPAIR_KINDS = ['retry', 'review_criterion', 'ask_for_clarification'] as const;

type Skill = typeof SKILLS[number];
type ResponseKind = typeof RESPONSE_KINDS[number];
type EvidenceKind = typeof EVIDENCE_KINDS[number];
type CriterionOutcome = typeof CRITERION_OUTCOMES[number];
type VerdictOutcome = typeof VERDICT_OUTCOMES[number];
type RepairKind = typeof REPAIR_KINDS[number];

export interface AnswerCheckRequest {
    readonly contractVersion: typeof ANSWER_CHECK_CONTRACT_VERSION;
    readonly taskContext: {
        readonly taskId: string;
        readonly skill: Skill;
        readonly learningGoal: string;
        readonly instruction: string;
    };
    readonly learnerResponse: {
        readonly kind: ResponseKind;
        readonly value: string | number | boolean | string[];
    };
    readonly allowedRubric: {
        readonly criteria: ReadonlyArray<{ readonly id: string; readonly label: string }>;
    };
    readonly allowedEvidence: ReadonlyArray<{
        readonly id: string;
        readonly kind: EvidenceKind;
        readonly description: string;
    }>;
}

export interface AnswerCheckFeedback {
    readonly contractVersion: typeof ANSWER_CHECK_CONTRACT_VERSION;
    readonly status: 'complete';
    readonly verdict: {
        readonly outcome: Exclude<VerdictOutcome, 'unavailable'>;
        readonly criteria: ReadonlyArray<{ readonly criterionId: string; readonly outcome: CriterionOutcome }>;
    };
    readonly uncertainty: {
        readonly level: 'low' | 'medium' | 'high';
        readonly reason: 'none' | 'ambiguous_response' | 'insufficient_evidence' | 'provider_limits';
    };
    readonly suggestedRepair: {
        readonly kind: RepairKind;
        readonly criterionId: string | null;
    } | null;
}

export interface AnswerCheckProvider {
    check(request: AnswerCheckRequest): Promise<unknown>;
}

interface AnswerCheckErrorBody {
    readonly error: { readonly code: string; readonly message: string };
}

class AnswerCheckValidationError extends Error {
    constructor() {
        super('Answer-check request does not match the supported contract.');
        this.name = 'AnswerCheckValidationError';
    }
}

/**
 * Validate the wire contract before a provider boundary. Every object is
 * exact, so arbitrary prompts, history, identity, credentials, answer keys,
 * and raw SRS payloads have no representable field in this contract.
 */
export function parseAnswerCheckRequest(body: Record<string, unknown>): AnswerCheckRequest {
    exactKeys(body, ['contractVersion', 'taskContext', 'learnerResponse', 'allowedRubric', 'allowedEvidence']);
    if (body.contractVersion !== ANSWER_CHECK_CONTRACT_VERSION) throw new AnswerCheckValidationError();

    const task = objectValue(body.taskContext);
    exactKeys(task, ['taskId', 'skill', 'learningGoal', 'instruction']);
    const taskContext = {
        taskId: boundedString(task.taskId, 128),
        skill: enumValue(task.skill, SKILLS),
        learningGoal: boundedString(task.learningGoal, 240),
        instruction: boundedString(task.instruction, 1000),
    };

    const response = objectValue(body.learnerResponse);
    exactKeys(response, ['kind', 'value']);
    const kind = enumValue(response.kind, RESPONSE_KINDS);
    const value = parseResponseValue(kind, response.value);

    const rubric = objectValue(body.allowedRubric);
    exactKeys(rubric, ['criteria']);
    const criteria = arrayValue(rubric.criteria, 1, 8).map(item => {
        const criterion = objectValue(item);
        exactKeys(criterion, ['id', 'label']);
        return { id: boundedString(criterion.id, 64), label: boundedString(criterion.label, 240) };
    });
    assertUniqueIds(criteria);

    const allowedEvidence = arrayValue(body.allowedEvidence, 0, 16).map(item => {
        const evidence = objectValue(item);
        exactKeys(evidence, ['id', 'kind', 'description']);
        return {
            id: boundedString(evidence.id, 64),
            kind: enumValue(evidence.kind, EVIDENCE_KINDS),
            description: boundedString(evidence.description, 240),
        };
    });
    assertUniqueIds(allowedEvidence);

    return {
        contractVersion: ANSWER_CHECK_CONTRACT_VERSION,
        taskContext,
        learnerResponse: { kind, value },
        allowedRubric: { criteria },
        allowedEvidence,
    };
}

/** Validate provider output before returning it to the learner. */
export function parseAnswerCheckFeedback(value: unknown, request: AnswerCheckRequest): AnswerCheckFeedback {
    const body = objectValue(value);
    exactKeys(body, ['contractVersion', 'status', 'verdict', 'uncertainty', 'suggestedRepair']);
    if (body.contractVersion !== ANSWER_CHECK_CONTRACT_VERSION || body.status !== 'complete') {
        throw new AnswerCheckValidationError();
    }

    const verdict = objectValue(body.verdict);
    exactKeys(verdict, ['outcome', 'criteria']);
    const outcome = enumValue(verdict.outcome, VERDICT_OUTCOMES.filter(item => item !== 'unavailable') as Array<Exclude<VerdictOutcome, 'unavailable'>>);
    const criteria = arrayValue(verdict.criteria, request.allowedRubric.criteria.length, request.allowedRubric.criteria.length).map(item => {
        const criterion = objectValue(item);
        exactKeys(criterion, ['criterionId', 'outcome']);
        const criterionId = boundedString(criterion.criterionId, 64);
        if (!request.allowedRubric.criteria.some(allowed => allowed.id === criterionId)) throw new AnswerCheckValidationError();
        return { criterionId, outcome: enumValue(criterion.outcome, CRITERION_OUTCOMES) };
    });
    assertUniqueIds(criteria, 'criterionId');

    const uncertainty = objectValue(body.uncertainty);
    exactKeys(uncertainty, ['level', 'reason']);
    const parsedUncertainty = {
        level: enumValue(uncertainty.level, ['low', 'medium', 'high'] as const),
        reason: enumValue(uncertainty.reason, ['none', 'ambiguous_response', 'insufficient_evidence', 'provider_limits'] as const),
    };

    let suggestedRepair: AnswerCheckFeedback['suggestedRepair'] = null;
    if (body.suggestedRepair !== null) {
        const repair = objectValue(body.suggestedRepair);
        exactKeys(repair, ['kind', 'criterionId']);
        const criterionId = repair.criterionId === null ? null : boundedString(repair.criterionId, 64);
        if (criterionId !== null && !request.allowedRubric.criteria.some(allowed => allowed.id === criterionId)) {
            throw new AnswerCheckValidationError();
        }
        suggestedRepair = { kind: enumValue(repair.kind, REPAIR_KINDS), criterionId };
    }

    return {
        contractVersion: ANSWER_CHECK_CONTRACT_VERSION,
        status: 'complete',
        verdict: { outcome, criteria },
        uncertainty: parsedUncertainty,
        suggestedRepair,
    };
}

export async function handleAnswerCheck(
    request: Request,
    env: Env,
    clock: Clock,
    provider: AnswerCheckProvider | null = null,
): Promise<Response> {
    try {
        requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
        const now = clock();
        const session = await requireAcademyAccessSession(request, env, now);
        const subject = await hmacSha256Hex(env.ACADEMY_RATE_HMAC_KEY, `answer-check:${session.public_id}`);
        await enforceRateLimit(env, subject, ANSWER_CHECK_RATE, now);
        const body = await readJsonBody(request, ANSWER_CHECK_MAX_BYTES);
        const answerCheckRequest = parseAnswerCheckRequest(body);

        if (!provider) return providerUnavailableResponse();
        let providerOutput: unknown;
        try {
            providerOutput = await provider.check(answerCheckRequest);
            return jsonResponse(parseAnswerCheckFeedback(providerOutput, answerCheckRequest));
        } catch {
            return providerFailureResponse();
        }
    } catch (error) {
        return answerCheckErrorResponse(error);
    }
}

function providerUnavailableResponse(): Response {
    return jsonResponse({
        error: { code: 'provider_unavailable', message: 'Answer checking is not currently available.' },
        contractVersion: ANSWER_CHECK_CONTRACT_VERSION,
        status: 'provider_unavailable',
        verdict: null,
        uncertainty: { level: 'high', reason: 'provider_unavailable' },
        suggestedRepair: null,
    }, 503, { 'retry-after': '3600' });
}

function providerFailureResponse(): Response {
    return jsonResponse({ error: { code: 'provider_invalid_response', message: 'Answer-check provider failed.' } }, 502);
}

function answerCheckErrorResponse(error: unknown): Response {
    if (error instanceof AnswerCheckValidationError) {
        return jsonResponse({ error: { code: 'invalid_request', message: error.message } } satisfies AnswerCheckErrorBody, 400);
    }
    if (error instanceof HttpError) {
        const code = errorCodeForStatus(error.status);
        return jsonResponse({ error: { code, message: error.message } } satisfies AnswerCheckErrorBody, error.status, { ...error.headers });
    }
    // Provider failures and parser bugs never expose provider text or learner data.
    return jsonResponse({ error: { code: 'internal_error', message: 'Answer checking failed.' } } satisfies AnswerCheckErrorBody, 500);
}

function errorCodeForStatus(status: number): string {
    switch (status) {
        case 400: return 'invalid_request';
        case 401: return 'unauthenticated';
        case 403: return 'forbidden';
        case 413: return 'request_too_large';
        case 415: return 'unsupported_media_type';
        case 429: return 'rate_limited';
        default: return status >= 500 ? 'internal_error' : 'request_rejected';
    }
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): void {
    const allowedSet = new Set(allowed);
    if (Object.keys(value).some(key => !allowedSet.has(key))) throw new AnswerCheckValidationError();
}

function objectValue(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AnswerCheckValidationError();
    return value as Record<string, unknown>;
}

function arrayValue(value: unknown, min: number, max: number): unknown[] {
    if (!Array.isArray(value) || value.length < min || value.length > max) throw new AnswerCheckValidationError();
    return value;
}

function boundedString(value: unknown, maxLength: number): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\u0000')) {
        throw new AnswerCheckValidationError();
    }
    return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
    if (typeof value !== 'string' || !allowed.includes(value)) throw new AnswerCheckValidationError();
    return value as T[number];
}

function assertUniqueIds(
    items: ReadonlyArray<{ readonly id?: unknown; readonly criterionId?: unknown }>,
    key: 'id' | 'criterionId' = 'id',
): void {
    const ids = items.map(item => item[key]);
    if (ids.some((id, index) => ids.indexOf(id) !== index)) throw new AnswerCheckValidationError();
}

function parseResponseValue(kind: ResponseKind, value: unknown): AnswerCheckRequest['learnerResponse']['value'] {
    switch (kind) {
        case 'text': return boundedString(value, 2_000);
        case 'choice': return boundedString(value, 128);
        case 'boolean':
            if (typeof value !== 'boolean') throw new AnswerCheckValidationError();
            return value;
        case 'number':
            if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) throw new AnswerCheckValidationError();
            return value;
        case 'tokens':
            return arrayValue(value, 1, 64).map(token => boundedString(token, 64));
    }
}
