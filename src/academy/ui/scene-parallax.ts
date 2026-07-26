interface AcademySceneParallaxOptions {
    readonly background?: number;
    readonly foreground?: number;
    readonly paper?: number;
}

const DEFAULT_OPTIONS: Required<AcademySceneParallaxOptions> = {
    background: 8,
    foreground: 7,
    paper: 3,
};

/**
 * Adds restrained depth to a scene without tying narrative rendering to pointer events.
 * One animation-frame write services every pointer event, and touch/reduced-motion users
 * keep the stable composition.
 */
export function mountAcademySceneParallax(
    root: HTMLElement,
    signal: AbortSignal,
    options: AcademySceneParallaxOptions = {},
): void {
    if (typeof window.matchMedia !== 'function'
        || typeof window.requestAnimationFrame !== 'function') return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reducedMotion.matches) return;

    const strength = { ...DEFAULT_OPTIONS, ...options };
    let pendingFrame = 0;
    let nextX = 0;
    let nextY = 0;

    const commit = (): void => {
        pendingFrame = 0;
        root.style.setProperty('--academy-scene-background-x', `${nextX * strength.background * -1}px`);
        root.style.setProperty('--academy-scene-background-y', `${nextY * strength.background * -0.62}px`);
        root.style.setProperty('--academy-scene-foreground-x', `${nextX * strength.foreground}px`);
        root.style.setProperty('--academy-scene-foreground-y', `${nextY * strength.foreground * 0.48}px`);
        root.style.setProperty('--academy-scene-paper-x', `${nextX * strength.paper}px`);
        root.style.setProperty('--academy-scene-paper-y', `${nextY * strength.paper * 0.42}px`);
    };
    const schedule = (): void => {
        if (!pendingFrame) pendingFrame = window.requestAnimationFrame(commit);
    };
    const reset = (): void => {
        nextX = 0;
        nextY = 0;
        schedule();
    };

    root.addEventListener('pointermove', event => {
        const bounds = root.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        nextX = clamp((((event.clientX - bounds.left) / bounds.width) - 0.5) * 2);
        nextY = clamp((((event.clientY - bounds.top) / bounds.height) - 0.5) * 2);
        schedule();
    }, { passive: true, signal });
    root.addEventListener('pointerleave', reset, { signal });
    signal.addEventListener('abort', () => {
        if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    }, { once: true });
}

function clamp(value: number): number {
    return Math.max(-1, Math.min(1, value));
}
