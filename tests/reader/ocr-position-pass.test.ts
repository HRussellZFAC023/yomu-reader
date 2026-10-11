import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    positionOcrSurfaces,
    forgetOcrArtifactScrollMode,
    ocrArtifactSharesDocumentScroll,
    setOcrArtifactScrollMode,
    setOcrArtifactPosition,
    type OcrPositionSources,
    type OcrPositionSurface,
} from '../../src/reader/ocr/ocr-position-pass';

afterEach(() => { vi.unstubAllGlobals(); forgetOcrArtifactScrollMode(); document.body.replaceChildren(); });

describe('OCR position pass', () => {
    it('stamps document coordinates and invalidates ancestry when a source becomes sticky', () => {
        const { image, overlay } = surface('flow', []);
        vi.stubGlobal('scrollX', 25);
        vi.stubGlobal('scrollY', 100);
        const flow = ocrArtifactSharesDocumentScroll(overlay, image);
        expect(flow).toBe(true);
        setOcrArtifactScrollMode(overlay, flow);
        setOcrArtifactPosition(overlay, 10, -60);
        expect(overlay.style.left).toBe('35px');
        expect(overlay.style.top).toBe('40px');
        image.style.position = 'sticky';
        forgetOcrArtifactScrollMode();
        const pinned = ocrArtifactSharesDocumentScroll(overlay, image);
        expect(pinned).toBe(false);
        setOcrArtifactScrollMode(overlay, pinned);
        setOcrArtifactPosition(overlay, 10, 20);
        expect(overlay.style.left).toBe('10px');
        expect(overlay.style.top).toBe('20px');
    });

    it('keeps independent scrollers and fixed shadow hosts on viewport tracking', () => {
        const { image, overlay } = surface('panel', []);
        const panel = document.createElement('div');
        panel.style.overflowY = 'auto';
        document.body.append(panel);
        panel.append(image);
        expect(ocrArtifactSharesDocumentScroll(overlay, image)).toBe(false);
        panel.style.overflowY = '';
        const shadow = panel.attachShadow({ mode:'open' });
        shadow.append(image);
        panel.style.position = 'fixed';
        forgetOcrArtifactScrollMode();
        expect(ocrArtifactSharesDocumentScroll(overlay, image)).toBe(false);
        panel.style.position = '';
        document.body.style.position = 'relative';
        forgetOcrArtifactScrollMode();
        expect(ocrArtifactSharesDocumentScroll(overlay, image)).toBe(false);
        document.body.style.position = '';
    });

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
