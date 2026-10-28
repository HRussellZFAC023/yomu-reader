import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBToken } from '../../src/reader/app/types';
import { applyTokensToScanTarget, collectTextTargetsIn } from '../../src/reader/dom';
import { BACKGROUND_IMAGE_READER_SELECTOR } from '../../src/reader/ocr/canvas-readers';
import { classifyRenderableMediaMutations } from '../../src/reader/ocr/renderable-media-mutations';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

import { MIRROR_TEXT, mirrorToken } from './helpers/japanese-token-fixtures';

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

// A word whose pitch is known per morpheme, so its span carries Yomu's inline
// underline-gradient style as well as the CSS gradient backgrounds.
function pitchComponentWord(start: number): JPDBToken {
    const token = mirrorToken();
    token.card.pitchComponents = [
        { spelling: '日本', reading: 'にほん', pitchAccent: ['LHH'], wordWithReading: null },
        { spelling: '語', reading: 'ご', pitchAccent: ['H'], wordWithReading: null },
    ];
    return { ...token, start, end: start + MIRROR_TEXT.length };
}

function paintPageProse(paragraph: HTMLElement, tokens: JPDBToken[]): MutationRecord[] {
    const observer = new MutationObserver(() => undefined);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const [target] = collectTextTargetsIn(paragraph, 40, false);
    if (!target) throw new Error('Expected a page prose text target');
    applyTokensToScanTarget(target, tokens, { ...DEFAULT_SETTINGS, showPitchAccent: true });
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
}

afterEach(() => {
    document.head.querySelectorAll('style').forEach(style => style.remove());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

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

    it('classifies destructive word paint in page prose without a computed-style read', () => {
        const paragraph = document.createElement('p');
        paragraph.textContent = `${MIRROR_TEXT}を読む${MIRROR_TEXT}`;
        document.body.append(paragraph);
        const records = paintPageProse(paragraph, [pitchComponentWord(0), pitchComponentWord(6)]);
        expect(paragraph.querySelectorAll('.jpdb-reader-word[data-pitch-components]')).toHaveLength(2);

        const styleSpy = vi.spyOn(window, 'getComputedStyle');
        const wordSelectorMatches: string[] = [];
        const matches = Element.prototype.matches;
        vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
            if (selector === BACKGROUND_IMAGE_READER_SELECTOR && this.classList.contains('jpdb-reader-word')) {
                wordSelectorMatches.push(this.outerHTML);
            }
            return matches.call(this, selector);
        });
        const batch = classifyRenderableMediaMutations(records);

        // Page-word paint stays visible (render-rejection repair relies on it)...
        expect(batch.mutations.length).toBeGreaterThan(0);
        // ...but the painted spans are not media and cost no style recalc, nor
        // an inline-style serialization for the background attribute selector.
        expect(batch.touchesRenderableMedia).toBe(false);
        expect(batch.addedImage).toBe(false);
        expect(styleSpy).not.toHaveBeenCalled();
        expect(wordSelectorMatches).toEqual([]);
    });

    it('still finds page media a multi-fragment word span wraps', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.append('日', document.createElement('img'), '本語');
        document.body.append(word);
        const mutation = childListMutation(document.body, [word]);

        expect(classifyRenderableMediaMutations([mutation])).toMatchObject({
            touchesRenderableMedia: true,
            addedImage: true,
        });
    });

    it('still classifies an added inline url() background as renderable media', () => {
        const page = document.createElement('div');
        page.style.backgroundImage = 'url("https://reader.example.test/page-1.jpg")';
        document.body.append(page);
        const mutation = childListMutation(document.body, [page]);
        const styleSpy = vi.spyOn(window, 'getComputedStyle');

        expect(classifyRenderableMediaMutations([mutation])).toEqual({
            mutations: [mutation],
            touchesRenderableMedia: true,
            addedImage: true,
            restylesEverySurface: false,
        });
        expect(styleSpy).toHaveBeenCalledWith(page);
    });

    it('still classifies a reader page whose url() background comes from a stylesheet', () => {
        const style = document.createElement('style');
        style.textContent = '.manga-page { background-image: url("https://reader.example.test/page-2.jpg"); }';
        document.head.append(style);
        const page = document.createElement('div');
        page.className = 'manga-page';
        page.setAttribute('data-page-index', '2');
        document.body.append(page);
        const mutation = childListMutation(document.body, [page]);

        expect(classifyRenderableMediaMutations([mutation])).toMatchObject({
            touchesRenderableMedia: true,
            addedImage: true,
        });
    });

    it('ignores a stylesheet background without the reader-surface signal, as the surface census does', () => {
        const style = document.createElement('style');
        style.textContent = '.hero { background-image: url("https://site.example.test/hero.jpg"); }';
        document.head.append(style);
        const hero = document.createElement('div');
        hero.className = 'hero';
        document.body.append(hero);
        const mutation = childListMutation(document.body, [hero]);
        const styleSpy = vi.spyOn(window, 'getComputedStyle');

        expect(classifyRenderableMediaMutations([mutation])).toMatchObject({
            touchesRenderableMedia: false,
            addedImage: false,
        });
        expect(styleSpy).not.toHaveBeenCalled();
    });
});
