// The single source of truth for "which page is painted into THIS canvas."
//
// Canvas viewers (BookWalker/NFBR, mokuro, etc.) give us no stable page id, so over
// 20 sessions page identity was re-proxied ad hoc — by scroll offset, by the GLOBAL
// mirror epoch, or by the canvas node reference — and each proxy was wrong for some
// mode: scroll is often 0 in cty=2 vertical; the epoch "flashes" on every composite
// across the whole cluster; nodes are reused across pages. Every ad-hoc re-derivation
// reopened the churn (rescan-every-scroll) or the staleness (overlay stuck over the
// next page) on the next mode.
//
// This module derives identity ONLY from per-canvas rendered content: the pixel-hash
// signature of a readable canvas, or — for a tainted DRM canvas — the fingerprint of
// the source image(s) the engine composited into THAT canvas (via the mirror
// recorder). The global epoch is used ONLY as a last-resort turn signal for a
// counter-less, token-less viewer, and is explicitly classified so a caller never
// treats bare epoch churn as a real content change.
//
// API:
//   identityForCanvas(canvas)            → content-derived identity string ('' = unknown)
//   hasIdentityChanged(canvas, last)     → true only on a REAL content change vs `last`
//   isRealContentIdentity(identity)      → false for '' or a bare global-epoch value
//   isRealContentChange(previous, next)  → both sides are real content and they moved
//
// Invariant the consumers rely on: for the SAME painted page, identityForCanvas is
// stable across scroll / zoom / same-page re-raster / another canvas repainting (all
// of which bump the global epoch); for a DIFFERENT page it moves exactly once.

import { canvasPageContentToken, canvasReaderHasStableSurface } from './canvas-readers';
import { isBookwalkerViewerHost } from './canvas-hosts';
import { canvasMirrorContentToken } from './canvas-mirror';

// A bare global mirror epoch is `data-yomu-mirror-epoch` — a decimal (or a
// comma-joined set of them when several surfaces contribute). It is global page
// activity, NOT per-canvas content, so it must never stand in for a real content
// change. '' is likewise "identity unknown", not proof of anything.
function isCanvasMirrorEpochOrEmpty(content: string): boolean {
    return content === '' || /^\d+(?:,\d+)*$/.test(content);
}

// A stable-surface token (`s:<surfaceId>:<w>x<h>`) identifies the DOM surface a
// BookWalker vertical page is painted into, not the page itself. It is useful to
// hold a frame steady while mirror records are still loading, but it must not be
// treated as proof that a landed OCR frame still belongs to the canvas after the
// viewer repaints that surface with a different page.
function isStableSurfaceToken(content: string): boolean {
    return content.startsWith('s:');
}

// The content-derived page identity for a canvas. Empty when nothing is known yet
// (no readable pixels and no mirror records) so the caller can fall back or wait.
export function identityForCanvas(canvas: HTMLCanvasElement): string {
    try {
        return canvasPageContentToken(canvas);
    } catch {
        return '';
    }
}

// A page identity we can trust as a per-canvas CONTENT fingerprint: a real pixel
// hash or a mirror leaf-URL set. Excludes the empty token, a bare global epoch, and
// (on BookWalker) a stable-surface token — none of which prove page content.
export function isRealContentIdentity(identity: string): boolean {
    if (isCanvasMirrorEpochOrEmpty(identity)) return false;
    if (isStableSurfaceToken(identity)) return false;
    return true;
}

// The strong, per-canvas identity used to decide whether a LANDED OCR frame still
// belongs to its canvas. BookWalker updates its page counter/currentScreen before it
// paints the new pixels. A poll in that short gap can therefore capture page N-2 under
// page N's counter; the counter then stays unchanged and cannot repair the stale frame.
// Retaining the recorder's canonical source-image token lets the next poll reject that
// frame as soon as the new composite lands. In paged mode we intentionally use the
// mirror token rather than a raw pixel hash so harmless same-page anti-aliasing or a
// transient clear cannot tear down a ready overlay. Other readers still defer to their
// page-signature path.
//
// Even within scope it returns '' for a bare epoch or a stable-surface token: a
// surface token or global activity must not invalidate an otherwise-correct frame,
// and must not stand in as content.
export function stableContentIdentityForCanvas(canvas: HTMLCanvasElement): string {
    if (!isBookwalkerViewerHost()) return '';
    const token = canvasReaderHasStableSurface(canvas)
        ? identityForCanvas(canvas)
        : canvasMirrorContentToken(canvas);
    return isRealContentIdentity(token) ? token : '';
}

// True only for a REAL page-content change on THIS canvas: the previous frame's
// recorded content identity is non-empty and the current content identity is a
// DIFFERENT real content token. A move from/to '' (unknown), a bare epoch, or a
// stable-surface token is churn / not-ready — NOT a change — so within-page scroll
// and continuous epoch churn never tear a good overlay down.
export function hasIdentityChanged(canvas: HTMLCanvasElement, lastIdentity: string | undefined): boolean {
    if (!lastIdentity) return false;
    const current = stableContentIdentityForCanvas(canvas);
    return Boolean(current && current !== lastIdentity);
}

// Both sides are real per-canvas content tokens and they moved: a genuine page turn.
// Used when comparing two whole-reader page signatures where the content field has
// already been extracted.
export function isRealContentChange(previousContent: string, nextContent: string): boolean {
    if (previousContent === nextContent) return false;
    return isRealContentIdentity(previousContent) && isRealContentIdentity(nextContent);
}

// Both sides are the SAME real per-canvas content token (not a bare epoch / empty):
// the same page is still painted, so a landed overlay must be held.
export function isSameRealContent(previousContent: string, nextContent: string): boolean {
    if (previousContent !== nextContent) return false;
    return isRealContentIdentity(previousContent);
}

// The last-resort turn signal for a counter-less, token-less viewer: the per-canvas
// content is only the global mirror epoch (or empty) on both sides and it moved.
// Callers MUST prefer a real content change or a stable page counter first; this
// stands in only when neither exists.
export function isGlobalEpochTransition(previousContent: string, nextContent: string): boolean {
    if (previousContent === nextContent) return false;
    return isCanvasMirrorEpochOrEmpty(previousContent) && isCanvasMirrorEpochOrEmpty(nextContent);
}
