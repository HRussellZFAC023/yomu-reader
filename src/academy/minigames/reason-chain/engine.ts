import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    ReasonChainSourceVisual,
    ReasonChainModel,
    ReasonChainResponse,
    ReasonChainRound,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = 'f04f3f4e3e7fa483f5fa8f5fedc5a33c3d3be2b48eaa028de084b7c137362125';
const SOURCE_TITLE = 'Handouts/Chapter 28-2 〜し、〜し_adding similar information_giving reasons with result.pdf';
const SOURCE_VISUALS = Object.freeze([
    {
        page: 1,
        url: '/academy/content/lessons/l2-l13/moodle-chapter-28-2-shi-page-1.png',
        sha256: '4327dd0ab969ee7b0cb96673ae4d3d3cc497d76da2e4461bec2883e07b991f5d',
    },
    {
        page: 2,
        url: '/academy/content/lessons/l2-l13/moodle-chapter-28-2-shi-page-2.png',
        sha256: '5295e4d4ec26ab038abd880747cb0f46daba60cda3c0cc8ac1ce25fd62b95cc2',
    },
] as const);
const INTERACTIONS = [
    'plain-form-select', 'plain-form-select', 'plain-form-select',
    'reason-order-choice', 'reason-order-choice', 'reason-order-choice',
    'typed-chain', 'typed-chain',
] as const;

export function validateReasonChain(model: ReasonChainModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The reason chain requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l13'
        || model.provenance.packageOrder !== 40
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 8121266
        || moodle.archiveId !== 'archive-000092'
        || moodle.answerKeyBasis !== 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 38 requires the exact l2-l13 package and Chapter 28-2 shi source.' });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== 2
        || moodle.sourceSheets.some((visual, index) => !validVisual(visual, index))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'Both exact canonical Chapter 28-2 pages are required in page order.' });
    }
    if (moodle?.media.status !== 'audio-members-quarantined-unpaired'
        || moodle.media.sourceAudioMembers !== 5
        || moodle.media.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.media', message: 'All five unpaired l2-l13 audio members must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo II · Lesson 28'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== '≈ Genki II · Listing reasons and soft refusal'
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support sequence only and supply no prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 5
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'The source pattern, both uses, note, and examples must precede assessment.' });
    }
    if (model.payload?.taskHeadings?.join('|') !== [
        '1: please connect the phrases using 〜し、〜し.',
        '2: please connect the phrases using 〜し、〜し, then telling the conclusions.',
    ].join('|')) {
        issues.push({ path: 'payload.taskHeadings', message: 'Both verbatim source task headings are required.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds)
        || rounds.length !== 8
        || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4,5,6,7,8'
        || rounds.some((round, index) => round.interaction !== INTERACTIONS[index])) {
        issues.push({ path: 'payload.rounds', message: 'The eight source prompts and three interaction modes must remain in authored order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All eight chains are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeReasonChain(model: ReasonChainModel, response: ReasonChainResponse): GradeResult {
    const answers = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        const value = answers.get(round.id) ?? '';
        if (round.acceptedAnswers.some(answer => normalize(answer) === normalize(value))) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function reasonChainReviewSeeds(model: ReasonChainModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l13:reason-chain:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 28-2 source task ${round.sourceTask} item ${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: ReasonChainModel,
    round: ReasonChainRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionCount = round.interaction === 'typed-chain' ? 0 : 2;
    const expectedPage = index < 4 ? 1 : 2;
    const expectedItem = (index % 4) + 1;
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.answerValue) || !text(round.answerExpression)
        || !Array.isArray(round.acceptedAnswers) || round.acceptedAnswers.length < 1
        || !round.acceptedAnswers.some(answer => normalize(answer) === normalize(round.answerValue))
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || round.sourcePage !== expectedPage || round.sourceTask !== expectedPage || round.sourceItem !== expectedItem
        || !Array.isArray(round.options) || round.options.length !== optionCount
        || round.options.some(option => !text(option.value) || !text(option.label.en) || !text(option.label.ja))
        || (round.options.length > 0 && !round.options.some(option => normalize(option.value) === normalize(round.answerValue)))
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source pair needs one concealed completion and exactly three bilingual hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(model: ReasonChainModel, response: ReasonChainResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Complete all eight Chapter 28-2 chains.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId)
            || answers.has(answer.roundId)
            || !text(answer.value)) {
            throw new TypeError('Each Chapter 28-2 source row needs one unique response.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function validVisual(value: ReasonChainSourceVisual | undefined, index: number): boolean {
    const expected = SOURCE_VISUALS[index];
    return Boolean(value && expected && text(value.sourceId) && value.title === SOURCE_TITLE
        && value.page === expected.page && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === expected.url && value.sha256 === expected.sha256
        && text(value.alt.en) && text(value.alt.ja));
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/[\s、。・]/gu, '').trim();
}
