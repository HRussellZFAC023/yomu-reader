import { afterEach, describe, expect, it, vi } from 'vitest';

import { holdReaderToast, showReaderToast } from '../../src/reader/ui/toast';

describe('reader toast stack', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    const box = (left: number, top: number, width: number, height: number): DOMRect =>
        ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const clearance = (): string =>
        document.querySelector<HTMLElement>('.jpdb-reader-toast-stack')!.style.getPropertyValue('--jpdb-reader-toast-clearance');

    // Phone Study: the toast sat on the footer's status line and the top of Save.
    it('lifts the stack above the whole footer when a toast would cover Save', () => {
        document.body.innerHTML = '<form class="jpdb-reader-settings"><div class="footer"><button type="button">Cancel</button><button type="submit">Save</button></div></form>';
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
        vi.spyOn(document.querySelector<HTMLElement>('.footer')!, 'getBoundingClientRect').mockReturnValue(box(1, 745, 388, 98));
        vi.spyOn(document.querySelector<HTMLElement>('[type="submit"]')!, 'getBoundingClientRect').mockReturnValue(box(237, 785, 138, 44));

        showReaderToast('Value must be greater than or equal to 280.');

        expect(clearance()).toBe('107px');
        vi.restoreAllMocks();
    });

    // Study, 1280 px: the footer spans the dialog but Cancel and Save sit at its
    // right; lifting over the whole row put the toast on the form's own inputs.
    it('stays in the footer row when the toast clears its buttons', () => {
        document.body.innerHTML = '<div class="jpdb-reader-toast-stack"></div><form class="jpdb-reader-settings"><div class="footer"><button type="button">Cancel</button><button type="submit">Save</button></div></form>';
        const stack = document.querySelector<HTMLElement>('.jpdb-reader-toast-stack')!;
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
        vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue(box(496, 742, 288, 40));
        vi.spyOn(document.querySelector<HTMLElement>('.footer')!, 'getBoundingClientRect').mockReturnValue(box(51, 701, 1178, 88));
        vi.spyOn(document.querySelector<HTMLElement>('[type="button"]')!, 'getBoundingClientRect').mockReturnValue(box(1017, 739, 91, 38));
        vi.spyOn(document.querySelector<HTMLElement>('[type="submit"]')!, 'getBoundingClientRect').mockReturnValue(box(1119, 737, 92, 38));

        showReaderToast('Value must be greater than or equal to 280.');

        expect(clearance()).toBe('');
        vi.restoreAllMocks();
    });

    it('clears a lookup popup footer control under the toast but not one off to the side', () => {
        document.body.innerHTML = '<div class="jpdb-reader-popover"><div class="jpdb-reader-actions"><button>Add</button></div></div>';
        const actions = document.querySelector<HTMLElement>('.jpdb-reader-actions')!;
        const add = actions.querySelector<HTMLElement>('button')!;
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1400);
        const place = (left: number) => {
            vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue(box(left, 740, 400, 50));
            vi.spyOn(add, 'getBoundingClientRect').mockReturnValue(box(left + 150, 750, 100, 30));
        };

        place(600);
        showReaderToast('Copied word.');
        expect(clearance()).toBe('68px');

        place(20);
        showReaderToast('Copied word again.');
        expect(clearance()).toBe('');
        vi.restoreAllMocks();
    });

    // Desktop: a short "Copied word." centred at 864 of 1728 px sat beside a popup
    // whose footer ended at 794 px, yet the stack rose 404 px up the screen
    // because it measured the widest toast it could ever be, not the one shown.
    it('stays at the edge when the toast it shows clears a popup footer beside it', () => {
        document.body.innerHTML = '<div class="jpdb-reader-toast-stack"></div><div class="jpdb-reader-popover"><div class="jpdb-reader-actions"><button>Add</button></div></div>';
        const stack = document.querySelector<HTMLElement>('.jpdb-reader-toast-stack')!;
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1117);
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1728);
        vi.spyOn(stack, 'getBoundingClientRect').mockReturnValue(box(811, 1059, 106, 40));
        vi.spyOn(document.querySelector<HTMLElement>('.jpdb-reader-actions button')!, 'getBoundingClientRect').mockReturnValue(box(276, 722, 518, 47));

        showReaderToast('Copied word.');

        expect(clearance()).toBe('');
        vi.restoreAllMocks();
    });

    // Wikipedia: the popup's footer ended at 564 px of an 891 px view, well clear
    // of a toast at the bottom edge, yet "Copied word." rose onto the popup.
    it('stays at the edge when a popup footer under its columns ends above it', () => {
        document.body.innerHTML = '<div class="jpdb-reader-popover"><div class="jpdb-reader-actions"><button>Add</button></div></div>';
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(891);
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1406);
        vi.spyOn(document.querySelector<HTMLElement>('.jpdb-reader-actions button')!, 'getBoundingClientRect').mockReturnValue(box(652, 518, 518, 47));

        showReaderToast('Copied word.');

        expect(clearance()).toBe('');
        vi.restoreAllMocks();
    });

    // "Copied word." rose above a popup's footer, then stayed floating at that
    // height after Escape closed the popup; a held status kept its Settings
    // lift after Settings closed.
    it('settles back to the edge when the row it rose above leaves, and rises when one arrives', async () => {
        const settle = () => new Promise(resolve => setTimeout(resolve, 0));
        document.body.innerHTML = '<div class="jpdb-reader-popover"><div class="jpdb-reader-actions"><button>Add</button></div></div>';
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1400);
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
            if (this.matches('.jpdb-reader-actions, .jpdb-reader-settings > .footer')) return box(500, 740, 400, 50);
            if (this.matches('.jpdb-reader-actions button, .footer button')) return box(650, 750, 100, 30);
            return box(0, 0, 0, 0);
        });

        const release = holdReaderToast('Saving...');
        expect(clearance()).toBe('68px');

        document.querySelector('.jpdb-reader-popover')!.remove();
        await settle();
        expect(clearance()).toBe('');

        const settings = document.createElement('form');
        settings.className = 'jpdb-reader-settings';
        settings.innerHTML = '<div class="footer"><button type="submit">Save</button></div>';
        document.body.append(settings);
        await settle();
        expect(clearance()).toBe('68px');

        settings.remove();
        await settle();
        expect(clearance()).toBe('');
        release();
        vi.restoreAllMocks();
    });

    it('stacks distinct toasts instead of overlapping and removes them after their duration', () => {
        vi.useFakeTimers();
        showReaderToast('first', 1000);
        showReaderToast('second', 1000);

        const stack = document.querySelector('.jpdb-reader-toast-stack')!;
        expect(stack).not.toBeNull();
        expect(stack.querySelectorAll('.jpdb-reader-toast')).toHaveLength(2);

        vi.advanceTimersByTime(1000 + 250);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
        // The empty stack cleans itself up.
        expect(document.querySelector('.jpdb-reader-toast-stack')).toBeNull();
    });

    it('refreshes the timer of an identical visible toast instead of duplicating it', () => {
        vi.useFakeTimers();
        showReaderToast('same message', 1000);
        vi.advanceTimersByTime(800);
        showReaderToast('same message', 1000);

        expect(document.querySelectorAll('.jpdb-reader-toast')).toHaveLength(1);
        // The original timer was superseded: still visible past the first deadline.
        vi.advanceTimersByTime(500);
        expect(document.querySelector('.jpdb-reader-toast')).not.toBeNull();
        vi.advanceTimersByTime(800);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
    });

    it('brings back a toast that was leaving when the same message is shown again', () => {
        vi.useFakeTimers();
        showReaderToast('same message', 1000);
        vi.advanceTimersByTime(1100);
        expect(document.querySelector('.jpdb-reader-toast')?.classList.contains('is-visible')).toBe(false);
        showReaderToast('same message', 1000);

        vi.advanceTimersByTime(500);
        const toast = document.querySelector('.jpdb-reader-toast');
        expect(toast?.classList.contains('is-visible')).toBe(true);
        vi.advanceTimersByTime(800);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
    });

    it('keeps a held status until its last holder releases it, even if one releases as another takes it', () => {
        vi.useFakeTimers();
        const releaseFirst = holdReaderToast('waiting');
        releaseFirst();
        vi.advanceTimersByTime(100);
        const releaseSecond = holdReaderToast('waiting');
        const releaseThird = holdReaderToast('waiting');
        vi.advanceTimersByTime(1000);
        expect(document.querySelectorAll('.jpdb-reader-toast')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-toast')?.classList.contains('is-visible')).toBe(true);

        releaseSecond();
        releaseSecond();
        showReaderToast('waiting', 100);
        vi.advanceTimersByTime(1000);
        expect(document.querySelector('.jpdb-reader-toast')?.textContent).toBe('waiting');

        releaseThird();
        vi.advanceTimersByTime(300);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
    });
});
