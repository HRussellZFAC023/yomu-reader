import { APP_NAME, APP_PUCK } from './constants';
import type { ReaderSettings } from './types';

export class FloatingButtonController {
    private button?: HTMLButtonElement;
    private abortController?: AbortController;

    install(
        settings: ReaderSettings,
        saveSettings: () => void,
        openSettings: () => void,
    ): void {
        this.destroy();
        document.querySelectorAll<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-fab').forEach(element => element.remove());
        if (!shouldShowFloatingButton(settings)) return;

        const button = document.createElement('button');
        button.className = 'jpdb-reader-fab';
        button.type = 'button';
        button.textContent = APP_PUCK;
        button.title = APP_NAME;
        button.dataset.jpdbReaderRoot = 'true';
        restoreButtonPosition(button, settings);
        this.installDragHandlers(button, settings, saveSettings);
        button.addEventListener('click', event => {
            if (button.dataset.jpdbReaderMoved === 'true') {
                event.preventDefault();
                event.stopPropagation();
                button.dataset.jpdbReaderMoved = 'false';
                return;
            }
            openSettings();
        });
        document.body.appendChild(button);
        this.button = button;
        clampRestoredButtonPosition(button, settings);
        this.installVideoAvoidance(button, settings, saveSettings);
    }

    destroy(): void {
        this.abortController?.abort();
        this.abortController = undefined;
        this.button?.remove();
        this.button = undefined;
    }

    private installVideoAvoidance(button: HTMLButtonElement, settings: ReaderSettings, saveSettings: () => void): void {
        this.abortController?.abort();
        const controller = new AbortController();
        this.abortController = controller;
        const schedule = () => requestAnimationFrame(() => avoidVideoOverlap(button, settings, saveSettings));
        window.addEventListener('resize', schedule, { passive: true, signal: controller.signal });
        window.addEventListener('scroll', schedule, { passive: true, signal: controller.signal });
        document.addEventListener('fullscreenchange', schedule, { signal: controller.signal });
        schedule();
    }

    private installDragHandlers(button: HTMLButtonElement, settings: ReaderSettings, saveSettings: () => void): void {
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            dragging = true;
            moved = false;
            button.dataset.jpdbReaderMoved = 'false';
            startX = event.clientX;
            startY = event.clientY;
            const rect = button.getBoundingClientRect();
            originX = rect.left;
            originY = rect.top;
            button.setPointerCapture?.(event.pointerId);
        });
        button.addEventListener('pointermove', event => {
            if (!dragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.hypot(dx, dy) > 4) moved = true;
            if (!moved) return;
            event.preventDefault();
            button.dataset.jpdbReaderMoved = 'true';
            const position = clampPuck(button, originX + dx, originY + dy);
            if (!position) return;
            button.style.left = `${position.x}px`;
            button.style.top = `${position.y}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
        }, { passive: false });
        const finishDrag = (event: PointerEvent): void => {
            if (!dragging) return;
            dragging = false;
            button.releasePointerCapture?.(event.pointerId);
            if (!moved) return;
            const rect = button.getBoundingClientRect();
            const position = clampPuck(button, rect.left, rect.top);
            if (!position) return;
            settings.puckPositionX = Math.round(position.x);
            settings.puckPositionY = Math.round(position.y);
            saveSettings();
        };
        button.addEventListener('pointerup', finishDrag);
        button.addEventListener('pointercancel', finishDrag);
    }
}

function shouldShowFloatingButton(settings: ReaderSettings): boolean {
    return settings.showFloatingButton || isCoarsePointerDevice();
}

function isCoarsePointerDevice(): boolean {
    try {
        const media = window.matchMedia?.('(pointer: coarse)');
        if (media) return media.matches;
    } catch {
        // Ignore browser-specific matchMedia failures and fall back below.
    }
    return false;
}

function avoidVideoOverlap(button: HTMLButtonElement, settings: ReaderSettings, saveSettings: () => void): void {
    if (!canAvoidVideoOverlap(button)) return;
    const rect = button.getBoundingClientRect();
    const video = overlappingVideo(rect);
    button.classList.toggle('jpdb-reader-fab-over-video', Boolean(video));
    if (!shouldMoveAwayFromVideo(button, video)) return;

    for (const position of nonOverlappingPuckPositions(button, rect, video.getBoundingClientRect())) {
        movePuck(button, position, settings, saveSettings);
        button.classList.remove('jpdb-reader-fab-over-video');
        return;
    }
}

function canAvoidVideoOverlap(button: HTMLButtonElement): boolean {
    return button.isConnected && !document.fullscreenElement;
}

function shouldMoveAwayFromVideo(button: HTMLButtonElement, video: HTMLVideoElement | undefined): video is HTMLVideoElement {
    return Boolean(video && !button.matches(':hover, :focus, :focus-visible'));
}

function overlappingVideo(rect: DOMRect): HTMLVideoElement | undefined {
    return visibleVideos().find(candidate => intersects(rect, candidate.getBoundingClientRect()));
}

function nonOverlappingPuckPositions(button: HTMLButtonElement, rect: DOMRect, videoRect: DOMRect): Array<{ x: number; y: number }> {
    const candidates = [
        { x: videoRect.right + 10, y: rect.top },
        { x: videoRect.left - rect.width - 10, y: rect.top },
        { x: rect.left, y: videoRect.bottom + 10 },
        { x: rect.left, y: videoRect.top - rect.height - 10 },
    ];
    return candidates
        .map(candidate => clampPuck(button, candidate.x, candidate.y))
        .filter((position): position is { x: number; y: number } => Boolean(position))
        .filter(position => !intersects(new DOMRect(position.x, position.y, rect.width, rect.height), videoRect));
}

function movePuck(button: HTMLButtonElement, position: { x: number; y: number }, settings: ReaderSettings, saveSettings: () => void): void {
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    settings.puckPositionX = Math.round(position.x);
    settings.puckPositionY = Math.round(position.y);
    saveSettings();
}

function restoreButtonPosition(button: HTMLButtonElement, settings: ReaderSettings): void {
    if (settings.puckPositionX === undefined || settings.puckPositionY === undefined) return;
    button.style.left = `${settings.puckPositionX}px`;
    button.style.top = `${settings.puckPositionY}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
}

function clampRestoredButtonPosition(button: HTMLButtonElement, settings: ReaderSettings): void {
    if (settings.puckPositionX === undefined || settings.puckPositionY === undefined) return;
    requestAnimationFrame(() => {
        if (!button.isConnected) return;
        const rect = button.getBoundingClientRect();
        const position = clampPuck(button, rect.left, rect.top);
        if (!position) return;
        if (Math.round(rect.left) === Math.round(position.x) && Math.round(rect.top) === Math.round(position.y)) return;
        button.style.left = `${position.x}px`;
        button.style.top = `${position.y}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
    });
}

function clampPuck(button: HTMLButtonElement, x: number, y: number): { x: number; y: number } | null {
    const rect = button.getBoundingClientRect();
    const margin = 8;
    if (!canClampPuck(rect, x, y, margin)) return null;
    return {
        x: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, x)),
        y: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, y)),
    };
}

function canClampPuck(rect: DOMRect, x: number, y: number, margin: number): boolean {
    if (!finitePuckPosition(x, y)) return false;
    if (!finiteViewport()) return false;
    if (!hasViewportRoom(margin)) return false;
    return hasVisiblePuckRect(rect);
}

function finitePuckPosition(x: number, y: number): boolean {
    return Number.isFinite(x) && Number.isFinite(y);
}

function finiteViewport(): boolean {
    return Number.isFinite(window.innerWidth) && Number.isFinite(window.innerHeight);
}

function hasViewportRoom(margin: number): boolean {
    return window.innerWidth > margin * 2 && window.innerHeight > margin * 2;
}

function hasVisiblePuckRect(rect: DOMRect): boolean {
    return rect.width > 0 && rect.height > 0;
}

function visibleVideos(): HTMLVideoElement[] {
    return Array.from(document.querySelectorAll('video'))
        .filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement)
        .filter(video => {
            const rect = video.getBoundingClientRect();
            return rect.width > 120 && rect.height > 90;
        });
}

function intersects(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right
        && a.right > b.left
        && a.top < b.bottom
        && a.bottom > b.top;
}
