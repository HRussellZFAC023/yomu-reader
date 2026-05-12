import { APP_NAME, APP_PUCK } from './constants';
import type { ReaderSettings } from './types';

export class FloatingButtonController {
    private button?: HTMLButtonElement;

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
    }

    destroy(): void {
        this.button?.remove();
        this.button = undefined;
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
            button.style.left = `${position.x}px`;
            button.style.top = `${position.y}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
        }, { passive: false });
        button.addEventListener('pointerup', event => {
            if (!dragging) return;
            dragging = false;
            button.releasePointerCapture?.(event.pointerId);
            if (!moved) return;
            const rect = button.getBoundingClientRect();
            const position = clampPuck(button, rect.left, rect.top);
            settings.puckPositionX = Math.round(position.x);
            settings.puckPositionY = Math.round(position.y);
            saveSettings();
        });
    }
}

function restoreButtonPosition(button: HTMLButtonElement, settings: ReaderSettings): void {
    if (settings.puckPositionX === undefined || settings.puckPositionY === undefined) return;
    button.style.left = `${settings.puckPositionX}px`;
    button.style.top = `${settings.puckPositionY}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
}

function clampPuck(button: HTMLButtonElement, x: number, y: number): { x: number; y: number } {
    const rect = button.getBoundingClientRect();
    const margin = 8;
    return {
        x: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, x)),
        y: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, y)),
    };
}
