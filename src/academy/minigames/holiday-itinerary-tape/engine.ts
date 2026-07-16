import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type { HolidayItinerarySourceVisual, HolidayItineraryTapeModel, HolidayItineraryTapeResponse } from './manifest';

const VOCABULARY_SHA256 = '5e7880ecbaa49b880eae7d78f938bb313bbd3f1eced59ccece97a221a64f0899';
const GRAMMAR_SHA256 = '17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a';
const AUDIO_SHA256 = '6dccd9517dc4e10fb1ce3548de2c3c9d07a498f12bbf6e5b734b0e56c1490e6b';
const GENKI_SHA256 = 'c60448dea49bb12806d091d10b21890c040d2778d4df20283790e7e2c7ca2aee';
const VOCABULARY_IMAGE_SHA256 = 'edaa7f991771ccda7ff2a2a00ebffb5418234df2e0cd536c059cce532f38119e';
const GRAMMAR_IMAGE_SHA256 = '20595904296d510ed9aab10a13148c8d0c9d85e27779a637ac9cb5949dccf738';

export function validateHolidayItineraryTape(model: HolidayItineraryTapeModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'The B-22 tape needs assessed answer support.' });
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l03' || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 7011919 || moodle.vocabularySheet.payloadSha256 !== VOCABULARY_SHA256
        || moodle.grammarSheet.payloadSha256 !== GRAMMAR_SHA256 || moodle.audio.payloadSha256 !== AUDIO_SHA256
        || moodle.audio.durationSeconds !== 45.093333
        || moodle.audio.transcriptStatus !== 'audio-reviewed-speaker-pins-hidden-until-attempt'
        || moodle.answerKeyBasis !== 'source-grammar-page-three-and-audio-reviewed-speaker-pins') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 29 requires exact Sensei pages and reviewed original B-22 audio.' });
    }
    if (!validVisual(moodle?.vocabularySheet) || !validVisual(moodle?.grammarSheet)
        || moodle?.vocabularySheet.url !== '/academy/content/lessons/l2-l03/moodle-chapter-19-2-3-vocabulary-page-1.png'
        || moodle?.vocabularySheet.sha256 !== VOCABULARY_IMAGE_SHA256
        || moodle?.grammarSheet.url !== '/academy/content/lessons/l2-l03/moodle-chapter-19-2-tari-grammar-page-3.png'
        || moodle?.grammarSheet.sha256 !== GRAMMAR_IMAGE_SHA256) {
        issues.push({ path: 'provenance.moodle.visuals', message: 'Both canonical Moodle page renders must be delivered.' });
    }
    const support = model.provenance?.support;
    if (support?.minna.reference !== 'Minna no Nihongo I, Lesson 19' || support.minna.reuse !== 'sequence-only'
        || !text(support?.genki.sourceId) || support.genki.payloadSha256 !== GENKI_SHA256
        || support.genki.relation !== 'prior-form-context-only-no-genki-task-shown') {
        issues.push({ path: 'provenance.support', message: 'Minna chronology and bounded prior Genki context must remain explicit.' });
    }
    if (!Array.isArray(model.payload?.teaching) || model.payload.teaching.length !== 2
        || model.payload.teaching.some(step => !text(step.title?.en) || !text(step.title?.ja) || !text(step.pattern)
            || !text(step.instruction?.en) || !text(step.instruction?.ja))) {
        issues.push({ path: 'payload.teaching', message: 'Teach the Sensei vocabulary and grammar page before the listening tape.' });
    }
    if (!Array.isArray(model.payload?.transcript) || model.payload.transcript.length !== 9
        || model.payload.transcript.some(line => !text(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'The reviewed B-22 script must remain complete and gated until an attempt.' });
    }
    const pins = model.payload?.pins;
    if (!Array.isArray(pins) || pins.length !== 4 || pins.map(pin => pin.sourceOrder).join(',') !== '1,2,3,4') {
        issues.push({ path: 'payload.pins', message: 'The tape needs four B-22 speaker pins in reviewed order.' });
    } else {
        const ids = new Set<string>(); const sources = new Set<string>(); const tags = new Set<string>();
        pins.forEach((pin, index) => {
            if (!text(pin.id) || ids.has(pin.id) || !text(pin.sourceQuestionId) || sources.has(pin.sourceQuestionId)
                || !['speaker-a', 'speaker-b'].includes(pin.correctSpeakerId) || !model.conceptIds.includes(pin.conceptId)
                || !text(pin.errorTag) || tags.has(pin.errorTag) || !text(pin.reviewExpression)) {
                issues.push({ path: `payload.pins.${index}`, message: 'Every B-22 pin needs one reviewed speaker answer and repair seed.' });
            }
            ids.add(pin.id); sources.add(pin.sourceQuestionId); tags.add(pin.errorTag);
        });
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All four speaker pins are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeHolidayItineraryTape(model: HolidayItineraryTapeModel, response: HolidayItineraryTapeResponse): GradeResult {
    const answers = parseResponse(model, response); const errors: string[] = []; let correct = 0;
    model.payload.pins.forEach(pin => { if (answers.get(pin.id) === pin.correctSpeakerId) correct += 1; else errors.push(pin.errorTag); });
    return gradeFromScore(correct / model.payload.pins.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function holidayItineraryTapeReviewSeeds(model: HolidayItineraryTapeModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.pins.flatMap(pin => {
        if (result.outcome === 'lapse' && !result.errorTags.includes(pin.errorTag)) return [];
        return [{ id: `review:l2-l03:b22:${pin.id}`, conceptId: pin.conceptId, reason: result.outcome === 'pass' ? 'new-learning' : 'repair', sourceQuestionId: pin.sourceQuestionId, content: { expression: pin.reviewExpression, meanings: [`B-22 reviewed audio pin ${pin.sourceOrder}`] } } satisfies ReviewSeed];
    });
}

function parseResponse(model: HolidayItineraryTapeModel, response: HolidayItineraryTapeResponse): ReadonlyMap<string, 'speaker-a' | 'speaker-b'> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.pins.length) throw new TypeError('Assign each B-22 pin to exactly one speaker shelf.');
    const answers = new Map<string, 'speaker-a' | 'speaker-b'>();
    response.answers.forEach(answer => {
        if (!model.payload.pins.some(pin => pin.id === answer.pinId) || answers.has(answer.pinId) || !['speaker-a', 'speaker-b'].includes(answer.speakerId)) throw new TypeError('Each B-22 pin needs one unique speaker shelf.');
        answers.set(answer.pinId, answer.speakerId);
    });
    return answers;
}

function validVisual(value: HolidayItinerarySourceVisual | undefined): boolean {
    return Boolean(value && text(value.sourceId) && text(value.title) && text(value.url) && /^[a-f0-9]{64}$/u.test(value.sha256) && text(value.alt.en) && text(value.alt.ja));
}
