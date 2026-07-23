import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BrowserSfxPlayback } from '../../src/academy/audio/browser-sfx';
import {
    AUTHORIZED_AUDIO_CATALOG,
    AUTHORIZED_AUDIO_MANIFEST,
    AUTHORIZED_SFX_SOURCES,
    catalogFromManifest,
    mediaUrlFor,
    parseAudioManifest,
    sfxSourcesFromManifest,
} from '../../src/academy/audio/manifest';
import type { AudioRights, SfxCue } from '../../src/academy/audio/types';

const releaseRights: AudioRights = {
    owner: 'Henry Russell',
    licence: 'Owner-attested educational use',
    source: 'private local archive',
    reviewed: true,
    scope: 'release',
};

const manifestJson = {
    version: 1,
    themes: [
        {
            slot: 'campus.evening',
            bus: 'music',
            trackId: 'persona-evening',
            title: 'Evening Theme',
            mediaKey: 'persona/theme/evening.m4a',
            loop: true,
            gain: 0.8,
            rights: releaseRights,
        },
        {
            slot: 'library.quiet',
            bus: 'ambience',
            trackId: 'prototype-only',
            title: 'Prototype pad',
            mediaKey: 'persona/theme/pad.m4a',
            loop: true,
            gain: 0.5,
            rights: { ...releaseRights, scope: 'private-prototype' },
        },
    ],
    sfx: [
        { cue: 'menu.confirm', mediaKey: 'shinday/sfx/confirm.m4a', gain: 1, rights: releaseRights },
        { cue: 'page.turn', mediaKey: 'shinday/sfx/page.m4a', gain: 0.6, rights: { ...releaseRights, scope: 'private-prototype' } },
    ],
};

describe('Academy audio manifest', () => {
    it('uses the authorized runtime in the real Academy bootstrap, not the silent prototype', () => {
        const appSource = readFileSync(path.resolve('src/academy/app.ts'), 'utf8');
        expect(appSource).toContain('createAuthorizedAcademyAudioDirector');
        expect(appSource).not.toContain('SILENT_AUDIO_CATALOG');
        expect(appSource).not.toContain('SilentSfxPlayback');
    });

    it('parses entries and routes URLs through the protected media endpoint', () => {
        const manifest = parseAudioManifest(manifestJson);
        expect(manifest.themes).toHaveLength(2);
        expect(mediaUrlFor(manifest.themes[0].mediaKey)).toBe('/academy/media/audio/persona/theme/evening.m4a');
        expect(mediaUrlFor('media/audio/v1/persona/royal-days.flac'))
            .toBe('/academy/media/audio/v1/persona/royal-days.flac');
    });

    it('rejects malformed entries: bad keys, gains, and unreviewed rights', () => {
        const withTheme = (patch: Record<string, unknown>): unknown => ({
            version: 1,
            themes: [{ ...manifestJson.themes[0], ...patch }],
            sfx: [],
        });
        expect(() => parseAudioManifest({ version: 2, themes: [], sfx: [] })).toThrow(/version/);
        expect(() => parseAudioManifest(withTheme({ mediaKey: '../escape.m4a' }))).toThrow(/media key/);
        expect(() => parseAudioManifest(withTheme({ gain: 1.5 }))).toThrow(/gain/);
        expect(() => parseAudioManifest(withTheme({ rights: { ...releaseRights, reviewed: false } }))).toThrow(/rights/);
        expect(() => parseAudioManifest(withTheme({ rights: { ...releaseRights, owner: ' ' } }))).toThrow(/rights/);
        expect(() => parseAudioManifest(withTheme({ bus: 'sfx' }))).toThrow(/bus/);
    });

    it('gates the catalog and SFX map on rights scope in release mode', () => {
        const manifest = parseAudioManifest(manifestJson);

        const releaseCatalog = catalogFromManifest(manifest, true);
        expect(releaseCatalog['campus.evening'].music?.id).toBe('persona-evening');
        expect(releaseCatalog['library.quiet'].ambience).toBeUndefined();

        const prototypeCatalog = catalogFromManifest(manifest, false);
        expect(prototypeCatalog['library.quiet'].ambience?.id).toBe('prototype-only');

        const releaseSfx = sfxSourcesFromManifest(manifest, true);
        expect([...releaseSfx.keys()]).toEqual(['menu.confirm']);
        expect(sfxSourcesFromManifest(manifest, false).size).toBe(2);
    });

    it('loads the checked-in owner-approved catalog through protected media routes', () => {
        const raw = JSON.parse(readFileSync(path.resolve('src/academy/audio/manifest.json'), 'utf8'));
        const manifest = parseAudioManifest(raw);
        expect(manifest.themes).toHaveLength(25);
        expect(manifest.sfx).toHaveLength(16);
        // Every entry that lands here must already reference a protected media key.
        for (const entry of [...manifest.themes.map(theme => theme.mediaKey), ...manifest.sfx.map(sfx => sfx.mediaKey)]) {
            expect(mediaUrlFor(entry)).toMatch(/^\/academy\/media\/audio\//);
        }
        expect(AUTHORIZED_AUDIO_MANIFEST).toEqual(manifest);
        expect(AUTHORIZED_AUDIO_CATALOG['campus.evening'].music?.id).toBe('persona.royal-days');
        expect(AUTHORIZED_AUDIO_CATALOG['lab.listening'].music).toBeUndefined();
        expect(AUTHORIZED_SFX_SOURCES.has('menu.confirm')).toBe(true);

        const delivery = JSON.parse(readFileSync(path.resolve('workers/yomu-academy/media-manifest.json'), 'utf8')) as {
            objects: Array<{ key: string; sha256: string }>;
        };
        const deliveredKeys = new Set(delivery.objects.map(object => object.key));
        for (const key of [...manifest.themes.map(entry => entry.mediaKey), ...manifest.sfx.map(entry => entry.mediaKey)]) {
            expect(deliveredKeys.has(key), key).toBe(true);
        }
    });
});

describe('BrowserSfxPlayback', () => {
    interface FakeMedia extends Partial<HTMLAudioElement> {
        url: string;
        plays: number;
        loads: number;
    }

    function fakeMediaFactory(created: FakeMedia[]) {
        return (url: string): HTMLAudioElement => {
            const media: FakeMedia = {
                url,
                plays: 0,
                loads: 0,
                paused: true,
                ended: false,
                volume: 1,
                currentTime: 0,
                preload: 'none',
                crossOrigin: null,
                load(): void {
                    media.loads += 1;
                },
                play(): Promise<void> {
                    media.plays += 1;
                    (media as { paused: boolean }).paused = false;
                    return Promise.resolve();
                },
                pause(): void {
                    (media as { paused: boolean }).paused = true;
                },
                removeAttribute(): void {},
            };
            created.push(media);
            return media as unknown as HTMLAudioElement;
        };
    }

    const sources = new Map<SfxCue, { url: string; gain: number }>([
        ['menu.confirm', { url: '/academy/media/audio/shinday/sfx/confirm.m4a', gain: 0.5 }],
    ]);

    it('plays authorized cues through real media elements with credentialed requests', () => {
        const created: FakeMedia[] = [];
        const playback = new BrowserSfxPlayback(sources, fakeMediaFactory(created));

        playback.play('menu.confirm', 1); // ignored before unlock
        expect(created).toHaveLength(0);

        playback.unlock();
        // Unlock must not fan out requests for every authorized cue before
        // enrollment has established the protected-media session cookie.
        expect(created).toHaveLength(0);
        playback.play('menu.confirm', 0.8);
        expect(created.length).toBeGreaterThan(0);
        expect(created[0].url).toBe('/academy/media/audio/shinday/sfx/confirm.m4a');
        expect(created[0].crossOrigin).toBe('use-credentials');
        expect(created.reduce((sum, media) => sum + media.plays, 0)).toBe(1);
        expect(created.find(media => media.plays === 1)?.volume).toBeCloseTo(0.4); // volume × gain

        playback.dispose();
        playback.play('menu.confirm', 1);
        expect(created.reduce((sum, media) => sum + media.plays, 0)).toBe(1);
    });

    it('stays silent for unknown cues — no synthesized fallback exists', () => {
        const created: FakeMedia[] = [];
        const playback = new BrowserSfxPlayback(sources, fakeMediaFactory(created));
        playback.unlock();
        playback.play('feedback.hanamaru', 1);
        expect(created.filter(media => media.plays > 0)).toHaveLength(0);
        playback.dispose();
    });

    it('keeps the audio stack free of oscillator/synth fallbacks', () => {
        const audioDir = path.resolve('src/academy/audio');
        for (const file of ['browser-sfx.ts', 'browser-media.ts', 'director.ts', 'catalog.ts', 'manifest.ts']) {
            const source = readFileSync(path.join(audioDir, file), 'utf8');
            expect(source, file).not.toMatch(/OscillatorNode|createOscillator|AudioContext\(/);
        }
    });
});
