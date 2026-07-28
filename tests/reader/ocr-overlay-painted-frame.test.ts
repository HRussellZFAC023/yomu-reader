import { describe, expect, it } from 'vitest';

import {
    composedOcrSurfaceTransform,
    fittedObjectSize,
    imageContentBox,
    layoutOcrOverlayLines,
    objectPositionOffset,
    ocrOverlayLayerPlacement,
    paintedImageFrame,
    type OcrLinearTransform,
    type OcrOverlayFrame,
} from '../../src/reader/ocr/ocr-overlay-geometry';

// The layer's own box and the frame the lines are laid out in come from these four
// functions, and until this file existed none of them had a single assertion on them.
// The first half is a BASELINE: it pins the answers the shipped build gives for an
// untransformed image, so the transform work in the second half can only be read as a
// change where a change was intended. BookWalker, MangaFire and paused YouTube frames
// all arrive through the untransformed path.

function styleOf(values: Partial<Record<string, string>>): CSSStyleDeclaration {
    return {
        borderLeftWidth: '0px',
        borderRightWidth: '0px',
        borderTopWidth: '0px',
        borderBottomWidth: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        transform: 'none',
        ...values,
    } as unknown as CSSStyleDeclaration;
}

function rectOf(left: number, top: number, width: number, height: number) {
    return { left, top, right: left + width, bottom: top + height, width, height };
}

function imageOf(offsetWidth: number, offsetHeight: number): HTMLImageElement {
    const image = document.createElement('img');
    Object.defineProperty(image, 'offsetWidth', { configurable: true, value: offsetWidth });
    Object.defineProperty(image, 'offsetHeight', { configurable: true, value: offsetHeight });
    return image;
}

describe('imageContentBox', () => {
    it('is the whole rect for an image with no border and no padding', () => {
        const box = imageContentBox(imageOf(414, 589), rectOf(100, 50, 414, 589), styleOf({}));
        expect(box).toEqual({ left: 0, top: 0, width: 414, height: 589 });
    });

    it('insets border and padding from the element rect', () => {
        const box = imageContentBox(
            imageOf(414, 589),
            rectOf(0, 0, 414, 589),
            styleOf({
                borderLeftWidth: '2px',
                borderRightWidth: '2px',
                borderTopWidth: '2px',
                borderBottomWidth: '2px',
                paddingLeft: '4px',
                paddingRight: '4px',
                paddingTop: '6px',
                paddingBottom: '8px',
            }),
        );
        expect(box).toEqual({ left: 6, top: 8, width: 402, height: 571 });
    });

    // A rect twice the layout size is what a page zoom (or a uniform scale) hands back,
    // and the edges have to grow with it or the content box lands inside the picture.
    it('scales border and padding by the rect-to-layout ratio', () => {
        const box = imageContentBox(
            imageOf(414, 589),
            rectOf(0, 0, 828, 1178),
            styleOf({
                borderLeftWidth: '2px',
                borderRightWidth: '2px',
                borderTopWidth: '2px',
                borderBottomWidth: '2px',
                paddingLeft: '4px',
                paddingRight: '4px',
                paddingTop: '4px',
                paddingBottom: '4px',
            }),
        );
        expect(box).toEqual({ left: 12, top: 12, width: 804, height: 1154 });
    });

    it('falls back to an unscaled inset when the element has no layout size', () => {
        const box = imageContentBox(imageOf(0, 0), rectOf(0, 0, 200, 100), styleOf({ borderLeftWidth: '3px' }));
        expect(box).toEqual({ left: 3, top: 0, width: 197, height: 100 });
    });

    it('never returns a collapsed content box', () => {
        const box = imageContentBox(imageOf(10, 10), rectOf(0, 0, 10, 10), styleOf({ paddingLeft: '40px' }));
        expect(box.width).toBe(1);
        expect(box.height).toBe(10);
    });
});

describe('fittedObjectSize', () => {
    it('fills the content box by default', () => {
        expect(fittedObjectSize('fill', 400, 400, 804, 1154)).toEqual({ width: 804, height: 1154 });
        expect(fittedObjectSize('', 400, 400, 804, 1154)).toEqual({ width: 804, height: 1154 });
    });

    it('letterboxes a contained picture on the tighter axis', () => {
        expectSize(fittedObjectSize('contain', 400, 400, 804, 1154), 804, 804);
        expectSize(fittedObjectSize('contain', 1600, 900, 800, 800), 800, 450);
    });

    it('overflows a covered picture on the looser axis', () => {
        expectSize(fittedObjectSize('cover', 400, 400, 800, 1200), 1200, 1200);
    });

    it('keeps the intrinsic size for none', () => {
        expect(fittedObjectSize('none', 1600, 900, 400, 400)).toEqual({ width: 1600, height: 900 });
    });

    it('shrinks but never grows for scale-down', () => {
        expectSize(fittedObjectSize('scale-down', 1600, 900, 800, 800), 800, 450);
        expectSize(fittedObjectSize('scale-down', 100, 100, 800, 800), 100, 100);
    });

    it('treats a degenerate source or box as one pixel', () => {
        expect(fittedObjectSize('contain', 0, 0, 0, 0)).toEqual({ width: 1, height: 1 });
    });
});

describe('objectPositionOffset', () => {
    it('centers by default', () => {
        expect(objectPositionOffset('50% 50%', 100, 350)).toEqual({ x: 50, y: 175 });
        expect(objectPositionOffset('', 100, 350)).toEqual({ x: 50, y: 175 });
    });

    it('reads keyword pairs in either order', () => {
        expect(objectPositionOffset('left top', 100, 350)).toEqual({ x: 0, y: 0 });
        expect(objectPositionOffset('right bottom', 100, 350)).toEqual({ x: 100, y: 350 });
        expect(objectPositionOffset('bottom right', 100, 350)).toEqual({ x: 100, y: 350 });
        expect(objectPositionOffset('center', 100, 350)).toEqual({ x: 50, y: 175 });
    });

    it('applies an offset after a keyword, inward from the named edge', () => {
        expect(objectPositionOffset('left 10px', 100, 350)).toEqual({ x: 10, y: 175 });
        expect(objectPositionOffset('right 10px bottom 20px', 100, 350)).toEqual({ x: 90, y: 330 });
    });

    it('reads percentages and lengths per axis', () => {
        expect(objectPositionOffset('25% 75%', 100, 400)).toEqual({ x: 25, y: 300 });
        expect(objectPositionOffset('12px', 100, 400)).toEqual({ x: 12, y: 200 });
    });
});

describe('paintedImageFrame', () => {
    const paintedFrame = (over: Partial<Parameters<typeof paintedImageFrame>[0]> = {}) => paintedImageFrame({
        image: imageOf(414, 589),
        rect: rectOf(100, 50, 414, 589),
        style: styleOf({}),
        objectFit: 'fill',
        objectPosition: '50% 50%',
        sourceWidth: 828,
        sourceHeight: 1178,
        ...over,
    });

    // The frame is answered in the layer's own space: the layer covers the element's
    // border box, so an unbordered fill-fitted image is the whole layer.
    it('is the layer itself for a plain filled image', () => {
        expectFrame(paintedFrame(), { imageLeft: 0, imageTop: 0, imageWidth: 414, imageHeight: 589 });
    });

    it('lands on the letterboxed picture rather than the element for object-fit: contain', () => {
        expectFrame(
            paintedFrame({ objectFit: 'contain', sourceWidth: 400, sourceHeight: 400 }),
            { imageLeft: 0, imageTop: 87.5, imageWidth: 414, imageHeight: 414 },
        );
    });

    it('moves the letterboxed picture with object-position', () => {
        expectFrame(
            paintedFrame({ objectFit: 'contain', sourceWidth: 400, sourceHeight: 400, objectPosition: 'top' }),
            { imageLeft: 0, imageTop: 0, imageWidth: 414, imageHeight: 414 },
        );
    });

    it('composes a scaled content box with the fitted picture', () => {
        expectFrame(paintedFrame({
            rect: rectOf(0, 0, 828, 1178),
            style: styleOf({
                borderLeftWidth: '2px',
                borderRightWidth: '2px',
                borderTopWidth: '2px',
                borderBottomWidth: '2px',
                paddingLeft: '4px',
                paddingRight: '4px',
                paddingTop: '4px',
                paddingBottom: '4px',
            }),
            objectFit: 'contain',
            sourceWidth: 400,
            sourceHeight: 400,
        }), { imageLeft: 12, imageTop: 187, imageWidth: 804, imageHeight: 804 });
    });
});

function expectSize(actual: { width: number; height: number }, width: number, height: number): void {
    expect(actual.width).toBeCloseTo(width, 6);
    expect(actual.height).toBeCloseTo(height, 6);
}

function expectFrame(actual: OcrOverlayFrame, expected: OcrOverlayFrame): void {
    expect(actual.imageLeft).toBeCloseTo(expected.imageLeft, 6);
    expect(actual.imageTop).toBeCloseTo(expected.imageTop, 6);
    expect(actual.imageWidth).toBeCloseTo(expected.imageWidth, 6);
    expect(actual.imageHeight).toBeCloseTo(expected.imageHeight, 6);
}

// A23.1. An image under `transform: rotate(-3deg)` reports an AXIS-ALIGNED BOUNDING BOX
// from getBoundingClientRect: measured on the live site, 444.25 x 609.66 for an element
// whose own layout box is 414 x 589. Sizing the layer from that box and laying lines out
// linearly inside it walked every reading off its glyphs by ~20px on a 30px column.
describe('composedOcrSurfaceTransform', () => {
    function tree(transforms: { image?: string; parent?: string; grandparent?: string }): HTMLImageElement {
        const grandparent = document.createElement('div');
        const parent = document.createElement('div');
        const image = imageOf(414, 589);
        if (transforms.grandparent) grandparent.style.transform = transforms.grandparent;
        if (transforms.parent) parent.style.transform = transforms.parent;
        if (transforms.image) image.style.transform = transforms.image;
        grandparent.append(parent);
        parent.append(image);
        document.body.append(grandparent);
        return image;
    }

    it('is null for an untransformed image whose rect matches its layout box', () => {
        const image = tree({});
        expect(composedOcrSurfaceTransform(image, document.body, rectOf(0, 0, 414, 589))).toBeNull();
    });

    it('is null when the whole chain is translation only', () => {
        const image = tree({ image: 'translate(30px, -12px)', parent: 'translateY(4px)' });
        expect(composedOcrSurfaceTransform(image, document.body, rectOf(0, 0, 414, 589))).toBeNull();
    });

    it('reads the image own rotation', () => {
        const image = tree({ image: 'rotate(-3deg)' });
        const linear = composedOcrSurfaceTransform(image, document.body, rectOf(0, 0, 444.25, 609.66));
        expect(linear?.a).toBeCloseTo(0.99863, 5);
        expect(linear?.b).toBeCloseTo(-0.05234, 5);
        expect(linear?.c).toBeCloseTo(0.05234, 5);
        expect(linear?.d).toBeCloseTo(0.99863, 5);
    });

    it('composes an ancestor rotation with the image own scale', () => {
        const image = tree({ image: 'scale(2)', grandparent: 'rotate(90deg)' });
        const linear = composedOcrSurfaceTransform(image, document.body, rectOf(0, 0, 1178, 828));
        expect(linear?.a).toBeCloseTo(0, 6);
        expect(linear?.b).toBeCloseTo(2, 6);
        expect(linear?.c).toBeCloseTo(-2, 6);
        expect(linear?.d).toBeCloseTo(0, 6);
    });

    // The layer is mounted inside the fullscreen host, so it already inherits whatever
    // that host is transformed by. Counting it again would rotate the layer twice.
    it('stops at the element the layer is mounted in', () => {
        const image = tree({ image: 'rotate(90deg)', grandparent: 'rotate(90deg)' });
        const host = image.parentElement?.parentElement as HTMLElement;
        const linear = composedOcrSurfaceTransform(image, host, rectOf(0, 0, 589, 414));
        expect(linear?.a).toBeCloseTo(0, 6);
        expect(linear?.b).toBeCloseTo(1, 6);
    });

    it('reads a real engine matrix() string', () => {
        const image = tree({ image: 'matrix(1.2, 0.3, -0.4, 0.9, 40, 12)' });
        expect(composedOcrSurfaceTransform(image, document.body, rectOf(0, 0, 700, 700)))
            .toEqual({ a: 1.2, b: 0.3, c: -0.4, d: 0.9 });
    });

    // Anything the 2D placement cannot honestly represent must leave the shipped
    // behaviour alone rather than guess at a projection.
    it('is null for a 3D transform', () => {
        const image = tree({ image: 'perspective(500px) rotateY(20deg)' });
        expect(composedOcrSurfaceTransform(image, document.body, rectOf(0, 0, 400, 589))).toBeNull();
    });
});

describe('ocrOverlayLayerPlacement', () => {
    const LAYOUT = { width: 414, height: 589 };

    // NON-NEGOTIABLE: an untransformed surface must land on exactly the numbers the
    // shipped build wrote, to the last decimal, and carry no transform at all.
    it('hands back the measured rect untouched when there is no transform', () => {
        const rect = rectOf(137.5, 42.25, 414.25, 589.75);
        expect(ocrOverlayLayerPlacement(rect, null, LAYOUT)).toEqual({
            left: 137.5,
            top: 42.25,
            width: 414.25,
            height: 589.75,
            transform: '',
            linear: null,
        });
    });

    // A pure scale or translation leaves the bounding box ON the painted picture, so the
    // shipped arithmetic is already right and is left alone.
    it('leaves an upright scale on the shipped path', () => {
        const rect = rectOf(0, 0, 828, 1178);
        expect(ocrOverlayLayerPlacement(rect, { a: 2, b: 0, c: 0, d: 2 }, LAYOUT)).toEqual({
            left: 0,
            top: 0,
            width: 828,
            height: 1178,
            transform: '',
            linear: null,
        });
    });

    it('recovers the untransformed box of the rotated image from its bounding box', () => {
        const linear = rotation(-3);
        const placement = ocrOverlayLayerPlacement(rectOf(120, 60, 444.25, 609.66), linear, LAYOUT);
        expect(placement.width).toBeCloseTo(414, 0);
        expect(placement.height).toBeCloseTo(589, 0);
        expect(placement.transform).toBe(`matrix(${linear.a}, ${linear.b}, ${linear.c}, ${linear.d}, 0, 0)`);
    });

    // The one property that matters: run the placement back through the browser's own
    // rule (transform about the layer's top-left, then take the bounding box) and the
    // measured rect must come out again.
    it('reproduces the measured bounding box for rotations either way', () => {
        for (const degrees of [-3, 2, 12, -25, 89, 90, 91, 170, -135]) {
            const linear = rotation(degrees);
            const rect = boundingBoxOf(120, 60, LAYOUT.width, LAYOUT.height, linear);
            const placement = ocrOverlayLayerPlacement(rect, linear, LAYOUT);
            const replayed = boundingBoxOf(placement.left, placement.top, placement.width, placement.height, linear);
            expect(replayed.left).toBeCloseTo(rect.left, 3);
            expect(replayed.top).toBeCloseTo(rect.top, 3);
            expect(replayed.width).toBeCloseTo(rect.width, 3);
            expect(replayed.height).toBeCloseTo(rect.height, 3);
        }
    });

    it('reproduces the measured bounding box under a skew', () => {
        const linear = { a: 1, b: 0, c: Math.tan(Math.PI / 12), d: 1 };
        const rect = boundingBoxOf(10, 20, LAYOUT.width, LAYOUT.height, linear);
        const placement = ocrOverlayLayerPlacement(rect, linear, LAYOUT);
        const replayed = boundingBoxOf(placement.left, placement.top, placement.width, placement.height, linear);
        expect(replayed.left).toBeCloseTo(rect.left, 3);
        expect(replayed.width).toBeCloseTo(rect.width, 3);
        expect(replayed.height).toBeCloseTo(rect.height, 3);
    });

    // At 45 degrees the two bounding-box extents carry the same information, so the
    // element's own layout box is the only answer left.
    it('falls back to the layout box where the bounding box cannot be inverted', () => {
        const placement = ocrOverlayLayerPlacement(rectOf(0, 0, 709.2, 709.2), rotation(45), LAYOUT);
        expect(placement.width).toBe(414);
        expect(placement.height).toBe(589);
    });

    it('keeps the shipped path when the layout box is unknown and the box cannot be inverted', () => {
        const rect = rectOf(0, 0, 709.2, 709.2);
        expect(ocrOverlayLayerPlacement(rect, rotation(45), { width: 0, height: 0 })).toEqual({
            left: 0,
            top: 0,
            width: 709.2,
            height: 709.2,
            transform: '',
            linear: null,
        });
    });
});

// A23.1, one level down. Once the layer carries the transform, the line layout's OWN
// measurement of the re-typeset text comes back as a bounding box: at 90 degrees a line
// reports its height as its width, which sized the widest line to the whole layer.
describe('layoutOcrOverlayLines under a transformed layer', () => {
    const FRAME: OcrOverlayFrame = { imageLeft: 0, imageTop: 0, imageWidth: 414, imageHeight: 589 };
    const CONTENT = { width: 200, height: 30 };

    function layerWithLine(contentRect: { width: number; height: number }): HTMLElement {
        const layer = document.createElement('div');
        layer.className = 'jpdb-ocr-layer';
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        line.dataset.ocrText = '町の明かりが見えてきた';
        line.dataset.vertical = 'false';
        line.dataset.boxLeft = '0.1';
        line.dataset.boxTop = '0.1';
        line.dataset.boxWidth = '0.5';
        line.dataset.boxHeight = '0.05';
        const text = document.createElement('span');
        text.className = 'jpdb-ocr-line-text';
        text.textContent = '町の明かりが見えてきた';
        // jsdom lays no text out, so the engine's answer is supplied — which is the whole
        // point here: the number arriving from the engine IS a bounding box.
        text.getBoundingClientRect = () => ({
            ...contentRect,
            left: 0,
            top: 0,
            right: contentRect.width,
            bottom: contentRect.height,
            x: 0,
            y: 0,
            toJSON: () => '',
        }) as DOMRect;
        line.append(text);
        layer.append(line);
        document.body.append(layer);
        return layer;
    }

    function lineSidesOf(layer: HTMLElement): number[] {
        return lineBoxOf(layer).split('|').map(Number.parseFloat);
    }

    function lineBoxOf(layer: HTMLElement): string {
        const line = layer.querySelector<HTMLElement>('.jpdb-ocr-line');
        return `${line?.style.left}|${line?.style.top}|${line?.style.width}|${line?.style.height}`;
    }

    it('takes the line back out of its bounding box, landing where an upright layer would', () => {
        const upright = layerWithLine(CONTENT);
        layoutOcrOverlayLines(upright, FRAME, 1);

        const linear = rotation(20);
        const rotated = layerWithLine({
            width: Math.abs(linear.a) * CONTENT.width + Math.abs(linear.c) * CONTENT.height,
            height: Math.abs(linear.b) * CONTENT.width + Math.abs(linear.d) * CONTENT.height,
        });
        layoutOcrOverlayLines(rotated, FRAME, 1, linear);

        // Float noise only: the un-inflation divides by the transform's determinant.
        for (const [index, side] of lineSidesOf(rotated).entries()) {
            expect(side).toBeCloseTo(lineSidesOf(upright)[index], 6);
        }
    });

    it('is left exactly as it was when the layer carries no transform', () => {
        const withoutArgument = layerWithLine(CONTENT);
        layoutOcrOverlayLines(withoutArgument, FRAME, 1);
        const withNull = layerWithLine(CONTENT);
        layoutOcrOverlayLines(withNull, FRAME, 1, null);
        expect(lineBoxOf(withNull)).toBe(lineBoxOf(withoutArgument));
    });

    // A rotated bounding box is bigger than the box, so a layer that took it at face value
    // sized the line to something wider than the text in it.
    it('reproduces the defect when the bounding box is taken at face value', () => {
        const linear = rotation(20);
        const naive = layerWithLine({
            width: Math.abs(linear.a) * CONTENT.width + Math.abs(linear.c) * CONTENT.height,
            height: Math.abs(linear.b) * CONTENT.width + Math.abs(linear.d) * CONTENT.height,
        });
        layoutOcrOverlayLines(naive, FRAME, 1);
        const upright = layerWithLine(CONTENT);
        layoutOcrOverlayLines(upright, FRAME, 1);
        expect(lineBoxOf(naive)).not.toBe(lineBoxOf(upright));
    });
});

function rotation(degrees: number): OcrLinearTransform {
    const radians = degrees * Math.PI / 180;
    return { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians) };
}

// The browser's own rule for what getBoundingClientRect answers: transform the four
// corners of the box about its top-left, then take the axis-aligned extent.
function boundingBoxOf(left: number, top: number, width: number, height: number, linear: OcrLinearTransform) {
    const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => ({
        x: left + linear.a * x + linear.c * y,
        y: top + linear.b * x + linear.d * y,
    }));
    const xs = corners.map(corner => corner.x);
    const ys = corners.map(corner => corner.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return rectOf(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY);
}
