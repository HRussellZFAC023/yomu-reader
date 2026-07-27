import { describe, expect, it } from 'vitest';
import {
    MAX_CAPTURE_EDGE,
    captureTargetForDisplay,
    nativeCaptureSize,
    selectCaptureSourceForDisplay,
    type GamingDisplayGeometry,
} from '../../src/gaming/display';

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
