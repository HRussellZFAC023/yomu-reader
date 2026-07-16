import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    ConfirmationSignalModel,
    ConfirmationSignalResponse,
    ConfirmationSignalRound,
    ConfirmationSignalSourceVisual,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = 'dca619084366be2c1d89de013f3b7b142b83fb5ee7462175bc4d35af9ecd8ab6';
const SOURCE_IMAGE_SHA256 = '68cdcf841810f4738474a813fd60eafbfdd5e384da0d0e10fcaf987f552c05a9';
const SOURCE_IMAGE_URL = '/academy/content/lessons/l2-l07/moodle-chapter-21-deshou-teaching-task-page-1.png';

export function validateConfirmationSignal(model: ConfirmationSignalModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The confirmation signal requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l07'
        || model.provenance.packageOrder !== 34
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974653
        || moodle.sourceSheet.payloadSha256 !== SOURCE_PAYLOAD_SHA256
        || moodle.answerKeyBasis !== 'yomu-derived-deshou-transformations-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 32 requires the exact l2-l07 package and Sensei Chapter 21 でしょう page.' });
    }
    if (!validVisual(moodle?.sourceSheet)) {
        issues.push({ path: 'provenance.moodle.sourceSheet', message: 'The exact canonical Chapter 21 page-one render is required.' });
    }
    if (moodle?.audio.status !== 'minna-074-recording-embedded-true-false-reviewed'
        || moodle.audio.sourceAudioMembers !== 8
        || moodle.audio.sourceAudioTracksDelivered !== 1
        || moodle.audio.quarantinedSourceAudioMembers !== 7) {
        issues.push({ path: 'provenance.moodle.audio', message: 'Minna 074 must be delivered while the other seven Moodle audio members remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo I, Lesson 21'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== 'none-verified'
        || model.provenance.support.genki.reuse !== 'none') {
        issues.push({ path: 'provenance.support', message: 'Minna is scope-only and no Genki crosswalk may be invented.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 3
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'The verbatim でしょう rule, explanation, and examples must precede assessment.' });
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
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All four confirmation signals are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeConfirmationSignal(
    model: ConfirmationSignalModel,
    response: ConfirmationSignalResponse,
): GradeResult {
    const signals = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        const signal = signals.get(round.id);
        if (signal?.optionId === round.correctOptionId && signal.rising) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function confirmationSignalReviewSeeds(
    model: ConfirmationSignalModel,
    result: GradeResult,
): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l07:deshou:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 21 confirmation transformation ${round.sourceOrder}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: ConfirmationSignalModel,
    round: ConfirmationSignalRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionIds = new Set(round.options?.map(option => option.id));
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.answerExpression)
        || !Array.isArray(round.options) || round.options.length !== 3
        || optionIds.size !== 3 || round.options.some(option => !text(option.id) || !text(option.label))
        || !optionIds.has(round.correctOptionId)
        || round.options.find(option => option.id === round.correctOptionId)?.label !== round.answerExpression
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source row needs three unique signals, one derived answer, and three bilingual repair hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(
    model: ConfirmationSignalModel,
    response: ConfirmationSignalResponse,
): ReadonlyMap<string, Readonly<{ optionId: string; rising: boolean }>> {
    if (!response || !Array.isArray(response.signals) || response.signals.length !== model.payload.rounds.length) {
        throw new TypeError('Set all four Chapter 21 confirmation signals.');
    }
    const signals = new Map<string, Readonly<{ optionId: string; rising: boolean }>>();
    response.signals.forEach(signal => {
        const round = model.payload.rounds.find(candidate => candidate.id === signal.roundId);
        if (!round || signals.has(signal.roundId)
            || !round.options.some(option => option.id === signal.optionId)
            || typeof signal.rising !== 'boolean') {
            throw new TypeError('Each Chapter 21 source row needs one unique completion and an intonation setting.');
        }
        signals.set(signal.roundId, { optionId: signal.optionId, rising: signal.rising });
    });
    return signals;
}

function validVisual(value: ConfirmationSignalSourceVisual | undefined): boolean {
    return Boolean(value && text(value.sourceId) && text(value.title) && value.page === 1
        && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === SOURCE_IMAGE_URL && value.sha256 === SOURCE_IMAGE_SHA256
        && text(value.alt.en) && text(value.alt.ja));
}
