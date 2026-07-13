import type { LearnerEvent, LearnerEventInput } from '../domain/learner-record';
import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { canonicalStudyCardKey } from '../../reader/srs/shared';
import { LocalYomuSrsRepository } from '../../reader/srs/local-yomu';
import {
    mountAcademyStudyModule,
    type AcademyStudyModule,
} from './study-module';
import type { Disposable } from './yomu-bridge';

export interface VocabularyEncounter {
    readonly encounterId: string;
    readonly activityId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sourceId?: string;
    readonly eligible: boolean;
}

/** Adapter seam emitted by the canonical Study Module when it exposes an eligible word. */
export interface AcademyStudyVocabularyEncounterSource {
    subscribe(listener: (encounter: VocabularyEncounter) => void | Promise<void>): Disposable;
}

export interface AcademyStudyEvidenceSink {
    append(input: LearnerEventInput): Promise<LearnerEvent>;
    history(): Promise<readonly LearnerEvent[]>;
}

export interface AcademyStudyDay {
    mount(host: HTMLElement, options: {
        readonly language: AcademyLanguage;
        readonly durationMs?: number;
        readonly now?: () => number;
        readonly onExit: () => void;
        readonly onCompleted?: () => void;
    }): Promise<Disposable>;
    collectEncounter(encounter: VocabularyEncounter): Promise<{ added: boolean; cardCreated?: boolean; undoEventId?: string }>;
    undoCollection(collectedEventId: string): Promise<boolean>;
}

export function createAcademyStudyDay(
    study: AcademyStudyModule,
    encounters: AcademyStudyVocabularyEncounterSource,
    repository: LocalYomuSrsRepository,
    evidence: AcademyStudyEvidenceSink,
): AcademyStudyDay {
    const collectedByEvent = new Map<string, { cardId: string; provenanceId: string }>();

    const collectEncounter = async (encounter: VocabularyEncounter): Promise<{ added: boolean; cardCreated?: boolean; undoEventId?: string }> => {
        if (!encounter.eligible) return { added: false };
        const provenanceId = encounterProvenanceId(encounter.encounterId);
        const collected = await repository.collectAcademyVocabulary({
            expression: encounter.expression.trim(),
            reading: encounter.reading,
            meanings: uniqueText(encounter.meanings),
            provenance: {
                id: provenanceId,
                kind: 'study-encounter',
                activityId: encounter.activityId,
                sourceId: encounter.sourceId,
            },
        });
        if (!collected.provenanceAdded) return { added: false };
        let event: LearnerEvent;
        try {
            event = await evidence.append({
                kind: 'vocabulary-collected',
                eventId: `academy-vocabulary:${encounter.encounterId}`,
                collectionItemId: collected.cardId,
                expression: encounter.expression,
                ...(encounter.reading ? { reading: encounter.reading } : {}),
                meanings: uniqueText(encounter.meanings),
                provenance: {
                    origin: 'academy',
                    encounterId: encounter.encounterId,
                    activityId: encounter.activityId,
                    ...(encounter.sourceId ? { sourceId: encounter.sourceId } : {}),
                },
            });
        } catch (error) {
            await repository.removeAcademyVocabularyProvenance(collected.cardId, provenanceId).catch(() => undefined);
            throw error;
        }
        collectedByEvent.set(event.eventId, { cardId: collected.cardId, provenanceId });
        return { added: true, cardCreated: collected.cardCreated, undoEventId: event.eventId };
    };

    return {
        async mount(host, options) {
            const encounterLifecycle = encounters.subscribe(async encounter => { await collectEncounter(encounter); });
            try {
                const studyLifecycle = await mountAcademyStudyModule(host, study, {
                    language: options.language,
                    durationMs: options.durationMs,
                    now: options.now,
                    onExit: options.onExit,
                    onSessionComplete: options.onCompleted,
                });
                return {
                    dispose() {
                        encounterLifecycle.dispose();
                        studyLifecycle.dispose();
                    },
                };
            } catch (error) {
                encounterLifecycle.dispose();
                throw error;
            }
        },
        collectEncounter,
        async undoCollection(collectedEventId) {
            const history = await evidence.history();
            if (history.some(event => event.kind === 'vocabulary-collection-undone' && event.collectedEventId === collectedEventId)) return false;
            let collected = collectedByEvent.get(collectedEventId);
            if (!collected) {
                const historical = history.find(event =>
                    event.eventId === collectedEventId && event.kind === 'vocabulary-collected');
                if (historical?.kind === 'vocabulary-collected') {
                    collected = {
                        cardId: vocabularyKey(historical.expression, historical.reading),
                        provenanceId: encounterProvenanceId(historical.provenance.encounterId),
                    };
                }
            }
            if (!collected) return false;
            const removed = await repository.removeAcademyVocabularyProvenance(collected.cardId, collected.provenanceId);
            if (!removed.provenanceRemoved) return false;
            await evidence.append({
                kind: 'vocabulary-collection-undone',
                eventId: `${collectedEventId}:undo`,
                collectionItemId: collected.cardId,
                collectedEventId,
            });
            collectedByEvent.delete(collectedEventId);
            return true;
        },
    };
}

function encounterProvenanceId(encounterId: string): string {
    return `academy:encounter:${encounterId}`;
}

export function vocabularyKey(expression: string, reading?: string): string {
    return canonicalStudyCardKey(expression, reading);
}

function uniqueText(values: readonly string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
