import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import type {
    KatakanaShapeRelayModel,
    KatakanaShapeRelayPlacement,
    KatakanaShapeRelayResponse,
} from './manifest';

export function gradeKatakanaShapeRelay(
    model: KatakanaShapeRelayModel,
    response: KatakanaShapeRelayResponse,
): GradeResult {
    const placements = validateResponse(model, response);
    const missed = model.payload.rounds.filter((round, index) => placements[index].kanaId !== round.id);
    const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
    const passed = score >= model.payload.passScore;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed ? [] : missed.map(round => round.errorTag),
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

export function katakanaShapeRelayReviewSeeds(
    model: KatakanaShapeRelayModel,
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
                meanings: ['Katakana vowel sign.'],
            },
        }));
}

export function validateKatakanaShapeRelay(model: KatakanaShapeRelayModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'The assessed relay needs answer support.' });
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 5) {
        return [{ path: 'payload.rounds', message: 'The first katakana relay requires exactly five vowel stations.' }];
    }
    const ids = new Set<string>();
    const kana = new Set<string>();
    const concepts = new Set<string>();
    const reviews = new Set<string>();
    rounds.forEach((round, index) => {
        const path = `payload.rounds.${index}`;
        unique(round.id, `${path}.id`, ids, issues);
        unique(round.kana, `${path}.kana`, kana, issues);
        unique(round.conceptId, `${path}.conceptId`, concepts, issues);
        unique(round.reviewSeedId, `${path}.reviewSeedId`, reviews, issues);
        if (!text(round.sourceCellId)) issues.push({ path: `${path}.sourceCellId`, message: 'An exact Moodle chart cell id is required.' });
        if (!text(round.errorTag)) issues.push({ path: `${path}.errorTag`, message: 'A deterministic error tag is required.' });
        if (!model.conceptIds.includes(round.conceptId)) {
            issues.push({ path: `${path}.conceptId`, message: 'Every relay concept must belong to the activity.' });
        }
    });
    if (concepts.size !== model.conceptIds.length || model.conceptIds.some(id => !concepts.has(id))) {
        issues.push({ path: 'conceptIds', message: 'Relay concepts must exactly match its five stations.' });
    }
    const visuals = model.payload?.sourceVisuals;
    if (!Array.isArray(visuals) || visuals.length !== 2 || visuals.some(visual =>
        !text(visual.url) || !/^[a-f0-9]{64}$/u.test(visual.sha256) || !localized(visual.label))) {
        issues.push({ path: 'payload.sourceVisuals', message: 'Two SHA-pinned bilingual Moodle chart visuals are required.' });
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
        || support.genki?.taskId !== 'genki-2e:l1-l22:lesson-2-literacy-wb-1'
        || !/^[a-f0-9]{64}$/u.test(support.genki.payloadSha256)
        || support.genki.role !== 'post-instruction-writing-subset-support-only'
        || support.genki.lineLocus?.[0] !== 76 || support.genki.lineLocus?.[1] !== 93) {
        issues.push({ path: 'payload.supportReferences', message: 'Minna chronology and exact post-instruction Genki support are required.' });
    }
    if (!Number.isFinite(model.payload?.passScore) || model.payload.passScore <= 0 || model.payload.passScore > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
    if (!localized(model.payload?.stationLabel) || !localized(model.payload?.tileLabel)) {
        issues.push({ path: 'payload', message: 'Bilingual relay labels are required.' });
    }
    if (!localized(model.payload?.feedback?.pass?.explanation)
        || !localized(model.payload?.feedback?.lapse?.explanation)
        || !localized(model.payload?.feedback?.lapse?.repairPrompt)
        || !localized(model.payload?.feedback?.lapse?.nearbyExample)) {
        issues.push({ path: 'payload.feedback', message: 'The relay needs a bilingual feedback and repair ladder.' });
    }
    return issues;
}

function validateResponse(
    model: KatakanaShapeRelayModel,
    response: KatakanaShapeRelayResponse,
): readonly KatakanaShapeRelayPlacement[] {
    if (!response || !Array.isArray(response.placements) || response.placements.length !== model.payload.rounds.length) {
        throw new TypeError('Katakana shape relay requires one placement at every station.');
    }
    const roundIds = new Set(model.payload.rounds.map(round => round.id));
    const kanaIds = new Set(roundIds);
    const seenRounds = new Set<string>();
    const seenKana = new Set<string>();
    return response.placements.map((placement, index) => {
        const expected = model.payload.rounds[index].id;
        if (!placement || placement.roundId !== expected || !roundIds.has(placement.roundId) || seenRounds.has(placement.roundId)) {
            throw new TypeError(`Relay station ${index + 1} is missing or out of order.`);
        }
        if (!kanaIds.has(placement.kanaId) || seenKana.has(placement.kanaId)) {
            throw new TypeError(`Relay tile ${index + 1} is unknown or used twice.`);
        }
        seenRounds.add(placement.roundId);
        seenKana.add(placement.kanaId);
        return { roundId: placement.roundId, kanaId: placement.kanaId };
    });
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
