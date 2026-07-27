import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import {
    loadAcademyCheckpointSafely,
    migrateAcademyCheckpoint,
    openAcademyPersistence,
} from '../../src/academy/persistence/indexeddb';
import {
    createLearnerRecord,
    type LearnerEvent,
} from '../../src/academy/domain/learner-record';
import { projectCharacterDirectory } from '../../src/academy/domain/progress-projections';

describe('Academy IndexedDB persistence', () => {
    it('recovers a corrupt checkpoint without discarding learner events or blocking boot', async () => {
        const fallback = {
            schemaVersion: 2 as const,
            route: 'access' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
            updatedAt: 123,
        };
        const save = vi.fn(async () => undefined);

        await expect(loadAcademyCheckpointSafely({
            load: async () => { throw new TypeError('corrupt checkpoint'); },
            save,
        }, fallback)).resolves.toEqual(fallback);
        expect(save).toHaveBeenCalledWith(fallback);

        await expect(loadAcademyCheckpointSafely({
            load: async () => { throw new TypeError('corrupt checkpoint'); },
            save: async () => { throw new Error('read-only storage'); },
        }, fallback)).resolves.toEqual(fallback);
    });

    it('restores idempotent learner events and an offline navigation checkpoint', async () => {
        const name = `academy-test-${crypto.randomUUID()}`;
        const persistence = await openAcademyPersistence(fakeIndexedDB, name);
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'event-1',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:opening',
        };
        await persistence.events.append([event, structuredClone(event)]);
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'campus',
            routeHistory: [{ route: 'class', selectedBand: 'n4' }],
            presentationMode: 'course',
            selectedBand: 'n4',
            selectedFork: 'sound',
            session: {
                sessionId: 'local-session',
                expiresAt: 200,
                offlineResumeUntil: 300,
                accountRequired: false,
                source: 'local-qa',
            },
            updatedAt: 101,
        });
        persistence.close();

        const restored = await openAcademyPersistence(fakeIndexedDB, name);
        expect(await restored.events.readAll()).toEqual([event]);
        expect(await restored.checkpoint.load()).toMatchObject({
            schemaVersion: 2,
            route: 'campus',
            routeHistory: [{ route: 'class', selectedBand: 'n4' }],
            presentationMode: 'course',
            selectedBand: 'n4',
            selectedFork: 'sound',
        });
        restored.close();
    });

    it('persists an unaccepted placement draft and rejects malformed production state', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const placementProgress = {
            schemaVersion: 1 as const,
            step: 5,
            submitted: false,
            draft: {
                targetBand: 'n4' as const,
                responses: { 'orientation:n4:item': 'choice-2' },
                listeningModes: { 'orientation:n4:listening': 'transcript-alternative' as const },
                production: {
                    speaking: { mode: 'typed-alternative' as const, completed: true, response: '例です。', confidence: 0.5, rated: true },
                    writing: { mode: 'paper-alternative' as const, completed: true, response: '', confidence: 1, rated: true },
                },
            },
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'placement-mock',
            routeHistory: [{ route: 'start' }],
            presentationMode: 'story',
            placementProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ placementProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'placement-mock',
            routeHistory: [],
            presentationMode: 'story',
            placementProgress: {
                ...placementProgress,
                draft: {
                    ...placementProgress.draft,
                    production: {
                        ...placementProgress.draft.production,
                        speaking: { ...placementProgress.draft.production.speaking, rated: 'yes' },
                    },
                },
            } as never,
            updatedAt: 102,
        })).rejects.toThrow('invalid placement progress');
        persistence.close();
    });

    it('rejects conflicting event ids instead of overwriting evidence', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'event-1',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:opening',
        };
        await persistence.events.append([event]);
        await expect(persistence.events.append([{ ...event, sceneId: 'scene:other' }])).rejects.toThrow('Conflicting learner event id');
        expect(await persistence.events.readAll()).toEqual([event]);
        persistence.close();
    });

    it('persists a day-end navigation checkpoint without a completion event', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'day-end',
            routeHistory: [{ route: 'campus' }],
            presentationMode: 'story',
            session: {
                sessionId: 'local-session',
                expiresAt: 200,
                offlineResumeUntil: 300,
                accountRequired: false,
                source: 'local-qa',
            },
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ route: 'day-end' });
        expect(await persistence.events.readAll()).toEqual([]);
        persistence.close();
    });

    it('persists authored-week cursors outside route history and rejects malformed cursor data', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'classroom',
            routeHistory: [],
            presentationMode: 'story',
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: '0'.repeat(64),
                    position: { phase: 'question', activityId: 'authored:l1-l01/ex-input-job' },
                },
            },
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({
            route: 'classroom',
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: '0'.repeat(64),
                    position: { phase: 'question', activityId: 'authored:l1-l01/ex-input-job' },
                },
            },
        });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'classroom',
            routeHistory: [],
            presentationMode: 'story',
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: '0'.repeat(64),
                    position: { phase: 'question', activityId: '' },
                },
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid authored week progress');
        persistence.close();
    });

    it('persists classroom-expression progress and rejects malformed session snapshots', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const classroomExpressionProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-classroom-expressions' as const,
            status: 'paused' as const,
            cursor: {
                phaseId: 'understanding-and-repair' as const,
                expressionId: 'classroom-08',
                probeId: 'probe:classroom-08-check',
            },
            attempts: [{
                probeId: 'probe:classroom-08-check',
                sourceQuestionId: 'question:lesson-zero-classroom-08',
                outcome: 'lapse' as const,
                independent: true,
                at: 100,
            }],
            passedProbeIds: [],
            revealedModelProbeIds: [],
            visitedExpressionIds: ['classroom-08'],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-reconstruct-repair',
            classroomExpressionProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ classroomExpressionProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-reconstruct-repair',
            classroomExpressionProgress: {
                ...classroomExpressionProgress,
                attempts: [{ ...classroomExpressionProgress.attempts[0], at: -1 }],
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid classroom-expression progress');
        persistence.close();
    });

    it('persists embodied classroom-instruction progress and rejects unknown actions', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const classroomInstructionProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-follow-instructions' as const,
            status: 'paused' as const,
            cursor: 1,
            passedCueIds: ['cue:lesson-zero-instruction:look'],
            attempts: [{
                cueId: 'cue:lesson-zero-instruction:look',
                chosenActionId: 'look' as const,
                outcome: 'pass' as const,
                at: 100,
            }],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-follow-instructions',
            classroomInstructionProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ classroomInstructionProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-follow-instructions',
            classroomInstructionProgress: {
                ...classroomInstructionProgress,
                attempts: [{ ...classroomInstructionProgress.attempts[0], chosenActionId: 'teleport' as never }],
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid classroom-instruction progress');
        persistence.close();
    });

    it('persists the desk-paper transfer and rejects negative progress', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroDeskLanguageProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-desk-language' as const,
            status: 'paused' as const,
            stage: 'practice' as const,
            practiceIndex: 1,
            transferIndex: 0,
            practicePassedWordIds: ['homework'] as const,
            transferPassedWordIds: [] as const,
            attempts: [{
                round: 'practice' as const,
                wordId: 'homework' as const,
                chosenPropId: 'take-home-sheet' as const,
                outcome: 'pass' as const,
                at: 100,
            }],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-desk-language',
            lessonZeroDeskLanguageProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroDeskLanguageProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-desk-language',
            lessonZeroDeskLanguageProgress: {
                ...lessonZeroDeskLanguageProgress,
                practiceIndex: -1,
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid Lesson Zero desk-language progress');
        persistence.close();
    });

    it('persists the first greeting and rejects impossible session stages', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroGreetingProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-greet-rie' as const,
            status: 'paused' as const,
            stage: 'rehearse' as const,
            selectedChunkIds: ['evening', 'first-meeting', 'name', 'closing'] as const,
            arrangementAttempts: 1,
            mode: 'typed' as const,
            attempts: [],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-greet-rie',
            lessonZeroGreetingProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroGreetingProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-greet-rie',
            lessonZeroGreetingProgress: {
                ...lessonZeroGreetingProgress,
                status: 'complete',
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid Lesson Zero greeting progress');
        persistence.close();
    });

    it('persists a first-sentence build and rejects non-chronological frame snapshots', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroSentenceFrameProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-sentence-frames' as const,
            status: 'paused' as const,
            stage: 'build' as const,
            cursor: 1,
            selectedTokenIds: ['rie'],
            attempts: [{
                frameId: 'identity' as const,
                order: ['self', 'topic', 'name', 'copula', 'stop'],
                outcome: 'pass' as const,
                score: 1,
                at: 100,
            }],
            passedFrameIds: ['identity'] as const,
            revealedModelFrameIds: [] as const,
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-build-sentence-frames',
            lessonZeroSentenceFrameProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroSentenceFrameProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-build-sentence-frames',
            lessonZeroSentenceFrameProgress: {
                ...lessonZeroSentenceFrameProgress,
                passedFrameIds: ['correction'] as const,
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid Lesson Zero sentence-frame progress');
        persistence.close();
    });

    it('persists name-card token progress without copying the player name', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroNameCardProgress = {
            schemaVersion: 2 as const,
            sessionId: 'session:lesson-zero-name-card-draft' as const,
            status: 'paused' as const,
            stage: 'build' as const,
            nameVariant: 'katakana' as const,
            selectedTokenIds: ['learner-name'] as const,
            selectedTransferId: null,
            attempts: [],
            modelRevealed: false,
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-name-card-draft',
            lessonZeroNameCardProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroNameCardProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-name-card-draft',
            lessonZeroNameCardProgress: {
                ...lessonZeroNameCardProgress,
                selectedTokenIds: ['learner-name', 'learner-name'] as const,
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid Lesson Zero name-card progress');
        persistence.close();
    });

    it('persists the five-vowel lesson and rejects impossible round snapshots', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroVowelProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-vowel-listen' as const,
            status: 'paused' as const,
            stage: 'learn' as const,
            variant: 'lesson' as const,
            mode: 'audio' as const,
            learnedItemIds: ['hira-a'],
            roundOrder: [],
            heardRoundIds: [],
            selections: [],
            repairItemIds: [],
            repairCursor: 0,
            baseCompleted: false,
            bingoWins: 0,
            attempts: [],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-listen',
            lessonZeroVowelProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroVowelProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-listen',
            lessonZeroVowelProgress: {
                ...lessonZeroVowelProgress,
                stage: 'attempt',
                roundOrder: [],
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid Lesson Zero vowel progress');
        persistence.close();
    });

    it('persists the all-46 hiragana route and rejects an empty active queue', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroHiraganaProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-hiragana-bootcamp' as const,
            status: 'paused' as const,
            stage: 'row-drill' as const,
            route: 'guided' as const,
            rowIndex: 0,
            queue: ['hira-a', 'hira-i', 'hira-u', 'hira-e', 'hira-o'],
            guidedPassedItemIds: [],
            masteryPassedItemIds: [],
            repairedItemIds: [],
            attempts: [],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-hiragana-bootcamp',
            lessonZeroHiraganaProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroHiraganaProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-hiragana-bootcamp',
            lessonZeroHiraganaProgress: {
                ...lessonZeroHiraganaProgress,
                queue: [],
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid Lesson Zero hiragana progress');
        persistence.close();
    });

    it('persists the five-vowel writing desk and rejects impossible completion snapshots', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const lessonZeroVowelWritingProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-vowel-doodle' as const,
            status: 'paused' as const,
            stage: 'attempt' as const,
            mode: 'plan' as const,
            learnedItemIds: ['hira-a'] as const,
            completedItemIds: [] as const,
            guideItemIds: [] as const,
            attempts: [] as const,
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-doodle',
            lessonZeroVowelWritingProgress,
            updatedAt: 103,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ lessonZeroVowelWritingProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-vowel-doodle',
            lessonZeroVowelWritingProgress: {
                ...lessonZeroVowelWritingProgress,
                status: 'complete',
                stage: 'complete',
                completedItemIds: ['hira-a'],
            },
            updatedAt: 104,
        })).rejects.toThrow('invalid Lesson Zero vowel-writing progress');
        persistence.close();
    });

    it('migrates schema 1 checkpoints without losing the invite session or lesson state', () => {
        expect(migrateAcademyCheckpoint({
            schemaVersion: 1,
            route: 'source-activity',
            selectedBand: 'n4',
            selectedFork: 'sound',
            placementOverride: true,
            session: {
                sessionId: 'existing-session',
                expiresAt: 2_000,
                offlineResumeUntil: 3_000,
                accountRequired: true,
                source: 'cloudflare',
            },
            updatedAt: 101,
        })).toEqual({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            selectedBand: 'n4',
            selectedFork: 'sound',
            placementOverride: true,
            session: {
                sessionId: 'existing-session',
                expiresAt: 2_000,
                offlineResumeUntil: 3_000,
                accountRequired: true,
                source: 'cloudflare',
            },
            updatedAt: 101,
        });
    });

    it('writes a migrated schema 1 checkpoint back during IndexedDB resume', async () => {
        const name = `academy-test-${crypto.randomUUID()}`;
        (await openAcademyPersistence(fakeIndexedDB, name)).close();
        const database = await openDatabase(name);
        const transaction = database.transaction('meta', 'readwrite');
        transaction.objectStore('meta').put({
            id: 'active-checkpoint',
            value: {
                schemaVersion: 1,
                route: 'review',
                session: {
                    sessionId: 'existing-session',
                    expiresAt: 2_000,
                    offlineResumeUntil: 3_000,
                    accountRequired: true,
                    source: 'cloudflare',
                },
                selectedFork: 'text',
                updatedAt: 101,
            },
        });
        await transactionDone(transaction);
        database.close();

        const restored = await openAcademyPersistence(fakeIndexedDB, name);
        expect(await restored.checkpoint.load()).toMatchObject({
            schemaVersion: 2,
            route: 'review',
            routeHistory: [],
            presentationMode: 'story',
            selectedFork: 'text',
            session: { sessionId: 'existing-session' },
        });
        restored.close();

        const writtenDatabase = await openDatabase(name);
        const written = await request<{ value: { schemaVersion: number } }>(
            writtenDatabase.transaction('meta').objectStore('meta').get('active-checkpoint'),
        );
        expect(written.value.schemaVersion).toBe(2);
        writtenDatabase.close();
    });

    it('rejects authentication material inside persisted route-history frames', () => {
        expect(() => migrateAcademyCheckpoint({
            schemaVersion: 2,
            route: 'class',
            routeHistory: [{ route: 'access', session: { sessionId: 'must-not-be-copied' } }],
            presentationMode: 'story',
            updatedAt: 101,
        })).toThrow('invalid route history');
    });

    it('commits event batches atomically when a later event conflicts', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const existing: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'event-existing',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:existing',
        };
        await persistence.events.append([existing]);
        await expect(persistence.events.append([
            { ...existing, eventId: 'event-new', sceneId: 'scene:new' },
            { ...existing, sceneId: 'scene:conflict' },
        ])).rejects.toThrow('Conflicting learner event id');
        expect(await persistence.events.readAll()).toEqual([existing]);
        persistence.close();
    });

    it('deduplicates a retried idempotent event even when its retry timestamp differs', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'milestone:rie-introduction:scene',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:opening-rie-introduction',
        };
        await persistence.events.append([event]);
        await persistence.events.append([{ ...event, at: 200 }]);
        expect(await persistence.events.readAll()).toEqual([event]);
        persistence.close();
    });

    it('restores an encountered classmate as a journal and roster unlock after reopening', async () => {
        const name = `academy-test-${crypto.randomUUID()}`;
        const persistence = await openAcademyPersistence(fakeIndexedDB, name);
        const record = createLearnerRecord({ repository: persistence.events, now: () => 100 });
        await record.record({
            kind: 'characters-encountered',
            eventId: 'encounter:class-week:l1-l01',
            encounterId: 'class-week:l1-l01',
            sceneId: 'scene:class-week:l1-l01',
            attendeeIds: ['aakash'],
        });
        persistence.close();

        const restored = await openAcademyPersistence(fakeIndexedDB, name);
        const projection = await createLearnerRecord({ repository: restored.events }).snapshot();
        const aakash = projectCharacterDirectory(projection).find(character => character.characterId === 'aakash');

        expect(projection.encounteredCharacters.aakash).toEqual({
            encounterIds: ['class-week:l1-l01'],
            sceneIds: ['scene:class-week:l1-l01'],
        });
        expect(aakash).toMatchObject({
            unlocked: true,
            portrait: '/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v009.png',
            revisitPaths: [{
                encounterId: 'class-week:l1-l01',
                kind: 'class-week',
                targetId: 'l1-l01',
            }],
        });
        restored.close();
    });
});

function openDatabase(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const pending = fakeIndexedDB.open(name);
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error);
    });
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error);
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
    });
}
