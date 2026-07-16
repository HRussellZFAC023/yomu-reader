import type { SfxCue } from '../audio/types';
import type {
    VnAudioDuckingCue,
    VnAudioMix,
    VnAudioMixFrame,
    VnAudioMixReason,
    VnCharacterCuePreset,
    VnPauseCue,
    VnPauseFrame,
    VnPerformanceBeat,
    VnPerformanceEngine,
    VnPerformanceEngineOptions,
    VnPerformanceFrame,
    VnPerformanceMotionKind,
    VnPerformancePose,
    VnPerformanceTiming,
    VnPerformerCue,
    VnPerformerFrame,
    VnPoseTransitionKind,
    VnSoundCue,
    VnTextRevealEndReason,
    VnTextRevealFrame,
} from './performance-contract';
import { createVnPresentationResolver } from './presentation-resolver';

const DEFAULT_TIMING: VnPerformanceTiming = {
    entranceMs: 360,
    staggerMs: 70,
    maximumStaggerMs: 280,
    jumpMs: 300,
    poseTransitionMs: 220,
    sceneTransitionMs: 420,
    cameraTransitionMs: 480,
    musicCrossfadeMs: 720,
    maximumMusicTransitionMs: 2_000,
    beatMs: 240,
    silenceMs: 680,
    maximumPauseMs: 1_600,
    audioFadeMs: 160,
    sfxDuckMs: 420,
    activeLiftPx: 12,
};

const AUDIO_MIXES = {
    none: { musicGain: 1, sfxGain: 1 },
    dialogue: { musicGain: 0.72, sfxGain: 0.82 },
    emphasis: { musicGain: 0.52, sfxGain: 1 },
    silence: { musicGain: 0.34, sfxGain: 0.42 },
} as const satisfies Record<string, VnAudioMix>;

interface ResolvedPerformer<Expression extends string, Angle extends string> {
    readonly cue: VnPerformerCue<Expression, Angle>;
    readonly pose: VnPerformancePose<Expression, Angle>;
    readonly preset?: VnCharacterCuePreset<Expression, Angle>;
}

interface ResolvedAudio {
    readonly mix: VnAudioMixFrame;
    readonly reason: VnAudioMixReason;
}

export function createVnPerformanceEngine<Expression extends string = string, Angle extends string = string>(
    options: VnPerformanceEngineOptions<Expression, Angle> = {},
): VnPerformanceEngine<Expression, Angle> {
    const timing = normalizedTiming(options.timing);
    const reducedMotion = options.reducedMotion ?? false;
    const compact = options.compact ?? false;
    let currentFrame: VnPerformanceFrame<Expression, Angle> | undefined;
    let motionToken = 0;
    let transitionToken = 0;
    let textToken = 0;
    let disposed = false;
    const presentationResolver = createVnPresentationResolver({
        reducedMotion,
        compact,
        timing,
        places: options.places,
        selectPlaceVariation: options.selectPlaceVariation,
        nextToken: () => ++transitionToken,
    });

    const endTextReveal = (
        lineId: string,
        reason: VnTextRevealEndReason,
    ): VnPerformanceFrame<Expression, Angle> | undefined => {
        assertActive(disposed);
        if (!currentFrame?.textReveal || currentFrame.textReveal.lineId !== lineId) return currentFrame;
        if (currentFrame.textReveal.status === 'complete') return currentFrame;
        currentFrame = {
            ...currentFrame,
            textReveal: { ...currentFrame.textReveal, status: 'complete' },
        };
        options.onTextReveal?.({ type: 'end', lineId, reason });
        return currentFrame;
    };

    const perform = (beat: VnPerformanceBeat<Expression, Angle>): VnPerformanceFrame<Expression, Angle> => {
        assertActive(disposed);
        validateBeat(beat);
        const resolvedPerformers = resolvePerformers(beat.performers, options.presets);
        if (currentFrame?.beatId === beat.id) return currentFrame;

        const previousPerformers = new Map(currentFrame?.performers.map(performer => [performer.id, performer]) ?? []);
        const speaker = resolvedPerformers.find(performer => performer.cue.id === beat.speakerId);
        const presentation = presentationResolver.resolve({
            scene: beat.scene,
            camera: beat.camera,
            music: beat.music,
            previousScene: currentFrame?.scene,
            previousCamera: currentFrame?.camera,
            previousMusic: currentFrame?.music,
        });
        const pause = resolvePause(
            beat.pause ?? speaker?.preset?.pause ?? presentation.entranceTreatment?.pause,
            timing,
        );
        const audio = resolveAudio(
            beat.audio?.ducking ?? speaker?.preset?.audio ?? presentation.entranceTreatment?.audio,
            pause,
            beat,
            timing,
        );
        const sfx = uniqueSfx([...(presentation.entranceTreatment?.sfx ?? []), ...(beat.sfx ?? [])]);
        const sounds = uniqueSounds([...(presentation.entranceTreatment?.sounds ?? []), ...(beat.sounds ?? [])]);
        for (const sound of sounds) validateSound(sound);
        const previousText = currentFrame?.textReveal;
        const textReveal = nextTextReveal(beat.text?.lineId, previousText, reducedMotion, () => ++textToken);
        const { scene, camera, music } = presentation;

        if (previousText?.status === 'revealing' && previousText.lineId !== textReveal?.lineId) {
            options.onTextReveal?.({ type: 'end', lineId: previousText.lineId, reason: 'replaced' });
        }

        const performers = resolvedPerformers.map((performer, index): VnPerformerFrame<Expression, Angle> => {
            const previous = previousPerformers.get(performer.cue.id);
            const active = performer.cue.id === beat.speakerId;
            const presetEmphasis = active
                && performer.preset?.emphasis === 'jump'
                && previous?.presetId !== performer.cue.preset;
            const motionKind: VnPerformanceMotionKind | undefined = !previous
                ? 'entrance'
                : beat.emphasis?.performerId === performer.cue.id || presetEmphasis ? 'jump' : undefined;
            const motion = !motionKind || reducedMotion ? undefined : {
                kind: motionKind,
                token: ++motionToken,
                delayMs: motionKind === 'entrance'
                    ? Math.min(index * timing.staggerMs, timing.maximumStaggerMs)
                    : 0,
                durationMs: motionKind === 'entrance' ? timing.entranceMs : timing.jumpMs,
            };
            const poseTransition = previous && !motion
                ? resolvePoseTransition(previous.pose, performer.pose, performer.cue.transition ?? performer.preset?.transition,
                    reducedMotion, timing, () => ++transitionToken)
                : undefined;
            return {
                id: performer.cue.id,
                pose: { ...performer.pose },
                ...(performer.cue.preset ? { presetId: performer.cue.preset } : {}),
                presence: active ? 'active' : 'inactive',
                color: active ? 'full' : 'desaturated',
                liftPx: active && !reducedMotion
                    ? Math.min(timing.activeLiftPx, compact ? 8 : timing.activeLiftPx)
                    : 0,
                ...(motion ? { motion } : {}),
                ...(poseTransition ? { poseTransition } : {}),
            };
        });

        const previousAudio = currentFrame?.audioMix ?? audioMixFrame(AUDIO_MIXES.none, timing.audioFadeMs);
        currentFrame = {
            beatId: beat.id,
            performers,
            audioMix: audio.mix,
            reducedMotion,
            compact,
            ...(textReveal ? { textReveal } : {}),
            ...(pause ? { pause } : {}),
            ...(scene ? { scene } : {}),
            ...(camera ? { camera } : {}),
            ...(music ? { music } : {}),
        };
        presentation.commit();

        if (music?.transition) options.onMusic?.({ music });
        if (!sameAudioMix(previousAudio, audio.mix)) {
            options.onAudioMix?.({
                mix: audio.mix,
                reason: isNeutralMix(audio.mix) ? 'restore' : audio.reason,
            });
        }
        if (sfx.length) {
            const emphasis = audioMixFrame({
                musicGain: Math.min(audio.mix.musicGain, AUDIO_MIXES.emphasis.musicGain),
                sfxGain: 1,
            }, timing.audioFadeMs);
            if (!sameAudioMix(emphasis, audio.mix)) {
                options.onAudioMix?.({ mix: emphasis, reason: 'emphasis', releaseAfterMs: timing.sfxDuckMs });
            }
            for (const cue of sfx) options.onSfx?.(cue);
        }
        for (const sound of sounds) options.onSound?.({ sound });
        if (textReveal && textReveal !== previousText) {
            options.onTextReveal?.({ type: 'start', lineId: textReveal.lineId, animated: textReveal.animated });
            if (!textReveal.animated) {
                options.onTextReveal?.({ type: 'end', lineId: textReveal.lineId, reason: 'reduced-motion' });
            }
        }
        return currentFrame;
    };

    return {
        perform,
        completeTextReveal: lineId => endTextReveal(lineId, 'revealed'),
        skipTextReveal: lineId => endTextReveal(lineId, 'skipped'),
        get frame() { return currentFrame; },
        dispose() {
            if (disposed) return;
            if (currentFrame?.textReveal?.status === 'revealing') {
                options.onTextReveal?.({
                    type: 'end',
                    lineId: currentFrame.textReveal.lineId,
                    reason: 'replaced',
                });
            }
            if (currentFrame && !isNeutralMix(currentFrame.audioMix)) {
                options.onAudioMix?.({
                    mix: audioMixFrame(AUDIO_MIXES.none, timing.audioFadeMs),
                    reason: 'dispose',
                });
            }
            currentFrame = undefined;
            disposed = true;
        },
    };
}

function resolvePerformers<Expression extends string, Angle extends string>(
    performers: readonly VnPerformerCue<Expression, Angle>[],
    presets: VnPerformanceEngineOptions<Expression, Angle>['presets'],
): readonly ResolvedPerformer<Expression, Angle>[] {
    return performers.map(cue => {
        const preset = cue.preset ? presets?.[cue.id]?.[cue.preset] : undefined;
        if (cue.preset && !preset) {
            throw new TypeError(`Performer ${cue.id} references missing cue preset ${cue.preset}.`);
        }
        const pose = cue.pose ?? preset?.pose;
        if (!pose) throw new TypeError(`Performer ${cue.id} requires a pose or cue preset.`);
        return { cue, pose, ...(preset ? { preset } : {}) };
    });
}

function resolvePoseTransition<Expression extends string, Angle extends string>(
    previous: VnPerformancePose<Expression, Angle>,
    next: VnPerformancePose<Expression, Angle>,
    style: VnPerformerCue<Expression, Angle>['transition'],
    reducedMotion: boolean,
    timing: VnPerformanceTiming,
    nextToken: () => number,
): VnPerformerFrame<Expression, Angle>['poseTransition'] {
    if (reducedMotion || style === 'cut') return undefined;
    const expressionChanged = previous.expression !== next.expression;
    const angleChanged = previous.angle !== next.angle;
    if (!expressionChanged && !angleChanged) return undefined;
    const kind: VnPoseTransitionKind = expressionChanged && angleChanged
        ? 'expression-and-angle'
        : expressionChanged ? 'expression' : 'angle';
    return {
        kind,
        style: style ?? 'dissolve',
        token: nextToken(),
        durationMs: timing.poseTransitionMs,
    };
}

function resolvePause(cue: VnPauseCue | undefined, timing: VnPerformanceTiming): VnPauseFrame | undefined {
    if (!cue) return undefined;
    const kind = typeof cue === 'string' ? cue : cue.kind;
    const authoredDuration = typeof cue === 'string' ? undefined : cue.durationMs;
    if (authoredDuration !== undefined && (!Number.isFinite(authoredDuration) || authoredDuration < 0)) {
        throw new RangeError('A performance pause duration must be a finite, non-negative number.');
    }
    const durationMs = authoredDuration ?? (kind === 'silence' ? timing.silenceMs : timing.beatMs);
    return { kind, durationMs: Math.min(durationMs, timing.maximumPauseMs) };
}

function resolveAudio<Expression extends string, Angle extends string>(
    authored: VnAudioDuckingCue | undefined,
    pause: VnPauseFrame | undefined,
    beat: VnPerformanceBeat<Expression, Angle>,
    timing: VnPerformanceTiming,
): ResolvedAudio {
    const cue = authored ?? (pause?.kind === 'silence' ? 'silence' : beat.speakerId || beat.text ? 'dialogue' : 'none');
    const mix = typeof cue === 'string' ? AUDIO_MIXES[cue] : validateAudioMix(cue);
    const reason: VnAudioMixReason = typeof cue !== 'string'
        ? 'authored'
        : cue === 'none' ? 'restore' : cue;
    return { mix: audioMixFrame(mix, timing.audioFadeMs), reason };
}

function validateAudioMix(mix: VnAudioMix): VnAudioMix {
    for (const [name, value] of Object.entries(mix)) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError(`${name} must be a finite number between 0 and 1.`);
        }
    }
    return mix;
}

function audioMixFrame(mix: VnAudioMix, fadeMs: number): VnAudioMixFrame {
    return { ...mix, fadeMs };
}

function sameAudioMix(left: VnAudioMix, right: VnAudioMix): boolean {
    return left.musicGain === right.musicGain && left.sfxGain === right.sfxGain;
}

function isNeutralMix(mix: VnAudioMix): boolean {
    return sameAudioMix(mix, AUDIO_MIXES.none);
}

function uniqueSfx(cues: readonly SfxCue[]): readonly SfxCue[] {
    return [...new Set(cues)];
}

function uniqueSounds(cues: readonly VnSoundCue[]): readonly VnSoundCue[] {
    return [...new Map(cues.map(cue => [cue.id, cue])).values()];
}

function nextTextReveal(
    lineId: string | undefined,
    previous: VnTextRevealFrame | undefined,
    reducedMotion: boolean,
    nextToken: () => number,
): VnTextRevealFrame | undefined {
    if (!lineId) return undefined;
    if (previous?.lineId === lineId) return previous;
    return {
        lineId,
        status: reducedMotion ? 'complete' : 'revealing',
        animated: !reducedMotion,
        token: nextToken(),
    };
}

function normalizedTiming(overrides: Partial<VnPerformanceTiming> | undefined): VnPerformanceTiming {
    const timing = { ...DEFAULT_TIMING, ...overrides };
    for (const [name, value] of Object.entries(timing)) {
        if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite, non-negative number.`);
    }
    return timing;
}

function validateBeat<Expression extends string, Angle extends string>(beat: VnPerformanceBeat<Expression, Angle>): void {
    if (!beat.id.trim()) throw new TypeError('A performance beat requires an id.');
    const performerIds = beat.performers.map(performer => performer.id);
    if (performerIds.some(id => !id.trim())) throw new TypeError('Every performer requires an id.');
    if (new Set(performerIds).size !== performerIds.length) {
        throw new TypeError(`Performance beat ${beat.id} contains duplicate performers.`);
    }
    for (const referencedId of [beat.speakerId, beat.emphasis?.performerId]) {
        if (referencedId && !performerIds.includes(referencedId)) {
            throw new TypeError(`Performance beat ${beat.id} references missing performer ${referencedId}.`);
        }
    }
    if (beat.text && !beat.text.lineId.trim()) throw new TypeError('A text reveal requires a line id.');
    if (beat.scene && !beat.scene.id.trim()) throw new TypeError('A scene cue requires an id.');
    if (beat.scene?.variation !== undefined && !beat.scene.variation.trim()) {
        throw new TypeError('A scene presentation variation id cannot be empty.');
    }
    if (beat.camera?.focusId !== undefined && !beat.camera.focusId.trim()) {
        throw new TypeError('A camera focus id cannot be empty.');
    }
    for (const performer of beat.performers) {
        if (performer.preset !== undefined && !performer.preset.trim()) {
            throw new TypeError(`Performer ${performer.id} has an empty cue preset id.`);
        }
    }
    for (const sound of beat.sounds ?? []) validateSound(sound);
}

function validateSound(sound: VnSoundCue): void {
    if (!sound.id.trim()) throw new TypeError('A semantic sound cue requires an id.');
    if (sound.status === 'gap') {
        if (!sound.reason.trim()) throw new TypeError(`Sound gap ${sound.id} requires a reason.`);
        return;
    }
    if (!Number.isFinite(sound.durationMs) || sound.durationMs < 0) {
        throw new RangeError(`Sound cue ${sound.id} duration must be a finite, non-negative number.`);
    }
    if (!Number.isFinite(sound.duckMusicTo) || sound.duckMusicTo < 0 || sound.duckMusicTo > 1) {
        throw new RangeError(`Sound cue ${sound.id} ducking must be between 0 and 1.`);
    }
}

function assertActive(disposed: boolean): void {
    if (disposed) throw new Error('VN performance engine has been disposed.');
}
