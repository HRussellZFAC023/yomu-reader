import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, normalizeJapanese, text, validateFeedback } from '../activity-kit/shared';
import type { ConversationListeningCheckModel, ConversationListeningCheckResponse, ConversationListeningTask } from './manifest';

const WORKSHEET_SHA256 = '01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280';
const WORKSHEET_IMAGE_SHA256 = 'ad13d146b8e82ad147870d90a1e47c0f8a43b96ac306e6bc869410dc616f2cb1';
const SCRIPT_SHA256 = '359fa7af358cf5bfbe429806569cc3d885369d23d03546809a65eec2dbdb63e8';
const AUDIO_SHA256 = 'f423d074fd31d9efaf34b359c71fde870abc71b850379af3a526758cee9b5d30';

const EXACT_SOURCE_CONTRACTS = {
    'minna-069-conversation-comprehension': {
        packageId: 'l2-l05', moduleId: 6974651, taskCount: 5, transcriptCount: 11,
        worksheetSha256: WORKSHEET_SHA256, worksheetImageSha256: WORKSHEET_IMAGE_SHA256,
        worksheetTitle: 'Handouts/New_Chapter 20_Conversation listening.pdf',
        worksheetUrl: '/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png',
        supportSha256: SCRIPT_SHA256,
        supportTitle: 'Homework/Please review_Chapter 20_Conversation listening Script.pdf',
        supportRole: 'reviewed-transcript',
        audioSha256: AUDIO_SHA256, locator: 'academy/content/minna/audio/l2-l05-minna-069.mp3',
        audioUrl: '/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3',
        durationSeconds: 32.1045, label: 'Minna no Nihongo track 069',
        answerKeyBasis: 'source-worksheet-questions-script-and-exact-minna-069-recording',
    },
    'minna-072-conversation-comprehension': {
        packageId: 'l2-l06', moduleId: 6974652, taskCount: 4, transcriptCount: 13,
        worksheetSha256: 'bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0',
        worksheetImageSha256: '7ea8c8ebe329839341b3fbcea6f374bdde694295e44e19fca698db5dc04207ad',
        worksheetTitle: 'Handouts/Chapter 21_Conversation listening.pdf',
        worksheetUrl: '/academy/content/lessons/l2-l06/moodle-chapter-21-conversation-page-1.png',
        supportSha256: 'b49f9fb9498eebf9f709262116b64c2488a6d11f7aaf866e798ca5e0d95e548f',
        supportTitle: 'Handouts/Chapter 21 grammar point_Conversation listening Script.pdf',
        supportRole: 'vocabulary-and-grammar-support',
        audioSha256: '71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c',
        locator: 'academy/content/minna/audio/l2-l06-minna-072.mp3',
        audioUrl: '/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3',
        durationSeconds: 50.18125, label: 'Minna no Nihongo track 072',
        answerKeyBasis: 'source-worksheet-questions-and-audio-reviewed-exact-minna-072-recording',
    },
    'minna-075-conversation-comprehension': {
        packageId: 'l2-l09', moduleId: 6974657, taskCount: 4, transcriptCount: 13,
        worksheetSha256: 'c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0',
        worksheetImageSha256: 'b28a169dac64414fd20e35345e9f5f4e8f5d4261c1a78b396f35542de9c12105',
        worksheetTitle: 'Homework/HW Chapter 22_Conversation listening.pdf',
        worksheetUrl: '/academy/content/lessons/l2-l09/moodle-chapter-22-conversation-page-1.png',
        supportSha256: 'c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0',
        supportTitle: 'Homework/HW Chapter 22_Conversation listening.pdf',
        supportRole: 'worksheet-and-audio-review',
        audioSha256: '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834',
        locator: 'academy/content/minna/audio/l2-l09-minna-075.mp3',
        audioUrl: '/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3',
        durationSeconds: 43.232667, label: 'Minna no Nihongo track 075',
        answerKeyBasis: 'source-worksheet-questions-and-audio-reviewed-exact-minna-075-recording',
    },
} as const;

export function validateConversationListeningCheck(model: ConversationListeningCheckModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const moodle = model.provenance?.moodle;
    const contract = EXACT_SOURCE_CONTRACTS[model.responseKind];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) issues.push({ path: 'answerSupport', message: 'Assessed answer support is required.' });
    if (!contract || model.provenance?.packageId !== contract.packageId || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== contract.moduleId
        || moodle.worksheet?.payloadSha256 !== contract.worksheetSha256
        || moodle.worksheet.title !== contract.worksheetTitle
        || moodle.worksheet.page !== 1
        || moodle.worksheet.url !== contract.worksheetUrl
        || moodle.worksheet.sha256 !== contract.worksheetImageSha256
        || moodle.support?.payloadSha256 !== contract.supportSha256
        || moodle.support.title !== contract.supportTitle
        || moodle.support.page !== 1
        || moodle.support.role !== contract.supportRole
        || moodle.audio?.payloadSha256 !== contract.audioSha256
        || moodle.audio.locator !== contract.locator
        || moodle.audio.url !== contract.audioUrl
        || moodle.audio.durationSeconds !== contract.durationSeconds
        || moodle.audio.label !== contract.label
        || moodle.answerKeyBasis !== contract.answerKeyBasis) {
        issues.push({ path: 'provenance.moodle', message: 'The exact worksheet, reviewed support, and matching Minna recording are required.' });
    }
    if (!text(model.payload?.sourceCaption?.ja) || !text(model.payload?.sourceCaption?.en)) issues.push({ path: 'payload.sourceCaption', message: 'A bilingual source caption is required.' });
    const tasks: readonly ConversationListeningTask[] | undefined = model.payload?.tasks;
    if (!tasks || !contract || tasks.length !== contract.taskCount
        || tasks.some((task, index) => task.sourceOrder !== index + 1)) {
        issues.push({ path: 'payload.tasks', message: 'Every conversation question is required in source order.' });
    } else {
        const ids = new Set<string>();
        tasks.forEach((task, index) => {
            if (!text(task.id) || ids.has(task.id) || !text(task.sourceQuestionId) || !text(task.prompt)
                || !text(task.answer) || !Array.isArray(task.acceptedAnswers) || task.acceptedAnswers.length === 0
                || task.acceptedAnswers.some(answer => !text(answer))
                || !task.acceptedAnswers.some(answer => normalizeJapanese(answer) === normalizeJapanese(task.answer))
                || !model.conceptIds.includes(task.conceptId) || !text(task.errorTag) || !text(task.reviewExpression)) {
                issues.push({ path: `payload.tasks.${index}`, message: 'Every conversation question needs a canonical answer and reviewed accepted forms.' });
            }
            ids.add(task.id);
        });
    }
    if (!Array.isArray(model.payload?.transcript) || !contract || model.payload.transcript.length !== contract.transcriptCount
        || model.payload.transcript.some(line => !text(line.speaker) || !text(line.text))) {
        issues.push({ path: 'payload.transcript', message: 'The reviewed source transcript is required after an attempt.' });
    }
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeConversationListeningCheck(model: ConversationListeningCheckModel, response: ConversationListeningCheckResponse): GradeResult {
    const answers = parseResponse(model, response);
    const errors = model.payload.tasks.flatMap(task => task.acceptedAnswers.some(answer => (
        normalizeJapanese(answer) === answers.get(task.id)
    )) ? [] : [task.errorTag]);
    return gradeFromScore((model.payload.tasks.length - errors.length) / model.payload.tasks.length, 1, errors, model.payload.feedback);
}

export function conversationListeningCheckReviewSeeds(model: ConversationListeningCheckModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.tasks.flatMap(task => {
        if (result.outcome === 'lapse' && !result.errorTags.includes(task.errorTag)) return [];
        return [{
            id: `review:${model.provenance.packageId}:${model.responseKind}:${task.id}`,
            conceptId: task.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: task.sourceQuestionId,
            content: { expression: task.reviewExpression, meanings: [task.answer], sentence: task.prompt },
        } satisfies ReviewSeed];
    });
}

function parseResponse(model: ConversationListeningCheckModel, response: ConversationListeningCheckResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.tasks.length) {
        throw new TypeError('Every exact Minna conversation question needs one response.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        const task = model.payload.tasks.find(candidate => candidate.id === answer.taskId);
        if (!task || answers.has(task.id) || typeof answer.value !== 'string' || !answer.value.trim()) {
            throw new TypeError('Minna conversation responses must address each source question once.');
        }
        answers.set(task.id, normalizeJapanese(answer.value));
    });
    return answers;
}
