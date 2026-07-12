import { collectQuestionSignals, resolveImageDependencyState } from './classify.mjs';
import { vectorReviewState } from './pdf-vector-parse.mjs';

/** Pure parsers for poppler tool output, kept separate so tests need no PDFs. */

export function parsePdfInfo(stdout) {
    const fields = {};
    for (const line of stdout.split('\n')) {
        const separator = line.indexOf(':');
        if (separator === -1) continue;
        fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    const pageCount = Number(fields.Pages);
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
        throw new Error(`pdfinfo reported no usable page count (Pages=${fields.Pages ?? 'missing'})`);
    }
    const dimensions = new Map();
    const rotations = new Map();
    for (const line of stdout.split('\n')) {
        const size = line.match(/^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/iu);
        if (size) dimensions.set(Number(size[1]), {
            page: Number(size[1]),
            widthPoints: Number(size[2]),
            heightPoints: Number(size[3]),
            rotation: 0,
        });
        const rotation = line.match(/^Page\s+(\d+)\s+rot:\s+(-?\d+)/iu);
        if (rotation) rotations.set(Number(rotation[1]), Number(rotation[2]));
    }
    const pageDimensions = [...dimensions.values()]
        .map(entry => ({ ...entry, rotation: rotations.get(entry.page) ?? 0 }))
        .sort((a, b) => a.page - b.page);
    return {
        pageCount,
        encrypted: /yes/i.test(fields.Encrypted ?? ''),
        pageSize: fields['Page size'] ?? null,
        pageDimensions,
    };
}

/**
 * Parse `pdfimages -list` output: two header lines, then one row per image
 * object beginning with the page number.
 */
export function parsePdfImagesList(stdout) {
    const images = [];
    for (const line of stdout.split('\n')) {
        const columns = line.trim().split(/\s+/);
        if (columns.length < 6 || !/^\d+$/.test(columns[0]) || !/^\d+$/.test(columns[1])) continue;
        images.push({
            page: Number(columns[0]),
            index: Number(columns[1]),
            type: columns[2],
            width: Number(columns[3]),
            height: Number(columns[4]),
            color: columns[5],
            components: numericOrNull(columns[6]),
            bitsPerComponent: numericOrNull(columns[7]),
            encoding: columns[8],
            interpolated: columns[9],
            objectId: `${columns[10]} ${columns[11]}`,
            xPpi: numericOrNull(columns[12]),
            yPpi: numericOrNull(columns[13]),
        });
    }
    return images;
}

/** Combine per-page text and the raster census into explicit page states. */
export function buildPageCensus({
    pageCount,
    pageTexts,
    imageObjects,
    pageDimensions = [],
    layoutPages = [],
    vectorSignals = [],
}) {
    const imagesByPage = new Map();
    for (const image of imageObjects) {
        imagesByPage.set(image.page, [...(imagesByPage.get(image.page) ?? []), image]);
    }
    const dimensionsByPage = new Map(pageDimensions.map(entry => [entry.page, entry]));
    const layoutByPage = new Map(layoutPages.map(entry => [entry.page, entry]));
    const vectorsByPage = new Map(vectorSignals.map(entry => [entry.page, entry]));
    const pages = [];
    for (let page = 1; page <= pageCount; page += 1) {
        const text = pageTexts[page - 1] ?? '';
        const signals = collectQuestionSignals(text);
        const pageImageObjects = imagesByPage.get(page) ?? [];
        const layout = layoutByPage.get(page) ?? null;
        const vectorSignal = vectorsByPage.get(page) ?? null;
        const pageVectorReviewState = vectorReviewState(vectorSignal);
        const imageObjectCount = pageImageObjects.length;
        pages.push({
            page,
            textStatus: signals.characterCount > 0 ? 'extracted' : 'no-text-layer',
            ocrState: signals.characterCount > 0 ? 'text-layer-present' : 'ocr-required-review',
            signals,
            imageObjectCount,
            imageObjects: pageImageObjects,
            dimensionsPoints: dimensionsByPage.get(page) ?? null,
            layout: layout ? {
                width: layout.width,
                height: layout.height,
                textBoxes: layout.textBoxes,
                mediaRegions: layout.mediaRegions.map(region => ({
                    ...region,
                    originCandidate: imageObjectCount === 0
                        ? 'vector-render-review-required'
                        : 'raster-or-vector-review-required',
                })),
                vectorRegions: pageVectorReviewState === 'no-vector-signal'
                    ? []
                    : [{
                        top: 0,
                        left: 0,
                        width: layout.width,
                        height: layout.height,
                        status: pageVectorReviewState,
                        primitiveCount: vectorSignal?.vectorPrimitiveCount ?? null,
                    }],
            } : null,
            vectorSignal,
            vectorReviewState: pageVectorReviewState,
            imageDependencyState: resolveImageDependencyState({ imageObjectCount, signals }),
        });
    }
    return pages;
}

export function summarizePageCensus(pages) {
    return {
        pageCount: pages.length,
        textCharacterCount: pages.reduce((sum, page) => sum + page.signals.characterCount, 0),
        pagesWithoutTextLayer: pages.filter(page => page.textStatus === 'no-text-layer').length,
        imageObjectCount: pages.reduce((sum, page) => sum + page.imageObjectCount, 0),
        nativeMediaRegionCount: pages.reduce((sum, page) => sum + (page.layout?.mediaRegions.length ?? 0), 0),
        textBoxCount: pages.reduce((sum, page) => sum + (page.layout?.textBoxes.length ?? 0), 0),
        pagesWithoutLayout: pages.filter(page => page.layout === null).length,
        vectorReviewPageCount: pages.filter(page => page.vectorReviewState !== 'no-vector-signal').length,
        questionSignalCandidateCount: pages.reduce(
            (sum, page) => sum + page.signals.numberedItemCount + page.signals.blankSlotCount, 0),
        imageDependentPageCount: pages.filter(page => page.imageDependencyState !== 'text-only-candidate').length,
        listeningCuePageCount: pages.filter(page => page.signals.listeningCueCount > 0).length,
        answerKeyCuePageCount: pages.filter(page => page.signals.answerKeyCueCount > 0).length,
    };
}

function numericOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
