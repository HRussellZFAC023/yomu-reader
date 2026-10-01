import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmStorageLeaseBackend, GmStorageLeaseEnvironment } from '../../src/reader/app/gm-storage-lease';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// Each tab is its own realm with its own copy of the lease module, sharing one
// GM store. A frozen tab's storage calls stop settling until it thaws; a tab
// that never thaws is dead. Fake timers stand in for the browser's clock.
type LeaseRealm = typeof import('../../src/reader/app/gm-storage-lease');

const LEASE = 'local-yomu-srs-deck';
const GUARDED = 'yomu:srs-local:v2:index';

interface Tab {
    readonly realm: LeaseRealm;
    readonly environment: GmStorageLeaseEnvironment<string>;
    freeze(): void;
    thaw(): void;
}

/** `latencyMs` is how long each storage call takes to answer, as GM messaging does; writes may answer sooner. */
async function openTab(values: Map<string, unknown>, latencyMs = 0, writeLatencyMs = latencyMs): Promise<Tab> {
    vi.resetModules();
    const realm = await import('../../src/reader/app/gm-storage-lease');
    let parked: Array<() => void> | null = null;
    const settle = <T>(run: () => T, delayMs = latencyMs): Promise<T> => new Promise<T>(resolve => {
        const answer = (): void => resolve(run());
        if (parked) parked.push(answer);
        else if (delayMs) setTimeout(answer, delayMs);
        else queueMicrotask(answer);
    });
    const backend: GmStorageLeaseBackend = {
        getValue: <T>(key: string, fallback: T) => settle(() => (values.has(key) ? structuredClone(values.get(key)) : fallback) as T),
        setValue: (key, value) => settle(() => { values.set(key, structuredClone(value)); }, writeLatencyMs),
        deleteValue: key => settle(() => { values.delete(key); }, writeLatencyMs),
        listValues: () => settle(() => [...values.keys()]),
    };
    // The managed-state fence reads the epoch, the reset signal, then the epoch again.
    const assertMutationFence = async (): Promise<void> => {
        for (const key of ['epoch', 'reset-signal', 'epoch']) await backend.getValue!(key, null);
    };
    return {
        realm,
        environment: { backend, captureEpoch: async () => 'epoch', assertMutationFence, epochToken: epoch => epoch },
        freeze: () => { parked ??= []; },
        thaw: () => {
            const answers = parked ?? [];
            parked = null;
            answers.forEach(answer => answer());
        },
    };
}

/** A guarded write as managed storage makes it: fence, then write. */
async function guardedWrite(tab: Tab, value: unknown): Promise<void> {
    tab.realm.fenceStorageLeaseWrite(GUARDED);
    await tab.environment.backend.setValue!(GUARDED, value);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

/**
 * Starts a lease in a background tab whose renewal timer is throttled: it
 * fires every `everyMs`, or never. Storage messaging still answers.
 */
async function startThrottled(
    start: () => Promise<void>,
    everyMs = Number.POSITIVE_INFINITY,
): Promise<{ readonly done: Promise<void> }> {
    const realSetInterval = globalThis.setInterval;
    const throttled = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void) => (
        Number.isFinite(everyMs) ? realSetInterval(callback, everyMs) : 0
    )) as typeof setInterval);
    const done = start();
    for (let turn = 0; turn < 20; turn++) await vi.advanceTimersByTimeAsync(0);
    throttled.mockRestore();
    return { done };
}

/**
 * Runs the holder's renewal timer as a browser might: on time, except that one
 * tick fires `lateMs` late (a busy main thread, a throttled background tab).
 */
function delayRenewalTick(tick: number, lateMs: number): void {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    let nextId = 1;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, everyMs: number) => {
        const id = nextId++;
        let ticks = 0;
        const schedule = (): void => {
            timers.set(id, setTimeout(() => {
                callback();
                schedule();
            }, everyMs + (++ticks === tick ? lateMs : 0)));
        };
        schedule();
        return id;
    }) as typeof setInterval);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id: number) => {
        clearTimeout(timers.get(id));
        timers.delete(id);
    }) as typeof clearInterval);
}

/**
 * Every script of the origin shares one queue of web locks per name, page
 * scripts included. A request whose signal aborts before it is granted leaves
 * the queue.
 */
function stubWebLocks(): void {
    let tail = Promise.resolve();
    vi.stubGlobal('navigator', { locks: { request: <T>(_name: string, ...args: unknown[]) => {
        const callback = args.pop() as () => Promise<T>;
        const signal = (args[0] as { signal?: AbortSignal } | undefined)?.signal;
        const turn = tail;
        let held = false;
        const granted = new Promise<T>((resolve, reject) => {
            signal?.addEventListener('abort', () => { if (!held) reject(signal.reason); });
            void turn.then(() => {
                if (signal?.aborted) return;
                held = true;
                callback().then(resolve, reject);
            });
        });
        tail = turn.then(() => (held ? granted.then(() => undefined, () => undefined) : undefined));
        return granted;
    } } });
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

describe('storage lease liveness', () => {
    let values: Map<string, unknown>;
    let workLeaseMs: number;

    beforeEach(async () => {
        vi.useFakeTimers();
        values = new Map();
        ({ STORAGE_WORK_LEASE_MS: workLeaseMs } = await import('../../src/reader/app/gm-storage-lease'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function lease(tab: Tab, operation: () => Promise<void>, onWait?: (waiting: boolean) => void): Promise<void> {
        return tab.realm.withGmStorageLeaseCore(LEASE, operation, {
            leaseMs: workLeaseMs,
            guards: key => key.startsWith('yomu:srs-local:'),
            onWait,
        }, tab.environment);
    }

    it('keeps a live holder in the lease across a section far longer than the lease', async () => {
        const [first, second] = [await openTab(values), await openTab(values)];
        const release = deferred();
        let active = 0;
        const entries: string[] = [];
        const section = async (name: string, wait?: Promise<void>): Promise<void> => {
            entries.push(`${name}:start`);
            expect(++active).toBe(1);
            await wait;
            active--;
            entries.push(`${name}:end`);
        };
        const holding = lease(first, () => section('first', release.promise));
        await vi.advanceTimersByTimeAsync(0);
        const waiting = lease(second, () => section('second'));

        await vi.advanceTimersByTimeAsync(12 * workLeaseMs);
        expect(entries).toEqual(['first:start']);

        release.resolve();
        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([holding, waiting]);
        expect(entries).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    });

    it('lets another tab take over a dead holder within the short lease', async () => {
        const [dead, next] = [await openTab(values), await openTab(values)];
        void lease(dead, () => new Promise(() => undefined)).catch(() => undefined);
        await vi.advanceTimersByTimeAsync(0);
        dead.freeze();

        const startedAt = Date.now();
        let enteredAt = Number.NaN;
        const taking = lease(next, async () => { enteredAt = Date.now(); });
        await vi.advanceTimersByTimeAsync(workLeaseMs + 100);
        await taking;

        expect(enteredAt - startedAt).toBeGreaterThan(workLeaseMs / 2);
        expect(enteredAt - startedAt).toBeLessThanOrEqual(workLeaseMs + 100);
    });

    it('keeps a holder whose timers are throttled while its own saving renews the lease', async () => {
        const [saving, other] = [await openTab(values), await openTab(values)];
        const steps = Array.from({ length: 30 }, deferred);
        let otherEntered = false;
        const holding = await startThrottled(() => lease(saving, async () => {
            for (const [index, step] of steps.entries()) {
                await step.promise;
                expect(otherEntered).toBe(false);
                await guardedWrite(saving, { revision: index });
            }
        }));
        const waiting = lease(other, async () => { otherEntered = true; });

        // Each storage reply arrives over messaging, a second apart: no timer of the holder runs.
        for (const step of steps) {
            await vi.advanceTimersByTimeAsync(1_000);
            step.resolve();
        }
        await vi.advanceTimersByTimeAsync(0);
        await holding.done;
        expect(values.get(GUARDED)).toEqual({ revision: 29 });
        await vi.advanceTimersByTimeAsync(100);
        await waiting;
        expect(otherEntered).toBe(true);
    });

    it('keeps a holder whose renewal timer fires late but before its lease lapses', async () => {
        const [slow, other] = [await openTab(values), await openTab(values)];
        const release = deferred();
        const holding = await startThrottled(() => lease(slow, () => release.promise), workLeaseMs * 0.7);
        let otherEntered = false;
        const waiting = lease(other, async () => { otherEntered = true; });

        await vi.advanceTimersByTimeAsync(10 * workLeaseMs);
        expect(otherEntered).toBe(false);
        release.resolve();
        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([holding.done, waiting]);
        expect(otherEntered).toBe(true);
    });

    // Real storage answers in a millisecond or two, so a renewal lands a little
    // after the tick that asked for it. Every tick must still renew: renewing on
    // every other tick leaves a live holder under a second of slack.
    it.each([[1, 800], [2, 800], [3, 800], [2, 1_200], [2, 2_000]])(
        'keeps an uncontested holder whose renewal tick %i fires %i ms late',
        async (tick, lateMs) => {
            const tab = await openTab(values, 2);
            delayRenewalTick(tick, lateMs);
            const holding = lease(tab, async () => {
                await sleep(4 * workLeaseMs);
                await guardedWrite(tab, 'saved');
            });
            await vi.advanceTimersByTimeAsync(4 * workLeaseMs + 100);
            await expect(holding).resolves.toBeUndefined();
            expect(values.get(GUARDED)).toBe('saved');
        },
    );

    // A waiter renews its claim only once half of it is spent, so it can enter
    // with anything from half to all of its lease left. Wherever the holder
    // releases, the save it then makes must go through.
    it('lets a waiter that enters with a part-spent claim finish its save, wherever the holder releases', async () => {
        const failures: Array<{ releaseAt: number; error: string }> = [];
        for (let releaseAt = 2_000; releaseAt <= 5_000; releaseAt += 25) {
            values.clear();
            const [holderTab, waiterTab] = [await openTab(values, 2), await openTab(values, 2)];
            let active = 0;
            const section = async (work: () => Promise<void>): Promise<void> => {
                expect(++active).toBe(1);
                try { await work(); } finally { active--; }
            };
            const holding = lease(holderTab, () => section(() => sleep(releaseAt)));
            await vi.advanceTimersByTimeAsync(20);
            const waiting = lease(waiterTab, () => section(async () => {
                await sleep(1_600);
                await guardedWrite(waiterTab, releaseAt);
            })).catch((error: unknown) => { failures.push({ releaseAt, error: String(error) }); });
            await vi.advanceTimersByTimeAsync(releaseAt + 2 * workLeaseMs);
            await Promise.all([holding, waiting]);
        }
        expect(failures).toEqual([]);
    }, 60_000);

    it('refuses a write from a holder whose lease lapsed while it was frozen', async () => {
        const [frozen, next] = [await openTab(values), await openTab(values)];
        const resumed = deferred();
        const stale = await startThrottled(() => lease(frozen, async () => {
            await resumed.promise;
            await guardedWrite(frozen, 'stale snapshot');
        }));
        const overtaking = lease(next, () => guardedWrite(next, 'newer save'));
        await vi.advanceTimersByTimeAsync(workLeaseMs + 100);
        await overtaking;
        expect(values.get(GUARDED)).toBe('newer save');

        resumed.resolve();
        await expect(stale.done).rejects.toThrow('lapsed');
        expect(values.get(GUARDED)).toBe('newer save');
    });

    // The save's write renewed the lease on its way out; the tab froze before the
    // renewal's read answered, so the renewal failed. Every write had landed
    // while the lease was live: the save happened, and reporting it failed
    // would have the learner make a non-idempotent save (a grade) again.
    it('keeps a save whose writes all landed live, though the renewal it started failed after a freeze', async () => {
        const tab = await openTab(values, 50, 1);
        const saving = lease(tab, async () => {
            await sleep(1_000);
            await guardedWrite(tab, 'committed');
            vi.setSystemTime(Date.now() + workLeaseMs + 1_000);
        });
        await vi.advanceTimersByTimeAsync(3_000);
        await expect(saving).resolves.toBeUndefined();
        expect(values.get(GUARDED)).toBe('committed');
    });

    it('queues a waiter whose place lapsed again instead of letting it in beside the holder', async () => {
        // Claims are created in this order; the newcomer's owner id sorts after the waiter's.
        const ids = ['0-holder', 'claim-a', '1-waiter', 'claim-b', '2-newcomer', 'claim-c'];
        vi.spyOn(crypto, 'randomUUID').mockImplementation(() => ids.shift() as ReturnType<typeof crypto.randomUUID>);
        const [holderTab, waiterTab, newcomerTab] = [await openTab(values), await openTab(values), await openTab(values)];
        let active = 0;
        let mostActive = 0;
        const section = (wait?: Promise<void>) => async (): Promise<void> => {
            mostActive = Math.max(mostActive, ++active);
            await wait;
            active--;
        };
        const holderDone = deferred();
        const newcomerDone = deferred();
        const holder = lease(holderTab, section(holderDone.promise));
        await vi.advanceTimersByTimeAsync(0);
        const waiter = lease(waiterTab, section());
        await vi.advanceTimersByTimeAsync(50);

        // The waiting tab stalls mid-poll for longer than its claim lives, and a
        // newcomer queues meanwhile, behind the holder only.
        waiterTab.freeze();
        await vi.advanceTimersByTimeAsync(workLeaseMs + 1_000);
        const newcomer = lease(newcomerTab, section(newcomerDone.promise));
        await vi.advanceTimersByTimeAsync(50);
        holderDone.resolve();
        await vi.advanceTimersByTimeAsync(50);
        expect(active).toBe(1);

        // It resumes while the newcomer holds the lease: its old ticket must not let it in.
        waiterTab.thaw();
        await vi.advanceTimersByTimeAsync(200);
        expect(mostActive).toBe(1);
        newcomerDone.resolve();
        await vi.advanceTimersByTimeAsync(200);
        await Promise.all([holder, newcomer, waiter]);
        expect(mostActive).toBe(1);
    });

    it('tells a caller kept waiting by another tab, and stops when it proceeds', async () => {
        const [holderTab, waitingTab] = [await openTab(values), await openTab(values)];
        const release = deferred();
        const holding = lease(holderTab, () => release.promise);
        await vi.advanceTimersByTimeAsync(0);
        const onWait = vi.fn();
        const waiting = lease(waitingTab, async () => { expect(onWait).toHaveBeenLastCalledWith(false); }, onWait);

        await vi.advanceTimersByTimeAsync(1_400);
        expect(onWait).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(200);
        expect(onWait.mock.calls).toEqual([[true]]);
        release.resolve();
        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([holding, waiting]);
        expect(onWait.mock.calls).toEqual([[true], [false]]);

        const quick = vi.fn();
        await lease(waitingTab, async () => undefined, quick);
        expect(quick).not.toHaveBeenCalled();
    });

    it('also tells a caller held up at the web lock by a same-origin tab', async () => {
        stubWebLocks();
        const [holderTab, waitingTab] = [await openTab(values), await openTab(values)];
        const release = deferred();
        const holding = lease(holderTab, () => release.promise);
        await vi.advanceTimersByTimeAsync(0);
        const onWait = vi.fn();
        const waiting = lease(waitingTab, async () => undefined, onWait);

        await vi.advanceTimersByTimeAsync(1_600);
        expect(onWait.mock.calls).toEqual([[true]]);
        release.resolve();
        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([holding, waiting]);
        expect(onWait.mock.calls).toEqual([[true], [false]]);
    });

    // A page script can take よむ's web lock and never let it go. The GM claims
    // serialize the tabs without it, so the save stops waiting for it.
    it('completes a save whose web lock a page script holds forever', async () => {
        stubWebLocks();
        const page = navigator as Navigator & { locks: { request(name: string, callback: () => Promise<void>): Promise<void> } };
        void page.locks.request(`yomu:${LEASE}`, () => new Promise(() => undefined));
        const tab = await openTab(values);
        const onWait = vi.fn();
        const saving = lease(tab, () => guardedWrite(tab, 'saved'), onWait);

        await vi.advanceTimersByTimeAsync(workLeaseMs - 100);
        expect(values.has(GUARDED)).toBe(false);
        await vi.advanceTimersByTimeAsync(200);
        expect(values.get(GUARDED)).toBe('saved');
        await saving;
        expect(onWait.mock.calls).toEqual([[true], [false]]);
    });

    it('keeps a waiter that stopped waiting at the web lock out while a same-origin holder still saves', async () => {
        stubWebLocks();
        const [holderTab, waitingTab] = [await openTab(values), await openTab(values)];
        const release = deferred();
        const entries: string[] = [];
        const holding = lease(holderTab, async () => {
            entries.push('holder:start');
            await release.promise;
            entries.push('holder:end');
        });
        await vi.advanceTimersByTimeAsync(0);
        const waiting = lease(waitingTab, async () => { entries.push('waiter'); });

        await vi.advanceTimersByTimeAsync(3 * workLeaseMs);
        expect(entries).toEqual(['holder:start']);
        release.resolve();
        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([holding, waiting]);
        expect(entries).toEqual(['holder:start', 'holder:end', 'waiter']);
    });

    // Safari can take seconds to wake an extension's background page. That is
    // slow storage, not another tab, and the status must not blame one.
    it('does not tell a caller whose storage is merely slow', async () => {
        const tab = await openTab(values, 400);
        const onWait = vi.fn();
        let enteredAt = Number.NaN;
        const startedAt = Date.now();
        const saving = lease(tab, async () => { enteredAt = Date.now(); }, onWait);
        await vi.advanceTimersByTimeAsync(12_000);
        await saving;
        expect(enteredAt - startedAt).toBeGreaterThan(2_000);
        expect(onWait).not.toHaveBeenCalled();
    });

    it.each([['the storage claims', false], ['the web lock', true]] as const)(
        'does not tell a caller queued at %s behind its own tab\'s slower save',
        async (_where, webLocks) => {
            if (webLocks) stubWebLocks();
            const tab = await openTab(values);
            const first = lease(tab, () => sleep(3_000));
            await vi.advanceTimersByTimeAsync(0);
            const onWait = vi.fn();
            const second = lease(tab, async () => undefined, onWait);
            await vi.advanceTimersByTimeAsync(3_500);
            await Promise.all([first, second]);
            expect(onWait).not.toHaveBeenCalled();
        },
    );

    it('has managed storage refuse a guarded write from a tab whose lease lapsed while it was frozen', async () => {
        installGmStorageFixture(values);
        vi.stubGlobal('GM_listValues', () => [...values.keys()]);
        const storageTab = async () => {
            vi.resetModules();
            return import('../../src/reader/app/storage');
        };
        const [frozen, next] = [await storageTab(), await storageTab()];
        const options = { leaseMs: workLeaseMs, guards: (key: string) => key === GUARDED };
        const resumed = deferred();
        const stale = await startThrottled(() => frozen.withGmStorageLease(LEASE, async () => {
            await resumed.promise;
            await frozen.gmStorageSet(GUARDED, 'stale snapshot');
        }, options));
        const overtaking = next.withGmStorageLease(LEASE, () => next.gmStorageSet(GUARDED, 'newer save'), options);
        await vi.advanceTimersByTimeAsync(workLeaseMs + 100);
        await overtaking;

        resumed.resolve();
        await expect(stale.done).rejects.toThrow();
        expect(await next.gmStorageGet(GUARDED, null)).toBe('newer save');
    });
});
