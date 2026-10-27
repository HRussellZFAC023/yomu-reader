import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, vi } from 'vitest';
// @ts-expect-error Exercise the production manifest interpreter.
import { renderAcademyTemplate } from '../../scripts/lib/academy-build-manifest.cjs';
import { hostedRuntimeGraphFixture } from './hosted-runtime-graph';

export function academyFixtureManifest() {
    return {
        'src/academy/entrypoint.ts': { isEntry: true, file: 'entry-contract.js', imports: ['shared'], dynamicImports: ['study'], css: ['assets/shell.css'] },
        shared: { file: 'chunks/shared.js' },
        study: { file: 'chunks/study-test.js', dynamicImports: ['lesson'], css: ['assets/study.css'] },
        lesson: { file: 'chunks/lesson-test.js', assets: ['assets/lesson.svg'] },
    };
}

export function academyWorkerHarness(manifest: object = academyFixtureManifest()) {
    const revision = 's1-cafebabe0000';
    const source = renderAcademyTemplate(fs.readFileSync('public/academy/sw.js', 'utf8'), revision, manifest);
    const listeners = new Map<string, (event: any) => void>();
    const cachedGraph = new Response('offline hosted graph');
    const networkResponse = new Response('network graph');
    const storyVoicePath = '/academy/audio/story-pilot/installed-cache-proof.opus';
    const storyCatalog = new Response(JSON.stringify({ schema: 'yomu-academy.story-voice-playback.v1', entries: [{ url: storyVoicePath }] }));
    const versionCacheMatch = vi.fn(async request => {
        if (request === '/academy/.offline-ready') return undefined;
        if (request === '/academy/index.html') return new Response(`<meta name="yomu-academy-revision" content="${revision}">`);
        return request === '/academy/audio/story-voice-playback.json' ? storyCatalog : cachedGraph;
    });
    const globalCacheMatch = vi.fn(async () => new Response('stale graph from another cache'));
    const cacheAddAll = vi.fn(async (_requests: readonly string[]): Promise<void> => {});
    const cachePut = vi.fn(async (_key: string, _response: Response): Promise<void> => {});
    const cacheDelete = vi.fn(async (_key: string) => true);
    const openCache = vi.fn(async () => ({ addAll: cacheAddAll, match: versionCacheMatch, put: cachePut }));
    const networkFetch = vi.fn(async () => networkResponse);
    const runtimeGraph = hostedRuntimeGraphFixture('Academy offline dependency', 'Academy offline core');
    const worker = {
        __yomuHostedRuntimeGraph: runtimeGraph,
        addEventListener: vi.fn((name: string, listener: (event: any) => void) => listeners.set(name, listener)),
        clients: { claim: vi.fn() }, location: { origin: 'https://yomureader.com' }, skipWaiting: vi.fn(),
    };
    runInNewContext(source, {
        Headers, Response, URL, atob,
        caches: { delete: cacheDelete, keys: vi.fn(async () => []), match: globalCacheMatch, open: openCache },
        fetch: networkFetch, importScripts: vi.fn(), self: worker,
    });
    return { cacheAddAll, cachePut, cacheDelete, cachedGraph, dependencyPath: `/${runtimeGraph.dependencies[0].path}`,
        globalCacheMatch, listeners, networkFetch, networkResponse, openCache, revision, storyVoicePath, versionCacheMatch, worker };
}

export async function installAcademyWorker(harness: ReturnType<typeof academyWorkerHarness>): Promise<readonly string[]> {
    const waitUntil = vi.fn();
    harness.listeners.get('install')?.({ waitUntil });
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
    return harness.cacheAddAll.mock.calls[0]?.[0] ?? [];
}
