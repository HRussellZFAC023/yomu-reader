import { installCanvasMirrorRecorder } from '../ocr/canvas-mirror';
import { ImageOcrController } from '../ocr/controller';
import { normalizeOcrRenderedText } from '../ocr/rendered-text';
import { registerYomuCompanion } from './registry';

// Must run at document-start, before the BookWalker/NFBR viewer engine paints,
// so we record descramble drawImage ops and can rebuild tainted canvases for OCR.
installCanvasMirrorRecorder();

registerYomuCompanion('ocr', {
    ImageOcrController,
    normalizeOcrRenderedText,
});
