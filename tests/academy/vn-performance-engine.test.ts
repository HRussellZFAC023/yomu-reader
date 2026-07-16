import fs from 'node:fs';
import path from 'node:path';
import { createVnPerformanceEngine } from '../../src/academy/vn/performance-engine';
import type {
    VnAudioMixEvent,
    VnCharacterCuePresets,
    VnMusicEvent,
    VnPerformanceBeat,
    VnPlacePresentationPresets,
    VnTextRevealEvent,
} from '../../src/academy/vn/performance-contract';
import type { SfxCue } from '../../src/academy/audio/types';

type Expression = 'neutral' | 'delighted' | 'concerned';
type Angle = 'profile' | 'front';

const cast = [
    { id: 'mentor', pose: { expression: 'neutral', angle: 'front' } },
    { id: 'learner', pose: { expression: 'concerned', angle: 'profile' } },
] as const satisfies VnPerformanceBeat<Expression, Angle>['performers'];

describe('VN performance engine', () => {
    it('selects authored poses and gives only the active speaker full color and lift', () => {
        const engine = createVnPerformanceEngine<Expression, Angle>();
        const frame = engine.perform({ id: 'beat:question', performers: cast, speakerId: 'learner' });

        expect(frame.performers).toEqual([
            expect.objectContaining({
                id: 'mentor', presence: 'inactive', color: 'desaturated', liftPx: 0,
                pose: { expression: 'neutral', angle: 'front' },
            }),
            expect.objectContaining({
                id: 'learner', presence: 'active', color: 'full', liftPx: 12,
                pose: { expression: 'concerned', angle: 'profile' },
            }),
        ]);
    });

    it('issues finite staggered entrances and retriggerable jump emphasis', () => {
        const engine = createVnPerformanceEngine<Expression, Angle>({
            timing: { entranceMs: 400, staggerMs: 90, maximumStaggerMs: 90, jumpMs: 240 },
        });
        const entrance = engine.perform({ id: 'beat:enter', performers: cast });

        expect(entrance.performers.map(performer => performer.motion)).toEqual([
            { kind: 'entrance', token: 1, delayMs: 0, durationMs: 400 },
            { kind: 'entrance', token: 2, delayMs: 90, durationMs: 400 },
        ]);

        const firstJump = engine.perform({
            id: 'beat:answer', performers: cast, speakerId: 'learner',
            emphasis: { kind: 'jump', performerId: 'learner' },
        });
        const secondJump = engine.perform({
            id: 'beat:answer-again', performers: cast, speakerId: 'learner',
            emphasis: { kind: 'jump', performerId: 'learner' },
        });
        expect(firstJump.performers[1].motion).toMatchObject({ kind: 'jump', durationMs: 240 });
        expect(secondJump.performers[1].motion?.token).toBeGreaterThan(firstJump.performers[1].motion!.token);
    });

    it('resolves character-specific emotional cues without stacking spectacle', () => {
        const presets = {
            mentor: {
                reflective: {
                    pose: { expression: 'concerned', angle: 'profile' },
                    transition: 'shift',
                    pause: 'beat',
                    audio: 'dialogue',
                },
                delighted: {
                    pose: { expression: 'delighted', angle: 'front' },
                    transition: 'dissolve',
                    emphasis: 'jump',
                    pause: { kind: 'beat', durationMs: 5_000 },
                    audio: { musicGain: 0.6, sfxGain: 0.3 },
                },
            },
        } as const satisfies VnCharacterCuePresets<Expression, Angle>;
        const engine = createVnPerformanceEngine<Expression, Angle>({
            presets,
            timing: { maximumPauseMs: 900 },
        });

        const reflective = engine.perform({
            id: 'beat:reflective', speakerId: 'mentor', performers: [{ id: 'mentor', preset: 'reflective' }],
        });
        const delighted = engine.perform({
            id: 'beat:delighted', speakerId: 'mentor', performers: [{ id: 'mentor', preset: 'delighted' }],
        });
        const held = engine.perform({
            id: 'beat:delighted-held', speakerId: 'mentor', performers: [{ id: 'mentor', preset: 'delighted' }],
        });

        expect(reflective.performers[0]).toMatchObject({
            presetId: 'reflective',
            pose: { expression: 'concerned', angle: 'profile' },
        });
        expect(reflective.pause).toEqual({ kind: 'beat', durationMs: 240 });
        expect(delighted.performers[0]).toMatchObject({
            presetId: 'delighted',
            motion: { kind: 'jump' },
        });
        expect(delighted.performers[0].poseTransition).toBeUndefined();
        expect(delighted.pause).toEqual({ kind: 'beat', durationMs: 900 });
        expect(delighted.audioMix).toMatchObject({ musicGain: 0.6, sfxGain: 0.3 });
        expect(held.performers[0].motion).toBeUndefined();
        expect(held.performers[0].poseTransition).toBeUndefined();
    });

    it('transitions only changed expressions or poses and lets emphasis take priority', () => {
        const engine = createVnPerformanceEngine<Expression, Angle>({ timing: { poseTransitionMs: 180 } });
        engine.perform({ id: 'beat:base', performers: cast });

        const changed = engine.perform({
            id: 'beat:changed',
            performers: [
                { id: 'mentor', pose: { expression: 'delighted', angle: 'profile' }, transition: 'shift' },
                cast[1],
            ],
        });
        const steady = engine.perform({
            id: 'beat:steady',
            performers: [
                { id: 'mentor', pose: { expression: 'delighted', angle: 'profile' }, transition: 'shift' },
                cast[1],
            ],
        });
        const emphasized = engine.perform({
            id: 'beat:emphasized',
            performers: cast,
            emphasis: { kind: 'jump', performerId: 'mentor' },
        });

        expect(changed.performers[0].poseTransition).toEqual({
            kind: 'expression-and-angle', style: 'shift', token: expect.any(Number), durationMs: 180,
        });
        expect(steady.performers[0].poseTransition).toBeUndefined();
        expect(emphasized.performers[0].motion?.kind).toBe('jump');
        expect(emphasized.performers[0].poseTransition).toBeUndefined();
    });

    it('emits scene and camera transitions only for meaningful state changes', () => {
        const engine = createVnPerformanceEngine<Expression, Angle>({
            timing: { sceneTransitionMs: 380, cameraTransitionMs: 440 },
        });
        engine.perform({
            id: 'beat:campus', performers: cast,
            scene: { id: 'campus' }, camera: { shot: 'wide', focusId: 'mentor' },
        });
        const cafe = engine.perform({
            id: 'beat:cafe', performers: cast,
            scene: { id: 'cafe', transition: 'travel-left' },
            camera: { shot: 'close', focusId: 'learner', movement: 'push-in' },
        });
        const held = engine.perform({
            id: 'beat:cafe-held', performers: cast,
            scene: { id: 'cafe', transition: 'travel-left' },
            camera: { shot: 'close', focusId: 'learner', movement: 'push-in' },
        });

        expect(cafe.scene).toEqual({
            id: 'cafe',
            entranceStyle: 'travel-left',
            transition: { kind: 'travel-left', token: expect.any(Number), durationMs: 380 },
        });
        expect(cafe.camera).toEqual({
            shot: 'close', focusId: 'learner',
            transition: { kind: 'push-in', token: expect.any(Number), durationMs: 440 },
        });
        expect(held.scene).toEqual({ id: 'cafe', entranceStyle: 'travel-left' });
        expect(held.camera).toEqual({ shot: 'close', focusId: 'learner' });
    });

    it('resolves per-place presentation without taking ownership of place data', () => {
        const places = {
            'place:quiet': {
                entrance: 'paper-reveal',
                compactEntrance: 'dissolve',
                reducedMotionEntrance: 'cut',
                camera: { shot: 'medium', focusId: 'mentor', movement: 'push-in' },
                pause: 'beat',
                audio: 'emphasis',
                music: { theme: 'library.quiet', transition: 'crossfade', durationMs: 3_000 },
                sfx: ['door.open'],
                variations: {
                    'odd-page': {
                        entrance: 'ink-reveal',
                        camera: { shot: 'close', focusId: 'learner', movement: 'tilt-left' },
                        sfx: ['page.turn'],
                    },
                },
            },
        } as const satisfies VnPlacePresentationPresets;
        const trace: Array<VnMusicEvent | VnAudioMixEvent | SfxCue> = [];
        const engine = createVnPerformanceEngine<Expression, Angle>({
            places,
            onMusic: event => trace.push(event),
            onAudioMix: event => trace.push(event),
            onSfx: cue => trace.push(cue),
        });
        engine.perform({
            id: 'beat:outside', performers: cast,
            scene: { id: 'place:outside' }, camera: { shot: 'wide', focusId: 'mentor' },
        });
        const entered = engine.perform({
            id: 'beat:quiet-place', performers: cast, scene: { id: 'place:quiet' }, sfx: ['door.open'],
        });

        expect(entered.scene).toEqual({
            id: 'place:quiet',
            entranceStyle: 'paper-reveal',
            transition: { kind: 'paper-reveal', token: expect.any(Number), durationMs: 420 },
        });
        expect(entered.scene?.variationId).toBeUndefined();
        expect(entered.camera).toEqual({
            shot: 'medium', focusId: 'mentor',
            transition: { kind: 'push-in', token: expect.any(Number), durationMs: 480 },
        });
        expect(entered.pause).toEqual({ kind: 'beat', durationMs: 240 });
        expect(entered.music).toEqual({
            theme: 'library.quiet',
            transition: { kind: 'crossfade', token: expect.any(Number), durationMs: 2_000 },
        });
        expect(trace).toEqual([
            { music: entered.music },
            { mix: { musicGain: 0.52, sfxGain: 1, fadeMs: 160 }, reason: 'emphasis' },
            'door.open',
        ]);
    });

    it('keeps quirky place variations opt-in, deterministic, and entry-only', () => {
        const places = {
            'place:social': {
                entrance: 'travel-left',
                camera: { shot: 'wide', focusId: 'mentor' },
                variations: {
                    'odd-angle': {
                        entrance: 'ink-reveal',
                        camera: { shot: 'close', focusId: 'learner', movement: 'tilt-left' },
                        music: { theme: 'mystery.page' },
                        sfx: ['page.turn'],
                    },
                },
            },
        } as const satisfies VnPlacePresentationPresets;
        const selections: Array<{ placeId: string; visit: number; availableVariations: readonly string[] }> = [];
        const cues: SfxCue[] = [];
        const engine = createVnPerformanceEngine<Expression, Angle>({
            places,
            selectPlaceVariation: context => {
                selections.push(context);
                return context.visit === 2 ? 'odd-angle' : undefined;
            },
            onSfx: cue => cues.push(cue),
        });
        engine.perform({
            id: 'beat:outside', performers: cast,
            scene: { id: 'place:outside' }, camera: { shot: 'medium', focusId: 'mentor' },
        });
        const firstVisit = engine.perform({
            id: 'beat:social-one', performers: cast, scene: { id: 'place:social' },
        });
        const held = engine.perform({
            id: 'beat:social-held', performers: cast, scene: { id: 'place:social' },
        });
        engine.perform({ id: 'beat:outside-again', performers: cast, scene: { id: 'place:outside' } });
        const secondVisit = engine.perform({
            id: 'beat:social-two', performers: cast, scene: { id: 'place:social' },
        });

        expect(firstVisit.scene).toMatchObject({ entranceStyle: 'travel-left' });
        expect(firstVisit.scene?.variationId).toBeUndefined();
        expect(held.scene).toEqual({ id: 'place:social', entranceStyle: 'travel-left' });
        expect(secondVisit.scene).toMatchObject({
            entranceStyle: 'ink-reveal', variationId: 'odd-angle', transition: { kind: 'ink-reveal' },
        });
        expect(secondVisit.camera).toMatchObject({
            shot: 'close', focusId: 'learner', transition: { kind: 'tilt-left' },
        });
        expect(secondVisit.music).toMatchObject({ theme: 'mystery.page', transition: { kind: 'cut' } });
        expect(selections).toEqual([
            { placeId: 'place:social', visit: 1, availableVariations: ['odd-angle'] },
            { placeId: 'place:social', visit: 2, availableVariations: ['odd-angle'] },
        ]);
        expect(cues).toEqual(['page.turn']);
    });

    it('keeps place identity while substituting reduced-motion entrances and camera states', () => {
        const places = {
            'place:paper': {
                entrance: 'paper-reveal',
                reducedMotionEntrance: 'dissolve',
                camera: { shot: 'close', focusId: 'mentor', movement: 'tilt-right' },
            },
        } as const satisfies VnPlacePresentationPresets;
        const engine = createVnPerformanceEngine<Expression, Angle>({ places, reducedMotion: true });
        engine.perform({ id: 'beat:outside', performers: cast, scene: { id: 'place:outside' } });
        const frame = engine.perform({ id: 'beat:paper', performers: cast, scene: { id: 'place:paper' } });

        expect(frame.scene).toMatchObject({
            id: 'place:paper', entranceStyle: 'paper-reveal', transition: { kind: 'dissolve' },
        });
        expect(frame.camera).toEqual({ shot: 'close', focusId: 'mentor' });
        expect(frame.performers.every(performer => !performer.motion && !performer.poseTransition)).toBe(true);
    });

    it('normalizes travel and foreground lift for compact presentation', () => {
        const engine = createVnPerformanceEngine<Expression, Angle>({ compact: true });
        engine.perform({
            id: 'beat:campus', performers: cast,
            scene: { id: 'campus' }, camera: { shot: 'wide' },
        });
        const frame = engine.perform({
            id: 'beat:cafe', performers: cast, speakerId: 'mentor',
            scene: { id: 'cafe', transition: 'travel-right' },
            camera: { shot: 'close', focusId: 'mentor', movement: 'pan-right' },
        });

        expect(frame.compact).toBe(true);
        expect(frame.performers[0].liftPx).toBe(8);
        expect(frame.scene?.transition?.kind).toBe('dissolve');
        expect(frame.camera).toEqual({ shot: 'medium', focusId: 'mentor' });
    });

    it('models semantic beats and silence with bounded timing', () => {
        const engine = createVnPerformanceEngine<Expression, Angle>({
            timing: { beatMs: 210, silenceMs: 720, maximumPauseMs: 800 },
        });

        expect(engine.perform({ id: 'beat:breath', performers: cast, pause: 'beat' }).pause)
            .toEqual({ kind: 'beat', durationMs: 210 });
        const silence = engine.perform({
            id: 'beat:silence', performers: cast, pause: { kind: 'silence', durationMs: 2_000 },
        });
        expect(silence.pause).toEqual({ kind: 'silence', durationMs: 800 });
        expect(silence.audioMix).toMatchObject({ musicGain: 0.34, sfxGain: 0.42 });
    });

    it('orders persistent and temporary ducking before SFX and restores cleanly', () => {
        const trace: Array<VnAudioMixEvent | SfxCue> = [];
        const engine = createVnPerformanceEngine<Expression, Angle>({
            timing: { audioFadeMs: 120, sfxDuckMs: 360 },
            onAudioMix: event => trace.push(event),
            onSfx: cue => trace.push(cue),
        });
        engine.perform({ id: 'beat:line', performers: cast, speakerId: 'learner' });
        const door = { id: 'beat:door', performers: cast, speakerId: 'learner', sfx: ['door.open'] } as const;
        engine.perform(door);
        engine.perform(door);
        engine.perform({ id: 'beat:room', performers: cast });

        expect(trace).toEqual([
            { mix: { musicGain: 0.72, sfxGain: 0.82, fadeMs: 120 }, reason: 'dialogue' },
            {
                mix: { musicGain: 0.52, sfxGain: 1, fadeMs: 120 },
                reason: 'emphasis', releaseAfterMs: 360,
            },
            'door.open',
            { mix: { musicGain: 1, sfxGain: 1, fadeMs: 120 }, reason: 'restore' },
        ]);
    });

    it('restores authored music and SFX ducking when disposed', () => {
        const events: VnAudioMixEvent[] = [];
        const engine = createVnPerformanceEngine<Expression, Angle>({ onAudioMix: event => events.push(event) });
        engine.perform({
            id: 'beat:intimate', performers: cast,
            audio: { ducking: { musicGain: 0.45, sfxGain: 0.2 } },
        });
        engine.dispose();

        expect(events).toEqual([
            { mix: { musicGain: 0.45, sfxGain: 0.2, fadeMs: 160 }, reason: 'authored' },
            { mix: { musicGain: 1, sfxGain: 1, fadeMs: 160 }, reason: 'dispose' },
        ]);
    });

    it('does not replay animations or SFX when a beat is applied twice', () => {
        const cues: SfxCue[] = [];
        const music: VnMusicEvent[] = [];
        const engine = createVnPerformanceEngine({
            onSfx: cue => cues.push(cue),
            onMusic: event => music.push(event),
        });
        const beat = {
            id: 'beat:door', performers: cast, sfx: ['door.open'], music: { theme: 'cafe.social' },
        } as const;

        const first = engine.perform(beat);
        const replay = engine.perform(beat);

        expect(replay).toBe(first);
        expect(cues).toEqual(['door.open']);
        expect(music).toHaveLength(1);
    });

    it('reports text reveal start, completion, replacement and skip lifecycle events', () => {
        const events: VnTextRevealEvent[] = [];
        const engine = createVnPerformanceEngine({ onTextReveal: event => events.push(event) });

        engine.perform({ id: 'beat:one', performers: cast, text: { lineId: 'line:one' } });
        engine.completeTextReveal('line:one');
        engine.perform({ id: 'beat:two', performers: cast, text: { lineId: 'line:two' } });
        engine.perform({ id: 'beat:three', performers: cast, text: { lineId: 'line:three' } });
        engine.skipTextReveal('line:three');

        expect(events).toEqual([
            { type: 'start', lineId: 'line:one', animated: true },
            { type: 'end', lineId: 'line:one', reason: 'revealed' },
            { type: 'start', lineId: 'line:two', animated: true },
            { type: 'end', lineId: 'line:two', reason: 'replaced' },
            { type: 'start', lineId: 'line:three', animated: true },
            { type: 'end', lineId: 'line:three', reason: 'skipped' },
        ]);
        expect(engine.frame?.textReveal?.status).toBe('complete');
    });

    it('suppresses motion and completes text immediately for reduced motion', () => {
        const events: VnTextRevealEvent[] = [];
        const engine = createVnPerformanceEngine({
            reducedMotion: true,
            onTextReveal: event => events.push(event),
        });
        engine.perform({
            id: 'beat:before', performers: cast,
            scene: { id: 'campus' }, camera: { shot: 'wide' },
        });
        const frame = engine.perform({
            id: 'beat:quiet', performers: cast, speakerId: 'mentor',
            emphasis: { kind: 'jump', performerId: 'mentor' }, text: { lineId: 'line:quiet' }, pause: 'silence',
            scene: { id: 'cafe', transition: 'travel-left' },
            camera: { shot: 'close', focusId: 'mentor', movement: 'push-in' },
        });

        expect(frame.performers.every(performer => performer.motion === undefined)).toBe(true);
        expect(frame.performers[0].liftPx).toBe(0);
        expect(frame.performers[0].poseTransition).toBeUndefined();
        expect(frame.textReveal).toMatchObject({ status: 'complete', animated: false });
        expect(frame.pause).toEqual({ kind: 'silence', durationMs: 680 });
        expect(frame.scene?.transition).toMatchObject({ kind: 'cut', durationMs: 0 });
        expect(frame.camera).toEqual({ shot: 'close', focusId: 'mentor' });
        expect(events).toEqual([
            { type: 'start', lineId: 'line:quiet', animated: false },
            { type: 'end', lineId: 'line:quiet', reason: 'reduced-motion' },
        ]);
    });

    it('rejects invalid performer references and defines finite purpose-driven CSS', () => {
        const engine = createVnPerformanceEngine();
        expect(() => engine.perform({
            id: 'beat:invalid', performers: cast, speakerId: 'not-on-stage',
        })).toThrow('missing performer');
        expect(() => engine.perform({
            id: 'beat:missing-preset', performers: [{ id: 'mentor', preset: 'missing' }],
        })).toThrow('missing cue preset');
        expect(() => engine.perform({
            id: 'beat:invalid-mix', performers: cast, audio: { ducking: { musicGain: 1.1, sfxGain: 0.5 } },
        })).toThrow('between 0 and 1');
        expect(() => engine.perform({
            id: 'beat:invalid-pause', performers: cast, pause: { kind: 'beat', durationMs: Number.NaN },
        })).toThrow('finite, non-negative');
        expect(() => engine.perform({
            id: 'beat:missing-variation', performers: cast,
            scene: { id: 'place:unknown', variation: 'surprise' },
        })).toThrow('missing presentation variation');
        expect(() => engine.perform({
            id: 'beat:empty-variation', performers: cast,
            scene: { id: 'place:unknown', variation: ' ' },
        })).toThrow('variation id cannot be empty');
        expect(() => engine.perform({
            id: 'beat:invalid-music', performers: cast,
            music: { theme: 'library.quiet', durationMs: Number.POSITIVE_INFINITY },
        })).toThrow('music transition duration');

        const css = fs.readFileSync(path.resolve('src/academy/styles/vn-performance.css'), 'utf8');
        expect(css).toMatch(/data-performance-presence='active'[\s\S]*grayscale\(0\)/);
        expect(css).toMatch(/data-performance-motion='entrance'[\s\S]*\s1 both;/);
        expect(css).toMatch(/data-performance-motion='jump'[\s\S]*\s1 both;/);
        expect(css).toMatch(/data-performance-pose-transition='dissolve'/);
        expect(css).toMatch(/data-vn-scene-transition='travel-left'/);
        expect(css).toMatch(/data-vn-scene-transition='paper-reveal'/);
        expect(css).toMatch(/data-vn-scene-transition='ink-reveal'/);
        expect(css).toMatch(/data-vn-camera-transition='push-in'/);
        expect(css).toMatch(/data-vn-camera-transition='tilt-left'/);
        expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*data-vn-camera-transition[\s\S]*animation:\s*none;/);
        expect(css).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;[\s\S]*data-vn-scene-presentation='paper-reveal'/,
        );
        expect(css).not.toMatch(/animation[^;]*infinite/);
    });
});
