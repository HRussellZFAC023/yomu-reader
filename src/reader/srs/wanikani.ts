import type { CardState, JPDBMeaning } from '../app/types';
import { WanikaniApiError, WanikaniClient } from '../wanikani/wanikani';
import { parseWanikaniSubject, primaryReading, subjectsWithinLevel, type WanikaniSubject } from '../wanikani/wanikani-subjects';
import type {
    YomuSrsAdapter,
    YomuSrsMiningRequest,
    YomuSrsMiningResult,
    YomuSrsQueueSnapshot,
    YomuSrsReviewRequest,
    YomuSrsReviewResult,
    YomuSrsReviewable,
    YomuSrsStatsSnapshot,
} from './types';

const WANIKANI_DASHBOARD_URL = 'https://www.wanikani.com/dashboard';

interface WanikaniAssignment {
    id: number;
    subjectId: number;
    subjectType: string;
    srsStage: number;
    availableAt: string | null;
    startedAt: string | null;
    burnedAt: string | null;
    unlockedAt: string | null;
}

export function createWanikaniSrsAdapter(client: WanikaniClient): YomuSrsAdapter {
    return {
        id: 'wanikani',
        label: 'WaniKani',
        capabilities: { stats: true, queue: true, review: true, mine: false, import: false },
        hasCredential: () => client.hasCredential(),
        // /user must be verified before anything else is trusted or fetched.
        verify: () => client.getUser().then(() => true, () => false),
        stats: () => wanikaniStats(client),
        queue: limit => wanikaniQueue(client, limit),
        review: request => reviewWanikaniCard(client, request),
        mine: () => Promise.reject(new WanikaniApiError('WaniKani has no API to add arbitrary words; only due reviews can be graded from Yomu.')),
    };
}

async function wanikaniStats(client: WanikaniClient): Promise<YomuSrsStatsSnapshot> {
    await client.getUser();
    // WaniKani has no aggregate endpoint for stage counts. Walking every
    // assignment for a level-60 account can consume dozens of paginated API
    // calls and block due reviews/definition lookups behind the 60 rpm limit.
    // The summary endpoint provides the actionable dashboard number without
    // turning a stats refresh into a full-account crawl.
    const summary = await client.getSummary();
    return {
        providerId: 'wanikani',
        fetchedAt: Date.now(),
        reviewsDue: summaryDueCount(summary),
        levelCounts: {},
        raw: summary,
    };
}

async function wanikaniQueue(client: WanikaniClient, limit = 50): Promise<YomuSrsQueueSnapshot> {
    await client.getUser();
    const maxLevel = await client.effectiveMaxLevel();
    const summary = await client.getSummary();
    const dueSubjectIds = summaryDueSubjectIds(summary);
    const assignments = dueSubjectIds.size
        ? await client.getAssignments({ subjectIds: [...dueSubjectIds], immediatelyAvailableForReview: true })
        : [];
    const parsedAssignments = parseAssignments(assignments)
        .filter(assignment => dueSubjectIds.has(assignment.subjectId))
        .slice(0, Math.max(0, Math.floor(limit)));
    if (!parsedAssignments.length) {
        return { providerId: 'wanikani', fetchedAt: Date.now(), cards: [], dueCount: 0, newCount: 0, reviewCount: 0 };
    }
    const rawSubjects = await client.getSubjects({ ids: parsedAssignments.map(assignment => assignment.subjectId) });
    const subjectById = new Map<number, WanikaniSubject>();
    for (const raw of rawSubjects) {
        const subject = parseWanikaniSubject(raw);
        if (subject) subjectById.set(subject.id, subject);
    }
    const allowedSubjects = new Set(subjectsWithinLevel([...subjectById.values()], maxLevel).map(subject => subject.id));
    const cards = parsedAssignments
        .filter(assignment => allowedSubjects.has(assignment.subjectId))
        .map(assignment => reviewableFromAssignment(assignment, subjectById.get(assignment.subjectId)))
        .filter((card): card is YomuSrsReviewable => card !== null);
    return {
        providerId: 'wanikani',
        fetchedAt: Date.now(),
        cards,
        dueCount: cards.length,
        newCount: cards.filter(card => card.state.includes('new')).length,
        reviewCount: cards.length,
    };
}

// fallow-ignore-next-line complexity
function reviewableFromAssignment(assignment: WanikaniAssignment, subject: WanikaniSubject | undefined): YomuSrsReviewable | null {
    if (!subject) return null;
    return {
        providerId: 'wanikani',
        providerCardId: String(assignment.id),
        providerReviewId: String(assignment.id),
        providerReviewableId: String(subject.id),
        kind: subject.type === 'radical' ? 'unknown' : subject.type === 'kanji' ? 'kanji' : 'vocabulary',
        expression: subject.characters ?? subject.slug,
        reading: subject.type === 'radical' ? '' : primaryReading(subject) || (subject.characters ?? subject.slug),
        meanings: [{ glosses: subject.meanings.map(meaning => meaning.meaning), partOfSpeech: [] } satisfies JPDBMeaning],
        state: wanikaniAssignmentCardState(assignment),
        srsLevel: wanikaniStageLabel(assignment.srsStage),
        dueAt: assignment.availableAt ? Date.parse(assignment.availableAt) : null,
        sourceUrl: subject.documentUrl || WANIKANI_DASHBOARD_URL,
        raw: { assignment, subject },
    };
}

function wanikaniAssignmentCardState(assignment: WanikaniAssignment): CardState[] {
    if (assignment.burnedAt) return ['known'];
    if (assignment.srsStage === 0) return ['new'];
    if (assignment.availableAt && Date.parse(assignment.availableAt) <= Date.now()) {
        return assignment.srsStage >= 7 ? ['due', 'mastered'] : ['due', 'learning'];
    }
    if (assignment.srsStage >= 7) return ['mastered'];
    return ['learning'];
}

// srs_stage: 0 lesson/new, 1-4 apprentice, 5-6 guru, 7 master, 8 enlightened, 9 burned.
function wanikaniStageLabel(srsStage: number): string {
    if (srsStage <= 0) return 'lesson';
    if (srsStage <= 4) return 'apprentice';
    if (srsStage <= 6) return 'guru';
    if (srsStage === 7) return 'master';
    if (srsStage === 8) return 'enlightened';
    return 'burned';
}

function parseAssignments(raw: unknown[]): WanikaniAssignment[] {
    return raw.map(parseAssignment).filter((assignment): assignment is WanikaniAssignment => assignment !== null);
}

// fallow-ignore-next-line complexity
function parseAssignment(raw: unknown): WanikaniAssignment | null {
    if (!isRecord(raw)) return null;
    const data = isRecord(raw.data) ? raw.data : {};
    const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
    const subjectId = typeof data.subject_id === 'number' ? data.subject_id : Number(data.subject_id);
    if (!Number.isFinite(id) || !Number.isFinite(subjectId)) return null;
    return {
        id,
        subjectId,
        subjectType: typeof data.subject_type === 'string' ? data.subject_type : '',
        srsStage: typeof data.srs_stage === 'number' ? data.srs_stage : 0,
        availableAt: typeof data.available_at === 'string' ? data.available_at : null,
        startedAt: typeof data.started_at === 'string' ? data.started_at : null,
        burnedAt: typeof data.burned_at === 'string' ? data.burned_at : null,
        unlockedAt: typeof data.unlocked_at === 'string' ? data.unlocked_at : null,
    };
}

// fallow-ignore-next-line complexity
function summaryDueSubjectIds(summary: unknown): Set<number> {
    const ids = new Set<number>();
    const reviews = isRecord(summary) && isRecord(summary.data) ? summary.data.reviews : undefined;
    if (!Array.isArray(reviews)) return ids;
    const now = Date.now();
    for (const entry of reviews) {
        if (!isRecord(entry)) continue;
        const availableAt = typeof entry.available_at === 'string' ? Date.parse(entry.available_at) : NaN;
        if (Number.isFinite(availableAt) && availableAt > now) continue;
        const subjectIds = Array.isArray(entry.subject_ids) ? entry.subject_ids : [];
        for (const subjectId of subjectIds) if (typeof subjectId === 'number') ids.add(subjectId);
    }
    return ids;
}

function summaryDueCount(summary: unknown): number {
    return summaryDueSubjectIds(summary).size;
}

interface WanikaniReviewInput {
    incorrectMeaningAnswers: number;
    incorrectReadingAnswers: number;
}

// WaniKani grades on correct/incorrect counts per component, not a 5-point
// scale. This is a deliberately conservative mapping documented in the
// settings copy (see i18n wanikaniGradeMappingHelp): anything short of a
// clean pass records one incorrect attempt on both components a subject has.
// A radical has no reading component and must never record a reading error.
export function wanikaniReviewInput(card: YomuSrsReviewable, grade: YomuSrsReviewRequest['grade']): WanikaniReviewInput {
    const subject = isRecord(card.raw) && isRecord(card.raw.subject) ? card.raw.subject : undefined;
    // Only the API subject type is authoritative here. Guessing from an empty
    // reading could turn malformed vocabulary into a meaning-only review.
    const isRadical = subject?.type === 'radical';
    const failed = grade === 'nothing' || grade === 'again' || grade === 'fail' || grade === 'something' || grade === 'hard';
    return {
        incorrectMeaningAnswers: failed ? 1 : 0,
        incorrectReadingAnswers: !failed || isRadical ? 0 : 1,
    };
}

// fallow-ignore-next-line complexity
async function reviewWanikaniCard(client: WanikaniClient, request: YomuSrsReviewRequest): Promise<YomuSrsReviewResult> {
    if (request.card.providerId !== 'wanikani' || !request.card.state.includes('due')) {
        throw new WanikaniApiError('Only a currently due WaniKani assignment can be reviewed. Reload the WaniKani queue and try again.');
    }
    const assignmentId = Number(request.card.providerCardId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
        throw new WanikaniApiError('WaniKani grading needs a valid assignment id. Reload the WaniKani queue and try again.');
    }
    const input = wanikaniReviewInput(request.card, request.grade);
    const raw = await client.createReview({
        assignment_id: assignmentId,
        incorrect_meaning_answers: input.incorrectMeaningAnswers,
        incorrect_reading_answers: input.incorrectReadingAnswers,
    });
    const response = isRecord(raw) ? raw : undefined;
    const reviewData = response && isRecord(response.data) ? response.data : response;
    // The official create-review response keeps resources_updated beside data,
    // not inside it. Retain the nested fallback for older test fixtures and
    // compatible API bridges, but always prefer the documented top-level form.
    const resourcesUpdated = response && isRecord(response.resources_updated)
        ? response.resources_updated
        : reviewData && isRecord(reviewData.resources_updated)
            ? reviewData.resources_updated
            : undefined;
    const assignment = parseAssignment(resourcesUpdated && isRecord(resourcesUpdated.assignment)
        ? resourcesUpdated.assignment
        : reviewData);
    if (!assignment) return { card: request.card, raw };
    return {
        card: {
            ...request.card,
            state: wanikaniAssignmentCardState(assignment),
            srsLevel: wanikaniStageLabel(assignment.srsStage),
            dueAt: assignment.availableAt ? Date.parse(assignment.availableAt) : null,
        },
        raw,
    };
}

// fallow-ignore-next-line unused-export
export function wanikaniMiningUnsupported(_request: YomuSrsMiningRequest): Promise<YomuSrsMiningResult> {
    return Promise.reject(new WanikaniApiError('WaniKani has no API to mine arbitrary external words.'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
