import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type { ListeningHingeModel, ListeningHingeResponse, ListeningHingeSourceVisual } from './manifest';

const VOCABULARY_SHA256 = 'b2835af1a2c829c0c1827ca1cf4518e0f58e05c2219aa59a5f1d64d5aacb8128';
const LISTENING_SHEET_SHA256 = 'a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd';
const AUDIO_SHA256 = 'f39560e74390378765a07f94dd19d1d4f0595935dbef04ffebcf37b10e485df2';
const GENKI_SHA256 = '510418850a44517faf16d384412b5cc90f653bfe7426063cdf616723d4c62f55';
const VOCABULARY_IMAGE_SHA256 = '0981cc1579d4cde558ecec3f68dc385e72cc50a09fee38c7d54e36aa1edd6e5c';
const LISTENING_IMAGE_SHA256 = 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975';

export function validateListeningHinge(model: ListeningHingeModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'The B-24 hinge needs assessed answer support.' });
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l05' || model.provenance.answerVisibility !== 'after-attempt' || moodle?.moduleId !== 6974651 || moodle.vocabularySheet.payloadSha256 !== VOCABULARY_SHA256 || moodle.listeningSheet.payloadSha256 !== LISTENING_SHEET_SHA256 || moodle.audio.payloadSha256 !== AUDIO_SHA256 || moodle.audio.durationSeconds !== 82.56 || moodle.audio.transcriptStatus !== 'audio-reviewed-b24-choice-pairing-hidden-until-attempt' || moodle.answerKeyBasis !== 'source-worksheet-prompts-and-audio-reviewed-b24-choices') issues.push({ path: 'provenance.moodle', message: 'Lesson 30 requires exact Sensei pages and reviewed original B-24 audio.' });
    if (!validVisual(moodle?.vocabularySheet) || !validVisual(moodle?.listeningSheet) || moodle?.vocabularySheet.url !== '/academy/content/lessons/l2-l05/moodle-chapter-20-2-vocabulary-page-1.png' || moodle?.vocabularySheet.sha256 !== VOCABULARY_IMAGE_SHA256 || moodle?.listeningSheet.url !== '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png' || moodle?.listeningSheet.sha256 !== LISTENING_IMAGE_SHA256) issues.push({ path: 'provenance.moodle.visuals', message: 'Both canonical Chapter 20 pages must be delivered.' });
    const support = model.provenance?.support;
    if (support?.minna.reference !== 'Minna no Nihongo I, Lesson 20' || support.minna.reuse !== 'sequence-only' || !text(support?.genki.sourceId) || support.genki.payloadSha256 !== GENKI_SHA256 || support.genki.relation !== 'prior-short-form-context-only-no-genki-task-shown') issues.push({ path: 'provenance.support', message: 'Minna chronology and bounded Genki short-form context must remain explicit.' });
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2 || model.payload.teaching.some(step => !text(step.title?.en) || !text(step.title?.ja) || !text(step.pattern) || !text(step.instruction?.en) || !text(step.instruction?.ja))) issues.push({ path: 'payload.teaching', message: 'Teach the Sensei vocabulary and B-24 sheet before listening.' });
    const prompts = model.payload?.prompts;
    if (!Array.isArray(prompts) || prompts.length !== 3 || prompts.map(prompt => prompt.sourceOrder).join(',') !== '1,2,3') issues.push({ path: 'payload.prompts', message: 'The hinge needs three B-24 source choices in order.' });
    else {
        const ids = new Set<string>(); const sources = new Set<string>(); const tags = new Set<string>();
        prompts.forEach((prompt, index) => { if (!text(prompt.id) || ids.has(prompt.id) || !text(prompt.sourceQuestionId) || sources.has(prompt.sourceQuestionId) || !['left', 'right'].includes(prompt.correctOptionId) || !model.conceptIds.includes(prompt.conceptId) || !text(prompt.errorTag) || tags.has(prompt.errorTag) || !text(prompt.reviewExpression)) issues.push({ path: `payload.prompts.${index}`, message: 'Each B-24 hinge needs one reviewed choice and repair seed.' }); ids.add(prompt.id); sources.add(prompt.sourceQuestionId); tags.add(prompt.errorTag); });
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All three B-24 choices are required.' });
    validateFeedback(model.payload?.feedback, issues); return issues;
}

export function gradeListeningHinge(model: ListeningHingeModel, response: ListeningHingeResponse): GradeResult { const answers = parseResponse(model, response); const errors: string[] = []; let correct = 0; model.payload.prompts.forEach(prompt => { if (answers.get(prompt.id) === prompt.correctOptionId) correct += 1; else errors.push(prompt.errorTag); }); return gradeFromScore(correct / model.payload.prompts.length, model.payload.passScore, errors.sort(), model.payload.feedback); }
export function listeningHingeReviewSeeds(model: ListeningHingeModel, result: GradeResult): readonly ReviewSeed[] { return model.payload.prompts.flatMap(prompt => result.outcome === 'lapse' && !result.errorTags.includes(prompt.errorTag) ? [] : [{ id: `review:l2-l05:b24:${prompt.id}`, conceptId: prompt.conceptId, reason: result.outcome === 'pass' ? 'new-learning' : 'repair', sourceQuestionId: prompt.sourceQuestionId, content: { expression: prompt.reviewExpression, meanings: [`B-24 reviewed choice ${prompt.sourceOrder}`] } } satisfies ReviewSeed]); }
function parseResponse(model: ListeningHingeModel, response: ListeningHingeResponse): ReadonlyMap<string, 'left' | 'right'> { if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.prompts.length) throw new TypeError('Set each B-24 hinge to one side.'); const answers = new Map<string, 'left' | 'right'>(); response.answers.forEach(answer => { if (!model.payload.prompts.some(prompt => prompt.id === answer.promptId) || answers.has(answer.promptId) || !['left', 'right'].includes(answer.optionId)) throw new TypeError('Each B-24 hinge needs one unique side.'); answers.set(answer.promptId, answer.optionId); }); return answers; }
function validVisual(value: ListeningHingeSourceVisual | undefined): boolean { return Boolean(value && text(value.sourceId) && text(value.title) && text(value.url) && /^[a-f0-9]{64}$/u.test(value.sha256) && text(value.alt.en) && text(value.alt.ja)); }
