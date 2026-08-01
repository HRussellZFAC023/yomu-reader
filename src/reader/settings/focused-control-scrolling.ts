import { overlayViewport, overlayViewportBounds, sourceRectToOverlay } from '../ui/page-scale';

const SETTINGS_FOCUS_SCROLL_SELECTOR = [
    'input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="hidden"])',
    'select',
    'textarea',
].join(',');
const SETTINGS_FOCUS_SCROLL_MARGIN_PX = 16;
const SETTINGS_FOCUS_SCROLL_RETRY_MS = 320;

type FocusedSettingsControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function installFocusedControlScrolling(form: HTMLFormElement): void {
    form.addEventListener('focusin', event => {
        const control = focusedSettingsControl(event.target, form);
        if (control) requestSettingsControlVisibility(form, control);
    });
}

function focusedSettingsControl(target: EventTarget | null, form: HTMLFormElement): FocusedSettingsControl | null {
    if (!(target instanceof HTMLElement)) return null;
    const control = target.closest(SETTINGS_FOCUS_SCROLL_SELECTOR);
    if ((control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) && form.contains(control)) return control;
    return null;
}

function requestSettingsControlVisibility(form: HTMLFormElement, control: FocusedSettingsControl): void {
    const run = () => scrollSettingsControlIntoView(form, control);
    requestFrame(() => requestFrame(run));
    window.setTimeout(run, SETTINGS_FOCUS_SCROLL_RETRY_MS);
}

function requestFrame(callback: () => void): void {
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => callback());
    else window.setTimeout(callback, 16);
}

function scrollSettingsControlIntoView(form: HTMLFormElement, control: FocusedSettingsControl): void {
    const geometry = settingsControlScrollGeometry(form, control);
    if (geometry) applySettingsControlScroll(geometry);
}

interface SettingsControlScrollGeometry {
    bottomLimit: number;
    controlRect: DOMRect;
    scroll: HTMLElement;
    topLimit: number;
}

function settingsControlScrollGeometry(form: HTMLFormElement, control: FocusedSettingsControl): SettingsControlScrollGeometry | null {
    if (!canScrollFocusedSettingsControl(form, control)) return null;
    const scroll = settingsControlScrollContainer(form, control);
    if (!scroll) return null;
    const pageScale = overlayViewport().pageScale;
    const scrollRect = sourceRectToOverlay(scroll.getBoundingClientRect(), scroll, pageScale);
    const controlRect = sourceRectToOverlay(control.getBoundingClientRect(), control, pageScale);
    if (!hasMeasuredRect(scrollRect) || !hasMeasuredRect(controlRect)) return null;
    const limits = settingsControlScrollLimits(form, scrollRect, pageScale);
    return limits ? { scroll, controlRect, ...limits } : null;
}

function canScrollFocusedSettingsControl(form: HTMLFormElement, control: HTMLElement): boolean {
    return form.isConnected && control.isConnected && document.activeElement === control;
}

function settingsControlScrollContainer(form: HTMLFormElement, control: HTMLElement): HTMLElement | null {
    const scroll = control.closest<HTMLElement>('.jpdb-reader-settings-scroll');
    return scroll && form.contains(scroll) ? scroll : null;
}

function settingsControlScrollLimits(form: HTMLFormElement, scrollRect: DOMRect, pageScale: number): { bottomLimit: number; topLimit: number } | null {
    const viewport = settingsControlViewportBounds(scrollRect, pageScale);
    const topLimit = Math.max(scrollRect.top, viewport.top) + SETTINGS_FOCUS_SCROLL_MARGIN_PX;
    const bottomLimit = Math.min(scrollRect.bottom, viewport.bottom, measuredSettingsFooterTop(form, pageScale)) - SETTINGS_FOCUS_SCROLL_MARGIN_PX;
    return bottomLimit > topLimit ? { bottomLimit, topLimit } : null;
}

function settingsControlViewportBounds(scrollRect: DOMRect, pageScale: number): { bottom: number; top: number } {
    if (pageScale > 1) {
        const viewport = overlayViewportBounds();
        return { bottom: viewport.bottom, top: viewport.top };
    }
    const top = Math.max(0, Math.round(window.visualViewport?.offsetTop ?? 0));
    const height = Math.max(0, Math.round(window.visualViewport?.height ?? settingsControlViewportHeightFallback(scrollRect)));
    return { bottom: top + height, top };
}

function settingsControlViewportHeightFallback(scrollRect: DOMRect): number {
    if (window.innerHeight) return window.innerHeight;
    if (document.documentElement.clientHeight) return document.documentElement.clientHeight;
    return scrollRect.bottom;
}

function measuredSettingsFooterTop(form: HTMLFormElement, pageScale: number): number {
    const footer = form.querySelector<HTMLElement>('.footer');
    const footerRect = footer ? sourceRectToOverlay(footer.getBoundingClientRect(), footer, pageScale) : undefined;
    return !footerRect || !hasMeasuredRect(footerRect) ? Number.POSITIVE_INFINITY : footerRect.top;
}

function applySettingsControlScroll({ bottomLimit, controlRect, scroll, topLimit }: SettingsControlScrollGeometry): void {
    if (controlRect.bottom > bottomLimit) scroll.scrollTop += Math.ceil(controlRect.bottom - bottomLimit);
    else if (controlRect.top < topLimit) scroll.scrollTop -= Math.ceil(topLimit - controlRect.top);
}

function hasMeasuredRect(rect: DOMRect): boolean {
    return Boolean(rect.width || rect.height || rect.top || rect.right || rect.bottom || rect.left);
}
