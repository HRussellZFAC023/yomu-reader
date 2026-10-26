import type { ReaderSettings } from './types';

export type AnnotationPowerState = 'on' | 'paused';

export const PUCK_FURIGANA_INTENT_KEYS = ['puckFuriganaModeBeforeHide', 'showFurigana', 'furiganaMode'] as const satisfies readonly (keyof ReaderSettings)[];

type FuriganaSettings = Pick<ReaderSettings, typeof PUCK_FURIGANA_INTENT_KEYS[number]>;

/** Power is independent of readings, including the old puck's middle state. */
export function annotationPowerState(settings: Pick<ReaderSettings, 'annotationsPaused'>): AnnotationPowerState {
    return settings.annotationsPaused ? 'paused' : 'on';
}

/** Hide readings or restore their last style, without changing Yomu's power. */
export function toggleFuriganaSettings(settings: FuriganaSettings): FuriganaSettings {
    if (settings.showFurigana && settings.furiganaMode !== 'off') {
        return { showFurigana: true, furiganaMode: 'off', puckFuriganaModeBeforeHide: settings.furiganaMode };
    }
    return {
        showFurigana: true,
        furiganaMode: settings.puckFuriganaModeBeforeHide || (settings.furiganaMode !== 'off' ? settings.furiganaMode : 'known-status'),
        puckFuriganaModeBeforeHide: '',
    };
}
