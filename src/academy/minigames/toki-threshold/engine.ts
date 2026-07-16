import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    TokiThresholdModel,
    TokiThresholdResponse,
    TokiThresholdRound,
    TokiThresholdSourceVisual,
    TokiTiming,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = '7f88544f889d1c316fb911a2b67d5fe78893f6f2344e29aee25689994646c381';
const SOURCE_TITLE = 'Handouts/Chapter 23-1 〜とき_time and occasion.pdf';
const SOURCE_VISUALS = Object.freeze({
    4: {
        url: '/academy/content/lessons/l2-l10/moodle-chapter-23-1-toki-threshold-page-4.png',
        sha256: '948b81d988e549e8b51c5fcc94934eb1607fbe86097b6f4d154b63d4b07c36d6',
    },
    5: {
        url: '/academy/content/lessons/l2-l10/moodle-chapter-23-1-toki-threshold-page-5.png',
        sha256: '646ada214d1e57addc244e105a51957749edcecc897f654dedebb96ff698c187',
    },
});

export function validateTokiThreshold(model: TokiThresholdModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The toki threshold requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l10'
        || model.provenance.packageOrder !== 37
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974659
        || moodle.answerKeyBasis !== 'yomu-derived-timing-completions-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 35 requires the exact l2-l10 package and Chapter 23-1 source.' });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== 2
        || !validVisual(moodle.sourceSheets[0], 4)
        || !validVisual(moodle.sourceSheets[1], 5)) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'The exact canonical Chapter 23-1 pages 4 and 5 are required.' });
    }
    if (moodle?.audio.status !== 'quarantined-unresolved-pairing'
        || moodle.audio.sourceAudioMembers !== 4
        || moodle.audio.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.audio', message: 'All four unresolved Moodle audio members must remain quarantined.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo I · Lessons 22–23'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== '≈ Genki II · L16'
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support sequence only and supply no prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 4
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'All four verbatim teaching blocks must precede assessment.' });
    }
    if (model.payload?.taskHeading !== '7: Look at the picture below and create sentences.') {
        issues.push({ path: 'payload.taskHeading', message: 'The verbatim source task heading is required.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 4 || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4') {
        issues.push({ path: 'payload.rounds', message: 'The four selected source speech bubbles must remain in source order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All four timing thresholds are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeTokiThreshold(model: TokiThresholdModel, response: TokiThresholdResponse): GradeResult {
    const thresholds = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        if (thresholds.get(round.id) === round.correctTiming) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function tokiThresholdReviewSeeds(model: TokiThresholdModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l10:toki-threshold:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 23-1 source task 7 item ${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: TokiThresholdModel,
    round: TokiThresholdRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.beforeForm) || !text(round.afterForm)
        || (round.correctTiming !== 'before' && round.correctTiming !== 'after')
        || !text(round.answerExpression) || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || round.sourcePage !== 5 || round.sourceTask !== 7 || round.sourceItem !== round.sourceOrder
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source bubble needs before/after forms, one derived answer, and three bilingual hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(model: TokiThresholdModel, response: TokiThresholdResponse): ReadonlyMap<string, TokiTiming> {
    if (!response || !Array.isArray(response.thresholds) || response.thresholds.length !== model.payload.rounds.length) {
        throw new TypeError('Set all four Chapter 23-1 timing thresholds.');
    }
    const thresholds = new Map<string, TokiTiming>();
    response.thresholds.forEach(threshold => {
        if (!model.payload.rounds.some(round => round.id === threshold.roundId)
            || thresholds.has(threshold.roundId)
            || (threshold.timing !== 'before' && threshold.timing !== 'after')) {
            throw new TypeError('Each Chapter 23-1 source row needs one unique before-or-after threshold.');
        }
        thresholds.set(threshold.roundId, threshold.timing);
    });
    return thresholds;
}

function validVisual(value: TokiThresholdSourceVisual | undefined, page: 4 | 5): boolean {
    const expected = SOURCE_VISUALS[page];
    return Boolean(value && text(value.sourceId) && value.title === SOURCE_TITLE && value.page === page
        && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === expected.url && value.sha256 === expected.sha256
        && text(value.alt.en) && text(value.alt.ja));
}
