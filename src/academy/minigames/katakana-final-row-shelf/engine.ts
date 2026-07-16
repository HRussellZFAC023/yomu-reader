import type { GradeResult, ReviewSeed, ValidationIssue } from '../../domain/activity-runtime';
import type { KatakanaFinalRowShelfModel, KatakanaFinalRowShelfResponse } from './manifest';

const ROWS = new Set(['ma', 'ya', 'ra', 'wa']);
const GENKI_TASKS = new Set([
    'genki-2e:l1-l26:lesson-2-literacy-wb-7',
    'genki-2e:l1-l26:lesson-2-literacy-wb-9:2',
]);

export function gradeKatakanaFinalRowShelf(
    model: KatakanaFinalRowShelfModel,
    response: KatakanaFinalRowShelfResponse,
): GradeResult {
    const answers = validateResponse(model, response);
    const missed = model.payload.rounds.filter(round => answers.get(round.id) !== round.slotId);
    const score = (model.payload.rounds.length - missed.length) / model.payload.rounds.length;
    const passed = score >= model.payload.passScore;
    return {
        outcome: passed ? 'pass' : 'lapse',
        score,
        errorTags: passed ? [] : missed.map(round => round.errorTag),
        feedback: structuredClone(passed ? model.payload.feedback.pass : model.payload.feedback.lapse),
    };
}

export function katakanaFinalRowShelfReviewSeeds(
    model: KatakanaFinalRowShelfModel,
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
                meanings: [`Katakana final-row shelf slot ${round.slotId}.`],
            },
        }));
}

export function validateKatakanaFinalRowShelf(model: KatakanaFinalRowShelfModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!model.answerSupport) issues.push({ path: 'answerSupport', message: 'The assessed shelf map needs answer support.' });
    const shelves = model.payload?.shelves;
    const slots = shelves?.flatMap(shelf => shelf.slots) ?? [];
    if (!shelves || shelves.length !== 4 || new Set(shelves.map(shelf => shelf.id)).size !== 4
        || shelves.some(shelf => !ROWS.has(shelf.id) || !localized(shelf.label) || shelf.slots.some(slot => !text(slot.id) || !text(slot.label)))) {
        issues.push({ path: 'payload.shelves', message: 'Four named source-chart shelves with labelled slots are required.' });
    }
    if (slots.length !== 16 || new Set(slots.map(slot => slot.id)).size !== 16) {
        issues.push({ path: 'payload.shelves', message: 'The final-row shelf map requires sixteen unique source slots.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds) || rounds.length !== 16) {
        issues.push({ path: 'payload.rounds', message: 'The final-row shelf map requires sixteen katakana signals.' });
    } else {
        const ids = new Set<string>(); const kana = new Set<string>(); const concepts = new Set<string>(); const reviews = new Set<string>();
        const sourceCells = new Set<string>(); const roundSlots = new Set<string>(); const validSlots = new Set(slots.map(slot => slot.id));
        for (const [index, round] of rounds.entries()) {
            const itemPath = `payload.rounds.${index}`;
            unique(round.id, `${itemPath}.id`, ids, issues); unique(round.kana, `${itemPath}.kana`, kana, issues);
            unique(round.conceptId, `${itemPath}.conceptId`, concepts, issues); unique(round.reviewSeedId, `${itemPath}.reviewSeedId`, reviews, issues);
            unique(round.sourceCellId, `${itemPath}.sourceCellId`, sourceCells, issues); unique(round.slotId, `${itemPath}.slotId`, roundSlots, issues);
            if (!validSlots.has(round.slotId)) issues.push({ path: `${itemPath}.slotId`, message: 'Every signal must point to a delivered source-chart slot.' });
            if (!text(round.errorTag)) issues.push({ path: `${itemPath}.errorTag`, message: 'A deterministic error tag is required.' });
            if (!model.conceptIds.includes(round.conceptId)) issues.push({ path: `${itemPath}.conceptId`, message: 'Every shelf concept must belong to the activity.' });
        }
        if (roundSlots.size !== 16) issues.push({ path: 'payload.rounds', message: 'Every source-chart slot must be assessed once.' });
        if (concepts.size !== model.conceptIds.length || model.conceptIds.some(id => !concepts.has(id))) {
            issues.push({ path: 'conceptIds', message: 'Shelf concepts must exactly match its sixteen signals.' });
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
        issues.push({ path: 'payload.audioSupport', message: 'Verified runtime pronunciation support must not be represented as Moodle audio.' });
    }
    const support = model.payload?.supportReferences;
    if (support?.minna?.reference !== 'Minna no Nihongo I, Katakana strand'
        || support.minna.role !== 'chronology-map-only'
        || !Array.isArray(support.genki) || support.genki.length !== 2
        || new Set(support.genki.map(item => item.taskId)).size !== 2
        || support.genki.some(item => !GENKI_TASKS.has(item.taskId) || !/^[a-f0-9]{64}$/u.test(item.payloadSha256)
            || item.lineLocus?.[0] !== 76 || item.lineLocus?.[1] !== 91 || item.role !== 'post-instruction-writing-support-only')) {
        issues.push({ path: 'payload.supportReferences', message: 'Minna chronology and both exact post-instruction Genki writing supports are required.' });
    }
    if (!Number.isFinite(model.payload?.passScore) || model.payload.passScore <= 0 || model.payload.passScore > 1) {
        issues.push({ path: 'payload.passScore', message: 'Pass score must be greater than zero and at most one.' });
    }
    if (!localized(model.payload?.shelfMapLabel)) issues.push({ path: 'payload.shelfMapLabel', message: 'A bilingual shelf-map label is required.' });
    if (!localized(model.payload?.feedback?.pass?.explanation)
        || !localized(model.payload?.feedback?.lapse?.explanation)
        || !localized(model.payload?.feedback?.lapse?.repairPrompt)
        || !localized(model.payload?.feedback?.lapse?.nearbyExample)) {
        issues.push({ path: 'payload.feedback', message: 'The shelf map needs bilingual feedback and a repair ladder.' });
    }
    return issues;
}

function validateResponse(model: KatakanaFinalRowShelfModel, response: KatakanaFinalRowShelfResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Katakana final-row shelf requires one shelf slot for every signal.');
    }
    const signalIds = new Set(model.payload.rounds.map(round => round.id));
    const slotIds = new Set(model.payload.shelves.flatMap(shelf => shelf.slots.map(slot => slot.id)));
    const answers = new Map<string, string>(); const usedSlots = new Set<string>();
    for (const answer of response.answers) {
        if (!answer || !signalIds.has(answer.signalId) || !slotIds.has(answer.slotId) || answers.has(answer.signalId) || usedSlots.has(answer.slotId)) {
            throw new TypeError('Katakana final-row shelf has an unknown or duplicate signal placement.');
        }
        answers.set(answer.signalId, answer.slotId); usedSlots.add(answer.slotId);
    }
    return answers;
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

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
