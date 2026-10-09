import { installCanvasMirrorRecorder } from '../ocr/canvas-mirror';
import { ImageOcrController } from '../ocr/controller';
import { normalizeOcrRenderedText } from '../ocr/rendered-text';
import { registerYomuCompanion } from './registry';
import { registerTargetOwnedDocumentStartActivator } from '../app/target-owned-document-start';

// Registering the OCR implementation is inert. The core emits this one-shot
// activation at document-start only where it runs a Reader (an installed
// Reader, or the hosted fallback), so a page that loads the companion without
// one never patches canvas prototypes or starts the recorder's retry window.
let documentStartActivated = false;
registerTargetOwnedDocumentStartActivator(() => {
    if (documentStartActivated) return;
    documentStartActivated = true;
    installCanvasMirrorRecorder();
});

registerYomuCompanion('ocr', {
    ImageOcrController,
    normalizeOcrRenderedText,
});
