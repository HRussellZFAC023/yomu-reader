import { mutationContainsOnlyReaderPaint } from '../dom/mutation';
import { backgroundImageReaderUrl } from './canvas-readers';

export type RenderableMediaMutationBatch = {
    mutations: MutationRecord[];
    touchesRenderableMedia: boolean;
    addedImage: boolean;
    restylesEverySurface: boolean;
};

/**
 * Reduce one observer delivery to the facts the OCR controller needs.
 * Reader-owned paint is discarded first so it cannot invalidate geometry or
 * schedule another OCR pass; page media and stylesheet changes remain visible.
 */
export function classifyRenderableMediaMutations(
    observed: MutationRecord[],
): RenderableMediaMutationBatch {
    const mutations = observed.filter(mutation => !mutationContainsOnlyReaderPaint(mutation));
    let touchesRenderableMedia = false;
    let addedImage = false;
    for (const mutation of mutations) {
        if (!mutationTouchesRenderableMedia(mutation)) continue;
        touchesRenderableMedia = true;
        if (mutationAddsRenderableMedia(mutation)) {
            addedImage = true;
            break;
        }
    }
    return {
        mutations,
        touchesRenderableMedia,
        addedImage,
        restylesEverySurface: mutations.some(mutationCanRestyleEverySurface),
    };
}

function mutationTouchesRenderableMedia(mutation: MutationRecord): boolean {
    if (mutation.type === 'childList') {
        return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsRenderableMedia);
    }
    return mutation.target instanceof Element && nodeContainsRenderableMedia(mutation.target);
}

function mutationAddsRenderableMedia(mutation: MutationRecord): boolean {
    return mutation.type === 'childList'
        && [...mutation.addedNodes].some(nodeContainsRenderableMedia);
}

function mutationCanRestyleEverySurface(mutation: MutationRecord): boolean {
    const target = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;
    if (target?.matches('style, link[rel~="stylesheet"]')) return true;
    if (mutation.type !== 'childList') return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node instanceof Element
        && (node.matches('style, link[rel~="stylesheet"]')
            || Boolean(node.querySelector('style, link[rel~="stylesheet"]'))));
}

function nodeContainsRenderableMedia(node: Node): boolean {
    return isRenderableMediaNode(node)
        || isBackgroundImageReaderNode(node)
        || hasRenderableMediaDescendant(node);
}

function isRenderableMediaNode(node: Node): boolean {
    return node instanceof HTMLImageElement
        || node instanceof HTMLVideoElement
        || node instanceof HTMLCanvasElement
        || node instanceof HTMLSourceElement;
}

function isBackgroundImageReaderNode(node: Node): boolean {
    return node instanceof HTMLElement && Boolean(backgroundImageReaderUrl(node));
}

function hasRenderableMediaDescendant(node: Node): boolean {
    return node instanceof Element
        && Boolean(node.querySelector('img, video, source, canvas, [data-page-index], [style*="background-image"], [style*="background:"][style*="url("]'));
}
