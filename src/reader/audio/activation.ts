import { hasVisiblePageVideo } from '../browser-ui';
import { canAttemptAudiblePlayback } from '../media-activation';
import type { ReaderSettings } from '../types';

export interface ReaderAutoAudioActivationOptions {
    anchor?: HTMLElement;
    settings: ReaderSettings;
    subtitleSurfaceSelector: string;
    trigger: 'modal' | 'hover';
    userGesture?: boolean;
}

export function canAttemptReaderAutoAudio(options: ReaderAutoAudioActivationOptions): boolean {
    if (!options.settings.audioEnabled || !options.settings.autoPlayAudio) return false;
    if (shouldSuppressAutoAudioForVideo(options)) return false;
    if (!shouldAutoPlayForTrigger(options.settings, options.trigger)) return false;
    return canAttemptAudiblePlayback(options.userGesture);
}

function shouldSuppressAutoAudioForVideo(options: ReaderAutoAudioActivationOptions): boolean {
    return options.settings.suppressAutoAudioOnVideo
        && (Boolean(options.anchor?.closest(options.subtitleSurfaceSelector)) || hasVisiblePageVideo());
}

function shouldAutoPlayForTrigger(settings: ReaderSettings, trigger: 'modal' | 'hover'): boolean {
    const mode = settings.audioAutoPlayMode;
    if (mode === 'off') return false;
    if (mode === 'all') return true;
    return mode === 'hover' ? trigger === 'hover' : trigger === 'modal';
}
