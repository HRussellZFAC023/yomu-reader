import '../companions/register-build-target';
import '../app/register-storage-runtime';
import { bootReaderApp } from '../app/boot';
import { isYomuNewTabUrl } from '../newtab/url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from '../app/preferred-site-language';
import { applyMokuroReaderOcrDefault, installMokuroOcrToggleNote } from '../app/mokuro-integration';
import { announceInstalledReaderRuntime, shouldInstallHostedReaderRuntime } from '../app/runtime-presence';
import { installUserscriptGmStorageBridgeWhenReady, installUserscriptHttpBridgeWhenReady } from './index';
import { promoteStrandedHostedSettingsToGmStorage } from '../settings/index';
import { isYomuHostedAcademyPage, isYomuHostedPassivePage } from '../app/pages';
import { activateTargetOwnedDocumentStartCompanions } from '../app/target-owned-document-start';
import { installDocumentStartTargetPolicy } from './document-start-target-policy';

let targetOwnedDocumentStartActivated = false;

// The hosted website runs the same readable bundle as a no-install fallback.
// Signal a real userscript/extension immediately so that fallback never races
// the installed copy and replaces its GM-backed settings, keys, or progress.
const installedRuntime = announceInstalledReaderRuntime();
const yomuNewTab = isYomuNewTabUrl(location.href);
const pageOwnedLearningTarget = isYomuHostedPassivePage(location.href)
    || isYomuHostedAcademyPage(location.href);
const docEl = document.documentElement;
if (installedRuntime && !yomuNewTab) delete docEl?.dataset.yomuHosted;
if (installedRuntime || (docEl && shouldInstallHostedReaderRuntime())) {
    if (!installedRuntime) docEl.dataset.yomuHosted = '';
    if (!yomuNewTab) {
        void installPreferredJapaneseSiteLanguageFromStoredSettings().catch(error => {
            console.error('[Yomu Reader] Failed to initialize site-language preference', error);
        });
    }
    installUserscriptGmStorageBridgeWhenReady();
    void promoteStrandedHostedSettingsToGmStorage();
    installDocumentStartTargetPolicy(pageOwnedLearningTarget, activateTargetOwnedDocumentStart);
    if (!yomuNewTab) {
        bootWhenDocumentIsReady();
    }
}

function activateTargetOwnedDocumentStart(): void {
    if (targetOwnedDocumentStartActivated) return;
    targetOwnedDocumentStartActivated = true;
    installUserscriptHttpBridgeWhenReady();
    applyMokuroReaderOcrDefault();
    activateTargetOwnedDocumentStartCompanions();
    installMokuroToggleNoteWhenReady();
}

function installMokuroToggleNoteWhenReady(): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installMokuroOcrToggleNote, { once: true });
        return;
    }
    installMokuroOcrToggleNote();
}

function bootWhenDocumentIsReady(): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDocumentReady, { once: true });
        return;
    }
    onDocumentReady();
}

function onDocumentReady(): void {
    bootReaderApp();
}
