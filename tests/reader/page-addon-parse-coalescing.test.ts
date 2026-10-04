import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';

interface ReaderAppPageAddonParseInternals {
    parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void>;
    performJpdbPageAddonJapaneseParse(root: HTMLElement): Promise<void>;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

function mountPageAddon(): HTMLElement {
    const root = document.createElement('div');
    root.dataset.yomuJpdbAddon = 'word';
    document.body.append(root);
    return root;
}

describe('enhanced-page addon parse coalescing', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('serializes progressive hydration parses and coalesces updates received during a running pass', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppPageAddonParseInternals;
        const root = mountPageAddon();
        const firstPass = deferred();
        const secondPass = deferred();
        const firstStarted = deferred();
        const secondStarted = deferred();
        let activeParses = 0;
        let maximumActiveParses = 0;
        let parseCount = 0;

        internals.performJpdbPageAddonJapaneseParse = vi.fn(async () => {
            const index = parseCount++;
            activeParses += 1;
            maximumActiveParses = Math.max(maximumActiveParses, activeParses);
            (index === 0 ? firstStarted : secondStarted).resolve();
            await (index === 0 ? firstPass : secondPass).promise;
            activeParses -= 1;
        });

        try {
            const initialParse = internals.parseJpdbPageAddonJapanese(root);
            await firstStarted.promise;

            const progressiveHydrations = Array.from(
                { length: 5 },
                () => internals.parseJpdbPageAddonJapanese(root),
            );
            await Promise.resolve();

            expect(parseCount).toBe(1);
            expect(maximumActiveParses).toBe(1);

            firstPass.resolve();
            await secondStarted.promise;

            expect(parseCount).toBe(2);
            expect(maximumActiveParses).toBe(1);

            secondPass.resolve();
            await Promise.all([initialParse, ...progressiveHydrations]);

            expect(internals.performJpdbPageAddonJapaneseParse).toHaveBeenCalledTimes(2);
            expect(maximumActiveParses).toBe(1);
        } finally {
            firstPass.resolve();
            secondPass.resolve();
            app.destroy();
        }
    });

    it('runs a follow-up pass when an update arrives after the drain check but before running is released', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppPageAddonParseInternals;
        const root = mountPageAddon();
        const pending = deferred();
        const followUp = deferred();
        const started = deferred();
        let boundaryRequest: Promise<void> | undefined;
        let parseCount = 0;
        let activeParses = 0;
        let maximumActiveParses = 0;

        internals.performJpdbPageAddonJapaneseParse = vi.fn(() => {
            activeParses += 1;
            maximumActiveParses = Math.max(maximumActiveParses, activeParses);
            const pass = parseCount++ === 0 ? pending.promise : followUp.promise;
            void pass.then(() => { activeParses -= 1; });
            started.resolve();
            return pass;
        });

        try {
            const initialParse = internals.parseJpdbPageAddonJapanese(root);
            let completed = false;
            void initialParse.then(() => { completed = true; });
            await started.promise;
            pending.resolve();
            // The awaiting drain resumes first and finishes its dirty check;
            // this commit precedes the owner's queued finally continuation.
            queueMicrotask(() => { boundaryRequest = internals.parseJpdbPageAddonJapanese(root); });
            await vi.waitFor(() => expect(parseCount).toBe(2));
            expect(boundaryRequest).toBe(initialParse);
            expect(completed).toBe(false);
            followUp.resolve();
            await initialParse;
            expect(completed).toBe(true);
            expect(internals.performJpdbPageAddonJapaneseParse).toHaveBeenCalledTimes(2);
            expect(maximumActiveParses).toBe(1);
        } finally {
            pending.resolve();
            followUp.resolve();
            app.destroy();
        }
    });
});
