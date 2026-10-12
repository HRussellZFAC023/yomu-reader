import { syncProjectedReadings, withProjectedReadingBatch } from '../../../src/reader/dom/detached-reading-overlay-impl';

/** Geometry assertions inspect a complete fitted frame. Scheduling assertions
 * use the raw sync API and await its frame explicitly. */
export function syncFittedReadings(...args: Parameters<typeof syncProjectedReadings>): void {
    withProjectedReadingBatch(args[0].ownerDocument, () => syncProjectedReadings(...args));
}

export function readingRect(left = 20, top = 20, width = 40, height = 16): DOMRect {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}
