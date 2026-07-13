import type { LearnerEvent, LearnerEventInput } from '../domain/learner-record';
import type { AcademyLanguage } from '../../reader/app/academy-copy';
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

export interface CanonicalVocabularyItem {
    readonly id: string;
    readonly key: string;
    readonly expression: string;
    readonly reading?: string;
}

/** Adapter seam over the same collection used by Study/Yomu SRS. */
export interface CanonicalVocabularyCollection {
    findByKey(key: string): Promise<CanonicalVocabularyItem | null>;
    add(input: {
        readonly key: string;
        readonly expression: string;
        readonly reading?: string;
        readonly meanings: readonly string[];
        readonly provenance: Readonly<Record<string, string>>;
    }): Promise<CanonicalVocabularyItem>;
    remove(itemId: string): Promise<void>;
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
    collectEncounter(encounter: VocabularyEncounter): Promise<{ added: boolean; undoEventId?: string }>;
    undoCollection(collectedEventId: string): Promise<boolean>;
}

export function createAcademyStudyDay(
    study: AcademyStudyModule,
    encounters: AcademyStudyVocabularyEncounterSource,
    collection: CanonicalVocabularyCollection,
    evidence: AcademyStudyEvidenceSink,
): AcademyStudyDay {
    const collectedByEvent = new Map<string, { itemId: string; collectionItemId: string }>();
    let pendingCollection = Promise.resolve();

    const collectEncounterNow = async (encounter: VocabularyEncounter): Promise<{ added: boolean; undoEventId?: string }> => {
        if (!encounter.eligible) return { added: false };
        const key = vocabularyKey(encounter.expression, encounter.reading);
        if (await collection.findByKey(key)) return { added: false };
        const item = await collection.add({
            key,
            expression: encounter.expression.trim(),
            ...(encounter.reading?.trim() ? { reading: encounter.reading.trim() } : {}),
            meanings: uniqueText(encounter.meanings),
            provenance: {
                origin: 'academy',
                encounter: encounter.encounterId,
                activity: encounter.activityId,
                ...(encounter.sourceId ? { source: encounter.sourceId } : {}),
            },
        });
        let event: LearnerEvent;
        try {
            event = await evidence.append({
                kind: 'vocabulary-collected',
                eventId: `academy-vocabulary:${encounter.encounterId}`,
                collectionItemId: item.id,
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
            await collection.remove(item.id).catch(() => undefined);
            throw error;
        }
        collectedByEvent.set(event.eventId, { itemId: item.id, collectionItemId: item.id });
        return { added: true, undoEventId: event.eventId };
    };
    const collectEncounter = (encounter: VocabularyEncounter): Promise<{ added: boolean; undoEventId?: string }> => {
        const result = pendingCollection.then(() => collectEncounterNow(encounter));
        pendingCollection = result.then(() => undefined, () => undefined);
        return result;
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
                    collected = { itemId: historical.collectionItemId, collectionItemId: historical.collectionItemId };
                }
            }
            if (!collected) return false;
            await collection.remove(collected.itemId);
            await evidence.append({
                kind: 'vocabulary-collection-undone',
                eventId: `${collectedEventId}:undo`,
                collectionItemId: collected.collectionItemId,
                collectedEventId,
            });
            collectedByEvent.delete(collectedEventId);
            return true;
        },
    };
}

export function vocabularyKey(expression: string, reading?: string): string {
    const normalizedExpression = expression.normalize('NFKC').trim();
    const normalizedReading = (reading ?? normalizedExpression).normalize('NFKC').trim();
    if (!normalizedExpression) throw new TypeError('Vocabulary expression is required.');
    return `${normalizedExpression}\u0000${normalizedReading}`;
}

function uniqueText(values: readonly string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
