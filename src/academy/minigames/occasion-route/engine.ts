import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    OccasionRouteModel,
    OccasionRouteMode,
    OccasionRouteResponse,
    OccasionRouteRound,
    OccasionRouteSourceVisual,
} from './manifest';

const SOURCE_PAYLOAD_SHA256 = 'f3c29a4d4a9ffd140494c10a8908de1f09aa6387f2172ab8edd65749fd1b3533';
const SOURCE_TITLE = 'Handouts/New_Chapter 23-1 〜とき_time and occasion.pdf';
const SOURCE_VISUAL = Object.freeze({
    url: '/academy/content/lessons/l2-l11/moodle-new-chapter-23-1-toki-page-1.png',
    sha256: 'ad277c6188de6603a9cd2fcb3ba33263dd12ddf88340f9c3b79c71bc585fd890',
});

export function validateOccasionRoute(model: OccasionRouteModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The occasion route requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== 'l2-l11'
        || model.provenance.packageOrder !== 38
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== 6974661
        || moodle.answerKeyBasis !== 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts') {
        issues.push({ path: 'provenance.moodle', message: 'Lesson 36 requires the exact l2-l11 package and Moodle Chapter 23-1 source.' });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== 1
        || !validVisual(moodle.sourceSheets[0])) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'The exact canonical Chapter 23-1 page 1 is required.' });
    }
    if (moodle?.media.status !== 'no-audio-members-in-package'
        || moodle.media.sourceAudioMembers !== 0
        || moodle.media.sourceAudioTracksDelivered !== 0) {
        issues.push({ path: 'provenance.moodle.media', message: 'The l2-l11 package has no Moodle audio members to deliver.' });
    }
    if (model.provenance?.support.minna.reference !== 'Minna no Nihongo I · Lessons 20, 23 and 25'
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== '≈ Genki II · L17'
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support sequence only and supply no prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== 3
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'All three verbatim teaching blocks must precede assessment.' });
    }
    if (model.payload?.taskHeading !== '1-1: Using 〜とき, change the sentences to one sentence.') {
        issues.push({ path: 'payload.taskHeading', message: 'The verbatim source task heading is required.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 4 || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4') {
        issues.push({ path: 'payload.rounds', message: 'The four source sentence pairs must remain in source order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All four occasion routes are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeOccasionRoute(model: OccasionRouteModel, response: OccasionRouteResponse): GradeResult {
    const routes = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        if (routes.get(round.id) === round.correctMode) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function occasionRouteReviewSeeds(model: OccasionRouteModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:l2-l11:occasion-route:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei Chapter 23-1 source task 1-1 item ${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: OccasionRouteModel,
    round: OccasionRouteRound,
    index: number,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.affirmativeClause) || !text(round.negativeClause)
        || !text(round.mainClause) || (round.correctMode !== 'affirmative' && round.correctMode !== 'negative')
        || !text(round.answerExpression) || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || round.sourcePage !== 1 || round.sourceTask !== '1-1' || round.sourceItem !== round.sourceOrder
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source pair needs two routes, one derived completion, and three bilingual hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(model: OccasionRouteModel, response: OccasionRouteResponse): ReadonlyMap<string, OccasionRouteMode> {
    if (!response || !Array.isArray(response.routes) || response.routes.length !== model.payload.rounds.length) {
        throw new TypeError('Set all four Chapter 23-1 occasion routes.');
    }
    const routes = new Map<string, OccasionRouteMode>();
    response.routes.forEach(route => {
        if (!model.payload.rounds.some(round => round.id === route.roundId)
            || routes.has(route.roundId)
            || (route.mode !== 'affirmative' && route.mode !== 'negative')) {
            throw new TypeError('Each Chapter 23-1 source row needs one unique affirmative-or-negative route.');
        }
        routes.set(route.roundId, route.mode);
    });
    return routes;
}

function validVisual(value: OccasionRouteSourceVisual | undefined): boolean {
    return Boolean(value && text(value.sourceId) && value.title === SOURCE_TITLE && value.page === 1
        && value.payloadSha256 === SOURCE_PAYLOAD_SHA256
        && value.url === SOURCE_VISUAL.url && value.sha256 === SOURCE_VISUAL.sha256
        && text(value.alt.en) && text(value.alt.ja));
}
