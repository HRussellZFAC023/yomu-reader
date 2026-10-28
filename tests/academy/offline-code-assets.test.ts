import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { hostedRuntimeGraphFixture } from '../helpers/hosted-runtime-graph';
// @ts-expect-error Same Node manifest helper used by the production sync.
import { renderAcademyTemplate } from '../../scripts/lib/academy-build-manifest.cjs';

const revision = 's1-123456abcdef';
const version = `yomu-academy-shell-${revision}`;
const oldVersion = 'yomu-academy-shell-s1-000000000000';
const readyPath = '/academy/.offline-ready';
const studyPath = '/academy/chunks/study-abc.js';
const studyCss = '/academy/assets/study-abc.css';
const voicePath = '/academy/audio/story-pilot/proof.opus';
const html = `<meta name="yomu-academy-revision" content="${revision}">`;
const manifest = {
    'src/academy/entrypoint.ts': { isEntry: true, file: 'app.js', css: ['assets/shell-abc.css'], dynamicImports: ['study'] },
    study: { file: 'chunks/study-abc.js', css: ['assets/study-abc.css'] },
};

function harness(releaseRevision = revision, deployment = { stores: new Map<string, Map<string, Response>>([[oldVersion, new Map([['/academy/index.html', new Response('old usable page')]])]]), bodies: new Map<string, string>() }) {
    const { stores, bodies } = deployment;
    const failures = new Set<string>();
    const listeners = new Map<string, (event: unknown) => void>();
    const waits: Promise<unknown>[] = [];
    let offline = false;
    let navigation = `<meta name="yomu-academy-revision" content="${releaseRevision}">`;
    let release: (() => void) | undefined;
    let blockedPath: string | undefined;
    const key = (value: string | { url: string }) => {
        const url = new URL(typeof value === 'string' ? value : value.url, 'https://yomureader.com');
        return url.pathname + url.search;
    };
    const network = vi.fn(async (request: string | { url: string }) => {
        const url = key(request);
        if (offline) throw new Error('offline');
        if (url === blockedPath) await new Promise<void>(resolve => { release = resolve; });
        if (failures.has(url)) return new Response(null, { status: 404 });
        if (url === '/academy/' || url === '/academy/index.html') return new Response(navigation);
        if (url === '/academy/audio/story-voice-playback.json') return new Response(JSON.stringify({ schema: 'yomu-academy.story-voice-playback.v1', entries: [{ url: voicePath }] }));
        return new Response(bodies.get(url) ?? `asset:${url}`);
    });
    const open = async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const values = stores.get(name)!;
        return {
            match: async (request: string | { url: string }) => values.get(key(request))?.clone(),
            put: async (request: string | { url: string }, response: Response) => { values.set(key(request), response.clone()); },
            addAll: async (requests: string[]) => {
                const responses = await Promise.all(requests.map(request => network(request)));
                if (responses.some(response => !response.ok)) throw new Error('precache failed');
                requests.forEach((request, index) => values.set(key(request), responses[index]!));
            },
        };
    };
    const skipWaiting = vi.fn();
    const claim = vi.fn();
    const globalMatch = vi.fn(() => { throw new Error('Cross-version cache lookup is forbidden'); });
    runInNewContext(renderAcademyTemplate(fs.readFileSync('public/academy/sw.js', 'utf8'), releaseRevision, manifest), {
        Headers, Response, URL, atob,
        importScripts() {}, fetch: network,
        caches: { open, match: globalMatch, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
        self: { __yomuHostedRuntimeGraph: hostedRuntimeGraphFixture('dependency', 'core'), location: { origin: 'https://yomureader.com' }, skipWaiting, clients: { claim }, addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback) },
    });
    async function event(name: string) {
        let pending: Promise<unknown> | undefined;
        listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
        await pending;
    }
    async function fetchAsset(url: string, mode = 'cors') {
        let pending: Promise<Response> | undefined;
        listeners.get('fetch')!({
            request: { url: new URL(url, 'https://yomureader.com').href, method: 'GET', mode, headers: new Headers() },
            respondWith: (promise: Promise<Response>) => { pending = promise; },
            waitUntil: (promise: Promise<unknown>) => waits.push(promise),
        });
        const result = await pending;
        await Promise.all(waits.splice(0));
        return result!;
    }
    return { stores, bodies, deployment, failures, network, skipWaiting, claim, event, fetchAsset, globalMatch,
        setOffline: () => { offline = true; }, setNavigation: (value: string) => { navigation = value; },
        block: (value: string) => { blockedPath = value; }, release: () => release?.(),
    };
}

describe('Academy chunk-aware offline installation', () => {
    it('declares readiness only after lazy code, CSS, existing content and story voices finish', async () => {
        const h = harness();
        h.block(studyPath);
        const pending = h.event('install');
        await vi.waitFor(() => expect(h.network.mock.calls.some(([url]) => url === studyPath)).toBe(true));
        expect(h.stores.get(version)?.has(readyPath)).toBe(false);
        h.release();
        await pending;
        for (const url of [studyPath, studyCss, voicePath, '/academy/content/lessons/021-l1-l20.json']) expect(h.stores.get(version)?.has(url), url).toBe(true);
        expect(await h.stores.get(version)!.get(readyPath)!.clone().text()).toBe(revision);
        expect(h.skipWaiting).toHaveBeenCalledOnce();
        expect(h.stores.has(oldVersion)).toBe(true);
    });

    it('does not answer the next release with this release’s cached lesson bytes', async () => {
        const lessonZero = '/academy/content/lessons/lesson-zero.v1.json';
        const current = harness('s1-aaaaaaaaaaaa');
        current.bodies.set(lessonZero, 'lesson zero, release A');
        await current.event('install');
        await current.event('activate');
        expect(await (await current.fetchAsset(lessonZero)).text()).toBe('lesson zero, release A');

        // Release B deploys: its page loads from the network while A still controls it.
        current.bodies.set(lessonZero, 'lesson zero, release B');
        current.setNavigation(html);
        expect(await (await current.fetchAsset('/academy/', 'navigate')).text()).toBe(html);
        const next = harness(revision, current.deployment);
        let readyWhenSkipping: boolean | undefined;
        next.skipWaiting.mockImplementation(() => { readyWhenSkipping = next.stores.get(version)?.has(readyPath); });
        await next.event('install');
        // B takes over at once instead of waiting for every Academy tab to close.
        expect(next.skipWaiting).toHaveBeenCalledOnce();
        expect(readyWhenSkipping).toBe(true);
        await next.event('activate');
        expect(next.claim).toHaveBeenCalledOnce();
        expect(next.stores.has('yomu-academy-shell-s1-aaaaaaaaaaaa')).toBe(false);
        expect(await (await next.fetchAsset(lessonZero)).text()).toBe('lesson zero, release B');
    });

    it.each([studyPath, studyCss, voicePath])('keeps the old release when installation cannot fetch %s', async missing => {
        const h = harness();
        h.failures.add(missing);
        await expect(h.event('install')).rejects.toThrow('precache failed');
        expect(h.stores.has(version)).toBe(false);
        expect(await h.stores.get(oldVersion)!.get('/academy/index.html')!.text()).toBe('old usable page');
        expect(h.claim).not.toHaveBeenCalled();
    });

    it('will not activate or remove the old cache without readiness and every required code asset', async () => {
        const h = harness();
        await expect(h.event('activate')).rejects.toThrow('incomplete');
        expect(h.stores.has(oldVersion)).toBe(true);
        await h.event('install');
        h.stores.get(version)!.delete(studyPath);
        await expect(h.event('activate')).rejects.toThrow('missing');
        expect(h.stores.has(oldVersion)).toBe(true);
    });

    it('serves deferred chunks offline after a complete install and activation', async () => {
        const h = harness();
        await h.event('install');
        await h.event('activate');
        h.setOffline();
        expect(await (await h.fetchAsset(studyPath)).text()).toBe(`asset:${studyPath}`);
        expect(await (await h.fetchAsset(studyCss)).text()).toBe(`asset:${studyCss}`);
        await expect(h.fetchAsset('/academy/chunks/absent.js')).rejects.toThrow('offline');
        expect(h.globalMatch).not.toHaveBeenCalled();
    });

    it('rejects a partial deployment whose HTML belongs to another revision', async () => {
        const h = harness();
        h.setNavigation('<meta name="yomu-academy-revision" content="s1-other">');
        await expect(h.event('install')).rejects.toThrow('HTML does not match');
        expect(h.stores.has(oldVersion)).toBe(true);
    });

    it('does not overwrite this release’s offline page with a newer network navigation', async () => {
        const h = harness();
        await h.event('install');
        h.setNavigation('<meta name="yomu-academy-revision" content="s1-newer">');
        expect(await (await h.fetchAsset('/academy/', 'navigate')).text()).toContain('s1-newer');
        h.setOffline();
        expect(await (await h.fetchAsset('/academy/', 'navigate')).text()).toBe(html);
        expect(h.globalMatch).not.toHaveBeenCalled();
    });
});
