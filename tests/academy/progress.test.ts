import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
    createLearnerProgress,
    createMemoryProgressPersistence,
    createProgressPersistence,
} from '../../src/academy/progress';

const DAY_MS = 86_400_000;

describe('Learner progress', () => {
    it('records attempts, keeps an exact resume checkpoint, and derives lesson completion from task ids', async () => {
        let now = 1_700_000_000_000;
        const progress = createLearnerProgress({
            persistence: createMemoryProgressPersistence(),
            now: () => now,
        });
        const checkpoint = { selected: ['ka'], cursor: 2 };

        await progress.saveResume({
            lessonId: 'kana-1',
            taskId: 'listen-ka',
            stepId: 'audio-2',
            checkpoint,
        });
        checkpoint.selected.push('ga');

        expect(await progress.resume()).toEqual({
            lessonId: 'kana-1',
            taskId: 'listen-ka',
            stepId: 'audio-2',
            checkpoint: { selected: ['ka'], cursor: 2 },
            updatedAt: now,
        });

        await progress.recordAttempt({
            lessonId: 'kana-1',
            taskId: 'listen-ka',
            outcome: 'lapse',
            response: 'ga',
            context: { prompt: 'Choose the sound for か.' },
        });
        now += DAY_MS;
        await progress.recordAttempt({ lessonId: 'kana-1', taskId: 'listen-ka', outcome: 'pass' });

        const beforeFinalTask = await progress.completion({
            lessonId: 'kana-1',
            taskIds: ['listen-ka', 'write-ka'],
        });
        expect(beforeFinalTask).toMatchObject({
            state: 'in-progress',
            tasks: [
                { taskId: 'listen-ka', state: 'completed', attemptCount: 2, lapseCount: 1 },
                { taskId: 'write-ka', state: 'not-started', attemptCount: 0 },
            ],
        });

        now += 1;
        await progress.recordAttempt({ lessonId: 'kana-1', taskId: 'write-ka', outcome: 'pass' });

        expect(await progress.completion({
            lessonId: 'kana-1',
            taskIds: ['listen-ka', 'write-ka'],
        })).toMatchObject({
            state: 'completed',
            completedAt: now,
        });
        expect((await progress.snapshot()).attempts).toEqual([
            expect.objectContaining({ taskId: 'listen-ka', outcome: 'lapse', response: 'ga' }),
            expect.objectContaining({ taskId: 'listen-ka', outcome: 'pass' }),
            expect.objectContaining({ taskId: 'write-ka', outcome: 'pass' }),
        ]);
    });

    it('uses the documented 1/3/7/14/30 day progression and resets a lapse to one day', async () => {
        let now = 0;
        const progress = createLearnerProgress({
            persistence: createMemoryProgressPersistence(),
            now: () => now,
        });
        const expectedIntervals = [1, 3, 7, 14, 30, 30];

        for (const intervalDays of expectedIntervals) {
            await progress.recordAttempt({ lessonId: 'verbs-1', taskId: 'read-iku', outcome: 'pass' });
            const task = (await progress.snapshot()).tasks[0];
            expect(task?.review).toMatchObject({ intervalDays, dueAt: now + intervalDays * DAY_MS });
            now = task!.review.dueAt;
        }

        await progress.recordAttempt({ lessonId: 'verbs-1', taskId: 'read-iku', outcome: 'lapse' });
        let task = (await progress.snapshot()).tasks[0]!;
        expect(task.review).toMatchObject({ intervalIndex: 0, intervalDays: 1, lapses: 1, dueAt: now + DAY_MS });
        expect(await progress.completion({ lessonId: 'verbs-1', taskIds: ['read-iku'] })).toMatchObject({ state: 'completed' });

        now = task.review.dueAt;
        await progress.recordAttempt({ lessonId: 'verbs-1', taskId: 'read-iku', outcome: 'pass' });
        task = (await progress.snapshot()).tasks[0]!;
        expect(task.review).toMatchObject({ intervalIndex: 1, intervalDays: 3, lapses: 1, dueAt: now + 3 * DAY_MS });
    });

    it('returns due review items in stable order with the latest supplied context', async () => {
        let now = 10;
        const progress = createLearnerProgress({
            persistence: createMemoryProgressPersistence(),
            now: () => now,
        });
        const firstContext = { prompt: 'Read いく in this sentence.', sentence: '学校へ行く。' };

        await progress.recordAttempt({ lessonId: 'verbs-1', taskId: 'iku', outcome: 'pass', context: firstContext });
        now += 50;
        await progress.recordAttempt({
            lessonId: 'verbs-1',
            taskId: 'kuru',
            outcome: 'lapse',
            context: { prompt: 'Read くる in this sentence.', sentence: '友達が来る。' },
        });
        firstContext.prompt = 'mutated outside progress';

        now = DAY_MS + 10;
        expect(await progress.reviewQueue()).toEqual([
            expect.objectContaining({
                taskId: 'iku',
                intervalDays: 1,
                context: { prompt: 'Read いく in this sentence.', sentence: '学校へ行く。' },
            }),
        ]);

        now += 50;
        const due = await progress.reviewQueue(2);
        expect(due.map(item => item.taskId)).toEqual(['iku', 'kuru']);
        expect(due[1]).toMatchObject({
            lapseCount: 1,
            context: { prompt: 'Read くる in this sentence.', sentence: '友達が来る。' },
        });
    });

    it('persists with IndexedDB and falls back to localStorage, then memory, when needed', async () => {
        let now = 100;
        const databaseName = `academy-progress-${Date.now()}-${Math.random()}`;
        const storage = new MapStorage();
        const indexedPersistence = createProgressPersistence({
            indexedDB: globalThis.indexedDB,
            localStorage: storage,
            databaseName,
            storageKey: 'academy-progress-indexed-fallback',
        });
        const first = createLearnerProgress({ persistence: indexedPersistence, now: () => now });

        await first.recordAttempt({ lessonId: 'numbers-1', taskId: 'one', outcome: 'pass' });
        now += DAY_MS;
        const fromIndexedDb = createLearnerProgress({
            persistence: createProgressPersistence({
                indexedDB: globalThis.indexedDB,
                localStorage: storage,
                databaseName,
                storageKey: 'academy-progress-indexed-fallback',
            }),
            now: () => now,
        });
        expect((await fromIndexedDb.snapshot()).attempts).toHaveLength(1);
        expect(storage.getItem('academy-progress-indexed-fallback')).toBeNull();

        const localStorageKey = 'academy-progress-local-fallback';
        const localFirst = createLearnerProgress({
            persistence: createProgressPersistence({ indexedDB: unavailableIndexedDb(), localStorage: storage, storageKey: localStorageKey }),
            now: () => now,
        });
        await localFirst.recordAttempt({ lessonId: 'numbers-1', taskId: 'two', outcome: 'pass' });
        const localSecond = createLearnerProgress({
            persistence: createProgressPersistence({ indexedDB: unavailableIndexedDb(), localStorage: storage, storageKey: localStorageKey }),
            now: () => now,
        });
        expect((await localSecond.snapshot()).tasks).toEqual([
            expect.objectContaining({ lessonId: 'numbers-1', taskId: 'two' }),
        ]);

        const memoryPersistence = createProgressPersistence({
            indexedDB: unavailableIndexedDb(),
            localStorage: unavailableStorage(),
        });
        const memoryFirst = createLearnerProgress({ persistence: memoryPersistence, now: () => now });
        await memoryFirst.recordAttempt({ lessonId: 'numbers-1', taskId: 'three', outcome: 'pass' });
        const memorySecond = createLearnerProgress({ persistence: memoryPersistence, now: () => now });
        expect((await memorySecond.snapshot()).tasks).toEqual([
            expect.objectContaining({ lessonId: 'numbers-1', taskId: 'three' }),
        ]);
    });
});

class MapStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

function unavailableStorage(): Storage {
    const unavailable = (): never => {
        throw new Error('Storage is unavailable.');
    };
    return {
        get length(): number {
            return unavailable();
        },
        clear: unavailable,
        getItem: unavailable,
        key: unavailable,
        removeItem: unavailable,
        setItem: unavailable,
    } as Storage;
}

function unavailableIndexedDb(): IDBFactory {
    return {
        open: () => {
            throw new Error('IndexedDB is unavailable.');
        },
    } as unknown as IDBFactory;
}
