import { beforeEach, describe, expect, it, vi } from 'vitest';

const canvasMocks = vi.hoisted(() => ({
    installCanvasMirrorRecorder: vi.fn(),
}));

vi.mock('../../src/reader/ocr/canvas-mirror', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/ocr/canvas-mirror')>(),
    installCanvasMirrorRecorder: canvasMocks.installCanvasMirrorRecorder,
}));

describe('OCR document-start activation', () => {
    beforeEach(() => {
        vi.resetModules();
        canvasMocks.installCanvasMirrorRecorder.mockReset();
    });

    it('keeps page-forged events inert and accepts only the sandbox-private activation', async () => {
        await import('../../src/reader/companions/ocr-manga');

        expect(canvasMocks.installCanvasMirrorRecorder).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('yomu:target-owned-document-start'));
        expect(canvasMocks.installCanvasMirrorRecorder).not.toHaveBeenCalled();

        const { activateTargetOwnedDocumentStartCompanions } = await import(
            '../../src/reader/app/target-owned-document-start'
        );
        activateTargetOwnedDocumentStartCompanions();
        activateTargetOwnedDocumentStartCompanions();

        expect(canvasMocks.installCanvasMirrorRecorder).toHaveBeenCalledOnce();
    });
});
