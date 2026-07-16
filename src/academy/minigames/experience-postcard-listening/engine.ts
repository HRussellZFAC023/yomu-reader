import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type { ExperiencePostcardListeningModel, ExperiencePostcardListeningResponse } from './manifest';

const LISTENING_SHA256 = 'efa1e30112ad8ec1dd606b9d74c70b0bf315896701da851a359f8c468d950b75';
const VOCABULARY_SHA256 = '34763479d18b72f20bf7618aa691b3a5d0f5855ae7f09ebd5799703b7d714097';
const AUDIO_SHA256 = '654c720b3734cb748e45cea2d9a2e6ec938668afc9d07e95451b01daa672f2db';
const GENKI_SHA256 = 'c60448dea49bb12806d091d10b21890c040d2778d4df20283790e7e2c7ca2aee';
const VOCABULARY_IMAGE_SHA256 = 'b9a76542879c20ac1e1519c4f2246bf3d16ca84e510e680e98119d41c40c3802';
const LISTENING_IMAGE_SHA256 = '70b5f991a2cc262205669d21901b2f945b5faf24e8ad41caa5134bb34f2a7414';

export function validateExperiencePostcardListening(model: ExperiencePostcardListeningModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The B-21 rail needs assessed answer support.' });
    }
    const { provenance } = model;
    if (provenance?.packageId !== 'l2-l02' || provenance.answerVisibility !== 'after-attempt'
        || provenance.moodle?.moduleId !== 7011918
        || provenance.moodle.vocabularySheet.payloadSha256 !== VOCABULARY_SHA256
        || provenance.moodle.listeningSheet.payloadSha256 !== LISTENING_SHA256
        || provenance.moodle.audio.payloadSha256 !== AUDIO_SHA256
        || provenance.moodle.audio.durationSeconds !== 127.906667
        || provenance.moodle.audio.transcriptStatus !== 'audio-reviewed-answer-keys-hidden-until-attempt'
        || provenance.moodle.answerKeyBasis !== 'source-audio-verified-picture-selections') {
        issues.push({ path: 'provenance.moodle', message: 'The B-21 activity requires the exact Sensei sheets and verified original audio.' });
    }
    if (!isSourceVisual(provenance?.moodle?.vocabularySheet)
        || !isSourceVisual(provenance?.moodle?.listeningSheet)
        || provenance.moodle.vocabularySheet.url !== '/academy/content/lessons/l2-l02/moodle-chapter-19-1-vocabulary-page-1.png'
        || provenance.moodle.vocabularySheet.sha256 !== VOCABULARY_IMAGE_SHA256
        || provenance.moodle.listeningSheet.url !== '/academy/content/lessons/l2-l02/moodle-chapter-19-listening-page-1.png'
        || provenance.moodle.listeningSheet.sha256 !== LISTENING_IMAGE_SHA256) {
        issues.push({ path: 'provenance.moodle.visuals', message: 'Both canonical Moodle page renders must be delivered.' });
    }
    if (provenance?.support?.minna.reference !== 'Minna no Nihongo I, Lesson 19'
        || provenance.support.minna.reuse !== 'sequence-only'
        || !text(provenance.support.genki.sourceId)
        || provenance.support.genki.payloadSha256 !== GENKI_SHA256
        || provenance.support.genki.relation !== 'post-instruction-experience-form-support-only') {
        issues.push({ path: 'provenance.support', message: 'Minna chronology and Genki post-instruction support must remain bounded.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching.some(step => !text(step.title?.en) || !text(step.title?.ja) || !text(step.pattern)
            || !text(step.instruction?.en) || !text(step.instruction?.ja))) {
        issues.push({ path: 'payload.teaching', message: 'Teach the source vocabulary and experience frame before the listening rail.' });
    }
    const prompts = model.payload?.prompts;
    if (!Array.isArray(prompts) || prompts.length !== 3 || prompts.map(prompt => prompt.sourceOrder).join(',') !== '1,2,3') {
        issues.push({ path: 'payload.prompts', message: 'The rail needs the three B-21 picture prompts in source order.' });
    } else {
        const ids = new Set<string>(); const sources = new Set<string>(); const tags = new Set<string>();
        prompts.forEach((prompt, index) => {
            if (!text(prompt.id) || ids.has(prompt.id) || !text(prompt.sourceQuestionId) || sources.has(prompt.sourceQuestionId)
                || !['a', 'b', 'c'].includes(prompt.correctOptionId) || !model.conceptIds.includes(prompt.conceptId)
                || !text(prompt.errorTag) || tags.has(prompt.errorTag) || !text(prompt.reviewExpression)) {
                issues.push({ path: `payload.prompts.${index}`, message: 'Every B-21 stop needs one exact source question and deterministic hidden answer.' });
            }
            ids.add(prompt.id); sources.add(prompt.sourceQuestionId); tags.add(prompt.errorTag);
        });
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All three source selections are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeExperiencePostcardListening(model: ExperiencePostcardListeningModel, response: ExperiencePostcardListeningResponse): GradeResult {
    const answers = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.prompts.forEach(prompt => {
        if (answers.get(prompt.id) === prompt.correctOptionId) correct += 1;
        else errors.push(prompt.errorTag);
    });
    return gradeFromScore(correct / model.payload.prompts.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function experiencePostcardListeningReviewSeeds(model: ExperiencePostcardListeningModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.prompts.flatMap(prompt => {
        if (result.outcome === 'lapse' && !result.errorTags.includes(prompt.errorTag)) return [];
        return [{
            id: `review:l2-l02:b21:${prompt.id}`,
            conceptId: prompt.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: prompt.sourceQuestionId,
            content: { expression: prompt.reviewExpression, meanings: [`B-21 source prompt ${prompt.sourceOrder}`] },
        } satisfies ReviewSeed];
    });
}

function parseResponse(model: ExperiencePostcardListeningModel, response: ExperiencePostcardListeningResponse): ReadonlyMap<string, 'a' | 'b' | 'c'> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.prompts.length) {
        throw new TypeError('Choose one neutral postcard marker for each B-21 source prompt.');
    }
    const answers = new Map<string, 'a' | 'b' | 'c'>();
    response.answers.forEach(answer => {
        if (!model.payload.prompts.some(prompt => prompt.id === answer.promptId) || answers.has(answer.promptId)
            || !['a', 'b', 'c'].includes(answer.optionId)) throw new TypeError('Each B-21 source prompt needs one A, B, or C marker.');
        answers.set(answer.promptId, answer.optionId);
    });
    return answers;
}

function isSourceVisual(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const visual = value as { sourceId?: unknown; title?: unknown; url?: unknown; sha256?: unknown; alt?: { en?: unknown; ja?: unknown } };
    return Boolean(text(visual.sourceId) && text(visual.title) && text(visual.url) && /^[a-f0-9]{64}$/u.test(String(visual.sha256 ?? ''))
        && text(visual.alt?.en) && text(visual.alt?.ja));
}
