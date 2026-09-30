import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewTabGradeQueue, type NewTabGradeQueueDeps, type QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from '../../src/reader/newtab/controller-config';
import type { JPDBCard } from '../../src/reader/app/types';
import { memoryLegacyStorage, reviewQueueHostFixture } from './helpers/review-queue-host-fixture';

// Bytes the released v1.9.3 NewTabGradeQueue wrote (captured by running v1.9.3 source):
// a stale-account JPDB grade, JPDB and Jiten grades that failed twice, an Anki grade
// whose flush failed once with Anki closed, and a local Academy grade.
const fixture = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'upgrade-v1.9.3', 'grade-queue-v1.9.3.json'), 'utf8')) as {
    key: string;
    providerContexts: { current: { jpdb: string; jiten: string; anki: string }; staleJpdb: string };
    value: QueuedNewTabGrade[];
};
const contexts = fixture.providerContexts.current;
const providerContextForTarget: NewTabGradeQueueDeps['providerContextForTarget'] = target => target === 'anki' ? contexts.anki
    : target === 'jiten-api' ? contexts.jiten : target === 'jpdb-api' ? contexts.jpdb : '';
const deliverableSpellings = ['読む', '見る', '書く', '話す'];
const unrelated = { vid: 9, sid: 9, spelling: '新しい', reading: 'あたらしい' } as JPDBCard;

function submitted(submit: { mock: { calls: unknown[][] } }): string[] {
    return submit.mock.calls.map(([item]) => (item as QueuedNewTabGrade).card.spelling).sort();
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('a leftover v1.9.3 offline review queue', () => {
    it('is the real v1.9.3 byte shape these tests replay', () => {
        expect(fixture.key).toBe(NEW_TAB_GRADE_QUEUE_KEY);
        expect(fixture.value.map(item => [item.target, item.attempts, item.card.spelling])).toEqual([
            ['jpdb-api', 0, '昔'], ['jpdb-api', 2, '読む'], ['jiten-api', 2, '見る'], ['anki', 1, '書く'], ['yomu-local', 0, '話す'],
        ]);
        expect(fixture.value.find(item => item.target === 'anki')).toMatchObject({ lastError: 'Failed to fetch' });
    });

    it('is adopted once by packaged Study, delivered exactly once, and never blocks another card', async () => {
        const host = reviewQueueHostFixture();
        const legacy = memoryLegacyStorage(fixture.value);
        const submit = vi.fn(async () => true);
        const onSubmitted = vi.fn();
        const make = () => new NewTabGradeQueue({ owner: host.client(), storage: legacy, submit, onSubmitted,
            offlineEnabled: () => true, providerContextForTarget });
        const first = make();
        expect(await first.flush()).toBe(1);
        expect(legacy.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
        expect(submitted(submit)).toEqual([...deliverableSpellings].sort());
        expect(onSubmitted).toHaveBeenCalledTimes(4);
        expect(first.blocksReview(unrelated)).toBe(false);
        expect(await first.heldReviews()).toHaveLength(0);
        // The stale-account grade keeps its 1.9.3 status: waiting for that account, blocking nothing.
        expect(await host.client().list()).toMatchObject([{ card: { spelling: '昔' }, providerContext: fixture.providerContexts.staleJpdb, attempts: 0 }]);
        expect(first.blocksReview(fixture.value[0]!.card)).toBe(false);

        expect(await make().flush()).toBe(1);
        expect(submit).toHaveBeenCalledTimes(4);
        expect(await first.enqueue(unrelated, 'okay', ['jpdb-api'])).toBe(true);
        expect(await host.client().list()).toMatchObject([{ card: { spelling: '昔' } }, { card: { spelling: '新しい' }, attempts: 0 }]);
    });

    it('is delivered exactly once when the adoption reply is lost', async () => {
        const host = reviewQueueHostFixture();
        const legacy = memoryLegacyStorage(fixture.value);
        let loseAdoptReply = true;
        const lossy = host.client(async request => {
            const reply = await host.send(request);
            if (request.kind === 'adopt' && loseAdoptReply) { loseAdoptReply = false; throw new Error('adopt reply lost'); }
            return reply;
        });
        const submit = vi.fn(async () => true);
        const make = (owner = lossy) => new NewTabGradeQueue({ owner, storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        const queue = make();
        expect(await queue.flush()).toBe(1);
        expect(legacy.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
        expect(queue.blocksReview(unrelated)).toBe(false);
        expect(await make(host.client()).flush()).toBe(1);
        expect(submitted(submit)).toEqual([...deliverableSpellings].sort());
    });

    it('keeps entries the owner cannot hold, and never lets a failed hand-over lock Study', async () => {
        const host = reviewQueueHostFixture();
        const unreadable = { ...fixture.value[1]!, id: 'jpdb-api:no-reading', card: { spelling: '無' } as JPDBCard };
        const legacy = memoryLegacyStorage([unreadable, fixture.value[4]]);
        let ownerReachable = false;
        const owner = host.client(async request => {
            if (request.kind === 'adopt' && !ownerReachable) return { ok: false, error: 'Stored review queue is invalid; no reviews were changed.' };
            return host.send(request);
        });
        const submit = vi.fn(async () => true);
        const queue = new NewTabGradeQueue({ owner, storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        expect(await queue.flush()).toBe(0);
        expect(queue.blocksReview(unrelated)).toBe(false);
        expect(legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY)).toHaveLength(2);
        expect(submit).not.toHaveBeenCalled();
        ownerReachable = true;
        expect(await queue.flush()).toBe(0);
        expect(submitted(submit)).toEqual(['話す']);
        expect(legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY)).toEqual([unreadable]);
        expect(queue.blocksReview(unrelated)).toBe(false);
    });

    it('never takes the owner past capacity: what does not fit waits in the key and never locks Study', async () => {
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        const host = reviewQueueHostFixture();
        const entry = (n: number): QueuedNewTabGrade => ({ ...fixture.value[1]!, id: `jpdb-api:backlog-${n}`, at: 1_000 + n,
            card: { vid: 1_000 + n, sid: 1, spelling: `語${n}`, reading: `ご${n}` } as JPDBCard });
        const legacy = memoryLegacyStorage(Array.from({ length: 150 }, (_, n) => entry(n)));
        const submit = vi.fn(async (_item: QueuedNewTabGrade) => true);
        const make = () => new NewTabGradeQueue({ owner: host.client(), storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        expect(await make().flush()).toBe(150);
        // Hosted Study, sharing this store through the extension storage bridge, queued 100 more while offline.
        legacy.values.set(NEW_TAB_GRADE_QUEUE_KEY, Array.from({ length: 100 }, (_, n) => entry(500 + n)));
        const tab = make();
        expect(await tab.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(await tab.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        const fresh = make();
        expect(await fresh.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(fresh.blocksReview(unrelated)).toBe(false);
        expect(await host.client().list()).toHaveLength(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY)).toHaveLength(50);
        expect(submit).not.toHaveBeenCalled();

        // Back online, the owner drains and then takes the rest: all 250 land exactly once.
        vi.stubGlobal('navigator', { ...navigator, onLine: true });
        expect(await fresh.flush()).toBe(0);
        expect(await fresh.flush()).toBe(0);
        expect(legacy.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
        expect(new Set(submit.mock.calls.map(([item]) => item.id)).size).toBe(250);
        expect(submit).toHaveBeenCalledTimes(250);
    });

    it('is retried with 1.9.3 semantics by userscript and hosted Study, delivered once, and re-gradable', async () => {
        const legacy = memoryLegacyStorage(fixture.value);
        const submit = vi.fn(async () => true);
        const make = () => new NewTabGradeQueue({ owner: null, storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        const queue = make();
        // The 1.9.3 Anki entry with attempts 1 was an ordinary retry, not an uncertain dispatch.
        expect(await queue.heldReviews()).toHaveLength(0);
        expect(await queue.flush()).toBe(1);
        expect(submitted(submit)).toEqual([...deliverableSpellings].sort());
        expect(await make().flush()).toBe(1);
        expect(submit).toHaveBeenCalledTimes(4);
        expect((legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY) as QueuedNewTabGrade[]).map(item => item.card.spelling)).toEqual(['昔']);
        expect(await queue.enqueue(fixture.value[3]!.card, 'easy', ['anki'])).toBe(true);
    });
});
