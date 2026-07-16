import {
    readGrammarKnowledge,
    setGrammarRuleKnowledge,
    type GrammarKnowledgeEntry,
} from '../../reader/study/grammar-knowledge';
import type {
    AttemptOutcome,
    GrammarKnowledge,
    LearnerEvent,
    LearnerEventInput,
    LearnerProjection,
    LearnerRecord,
} from '../domain/learner-record';
import { grammarRuleIdForConcept } from './grammar-concepts';

type AttemptInput = Extract<LearnerEventInput, { kind: 'attempt-recorded' }>;
type GrammarEvent = Extract<LearnerEvent, { kind: 'grammar-known-changed' }>;

export function grammarKnowledgeEventsForAttempt(
    attempt: AttemptInput,
    projection: LearnerProjection,
): readonly LearnerEventInput[] {
    return [...new Set(attempt.conceptIds)].flatMap(conceptId => {
        if (!grammarRuleIdForConcept(conceptId)) return [];
        const current = projection.grammarKnowledge[conceptId] ?? 'unknown';
        const knowledge = knowledgeAfterAttempt(current, attempt.outcome);
        return knowledge === current ? [] : [{
            kind: 'grammar-known-changed' as const,
            conceptId,
            knowledge,
        }];
    });
}

export function mirrorGrammarKnowledgeEvents(events: readonly LearnerEvent[]): void {
    for (const event of events) {
        if (event.kind !== 'grammar-known-changed') continue;
        const ruleId = grammarRuleIdForConcept(event.conceptId);
        if (!ruleId) continue;
        setGrammarRuleKnowledge(ruleId, event.knowledge, {
            at: event.at,
            changeId: event.eventId,
        });
    }
}

/** Reconciles Reader changes and Academy events by their stable change id and timestamp. */
export async function reconcileGrammarKnowledge(record: LearnerRecord): Promise<LearnerProjection> {
    const history = await record.history();
    const latestEvents = latestGrammarEvents(history);
    const shared = readGrammarKnowledge();
    const imports: LearnerEventInput[] = [];

    for (const [ruleId, entry] of Object.entries(shared.entries)) {
        const conceptId = `concept:grammar:${ruleId}`;
        const event = latestEvents.get(conceptId);
        if (!event || compareFacts(entry, eventFact(event)) > 0) {
            imports.push({
                kind: 'grammar-known-changed',
                eventId: entry.changeId,
                at: entry.at,
                conceptId,
                knowledge: entry.knowledge,
            });
        }
    }
    if (imports.length) await record.recordMany(imports);

    const reconciledHistory = imports.length ? await record.history() : history;
    const reconciledEvents = latestGrammarEvents(reconciledHistory);
    for (const event of reconciledEvents.values()) {
        const ruleId = grammarRuleIdForConcept(event.conceptId);
        if (!ruleId) continue;
        const entry = shared.entries[ruleId];
        if (!entry
            || compareFacts(eventFact(event), entry) > 0
            || (event.eventId === entry.changeId && event.knowledge !== entry.knowledge)) {
            setGrammarRuleKnowledge(ruleId, event.knowledge, {
                at: event.at,
                changeId: event.eventId,
            });
        }
    }
    return record.snapshot();
}

function knowledgeAfterAttempt(current: GrammarKnowledge, outcome: AttemptOutcome): GrammarKnowledge {
    if (outcome === 'pass') return current === 'mastered' ? current : 'known';
    return current === 'unknown' ? 'learning' : current;
}

function latestGrammarEvents(events: readonly LearnerEvent[]): Map<string, GrammarEvent> {
    const latest = new Map<string, GrammarEvent>();
    for (const event of events) {
        if (event.kind !== 'grammar-known-changed' || !grammarRuleIdForConcept(event.conceptId)) continue;
        const previous = latest.get(event.conceptId);
        if (!previous || compareFacts(eventFact(event), eventFact(previous)) > 0) latest.set(event.conceptId, event);
    }
    return latest;
}

function eventFact(event: GrammarEvent): GrammarKnowledgeEntry {
    return { knowledge: event.knowledge, at: event.at, changeId: event.eventId };
}

function compareFacts(left: GrammarKnowledgeEntry, right: GrammarKnowledgeEntry): number {
    return left.at - right.at || left.changeId.localeCompare(right.changeId);
}
