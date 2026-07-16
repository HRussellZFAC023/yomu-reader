import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type { PlainStyleMatrixModel, PlainStyleMatrixPrompt, PlainStyleMatrixResponse, PlainStyleMatrixSourceVisual } from './manifest';

const VOCABULARY_SHA256 = 'eadb985342ee844a845bdb8ba0c8eeadc28d23e7e44fc05a025b65b701de9088';
const GRAMMAR_SHA256 = '87f2476a1e1f9701d058f3b761542a0caba4a9b4da9213f919c4373781d8033c';
const GENKI_SHA256 = '510418850a44517faf16d384412b5cc90f653bfe7426063cdf616723d4c62f55';
const VOCABULARY_IMAGE_SHA256 = 'c0069c4fcc3b1d31df9badbb2f4532078b02d925e2c44303c5e50408e95819f2';
const GRAMMAR_IMAGE_SHA256 = 'd8d0b2b0ff00c3e6801b4e02d97cde11382a201e85b0ea468b717a448cd9f38f';

export function validatePlainStyleMatrix(model: PlainStyleMatrixModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = []; const moodle = model.provenance?.moodle;
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'The plain-style matrix needs assessed answer support.' });
    if (model.provenance?.packageId !== 'l2-l04' || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 7011920 || moodle.vocabularySheet.payloadSha256 !== VOCABULARY_SHA256
        || moodle.grammarSheet.payloadSha256 !== GRAMMAR_SHA256
        || moodle.answerKeyBasis !== 'yomu-derived-plain-form-completion-over-verbatim-source-matrix') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 28 requires the exact Chapter 20 source sheets and explicit derived-answer provenance.' });
    }
    if (!validVisual(moodle?.vocabularySheet) || !validVisual(moodle?.grammarSheet)
        || moodle?.vocabularySheet.url !== '/academy/content/lessons/l2-l04/moodle-chapter-20-1-vocabulary-page-1.png'
        || moodle?.vocabularySheet.sha256 !== VOCABULARY_IMAGE_SHA256
        || moodle?.grammarSheet.url !== '/academy/content/lessons/l2-l04/moodle-chapter-20-1-plain-style-verb-page-3.png'
        || moodle?.grammarSheet.sha256 !== GRAMMAR_IMAGE_SHA256) {
        issues.push({ path: 'provenance.moodle.visuals', message: 'Both canonical Chapter 20 page renders must be delivered.' });
    }
    const support = model.provenance?.support;
    if (support?.minna.reference !== 'Minna no Nihongo I, Lesson 20' || support.minna.reuse !== 'sequence-only'
        || !text(support?.genki.sourceId) || support.genki.payloadSha256 !== GENKI_SHA256
        || support.genki.relation !== 'post-instruction-short-form-support-only-no-genki-task-shown') {
        issues.push({ path: 'provenance.support', message: 'Minna chronology and bounded Genki short-form support must remain explicit.' });
    }
    const prompts = model.payload?.prompts;
    if (!Array.isArray(prompts) || prompts.length !== 4 || prompts.map(prompt => prompt.sourceOrder).join(',') !== '1,2,3,4') issues.push({ path: 'payload.prompts', message: 'The matrix needs four Chapter 20 source-row prompts in order.' });
    else {
        const ids = new Set<string>(); const sources = new Set<string>(); const tags = new Set<string>();
        prompts.forEach((prompt, index) => {
            if (!text(prompt.id) || ids.has(prompt.id) || !text(prompt.sourceQuestionId) || sources.has(prompt.sourceQuestionId)
                || !text(prompt.politeForm) || !['dictionary', 'negative', 'past-negative'].includes(prompt.targetColumn)
                || prompt.options.length !== 3 || !prompt.options.some((option: PlainStyleMatrixPrompt['options'][number]) => option.id === prompt.correctOptionId)
                || !model.conceptIds.includes(prompt.conceptId) || !text(prompt.errorTag) || tags.has(prompt.errorTag) || !text(prompt.reviewExpression)) {
                issues.push({ path: `payload.prompts.${index}`, message: 'Each source row needs one bounded column choice and derived repair seed.' });
            }
            ids.add(prompt.id); sources.add(prompt.sourceQuestionId); tags.add(prompt.errorTag);
        });
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All four matrix choices are required.' });
    validateFeedback(model.payload?.feedback, issues); return issues;
}

export function gradePlainStyleMatrix(model: PlainStyleMatrixModel, response: PlainStyleMatrixResponse): GradeResult {
    const answers = parseResponse(model, response); const errors: string[] = []; let correct = 0;
    model.payload.prompts.forEach(prompt => { if (answers.get(prompt.id) === prompt.correctOptionId) correct += 1; else errors.push(prompt.errorTag); });
    return gradeFromScore(correct / model.payload.prompts.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function plainStyleMatrixReviewSeeds(model: PlainStyleMatrixModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.prompts.flatMap(prompt => result.outcome === 'lapse' && !result.errorTags.includes(prompt.errorTag) ? [] : [{
        id: `review:l2-l04:plain-matrix:${prompt.id}`, conceptId: prompt.conceptId, reason: result.outcome === 'pass' ? 'new-learning' : 'repair', sourceQuestionId: prompt.sourceQuestionId,
        content: { expression: prompt.reviewExpression, meanings: [`Yomu derived completion for Chapter 20 matrix row ${prompt.sourceOrder}`] },
    } satisfies ReviewSeed]);
}

function parseResponse(model: PlainStyleMatrixModel, response: PlainStyleMatrixResponse): ReadonlyMap<string, 'a' | 'b' | 'c'> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.prompts.length) throw new TypeError('Choose one matrix form for each Chapter 20 row.');
    const answers = new Map<string, 'a' | 'b' | 'c'>();
    response.answers.forEach(answer => { if (!model.payload.prompts.some(prompt => prompt.id === answer.promptId) || answers.has(answer.promptId) || !['a', 'b', 'c'].includes(answer.optionId)) throw new TypeError('Each Chapter 20 row needs one unique matrix choice.'); answers.set(answer.promptId, answer.optionId); });
    return answers;
}

function validVisual(value: PlainStyleMatrixSourceVisual | undefined): boolean { return Boolean(value && text(value.sourceId) && text(value.title) && text(value.url) && /^[a-f0-9]{64}$/u.test(value.sha256) && text(value.alt.en) && text(value.alt.ja)); }
