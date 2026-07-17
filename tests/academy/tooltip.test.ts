import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setAcademyTooltip } from '../../src/academy/ui/tooltip';

afterEach(() => document.body.replaceChildren());

describe('Academy compact-control tooltips', () => {
    it('keeps the accessible name, native title, and data label in sync', () => {
        const trigger = document.createElement('button');

        setAcademyTooltip(trigger, 'Show readings');

        expect(trigger.getAttribute('aria-label')).toBe('Show readings');
        expect(trigger.title).toBe('Show readings');
        expect(trigger.dataset.tooltip).toBe('Show readings');
    });

    it('shows on hover and focus in a body portal, then clears its description', () => {
        const clippedPanel = document.createElement('div');
        clippedPanel.style.overflow = 'hidden';
        const trigger = document.createElement('button');
        clippedPanel.append(trigger);
        document.body.append(clippedPanel);
        setAcademyTooltip(trigger, 'Open utility menu');

        trigger.dispatchEvent(new Event('pointerenter'));
        const hoverTooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]')!;
        expect(hoverTooltip).not.toBeNull();
        expect(hoverTooltip.parentElement).toBe(document.body);
        expect(hoverTooltip.textContent).toBe('Open utility menu');
        expect(trigger.getAttribute('aria-describedby')).toContain(hoverTooltip.id);

        trigger.dispatchEvent(new Event('pointerleave'));
        expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
        expect(trigger.hasAttribute('aria-describedby')).toBe(false);

        trigger.focus();
        expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe('Open utility menu');
        trigger.blur();
        expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    });

    it('tracks visual-viewport and tooltip reflow while open, then releases observers', () => {
        const viewport = Object.assign(new EventTarget(), {
            offsetLeft: 40,
            offsetTop: 20,
            width: 280,
            height: 180,
        }) as unknown as VisualViewport;
        const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        let resizeTooltip = (): void => undefined;
        const disconnect = vi.fn();
        class TestResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeTooltip = () => callback([], this as unknown as ResizeObserver);
            }
            observe(): void {}
            disconnect(): void { disconnect(); }
        }
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
        vi.stubGlobal('ResizeObserver', TestResizeObserver);

        try {
            const header = document.createElement('div');
            header.className = 'academy-vn-dialogue-header';
            header.getBoundingClientRect = () => rect({ left: 20, top: 40, width: 280, height: 120 });
            const trigger = document.createElement('button');
            trigger.getBoundingClientRect = () => rect({ left: 280, top: 100, width: 40, height: 40 });
            header.append(trigger);
            document.body.append(header);
            setAcademyTooltip(trigger, 'Show the complete dialogue history');
            trigger.focus();

            const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]')!;
            tooltip.getBoundingClientRect = () => rect({ width: 120, height: 40 });
            viewport.dispatchEvent(new Event('resize'));
            expect(tooltip.style.left).toBe('252px');
            expect(tooltip.style.top).toBe('148px');
            expect(tooltip.style.getPropertyValue('--academy-tooltip-viewport-inline')).toBe('264px');
            expect(tooltip.style.getPropertyValue('--academy-tooltip-viewport-block')).toBe('164px');
            expect(tooltip.dataset.placement).toBe('below');

            Object.assign(viewport, { offsetLeft: 80, width: 180 });
            viewport.dispatchEvent(new Event('scroll'));
            expect(tooltip.style.left).toBe('192px');
            expect(tooltip.style.getPropertyValue('--academy-tooltip-viewport-inline')).toBe('164px');

            tooltip.getBoundingClientRect = () => rect({ width: 160, height: 40 });
            resizeTooltip();
            expect(tooltip.style.left).toBe('172px');

            trigger.blur();
            expect(disconnect).toHaveBeenCalledOnce();
        } finally {
            if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
            else Reflect.deleteProperty(window, 'visualViewport');
            vi.unstubAllGlobals();
        }
    });

    it('ships a fixed, viewport-constrained mobile presentation', () => {
        const css = readFileSync(path.join(process.cwd(), 'src/academy/styles/tooltip.css'), 'utf8');

        expect(css).toMatch(/\.academy-tooltip\s*\{[\s\S]*position:\s*fixed/);
        expect(css).toContain('z-index: 2147483647');
        expect(css).toContain('box-sizing: border-box');
        expect(css).toContain('--academy-tooltip-viewport-inline');
        expect(css).toContain('calc(100dvh - 16px)');
        expect(css).toContain('@media (max-width: 700px)');
        expect(css).toContain('calc(100vw - 24px)');
        expect(css).toMatch(/\.academy-tooltip\[data-viewport-constrained='true'\]\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s);
    });
});

function rect(values: Partial<DOMRect>): DOMRect {
    const left = values.left ?? 0;
    const top = values.top ?? 0;
    const width = values.width ?? 0;
    const height = values.height ?? 0;
    return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
    };
}
