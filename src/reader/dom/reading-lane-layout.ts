export interface ReadingPlacement { centre: number; scaleX: number }
interface ReadingLaneItem { left: number; right: number; width: number }

/** Keep each reading in its neighboring word lane; hide it rather than making
 * kana narrower than 80 percent of their natural width. Items are in text order. */
export function fitReadingLane(items: readonly ReadingLaneItem[]): ReadingPlacement[] {
    const placements = items.map((item, index) => {
        const centre = (item.left + item.right) / 2;
        if (!(item.width > 0)) return { centre, scaleX:1 };
        const previous = items[index - 1];
        const next = items[index + 1];
        const left = previous ? (previous.right + item.left) / 2 : Number.NEGATIVE_INFINITY;
        const right = next ? (item.right + next.left) / 2 : Number.POSITIVE_INFINITY;
        const available = right - left;
        const centeredWidth = Math.max(0, 2 * Math.min(centre-left, right-centre));
        const scaleX = Math.min(1, Math.max(.8, Math.min(available, centeredWidth) / item.width));
        const painted = item.width * scaleX;
        if (painted > available) return { centre, scaleX:0 };
        return { centre:Math.min(right-painted/2, Math.max(left+painted/2, centre)), scaleX };
    });
    // Base midpoints keep ordinary readings aligned. A short neighboring
    // reading can leave usable space beyond that midpoint; reclaim it before
    // hiding a readable label. Cache the next painted neighbor in one pass.
    const nextPainted = new Array<number>(items.length);
    let next = -1;
    for (let index = items.length - 1; index >= 0; index--) {
        nextPainted[index] = next;
        if (placements[index].scaleX > 0 && items[index].width > 0) next = index;
    }
    let previousRight = Number.NEGATIVE_INFINITY;
    for (const [index, item] of items.entries()) {
        let placement = placements[index];
        if (placement.scaleX === 0) {
            const neighbor = nextPainted[index];
            const right = neighbor < 0 ? Number.POSITIVE_INFINITY
                : placements[neighbor].centre - items[neighbor].width * placements[neighbor].scaleX / 2;
            placement = fitUnusedPaintSpace(item, previousRight, right);
            placements[index] = placement;
        }
        if (placement.scaleX > 0 && item.width > 0) {
            previousRight = placement.centre + item.width * placement.scaleX / 2;
        }
    }
    return placements;
}

function fitUnusedPaintSpace(item: ReadingLaneItem, left: number, right: number): ReadingPlacement {
    const centre = (item.left + item.right) / 2;
    const minimum = item.width * .8;
    if (minimum > right - left) return { centre, scaleX: 0 };
    const centeredWidth = Math.max(0, 2 * Math.min(centre - left, right - centre));
    if (minimum <= centeredWidth) return { centre, scaleX: Math.min(1, centeredWidth / item.width) };
    const shifted = Math.min(right - minimum / 2, Math.max(left + minimum / 2, centre));
    return Math.abs(shifted - centre) <= 3 ? { centre: shifted, scaleX: .8 } : { centre, scaleX: 0 };
}
