import { isHostedYomuOrigin } from '../app/storage';

const SYNTHETIC_INTERACTION_TEST_SLOT = Symbol.for('yomu.reader.synthetic-interaction-tests');
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const READER_ROOT_INTERACTION_EVENTS = [
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

let pendingReaderControlClick: ReaderControlClickGrant | undefined;
const authorizedReaderControlClicks = new WeakSet<Event>();
const authorizedReaderControlEvents = new WeakSet<Event>();

function syntheticInteractionAllowedForTests(): boolean {
    return (globalThis as Record<PropertyKey, unknown>)[SYNTHETIC_INTERACTION_TEST_SLOT] === true;
}

/** A real browser gesture, without the hosted-shell policy shortcut. */
export function isDirectTrustedReaderInteraction(event: Event): boolean {
    return event.isTrusted
        || authorizedReaderControlClicks.has(event)
        || authorizedReaderControlEvents.has(event)
        || syntheticInteractionAllowedForTests();
}

/** Privileged Reader actions require a browser-authenticated user gesture. */
export function isTrustedReaderInteraction(event: Event): boolean {
    return isDirectTrustedReaderInteraction(event) || isHostedYomuOrigin();
}

export function trustedReaderEventHandler<T extends Event>(handler: (event: T) => void): (event: T) => void {
    return event => { if (isTrustedReaderInteraction(event)) handler(event); };
}

function blockUntrustedReaderRootInteraction(event: Event): boolean {
    const target = event.target instanceof Element ? event.target : null;
    if (claimReaderControlClick(event, target)) return false;
    if (!readerRootInteractionMustBeBlocked(event, target)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
}

function readerRootInteractionMustBeBlocked(event: Event, target: Element | null): boolean {
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
    for (const eventName of READER_ROOT_INTERACTION_EVENTS) {
        target.addEventListener(eventName, blockUntrustedReaderRootInteraction, {
            capture: true,
            passive: false,
            signal,
        });
    }
}

/** Authorize one exact, synchronous synthetic event created inside Yomu. */
export function dispatchAuthorizedReaderControlEvent(target: EventTarget, event: Event): boolean {
    authorizedReaderControlEvents.add(event);
    try {
        return target.dispatchEvent(event);
    } finally {
        authorizedReaderControlEvents.delete(event);
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
    if (pendingReaderControlClick) return;
    const grant: ReaderControlClickGrant = { target };
    pendingReaderControlClick = grant;
    try {
        target.click();
    } finally {
        if (grant.event) authorizedReaderControlClicks.delete(grant.event);
        if (pendingReaderControlClick === grant) pendingReaderControlClick = undefined;
    }
}

function claimReaderControlClick(event: Event, target: Element | null): boolean {
    const grant = pendingReaderControlClick;
    if (!grant || event.type !== 'click' || target !== grant.target) return false;
    pendingReaderControlClick = undefined;
    grant.event = event;
    authorizedReaderControlClicks.add(event);
    return true;
}

/** Unit tests exercise DOM handlers with synthetic jsdom events. */
export function allowSyntheticReaderInteractionsForTests(allowed: boolean): void {
    (globalThis as Record<PropertyKey, unknown>)[SYNTHETIC_INTERACTION_TEST_SLOT] = allowed;
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
