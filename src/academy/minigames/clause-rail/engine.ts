import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    ClauseRailModel,
    ClauseRailResponse,
    ClauseRailRound,
    ClauseRailSourceVisual,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = '262f9da24884b3868c4d87d84fccdffc8be353856f6603072139ef1cec182685';
const SOURCE_IMAGE_SHA256 = '36a073904a47724326460931351b7a5e9c66c60a502e085fd26fb2f64e29c642';
const SOURCE_IMAGE_URL = '/academy/content/lessons/l2-l08/moodle-chapter-22-1-clause-rail-page-1.png';

export function validateClauseRail(model: ClauseRailModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The clause rail requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l08'
        || model.provenance.packageOrder !== 35
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974656
        || moodle.sourceSheet.payloadSha256 !== SOURCE_PAYLOAD_SHA256
        || moodle.answerKeyBasis !== 'yomu-derived-clause-transformations-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 33 requires the exact l2-l08 package and Sensei Chapter 22-1 clause page.' });
    }
    if (!validVisual(moodle?.sourceSheet)) {
        issues.push({ path: 'provenance.moodle.sourceSheet', message: 'The exact canonical Chapter 22-1 page-one render is required.' });
    }
    if (moodle?.audio.status !== 'quarantined-unresolved-pairing'
        || moodle.audio.sourceAudioMembers !== 2
        || moodle.audio.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.audio', message: 'Both unresolved Moodle audio members must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo I · Chapter 22 (source inventory label)'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== 'none-verified'
        || model.provenance.support.genki.reuse !== 'none') {
        issues.push({ path: 'provenance.support', message: 'Minna is scope-only and no Genki crosswalk may be invented.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 3
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'The verbatim basic sentence, examples, and task direction must precede assessment.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 4 || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4') {
        issues.push({ path: 'payload.rounds', message: 'The four source transformations must remain in source order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All four clause rails are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeClauseRail(model: ClauseRailModel, response: ClauseRailResponse): GradeResult {
    const placements = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        const placement = placements.get(round.id);
        if (placement?.optionId === round.correctOptionId && placement.attached) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function clauseRailReviewSeeds(model: ClauseRailModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l08:clause-rail:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 22 noun-modifying clause ${round.sourceOrder}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: ClauseRailModel,
    round: ClauseRailRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionIds = new Set(round.options?.map(option => option.id));
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.noun) || !text(round.answerExpression)
        || !Array.isArray(round.options) || round.options.length !== 3
        || optionIds.size !== 3 || round.options.some(option => !text(option.id) || !text(option.label))
        || !optionIds.has(round.correctOptionId)
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source row needs three unique clause tickets, one derived answer, and three bilingual repair hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(
    model: ClauseRailModel,
    response: ClauseRailResponse,
): ReadonlyMap<string, Readonly<{ optionId: string; attached: boolean }>> {
    if (!response || !Array.isArray(response.placements) || response.placements.length !== model.payload.rounds.length) {
        throw new TypeError('Set all four Chapter 22 clause rails.');
    }
    const placements = new Map<string, Readonly<{ optionId: string; attached: boolean }>>();
    response.placements.forEach(placement => {
        const round = model.payload.rounds.find(candidate => candidate.id === placement.roundId);
        if (!round || placements.has(placement.roundId)
            || !round.options.some(option => option.id === placement.optionId)
            || typeof placement.attached !== 'boolean') {
            throw new TypeError('Each Chapter 22 source row needs one unique clause ticket and a boundary setting.');
        }
        placements.set(placement.roundId, { optionId: placement.optionId, attached: placement.attached });
    });
    return placements;
}

function validVisual(value: ClauseRailSourceVisual | undefined): boolean {
    return Boolean(value && text(value.sourceId) && text(value.title) && value.page === 1
        && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === SOURCE_IMAGE_URL && value.sha256 === SOURCE_IMAGE_SHA256
        && text(value.alt.en) && text(value.alt.ja));
}
