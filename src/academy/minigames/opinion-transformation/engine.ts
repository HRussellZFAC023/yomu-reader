import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    OpinionTransformationModel,
    OpinionTransformationResponse,
    OpinionTransformationRound,
    OpinionTransformationSourceVisual,
} from './manifest';

const VOCABULARY_SHA256 = '32097fd886f557806cbecf84e943bf8b0b919ff32c6367ba4fddab5c88b11283';
const GRAMMAR_SHA256 = '837cd9f8468d50c09902520d196089dc84ee4d435a5e1b7b654c346e9e9d701f';
const VOCABULARY_IMAGE_SHA256 = 'a0137ffaab518de2a37d783c5c02c4efe8d719cbe2c8647e186e55e35a00a02f';
const TEACHING_IMAGE_SHA256 = 'dc138ddbfe0ff40495511a961485f03767ffae7afada9e5886e922809a48dcdb';
const TASK_IMAGE_SHA256 = '9c93bc53a77ebb3b3cf2a5013400240acfda5b856773c9d14c13be763c9627d9';

export function validateOpinionTransformation(model: OpinionTransformationModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The opinion transformation requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l06'
        || model.provenance.packageOrder !== 33
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974652
        || moodle.vocabularySheet.payloadSha256 !== VOCABULARY_SHA256
        || moodle.teachingSheet.payloadSha256 !== GRAMMAR_SHA256
        || moodle.taskSheet.payloadSha256 !== GRAMMAR_SHA256
        || moodle.answerKeyBasis !== 'yomu-derived-plain-form-transformations-over-verbatim-source-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 31 requires the exact l2-l06 package and Sensei Chapter 21 pages.' });
    }
    if (!validVisual(moodle?.vocabularySheet, 1, '/academy/content/lessons/l2-l06/moodle-chapter-21-1-vocabulary-page-1.png', VOCABULARY_IMAGE_SHA256)
        || !validVisual(moodle?.teachingSheet, 1, '/academy/content/lessons/l2-l06/moodle-chapter-21-opinion-teaching-page-1.png', TEACHING_IMAGE_SHA256)
        || !validVisual(moodle?.taskSheet, 2, '/academy/content/lessons/l2-l06/moodle-chapter-21-opinion-task-page-2.png', TASK_IMAGE_SHA256)) {
        issues.push({ path: 'provenance.moodle.visuals', message: 'All three canonical Chapter 21 source renders are required.' });
    }
    if (moodle?.audio.status !== 'quarantined-unresolved-pairing'
        || moodle.audio.sourceAudioMembers !== 2
        || moodle.audio.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.audio', message: 'The two unresolved Moodle audio members must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo I, Lesson 21'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== 'none-verified'
        || model.provenance.support.genki.reuse !== 'none') {
        issues.push({ path: 'provenance.support', message: 'Minna is scope-only and no Genki crosswalk may be invented.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 2
        || model.payload.teaching.some(step => !text(step.title?.en) || !text(step.title?.ja)
            || !text(step.pattern) || !text(step.instruction?.en) || !text(step.instruction?.ja))) {
        issues.push({ path: 'payload.teaching', message: 'Teach the exact Chapter 21 plain-clause frame before assessment.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 5 || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4,5') {
        issues.push({ path: 'payload.rounds', message: 'The five source transformations must remain in source order.' });
    } else {
        const ids = new Set<string>();
        const sources = new Set<string>();
        const tags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sources, tags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All five source transformations are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeOpinionTransformation(
    model: OpinionTransformationModel,
    response: OpinionTransformationResponse,
): GradeResult {
    const answers = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        if (round.acceptedAnswers.some(answer => normalize(answer) === normalize(answers.get(round.id) ?? ''))) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function opinionTransformationReviewSeeds(
    model: OpinionTransformationModel,
    result: GradeResult,
): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l06:opinion:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 21 supposition transformation ${round.sourceOrder}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: OpinionTransformationModel,
    round: OpinionTransformationRound,
    index: number,
    ids: Set<string>,
    sources: Set<string>,
    tags: Set<string>,
    issues: ValidationIssue[],
): void {
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sources.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.answerExpression)
        || !Array.isArray(round.acceptedAnswers) || !round.acceptedAnswers.length
        || !round.acceptedAnswers.some(answer => normalize(answer) === normalize(round.answerExpression))
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || tags.has(round.errorTag)
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source row needs exact wording, a derived completion, and three bilingual repair hints.' });
    }
    ids.add(round.id);
    sources.add(round.sourceQuestionId);
    tags.add(round.errorTag);
}

function parseResponse(
    model: OpinionTransformationModel,
    response: OpinionTransformationResponse,
): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Complete all five Chapter 21 transformations.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId)
            || answers.has(answer.roundId) || !text(answer.value)) {
            throw new TypeError('Each Chapter 21 source row needs one unique response.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function validVisual(
    value: OpinionTransformationSourceVisual | undefined,
    page: number,
    url: string,
    sha256: string,
): boolean {
    return Boolean(value && text(value.sourceId) && text(value.title) && value.page === page
        && value.url === url && value.sha256 === sha256 && /^[a-f0-9]{64}$/u.test(value.payloadSha256)
        && text(value.alt.en) && text(value.alt.ja));
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/[\s。．.、]/gu, '').toLocaleLowerCase('ja');
}
