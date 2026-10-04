import { describe, expect, it, vi } from 'vitest';

import { NestedParseCoordinator } from '../../src/reader/lookup/nested-parse-coordinator';

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(complete => { resolve = complete; });
    return { promise, resolve };
}

function pendingParseFixture() {
    const coordinator = new NestedParseCoordinator();
    const root = document.createElement('div');
    const pending = deferred();
    const parse = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    const first = coordinator.run(root, parse, () => true);
    return { coordinator, root, pending, parse, first };
}

describe('nested parse ownership', () => {
    it('coalesces synchronous requests and awaits a serialized follow-up after a late commit', async () => {
        const { coordinator, root, pending, parse, first } = pendingParseFixture();
        expect(coordinator.run(root, parse, () => true)).toBe(first);
        await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));

        expect(coordinator.run(root, parse, () => true)).toBe(first);
        expect(parse).toHaveBeenCalledTimes(1);
        pending.resolve();
        await first;

        expect(parse).toHaveBeenCalledTimes(2);
    });

    it('includes a commit between the final drain and owner release in the original caller promise', async () => {
        const { coordinator, root, pending, parse, first } = pendingParseFixture();
        await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
        const followUp = deferred();
        parse.mockReturnValueOnce(followUp.promise);
        let completed = false;
        void first.then(() => { completed = true; });

        pending.resolve();
        let second: Promise<void> | undefined;
        queueMicrotask(() => { second = coordinator.run(root, parse, () => true); });
        await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2));
        expect(second).toBe(first);
        expect(completed).toBe(false);
        followUp.resolve();
        await first;
        expect(completed).toBe(true);
        expect(parse).toHaveBeenCalledTimes(2);
    });

    it('does not block a separate root behind a pending popup', async () => {
        const coordinator = new NestedParseCoordinator();
        const pending = deferred();
        const first = coordinator.run(document.createElement('div'), () => pending.promise, () => true);
        const secondParse = vi.fn(async () => undefined);
        await coordinator.run(document.createElement('div'), secondParse, () => true);
        expect(secondParse).toHaveBeenCalledTimes(1);
        pending.resolve();
        await first;
    });

    it('drops queued work after dismissal', async () => {
        const coordinator = new NestedParseCoordinator();
        const root = document.createElement('div');
        const pending = deferred();
        const parse = vi.fn(() => pending.promise);
        let current = true;
        const first = coordinator.run(root, parse, () => current);
        await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
        const second = coordinator.run(root, parse, () => current);
        current = false;
        pending.resolve();
        await Promise.all([first, second]);
        expect(parse).toHaveBeenCalledTimes(1);
    });

    it('releases a failed owner so a later request can retry', async () => {
        const coordinator = new NestedParseCoordinator();
        const root = document.createElement('div');
        const parse = vi.fn().mockRejectedValueOnce(new Error('parse failed')).mockResolvedValue(undefined);
        await expect(coordinator.run(root, parse, () => true)).rejects.toThrow('parse failed');
        await coordinator.run(root, parse, () => true);
        expect(parse).toHaveBeenCalledTimes(2);
    });
});
