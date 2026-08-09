import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    hostedRuntimeGraph,
    stampHostedRuntimeGraph,
    stampHostedRuntimeServiceWorker,
} = require('../../scripts/lib/hosted-runtime-graph.cjs') as {
    hostedRuntimeGraph: (userscript: string) => {
        pagePaths: string[];
        serviceWorkerPaths: string[];
        cacheRevision: string;
    };
    stampHostedRuntimeGraph: (source: string, paths: string[]) => string | undefined;
    stampHostedRuntimeServiceWorker: (
        source: string,
        graph: { serviceWorkerPaths: string[]; cacheRevision: string },
        cacheNamePrefix: string,
    ) => string | undefined;
};

const START_MARKER = '// yomu:runtime-companions:start';
const END_MARKER = '// yomu:runtime-companions:end';
const FINAL_USERSCRIPT = readFileSync('dist/yomu.user.js', 'utf8');
const FINAL_GRAPH = hostedRuntimeGraph(FINAL_USERSCRIPT);
const HOSTED_WORKER_RUNTIME = readFileSync('docs/public/hosted-reader-worker.js', 'utf8');

type HostedWorkerConfig = {
    cacheName: string;
    runtimeGraph: string[];
    cacheablePathPrefixes?: string[];
};

type HostedWorkerEvent = {
    request?: { method: string; mode: string; url: string };
    waitUntil?: (promise: Promise<unknown>) => void;
    respondWith?: (promise: Promise<unknown>) => void;
};

type HostedWorkerListener = (event: HostedWorkerEvent) => void;

function hostedWorkerHarness(scopePath: string, wrapperSource = '') {
    const listeners = new Map<string, HostedWorkerListener>();
    const addAll = vi.fn(async (_paths: string[]) => undefined);
    const put = vi.fn(async () => undefined);
    const cacheMatch = vi.fn(async () => new Response('current cache'));
    const cache = { addAll, put, match: cacheMatch };
    const cacheStorage = {
        open: vi.fn(async () => cache),
        keys: vi.fn(async () => [] as string[]),
        delete: vi.fn(async () => true),
        match: vi.fn(async () => new Response('decoy global cache')),
    };
    const worker = {
        location: { origin: 'https://yomureader.com' },
        registration: { scope: `https://yomureader.com${scopePath}` },
        clients: { claim: vi.fn() },
        skipWaiting: vi.fn(),
        addEventListener: vi.fn((name: string, listener: HostedWorkerListener) => {
            listeners.set(name, listener);
        }),
        registerYomuHostedReaderWorker: undefined as ((config: HostedWorkerConfig) => void) | undefined,
    };
    const networkFetch = vi.fn(async (..._args: unknown[]) => new Response('network'));
    const importScripts = vi.fn();
    runInNewContext(`${HOSTED_WORKER_RUNTIME}\n${wrapperSource}`, {
        self: worker,
        caches: cacheStorage,
        fetch: networkFetch,
        importScripts,
        URL,
        Response,
    });
    return {
        addAll,
        cacheMatch,
        cacheStorage,
        importScripts,
        listeners,
        networkFetch,
        put,
        register: worker.registerYomuHostedReaderWorker!,
        worker,
    };
}

async function dispatchHostedWorkerFetch(listener: HostedWorkerListener, url: string, mode = 'cors') {
    const request = { method: 'GET', mode, url };
    const respondWith = vi.fn();
    listener({ request, respondWith });
    expect(respondWith).toHaveBeenCalledTimes(1);
    return { request, response: await respondWith.mock.calls[0][0] };
}

function arrayStringValues(source: string, name: string): string[] {
    const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`, 'u'));
    if (!match) throw new Error(`Missing array ${name}`);
    return [...match[1].matchAll(/^\s*'([^']+)',\s*$/gmu)].map(value => value[1]);
}

function markedStringValues(source: string): string[] {
    const starts = source.split(START_MARKER).length - 1;
    const ends = source.split(END_MARKER).length - 1;
    if (starts !== 1 || ends !== 1) throw new Error('Expected exactly one hosted runtime marker block');
    const body = source.slice(
        source.indexOf(START_MARKER) + START_MARKER.length,
        source.indexOf(END_MARKER),
    );
    return [...body.matchAll(/^\s*'([^']+)',\s*$/gmu)].map(value => value[1]);
}

describe('hosted runtime graph generator', () => {
    const template = [
        'const RUNTIME_GRAPH = [',
        `  ${START_MARKER}`,
        "  'greasyfork/yomu-runtime.000000000000.user.js',",
        `  ${END_MARKER}`,
        '];',
    ].join('\n');

    it('extracts immutable dependencies in final @require order and shapes service-worker paths', () => {
        expect(FINAL_GRAPH.pagePaths.length).toBeGreaterThan(0);
        expect(FINAL_GRAPH.pagePaths).toEqual(
            FINAL_GRAPH.serviceWorkerPaths.map(path => path.replace(/^\//u, '')),
        );
        expect(FINAL_GRAPH.pagePaths.every(path => /\.[a-f\d]{12}\.user\.js$/u.test(path))).toBe(true);
        expect(FINAL_GRAPH.cacheRevision).toMatch(/^[a-f\d]{12}$/u);
    });

    it('rejects mutable or registry-divergent final @require graphs', () => {
        expect(() => hostedRuntimeGraph(
            FINAL_USERSCRIPT.replace(/\.[a-f\d]{12}(?=\.user\.js#sha256=)/u, ''),
        )).toThrow(/mutable userscript @require/u);
        expect(() => hostedRuntimeGraph(
            FINAL_USERSCRIPT.replace(/yomu-runtime(?=\.[a-f\d]{12}\.user\.js#sha256=)/u, 'yomu-other'),
        )).toThrow(/ordered companion registry/u);
    });

    it('stamps marker blocks idempotently and preserves dependency order', () => {
        const once = stampHostedRuntimeGraph(template, FINAL_GRAPH.pagePaths);
        expect(once).toBeDefined();
        expect(markedStringValues(once!)).toEqual(FINAL_GRAPH.pagePaths);
        expect(stampHostedRuntimeGraph(once!, FINAL_GRAPH.pagePaths)).toBe(once);
    });

    it('rejects empty, unsafe, and duplicate path graphs', () => {
        expect(() => stampHostedRuntimeGraph(template, []))
            .toThrow(/at least one companion path/u);
        expect(() => stampHostedRuntimeGraph(template, null as unknown as string[]))
            .toThrow(/at least one companion path/u);
        expect(() => stampHostedRuntimeGraph(template, ['greasyfork/yomu-runtime.user.js']))
            .toThrow(/Unsafe hosted runtime companion path/u);
        expect(() => stampHostedRuntimeGraph(template, [undefined as unknown as string]))
            .toThrow(/Unsafe hosted runtime companion path: undefined/u);
        expect(() => stampHostedRuntimeGraph(template, new Array<string>(1)))
            .toThrow(/Unsafe hosted runtime companion path: undefined/u);
        expect(() => stampHostedRuntimeGraph(template, ['../greasyfork/yomu-runtime.000000000000.user.js']))
            .toThrow(/Unsafe hosted runtime companion path/u);
        expect(() => stampHostedRuntimeGraph(template, [FINAL_GRAPH.pagePaths[0], FINAL_GRAPH.pagePaths[0]]))
            .toThrow(/must be unique/u);
    });

    it('fails closed unless both markers are unique, ordered, whole lines', () => {
        expect(stampHostedRuntimeGraph('const graph = [];', FINAL_GRAPH.pagePaths)).toBeUndefined();
        expect(stampHostedRuntimeGraph(`${template}\n${START_MARKER}`, FINAL_GRAPH.pagePaths)).toBeUndefined();
        expect(stampHostedRuntimeGraph(`${template}\n${END_MARKER}`, FINAL_GRAPH.pagePaths)).toBeUndefined();
        expect(stampHostedRuntimeGraph(
            `${END_MARKER}\nconst graph = [];\n${START_MARKER}`,
            FINAL_GRAPH.pagePaths,
        )).toBeUndefined();
        expect(stampHostedRuntimeGraph(
            `const graph = []; ${START_MARKER}\n${END_MARKER}`,
            FINAL_GRAPH.pagePaths,
        )).toBeUndefined();
        expect(stampHostedRuntimeGraph(
            `${START_MARKER}\n${END_MARKER} executeAfterMarker();`,
            FINAL_GRAPH.pagePaths,
        )).toBeUndefined();
        expect(stampHostedRuntimeGraph(
            `${template}\nconst duplicate = '${END_MARKER}';`,
            FINAL_GRAPH.pagePaths,
        )).toBeUndefined();
    });

    it('preserves CRLF newlines and tab indentation', () => {
        const crlfTemplate = [
            'const RUNTIME_GRAPH = [',
            `\t${START_MARKER}`,
            "\t'greasyfork/yomu-runtime.000000000000.user.js',",
            `\t${END_MARKER}`,
            '];',
        ].join('\r\n');
        const stamped = stampHostedRuntimeGraph(crlfTemplate, FINAL_GRAPH.pagePaths);
        expect(stamped).toBeDefined();
        expect(stamped).toContain(
            `\t${START_MARKER}\r\n\t'${FINAL_GRAPH.pagePaths[0]}',\r\n`,
        );
        expect(stamped).not.toMatch(/(?<!\r)\n/u);
    });

    it('changes the service-worker cache revision when final core bytes change', () => {
        const changedGraph = hostedRuntimeGraph(`${FINAL_USERSCRIPT}\n// distinct core bytes`);
        expect(changedGraph.pagePaths).toEqual(FINAL_GRAPH.pagePaths);
        expect(changedGraph.cacheRevision).not.toBe(FINAL_GRAPH.cacheRevision);
    });

    it('stamps the service-worker graph and core-addressed cache atomically', () => {
        const serviceWorkerTemplate = [
            '// yomu:runtime-cache:start',
            "const CACHE_NAME = 'yomu-video-player-old';",
            '// yomu:runtime-cache:end',
            template,
        ].join('\n');
        const stamped = stampHostedRuntimeServiceWorker(
            serviceWorkerTemplate,
            FINAL_GRAPH,
            'yomu-video-player-',
        );
        expect(stamped).toContain(`const CACHE_NAME = 'yomu-video-player-${FINAL_GRAPH.cacheRevision}';`);
        expect(markedStringValues(stamped!)).toEqual(FINAL_GRAPH.serviceWorkerPaths);
        expect(stampHostedRuntimeServiceWorker(stamped!, FINAL_GRAPH, 'yomu-video-player-')).toBe(stamped);
    });
});

describe('committed standalone hosted runtime consumers', () => {
    const surfaces = [
        {
            name: 'PDF reader',
            page: 'docs/public/pdf-reader/index.html',
            pageArray: 'runtimeCompanionFiles',
            serviceWorker: 'docs/public/pdf-reader/sw.js',
            cachePrefix: 'yomu-pdf-reader-',
        },
        {
            name: 'video player',
            page: 'docs/public/video-player/index.html',
            pageArray: 'runtimeCompanionScripts',
            serviceWorker: 'docs/public/video-player/sw.js',
            cachePrefix: 'yomu-video-player-',
        },
    ];

    it.each(surfaces)('$name HTML loader equals the final core dependency graph', surface => {
        const source = readFileSync(surface.page, 'utf8');
        expect(arrayStringValues(source, surface.pageArray)).toEqual(FINAL_GRAPH.pagePaths);
        expect(markedStringValues(source)).toEqual(FINAL_GRAPH.pagePaths);
    });

    it.each(surfaces)('$name service worker delegates the same atomic graph to the shared worker', surface => {
        const source = readFileSync(surface.serviceWorker, 'utf8');
        expect(arrayStringValues(source, 'RUNTIME_GRAPH')).toEqual(FINAL_GRAPH.serviceWorkerPaths);
        expect(markedStringValues(source)).toEqual(FINAL_GRAPH.serviceWorkerPaths);
        expect(source).toContain(`const CACHE_NAME = '${surface.cachePrefix}${FINAL_GRAPH.cacheRevision}';`);
        expect(source).toContain("importScripts('../hosted-reader-worker.js');");
        expect(source).toContain('self.registerYomuHostedReaderWorker({');
        expect(source).toContain('runtimeGraph: RUNTIME_GRAPH,');
    });

    it('prepares and activates one fresh PDF cache, matches its graph/vendor policy, and falls back offline', async () => {
        const source = readFileSync('docs/public/pdf-reader/sw.js', 'utf8');
        const harness = hostedWorkerHarness('/pdf-reader/', source);
        const cacheName = `yomu-pdf-reader-${FINAL_GRAPH.cacheRevision}`;
        const oldCacheName = 'yomu-pdf-reader-000000000000';
        let installPromise = Promise.resolve<unknown>(undefined);
        harness.listeners.get('install')!({ waitUntil: promise => { installPromise = promise; } });
        await installPromise;

        expect(harness.importScripts).toHaveBeenCalledWith('../hosted-reader-worker.js');
        expect(harness.cacheStorage.open).toHaveBeenCalledWith(cacheName);
        expect(harness.addAll).toHaveBeenCalledWith([
            './',
            './index.html',
            './manifest.webmanifest',
            '../yomu.css',
            '../yomu.user.js',
            ...FINAL_GRAPH.serviceWorkerPaths.map(pathname => `..${pathname}`),
            '../yomu-icon.svg',
            '../favicon-16x16.png',
            '../favicon-32x32.png',
            '../apple-touch-icon.png',
        ]);
        expect(harness.cacheStorage.delete).not.toHaveBeenCalled();

        harness.cacheStorage.keys.mockResolvedValue([cacheName, oldCacheName, 'yomu-video-player-000000000000']);
        let activatePromise = Promise.resolve<unknown>(undefined);
        harness.listeners.get('activate')!({ waitUntil: promise => { activatePromise = promise; } });
        await activatePromise;
        expect(harness.cacheStorage.delete).toHaveBeenCalledTimes(1);
        expect(harness.cacheStorage.delete).toHaveBeenCalledWith(oldCacheName);
        expect(harness.worker.clients.claim).toHaveBeenCalledTimes(1);

        const fetchListener = harness.listeners.get('fetch')!;
        await dispatchHostedWorkerFetch(fetchListener, 'https://yomureader.com/pdf-reader/online', 'navigate');
        await dispatchHostedWorkerFetch(fetchListener, 'https://yomureader.com/yomu.user.js');
        await dispatchHostedWorkerFetch(fetchListener, 'https://yomureader.com/yomu.css');
        await dispatchHostedWorkerFetch(fetchListener, `https://yomureader.com${FINAL_GRAPH.serviceWorkerPaths[0]}`);
        expect(harness.put).not.toHaveBeenCalled();

        const vendor = await dispatchHostedWorkerFetch(
            fetchListener,
            'https://yomureader.com/pdf-reader/vendor/pdf.mjs',
        );
        expect(harness.put).toHaveBeenCalledTimes(1);
        expect(harness.put).toHaveBeenCalledWith(vendor.request, expect.any(Response));

        const unrelatedRespondWith = vi.fn();
        fetchListener({
            request: { method: 'GET', mode: 'cors', url: 'https://yomureader.com/unrelated.js' },
            respondWith: unrelatedRespondWith,
        });
        expect(unrelatedRespondWith).not.toHaveBeenCalled();

        const cachedIndex = new Response('offline index');
        harness.cacheMatch.mockResolvedValueOnce(cachedIndex);
        harness.networkFetch.mockRejectedValueOnce(new Error('offline'));
        const navigation = await dispatchHostedWorkerFetch(
            fetchListener,
            'https://yomureader.com/pdf-reader/',
            'navigate',
        );
        expect(navigation.response).toBe(cachedIndex);
        expect(harness.cacheMatch).toHaveBeenCalledWith('./index.html', undefined);

        const cachedGraph = new Response('offline graph');
        harness.cacheMatch.mockResolvedValueOnce(cachedGraph);
        harness.networkFetch.mockRejectedValueOnce(new Error('offline'));
        const graph = await dispatchHostedWorkerFetch(
            fetchListener,
            `https://yomureader.com${FINAL_GRAPH.serviceWorkerPaths[0]}`,
        );
        expect(graph.response).toBe(cachedGraph);
        expect(harness.cacheMatch).toHaveBeenLastCalledWith(graph.request, { ignoreSearch: true });
        expect(harness.cacheStorage.match).not.toHaveBeenCalled();
    });

    it('fails closed on malformed cache names, runtime graphs, and scopes', () => {
        const harness = hostedWorkerHarness('/pdf-reader/');
        expect(() => harness.register({
            cacheName: 'yomu-pdf-reader-v1',
            runtimeGraph: FINAL_GRAPH.serviceWorkerPaths,
        })).toThrow(/core-revision cache name/u);
        expect(() => harness.register({
            cacheName: `yomu-pdf-reader-${FINAL_GRAPH.cacheRevision}`,
            runtimeGraph: ['/greasyfork/yomu-runtime.user.js'],
        })).toThrow(/immutable paths/u);

        const nestedScope = hostedWorkerHarness('/nested/pdf-reader/');
        expect(() => nestedScope.register({
            cacheName: `yomu-pdf-reader-${FINAL_GRAPH.cacheRevision}`,
            runtimeGraph: FINAL_GRAPH.serviceWorkerPaths,
        })).toThrow(/standalone surface scope/u);
    });

    it('passes the hosted-player wait timeout as Playwright options, not the page argument', () => {
        const source = readFileSync('scripts/feedback-smoke.mjs', 'utf8');
        const start = source.indexOf('async function openHostedVideoPlayer');
        const end = source.indexOf('async function assertHostedEmptyState', start);
        const openHostedVideoPlayer = source.slice(start, end);
        expect(openHostedVideoPlayer).toContain('        null,\n        { timeout: 6000 },');
    });
});
