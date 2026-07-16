import { normalizeJapanese } from '../activity-kit/shared';
import type {
    ClassActivityResponse,
    ClassActivityRole,
    ClassActivitySimulatorModel,
    ClassActivityTurn,
} from './model';

export interface ClassActivityTranscriptEntry {
    readonly turnId: string;
    readonly role: ClassActivityRole;
    readonly text: string;
    readonly language: 'en' | 'ja';
}

export interface ClassActivitySession {
    readonly currentTurn: ClassActivityTurn | null;
    readonly transcript: readonly ClassActivityTranscriptEntry[];
    readonly response: ClassActivityResponse;
    readonly complete: boolean;
    continueClassmate(): void;
    answer(value: string): void;
}

export function createClassActivitySession(model: ClassActivitySimulatorModel): ClassActivitySession {
    let turnIndex = 0;
    const answers: Array<{ turnId: string; value: string }> = [];
    const transcript: ClassActivityTranscriptEntry[] = [];
    const roleById = new Map(model.payload.roles.map(role => [role.id, role]));

    const current = (): ClassActivityTurn | null => model.payload.turns[turnIndex] ?? null;
    const actor = (turn: ClassActivityTurn): ClassActivityRole => {
        const role = roleById.get(turn.actorRoleId);
        if (!role) throw new TypeError(`Unknown class activity role ${turn.actorRoleId}.`);
        return role;
    };

    return {
        get currentTurn() { return current(); },
        get transcript() { return transcript.map(entry => ({ ...entry, role: { ...entry.role } })); },
        get response() { return { answers: answers.map(answer => ({ ...answer })) }; },
        get complete() { return current() === null; },
        continueClassmate() {
            const turn = current();
            if (!turn || turn.kind !== 'classmate') throw new TypeError('The current turn does not belong to a classmate.');
            transcript.push({ turnId: turn.id, role: actor(turn), text: turn.line.ja, language: 'ja' });
            turnIndex += 1;
        },
        answer(value) {
            const turn = current();
            if (!turn || turn.kind === 'classmate') throw new TypeError('The current turn does not belong to the learner.');
            const normalized = value.trim();
            if (!normalized) throw new TypeError('A learner answer is required.');
            const displayed = turn.kind === 'learner-choice'
                ? turn.options.find(option => option.id === normalized)?.label.ja
                : normalized;
            if (!displayed) throw new TypeError(`Unknown option ${normalized}.`);
            answers.push({ turnId: turn.id, value: normalized });
            transcript.push({ turnId: turn.id, role: actor(turn), text: displayed, language: 'ja' });
            turnIndex += 1;
        },
    };
}

export function scoreClassActivity(
    model: ClassActivitySimulatorModel,
    response: ClassActivityResponse,
): Readonly<{ score: number; errorTags: readonly string[] }> {
    if (!response || !Array.isArray(response.answers)) throw new TypeError('Class activity turn answers are required.');
    const answerByTurn = new Map(response.answers.map(answer => [answer.turnId, answer.value]));
    const learnerTurns = model.payload.turns.filter(turn => turn.kind !== 'classmate');
    if (!learnerTurns.length) throw new TypeError('Class activity requires at least one learner turn.');
    const failed: string[] = [];
    let correct = 0;

    for (const turn of learnerTurns) {
        const answer = answerByTurn.get(turn.id) ?? '';
        let passes = false;
        if (turn.kind === 'learner-choice') {
            passes = turn.acceptedOptionIds.includes(answer);
        } else {
            const normalized = normalizeJapanese(answer);
            const exact = turn.acceptedAnswers?.some(candidate => normalizeJapanese(candidate) === normalized) ?? false;
            const groups = turn.requiredGroups ?? [];
            const containsGroups = groups.length > 0
                && groups.every(group => group.some(term => normalized.includes(normalizeJapanese(term))));
            passes = exact || containsGroups;
        }
        if (passes) correct += 1;
        else failed.push(turn.evidence.errorTag);
    }
    return { score: correct / learnerTurns.length, errorTags: failed };
}
