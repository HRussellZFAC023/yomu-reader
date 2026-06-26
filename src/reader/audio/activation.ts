import { hasVisiblePageVideo } from '../ui/browser';
import { canAttemptAudiblePlayback } from './media-activation';
import type { ReaderSettings } from '../app/types';

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
    if (options.userGesture) return false;
    return options.settings.suppressAutoAudioOnVideo && hasVisiblePageVideo();
}

function shouldAutoPlayForTrigger(settings: ReaderSettings, trigger: 'modal' | 'hover'): boolean {
    const mode = settings.audioAutoPlayMode;
    if (mode === 'off') return false;
    if (mode === 'all') return true;
    return mode === 'hover' ? trigger === 'hover' : trigger === 'modal';
}
