// The one-time "Tap the page to read it" hint.
//
// With a cloud OCR provider, a reader canvas on a page image OCR does not
// auto-scan waits for a tap (canvas-auto-read.ts). The first such canvas gets
// this hint instead of a background upload. It wears the canvas status pill,
// lets taps fall through to the page, captures nothing, stays clear of the
// host's controls, and is remembered in this site's Yomu storage so it
// appears once per site.
import { uiText } from '../app/i18n';
import { ensureManagedWebStorageCurrentSync, managedLocalStorage } from '../app/storage';
import type { ReaderSettings } from '../app/types';
import { appendOcrArtifactToRoot, removeOcrArtifact } from './ocr-artifact-surface';
import { setOcrArtifactPosition } from './ocr-position-pass';
import { visibleViewportIntersection } from './surface-visibility';

export const READER_CANVAS_TAP_HINT_SEEN_KEY = 'yomu:ocr-canvas-tap-hint-seen:v1';
const INSET_PX = 12;
// The pill's CSS max-width and laid-out height, so the clearance probe covers the
// whole hint before it has ever been laid out. Its dismiss button's touch target
// reaches up to DISMISS_HIT_SLOP_PX past the pill (reader-words-ocr.css), and the
// probe keeps that clear of host controls too.
const HINT_WIDTH_PX = 260;
const HINT_HEIGHT_PX = 34;
const DISMISS_HIT_SLOP_PX = 12;
const PROBE_STEP_PX = 32;
const HOST_CONTROL_SELECTOR = 'a[href],button,input,select,textarea,summary,label,[contenteditable="true"],'
    + '[role="button"],[role="link"],[role="slider"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]';

interface HintSpot { left: number; top: number }

export class ReaderCanvasTapHint {
    private element: HTMLElement | undefined;
    private done = false;

    /** Point the hint at the first reader canvas waiting for a tap, or hide it while none waits. */
    update(canvas: HTMLCanvasElement | undefined, settings: ReaderSettings): void {
        if (!this.element && !this.mayShow(canvas)) return;
        const element = this.element ??= createHint(settings, () => this.dismiss());
        const spot = canvas && spotClearOfHostControls(canvas, element);
        element.hidden = !spot;
        if (!spot) return;
        setOcrArtifactPosition(element, spot.left, spot.top);
        if (!this.done) rememberHintSeen();
        this.done = true;
    }

    private mayShow(canvas: HTMLCanvasElement | undefined): boolean {
        if (!canvas || this.done) return false;
        this.done = hintSeenOnThisSite();
        return !this.done;
    }

    /** The learner dismissed the hint or read a page, so it has done its job here. */
    dismiss(): void {
        this.done = true;
        this.remove();
    }

    remove(): void {
        if (this.element) removeOcrArtifact(this.element);
        this.element = undefined;
    }
}

function createHint(settings: ReaderSettings, onDismiss: () => void): HTMLElement {
    const element = document.createElement('div');
    element.className = 'jpdb-ocr-video-frame-status jpdb-ocr-canvas-status jpdb-ocr-canvas-tap-hint';
    element.dataset.jpdbReaderRoot = 'true';
    element.dataset.jpdbReaderSurfaceIgnore = 'true';
    element.setAttribute('role', 'status');
    element.hidden = true;
    const label = document.createElement('span');
    label.className = 'jpdb-ocr-video-frame-status-label';
    label.textContent = uiText(settings.interfaceLanguage, 'ocrCanvasTapHint');
    const dismiss = document.createElement('button');
    const dismissLabel = uiText(settings.interfaceLanguage, 'ocrCanvasTapHintDismiss');
    dismiss.type = 'button';
    dismiss.className = 'jpdb-ocr-canvas-tap-hint-dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', dismissLabel);
    dismiss.title = dismissLabel;
    dismiss.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
    });
    element.append(label, dismiss);
    appendOcrArtifactToRoot(element, document.body);
    return element;
}

// Where Yomu's scan status pill sits first, then the top centre, then the page
// centre; the first spot whose whole box, dismiss target included, covers no
// host control wins.
function spotClearOfHostControls(canvas: HTMLCanvasElement, hint: HTMLElement): HintSpot | undefined {
    const visible = visibleViewportIntersection(canvas.getBoundingClientRect());
    if (!visible || visible.height < HINT_HEIGHT_PX + INSET_PX * 2) return undefined;
    const width = Math.min(HINT_WIDTH_PX, visible.width - INSET_PX * 2);
    if (width <= 0) return undefined;
    const centreLeft = visible.left + (visible.width - width) / 2;
    const spots: HintSpot[] = [
        { left: visible.left + INSET_PX, top: visible.top + INSET_PX },
        { left: centreLeft, top: visible.top + INSET_PX },
        { left: centreLeft, top: visible.top + (visible.height - HINT_HEIGHT_PX) / 2 },
    ];
    return spots.find(spot => !coversHostControl(spot, width, hint));
}

function coversHostControl(spot: HintSpot, width: number, hint: HTMLElement): boolean {
    const reach = width + DISMISS_HIT_SLOP_PX;
    const bottom = spot.top + HINT_HEIGHT_PX;
    const rows = [spot.top - DISMISS_HIT_SLOP_PX, spot.top, spot.top + HINT_HEIGHT_PX / 2, bottom, bottom + DISMISS_HIT_SLOP_PX];
    const columns = Array.from({ length: Math.ceil(reach / PROBE_STEP_PX) + 1 }, (_, index) => spot.left + Math.min(index * PROBE_STEP_PX, reach));
    return rows.some(top => columns.some(left => {
        const hit = document.elementFromPoint(left, top);
        return Boolean(hit && !hint.contains(hit) && hit.closest(HOST_CONTROL_SELECTOR));
    }));
}

function hintSeenOnThisSite(): boolean {
    try {
        // The OCR companion can run before, or in another realm from, the boot that
        // passes this site's storage barrier; passing it again is idempotent.
        ensureManagedWebStorageCurrentSync();
        return managedLocalStorage.getItem(READER_CANVAS_TAP_HINT_SEEN_KEY) !== null;
    } catch {
        // Without storage the hint could not stay one-time. A tap still reads the page.
        return true;
    }
}

function rememberHintSeen(): void {
    try {
        managedLocalStorage.setItem(READER_CANVAS_TAP_HINT_SEEN_KEY, '1');
    } catch {
        // Shown once for this page; nothing else depends on the record.
    }
}
