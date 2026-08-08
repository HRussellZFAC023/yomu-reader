import { describe, expect, it } from 'vitest';

import { classifyRenderableMediaMutations } from '../../src/reader/ocr/renderable-media-mutations';

function childListMutation(
    target: Node,
    addedNodes: Node[] = [],
    removedNodes: Node[] = [],
): MutationRecord {
    return {
        type: 'childList',
        target,
        addedNodes,
        removedNodes,
    } as unknown as MutationRecord;
}

describe('OCR renderable media mutation classification', () => {
    it('drops batches made entirely from reader-owned paint', () => {
        const layer = document.createElement('div');
        layer.className = 'jpdb-reader-detached-reading-overlay';

        expect(classifyRenderableMediaMutations([
            childListMutation(document.body, [layer]),
        ])).toEqual({
            mutations: [],
            touchesRenderableMedia: false,
            addedImage: false,
            restylesEverySurface: false,
        });
    });

    it('classifies an inserted image as immediate renderable-media work', () => {
        const image = document.createElement('img');
        const mutation = childListMutation(document.body, [image]);

        expect(classifyRenderableMediaMutations([mutation])).toEqual({
            mutations: [mutation],
            touchesRenderableMedia: true,
            addedImage: true,
            restylesEverySurface: false,
        });
    });

    it('keeps stylesheet edits as global transform invalidations without scheduling OCR', () => {
        const style = document.createElement('style');
        const mutation = childListMutation(style, [document.createTextNode('img { width: 50% }')]);

        expect(classifyRenderableMediaMutations([mutation])).toEqual({
            mutations: [mutation],
            touchesRenderableMedia: false,
            addedImage: false,
            restylesEverySurface: true,
        });
    });

    it('distinguishes removed media from newly added image work', () => {
        const video = document.createElement('video');
        const mutation = childListMutation(document.body, [], [video]);

        expect(classifyRenderableMediaMutations([mutation])).toEqual({
            mutations: [mutation],
            touchesRenderableMedia: true,
            addedImage: false,
            restylesEverySurface: false,
        });
    });
});
