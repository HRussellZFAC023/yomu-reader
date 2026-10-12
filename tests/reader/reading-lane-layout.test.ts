import { describe, expect, it } from 'vitest';
import { fitReadingLane } from '../../src/reader/dom/reading-lane-layout';

describe('reading lane placement', () => {
    it.each([[8, .8], [7.99, 0], [10, 1]])('keeps the legibility floor with %ipx available', (space, expectedScale) => {
        const placements=fitReadingLane([
            {left:0,right:space,width:1},
            {left:space,right:space*2,width:10},
            {left:space*2,right:space*3,width:1},
        ]);
        expect(placements[1].scaleX).toBeCloseTo(expectedScale, 5);
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
