/** Retry after the installed realm has had a chance to expose its APIs. */
export function scheduleBridgeRetry({ installed, install }: { installed: () => boolean; install: () => void }): void {
    const retry = (): void => {
        if (!installed()) install();
    };
    if (typeof queueMicrotask === 'function') {
        queueMicrotask(retry);
    } else {
        void Promise.resolve().then(retry);
    }
    window.setTimeout(retry, 0);
    window.setTimeout(retry, 250);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', retry, { once: true });
    }
}
