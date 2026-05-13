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
        if (!settings.showFloatingButton) return;

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

function avoidVideoOverlap(button: HTMLButtonElement, settings: ReaderSettings, saveSettings: () => void): void {
    if (!button.isConnected || document.fullscreenElement) return;
    const rect = button.getBoundingClientRect();
    const video = visibleVideos().find(candidate => intersects(rect, candidate.getBoundingClientRect()));
    button.classList.toggle('jpdb-reader-fab-over-video', Boolean(video));
    if (!video || button.matches(':hover, :focus, :focus-visible')) return;

    const videoRect = video.getBoundingClientRect();
    const candidates = [
        { x: videoRect.right + 10, y: rect.top },
        { x: videoRect.left - rect.width - 10, y: rect.top },
        { x: rect.left, y: videoRect.bottom + 10 },
        { x: rect.left, y: videoRect.top - rect.height - 10 },
    ];
    for (const candidate of candidates) {
        const position = clampPuck(button, candidate.x, candidate.y);
        if (!position) continue;
        const moved = new DOMRect(position.x, position.y, rect.width, rect.height);
        if (intersects(moved, videoRect)) continue;
        button.style.left = `${position.x}px`;
        button.style.top = `${position.y}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
        settings.puckPositionX = Math.round(position.x);
        settings.puckPositionY = Math.round(position.y);
        saveSettings();
        button.classList.remove('jpdb-reader-fab-over-video');
        return;
    }
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
    if (
        !Number.isFinite(x)
        || !Number.isFinite(y)
        || !Number.isFinite(window.innerWidth)
        || !Number.isFinite(window.innerHeight)
        || window.innerWidth <= margin * 2
        || window.innerHeight <= margin * 2
        || rect.width <= 0
        || rect.height <= 0
    ) {
        return null;
    }
    return {
        x: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, x)),
        y: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, y)),
    };
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
