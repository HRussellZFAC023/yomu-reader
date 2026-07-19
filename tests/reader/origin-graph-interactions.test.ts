import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphEdgePath } from '../../src/reader/kanji/graph-geometry';

const redditCoordinates = vi.hoisted(() => ({ pageScale: 1 }));

vi.mock('../../src/reader/ui/page-scale', async () => {
    const actual = await vi.importActual<typeof import('../../src/reader/ui/page-scale')>(
        '../../src/reader/ui/page-scale',
    );
    return {
        ...actual,
        layoutPointToOverlay: (point: { x: number; y: number }) => (
            actual.layoutPointToOverlay(point, redditCoordinates.pageScale)
        ),
        sourceRectToOverlay: (rect: DOMRect | DOMRectReadOnly, source?: Node | null) => (
            actual.sourceRectToOverlay(rect, source, redditCoordinates.pageScale)
        ),
    };
});

let installOriginGraphInteractions: typeof import('../../src/reader/popup/origin-graph-interactions').installOriginGraphInteractions;

describe('origin graph interactions in compensated Reddit overlays', () => {
    beforeAll(async () => {
        vi.resetModules();
        ({ installOriginGraphInteractions } = await import('../../src/reader/popup/origin-graph-interactions'));
    });

    beforeEach(() => {
        redditCoordinates.pageScale = 1;
        document.body.innerHTML = '';
        vi.stubGlobal('requestAnimationFrame', vi.fn());
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it.each([
        { label: 'old WebKit overlay-space BCRs', pageScale: 1.6, rectScale: 1, compensated: true },
        { label: 'new WebKit inverse/layout-space BCRs', pageScale: 1.6, rectScale: 0.625, compensated: true },
        { label: 'an unscaled non-Reddit page', pageScale: 1, rectScale: 1, compensated: false },
    ])('keeps drag positions and measured edge geometry stable with $label', ({ pageScale, rectScale, compensated }) => {
        redditCoordinates.pageScale = pageScale;
        const graph = originGraphFixture({ pageScale, rectScale, compensated });

        installOriginGraphInteractions(graph.surface);

        expect(graph.wrap.dataset.graphReady).toBe('true');
        expect(graph.path.getAttribute('d')).toBe('M25 50 L75 50');

        graph.from.dispatchEvent(pointerEvent('pointerdown', graph.layoutPoint(20, 50)));
        graph.wrap.dispatchEvent(pointerEvent('pointermove', graph.layoutPoint(60, 60)));

        expect(graph.from.dataset.x).toBe('60');
        expect(graph.from.dataset.y).toBe('60');
        expect(graph.from.style.left).toBe('60%');
        expect(graph.from.style.top).toBe('60%');
        expect(graph.path.getAttribute('d')).toBe(graphEdgePath(
            { x: 60, y: 60, rx: 5, ry: 10 },
            { x: 80, y: 50, rx: 5, ry: 10 },
        ).d);
    });
});

function originGraphFixture(options: {
    pageScale: number;
    rectScale: number;
    compensated: boolean;
}): {
    surface: HTMLElement;
    wrap: HTMLElement;
    from: HTMLElement;
    path: SVGPathElement;
    layoutPoint: (xPercent: number, yPercent: number) => { x: number; y: number };
} {
    const surface = document.createElement('section');
    if (options.compensated) {
        surface.dataset.jpdbReaderScaleAdapter = 'apple-touch-page-scale';
        surface.dataset.jpdbReaderScaleCompensation = String(1 / options.pageScale);
        Object.defineProperties(surface, {
            offsetWidth: { configurable: true, value: 520 },
            offsetHeight: { configurable: true, value: 400 },
        });
        surface.getBoundingClientRect = () => new DOMRect(
            0,
            0,
            520 * options.rectScale,
            400 * options.rectScale,
        );
    }
    surface.innerHTML = `
        <div class="jpdb-reader-origin-graph-wrap">
            <svg>
                <g class="jpdb-reader-origin-edge-group" data-from="from" data-to="to">
                    <path class="jpdb-reader-origin-edge"></path>
                </g>
            </svg>
            <button class="jpdb-reader-origin-graph-node" data-graph-node="from" data-x="20" data-y="50" data-rx="2" data-ry="3"></button>
            <button class="jpdb-reader-origin-graph-node" data-graph-node="to" data-x="80" data-y="50" data-rx="2" data-ry="3"></button>
        </div>
    `;
    document.body.append(surface);

    const wrap = surface.querySelector<HTMLElement>('.jpdb-reader-origin-graph-wrap')!;
    const nodes = Array.from(wrap.querySelectorAll<HTMLElement>('.jpdb-reader-origin-graph-node'));
    const from = nodes[0]!;
    for (const node of nodes) {
        Object.defineProperties(node, {
            offsetWidth: { configurable: true, value: 40 },
            offsetHeight: { configurable: true, value: 40 },
        });
    }

    const overlayRect = new DOMRect(100, 80, 400, 200);
    wrap.getBoundingClientRect = () => new DOMRect(
        overlayRect.left * options.rectScale,
        overlayRect.top * options.rectScale,
        overlayRect.width * options.rectScale,
        overlayRect.height * options.rectScale,
    );

    return {
        surface,
        wrap,
        from,
        path: wrap.querySelector<SVGPathElement>('.jpdb-reader-origin-edge')!,
        layoutPoint: (xPercent, yPercent) => ({
            x: (overlayRect.left + overlayRect.width * xPercent / 100) / options.pageScale,
            y: (overlayRect.top + overlayRect.height * yPercent / 100) / options.pageScale,
        }),
    };
}

function pointerEvent(type: string, point: { x: number; y: number }): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: 0 },
        clientX: { value: point.x },
        clientY: { value: point.y },
        pointerId: { value: 7 },
        pointerType: { value: 'touch' },
    });
    return event;
}
