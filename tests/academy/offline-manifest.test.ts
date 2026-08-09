import fs from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { vi } from 'vitest';
import { ACADEMY_CAST_SPRITE_COVERAGE, ACADEMY_RUNTIME_ASSET_REGISTRY } from '../../src/academy/assets';
import { hostedRuntimeGraphFixture, type HostedRuntimeGraphFixture } from '../helpers/hosted-runtime-graph';

describe('Academy offline shell', () => {
    it('keeps deployable Academy text inputs free of private workstation paths', () => {
        const runtimeRoot = path.resolve('public/academy');
        const privatePath = /(?:\/Users\/[^/\s]+(?:\/|$)|\/home\/[^/\s]+(?:\/|$)|[A-Za-z]:\\+Users\\+[^\\\s]+(?:\\+|$))/u;
        const leaks = runtimeTextFiles(runtimeRoot).flatMap(file => {
            const source = fs.readFileSync(file, 'utf8');
            return privatePath.test(source) ? [path.relative(runtimeRoot, file)] : [];
        });

        expect(leaks).toEqual([]);
    });

    it('uses a unique precache manifest whose hosted targets all exist', () => {
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const source = fs.readFileSync(path.resolve(workerPath), 'utf8');
            const urls = [...literalPrecacheUrls(source), ...hostedRuntimePrecacheUrls()];
            const missing = urls.filter(url => !fs.existsSync(hostedPathFor(url)));

            expect(urls, `${workerPath} contains duplicate precache requests`).toEqual([...new Set(urls)]);
            expect(missing, `${workerPath} references missing hosted files`).toEqual([]);
        }
    });

    it('pre-caches the hosted Reader and every enrollment-slice dependency', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const revision = source.match(/const VERSION = 'yomu-academy-shell-([^']+)'/)?.[1];
        expect(revision).toMatch(/^s1-[a-f0-9]{12}$/);
        for (const required of [
            `/academy/app.js?v=${revision}`,
            '/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.webp',
            '/academy/art/characters/rie/rie__happy-glasses__front-near-front__halfbody__v001.webp',
            '/academy/art/characters/rie/rie__sad-vulnerable-glasses__left-three-quarter__halfbody__v001.webp',
            '/academy/art/characters/rie/rie__comedic-glasses__right-three-quarter__halfbody__v001.webp',
            '/academy/art/ACADEMY-ASSET-REGISTRY.json',
            '/academy/art/ASSET-USAGE.json',
            '/academy/art/SPRITE-BATCH-MANIFEST.json',
            '/academy/art/locations/wide/writing-studio__rain-night--wide.webp',
            '/academy/art/locations/wide/tube-platform__blue-hour-rain--wide.webp',
            '/academy/art/events/rainy-directions__rie-aakash__v001.webp',
            '/academy/art/items/street-direction-map__v001.jpg',
            '/academy/art/items/cafe-order-scene__v001.jpg',
            '/academy/content/vertical-slice/source-library.v1.json',
            '/academy/content/listening/listening-task-bindings.v1.json',
            '/academy/content/listening/media/academy-listening-75194e1fda2886b7.mp3',
            '/academy/content/listening/media/academy-listening-52ba9cd972e544ef.mp3',
            '/academy/content/listening/media/academy-listening-75b031947b395f44.mp3',
            '/academy/content/listening/media/academy-listening-b076fb0e90d9e1b2.mp3',
            '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
            '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
            '/academy/content/listening/media/academy-listening-1039d11bef7a0575.mp3',
            '/academy/content/lessons/lesson-zero.v1.json',
            '/academy/audio/story-voice-playback.json',
            '/academy/content/lessons/l1-l19/moodle-chapter-11-2-ordering-food-page-2.png',
            '/academy/content/lessons/l1-l19/moodle-43-a-43.mp3',
            '/academy/content/lessons/l1-l19/moodle-44-a-44.mp3',
            '/academy/content/lessons/l1-l21/moodle-chapter-11-4-duration-page-1.png',
            '/academy/content/lessons/l1-l21/moodle-chapter-11-4-duration-page-3.png',
            '/academy/content/lessons/l1-l21/moodle-46-a-46.mp3',
            '/academy/content/lessons/l1-l22/moodle-katakana-writing-basic-page-1.png',
            '/academy/content/lessons/l1-l22/moodle-katakana-list-page-1.png',
            '/academy/content/lessons/l2-l02/moodle-chapter-19-1-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l02/moodle-chapter-19-listening-page-1.png',
            '/academy/content/lessons/l2-l02/moodle-b-21.mp3',
            '/academy/content/lessons/l2-l03/moodle-chapter-19-2-3-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l03/moodle-chapter-19-2-tari-grammar-page-3.png',
            '/academy/content/listening/media/academy-listening-6dccd9517dc4e10f.mp3',
            '/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3',
            '/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3',
            '/academy/content/lessons/l2-l04/moodle-chapter-20-1-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l04/moodle-chapter-20-1-plain-style-verb-page-3.png',
            '/academy/content/lessons/l2-l05/moodle-chapter-20-2-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png',
            '/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png',
            '/academy/content/lessons/l2-l05/moodle-b-24.mp3',
            '/academy/content/lessons/l2-l12/moodle-track-78-bank-listening-page-1.png',
            '/academy/vendor/kanjivg/04e00.svg',
            '/academy/vendor/kanjivg/ATTRIBUTION.md',
        ]) expect(source).toContain(`'${required}'`);
        expect(source).toContain(`importScripts('/hosted-runtime-graph.js?v=${revision}');`);
        expect(source).toContain('const READER_RUNTIME = hostedReaderRuntime(self.__yomuHostedRuntimeGraph);');
        expect(source).toContain('const READER_RUNTIME_PATHS = READER_RUNTIME.precachePaths;');
        expect(source).toContain('const READER_RUNTIME_PRECACHE_REQUESTS = READER_RUNTIME_PATHS.map(readerRuntimeCacheKey);');
        expect(source).toContain('    ...READER_RUNTIME_PRECACHE_REQUESTS,');
        expect(source).toContain('const isReaderRuntime = READER_RUNTIME_PATH_SET.has(url.pathname);');
        expect(source).not.toMatch(/greasyfork\/yomu-(?:ui-copy|settings-surface|kanji-study|anki|bunpro)\.user\.js/u);
        expect(source).toContain("url.pathname.startsWith('/academy/media/')");
    });

    it('serves a revisioned hosted graph request from the offline precache', async () => {
        const harness = academyWorkerHarness();
        const { response } = await dispatchAcademyWorkerFetch(
            harness,
            `https://yomureader.com/hosted-runtime-graph.js?v=${harness.revision}`,
        );

        expect(response).toBe(harness.cachedGraph);
        expect(harness.openCache).toHaveBeenCalledWith(`yomu-academy-shell-${harness.revision}`);
        expect(harness.versionCacheMatch).toHaveBeenCalledWith(
            `/hosted-runtime-graph.js?v=${harness.revision}`,
        );
        expect(harness.globalCacheMatch).not.toHaveBeenCalled();
        expect(harness.networkFetch).not.toHaveBeenCalled();
    });

    it('never answers a newer mutable runtime revision from the old Academy cache', async () => {
        const harness = academyWorkerHarness();
        const { request, response } = await dispatchAcademyWorkerFetch(
            harness,
            'https://yomureader.com/yomu.user.js?v=s1-feedface0000',
        );

        expect(response).toBe(harness.networkResponse);
        expect(harness.networkFetch).toHaveBeenCalledWith(request);
        expect(harness.openCache).not.toHaveBeenCalled();
        expect(harness.globalCacheMatch).not.toHaveBeenCalled();
    });

    it('installs mutable Reader assets under the exact Academy revision cache keys', async () => {
        const harness = academyWorkerHarness();
        const waitUntil = vi.fn();
        harness.listeners.get('install')?.({ waitUntil });
        expect(waitUntil).toHaveBeenCalledOnce();
        await waitUntil.mock.calls[0][0];

        const coreRequests = harness.cacheAddAll.mock.calls[0]?.[0] ?? [];
        expect(coreRequests).toContain(`/hosted-runtime-graph.js?v=${harness.revision}`);
        expect(coreRequests).toContain(`/yomu.user.js?v=${harness.revision}`);
        expect(coreRequests).toContain(`/yomu.css?v=${harness.revision}`);
        expect(coreRequests).toContain(harness.dependencyPath);
        for (const bareMutablePath of [
            '/hosted-runtime-graph.js',
            '/yomu.user.js',
            '/yomu.css',
        ]) expect(coreRequests).not.toContain(bareMutablePath);
        expect(harness.cacheAddAll.mock.calls[1]?.[0]).toEqual([harness.storyVoicePath]);
        expect(harness.worker.skipWaiting).toHaveBeenCalledOnce();
    });

    it('pre-caches every locked story voice through the playback catalog', () => {
        for (const root of ['public', 'docs/public']) {
            const worker = fs.readFileSync(path.resolve(root, 'academy/sw.js'), 'utf8');
            const catalogPath = path.resolve(root, 'academy/audio/story-voice-playback.json');
            const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
                schema?: string;
                entries?: Array<{ reviewStatus?: string; url?: string }>;
            };
            expect(catalog.schema).toBe('yomu-academy.story-voice-playback.v1');
            expect(catalog.entries?.length).toBeGreaterThan(0);
            const urls = catalog.entries?.map(entry => entry.url) ?? [];
            expect(urls).toEqual([...new Set(urls)]);
            for (const entry of catalog.entries ?? []) {
                expect(entry.reviewStatus).toBe('locked');
                expect(entry.url).toMatch(/^\/academy\/audio\/story-(?:pilot|lines)\/[a-z0-9][a-z0-9._-]*\.opus$/u);
                expect(fs.existsSync(hostedPathForRoot(root, entry.url ?? ''))).toBe(true);
            }
            expect(worker).toContain('event.waitUntil(installOfflineShell());');
            expect(worker).toContain('await cache.addAll(storyVoicePaths);');
        }
    });

    it('keeps every typed runtime asset in the offline core', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const runtimeAssets = registryAssetPaths();
        for (const asset of runtimeAssets) {
            expect(source, `missing offline asset ${asset}`).toContain(`'${asset}'`);
        }
        const precachedArt = [...source.matchAll(/^\s+'(\/academy\/art\/[^']+)',$/gmu)].map(match => match[1]);
        expect(new Set(precachedArt)).toEqual(new Set([
            ...runtimeAssets,
            '/academy/art/ACADEMY-ASSET-REGISTRY.json',
            '/academy/art/ASSET-USAGE.json',
            '/academy/art/SPRITE-BATCH-MANIFEST.json',
        ]));
    });

    it('precaches every cast sprite covered by the presentation registry', () => {
        const source = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const castSpritePaths = Object.keys(ACADEMY_CAST_SPRITE_COVERAGE).flatMap(id =>
            Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY[id as keyof typeof ACADEMY_RUNTIME_ASSET_REGISTRY].files),
        );
        for (const asset of castSpritePaths) expect(source).toContain(`'${asset}'`);
    });

    it('uses one matching shell revision and never caches failed navigation', () => {
        const index = fs.readFileSync(path.resolve('docs/public/academy/index.html'), 'utf8');
        const worker = fs.readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        const sourceIndex = fs.readFileSync(path.resolve('public/academy/index.html'), 'utf8');
        const sourceWorker = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        const appRevision = index.match(/\/academy\/app\.js\?v=([^"']+)/)?.[1];
        const styleRevision = index.match(/\/academy\/style\.css\?v=([^"']+)/)?.[1];
        const workerRevision = worker.match(/const VERSION = 'yomu-academy-shell-([^']+)'/)?.[1];

        expect(appRevision).toBeTruthy();
        expect(styleRevision).toBe(appRevision);
        expect(workerRevision).toBe(appRevision);
        expect(worker).toContain(`'/academy/app.js?v=${appRevision}'`);
        expect(worker).toContain(`'/academy/style.css?v=${appRevision}'`);
        expect(worker).toContain('if (!response.ok) return response;');
        expect(sourceIndex).toContain('__ACADEMY_REVISION__');
        expect(sourceWorker).toContain('__ACADEMY_REVISION__');
        expect(index).not.toContain('__ACADEMY_REVISION__');
        expect(worker).not.toContain('__ACADEMY_REVISION__');
    });
});

function academyWorkerHarness() {
    const revision = 's1-cafebabe0000';
    const source = fs.readFileSync(path.resolve('public/academy/sw.js'), 'utf8')
        .replaceAll('__ACADEMY_REVISION__', revision);
    const listeners = new Map<string, (event: any) => void>();
    const cachedGraph = new Response('offline hosted graph');
    const networkResponse = new Response('network graph');
    const storyVoicePath = '/academy/audio/story-pilot/installed-cache-proof.opus';
    const storyCatalog = new Response(JSON.stringify({
        schema: 'yomu-academy.story-voice-playback.v1',
        entries: [{ url: storyVoicePath }],
    }), { headers: { 'content-type': 'application/json' } });
    const versionCacheMatch = vi.fn(async request => (
        request === '/academy/audio/story-voice-playback.json' ? storyCatalog : cachedGraph
    ));
    const globalCacheMatch = vi.fn(async () => new Response('stale graph from another cache'));
    const cacheAddAll = vi.fn(async (_requests: readonly string[]) => undefined);
    const cachePut = vi.fn(async () => undefined);
    const openCache = vi.fn(async () => ({ addAll: cacheAddAll, match: versionCacheMatch, put: cachePut }));
    const networkFetch = vi.fn(async () => networkResponse);
    const runtimeGraph = hostedRuntimeGraphFixture('Academy offline dependency', 'Academy offline core');
    const worker = {
        __yomuHostedRuntimeGraph: runtimeGraph,
        addEventListener: vi.fn((name: string, listener: (event: any) => void) => listeners.set(name, listener)),
        clients: { claim: vi.fn() },
        location: { origin: 'https://yomureader.com' },
        skipWaiting: vi.fn(),
    };
    runInNewContext(source, {
        Headers,
        Response,
        URL,
        atob,
        caches: {
            delete: vi.fn(),
            keys: vi.fn(async () => []),
            match: globalCacheMatch,
            open: openCache,
        },
        fetch: networkFetch,
        importScripts: vi.fn(),
        self: worker,
    });
    return {
        cacheAddAll,
        cachedGraph,
        dependencyPath: `/${runtimeGraph.dependencies[0].path}`,
        globalCacheMatch,
        listeners,
        networkFetch,
        networkResponse,
        openCache,
        revision,
        storyVoicePath,
        versionCacheMatch,
        worker,
    };
}

async function dispatchAcademyWorkerFetch(
    harness: ReturnType<typeof academyWorkerHarness>,
    url: string,
): Promise<{ readonly request: { readonly method: 'GET'; readonly mode: 'cors'; readonly url: string }; readonly response: Response }> {
    const request = { method: 'GET' as const, mode: 'cors' as const, url };
    const respondWith = vi.fn();
    harness.listeners.get('fetch')?.({ request, respondWith });
    expect(respondWith).toHaveBeenCalledOnce();
    return { request, response: await respondWith.mock.calls[0][0] };
}

function registryAssetPaths(): string[] {
    return Object.values(ACADEMY_RUNTIME_ASSET_REGISTRY)
        .flatMap(asset => Object.values(asset.files))
        .sort();
}

function literalPrecacheUrls(source: string): string[] {
    const readArray = (name: string): string[] => {
        const body = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`, 'u'))?.[1];
        if (!body) throw new Error(`Missing ${name} service-worker manifest`);
        return [...body.matchAll(/^\s*'([^']+)',?$/gmu)].map(match => match[1]);
    };

    return [...readArray('RUNTIME_ART_PRECACHE'), ...readArray('CORE')];
}

function hostedRuntimePrecacheUrls(): string[] {
    const realm = {} as { __yomuHostedRuntimeGraph?: HostedRuntimeGraphFixture };
    const source = fs.readFileSync(path.resolve('docs/public/hosted-runtime-graph.js'), 'utf8');
    runInNewContext(source, { globalThis: realm });
    const graph = realm.__yomuHostedRuntimeGraph;
    if (!graph) throw new Error('Committed hosted runtime graph is missing');
    return [
        '/hosted-runtime-graph.js',
        ...graph.dependencies.map(entry => `/${entry.path}`),
        `/${graph.core.path}`,
        '/yomu.css',
    ];
}

function hostedPathFor(rawUrl: string): string {
    return hostedPathForRoot('docs/public', rawUrl);
}

function hostedPathForRoot(root: string, rawUrl: string): string {
    const pathname = new URL(rawUrl, 'https://yomureader.com').pathname;
    const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    return path.resolve(root, `.${relativePath}`);
}

function runtimeTextFiles(directory: string): string[] {
    const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.webmanifest']);
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return runtimeTextFiles(file);
        return textExtensions.has(path.extname(entry.name)) ? [file] : [];
    });
}
