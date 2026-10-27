import { createAudioCatalog, SILENT_AUDIO_CATALOG, trackCanPlay } from '../../src/academy/audio/catalog';
import { AudioDirector } from '../../src/academy/audio/director';
import { AUTHORIZED_AUDIO_CATALOG } from '../../src/academy/audio/manifest';
import { type AudioTrack, type MediaBusPlayback, type SfxCue, type SfxPlayback } from '../../src/academy/audio/types';
import { BrowserMediaBus } from '../../src/academy/audio/browser-media';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcademyApp } from '../../src/academy/app';
import { type PronunciationService } from '../../src/academy/integration/yomu-bridge';

class FakeBus implements MediaBusPlayback {
    readonly calls: string[] = [];
    track: string | null = null;
    volume = 0;

    async play(track: AudioTrack, volume: number, fadeMs: number): Promise<void> {
        this.calls.push(`play:${track.id}:${fadeMs}`);
        this.track = track.id;
        this.volume = volume;
    }
    stop(fadeMs: number): void { this.calls.push(`stop:${fadeMs}`); this.track = null; }
    setVolume(volume: number): void { this.calls.push(`volume:${volume}`); this.volume = volume; }
    pause(): void { this.calls.push('pause'); }
    async resume(): Promise<void> { this.calls.push('resume'); }
    dispose(): void { this.calls.push('dispose'); this.track = null; }
}

class FakeSfx implements SfxPlayback {
    readonly calls: string[] = [];
    unlock(): void { this.calls.push('unlock'); }
    play(cue: SfxCue, volume: number): void { this.calls.push(`play:${cue}:${volume}`); }
    dispose(): void { this.calls.push('dispose'); }
}

class RejectingBus extends FakeBus {
    unavailable = true;

    async play(track: AudioTrack, volume: number, fadeMs: number): Promise<void> {
        await super.play(track, volume, fadeMs);
        if (this.unavailable) throw new Error('media unavailable');
    }
}

const releaseRights = {
    owner: 'Yomu',
    licence: 'CC0-1.0',
    source: 'https://yomureader.com/audio-provenance',
    reviewed: true as const,
    scope: 'release' as const,
};

function track(id: string, scope: 'release' | 'private-prototype' = 'release'): AudioTrack {
    return {
        id,
        title: id,
        url: `/academy/audio/${id}.mp3`,
        loop: true,
        gain: 1,
        rights: scope === 'release' ? releaseRights : { ...releaseRights, scope },
    };
}

describe('audio director', () => {
    it('boots the owner-authorized Academy catalog on first gesture and keeps semantic transitions owned', async () => {
        const music = new FakeBus();
        const sfx = new FakeSfx();
        const director = new AudioDirector({
            catalog: AUTHORIZED_AUDIO_CATALOG,
            music,
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx,
            releaseMode: true,
        });

        await director.setTheme('campus.evening');
        expect(music.track).toBeNull();
        expect(director.theme).toBe('campus.evening');
        await director.unlock();
        expect(sfx.calls).toEqual(['unlock']);
        expect(music.track).toBe('persona.royal-days');
        expect(AUTHORIZED_AUDIO_CATALOG['campus.evening'].music?.url)
            .toBe('/academy/media/audio/v1/persona/royal-days.opus');

        await director.setTheme('cafe.social');
        expect(music.track).toBe('persona.kichijoji-199x');
        const fullVolume = music.volume;
        const releaseSpeech = director.beginExternalLesson();
        expect(music.volume).toBeLessThan(fullVolume);
        releaseSpeech();
        expect(music.volume).toBeCloseTo(fullVolume);
        await director.handleVisibility(true);
        await director.handleVisibility(false);
        expect(music.calls).toContain('pause');
        expect(music.calls).toContain('resume');
    });

    it('runs campus to cafe to lesson and back through one owner with intentional ducking', async () => {
        const music = new FakeBus();
        const ambience = new FakeBus();
        const lesson = new FakeBus();
        const sfx = new FakeSfx();
        const catalog = createAudioCatalog({
            'campus.evening': { music: track('campus'), ambience: track('rain') },
            'cafe.social': { music: track('cafe'), ambience: track('cafe-room'), lessonDuck: 0.4 },
        });
        const director = new AudioDirector({ catalog, music, ambience, lesson, sfx, releaseMode: true });

        await director.setTheme('campus.evening');
        expect(music.track).toBeNull();
        await director.unlock();
        expect(sfx.calls).toEqual(['unlock']);
        expect(music.track).toBe('campus');
        expect(ambience.track).toBe('rain');

        await director.setTheme('cafe.social');
        expect(music.track).toBe('cafe');
        expect(ambience.track).toBe('cafe-room');
        expect(await director.startLesson({ track: track('listening'), duck: 0.4 })).toBe(true);
        expect(lesson.track).toBe('listening');
        expect(music.volume).toBeCloseTo(0.28);

        director.finishLesson();
        expect(lesson.track).toBeNull();
        expect(music.volume).toBeCloseTo(0.7);
        await director.setTheme('campus.evening');
        expect(music.track).toBe('campus');
        expect(director.state).toBe('playing');
    });

    it('does not restart a settled location theme, but crossfades when the place changes', async () => {
        const music = new FakeBus();
        const director = new AudioDirector({
            catalog: createAudioCatalog({
                'world.cafe': { music: track('cafe') },
                'world.station': { music: track('station') },
            }),
            music,
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx: new FakeSfx(),
        });

        await director.unlock();
        await director.setTheme('world.cafe');
        await director.setTheme('world.cafe');
        await director.setTheme('world.station');

        expect(music.calls.filter(call => call.startsWith('play:'))).toEqual([
            'play:cafe:950',
            'play:station:700',
        ]);
    });

    it('suspends all buses on visibility loss and resumes without spawning another track', async () => {
        const music = new FakeBus();
        const ambience = new FakeBus();
        const lesson = new FakeBus();
        const director = new AudioDirector({
            catalog: createAudioCatalog({ 'campus.evening': { music: track('campus') } }),
            music,
            ambience,
            lesson,
            sfx: new FakeSfx(),
        });
        await director.unlock();
        await director.setTheme('campus.evening');
        const playCount = music.calls.filter(call => call.startsWith('play:')).length;

        await director.handleVisibility(true);
        expect(director.state).toBe('suspended');
        await director.handleVisibility(false);
        expect(director.state).toBe('playing');
        expect(music.calls.filter(call => call.startsWith('play:'))).toHaveLength(playCount);
        expect(music.calls).toContain('resume');
    });

    it('ducks and restores the music bus for external browser speech', async () => {
        const music = new FakeBus();
        const director = new AudioDirector({
            catalog: SILENT_AUDIO_CATALOG,
            music,
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx: new FakeSfx(),
        });
        const events: string[] = [];
        director.onEvent(event => {
            if (event.type === 'duck') events.push(event.active ? 'duck' : 'restore');
        });
        await director.unlock();
        const release = director.beginExternalLesson(0.2);
        release();
        release();
        expect(events).toEqual(['duck', 'restore']);
        expect(director.state).toBe('silent');
    });

    it('keeps music ducked until owned lesson audio and browser speech both finish', async () => {
        const music = new FakeBus();
        const director = new AudioDirector({
            catalog: createAudioCatalog({ 'campus.evening': { music: track('campus'), lessonDuck: 0.4 } }),
            music,
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx: new FakeSfx(),
        });
        await director.unlock();
        await director.setTheme('campus.evening');
        await director.startLesson({ track: track('owned-lesson'), duck: 0.4 });
        expect(music.volume).toBeCloseTo(0.28);

        const releaseSpeech = director.beginExternalLesson(0.2);
        expect(music.volume).toBeCloseTo(0.14);
        director.finishLesson();
        expect(music.volume).toBeCloseTo(0.14);
        releaseSpeech();
        expect(music.volume).toBeCloseTo(0.7);
    });

    it('keeps silence valid and blocks prototype-only tracks from a release build', async () => {
        const music = new FakeBus();
        const director = new AudioDirector({
            catalog: createAudioCatalog({ 'campus.evening': { music: track('persona', 'private-prototype') } }),
            music,
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx: new FakeSfx(),
            releaseMode: true,
        });
        await director.setTheme('campus.evening');
        await director.unlock();
        expect(music.track).toBeNull();
        expect(director.state).toBe('silent');
        expect(trackCanPlay(track('persona', 'private-prototype'), true)).toBe(false);

        const silent = new AudioDirector({
            catalog: SILENT_AUDIO_CATALOG,
            music: new FakeBus(),
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx: new FakeSfx(),
        });
        await silent.unlock();
        expect(silent.state).toBe('silent');
    });

    it('does not touch the SFX engine while muted or at zero SFX volume', async () => {
        const sfx = new FakeSfx();
        const director = new AudioDirector({
            catalog: SILENT_AUDIO_CATALOG,
            music: new FakeBus(),
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx,
        });
        const events: string[] = [];
        director.onEvent(event => { if (event.type === 'sfx') events.push(event.cue); });
        await director.unlock();

        director.setMuted(true);
        director.playSfx('menu.confirm');
        director.setMuted(false);
        director.setVolume('sfx', 0);
        director.playSfx('menu.confirm');

        expect(sfx.calls).toEqual(['unlock']);
        expect(events).toEqual([]);
    });

    it('settles into silence when protected media is unavailable offline', async () => {
        const errors: string[] = [];
        const music = new RejectingBus();
        const director = new AudioDirector({
            catalog: createAudioCatalog({ 'world.station': { music: track('station') } }),
            music,
            ambience: new FakeBus(),
            lesson: new FakeBus(),
            sfx: new FakeSfx(),
        });
        director.onEvent(event => { if (event.type === 'error') errors.push(event.operation); });

        await director.setTheme('world.station');
        await expect(director.unlock()).resolves.toBeUndefined();

        expect(director.state).toBe('silent');
        expect(errors).toEqual(['theme-music']);

        music.unavailable = false;
        await director.setTheme(director.theme);
        expect(director.state).toBe('playing');
        expect(music.track).toBe('station');
    });
});

describe('browser-media behavior', () => {
    class StrictMedia {
        preload = '';
        crossOrigin = '';
        loop = false;
        src = '';
        currentTime = 0;
        private volumeValue = 0;
        readonly played: string[] = [];

        get volume(): number { return this.volumeValue; }
        set volume(value: number) {
            if (value < 0 || value > 1) throw new DOMException('volume out of range', 'IndexSizeError');
            this.volumeValue = value;
        }

        async play(): Promise<void> { this.played.push(this.src); }
        pause(): void {}
        load(): void {}
        removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
    }

    const track: AudioTrack = {
        id: 'authorized',
        title: 'Authorized track',
        url: '/academy/media/audio/test.flac',
        loop: true,
        gain: 1,
        rights: {
            owner: 'Test',
            licence: 'Test authorization',
            source: 'Test fixture',
            reviewed: true,
            scope: 'release',
        },
    };

    describe('BrowserMediaBus', () => {
        it('clamps a stale animation-frame timestamp instead of throwing on media volume', async () => {
            const media = new StrictMedia();
            vi.spyOn(performance, 'now').mockReturnValue(100);
            let frame = 0;
            vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
                const timestamp = frame++ === 0 ? 99 : 200;
                queueMicrotask(() => callback(timestamp));
                return frame;
            });
            const bus = new BrowserMediaBus(() => media as unknown as HTMLAudioElement);

            await expect(bus.play(track, 1, 100)).resolves.toBeUndefined();
            expect(media.volume).toBe(1);
            expect(media.played).toEqual(['/academy/media/audio/test.flac']);
        });
    });
});

describe('academy-app-pronunciation-lifecycle behavior', () => {
    afterEach(() => document.body.replaceChildren());

    describe('Academy app pronunciation lifecycle', () => {
        it('disposes pronunciation before audio and tears the app down only once', () => {
            const calls: string[] = [];
            const pronunciation: PronunciationService = {
                play: vi.fn(async () => ({ dispose: vi.fn() })),
                dispose: vi.fn(() => { calls.push('pronunciation'); }),
            };
            const audio = {
                settings: {
                    muted: false,
                    volumes: { music: 0.7, ambience: 0.6, lesson: 0.65, sfx: 0.8 },
                },
                dispose: vi.fn(() => { calls.push('audio'); }),
            } as unknown as AudioDirector;
            const host = document.createElement('main');
            document.body.append(host);
            const app = new AcademyApp(host, { pronunciation, audio });

            app.dispose();
            app.dispose();

            expect(calls).toEqual(['pronunciation', 'audio']);
            expect(pronunciation.dispose).toHaveBeenCalledOnce();
            expect(audio.dispose).toHaveBeenCalledOnce();
        });
    });
});
