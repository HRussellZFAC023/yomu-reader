import { readFileSync } from 'node:fs';
// @ts-expect-error jsdom is the existing test runtime; this isolated document needs its own listener lifecycle.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

describe('standalone reader menu', () => {
    it('dismisses with Escape, outside press and focus departure, without stealing outside focus', () => {
        const dom = new JSDOM('<details data-overflow-menu open><summary data-overflow-summary>Menu</summary><a href="/">Home</a></details><button>Outside</button>', { runScripts: 'outside-only' });
        try {
            const { document } = dom.window;
            dom.window.eval(readFileSync('docs/public/hosted-shell-controls.js', 'utf8'));
            const menu = document.querySelector('details')!;
            const summary = document.querySelector('summary')!;
            document.querySelector('a')!.focus();
            document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(menu.open).toBe(false);
            expect(document.activeElement).toBe(summary);
            menu.open = true;
            document.querySelector('button')!.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
            expect(menu.open).toBe(false);
            menu.open = true;
            summary.focus();
            document.querySelector('button')!.focus();
            expect(menu.open).toBe(false);
            expect(document.activeElement?.tagName).toBe('BUTTON');
            menu.open = true;
            document.querySelector('a')!.href = '#home';
            document.querySelector('a')!.click();
            expect(menu.open).toBe(false);
        } finally { dom.window.close(); }
    });
    it.each(['pdf-reader', 'video-player'])('%s keeps status outside the hidden empty state', surface => {
        const document = new DOMParser().parseFromString(readFileSync(`docs/public/${surface}/index.html`, 'utf8'), 'text/html');
        expect(document.querySelector('script[defer][src="../hosted-shell-controls.js"]')).not.toBeNull();
        const status = document.querySelector('[data-status]')!;
        const settings = document.querySelector('a[data-settings-trigger]')!;
        expect(settings.getAttribute('href')).toBe('../study/#settings=appearance');
        expect(settings.getAttribute('target')).toBe('_blank');
        expect(settings.getAttribute('rel')).toBe('noopener');
        expect(status.closest('.empty')).toBeNull();
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-atomic')).toBe('true');
    });
});
