import { afterEach, expect, it, vi } from 'vitest';

// Production bundles are built with MODE=production, which Vite substitutes at
// build time. Loopback app routes and synthetic-event seams exist only for the
// development userscript and tests.

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

async function buildMode(mode: 'production' | 'development') {
    vi.stubEnv('MODE', mode);
    vi.resetModules();
    const pages = await import('../../src/reader/app/pages-url');
    const hosted = await import('../../src/reader/app/hosted-storage-fallback');
    const seam = await import('../../src/reader/ui/sandbox-shared-state');
    return { pages, hosted, seam };
}

it('grants a localhost app route no storage or HTTP bridge in a production build', async () => {
    const { pages, hosted, seam } = await buildMode('production');
    for (const url of ['http://localhost:5174/study/', 'http://127.0.0.1:5174/newtab/', 'http://[::1]:5174/academy/']) {
        expect(pages.isYomuStorageBridgeHostedUrl(url)).toBe(false);
        expect(pages.isYomuPrivilegedHostedAppUrl(url)).toBe(false);
    }
    vi.stubGlobal('location', new URL('http://localhost:5174/study/'));
    expect(hosted.isHostedYomuOrigin()).toBe(false);
    expect(pages.isYomuStorageBridgeHostedUrl('https://yomureader.com/study/')).toBe(true);
    seam.allowSyntheticReaderInteractionsForTests(true);
    expect(seam.syntheticEventsAllowed()).toBe(false);
    vi.unstubAllGlobals();
});

it('keeps the local development routes for the development userscript', async () => {
    const { pages, seam } = await buildMode('development');
    expect(pages.isYomuStorageBridgeHostedUrl('http://localhost:5174/study/')).toBe(true);
    expect(pages.isYomuPrivilegedHostedAppUrl('http://127.0.0.1:5174/study/')).toBe(true);
    seam.allowSyntheticReaderInteractionsForTests(true);
    expect(seam.syntheticEventsAllowed()).toBe(true);
    seam.allowSyntheticReaderInteractionsForTests(false);
});
