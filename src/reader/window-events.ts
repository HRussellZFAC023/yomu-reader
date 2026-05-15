import { Logger } from './logger';

const log = Logger.scope('WindowEvents');

export function createWindowEvent(type: string, init: EventInit = {}): Event {
    const documentEvent = createDocumentEvent(type, init);
    if (documentEvent) return documentEvent;

    const EventConstructor = eventConstructor<Event>(window, 'Event') ?? eventConstructor<Event>(globalThis, 'Event');
    if (EventConstructor) {
        try {
            return new EventConstructor(type, init);
        } catch (error) {
            log.debugThrottled(`create-event-${type}`, 5000, 'Window Event constructor failed', { type, error });
        }
    }

    throw new Error(`Unable to create window event: ${type}`);
}

export function createWindowCustomEvent<T>(type: string, detail?: T, init: Omit<CustomEventInit<T>, 'detail'> = {}): CustomEvent<T> {
    const eventInit: CustomEventInit<T> = { ...init, detail };
    const documentEvent = createDocumentCustomEvent(type, eventInit);
    if (documentEvent) return documentEvent;

    const CustomEventConstructor = eventConstructor<CustomEvent<T>>(window, 'CustomEvent') ?? eventConstructor<CustomEvent<T>>(globalThis, 'CustomEvent');
    if (CustomEventConstructor) {
        try {
            return new CustomEventConstructor(type, eventInit);
        } catch (error) {
            log.debugThrottled(`create-custom-event-${type}`, 5000, 'Window CustomEvent constructor failed', { type, error });
        }
    }

    throw new Error(`Unable to create window custom event: ${type}`);
}

export function dispatchWindowEvent(event: Event): boolean {
    const target = window;
    const directDispatch = readMethod<EventTarget['dispatchEvent']>(target, 'dispatchEvent');
    const directResult = callEventTargetMethod(directDispatch, target, event);
    if (directResult.called) return directResult.result;

    const prototypeResult = dispatchWithPrototypeMethod(target, directDispatch, event);
    if (prototypeResult.called) return prototypeResult.result;

    const unshadowedResult = callWithUnshadowedWindowDispatch(event);
    if (unshadowedResult.called) return unshadowedResult.result;

    logDispatchFailure(event, unshadowedResult, prototypeResult, directResult);
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

    const prototypeResult = addListenerWithPrototypeMethod(target, directAdd, type, listener, options);
    if (prototypeResult.called) return true;

    const unshadowedResult = callWithUnshadowedWindowAddEventListener(type, listener, options);
    if (unshadowedResult.called) return true;

    logAddListenerFailure(type, unshadowedResult, prototypeResult, directResult);
    return false;
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

function logDispatchFailure(
    event: Event,
    unshadowedResult: DispatchCallResult,
    prototypeResult: DispatchCallResult,
    directResult: DispatchCallResult,
): void {
    log.debugThrottled(`dispatch-window-event-${event.type}`, 5000, 'Window event dispatch unavailable', {
        type: event.type,
        error: firstCallError(unshadowedResult, prototypeResult, directResult),
    });
}

function logAddListenerFailure(
    type: string,
    unshadowedResult: AddListenerCallResult,
    prototypeResult: AddListenerCallResult,
    directResult: AddListenerCallResult,
): void {
    log.debugThrottled(`add-window-listener-${type}`, 5000, 'Window event listener registration unavailable', {
        type,
        error: firstCallError(unshadowedResult, prototypeResult, directResult),
    });
}

function firstCallError(...results: Array<DispatchCallResult | AddListenerCallResult>): unknown {
    return results.map(callResultError).find(error => error !== undefined);
}

function callResultError(result: DispatchCallResult | AddListenerCallResult): unknown {
    return result.called ? undefined : result.error;
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
    } catch (error) {
        log.debugThrottled(`create-document-event-${type}`, 5000, 'Document Event creation failed', { type, error });
        return undefined;
    }
}

function createDocumentCustomEvent<T>(type: string, init: CustomEventInit<T>): CustomEvent<T> | undefined {
    if (typeof document === 'undefined' || typeof document.createEvent !== 'function') return undefined;
    try {
        const event = document.createEvent('CustomEvent');
        event.initCustomEvent(type, Boolean(init.bubbles), Boolean(init.cancelable), init.detail);
        return event as CustomEvent<T>;
    } catch (error) {
        log.debugThrottled(`create-document-custom-event-${type}`, 5000, 'Document CustomEvent creation failed', { type, error });
        return undefined;
    }
}

function eventTargetPrototypeMethods<K extends 'dispatchEvent' | 'addEventListener'>(target: EventTarget, key: K): Array<EventTarget[K]> {
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
    } catch (error) {
        log.debugThrottled(`window-event-property-${key}`, 5000, 'Window event property unavailable', { key, error });
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

function callWithUnshadowedWindowDispatch(event: Event): DispatchCallResult {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'dispatchEvent');
    if (!descriptor || typeof descriptor.value === 'function') return { called: false };
    try {
        if (!Reflect.deleteProperty(window, 'dispatchEvent')) return { called: false };
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
    const descriptor = Object.getOwnPropertyDescriptor(window, 'addEventListener');
    if (!descriptor || typeof descriptor.value === 'function') return { called: false };
    try {
        if (!Reflect.deleteProperty(window, 'addEventListener')) return { called: false };
        return callAddEventListener(readMethod<EventTarget['addEventListener']>(window, 'addEventListener'), window, type, listener, options);
    } catch (error) {
        return { called: false, error };
    } finally {
        restoreWindowProperty('addEventListener', descriptor);
    }
}

function restoreWindowProperty(key: 'dispatchEvent' | 'addEventListener', descriptor: PropertyDescriptor): void {
    try {
        Object.defineProperty(window, key, descriptor);
    } catch (error) {
        log.debugThrottled(`restore-window-event-property-${key}`, 5000, 'Window event property restore failed', { key, error });
    }
}
