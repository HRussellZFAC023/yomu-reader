import { vi } from 'vitest';

export type TestDomRectInit = Partial<DOMRectInit & {
    left: number;
    top: number;
    right: number;
    bottom: number;
}>;

export function testDomRect(rect: TestDomRectInit = {}): DOMRect {
    const left = rect.left ?? rect.x ?? 0;
    const top = rect.top ?? rect.y ?? 0;
    const width = rect.width ?? testDomRectEdgeSize(rect.right, left, 800);
    const height = rect.height ?? testDomRectEdgeSize(rect.bottom, top, 200);
    return {
        x: rect.x ?? left,
        y: rect.y ?? top,
        left,
        top,
        width,
        height,
        right: rect.right ?? left + width,
        bottom: rect.bottom ?? top + height,
        toJSON: () => ({}),
    } as DOMRect;
}

export function mockElementBoundingClientRect(rect: TestDomRectInit = {}) {
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(testDomRect(rect));
}

export function stubInstantIntersectionObserver(): void {
    vi.stubGlobal('IntersectionObserver', class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(target: Element): void {
            this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): IntersectionObserverEntry[] { return []; }
        root = null;
        rootMargin = '0px';
        thresholds = [0];
    });
}

function testDomRectEdgeSize(edge: number | undefined, start: number, fallback: number): number {
    return edge === undefined ? fallback : edge - start;
}
