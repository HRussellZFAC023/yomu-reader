// Which OCR target a pointer or touch asks for.
//
// A press (pointerdown, or a touch turned into one) asks to read what is under
// it; a mouse or pen passing over (pointerover/pointermove) asks the same in
// the interaction modes that read on hover. The controller decides whether the
// request is honoured; this module only finds the <img> or reader surface
// (canvas or CSS background page) the pointer means, never one under Yomu's own
// UI or an OCR overlay.
import type { ReaderSettings } from '../app/types';
import { collectBackgroundImageReaderSurfaces, collectCanvasReaderSurfaces, isManualCanvasReaderSurface, ocrPointerHitElement } from './canvas-readers';
import { ocrRuntimeActive } from './mode';
import { isHiddenByCss, isInsideHiddenAncestor, isNearViewport } from './surface-visibility';

type OcrPointerEvent = Event & Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerType'>;

/** The <img> a read-requesting pointer event points at, before OCR's own candidate checks. */
export function ocrPointerImage(event: Event): HTMLImageElement | null {
    if (!isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    if (pointerEventOverOcrOverlay(event)) return null;
    return pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
}

export function ocrReaderSurfaceFromPointerEvent(event: Event, settings: ReaderSettings, rasterFreePage: boolean): HTMLCanvasElement | HTMLElement | null {
    if (rasterFreePage || !ocrRuntimeActive(settings) || settings.ocrProvider === 'off' || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    // A tap whose POINT lands on existing OCR text must look it up, not re-scan.
    // Re-scanning releases the frame mid-tap, so the overlay vanishes before the
    // gesture ends — losing the lookup AND letting the tap fall through to the host
    // viewer's page turn. Touch can target the canvas even with the overlay painted
    // on top, so check the point, not just event.target.
    if (pointerEventOverOcrOverlay(event)) return null;
    return pointerEventReaderSurfaceTarget(event, settings) ?? pointerEventReaderSurfaceAtPoint(event, settings);
}

export function touchPointFromEvent(event: Event): { clientX: number; clientY: number } | null {
    const touchEvent = event as Partial<TouchEvent>;
    const touch = touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0];
    if (!touch || typeof touch.clientX !== 'number' || typeof touch.clientY !== 'number') return null;
    return { clientX: touch.clientX, clientY: touch.clientY };
}

export function eventWithPoint(event: Event, point: { clientX: number; clientY: number }): OcrPointerEvent {
    return {
        type: 'pointerdown',
        target: event.target,
        button: 0,
        clientX: point.clientX,
        clientY: point.clientY,
        pointerType: 'touch',
    } as OcrPointerEvent;
}

export function isPointerLikeEvent(event: Event): event is OcrPointerEvent {
    const candidate = event as Partial<PointerEvent>;
    return typeof candidate.clientX === 'number' && typeof candidate.clientY === 'number';
}

function pointerEventOverOcrOverlay(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>): boolean {
    const target = event.target as Element | null;
    if (target?.closest?.('[data-jpdb-reader-root]')) return true;
    return Boolean(ocrPointerHitElement(event)?.closest?.('[data-jpdb-reader-root]'));
}

function shouldHandleOcrPointerEvent(event: Event & Pick<PointerEvent, 'button' | 'pointerType'>): boolean {
    if (event.type === 'pointerdown') return event.button === undefined || event.button === 0;
    return (event.type === 'pointerover' || event.type === 'pointermove') && isHoverPointerType(event.pointerType);
}

function isHoverPointerType(pointerType: string): boolean {
    return !pointerType || pointerType === 'mouse' || pointerType === 'pen';
}

function pointerEventImageTarget(event: Event): HTMLImageElement | null {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-jpdb-reader-root]')) return null;
    return target instanceof HTMLImageElement ? target : target.closest('img');
}

function pointerEventImageAtPoint(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>): HTMLImageElement | null {
    const element = ocrPointerHitElement(event);
    if (!element || element.closest('[data-jpdb-reader-root]')) return null;
    return element instanceof HTMLImageElement ? element : element.closest('img');
}

function pointerEventReaderSurfaceTarget(event: Event, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-jpdb-reader-root]')) return null;
    return readerSurfaceFromElement(target, settings);
}

function pointerEventReaderSurfaceAtPoint(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const element = ocrPointerHitElement(event);
    if (element && !element.closest('[data-jpdb-reader-root]')) {
        const surface = readerSurfaceFromElement(element, settings);
        if (surface) return surface;
    }
    return readerSurfaceAtPoint(event.clientX, event.clientY, settings);
}

function readerSurfaceFromElement(element: Element, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const canvas = element instanceof HTMLCanvasElement ? element : element.closest<HTMLCanvasElement>('canvas');
    if (canvas && isManualCanvasReaderSurface(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    if (canvas && collectCanvasReaderSurfaces().includes(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    const background = collectBackgroundImageReaderSurfaces()
        .find(surface => (surface === element || surface.contains(element)) && isReaderSurfaceCandidate(surface, settings));
    return background ?? null;
}

function readerSurfaceAtPoint(clientX: number, clientY: number, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const surfaces = [
        ...collectCanvasReaderSurfaces(),
        ...collectBackgroundImageReaderSurfaces(),
    ].filter(surface => isReaderSurfaceCandidate(surface, settings));
    return surfaces.find(surface => rectContainsPoint(surface.getBoundingClientRect(), clientX, clientY)) ?? null;
}

function isReaderSurfaceCandidate(surface: Element, settings: ReaderSettings): boolean {
    const rect = surface.getBoundingClientRect();
    return rect.width * rect.height >= settings.ocrMinImageArea
        && isNearViewport(surface, settings.ocrPrefetchMargin)
        && !isHiddenByCss(surface)
        && !isInsideHiddenAncestor(surface);
}

function rectContainsPoint(rect: DOMRect, clientX: number, clientY: number): boolean {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}
