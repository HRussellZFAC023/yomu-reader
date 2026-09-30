import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { expect, vi } from 'vitest';
// @ts-expect-error Exercise the production manifest interpreter.
import { BUILD_MANIFEST, academyBuildManifest, renderAcademyTemplate, readAcademyBuildCode } from '../../scripts/lib/academy-build-manifest.cjs';
// @ts-expect-error Exercise the same source list used by sync.
import { academyRuntimeSources } from '../../scripts/lib/academy-revision.cjs';
import { hostedRuntimeGraphFixture } from './hosted-runtime-graph';

export function academyFixtureManifest() {
    return {
        'src/academy/entrypoint.ts': { isEntry: true, file: 'entry-contract.js', imports: ['shared'], dynamicImports: ['study'], css: ['assets/shell.css'] },
        shared: { file: 'chunks/shared.js' },
        study: { file: 'chunks/study-test.js', dynamicImports: ['lesson'], css: ['assets/study.css'] },
        lesson: { file: 'chunks/lesson-test.js', assets: ['assets/lesson.svg'] },
    };
}

function hostedAcademyFile(file: string): string {
    return path.resolve(process.env.YOMU_ACADEMY_TEST_HOSTED_DIR ?? 'docs/public/academy', file);
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

export async function expectAcademyCodeInstalled(activityKind: string): Promise<readonly string[]> {
    const manifest = JSON.parse(fs.readFileSync(hostedAcademyFile('manifest.json'), 'utf8'));
    const build = academyBuildManifest(manifest) as { entryFile: string; files: string[] };
    const harness = academyWorkerHarness(manifest);
    const requests = await installAcademyWorker(harness);
    for (const file of ['manifest.json', ...build.files]) {
        const url = `/academy/${file}${file === build.entryFile || file === 'manifest.json' ? `?v=${harness.revision}` : ''}`;
        expect(requests, `Missing install request: ${file}`).toContain(url);
        expect(fs.existsSync(hostedAcademyFile(file)), `Missing hosted file: ${file}`).toBe(true);
    }
    expect(readAcademyBuildCode(path.dirname(hostedAcademyFile('manifest.json')))).toContain(activityKind);
    expect(harness.cachePut).toHaveBeenCalledWith('/academy/.offline-ready', expect.any(Response));
    return requests;
}

export function expectAcademyAssetSynced(relative: string): void {
    const source = `public/academy/${relative}`;
    const sources = academyRuntimeSources((file: string) => JSON.parse(fs.readFileSync(
        file === BUILD_MANIFEST ? hostedAcademyFile('manifest.json') : file, 'utf8',
    ))) as Array<[string, string]>;
    expect(sources.some(([from, to]) => (source === from || source.startsWith(`${from}/`))
        && `${to}${source.slice(from.length)}` === relative), `Asset not allowlisted: ${source}`).toBe(true);
    expect(execFileSync('git', ['ls-files', '--error-unmatch', '--', source], { encoding: 'utf8' }).trim()).toBe(source);
    expect(fs.readFileSync(hostedAcademyFile(relative))).toEqual(fs.readFileSync(source));
}
