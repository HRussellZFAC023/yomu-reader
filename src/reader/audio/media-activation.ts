let activationTrackingInstalled = false;
let pageHasUserActivation = false;

const SILENT_AUDIO_DATA_URL = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';

export function canAttemptAudiblePlayback(userGesture = false): boolean {
    installPageActivationTracking();
    if (userGesture) {
        pageHasUserActivation = true;
        return true;
    }

    const browserActivation = browserUserActivationState();
    if (browserActivation) pageHasUserActivation = true;
    // A false userActivation state means playback may be rejected, not that
    // the reader should skip the attempt entirely. Some userscript managers
    // and desktop browsers still allow extension-initiated media playback;
    // when they do not, AudioPlayer handles the rejected play() and falls
    // through quietly.
    if (browserActivation !== undefined) return true;
    if (pageHasUserActivation) return true;
    if (isFirefoxLikeBrowser()) return true;
    return true;
}

export function canAttemptWebAudioFallback(userGesture = false): boolean {
    installPageActivationTracking();
    if (userGesture) {
        pageHasUserActivation = true;
        return true;
    }

    const browserActivation = browserUserActivationState();
    if (browserActivation) {
        pageHasUserActivation = true;
        return true;
    }
    if (pageHasUserActivation) return true;
    if (browserActivation === false) return false;
    if (isFirefoxLikeBrowser()) return true;
    return true;
}

function installPageActivationTracking(): void {
    if (activationTrackingInstalled || typeof window === 'undefined') return;
    activationTrackingInstalled = true;
    const markActive = () => { pageHasUserActivation = true; };
    for (const eventName of ['click', 'keydown', 'pointerdown', 'touchstart'] as const) {
        window.addEventListener(eventName, markActive, { capture: true, passive: true });
    }
}

function browserUserActivationState(): boolean | undefined {
    const activation = typeof navigator === 'undefined'
        ? undefined
        : navigator.userActivation;
    if (!activation) return undefined;
    return activation.hasBeenActive || activation.isActive;
}

function isFirefoxLikeBrowser(): boolean {
    return typeof navigator !== 'undefined' && /firefox|iceweasel|fxios/i.test(navigator.userAgent ?? '');
}

export function reserveGestureAudioElement(createAudioElement: (audioUrl: string) => HTMLAudioElement): HTMLAudioElement {
    const audio = createAudioElement(SILENT_AUDIO_DATA_URL);
    audio.loop = true;
    playSilentReservationAudio(audio);
    return audio;
}

function playSilentReservationAudio(audio: HTMLAudioElement): void {
    try {
        void audio.play().catch(() => undefined);
    } catch {
        // jsdom throws synchronously for HTMLMediaElement.play(), while browsers return
        // a rejected promise when playback cannot start.
    }
}

installPageActivationTracking();
