import type { ReaderSettings } from './types';

export type AnnotationPowerState = 'on' | 'no-furigana' | 'paused';
type FuriganaMode = ReaderSettings['furiganaMode'];

export type AnnotationPowerTransition =
    | { kind: 'hide-furigana'; rememberedMode: FuriganaMode | '' }
    | { kind: 'pause' }
    | { kind: 'resume'; furiganaMode?: FuriganaMode };

export interface AnnotationPowerEffects {
    hideFurigana(rememberedMode: FuriganaMode | ''): Promise<void>;
    pause(): Promise<void>;
    resume(furiganaMode?: FuriganaMode): Promise<void>;
}

type AnnotationPowerSettings = Pick<
    ReaderSettings,
    'annotationsPaused' | 'showFurigana' | 'furiganaMode' | 'puckFuriganaModeBeforeHide'
>;

/** Target-appropriate puck state: furigana is a Japanese-only middle step. */
export function annotationPowerState(
    settings: AnnotationPowerSettings,
    hasFuriganaChannel: boolean,
): AnnotationPowerState {
    if (settings.annotationsPaused) return 'paused';
    return hasFuriganaChannel && !furiganaEnabled(settings) ? 'no-furigana' : 'on';
}

/** One declarative transition; the ReaderApp remains responsible for effects. */
export function planAnnotationPowerTransition(
    settings: AnnotationPowerSettings,
    hasFuriganaChannel: boolean,
    defaultFuriganaMode: FuriganaMode,
): AnnotationPowerTransition {
    const state = annotationPowerState(settings, hasFuriganaChannel);
    if (!hasFuriganaChannel) return { kind: state === 'paused' ? 'resume' : 'pause' };
    return JAPANESE_POWER_TRANSITIONS[state](settings, defaultFuriganaMode);
}

/** Execute the plan without making ReaderApp own another state machine. */
export function applyAnnotationPowerTransition(
    transition: AnnotationPowerTransition,
    effects: AnnotationPowerEffects,
): Promise<void> {
    const actions: Record<AnnotationPowerTransition['kind'], () => Promise<void>> = {
        'hide-furigana': () => effects.hideFurigana(
            transition.kind === 'hide-furigana' ? transition.rememberedMode : '',
        ),
        pause: () => effects.pause(),
        resume: () => effects.resume(transition.kind === 'resume' ? transition.furiganaMode : undefined),
    };
    return actions[transition.kind]();
}

type AnnotationPowerTransitionPlanner = (
    settings: AnnotationPowerSettings,
    defaultMode: FuriganaMode,
) => AnnotationPowerTransition;

const JAPANESE_POWER_TRANSITIONS = Object.freeze({
    on: settings => ({
        kind: 'hide-furigana',
        rememberedMode: settings.furiganaMode === 'off' ? '' : settings.furiganaMode,
    }),
    'no-furigana': () => ({ kind: 'pause' }),
    paused: (settings, defaultMode) => ({
        kind: 'resume',
        furiganaMode: restoredFuriganaMode(settings, defaultMode),
    }),
} satisfies Record<AnnotationPowerState, AnnotationPowerTransitionPlanner>);

function furiganaEnabled(settings: AnnotationPowerSettings): boolean {
    return settings.showFurigana && settings.furiganaMode !== 'off';
}

function restoredFuriganaMode(
    settings: AnnotationPowerSettings,
    defaultMode: FuriganaMode,
): FuriganaMode {
    if (settings.puckFuriganaModeBeforeHide) return settings.puckFuriganaModeBeforeHide;
    return settings.furiganaMode === 'off' ? defaultMode : settings.furiganaMode;
}
