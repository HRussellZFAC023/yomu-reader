import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createPrivateRasterImage,
    privateRasterHost,
    privateRasterImageForHost,
    releasePrivateRasterImage,
    setPrivateRasterClass,
    setPrivateRasterSource,
} from '../../src/reader/ocr/private-raster-presenter';

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('private OCR raster presentation', () => {
    it('updates a visible geometry host without exposing raster bytes or a pixel element', async () => {
        const observed: MutationRecord[] = [];
        const observer = new MutationObserver(records => observed.push(...records));
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });

        const image = createPrivateRasterImage('jpdb-ocr-video-frame');
        const host = privateRasterHost(image);
        setPrivateRasterClass(image, 'jpdb-ocr-video-frame-pending', true);
        setPrivateRasterSource(image, 'data:image/jpeg;base64,PRIVATE_FRAME_ONE');
        host.style.cssText = 'position:fixed;left:10px;top:20px;width:640px;height:360px';
        document.body.append(host);
        await Promise.resolve();

        expect(host.shadowRoot).toBeNull();
        expect(document.querySelectorAll('img,canvas')).toHaveLength(0);
        expect(host.getAttribute('src')).toBeNull();
        expect(host.outerHTML).not.toContain('PRIVATE_FRAME_ONE');
        expect(host.style.width).toBe('640px');
        expect(host.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
        expect(observed.flatMap(record => [...record.addedNodes]).some(node => node instanceof HTMLImageElement)).toBe(false);
        expect(privateRasterImageForHost(host)).toBe(image);

        setPrivateRasterSource(image, 'data:image/jpeg;base64,PRIVATE_FRAME_TWO');
        setPrivateRasterClass(image, 'jpdb-ocr-video-frame-pending', false);
        host.style.width = '320px';
        await Promise.resolve();
        expect(host.outerHTML).not.toContain('PRIVATE_FRAME_TWO');
        expect(host.style.width).toBe('320px');
        expect(host.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
        observer.disconnect();
    });

    it('clears raster bytes and revokes presenter-owned object URLs on teardown', () => {
        const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
        const revokeObjectUrl = vi.fn();
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
        const image = createPrivateRasterImage('jpdb-ocr-canvas-frame');
        const host = privateRasterHost(image);
        const privateRoot = image.getRootNode() as ShadowRoot;
        setPrivateRasterSource(image, 'blob:https://viewer.bookwalker.jp/private-capture', { revokeOnRelease: true });
        document.body.append(host);

        releasePrivateRasterImage(image);

        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://viewer.bookwalker.jp/private-capture');
        expect(image.getAttribute('src')).toBeNull();
        expect(privateRoot.childNodes).toHaveLength(0);
        expect(host.isConnected).toBe(false);
        expect(privateRasterImageForHost(host)).toBeUndefined();
        if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
        else delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    });
});
