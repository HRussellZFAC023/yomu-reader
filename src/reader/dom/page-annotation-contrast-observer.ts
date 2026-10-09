import { refreshReaderWordContrast } from './word-contrast';

/** Page theme switches change the backdrop without repainting annotated text. */
export function observePageAnnotationContrast(signal: AbortSignal): void {
    if (signal.aborted) return;
    let frame = 0;
    const schedule = (): void => {
        if (frame || signal.aborted) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!signal.aborted) refreshReaderWordContrast(document);
        });
    };
    // Observe only theme-bearing roots, never the word styles written by the
    // refresh itself. Multiple root changes in one turn share one measurement.
    let body: HTMLElement | null = null;
    const observer = new MutationObserver(() => {
        if (body !== document.body) watchRoots();
        schedule();
    });
    const options = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'] };
    const watchRoots = (): void => {
        observer.disconnect();
        // Direct children only: install can precede <body>, and an SPA can
        // replace it. Descendant annotation/style mutations remain excluded.
        observer.observe(document.documentElement, { ...options, childList: true });
        body = document.body;
        if (body) observer.observe(body, options);
    };
    watchRoots();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', schedule);
    signal.addEventListener('abort', () => {
        observer.disconnect();
        media?.removeEventListener('change', schedule);
        cancelAnimationFrame(frame);
    }, { once: true });
}
