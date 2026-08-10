import '../companions/register-build-target';
import '../app/register-storage-runtime';
import { bootReaderApp } from '../app/boot';
import { isYomuNewTabUrl } from '../newtab/url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from '../app/preferred-site-language';
import { applyMokuroReaderOcrDefault, installMokuroOcrToggleNote } from '../app/mokuro-integration';
import { announceInstalledReaderRuntime, shouldInstallHostedReaderRuntime } from '../app/runtime-presence';
import { installUserscriptGmStorageBridgeWhenReady, installUserscriptHttpBridgeWhenReady } from './index';
import { installPageOpenShadowRootDiscoveryBridge } from '../dom/shadow-scan-registry';
import { promoteStrandedHostedSettingsToGmStorage } from '../settings';

// The hosted website runs the same readable bundle as a no-install fallback.
// Signal a real userscript/extension immediately so that fallback never races
// the installed copy and replaces its GM-backed settings, keys, or progress.
const installedRuntime = announceInstalledReaderRuntime();
const yomuNewTab = isYomuNewTabUrl(location.href);
const docEl = document.documentElement;
if (installedRuntime && !yomuNewTab) delete docEl?.dataset.yomuHosted;
if (installedRuntime || (docEl && shouldInstallHostedReaderRuntime())) {
    if (!installedRuntime) docEl.dataset.yomuHosted = '';
    if (!yomuNewTab) {
        void installPreferredJapaneseSiteLanguageFromStoredSettings().catch(error => {
            console.error('[Yomu Reader] Failed to initialize site-language preference', error);
        });
    }
    // Must run at document-start, before mokuro reads its settings from localStorage.
    applyMokuroReaderOcrDefault();
    installUserscriptHttpBridgeWhenReady();
    installUserscriptGmStorageBridgeWhenReady();
    void promoteStrandedHostedSettingsToGmStorage();
    if (!yomuNewTab) {
        installPageOpenShadowRootDiscoveryBridge();
        bootWhenDocumentIsReady();
    }
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
