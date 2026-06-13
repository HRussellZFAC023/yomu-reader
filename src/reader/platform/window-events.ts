const initialWindowDispatchEvent = initialWindowMethod('dispatchEvent');
const initialWindowAddEventListener = initialWindowMethod('addEventListener');
const initialWindowRemoveEventListener = initialWindowMethod('removeEventListener');

export function createWindowEvent(type: string, init: EventInit = {}): Event {
    const documentEvent = createDocumentEvent(type, init);
    if (documentEvent) return documentEvent;

    const EventConstructor = eventConstructor<Event>(window, 'Event') ?? eventConstructor<Event>(globalThis, 'Event');
    if (EventConstructor) {
        try {
            return new EventConstructor(type, init);
        } catch {
        }
    }

    throw new Error(`Unable to create window event: ${type}`);
}

export function createWindowCustomEvent<T>(type: string, detail?: T, init: Omit<CustomEventInit<T>, 'detail'> = {}): CustomEvent<T> {
    const eventInit: CustomEventInit<T> = { ...init, detail: cloneCustomEventDetail(detail) };
    const documentEvent = createDocumentCustomEvent(type, eventInit);
    if (documentEvent) return documentEvent;

    const CustomEventConstructor = eventConstructor<CustomEvent<T>>(window, 'CustomEvent') ?? eventConstructor<CustomEvent<T>>(globalThis, 'CustomEvent');
    if (CustomEventConstructor) {
        try {
            return new CustomEventConstructor(type, eventInit);
        } catch {
        }
    }

    throw new Error(`Unable to create window custom event: ${type}`);
}

type FirefoxCloneInto = (value: unknown, targetScope: object, options?: { cloneFunctions?: boolean; wrapReflectors?: boolean }) => unknown;

function cloneCustomEventDetail<T>(detail: T): T {
    if (detail === undefined || typeof window === 'undefined') return detail;
    return pageCompartmentValue(detail, { cloneFunctions: false, wrapReflectors: true });
}

export function dispatchWindowEvent(event: Event): boolean {
    const target = window;
    const directDispatch = readMethod<EventTarget['dispatchEvent']>(target, 'dispatchEvent');
    const directResult = callEventTargetMethod(directDispatch, target, event);
    if (directResult.called) return directResult.result;

    const initialResult = initialWindowDispatchEvent === directDispatch
        ? { called: false } as DispatchCallResult
        : callEventTargetMethod(initialWindowDispatchEvent, target, event);
    if (initialResult.called) return initialResult.result;

    const prototypeResult = dispatchWithPrototypeMethod(target, directDispatch, event);
    if (prototypeResult.called) return prototypeResult.result;

    const unshadowedResult = callWithUnshadowedWindowDispatch(event);
    if (unshadowedResult.called) return unshadowedResult.result;

    return false;
}

export function addWindowEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): boolean {
    const target = window;
    const directAdd = readMethod<EventTarget['addEventListener']>(target, 'addEventListener');
    const directResult = callAddEventListener(directAdd, target, type, listener, options);
    if (directResult.called) return true;

    const initialResult = initialWindowAddEventListener === directAdd
        ? { called: false } as AddListenerCallResult
        : callAddEventListener(initialWindowAddEventListener, target, type, listener, options);
    if (initialResult.called) return true;

    const prototypeResult = addListenerWithPrototypeMethod(target, directAdd, type, listener, options);
    if (prototypeResult.called) return true;

    const unshadowedResult = callWithUnshadowedWindowAddEventListener(type, listener, options);
    if (unshadowedResult.called) return true;

    return false;
}

export function removeWindowEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
): boolean {
    const target = window;
    const directRemove = readMethod<EventTarget['removeEventListener']>(target, 'removeEventListener');
    const directResult = callRemoveEventListener(directRemove, target, type, listener, options);
    if (directResult.called) return true;

    const initialResult = initialWindowRemoveEventListener === directRemove
        ? { called: false } as AddListenerCallResult
        : callRemoveEventListener(initialWindowRemoveEventListener, target, type, listener, options);
    if (initialResult.called) return true;

    const prototypeResult = removeListenerWithPrototypeMethod(target, directRemove, type, listener, options);
    if (prototypeResult.called) return true;

    const unshadowedResult = callWithUnshadowedWindowRemoveEventListener(type, listener, options);
    if (unshadowedResult.called) return true;

    return false;
}

function initialWindowMethod<K extends 'dispatchEvent' | 'addEventListener' | 'removeEventListener'>(key: K): EventTarget[K] | undefined {
    if (typeof window === 'undefined') return undefined;
    return readMethod<EventTarget[K]>(window, key);
}

function dispatchWithPrototypeMethod(
    target: EventTarget,
    directDispatch: EventTarget['dispatchEvent'] | undefined,
    event: Event,
): DispatchCallResult {
    for (const prototypeDispatch of eventTargetPrototypeMethods(target, 'dispatchEvent')) {
        if (prototypeDispatch === directDispatch) continue;
        const result = callEventTargetMethod(prototypeDispatch, target, event);
        if (result.called) return result;
    }
    return { called: false };
}

function addListenerWithPrototypeMethod(
    target: EventTarget,
    directAdd: EventTarget['addEventListener'] | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): AddListenerCallResult {
    for (const prototypeAdd of eventTargetPrototypeMethods(target, 'addEventListener')) {
        if (prototypeAdd === directAdd) continue;
        const result = callAddEventListener(prototypeAdd, target, type, listener, options);
        if (result.called) return result;
    }
    return { called: false };
}

function removeListenerWithPrototypeMethod(
    target: EventTarget,
    directRemove: EventTarget['removeEventListener'] | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
): AddListenerCallResult {
    for (const prototypeRemove of eventTargetPrototypeMethods(target, 'removeEventListener')) {
        if (prototypeRemove === directRemove) continue;
        const result = callRemoveEventListener(prototypeRemove, target, type, listener, options);
        if (result.called) return result;
    }
    return { called: false };
}

function eventConstructor<T extends Event>(source: unknown, key: 'Event' | 'CustomEvent'): (new (type: string, init?: EventInit | CustomEventInit) => T) | undefined {
    const value = readProperty(source, key);
    return typeof value === 'function' ? value as new (type: string, init?: EventInit | CustomEventInit) => T : undefined;
}

function createDocumentEvent(type: string, init: EventInit): Event | undefined {
    if (typeof document === 'undefined' || typeof document.createEvent !== 'function') return undefined;
    try {
        const event = document.createEvent('Event');
        event.initEvent(type, Boolean(init.bubbles), Boolean(init.cancelable));
        return event;
    } catch {
        return undefined;
    }
}

function createDocumentCustomEvent<T>(type: string, init: CustomEventInit<T>): CustomEvent<T> | undefined {
    if (typeof document === 'undefined' || typeof document.createEvent !== 'function') return undefined;
    try {
        const event = document.createEvent('CustomEvent');
        event.initCustomEvent(type, Boolean(init.bubbles), Boolean(init.cancelable), init.detail);
        return event as CustomEvent<T>;
    } catch {
        return undefined;
    }
}

function eventTargetPrototypeMethods<K extends 'dispatchEvent' | 'addEventListener' | 'removeEventListener'>(target: EventTarget, key: K): Array<EventTarget[K]> {
    const methods: Array<EventTarget[K]> = [];
    const add = (method: EventTarget[K] | undefined) => {
        if (method && !methods.includes(method)) methods.push(method);
    };

    let prototype = Object.getPrototypeOf(target);
    while (prototype) {
        add(readOwnMethod<EventTarget[K]>(prototype, key));
        prototype = Object.getPrototypeOf(prototype);
    }

    const WindowEventTarget = readProperty(window, 'EventTarget') as { prototype?: EventTarget } | undefined;
    add(readMethod<EventTarget[K]>(WindowEventTarget?.prototype, key));
    if (typeof EventTarget !== 'undefined') add(readMethod<EventTarget[K]>(EventTarget.prototype, key));
    return methods;
}

function readMethod<T>(source: unknown, key: string): T | undefined {
    const value = readProperty(source, key);
    return typeof value === 'function' ? value as T : undefined;
}

function readOwnMethod<T>(source: unknown, key: string): T | undefined {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) return undefined;
    if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined;
    return readMethod<T>(source, key);
}

function readProperty(source: unknown, key: string): unknown {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) return undefined;
    try {
        return (source as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

type DispatchCallResult = { called: true; result: boolean } | { called: false; error?: unknown };
type AddListenerCallResult = { called: true } | { called: false; error?: unknown };

function callEventTargetMethod(
    method: EventTarget['dispatchEvent'] | undefined,
    target: EventTarget,
    event: Event,
): DispatchCallResult {
    if (!method) return { called: false };
    try {
        return { called: true, result: method.call(target, event) };
    } catch (error) {
        return { called: false, error };
    }
}

function callAddEventListener(
    method: EventTarget['addEventListener'] | undefined,
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): AddListenerCallResult {
    if (!method) return { called: false };
    try {
        method.call(target, type, listener, options);
        return { called: true };
    } catch (error) {
        return { called: false, error };
    }
}

function callRemoveEventListener(
    method: EventTarget['removeEventListener'] | undefined,
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
): AddListenerCallResult {
    if (!method) return { called: false };
    try {
        method.call(target, type, listener, options);
        return { called: true };
    } catch (error) {
        return { called: false, error };
    }
}

function callWithUnshadowedWindowDispatch(event: Event): DispatchCallResult {
    const target = (window as any).wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor('dispatchEvent');
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
        if (!Reflect.deleteProperty(target, 'dispatchEvent')) return { called: false };
        return callEventTargetMethod(readMethod<EventTarget['dispatchEvent']>(window, 'dispatchEvent'), window, event);
    } catch (error) {
        return { called: false, error };
    } finally {
        restoreWindowProperty('dispatchEvent', descriptor);
    }
}

function callWithUnshadowedWindowAddEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): AddListenerCallResult {
    const target = (window as any).wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor('addEventListener');
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
        if (!Reflect.deleteProperty(target, 'addEventListener')) return { called: false };
        return callAddEventListener(readMethod<EventTarget['addEventListener']>(window, 'addEventListener'), window, type, listener, options);
    } catch (error) {
        return { called: false, error };
    } finally {
        restoreWindowProperty('addEventListener', descriptor);
    }
}

function callWithUnshadowedWindowRemoveEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
): AddListenerCallResult {
    const target = (window as any).wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor('removeEventListener');
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
        if (!Reflect.deleteProperty(target, 'removeEventListener')) return { called: false };
        return callRemoveEventListener(readMethod<EventTarget['removeEventListener']>(window, 'removeEventListener'), window, type, listener, options);
    } catch (error) {
        return { called: false, error };
    } finally {
        restoreWindowProperty('removeEventListener', descriptor);
    }
}

function restoreWindowProperty(key: 'dispatchEvent' | 'addEventListener' | 'removeEventListener', descriptor: PropertyDescriptor): void {
    try {
        const target = (window as any).wrappedJSObject || window;
        Object.defineProperty(target, key, pageCompartmentDescriptor(normalizedPropertyDescriptor(descriptor), target));
    } catch {
    }
}

// Firefox content scripts may not define sandbox-created objects onto the
// page's Xray-waived window ("Not allowed to define cross-origin object as
// property"); the descriptor must be cloned into the page compartment first.
export function pageCompartmentDescriptor(descriptor: PropertyDescriptor, _target: object): PropertyDescriptor {
    return pageCompartmentValue(descriptor, { cloneFunctions: true, wrapReflectors: true });
}

export function pageCompartmentValue<T>(value: T, options: { cloneFunctions?: boolean; wrapReflectors?: boolean } = {}): T {
    const cloneInto = readMethod<FirefoxCloneInto>(globalThis, 'cloneInto');
    if (!cloneInto || typeof window === 'undefined') return value;
    try {
        return cloneInto(value, window, options) as T;
    } catch {
        return value;
    }
}

export function safeWindowPropertyDescriptor(key: 'dispatchEvent' | 'addEventListener' | 'removeEventListener'): PropertyDescriptor | undefined {
    try {
        const target = (window as any).wrappedJSObject || window;
        return Object.getOwnPropertyDescriptor(target, key);
    } catch {
        return undefined;
    }
}

export function shouldTemporarilyUnshadowWindowProperty(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor {
    if (!descriptor) return false;
    try {
        return typeof descriptor.value !== 'function';
    } catch {
        return false;
    }
}

export function normalizedPropertyDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
    const hasDataShape = Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || Object.prototype.hasOwnProperty.call(descriptor, 'writable');
    const hasAccessorShape = Object.prototype.hasOwnProperty.call(descriptor, 'get')
        || Object.prototype.hasOwnProperty.call(descriptor, 'set');
    if (!hasDataShape || !hasAccessorShape) return descriptor;
    try {
        return {
            configurable: descriptor.configurable,
            enumerable: descriptor.enumerable,
            value: descriptor.value,
            writable: descriptor.writable,
        };
    } catch {
        return {
            configurable: true,
            value: undefined,
            writable: true,
        };
    }
}
