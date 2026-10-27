import { describe, expect, it } from 'vitest';
import {
    MAX_CAPTURE_EDGE,
    captureTargetForDisplay,
    nativeCaptureSize,
    selectCaptureSourceForDisplay,
    type GamingDisplayGeometry,
} from '../../src/gaming/display';
import { vi } from "vitest";
import { withHiddenCaptureWindows } from "../../src/gaming/capture-windows";
import { normalizeGamingOcrResponse } from "../../src/gaming/shared";
import { providerSpanBox } from "../../src/gaming/renderer/word-boxes";
import { layerInputRegions, pointInLayerRegions } from "../../src/gaming/layer-input";

function display(
    id: string,
    size: { width: number; height: number },
    scaleFactor: number,
    x = 0,
): GamingDisplayGeometry {
    const bounds = { x, y: 0, width: size.width, height: size.height };
    return { id, bounds, workArea: bounds, size, scaleFactor };
}

function screenSource(displayId: string) {
    return { kind: 'screen', displayId };
}

describe('Yomu Gaming capture-size derivation', () => {
    it('captures at the display’s own native framebuffer', () => {
        expect(nativeCaptureSize(display('1', { width: 1512, height: 982 }, 2))).toEqual({ width: 3024, height: 1964 });
    });

    it('uses the second monitor’s scale factor, not the primary one', () => {
        const retina = display('1', { width: 1512, height: 982 }, 2);
        const external = display('2', { width: 2560, height: 1440 }, 1, 1512);
        // Mixed DPI: each display must be measured with its own scaleFactor, or the
        // external grab comes back at the wrong resolution.
        expect(nativeCaptureSize(retina)).toEqual({ width: 3024, height: 1964 });
        expect(nativeCaptureSize(external)).toEqual({ width: 2560, height: 1440 });
    });

    it('caps the long edge so a 5K panel cannot blow up the OCR payload', () => {
        const size = nativeCaptureSize(display('1', { width: 5120, height: 2880 }, 2));
        expect(Math.max(size.width, size.height)).toBe(MAX_CAPTURE_EDGE);
        expect(size).toEqual({ width: 3840, height: 2160 });
    });

    it('never derives a zero or negative capture size', () => {
        expect(nativeCaptureSize({ size: { width: 0, height: 0 }, scaleFactor: 0 })).toEqual({ width: 1, height: 1 });
        expect(nativeCaptureSize({ size: { width: 1920, height: 1080 }, scaleFactor: Number.NaN }))
            .toEqual({ width: 1920, height: 1080 });
    });
});

describe('Yomu Gaming capture target', () => {
    const displays = [
        display('1', { width: 1512, height: 982 }, 2),
        display('2', { width: 2560, height: 1440 }, 1, 1512),
    ];

    it('takes bounds and capture size from the display the player is on', () => {
        const target = captureTargetForDisplay(displays, displays[1]);
        expect(target).toEqual({
            displayId: '2',
            displayIndex: 1,
            bounds: { x: 1512, y: 0, width: 2560, height: 1440 },
            captureSize: { width: 2560, height: 1440 },
        });
    });

    it('keeps the overlay bounds and the grab on the same display', () => {
        const target = captureTargetForDisplay(displays, displays[0]);
        expect(target.bounds).toEqual(displays[0].bounds);
        expect(target.displayId).toBe('1');
    });

    it('falls back to the first position when the display is not listed', () => {
        expect(captureTargetForDisplay([], displays[1]).displayIndex).toBe(0);
    });
});

describe('Yomu Gaming display selection', () => {
    it('picks the grab belonging to the target display', () => {
        const sources = [screenSource('1'), screenSource('2'), screenSource('3')];
        const chosen = selectCaptureSourceForDisplay(sources, { displayId: '2', displayIndex: 1 });
        expect(chosen?.displayId).toBe('2');
    });

    it('does not hand back monitor 1 when the player is on monitor 2', () => {
        const sources = [screenSource('1'), screenSource('2')];
        expect(selectCaptureSourceForDisplay(sources, { displayId: '2', displayIndex: 1 })).toBe(sources[1]);
    });

    it('accepts the only screen even when the platform reports no display id', () => {
        const sources = [{ kind: 'screen', displayId: '' }];
        expect(selectCaptureSourceForDisplay(sources, { displayId: '77', displayIndex: 0 })).toBe(sources[0]);
    });

    it('falls back to display order when no source reports a display id', () => {
        const sources = [{ kind: 'screen', displayId: '' }, { kind: 'screen', displayId: '' }];
        expect(selectCaptureSourceForDisplay(sources, { displayId: '77', displayIndex: 1 })).toBe(sources[1]);
    });

    it('still returns a screen when the position is out of range', () => {
        const sources = [screenSource('1'), screenSource('2')];
        expect(selectCaptureSourceForDisplay(sources, { displayId: '9', displayIndex: 5 })).toBe(sources[0]);
    });

    it('ignores window sources entirely', () => {
        const sources = [{ kind: 'window', displayId: '2' }, screenSource('1')];
        expect(selectCaptureSourceForDisplay(sources, { displayId: '2', displayIndex: 0 })).toBe(sources[1]);
    });

    it('reports nothing when the screen has not warmed up yet', () => {
        expect(selectCaptureSourceForDisplay([], { displayId: '1', displayIndex: 0 })).toBeNull();
    });
});

describe('desktop capture owns exclusion, not OCR text filtering', () => {
    function windowDouble(visible = true) {
        let showing = visible;
        return {
            isDestroyed: () => false,
            isVisible: () => showing,
            hide: vi.fn(() => { showing = false; }),
            showInactive: vi.fn(() => { showing = true; }),
        };
    }


    it('hides settings and overlay before sampling and keeps a replaced overlay hidden', async () => {
        const settings = windowDouble(), overlay = windowDouble(), parked = windowDouble(false);
        let settled = false;
        await withHiddenCaptureWindows([settings, overlay, parked], async () => {
            expect(settings.isVisible()).toBe(false);
            expect(overlay.isVisible()).toBe(false);
            settled = true;
        }, async () => {
            expect(settled).toBe(true);
            expect(settings.isVisible()).toBe(false);
            expect(overlay.isVisible()).toBe(false);
        }, overlay);
        expect(settings.showInactive).toHaveBeenCalledOnce();
        expect(overlay.showInactive).not.toHaveBeenCalled();
        expect(parked.showInactive).not.toHaveBeenCalled();
    });

    it('restores without focus even if capture fails', async () => {
        const settings = windowDouble();
        await expect(withHiddenCaptureWindows([settings], async () => {}, async () => {
            throw new Error('Permission denied');
        })).rejects.toThrow('Permission denied');
        expect(settings.showInactive).toHaveBeenCalledOnce();
    });

    it('retains real game text at screen edges and behind where the toolbar used to be', () => {
        const result = normalizeGamingOcrResponse({ lines: [
            { text: '日本語', box: { left: 0, top: 0, width: 40, height: 20 }, vertical: true },
            { text: 'よむ', box: { left: 900, top: 5, width: 50, height: 20 }, vertical: false },
        ] }, 1000, 800);
        expect(result?.lines).toHaveLength(2);
        expect(result?.lines[0]).toMatchObject({ hasGeometry: true, vertical: true, box: { left: 0, top: 0 } });
        expect(result?.lines[1].text).toBe('よむ');
    });
});

describe('provider geometry survives desktop parsing and tokenizer boundaries', () => {
    it('uses unequal provider widths instead of distributing all glyphs evenly', () => {
        const words = [{ text: '冒険', box: { left: 0, top: 0, width: 20, height: 10 } },
            { text: 'へ行く', box: { left: 30, top: 0, width: 90, height: 10 } }];
        expect(providerSpanBox('冒険へ行く', words, 2, 3, false)).toEqual({ left: 30, top: 0, width: 30, height: 10 });
        expect(providerSpanBox('冒険へ行く', words, 1, 4, false)).toEqual({ left: 10, top: 0, width: 80, height: 10 });
        const result = normalizeGamingOcrResponse({ lines: [{ text: '冒険へ行く', box: { left: 0, top: 0, width: 120, height: 10 }, words }] }, 200, 100);
        expect(result?.lines[0].words).toEqual(words);
    });
    it('interpolates vertical spans on the vertical axis', () => {
        expect(providerSpanBox('日本語', [{ text: '日本語', box: { left: 10, top: 20, width: 20, height: 90 } }], 1, 3, true))
            .toEqual({ left: 10, top: 50, width: 20, height: 60 });
    });
    it('only captures input over valid explicit word or popup regions', () => {
        const regions = layerInputRegions([{ left: 10, top: 20, width: 30, height: 40 }, { left: NaN, top: 0, width: 100, height: 100 }]);
        expect(regions).toHaveLength(1);
        expect(pointInLayerRegions(15, 25, regions)).toBe(true);
        expect(pointInLayerRegions(40, 25, regions)).toBe(false);
        expect(pointInLayerRegions(15, 19, regions)).toBe(false);
    });



    it('offsets nested provider words together with their enclosing OCR region', () => {
        const result = normalizeGamingOcrResponse({ ocr_regions: [{
            box: { left: 500, top: 300, width: 200, height: 100 },
            lines: [{ text: '日本語', box: { left: 10, top: 20, width: 60, height: 30 }, vertical: false,
                words: [{ text: '日本語', box: { left: 10, top: 20, width: 60, height: 30 } }] }],
        }] }, 1000, 800);
        expect(result?.lines[0].box).toEqual({ left: 510, top: 320, width: 60, height: 30 });
        expect(result?.lines[0].words?.[0].box).toEqual({ left: 510, top: 320, width: 60, height: 30 });
        expect(providerSpanBox('日本語', result!.lines[0].words!, 0, 3, false)).toEqual(result?.lines[0].box);
    });

    it('interpolates supplementary Japanese characters by glyph count rather than UTF-16 units', () => {
        expect(providerSpanBox('𠮷田', [{ text: '𠮷田', box: { left: 0, top: 0, width: 40, height: 20 } }], 0, 2, false))
            .toEqual({ left: 0, top: 0, width: 20, height: 20 });
    });
});
