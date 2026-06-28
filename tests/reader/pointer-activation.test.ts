import { afterEach, describe, expect, it, vi } from 'vitest';

import { installReaderControlPointerActivation } from '../../src/reader/ui/pointer-activation';
import { createPointerEvent } from './helpers/browser-fixtures';

function mountReaderButton(): HTMLButtonElement {
    document.body.innerHTML = `
        <div data-jpdb-reader-root="true">
            <button type="button" data-action="trace-toggle">辞書</button>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root]')!;
    installReaderControlPointerActivation(root);
    return root.querySelector<HTMLButtonElement>('button')!;
}

describe('reader control pointer activation', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it.each(['pen', 'touch'] as const)('activates %s taps once and suppresses the trailing browser click', pointerType => {
        const button = mountReaderButton();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        button.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 7, pointerType, clientX: 12, clientY: 18 }));
        const pointerup = createPointerEvent('pointerup', { pointerId: 7, pointerType, clientX: 14, clientY: 19 });
        button.dispatchEvent(pointerup);

        expect(pointerup.defaultPrevented).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1);

        const trailingClick = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            detail: 1,
        });
        button.dispatchEvent(trailingClick);

        expect(trailingClick.defaultPrevented).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('leaves mouse clicks to the browser', () => {
        const button = mountReaderButton();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        button.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'mouse' }));
        const pointerup = createPointerEvent('pointerup', { pointerType: 'mouse' });
        button.dispatchEvent(pointerup);

        expect(pointerup.defaultPrevented).toBe(false);
        expect(onClick).not.toHaveBeenCalled();

        button.click();

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not activate direct pointer drags as taps', () => {
        const button = mountReaderButton();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        button.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: 10, clientY: 10 }));
        const pointerup = createPointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', clientX: 40, clientY: 10 });
        button.dispatchEvent(pointerup);

        expect(pointerup.defaultPrevented).toBe(false);
        expect(onClick).not.toHaveBeenCalled();
    });
});
