import { uiText } from './i18n';
import { Logger } from './logger';
import type { InterfaceLanguage } from './types';

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
const POINTER_MIN_DISTANCE = 0.0035;
const ACTIVE_DOODLE_CLASS = 'jpdb-reader-doodle-active';

export function installKanjiDoodle(popover: HTMLElement, getLanguage: () => InterfaceLanguage, options: KanjiDoodleOptions = {}): void {
    const root = popover as KanjiDoodleRoot;
    root.__yomuKanjiDoodleCleanup?.();
    delete root.__yomuKanjiDoodleCleanup;

    const elements = kanjiDoodleElements(popover);
    const clear = popover.querySelector<HTMLButtonElement>('[data-doodle-clear]');
    const trace = popover.querySelector<HTMLButtonElement>('[data-doodle-trace]');
    if (!elements) return;
    const { stage, canvas, ghost } = elements;

    const context = canvas.getContext('2d');
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
    const controller = new AbortController();
    const signal = controller.signal;

    const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(window.devicePixelRatio || 1, 1);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        canvasRect = canvas.getBoundingClientRect();
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

    const strokeWidth = (point?: DoodlePoint): number => (
        Math.max(3.2, Math.min(9.5, canvas.width * 0.014)) * dpr * (0.78 + (point?.pressure ?? 0.55) * 0.42)
    );

    const setupStroke = (point?: DoodlePoint) => {
        const style = getComputedStyle(stage);
        context.strokeStyle = style.getPropertyValue('--jpdb-reader-doodle-ink').trim()
            || '#141820';
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
        for (let index = 1; index < stroke.length; index += 1) {
            drawSegment(stroke[index - 1], stroke[index]);
        }
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
        if (last) drawSegment(last, point);
        else drawPoint(point);
    };

    const applyPointerSamples = (event: PointerEvent): void => {
        for (const sample of pointerSamples(event)) appendPoint(toPoint(sample));
    };

    const start = (event: PointerEvent) => {
        const computedCanvas = getComputedStyle(canvas);
        if (computedCanvas.pointerEvents === 'none' || computedCanvas.visibility === 'hidden') return;
        if (drawing) return;
        event.preventDefault();
        event.stopPropagation();
        drawing = true;
        pointerId = event.pointerId;
        pointerType = event.pointerType;
        document.documentElement.classList.add(ACTIVE_DOODLE_CLASS);
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
        finishStroke(false);
    };

    const clearActiveSelection = () => {
        if (drawing) clearSelection();
    };

    const finishStroke = (releaseCapture = true) => {
        if (points.length) strokes = [...strokes, points];
        points = [];
        drawing = false;
        const activePointerId = pointerId;
        pointerId = -1;
        pointerType = '';
        if (releaseCapture) releaseDoodlePointerCapture(canvas, activePointerId);
        document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
        clearSelection();
        options.onChange?.(strokes.map(stroke => [...stroke]));
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
    for (const target of [stage, canvas, clear, trace]) {
        if (!target) continue;
        target.addEventListener('contextmenu', suppressNativeCanvasGesture, { signal });
        target.addEventListener('selectstart', suppressNativeCanvasGesture, { signal });
        target.addEventListener('dragstart', suppressNativeCanvasGesture, { signal });
    }
    clear?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        strokes = [];
        points = [];
        redraw();
        options.onClear?.();
        options.onChange?.([]);
    }, { signal });
    trace?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        traceVisible = !traceVisible;
        ghost.hidden = !traceVisible;
        stage.classList.toggle('trace-hidden', !traceVisible);
        trace.textContent = uiText(getLanguage(), traceVisible ? 'hideTrace' : 'showTrace');
    }, { signal });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    root.__yomuKanjiDoodleCleanup = () => {
        controller.abort();
        resizeObserver.disconnect();
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

function kanjiDoodleElements(popover: HTMLElement): KanjiDoodleElements | null {
    const stage = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-stage');
    const canvas = popover.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
    const ghost = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
    if (stage && canvas && ghost) return { stage, canvas, ghost };
    return null;
}
