// The whole-reader page-signature layer: build, parse, and compare the packed
// `counter|scroll|surfaces|content|backgrounds...` signature string that snapshots a
// canvas reader page. It sits ABOVE canvas-page-identity (which owns per-canvas
// content classification): these helpers extract the relevant field from the packed
// signature and delegate the content-token decision to that module, so every scan /
// rescan / cache-key / retry / hold reads the same content-derived identity.
import {
    canvasPageContentToken,
    canvasReaderHasStableSurface,
    canvasReaderPageCounter,
    canvasReaderSurfaceId,
} from './canvas-readers';
import { isBookwalkerViewerHost } from './canvas-hosts';
import {
    isGlobalEpochTransition as isCanvasContentEpochTransition,
    isRealContentChange as isRealCanvasContentChange,
    isSameRealContent as isSameRealCanvasContent,
    stableContentIdentityForCanvas,
} from './canvas-page-identity';

// Per-canvas identity of the page currently painted into this surface: the viewer's
// page counter (a turn pre-signal, caught before the mirror records the new page),
// the stable surface id, intrinsic size, and (for ordinary readable canvases) content.
// Deliberately NOT the full page signature or live rect: the async mirror/screenshot
// capture spans many frames, during which the viewer repaints other canvases and bumps
// the shared epoch, and in vertical mode the rect scrolls. Embedding any of those made
// the post-capture key recompute differently and discarded the fresh frame every time
// (the empty OCR layers on cty=2). This key moves only when THIS canvas shows a
// different page, so a capture lands and survives the surrounding epoch churn.
// Repositioning on scroll/zoom is handled separately, so dropping the rect costs nothing.
export function canvasSurfaceSnapshotKey(canvas: HTMLCanvasElement): string {
    const surfaceId = canvasReaderSurfaceId(canvas);
    if (isBookwalkerViewerHost()) {
        return [
            canvasReaderHasStableSurface(canvas) ? '' : canvasReaderPageCounter(),
            surfaceId,
        ].join('|');
    }
    return [
        canvasReaderHasStableSurface(canvas) ? '' : canvasReaderPageCounter(),
        surfaceId,
        canvas.width,
        canvas.height,
        canvasPageContentToken(canvas),
    ].join('|');
}

// The per-canvas content identity used to decide whether a landed OCR frame still
// belongs to its canvas — delegated to the single canvas-page-identity module so
// every identity decision (scan / rescan / cache-key / retry / hold) reads the same
// content-derived value rather than an ad-hoc proxy.
export function canvasStablePageContentToken(canvas: HTMLCanvasElement): string {
    return stableContentIdentityForCanvas(canvas);
}

export function canvasContentReadinessKey(canvas: HTMLCanvasElement): string {
    const surfaceId = canvasReaderSurfaceId(canvas);
    return [
        canvasReaderHasStableSurface(canvas) ? '' : canvasReaderPageCounter(),
        surfaceId,
        canvas.width,
        canvas.height,
        canvasPageContentToken(canvas),
    ].join('|');
}

export function isSameCanvasReaderPageLocation(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    // Scroll offset is deliberately NOT part of page IDENTITY. It stays in the
    // signature (so a scroll still triggers a reposition/prefetch refresh) but must
    // not, on its own, read as a page change — otherwise within-page scroll on a
    // single vertical viewport (BookWalker cty=2) tears the OCR overlay down every
    // ~40px and the scan never settles.
    return previousParts.counter === nextParts.counter
        && previousParts.backgrounds === nextParts.backgrounds;
}

// True only for a REAL page-content change: the per-canvas content fingerprint (pixel
// hash or mirror leaf-URL set) moved from one real token to another real token. If
// either side is only a global mirror epoch (or empty), page identity is incomplete —
// that is churn/not-ready, not proof of a turn, so it is NOT reported as a change.
// This keeps within-page scroll and continuous epoch churn from tearing the OCR
// overlay down on cty=2 while still releasing immediately on real content swaps.
// The content classification is owned by canvas-page-identity; this wrapper only
// extracts the content field from the whole-reader signature string.
export function hasDifferentRecordedCanvasReaderContent(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return isRecordedCanvasReaderContent(previousParts.content)
        && isRecordedCanvasReaderContent(nextParts.content)
        && isRealCanvasContentChange(previousParts.content, nextParts.content);
}

function isRecordedCanvasReaderContent(content: string): boolean {
    const tokens = content.split(',').filter(Boolean);
    return tokens.length > 0 && tokens.every(token => token.startsWith('m:') || token.startsWith('o:'));
}

export function hasSameRealCanvasReaderContent(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return isSameRealCanvasContent(previousParts.content, nextParts.content);
}

// The inverse fallback: the per-canvas content is only the global mirror epoch (or
// empty) on both sides and it moved. Page identity is otherwise unknown, so this is
// the last-resort turn signal for a counter-less, token-less viewer. Callers must
// prefer a real content change or a stable page counter first; this stands in only
// when neither exists.
export function isCanvasMirrorEpochTransition(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return isCanvasContentEpochTransition(previousParts.content, nextParts.content);
}

export function hasSameStableCanvasReaderPageCounter(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return previousParts.counter !== '' && previousParts.counter === nextParts.counter;
}

export function shouldTrustStableBookwalkerPageCounter(): boolean {
    if (!isBookwalkerViewerHost()) return false;
    try {
        return new URL(location.href).searchParams.get('cty') !== '2';
    } catch {
        return true;
    }
}

function splitCanvasReaderSignature(signature: string): {
    backgrounds: string;
    content: string;
    counter: string;
    scroll: string;
    surfaces: string;
} | null {
    const parts = signature.split('|');
    if (parts.length < 5) return null;
    const [counter, scroll, surfaces, content, ...backgroundParts] = parts;
    return {
        backgrounds: backgroundParts.join('|'),
        content: content ?? '',
        counter: counter ?? '',
        scroll: scroll ?? '',
        surfaces: surfaces ?? '',
    };
}
