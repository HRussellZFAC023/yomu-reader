import { afterEach, describe, expect, it, vi } from 'vitest';

import { installLocalTapActivation } from '../../src/reader/ui/pointer-activation';
import { shouldIgnoreDocumentClickTarget } from '../../src/reader/app/native-page-lookup-targets';
import { createPointerEvent } from './helpers/browser-fixtures';
import {
    allowSyntheticReaderInteractionsForTests,
    installTrustedReaderRootBoundary,
    isDirectTrustedReaderInteraction,
} from '../../src/reader/ui/trusted-interaction';

function mountReaderButton(): HTMLButtonElement {
    document.body.innerHTML = `
        <div data-jpdb-reader-root="true">
            <button type="button" data-action="trace-toggle">辞書</button>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root]')!;
    installLocalTapActivation(root);
    return root.querySelector<HTMLButtonElement>('button')!;
}

function mountBlurredImmersionTranslation(): HTMLElement {
    document.body.innerHTML = `
        <div data-jpdb-reader-root="true">
            <div class="jpdb-reader-example-translation" data-immersion-translation-blurred="true" role="button" tabindex="0">Translation</div>
        </div>
    `;
    const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root]')!;
    installLocalTapActivation(root);
    return root.querySelector<HTMLElement>('.jpdb-reader-example-translation')!;
}

function mountDynamicReaderRailGrip(): { button: HTMLButtonElement; path: SVGPathElement } {
    document.body.innerHTML = `
        <div data-jpdb-reader-root="true">
            <button type="button" data-action="rail-expand" data-subtitle-rail-drag-handle>
                <svg><path d="M1 1h4"></path></svg>
            </button>
        </div>
    `;
    const button = document.querySelector<HTMLButtonElement>('[data-action="rail-expand"]')!;
    return { button, path: button.querySelector<SVGPathElement>('path')! };
}

function installDynamicReaderRailGrip(): {
    boundary: AbortController;
    button: HTMLButtonElement;
    path: SVGPathElement;
} {
    const boundary = new AbortController();
    installTrustedReaderRootBoundary(document, boundary.signal);
    return { boundary, ...mountDynamicReaderRailGrip() };
}

function installRootRemovalRetargetFixture(): {
    boundary: AbortController;
    path: SVGPathElement;
    root: HTMLElement;
    under: HTMLButtonElement;
} {
    const { boundary, button, path } = installDynamicReaderRailGrip();
    const root = button.closest<HTMLElement>('[data-jpdb-reader-root]')!;
    const under = document.createElement('button');
    document.body.prepend(under);
    button.addEventListener('click', () => root.remove());
    return { boundary, path, root, under };
}

function expectPointerUpDoesNotActivate(
    target: EventTarget,
    event: PointerEvent,
    onClick: ReturnType<typeof vi.fn>,
): void {
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
}

function dispatchCompatibilityMouseSequence(target: EventTarget, x: number, y: number): MouseEvent[] {
    const events = ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].map(type => new MouseEvent(type, {
        bubbles: type !== 'mouseenter',
        cancelable: type !== 'mouseenter',
        clientX: x,
        clientY: y,
        detail: type === 'click' ? 1 : 0,
    }));
    for (const event of events) target.dispatchEvent(event);
    return events;
}

function hideCompatibilityEventBeforeReader(type: 'mousedown' | 'mouseup'): () => void {
    const listener = (event: Event): void => event.stopImmediatePropagation();
    document.addEventListener(type, listener, { capture: true });
    return () => document.removeEventListener(type, listener, { capture: true });
}

function hidePointerDownBeforeReader(): () => void {
    const listener = (event: Event): void => {
        if ((event as PointerEvent).pointerType === 'mouse') event.stopImmediatePropagation();
    };
    document.addEventListener('pointerdown', listener, { capture: true });
    return () => document.removeEventListener('pointerdown', listener, { capture: true });
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
        const pointerup = createPointerEvent('pointerup', { pointerId: 7, pointerType, clientX: 22, clientY: 18 });
        button.dispatchEvent(pointerup);

        expect(pointerup.defaultPrevented).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1);

        const trailingEvents = dispatchCompatibilityMouseSequence(button, 0, 18);
        const trailingClick = trailingEvents.at(-1)!;

        expect(trailingEvents.filter(event => event.cancelable).every(event => event.defaultPrevented)).toBe(true);
        expect(trailingClick.defaultPrevented).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('leaves a mouse sequence outside the touch-adjusted gesture envelope alone', () => {
        const button = mountReaderButton();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        button.dispatchEvent(createPointerEvent('pointerdown', {
            pointerId: 34,
            pointerType: 'touch',
            clientX: 12,
            clientY: 18,
        }));
        button.dispatchEvent(createPointerEvent('pointerup', {
            pointerId: 34,
            pointerType: 'touch',
            clientX: 22,
            clientY: 18,
        }));

        const outside = dispatchCompatibilityMouseSequence(button, -5, 18);
        expect(outside.every(event => !event.defaultPrevented)).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(2);

        dispatchCompatibilityMouseSequence(button, 12, 18);
    });

    it('activates a nested SVG control mounted after the document boundary', () => {
        const { boundary, button, path } = installDynamicReaderRailGrip();
        button.closest<HTMLElement>('[data-jpdb-reader-root]')!.dataset.yomuPointerActivationInstalled = 'true';
        const onClick = vi.fn();
        button.addEventListener('click', event => {
            if (isDirectTrustedReaderInteraction(event)) onClick();
        });

        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 23,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 23,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            expect(onClick).toHaveBeenCalledTimes(1);

            dispatchCompatibilityMouseSequence(path, 12, 18);
            expect(onClick).toHaveBeenCalledTimes(1);

            const mouseDown = createPointerEvent('pointerdown', { pointerType: 'mouse' });
            const mouseUp = createPointerEvent('pointerup', { pointerType: 'mouse' });
            path.dispatchEvent(mouseDown);
            path.dispatchEvent(mouseUp);
            path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
            expect(mouseDown.defaultPrevented).toBe(false);
            expect(mouseUp.defaultPrevented).toBe(false);
            expect(onClick).toHaveBeenCalledTimes(2);
        } finally {
            boundary.abort();
        }
    });

    it('skips a forged SVG action and reaches the owning HTML control', () => {
        const { boundary, button, path } = installDynamicReaderRailGrip();
        path.setAttribute('data-action', 'host-forgery');
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 31,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 31,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            expect(onClick).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
        }
    });

    it('blocks a retargeted native mouse tail after a derived click removes its root', () => {
        const { boundary, path, under } = installRootRemovalRetargetFixture();
        const underEvents = vi.fn();
        for (const type of ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click']) {
            under.addEventListener(type, underEvents);
        }
        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 32,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 32,
                pointerType: 'touch',
                clientX: 20,
                clientY: 18,
            }));
            const tail = dispatchCompatibilityMouseSequence(under, 12, 18);
            expect(tail.filter(event => event.cancelable).every(event => event.defaultPrevented)).toBe(true);
            expect(underEvents).not.toHaveBeenCalled();

            under.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 33,
                pointerType: 'mouse',
                clientX: 12,
                clientY: 18,
            }));
            under.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 12,
                clientY: 18,
                detail: 1,
            }));
            expect(underEvents).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
        }
    });

    it.each(['mousedown', 'mouseup'] as const)(
        'blocks the final retargeted click when an earlier host listener hides %s',
        hiddenType => {
            const removeHostListener = hideCompatibilityEventBeforeReader(hiddenType);
            const { boundary, path, under } = installRootRemovalRetargetFixture();
            const onClick = vi.fn();
            under.addEventListener('click', onClick);

            try {
                path.dispatchEvent(createPointerEvent('pointerdown', {
                    pointerId: 35,
                    pointerType: 'touch',
                    clientX: 12,
                    clientY: 18,
                }));
                path.dispatchEvent(createPointerEvent('pointerup', {
                    pointerId: 35,
                    pointerType: 'touch',
                    clientX: 20,
                    clientY: 18,
                }));
                dispatchCompatibilityMouseSequence(under, 12, 18);
                expect(onClick).not.toHaveBeenCalled();
            } finally {
                boundary.abort();
                removeHostListener();
            }
        },
    );

    it('clears before an earlier document listener hides the next physical pointerdown', () => {
        const removeHostListener = hidePointerDownBeforeReader();
        const { boundary, path, root, under } = installRootRemovalRetargetFixture();
        const underEvents = vi.fn();
        for (const type of ['mousedown', 'mouseup', 'click']) under.addEventListener(type, underEvents);

        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 36,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 36,
                pointerType: 'touch',
                clientX: 20,
                clientY: 18,
            }));
            expect(root.isConnected).toBe(false);

            under.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 37,
                pointerType: 'mouse',
                clientX: 12,
                clientY: 18,
            }));
            dispatchCompatibilityMouseSequence(under, 12, 18);
            expect(underEvents).toHaveBeenCalledTimes(3);
        } finally {
            boundary.abort();
            removeHostListener();
        }
    });

    it.each([
        { deltaX: 9, deltaY: 0 },
        { deltaX: 5, deltaY: 5 },
    ])('does not activate a dynamic rail drag at $deltaX,$deltaY', ({ deltaX, deltaY }) => {
        const { boundary, button, path } = installDynamicReaderRailGrip();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 24,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            const pointerup = createPointerEvent('pointerup', {
                pointerId: 24,
                pointerType: 'touch',
                clientX: 12 + deltaX,
                clientY: 18 + deltaY,
            });
            expectPointerUpDoesNotActivate(path, pointerup, onClick);
        } finally {
            boundary.abort();
        }
    });

    it('keeps a dynamic rail drag sticky after an out-and-back move', () => {
        const { boundary, button, path } = installDynamicReaderRailGrip();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);

        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 29,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointermove', {
                pointerId: 29,
                pointerType: 'touch',
                clientX: 21,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointermove', {
                pointerId: 29,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            const pointerup = createPointerEvent('pointerup', {
                pointerId: 29,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            });
            expectPointerUpDoesNotActivate(path, pointerup, onClick);
        } finally {
            boundary.abort();
        }
    });

    it('lets rail drag cleanup consume its compatibility click before the next legitimate click', () => {
        const { boundary, button, path } = installDynamicReaderRailGrip();
        const onClick = vi.fn();
        button.addEventListener('click', event => {
            if (button.dataset.subtitleRailSuppressClick !== 'true') return;
            delete button.dataset.subtitleRailSuppressClick;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, { capture: true });
        button.addEventListener('click', onClick);
        window.addEventListener('pointerup', () => {
            button.dataset.subtitleRailSuppressClick = 'true';
        }, { once: true });

        try {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 25,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 25,
                pointerType: 'touch',
                clientX: 21,
                clientY: 18,
            }));

            expect(button.dataset.subtitleRailSuppressClick).toBe('true');
            path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
            expect(button.dataset.subtitleRailSuppressClick).toBeUndefined();
            expect(onClick).not.toHaveBeenCalled();

            path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
            expect(onClick).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
        }
    });

    it('releases and reinstalls the dynamic-root adapter with the document boundary lifecycle', () => {
        const firstBoundary = new AbortController();
        installTrustedReaderRootBoundary(document, firstBoundary.signal);
        const { button, path } = mountDynamicReaderRailGrip();
        const onClick = vi.fn();
        button.addEventListener('click', onClick);
        const tap = (pointerId: number): void => {
            path.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            path.dispatchEvent(createPointerEvent('pointerup', {
                pointerId,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
        };

        tap(26);
        expect(onClick).toHaveBeenCalledTimes(1);
        firstBoundary.abort();
        tap(27);
        expect(onClick).toHaveBeenCalledTimes(1);

        const secondBoundary = new AbortController();
        try {
            installTrustedReaderRootBoundary(document, secondBoundary.signal);
            tap(28);
            expect(onClick).toHaveBeenCalledTimes(2);
        } finally {
            secondBoundary.abort();
        }
    });

    it('keeps a root-local adapter and the document boundary exactly once while authorizing only the derived click', () => {
        const button = mountReaderButton();
        const root = button.closest<HTMLElement>('[data-jpdb-reader-root]')!;
        expect(root.dataset.yomuPointerActivationInstalled).toBe('true');
        delete root.dataset.yomuPointerActivationInstalled;
        const onClick = vi.fn();
        let derivedClick: MouseEvent | undefined;
        button.addEventListener('click', event => {
            if (!isDirectTrustedReaderInteraction(event)) return;
            derivedClick ??= event;
            onClick(event);
        });
        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            button.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 17,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            button.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 17,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));

            expect(onClick).toHaveBeenCalledTimes(1);
            expect(derivedClick).toBeDefined();

            allowSyntheticReaderInteractionsForTests(false);
            button.dispatchEvent(derivedClick!);
            button.click();
            expect(onClick).toHaveBeenCalledTimes(1);

            button.dispatchEvent(createPointerEvent('pointerdown', {
                pointerId: 18,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            button.dispatchEvent(createPointerEvent('pointerup', {
                pointerId: 18,
                pointerType: 'touch',
                clientX: 12,
                clientY: 18,
            }));
            expect(onClick).toHaveBeenCalledTimes(1);
        } finally {
            allowSyntheticReaderInteractionsForTests(true);
            boundary.abort();
        }
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

    it('leaves annotated Japanese inside a game button to the game control', () => {
        document.body.innerHTML = `
            <button type="button" class="academy-sentence-frame-token" data-jpdb-reader-interaction-ignore>
                <span class="jpdb-reader-word">わたし</span>
            </button>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        expect(shouldIgnoreDocumentClickTarget(word)).toBe(true);
    });
});
