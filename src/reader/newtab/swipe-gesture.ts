import type { JPDBGrade } from '../types';
import { eventTargetElement } from '../dom-target';

export type NewTabSwipeDirection = 'left' | 'right';
export type NewTabSwipeAction = 'again' | 'good';

export interface NewTabSwipeProgress {
    action: NewTabSwipeAction | null;
    deltaX: number;
    deltaY: number;
    direction: NewTabSwipeDirection | null;
    progress: number;
}

export interface NewTabSwipeGestureOptions {
    root: HTMLElement;
    target: HTMLElement | (() => HTMLElement | null);
    signal?: AbortSignal;
    thresholdPx?: number;
    maxProgressPx?: number;
    shouldStart?: (target: HTMLElement, event: Event) => boolean;
    onProgress?: (progress: NewTabSwipeProgress) => void;
    onSwipe: (action: NewTabSwipeAction, direction: NewTabSwipeDirection) => void;
}

interface NewTabSwipeGradeOptions {
    twoButtonReviews: boolean;
}

interface SwipePoint {
    id: number;
    x: number;
    y: number;
}

interface SwipeStyleSnapshot {
    cardAction: string | null;
    cardDirection: string | null;
    cardOpacity: string;
    cardProgress: string;
    cardTransition: string;
    cardTransform: string;
    cardX: string;
    rootAction: string | null;
    rootDirection: string | null;
    rootProgress: string;
    rootX: string;
}

interface SwipeDrag {
    id: number;
    card: HTMLElement;
    startX: number;
    startY: number;
    dragging: boolean;
    snapshot: SwipeStyleSnapshot;
}

const DEFAULT_THRESHOLD_PX = 96;
const DEFAULT_MAX_PROGRESS_PX = 144;
const START_SLOP_PX = 8;
const MAX_ROTATION_DEG = 14;
const SNAPBACK_MS = 160;
const COMMIT_MS = 180;
const SWIPE_PROGRESS_PROPERTY = '--jpdb-reader-newtab-swipe-progress';
const SWIPE_X_PROPERTY = '--jpdb-reader-newtab-swipe-x';
const SWIPE_BLOCK_SELECTOR = [
    '.jpdb-reader-word',
    '[data-action]',
    '[data-immersion-action]',
    '[data-newtab-action]',
    '[data-newtab-swipe-ignore]',
    'a',
    'audio',
    'button',
    'canvas',
    'details',
    'form',
    'input',
    'select',
    'summary',
    'textarea',
    'video',
    '[contenteditable="true"]',
].join(',');

export function installNewTabSwipeGesture(options: NewTabSwipeGestureOptions): () => void {
    if (options.signal?.aborted) return () => undefined;

    const controller = new AbortController();
    const signal = controller.signal;
    options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    let drag: SwipeDrag | null = null;
    let resetTimer = 0;
    let suppressNextClick = false;

    const clearResetTimer = (): void => {
        if (!resetTimer) return;
        window.clearTimeout(resetTimer);
        resetTimer = 0;
    };

    const startDrag = (event: Event, point: SwipePoint): void => {
        if (drag) return;
        const target = eventTargetElement(event.target);
        const card = resolveSwipeTarget(options.target);
        if (!target || !card || !options.root.contains(card) || !card.contains(target)) return;
        if (isSwipeBlockedTarget(target, card)) return;
        if (options.shouldStart && !options.shouldStart(target, event)) return;

        clearResetTimer();
        drag = {
            id: point.id,
            card,
            startX: point.x,
            startY: point.y,
            dragging: false,
            snapshot: snapshotSwipeStyles(options.root, card),
        };
        card.style.transition = 'none';
    };

    const updateDrag = (event: Event, point: SwipePoint): void => {
        if (!drag || drag.id !== point.id) return;
        const deltaX = point.x - drag.startX;
        const deltaY = point.y - drag.startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (!drag.dragging) {
            if (absX < START_SLOP_PX && absY < START_SLOP_PX) return;
            if (absY > absX) {
                restoreSwipeStyles(options.root, drag.card, drag.snapshot);
                drag = null;
                return;
            }
            drag.dragging = true;
        }

        event.preventDefault();
        event.stopPropagation();
        const progress = swipeProgress(deltaX, deltaY, options);
        applySwipeFrame(options.root, drag.card, progress);
        options.onProgress?.(progress);
    };

    const finishDrag = (event: Event, point: SwipePoint | null): void => {
        if (!drag || (point && drag.id !== point.id)) return;
        const currentDrag = drag;
        drag = null;

        const deltaX = point ? point.x - currentDrag.startX : 0;
        const deltaY = point ? point.y - currentDrag.startY : 0;
        const progress = swipeProgress(deltaX, deltaY, options);
        if (!currentDrag.dragging) {
            restoreSwipeStyles(options.root, currentDrag.card, currentDrag.snapshot);
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        suppressNextClick = true;

        const direction = progress.direction;
        if (direction && progress.progress >= 1) {
            resetTimer = commitSwipe(options.root, currentDrag.card, currentDrag.snapshot, progress, options, () => {
                options.onSwipe(newTabSwipeActionFromDirection(direction), direction);
            });
            return;
        }

        resetTimer = resetSwipeFrame(options.root, currentDrag.card, currentDrag.snapshot, options, SNAPBACK_MS);
    };

    const cancelDrag = (): void => {
        if (!drag) return;
        const currentDrag = drag;
        drag = null;
        if (currentDrag.dragging) {
            resetTimer = resetSwipeFrame(options.root, currentDrag.card, currentDrag.snapshot, options, SNAPBACK_MS);
            return;
        }
        restoreSwipeStyles(options.root, currentDrag.card, currentDrag.snapshot);
    };

    const consumeSuppressedClick = (event: MouseEvent): void => {
        if (!suppressNextClick) return;
        suppressNextClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    options.root.addEventListener('click', consumeSuppressedClick, { capture: true, signal });

    if (typeof PointerEvent !== 'undefined') {
        options.root.addEventListener('pointerdown', event => {
            if (!isPrimaryPointerDown(event)) return;
            startDrag(event, { id: event.pointerId, x: event.clientX, y: event.clientY });
        }, { signal });
        window.addEventListener('pointermove', event => updateDrag(event, { id: event.pointerId, x: event.clientX, y: event.clientY }), { signal });
        window.addEventListener('pointerup', event => finishDrag(event, { id: event.pointerId, x: event.clientX, y: event.clientY }), { signal });
        window.addEventListener('pointercancel', cancelDrag, { signal });
    } else {
        options.root.addEventListener('touchstart', event => {
            if (event.touches.length !== 1) return;
            const point = touchPoint(event.touches[0]);
            if (point) startDrag(event, point);
        }, { signal });
        window.addEventListener('touchmove', event => {
            const point = activeTouchPoint(event.changedTouches, drag?.id);
            if (point) updateDrag(event, point);
        }, { passive: false, signal });
        window.addEventListener('touchend', event => finishDrag(event, activeTouchPoint(event.changedTouches, drag?.id)), { signal });
        window.addEventListener('touchcancel', cancelDrag, { signal });
    }

    signal.addEventListener('abort', () => {
        clearResetTimer();
        cancelDrag();
    }, { once: true });

    return () => controller.abort();
}

export function newTabSwipeActionFromDirection(direction: NewTabSwipeDirection): NewTabSwipeAction {
    return direction === 'left' ? 'again' : 'good';
}

export function newTabSwipeGrade(action: NewTabSwipeAction, options: NewTabSwipeGradeOptions): JPDBGrade {
    if (action === 'again') return options.twoButtonReviews ? 'fail' : 'nothing';
    return options.twoButtonReviews ? 'pass' : 'okay';
}

function isPrimaryPointerDown(event: PointerEvent): boolean {
    return event.button === 0 && event.isPrimary !== false;
}

function resolveSwipeTarget(target: NewTabSwipeGestureOptions['target']): HTMLElement | null {
    return typeof target === 'function' ? target() : target;
}

function isSwipeBlockedTarget(target: HTMLElement, card: HTMLElement): boolean {
    const blocked = target.closest<HTMLElement>(SWIPE_BLOCK_SELECTOR);
    return Boolean(blocked && card.contains(blocked));
}

function swipeProgress(deltaX: number, deltaY: number, options: NewTabSwipeGestureOptions): NewTabSwipeProgress {
    const direction = swipeDirection(deltaX);
    const action = direction ? newTabSwipeActionFromDirection(direction) : null;
    const maxProgressPx = Math.max(options.maxProgressPx ?? DEFAULT_MAX_PROGRESS_PX, 1);
    const thresholdPx = Math.max(options.thresholdPx ?? DEFAULT_THRESHOLD_PX, 1);
    return {
        action,
        deltaX,
        deltaY,
        direction,
        progress: Math.min(Math.abs(deltaX) / Math.min(maxProgressPx, thresholdPx), 1),
    };
}

function swipeDirection(deltaX: number): NewTabSwipeDirection | null {
    if (deltaX < 0) return 'left';
    if (deltaX > 0) return 'right';
    return null;
}

function applySwipeFrame(root: HTMLElement, card: HTMLElement, progress: NewTabSwipeProgress): void {
    const rotation = clamp(progress.deltaX / 12, -MAX_ROTATION_DEG, MAX_ROTATION_DEG);
    card.style.transform = `translate3d(${progress.deltaX}px, ${progress.deltaY * 0.24}px, 0) rotate(${rotation}deg)`;
    setSwipeExposure(root, card, progress);
}

function commitSwipe(
    root: HTMLElement,
    card: HTMLElement,
    snapshot: SwipeStyleSnapshot,
    progress: NewTabSwipeProgress,
    options: NewTabSwipeGestureOptions,
    onCommit: () => void,
): number {
    const directionSign = progress.deltaX < 0 ? -1 : 1;
    const rootWidth = Math.max(root.getBoundingClientRect().width, window.innerWidth, 320);
    const exitX = directionSign * rootWidth * 1.2;
    card.style.transition = `transform ${COMMIT_MS}ms ease, opacity ${COMMIT_MS}ms ease`;
    card.style.transform = `translate3d(${exitX}px, ${progress.deltaY * 0.24}px, 0) rotate(${directionSign * MAX_ROTATION_DEG}deg)`;
    card.style.opacity = '0.35';
    setSwipeExposure(root, card, progress);
    options.onProgress?.(progress);
    onCommit();
    return window.setTimeout(() => restoreSwipeStyles(root, card, snapshot), COMMIT_MS);
}

function resetSwipeFrame(
    root: HTMLElement,
    card: HTMLElement,
    snapshot: SwipeStyleSnapshot,
    options: NewTabSwipeGestureOptions,
    durationMs: number,
): number {
    card.style.transition = `transform ${durationMs}ms ease, opacity ${durationMs}ms ease`;
    card.style.transform = snapshot.cardTransform;
    card.style.opacity = snapshot.cardOpacity;
    setSwipeExposure(root, card, {
        action: null,
        deltaX: 0,
        deltaY: 0,
        direction: null,
        progress: 0,
    });
    options.onProgress?.({
        action: null,
        deltaX: 0,
        deltaY: 0,
        direction: null,
        progress: 0,
    });
    return window.setTimeout(() => restoreSwipeStyles(root, card, snapshot), durationMs);
}

function setSwipeExposure(root: HTMLElement, card: HTMLElement, progress: NewTabSwipeProgress): void {
    setOptionalData(root, 'newtabSwipeDirection', progress.direction);
    setOptionalData(root, 'newtabSwipeAction', progress.action);
    setOptionalData(card, 'newtabSwipeDirection', progress.direction);
    setOptionalData(card, 'newtabSwipeAction', progress.action);
    root.style.setProperty(SWIPE_PROGRESS_PROPERTY, String(progress.progress));
    root.style.setProperty(SWIPE_X_PROPERTY, `${progress.deltaX}px`);
    card.style.setProperty(SWIPE_PROGRESS_PROPERTY, String(progress.progress));
    card.style.setProperty(SWIPE_X_PROPERTY, `${progress.deltaX}px`);
}

function setOptionalData(element: HTMLElement, key: string, value: string | null): void {
    if (value) element.dataset[key] = value;
    else delete element.dataset[key];
}

function snapshotSwipeStyles(root: HTMLElement, card: HTMLElement): SwipeStyleSnapshot {
    return {
        cardAction: card.getAttribute('data-newtab-swipe-action'),
        cardDirection: card.getAttribute('data-newtab-swipe-direction'),
        cardOpacity: card.style.opacity,
        cardProgress: card.style.getPropertyValue(SWIPE_PROGRESS_PROPERTY),
        cardTransition: card.style.transition,
        cardTransform: card.style.transform,
        cardX: card.style.getPropertyValue(SWIPE_X_PROPERTY),
        rootAction: root.getAttribute('data-newtab-swipe-action'),
        rootDirection: root.getAttribute('data-newtab-swipe-direction'),
        rootProgress: root.style.getPropertyValue(SWIPE_PROGRESS_PROPERTY),
        rootX: root.style.getPropertyValue(SWIPE_X_PROPERTY),
    };
}

function restoreSwipeStyles(root: HTMLElement, card: HTMLElement, snapshot: SwipeStyleSnapshot): void {
    restoreOptionalAttribute(root, 'data-newtab-swipe-action', snapshot.rootAction);
    restoreOptionalAttribute(root, 'data-newtab-swipe-direction', snapshot.rootDirection);
    restoreOptionalAttribute(card, 'data-newtab-swipe-action', snapshot.cardAction);
    restoreOptionalAttribute(card, 'data-newtab-swipe-direction', snapshot.cardDirection);
    restoreStyleProperty(root, SWIPE_PROGRESS_PROPERTY, snapshot.rootProgress);
    restoreStyleProperty(root, SWIPE_X_PROPERTY, snapshot.rootX);
    restoreStyleProperty(card, SWIPE_PROGRESS_PROPERTY, snapshot.cardProgress);
    restoreStyleProperty(card, SWIPE_X_PROPERTY, snapshot.cardX);
    card.style.opacity = snapshot.cardOpacity;
    card.style.transition = snapshot.cardTransition;
    card.style.transform = snapshot.cardTransform;
}

function restoreOptionalAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
}

function restoreStyleProperty(element: HTMLElement, name: string, value: string): void {
    if (value) element.style.setProperty(name, value);
    else element.style.removeProperty(name);
}

function touchPoint(touch: Touch | undefined): SwipePoint | null {
    if (!touch) return null;
    return { id: touch.identifier, x: touch.clientX, y: touch.clientY };
}

function activeTouchPoint(touches: TouchList, activeId: number | undefined): SwipePoint | null {
    if (activeId === undefined) return null;
    for (const touch of Array.from(touches)) {
        if (touch.identifier === activeId) return touchPoint(touch);
    }
    return null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
}
