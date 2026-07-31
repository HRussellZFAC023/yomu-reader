import '../companions/register-build-target';
import { bootReaderApp } from '../app/boot';
import { isYomuNewTabUrl } from '../newtab/url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from '../app/preferred-site-language';
import { applyMokuroReaderOcrDefault, installMokuroOcrToggleNote } from '../app/mokuro-integration';
import { announceInstalledReaderRuntime } from '../app/runtime-presence';
import { installUserscriptGmStorageBridgeWhenReady, installUserscriptHttpBridgeWhenReady } from './index';
import { installPageOpenShadowRootDiscoveryBridge } from '../dom/shadow-scan-registry';
import { promoteStrandedHostedSettingsToGmStorage } from '../settings';

// The hosted website runs the same readable bundle as a no-install fallback.
// Signal a real userscript/extension immediately so that fallback never races
// the installed copy and replaces its GM-backed settings, keys, or progress.
announceInstalledReaderRuntime();
void installPreferredJapaneseSiteLanguageFromStoredSettings().catch(error => {
    console.error('[Yomu Reader] Failed to initialize site-language preference', error);
});
// Must run at document-start, before mokuro reads its settings from localStorage,
// so mokuro's own OCR overlay starts off and the reader OCRs the page instead.
applyMokuroReaderOcrDefault();
installUserscriptHttpBridgeWhenReady();
installUserscriptGmStorageBridgeWhenReady();
// From the userscript sandbox (direct GM_setValue + same-origin localStorage),
// promote any API key / theme the hosted-app Settings stranded in this origin's
// localStorage into the shared GM store, so they reach every other site's
// userscript. Safe: only fills GM fields still at their default.
void promoteStrandedHostedSettingsToGmStorage();
if (!isYomuNewTabUrl(location.href)) {
    installPageOpenShadowRootDiscoveryBridge();
    bootWhenDocumentIsReady();
}

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
