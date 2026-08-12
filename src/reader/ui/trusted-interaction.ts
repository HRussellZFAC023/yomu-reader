import { isHostedYomuOrigin } from '../app/storage';
import { armCompatibilityGuard, installCompatibilityGuard } from './control-compatibility-guard';
import { closestReaderControlElement, readerControlIsDisabled } from './control-pointer-target';
import { sandboxSharedState, syntheticEventsAllowed } from './sandbox-shared-state';

export { allowSyntheticReaderInteractionsForTests } from './sandbox-shared-state';

const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const TAP_SLOP_PX = 12;
const DRAG_HANDLE_SLOP_PX = 8;
const BOUNDARY_EVENTS = [
    'click', 'dblclick', 'auxclick', 'contextmenu',
    'beforeinput', 'input', 'change', 'submit', 'keydown', 'keyup', 'paste', 'drop',
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout',
    'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout',
    'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel',
] as const;

type ReaderControlClickGrant = {
    target: HTMLElement;
    event?: Event;
};

type ControlPointerTap = {
    pointerId: number;
    target: HTMLElement;
    root: Element;
    x: number;
    y: number;
};

type TrustedInteractionState = {
    pendingClick: { grant?: ReaderControlClickGrant };
    authorizedClicks: WeakSet<Event>;
    authorizedEvents: WeakSet<Event>;
    localActivationRoots: WeakSet<HTMLElement>;
    documentActivation: WeakMap<Document, AbortSignal | null>;
};

// Trust granted here must be recognized by every bundle in the sandbox, and
// gesture lifecycle claims must be exclusive across all of them.
const sharedState = sandboxSharedState<TrustedInteractionState>('yomu.trusted-interaction.v1', () => ({
    pendingClick: {},
    authorizedClicks: new WeakSet(),
    authorizedEvents: new WeakSet(),
    localActivationRoots: new WeakSet(),
    documentActivation: new WeakMap(),
}));

/** Privately claim a root whose own lifecycle owns touch/pen activation. */
export function claimLocalTapActivation(root: HTMLElement): boolean {
    if (sharedState.localActivationRoots.has(root)) return false;
    sharedState.localActivationRoots.add(root);
    return true;
}

/** A real browser gesture, without the hosted-shell policy shortcut. */
export function isDirectTrustedReaderInteraction(event: Event): boolean {
    return event.isTrusted
        || sharedState.authorizedClicks.has(event)
        || sharedState.authorizedEvents.has(event)
        || syntheticEventsAllowed();
}

/** Privileged Reader actions require a browser-authenticated user gesture. */
export function isTrustedReaderInteraction(event: Event): boolean {
    return isDirectTrustedReaderInteraction(event) || isHostedYomuOrigin();
}

export function trustedReaderEventHandler<T extends Event>(handler: (event: T) => void): (event: T) => void {
    return event => { if (isTrustedReaderInteraction(event)) handler(event); };
}

function blockUntrustedRootInteraction(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (claimReaderControlClick(event, target)) return;
    if (!mustBlockRootInteraction(event, target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}

function mustBlockRootInteraction(event: Event, target: Element | null): boolean {
    return Boolean(readerRootFromEvent(event, target)) && !isTrustedReaderInteraction(event);
}

function readerRootFromEvent(event: Event, target: Element | null): Element | null {
    return closestReaderRoot(target)
        ?? eventComposedPath(event).map(closestReaderRoot).find((root): root is Element => Boolean(root))
        ?? null;
}

function closestReaderRoot(node: unknown): Element | null {
    return node instanceof Element ? node.closest(READER_ROOT_SELECTOR) : null;
}

function eventComposedPath(event: Event): EventTarget[] {
    return typeof event.composedPath === 'function' ? event.composedPath() : [];
}

/** Install before Reader surfaces so hostile page listeners cannot run first. */
export function installTrustedReaderRootBoundary(target: Document, signal?: AbortSignal): void {
    installCompatibilityGuard(target);
    for (const eventName of BOUNDARY_EVENTS) {
        target.addEventListener(eventName, blockUntrustedRootInteraction, {
            capture: true,
            passive: false,
            signal,
        });
    }
    installDocumentTapActivation(target, signal);
}


/**
 * Give dynamically mounted Reader roots one reliable touch/pen activation
 * path. Surfaces with their own adapter are privately claimed and skipped, so
 * one gesture always has exactly one lifecycle owner.
 */
function installDocumentTapActivation(documentTarget: Document, signal?: AbortSignal): void {
    if (!claimDocumentActivation(documentTarget, signal)) return;
    const resolveControl = (target: EventTarget | null): ControlPointerTarget | null =>
        documentControlTarget(target, documentTarget);
    installControlTapActivation(documentTarget, documentTarget, resolveControl, { signal });
}

export type ControlPointerTarget = { target: HTMLElement; root: Element };

type ControlResolver = (target: EventTarget | null) => ControlPointerTarget | null;

type ReaderControlTapOptions = {
    stopOnActivate?: boolean;
    signal?: AbortSignal;
};

/** Shared touch/pen tap state machine behind both lifecycle adapters. */
export function installControlTapActivation(
    listenTarget: GlobalEventHandlers,
    ownerDocument: Document,
    resolveControl: ControlResolver,
    options: ReaderControlTapOptions = {},
): void {
    const state: { tap?: ControlPointerTap } = {};
    const listenerOptions = { capture: true, passive: false, signal: options.signal } as const;

    listenTarget.addEventListener('pointerdown', event => updatePointerTap(state, event, resolveControl), listenerOptions);
    listenTarget.addEventListener('pointerup', event => activatePointerTap(state, event, ownerDocument, resolveControl, options), listenerOptions);
    listenTarget.addEventListener('pointermove', event => invalidateMovedTap(state, event), listenerOptions);
    listenTarget.addEventListener('pointercancel', event => clearPointerTap(state, event), listenerOptions);
}

function claimDocumentActivation(target: Document, signal?: AbortSignal): boolean {
    if (documentActivationHeld(target)) return false;
    const lifecycle = signal ?? null;
    sharedState.documentActivation.set(target, lifecycle);
    lifecycle?.addEventListener('abort', () => {
        if (sharedState.documentActivation.get(target) === lifecycle) sharedState.documentActivation.delete(target);
    }, { once: true });
    return true;
}

function documentActivationHeld(target: Document): boolean {
    if (!sharedState.documentActivation.has(target)) return false;
    // A null lifecycle is a permanent claim; a signal holds until aborted.
    const lifecycle = sharedState.documentActivation.get(target) as AbortSignal | null;
    return lifecycle === null || !lifecycle.aborted;
}

function updatePointerTap(
    state: { tap?: ControlPointerTap },
    event: PointerEvent,
    resolveControl: ControlResolver,
): void {
    const control = downControl(event, resolveControl);
    if (control) state.tap = { pointerId: event.pointerId, target: control.target, root: control.root, x: event.clientX, y: event.clientY };
    else clearPointerTap(state, event);
}

function downControl(event: PointerEvent, resolveControl: ControlResolver): ControlPointerTarget | null {
    if (event.button !== 0) return null;
    return isDirectControlPointer(event) ? resolveControl(event.target) : null;
}

function activatePointerTap(
    state: { tap?: ControlPointerTap },
    event: PointerEvent,
    ownerDocument: Document,
    resolveControl: ControlResolver,
    options: ReaderControlTapOptions,
): void {
    const tap = consumePointerTap(state, event);
    if (!tap) return;
    const control = releasedControl(tap, event, resolveControl);
    if (!control) return;
    event.preventDefault();
    if (options.stopOnActivate) event.stopPropagation();
    armCompatibilityGuard(ownerDocument, event, tap.x, tap.y);
    dispatchAuthorizedReaderControlClick(control.target);
}

function consumePointerTap(
    state: { tap?: ControlPointerTap },
    event: PointerEvent,
): ControlPointerTap | undefined {
    if (state.tap?.pointerId !== event.pointerId) return undefined;
    const tap = state.tap;
    state.tap = undefined;
    return tap;
}

function releasedControl(
    tap: ControlPointerTap,
    event: PointerEvent,
    resolveControl: ControlResolver,
): ControlPointerTarget | null {
    if (!isDirectControlPointer(event)) return null;
    if (!tapWithinSlop(tap, event)) return null;
    const control = resolveControl(event.target);
    return matchesTap(control, tap) ? control : null;
}

function matchesTap(
    control: ControlPointerTarget | null,
    tap: ControlPointerTap,
): control is ControlPointerTarget {
    return control?.target === tap.target && control.root === tap.root;
}

function invalidateMovedTap(state: { tap?: ControlPointerTap }, event: PointerEvent): void {
    if (state.tap?.pointerId !== event.pointerId) return;
    if (!tapWithinSlop(state.tap, event)) state.tap = undefined;
}

function clearPointerTap(state: { tap?: ControlPointerTap }, event: PointerEvent): void {
    if (state.tap?.pointerId === event.pointerId) state.tap = undefined;
}

function tapWithinSlop(tap: ControlPointerTap, event: PointerEvent): boolean {
    const deltaX = Math.abs(event.clientX - tap.x);
    const deltaY = Math.abs(event.clientY - tap.y);
    if (tap.target.hasAttribute('data-subtitle-rail-drag-handle')) {
        return deltaX + deltaY <= DRAG_HANDLE_SLOP_PX;
    }
    return Math.hypot(deltaX, deltaY) <= TAP_SLOP_PX;
}

function isDirectControlPointer(event: PointerEvent): boolean {
    return isDirectTrustedReaderInteraction(event)
        && (event.pointerType === 'pen' || event.pointerType === 'touch')
        && event.isPrimary !== false;
}

function documentControlTarget(
    target: EventTarget | null,
    documentTarget: Document,
): ControlPointerTarget | null {
    const control = enabledReaderControl(target);
    if (!control) return null;
    const root = documentControlRoot(control, documentTarget);
    return root ? { target: control, root } : null;
}

/** The nearest enabled HTML Reader control, or null. */
export function enabledReaderControl(target: EventTarget | null): HTMLElement | null {
    const control = closestReaderControlElement(target);
    return control && !readerControlIsDisabled(control) ? control : null;
}

function documentControlRoot(control: HTMLElement, target: Document): Element | null {
    const root = control.closest(READER_ROOT_SELECTOR);
    if (!root || root.ownerDocument !== target) return null;
    return hasLocalTapActivation(root) ? null : root;
}

function hasLocalTapActivation(root: Element): boolean {
    return root instanceof HTMLElement && sharedState.localActivationRoots.has(root);
}

/** Authorize one exact, synchronous synthetic event created inside Yomu. */
export function dispatchAuthorizedReaderControlEvent(target: EventTarget, event: Event): boolean {
    sharedState.authorizedEvents.add(event);
    try {
        return target.dispatchEvent(event);
    } finally {
        sharedState.authorizedEvents.delete(event);
    }
}

/**
 * Turn one directly trusted touch/pen release into the control's native click.
 *
 * `HTMLElement.click()` is browser-untrusted even when Yomu calls it while
 * handling a trusted pointer event. Keep the exception inside this Module:
 * only the exact synchronous click on the exact control can be claimed by the
 * document gate, and downstream Reader handlers recognize only that Event.
 */
export function dispatchAuthorizedReaderControlClick(target: HTMLElement): void {
    if (sharedState.pendingClick.grant) return;
    const grant: ReaderControlClickGrant = { target };
    sharedState.pendingClick.grant = grant;
    try {
        target.click();
    } finally {
        if (grant.event) sharedState.authorizedClicks.delete(grant.event);
        if (sharedState.pendingClick.grant === grant) sharedState.pendingClick.grant = undefined;
    }
}

function claimReaderControlClick(event: Event, target: Element | null): boolean {
    const grant = sharedState.pendingClick.grant;
    if (!grant || event.type !== 'click' || target !== grant.target) return false;
    sharedState.pendingClick.grant = undefined;
    grant.event = event;
    sharedState.authorizedClicks.add(event);
    return true;
}

/**
 * Browsers mark the submit fired by `form.requestSubmit()` as trusted, even
 * when a host-page script invoked it. Require a preceding direct click or
 * Enter gesture, and consume that authorization in the same task.
 */
export class ReaderFormSubmitAuthorization {
    private armed = false;
    private revision = 0;

    arm(event: Event): void {
        if (!isDirectTrustedReaderInteraction(event)) return;
        this.armed = true;
        const revision = ++this.revision;
        queueMicrotask(() => {
            if (this.revision === revision) this.armed = false;
        });
    }

    consume(event: Event): boolean {
        // Synthetic jsdom submits remain available only under the explicit
        // test override. A browser-trusted submit still needs the armed token.
        const allowed = this.armed
            || (!event.isTrusted && isDirectTrustedReaderInteraction(event));
        this.armed = false;
        this.revision += 1;
        return allowed;
    }
}

/**
 * Bind one submit path whose authorization is owned by the Reader form rather
 * than by the browser's `submit` event trust bit.
 */
export function bindAuthorizedReaderFormSubmit(form: HTMLFormElement, onSubmit: () => void): void {
    const authorization = new ReaderFormSubmitAuthorization();
    form.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        const submit = target?.closest('button:not([type]), button[type="submit"], input[type="submit"]');
        if (submit && form.contains(submit)) authorization.arm(event);
    }, { capture: true });
    form.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) authorization.arm(event);
    }, { capture: true });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (authorization.consume(event)) onSubmit();
    });
}
