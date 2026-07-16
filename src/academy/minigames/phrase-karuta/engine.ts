import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import type {
    PhraseKarutaCard,
    PhraseKarutaModel,
    PhraseKarutaResponse,
    PhraseKarutaRound,
    PhraseKarutaSelection,
} from './manifest';

export interface PhraseKarutaSnapshot {
    readonly roundIndex: number;
    readonly totalRounds: number;
    readonly round?: PhraseKarutaRound;
    readonly selections: readonly PhraseKarutaSelection[];
    readonly complete: boolean;
}

export interface PhraseKarutaSession {
    snapshot(): PhraseKarutaSnapshot;
    select(cardId: string): PhraseKarutaSnapshot;
    response(): PhraseKarutaResponse;
}

export function createPhraseKarutaSession(model: PhraseKarutaModel): PhraseKarutaSession {
    const cards = new Set(model.payload.cards.map(card => card.id));
    const selections: PhraseKarutaSelection[] = [];

    const snapshot = (): PhraseKarutaSnapshot => ({
        roundIndex: selections.length,
        totalRounds: model.payload.rounds.length,
        ...(model.payload.rounds[selections.length] ? { round: model.payload.rounds[selections.length] } : {}),
        selections: selections.map(selection => ({ ...selection })),
        complete: selections.length === model.payload.rounds.length,
    });

    return {
        snapshot,
        select(cardId) {
            const current = snapshot();
            if (current.complete || !current.round) throw new Error('Phrase karuta is already complete.');
            if (!cards.has(cardId)) throw new TypeError(`Unknown phrase card: ${cardId}`);
            selections.push({ roundId: current.round.id, cardId });
            return snapshot();
        },
        response() {
            const current = snapshot();
            if (!current.complete) throw new Error('Phrase karuta cannot be submitted before every round is played.');
            return { selections: current.selections };
        },
    };
}

export function gradePhraseKaruta(model: PhraseKarutaModel, response: PhraseKarutaResponse): GradeResult {
    const selections = validateResponse(model, response);
    const cardByRound = new Map(selections.map(selection => [selection.roundId, selection.cardId]));
    const missed = model.payload.rounds.filter(round => cardByRound.get(round.id) !== round.correctCardId);
    const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
    const passed = score >= model.payload.passScore;

    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: missed.map(round => round.errorTag),
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

export function phraseKarutaReviewSeeds(model: PhraseKarutaModel, result: GradeResult): readonly ReviewSeed[] {
    const cards = new Map(model.payload.cards.map(card => [card.id, card]));
    const targets = new Map<string, PhraseKarutaCard>();
    for (const round of model.payload.rounds) {
        const card = cards.get(round.correctCardId)!;
        targets.set(`${card.reviewSeedId}:${card.conceptId}`, card);
    }
    return [...targets.values()].map(card => ({
        id: `${card.reviewSeedId}:${card.conceptId}`,
        conceptId: card.conceptId,
        reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
        ...(model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {}),
        content: structuredClone(card.reviewContent),
    }));
}

export function validatePhraseKaruta(model: PhraseKarutaModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const cards = model.payload?.cards;
    const rounds = model.payload?.rounds;
    if (!Array.isArray(cards) || cards.length < 2) {
        issues.push({ path: 'payload.cards', message: 'At least two injected phrase cards are required.' });
        return issues;
    }
    if (!Array.isArray(rounds) || rounds.length === 0) {
        issues.push({ path: 'payload.rounds', message: 'At least one injected round is required.' });
        return issues;
    }

    const cardIds = new Set<string>();
    cards.forEach((card, index) => {
        const path = `payload.cards.${index}`;
        requireUniqueText(card.id, `${path}.id`, cardIds, 'Card ids', issues);
        if (!text(card.phrase)) issues.push({ path: `${path}.phrase`, message: 'A Japanese phrase is required.' });
        if (!text(card.conceptId) || !model.conceptIds.includes(card.conceptId)) {
            issues.push({ path: `${path}.conceptId`, message: 'The card concept must belong to the activity.' });
        }
        if (!text(card.reviewSeedId)) issues.push({ path: `${path}.reviewSeedId`, message: 'A review seed id is required.' });
        if (!text(card.reviewContent?.expression) || !nonEmptyText(card.reviewContent?.meanings)) {
            issues.push({ path: `${path}.reviewContent`, message: 'Reviewable expression and meanings are required.' });
        }
    });

    const roundIds = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        requireUniqueText(round.id, `${path}.id`, roundIds, 'Round ids', issues);
        if (!localized(round.cue)) issues.push({ path: `${path}.cue`, message: 'A bilingual context cue is required.' });
        if (!cardIds.has(round.correctCardId)) {
            issues.push({ path: `${path}.correctCardId`, message: 'The correct card must exist in the injected deck.' });
        }
        if (!text(round.errorTag)) issues.push({ path: `${path}.errorTag`, message: 'A deterministic error tag is required.' });
    });

    if (!Number.isFinite(model.payload.passScore) || model.payload.passScore <= 0 || model.payload.passScore > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
    if (!localized(model.payload.feedback?.pass?.explanation)) {
        issues.push({ path: 'payload.feedback.pass.explanation', message: 'Bilingual pass feedback is required.' });
    }
    const lapse = model.payload.feedback?.lapse;
    if (!localized(lapse?.explanation) || !localized(lapse?.repairPrompt) || !localized(lapse?.nearbyExample)) {
        issues.push({ path: 'payload.feedback.lapse', message: 'A bilingual lapse repair ladder is required.' });
    }
    return issues;
}

function validateResponse(model: PhraseKarutaModel, response: PhraseKarutaResponse): readonly PhraseKarutaSelection[] {
    if (!response || !Array.isArray(response.selections)) throw new TypeError('Phrase karuta selections are required.');
    if (response.selections.length !== model.payload.rounds.length) {
        throw new TypeError('Phrase karuta requires exactly one selection per round.');
    }
    const cardIds = new Set(model.payload.cards.map(card => card.id));
    return response.selections.map((selection, index) => {
        const round = model.payload.rounds[index];
        if (!selection || selection.roundId !== round.id) {
            throw new TypeError(`Phrase karuta selection ${index + 1} is out of round order.`);
        }
        if (!cardIds.has(selection.cardId)) throw new TypeError(`Unknown phrase card: ${selection.cardId}`);
        return { roundId: selection.roundId, cardId: selection.cardId };
    });
}

function requireUniqueText(
    value: unknown,
    path: string,
    seen: Set<string>,
    label: string,
    issues: ValidationIssue[],
): void {
    const normalized = text(value);
    if (!normalized) issues.push({ path, message: 'A stable id is required.' });
    else if (seen.has(normalized)) issues.push({ path, message: `${label} must be unique.` });
    else seen.add(normalized);
}

function localized(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { en?: unknown; ja?: unknown };
    return Boolean(text(candidate.en) && text(candidate.ja));
}

function nonEmptyText(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0 && value.every(item => Boolean(text(item)));
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
