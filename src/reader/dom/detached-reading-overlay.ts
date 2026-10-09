import { safeComputedStyle } from './decoration-policy';
import { setInlineStyleIfChanged } from './inline-style';
import { yomuAnnotationsCompanion } from '../companions/registry';
import type { DetachedReadingProjection } from './detached-reading-overlay-impl';

export type { DetachedReadingProjection } from './detached-reading-overlay-impl';

export function syncProjectedReadings(
    owner: HTMLElement,
    projections: readonly DetachedReadingProjection[],
): void {
    yomuAnnotationsCompanion()?.syncProjectedReadings(owner, projections);
}

export function clearProjectedReadings(owner: HTMLElement): void {
    yomuAnnotationsCompanion()?.clearProjectedReadings(owner);
}

export function clearProjectedReadingsWithin(root: ParentNode): number {
    return yomuAnnotationsCompanion()?.clearProjectedReadingsWithin(root) ?? 0;
}

export function pruneProjectedReadings(document: Document): void {
    yomuAnnotationsCompanion()?.pruneProjectedReadings(document);
}

// Without the companion there are no projected readings to resolve, so the
// pointer path simply falls through to its next candidate.
export function projectedReadingWordAtPoint(
    document: Document,
    x: number,
    y: number,
    accepts?: (word: HTMLElement) => boolean,
): HTMLElement | null {
    return yomuAnnotationsCompanion()?.projectedReadingWordAtPoint(document, x, y, accepts) ?? null;
}

// A document stylesheet does not cross an open shadow boundary. Keep the
// invisible base wrapper's layout contract inline, and retain the reading's
// typography as source data for the document-owned projection overlay.
export function styleDetachedReadingElements(root: HTMLElement, host: HTMLElement): void {
    const detachedRubies = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby'));
    if (!detachedRubies.length) return;

    const hostStyle = safeComputedStyle(host);
    const hostFontSize = Number.parseFloat(hostStyle.fontSize) || 16;
    // A detached reading lives in the line gap rather than taking room of its
    // own, so it stays a little under in-flow ruby's half (.jpdb-reader-furi)
    // and is capped: at half, the crowding solver pushed WebKit's edge
    // readings of a crowded control row (Reddit's sort menu) off their words.
    const readingFontSize = Math.min(10, Math.max(6, hostFontSize * 0.46));

    for (const wrapper of detachedRubies) {
        setInlineStyleIfChanged(wrapper, 'position', 'relative', 'important');
        setInlineStyleIfChanged(wrapper, 'display', 'inline-block', 'important');
        setInlineStyleIfChanged(wrapper, 'line-height', '1', 'important');
        setInlineStyleIfChanged(wrapper, 'vertical-align', 'baseline', 'important');
        setInlineStyleIfChanged(wrapper, 'white-space', 'nowrap', 'important');
    }

    for (const reading of root.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')) {
        setInlineStyleIfChanged(reading, 'display', 'none', 'important');
        setInlineStyleIfChanged(reading, 'font-size', `${readingFontSize}px`);
        setInlineStyleIfChanged(reading, 'font-weight', 'normal');
        setInlineStyleIfChanged(reading, 'line-height', '1', 'important');
        setInlineStyleIfChanged(reading, 'text-decoration', 'none', 'important');
        setInlineStyleIfChanged(reading, 'user-select', 'none');
        setInlineStyleIfChanged(reading, '-webkit-user-select', 'none');
        // Keep the semantic colour channel inherited from the live page. The
        // additive base glyphs are hidden with text-fill (not color), so a
        // late theme/class change flows through without a JS repaint or a
        // stale mount-time colour snapshot.
        if (reading.style.getPropertyValue('color')) reading.style.removeProperty('color');
        setInlineStyleIfChanged(reading, '-webkit-text-fill-color', 'currentColor', 'important');
    }
}

