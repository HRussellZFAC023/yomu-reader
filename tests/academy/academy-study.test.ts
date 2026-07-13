import { createLearnerRecord } from '../../src/academy/domain/learner-record';
import {
    createAcademyStudyDay,
    type AcademyStudyVocabularyEncounterSource,
    type CanonicalVocabularyCollection,
    type CanonicalVocabularyItem,
} from '../../src/academy/integration/academy-study';
import { DEFAULT_ACADEMY_STUDY_DURATION_MS, type AcademyStudyMountContext, type AcademyStudyModule } from '../../src/academy/integration/study-module';
import { ACADEMY_OVERFLOW_DESTINATIONS } from '../../src/academy/routing/overflow-destinations';

describe('Academy Study Module seam', () => {
    it('mounts the shared Study implementation with Academy theme and a configurable 15:00 countdown', async () => {
        vi.useFakeTimers();
        let mounted: AcademyStudyMountContext | null = null;
        const study: AcademyStudyModule = {
            mount(_host, context) {
                mounted = context;
                return { dispose() {} };
            },
        };
        const record = createLearnerRecord();
        const day = createAcademyStudyDay(study, encounterSource(), memoryCollection(), {
            append: input => record.record(input),
            history: () => record.history(),
        });
        const lifecycle = await day.mount(document.createElement('main'), { language: 'en', onExit() {} });
        expect(mounted).toMatchObject({
            surface: { id: 'academy', theme: 'living-paper' },
            countdown: { durationMs: DEFAULT_ACADEMY_STUDY_DURATION_MS, mode: 'countdown' },
        });
        expect(DEFAULT_ACADEMY_STUDY_DURATION_MS).toBe(900_000);
        lifecycle.dispose();
        vi.useRealTimers();
    });

    it('automatically adds eligible encounters to the canonical collection with provenance, dedupe, and durable undo', async () => {
        const collection = memoryCollection();
        const record = createLearnerRecord();
        const evidence = { append: record.record, history: record.history };
        const study: AcademyStudyModule = { mount: () => ({ dispose() {} }) };
        const encounter = {
            encounterId: 'encounter:駅',
            activityId: 'study:station',
            expression: '駅',
            reading: 'えき',
            meanings: ['station'],
            sourceId: 'source:week-1',
            eligible: true,
        } as const;
        const firstDay = createAcademyStudyDay(study, encounterSource(), collection, evidence);
        const [first, duplicate] = await Promise.all([
            firstDay.collectEncounter(encounter),
            firstDay.collectEncounter({ ...encounter, encounterId: 'encounter:駅:again' }),
        ]);
        expect(first.added).toBe(true);
        expect(duplicate).toEqual({ added: false });
        const collected = (await record.history()).find(event => event.kind === 'vocabulary-collected');
        expect(collected).toMatchObject({
            expression: '駅',
            provenance: { origin: 'academy', encounterId: 'encounter:駅', activityId: 'study:station', sourceId: 'source:week-1' },
        });
        const resumedDay = createAcademyStudyDay(study, encounterSource(), collection, evidence);
        await expect(resumedDay.undoCollection(first.undoEventId!)).resolves.toBe(true);
        await expect(resumedDay.undoCollection(first.undoEventId!)).resolves.toBe(false);
        expect(collection.size()).toBe(0);
        expect((await record.snapshot()).vocabularyCollection).toEqual({});
    });

    it('keeps Settings, Achievements, and the opt-in Class Board in the top-left overflow contract', () => {
        expect(ACADEMY_OVERFLOW_DESTINATIONS.map(destination => destination.id)).toEqual([
            'choose-lesson', 'end-day', 'settings', 'achievements', 'class-board',
        ]);
        expect(ACADEMY_OVERFLOW_DESTINATIONS.filter(destination => destination.enrollmentRequired).map(destination => destination.id))
            .toEqual(['choose-lesson', 'end-day']);
        expect(ACADEMY_OVERFLOW_DESTINATIONS.find(destination => destination.id === 'class-board')?.accountRequired).toBe(true);
    });
});

function memoryCollection(): CanonicalVocabularyCollection & { size(): number } {
    const items = new Map<string, CanonicalVocabularyItem>();
    return {
        async findByKey(key) { return [...items.values()].find(item => item.key === key) ?? null; },
        async add(input) {
            const item = { id: `canonical:${input.key}`, key: input.key, expression: input.expression, reading: input.reading };
            items.set(item.id, item);
            return item;
        },
        async remove(itemId) { items.delete(itemId); },
        size: () => items.size,
    };
}

function encounterSource(): AcademyStudyVocabularyEncounterSource {
    return { subscribe: () => ({ dispose() {} }) };
}
