import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import type {
    KanaSoundMapModel,
    KanaSoundMapResponse,
    KanaSoundMapSelection,
} from './manifest';

export interface KanaSoundMapSnapshot {
    readonly index: number;
    readonly total: number;
    readonly selections: readonly KanaSoundMapSelection[];
    readonly complete: boolean;
}

export interface KanaSoundMapSession {
    snapshot(): KanaSoundMapSnapshot;
    select(kanaId: string): KanaSoundMapSnapshot;
    response(): KanaSoundMapResponse;
}

export function createKanaSoundMapSession(model: KanaSoundMapModel): KanaSoundMapSession {
    const authoredIds = new Set(model.payload.items.map(item => item.id));
    const selections: KanaSoundMapSelection[] = [];
    const snapshot = (): KanaSoundMapSnapshot => ({
        index: selections.length,
        total: model.payload.items.length,
        selections: selections.map(selection => ({ ...selection })),
        complete: selections.length === model.payload.items.length,
    });

    return {
        snapshot,
        select(kanaId) {
            const state = snapshot();
            if (state.complete) throw new Error('Kana sound map is already complete.');
            if (!authoredIds.has(kanaId)) throw new TypeError(`Unknown kana choice: ${kanaId}`);
            selections.push({ roundId: model.payload.items[state.index].id, kanaId });
            return snapshot();
        },
        response() {
            const state = snapshot();
            if (!state.complete) throw new Error('Kana sound map needs all five commitments before submission.');
            return { selections: state.selections };
        },
    };
}

export function gradeKanaSoundMap(model: KanaSoundMapModel, response: KanaSoundMapResponse): GradeResult {
    const selections = validateResponse(model, response);
    const missed = model.payload.items.filter((item, index) => selections[index].kanaId !== item.id);
    const score = (model.payload.items.length - missed.length) / model.payload.items.length;
    const passed = score >= model.payload.passScore;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed ? [] : missed.map(item => item.errorTag),
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

export function kanaSoundMapReviewSeeds(model: KanaSoundMapModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.items.map(item => ({
        id: item.reviewSeedId,
        conceptId: item.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        ...(model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {}),
        content: {
            expression: item.kana,
            reading: item.kana,
            meanings: [`hiragana vowel ${item.romaji}`],
        },
    }));
}

export function validateKanaSoundMap(model: KanaSoundMapModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) {
        issues.push({ path: 'answerSupport', message: 'Assessed kana listening requires the answer-support contract.' });
    }
    const items = model.payload?.items;
    if (!Array.isArray(items) || items.length < 2) {
        return [{ path: 'payload.items', message: 'A sound map needs at least two injected kana.' }];
    }
    const itemIds = new Set<string>();
    const kana = new Set<string>();
    const concepts = new Set<string>();
    const reviews = new Set<string>();
    items.forEach((item, index) => {
        const path = `payload.items.${index}`;
        uniqueText(item.id, `${path}.id`, itemIds, issues);
        uniqueText(item.kana, `${path}.kana`, kana, issues);
        if (!text(item.romaji)) issues.push({ path: `${path}.romaji`, message: 'A vowel reading is required.' });
        uniqueText(item.conceptId, `${path}.conceptId`, concepts, issues);
        if (!model.conceptIds.includes(item.conceptId)) {
            issues.push({ path: `${path}.conceptId`, message: 'The kana concept must belong to the activity.' });
        }
        uniqueText(item.reviewSeedId, `${path}.reviewSeedId`, reviews, issues);
        if (!text(item.errorTag)) issues.push({ path: `${path}.errorTag`, message: 'A deterministic error tag is required.' });
    });
    if (model.conceptIds.length !== concepts.size || model.conceptIds.some(id => !concepts.has(id))) {
        issues.push({ path: 'conceptIds', message: 'Activity concepts must exactly match the injected kana.' });
    }
    validateSource(model, issues);
    if (!Number.isFinite(model.payload.passScore) || model.payload.passScore <= 0 || model.payload.passScore > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
    if (!localized(model.payload.choiceLabel)) issues.push({ path: 'payload.choiceLabel', message: 'A bilingual choice label is required.' });
    if (!localized(model.payload.feedback?.pass?.explanation)) {
        issues.push({ path: 'payload.feedback.pass.explanation', message: 'Bilingual pass feedback is required.' });
    }
    const lapse = model.payload.feedback?.lapse;
    if (!localized(lapse?.explanation) || !localized(lapse?.repairPrompt) || !localized(lapse?.nearbyExample)) {
        issues.push({ path: 'payload.feedback.lapse', message: 'A bilingual lapse repair ladder is required.' });
    }
    return issues;
}

function validateSource(model: KanaSoundMapModel, issues: ValidationIssue[]): void {
    const source = model.payload.source;
    if (!text(source?.sourceId) || !text(source?.role) || !text(source?.runtimeUrl) || !text(source?.locus)) {
        issues.push({ path: 'payload.source', message: 'The exact source id, role, page URL, and locus are required.' });
    }
    if (!/^[a-f0-9]{64}$/u.test(source?.sourceSha256 ?? '')) {
        issues.push({ path: 'payload.source.sourceSha256', message: 'A source SHA-256 is required.' });
    }
    if (source?.answerGate !== 'after-attempt') {
        issues.push({ path: 'payload.source.answerGate', message: 'Source answers must stay gated until the full attempt.' });
    }
    if (!text(source?.storyHook?.sceneId) || !text(source?.storyHook?.activityId)) {
        issues.push({ path: 'payload.source.storyHook', message: 'The authored story scene and activity hook are required.' });
    }
}

function validateResponse(model: KanaSoundMapModel, response: KanaSoundMapResponse): readonly KanaSoundMapSelection[] {
    if (!response || !Array.isArray(response.selections)
        || response.selections.length !== model.payload.items.length) {
        throw new TypeError('Kana sound map requires exactly one selection per sound.');
    }
    const authoredIds = new Set(model.payload.items.map(item => item.id));
    const seenRounds = new Set<string>();
    return response.selections.map((selection, index) => {
        const expectedRound = model.payload.items[index].id;
        if (!selection || selection.roundId !== expectedRound || seenRounds.has(selection.roundId)) {
            throw new TypeError(`Kana sound selection ${index + 1} is duplicated or out of round order.`);
        }
        seenRounds.add(selection.roundId);
        if (!authoredIds.has(selection.kanaId)) throw new TypeError(`Unknown kana choice: ${selection.kanaId}`);
        return { roundId: selection.roundId, kanaId: selection.kanaId };
    });
}

function uniqueText(value: unknown, path: string, seen: Set<string>, issues: ValidationIssue[]): void {
    const normalized = text(value);
    if (!normalized) issues.push({ path, message: 'A stable unique value is required.' });
    else if (seen.has(normalized)) issues.push({ path, message: 'Values must be unique.' });
    else seen.add(normalized);
}

function localized(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { en?: unknown; ja?: unknown };
    return Boolean(text(candidate.en) && text(candidate.ja));
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
