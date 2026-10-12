export interface ReadingPlacement { centre: number; scaleX: number }
interface ReadingLaneItem { left: number; right: number; width: number }

/** Keep each reading in its neighboring word lane; hide it rather than making
 * kana narrower than 80 percent of their natural width. Items are in text order. */
export function fitReadingLane(items: readonly ReadingLaneItem[]): ReadingPlacement[] {
    return items.map((item, index) => {
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
}
