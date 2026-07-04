import { DOODLE_COLOR_TOKENS } from '../theme/color-tokens';
import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import type { InterfaceLanguage } from '../app/types';

export type DoodlePoint = { x: number; y: number; pressure: number };
export type DoodleStroke = DoodlePoint[];

export interface KanjiDoodleOptions {
    onChange?: (strokes: DoodleStroke[]) => void;
    onClear?: () => void;
}

const log = Logger.scope('KanjiDoodle');

type KanjiDoodleRoot = HTMLElement & { __yomuKanjiDoodleCleanup?: () => void };

interface KanjiDoodleElements {
    stage: HTMLElement;
    canvas: HTMLCanvasElement;
    ghost: HTMLElement;
}

const PEN_MIN_DISTANCE = 0.0008;
const POINTER_MIN_DISTANCE = 0.0016;
// The ghost trace is a KanjiVG glyph (109-unit viewBox) stroked at 3 units;
// the brush matches that rendered width so drawn strokes sit flush on the trace.
const GHOST_VIEWBOX_UNITS = 109;
const GHOST_STROKE_UNITS = 3;
// Fallback when the ghost is hidden (rect collapses to 0): the newtab stage
// renders the glyph at min(82%, 220px) of the stage box.
const GHOST_FALLBACK_RATIO = 0.82;
const GHOST_FALLBACK_MAX_PX = 220;
const ACTIVE_DOODLE_CLASS = 'jpdb-reader-doodle-active';
const NATIVE_GESTURE_SUPPRESS_MS = 900;
export const KANJI_DOODLE_CLEAR_EVENT = 'yomu:kanji-doodle-clear';

export function installKanjiDoodle(popover: HTMLElement, getLanguage: () => InterfaceLanguage, options: KanjiDoodleOptions = {}): void {
    const root = popover as KanjiDoodleRoot;
    root.__yomuKanjiDoodleCleanup?.();
    delete root.__yomuKanjiDoodleCleanup;

    const elements = kanjiDoodleElements(popover);
    const clear = popover.querySelector<HTMLButtonElement>('[data-doodle-clear]');
    const trace = popover.querySelector<HTMLButtonElement>('[data-doodle-trace]');
    if (!elements) return;
    const { stage, canvas, ghost } = elements;

    let context: CanvasRenderingContext2D | null = null;
    try {
        context = canvas.getContext('2d');
    } catch (error) {
        log.warn('Kanji doodle install failed', { reason: '2d-context-error' }, error);
        return;
    }
    if (!context) {
        log.warn('Kanji doodle install failed', { reason: 'missing-2d-context' });
        return;
    }

    let dpr = 1;
    let drawing = false;
    let pointerId = -1;
    let pointerType = '';
    let traceVisible = !ghost.hidden && !stage.classList.contains('trace-hidden');
    let points: DoodlePoint[] = [];
    let strokes: DoodleStroke[] = [];
    let canvasRect = canvas.getBoundingClientRect();
    let suppressNativeGestureUntil = 0;
    let activeClassRemovalTimer = 0;
    const controller = new AbortController();
    const signal = controller.signal;

    const keepDoodleInteractionActive = (durationMs = NATIVE_GESTURE_SUPPRESS_MS): void => {
        suppressNativeGestureUntil = Math.max(suppressNativeGestureUntil, Date.now() + durationMs);
        document.documentElement.classList.add(ACTIVE_DOODLE_CLASS);
        if (activeClassRemovalTimer) {
            window.clearTimeout(activeClassRemovalTimer);
            activeClassRemovalTimer = 0;
        }
    };

    const shouldSuppressNativeGesture = (): boolean => drawing || Date.now() < suppressNativeGestureUntil;

    const releaseDoodleInteractionSoon = (): void => {
        if (activeClassRemovalTimer) window.clearTimeout(activeClassRemovalTimer);
        activeClassRemovalTimer = window.setTimeout(() => {
            activeClassRemovalTimer = 0;
            if (shouldSuppressNativeGesture()) {
                releaseDoodleInteractionSoon();
                return;
            }
            document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
        }, NATIVE_GESTURE_SUPPRESS_MS);
    };

    const suppressNativeGestureIfActive = (event: Event): void => {
        if (!shouldSuppressNativeGesture()) return;
        suppressNativeCanvasGesture(event);
    };

    const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(window.devicePixelRatio || 1, 1);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        canvasRect = canvas.getBoundingClientRect();
        measureGhost();
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            redraw();
        }
    };

    const toPoint = (event: PointerEvent): DoodlePoint => {
        return {
            x: Math.max(0, Math.min(1, (event.clientX - canvasRect.left) / Math.max(canvasRect.width, 1))),
            y: Math.max(0, Math.min(1, (event.clientY - canvasRect.top) / Math.max(canvasRect.height, 1))),
            pressure: Math.max(0.12, Math.min(1, event.pressure || 0.55)),
        };
    };

    let measuredGhostSize = 0;
    const measureGhost = (): void => {
        const svg = ghost.querySelector('svg');
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        if (size > 0) measuredGhostSize = size;
    };

    const ghostDisplaySize = (): number => {
        if (measuredGhostSize > 0) return measuredGhostSize;
        const stageSize = Math.min(canvasRect.width, canvasRect.height);
        return Math.min(stageSize * GHOST_FALLBACK_RATIO, GHOST_FALLBACK_MAX_PX);
    };

    const strokeWidth = (point?: DoodlePoint): number => {
        const base = Math.max(2.4, (GHOST_STROKE_UNITS / GHOST_VIEWBOX_UNITS) * ghostDisplaySize() * dpr);
        // Mouse reports a constant ~0.5 pressure (scale ≈ 1 → trace width);
        // a pen's real pressure modulates gently around it.
        return base * (0.78 + (point?.pressure ?? 0.5) * 0.44);
    };

    const setupStroke = (point?: DoodlePoint) => {
        context.strokeStyle = resolvedDoodleInk(stage);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = strokeWidth(point);
    };

    const drawStroke = (stroke: DoodlePoint[]) => {
        if (!stroke.length) return;
        if (stroke.length === 1) {
            drawPoint(stroke[0]);
            return;
        }
        if (typeof context.quadraticCurveTo === 'function') {
            drawSmoothedStroke(stroke);
            return;
        }
        for (let index = 1; index < stroke.length; index += 1) {
            drawSegment(stroke[index - 1], stroke[index]);
        }
    };

    // One smoothed path per stroke: each raw point becomes the control point of
    // a quadratic through segment midpoints, so sparse mouse samples render as
    // a continuous curve instead of a jagged polyline.
    const drawSmoothedStroke = (stroke: DoodlePoint[]) => {
        context.save();
        setupStroke(averagePressurePoint(stroke));
        context.beginPath();
        context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
        for (let index = 1; index < stroke.length - 1; index += 1) {
            const control = stroke[index];
            const next = stroke[index + 1];
            context.quadraticCurveTo(
                control.x * canvas.width,
                control.y * canvas.height,
                ((control.x + next.x) / 2) * canvas.width,
                ((control.y + next.y) / 2) * canvas.height,
            );
        }
        const last = stroke[stroke.length - 1];
        context.lineTo(last.x * canvas.width, last.y * canvas.height);
        context.stroke();
        context.restore();
    };

    const drawPoint = (point: DoodlePoint) => {
        context.save();
        setupStroke(point);
        context.beginPath();
        if (typeof context.arc === 'function' && typeof context.fill === 'function') {
            context.fillStyle = context.strokeStyle;
            context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(1.2, context.lineWidth / 2), 0, Math.PI * 2);
            context.fill();
        } else {
            const x = point.x * canvas.width;
            const y = point.y * canvas.height;
            context.moveTo(x, y);
            context.lineTo(x + Math.max(1, context.lineWidth / 2), y);
            context.stroke();
        }
        context.restore();
    };

    const drawSegment = (from: DoodlePoint, to: DoodlePoint) => {
        context.save();
        setupStroke(to);
        context.beginPath();
        context.moveTo(from.x * canvas.width, from.y * canvas.height);
        context.lineTo(to.x * canvas.width, to.y * canvas.height);
        context.stroke();
        context.restore();
    };

    const redraw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) drawStroke(stroke);
        drawStroke(points);
    };

    const appendPoint = (point: DoodlePoint): void => {
        const last = points.at(-1);
        const minDistance = pointerType === 'pen' ? PEN_MIN_DISTANCE : POINTER_MIN_DISTANCE;
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) return;
        points.push(point);
        // Full redraw keeps the live stroke on the smoothed-curve path; the
        // canvas is small enough that this is cheap even per coalesced sample.
        if (typeof context.quadraticCurveTo === 'function') redraw();
        else if (last) drawSegment(last, point);
        else drawPoint(point);
    };

    const applyPointerSamples = (event: PointerEvent): void => {
        for (const sample of pointerSamples(event)) appendPoint(toPoint(sample));
    };

    const start = (event: PointerEvent) => {
        const computedCanvas = getComputedStyle(canvas);
        if (computedCanvas.pointerEvents === 'none' || computedCanvas.visibility === 'hidden') return;
        if (drawing) {
            if (event.pointerId === pointerId) return;
            finishStroke(false);
        }
        event.preventDefault();
        event.stopPropagation();
        drawing = true;
        pointerId = event.pointerId;
        pointerType = event.pointerType;
        keepDoodleInteractionActive();
        clearSelection();
        canvasRect = canvas.getBoundingClientRect();
        points = [];
        appendPoint(toPoint(event));
        setDoodlePointerCapture(canvas, event.pointerId);
    };

    const move = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        keepDoodleInteractionActive();
        applyPointerSamples(event);
    };

    const end = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        applyPointerSamples(event);
        finishStroke();
    };

    const finishAfterLostCapture = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        // WebKit can drop Pencil pointer capture while document/window
        // pointermove events continue; ending here turns live strokes into dots.
        keepDoodleInteractionActive();
    };

    const clearActiveSelection = () => {
        if (shouldSuppressNativeGesture()) clearSelection();
    };

    const finishStroke = (releaseCapture = true) => {
        if (points.length) strokes = [...strokes, points];
        points = [];
        drawing = false;
        const activePointerId = pointerId;
        pointerId = -1;
        pointerType = '';
        if (releaseCapture) releaseDoodlePointerCapture(canvas, activePointerId);
        keepDoodleInteractionActive();
        releaseDoodleInteractionSoon();
        clearSelection();
        options.onChange?.(strokes.map(stroke => [...stroke]));
    };

    const clearDoodle = (): void => {
        strokes = [];
        points = [];
        redraw();
        options.onClear?.();
        options.onChange?.([]);
    };

    canvas.addEventListener('pointerdown', start, { passive: false, signal });
    canvas.addEventListener('lostpointercapture', finishAfterLostCapture, { signal });
    document.addEventListener('pointermove', move, { passive: false, signal });
    document.addEventListener('pointerup', end, { passive: false, signal });
    document.addEventListener('pointercancel', end, { passive: false, signal });
    window.addEventListener('pointermove', move, { passive: false, signal });
    window.addEventListener('pointerup', end, { passive: false, signal });
    window.addEventListener('pointercancel', end, { passive: false, signal });
    document.addEventListener('selectionchange', clearActiveSelection, { signal });
    document.addEventListener('contextmenu', suppressNativeGestureIfActive, { capture: true, signal });
    document.addEventListener('selectstart', suppressNativeGestureIfActive, { capture: true, signal });
    document.addEventListener('dragstart', suppressNativeGestureIfActive, { capture: true, signal });
    window.addEventListener('contextmenu', suppressNativeGestureIfActive, { capture: true, signal });
    window.addEventListener('selectstart', suppressNativeGestureIfActive, { capture: true, signal });
    window.addEventListener('dragstart', suppressNativeGestureIfActive, { capture: true, signal });
    popover.addEventListener(KANJI_DOODLE_CLEAR_EVENT, clearDoodle, { signal });
    for (const target of [stage, canvas, clear, trace]) {
        if (!target) continue;
        target.addEventListener('contextmenu', suppressNativeCanvasGesture, { signal });
        target.addEventListener('selectstart', suppressNativeCanvasGesture, { signal });
        target.addEventListener('dragstart', suppressNativeCanvasGesture, { signal });
    }
    clear?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        clearDoodle();
    }, { signal });
    trace?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        traceVisible = !traceVisible;
        ghost.hidden = !traceVisible;
        stage.classList.toggle('trace-hidden', !traceVisible);
        trace.textContent = uiText(getLanguage(), traceVisible ? 'hideTrace' : 'showTrace');
        if (traceVisible) {
            measureGhost();
            redraw();
        }
    }, { signal });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    root.__yomuKanjiDoodleCleanup = () => {
        controller.abort();
        resizeObserver.disconnect();
        if (activeClassRemovalTimer) window.clearTimeout(activeClassRemovalTimer);
        document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
        clearSelection();
        if (root.__yomuKanjiDoodleCleanup) delete root.__yomuKanjiDoodleCleanup;
    };
    const disconnectWhenDetached = () => {
        if (!popover.isConnected) {
            root.__yomuKanjiDoodleCleanup?.();
            return;
        }
        requestAnimationFrame(disconnectWhenDetached);
    };
    requestAnimationFrame(resize);
    requestAnimationFrame(disconnectWhenDetached);
}

function suppressNativeCanvasGesture(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
}

function averagePressurePoint(stroke: DoodlePoint[]): DoodlePoint {
    const pressure = stroke.reduce((sum, point) => sum + point.pressure, 0) / stroke.length;
    return { ...stroke[stroke.length - 1], pressure };
}

function pointerSamples(event: PointerEvent): PointerEvent[] {
    const coalesced = safeCoalescedPointerEvents(event);
    if (!coalesced.length) return [event];
    const last = coalesced.at(-1);
    return last && samePointerPosition(last, event) ? coalesced : [...coalesced, event];
}

function safeCoalescedPointerEvents(event: PointerEvent): PointerEvent[] {
    try {
        return typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    } catch {
        return [];
    }
}

function samePointerPosition(a: PointerEvent, b: PointerEvent): boolean {
    return a.clientX === b.clientX && a.clientY === b.clientY && a.pressure === b.pressure;
}

function setDoodlePointerCapture(canvas: HTMLCanvasElement, activePointerId: number): void {
    try {
        canvas.setPointerCapture?.(activePointerId);
    } catch {
        // iPad Safari can expose pointer events without reliable capture.
    }
}

function releaseDoodlePointerCapture(canvas: HTMLCanvasElement, activePointerId: number): void {
    try {
        canvas.releasePointerCapture?.(activePointerId);
    } catch {
        // Capture may already be gone if Safari cancelled or retargeted the Pencil gesture.
    }
}

function clearSelection(): void {
    const selection = document.getSelection?.();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
}

function resolvedDoodleInk(stage: HTMLElement): string {
    const ink = getComputedStyle(stage).getPropertyValue('--jpdb-reader-doodle-ink').trim();
    return ink && !ink.startsWith('var(') ? ink : DOODLE_COLOR_TOKENS.ink;
}

function kanjiDoodleElements(popover: HTMLElement): KanjiDoodleElements | null {
    const stage = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-stage');
    const canvas = popover.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
    const ghost = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
    if (stage && canvas && ghost) return { stage, canvas, ghost };
    return null;
}
