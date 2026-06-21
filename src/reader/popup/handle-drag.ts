type DragInput = 'pointer' | 'touch';

interface HandleDragState {
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    deltaX: number;
    deltaY: number;
}

interface HandleDragOptions<THandle extends HTMLElement> {
    tapMovementPx: number;
    updateOnEnd?: boolean;
    movementDistance?: (state: HandleDragState) => number;
    onBegin?: (handle: THandle, state: HandleDragState, input: DragInput) => void;
    onUpdate?: (state: HandleDragState, handle: THandle) => void;
    onFinish: (state: HandleDragState, wasMoved: boolean, handle: THandle | null) => void;
    onCancel?: (state: HandleDragState, handle: THandle | null) => void;
}

interface HandleDragController<THandle extends HTMLElement> {
    isDragging(): boolean;
    pointerDown(handle: THandle, event: PointerEvent): void;
    touchStart(handle: THandle, event: TouchEvent): void;
    cancel(): void;
    cleanupListeners(): void;
}

export function createHandleDragController<THandle extends HTMLElement>(options: HandleDragOptions<THandle>): HandleDragController<THandle> {
    let state = initialDragState();
    let pointerId = 0;
    let touchId = 0;
    let dragging = false;
    let moved = false;
    let activeInput: DragInput | null = null;
    let activeHandle: THandle | null = null;
    let activeCaptureTarget: Element | null = null;

    const movementDistance = options.movementDistance ?? (dragState => Math.hypot(dragState.deltaX, dragState.deltaY));
    const setLastPoint = (point: { x: number; y: number }): void => {
        state = {
            ...state,
            lastX: point.x,
            lastY: point.y,
            deltaX: point.x - state.startX,
            deltaY: point.y - state.startY,
        };
    };
    const updateDrag = (point: { x: number; y: number }): void => {
        if (!activeHandle) return;
        setLastPoint(point);
        if (movementDistance(state) > options.tapMovementPx) moved = true;
        options.onUpdate?.(state, activeHandle);
    };
    const beginDrag = (handle: THandle, point: { x: number; y: number }, input: DragInput): boolean => {
        if (dragging || activeInput) return false;
        state = {
            startX: point.x,
            startY: point.y,
            lastX: point.x,
            lastY: point.y,
            deltaX: 0,
            deltaY: 0,
        };
        dragging = true;
        moved = false;
        activeInput = input;
        activeHandle = handle;
        options.onBegin?.(handle, state, input);
        return true;
    };
    const finishDrag = (): void => {
        if (!dragging) return;
        const wasMoved = moved;
        const handle = activeHandle;
        const captureTarget = activeCaptureTarget;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        activeCaptureTarget = null;
        cleanupListeners();
        releasePointerCapture(captureTarget, pointerId);
        options.onFinish(state, wasMoved, handle);
    };

    function cleanupListeners(): void {
        if (typeof document === 'undefined') return;
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
        document.removeEventListener('touchmove', handleTouchMove, true);
        document.removeEventListener('touchend', handleTouchEnd, true);
        document.removeEventListener('touchcancel', handleTouchCancel, true);
    }
    function cancel(): void {
        if (!dragging) return;
        const handle = activeHandle;
        const captureTarget = activeCaptureTarget;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        activeCaptureTarget = null;
        cleanupListeners();
        releasePointerCapture(captureTarget, pointerId);
        options.onCancel?.(state, handle);
    }
    function handlePointerMove(event: PointerEvent): void {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        consumeDragEvent(event);
        updateDrag({ x: event.clientX, y: event.clientY });
    }
    function handlePointerUp(event: PointerEvent): void {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        consumeDragEvent(event);
        if (options.updateOnEnd) updateDrag({ x: event.clientX, y: event.clientY });
        else setLastPoint({ x: event.clientX, y: event.clientY });
        finishDrag();
    }
    function handlePointerCancel(event: PointerEvent): void {
        if (activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        cancel();
    }
    function handleTouchMove(event: TouchEvent): void {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event, touchId);
        if (!touch) return;
        consumeDragEvent(event);
        updateDrag({ x: touch.clientX, y: touch.clientY });
    }
    function handleTouchEnd(event: TouchEvent): void {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event, touchId);
        if (!touch) return;
        consumeDragEvent(event);
        if (options.updateOnEnd) updateDrag({ x: touch.clientX, y: touch.clientY });
        else setLastPoint({ x: touch.clientX, y: touch.clientY });
        finishDrag();
    }
    function handleTouchCancel(event: TouchEvent): void {
        if (activeInput !== 'touch' || !changedTouch(event, touchId)) return;
        cancel();
    }

    return {
        isDragging: () => dragging,
        pointerDown(handle: THandle, event: PointerEvent): void {
            if (activeInput) return;
            if (event.button !== undefined && event.button !== 0) return;
            consumeDragEvent(event);
            if (!beginDrag(handle, { x: event.clientX, y: event.clientY }, 'pointer')) return;
            pointerId = event.pointerId;
            activeCaptureTarget = event.target instanceof Element ? event.target : handle;
            setPointerCapture(activeCaptureTarget, event.pointerId);
            document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
            document.addEventListener('pointerup', handlePointerUp, true);
            document.addEventListener('pointercancel', handlePointerCancel, true);
        },
        touchStart(handle: THandle, event: TouchEvent): void {
            if (activeInput) return;
            const touch = firstChangedTouch(event);
            if (!touch) return;
            consumeDragEvent(event);
            if (!beginDrag(handle, { x: touch.clientX, y: touch.clientY }, 'touch')) return;
            touchId = touch.identifier;
            document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
            document.addEventListener('touchend', handleTouchEnd, true);
            document.addEventListener('touchcancel', handleTouchCancel, true);
        },
        cancel,
        cleanupListeners,
    };
}

function initialDragState(): HandleDragState {
    return {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        deltaX: 0,
        deltaY: 0,
    };
}

export function getContainedClosest<TElement extends HTMLElement>(
    target: EventTarget | null,
    root: HTMLElement,
    selector: string,
    onFound?: (element: TElement) => void,
): TElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<TElement>(selector);
    if (!element || !root.contains(element)) return null;
    onFound?.(element);
    return element;
}

function consumeDragEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
}

function changedTouch(event: TouchEvent, touchId: number): Touch | null {
    for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === touchId) return touch;
    }
    return null;
}

export function firstChangedTouch(event: TouchEvent): Touch | null {
    return event.changedTouches.item(0);
}

function releasePointerCapture(handle: Element | null, id: number): void {
    try {
        handle?.releasePointerCapture?.(id);
    } catch {
        // Some iOS WebKit contexts expose pointer events without reliable capture.
    }
}

function setPointerCapture(handle: Element, id: number): void {
    try {
        handle.setPointerCapture?.(id);
    } catch {
        // Document-level listeners keep the drag alive when capture is unavailable.
    }
}

export function addViewportChangeListeners(listener: EventListener, signal: AbortSignal): void {
    const options: AddEventListenerOptions = { passive: true, signal };
    window.addEventListener('resize', listener, options);
    window.addEventListener('orientationchange', listener, options);
    window.visualViewport?.addEventListener?.('resize', listener, options);
    window.visualViewport?.addEventListener?.('scroll', listener, options);
}
