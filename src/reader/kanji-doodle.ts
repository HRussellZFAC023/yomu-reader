import { uiText } from './i18n';
import type { InterfaceLanguage } from './types';

type DoodlePoint = { x: number; y: number; pressure: number };

export function installKanjiDoodle(popover: HTMLElement, getLanguage: () => InterfaceLanguage): void {
    const stage = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-stage');
    const canvas = popover.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
    const ghost = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
    const clear = popover.querySelector<HTMLButtonElement>('[data-doodle-clear]');
    const trace = popover.querySelector<HTMLButtonElement>('[data-doodle-trace]');
    if (!stage || !canvas || !ghost) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let dpr = 1;
    let drawing = false;
    let pointerId = -1;
    let traceVisible = true;
    let points: DoodlePoint[] = [];
    let strokes: DoodlePoint[][] = [];

    const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        redraw();
    };

    const toPoint = (event: PointerEvent): DoodlePoint => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1))),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1))),
            pressure: Math.max(0.12, Math.min(1, event.pressure || 0.55)),
        };
    };

    const drawStroke = (stroke: DoodlePoint[]) => {
        if (!stroke.length) return;
        context.save();
        context.strokeStyle = '#141820';
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        stroke.forEach((point, index) => {
            const x = point.x * canvas.width;
            const y = point.y * canvas.height;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        });
        const lastPoint = stroke[stroke.length - 1];
        const width = Math.max(3.2, Math.min(9.5, canvas.width * 0.014)) * dpr * (0.78 + (lastPoint?.pressure ?? 0.55) * 0.42);
        context.lineWidth = width;
        context.stroke();
        context.restore();
    };

    const redraw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) drawStroke(stroke);
        drawStroke(points);
    };

    const start = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        drawing = true;
        pointerId = event.pointerId;
        points = [toPoint(event)];
        canvas.setPointerCapture?.(event.pointerId);
        redraw();
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
            redraw();
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
        redraw();
    };

    canvas.addEventListener('pointerdown', start, { passive: false });
    canvas.addEventListener('pointermove', move, { passive: false });
    canvas.addEventListener('pointerup', end, { passive: false });
    canvas.addEventListener('pointercancel', end, { passive: false });
    clear?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        strokes = [];
        points = [];
        redraw();
    });
    trace?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        traceVisible = !traceVisible;
        ghost.hidden = !traceVisible;
        stage.classList.toggle('trace-hidden', !traceVisible);
        trace.textContent = uiText(getLanguage(), traceVisible ? 'hideTrace' : 'showTrace');
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    const disconnectWhenDetached = () => {
        if (!popover.isConnected) {
            resizeObserver.disconnect();
            return;
        }
        requestAnimationFrame(disconnectWhenDetached);
    };
    requestAnimationFrame(resize);
    requestAnimationFrame(disconnectWhenDetached);
}
