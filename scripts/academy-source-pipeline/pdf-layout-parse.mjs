import path from 'node:path';

/**
 * Parse the private `pdftohtml -xml -hidden` layout document without retaining
 * source text. The result contains only page geometry and positioned text/media
 * boxes used by the teacher review overlays.
 */
export function parsePdfLayoutXml(xml) {
    const pages = [];
    const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/giu;
    let match;
    while ((match = pagePattern.exec(xml)) !== null) {
        const attributes = parseAttributes(match[1]);
        const page = {
            page: integer(attributes.number, pages.length + 1),
            width: finiteNumber(attributes.width),
            height: finiteNumber(attributes.height),
            textBoxes: parseBoxes(match[2], 'text'),
            mediaRegions: parseMediaRegions(match[2]),
        };
        if (!(page.width > 0) || !(page.height > 0)) {
            throw new Error(`pdftohtml page ${page.page} has invalid layout dimensions`);
        }
        pages.push(page);
    }
    if (pages.length === 0) throw new Error('pdftohtml produced no page layout records');
    return pages;
}

function parseBoxes(body, tagName) {
    const boxes = [];
    const tagPattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'giu');
    let match;
    while ((match = tagPattern.exec(body)) !== null) {
        const box = boxFromAttributes(parseAttributes(match[1]));
        if (box) boxes.push(box);
    }
    return boxes;
}

function parseMediaRegions(body) {
    const regions = [];
    const imagePattern = /<image\b([^>]*)\/?\s*>/giu;
    let match;
    while ((match = imagePattern.exec(body)) !== null) {
        const attributes = parseAttributes(match[1]);
        const box = boxFromAttributes(attributes);
        if (!box) continue;
        regions.push({
            ...box,
            assetName: attributes.src ? safeAssetName(attributes.src) : null,
        });
    }
    return regions;
}

function parseAttributes(source) {
    const attributes = {};
    const pattern = /([:\w-]+)="([^"]*)"/gu;
    let match;
    while ((match = pattern.exec(source)) !== null) attributes[match[1]] = match[2];
    return attributes;
}

function boxFromAttributes(attributes) {
    const box = {
        top: finiteNumber(attributes.top),
        left: finiteNumber(attributes.left),
        width: finiteNumber(attributes.width),
        height: finiteNumber(attributes.height),
    };
    if (![box.top, box.left, box.width, box.height].every(Number.isFinite)) return null;
    if (box.width < 0 || box.height < 0) return null;
    return box;
}

function safeAssetName(value) {
    const normalized = String(value).replaceAll('\\', '/');
    return path.posix.basename(normalized);
}

function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function integer(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
