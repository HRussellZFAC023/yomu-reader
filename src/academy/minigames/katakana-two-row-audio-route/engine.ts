import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import type {
    KatakanaTwoRowAudioRouteModel,
    KatakanaTwoRowAudioRouteResponse,
} from './manifest';

export function gradeKatakanaTwoRowAudioRoute(
    model: KatakanaTwoRowAudioRouteModel,
    response: KatakanaTwoRowAudioRouteResponse,
): GradeResult {
    const answers = validateResponse(model, response);
    const missed = model.payload.rounds.filter(round => answers.get(round.id) !== cellId(round.rowId, round.vowelColumnId));
    const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
    const passed = score >= model.payload.passScore;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed ? [] : missed.map(round => round.errorTag),
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

export function katakanaTwoRowAudioRouteReviewSeeds(
    model: KatakanaTwoRowAudioRouteModel,
    result: GradeResult,
): readonly ReviewSeed[] {
    const missed = new Set(result.errorTags);
    return model.payload.rounds
        .filter(round => result.outcome === 'pass' || missed.has(round.errorTag))
        .map(round => ({
            id: round.reviewSeedId,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceCellId,
            content: {
                expression: round.kana,
                reading: round.kana,
                meanings: [`Katakana ${round.rowId} row, ${round.vowelColumnId} vowel position.`],
            },
        }));
}

export function validateKatakanaTwoRowAudioRoute(model: KatakanaTwoRowAudioRouteModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'The assessed audio route needs answer support.' });
    const rows = model.payload?.rows;
    const columns = model.payload?.columns;
    if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => row.id)).size !== 2
        || rows.some(row => !localized(row.label))) {
        issues.push({ path: 'payload.rows', message: 'Two named katakana rows are required.' });
    }
    if (!Array.isArray(columns) || columns.length !== 5 || new Set(columns.map(column => column.id)).size !== 5
        || columns.some(column => !text(column.label))) {
        issues.push({ path: 'payload.columns', message: 'Five named vowel columns are required.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 10) {
        issues.push({ path: 'payload.rounds', message: 'The two-row audio route requires ten katakana signals.' });
    } else {
        const ids = new Set<string>(); const kana = new Set<string>(); const concepts = new Set<string>(); const reviews = new Set<string>();
        const sourceCells = new Set<string>(); const coordinates = new Set<string>();
        for (const [index, round] of rounds.entries()) {
            const path = `payload.rounds.${index}`;
            unique(round.id, `${path}.id`, ids, issues); unique(round.kana, `${path}.kana`, kana, issues);
            unique(round.conceptId, `${path}.conceptId`, concepts, issues); unique(round.reviewSeedId, `${path}.reviewSeedId`, reviews, issues);
            unique(round.sourceCellId, `${path}.sourceCellId`, sourceCells, issues);
            const coordinate = cellId(round.rowId, round.vowelColumnId);
            unique(coordinate, `${path}.coordinate`, coordinates, issues);
            if (!['sa', 'ta'].includes(round.rowId)) issues.push({ path: `${path}.rowId`, message: 'Every signal must identify the sa or ta source row.' });
            if (!['a', 'i', 'u', 'e', 'o'].includes(round.vowelColumnId)) issues.push({ path: `${path}.vowelColumnId`, message: 'Every signal must identify a source vowel column.' });
            if (!text(round.errorTag)) issues.push({ path: `${path}.errorTag`, message: 'A deterministic error tag is required.' });
            if (!model.conceptIds.includes(round.conceptId)) issues.push({ path: `${path}.conceptId`, message: 'Every route concept must belong to the activity.' });
        }
        if (coordinates.size !== 10) issues.push({ path: 'payload.rounds', message: 'Every sa/ta and vowel coordinate must occur once.' });
        if (concepts.size !== model.conceptIds.length || model.conceptIds.some(id => !concepts.has(id))) {
            issues.push({ path: 'conceptIds', message: 'Route concepts must exactly match its ten signals.' });
        }
    }
    const visuals = model.payload?.sourceVisuals;
    if (!Array.isArray(visuals) || visuals.length !== 3 || visuals.some(visual =>
        !text(visual.url) || !/^[a-f0-9]{64}$/u.test(visual.sha256) || !localized(visual.label))) {
        issues.push({ path: 'payload.sourceVisuals', message: 'Three SHA-pinned bilingual Moodle worksheet visuals are required.' });
    }
    const audio = model.payload?.audioSupport;
    if (audio?.provider !== 'canonical-yomu-pronunciation-service'
        || audio.sourceAudioStatus !== 'not-present-in-moodle-archive'
        || audio.role !== 'post-instruction-runtime-pronunciation-support') {
        issues.push({ path: 'payload.audioSupport', message: 'Runtime pronunciation support must not be represented as Moodle audio.' });
    }
    const support = model.payload?.supportReferences;
    if (support?.minna?.reference !== 'Minna no Nihongo I, Katakana strand'
        || support.minna.role !== 'chronology-map-only'
        || support.genki?.taskId !== 'genki-2e:l1-l24:lesson-2-literacy-wb-3'
        || !/^[a-f0-9]{64}$/u.test(support.genki.payloadSha256)
        || support.genki.role !== 'post-instruction-writing-support-only'
        || support.genki.lineLocus?.[0] !== 76 || support.genki.lineLocus?.[1] !== 93) {
        issues.push({ path: 'payload.supportReferences', message: 'Minna chronology and exact post-instruction Genki support are required.' });
    }
    if (!Number.isFinite(model.payload?.passScore) || model.payload.passScore <= 0 || model.payload.passScore > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
    if (!localized(model.payload?.routeLabel)) issues.push({ path: 'payload.routeLabel', message: 'A bilingual route label is required.' });
    if (!localized(model.payload?.feedback?.pass?.explanation)
        || !localized(model.payload?.feedback?.lapse?.explanation)
        || !localized(model.payload?.feedback?.lapse?.repairPrompt)
        || !localized(model.payload?.feedback?.lapse?.nearbyExample)) {
        issues.push({ path: 'payload.feedback', message: 'The audio route needs bilingual feedback and a repair ladder.' });
    }
    return issues;
}

function validateResponse(
    model: KatakanaTwoRowAudioRouteModel,
    response: KatakanaTwoRowAudioRouteResponse,
): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Katakana two-row audio route requires one coordinate for every signal.');
    }
    const roundIds = new Set(model.payload.rounds.map(round => round.id));
    const coordinates = new Set(model.payload.rounds.map(round => cellId(round.rowId, round.vowelColumnId)));
    const answers = new Map<string, string>();
    for (const answer of response.answers) {
        if (!answer || !roundIds.has(answer.roundId) || !coordinates.has(answer.cellId) || answers.has(answer.roundId)) {
            throw new TypeError('Katakana two-row audio route has an unknown or duplicate signal answer.');
        }
        answers.set(answer.roundId, answer.cellId);
    }
    return answers;
}

function cellId(rowId: string, vowelColumnId: string): string { return `${rowId}:${vowelColumnId}`; }

function unique(value: unknown, path: string, seen: Set<string>, issues: ValidationIssue[]): void {
    const normalized = text(value);
    if (!normalized) issues.push({ path, message: 'A stable unique value is required.' });
    else if (seen.has(normalized)) issues.push({ path, message: 'Values must be unique.' });
    else seen.add(normalized);
}

function localized(value: unknown): boolean {
    return Boolean(value && typeof value === 'object' && text((value as { en?: unknown }).en) && text((value as { ja?: unknown }).ja));
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
