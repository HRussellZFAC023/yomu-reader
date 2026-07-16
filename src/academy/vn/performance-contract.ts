import type { SfxCue, ThemeSlot } from '../audio/types';

export type VnSpeakerPresence = 'active' | 'inactive';
export type VnPerformanceMotionKind = 'entrance' | 'jump';
export type VnPoseTransitionKind = 'expression' | 'angle' | 'expression-and-angle';
export type VnPoseTransitionStyle = 'cut' | 'dissolve' | 'shift';
export type VnPauseKind = 'beat' | 'silence';
export type VnSceneTransitionKind =
    | 'cut'
    | 'dissolve'
    | 'travel-left'
    | 'travel-right'
    | 'paper-reveal'
    | 'ink-reveal';
export type VnCameraShot = 'wide' | 'medium' | 'close';
export type VnCameraMovement =
    | 'pan-left'
    | 'pan-right'
    | 'push-in'
    | 'pull-back'
    | 'tilt-left'
    | 'tilt-right';
export type VnAudioDuckingPreset = 'none' | 'dialogue' | 'emphasis' | 'silence';
export type VnTextRevealStatus = 'revealing' | 'complete';
export type VnTextRevealEndReason = 'revealed' | 'skipped' | 'replaced' | 'reduced-motion';

export interface VnPerformancePose<Expression extends string = string, Angle extends string = string> {
    readonly expression: Expression;
    readonly angle: Angle;
}

/**
 * Character-scoped emotional direction. A host can give the same semantic cue
 * (for example, `reassuring`) a pose and cadence suited to each character.
 */
export interface VnCharacterCuePreset<Expression extends string = string, Angle extends string = string> {
    readonly pose: VnPerformancePose<Expression, Angle>;
    readonly transition?: VnPoseTransitionStyle;
    readonly emphasis?: 'jump';
    readonly pause?: VnPauseCue;
    readonly audio?: VnAudioDuckingCue;
}

export type VnCharacterCuePresets<Expression extends string = string, Angle extends string = string> = Readonly<
    Record<string, Readonly<Record<string, VnCharacterCuePreset<Expression, Angle>>>>
>;

interface VnPerformerCueBase {
    readonly id: string;
    readonly transition?: VnPoseTransitionStyle;
}

/** A performer must provide a pose directly or through a character-specific preset. */
export type VnPerformerCue<Expression extends string = string, Angle extends string = string> = VnPerformerCueBase & (
    | { readonly pose: VnPerformancePose<Expression, Angle>; readonly preset?: string }
    | { readonly preset: string; readonly pose?: VnPerformancePose<Expression, Angle> }
);

export interface VnJumpEmphasis {
    readonly kind: 'jump';
    readonly performerId: string;
}

export interface VnTextRevealCue {
    readonly lineId: string;
}

export type VnPauseCue = VnPauseKind | {
    readonly kind: VnPauseKind;
    readonly durationMs: number;
};

export interface VnSceneCue {
    readonly id: string;
    readonly transition?: VnSceneTransitionKind;
    /** Optional variants are resolved only when entering a different scene. */
    readonly variation?: string;
}

export interface VnCameraCue {
    readonly shot: VnCameraShot;
    readonly focusId?: string;
    readonly movement?: VnCameraMovement;
}

export interface VnAudioMix {
    readonly musicGain: number;
    readonly sfxGain: number;
}

export type VnAudioDuckingCue = VnAudioDuckingPreset | VnAudioMix;

export interface VnAudioCue {
    readonly ducking: VnAudioDuckingCue;
}

export interface VnFixedSoundCaption {
    readonly mode: 'fixed';
    readonly kind: 'effect' | 'ambience' | 'speech';
    readonly text: { readonly en: string; readonly ja: string };
    /** Visual captions may be shown without creating a repetitive live-region announcement. */
    readonly announce: boolean;
}

export interface VnAuthoredSoundCaption {
    readonly mode: 'authored-required';
    readonly kind: 'speech';
}

export type VnSoundCaption = VnFixedSoundCaption | VnAuthoredSoundCaption;

export interface VnSoundProvenance {
    readonly collection: string;
    readonly sourceRepository: string;
    readonly sourceRevision: string;
    readonly rightsId: string;
    readonly evidence: readonly string[];
    readonly assetId?: string;
    readonly sourceRelativePath?: string;
    readonly deliveryKey?: string;
    readonly sha256?: string;
}

export interface VnMappedSoundCue {
    readonly id: string;
    readonly status: 'mapped';
    readonly sfx: SfxCue;
    readonly durationMs: number;
    readonly duckMusicTo: number;
    readonly caption: VnFixedSoundCaption;
    readonly reducedMotion: 'same-audio';
    readonly provenance: VnSoundProvenance;
}

export interface VnGapSoundCue {
    readonly id: string;
    readonly status: 'gap';
    readonly reason: string;
    readonly fallback: 'silence';
    readonly caption: VnSoundCaption;
    readonly reducedMotion: 'same-audio';
    readonly provenance: VnSoundProvenance;
}

export type VnSoundCue = VnMappedSoundCue | VnGapSoundCue;

export type VnMusicTransitionKind = 'cut' | 'crossfade';

export interface VnMusicCue {
    readonly theme: ThemeSlot;
    readonly transition?: VnMusicTransitionKind;
    readonly durationMs?: number;
}

/** Presentation metadata only; place content and navigation remain in world-owned modules. */
export interface VnPlacePresentationTreatment {
    readonly entrance?: VnSceneTransitionKind;
    readonly compactEntrance?: 'cut' | 'dissolve';
    readonly reducedMotionEntrance?: 'cut' | 'dissolve';
    readonly camera?: VnCameraCue;
    readonly pause?: VnPauseCue;
    readonly audio?: VnAudioDuckingCue;
    readonly music?: VnMusicCue;
    readonly sfx?: readonly SfxCue[];
    readonly sounds?: readonly VnSoundCue[];
}

export interface VnPlacePresentationPreset extends VnPlacePresentationTreatment {
    readonly variations?: Readonly<Record<string, VnPlacePresentationTreatment>>;
}

export type VnPlacePresentationPresets = Readonly<Record<string, VnPlacePresentationPreset>>;

export interface VnPlaceVariationContext {
    readonly placeId: string;
    /** One-based entry count for this engine instance. */
    readonly visit: number;
    readonly availableVariations: readonly string[];
}

/** A beat is authored by a story host; it contains no cast or asset registry assumptions. */
export interface VnPerformanceBeat<Expression extends string = string, Angle extends string = string> {
    readonly id: string;
    readonly performers: readonly VnPerformerCue<Expression, Angle>[];
    readonly speakerId?: string;
    readonly emphasis?: VnJumpEmphasis;
    readonly text?: VnTextRevealCue;
    readonly pause?: VnPauseCue;
    readonly scene?: VnSceneCue;
    readonly camera?: VnCameraCue;
    readonly audio?: VnAudioCue;
    readonly music?: VnMusicCue;
    readonly sfx?: readonly SfxCue[];
    readonly sounds?: readonly VnSoundCue[];
}

export interface VnPerformanceMotion {
    readonly kind: VnPerformanceMotionKind;
    /** Changes when a one-shot animation should be restarted. */
    readonly token: number;
    readonly delayMs: number;
    readonly durationMs: number;
}

export interface VnPoseTransition {
    readonly kind: VnPoseTransitionKind;
    readonly style: Exclude<VnPoseTransitionStyle, 'cut'>;
    readonly token: number;
    readonly durationMs: number;
}

export interface VnPerformerFrame<Expression extends string = string, Angle extends string = string> {
    readonly id: string;
    readonly pose: VnPerformancePose<Expression, Angle>;
    readonly presetId?: string;
    readonly presence: VnSpeakerPresence;
    readonly color: 'full' | 'desaturated';
    readonly liftPx: number;
    readonly motion?: VnPerformanceMotion;
    readonly poseTransition?: VnPoseTransition;
}

export interface VnTextRevealFrame {
    readonly lineId: string;
    readonly status: VnTextRevealStatus;
    readonly animated: boolean;
    readonly token: number;
}

export interface VnPauseFrame {
    readonly kind: VnPauseKind;
    readonly durationMs: number;
}

export interface VnSceneTransition {
    readonly kind: VnSceneTransitionKind;
    readonly token: number;
    readonly durationMs: number;
}

export interface VnSceneFrame {
    readonly id: string;
    /** The authored full-scene treatment remains available for static reduced-motion styling. */
    readonly entranceStyle?: VnSceneTransitionKind;
    readonly variationId?: string;
    readonly transition?: VnSceneTransition;
}

export interface VnCameraTransition {
    readonly kind: VnCameraMovement;
    readonly token: number;
    readonly durationMs: number;
}

export interface VnCameraFrame {
    readonly shot: VnCameraShot;
    readonly focusId?: string;
    readonly transition?: VnCameraTransition;
}

export interface VnAudioMixFrame extends VnAudioMix {
    readonly fadeMs: number;
}

export interface VnMusicTransition {
    readonly kind: VnMusicTransitionKind;
    readonly token: number;
    readonly durationMs: number;
}

export interface VnMusicFrame {
    readonly theme: ThemeSlot;
    readonly transition?: VnMusicTransition;
}

export interface VnPerformanceFrame<Expression extends string = string, Angle extends string = string> {
    readonly beatId: string;
    readonly performers: readonly VnPerformerFrame<Expression, Angle>[];
    readonly textReveal?: VnTextRevealFrame;
    readonly pause?: VnPauseFrame;
    readonly scene?: VnSceneFrame;
    readonly camera?: VnCameraFrame;
    readonly music?: VnMusicFrame;
    readonly audioMix: VnAudioMixFrame;
    readonly reducedMotion: boolean;
    readonly compact: boolean;
}

export type VnTextRevealEvent =
    | { readonly type: 'start'; readonly lineId: string; readonly animated: boolean }
    | { readonly type: 'end'; readonly lineId: string; readonly reason: VnTextRevealEndReason };

export type VnAudioMixReason = 'dialogue' | 'emphasis' | 'silence' | 'authored' | 'restore' | 'dispose';

export interface VnAudioMixEvent {
    readonly mix: VnAudioMixFrame;
    readonly reason: VnAudioMixReason;
    /** Temporary mixes should return to the frame's `audioMix` after this duration. */
    readonly releaseAfterMs?: number;
}

export interface VnMusicEvent {
    readonly music: VnMusicFrame;
}

export interface VnSoundEvent {
    readonly sound: VnSoundCue;
}

export interface VnPerformanceHooks {
    readonly onTextReveal?: (event: VnTextRevealEvent) => void;
    readonly onAudioMix?: (event: VnAudioMixEvent) => void;
    readonly onMusic?: (event: VnMusicEvent) => void;
    readonly onSound?: (event: VnSoundEvent) => void;
    readonly onSfx?: (cue: SfxCue) => void;
}

export interface VnPerformanceTiming {
    readonly entranceMs: number;
    readonly staggerMs: number;
    readonly maximumStaggerMs: number;
    readonly jumpMs: number;
    readonly poseTransitionMs: number;
    readonly sceneTransitionMs: number;
    readonly cameraTransitionMs: number;
    readonly musicCrossfadeMs: number;
    readonly maximumMusicTransitionMs: number;
    readonly beatMs: number;
    readonly silenceMs: number;
    readonly maximumPauseMs: number;
    readonly audioFadeMs: number;
    readonly sfxDuckMs: number;
    readonly activeLiftPx: number;
}

export interface VnPerformanceEngineOptions<Expression extends string = string, Angle extends string = string>
    extends VnPerformanceHooks {
    readonly reducedMotion?: boolean;
    /** Compact presentation removes camera travel and lateral scene travel. */
    readonly compact?: boolean;
    readonly timing?: Partial<VnPerformanceTiming>;
    readonly presets?: VnCharacterCuePresets<Expression, Angle>;
    readonly places?: VnPlacePresentationPresets;
    /** Returning `undefined` keeps the base entrance. No random selector is installed by default. */
    readonly selectPlaceVariation?: (context: VnPlaceVariationContext) => string | undefined;
}

export interface VnPerformanceEngine<Expression extends string = string, Angle extends string = string> {
    perform(beat: VnPerformanceBeat<Expression, Angle>): VnPerformanceFrame<Expression, Angle>;
    completeTextReveal(lineId: string): VnPerformanceFrame<Expression, Angle> | undefined;
    skipTextReveal(lineId: string): VnPerformanceFrame<Expression, Angle> | undefined;
    readonly frame: VnPerformanceFrame<Expression, Angle> | undefined;
    dispose(): void;
}
