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
                bytes: number;
                durationSeconds: number;
                sha256: string;
                rightsId: string;
                runtimeHomes: string[];
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
        expect(byKey.get('media/audio/v1/persona/no-more-what-ifs.flac')).toMatchObject({
            sourceRelativePath: 'CD1/08 No More What Ifs.flac',
            bytes: 25_608_053,
            durationSeconds: 240.666667,
            sha256: 'ed8d0a9fbb33077b54a7d269400e18421c1980fb3a29a19773d30881c947fb2f',
            rightsId: 'persona-educational',
        });
        expect(byKey.get('media/audio/v1/persona/mementos-upper.flac')).toMatchObject({
            bytes: 19_840_843,
            sha256: 'b760d0864faebf4683b8a546051826829cf044e0b08bdad959dad0d0a17f8408',
        });
        expect(byKey.get('media/audio/v1/persona/mementos-middle.flac')).toMatchObject({
            bytes: 28_557_084,
            sha256: 'fa4f821def6729da25531be7f20611246c3a8048b05c92fd904d29533faf754c',
        });
        expect(byKey.get('media/audio/v1/persona/ideal-and-the-real.flac')?.runtimeHomes)
            .toContain('world.japan-centre');
    });

    it('keeps the service-worker precache exactly aligned with the authorized registry', () => {
        expect(AUTHORIZED_AUDIO_PRECACHE_URLS).toHaveLength(27);
        const delivery = JSON.parse(readFileSync(path.resolve('workers/yomu-academy/media-manifest.json'), 'utf8')) as {
            objects: Array<{ key: string; bytes: number }>;
        };
        const precacheKeys = new Set(AUTHORIZED_AUDIO_PRECACHE_URLS.map(url => (
            url.replace('/academy/media/audio/', '')
        )));
        expect(delivery.objects.filter(object => precacheKeys.has(object.key)).reduce((sum, object) => sum + object.bytes, 0))
            .toBe(378_672_515);
        for (const file of serviceWorkers) {
            const source = readFileSync(path.resolve(file), 'utf8');
            const block = source.slice(source.indexOf('const AUDIO_PRECACHE'), source.indexOf('const CORE'));
            const urls = [...block.matchAll(/'(\/academy\/media\/audio\/[^']+)'/g)].map(match => match[1]);
            expect(new Set(urls), file).toEqual(new Set(AUTHORIZED_AUDIO_PRECACHE_URLS));
            expect(source).toContain("credentials: 'include'");
            expect(source).toContain('AUDIO_PRECACHE_BYTES = 378672515');
            expect(source).toContain('self.navigator.storage?.estimate?.()');
            expect(source).toContain('connection?.saveData');
            expect(source).toContain('response.status === 401 || response.status === 403');
            expect(source).toContain('response.status !== 200');
            expect(source).toContain('if (response.ok) event.waitUntil(precacheAudio())');
            expect(source).toContain("url.pathname === '/academy/api/logout'");
            expect(source).toContain("url.pathname === '/academy/api/session'");
            expect(source).toContain('audioPrecacheGeneration += 1');
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
        )() as (response: Response, range: string | null) => Promise<Response>;
        const media = () => new Response(Uint8Array.from({ length: 10 }, (_, index) => index), {
            status: 200,
            headers: { 'content-type': 'audio/flac', 'content-length': '10' },
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
