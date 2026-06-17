import '../companions/register-build-target';
import { bootReaderApp } from '../app/boot';
import { isYomuNewTabUrl } from '../newtab/url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from '../app/preferred-site-language';
import { applyMokuroReaderOcrDefault, installMokuroOcrToggleNote } from '../app/mokuro-integration';
import { installUserscriptGmStorageBridgeWhenReady, installUserscriptHttpBridgeWhenReady } from './index';
import { installCanvasMirrorRecorder } from '../ocr/canvas-mirror';

installPreferredJapaneseSiteLanguageFromStoredSettings();
// Must run at document-start, before the BookWalker/NFBR viewer engine paints, so
// we record its descramble drawImage ops and can rebuild the tainted page canvas
// for OCR on Firefox/iPad. No-op off BookWalker hosts.
installCanvasMirrorRecorder();
// Must run at document-start, before mokuro reads its settings from localStorage,
// so mokuro's own OCR overlay starts off and the reader OCRs the page instead.
applyMokuroReaderOcrDefault();
installUserscriptHttpBridgeWhenReady();
installUserscriptGmStorageBridgeWhenReady();
if (!isYomuNewTabUrl(location.href)) bootWhenDocumentIsReady();

function bootWhenDocumentIsReady(): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDocumentReady, { once: true });
        return;
    }
    onDocumentReady();
}

function onDocumentReady(): void {
    installMokuroOcrToggleNote();
    bootReaderApp();
}
