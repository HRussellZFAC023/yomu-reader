let activationTrackingInstalled = false;
let pageHasUserActivation = false;

export function canAttemptAudiblePlayback(userGesture = false): boolean {
    installPageActivationTracking();
    if (userGesture) {
        pageHasUserActivation = true;
        return true;
    }

    const browserActivation = browserUserActivationState();
    if (browserActivation !== undefined) return browserActivation || pageHasUserActivation;
    if (isFirefoxLikeBrowser()) return pageHasUserActivation;
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

installPageActivationTracking();
