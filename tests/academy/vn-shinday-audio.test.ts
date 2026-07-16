import {
    SHINDAY_SFX_ASSETS,
    SHINDAY_SFX_CATALOG,
    type ShindaySfxAssetId,
} from '../../src/academy/audio/sfx-catalog';
import type { AudioDirectorState, SfxCue, ThemeSlot } from '../../src/academy/audio/types';
import {
    createVnAudioDirectorBridge,
    type VnAudioDirectorTarget,
    type VnSoundCaptionEvent,
} from '../../src/academy/vn/audio-director-bridge';
import { createVnPerformanceEngine } from '../../src/academy/vn/performance-engine';
import type { VnGapSoundCue, VnPlacePresentationPresets } from '../../src/academy/vn/performance-contract';
import {
    SHINDAY_VN_AUDIO_TREATMENTS,
    SHINDAY_VN_SOUND_CUES,
    shindayVnPlaceAudio,
    shindayVnSound,
    type ShindayVnSoundId,
} from '../../src/academy/vn/shinday-sound-profile';

const REQUIRED_SOUND_IDS = [
    'scene.enter',
    'scene.exit',
    'focus.move',
    'choice.confirm',
    'feedback.correct',
    'feedback.error',
    'reward.stamp',
    'reward.earned',
    'object.menu-page',
    'object.radio-tune',
    'object.register-tick',
    'object.sketch-stroke',
    'transit.train-doors-open',
    'transit.train-doors-close',
    'transit.announcement',
    'ambience.rain',
    'ambience.cafe',
    'ambience.library',
] as const satisfies readonly ShindayVnSoundId[];

class FakeAudioDirector implements VnAudioDirectorTarget {
    state: AudioDirectorState = 'ready';
    readonly themes: ThemeSlot[] = [];
    readonly sfx: SfxCue[] = [];
    readonly ducks: number[] = [];
    readonly releases: Array<ReturnType<typeof vi.fn>> = [];

    readonly setTheme = vi.fn(async (slot: ThemeSlot) => {
        this.themes.push(slot);
    });

    readonly beginExternalLesson = vi.fn((duck = 1) => {
        this.ducks.push(duck);
        const release = vi.fn();
        this.releases.push(release);
        return release;
    });

    readonly playSfx = vi.fn((cue: SfxCue) => {
        this.sfx.push(cue);
    });
}

afterEach(() => {
    vi.useRealTimers();
});

describe('Shinday VN sound profile', () => {
    it('maps every requested semantic cue to a verified asset or an explicit gap', () => {
        expect(Object.keys(SHINDAY_VN_SOUND_CUES)).toEqual(REQUIRED_SOUND_IDS);

        for (const sound of Object.values(SHINDAY_VN_SOUND_CUES)) {
            expect(sound.reducedMotion).toBe('same-audio');
            expect(sound.provenance).toMatchObject({
                collection: SHINDAY_SFX_CATALOG.provenance.collection,
                sourceRepository: SHINDAY_SFX_CATALOG.provenance.sourceRepository,
                sourceRevision: SHINDAY_SFX_CATALOG.provenance.sourceRevision,
                rightsId: SHINDAY_SFX_CATALOG.provenance.rightsId,
                evidence: SHINDAY_SFX_CATALOG.provenance.evidence,
            });
            if (sound.status === 'gap') {
                expect(sound.fallback).toBe('silence');
                expect(sound.provenance).not.toHaveProperty('assetId');
                expect(sound.provenance).not.toHaveProperty('deliveryKey');
                expect(sound.provenance).not.toHaveProperty('sha256');
                continue;
            }

            const asset = SHINDAY_SFX_ASSETS[sound.provenance.assetId as ShindaySfxAssetId];
            expect(asset).toBeDefined();
            expect(asset.directorCues).toContain(sound.sfx);
            expect(sound.durationMs).toBe(Math.ceil(asset.durationSeconds * 1_000));
            expect(sound.provenance).toMatchObject({
                sourceRelativePath: asset.sourceRelativePath,
                deliveryKey: asset.deliveryKey,
                sha256: asset.sha256,
            });
            expect(sound.caption).toMatchObject({ mode: 'fixed', announce: false });
        }
    });

    it('keeps unavailable transport and ambience honest and forbids synthetic drones', () => {
        const gaps = [
            SHINDAY_VN_SOUND_CUES['transit.train-doors-open'],
            SHINDAY_VN_SOUND_CUES['transit.train-doors-close'],
            SHINDAY_VN_SOUND_CUES['transit.announcement'],
            SHINDAY_VN_SOUND_CUES['ambience.rain'],
            SHINDAY_VN_SOUND_CUES['ambience.cafe'],
            SHINDAY_VN_SOUND_CUES['ambience.library'],
        ];
        expect(gaps.every(sound => sound.status === 'gap')).toBe(true);
        expect(SHINDAY_VN_SOUND_CUES['transit.announcement'].caption)
            .toEqual({ mode: 'authored-required', kind: 'speech' });
        expect(SHINDAY_VN_AUDIO_TREATMENTS).toEqual({
            rain: {
                music: { theme: 'campus.evening', transition: 'crossfade' },
                ambience: 'ambience.rain',
                unavailableAmbienceFallback: 'theme-or-silence',
                continuousSynthFallback: false,
            },
            cafe: {
                music: { theme: 'cafe.social', transition: 'crossfade' },
                ambience: 'ambience.cafe',
                unavailableAmbienceFallback: 'theme-or-silence',
                continuousSynthFallback: false,
            },
            library: {
                music: { theme: 'library.quiet', transition: 'crossfade' },
                ambience: 'ambience.library',
                unavailableAmbienceFallback: 'theme-or-silence',
                continuousSynthFallback: false,
            },
        });
        expect(shindayVnPlaceAudio('cafe')).toEqual({
            music: { theme: 'cafe.social', transition: 'crossfade' },
            sounds: [SHINDAY_VN_SOUND_CUES['ambience.cafe']],
        });
    });
});

describe('VN AudioDirector bridge', () => {
    it('delegates theme crossfades and persistent music ducking to AudioDirector', () => {
        const director = new FakeAudioDirector();
        const bridge = createVnAudioDirectorBridge({ director });

        bridge.performanceHooks.onMusic?.({
            music: {
                theme: 'cafe.social',
                transition: { kind: 'crossfade', token: 1, durationMs: 720 },
            },
        });
        bridge.performanceHooks.onAudioMix?.({
            mix: { musicGain: 0.72, sfxGain: 0.82, fadeMs: 160 },
            reason: 'dialogue',
        });
        bridge.performanceHooks.onAudioMix?.({
            mix: { musicGain: 1, sfxGain: 1, fadeMs: 160 },
            reason: 'restore',
        });

        expect(director.setTheme).toHaveBeenCalledTimes(1);
        expect(director.setTheme).toHaveBeenCalledWith('cafe.social');
        expect(director.beginExternalLesson).toHaveBeenCalledTimes(1);
        expect(director.beginExternalLesson).toHaveBeenCalledWith(0.72);
        expect(director.releases[0]).toHaveBeenCalledTimes(1);
        bridge.dispose();
    });

    it('plays one semantic cue at a time, ducks for its exact duration, and captions it', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
        const director = new FakeAudioDirector();
        const captions: VnSoundCaptionEvent[] = [];
        const bridge = createVnAudioDirectorBridge({ director, onCaption: event => captions.push(event) });
        const correct = shindayVnSound('feedback.correct');
        const choice = shindayVnSound('choice.confirm');
        if (correct.status !== 'mapped' || choice.status !== 'mapped') throw new Error('Expected mapped test cues.');

        expect(bridge.playSound(correct)).toEqual({ status: 'played', played: true });
        bridge.performanceHooks.onAudioMix?.({
            mix: { musicGain: 0.52, sfxGain: 1, fadeMs: 160 },
            reason: 'emphasis',
            releaseAfterMs: 420,
        });
        bridge.performanceHooks.onSfx?.('menu.move');
        expect(bridge.playSound(choice)).toEqual({ status: 'busy', played: false });
        expect(director.sfx).toEqual(['feedback.correct']);
        expect(director.ducks).toEqual([correct.duckMusicTo]);
        expect(director.releases[0]).not.toHaveBeenCalled();
        expect(captions).toEqual([{
            soundId: correct.id,
            caption: correct.caption,
            durationMs: correct.durationMs,
            reducedMotion: false,
        }]);

        vi.advanceTimersByTime(correct.durationMs);
        expect(director.releases[0]).toHaveBeenCalledTimes(1);
        expect(bridge.playSound(choice)).toEqual({ status: 'played', played: true });
        expect(director.sfx).toEqual(['feedback.correct', 'menu.confirm']);
        bridge.dispose();
        expect(director.releases[1]).toHaveBeenCalledTimes(1);
    });

    it('shares the no-overlap gate with raw engine cues', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
        const director = new FakeAudioDirector();
        const bridge = createVnAudioDirectorBridge({ director });

        bridge.performanceHooks.onAudioMix?.({
            mix: { musicGain: 0.52, sfxGain: 1, fadeMs: 160 },
            reason: 'emphasis',
            releaseAfterMs: 420,
        });
        bridge.performanceHooks.onSfx?.('menu.move');
        expect(director.ducks).toEqual([0.52]);
        expect(bridge.playSound(shindayVnSound('choice.confirm')))
            .toEqual({ status: 'busy', played: false });
        vi.advanceTimersByTime(420);
        expect(director.releases[0]).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(172);
        expect(bridge.playSound(shindayVnSound('choice.confirm')))
            .toEqual({ status: 'played', played: true });
        expect(director.sfx).toEqual(['menu.move', 'menu.confirm']);
        bridge.dispose();
    });

    it('reports source gaps without audio, ducking, or false captions', () => {
        const director = new FakeAudioDirector();
        const gaps: VnGapSoundCue[] = [];
        const captions: VnSoundCaptionEvent[] = [];
        const bridge = createVnAudioDirectorBridge({
            director,
            onGap: sound => gaps.push(sound),
            onCaption: event => captions.push(event),
        });

        const trainDoors = shindayVnSound('transit.train-doors-open');
        expect(bridge.playSound(trainDoors)).toEqual({ status: 'gap', played: false });
        expect(gaps).toEqual([trainDoors]);
        expect(director.playSfx).not.toHaveBeenCalled();
        expect(director.beginExternalLesson).not.toHaveBeenCalled();
        expect(captions).toEqual([]);
        bridge.dispose();
    });

    it('keeps semantic audio and captions intact when visual motion is reduced', () => {
        const director = new FakeAudioDirector();
        const captions: VnSoundCaptionEvent[] = [];
        const gaps: VnGapSoundCue[] = [];
        const bridge = createVnAudioDirectorBridge({
            director,
            reducedMotion: true,
            onCaption: event => captions.push(event),
            onGap: sound => gaps.push(sound),
        });
        const cafeAudio = shindayVnPlaceAudio('cafe');
        const places = {
            station: {
                entrance: 'travel-left',
                ...cafeAudio,
                sounds: [shindayVnSound('scene.enter'), ...(cafeAudio.sounds ?? [])],
            },
        } as const satisfies VnPlacePresentationPresets;
        const engine = createVnPerformanceEngine({
            reducedMotion: true,
            places,
            ...bridge.performanceHooks,
        });
        const beat = { id: 'beat:station', performers: [], scene: { id: 'station' } } as const;

        const entered = engine.perform(beat);
        expect(engine.perform(beat)).toBe(entered);
        engine.perform({ id: 'beat:station-held', performers: [], scene: { id: 'station' } });

        expect(entered.scene).toMatchObject({
            id: 'station',
            entranceStyle: 'travel-left',
            transition: { kind: 'cut', durationMs: 0 },
        });
        expect(director.setTheme).toHaveBeenCalledWith('cafe.social');
        expect(director.sfx).toEqual(['scene.advance']);
        expect(gaps.map(sound => sound.id)).toEqual(['ambience.cafe']);
        expect(captions).toHaveLength(1);
        expect(captions[0]).toMatchObject({ soundId: 'scene.enter', reducedMotion: true });
        engine.dispose();
        bridge.dispose();
    });

    it('does not queue one-shots while audio is locked or after disposal', () => {
        const director = new FakeAudioDirector();
        director.state = 'locked';
        const bridge = createVnAudioDirectorBridge({ director });
        const sound = shindayVnSound('focus.move');

        expect(bridge.playSound(sound)).toEqual({ status: 'locked', played: false });
        director.state = 'ready';
        expect(bridge.playSound(sound)).toEqual({ status: 'played', played: true });
        bridge.dispose();
        expect(bridge.playSound(sound)).toEqual({ status: 'disposed', played: false });
        expect(director.sfx).toEqual(['menu.move']);
    });
});
