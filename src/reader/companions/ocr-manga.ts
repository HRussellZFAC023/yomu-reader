import { installCanvasMirrorRecorder } from '../ocr/canvas-mirror';
import { ImageOcrController } from '../ocr/controller';
import { normalizeOcrRenderedText } from '../ocr/rendered-text';
import { registerYomuCompanion } from './registry';
import { registerTargetOwnedDocumentStartActivator } from '../app/target-owned-document-start';

// Registering the OCR implementation is inert. The core emits this one-shot
// activation only after it has positive stored learner intent; existing users
// still reach it at document-start, while a fresh/dismissed chooser never
// patches canvas prototypes or starts the recorder's null-root retry window.
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
