import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import type { KatakanaColumnSortModel, KatakanaColumnSortResponse } from './manifest';

export function gradeKatakanaColumnSort(model: KatakanaColumnSortModel, response: KatakanaColumnSortResponse): GradeResult {
    const placements = validateResponse(model, response);
    const missed = model.payload.rounds.filter(round => placements.get(round.id) !== round.vowelColumnId);
    const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
    const passed = score >= model.payload.passScore;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed ? [] : missed.map(round => round.errorTag),
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

export function katakanaColumnSortReviewSeeds(model: KatakanaColumnSortModel, result: GradeResult): readonly ReviewSeed[] {
    const missed = new Set(result.errorTags);
    return model.payload.rounds
        .filter(round => result.outcome === 'pass' || missed.has(round.errorTag))
        .map(round => ({
            id: round.reviewSeedId,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceCellId,
            content: { expression: round.kana, reading: round.kana, meanings: [`Katakana ${round.vowelColumnId} column sign.`] },
        }));
}

export function validateKatakanaColumnSort(model: KatakanaColumnSortModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'The assessed sort needs answer support.' });
    const columns = model.payload?.columns;
    const rounds = model.payload?.rounds;
    if (!Array.isArray(columns) || columns.length !== 5 || new Set(columns.map(column => column.id)).size !== 5
        || columns.some(column => !text(column.id) || !text(column.label))) {
        issues.push({ path: 'payload.columns', message: 'Five named vowel columns are required.' });
    }
    if (!Array.isArray(rounds) || rounds.length !== 5) {
        issues.push({ path: 'payload.rounds', message: 'The katakana column sort requires exactly five ka-row tiles.' });
    } else {
        const ids = new Set<string>();
        const kana = new Set<string>();
        const concepts = new Set<string>();
        const reviews = new Set<string>();
        const columnIds = new Set(columns?.map(column => column.id) ?? []);
        for (const [index, round] of rounds.entries()) {
            const path = `payload.rounds.${index}`;
            unique(round.id, `${path}.id`, ids, issues);
            unique(round.kana, `${path}.kana`, kana, issues);
            unique(round.conceptId, `${path}.conceptId`, concepts, issues);
            unique(round.reviewSeedId, `${path}.reviewSeedId`, reviews, issues);
            if (!text(round.sourceCellId)) issues.push({ path: `${path}.sourceCellId`, message: 'An exact Moodle worksheet cell is required.' });
            if (!text(round.errorTag)) issues.push({ path: `${path}.errorTag`, message: 'A deterministic error tag is required.' });
            if (!columnIds.has(round.vowelColumnId)) issues.push({ path: `${path}.vowelColumnId`, message: 'Every tile must target a source vowel column.' });
            if (!model.conceptIds.includes(round.conceptId)) issues.push({ path: `${path}.conceptId`, message: 'Every tile concept must belong to the activity.' });
        }
        if (concepts.size !== model.conceptIds.length || model.conceptIds.some(id => !concepts.has(id))) {
            issues.push({ path: 'conceptIds', message: 'Sort concepts must exactly match its five tiles.' });
        }
    }
    const visuals = model.payload?.sourceVisuals;
    if (!Array.isArray(visuals) || visuals.length !== 2 || visuals.some(visual =>
        !text(visual.url) || !/^[a-f0-9]{64}$/u.test(visual.sha256) || !localized(visual.label))) {
        issues.push({ path: 'payload.sourceVisuals', message: 'Two SHA-pinned bilingual Moodle worksheet visuals are required.' });
    }
    const audio = model.payload?.audioSupport;
    if (audio?.provider !== 'canonical-yomu-pronunciation-service'
        || audio.sourceAudioStatus !== 'not-present-in-moodle-archive'
        || audio.role !== 'post-instruction-runtime-pronunciation-support') {
        issues.push({ path: 'payload.audioSupport', message: 'Runtime pronunciation support must not be represented as Moodle audio.' });
    }
    if (!Number.isFinite(model.payload?.passScore) || model.payload.passScore <= 0 || model.payload.passScore > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
    if (!localized(model.payload?.signalLabel) || !localized(model.payload?.tileLabel)) {
        issues.push({ path: 'payload', message: 'Bilingual sort labels are required.' });
    }
    if (!localized(model.payload?.feedback?.pass?.explanation)
        || !localized(model.payload?.feedback?.lapse?.explanation)
        || !localized(model.payload?.feedback?.lapse?.repairPrompt)
        || !localized(model.payload?.feedback?.lapse?.nearbyExample)) {
        issues.push({ path: 'payload.feedback', message: 'The sort needs bilingual feedback and a repair ladder.' });
    }
    return issues;
}

function validateResponse(model: KatakanaColumnSortModel, response: KatakanaColumnSortResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.placements) || response.placements.length !== model.payload.rounds.length) {
        throw new TypeError('Katakana column sort requires one placed tile in every vowel column.');
    }
    const roundIds = new Set(model.payload.rounds.map(round => round.id));
    const columnIds = new Set(model.payload.columns.map(column => column.id));
    const placements = new Map<string, string>();
    for (const placement of response.placements) {
        if (!placement || !roundIds.has(placement.kanaId) || !columnIds.has(placement.columnId) || placements.has(placement.kanaId)) {
            throw new TypeError('Katakana column sort has an unknown or duplicate tile placement.');
        }
        if ([...placements.values()].includes(placement.columnId)) {
            throw new TypeError('Katakana column sort requires one tile in each vowel column.');
        }
        placements.set(placement.kanaId, placement.columnId);
    }
    return placements;
}

function unique(value: unknown, path: string, seen: Set<string>, issues: ValidationIssue[]): void {
    const normalized = text(value);
    if (!normalized) issues.push({ path, message: 'A stable unique value is required.' });
    else if (seen.has(normalized)) issues.push({ path, message: 'Values must be unique.' });
    else seen.add(normalized);
}

function localized(value: unknown): boolean {
    return Boolean(value && typeof value === 'object' && text((value as { en?: unknown }).en) && text((value as { ja?: unknown }).ja));
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
