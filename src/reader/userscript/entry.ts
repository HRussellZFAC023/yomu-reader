import '../companions/register-build-target';
import '../app/register-storage-runtime';
import { bootReaderApp } from '../app/boot';
import { isYomuNewTabUrl } from '../newtab/url';
import { installPreferredJapaneseSiteLanguageFromStoredSettings } from '../app/preferred-site-language';
import { applyMokuroReaderOcrDefault, installMokuroOcrToggleNote } from '../app/mokuro-integration';
import { announceInstalledReaderRuntime, shouldInstallHostedReaderRuntime } from '../app/runtime-presence';
import { installUserscriptGmStorageBridgeWhenReady, installUserscriptHttpBridgeWhenReady } from './index';
import { SETTINGS_CHANGE_EVENT, USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../app/constants';
import { gmStorageGet, gmStorageGetSync } from '../app/storage';
import { addWindowEventListener, createWindowEvent, dispatchWindowEvent, removeWindowEventListener } from '../platform/window-events';
import { normalizeReaderSettings, promoteStrandedHostedSettingsToGmStorage, SETTINGS_STORAGE_KEY } from '../settings/index';
import type { ReaderSettings } from '../app/types';
import { isYomuHostedAcademyPage, isYomuHostedPassivePage } from '../app/pages';
import { normalizedBridgeEventDetail } from './bridge-detail';
import { isRecord } from '../core/object-utils';

// The aggregate OCR companion is loaded before this core in split userscript
// builds. A DOM event is the one boundary that works in that sandbox as well as
// the self-contained extension build without pulling the large canvas recorder
// back into the size-limited core.
const TARGET_OWNED_DOCUMENT_START_EVENT = 'yomu:target-owned-document-start';
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
    installTargetOwnedDocumentStartActivation(pageOwnedLearningTarget);
    if (!yomuNewTab) {
        bootWhenDocumentIsReady();
    }
}

/**
 * Defer every target-owned document-start mutation behind one durable choice.
 * A synchronous GM/local mirror keeps existing installs on the original early
 * path; an async store and the settings event cover modern managers and a
 * choice completed on this page. A dismissed chooser emits no positive choice,
 * so the host keeps its native settings and prototypes untouched.
 */
function installTargetOwnedDocumentStartActivation(pageOwnsTarget: boolean): void {
    const activateFrom = (value: unknown): boolean => {
        if (!storedSettingsHaveExplicitLearningTarget(value)) return false;
        activateTargetOwnedDocumentStart();
        return true;
    };
    if (pageOwnsTarget) {
        activateTargetOwnedDocumentStart();
        return;
    }
    if (activateFrom(gmStorageGetSync<unknown>(SETTINGS_STORAGE_KEY, null))) return;

    const removeActivationListeners = () => {
        removeWindowEventListener(SETTINGS_CHANGE_EVENT, onSettingsChange);
        removeWindowEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, onStorageBridgeReady);
    };
    const onSettingsChange = (event: Event): void => {
        if (!activateFrom(settingsFromChangeEvent(event))) return;
        removeActivationListeners();
    };
    const loadSharedChoice = () => {
        void gmStorageGet<unknown>(SETTINGS_STORAGE_KEY, null).then(value => {
            if (!activateFrom(value)) return;
            removeActivationListeners();
        });
    };
    const onStorageBridgeReady = () => loadSharedChoice();
    addWindowEventListener(SETTINGS_CHANGE_EVENT, onSettingsChange);
    addWindowEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, onStorageBridgeReady);
    loadSharedChoice();
}

function storedSettingsHaveExplicitLearningTarget(value: unknown): boolean {
    if (!isRecord(value)) return false;
    try {
        return normalizeReaderSettings(value as Partial<ReaderSettings>).learningTargetChosen;
    } catch {
        return false;
    }
}

function settingsFromChangeEvent(event: Event): unknown {
    const detail = normalizedBridgeEventDetail(event);
    return isRecord(detail) ? detail.settings ?? null : null;
}

function activateTargetOwnedDocumentStart(): void {
    if (targetOwnedDocumentStartActivated) return;
    targetOwnedDocumentStartActivated = true;
    installUserscriptHttpBridgeWhenReady();
    applyMokuroReaderOcrDefault();
    dispatchWindowEvent(createWindowEvent(TARGET_OWNED_DOCUMENT_START_EVENT));
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
