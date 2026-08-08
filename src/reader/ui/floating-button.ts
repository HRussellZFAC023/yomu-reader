import { APP_NAME, APP_PUCK } from '../app/constants';
import { formatUiText, uiText } from '../app/i18n';
import { targetLanguageDisplayName } from '../app/target-language-name';
import { activeLearningTargetLanguage } from '../languages/target-runtime';
import { usesJapaneseProviders } from '../languages/character-lookup';
import type { ReaderSettings } from '../app/types';
import {
    RadialMenuController,
    radialAudioMutedIcon,
    radialAudioOnIcon,
    radialCaptionsIcon,
    radialFuriganaHiddenIcon,
    radialOcrIcon,
    radialOcrOnIcon,
    radialPausedIcon,
    radialPowerIcon,
    radialSettingsIcon,
    radialYoutubeIcon,
    type RadialAction,
} from './radial-menu';
import type { OcrInteractionMode } from '../ocr/mode';
import {
    applyOverlayPageScale,
    hasOverlayPageScale,
    layoutPointToOverlay,
    layoutRectToOverlay,
    overlayViewport,
    sourceRectToOverlay,
} from './page-scale';

// Trailing-edge settle delay for the puck's video-avoidance recompute. Long
// enough to outlast an inertial scroll's tail so the layout read runs once the
// page is still, short enough that the puck steps off a revealed video promptly.
const VIDEO_AVOIDANCE_SETTLE_MS = 120;
// iPadOS can deliver the last resize event before window/screen metrics finish
// settling after a rotation. Reconcile once more after that short transition so
// a transient 2x reading cannot leave the puck stuck at inverse (half) scale.
const VIEWPORT_SCALE_SETTLE_MS = 240;

function hostHasBottomActionDock(): boolean {
    return location.hostname === 'jiten.moe' && location.pathname.startsWith('/srs/');
}

function puckStateLabel(language: ReaderSettings['interfaceLanguage'], state: PuckPowerState): string {
    if (state === 'no-furigana') return `${APP_NAME}: ${uiText(language, 'furiganaOffToast')}`;
    if (state === 'paused') return `${APP_NAME}: ${uiText(language, 'annotationsPausedToast')}`;
    return APP_NAME;
}

/**
 * The puck power button steps through three states: everything on → furigana
 * hidden (colours, lookups, and mining stay live) → annotations paused → on.
 */
export type PuckPowerState = 'on' | 'no-furigana' | 'paused';

/** Context actions surfaced by the puck's radial menu. */
export interface FloatingButtonActions {
    openSettings(): void;
    openStudyPage(): void;
    cyclePowerState(): Promise<void>;
    powerState(): PuckPowerState;
    isPaused(): boolean;
    toggleOcrMode(): void;
    ocrMode(): OcrInteractionMode;
    toggleAutoPlayAudio(): void;
    isAutoPlayAudioEnabled(): boolean;
    toggleJapaneseSiteLanguage(): void;
    isYouTube(): boolean;
    toggleYoutubeFilter(): void;
    isYoutubeFilterEnabled(): boolean;
    toggleAutoSubtitles(): void;
    isAutoSubtitlesEnabled(): boolean;
    hasSubtitleVideo(): boolean;
}

interface PuckBox {
    width: number;
    height: number;
}

interface PuckPosition {
    x: number;
    y: number;
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
        applyOverlayPageScale(button);
        clampRestoredButtonPosition(button, settings);
        this.installVideoAvoidance(button);
    }

    // Reflect current state on the persistent puck element without rebuilding it.
    private syncButtonState(): void {
        const button = this.button;
        if (!button) return;
        const powerState = this.actions?.powerState() ?? 'on';
        const language = this.settings?.interfaceLanguage ?? 'en';
        const targetName = this.settings ? targetLanguageDisplayName(this.settings) : '';
        // Sites with their own bottom action dock (Jiten's study grade bar +
        // Blacklist/Master row) collide with the default bottom-right spot;
        // raise the FAB above them (mobile UX finding, 2026-06-11).
        button.classList.toggle('jpdb-reader-fab-raised', hostHasBottomActionDock());
        button.classList.toggle('jpdb-reader-fab--on', powerState === 'on');
        button.classList.toggle('jpdb-reader-fab--no-furigana', powerState === 'no-furigana');
        button.classList.toggle('jpdb-reader-fab--paused', powerState === 'paused');
        button.dataset.targetLanguage = activeLearningTargetLanguage();
        button.title = powerState === 'on' && targetName
            ? formatUiText(language, 'puckLearningTarget', { language: targetName })
            : puckStateLabel(language, powerState);
        button.setAttribute('aria-label', button.title);
    }

    private buildRadialActions(): RadialAction[] {
        const settings = this.settings;
        const actions = this.actions;
        if (!settings || !actions) return [];
        const language = settings.interfaceLanguage;
        const powerState = actions.powerState();
        const ocrMode = actions.ocrMode();
        const audioOn = actions.isAutoPlayAudioEnabled();
        const japaneseSiteLanguage = settings.preferJapaneseSiteLanguage;
        // Power steps on → furigana hidden → paused → on; the label always
        // names the NEXT state so a press does what the button says.
        const powerLabelKey = !usesJapaneseProviders()
            ? powerState === 'paused' ? 'puckResumeAnnotations' : 'puckPauseAnnotations'
            : powerState === 'on' ? 'puckHideFurigana'
                : powerState === 'no-furigana' ? 'puckPauseAnnotations'
                    : 'puckResumeAnnotations';
        const items: RadialAction[] = [
            {
                id: 'power',
                label: uiText(language, powerLabelKey),
                icon: powerState === 'on' ? radialPowerIcon()
                    : powerState === 'no-furigana' ? radialFuriganaHiddenIcon()
                        : radialPausedIcon(),
                tone: powerState === 'on' ? 'on' : powerState === 'no-furigana' ? 'partial' : 'off',
                primary: true,
                keepOpen: true,
                run: () => void actions.cyclePowerState().finally(() => this.syncButtonState()),
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
                id: 'ocr',
                label: ocrModeLabel(language, ocrMode),
                icon: ocrMode === 'manual' ? radialOcrOnIcon() : radialOcrIcon(),
                // The master pause silences OCR, so show it off rather than
                // claiming "OCR on" while nothing scans.
                tone: ocrMode === 'off' || powerState === 'paused' ? 'off' : 'on',
                keepOpen: true,
                run: () => actions.toggleOcrMode(),
            },
            {
                id: 'japanese-site',
                // Names the active target: the redirect follows it, not Japanese.
                label: formatUiText(language, 'preferJapaneseSiteLanguage', {
                    language: targetLanguageDisplayName(settings),
                }),
                icon: '日',
                glyph: true,
                tone: japaneseSiteLanguage ? 'on' : 'off',
                keepOpen: true,
                run: () => actions.toggleJapaneseSiteLanguage(),
            },
            {
                id: 'settings',
                label: uiText(language, 'settings'),
                icon: radialSettingsIcon(),
                run: () => actions.openSettings(),
            },
            {
                id: 'study',
                label: formatUiText(language, 'puckStudyTarget', {
                    language: targetLanguageDisplayName(settings),
                }),
                icon: 'よ',
                glyph: true,
                run: () => actions.openStudyPage(),
            },
        ];
        // Page-track discovery is target-routed. Keep it visible for every
        // target and name that TARGET explicitly so it cannot be mistaken for
        // Japanese OCR or for the definition/translation language.
        if (actions.hasSubtitleVideo()) {
            const subtitlesOn = actions.isAutoSubtitlesEnabled();
            items.push({
                id: 'subtitles',
                label: formatUiText(language, 'puckAutoDetectTargetSubtitles', {
                    language: targetLanguageDisplayName(settings),
                }),
                icon: radialCaptionsIcon(),
                tone: subtitlesOn ? 'on' : 'off',
                keepOpen: true,
                run: () => actions.toggleAutoSubtitles(),
            });
        }
        if (actions.isYouTube()) {
            const enabled = actions.isYoutubeFilterEnabled();
            items.push({
                id: 'youtube',
                label: formatUiText(language, 'puckFilterYoutubeTarget', {
                    language: targetLanguageDisplayName(settings),
                }),
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
        let settleTimer: number | undefined;
        let viewportSettleTimer: number | undefined;
        let frame: number | undefined;
        const recompute = (): void => {
            // rAF-coalesced: a burst of resize events (window drag-resize) folds
            // into one layout read per frame instead of stacking callbacks.
            if (frame !== undefined) return;
            frame = requestAnimationFrame(() => {
                frame = undefined;
                applyOverlayPageScale(button);
                if (this.settings && avoidanceCouldChange()) {
                    avoidVideoOverlap(button, this.settings, this.save);
                }
            });
        };
        // When the overlay is unscaled, the page has no <video> at all, and the
        // puck is not currently displaced by one, there is nothing to reposition
        // — skip the layout read entirely (the common case on a text page). The
        // over-video check keeps a puck that WAS avoiding a since-removed video
        // eligible for the recompute that returns it home. querySelector('video')
        // is a cheap selector match with no layout, unlike the
        // getBoundingClientRect walk it guards.
        const avoidanceCouldChange = (): boolean =>
            overlayViewport().pageScale !== 1
            || hasOverlayPageScale(button)
            || button.classList.contains('jpdb-reader-fab-over-video')
            || Boolean(document.querySelector('video'));
        // Scroll fires continuously during a fling, and each recompute reads the
        // puck's box plus every video's box — a forced layout on every rAF was
        // measurable iPad heat while scrolling. Nothing the puck must avoid
        // moves mid-fling in a way a single settle recompute cannot catch, so
        // collapse the scroll stream to the trailing edge.
        const scheduleSettle = (): void => {
            if (!avoidanceCouldChange()) return;
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(recompute, VIDEO_AVOIDANCE_SETTLE_MS);
        };
        // Resize is a discrete layout change (rotation, viewport chrome, split
        // view), not a per-frame stream like scroll: the puck must mark/clear a
        // video overlap within a frame of it, so it recomputes immediately
        // (rAF-coalesced above), never on the settle delay.
        const handleViewportChange = (): void => {
            // Apply an observable change immediately. Also keep the delayed pass:
            // an orientation event can arrive before the new metrics are
            // observable, so a current "scale 1" reading is not a safe reason to
            // skip the post-transition synchronization.
            if (avoidanceCouldChange()) recompute();
            window.clearTimeout(viewportSettleTimer);
            viewportSettleTimer = window.setTimeout(recompute, VIEWPORT_SCALE_SETTLE_MS);
        };
        window.addEventListener('resize', handleViewportChange, { passive: true, signal: controller.signal });
        window.addEventListener('orientationchange', handleViewportChange, { passive: true, signal: controller.signal });
        window.visualViewport?.addEventListener('resize', handleViewportChange, { passive: true, signal: controller.signal });
        window.addEventListener('scroll', scheduleSettle, { passive: true, signal: controller.signal });
        // Entering/leaving fullscreen changes the avoidance rules this frame
        // (the puck may need to clear a now-fullscreen video, or return once it
        // exits), so it is never debounced.
        document.addEventListener('fullscreenchange', recompute, { signal: controller.signal });
        controller.signal.addEventListener('abort', () => {
            window.clearTimeout(settleTimer);
            window.clearTimeout(viewportSettleTimer);
            if (frame !== undefined) window.cancelAnimationFrame(frame);
        });
        recompute();
    }

    private installDragHandlers(button: HTMLButtonElement): void {
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;
        let puckBox: PuckBox | null = null;
        let pendingPosition: PuckPosition | null = null;
        let currentPosition: PuckPosition | null = null;
        let dragFrame: number | undefined;
        let dragFramePending = false;
        let dragPositionAnchored = false;
        let dragPageScale = 1;
        const cancelDragFrame = (): void => {
            if (dragFrame !== undefined) window.cancelAnimationFrame(dragFrame);
            dragFrame = undefined;
            dragFramePending = false;
        };
        const scheduleDragFrame = (position: PuckPosition): void => {
            pendingPosition = position;
            if (dragFramePending) return;
            dragFramePending = true;
            const frame = window.requestAnimationFrame(() => {
                dragFramePending = false;
                dragFrame = undefined;
                if (!dragging || !pendingPosition) return;
                currentPosition = pendingPosition;
                pendingPosition = null;
                applyPuckDragTransform(button, currentPosition.x - originX, currentPosition.y - originY);
            });
            dragFrame = dragFramePending ? frame : undefined;
        };
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            dragging = true;
            moved = false;
            button.dataset.jpdbReaderMoved = 'false';
            // Apply and consume one scale snapshot. Reading the environment
            // independently here used to let a stale inverse zoom and newly
            // settled pointer coordinates disagree after iPad rotation.
            dragPageScale = applyOverlayPageScale(button);
            const start = layoutPointToOverlay({ x: event.clientX, y: event.clientY }, dragPageScale);
            startX = start.x;
            startY = start.y;
            const rect = overlayPuckRect(button, dragPageScale);
            originX = rect.left;
            originY = rect.top;
            puckBox = { width: rect.width, height: rect.height };
            pendingPosition = null;
            currentPosition = { x: originX, y: originY };
            cancelDragFrame();
            dragPositionAnchored = false;
            button.setPointerCapture?.(event.pointerId);
        });
        button.addEventListener('pointermove', event => {
            if (!dragging || !puckBox) return;
            const pointer = layoutPointToOverlay({ x: event.clientX, y: event.clientY }, dragPageScale);
            const dx = pointer.x - startX;
            const dy = pointer.y - startY;
            if (Math.hypot(dx, dy) > 4) moved = true;
            if (!moved) return;
            event.preventDefault();
            if (button.dataset.jpdbReaderMoved !== 'true') button.dataset.jpdbReaderMoved = 'true';
            if (!dragPositionAnchored) {
                dragPositionAnchored = true;
                applyPuckPosition(button, originX, originY);
                resetPuckDragTransform(button);
                button.classList.add('jpdb-reader-fab-dragging');
            }
            const position = clampPuckToViewport(puckBox, originX + dx, originY + dy);
            if (!position) return;
            scheduleDragFrame(position);
        }, { passive: false });
        const finishDrag = (event: PointerEvent): void => {
            if (!dragging) return;
            dragging = false;
            button.classList.remove('jpdb-reader-fab-dragging');
            button.releasePointerCapture?.(event.pointerId);
            cancelDragFrame();
            if (pendingPosition) {
                currentPosition = pendingPosition;
                pendingPosition = null;
            }
            resetPuckDragTransform(button);
            if (!moved || !puckBox || !currentPosition) {
                puckBox = null;
                currentPosition = null;
                dragPositionAnchored = false;
                return;
            }
            const position = clampPuckToViewport(puckBox, currentPosition.x, currentPosition.y);
            puckBox = null;
            currentPosition = null;
            dragPositionAnchored = false;
            if (!position) return;
            applyPuckPosition(button, position.x, position.y);
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

function ocrModeLabel(language: ReaderSettings['interfaceLanguage'], mode: OcrInteractionMode): string {
    if (mode === 'auto') return uiText(language, 'puckOcrAuto');
    if (mode === 'manual') return uiText(language, 'puckOcrManual');
    return uiText(language, 'puckOcrOff');
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
    const rect = overlayPuckRect(button);
    const overlap = overlappingVideo(rect);
    button.classList.toggle('jpdb-reader-fab-over-video', Boolean(overlap));
    if (!overlap || !shouldMoveAwayFromVideo(button, overlap.video)) return;

    for (const position of nonOverlappingPuckPositions(rect, overlap.rect)) {
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

function overlayPuckRect(button: HTMLButtonElement, pageScale = overlayViewport().pageScale): DOMRect {
    return sourceRectToOverlay(button.getBoundingClientRect(), button, pageScale);
}

function overlappingVideo(rect: DOMRect): { video: HTMLVideoElement; rect: DOMRect } | undefined {
    const { pageScale } = overlayViewport();
    for (const video of visibleVideos()) {
        const videoRect = layoutRectToOverlay(video.getBoundingClientRect(), pageScale);
        if (intersects(rect, videoRect)) return { video, rect: videoRect };
    }
    return undefined;
}

function nonOverlappingPuckPositions(rect: DOMRect, videoRect: DOMRect): Array<{ x: number; y: number }> {
    const candidates = [
        { x: videoRect.right + 10, y: rect.top },
        { x: videoRect.left - rect.width - 10, y: rect.top },
        { x: rect.left, y: videoRect.bottom + 10 },
        { x: rect.left, y: videoRect.top - rect.height - 10 },
    ];
    return candidates
        .map(candidate => clampPuckToViewport(rect, candidate.x, candidate.y))
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
        const rect = overlayPuckRect(button);
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

function applyPuckDragTransform(button: HTMLButtonElement, dx: number, dy: number): void {
    button.style.setProperty('transform', `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`, 'important');
}

function resetPuckDragTransform(button: HTMLButtonElement): void {
    button.style.removeProperty('transform');
}

function clampPuck(button: HTMLButtonElement, x: number, y: number): { x: number; y: number } | null {
    const rect = overlayPuckRect(button);
    return clampPuckToViewport(rect, x, y);
}

function clampPuckToViewport(box: PuckBox, x: number, y: number): { x: number; y: number } | null {
    const margin = 8;
    const viewport = overlayViewport();
    if (!canClampPuck(box, x, y, margin, viewport)) return null;
    return {
        x: Math.max(margin, Math.min(viewport.width - box.width - margin, x)),
        y: Math.max(margin, Math.min(viewport.height - box.height - margin, y)),
    };
}

function canClampPuck(box: PuckBox, x: number, y: number, margin: number, viewport: { width: number; height: number }): boolean {
    if (!finitePuckPosition(x, y)) return false;
    if (!finiteViewport(viewport)) return false;
    if (!hasViewportRoom(viewport, margin)) return false;
    return hasVisiblePuckRect(box);
}

function finitePuckPosition(x: number, y: number): boolean {
    return Number.isFinite(x) && Number.isFinite(y);
}

function finiteViewport(viewport: { width: number; height: number }): boolean {
    return Number.isFinite(viewport.width) && Number.isFinite(viewport.height);
}

function hasViewportRoom(viewport: { width: number; height: number }, margin: number): boolean {
    return viewport.width > margin * 2 && viewport.height > margin * 2;
}

function hasVisiblePuckRect(box: PuckBox): boolean {
    return box.width > 0 && box.height > 0;
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
