import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installMembershipPopover } from '../../docs/.vitepress/theme/membership-popover';

beforeAll(() => installMembershipPopover());
afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/');
});

function open(path = '/', target = '/membership') {
    window.history.replaceState({}, '', path);
    document.body.innerHTML = `<main><a href="${target}">Donate</a></main>`;
    const trigger = document.querySelector('a')!;
    trigger.focus();
    trigger.click();
    return trigger;
}

describe('donation chooser navigation', () => {
    it('opens the Japanese chooser with Japanese controls and an owned costs link', () => {
        open('/ja/faq', '/ja/membership');
        const dialog = document.querySelector('[role="dialog"]')!;
        expect(dialog.querySelector('h2')?.textContent).toBe('寄付');
        expect(dialog.querySelector('button')?.textContent).toBe('閉じる');
        expect(dialog.querySelector('.yomu-membership-more')?.getAttribute('href'))
            .toBe('/ja/membership#monthly-running-costs');
        expect(dialog.textContent).not.toContain('One-off');
    });
    it('releases the page before following the costs link', () => {
        open();
        const main = document.querySelector('main')!;
        expect(main.inert).toBe(true);
        document.querySelector<HTMLAnchorElement>('.yomu-membership-more')!.click();
        expect(main.inert).toBe(false);
        expect(document.documentElement.hasAttribute('data-yomu-membership-open')).toBe(false);
        expect(document.querySelector<HTMLElement>('.yomu-membership-backdrop')!.hidden).toBe(true);
    });
    it('leaves direct costs links and modified clicks as ordinary navigation', () => {
        open('/', '/membership#monthly-running-costs');
        expect(document.documentElement.hasAttribute('data-yomu-membership-open')).toBe(false);
        document.body.innerHTML = '<a href="/membership">Donate</a>';
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
        document.querySelector('a')!.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });
    it('restores focus and preserves pre-existing inert state on dismissal', () => {
        const trigger = open();
        const existing = document.createElement('aside');
        existing.inert = true;
        document.body.append(existing);
        document.querySelector<HTMLButtonElement>('.yomu-membership-close')!.click();
        expect(document.activeElement).toBe(trigger);
        expect(existing.inert).toBe(true);
    });
});
