import { describe, expect, it } from 'vitest';
import { fitReadingLane } from '../../src/reader/dom/reading-lane-layout';

describe('reading lane placement', () => {
    it.each([[8, .8], [7.99, 0], [10, 1]])('keeps the legibility floor with %ipx available', (space, expectedScale) => {
        const placements=fitReadingLane([
            {left:0,right:space,width:space},
            {left:space,right:space*2,width:10},
            {left:space*2,right:space*3,width:space},
        ]);
        expect(placements[1].scaleX).toBeCloseTo(expectedScale, 5);
    });
    it('reclaims unused neighbor space without moving a centered reading', () => {
        const space = 7.99;
        const placements = fitReadingLane([
            { left: 0, right: space, width: 1 },
            { left: space, right: space * 2, width: 10 },
            { left: space * 2, right: space * 3, width: 1 },
        ]);
        expect(placements[1]).toEqual({ centre: space * 1.5, scaleX: 1 });
    });
    it('keeps multiple rescued readings separate with bounded center movement', () => {
        const items = Array.from({ length: 5 }, (_, index) => ({ left: index * 7.99, right: (index + 1) * 7.99, width: index === 0 || index === 4 ? 1 : 10 }));
        const placements = fitReadingLane(items);
        placements.forEach((placement, index) => {
            expect(placement.scaleX).toBeGreaterThanOrEqual(.8);
            expect(Math.abs(placement.centre - (items[index].left + items[index].right) / 2)).toBeLessThanOrEqual(3);
            if (index) expect(placements[index - 1].centre + items[index - 1].width * placements[index - 1].scaleX / 2).toBeLessThanOrEqual(placement.centre - items[index].width * placement.scaleX / 2 + .00001);
        });
    });
    it('hides a reading if borrowing space would shift it more than 3px', () => {
        const placements = fitReadingLane([
            { left: 0, right: 108, width: 1 },
            { left: 108, right: 124, width: 40 },
            { left: 124, right: 140, width: 25 },
        ]);
        expect(placements[1].scaleX).toBe(0);
    });
    it('keeps isolated overhang centered at natural width', () => {
        expect(fitReadingLane([{left:100,right:120,width:80}])).toEqual([{centre:110,scaleX:1}]);
    });
    it('centers readable WebKit timestamp readings before shifting an edge', () => {
        const items=[{left:205.90625,right:231.765625,width:27.70313}, {left:231.765625,right:244.703125,width:18.46875}];
        const placements=fitReadingLane(items);
        const spans=placements.map((placement,index)=>({left:placement.centre-items[index].width*placement.scaleX/2,right:placement.centre+items[index].width*placement.scaleX/2}));
        expect(spans[0].right).toBeLessThanOrEqual(spans[1].left+.001);
        placements.forEach((placement,index)=>{
            expect(placement.scaleX).toBeGreaterThanOrEqual(.8);
            expect(Math.abs(placement.centre-(items[index].left+items[index].right)/2)).toBeLessThan(1);
        });
    });
});
