import { setInnerHtml } from './dom';
import { assessKanjiStrokes, type KanjiStrokeAssessment } from './kanji-stroke-grader';
import { gmStorageSetSync } from './storage';

export interface DoodleState {
    resizeObserver?: ResizeObserver;
    cleanup: Array<() => void>;
}

export type DoodleRoot = HTMLElement & { __yomuDoodle?: DoodleState };

export interface DoodleInstallOptions {
    storageKey: string;
    loadGhostSvg: (glyph: string) => Promise<string>;
    autograde?: boolean;
}

export interface DoodlePoint {
    x: number;
    y: number;
    pressure: number;
}

export type DoodleStroke = DoodlePoint[];

export function findDoodleCanvasMount(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.result.kanji > .vbox')
        ?? document.querySelector<HTMLElement>('.answer-box')
        ?? document.querySelector<HTMLElement>('.bugfix');
}

export function findDoodlePreviewMount(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.result.kanji a.kanji.plain')
        ?? document.querySelector<HTMLElement>('.answer-box .kanji, .answer-box .plain')
        ?? document.querySelector<HTMLElement>('.result.kanji .hbox')
        ?? document.querySelector<HTMLElement>('.hbox')
        ?? document.querySelector<HTMLElement>('.answer-box');
}

export function installDoodle(root: HTMLElement, glyph: string, options: DoodleInstallOptions): void {
    const stage = root.querySelector<HTMLElement>('.yomu-doodle-stage');
    const canvas = root.querySelector<HTMLCanvasElement>('.yomu-doodle-canvas');
    const ghost = root.querySelector<HTMLElement>('.yomu-doodle-ghost');
    const result = root.querySelector<HTMLElement>('[data-doodle-result]');
    if (!stage || !canvas || !ghost) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let drawing = false;
    let pointerId = -1;
    let strokes: DoodleStroke[] = [];
    let current: DoodleStroke = [];
    let expectedStrokes = 0;
    let canvasRect = canvas.getBoundingClientRect();
    let strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-text') || '#111';
    const cleanup: Array<() => void> = [];
    const add = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, listener: (event: HTMLElementEventMap[K]) => void, addOptions?: AddEventListenerOptions) => {
        target.addEventListener(type, listener as EventListener, addOptions);
        cleanup.push(() => target.removeEventListener(type, listener as EventListener, addOptions));
    };

    const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        canvasRect = canvas.getBoundingClientRect();
        redraw();
    };

    const point = (event: PointerEvent): DoodlePoint => {
        return {
            x: Math.max(0, Math.min(1, (event.clientX - canvasRect.left) / Math.max(1, canvasRect.width))),
            y: Math.max(0, Math.min(1, (event.clientY - canvasRect.top) / Math.max(1, canvasRect.height))),
            pressure: Math.max(0.15, Math.min(1, event.pressure || 0.55)),
        };
    };

    const lineWidth = (point?: DoodlePoint): number => (
        Math.max(4, Math.min(12, canvas.width * 0.018)) * (0.75 + (point?.pressure ?? 0.55) * 0.35)
    );

    const setupStroke = (point?: DoodlePoint) => {
        context.strokeStyle = strokeStyle;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = lineWidth(point);
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
        drawStroke(current);
    };

    const renderAssessment = () => {
        if (!options.autograde || !result) return;
        const drawableStrokes = strokes.filter(stroke => stroke.length > 1);
        if (!drawableStrokes.length || expectedStrokes <= 0) {
            clearAssessment();
            return;
        }
        const assessment = assessKanjiStrokes(strokes, expectedStrokes);
        root.classList.toggle('yomu-doodle-pass', assessment.passed);
        root.classList.toggle('yomu-doodle-fail', !assessment.passed);
        result.textContent = formatAssessment(assessment);
    };

    const clearAssessment = () => {
        root.classList.remove('yomu-doodle-pass', 'yomu-doodle-fail');
        if (result) result.textContent = '';
    };

    const save = () => {
        try {
            gmStorageSetSync(options.storageKey, canvas.toDataURL('image/png'));
        } catch {
            // Storage can be blocked in strict profiles.
        }
    };

    add(canvas, 'pointerdown', event => {
        event.preventDefault();
        drawing = true;
        pointerId = event.pointerId;
        canvasRect = canvas.getBoundingClientRect();
        strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-text') || '#111';
        current = [point(event)];
        try {
            canvas.setPointerCapture?.(event.pointerId);
        } catch {
            // Some browsers only allow capture for trusted pointer streams.
        }
    }, { passive: false });
    add(canvas, 'pointermove', event => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        const next = point(event);
        const last = current[current.length - 1];
        if (!last || Math.hypot(next.x - last.x, next.y - last.y) > 0.0025) {
            current.push(next);
            if (last) drawSegment(last, next);
        }
    }, { passive: false });
    const finish = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        if (current.length) strokes = [...strokes, current];
        current = [];
        drawing = false;
        pointerId = -1;
        try {
            canvas.releasePointerCapture?.(event.pointerId);
        } catch {
            // The pointer might already be released after stylus/browser handoff.
        }
        save();
        renderAssessment();
    };
    add(canvas, 'pointerup', finish, { passive: false });
    add(canvas, 'pointercancel', finish, { passive: false });
    add(canvas, 'lostpointercapture', finish, { passive: false });
    add(window, 'pointerup', finish, { passive: false });
    add(window, 'pointercancel', finish, { passive: false });
    root.querySelector<HTMLButtonElement>('[data-doodle-clear]')?.addEventListener('click', event => {
        event.preventDefault();
        strokes = [];
        current = [];
        redraw();
        save();
        clearAssessment();
    });
    root.querySelector<HTMLButtonElement>('[data-doodle-ghost]')?.addEventListener('click', event => {
        event.preventDefault();
        ghost.hidden = !ghost.hidden;
        (event.currentTarget as HTMLButtonElement).textContent = ghost.hidden ? 'Ghost: Off' : 'Ghost: On';
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    add(window, 'resize', resize);
    resize();

    if (glyph) {
        void options.loadGhostSvg(glyph)
            .then(svg => {
                if (!root.isConnected || !svg.includes('<svg')) return;
                setInnerHtml(ghost, svg.replace(/<script[\s\S]*?<\/script>/gi, ''));
                expectedStrokes = ghost.querySelectorAll('path').length || expectedStrokes;
                renderAssessment();
            })
            .catch(() => undefined);
    }

    (root as DoodleRoot).__yomuDoodle = { resizeObserver, cleanup };
}

function formatAssessment(assessment: KanjiStrokeAssessment): string {
    return `${assessment.passed ? '✓' : '✕'} ${assessment.message}`;
}
