import { describe, expect, it } from 'vitest';

import {
    positionOcrSurfaces,
    type OcrPositionSources,
    type OcrPositionSurface,
} from '../../src/reader/ocr/ocr-position-pass';

describe('OCR position pass', () => {
    it('gathers every surface measurement before the first overlay write', () => {
        const events: string[] = [];
        const surfaces = [surface('one', events), surface('two', events)];
        const sources: OcrPositionSources = {
            sourceRect: image => {
                events.push(`read:${image.dataset.probe}:rect`);
                return new DOMRect(10, 20, 320, 180);
            },
            isVisible: image => {
                events.push(`read:${image.dataset.probe}:visible`);
                return true;
            },
            transformSurface: image => {
                events.push(`read:${image.dataset.probe}:surface`);
                return null;
            },
            renderedFrame: image => {
                events.push(`read:${image.dataset.probe}:frame`);
                return { imageLeft: 0, imageTop: 0, imageWidth: 320, imageHeight: 180 };
            },
            fontScale: () => {
                events.push('read:font-scale');
                return 1;
            },
        };

        positionOcrSurfaces(surfaces, sources);

        const firstWrite = events.findIndex(event => event.startsWith('write:'));
        const lastRead = events.reduce(
            (last, event, index) => event.startsWith('read:') ? index : last,
            -1,
        );
        expect(firstWrite).toBeGreaterThan(lastRead);
        expect(surfaces.map(({ overlay }) => ({
            hidden: overlay.hidden,
            left: overlay.style.left,
            top: overlay.style.top,
            width: overlay.style.width,
            height: overlay.style.height,
            role: overlay.getAttribute('role'),
        }))).toEqual([
            { hidden: false, left: '10px', top: '20px', width: '320px', height: '180px', role: 'region' },
            { hidden: false, left: '10px', top: '20px', width: '320px', height: '180px', role: 'region' },
        ]);
    });
});

function surface(id: string, events: string[]): OcrPositionSurface {
    const image = document.createElement('img');
    image.dataset.probe = id;
    const overlay = document.createElement('div');
    overlay.dataset.ocrLayerId = id;
    let hidden = false;
    Object.defineProperty(overlay, 'hidden', {
        configurable: true,
        get: () => hidden,
        set: value => {
            hidden = Boolean(value);
            events.push(`write:${id}:hidden`);
        },
    });
    document.body.append(image, overlay);
    return { image, overlay };
}
