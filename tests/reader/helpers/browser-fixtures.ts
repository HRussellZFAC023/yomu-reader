export type PointerEventInitLike = {
    button?: number;
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    pointerType?: string;
};

export function dispatchPointerEvent(target: EventTarget, type: string, init: PointerEventInitLike = {}): PointerEvent {
    const event = createPointerEvent(type, init);
    target.dispatchEvent(event);
    return event;
}

export function createPointerEvent(type: string, init: PointerEventInitLike = {}): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: init.button ?? 0 },
        clientX: { value: init.clientX ?? 0 },
        clientY: { value: init.clientY ?? 0 },
        pointerId: { value: init.pointerId ?? 1 },
        pointerType: { value: init.pointerType ?? 'mouse' },
    });
    return event;
}

export type ViewportFixtureOptions = {
    visualViewport?: boolean;
};

export function withViewport<T>(
    width: number,
    height: number,
    callback: () => T,
    options: ViewportFixtureOptions = {},
): T {
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    if (options.visualViewport) {
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: createVisualViewportFixture({ width, height }),
        });
    }
    const restore = (): void => {
        restoreWindowDescriptor('innerWidth', widthDescriptor);
        restoreWindowDescriptor('innerHeight', heightDescriptor);
        if (options.visualViewport) {
            restoreWindowDescriptor('visualViewport', viewportDescriptor);
        }
    };
    try {
        const result = callback();
        if (result instanceof Promise) {
            return result.finally(restore) as T;
        }
        restore();
        return result;
    } catch (error) {
        restore();
        throw error;
    }
}

export type VisualViewportFixtureInit = {
    height: number;
    width: number;
    offsetLeft?: number;
    offsetTop?: number;
    pageLeft?: number;
    pageTop?: number;
    scale?: number;
};

export function createVisualViewportFixture(init: VisualViewportFixtureInit): VisualViewport {
    const viewport = new EventTarget() as VisualViewport;
    Object.defineProperties(viewport, {
        height: { configurable: true, writable: true, value: init.height },
        width: { configurable: true, writable: true, value: init.width },
        offsetLeft: { configurable: true, writable: true, value: init.offsetLeft ?? 0 },
        offsetTop: { configurable: true, writable: true, value: init.offsetTop ?? 0 },
        pageLeft: { configurable: true, writable: true, value: init.pageLeft ?? 0 },
        pageTop: { configurable: true, writable: true, value: init.pageTop ?? 0 },
        scale: { configurable: true, writable: true, value: init.scale ?? 1 },
    });
    return viewport;
}

export function restoreWindowDescriptor(key: keyof Window, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) {
        Object.defineProperty(window, key, descriptor);
        return;
    }
    delete (window as unknown as Record<PropertyKey, unknown>)[key];
}
