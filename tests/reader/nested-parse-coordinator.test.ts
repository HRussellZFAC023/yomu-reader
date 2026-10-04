import { describe, expect, it } from 'vitest';

import { NestedParseCoordinator } from '../../src/reader/lookup/nested-parse-coordinator';

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(complete => { resolve = complete; });
    return { promise, resolve };
}

async function microtasks(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) await Promise.resolve();
}

// Parse functions here are plain functions returning raw promises on purpose:
// a vi.fn spy wraps each returned promise in extra .then/.catch hops, which
// moves the commits these tests aim at into a different microtask.
function heldParses() {
    const passes: Array<ReturnType<typeof deferred>> = [];
    let active = 0;
    let maximumActive = 0;
    const parse = () => {
        const pass = deferred();
        passes.push(pass);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        return pass.promise.then(() => { active -= 1; });
    };
    return { parse, passes, maximumActive: () => maximumActive };
}

describe('nested parse ownership', () => {
    it('gives commits from one synchronous turn a single parse pass', async () => {
        const coordinator = new NestedParseCoordinator();
        const root = document.createElement('div');
        let calls = 0;
        const parse = async () => { calls += 1; };
        await Promise.all([coordinator.run(root, parse, () => true), coordinator.run(root, parse, () => true)]);
        expect(calls).toBe(1);
    });

    it('gives providers that settle in the same microtask batch a single parse pass', async () => {
        const coordinator = new NestedParseCoordinator();
        const root = document.createElement('div');
        let calls = 0;
        const parse = async () => { calls += 1; };
        const runs: Promise<void>[] = [];
        // Each settled provider commits from its own continuation.
        await Promise.all([Promise.resolve(), Promise.resolve()].map(settled => settled.then(() => {
            runs.push(coordinator.run(root, parse, () => true));
        })));
        await Promise.all(runs);
        expect(calls).toBe(1);
    });

    // Commits during a pass coalesce into one follow-up, and the owner is never
    // held after its final dirty check without a pass to serve a later commit.
    // Sweep the microtasks around that release rather than trusting one
    // hand-picked interleaving: offset -1 commits before the pass settles.
    it.each(Array.from({ length: 9 }, (_, index) => index - 1))(
        'serves commits made %i microtasks after the pass settles with one awaited follow-up',
        async offset => {
            const coordinator = new NestedParseCoordinator();
            const root = document.createElement('div');
            const { parse, passes, maximumActive } = heldParses();
            const commit = () => coordinator.run(root, parse, () => true);
            const first = commit();
            await microtasks(2);
            expect(passes).toHaveLength(1);
            const before = offset < 0 ? [commit(), commit()] : [];
            passes[0].resolve();
            await microtasks(Math.max(0, offset));
            const late = offset < 0 ? before : [commit(), commit()];
            let lateSettled = false;
            void Promise.all(late).then(() => { lateSettled = true; });
            await microtasks(10);
            expect(passes).toHaveLength(2);
            expect(lateSettled).toBe(false);
            passes[1].resolve();
            await Promise.all([first, ...late]);
            expect(passes).toHaveLength(2);
            expect(maximumActive()).toBe(1);
        },
    );

    it('does not block a separate root behind a pending popup', async () => {
        const coordinator = new NestedParseCoordinator();
        const pending = deferred();
        const first = coordinator.run(document.createElement('div'), () => pending.promise, () => true);
        let secondCalls = 0;
        await coordinator.run(document.createElement('div'), async () => { secondCalls += 1; }, () => true);
        expect(secondCalls).toBe(1);
        pending.resolve();
        await first;
    });

    it('drops queued work after dismissal', async () => {
        const coordinator = new NestedParseCoordinator();
        const root = document.createElement('div');
        const { parse, passes } = heldParses();
        let current = true;
        const first = coordinator.run(root, parse, () => current);
        await microtasks(2);
        const second = coordinator.run(root, parse, () => current);
        current = false;
        passes[0].resolve();
        await Promise.all([first, second]);
        expect(passes).toHaveLength(1);
    });

    it('releases a failed owner so a later request can retry', async () => {
        const coordinator = new NestedParseCoordinator();
        const root = document.createElement('div');
        let calls = 0;
        const parse = async () => {
            calls += 1;
            if (calls === 1) throw new Error('parse failed');
        };
        await expect(coordinator.run(root, parse, () => true)).rejects.toThrow('parse failed');
        await coordinator.run(root, parse, () => true);
        expect(calls).toBe(2);
    });
});
