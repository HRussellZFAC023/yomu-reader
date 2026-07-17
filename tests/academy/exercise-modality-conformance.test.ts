import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createOpeningKanjiActivity } from '../../src/academy/activities/kanji-writing';
import type { ChoiceActivityModel } from '../../src/academy/activities/choice';
import { createLessonL2L26KuruImperativeBeat, createLessonL2L26RunnerSequenceBeat, createLessonL2L26SignMeaningBeat, createLessonL2L26VerbGroupSortBeat } from '../../src/academy/content/lesson-l2-l26-imperative-source-return';
import { createLessonThreeMoodleListeningModel } from '../../src/academy/content/lesson-three-moodle-listening';
import { createLessonThirtySevenTrack78BankListeningBeat } from '../../src/academy/content/lesson-thirty-seven-track-78-bank-listening';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';
import { createMegaPackReaderBeat } from '../../src/academy/content/mega-pack-reader';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type ActivityController, type ActivityModel } from '../../src/academy/domain/activity-runtime';
import {
    ACADEMY_EXERCISE_MODALITY_REGISTRY,
    AUTHORED_EXERCISE_DELIVERY_REGISTRY,
    academyExerciseModality,
    authoredExerciseDelivery,
    type AcademyExerciseModalityId,
} from '../../src/academy/domain/exercise-modality-registry';
import type { KanjiWritingModel } from '../../src/academy/integration/yomu-bridge';
import {
    ACADEMY_ACTIVITY_PLUGINS,
    createAcademyActivityRuntime,
    type BankListeningClozeModel,
    type DragSortModel,
    type SequenceModel,
    type SourceVocabularySheetModel,
    type StoryReaderModel,
    type TypedResponseModel,
} from '../../src/academy/minigames';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';

const REQUIRED_MODALITIES: readonly AcademyExerciseModalityId[] = [
    'japanese-to-english',
    'english-to-japanese',
    'multiple-choice',
    'free-response',
    'listening',
    'speaking',
    'drawing',
    'ordering',
    'matching',
    'cloze',
    'reading',
    'srs-grading',
];

const TRACE: KanjiWritingModel = {
    character: '一',
    svg: '<svg viewBox="0 0 109 109"><path d="M10 50 L99 50"/></svg>',
    strokeCount: 1,
    strokeShapes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
    source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'conformance' },
};

afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
});

describe('Academy exercise modality conformance', () => {
    it('registers every required claim and keeps specialized modalities off generic authored fallbacks', () => {
        expect(ACADEMY_EXERCISE_MODALITY_REGISTRY.map(entry => entry.id)).toEqual(REQUIRED_MODALITIES);
        const pluginKinds = new Set(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind));
        const pluginEntries = ACADEMY_EXERCISE_MODALITY_REGISTRY.filter(entry => entry.surface === 'activity-plugin');
        for (const entry of pluginEntries) {
            expect(entry.status, entry.id).toBe('native');
            expect(entry.runtimeKinds.length, entry.id).toBeGreaterThan(0);
            expect(entry.runtimeKinds.every(kind => pluginKinds.has(kind)), entry.id).toBe(true);
            expect(entry.responseKinds.length, entry.id).toBeGreaterThan(0);
        }

        const specialized = ['listening', 'drawing', 'ordering', 'matching', 'cloze', 'reading'] as const;
        const specializedKinds = specialized.map(id => academyExerciseModality(id).runtimeKinds[0]);
        expect(new Set(specializedKinds).size).toBe(specializedKinds.length);
        for (const kind of specializedKinds) {
            expect(['choice', 'text', 'academy-class-simulator']).not.toContain(kind);
        }

        expect(academyExerciseModality('speaking')).toMatchObject({
            status: 'guided-only',
            surface: 'runtime-ui',
            runtimeKinds: [],
            responseKinds: [],
        });
        expect(academyExerciseModality('speaking').limitation).toMatch(/no mounted microphone capture/i);
    });

    it('keeps JP -> EN and EN -> JP cues and grading directionally distinct', () => {
        const runtime = createAcademyActivityRuntime();
        const japaneseToEnglish = sourceVocabularyModel(1);
        const englishToJapanese = sourceVocabularyModel(2);

        expect(runtime.evaluate(japaneseToEnglish, 'welcome').result.outcome).toBe('pass');
        expect(runtime.evaluate(japaneseToEnglish, 'ようこそ').result.outcome).toBe('lapse');
        expect(runtime.evaluate(englishToJapanese, 'ようこそ').result.outcome).toBe('pass');
        expect(runtime.evaluate(englishToJapanese, 'welcome').result.outcome).toBe('lapse');

        const first = mount(japaneseToEnglish);
        const second = mount(englishToJapanese);
        try {
            expect(first.host.querySelector<HTMLElement>('[data-direction]')?.dataset.direction).toBe('japanese-to-english');
            expect(first.host.querySelector('.academy-source-vocabulary-word')?.textContent).toBe('ようこそ');
            expect(second.host.querySelector<HTMLElement>('[data-direction]')?.dataset.direction).toBe('english-to-japanese');
            expect(second.host.querySelector('.academy-source-vocabulary-meaning')?.textContent).toBe('welcome');
        } finally {
            first.controller.dispose();
            second.controller.dispose();
        }
    });

    it('grades native choice, free response, listening, drawing, ordering, matching, cloze, and reading models', () => {
        const runtime = createAcademyActivityRuntime();
        const choice = createLessonL2L26SignMeaningBeat().activity as ChoiceActivityModel;
        const freeResponse = createLessonL2L26KuruImperativeBeat().activity as TypedResponseModel;
        const listening = createLessonThreeMoodleListeningModel();
        const drawing = createOpeningKanjiActivity(TRACE);
        const ordering = createLessonL2L26RunnerSequenceBeat().activity as SequenceModel;
        const matching = createLessonL2L26VerbGroupSortBeat().activity as DragSortModel;
        const cloze = createLessonThirtySevenTrack78BankListeningBeat().activity as BankListeningClozeModel;
        const reading = createMegaPackReaderBeat().activity as StoryReaderModel;
        const models = [choice, freeResponse, listening, drawing, ordering, matching, cloze, reading];

        for (const model of models) expect(runtime.validate(model), model.kind).toEqual([]);
        expect(runtime.evaluate(choice, 'do-not-use').result.outcome).toBe('pass');
        expect(runtime.evaluate(freeResponse, 'こい').result.outcome).toBe('pass');
        expect(runtime.evaluate(listening, {
            answers: listening.payload.tracks.flatMap(track => track.prompts.map(prompt => ({
                promptId: prompt.id,
                optionId: prompt.correctOptionId,
            }))),
        }).result.outcome).toBe('pass');
        expect(runtime.evaluate(drawing, {
            phase: 'writing',
            inputMode: 'doodle',
            assessment: { passed: true, score: 95, expectedStrokes: 1, actualStrokes: 1, message: 'One stroke' },
        }).result).toMatchObject({ outcome: 'pass', errorTags: expect.arrayContaining(['kanji-writing-doodle']) });
        expect(runtime.evaluate(ordering, { order: ordering.payload.correctOrder }).result.outcome).toBe('pass');
        expect(runtime.evaluate(matching, {
            placements: matching.payload.items.map(item => ({ itemId: item.id, zoneId: item.correctZoneId })),
        }).result.outcome).toBe('pass');
        expect(runtime.evaluate(cloze, {
            values: cloze.payload.fields.map(field => ({ fieldId: field.id, value: field.answer })),
            choice: cloze.payload.choice.answer,
        }).result.outcome).toBe('pass');
        expect(runtime.evaluate(reading, {
            answers: reading.payload.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })),
        }).result.outcome).toBe('pass');
    });

    it('renders modality-specific controls instead of relabelled choice or text forms', () => {
        const listening = mount(createLessonThreeMoodleListeningModel());
        const freeResponse = mount(createLessonL2L26KuruImperativeBeat().activity);
        const ordering = mount(createLessonL2L26RunnerSequenceBeat().activity);
        const matching = mount(createLessonL2L26VerbGroupSortBeat().activity);
        const cloze = mount(createLessonThirtySevenTrack78BankListeningBeat().activity);
        const reading = mount(createMegaPackReaderBeat().activity);
        try {
            expect(listening.host.querySelectorAll('audio').length).toBeGreaterThan(0);
            expect(freeResponse.host.querySelector('.academy-typed-response-input')).toBeInstanceOf(HTMLInputElement);
            expect(ordering.host.querySelectorAll('.academy-sequence-item')).toHaveLength(3);
            expect(ordering.host.querySelector('.academy-sequence-controls')).not.toBeNull();
            expect(matching.host.querySelectorAll('.academy-drag-item').length).toBeGreaterThan(1);
            expect(matching.host.querySelector('.academy-drag-keyboard-controls')).not.toBeNull();
            expect(cloze.host.querySelectorAll('input[type="text"]')).toHaveLength(8);
            expect(cloze.host.querySelector('audio')).not.toBeNull();
            expect(reading.host.querySelectorAll('article.academy-story-reader-passage section')).toHaveLength(2);
        } finally {
            [listening, freeResponse, ordering, matching, cloze, reading]
                .forEach(entry => entry.controller.dispose());
        }
    });

    it('pins the authored-week delivery census so generic fallbacks cannot satisfy native modality claims', async () => {
        const census = await authoredDeliveryCensus();
        expect([...census.keys()].sort()).toEqual(
            AUTHORED_EXERCISE_DELIVERY_REGISTRY.map(entry => entry.sourceKind).sort(),
        );

        for (const expected of AUTHORED_EXERCISE_DELIVERY_REGISTRY) {
            const actual = census.get(expected.sourceKind)!;
            expect(actual.sourceExercises, expected.sourceKind).toBe(expected.expectedSourceExercises);
            expect(actual.linkedExercises, expected.sourceKind).toBe(expected.expectedLinkedExercises);
            expect(actual.runtimeActivities, expected.sourceKind).toBe(expected.expectedRuntimeActivities);
            expect([...actual.runtimeKinds].sort(), expected.sourceKind).toEqual([...expected.expectedRuntimeKinds].sort());
            expect(authoredExerciseDelivery(expected.sourceKind)).toBe(expected);
        }

        for (const sourceKind of ['cloze', 'ordering', 'matching']) {
            const registration = authoredExerciseDelivery(sourceKind);
            expect(registration.delivery).toBe('generic-fallback');
            expect(registration.expectedRuntimeKinds.every(kind => kind === 'choice' || kind === 'text')).toBe(true);
            expect(registration.expectedRuntimeKinds).not.toContain(
                academyExerciseModality(registration.modality).runtimeKinds[0],
            );
        }
    });

    it('keeps Again, Hard, Good, and Easy as four distinct local SRS grades', async () => {
        const now = Date.parse('2026-07-17T12:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const grades = [
            ['again', 10 * 60_000],
            ['hard', 86_400_000],
            ['good', 2 * 86_400_000],
            ['easy', 4 * 86_400_000],
        ] as const;

        const dueTimes: number[] = [];
        for (const [grade, delay] of grades) {
            const collected = await repository.collectAcademyVocabulary({
                expression: `復習-${grade}`,
                reading: `ふくしゅう-${grade}`,
                meanings: [`review ${grade}`],
                provenance: { id: `conformance:${grade}`, kind: 'study-encounter', sourceId: 'exercise-modality-conformance' },
            });
            const reviewed = await repository.review({ card: collected.card, grade });
            expect(reviewed.card?.dueAt, grade).toBe(now + delay);
            dueTimes.push(reviewed.card!.dueAt!);
        }
        expect(new Set(dueTimes).size).toBe(4);
        expect(academyExerciseModality('srs-grading').responseKinds).toEqual(grades.map(([grade]) => grade));
    });
});

function sourceVocabularyModel(row: number): SourceVocabularySheetModel {
    return {
        id: `activity:modality-direction-${row}`,
        kind: 'academy-source-vocabulary-sheet',
        responseKind: 'source-vocabulary-recall',
        sourceQuestionId: `source:direction-${row}`,
        conceptIds: [`concept:direction-${row}`],
        prompt: { ja: '答えましょう。', en: 'Answer.' },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        provenance: {
            packageId: 'conformance',
            componentId: 'direction-sheet',
            sourceId: 'source:direction-sheet',
            sourceQuestionId: `source:direction-${row}`,
            payloadSha256: 'a'.repeat(64),
            sourceTitle: 'Direction fixture',
            locus: { page: 1, row },
        },
        payload: {
            exact: { words: 'ようこそ', pronunciation: 'ようこそ', meaning: 'welcome' },
            support: { words: 'ようこそ', reading: 'ようこそ', meaning: 'welcome' },
            fieldProvenance: { words: 'source-provided', reading: 'source-provided', meaning: 'source-provided' },
        },
    };
}

function mount(model: ActivityModel): { readonly host: HTMLElement; readonly controller: ActivityController } {
    const host = document.createElement('main');
    document.body.append(host);
    const controller = createAcademyActivityRuntime().mount(model, {
        language: 'en',
        replace(view) { host.replaceChildren(view); },
        announce() {},
    }, () => {});
    return { host, controller };
}

interface DeliveryCensusRow {
    sourceExercises: number;
    linkedExercises: number;
    runtimeActivities: number;
    runtimeKinds: Set<string>;
}

async function authoredDeliveryCensus(): Promise<Map<string, DeliveryCensusRow>> {
    const census = new Map<string, DeliveryCensusRow>();
    const registrations = ACADEMY_LESSON_CONTENT_REGISTRY.filter(entry => entry.kind === 'authored-week');
    for (const registration of registrations) {
        const fileBytes = readFileSync(path.resolve('public/academy/content/lessons', registration.filename));
        const loaded = await registration.validate(Uint8Array.from(fileBytes).buffer);
        const raw = loaded.value as {
            components?: readonly Readonly<{ exercises?: readonly Readonly<{ id?: unknown; kind?: unknown }>[] }>[];
        };
        const week = loaded.week;
        for (const component of raw.components ?? []) {
            for (const exercise of component.exercises ?? []) {
                if (typeof exercise.id !== 'string' || typeof exercise.kind !== 'string') {
                    throw new TypeError(`${registration.filename} contains an exercise without a stable id and kind.`);
                }
                const linked = week.activities.filter(activity => {
                    const sourceQuestionId = activity.sourceQuestionId;
                    const prefix = `${registration.packageId}/${exercise.id}`;
                    return sourceQuestionId === prefix || sourceQuestionId.startsWith(`${prefix}:`);
                });
                const row = census.get(exercise.kind) ?? {
                    sourceExercises: 0,
                    linkedExercises: 0,
                    runtimeActivities: 0,
                    runtimeKinds: new Set<string>(),
                };
                row.sourceExercises += 1;
                row.linkedExercises += linked.length > 0 ? 1 : 0;
                row.runtimeActivities += linked.length;
                linked.forEach(activity => row.runtimeKinds.add(activity.kind));
                census.set(exercise.kind, row);
            }
        }
    }
    return census;
}
