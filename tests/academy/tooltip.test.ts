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

    it('ships a fixed, viewport-constrained mobile presentation', () => {
        const css = readFileSync(path.join(process.cwd(), 'src/academy/styles/tooltip.css'), 'utf8');

        expect(css).toMatch(/\.academy-tooltip\s*\{[\s\S]*position:\s*fixed/);
        expect(css).toContain('z-index: 2147483647');
        expect(css).toContain('box-sizing: border-box');
        expect(css).toContain('calc(100vw - 16px)');
        expect(css).toContain('calc(100dvh - 16px)');
        expect(css).toContain('@media (max-width: 700px)');
        expect(css).toContain('calc(100vw - 24px)');
    });
});
