import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    CompletionRepairModel,
    CompletionRepairResponse,
    CompletionRepairRound,
    CompletionRepairSourceVisual,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = 'c41e4dd83224a8c29a3e6eb07e7e7955a086e3fccbf4a93a5260efaedcf4e3b8';
const SOURCE_TITLE = 'Handouts/Chapter 29-2 〜てしまいます_しまいました grammar exercise.pdf';
const SOURCE_VISUALS = Object.freeze([
    { page: 1, url: '/academy/content/lessons/l2-l15/moodle-chapter-29-2-completion-repair-page-1.png', sha256: '740c85dcc650f67e4fa84afccba19eea993e72730fdac67372daa8604299940b' },
    { page: 2, url: '/academy/content/lessons/l2-l15/moodle-chapter-29-2-completion-repair-page-2.png', sha256: 'fc529706b6821d2629b213f7269306b971c5a40c1491cc9e382814fe3d183a39' },
    { page: 3, url: '/academy/content/lessons/l2-l15/moodle-chapter-29-2-completion-repair-page-3.png', sha256: 'a126ab62a102564bb6f8d1ff807da6853009c860dc25be5434ec773afffb6983' },
    { page: 4, url: '/academy/content/lessons/l2-l15/moodle-chapter-29-2-completion-repair-page-4.png', sha256: '966e692b4e190de0d319635e84c536c1d4c2f1f1e983b36934271c3670692b98' },
    { page: 5, url: '/academy/content/lessons/l2-l15/moodle-chapter-29-2-completion-repair-page-5.png', sha256: '6f2aa526c4ff763da9fdf2773a090cfb06d860283ac35a5f046371b36b36e743' },
] as const);
const INTERACTIONS = [
    'completion-select', 'completion-select', 'typed-transform', 'typed-transform',
    'finish-first-choice', 'finish-first-choice', 'typed-regret-link', 'typed-regret-link',
] as const;
const TASKS = [1, 1, 1, 1, 3, 3, 4, 4] as const;
const ITEMS = [1, 2, 3, 4, 1, 2, 1, 2] as const;

export function validateCompletionRepair(model: CompletionRepairModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The completion repair requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l15'
        || model.provenance.packageOrder !== 42
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 8121268
        || moodle.archiveId !== 'archive-000016'
        || moodle.answerKeyBasis !== 'yomu-derived-completions-over-canonical-source-pages-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 40 requires the exact l2-l15 package and Chapter 29-2 source.' });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== 5
        || moodle.sourceSheets.some((visual, index) => !validVisual(visual, index))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All five canonical Chapter 29-2 pages are required in page order.' });
    }
    if (moodle?.media.status !== 'audio-members-quarantined-unpaired'
        || moodle.media.sourceAudioMembers !== 3
        || moodle.media.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.media', message: 'All three unpaired l2-l15 audio members must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo II · Lesson 29'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== '≈ Genki L18 (grammar overlay)'
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support sequence only and supply no prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 5
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'The completion, future-completion, and regret teaching must precede assessment.' });
    }
    const expectedHeadings = [
        '1: Following the example, please create question using 〜てしまいました.',
        '3: Following the example, please ask your classmate ‘そろそろ かえりませんか’ and decline the invitation using ‘おさきに どうぞ’, because you are determined to finish something first.',
        '4: Please create sentence to tell what you’ve done which you feel ざんねん。。。',
    ];
    if (!Array.isArray(model.payload?.taskHeadings)
        || model.payload.taskHeadings.map(heading => heading.text).join('|') !== expectedHeadings.join('|')
        || model.payload.taskHeadings.map(heading => heading.sourceTask).join(',') !== '1,3,4') {
        issues.push({ path: 'payload.taskHeadings', message: 'The three selected source task headings are required in source order.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds)
        || rounds.length !== 8
        || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4,5,6,7,8'
        || rounds.some((round, index) => round.interaction !== INTERACTIONS[index]
            || round.sourceTask !== TASKS[index] || round.sourceItem !== ITEMS[index])) {
        issues.push({ path: 'payload.rounds', message: 'The eight selected source prompts and four interaction modes must remain in authored order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All eight completion and regret responses are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeCompletionRepair(model: CompletionRepairModel, response: CompletionRepairResponse): GradeResult {
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

export function completionRepairReviewSeeds(model: CompletionRepairModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l15:completion-repair:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 29-2 source task ${round.sourceTask} item ${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: CompletionRepairModel,
    round: CompletionRepairRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionCount = round.interaction === 'completion-select' || round.interaction === 'finish-first-choice' ? 2 : 0;
    const expectedPage = round.sourceTask === 1 ? 1 : round.sourceTask === 3 ? 2 : 3;
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.answerValue) || !text(round.answerExpression)
        || !Array.isArray(round.acceptedAnswers) || round.acceptedAnswers.length < 1
        || !round.acceptedAnswers.some(answer => normalize(answer) === normalize(round.answerValue))
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || round.sourcePage !== expectedPage
        || !Array.isArray(round.options) || round.options.length !== optionCount
        || round.options.some(option => !text(option.value) || !text(option.label.en) || !text(option.label.ja))
        || (round.options.length > 0 && !round.options.some(option => normalize(option.value) === normalize(round.answerValue)))
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source prompt needs one concealed completion and exactly three bilingual hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(model: CompletionRepairModel, response: CompletionRepairResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Complete all eight Chapter 29-2 responses.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId)
            || answers.has(answer.roundId)
            || !text(answer.value)) {
            throw new TypeError('Each Chapter 29-2 source row needs one unique response.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function validVisual(value: CompletionRepairSourceVisual | undefined, index: number): boolean {
    const expected = SOURCE_VISUALS[index];
    return Boolean(value && expected && text(value.sourceId) && value.title === SOURCE_TITLE
        && value.page === expected.page && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === expected.url && value.sha256 === expected.sha256
        && text(value.alt.en) && text(value.alt.ja));
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/[\s、。・…!！?？「」『』]/gu, '').trim();
}
