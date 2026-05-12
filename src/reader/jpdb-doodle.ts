import { setInnerHtml } from './dom';

export interface DoodleState {
    resizeObserver?: ResizeObserver;
    cleanup: Array<() => void>;
}

export type DoodleRoot = HTMLElement & { __yomuDoodle?: DoodleState };

export interface DoodleInstallOptions {
    storageKey: string;
    loadGhostSvg: (glyph: string) => Promise<string>;
}

interface DoodlePoint {
    x: number;
    y: number;
    pressure: number;
}

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
    if (!stage || !canvas || !ghost) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let drawing = false;
    let pointerId = -1;
    let strokes: DoodlePoint[][] = [];
    let current: DoodlePoint[] = [];
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
        redraw();
    };

    const point = (event: PointerEvent): DoodlePoint => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
            pressure: Math.max(0.15, Math.min(1, event.pressure || 0.55)),
        };
    };

    const drawStroke = (stroke: DoodlePoint[]) => {
        if (!stroke.length) return;
        context.save();
        context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-text') || '#111';
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        stroke.forEach((item, index) => {
            const x = item.x * canvas.width;
            const y = item.y * canvas.height;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        });
        const last = stroke[stroke.length - 1];
        context.lineWidth = Math.max(4, Math.min(12, canvas.width * 0.018)) * (0.75 + (last?.pressure ?? 0.55) * 0.35);
        context.stroke();
        context.restore();
    };

    const redraw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) drawStroke(stroke);
        drawStroke(current);
    };

    const save = () => {
        try {
            localStorage.setItem(options.storageKey, canvas.toDataURL('image/png'));
        } catch {
            // Storage can be blocked in strict profiles.
        }
    };

    add(canvas, 'pointerdown', event => {
        event.preventDefault();
        drawing = true;
        pointerId = event.pointerId;
        current = [point(event)];
        try {
            canvas.setPointerCapture?.(event.pointerId);
        } catch {
            // Some browsers only allow capture for trusted pointer streams.
        }
        redraw();
    }, { passive: false });
    add(canvas, 'pointermove', event => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        const next = point(event);
        const last = current[current.length - 1];
        if (!last || Math.hypot(next.x - last.x, next.y - last.y) > 0.0025) {
            current.push(next);
            redraw();
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
        redraw();
        save();
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
            })
            .catch(() => undefined);
    }

    (root as DoodleRoot).__yomuDoodle = { resizeObserver, cleanup };
}
