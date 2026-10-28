import { describe, expect, it } from 'vitest';
import { graphEdgePath } from '../../src/reader/kanji/graph-geometry';

describe('kanji graph geometry', () => {
    it('clips auto edges at the visible node border instead of leaving detached gaps', () => {
        const path = graphEdgePath(
            { x: 20, y: 50, rx: 5, ry: 10 },
            { x: 80, y: 50, rx: 5, ry: 10 },
        );

        expect(path.d).toBe('M25 50 L75 50');
    });

    it('clips fixed-zone arrows at the target border', () => {
        const path = graphEdgePath(
            { x: 50, y: 20, rx: 5, ry: 10 },
            { x: 50, y: 80, rx: 5, ry: 10 },
            'top',
        );

        expect(path.d).toBe('M50 30 L50 70');
    });
});
