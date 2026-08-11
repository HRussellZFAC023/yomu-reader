import { beforeEach, describe, expect, it, vi } from 'vitest';

const canvasMocks = vi.hoisted(() => ({
    installCanvasMirrorRecorder: vi.fn(),
}));

vi.mock('../../src/reader/ocr/canvas-mirror', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/ocr/canvas-mirror')>(),
    installCanvasMirrorRecorder: canvasMocks.installCanvasMirrorRecorder,
}));

const TARGET_OWNED_DOCUMENT_START_EVENT = 'yomu:target-owned-document-start';

describe('OCR document-start activation', () => {
    beforeEach(() => {
        vi.resetModules();
        canvasMocks.installCanvasMirrorRecorder.mockReset();
    });

    it('registers OCR capabilities without touching canvas prototypes before target choice', async () => {
        await import('../../src/reader/companions/ocr-manga');

        expect(canvasMocks.installCanvasMirrorRecorder).not.toHaveBeenCalled();

        window.dispatchEvent(new Event(TARGET_OWNED_DOCUMENT_START_EVENT));
        window.dispatchEvent(new Event(TARGET_OWNED_DOCUMENT_START_EVENT));

        expect(canvasMocks.installCanvasMirrorRecorder).toHaveBeenCalledOnce();
    });
});
