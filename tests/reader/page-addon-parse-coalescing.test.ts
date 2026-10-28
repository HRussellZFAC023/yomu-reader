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

    it('serves an update landing around the owner release with an awaited follow-up pass', async () => {
        // Sweep the microtasks around the drain's final check and release
        // instead of trusting one hand-picked interleaving.
        for (let offset = 0; offset < 8; offset += 1) {
            const app = new ReaderApp();
            const internals = app as unknown as ReaderAppPageAddonParseInternals;
            const root = mountPageAddon();
            const passes: Array<ReturnType<typeof deferred>> = [];
            let activeParses = 0;
            let maximumActiveParses = 0;

            // A plain function, not vi.fn: a spy wraps the returned promise in
            // extra microtask hops and moves the update into the running pass.
            internals.performJpdbPageAddonJapaneseParse = () => {
                const pass = deferred();
                passes.push(pass);
                activeParses += 1;
                maximumActiveParses = Math.max(maximumActiveParses, activeParses);
                return pass.promise.then(() => { activeParses -= 1; });
            };

            try {
                const initialParse = internals.parseJpdbPageAddonJapanese(root);
                await vi.waitFor(() => expect(passes).toHaveLength(1));
                passes[0].resolve();
                for (let tick = 0; tick < offset; tick += 1) await Promise.resolve();
                const update = internals.parseJpdbPageAddonJapanese(root);
                let updateSettled = false;
                void update.then(() => { updateSettled = true; });
                await vi.waitFor(() => expect(passes, `offset ${offset}`).toHaveLength(2));
                expect(updateSettled, `offset ${offset}`).toBe(false);
                passes[1].resolve();
                await Promise.all([initialParse, update]);
                expect(passes, `offset ${offset}`).toHaveLength(2);
                expect(maximumActiveParses, `offset ${offset}`).toBe(1);
            } finally {
                passes.forEach(pass => pass.resolve());
                app.destroy();
                document.body.replaceChildren();
            }
        }
    });
});
