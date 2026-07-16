import { AUTHORIZED_AUDIO_CATALOG } from '../../src/academy/audio/manifest';
import { SHINDAY_SFX_CATALOG } from '../../src/academy/audio/sfx-catalog';
import type { AudioDirectorState, AudioSettings, SfxCue, ThemeSlot } from '../../src/academy/audio/types';
import type { VnAudioDirectorTarget } from '../../src/academy/vn/audio-director-bridge';
import { shindayVnSound } from '../../src/academy/vn/shinday-sound-profile';
import { themeForWorldPlace } from '../../src/academy/routing/contract';
import {
    CURRENT_WORLD_AUDIO_PLACE_IDS,
    WORLD_EXPANSION_AUDIO_PROFILES,
    WORLD_LOCATION_AUDIO_PROFILES,
    createWorldLocationAudioSession,
    worldLocationTheme,
} from '../../src/academy/vn/world-location-audio';

class FakeDirector implements VnAudioDirectorTarget {
    state: AudioDirectorState = 'ready';
    settings: AudioSettings = {
        muted: false,
        volumes: { music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 },
    };
    readonly sfx: SfxCue[] = [];
    readonly ducks: number[] = [];
    readonly setTheme = vi.fn(async (_slot: ThemeSlot) => undefined);
    readonly beginExternalLesson = vi.fn((duck = 1) => {
        this.ducks.push(duck);
        return vi.fn();
    });
    readonly playSfx = vi.fn((cue: SfxCue) => { this.sfx.push(cue); });
}

describe('current-place audio profiles', () => {
    it('covers every current place with a distinct authorized music profile and permitted Shinday cues', () => {
        expect(Object.keys(WORLD_LOCATION_AUDIO_PROFILES)).toEqual([...CURRENT_WORLD_AUDIO_PLACE_IDS]);
        const profiles = CURRENT_WORLD_AUDIO_PLACE_IDS.map(place => WORLD_LOCATION_AUDIO_PROFILES[place]);
        const themes = profiles.map(profile => profile.music);
        const tracks = themes.map(theme => AUTHORIZED_AUDIO_CATALOG[theme].music);

        expect(new Set(themes)).toHaveLength(profiles.length);
        expect(new Set(tracks.map(track => track?.id))).toHaveLength(profiles.length);
        for (const [index, profile] of profiles.entries()) {
            expect(profile.place).toBe(CURRENT_WORLD_AUDIO_PLACE_IDS[index]);
            expect(themeForWorldPlace(profile.place)).toBe(profile.music);
            expect(tracks[index]?.rights).toMatchObject({ reviewed: true, scope: 'release' });
            expect(profile.reducedMotion).toBe('same-audio');
            expect(profile.offlineFallback).toBe('silence');
            for (const soundId of [profile.arrival, profile.departure, profile.confirm, profile.success, profile.object]) {
                if (!soundId) continue;
                const sound = shindayVnSound(soundId);
                expect(sound.status).toBe('mapped');
                expect(sound.provenance).toMatchObject({
                    collection: SHINDAY_SFX_CATALOG.provenance.collection,
                    sourceRevision: SHINDAY_SFX_CATALOG.provenance.sourceRevision,
                    rightsId: SHINDAY_SFX_CATALOG.provenance.rightsId,
                });
            }
            if (profile.ambience) {
                const ambience = shindayVnSound(profile.ambience);
                expect(ambience).toMatchObject({ status: 'gap', fallback: 'silence' });
            }
        }
    });

    it('gives Japan Centre its protected local identity, while deferred locations remain scoped', () => {
        const japanCentre = WORLD_LOCATION_AUDIO_PROFILES['japan-centre'];
        const ramen = WORLD_LOCATION_AUDIO_PROFILES.ramen;
        const home = WORLD_LOCATION_AUDIO_PROFILES.home;

        expect(japanCentre.music).toBe('world.japan-centre');
        expect(AUTHORIZED_AUDIO_CATALOG[japanCentre.music].music?.id).toBe('persona.ideal-and-the-real');
        expect(japanCentre.object).toBe('object.menu-page');
        expect(AUTHORIZED_AUDIO_CATALOG[ramen.music].music?.id).toBe('persona.i-believe');
        expect(AUTHORIZED_AUDIO_CATALOG[home.music].music?.id).toBe('persona.ideal-and-the-real-end');
        expect(ramen.object).toBe('object.menu-page');
        expect(home.object).toBe('object.radio-tune');
        expect(shindayVnSound(ramen.object!).status).toBe('mapped');
        expect(shindayVnSound(home.object!).status).toBe('mapped');
    });

    it('gives the lab and deferred bookshop focused presentation profiles', () => {
        const lab = WORLD_LOCATION_AUDIO_PROFILES.lab;
        const bookshop = WORLD_EXPANSION_AUDIO_PROFILES.bookshop;

        expect(lab.music).toBe('world.lab');
        expect(lab.object).toBe('focus.move');
        expect(shindayVnSound(lab.object!).status).toBe('mapped');

        expect(bookshop.music).toBe('mystery.page');
        expect(bookshop.ambience).toBe('ambience.library');
        expect(bookshop.object).toBe('object.menu-page');
        expect(themeForWorldPlace('bookshop')).toBe(bookshop.music);
        expect(shindayVnSound(bookshop.object!).status).toBe('mapped');
    });

    it('gives the konbini its own score and a mapped register count', () => {
        const konbini = WORLD_LOCATION_AUDIO_PROFILES.konbini;

        expect(konbini.music).toBe('world.konbini');
        expect(AUTHORIZED_AUDIO_CATALOG[konbini.music].music?.id).toBe('persona.out-of-kindness');
        expect(konbini.object).toBe('object.register-tick');
        expect(shindayVnSound(konbini.object!).status).toBe('mapped');
    });

    it('keeps the park and station platform in the unique current-place score', () => {
        const park = WORLD_LOCATION_AUDIO_PROFILES.park;
        const platform = WORLD_LOCATION_AUDIO_PROFILES['station-platform'];

        expect(park.music).toBe('world.park');
        expect(AUTHORIZED_AUDIO_CATALOG[park.music].music?.id).toBe('persona.no-more-what-ifs-instrumental');
        expect(park.ambience).toBe('ambience.rain');
        expect(park.object).toBe('object.sketch-stroke');
        expect(themeForWorldPlace('park')).toBe(park.music);
        expect(shindayVnSound(park.object!).status).toBe('mapped');

        expect(platform.music).toBe('challenge.major');
        expect(platform.object).toBe('object.radio-tune');
        expect(themeForWorldPlace('station-platform')).toBe(platform.music);
        expect(shindayVnSound(platform.object!).status).toBe('mapped');
    });

    it('falls back deterministically to silence for planned locations with no approved treatment', () => {
        expect(worldLocationTheme('train')).toBe('silence');
        expect(themeForWorldPlace('train')).toBe('silence');
    });

    it('deduplicates rerenders and sequences location cues through the existing bridge', () => {
        let now = 0;
        const director = new FakeDirector();
        const session = createWorldLocationAudioSession({ director, now: () => now });

        expect(session.enter('cafe')).toEqual({ status: 'played', played: true });
        expect(session.enter('cafe')).toEqual({ status: 'unchanged', played: false });
        expect(director.sfx).toEqual(['scene.advance']);

        now = 2_000;
        expect(session.toggleObject('cafe')).toEqual({ status: 'played', played: true });
        now = 5_000;
        expect(session.leave('cafe')).toEqual({ status: 'played', played: true });
        expect(director.sfx).toEqual(['scene.advance', 'radio.tune', 'menu.cancel']);
        session.dispose();
    });

    it('falls back without media work when offline, muted, locked, or missing a place cue', () => {
        const director = new FakeDirector();
        let online = false;
        const session = createWorldLocationAudioSession({ director, isOnline: () => online });

        expect(session.enter('courtyard')).toEqual({ status: 'offline', played: false });
        expect(director.playSfx).not.toHaveBeenCalled();

        online = true;
        director.settings = { ...director.settings, muted: true };
        expect(session.enter('library')).toEqual({ status: 'muted', played: false });
        director.settings = { ...director.settings, muted: false };
        director.state = 'locked';
        expect(session.enter('station')).toEqual({ status: 'locked', played: false });
        director.state = 'ready';
        expect(session.toggleObject('station')).toEqual({ status: 'gap', played: false });
        expect(director.playSfx).not.toHaveBeenCalled();
        session.dispose();
    });

    it('keeps semantic audio under reduced motion while marking captions accordingly', () => {
        const director = new FakeDirector();
        const captions: Array<{ reducedMotion: boolean }> = [];
        const session = createWorldLocationAudioSession({
            director,
            reducedMotion: true,
            onCaption: event => captions.push(event),
        });

        expect(session.enter('home')).toEqual({ status: 'played', played: true });
        expect(director.sfx).toEqual(['scene.advance']);
        expect(captions).toEqual([expect.objectContaining({ reducedMotion: true })]);
        session.dispose();
    });
});
