import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    AUTHORIZED_AUDIO_CATALOG,
    AUTHORIZED_AUDIO_MANIFEST,
    AUTHORIZED_AUDIO_PRECACHE_URLS,
    GROUNDED_LOCATION_THEME_SLOTS,
    audioPrecacheUrlsFromManifest,
    parseAudioManifest,
} from '../../src/academy/audio/manifest';
import { WORLD_EXPANSION_AUDIO_PROFILES, WORLD_LOCATION_AUDIO_PROFILES } from '../../src/academy/vn/world-location-audio';

const serviceWorkers = [
    'public/academy/sw.js',
    'docs/public/academy/sw.js',
] as const;

describe('grounded Academy audio registry', () => {
    it('gives all 13 grounded locations distinct reviewed Persona tracks', () => {
        const profileSlots = [
            ...Object.values(WORLD_LOCATION_AUDIO_PROFILES).map(profile => profile.music),
        ];
        expect(profileSlots).toEqual(GROUNDED_LOCATION_THEME_SLOTS);

        const tracks = profileSlots.map(slot => AUTHORIZED_AUDIO_CATALOG[slot].music);
        expect(tracks).toHaveLength(13);
        expect(new Set(tracks.map(track => track?.id))).toHaveLength(13);
        for (const track of tracks) {
            expect(track).toMatchObject({ rights: { reviewed: true, scope: 'release' } });
        }
        expect(WORLD_EXPANSION_AUDIO_PROFILES.bookshop.music).toBe('mystery.page');
    });

    it('pins every manifest object to the protected media ledger', () => {
        const delivery = JSON.parse(readFileSync(path.resolve('workers/yomu-academy/media-manifest.json'), 'utf8')) as {
            objects: Array<{
                key: string;
                sourceRelativePath: string;
                contentType: string;
                bytes: number;
                durationSeconds: number;
                sha256: string;
                rightsId: string;
                runtimeHomes: string[];
                transcodedFrom?: {
                    key: string;
                    sourceRelativePath: string;
                    bytes: number;
                    sha256: string;
                };
            }>;
        };
        const byKey = new Map(delivery.objects.map(object => [object.key, object]));
        const manifestKeys = new Set([
            ...AUTHORIZED_AUDIO_MANIFEST.themes.map(entry => entry.mediaKey),
            ...AUTHORIZED_AUDIO_MANIFEST.sfx.map(entry => entry.mediaKey),
        ]);

        for (const key of manifestKeys) {
            expect(byKey.get(key), key).toMatchObject({
                bytes: expect.any(Number),
                durationSeconds: expect.any(Number),
                sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            });
        }
        expect(byKey.get('media/audio/v1/persona/no-more-what-ifs.opus')).toMatchObject({
            sourceRelativePath: 'encoded-opus/no-more-what-ifs.opus',
            contentType: 'audio/ogg',
            bytes: 4_281_552,
            durationSeconds: 240.673167,
            sha256: '8cb3ab819605d0fbceb7978347473f677de1a73d682c7f0bf85282249053c928',
            rightsId: 'persona-educational',
            transcodedFrom: {
                key: 'media/audio/v1/persona/no-more-what-ifs.flac',
                sourceRelativePath: 'CD1/08 No More What Ifs.flac',
                bytes: 25_608_053,
                sha256: 'ed8d0a9fbb33077b54a7d269400e18421c1980fb3a29a19773d30881c947fb2f',
            },
        });
        expect(byKey.get('media/audio/v1/persona/mementos-upper.opus')).toMatchObject({
            bytes: 2_997_445,
            sha256: '3bb7db913fac313903b88f1f39f4346493ba84422b5b1e4e58a6fed63d894dd9',
        });
        expect(byKey.get('media/audio/v1/persona/mementos-middle.opus')).toMatchObject({
            bytes: 4_040_090,
            sha256: 'dfe32b5c566aca013cfb0daf49ec13d512fff796d3726efc69fe783ac225b814',
        });
        expect(byKey.get('media/audio/v1/persona/ideal-and-the-real.opus')?.runtimeHomes)
            .toContain('world.japan-centre');
    });

    it('keeps the service-worker precache exactly aligned with the authorized registry', () => {
        expect(AUTHORIZED_AUDIO_PRECACHE_URLS).toHaveLength(27);
        const delivery = JSON.parse(readFileSync(path.resolve('workers/yomu-academy/media-manifest.json'), 'utf8')) as {
            objects: Array<{ key: string; bytes: number }>;
        };
        const precacheKeys = new Set(AUTHORIZED_AUDIO_PRECACHE_URLS.map(url => (
            `media/audio/${url.replace('/academy/media/audio/', '')}`
        )));
        expect(delivery.objects.filter(object => precacheKeys.has(object.key)).reduce((sum, object) => sum + object.bytes, 0))
            .toBe(56_640_560);
        for (const file of serviceWorkers) {
            const source = readFileSync(path.resolve(file), 'utf8');
            const block = source.slice(source.indexOf('const AUDIO_PRECACHE'), source.indexOf('const CORE'));
            const urls = [...block.matchAll(/'(\/academy\/media\/audio\/[^']+)'/g)].map(match => match[1]);
            expect(new Set(urls), file).toEqual(new Set(AUTHORIZED_AUDIO_PRECACHE_URLS));
            expect(source).toContain("credentials: 'include'");
            expect(source).toContain('AUDIO_PRECACHE_BYTES = 56640560');
            expect(source).toContain('response.status !== 200');
            expect(source).toContain('if (response.ok) event.waitUntil(cacheRequestedAudio(url.pathname, response))');
            expect(source).toContain('audioCacheQueue.catch(() => {}).then(async () =>');
            expect(source).toContain('const completeDeliveredResponse = deliveredResponse.status === 200');
            expect(source).toContain('const response = completeDeliveredResponse ?? await fetch(request)');
            expect(source).not.toContain('function precacheAudio()');
            expect(source).not.toContain('for (const path of AUDIO_PRECACHE)');
            expect(source).not.toContain('self.navigator.storage?.estimate?.()');
            expect(source).toContain("url.pathname === '/academy/api/logout'");
            expect(source).toContain("url.pathname === '/academy/api/session'");
            expect(source).toContain('audioCacheGeneration += 1');
            expect(source).toContain('purgeAudioCache()');
            expect(source).toContain('ignoreVary: true');
            expect(source).toContain("cachedAudioResponse(cached, request.headers.get('range'))");
            expect(source).toContain('status: 206');
            expect(source).toContain('return new Response(null, { status: 503 })');
        }
    });

    it('serves byte ranges from a complete offline audio body', async () => {
        const source = readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        const start = source.indexOf('async function cachedAudioResponse');
        const end = source.indexOf("\n\nself.addEventListener('install'", start);
        const cachedAudioResponse = new Function(
            `${source.slice(start, end)}; return cachedAudioResponse;`,
        )() as (
            response: { readonly headers: Headers; blob(): Promise<NodeBlob> },
            range: string | null,
        ) => Promise<Response>;
        // jsdom's Blob is a separate realm that Node 24's Response stringifies.
        // Return the native body directly so this tests byte slicing, not realm interop.
        const media = () => ({
            headers: new Headers({ 'content-type': 'audio/flac', 'content-length': '10' }),
            blob: async () => new NodeBlob([
                Uint8Array.from({ length: 10 }, (_, index) => index),
            ]),
        });

        const middle = await cachedAudioResponse(media(), 'bytes=2-5');
        expect(middle.status).toBe(206);
        expect(middle.headers.get('content-range')).toBe('bytes 2-5/10');
        expect([...new Uint8Array(await middle.arrayBuffer())]).toEqual([2, 3, 4, 5]);

        const suffix = await cachedAudioResponse(media(), 'bytes=-3');
        expect(suffix.status).toBe(206);
        expect([...new Uint8Array(await suffix.arrayBuffer())]).toEqual([7, 8, 9]);

        const invalid = await cachedAudioResponse(media(), 'bytes=8-4');
        expect(invalid.status).toBe(416);
        expect(invalid.headers.get('content-range')).toBe('bytes */10');
    });

    it('omits missing or prototype-only media instead of inventing a fallback track', () => {
        const manifest = parseAudioManifest({
            version: 1,
            themes: [{
                slot: 'world.library',
                bus: 'music',
                trackId: 'prototype.library',
                title: 'Prototype library',
                mediaKey: 'prototype/library.flac',
                loop: true,
                gain: 0.2,
                rights: {
                    owner: 'Prototype owner',
                    licence: 'Private test only',
                    source: 'test fixture',
                    reviewed: true,
                    scope: 'private-prototype',
                },
            }],
            sfx: [],
        });

        expect(audioPrecacheUrlsFromManifest(manifest, true)).toEqual([]);
        expect(audioPrecacheUrlsFromManifest(manifest, false)).toEqual([
            '/academy/media/audio/prototype/library.flac',
        ]);
    });
});
