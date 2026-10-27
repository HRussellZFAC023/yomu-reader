import { describe, expect, it } from 'vitest';
import { fitReadingLane } from '../../src/reader/dom/reading-lane-layout';
import { afterEach } from "vitest";
import { ownMediaReadingBoundary, pointTouchesOwnMediaBoundary } from "../../src/reader/dom/reading-media-boundary";
import { readingRect } from "./helpers/projected-reading-frame";

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

describe('a reading at its own thumbnail boundary', () => {
    afterEach(() => document.body.replaceChildren());
    function card() {
        const root = document.createElement('ytd-reel-item-renderer');
        root.innerHTML = '<a class="short-thumb"><img><button><img></button></a><a class="title">京都</a>';
        document.body.append(root);
        const media = root.querySelector<HTMLElement>('.short-thumb')!;
        media.getBoundingClientRect = () => readingRect(10, 20, 100, 180);
        return { anchor: root.querySelector<HTMLElement>('.title')!, media, image: media.querySelector('img')! };
    }

    it('admits a tiny media-edge overlap after the native source remains below the image', () => {
        const { anchor, media, image } = card();
        const boundary = ownMediaReadingBoundary(anchor, readingRect(20, 212, 40, 25));
        expect(pointTouchesOwnMediaBoundary(boundary, media, 50, 199)).toBe(true);
        expect(pointTouchesOwnMediaBoundary(boundary, image, 50, 199)).toBe(true);
        expect(pointTouchesOwnMediaBoundary(boundary, image, 50, 196)).toBe(false);
        expect(pointTouchesOwnMediaBoundary(boundary, image, 200, 199)).toBe(false);
        expect(pointTouchesOwnMediaBoundary(boundary, document.createElement('img'), 50, 199)).toBe(false);
    });
    it('does not admit a button or its content over the reading', () => {
        const { anchor, media } = card();
        const boundary = ownMediaReadingBoundary(anchor, readingRect(20, 212, 40, 25));
        expect(pointTouchesOwnMediaBoundary(boundary, media.querySelector('button')!, 50, 199)).toBe(false);
        expect(pointTouchesOwnMediaBoundary(boundary, media.querySelector('button img')!, 50, 199)).toBe(false);
    });
    it('rejects a source covered by the image and unrelated card structures', () => {
        const { anchor } = card();
        expect(ownMediaReadingBoundary(anchor, readingRect(20, 190, 40, 25))).toBeUndefined();
        expect(ownMediaReadingBoundary(document.body, readingRect())).toBeUndefined();
        expect(pointTouchesOwnMediaBoundary(undefined, anchor, 50, 199)).toBe(false);
    });
});
