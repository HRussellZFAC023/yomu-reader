import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    NagaraSourceVisual,
    NagaraWorkshopModel,
    NagaraWorkshopResponse,
    NagaraWorkshopRound,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = 'b5a1d39c3306a5e7b1c55b108d906bdbf697caea45bdb28746cf5661e772bf48';
const SOURCE_TITLE = 'Handouts/Chapter 28-1 〜ながら_grammar_exercise.pdf';
const SOURCE_VISUALS = Object.freeze([
    {
        page: 1,
        url: '/academy/content/lessons/l2-l12/moodle-chapter-28-1-nagara-page-1.png',
        sha256: 'a0e5167eafeacd2316aa60681c14d4de5da5eb8970b3198f335d441d8b3f088f',
    },
    {
        page: 2,
        url: '/academy/content/lessons/l2-l12/moodle-chapter-28-1-nagara-page-2.png',
        sha256: 'c21841db30455c7bd40b0a8b05382d53e17e857b3d9518e830b88887a18dd241',
    },
] as const);
const INTERACTIONS = ['stem-select', 'stem-select', 'main-clause-choice', 'main-clause-choice', 'typed-join', 'typed-join'] as const;

export function validateNagaraWorkshop(model: NagaraWorkshopModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The nagara workshop requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l12'
        || model.provenance.packageOrder !== 39
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 8121261
        || moodle.archiveId !== 'archive-000032'
        || moodle.answerKeyBasis !== 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 37 requires the exact l2-l12 package and Chapter 28-1 nagara source.' });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== 2
        || moodle.sourceSheets.some((visual, index) => !validVisual(visual, index))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'Both exact canonical Chapter 28-1 pages are required in page order.' });
    }
    if (moodle?.media.status !== 'audio-members-quarantined-unpaired'
        || moodle.media.sourceAudioMembers !== 4
        || moodle.media.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.media', message: 'All four unpaired l2-l12 audio members must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo II · Lesson 28'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== '≈ Genki II · Simultaneous actions and routines'
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support sequence only and supply no prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 4
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'The source pattern, two rules, and six examples must precede assessment.' });
    }
    if (model.payload?.taskHeading !== '2: please change two sentences to one long sentence.') {
        issues.push({ path: 'payload.taskHeading', message: 'The verbatim source task 2 heading is required.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds)
        || rounds.length !== 6
        || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4,5,6'
        || rounds.some((round, index) => round.interaction !== INTERACTIONS[index])) {
        issues.push({ path: 'payload.rounds', message: 'The six source pairs and three interaction modes must remain in authored order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All six joins are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeNagaraWorkshop(model: NagaraWorkshopModel, response: NagaraWorkshopResponse): GradeResult {
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

export function nagaraWorkshopReviewSeeds(model: NagaraWorkshopModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l12:nagara-workshop:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 28-1 source task 2 item ${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: NagaraWorkshopModel,
    round: NagaraWorkshopRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionCount = round.interaction === 'typed-join' ? 0 : 2;
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.answerValue) || !text(round.answerExpression)
        || !Array.isArray(round.acceptedAnswers) || round.acceptedAnswers.length < 1
        || !round.acceptedAnswers.some(answer => normalize(answer) === normalize(round.answerValue))
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || round.sourcePage !== 1 || round.sourceTask !== 2 || round.sourceItem !== round.sourceOrder
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

function parseResponse(model: NagaraWorkshopModel, response: NagaraWorkshopResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Complete all six Chapter 28-1 joins.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId)
            || answers.has(answer.roundId)
            || !text(answer.value)) {
            throw new TypeError('Each Chapter 28-1 source row needs one unique response.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function validVisual(value: NagaraSourceVisual | undefined, index: number): boolean {
    const expected = SOURCE_VISUALS[index];
    return Boolean(value && expected && text(value.sourceId) && value.title === SOURCE_TITLE
        && value.page === expected.page && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === expected.url && value.sha256 === expected.sha256
        && text(value.alt.en) && text(value.alt.ja));
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/[\s、。・]/gu, '').trim();
}
