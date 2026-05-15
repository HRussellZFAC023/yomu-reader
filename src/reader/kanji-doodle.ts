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
    let traceVisible = !ghost.hidden && !stage.classList.contains('trace-hidden');
    let points: DoodlePoint[] = [];
    let strokes: DoodleStroke[] = [];
    let canvasRect = canvas.getBoundingClientRect();
    const controller = new AbortController();
    const signal = controller.signal;

    const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        canvasRect = canvas.getBoundingClientRect();
        redraw();
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
        for (let index = 1; index < stroke.length; index += 1) {
            drawSegment(stroke[index - 1], stroke[index]);
        }
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

    const start = (event: PointerEvent) => {
        const computedCanvas = getComputedStyle(canvas);
        if (computedCanvas.pointerEvents === 'none' || computedCanvas.visibility === 'hidden') return;
        event.preventDefault();
        event.stopPropagation();
        drawing = true;
        pointerId = event.pointerId;
        canvasRect = canvas.getBoundingClientRect();
        points = [toPoint(event)];
        canvas.setPointerCapture?.(event.pointerId);
    };

    const move = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const point = toPoint(event);
        const last = points.at(-1);
        const minDistance = event.pointerType === 'pen' ? 0.0015 : 0.0035;
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minDistance) {
            points.push(point);
            if (last) drawSegment(last, point);
        }
    };

    const end = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        if (points.length) strokes = [...strokes, points];
        points = [];
        drawing = false;
        pointerId = -1;
        canvas.releasePointerCapture?.(event.pointerId);
        options.onChange?.(strokes.map(stroke => [...stroke]));
    };

    canvas.addEventListener('pointerdown', start, { passive: false, signal });
    canvas.addEventListener('pointermove', move, { passive: false, signal });
    canvas.addEventListener('pointerup', end, { passive: false, signal });
    canvas.addEventListener('pointercancel', end, { passive: false, signal });
    for (const target of [stage, canvas]) {
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
}

function kanjiDoodleElements(popover: HTMLElement): KanjiDoodleElements | null {
    const stage = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-stage');
    const canvas = popover.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
    const ghost = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
    if (stage && canvas && ghost) return { stage, canvas, ghost };
    return null;
}
