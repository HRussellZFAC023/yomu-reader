export function waitForIdle(timeoutMs = 75, fallbackDelayMs = 0): Promise<void> {
    if (timeoutMs <= 0 && fallbackDelayMs <= 0) return Promise.resolve();
    return new Promise(resolve => {
        if (scheduleIdleCallback(() => resolve(), timeoutMs)) return;
        window.setTimeout(resolve, Math.max(0, fallbackDelayMs));
    });
}

export function scheduleIdleCallback(callback: () => void, timeoutMs = 75): boolean {
    const requestIdleCallback = window.requestIdleCallback;
    if (typeof requestIdleCallback !== 'function') return false;
    requestIdleCallback.call(window, callback, { timeout: timeoutMs });
    return true;
}
