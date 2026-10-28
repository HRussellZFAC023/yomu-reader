import { describe, expect, it, vi } from 'vitest';
import { withHiddenCaptureWindows } from '../../src/gaming/capture-windows';
import { normalizeGamingOcrResponse } from '../../src/gaming/shared';

function windowDouble(visible = true) {
    let showing = visible;
    return {
        isDestroyed: () => false,
        isVisible: () => showing,
        hide: vi.fn(() => { showing = false; }),
        showInactive: vi.fn(() => { showing = true; }),
    };
}

describe('desktop capture owns exclusion, not OCR text filtering', () => {
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
