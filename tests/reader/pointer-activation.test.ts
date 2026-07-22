import { afterEach, describe, expect, it, vi } from 'vitest';

import { installReaderControlPointerActivation } from '../../src/reader/ui/pointer-activation';
import { shouldIgnoreDocumentClickTarget } from '../../src/reader/app/native-page-lookup-targets';
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

function mountBlurredImmersionTranslation(): HTMLElement {
    document.body.innerHTML = `
        <div data-jpdb-reader-root="true">
            <div class="jpdb-reader-example-translation" data-immersion-translation-blurred="true" role="button" tabindex="0">Translation</div>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root]')!;
    installReaderControlPointerActivation(root);
    return root.querySelector<HTMLElement>('.jpdb-reader-example-translation')!;
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

    it('keeps a one-tap touch reveal from being swallowed by enhanced-site document lookup', () => {
        const translation = mountBlurredImmersionTranslation();
        const onClick = vi.fn(() => translation.removeAttribute('data-immersion-translation-blurred'));
        translation.addEventListener('click', onClick);

        const documentClickGuard = (event: MouseEvent): void => {
            if (shouldIgnoreDocumentClickTarget(event.target)) return;
            event.stopImmediatePropagation();
        };
        document.addEventListener('click', documentClickGuard, { capture: true });

        try {
            translation.dispatchEvent(createPointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', clientX: 10, clientY: 10 }));
            translation.dispatchEvent(createPointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', clientX: 10, clientY: 10 }));

            expect(shouldIgnoreDocumentClickTarget(translation)).toBe(true);
            expect(onClick).toHaveBeenCalledTimes(1);
            expect(translation.hasAttribute('data-immersion-translation-blurred')).toBe(false);
        } finally {
            document.removeEventListener('click', documentClickGuard, { capture: true });
        }
    });
});
