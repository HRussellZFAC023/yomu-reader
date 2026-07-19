import { afterEach, describe, expect, it, vi } from 'vitest';
import { installKanjiDoodle } from '../../src/reader/kanji/doodle';

interface CoordinateCase {
    name: string;
    hostname: string;
    pageScale: number;
    compensatedRectScale: number;
    adapter: boolean;
}

const coordinateCases: CoordinateCase[] = [
    {
        name: 'older WebKit overlay-space compensated rects',
        hostname: 'www.reddit.com',
        pageScale: 1.6,
        compensatedRectScale: 1,
        adapter: true,
    },
    {
        name: 'newer WebKit inverse-zoom layout-space compensated rects',
        hostname: 'www.reddit.com',
        pageScale: 1.6,
        compensatedRectScale: 0.625,
        adapter: true,
    },
    {
        name: 'ordinary non-Reddit coordinates',
        hostname: 'example.com',
        pageScale: 1,
        compensatedRectScale: 1,
        adapter: false,
    },
];

describe('kanji doodle Reddit coordinate isolation', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.documentElement.classList.remove('jpdb-reader-doodle-active');
        document.body.replaceChildren();
    });

    it.each(coordinateCases)('keeps pointer, backing, ghost, and stroke geometry physical with $name', mode => {
        const harness = installDoodleHarness(mode);
        try {
            expect(harness.canvas.width).toBe(640);
            expect(harness.canvas.height).toBe(480);

            const physicalPoint = { x: 240, y: 200 };
            const clientPoint = {
                x: physicalPoint.x / mode.pageScale,
                y: physicalPoint.y / mode.pageScale,
            };
            harness.canvas.dispatchEvent(pointerEvent('pointerdown', clientPoint.x, clientPoint.y));
            document.dispatchEvent(pointerEvent('pointerup', clientPoint.x, clientPoint.y));

            expect(harness.onChange).toHaveBeenLastCalledWith([
                [expect.objectContaining({ x: 0.25, y: 0.5, pressure: 0.5 })],
            ]);
            expect(harness.context.lineWidth).toBeCloseTo(12);
            expect(harness.context.arc).toHaveBeenCalledWith(160, 240, 6, 0, Math.PI * 2);
        } finally {
            harness.cleanup();
        }
    });
});

function installDoodleHarness(mode: CoordinateCase): {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D & { arc: ReturnType<typeof vi.fn> };
    onChange: ReturnType<typeof vi.fn>;
    cleanup: () => void;
} {
    vi.stubGlobal('location', { hostname: mode.hostname });
    vi.stubGlobal('navigator', mode.adapter
        ? { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }
        : { userAgent: 'Mozilla/5.0', platform: 'Linux', maxTouchPoints: 0 });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(): void {
            this.callback([], this as unknown as ResizeObserver);
        }
        disconnect(): void {}
        unobserve(): void {}
    });

    const restoreWindowMetrics = setWindowMetrics({
        innerWidth: 475,
        innerHeight: 612.5,
        outerWidth: 475 * mode.pageScale,
        devicePixelRatio: 2,
    });
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const context = {
        strokeStyle: '',
        fillStyle: '',
        lineCap: '',
        lineJoin: '',
        lineWidth: 0,
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D & { arc: ReturnType<typeof vi.fn> };
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: vi.fn(() => context),
    });

    const root = document.createElement('section');
    root.innerHTML = `
        <div class="jpdb-reader-doodle-stage">
            <div class="jpdb-reader-doodle-ghost">
                <svg viewBox="0 0 109 109"></svg>
            </div>
            <canvas class="jpdb-reader-doodle-canvas"></canvas>
        </div>
    `;
    if (mode.adapter) {
        root.dataset.jpdbReaderScaleAdapter = 'apple-touch-page-scale';
        root.dataset.jpdbReaderScaleCompensation = '0.625';
    }
    Object.defineProperties(root, {
        offsetWidth: { configurable: true, value: 400 },
        offsetHeight: { configurable: true, value: 300 },
    });
    setRect(root, physicalRect(0, 0, 400, 300, mode.compensatedRectScale));

    const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
    const canvas = root.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')!;
    const ghostSvg = root.querySelector<SVGSVGElement>('svg')!;
    setRect(stage, physicalRect(160, 80, 320, 240, mode.compensatedRectScale));
    setRect(canvas, physicalRect(160, 80, 320, 240, mode.compensatedRectScale));
    setRect(ghostSvg, physicalRect(211, 91, 218, 218, mode.compensatedRectScale));
    document.body.append(root);

    const onChange = vi.fn();
    installKanjiDoodle(root, () => 'en', { onChange });

    return {
        canvas,
        context,
        onChange,
        cleanup: () => {
            (root as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
            root.remove();
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
                configurable: true,
                value: originalGetContext,
            });
            restoreWindowMetrics();
        },
    };
}

function physicalRect(left: number, top: number, width: number, height: number, scale: number): DOMRect {
    return new DOMRect(left * scale, top * scale, width * scale, height * scale);
}

function setRect(element: Element, rect: DOMRect): void {
    element.getBoundingClientRect = () => rect;
}

function pointerEvent(type: string, clientX: number, clientY: number): PointerEvent {
    return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        clientX,
        clientY,
        pointerId: 7,
        pointerType: 'pen',
        pressure: 0.5,
    }) as PointerEvent;
}

function setWindowMetrics(metrics: Record<'innerWidth' | 'innerHeight' | 'outerWidth' | 'devicePixelRatio', number>): () => void {
    const descriptors = Object.entries(metrics).map(([name, value]) => {
        const descriptor = Object.getOwnPropertyDescriptor(window, name);
        Object.defineProperty(window, name, { configurable: true, value });
        return { name, descriptor };
    });
    return () => {
        for (const { name, descriptor } of descriptors) {
            if (descriptor) Object.defineProperty(window, name, descriptor);
            else delete (window as unknown as Record<string, unknown>)[name];
        }
    };
}
