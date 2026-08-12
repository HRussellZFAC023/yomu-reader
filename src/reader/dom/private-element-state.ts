const TOKEN_ATTRIBUTE = 'data-yomu-private-token';
const MAX_PENDING_VALUES = 16_384;

interface PendingPrivateValue {
    slot: symbol;
    value: unknown;
}

interface PrivateElementStateSlotOptions {
    /** Keep an isolated blueprint so reader-owned serialized caches can remint. */
    replayable?: boolean;
}

export interface PrivateElementStateSlot<T> {
    /** Register a value before an HTML string is parsed into live Elements. */
    attributes(value: T): string;
    /** Stamp a detached Element that will be serialized before insertion. */
    prepareSerialization(element: Element, value: T): void;
    /** Bind a programmatically-created Element without exposing the value. */
    bind(element: Element, value: T): void;
    /** Read only eagerly-bound state; live DOM tokens are never trusted. */
    read(element: Element | null | undefined): T | undefined;
}

const valuesByElement = new WeakMap<Element, Map<symbol, unknown>>();
const pendingValues = new Map<string, PendingPrivateValue>();
const replayableBlueprints = new Map<string, PendingPrivateValue>();

/**
 * Creates a typed facade over the single private Element-state registry.
 * Different domains (commands, rendered-word identity) share hydration and
 * replay protection without sharing keys or being able to read each other.
 */
export function createPrivateElementStateSlot<T>(snapshot: (value: T) => T, options: PrivateElementStateSlotOptions = {}): PrivateElementStateSlot<T> {
    const slot = Symbol('yomu-private-element-state');
    return {
        attributes(value: T): string {
            const token = registerPendingValue(slot, snapshot(value), options.replayable === true);
            return ` ${TOKEN_ATTRIBUTE}="${token}"`;
        },
        prepareSerialization(element: Element, value: T): void {
            const token = registerPendingValue(slot, snapshot(value), options.replayable === true);
            const current = element.getAttribute(TOKEN_ATTRIBUTE)?.trim();
            element.setAttribute(TOKEN_ATTRIBUTE, current ? `${current} ${token}` : token);
        },
        bind(element: Element, value: T): void {
            element.removeAttribute(TOKEN_ATTRIBUTE);
            setPrivateValue(element, slot, snapshot(value));
        },
        read(element: Element | null | undefined): T | undefined {
            return element ? valuesByElement.get(element)?.get(slot) as T | undefined : undefined;
        },
    };
}

function registerPendingValue(slot: symbol, value: unknown, replayable: boolean): string {
    const token = privateStateToken();
    const pending = { slot, value };
    pendingValues.set(token, pending);
    if (replayable) replayableBlueprints.set(token, pending);
    prunePendingValues();
    return token;
}

/**
 * Remints tokens in a reader-owned serialized cache. Raw token replay remains
 * inert: only this explicit call re-arms a recognized replayable blueprint,
 * and it always substitutes a new opaque token before parsing.
 */
export function remintPrivateElementStateTokens(html: string): string {
    return html.replace(/data-yomu-private-token=(['"])([^'"\s>]+)\1/gu, (attribute, quote: string, token: string) => {
        const blueprint = replayableBlueprints.get(token);
        if (!blueprint) return attribute;
        pendingValues.delete(token);
        const freshToken = privateStateToken();
        pendingValues.set(freshToken, blueprint);
        prunePendingValues();
        return `${TOKEN_ATTRIBUTE}=${quote}${freshToken}${quote}`;
    });
}

/** Internal HTML-sink hook; callers should use `setInnerHtml`. */
export function hydratePrivateElementState(root: ParentNode): void {
    const candidates: Element[] = [];
    if (root instanceof Element && root.hasAttribute(TOKEN_ATTRIBUTE)) candidates.push(root);
    candidates.push(...root.querySelectorAll(`[${TOKEN_ATTRIBUTE}]`));
    for (const element of candidates) hydratePrivateElement(element);
}

function hydratePrivateElement(element: Element): void {
    const tokens = element.getAttribute(TOKEN_ATTRIBUTE)?.split(/\s+/u).filter(Boolean) ?? [];
    element.removeAttribute(TOKEN_ATTRIBUTE);
    for (const token of tokens) {
        const pending = pendingValues.get(token);
        pendingValues.delete(token);
        if (pending) setPrivateValue(element, pending.slot, pending.value);
    }
}

function setPrivateValue(element: Element, slot: symbol, value: unknown): void {
    const values = valuesByElement.get(element) ?? new Map<symbol, unknown>();
    values.set(slot, value);
    valuesByElement.set(element, values);
}

function prunePendingValues(): void {
    pruneOldestPrivateValues(pendingValues);
    pruneOldestPrivateValues(replayableBlueprints);
}

function pruneOldestPrivateValues(values: Map<string, PendingPrivateValue>): void {
    while (values.size > MAX_PENDING_VALUES) {
        const oldest = values.keys().next().value;
        if (oldest === undefined) return;
        values.delete(oldest);
    }
}

function privateStateToken(): string {
    const bytes = new Uint32Array(4);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(36)).join('-');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
