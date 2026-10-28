import { afterEach, describe, expect, it } from 'vitest';
import { ownMediaReadingBoundary, pointTouchesOwnMediaBoundary } from '../../src/reader/dom/reading-media-boundary';
import { readingRect } from './helpers/projected-reading-frame';

afterEach(() => document.body.replaceChildren());
function card() {
    const root = document.createElement('ytd-reel-item-renderer');
    root.innerHTML = '<a class="short-thumb"><img><button><img></button></a><a class="title">京都</a>';
    document.body.append(root);
    const media = root.querySelector<HTMLElement>('.short-thumb')!;
    media.getBoundingClientRect = () => readingRect(10, 20, 100, 180);
    return { anchor: root.querySelector<HTMLElement>('.title')!, media, image: media.querySelector('img')! };
}
describe('a reading at its own thumbnail boundary', () => {
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
