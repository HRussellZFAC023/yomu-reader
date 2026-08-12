import {
    dispatchAuthorizedReaderControlClick,
    isDirectTrustedReaderInteraction,
} from './trusted-interaction';

const CONTROL_POINTER_ACTIVATION_SELECTOR = [
    'button',
    'a[href]',
    'summary',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[data-action]',
    '[data-token-choice]',
].join(',');

const CONTROL_POINTER_TAP_SLOP_PX = 12;

type ControlPointerTap = {
    pointerId: number;
    target: HTMLElement;
    x: number;
    y: number;
};

type ControlClickGuard = {
    target: HTMLElement;
    expiresAt: number;
};

export function installReaderControlPointerActivation(root: HTMLElement): void {
    if (root.dataset.yomuPointerActivationInstalled === 'true') return;
    root.dataset.yomuPointerActivationInstalled = 'true';

    let tap: ControlPointerTap | undefined;
    let clickGuard: ControlClickGuard | undefined;

    root.addEventListener('pointerdown', event => {
        if (!isDirectControlPointer(event) || event.button !== 0) {
            if (tap?.pointerId === event.pointerId) tap = undefined;
            return;
        }
        const target = controlPointerTarget(event.target, root);
        tap = target
            ? { pointerId: event.pointerId, target, x: event.clientX, y: event.clientY }
            : undefined;
    }, { capture: true });

    root.addEventListener('pointerup', event => {
        const activeTap = matchingPointerTap(tap, event);
        if (!activeTap) return;
        tap = undefined;
        const target = releasedControlTarget(activeTap, event, root);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        dispatchAuthorizedReaderControlClick(target);
        clickGuard = { target, expiresAt: Date.now() + 750 };
    }, { capture: true });

    root.addEventListener('pointercancel', event => {
        if (tap?.pointerId === event.pointerId) tap = undefined;
    }, { capture: true });

    root.addEventListener('click', event => {
        const guard = clickGuard;
        if (!guard) return;
        if (Date.now() > guard.expiresAt) {
            clickGuard = undefined;
            return;
        }
        const target = controlPointerTarget(event.target, root);
        if (target !== guard.target) return;
        if (event.detail === 0 && !event.isTrusted) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        clickGuard = undefined;
    }, { capture: true });
}

function matchingPointerTap(tap: ControlPointerTap | undefined, event: PointerEvent): ControlPointerTap | undefined {
    if (!tap || tap.pointerId !== event.pointerId) return undefined;
    return tap;
}

function releasedControlTarget(tap: ControlPointerTap, event: PointerEvent, root: HTMLElement): HTMLElement | null {
    if (!isDirectControlPointer(event)) return null;
    const target = controlPointerTarget(event.target, root);
    if (target !== tap.target) return null;
    return pointerTravel(tap, event) <= CONTROL_POINTER_TAP_SLOP_PX ? target : null;
}

function pointerTravel(tap: ControlPointerTap, event: PointerEvent): number {
    return Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
}

function isDirectControlPointer(event: PointerEvent): boolean {
    return isDirectTrustedReaderInteraction(event)
        && (event.pointerType === 'pen' || event.pointerType === 'touch')
        && event.isPrimary !== false;
}

function controlPointerTarget(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
    const element = target instanceof Element ? target : null;
    const control = element?.closest<HTMLElement>(CONTROL_POINTER_ACTIVATION_SELECTOR) ?? null;
    if (!control || !root.contains(control) || isDisabledControl(control)) return null;
    return control;
}

function isDisabledControl(control: HTMLElement): boolean {
    if (control.getAttribute('aria-disabled') === 'true') return true;
    if (control.closest('[aria-disabled="true"]')) return true;
    return control.matches(':disabled, fieldset[disabled] *');
}
