import { APP_NAME, APP_PUCK } from '../app/constants';
import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import {
    RadialMenuController,
    radialAudioMutedIcon,
    radialAudioOnIcon,
    radialPowerIcon,
    radialScanIcon,
    radialSettingsIcon,
    radialYoutubeIcon,
    type RadialAction,
} from './radial-menu';

function hostHasBottomActionDock(): boolean {
    return location.hostname === 'jiten.moe' && location.pathname.startsWith('/srs/');
}

/** Context actions surfaced by the puck's radial menu. */
export interface FloatingButtonActions {
    openSettings(): void;
    scanPage(): void;
    openStudyPage(): void;
    togglePause(): void;
    isPaused(): boolean;
    toggleAutoPlayAudio(): void;
    isAutoPlayAudioEnabled(): boolean;
    isYouTube(): boolean;
    toggleYoutubeFilter(): void;
    isYoutubeFilterEnabled(): boolean;
}

export class FloatingButtonController {
    private button?: HTMLButtonElement;
    private abortController?: AbortController;
    private radial?: RadialMenuController;
    // Live references, refreshed on every install. Reusing the existing puck
    // element (instead of rebuilding it) lets an open radial menu survive the
    // settings-save echo that fires whenever a menu toggle persists state —
    // the menu just re-derives its item state in place, so toggling stays
    // seamless rather than tearing the menu down mid-interaction.
    private settings?: ReaderSettings;
    private actions?: FloatingButtonActions;
    private save: () => void = () => {};

    install(
        settings: ReaderSettings,
        saveSettings: () => void,
        actions: FloatingButtonActions,
    ): void {
        this.settings = settings;
        this.actions = actions;
        this.save = saveSettings;
        if (!shouldShowFloatingButton(settings)) {
            this.destroy();
            return;
        }
        // Drop stray pucks left by other runtimes, but never our own — removing
        // ours would also discard the live radial menu.
        document.querySelectorAll<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-fab')
            .forEach(element => { if (element !== this.button) element.remove(); });
        if (this.button?.isConnected) {
            this.syncButtonState();
            return;
        }
        this.build(settings);
    }

    destroy(): void {
        this.radial?.destroy();
        this.radial = undefined;
        this.abortController?.abort();
        this.abortController = undefined;
        this.button?.remove();
        this.button = undefined;
    }

    private build(settings: ReaderSettings): void {
        const button = document.createElement('button');
        button.className = 'jpdb-reader-fab';
        button.type = 'button';
        button.textContent = APP_PUCK;
        button.title = APP_NAME;
        button.setAttribute('aria-haspopup', 'menu');
        button.dataset.jpdbReaderRoot = 'true';
        restoreButtonPosition(button, settings);
        this.button = button;
        this.syncButtonState();
        this.radial = new RadialMenuController({
            getButton: () => this.button,
            buildActions: () => this.buildRadialActions(),
            menuLabel: () => uiText(this.settings?.interfaceLanguage ?? 'en', 'puckMenuLabel'),
        });
        this.installDragHandlers(button);
        button.addEventListener('click', event => {
            if (button.dataset.jpdbReaderMoved === 'true') {
                event.preventDefault();
                event.stopPropagation();
                button.dataset.jpdbReaderMoved = 'false';
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.radial?.toggle();
        });
        document.body.appendChild(button);
        clampRestoredButtonPosition(button, settings);
        this.installVideoAvoidance(button);
    }

    // Reflect current state on the persistent puck element without rebuilding it.
    private syncButtonState(): void {
        const button = this.button;
        if (!button) return;
        // Sites with their own bottom action dock (Jiten's study grade bar +
        // Blacklist/Master row) collide with the default bottom-right spot;
        // raise the FAB above them (mobile UX finding, 2026-06-11).
        button.classList.toggle('jpdb-reader-fab-raised', hostHasBottomActionDock());
        button.classList.toggle('jpdb-reader-fab--paused', Boolean(this.actions?.isPaused()));
    }

    private buildRadialActions(): RadialAction[] {
        const settings = this.settings;
        const actions = this.actions;
        if (!settings || !actions) return [];
        const language = settings.interfaceLanguage;
        const paused = actions.isPaused();
        const audioOn = actions.isAutoPlayAudioEnabled();
        const items: RadialAction[] = [
            {
                id: 'power',
                label: uiText(language, paused ? 'puckResumeAnnotations' : 'puckPauseAnnotations'),
                icon: radialPowerIcon(),
                tone: paused ? 'off' : 'on',
                primary: true,
                keepOpen: true,
                run: () => {
                    actions.togglePause();
                    this.button?.classList.toggle('jpdb-reader-fab--paused', actions.isPaused());
                },
            },
            {
                id: 'audio',
                label: uiText(language, audioOn ? 'puckMuteAudio' : 'puckUnmuteAudio'),
                icon: audioOn ? radialAudioOnIcon() : radialAudioMutedIcon(),
                tone: audioOn ? 'on' : 'off',
                keepOpen: true,
                run: () => actions.toggleAutoPlayAudio(),
            },
            {
                id: 'settings',
                label: uiText(language, 'settings'),
                icon: radialSettingsIcon(),
                run: () => actions.openSettings(),
            },
            {
                id: 'scan',
                label: uiText(language, 'scanPage'),
                icon: radialScanIcon(),
                disabled: paused,
                run: () => actions.scanPage(),
            },
            {
                id: 'study',
                label: uiText(language, 'puckStudyPage'),
                icon: 'よ',
                glyph: true,
                run: () => actions.openStudyPage(),
            },
        ];
        if (actions.isYouTube()) {
            const enabled = actions.isYoutubeFilterEnabled();
            items.push({
                id: 'youtube',
                label: uiText(language, 'toggleYoutubeImmersion'),
                icon: radialYoutubeIcon(),
                tone: enabled ? 'on' : 'off',
                keepOpen: true,
                run: () => actions.toggleYoutubeFilter(),
            });
        }
        return items;
    }

    private installVideoAvoidance(button: HTMLButtonElement): void {
        this.abortController?.abort();
        const controller = new AbortController();
        this.abortController = controller;
        const schedule = () => requestAnimationFrame(() => {
            if (this.settings) avoidVideoOverlap(button, this.settings, this.save);
        });
        window.addEventListener('resize', schedule, { passive: true, signal: controller.signal });
        window.addEventListener('scroll', schedule, { passive: true, signal: controller.signal });
        document.addEventListener('fullscreenchange', schedule, { signal: controller.signal });
        schedule();
    }

    private installDragHandlers(button: HTMLButtonElement): void {
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
            applyPuckPosition(button, position.x, position.y);
        }, { passive: false });
        const finishDrag = (event: PointerEvent): void => {
            if (!dragging) return;
            dragging = false;
            button.releasePointerCapture?.(event.pointerId);
            if (!moved) return;
            const rect = button.getBoundingClientRect();
            const position = clampPuck(button, rect.left, rect.top);
            if (!position) return;
            if (this.settings) {
                this.settings.puckPositionX = Math.round(position.x);
                this.settings.puckPositionY = Math.round(position.y);
            }
            this.save();
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
    applyPuckPosition(button, position.x, position.y);
    settings.puckPositionX = Math.round(position.x);
    settings.puckPositionY = Math.round(position.y);
    saveSettings();
}

function restoreButtonPosition(button: HTMLButtonElement, settings: ReaderSettings): void {
    if (settings.puckPositionX === undefined || settings.puckPositionY === undefined) return;
    applyPuckPosition(button, settings.puckPositionX, settings.puckPositionY);
}

function clampRestoredButtonPosition(button: HTMLButtonElement, settings: ReaderSettings): void {
    if (settings.puckPositionX === undefined || settings.puckPositionY === undefined) return;
    requestAnimationFrame(() => {
        if (!button.isConnected) return;
        const rect = button.getBoundingClientRect();
        const position = clampPuck(button, rect.left, rect.top);
        if (!position) return;
        if (Math.round(rect.left) === Math.round(position.x) && Math.round(rect.top) === Math.round(position.y)) return;
        applyPuckPosition(button, position.x, position.y);
    });
}

function applyPuckPosition(button: HTMLButtonElement, x: number, y: number): void {
    button.style.setProperty('left', `${x}px`);
    button.style.setProperty('top', `${y}px`);
    // .jpdb-reader-fab uses !important default right/bottom rules to survive
    // hostile page CSS. Restored/dragged positions must clear those with the
    // same priority; otherwise fixed layout gets both left and right and the
    // iPad puck stretches into a full-width pill.
    button.style.setProperty('right', 'auto', 'important');
    button.style.setProperty('bottom', 'auto', 'important');
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
