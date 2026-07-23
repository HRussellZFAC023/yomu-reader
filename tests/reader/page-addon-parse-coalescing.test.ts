import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';

interface PageAddonParseState {
    dirty: boolean;
    running?: Promise<void>;
}

interface ReaderAppPageAddonParseInternals {
    parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void>;
    flushJpdbPageAddonJapaneseParse(root: HTMLElement, state: PageAddonParseState): Promise<void>;
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
        const originalFlush = internals.flushJpdbPageAddonJapaneseParse.bind(app);
        let boundaryRequest: Promise<void> | undefined;
        let injectAtDrainBoundary = true;
        let activeParses = 0;
        let maximumActiveParses = 0;

        internals.performJpdbPageAddonJapaneseParse = vi.fn(async () => {
            activeParses += 1;
            maximumActiveParses = Math.max(maximumActiveParses, activeParses);
            await Promise.resolve();
            activeParses -= 1;
        });
        internals.flushJpdbPageAddonJapaneseParse = async (addonRoot, state) => {
            await originalFlush(addonRoot, state);
            if (!injectAtDrainBoundary) return;
            injectAtDrainBoundary = false;
            // The original drain has completed its final dirty check, while
            // parseJpdbPageAddonJapanese still owns `state.running`. This is
            // the narrow provider-hydration race handled by its `finally`.
            boundaryRequest = internals.parseJpdbPageAddonJapanese(addonRoot);
        };

        try {
            await internals.parseJpdbPageAddonJapanese(root);
            await boundaryRequest;

            expect(boundaryRequest).toBeDefined();
            expect(internals.performJpdbPageAddonJapaneseParse).toHaveBeenCalledTimes(2);
            expect(maximumActiveParses).toBe(1);
        } finally {
            app.destroy();
        }
    });
});
