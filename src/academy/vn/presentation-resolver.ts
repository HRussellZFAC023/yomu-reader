import type {
    VnCameraCue,
    VnCameraFrame,
    VnMusicCue,
    VnMusicFrame,
    VnPerformanceEngineOptions,
    VnPerformanceTiming,
    VnPlacePresentationPreset,
    VnPlacePresentationTreatment,
    VnSceneCue,
    VnSceneFrame,
    VnSceneTransitionKind,
} from './performance-contract';

interface PresentationResolverOptions {
    readonly reducedMotion: boolean;
    readonly compact: boolean;
    readonly timing: VnPerformanceTiming;
    readonly places: VnPerformanceEngineOptions['places'];
    readonly selectPlaceVariation: VnPerformanceEngineOptions['selectPlaceVariation'];
    readonly nextToken: () => number;
}

interface PresentationInput {
    readonly scene?: VnSceneCue;
    readonly camera?: VnCameraCue;
    readonly music?: VnMusicCue;
    readonly previousScene?: VnSceneFrame;
    readonly previousCamera?: VnCameraFrame;
    readonly previousMusic?: VnMusicFrame;
}

export interface VnPresentationResolution {
    readonly scene?: VnSceneFrame;
    readonly camera?: VnCameraFrame;
    readonly music?: VnMusicFrame;
    /** Applies only to the entry beat, not every beat held in the place. */
    readonly entranceTreatment?: VnPlacePresentationTreatment;
    commit(): void;
}

interface ResolvedPlacePresentation {
    readonly treatment: VnPlacePresentationTreatment;
    readonly variationId?: string;
    readonly visit: number;
}

export interface VnPresentationResolver {
    resolve(input: PresentationInput): VnPresentationResolution;
}

export function createVnPresentationResolver(options: PresentationResolverOptions): VnPresentationResolver {
    const visits = new Map<string, number>();

    return {
        resolve(input) {
            const enteringPlace = Boolean(input.scene && input.scene.id !== input.previousScene?.id);
            const preset = input.scene ? options.places?.[input.scene.id] : undefined;
            const place = enteringPlace && input.scene && (preset || input.scene.variation)
                ? resolvePlacePresentation(input.scene, preset, visits, options.selectPlaceVariation)
                : undefined;
            const scene = nextSceneFrame(input.scene, place, input.previousScene, options);
            const camera = nextCameraFrame(
                input.camera ?? place?.treatment.camera,
                input.previousCamera,
                options,
            );
            const music = nextMusicFrame(
                input.music ?? place?.treatment.music,
                input.previousMusic,
                options,
            );
            let committed = false;
            return {
                ...(scene ? { scene } : {}),
                ...(camera ? { camera } : {}),
                ...(music ? { music } : {}),
                ...(place ? { entranceTreatment: place.treatment } : {}),
                commit() {
                    if (committed) return;
                    committed = true;
                    if (enteringPlace && input.scene && place) visits.set(input.scene.id, place.visit);
                },
            };
        },
    };
}

function resolvePlacePresentation(
    cue: VnSceneCue,
    preset: VnPlacePresentationPreset | undefined,
    visits: ReadonlyMap<string, number>,
    selectVariation: VnPerformanceEngineOptions['selectPlaceVariation'],
): ResolvedPlacePresentation {
    const visit = (visits.get(cue.id) ?? 0) + 1;
    const availableVariations = Object.keys(preset?.variations ?? {}).sort();
    const variationId = cue.variation ?? selectVariation?.({
        placeId: cue.id,
        visit,
        availableVariations,
    });
    if (variationId !== undefined && !variationId.trim()) {
        throw new TypeError(`Scene ${cue.id} selected an empty presentation variation id.`);
    }
    const variation = variationId ? preset?.variations?.[variationId] : undefined;
    if (variationId && !variation) {
        throw new TypeError(`Scene ${cue.id} references missing presentation variation ${variationId}.`);
    }
    const { variations: _variations, ...base } = preset ?? {};
    return {
        treatment: { ...base, ...variation },
        ...(variationId ? { variationId } : {}),
        visit,
    };
}

function nextSceneFrame(
    cue: VnSceneCue | undefined,
    place: ResolvedPlacePresentation | undefined,
    previous: VnSceneFrame | undefined,
    options: PresentationResolverOptions,
): VnSceneFrame | undefined {
    if (!cue) return previous ? sceneWithoutTransition(previous) : undefined;
    if (cue.id === previous?.id) return sceneWithoutTransition(previous);
    const authored = cue.transition ?? place?.treatment.entrance ?? 'dissolve';
    const kind: VnSceneTransitionKind = options.reducedMotion
        ? place?.treatment.reducedMotionEntrance ?? 'cut'
        : options.compact ? place?.treatment.compactEntrance ?? compactSceneEntrance(authored) : authored;
    const shouldTransition = Boolean(previous || cue.transition || place?.treatment.entrance);
    return {
        id: cue.id,
        entranceStyle: authored,
        ...(place?.variationId ? { variationId: place.variationId } : {}),
        ...(shouldTransition ? { transition: {
            kind,
            token: options.nextToken(),
            durationMs: kind === 'cut' ? 0 : options.timing.sceneTransitionMs,
        } } : {}),
    };
}

function compactSceneEntrance(kind: VnSceneTransitionKind): VnSceneTransitionKind {
    return kind === 'cut' || kind === 'dissolve' ? kind : 'dissolve';
}

function sceneWithoutTransition(frame: VnSceneFrame): VnSceneFrame {
    return {
        id: frame.id,
        ...(frame.entranceStyle ? { entranceStyle: frame.entranceStyle } : {}),
        ...(frame.variationId ? { variationId: frame.variationId } : {}),
    };
}

function nextCameraFrame(
    cue: VnCameraCue | undefined,
    previous: VnCameraFrame | undefined,
    options: PresentationResolverOptions,
): VnCameraFrame | undefined {
    if (!cue) return previous ? cameraWithoutTransition(previous) : undefined;
    if (cue.focusId !== undefined && !cue.focusId.trim()) {
        throw new TypeError('A camera focus id cannot be empty.');
    }
    const shot = options.compact && cue.shot === 'close' ? 'medium' : cue.shot;
    const changed = !previous || previous.shot !== shot || previous.focusId !== cue.focusId;
    if (!changed) return cameraWithoutTransition(previous);
    const transition = previous && cue.movement && !options.reducedMotion && !options.compact
        ? { kind: cue.movement, token: options.nextToken(), durationMs: options.timing.cameraTransitionMs }
        : undefined;
    return {
        shot,
        ...(cue.focusId ? { focusId: cue.focusId } : {}),
        ...(transition ? { transition } : {}),
    };
}

function cameraWithoutTransition(frame: VnCameraFrame): VnCameraFrame {
    return {
        shot: frame.shot,
        ...(frame.focusId ? { focusId: frame.focusId } : {}),
    };
}

function nextMusicFrame(
    cue: VnMusicCue | undefined,
    previous: VnMusicFrame | undefined,
    options: PresentationResolverOptions,
): VnMusicFrame | undefined {
    if (!cue) return previous ? { theme: previous.theme } : undefined;
    if (!cue.theme.trim()) throw new TypeError('A music cue requires a theme.');
    if (previous?.theme === cue.theme) return { theme: previous.theme };
    const kind = cue.transition ?? (previous ? 'crossfade' : 'cut');
    if (cue.durationMs !== undefined && (!Number.isFinite(cue.durationMs) || cue.durationMs < 0)) {
        throw new RangeError('A music transition duration must be a finite, non-negative number.');
    }
    const requestedDuration = cue.durationMs ?? (kind === 'cut' ? 0 : options.timing.musicCrossfadeMs);
    return {
        theme: cue.theme,
        transition: {
            kind,
            token: options.nextToken(),
            durationMs: Math.min(requestedDuration, options.timing.maximumMusicTransitionMs),
        },
    };
}
