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
