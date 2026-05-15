import { setInnerHtml } from './dom';
import { assessKanjiStrokes, type KanjiStrokeAssessment } from './kanji-stroke-grader';
import { parseKanjiVGSvg } from './kanjivg';
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

interface DoodleElements {
    stage: HTMLElement;
    canvas: HTMLCanvasElement;
    ghost: HTMLElement;
    result: HTMLElement | null;
    context: CanvasRenderingContext2D;
}

interface RequiredDoodleElements {
    stage: HTMLElement;
    canvas: HTMLCanvasElement;
    ghost: HTMLElement;
}

export function findDoodleCanvasMount(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.bugfix')
        ?? document.querySelector<HTMLElement>('.result.kanji > .vbox')
        ?? document.querySelector<HTMLElement>('.answer-box');
}

export function findDoodlePreviewMount(): HTMLElement | null {
    return firstElement(DOODLE_PREVIEW_MOUNT_SELECTORS);
}

const DOODLE_PREVIEW_MOUNT_SELECTORS = [
    '.review-reveal .hbox',
    '.review-reveal',
    '.hbox',
    '.result.kanji .hbox',
    '.result.kanji a.kanji.plain',
    '.answer-box .kanji, .answer-box .plain',
    '.answer-box',
];

function firstElement(selectors: string[]): HTMLElement | null {
    return selectors.map(selector => document.querySelector<HTMLElement>(selector)).find(Boolean) ?? null;
}

export function installDoodle(root: HTMLElement, glyph: string, options: DoodleInstallOptions): void {
    const elements = doodleElements(root);
    if (!elements) return;
    const { stage, canvas, ghost, result, context } = elements;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let drawing = false;
    let pointerId = -1;
    let strokes: DoodleStroke[] = [];
    let current: DoodleStroke = [];
    let expectedStrokes = 0;
    let ghostAvailable = Boolean(glyph);
    let traceVisible = false;
    let canvasRect = canvas.getBoundingClientRect();
    let strokeStyle = doodleStrokeStyle(stage);
    let guideStyle = doodleGuideStyle();
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
        save();
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
        context.fillStyle = strokeStyle;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = lineWidth(point);
    };

    const drawStroke = (stroke: DoodlePoint[]) => {
        if (!stroke.length) return;
        context.save();
        setupStroke(stroke.at(-1));
        if (stroke.length === 1) {
            const point = stroke[0];
            context.beginPath();
            context.arc(point.x * canvas.width, point.y * canvas.height, context.lineWidth / 2, 0, Math.PI * 2);
            context.fill();
            context.restore();
            return;
        }
        if (stroke.length === 2) {
            context.beginPath();
            context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
            context.lineTo(stroke[1].x * canvas.width, stroke[1].y * canvas.height);
            context.stroke();
            context.restore();
            return;
        }
        context.beginPath();
        context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
        for (let index = 1; index < stroke.length - 1; index += 1) {
            const midX = (stroke[index].x + stroke[index + 1].x) * canvas.width / 2;
            const midY = (stroke[index].y + stroke[index + 1].y) * canvas.height / 2;
            context.quadraticCurveTo(stroke[index].x * canvas.width, stroke[index].y * canvas.height, midX, midY);
        }
        const last = stroke.at(-1);
        const previous = stroke.at(-2);
        if (last && previous) context.quadraticCurveTo(previous.x * canvas.width, previous.y * canvas.height, last.x * canvas.width, last.y * canvas.height);
        context.stroke();
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
        drawCrosshair();
        for (const stroke of strokes) drawStroke(stroke);
        drawStroke(current);
    };

    const drawCrosshair = () => {
        context.save();
        context.strokeStyle = guideStyle;
        context.lineWidth = Math.max(1, dpr);
        context.beginPath();
        context.moveTo(0, canvas.height / 2);
        context.lineTo(canvas.width, canvas.height / 2);
        context.moveTo(canvas.width / 2, 0);
        context.lineTo(canvas.width / 2, canvas.height);
        context.stroke();
        context.restore();
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
        root.classList.remove('yomu-doodle-fail');
        result.textContent = assessment.passed ? formatAssessment(assessment) : '';
    };

    const clearAssessment = () => {
        root.classList.remove('yomu-doodle-pass', 'yomu-doodle-fail');
        if (result) result.textContent = '';
    };

    const setTraceVisible = (visible: boolean) => {
        traceVisible = visible && ghostAvailable;
        ghost.hidden = !traceVisible;
        stage.classList.toggle('trace-hidden', !traceVisible);
        root.querySelector<HTMLButtonElement>('[data-doodle-ghost]')?.replaceChildren(traceVisible ? 'Ghost: On' : ghostAvailable ? 'Ghost: Off' : 'Ghost: Unavailable');
        root.querySelector<HTMLButtonElement>('[data-doodle-trace]')?.replaceChildren(traceVisible ? 'Hide trace' : ghostAvailable ? 'Show trace' : 'Trace unavailable');
        redraw();
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
        strokeStyle = doodleStrokeStyle(stage);
        guideStyle = doodleGuideStyle(guideStyle);
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
        if (!ghostAvailable) return;
        setTraceVisible(ghost.hidden);
    });
    root.querySelector<HTMLButtonElement>('[data-doodle-trace]')?.addEventListener('click', event => {
        event.preventDefault();
        if (!ghostAvailable) return;
        setTraceVisible(!traceVisible);
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    add(window, 'resize', resize);
    resize();
    setTraceVisible(false);

    const applyGhost = (status: DoodleGhostStatus) => {
        expectedStrokes = status.expectedStrokes || expectedStrokes;
        ghostAvailable = status.available;
        setTraceVisible(false);
        if (status.available) renderAssessment();
    };
    loadDoodleGhost(root, ghost, glyph, options.loadGhostSvg).then(applyGhost);

    (root as DoodleRoot).__yomuDoodle = { resizeObserver, cleanup };
}

function doodleElements(root: HTMLElement): DoodleElements | null {
    const elements = requiredDoodleElements(root);
    if (!elements) return null;
    const context = elements.canvas.getContext('2d');
    if (!context) return null;
    return {
        ...elements,
        result: root.querySelector<HTMLElement>('[data-doodle-result]'),
        context,
    };
}

function requiredDoodleElements(root: HTMLElement): RequiredDoodleElements | null {
    const stage = root.querySelector<HTMLElement>('.yomu-doodle-stage, .jpdb-reader-doodle-stage');
    const canvas = root.querySelector<HTMLCanvasElement>('.yomu-doodle-canvas, .jpdb-reader-doodle-canvas');
    const ghost = root.querySelector<HTMLElement>('.yomu-doodle-ghost, .jpdb-reader-doodle-ghost');
    if (!stage || !canvas || !ghost) return null;
    return { stage, canvas, ghost };
}

interface DoodleGhostStatus {
    available: boolean;
    expectedStrokes: number;
}

async function loadDoodleGhost(
    root: HTMLElement,
    ghost: HTMLElement,
    glyph: string,
    loadGhostSvg: (glyph: string) => Promise<string>,
): Promise<DoodleGhostStatus> {
    if (!glyph) return unavailableDoodleGhost();
    try {
        const svg = await loadGhostSvg(glyph);
        return renderDoodleGhost(root, ghost, glyph, svg);
    } catch {
        return unavailableDoodleGhost();
    }
}

function renderDoodleGhost(root: HTMLElement, ghost: HTMLElement, glyph: string, svg: string): DoodleGhostStatus {
    if (!isUsableDoodleGhostSvg(root, svg)) return unavailableDoodleGhost();
    const info = parseKanjiVGSvg(svg, glyph);
    setInnerHtml(ghost, info?.svg ?? svg.replace(/<script[\s\S]*?<\/script>/gi, ''));
    const expectedStrokes = ghost.querySelectorAll('path').length;
    root.querySelector<HTMLElement>('[data-doodle-stroke-count]')?.replaceChildren(`${expectedStrokes} strokes`);
    return availableDoodleGhost(expectedStrokes);
}

function doodleStrokeStyle(stage: HTMLElement): string {
    return getComputedStyle(stage).getPropertyValue('--jpdb-reader-doodle-ink').trim()
        || getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-text').trim()
        || '#111';
}

function doodleGuideStyle(fallback = 'rgba(128,128,128,0.35)'): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-border') || fallback;
}

function unavailableDoodleGhost(): DoodleGhostStatus {
    return { available: false, expectedStrokes: 0 };
}

function availableDoodleGhost(expectedStrokes: number): DoodleGhostStatus {
    return { available: true, expectedStrokes };
}

function isUsableDoodleGhostSvg(root: HTMLElement, svg: string): boolean {
    return root.isConnected && svg.includes('<svg');
}

function formatAssessment(assessment: KanjiStrokeAssessment): string {
    return `${assessment.passed ? '✓' : '✕'} ${assessment.message}`;
}
