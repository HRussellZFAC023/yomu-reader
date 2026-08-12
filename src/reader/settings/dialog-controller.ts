import { AudioPlayer } from '../audio/player';
import { AnkiConnectClient, canUseMobileAnkiHandoff, isAnkiConnectAvailabilityError, hasUserscriptAnkiBridge } from '../anki/index';
import { diagnoseAnkiConnectFailure } from '../anki/transport';
import { copyText, openUrlInNewTab } from '../ui/browser';
import { detectYomuUpdateFlow } from '../app/userscript-update';
import { createAudioPreviewCard } from '../cards/utils';
import { FURIGANA_HIDE_STATE_GROUPS, NEW_TAB_PAGE_URL, NEW_TAB_VERSION_URL, SETTINGS_TITLE } from '../app/constants';
import { readerWordSurfaceText, setInnerHtml } from '../dom/index';
import { JpdbClient } from '../jpdb/jpdb';
import { configureLogger, Logger } from '../app/logger';
import { clearNewTabOfflineCache } from '../newtab/cache';
import { requestJson } from '../network/http';
import { compareYomuVersions, CURRENT_YOMU_VERSION, latestYomuVersionFromVersionJson } from '../app/version';
import {
    findRecommendedDictionary,
    recommendedDictionaryImportOptions,
    type RecommendedDictionary,
} from '../dictionaries/recommended';
import { installSettingsDrawerHandle } from '../popup/shell';
import { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
import { changedSettingsKeys, mergeDictionaryPreferences, NO_EXPLICIT_USER_CHOICE, normalizeAudioSubSources, normalizeReaderSettings, retireStaleDictionaryPreferences, type SaveSettingsOptions } from './index';
import { readAudioSources, readAudioSubSources } from './form-read';
import { detectCustomJsonAudioSubSources, knownAudioSubSourceNames } from '../audio/candidates';
import { captureActiveLanguageProfileDictionaries } from './dictionary';
import { publishSettingsChange as publishPrivateSettingsChange } from './settings-change-bus';
import { effectiveJpdbApiKey, effectiveWanikaniApiToken, hasJitenApiCredential, mergeApiCredentialValues } from './api-credential';
import { WanikaniClient } from '../wanikani/wanikani';
import { bindAuthorizedReaderFormSubmit, dispatchAuthorizedReaderControlEvent } from '../ui/trusted-interaction';
import { exportManagedStoredValues, importStoredValues } from '../app/storage';
import {
    activateSettingsPanel,
    activeTargetLanguageId,
    applySettingsSearch,
    ankiStatusLineForSettings,
    getFormInterfaceLanguage,
    mergeAudioSubSources,
    renderAudioSubSourceList,
    formatSettingsStatusLine,
    renderAnkiStatusHtml,
    installSourceRowDrag,
    installShortcutCapture,
    localizeSettingsForm,
    readFormSettings,
    canonicalNewTabAnkiDisabledDecks,
    renderAnkiDeckLibraryOptions,
    renderAnkiFieldMappingEditor,
    renderAnkiLibraryOptions,
    renderAnkiTemplatePreview,
    renderNewTabAnkiDeckSelector,
    renderDeckControls,
    appearancePreviewContentHtml,
    renderSettingsForm,
    bunproStatusLineForSettings,
    jpdbStatusLineForSettings,
    wanikaniStatusLineForSettings,
    syncAudioSourceRow,
    syncBrowserTtsVoiceOptions,
    syncDisabledSettingsControlDescriptions,
    syncFontFamilyControls,
    syncJpdbMiningDependentSettings,
    syncPageScanModeControls,
    syncReviewSettingsVisibility,
    syncStickyBottomSheetAvailability,
    syncSubtitlePreview,
    updateAudioSourceEditor,
    updateDictionaryLookupLinkEditor,
    updateSourceRowEditor,
} from './form';
import type { AnkiAdapterState, SettingsStatusAction, SettingsStatusDetail, SettingsStatusLine } from './form';
import { installCatalogBrowseFilter } from './catalog-browse-filter';
import {
    COLLAPSED_CATALOG_BROWSE_RENDER,
    handleCatalogBrowseDisclosureAction,
    refreshDictionaryPanel,
    syncExpandedCatalogBrowseSearch,
} from './catalog-browse-disclosure';
import { ankiModelUpdatePromptTarget, applyAnkiModelUpdatePrompt } from './anki-mining-panel';
import { updateAnkiTagsEditor } from './form-tags';
import {
    CLOUD_SETTINGS_SYNC_ENABLED,
    cloudSettingsAuthRedirectResult,
    cloudSettingsSyncAvailable,
    downloadCloudSettingsFromCloud,
    uploadCloudSettingsToCloud,
} from './cloud-sync';
import {
    resumePendingCloudSettingsAction,
    type CloudSettingsAction,
} from './cloud-settings-resume';
import {
    cloudSettingsRedirectHandoffRequired,
    createCloudSettingsAuthorization,
    type CloudSettingsAuthorization,
} from './cloud-settings-auth-state';
import {
    clearCloudSettingsRedirectHandoff,
    clearPendingCloudSettingsAction,
    readPendingCloudSettingsAction,
    rememberCloudSettingsRedirectHandoff,
} from './cloud-settings-pending-action';
import {
    cloudSettingsActionEnabled,
    notifyCloudSettingsPersistenceFailed,
    reportCloudSettingsStatus,
    setCloudSettingsActionButtonDisabled,
    settingsForCloudAction,
} from './cloud-settings-dialog-action';
import { dateStamp, downloadBlob, getReaderDictionaryExport, getReaderSettingsExport, pickFile, pickFiles, readerDictionaryExportHasData, recommendedDictionaryFilename } from './file-io';
import type { AnkiLibraryScanResult, AnkiModelUpdatePlan } from '../anki/types';
import type { AnkiFieldMappingRole, InterfaceLanguage, ReaderSettings } from '../app/types';
import { formatUiText, uiText } from '../app/i18n';
import { isUserFacingError, userFacingCopyKeyOf, userFacingError, userFacingErrorText } from '../app/user-facing-errors';
import {
    isLearningTargetRosterId,
    learningTargetRosterEntry,
} from '../languages';
import { syncLanguageFamilyDom } from './language-gating';
import { bindLiveSettingsSync } from './live-settings-sync';
import {
    syncLanguageProfileForm as syncLiveLanguageProfileForm,
    type LanguageProfileFormSyncRequest,
} from './language-profile-live-sync';
import { publishedDictionaryHeadwordLanguages } from '../dictionaries/catalog/published-coverage';
import { YomitanDictionaryStore, parseYomitanSettingsExport, type ImportSummary } from '../dictionaries/yomitan';
import { markDictionaryReplicaFresh, requestDictionaryReplicaPurge } from '../dictionaries/replica-purge';
import { AcademyAccountSyncSettingsController } from './academy-account-sync';
import { installFocusedControlScrolling } from './focused-control-scrolling';
import { runCredentialDependentSettingsRefreshes, settingsDialogTrigger } from './dialog-open-policy';
import { dictionaryActionBlockedDuringSiteClear } from './local-dictionary-storage-form';
import {
    firefoxAuthenticationInfoRequiresExtensionPage,
    requestFirefoxAuthenticationInfoForChangedSettings,
    requestFirefoxAuthenticationInfoForSettings,
    requestFirefoxAuthenticationInfoPermission,
    type FirefoxAuthenticationInfoConsent,
} from './firefox-data-consent';
import { currentSensitiveSettingsSurfaceIsTrusted, mountSensitiveSettingsLauncher } from './sensitive-settings-surface';
import {
    liveDictionaryPanelContext,
    selectedTargetLanguage,
    type DictionaryStatusSummary,
} from './dictionary-status-view';

interface Refreshable { refresh: () => void }
interface SettingsDialogDependencies {
    getSettings: () => ReaderSettings;
    // `transient` marks a temporary form-derived swap (Anki probes, audio
    // previews) that will be restored immediately: the host must apply the
    // values (dependency calls read getSettings) but skip side-effectful
    // transitions such as the annotations-off instant clear.
    setSettings: (settings: ReaderSettings, options?: { transient?: boolean }) => void;
    saveSettings: (settings: ReaderSettings, options: SaveSettingsOptions) => Promise<void>;
    onSettingsPersisted?: (settings: ReaderSettings) => void;
    onSettingsPersistenceFailed?: (previousSettings: ReaderSettings) => void;
    jpdb: JpdbClient;
    dictionaries: YomitanDictionaryStore;
    anki: AnkiConnectClient;
    audio: AudioPlayer;
    subtitles: Refreshable;
    ocr: Refreshable;
    youtube: Refreshable;
    createBackdrop: () => HTMLElement;
    mountDialog: (backdrop: HTMLElement, surface: HTMLElement) => void;
    dismiss: () => void;
    toast: (message: string) => void;
    applyTheme: (settings?: ReaderSettings) => void;
    applyAccentColor: (color: string) => void;
    applyWordColors: (settings?: ReaderSettings) => void;
    lookupText?: (text: string, sentence: string, anchor: HTMLElement) => void | Promise<void>;
    parseSettingsJapanese?: (form: HTMLFormElement) => void | Promise<void>;
    installFab: () => void;
    refreshDictionaryStyles: () => Promise<void>;
    scheduleDictionaryRescan: () => void;
    refreshNewTabIfCurrent: () => void;
    clearDictionarySourceOpenOverrides: () => void;
    resetAllData: () => void | Promise<void>;
    beginSettingsPreview: (accent: string, language: InterfaceLanguage, theme: ReaderSettings['theme']) => void;
    clearSettingsPreview: () => void;
    publishedDictionaryLanguages?: () => Promise<ReadonlySet<string>>;
}

type SettingsStatusSetter = (message: string) => void;
function isSettingsCommandWord(word: HTMLElement): boolean {
    return Boolean(word.closest('a[href],button,[role="button"],[role="link"],[role="menuitem"],[role="option"],[role="tab"],[data-action]'));
}

type RecommendedDictionaryInstallState = 'queued' | 'installing';
type AnkiScanSelectableInput = HTMLInputElement | HTMLSelectElement;
type AnkiConnectionAction = 'test-anki' | 'prepare-anki' | 'update-anki-model';
type AnkiStatusTone = 'pending' | 'success' | 'error';
type AnkiStatusSetter = (message: string, tone: AnkiStatusTone, action?: SettingsStatusAction) => void;
type AnkiScanConfidence = 'high' | 'medium' | 'low';

interface AnkiScanFormControls {
    deck: AnkiScanSelectableInput | null;
    model: AnkiScanSelectableInput | null;
}

interface AnkiScanSelection {
    selectedDeck: string;
    selectedModel: string;
}

interface RecommendedDictionaryOperationState {
    state: RecommendedDictionaryInstallState;
    message: string;
}

const log = Logger.scope('SettingsDialog');
const JPDB_SETTINGS_URL = 'https://jpdb.io/settings';
const JITEN_SETTINGS_URL = 'https://jiten.moe/settings';
const AUTO_REPLACE_ANKI_DECK_NAMES = new Set(['', 'よむ', 'Yomu']);
// The shipped note-type names. Anything else was named by the learner.
const AUTO_REPLACE_ANKI_MODEL_NAMES = new Set(['', 'よむ Japanese', 'Yomu Japanese']);
const ANKI_FIELD_MAPPING_ROLES = new Set<AnkiFieldMappingRole>(['expression', 'reading', 'meaning', 'sentence', 'audio', 'sentenceAudio', 'image']);
const ANKI_SCAN_CONFIDENCE_VALUES = new Set<AnkiScanConfidence>(['high', 'medium', 'low']);
const AUDIO_SUB_SOURCE_TYPING_DELAY_MS = 900;
// Import/export lives in the Backup & sync panel while dictionary row actions
// stay under Sources; both panels carry a [data-import-status] line. Feedback
// writes ONLY to the panel the action originated from — broadcasting to every
// node left stale success/error text visible on the other panel later.
function settingsStatusSetter(form: HTMLFormElement, control?: HTMLElement | null): SettingsStatusSetter {
    return message => {
        const originPanel = control?.closest<HTMLElement>('fieldset[data-settings-panel]');
        const status = originPanel?.querySelector<HTMLElement>('[data-import-status]')
            ?? form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]')
            ?? form.querySelector<HTMLElement>('[data-import-status]');
        if (!status) return;
        status.textContent = message;
        status.hidden = false;
    };
}

function focusPreviewAudioSource(form: HTMLFormElement, button: HTMLButtonElement | null, previewSettings: ReaderSettings): void {
    const row = button?.closest<HTMLElement>('[data-audio-source-row]');
    if (!row) return;
    const source = previewSettings.audioSources[sourceRowIndex(form, row)];
    if (!source) return;
    previewSettings.audioSources = [{ ...source, enabled: true }];
    previewSettings.audioEnableDefaultSources = false;
}

function sourceRowIndex(form: HTMLFormElement, row: HTMLElement): number {
    return Array.from(form.querySelectorAll('[data-audio-source-row]')).indexOf(row);
}

// Only enabled aggregator rows carrying a usable absolute URL are worth
// probing: a half-typed URL would burn a lookup on a certain failure, and a
// switched-off row is not resolving audio for anyone.
function probeableAudioSourceUrl(row: HTMLElement): string {
    if (row.querySelector<HTMLSelectElement>('select[name$=".type"]')?.value !== 'custom-json') return '';
    if (row.querySelector<HTMLInputElement>('input[name$=".enabled"]')?.checked === false) return '';
    const url = row.querySelector<HTMLInputElement>('[data-audio-url-field]')?.value.trim() ?? '';
    return isProbeableAudioSourceUrl(url) ? url : '';
}

function isProbeableAudioSourceUrl(url: string): boolean {
    try {
        return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
        return false;
    }
}

function recommendedDictionaryForControl(control: HTMLElement | null | undefined): RecommendedDictionary {
    const dictionary = control?.dataset.dictionaryId ? findRecommendedDictionary(control.dataset.dictionaryId) : undefined;
    if (!dictionary) throw new Error('Recommended dictionary not found.');
    return dictionary;
}

function recommendedDictionaryDownloadStatus(control: HTMLElement | null | undefined, dictionaryName: string, language: InterfaceLanguage): string {
    const action = control?.dataset.installed === 'true' ? uiText(language, 'update') : uiText(language, 'dictionaryDownloading');
    return `${dictionaryName}: ${action}...`;
}

function settingsActionButton(control: HTMLElement | null | undefined): HTMLButtonElement | null {
    return control instanceof HTMLButtonElement ? control : control?.closest<HTMLButtonElement>('button') ?? null;
}

function namedSettingsControl<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(form: HTMLFormElement, name: string): T | null {
    const control = form.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
        ? control as T
        : null;
}

// A Jiten key (ak_ prefix) pasted into the JPDB field is routed to jitenApiKey
// internally, but the inputs kept showing it in the wrong box. Once a field is
// committed, move each key to the input it belongs to so the display matches.
export function reconcileApiCredentialInputs(form: HTMLFormElement): void {
    const jpdbField = namedSettingsControl<HTMLInputElement>(form, 'apiCredentialJpdb');
    const jitenField = namedSettingsControl<HTMLInputElement>(form, 'apiCredentialJiten');
    if (!jpdbField && !jitenField) return;
    const { apiKey, jitenApiKey } = mergeApiCredentialValues(jpdbField?.value ?? '', jitenField?.value ?? '');
    if (jpdbField && jpdbField.value !== apiKey) jpdbField.value = apiKey;
    if (jitenField && jitenField.value !== jitenApiKey) jitenField.value = jitenApiKey;
}

function suppressCredentialAutofill(form: HTMLFormElement): void {
    const guarded = form.querySelectorAll<HTMLInputElement>(
        'input.jpdb-reader-masked-input, input[data-settings-search]',
    );
    guarded.forEach(input => {
        if (input.dataset.autofillGuarded === 'true') return;
        input.dataset.autofillGuarded = 'true';
        input.readOnly = true;
        const enable = () => { input.readOnly = false; };
        input.addEventListener('focus', enable);
        input.addEventListener('pointerdown', enable);
        input.addEventListener('keydown', enable);
    });
}

function ankiScanFormControls(form: HTMLFormElement): AnkiScanFormControls {
    return {
        deck: namedSettingsControl<AnkiScanSelectableInput>(form, 'ankiDeck'),
        model: namedSettingsControl<AnkiScanSelectableInput>(form, 'ankiModel'),
    };
}

function settingsControlValue(control: AnkiScanSelectableInput | null): string {
    return control?.value.trim() || '';
}

function shouldUseScannedAnkiDeck(deckNames: string[], currentDeck: string): boolean {
    return Boolean(
        deckNames.length
        && !deckNames.includes(currentDeck)
        && (deckNames.length === 1 || AUTO_REPLACE_ANKI_DECK_NAMES.has(currentDeck)),
    );
}

function selectedAnkiScanDeck(deckNames: string[], currentDeck: string): string {
    return shouldUseScannedAnkiDeck(deckNames, currentDeck) ? deckNames[0] ?? currentDeck : currentDeck;
}

function selectedAnkiScanModel(scan: AnkiLibraryScanResult, currentModel: string): string {
    const savedModel = currentModel.trim();
    if (savedModel && scan.models.some(model => model.modelName === savedModel)) return savedModel;
    // A configured note type the scan does not list is not proof it is gone: the
    // wrong Anki profile may be open, or AnkiConnect may have answered before the
    // collection finished loading. Overwriting it with a suggestion threw away
    // the learner's note type and its field mapping with it (GitHub #31
    // residual). Only the shipped default gets replaced, which is the same rule
    // the deck already follows.
    if (savedModel && !AUTO_REPLACE_ANKI_MODEL_NAMES.has(savedModel)) return savedModel;
    return scan.suggestedModel?.modelName || savedModel;
}

function ankiScanSelection(controls: AnkiScanFormControls, scan: AnkiLibraryScanResult): AnkiScanSelection {
    return {
        selectedDeck: selectedAnkiScanDeck(scan.deckNames, settingsControlValue(controls.deck)),
        selectedModel: selectedAnkiScanModel(scan, settingsControlValue(controls.model)),
    };
}

function applySettingsControlValue(control: AnkiScanSelectableInput | null, value: string): void {
    if (!control || !value) return;
    control.value = value;
    dispatchAuthorizedReaderControlEvent(control, new Event('input', { bubbles: true }));
}

function ankiConnectionAction(action: string): AnkiConnectionAction | null {
    return action === 'test-anki' || action === 'prepare-anki' || action === 'update-anki-model' ? action : null;
}

function ankiConnectionPendingKey(action: AnkiConnectionAction): 'ankiPreparing' | 'ankiTesting' | 'ankiModelUpdating' {
    if (action === 'prepare-anki') return 'ankiPreparing';
    if (action === 'update-anki-model') return 'ankiModelUpdating';
    return 'ankiTesting';
}

function ankiStatusSetter(status: HTMLElement | null): AnkiStatusSetter {
    return (message, tone, action) => {
        if (!status) return;
        status.dataset.statusTone = tone;
        if (action) status.dataset.statusAction = action;
        else delete status.dataset.statusAction;
        setInnerHtml(status, renderAnkiStatusHtml({ message, tone, action }, statusLanguage(status)));
    };
}

function statusLanguage(status: HTMLElement): InterfaceLanguage {
    return (status.closest<HTMLFormElement>('form')?.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')?.value as InterfaceLanguage | undefined) ?? 'en';
}

function isAnkiFieldMappingRole(role: string): role is AnkiFieldMappingRole {
    return ANKI_FIELD_MAPPING_ROLES.has(role as AnkiFieldMappingRole);
}

function isAnkiScanConfidence(value: unknown): value is AnkiScanConfidence {
    return typeof value === 'string' && ANKI_SCAN_CONFIDENCE_VALUES.has(value as AnkiScanConfidence);
}

function ankiScanConfidenceEntries(confidence: Partial<Record<AnkiFieldMappingRole, unknown>>): Array<[AnkiFieldMappingRole, AnkiScanConfidence]> {
    const entries: Array<[AnkiFieldMappingRole, AnkiScanConfidence]> = [];
    for (const [role, value] of Object.entries(confidence)) {
        if (isAnkiFieldMappingRole(role) && isAnkiScanConfidence(value)) entries.push([role, value]);
    }
    return entries;
}

function readNewTabAnkiDisabledDecks(form: HTMLFormElement): string[] {
    return canonicalNewTabAnkiDisabledDecks(
        namedSettingsControl<HTMLInputElement>(form, 'newTabAnkiDisabledDecks')?.value
            .split(',')
            .map(deck => deck.trim())
            .filter(Boolean) ?? [],
    );
}

function selectedSettingsPanel(control: HTMLElement | null | undefined): string {
    return control?.dataset.panel ?? 'api';
}

function requestCancelableFrame(callback: () => void): number {
    if (typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(() => callback());
    }
    return window.setTimeout(callback, 16);
}

function cancelCancelableFrame(id: number): void {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
    else window.clearTimeout(id);
}

function nextSettingsTabIndex(key: string, currentIndex: number, tabCount: number): number {
    if (currentIndex < 0 || tabCount <= 0) return -1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % tabCount;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + tabCount) % tabCount;
    if (key === 'Home') return 0;
    if (key === 'End') return tabCount - 1;
    return -1;
}

function handleSettingsActionError(
    action: string,
    control: HTMLElement | null | undefined,
    setStatus: SettingsStatusSetter,
    error: unknown,
    language: InterfaceLanguage,
): string {
    log.warn('Settings action failed', { action }, error);
    if (shouldReenableSettingsAction(action)) control?.removeAttribute('disabled');
    const message = userFacingErrorText(language, 'actionFailed', error);
    setStatus(message);
    return message;
}

function shouldReenableSettingsAction(action: string): boolean {
    return action === 'download-recommended-dictionary' || action === 'delete-yomitan-dictionary';
}

function isAnkiConnectSetupError(error: unknown): boolean {
    if (isAnkiConnectAvailabilityError(error)) return true;
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return /AnkiConnect/i.test(message)
        && /(not reachable|request failed|timed out|failed to fetch|networkerror|request bridge|CORS)/i.test(message);
}

export class SettingsDialogController {
    private dictionaryOperationQueue: Promise<void> = Promise.resolve();
    private pendingDictionaryOperations = 0;
    private dictionarySiteStorageClearPending = false;
    private recommendedDictionaryOperations = new Map<string, RecommendedDictionaryOperationState>();
    private currentForm?: HTMLFormElement;
    private readonly modal = new LookupModalAccessibility();
    private saveRequestId = 0;
    private ankiConnectionProbeId = 0;
    private jpdbConnectionProbeId = 0;
    private wanikaniConnectionProbeId = 0;
    private ankiLibraryScanId = 0;
    private ankiModelUpdatePromptId = 0;
    private yomuUpdateCheckId = 0;
    private dictionaryRefreshId = 0;
    private targetDictionaryAvailabilityRequestId = 0;
    private publishedDictionaryLanguagesPromise?: Promise<ReadonlySet<string>>;
    private readonly academyAccountSync: AcademyAccountSyncSettingsController;
    private settingsJapaneseParseRefreshFrame: number | undefined;
    private settingsJapaneseParseRefreshTimer: number | undefined;

    constructor(private readonly dependencies: SettingsDialogDependencies) {
        this.academyAccountSync = new AcademyAccountSyncSettingsController(message => dependencies.toast(message));
    }
    open(panel?: string): void {
        const trigger = settingsDialogTrigger(document.activeElement);
        const launcher = mountSensitiveSettingsLauncher(
            this.dependencies,
            this.modal,
            this.settings.interfaceLanguage,
            panel,
            trigger,
        );
        if (launcher) {
            installSettingsDrawerHandle(
                launcher,
                uiText(this.settings.interfaceLanguage, 'resizeSettings'),
                () => this.dismissSettings(),
            );
            return;
        }
        const form = this.createSettingsForm(panel);
        const backdrop = this.dependencies.createBackdrop();
        this.bindFormSubmit(form);
        installFocusedControlScrolling(form);
        this.bindSettingsSearch(form);
        form.addEventListener('yomu-catalog-browse-rendered', () => this.onCatalogBrowseRendered(form));
        installCatalogBrowseFilter(form);
        this.bindSettingsTabs(form);
        this.bindLivePreview(form);
        this.bindEditorControls(form);
        syncLanguageFamilyDom(form, activeTargetLanguageId(this.settings));
        this.currentForm = form;
        this.dependencies.mountDialog(backdrop, form);
        this.modal.activate(form, trigger);
        installSettingsDrawerHandle(form, uiText(this.settings.interfaceLanguage, 'resizeSettings'), () => this.dismissSettings());
        this.dependencies.beginSettingsPreview(this.settings.accentColor, this.settings.interfaceLanguage, this.settings.theme);
        this.syncRecommendedDictionaryInstallControls(form);
        this.syncDictionaryOperationState(form);
        this.syncJpdbStatus(form);
        void this.academyAccountSync.refresh(form, this.settings.interfaceLanguage);
        void this.refreshAnkiConnectionStatus(form);
        runCredentialDependentSettingsRefreshes(firefoxAuthenticationInfoRequiresExtensionPage(), [
            () => void this.refreshJpdbConnectionStatus(form), () => void this.refreshWanikaniConnectionStatus(form),
        ]);
        void this.refreshDictionaryStatus(form);
        this.publishedDictionaryLanguagesPromise = undefined;
        void this.refreshTargetDictionaryAvailability(form);
        runCredentialDependentSettingsRefreshes(firefoxAuthenticationInfoRequiresExtensionPage(), [() => void this.refreshDeckControls(form)]);
        if (panel === 'help') void this.refreshYomuUpdateStatus(form);
        this.refreshSettingsJapaneseParse(form);
    }

    private onCatalogBrowseRendered(form: HTMLFormElement): void {
        this.syncRecommendedDictionaryInstallControls(form);
        if (this.dictionarySiteStorageClearPending) this.setDictionaryImportsDisabledForSiteClear(form, true);
    }
    refreshLanguage(language = this.settings.interfaceLanguage): void {
        const form = this.currentForm;
        if (!form?.isConnected) return;
        localizeSettingsForm(form, language);
        this.syncRecommendedDictionaryInstallControls(form);
        this.syncDictionaryOperationState(form);
        this.syncJpdbStatus(form);
        void this.academyAccountSync.refresh(form, language);
        void this.refreshAnkiConnectionStatus(form);
        syncSubtitlePreview(form);
        this.refreshSettingsJapaneseParse(form);
        void this.refreshTargetDictionaryAvailability(form);
    }

    async resumePendingCloudSettingsSync(): Promise<boolean> {
        return resumePendingCloudSettingsAction({
            trustedSurface: currentSensitiveSettingsSurfaceIsTrusted(this.dependencies),
            available: CLOUD_SETTINGS_SYNC_ENABLED && cloudSettingsSyncAvailable(),
            language: this.settings.interfaceLanguage,
            readPending: readPendingCloudSettingsAction,
            clearPending: clearPendingCloudSettingsAction,
            consumeAuthorization: expectedState => cloudSettingsAuthRedirectResult(expectedState),
            perform: (action, language) => this.performCloudSettingsAction(action, language, undefined),
            authorizationFailed: (error, language) => {
                log.warn('Cloud settings authorization failed', { message: error });
                this.dependencies.toast(uiText(language, 'actionFailed'));
            },
            actionFailed: (error, language) => this.dependencies.toast(userFacingErrorText(language, 'actionFailed', error)),
            openBackup: () => this.open('backup'),
        });
    }

    private get settings(): ReaderSettings {
        return this.dependencies.getSettings();
    }

    private set settings(settings: ReaderSettings) {
        this.dependencies.setSettings(settings);
    }

    // Temporary form-derived swaps must not fire host-side transitions (the
    // dialog's annotations-off instant clear would otherwise trigger from a
    // mere Anki probe while OFF is selected but unsaved — sol review P1).
    private swapSettingsTransiently(settings: ReaderSettings): ReaderSettings {
        const previous = this.dependencies.getSettings();
        this.dependencies.setSettings(settings, { transient: true });
        return previous;
    }

    private restoreTransientSettings(previous: ReaderSettings): void {
        this.dependencies.setSettings(previous, { transient: true });
    }

    private async saveCurrentSettings(previousSettings: ReaderSettings): Promise<void> {
        const settings = this.settings;
        try {
            await this.dependencies.saveSettings(settings, {
                persistPreferredJapaneseSiteLanguage:
                    previousSettings.preferJapaneseSiteLanguage !== settings.preferJapaneseSiteLanguage,
                explicitUserChoiceKeys: changedSettingsKeys(previousSettings, settings),
            });
            this.dependencies.onSettingsPersisted?.(settings);
        } catch (error) {
            this.dependencies.onSettingsPersistenceFailed?.(previousSettings);
            throw error;
        }
    }

    private createSettingsForm(panel?: string): HTMLFormElement {
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.dataset.language = activeTargetLanguageId(this.settings);
        form.setAttribute('role', 'dialog');
        form.setAttribute('aria-modal', 'true');
        form.setAttribute('aria-label', SETTINGS_TITLE);
        form.tabIndex = -1;
        setInnerHtml(form, renderSettingsForm(this.settings, JPDB_SETTINGS_URL, JITEN_SETTINGS_URL, COLLAPSED_CATALOG_BROWSE_RENDER));
        localizeSettingsForm(form, this.settings.interfaceLanguage);
        if (panel) activateSettingsPanel(form, panel);
        return form;
    }

    private bindFormSubmit(form: HTMLFormElement): void {
        bindAuthorizedReaderFormSubmit(form, () => {
            if (this.pendingDictionaryOperations > 0) {
                this.showDictionarySaveBlocked(form);
                return;
            }
            const previousSettings = this.settings;
            const previousInitialOpen = previousSettings.dictionarySourcesInitiallyExpanded;
            const nextSettings = readFormSettings(new FormData(form), previousSettings);
            const saveRequestId = ++this.saveRequestId;
            // Invoke the native Firefox request synchronously from Submit. The
            // returned promise may settle later, but the user gesture must not
            // be separated from permissions.request() by an earlier await.
            const credentialPermission = requestFirefoxAuthenticationInfoForChangedSettings(previousSettings, nextSettings);
            void credentialPermission.then(consent => {
                if (!this.acceptFirefoxAuthenticationInfoConsent(consent, this.settings.interfaceLanguage)) return;
                this.settings = nextSettings;
                configureLogger({ forceEnabled: this.settings.enableLogging });
                if (this.settings.dictionarySourcesInitiallyExpanded !== previousInitialOpen) {
                    this.dependencies.clearDictionarySourceOpenOverrides();
                }
                return this.saveCurrentSettings(previousSettings).then(() => {
                    this.afterSettingsSaved(form, saveRequestId);
                });
            })
                .catch(error => {
                    log.error('Settings save failed', error);
                    this.dependencies.toast(userFacingErrorText(this.settings.interfaceLanguage, 'settingsSaveFailed', error));
                });
        });
        form.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dismissSettings());
        form.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            this.dismissSettings();
        });
    }

    private dismissSettings(): void {
        if (this.settingsJapaneseParseRefreshFrame !== undefined) {
            cancelCancelableFrame(this.settingsJapaneseParseRefreshFrame);
            this.settingsJapaneseParseRefreshFrame = undefined;
        }
        if (this.settingsJapaneseParseRefreshTimer !== undefined) {
            window.clearTimeout(this.settingsJapaneseParseRefreshTimer);
            this.settingsJapaneseParseRefreshTimer = undefined;
        }
        this.modal.release();
        this.currentForm = undefined;
        this.dependencies.dismiss();
    }

    /**
     * Clear the `aria-hidden` the modal placed on background siblings.
     * The controller's own close paths (Escape, Cancel, Save) already restore,
     * but the dialog can also be torn down from outside the controller — a
     * backdrop click, factory reset, or the close-popup shortcut all route
     * through ReaderApp.dismiss(). Those paths call this so the page is never
     * stranded hidden from assistive technology.
     * Idempotent: a no-op once the background has been released.
     */
    releaseModalBackground(): void {
        if (!this.currentForm?.isConnected) this.currentForm = undefined;
        this.modal.release();
    }

    private bindSettingsSearch(form: HTMLFormElement): void {
        const input = form.querySelector<HTMLInputElement>('[data-settings-search]');
        input?.addEventListener('input', () => {
            applySettingsSearch(form, input.value);
            syncExpandedCatalogBrowseSearch(form, input.value);
        });
    }

    private bindSettingsTabs(form: HTMLFormElement): void {
        form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')?.addEventListener('keydown', event => {
            if (!(event.target instanceof HTMLButtonElement) || event.target.dataset.action !== 'settings-panel') return;
            const tabs = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]'));
            const currentIndex = tabs.indexOf(event.target);
            const nextIndex = nextSettingsTabIndex(event.key, currentIndex, tabs.length);
            if (nextIndex < 0) return;
            event.preventDefault();
            tabs[nextIndex]?.focus();
            const panel = tabs[nextIndex]?.dataset.panel ?? 'api';
            activateSettingsPanel(form, panel);
            this.onSettingsPanelActivated(form, panel);
            this.refreshSettingsJapaneseParse(form);
        });
    }

    private afterSettingsSaved(form: HTMLFormElement, saveRequestId: number): void {
        if (this.currentForm !== form || !form.isConnected || this.saveRequestId !== saveRequestId) return;
        this.dependencies.jpdb.clear();
        this.dependencies.applyTheme();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.ocr.refresh();
        this.dependencies.youtube.refresh();
        this.dependencies.clearSettingsPreview();
        this.dismissSettings();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.refreshNewTabIfCurrent();
        this.dependencies.toast(uiText(this.settings.interfaceLanguage, 'settingsSaved'));
        void this.refreshDictionaryStylesAfterSave();
    }

    private async refreshDictionaryStylesAfterSave(): Promise<void> {
        try {
            await this.dependencies.refreshDictionaryStyles();
        } catch (error) {
            log.warn('Dictionary style refresh failed', error);
            this.dependencies.toast(userFacingErrorText(this.settings.interfaceLanguage, 'actionFailed', error));
        }
    }

    private bindLivePreview(form: HTMLFormElement): void {
        const applyThemePreview = () => this.dependencies.applyTheme(readFormSettings(new FormData(form), this.settings));
        let pendingAccentColor: string | undefined;
        let accentPreviewFrame: number | undefined;
        const flushAccentPreview = () => {
            accentPreviewFrame = undefined;
            const accentColor = pendingAccentColor;
            pendingAccentColor = undefined;
            if (!accentColor || !form.isConnected) return;
            this.dependencies.applyAccentColor(accentColor);
        };
        const scheduleAccentPreview = (accentColor: string) => {
            pendingAccentColor = accentColor;
            if (accentPreviewFrame !== undefined) return;
            accentPreviewFrame = requestCancelableFrame(flushAccentPreview);
        };
        const commitAccentPreview = (accentColor: string) => {
            if (accentPreviewFrame !== undefined) {
                cancelCancelableFrame(accentPreviewFrame);
                accentPreviewFrame = undefined;
            }
            pendingAccentColor = undefined;
            this.dependencies.applyAccentColor(accentColor);
            publishSettingsChange({ accentColor }, { preview: true });
        };
        form.querySelector<HTMLInputElement>('input[name="accentColor"]')?.addEventListener('input', event => {
            const accentColor = (event.currentTarget as HTMLInputElement).value;
            scheduleAccentPreview(accentColor);
        });
        form.querySelector<HTMLInputElement>('input[name="accentColor"]')?.addEventListener('change', event => {
            const accentColor = (event.currentTarget as HTMLInputElement).value;
            commitAccentPreview(accentColor);
        });
        let wordColorPreviewFrame: number | undefined;
        const scheduleWordColorPreview = () => {
            if (wordColorPreviewFrame !== undefined) return;
            wordColorPreviewFrame = requestCancelableFrame(() => {
                wordColorPreviewFrame = undefined;
                if (form.isConnected) this.dependencies.applyWordColors(readFormSettings(new FormData(form), this.settings));
            });
        };
        form.querySelectorAll<HTMLInputElement>('input[name^="wordColor"], input[name^="pitchColor"]').forEach(input => {
            input.addEventListener('input', scheduleWordColorPreview);
        });
        const autoPlayAudio = form.querySelector<HTMLInputElement>('input[name="autoPlayAudio"]');
        const audioAutoPlayMode = form.querySelector<HTMLSelectElement>('select[name="audioAutoPlayMode"]');
        autoPlayAudio?.addEventListener('change', () => {
            if (audioAutoPlayMode) audioAutoPlayMode.disabled = !autoPlayAudio.checked;
        });
        this.syncThemeSwitch(form);
        form.querySelector<HTMLButtonElement>('[data-theme-switch]')?.addEventListener('click', event => {
            event.preventDefault();
            const input = form.querySelector<HTMLInputElement>('[data-theme-value]');
            const current = this.effectiveTheme(input?.value as ReaderSettings['theme'] | undefined);
            const next = current === 'dark' ? 'light' : 'dark';
            if (input) input.value = next;
            this.settings.theme = next;
            applyThemePreview();
            this.syncThemeSwitch(form);
            publishSettingsChange({ theme: next }, { preview: true });
        });
        bindLiveSettingsSync(form, {
            isActive: () => this.currentForm === form && form.isConnected,
            getSettings: () => this.settings,
            adoptSettings: settings => { this.settings = settings; },
            syncAdoptedLanguageProfile: (previousSettings, settings) => this.syncLanguageProfileForm(
                form,
                settings,
                { source: 'durable-settings', previousSettings },
            ),
            applyTheme: theme => {
                const input = form.querySelector<HTMLInputElement>('[data-theme-value]');
                if (input && input.value !== theme) {
                    input.value = theme;
                    this.settings.theme = theme;
                    applyThemePreview();
                    this.syncThemeSwitch(form);
                }
            },
        });
        syncSubtitlePreview(form);
        syncFontFamilyControls(form);
        form.addEventListener('input', event => {
            if (this.isSubtitleControl(event.target)) syncSubtitlePreview(form);
        });
        form.addEventListener('change', event => {
            if (this.isFontFamilyControl(event.target)) syncFontFamilyControls(form);
            if (this.isAnkiFieldMappingControl(event.target)) this.syncAnkiFieldMappingsFromEditor(form);
            if (this.isAnkiModelControl(event.target)) this.renderAnkiFieldMappingEditor(form);
            if (this.isSubtitleControl(event.target)) syncSubtitlePreview(form);
            if (this.isColorSourceControl(event.target) || this.isReaderDisplayControl(event.target)) applyThemePreview();
        });
        form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')?.addEventListener('change', () => {
            void this.refreshDictionaryStatus(form);
        });
        form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (!isLearningTargetRosterId(value)) return;
            this.syncLanguageProfileForm(form, this.settings, {
                source: 'target-picker',
                targetLanguage: value,
            });
        });
        this.bindAppearancePresets(form, applyThemePreview);
        form.querySelector<HTMLSelectElement>('select[name="popupMode"]')?.addEventListener('change', () => syncStickyBottomSheetAvailability(form));
        syncStickyBottomSheetAvailability(form);
        const syncImmersionTranslationReveal = () => {
            const translations = form.querySelector<HTMLInputElement>('input[name="immersionKitShowTranslation"]');
            const reveal = form.querySelector<HTMLInputElement>('input[name="immersionKitRevealTranslationOnClick"]');
            if (!translations || !reveal) return;
            reveal.disabled = !translations.checked;
            if (!translations.checked) reveal.checked = false;
            syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        };
        form.querySelector<HTMLInputElement>('input[name="immersionKitShowTranslation"]')?.addEventListener('change', syncImmersionTranslationReveal);
        syncImmersionTranslationReveal();
        const syncImmersionEnabled = (source: HTMLInputElement) => {
            form.querySelectorAll<HTMLInputElement>('input[name="immersionKitEnabled"], input[name="immersionKit.enabled"]').forEach(input => {
                if (input !== source) input.checked = source.checked;
            });
        };
        form.querySelectorAll<HTMLInputElement>('input[name="immersionKitEnabled"], input[name="immersionKit.enabled"]').forEach(input => {
            input.addEventListener('change', () => syncImmersionEnabled(input));
        });
        const syncNadeshikoKeyField = () => {
            const source = form.querySelector<HTMLSelectElement>('select[name="immersionKitExampleSource"]')?.value;
            const usesNadeshiko = source === 'nadeshiko' || source === 'combined';
            form.querySelectorAll<HTMLElement>('[data-nadeshiko-api-key-field]').forEach(field => {
                field.hidden = !usesNadeshiko;
            });
        };
        form.querySelector<HTMLSelectElement>('select[name="immersionKitExampleSource"]')?.addEventListener('change', syncNadeshikoKeyField);
        syncNadeshikoKeyField();
        const syncImmersionLimit = () => {
            const enabled = form.querySelector<HTMLInputElement>('input[name="immersionKitLimitEnabled"][value="on"]')?.checked ?? false;
            const limit = form.querySelector<HTMLInputElement>('input[name="immersionKitLimit"]');
            if (limit) limit.disabled = !enabled;
            syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        };
        form.querySelectorAll<HTMLInputElement>('input[name="immersionKitLimitEnabled"]').forEach(input => {
            input.addEventListener('change', syncImmersionLimit);
        });
        syncImmersionLimit();
        form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (value !== 'auto' && value !== 'en' && value !== 'ja') return;
            this.settings.interfaceLanguage = value;
            this.refreshLanguage(value);
            this.dependencies.installFab();
        });
        form.querySelector<HTMLSelectElement>('select[name="ocrProvider"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            form.querySelectorAll<HTMLElement>('[data-local-ocr]').forEach(node => { node.hidden = value !== 'local-service'; });
            form.querySelectorAll<HTMLElement>('[data-cloud-ocr]').forEach(node => { node.hidden = value !== 'cloud-vision'; });
        });
        form.querySelectorAll<HTMLInputElement>('input[name="pageScanMode"]').forEach(input => {
            input.addEventListener('change', () => syncPageScanModeControls(form));
        });
        syncPageScanModeControls(form);
    }

    private syncLanguageProfileForm(
        form: HTMLFormElement,
        settings: ReaderSettings,
        request: LanguageProfileFormSyncRequest,
    ): void {
        syncLiveLanguageProfileForm(form, settings, request, {
            refreshTargetControls: targetLanguage => {
                void this.refreshTargetDictionaryAvailability(form, targetLanguage);
                void this.refreshDictionaryStatus(form);
            },
        });
    }

    private async refreshTargetDictionaryAvailability(
        form: HTMLFormElement,
        selected = selectedTargetLanguage(form, this.settings),
    ): Promise<void> {
        const requestId = ++this.targetDictionaryAvailabilityRequestId;
        const status = form.querySelector<HTMLElement>('[data-target-dictionary-state]');
        const content = form.querySelector<HTMLElement>('[data-target-dictionary-content]');
        const showAvailability = (message?: string): void => {
            if (status) {
                status.hidden = !message;
                status.textContent = message ?? '';
            }
            if (content) content.hidden = Boolean(message);
        };
        showAvailability(uiText(this.settings.interfaceLanguage, 'checkingDictionaries'));

        try {
            this.publishedDictionaryLanguagesPromise ??= (
                this.dependencies.publishedDictionaryLanguages?.()
                ?? publishedDictionaryHeadwordLanguages()
            );
            const languages = await this.publishedDictionaryLanguagesPromise;
            if (requestId !== this.targetDictionaryAvailabilityRequestId || !form.isConnected) return;
            if (selectedTargetLanguage(form, this.settings) !== selected) return;
            if (languages.has(selected)) {
                showAvailability();
                return;
            }
            const target = learningTargetRosterEntry(selected);
            showAvailability(formatUiTemplate(
                uiText(this.settings.interfaceLanguage, 'targetDictionaryUnavailable'),
                { language: this.settings.interfaceLanguage === 'ja' ? target.nativeName : target.englishName },
            ));
        } catch (error) {
            log.warn('Published dictionary coverage check failed', error);
            if (requestId !== this.targetDictionaryAvailabilityRequestId || !form.isConnected) return;
            showAvailability(uiText(this.settings.interfaceLanguage, 'targetDictionaryAvailabilityUnavailable'));
        }
    }

    private bindEditorControls(form: HTMLFormElement): void {
        suppressCredentialAutofill(form);
        syncBrowserTtsVoiceOptions(form);
        this.bindAudioSubSourceDetection(form);
        // Settings can be opened straight onto a panel, so media being the
        // panel already on screen counts as opening it.
        const mediaPanel = form.querySelector<HTMLElement>('[data-settings-panel="media"]');
        if (mediaPanel && !mediaPanel.hidden) this.refreshAudioSubSources(form);
        if ('speechSynthesis' in window) {
            window.speechSynthesis.addEventListener('voiceschanged', () => syncBrowserTtsVoiceOptions(form), { once: true });
        }
        form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.addEventListener('change', () => {
            syncReviewSettingsVisibility(form);
            syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            this.syncJpdbStatus(form);
        });
        form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')?.addEventListener('change', () => {
            syncJpdbMiningDependentSettings(form);
            syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            this.syncJpdbStatus(form);
        });
        syncJpdbMiningDependentSettings(form);
        syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        for (const apiKeyInput of form.querySelectorAll<HTMLInputElement>('input[name="apiCredential"], input[name="apiCredentialJpdb"], input[name="apiCredentialJiten"], input[name="apiCredentialBunproLegacy"], input[name="apiCredentialBunpro"], input[name="apiCredentialWanikani"], input[name="bunproFrontendApiTokenExpiresAt"]')) {
            apiKeyInput.addEventListener('input', () => this.syncJpdbStatus(form));
            apiKeyInput.addEventListener('change', () => {
                reconcileApiCredentialInputs(form);
                const nextSettings = readFormSettings(new FormData(form), this.settings);
                // change is a direct user gesture, so Firefox can show its
                // native data-consent prompt before either live key probe.
                const permission = requestFirefoxAuthenticationInfoForChangedSettings(this.settings, nextSettings);
                void permission.then(consent => {
                    if (!this.acceptFirefoxAuthenticationInfoConsent(consent, nextSettings.interfaceLanguage)) return;
                    void this.refreshDeckControls(form);
                    void this.refreshJpdbConnectionStatus(form);
                    void this.refreshWanikaniConnectionStatus(form);
                });
            });
        }
        form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')?.addEventListener('change', () => void this.refreshAnkiConnectionStatus(form));
        form.querySelector<HTMLInputElement>('input[name="ankiMobileHandoff"]')?.addEventListener('change', () => void this.refreshAnkiConnectionStatus(form));
        form.querySelector<HTMLInputElement>('input[name="ankiConnectUrl"]')?.addEventListener('change', () => void this.refreshAnkiConnectionStatus(form));
        form.querySelector<HTMLSelectElement>('select[name="ankiModel"]')?.addEventListener('change', () => {
            this.retireAnkiModelUpdatePrompt(form);
            void this.refreshAnkiModelUpdatePrompt(form);
        });
        form.addEventListener('change', event => this.handleSettingsFormChange(form, event));
        installShortcutCapture(form);
        installSourceRowDrag(form);
        form.addEventListener('click', event => {
            if (this.handleSettingsPreviewLookup(event)) return;
            const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = control?.dataset.action;
            if (!action || action === 'cancel') return;
            event.preventDefault();
            event.stopPropagation();
            // Start any Firefox permission request directly in this click
            // handler; the later async action router cannot preserve activation.
            const credentialPermission = this.authenticationInfoPermissionForAction(form, action);
            void this.handleSettingsAction(form, action, control, credentialPermission);
        });
        form.addEventListener('keydown', event => {
            if (this.handleAnkiTagInputKeydown(form, event)) {
                event.preventDefault();
                return;
            }
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (this.handleSettingsPreviewLookup(event)) event.preventDefault();
        });
    }

    private handleSettingsPreviewLookup(event: Event): boolean {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const word = target?.closest<HTMLElement>('[data-settings-preview-lookup], .jpdb-reader-settings .jpdb-reader-word');
        if (!word || !this.dependencies.lookupText) return false;
        if (!word.dataset.settingsPreviewLookup && isSettingsCommandWord(word)) return false;
        const expression = word.dataset.settingsPreviewLookup?.trim()
            || word.dataset.expression?.trim()
            || readerWordSurfaceText(word).trim()
            || word.textContent?.trim()
            || '';
        if (!expression) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.dependencies.lookupText(expression, word.dataset.sentence || expression, word);
        return true;
    }

    // A pasted or corrected URL should fill its provider list without waiting
    // for a blur, but not probe a prefix of what is still being typed.
    private bindAudioSubSourceDetection(form: HTMLFormElement): void {
        let pending: ReturnType<typeof setTimeout> | undefined;
        form.addEventListener('input', event => {
            const field = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-audio-url-field]');
            const row = field?.closest<HTMLElement>('[data-audio-source-row]');
            if (!row) return;
            clearTimeout(pending);
            pending = setTimeout(() => this.refreshAudioSubSources(form, row), AUDIO_SUB_SOURCE_TYPING_DELAY_MS);
        });
    }

    private handleSettingsFormChange(form: HTMLFormElement, event: Event): void {
        const sourceSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
        if (sourceSelect) {
            syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
            syncBrowserTtsVoiceOptions(form);
        }
        const audioSourceControl = (event.target as HTMLElement).closest<HTMLElement>(
            'select[name^="audioSources."][name$=".type"], [data-audio-url-field], input[name^="audioSources."][name$=".enabled"]',
        );
        const audioRow = audioSourceControl?.closest<HTMLElement>('[data-audio-source-row]');
        if (audioRow) this.refreshAudioSubSources(form, audioRow);
        const templateControl = (event.target as HTMLElement).closest<HTMLElement>('select[name="ankiTemplateMode"], input[name="ankiFrontReading"], input[name="ankiFrontSentence"], input[name="ankiFrontImage"]');
        if (templateControl) {
            const preview = form.querySelector<HTMLElement>('[data-anki-template-preview]');
            if (preview) setInnerHtml(preview, renderAnkiTemplatePreview(readFormSettings(new FormData(form), this.settings)));
        }
        const newTabAnkiDeckToggle = (event.target as HTMLElement).closest<HTMLInputElement>('[data-newtab-anki-deck-toggle]');
        if (newTabAnkiDeckToggle) this.syncNewTabAnkiDeckToggles(form);
    }

    private syncThemeSwitch(form: HTMLFormElement): void {
        const input = form.querySelector<HTMLInputElement>('[data-theme-value]');
        const button = form.querySelector<HTMLButtonElement>('[data-theme-switch]');
        if (!button) return;
        const theme = this.effectiveTheme(input?.value as ReaderSettings['theme'] | undefined);
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const label = uiText(language, theme === 'dark' ? 'switchToLightTheme' : 'switchToDarkTheme');
        button.setAttribute('aria-checked', String(theme === 'dark'));
        button.setAttribute('aria-label', label);
        button.title = label;
    }

    private effectiveTheme(value: ReaderSettings['theme'] | undefined): 'dark' | 'light' {
        if (value === 'dark' || value === 'light') return value;
        return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    private isSubtitleControl(target: EventTarget | null): boolean {
        const name = (target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
        return name.startsWith('subtitle');
    }

    private isFontFamilyControl(target: EventTarget | null): boolean {
        const name = (target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
        return name === 'readerFontFamily' || name === 'popupFontFamily' || name === 'subtitleFontFamily';
    }

    private isColorSourceControl(target: EventTarget | null): boolean {
        const name = (target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
        return [
            'wordHighlightColorSource',
            'wordUnderlineColorSource',
            'wordTextColorSource',
            'subtitleHighlightColorSource',
            'subtitleUnderlineColorSource',
            'subtitleTextColorSource',
        ].includes(name);
    }

    // UT-47: one-click appearance presets — each maps onto the underlying
    // controls and replays the live theme preview, so the sample sentence and
    // the page restyle immediately. The hidden-state fieldset only makes
    // sense for the known-status mode.
    private bindAppearancePresets(form: HTMLFormElement, applyThemePreview: () => void): void {
        const preview = form.querySelector<HTMLElement>('[data-yomu-appearance-preview]');
        if (preview) setInnerHtml(preview, appearancePreviewContentHtml());
        const setSelect = (name: string, value: string): void => {
            const control = form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
            if (control) control.value = value;
        };
        const setGroups = (groups: string[]): void => {
            for (const group of FURIGANA_HIDE_STATE_GROUPS) {
                const box = form.querySelector<HTMLInputElement>(`input[name="furiganaHide-${group}"]`);
                if (box) box.checked = groups.includes(group);
            }
        };
        const setColorSources = (highlight: string, underline: string, text: string): void => {
            setSelect('wordHighlightColorSource', highlight);
            setSelect('wordUnderlineColorSource', underline);
            setSelect('wordTextColorSource', text);
            setSelect('subtitleHighlightColorSource', highlight);
            setSelect('subtitleUnderlineColorSource', underline);
            setSelect('subtitleTextColorSource', text);
        };
        const syncGroupVisibility = (): void => {
            const fieldset = form.querySelector<HTMLElement>('[data-furigana-hide-groups]');
            const mode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')?.value;
            if (fieldset) fieldset.hidden = mode !== 'known-status';
            // A11: difficulty hiding explains itself the moment it is chosen.
            const difficultyNote = form.querySelector<HTMLElement>('[data-furigana-difficulty-note]');
            if (difficultyNote) difficultyNote.hidden = mode !== 'difficult-kanji';
        };
        // A11: quick setup always starts with every parsed reading visible.
        // Difficulty- and status-based hiding remain explicit choices.
        form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')?.addEventListener('change', syncGroupVisibility);
        const preset = form.querySelector<HTMLSelectElement>('select[name="appearancePreset"]');
        preset?.addEventListener('change', () => {
            const value = preset.value;
            if (!value) return;
            if (value === 'balanced' || value === 'default') {
                setSelect('wordColorStates', 'all');
                setSelect('furiganaMode', 'all');
                setGroups(['known', 'due', 'failed']);
                setColorSources('jpdb', 'pitch', 'anki');
            } else if (value === 'no-colors') {
                setSelect('wordColorStates', 'all');
                setSelect('furiganaMode', 'off');
                setColorSources('off', 'off', 'off');
            } else if (value === 'new-only') {
                setSelect('wordColorStates', 'new-only');
                setSelect('furiganaMode', 'all');
                setGroups(['known', 'due', 'failed']);
                setColorSources('jpdb', 'pitch', 'anki');
            } else if (value === 'underline-new') {
                setSelect('wordColorStates', 'new-only');
                setSelect('furiganaMode', 'hover');
                setColorSources('off', 'jpdb', 'off');
            } else if (value === 'furi-all') {
                setSelect('furiganaMode', 'all');
            } else if (value === 'furi-known-hidden') {
                setSelect('furiganaMode', 'known-status');
                setGroups(['known', 'due', 'failed']);
            } else if (value === 'furi-hover') {
                setSelect('furiganaMode', 'hover');
            } else if (value === 'furi-off') {
                setSelect('furiganaMode', 'off');
            }
            syncGroupVisibility();
            applyThemePreview();
        });
    }

    private isReaderDisplayControl(target: EventTarget | null): boolean {
        const name = (target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
        return ['furiganaMode', 'wordColorStates', 'theme', 'readerFontFamily', 'readerFontFamilyCustom', 'popupFontFamily', 'popupFontFamilyCustom', 'popupFontWeight'].includes(name) || name.startsWith('furiganaHide-');
    }

    private isAnkiFieldMappingControl(target: EventTarget | null): boolean {
        return Boolean((target as HTMLElement | null)?.closest?.('[data-anki-field-role]'));
    }

    private isAnkiModelControl(target: EventTarget | null): boolean {
        return Boolean((target as HTMLElement | null)?.closest?.('[name="ankiModel"]'));
    }

    private async refreshDeckControls(form: HTMLFormElement): Promise<void> {
        const container = form.querySelector<HTMLElement>('[data-jpdb-decks]');
        if (!container) return;
        this.syncJpdbStatus(form);
        const formSettings = readFormSettings(new FormData(form), this.settings);
        const apiKey = effectiveJpdbApiKey(formSettings);
        if (!apiKey) {
            setInnerHtml(container, renderDeckControls(formSettings, [], false, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            this.refreshSettingsJapaneseParse(form);
            return;
        }

        const originalKey = this.settings.apiKey;
        this.settings.apiKey = apiKey;
        try {
            const decks = await this.dependencies.jpdb.listDecks();
            setInnerHtml(container, renderDeckControls(formSettings, decks, true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
        } catch (error) {
            log.warn('Deck controls failed to load', error);
            setInnerHtml(container, renderDeckControls(formSettings, [], true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
        } finally {
            this.settings.apiKey = originalKey;
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            this.refreshSettingsJapaneseParse(form);
        }
    }

    private syncJpdbStatus(form: HTMLFormElement): void {
        const formSettings = readFormSettings(new FormData(form), this.settings);
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]');
        if (status) {
            const line = jpdbStatusLineForSettings(formSettings, language);
            status.dataset.statusTone = line.tone;
            status.textContent = formatSettingsStatusLine(line, language);
        }
        const bunproStatus = form.querySelector<HTMLElement>('[data-bunpro-status]');
        if (bunproStatus) {
            const line = bunproStatusLineForSettings(formSettings, language);
            bunproStatus.dataset.statusTone = line.tone;
            bunproStatus.textContent = formatSettingsStatusLine(line, language);
        }
        const wanikaniStatus = form.querySelector<HTMLElement>('[data-wanikani-status]');
        if (wanikaniStatus) {
            const line = wanikaniStatusLineForSettings(formSettings, language);
            wanikaniStatus.dataset.statusTone = line.tone;
            wanikaniStatus.textContent = formatSettingsStatusLine(line, language);
        }
        this.refreshSettingsJapaneseParse(form);
    }

    // fallow-ignore-next-line complexity
    private async refreshWanikaniConnectionStatus(form: HTMLFormElement): Promise<void> {
        this.syncJpdbStatus(form);
        const status = form.querySelector<HTMLElement>('[data-wanikani-status]');
        if (!status) return;
        // Invalidate any earlier probe even when the newly-read form has no
        // token. Otherwise an old request can resolve after the field is
        // cleared and repaint the blank-token state as connected.
        const requestId = ++this.wanikaniConnectionProbeId;
        const formSettings = readFormSettings(new FormData(form), this.settings);
        const token = effectiveWanikaniApiToken(formSettings);
        if (!token) return;
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        try {
            const client = new WanikaniClient({ getToken: () => token });
            const user = await client.getUser(true);
            const maxLevel = await client.effectiveMaxLevel();
            if (this.currentForm !== form || !form.isConnected || requestId !== this.wanikaniConnectionProbeId) return;
            const line: SettingsStatusLine = {
                message: language === 'ja'
                    ? `WaniKani接続済み。現在レベル${user.level}、アクセス可能レベル${maxLevel}。`
                    : `WaniKani connected. Current level ${user.level}; access through level ${maxLevel}.`,
                tone: 'success',
            };
            status.dataset.statusTone = line.tone;
            status.textContent = formatSettingsStatusLine(line, language);
        } catch (error) {
            if (this.currentForm !== form || !form.isConnected || requestId !== this.wanikaniConnectionProbeId) return;
            const message = error instanceof Error ? error.message : 'WaniKani connection failed.';
            const line: SettingsStatusLine = { message, tone: 'error' };
            status.dataset.statusTone = line.tone;
            status.textContent = formatSettingsStatusLine(line, language);
        }
        this.refreshSettingsJapaneseParse(form);
    }

    // Live probe via jpdb /ping: upgrades the static "key set" line to a real
    // connected/rejected answer (Anki and Jiten already have live probes).
    private async refreshJpdbConnectionStatus(form: HTMLFormElement): Promise<void> {
        this.syncJpdbStatus(form);
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]');
        if (!status) return;
        const formSettings = readFormSettings(new FormData(form), this.settings);
        const apiKey = effectiveJpdbApiKey(formSettings);
        if (!apiKey) return;
        if (typeof this.dependencies.jpdb.ping !== 'function') return;
        const requestId = ++this.jpdbConnectionProbeId;
        const originalKey = this.settings.apiKey;
        this.settings.apiKey = apiKey;
        let connected = false;
        try {
            connected = await this.dependencies.jpdb.ping();
        } finally {
            this.settings.apiKey = originalKey;
        }
        if (this.currentForm !== form || !form.isConnected || requestId !== this.jpdbConnectionProbeId) return;
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const successKey = hasJitenApiCredential(formSettings) ? 'jpdbAndJitenConnected' : 'jpdbConnected';
        const line: SettingsStatusLine = connected
            ? { message: uiText(language, successKey), tone: 'success' }
            : { message: uiText(language, 'jpdbConnectionFailed'), tone: 'error' };
        status.dataset.statusTone = line.tone;
        status.textContent = formatSettingsStatusLine(line, language);
        this.refreshSettingsJapaneseParse(form);
    }

    private async refreshAnkiConnectionStatus(form: HTMLFormElement): Promise<void> {
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const formSettings = readFormSettings(new FormData(form), this.settings);
        const initialLine = ankiStatusLineForSettings(formSettings, language);
        const requestId = ++this.ankiConnectionProbeId;
        this.ankiLibraryScanId++;
        this.setAnkiStatus(form, initialLine.message, initialLine.tone, initialLine.action);
        // Re-earned by the probe below. Without this the offer would linger
        // after mining is switched off or Anki goes away.
        this.retireAnkiModelUpdatePrompt(form);
        if (!formSettings.ankiEnabled) return;

        const previous = this.swapSettingsTransiently(formSettings);
        try {
            const connected = await this.dependencies.anki.isConnected();
            if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
            if (connected) {
                this.setAnkiStatus(form, uiText(language, 'ankiConnectionReady'), 'success', undefined, 'connected');
                this.queueAutomaticAnkiLibraryScan(form, language);
            } else {
                this.setAnkiStatusLine(form, this.ankiSetupUnavailableStatus(formSettings, language));
                void this.refineAnkiUnavailableStatus(form, requestId, formSettings, language);
            }
        } catch (error) {
            if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
            log.warn('Anki settings probe failed', error);
            this.setAnkiStatusLine(form, this.ankiSetupUnavailableStatus(formSettings, language));
            void this.refineAnkiUnavailableStatus(form, requestId, formSettings, language);
        } finally {
            this.restoreTransientSettings(previous);
        }
    }

    private shouldApplyAnkiConnectionProbe(form: HTMLFormElement, requestId: number): boolean {
        return this.currentForm === form && form.isConnected && requestId === this.ankiConnectionProbeId;
    }

    private queueAutomaticAnkiLibraryScan(form: HTMLFormElement, language: InterfaceLanguage): void {
        const requestId = ++this.ankiLibraryScanId;
        window.setTimeout(() => {
            void this.refreshAnkiLibraryScan(form, requestId, language)
                .then(() => this.refreshAnkiModelUpdatePrompt(form))
                .finally(() => {
                    void this.warmAnkiStatusIndexForConnection(form, requestId);
                });
        }, 0);
    }

    // Anki is reachable, so ask whether the note type the form now shows still
    // carries every field this release writes. A plan means the panel offers
    // the update; null hides the offer, which is what ends it for good once
    // the user accepts.
    //
    // The offer names one note type, so it gets its own request id: picking a
    // different note type retires the offer on screen and starts this again
    // without disturbing the library scan already running.
    private async refreshAnkiModelUpdatePrompt(form: HTMLFormElement): Promise<void> {
        const requestId = ++this.ankiModelUpdatePromptId;
        const plan = await this.ankiModelUpdatePlan(form, requestId);
        if (!this.shouldApplyAnkiModelUpdatePrompt(form, requestId)) return;
        applyAnkiModelUpdatePrompt(form, plan, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
    }

    // The picker moved, so the offer is about a note type the user has left.
    // It goes at once and re-earns itself against the new selection.
    private retireAnkiModelUpdatePrompt(form: HTMLFormElement): void {
        this.ankiModelUpdatePromptId++;
        applyAnkiModelUpdatePrompt(form, null, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
    }

    private shouldApplyAnkiModelUpdatePrompt(form: HTMLFormElement, requestId: number): boolean {
        return this.currentForm === form && form.isConnected && requestId === this.ankiModelUpdatePromptId;
    }

    private async ankiModelUpdatePlan(form: HTMLFormElement, requestId: number): Promise<AnkiModelUpdatePlan | null> {
        const yomuModelUpdatePlan = this.dependencies.anki.yomuModelUpdatePlan;
        if (typeof yomuModelUpdatePlan !== 'function') return null;
        if (!this.shouldApplyAnkiModelUpdatePrompt(form, requestId)) return null;
        // The plan is read against the note type the form now shows, which the
        // scan may have just picked, not the last saved one.
        const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
        try {
            return await yomuModelUpdatePlan.call(this.dependencies.anki);
        } catch (error) {
            log.warn('Anki note type update check failed', error);
            return null;
        } finally {
            this.restoreTransientSettings(previous);
        }
    }

    private async refreshAnkiLibraryScan(form: HTMLFormElement, requestId: number, language: InterfaceLanguage): Promise<void> {
        if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
        const scanLibrary = this.dependencies.anki.scanLibrary;
        if (typeof scanLibrary !== 'function') return;
        const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
        if (!this.settings.ankiEnabled) {
            this.restoreTransientSettings(previous);
            return;
        }
        this.setAnkiStatus(form, uiText(language, 'ankiScanning'), 'pending', undefined, 'scanning');
        try {
            const scan = await scanLibrary.call(this.dependencies.anki);
            if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
            const staleDetails = this.staleAnkiFieldMappingDetails(form, scan, language);
            this.applyAnkiScanToForm(form, scan);
            const state: AnkiAdapterState = staleDetails.length ? 'stale' : scan.suggestedModel ? 'suggested' : 'ready';
            const tone = staleDetails.length ? 'pending' : 'success';
            this.setAnkiStatus(form, this.ankiScanMessage(scan, language), tone, undefined, state, [
                ...staleDetails,
                ...this.ankiScanDetails(scan, language),
            ]);
        } catch (error) {
            if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
            log.warn('Automatic Anki library scan failed', error);
            this.setAnkiStatus(form, uiText(language, 'ankiConnectionReady'), 'success', undefined, 'connected');
        } finally {
            this.restoreTransientSettings(previous);
        }
    }

    private shouldApplyAnkiLibraryScan(form: HTMLFormElement, requestId: number): boolean {
        return this.currentForm === form && form.isConnected && requestId === this.ankiLibraryScanId;
    }

    private async warmAnkiStatusIndexForConnection(form: HTMLFormElement, requestId: number): Promise<void> {
        if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
        const warmStatusIndex = this.dependencies.anki.warmStatusIndex;
        if (typeof warmStatusIndex !== 'function') return;
        const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
        if (!this.settings.ankiEnabled) {
            this.restoreTransientSettings(previous);
            return;
        }
        try {
            await warmStatusIndex.call(this.dependencies.anki);
        } catch (error) {
            log.warn('Automatic Anki status index warmup failed', error);
        } finally {
            this.restoreTransientSettings(previous);
        }
    }

    private setAnkiStatusLine(form: HTMLFormElement, line: SettingsStatusLine): void {
        const status = form.querySelector<HTMLElement>('[data-anki-status]');
        if (!status) return;
        status.dataset.statusTone = line.tone;
        if (line.action) status.dataset.statusAction = line.action;
        else delete status.dataset.statusAction;
        // Machine-readable adapter lifecycle (P1 adapter state machine).
        if (line.state) status.dataset.ankiAdapterState = line.state;
        else delete status.dataset.ankiAdapterState;
        setInnerHtml(status, renderAnkiStatusHtml(line, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
        this.refreshSettingsJapaneseParse(form);
    }

    private setAnkiStatus(form: HTMLFormElement, message: string, tone: 'pending' | 'success' | 'error', action?: SettingsStatusAction, state?: AnkiAdapterState, details?: SettingsStatusLine['details']): void {
        this.setAnkiStatusLine(form, { message, tone, action, state, details });
    }

    private async refreshDictionaryStatus(form: HTMLFormElement): Promise<boolean> {
        const id = ++this.dictionaryRefreshId;
        return refreshDictionaryPanel({
            form,
            current: () => this.currentForm === form && form.isConnected && id === this.dictionaryRefreshId,
            loadSummary: () => this.dependencies.dictionaries.summary(),
            prepareSummary: summary => this.mergeDictionaryPreferencesFromSummary(summary),
            refreshStyles: () => this.dependencies.refreshDictionaryStyles(),
            renderContext: () => liveDictionaryPanelContext(form, this.settings),
            afterRender: () => this.afterDictionaryPanelRendered(form),
            interfaceLanguage: () => getFormInterfaceLanguage(form, this.settings.interfaceLanguage),
            reportError: error => log.warn('Dictionary status unavailable', error),
        });
    }

    private async refreshYomuUpdateStatus(form: HTMLFormElement): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-yomu-update-status]');
        if (!status) return;
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const requestId = ++this.yomuUpdateCheckId;
        status.dataset.statusTone = 'pending';
        status.dataset.updateChecked = 'true';
        status.textContent = formatUiText(language, 'updateStatusChecking', { current: CURRENT_YOMU_VERSION });
        this.refreshSettingsJapaneseParse(form);
        try {
            const version = await requestJson(`${NEW_TAB_VERSION_URL}?t=${Date.now()}`, {
                allowDirectCrossOrigin: true,
                anonymous: true,
                credentials: 'omit',
                failureLabel: 'Yomu update check',
                preferFetch: true,
                timeoutMs: 6000,
                withCredentials: false,
            });
            if (this.currentForm !== form || !form.isConnected || this.yomuUpdateCheckId !== requestId) return;
            const latest = latestYomuVersionFromVersionJson(version);
            if (!latest) throw new Error('Hosted version response did not include a build id.');
            const comparison = compareYomuVersions(CURRENT_YOMU_VERSION, latest);
            // Incomparable versions (a "dev" build, mangled metadata) must not
            // claim "Up to date" — a real user on a dev-labeled runtime read
            // exactly that while behind the published release.
            if (comparison === null) {
                status.dataset.statusTone = 'pending';
                status.textContent = formatUiText(language, 'updateStatusIncomparable', { current: CURRENT_YOMU_VERSION, latest });
                this.refreshSettingsJapaneseParse(form);
                return;
            }
            const updateAvailable = comparison < 0;
            status.dataset.statusTone = updateAvailable ? 'pending' : 'success';
            status.textContent = formatUiText(language, updateAvailable ? 'updateStatusAvailable' : 'updateStatusCurrent', {
                current: CURRENT_YOMU_VERSION,
                latest,
            });
            this.refreshSettingsJapaneseParse(form);
        } catch (error) {
            log.warn('Yomu update status unavailable', error);
            if (this.currentForm !== form || !form.isConnected || this.yomuUpdateCheckId !== requestId) return;
            status.dataset.statusTone = 'pending';
            status.textContent = formatUiText(language, 'updateStatusUnknown', { current: CURRENT_YOMU_VERSION });
            this.refreshSettingsJapaneseParse(form);
        }
    }

    private afterDictionaryPanelRendered(form: HTMLFormElement): void {
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        installCatalogBrowseFilter(form);
        this.syncRecommendedDictionaryInstallControls(form);
        this.syncDictionaryOperationState(form);
        this.refreshSettingsJapaneseParse(form);
    }

    private refreshSettingsJapaneseParse(form: HTMLFormElement): void {
        if (this.settingsJapaneseParseRefreshFrame !== undefined) cancelCancelableFrame(this.settingsJapaneseParseRefreshFrame);
        if (this.settingsJapaneseParseRefreshTimer !== undefined) window.clearTimeout(this.settingsJapaneseParseRefreshTimer);
        this.settingsJapaneseParseRefreshFrame = requestCancelableFrame(() => {
            this.settingsJapaneseParseRefreshFrame = undefined;
            this.settingsJapaneseParseRefreshTimer = window.setTimeout(() => {
                this.settingsJapaneseParseRefreshTimer = undefined;
                if (this.currentForm === form && form.isConnected) void this.dependencies.parseSettingsJapanese?.(form);
            }, 0);
        });
    }

    private async mergeDictionaryPreferencesFromSummary(summary: DictionaryStatusSummary): Promise<void> {
        const names = summary.dictionaries.map(item => item.title);
        const types = Object.fromEntries(summary.dictionaries.map(item => [item.title, item.type]));
        const merged = mergeDictionaryPreferences(retireStaleDictionaryPreferences(this.settings.dictionaryPreferences, names), names, types);
        if (JSON.stringify(merged) === JSON.stringify(this.settings.dictionaryPreferences)) return;
        // The active profile owns the authoritative enabled/order snapshot, so
        // saving only the root rows lets profile normalization disable the rows
        // discovered here and push them behind every profile-known dictionary.
        this.settings = captureActiveLanguageProfileDictionaries(this.settings, merged);
        await this.dependencies.saveSettings(this.settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
    }

    private async enqueueDictionaryOperation<T>(form: HTMLFormElement, task: () => Promise<T>): Promise<T> {
        this.pendingDictionaryOperations++;
        this.syncDictionaryOperationState(form);
        const operation = this.dictionaryOperationQueue.then(task);
        this.dictionaryOperationQueue = operation.then(() => undefined, () => undefined);
        try {
            return await operation;
        } finally {
            this.pendingDictionaryOperations = Math.max(0, this.pendingDictionaryOperations - 1);
            this.syncDictionaryOperationState(form);
        }
    }

    private syncDictionaryOperationState(form: HTMLFormElement): void {
        const save = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
        const busy = this.pendingDictionaryOperations > 0;
        const message = busy
            ? formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryImportQueueStatus'), {
                count: this.pendingDictionaryOperations.toLocaleString(),
                plural: this.pendingDictionaryOperations === 1 ? '' : 's',
            })
            : '';
        if (save) {
            save.setAttribute('aria-disabled', String(busy));
            save.disabled = busy;
            if (busy) {
                save.dataset.saveBlocked = 'dictionary-import';
                save.replaceChildren(uiText(this.settings.interfaceLanguage, 'saveAfterInstall'));
                save.title = message;
                save.setAttribute('aria-label', message);
            } else {
                delete save.dataset.saveBlocked;
                save.replaceChildren(uiText(this.settings.interfaceLanguage, 'save'));
                save.title = uiText(this.settings.interfaceLanguage, 'save');
                save.setAttribute('aria-label', uiText(this.settings.interfaceLanguage, 'save'));
            }
        }
        if (!status) return;
        status.hidden = !busy;
        status.textContent = message;
    }

    private showDictionarySaveBlocked(form: HTMLFormElement): void {
        this.syncDictionaryOperationState(form);
        const message = uiText(this.settings.interfaceLanguage, 'dictionaryInstallSaveBlocked');
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]');
        if (status) {
            status.hidden = false;
            status.textContent = message;
        }
        this.dependencies.toast(message);
    }

    private setRecommendedDictionaryInstallState(
        form: HTMLFormElement,
        dictionaryId: string,
        state: RecommendedDictionaryInstallState,
        message: string,
    ): void {
        this.recommendedDictionaryOperations.set(dictionaryId, { state, message });
        this.syncRecommendedDictionaryInstallControls(form);
    }

    private clearRecommendedDictionaryInstallState(form: HTMLFormElement, dictionaryId: string): void {
        this.recommendedDictionaryOperations.delete(dictionaryId);
        this.syncRecommendedDictionaryInstallControls(form);
    }

    private syncRecommendedDictionaryInstallControls(form: HTMLFormElement): void {
        form.querySelectorAll<HTMLButtonElement>('[data-action="download-recommended-dictionary"]').forEach(button => {
            const dictionaryId = button.dataset.dictionaryId ?? '';
            const operation = this.recommendedDictionaryOperations.get(dictionaryId);
            const status = button.closest<HTMLElement>('.jpdb-reader-recommended-item')
                ?.querySelector<HTMLElement>('[data-recommended-dictionary-status]');
            if (!operation) {
                delete button.dataset.importState;
                delete button.dataset.importMessage;
                button.disabled = false;
                button.removeAttribute('disabled');
                if (status) {
                    status.hidden = true;
                    status.textContent = '';
                    delete status.dataset.importState;
                }
                const installed = button.dataset.installed === 'true';
                const label = installed ? uiText(this.settings.interfaceLanguage, 'update') : uiText(this.settings.interfaceLanguage, 'install');
                button.replaceChildren(label);
                button.title = label;
                button.setAttribute('aria-label', label);
                return;
            }
            const label = uiText(this.settings.interfaceLanguage, operation.state === 'installing' ? 'installing' : 'queued');
            button.disabled = true;
            button.dataset.importState = operation.state;
            button.dataset.importMessage = operation.message;
            button.replaceChildren(label);
            button.title = operation.message;
            button.setAttribute('aria-label', operation.message);
            if (status) {
                status.hidden = false;
                status.dataset.importState = operation.state;
                status.textContent = operation.message;
            }
        });
    }

    private async handleSettingsAction(
        form: HTMLFormElement,
        action: string,
        control?: HTMLElement | null,
        credentialPermission?: Promise<FirefoxAuthenticationInfoConsent>,
    ): Promise<void> {
        const setStatus = settingsStatusSetter(form, control);

        try {
            if (credentialPermission) {
                const consent = await credentialPermission;
                const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
                if (!this.acceptFirefoxAuthenticationInfoConsent(consent, language)) return;
            }
            await this.runSettingsAction(form, action, control, setStatus);
        } catch (error) {
            const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
            const message = handleSettingsActionError(action, control, setStatus, error, language);
            this.dependencies.toast(message);
        }
    }

    private authenticationInfoPermissionForAction(
        form: HTMLFormElement,
        action: string,
    ): Promise<FirefoxAuthenticationInfoConsent> | undefined {
        if (action === 'sync-cloud-settings') {
            return requestFirefoxAuthenticationInfoForSettings(readFormSettings(new FormData(form), this.settings));
        }
        if (action === 'restore-cloud-settings' || action === 'import-yomitan-settings'
            || action === 'connect-academy-account') {
            // A cloud snapshot or imported settings file may contain account
            // keys. Academy pairing stores and sends a durable device bearer.
            // Ask before reading/creating any credential while the click is active.
            return requestFirefoxAuthenticationInfoPermission();
        }
        return undefined;
    }

    private acceptFirefoxAuthenticationInfoConsent(
        consent: FirefoxAuthenticationInfoConsent,
        language: InterfaceLanguage,
    ): boolean {
        if (consent === 'granted') return true;
        const key = consent === 'extension-page-required'
            ? 'firefoxAuthenticationInfoExtensionPageRequired'
            : 'firefoxAuthenticationInfoDenied';
        this.dependencies.toast(uiText(language, key));
        return false;
    }

    private async runSettingsAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const handled = this.handleSettingsEditorAction(form, action, control)
            || await this.handleSettingsAudioAction(form, action, control)
            || await this.handleSettingsDictionaryAction(form, action, control, setStatus)
            || await this.academyAccountSync.handle(form, action, this.settings.interfaceLanguage)
            || await this.handleSettingsCloudSyncAction(form, action, control, setStatus)
            || await this.handleSettingsImportExportAction(form, action, setStatus);
        if (!handled) await this.handleSettingsConnectionOrSupportAction(form, action, control, setStatus);
    }

    private async handleSettingsConnectionOrSupportAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (await this.handleSettingsConnectionAction(form, action, control)) return true;
        return await this.handleSettingsSupportAction(action, control, setStatus);
    }

    private handleSettingsEditorAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): boolean {
        if (action === 'settings-panel') {
            const panel = selectedSettingsPanel(control);
            activateSettingsPanel(form, panel);
            this.onSettingsPanelActivated(form, panel);
            this.refreshSettingsJapaneseParse(form);
            return true;
        }
        if (isDictionarySourceOrderAction(action)) {
            updateSourceRowEditor(action, control);
            return true;
        }
        if (isAudioSourceEditorAction(action)) {
            updateAudioSourceEditor(form, action, control);
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            syncBrowserTtsVoiceOptions(form);
            return true;
        }
        if (isLookupLinkEditorAction(action)) {
            updateDictionaryLookupLinkEditor(form, action, control);
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return true;
        }
        if (action === 'anki-tag-add' || action === 'anki-tag-remove') {
            updateAnkiTagsEditor(form, action, control);
            return true;
        }
        return false;
    }

    private handleAnkiTagInputKeydown(form: HTMLFormElement, event: KeyboardEvent): boolean {
        if (event.key !== 'Enter') return false;
        const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>('[data-anki-tag-input]');
        if (!input) return false;
        updateAnkiTagsEditor(form, 'anki-tag-add', input);
        return true;
    }

    private async handleSettingsAudioAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<boolean> {
        if (action !== 'preview-audio') return false;

        const button = settingsActionButton(control);
        const previewSettings = readFormSettings(new FormData(form), this.settings);
        focusPreviewAudioSource(form, button, previewSettings);
        const previous = this.swapSettingsTransiently({ ...previewSettings, audioEnabled: true, audioViaBlob: true });
        button?.setAttribute('disabled', 'true');
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        try {
            const played = await this.dependencies.audio.play(createAudioPreviewCard(), { userGesture: true });
            if (played) {
                this.dependencies.toast(uiText(language, 'playingAudioPreview'));
            } else {
                // play() resolves false (without throwing) when no source produced
                // audible audio and the chime fallback is off — don't claim playback.
                this.dependencies.toast(uiText(language, 'audioPreviewFailed'));
            }
        } catch (error) {
            log.warn('Audio settings preview failed', error);
            this.dependencies.toast(userFacingErrorText(language, 'audioPreviewFailed', error));
        } finally {
            this.restoreTransientSettings(previous);
            button?.removeAttribute('disabled');
            // The preview just resolved real clips, so the providers behind the
            // previewed URL are now known without a probe of our own.
            this.renderKnownAudioSubSources(form);
        }
        return true;
    }

    /**
     * Fills in each aggregator row's provider list without anything to press.
     *
     * Providers seen during ordinary lookups are already merged in when the
     * rows render, so the common case costs no requests at all — including
     * after a preview, which is why playback re-renders the lists.
     *
     * Sample lookups are only sent for a row the user just acted on (typing a
     * URL, switching a row to Custom URL, enabling one). Merely opening
     * Settings must never reach out on its own: the URL can be a private or
     * third-party host the user has not agreed to contact yet.
     */
    private refreshAudioSubSources(form: HTMLFormElement, row?: HTMLElement | null): void {
        const rows = row ? [row] : Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
        for (const target of rows) void this.detectAudioSubSourcesForRow(form, target);
    }

    // Opening the media panel is the moment the user is looking at audio
    // sources, so that is when their providers get discovered — the same shape
    // as the help panel refreshing the update status when it is opened. Merely
    // rendering the dialog still reaches nothing, because a source URL can be a
    // private host that only an explicit visit here justifies contacting.
    private onSettingsPanelActivated(form: HTMLFormElement, panel: string): void {
        if (panel === 'help') void this.refreshYomuUpdateStatus(form);
        if (panel === 'media') this.refreshAudioSubSources(form);
    }

    private renderKnownAudioSubSources(form: HTMLFormElement): void {
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        for (const row of form.querySelectorAll<HTMLElement>('[data-audio-source-row]')) {
            const url = row.querySelector<HTMLInputElement>('[data-audio-url-field]')?.value.trim() ?? '';
            const known = url ? knownAudioSubSourceNames(url) : [];
            if (known.length) this.renderDetectedAudioSubSources(form, row, known, language);
        }
    }

    private async detectAudioSubSourcesForRow(form: HTMLFormElement, row: HTMLElement): Promise<void> {
        const url = probeableAudioSourceUrl(row);
        if (!url) return;
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const setDetectStatus = (message: string) => {
            const status = row.querySelector<HTMLElement>('[data-audio-subsource-status]');
            if (!status) return;
            status.textContent = message;
            status.hidden = !message;
        };
        const known = knownAudioSubSourceNames(url);
        if (!known.length) setDetectStatus(uiText(language, 'audioDetectingSubSources'));
        try {
            const detected = await detectCustomJsonAudioSubSources(url, this.settings.audioTimeoutMs, this.settings.corsProxyUrl);
            // The row can be re-rendered, reordered, or removed while the probe
            // is in flight, so re-resolve it and bail unless it still holds the
            // URL that was probed.
            if (probeableAudioSourceUrl(row) !== url || !row.isConnected) return;
            this.renderDetectedAudioSubSources(form, row, detected, language);
            setDetectStatus(detected.length ? '' : uiText(language, 'audioNoSubSourcesDetected'));
        } catch (error) {
            log.warn('Audio sub-source detection failed', error);
            setDetectStatus(known.length ? '' : uiText(language, 'audioNoSubSourcesDetected'));
        }
    }

    // Merges the detected names over whatever the form currently holds, so a
    // toggle the user just changed survives a probe landing underneath them and
    // a provider missing from this round keeps its saved state.
    private renderDetectedAudioSubSources(form: HTMLFormElement, row: HTMLElement, detected: string[], language: InterfaceLanguage): void {
        const list = row.querySelector<HTMLElement>('[data-audio-subsource-list]');
        if (!list) return;
        const index = Array.from(form.querySelectorAll('[data-audio-source-row]')).indexOf(row);
        if (index < 0) return;
        const data = new FormData(form);
        const get = (key: string) => String(data.get(key) ?? '');
        const merged = mergeAudioSubSources(normalizeAudioSubSources(readAudioSubSources(data, get, index)), detected);
        setInnerHtml(list, renderAudioSubSourceList(index, merged, readAudioSources(data), language));
    }

    private async handleSettingsDictionaryAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        const disclosure = handleCatalogBrowseDisclosureAction(action, form, control, () => this.refreshDictionaryStatus(form));
        if (disclosure) return disclosure;
        if (dictionaryActionBlockedDuringSiteClear(action, this.dictionarySiteStorageClearPending)) {
            setStatus(uiText(getFormInterfaceLanguage(form, this.settings.interfaceLanguage), 'clearLocalDictionarySiteStorageClearing'));
            return true;
        }
        if (await this.handleDictionaryStorageAction(form, action, control, setStatus)) return true;
        return this.handleDictionaryTransferAction(form, action, control, setStatus);
    }

    private async handleDictionaryStorageAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'clear-local-dictionary-site-storage') {
            await this.disableAndClearLocalDictionarySiteStorage(form, control, setStatus);
            return true;
        }
        if (action === 'delete-yomitan-dictionary') {
            await this.deleteDictionaryFromSettings(form, control, setStatus);
            return true;
        }
        return false;
    }

    private async handleDictionaryTransferAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'import-yomitan-dictionary') {
            await this.importDictionaryFromSettings(form, setStatus);
            return true;
        }
        if (action === 'download-recommended-dictionary') {
            this.queueRecommendedDictionaryDownloadFromSettings(form, control, setStatus);
            return true;
        }
        if (action === 'export-yomitan-dictionary') {
            const blob = await this.dependencies.dictionaries.exportJson();
            downloadBlob(blob, `yomu-dictionaries-${dateStamp()}.json`);
            setStatus(uiText(getFormInterfaceLanguage(form, this.settings.interfaceLanguage), 'dictionariesExported'));
            return true;
        }
        return false;
    }

    private async handleSettingsCloudSyncAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (!cloudSettingsActionEnabled(CLOUD_SETTINGS_SYNC_ENABLED, action)) return false;

        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        if (!cloudSettingsSyncAvailable()) {
            setStatus(cloudSettingsSyncUnavailableStatus(language));
            return true;
        }

        const button = settingsActionButton(control);
        setCloudSettingsActionButtonDisabled(button, true);
        const authorization = createCloudSettingsAuthorization();
        const redirectHandoff = cloudSettingsRedirectHandoffRequired();
        await rememberCloudSettingsRedirectHandoff(redirectHandoff, action, authorization);
        const previousSettings = this.settings;
        try {
            this.settings = settingsForCloudAction(action, form, this.settings);
            await this.performCloudSettingsAction(action, language, setStatus, previousSettings, authorization);
            return true;
        } catch (error) {
            notifyCloudSettingsPersistenceFailed(this.dependencies.onSettingsPersistenceFailed, previousSettings);
            throw error;
        } finally {
            await clearCloudSettingsRedirectHandoff(redirectHandoff);
            setCloudSettingsActionButtonDisabled(button, false);
        }
    }

    private async performCloudSettingsAction(
        action: CloudSettingsAction,
        language: InterfaceLanguage,
        setStatus?: SettingsStatusSetter,
        previousSettings = this.settings,
        authorization?: CloudSettingsAuthorization,
    ): Promise<void> {
        if (action === 'sync-cloud-settings') {
            await this.saveCurrentSettings(previousSettings);
            const metadata = await uploadCloudSettingsToCloud(this.settings, authorization);
            const message = cloudSettingsSyncedStatus(metadata.syncedAt, language);
            reportCloudSettingsStatus(setStatus, message);
            this.dependencies.toast(message);
            return;
        }

        const snapshot = await downloadCloudSettingsFromCloud(authorization);
        if (!snapshot) {
            reportCloudSettingsStatus(setStatus, cloudSettingsNotFoundStatus(language));
            return;
        }
        const settingsBeforeRestore = this.settings;
        this.settings = normalizeReaderSettings({
            ...this.settings,
            ...snapshot.settings,
            shortcuts: { ...this.settings.shortcuts, ...snapshot.settings.shortcuts },
        });
        await importStoredValues(snapshot.storage);
        await this.saveCurrentSettings(settingsBeforeRestore);
        const message = cloudSettingsRestoredStatus(snapshot.syncedAt, language);
        reportCloudSettingsStatus(setStatus, message);
        this.dependencies.toast(message);
        this.dependencies.applyTheme();
        void this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.ocr.refresh();
        this.dependencies.youtube.refresh();
        this.dependencies.clearSettingsPreview();
        this.open('backup');
    }

    private async handleSettingsImportExportAction(form: HTMLFormElement, action: string, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'import-yomitan-settings') {
            await this.importReaderSettingsFromFile(form, setStatus);
            return true;
        }
        if (action === 'export-reader-settings') {
            const dictionaries = await this.exportReaderDictionaryBackup();
            downloadBlob(new Blob([JSON.stringify({
                formatName: 'yomu-reader-settings',
                formatVersion: 3,
                exportedAt: new Date().toISOString(),
                settings: this.settings,
                storage: await exportManagedStoredValues(),
                ...(dictionaries ? { dictionaries } : {}),
            }, null, 2)], { type: 'application/json' }), `yomu-settings-${dateStamp()}.json`);
            setStatus(uiText(getFormInterfaceLanguage(form, this.settings.interfaceLanguage), 'settingsExported'));
            return true;
        }
        return false;
    }

    private async exportReaderDictionaryBackup(): Promise<unknown | undefined> {
        const summary = await this.dependencies.dictionaries.summary().catch(() => ({ dictionaries: [] }));
        if (!summary.dictionaries.length) return undefined;
        const blob = await this.dependencies.dictionaries.exportJson();
        const json = JSON.parse(await blob.text()) as unknown;
        return readerDictionaryExportHasData(json) ? json : undefined;
    }

    private async handleSettingsConnectionAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<boolean> {
        const connectionAction = ankiConnectionAction(action);
        if (!connectionAction) return false;
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const button = settingsActionButton(control);
        const setAnkiStatus = ankiStatusSetter(form.querySelector<HTMLElement>('[data-anki-status]'));
        const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
        button?.setAttribute('disabled', 'true');
        setAnkiStatus(uiText(language, ankiConnectionPendingKey(connectionAction)), 'pending');
        try {
            if (!await this.checkAnkiConnectionForSettings(setAnkiStatus, language)) return true;
            if (connectionAction === 'test-anki') {
                this.finishAnkiConnectionTest(form, setAnkiStatus, language);
                return true;
            }
            if (connectionAction === 'update-anki-model') {
                await this.updateAnkiModelAction(form, setAnkiStatus, language);
                return true;
            }
            await this.prepareAnkiConnectionAction(form, setAnkiStatus, language);
        } catch (error) {
            this.handleAnkiConnectionActionError(error, setAnkiStatus, language);
        } finally {
            this.restoreTransientSettings(previous);
            button?.removeAttribute('disabled');
        }
        return true;
    }

    private async checkAnkiConnectionForSettings(setAnkiStatus: AnkiStatusSetter, language: InterfaceLanguage): Promise<boolean> {
        try {
            if (await this.dependencies.anki.isConnected()) return true;
        } catch (error) {
            log.warn('Anki settings check failed', error);
        }
        const line = this.ankiSetupUnavailableStatus(this.settings, language);
        setAnkiStatus(line.message, line.tone, line.action);
        return false;
    }

    private finishAnkiConnectionTest(form: HTMLFormElement, setAnkiStatus: AnkiStatusSetter, language: InterfaceLanguage): void {
        setAnkiStatus(uiText(language, 'ankiConnectionReady'), 'success');
        this.queueAutomaticAnkiLibraryScan(form, language);
    }

    private async prepareAnkiConnectionAction(form: HTMLFormElement, setAnkiStatus: AnkiStatusSetter, language: InterfaceLanguage): Promise<void> {
        await this.dependencies.anki.ensureDeckAndModel();
        setAnkiStatus(this.ankiReadyMessage(language), 'success');
        this.queueAutomaticAnkiLibraryScan(form, language);
    }

    // Runs from the user pressing Update, never from the scan that spots the
    // gap: the offer is a question, not a migration. The re-scan it queues
    // clears the offer, because the note type now matches.
    //
    // The write is aimed by the offer on screen, not by the picker, and the
    // client declines anything else — so an offer the user has moved past adds
    // nothing rather than widening whichever note type is selected now.
    private async updateAnkiModelAction(form: HTMLFormElement, setAnkiStatus: AnkiStatusSetter, language: InterfaceLanguage): Promise<void> {
        const addMissingYomuModelFields = this.dependencies.anki.addMissingYomuModelFields;
        if (typeof addMissingYomuModelFields !== 'function') return;
        const offeredModel = ankiModelUpdatePromptTarget(form);
        if (!offeredModel) {
            setAnkiStatus(uiText(language, 'ankiConnectionReady'), 'success');
            this.queueAutomaticAnkiLibraryScan(form, language);
            return;
        }
        const added = await addMissingYomuModelFields.call(this.dependencies.anki, offeredModel);
        setAnkiStatus(added.length
            ? formatUiText(language, 'ankiModelUpdated', { fields: added.join(', ') })
            : uiText(language, 'ankiModelUpToDate'), 'success');
        this.queueAutomaticAnkiLibraryScan(form, language);
    }

    private handleAnkiConnectionActionError(error: unknown, setAnkiStatus: AnkiStatusSetter, language: InterfaceLanguage): void {
        if (isAnkiConnectAvailabilityError(error) || isAnkiConnectSetupError(error)) {
            const line = this.ankiSetupUnavailableStatus(this.settings, language);
            log.warn('Anki settings action unavailable', error);
            setAnkiStatus(line.message, line.tone, line.action);
            return;
        }
        const message = this.ankiConnectionErrorMessage(error, language);
        log.warn('Anki settings test failed', error);
        setAnkiStatus(message, 'error');
        this.dependencies.toast(message);
    }

    private applyAnkiScanToForm(form: HTMLFormElement, scan: AnkiLibraryScanResult): void {
        this.applyAnkiFieldMappingsToForm(form, scan);
        const controls = ankiScanFormControls(form);
        const selection = ankiScanSelection(controls, scan);
        this.applyAnkiScanControlsToForm(form, scan, selection);
        applySettingsControlValue(controls.model, selection.selectedModel);
        applySettingsControlValue(controls.deck, selection.selectedDeck);
        this.renderAnkiFieldMappingEditor(form);
    }

    private applyAnkiFieldMappingsToForm(form: HTMLFormElement, scan: AnkiLibraryScanResult): void {
        const input = namedSettingsControl<HTMLInputElement>(form, 'ankiFieldMappings');
        if (!input) return;
        const existing = readFormSettings(new FormData(form), this.settings).ankiFieldMappings;
        const scannedMappings = Object.fromEntries(scan.models.flatMap(model => {
            const currentMapping = existing[model.modelName] ?? {};
            const liveFields = new Set(model.fields);
            const mapping = Object.fromEntries(model.suggestions.flatMap(suggestion => {
                const savedField = currentMapping[suggestion.role]?.trim();
                const fieldName = liveFields.has(savedField ?? '') ? savedField : suggestion.fieldName?.trim();
                return fieldName ? [[suggestion.role, fieldName] as const] : [];
            }));
            return Object.keys(mapping).length ? [[model.modelName, mapping]] : [];
        }));
        input.value = JSON.stringify({ ...existing, ...scannedMappings });
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
    }

    private applyAnkiScanControlsToForm(
        form: HTMLFormElement,
        scan: AnkiLibraryScanResult,
        selected: { selectedDeck?: string; selectedModel?: string } = {},
    ): void {
        const deckOptions = form.querySelector<HTMLElement>('[data-anki-deck-options]');
        const currentDeck = selected.selectedDeck ?? namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiDeck')?.value.trim() ?? '';
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        if (deckOptions) setInnerHtml(deckOptions, renderAnkiDeckLibraryOptions([currentDeck, ...scan.deckNames].filter(Boolean), currentDeck, language));
        this.renderNewTabAnkiDeckToggles(form, scan.deckNames, language);
        const modelOptions = form.querySelector<HTMLElement>('[data-anki-model-options]');
        if (modelOptions) {
            const currentModel = selected.selectedModel ?? namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiModel')?.value.trim() ?? '';
            setInnerHtml(modelOptions, renderAnkiLibraryOptions([currentModel, ...scan.models.map(model => model.modelName)].filter(Boolean), currentModel, language));
        }
        const fieldsInput = form.querySelector<HTMLInputElement>('[data-anki-scan-fields]');
        if (fieldsInput) {
            fieldsInput.value = JSON.stringify(Object.fromEntries(scan.models.map(model => [model.modelName, model.fields])));
        }
        const confidenceInput = form.querySelector<HTMLInputElement>('[data-anki-scan-confidence]');
        if (confidenceInput) {
            confidenceInput.value = JSON.stringify(Object.fromEntries(scan.models.map(model => [
                model.modelName,
                Object.fromEntries(model.suggestions.flatMap(suggestion =>
                    suggestion.fieldName ? [[suggestion.role, suggestion.confidence]] : [],
                )),
            ])));
        }
        this.renderAnkiFieldMappingEditor(form);
    }

    private renderNewTabAnkiDeckToggles(
        form: HTMLFormElement,
        deckNames: string[],
        language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage),
        disabledDecks = readNewTabAnkiDisabledDecks(form),
    ): void {
        const container = form.querySelector<HTMLElement>('[data-newtab-anki-decks]');
        if (!container) return;
        const html = renderNewTabAnkiDeckSelector(disabledDecks, deckNames, language);
        container.hidden = !html;
        setInnerHtml(container, html);
    }

    private syncNewTabAnkiDeckToggles(form: HTMLFormElement): void {
        const hidden = namedSettingsControl<HTMLInputElement>(form, 'newTabAnkiDisabledDecks');
        if (!hidden) return;
        const toggles = Array.from(form.querySelectorAll<HTMLInputElement>('[data-newtab-anki-deck-toggle]'));
        const visibleDecks = toggles.map(toggle => toggle.dataset.newtabAnkiDeck?.trim() ?? '').filter(Boolean);
        const visibleDeckSet = new Set(visibleDecks);
        const previousDisabled = readNewTabAnkiDisabledDecks(form);
        const previousDisabledSet = new Set(previousDisabled);
        const visibleDisabled = toggles
            .filter(toggle => !toggle.checked)
            .map(toggle => toggle.dataset.newtabAnkiDeck?.trim() ?? '')
            .filter(Boolean);
        const visibleDisabledSet = new Set(visibleDisabled);
        const disabled = canonicalNewTabAnkiDisabledDecks([
            ...previousDisabled.filter(deck => !visibleDeckSet.has(deck) || visibleDisabledSet.has(deck)),
            ...visibleDisabled.filter(deck => !previousDisabledSet.has(deck)),
        ]);
        hidden.value = disabled.join(', ');
        dispatchAuthorizedReaderControlEvent(hidden, new Event('input', { bubbles: true }));
        this.renderNewTabAnkiDeckToggles(form, visibleDecks, getFormInterfaceLanguage(form, this.settings.interfaceLanguage), disabled);
    }

    private renderAnkiFieldMappingEditor(form: HTMLFormElement): void {
        const container = form.querySelector<HTMLElement>('[data-anki-field-mapping-editor]');
        if (!container) return;
        const settings = readFormSettings(new FormData(form), this.settings);
        const modelName = namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiModel')?.value.trim() || settings.ankiModel;
        setInnerHtml(container, renderAnkiFieldMappingEditor(
            settings,
            modelName,
            this.ankiScanFieldsForModel(form, modelName),
            getFormInterfaceLanguage(form, this.settings.interfaceLanguage),
            this.ankiScanConfidenceForModel(form, modelName),
        ));
    }

    private syncAnkiFieldMappingsFromEditor(form: HTMLFormElement): void {
        const input = namedSettingsControl<HTMLInputElement>(form, 'ankiFieldMappings');
        const modelName = namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiModel')?.value.trim();
        if (!input || !modelName) return;
        const settings = readFormSettings(new FormData(form), this.settings);
        const next = { ...settings.ankiFieldMappings };
        const mapping: Partial<Record<AnkiFieldMappingRole, string>> = {};
        form.querySelectorAll<HTMLSelectElement>('[data-anki-field-role]').forEach(select => {
            const role = select.dataset.ankiFieldRole as AnkiFieldMappingRole | undefined;
            const value = select.value.trim();
            if (role && value) mapping[role] = value;
        });
        if (Object.keys(mapping).length) next[modelName] = mapping;
        else delete next[modelName];
        input.value = JSON.stringify(next);
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
    }

    private ankiScanFieldsForModel(form: HTMLFormElement, modelName: string): string[] {
        const input = form.querySelector<HTMLInputElement>('[data-anki-scan-fields]');
        if (!input?.value.trim()) return [];
        try {
            const parsed = JSON.parse(input.value) as Record<string, unknown>;
            const fields = parsed[modelName];
            return Array.isArray(fields) ? fields.map(String).filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    private ankiScanConfidenceForModel(form: HTMLFormElement, modelName: string): Partial<Record<AnkiFieldMappingRole, 'high' | 'medium' | 'low'>> {
        const input = form.querySelector<HTMLInputElement>('[data-anki-scan-confidence]');
        if (!input?.value.trim()) return {};
        try {
            const parsed = JSON.parse(input.value) as Record<string, Partial<Record<AnkiFieldMappingRole, unknown>>>;
            const confidence = parsed[modelName] ?? {};
            return Object.fromEntries(ankiScanConfidenceEntries(confidence));
        } catch {
            return {};
        }
    }

    private ankiScanMessage(scan: AnkiLibraryScanResult, language: InterfaceLanguage): string {
        if (!scan.suggestedModel) {
            return formatUiTemplate(uiText(language, 'ankiScanNoModels'), {
                decks: String(scan.deckNames.length),
            });
        }
        const fields = scan.suggestedModel.suggestions
            .filter(suggestion => suggestion.fieldName)
            .map(suggestion => `${suggestion.role}: ${suggestion.fieldName}`)
            .join(', ');
        return formatUiTemplate(uiText(language, 'ankiScanSummary'), {
            decks: String(scan.deckNames.length),
            models: String(scan.models.length),
            model: scan.suggestedModel.modelName,
            fields: formatUiTemplate(uiText(language, 'ankiScanFieldSummary'), { fields }),
        });
    }

    private ankiReadyMessage(language: InterfaceLanguage): string {
        return formatUiTemplate(uiText(language, 'ankiConnectedReady'), {
            deck: this.settings.ankiDeck,
            model: this.settings.ankiModel,
        });
    }

    private ankiUnreachableMessage(language: InterfaceLanguage): string {
        return uiText(language, 'ankiSettingsUnreachable');
    }

    // Diagnostic-UX ticket: when the direct probe fails, tell the user WHICH
    // step failed. A no-cors probe that resolves means AnkiConnect is up but
    // rejected this origin (webCorsOriginList) — name the origin to add; only
    // a true network failure keeps the generic 'open Anki' guidance.
    private async refineAnkiUnavailableStatus(
        form: HTMLFormElement,
        requestId: number,
        settings: ReaderSettings,
        language: InterfaceLanguage,
    ): Promise<void> {
        if (canUseMobileAnkiHandoff(settings) || hasUserscriptAnkiBridge()) return;
        const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
        const verdict = await diagnoseAnkiConnectFailure(url).catch((): 'unreachable' => 'unreachable');
        if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
        if (verdict !== 'cors-blocked') return;
        const origin = typeof location !== 'undefined' ? location.origin : '';
        this.setAnkiStatus(form, uiText(language, 'ankiCorsBlocked').replace('{origin}', origin), 'pending');
    }

    private ankiSetupUnavailableStatus(settings: ReaderSettings, language: InterfaceLanguage): SettingsStatusLine {
        if (canUseMobileAnkiHandoff(settings)) {
            return { message: uiText(language, 'mobileAnkiReady'), tone: 'pending', state: 'ready' };
        }
        if (typeof location !== 'undefined' && location.hostname && !['127.0.0.1', 'localhost', '::1'].includes(location.hostname) && !hasUserscriptAnkiBridge()) {
            return { message: uiText(language, 'ankiHostedBridgeMissing'), tone: 'pending', action: 'anki-unreachable', state: 'unreachable' };
        }
        return { message: this.ankiUnreachableMessage(language), tone: 'pending', action: 'anki-unreachable', state: 'unreachable' };
    }

    // Field-mapping suggestions with their confidence, shown as the status
    // checklist instead of hidden mapping JSON (P1 adapter state machine).
    private ankiScanDetails(scan: AnkiLibraryScanResult, language: InterfaceLanguage): SettingsStatusDetail[] {
        const suggestions = scan.suggestedModel?.suggestions ?? [];
        return suggestions
            .filter(suggestion => suggestion.fieldName || suggestion.confidence === 'low')
            .map(suggestion => ({
                label: `${suggestion.role}: ${suggestion.fieldName ?? '—'}`,
                suffix: uiText(language, suggestion.confidence === 'high'
                    ? 'ankiMappingConfidenceHigh'
                    : suggestion.confidence === 'medium'
                        ? 'ankiMappingConfidenceMedium'
                        : 'ankiMappingConfidenceLow'),
            }));
    }

    private staleAnkiFieldMappingDetails(form: HTMLFormElement, scan: AnkiLibraryScanResult, language: InterfaceLanguage): SettingsStatusDetail[] {
        const controls = ankiScanFormControls(form);
        const selection = ankiScanSelection(controls, scan);
        const modelName = selection.selectedModel?.trim();
        if (!modelName) return [];
        const model = scan.models.find(candidate => candidate.modelName === modelName);
        if (!model) return [];
        const liveFields = new Set(model.fields);
        const mapping = readFormSettings(new FormData(form), this.settings).ankiFieldMappings[modelName] ?? {};
        return Object.entries(mapping)
            .filter((entry): entry is [AnkiFieldMappingRole, string] => isAnkiFieldMappingRole(entry[0]) && !liveFields.has(entry[1]))
            .map(([role, fieldName]) => ({
                label: `${role}: ${fieldName}`,
                suffix: uiText(language, 'ankiMappingStaleField'),
            }));
    }

    private ankiConnectionErrorMessage(error: unknown, language: InterfaceLanguage): string {
        return userFacingErrorText(language, 'ankiUnreachable', error);
    }

    private async handleSettingsSupportAction(action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'open-yomu-update') {
            // Route through openUrlInNewTab so a userscript-manager context
            // opens the .user.js via GM_openInTab (a tab the manager owns);
            // without a manager the flow resolves to the install guide, never
            // a raw .user.js navigation the browser would block with its
            // "cannot be added from this website" banner.
            openUrlInNewTab(detectYomuUpdateFlow().url);
            return true;
        }
        if (action === 'copy-newtab-url') {
            await copyText(NEW_TAB_PAGE_URL);
            this.dependencies.toast(uiText(this.settings.interfaceLanguage, 'newTabAddressCopied'));
            return true;
        }
        if (action === 'factory-reset') {
            const button = settingsActionButton(control);
            button?.setAttribute('disabled', 'true');
            try {
                await this.dependencies.resetAllData();
            } finally {
                button?.removeAttribute('disabled');
            }
            return true;
        }
        setStatus('');
        return false;
    }

    private async disableAndClearLocalDictionarySiteStorage(
        form: HTMLFormElement,
        control: HTMLElement | null | undefined,
        setStatus: SettingsStatusSetter,
    ): Promise<void> {
        if (this.dictionarySiteStorageClearPending) return;
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        if (!window.confirm(uiText(language, 'clearLocalDictionarySiteStorageConfirm'))) return;

        const button = settingsActionButton(control);
        const enabled = namedSettingsControl<HTMLInputElement>(form, 'localDictionariesEnabled');
        this.dictionarySiteStorageClearPending = true;
        button?.setAttribute('disabled', 'true');
        this.setDictionaryImportsDisabledForSiteClear(form, true);
        setStatus(uiText(language, 'clearLocalDictionarySiteStorageClearing'));
        try {
            // Imports and recommended downloads use this same queue. Waiting
            // behind them prevents a late persistDictionaryImport from
            // recreating the DB and turning the global setting back on after
            // the learner confirmed cleanup.
            await this.enqueueDictionaryOperation(form, async () => {
                const previousSettings = this.settings;
                let settingsSaved = false;
                setStatus(uiText(language, 'clearLocalDictionarySiteStorageClearing'));
                try {
                    this.settings = { ...previousSettings, localDictionariesEnabled: false };
                    await this.saveCurrentSettings(previousSettings);
                    settingsSaved = true;
                    if (enabled) enabled.checked = false;

                    // deleteDatabase removes this origin's IndexedDB now; the
                    // purge marker removes every other origin's copy the next
                    // time that origin loads. The shared GM archive is kept.
                    await requestDictionaryReplicaPurge();
                    await this.dependencies.dictionaries.deleteDatabase();
                    this.dictionaryRefreshId++;
                    await this.dependencies.refreshDictionaryStyles();
                    const dictionaryStatus = form.querySelector<HTMLElement>('[data-dictionary-status]');
                    if (dictionaryStatus) dictionaryStatus.textContent = uiText(language, 'noLocalDictionariesImported');
                    this.dependencies.scheduleDictionaryRescan();
                    this.dependencies.refreshNewTabIfCurrent();
                    const message = uiText(language, 'clearLocalDictionarySiteStorageDone');
                    setStatus(message);
                    this.dependencies.toast(message);
                } catch (error) {
                    if (!settingsSaved) {
                        this.settings = previousSettings;
                        if (enabled) enabled.checked = previousSettings.localDictionariesEnabled;
                    }
                    throw error;
                }
            });
        } finally {
            this.dictionarySiteStorageClearPending = false;
            this.setDictionaryImportsDisabledForSiteClear(form, false);
            button?.removeAttribute('disabled');
        }
    }

    private setDictionaryImportsDisabledForSiteClear(form: HTMLFormElement, disabled: boolean): void {
        form.querySelectorAll<HTMLButtonElement>(
            '[data-action="import-yomitan-dictionary"], [data-action="download-recommended-dictionary"]',
        ).forEach(importButton => {
            if (disabled) {
                importButton.dataset.disabledForSiteClear = 'true';
                importButton.disabled = true;
                return;
            }
            if (importButton.dataset.disabledForSiteClear !== 'true') return;
            delete importButton.dataset.disabledForSiteClear;
            importButton.disabled = false;
        });
    }

    private async deleteDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionary = control?.dataset.dictionaryName;
        if (!dictionary) throw new Error('Dictionary not found.');
        if (!window.confirm(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRemoveConfirm'), { dictionary }))) return;
        control?.setAttribute('disabled', 'true');
        setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRemoving'), { dictionary }));
        await this.dependencies.dictionaries.deleteDictionary(dictionary);
        this.dictionaryRefreshId++;
        await clearNewTabOfflineCache().catch(() => undefined);
        this.settings.dictionaryPreferences = this.settings.dictionaryPreferences.filter(item => item.name !== dictionary);
        await this.dependencies.saveSettings(this.settings, { explicitUserChoiceKeys: ['dictionaryPreferences'] });
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        await this.refreshDictionaryStatus(form);
        this.dependencies.refreshNewTabIfCurrent();
        setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRemoved'), { dictionary }));
    }

    private async importDictionaryFromSettings(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const files = await pickFiles(form, 'dictionary');
        if (!files.length) return;
        const results = await Promise.allSettled(files.map(file => this.enqueueDictionaryOperation(form, async () => {
            const summary = await this.dependencies.dictionaries.importFile(file, message => setStatus(message));
            await this.persistDictionaryImport(summary);
            return summary;
        })));
        const summaries = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        if (summaries.length) {
            await this.refreshDictionaryStatus(form);
            this.dependencies.refreshNewTabIfCurrent();
        }
        const records = summaries.reduce((total, summary) => total + summary.entries, 0);
        const sources = new Set(summaries.flatMap(summary => summary.dictionaries)).size;
        const failures = results.flatMap((result, index) => result.status === 'rejected'
            ? [{ filename: files[index]?.name || `file ${index + 1}`, error: result.reason }]
            : []);
        if (failures.length) {
            failures.forEach(failure => log.warn('Dictionary file import failed', failure));
            setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryImportResultWithFailures'), {
                records: records.toLocaleString(),
                sources: sources.toLocaleString(),
                plural: sources === 1 ? '' : 's',
                failed: failures.length.toLocaleString(),
                failedPlural: failures.length === 1 ? '' : 's',
                files: failures.map(failure => failure.filename).join(', '),
            }));
            return;
        }
        setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryImportComplete'), {
            records: records.toLocaleString(),
            sources: sources.toLocaleString(),
            plural: sources === 1 ? '' : 's',
        }));
    }

    private queueRecommendedDictionaryDownloadFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): void {
        void this.downloadRecommendedDictionaryFromSettings(form, control, setStatus)
            .catch(error => {
                const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
                const message = handleSettingsActionError('download-recommended-dictionary', control, setStatus, error, language);
                this.dependencies.toast(message);
            });
    }

    private async downloadRecommendedDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionary = recommendedDictionaryForControl(control);
        if (this.recommendedDictionaryOperations.has(dictionary.id)) return;
        const queuedMessage = formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryInstallQueued'), { dictionary: dictionary.name });
        this.setRecommendedDictionaryInstallState(form, dictionary.id, 'queued', queuedMessage);
        setStatus(queuedMessage);
        await this.enqueueDictionaryOperation(form, async () => {
            try {
                const startedMessage = recommendedDictionaryDownloadStatus(control, dictionary.name, this.settings.interfaceLanguage);
                this.setRecommendedDictionaryInstallState(form, dictionary.id, 'installing', startedMessage);
                setStatus(startedMessage);
                const summary = await this.downloadRecommendedDictionary(dictionary, control, message => {
                    setStatus(message);
                    this.setRecommendedDictionaryInstallState(form, dictionary.id, 'installing', `${dictionary.name}: ${message}`);
                });
                if (!summary) return;
                await this.persistDictionaryImport(summary);
                setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRecordsImported'), {
                    dictionary: dictionary.name,
                    records: summary.entries.toLocaleString(),
                }));
                await this.refreshDictionaryStatus(form);
                this.dependencies.refreshNewTabIfCurrent();
            } finally {
                this.clearRecommendedDictionaryInstallState(form, dictionary.id);
            }
        });
    }

    private async persistDictionaryImport(summary: ImportSummary): Promise<void> {
        this.dictionaryRefreshId++;
        const dictionaryPreferences = mergeDictionaryPreferences(
            this.settings.dictionaryPreferences,
            summary.dictionaries,
            summary.dictionaryTypes ?? {},
            summary.replacedDictionaries ?? [],
        );
        this.settings = captureActiveLanguageProfileDictionaries(
            { ...this.settings, localDictionariesEnabled: true },
            dictionaryPreferences,
        );
        await markDictionaryReplicaFresh();
        await this.dependencies.saveSettings(this.settings, { explicitUserChoiceKeys: ['dictionaryPreferences', 'localDictionariesEnabled'] });
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
    }

    private async downloadRecommendedDictionary(
        dictionary: RecommendedDictionary,
        control: HTMLElement | null | undefined,
        setStatus: SettingsStatusSetter,
    ): Promise<ImportSummary | null> {
        if (!dictionary.downloadUrl) return null;
        const downloadUrl = dictionary.downloadUrl;
        try {
            const importOptions = recommendedDictionaryImportOptions(dictionary);
            return importOptions
                ? await this.dependencies.dictionaries.importFromUrl(
                    downloadUrl,
                    recommendedDictionaryFilename(dictionary),
                    message => setStatus(message),
                    importOptions,
                )
                : await this.dependencies.dictionaries.importFromUrl(
                    downloadUrl,
                    recommendedDictionaryFilename(dictionary),
                    message => setStatus(message),
                );
        } catch (error) {
            return this.handleRecommendedDictionaryDownloadError(dictionary, downloadUrl, control, setStatus, error);
        }
    }

    private handleRecommendedDictionaryDownloadError(
        dictionary: RecommendedDictionary,
        downloadUrl: string,
        control: HTMLElement | null | undefined,
        setStatus: SettingsStatusSetter,
        error: unknown,
    ): null {
        control?.removeAttribute('disabled');
        if (!this.shouldPromptManualDictionaryDownload(error, downloadUrl)) {
            // Re-throw an error that already knows what it is. Wrapping it in
            // `dictionaryDownloadFailed` collapsed at least six distinct failures --
            // a non-2xx, a non-ZIP payload, a timeout, a blocked cross-origin
            // request, an integrity mismatch and an IndexedDB fault -- into one
            // sentence, which is why GitHub #39 arrived with nothing to act on.
            if (isUserFacingError(error)) throw error;
            throw userFacingError('dictionaryDownloadFailed', {
                cause: error,
                diagnostic: error instanceof Error ? error.message : String(error),
            });
        }
        const message = userFacingErrorText(this.settings.interfaceLanguage, 'dictionaryDownloadBlocked', error);
        const status = `${message} ${uiText(this.settings.interfaceLanguage, 'dictionaryManualDownloadHint')}`;
        setStatus(status);
        this.dependencies.toast(status);
        log.warn('Dictionary auto-download unavailable', { dictionary: dictionary.name, message });
        return null;
    }

    /**
     * Whether to offer "import the ZIP by hand" instead of failing outright.
     *
     * This used to substring-match `error.message` against fifteen hints such as
     * 'blocked in this browser' and 'request bridge'. Not one of the five real
     * strings contains any of them -- the copy says 'Download blocked.' and
     * 'Download needs bridge; else import ZIP.' -- so the matcher always returned
     * false and the manual-import recovery, written for exactly the case where a
     * userscript manager refuses the request, could never reach anyone (GitHub #39).
     *
     * Matching rendered COPY is the defect: it is localized, it gets shortened for
     * width, and neither change touches this file. The copy KEY is stable, so that
     * is what this reads.
     */
    private shouldPromptManualDictionaryDownload(error: unknown, downloadUrl: string): boolean {
        if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) return false;
        const copyKey = userFacingCopyKeyOf(error);
        return copyKey === 'dictionaryDownloadBlocked' || copyKey === 'dictionaryDownloadNeedsBridge';
    }

    private async importReaderSettingsFromFile(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'settings');
        if (!file) return;
        const previousSettings = this.settings;
        const json = JSON.parse(await file.text()) as unknown;
        try {
            const readerSettings = getReaderSettingsExport(json);
            this.settings = readerSettings
                ? normalizeReaderSettings({ ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } })
                : importedYomitanSettings(json, this.settings);
            const restoredValues = await importStoredValues(getReaderStorageExport(json));
            const dictionarySummary = await this.importReaderDictionaryBackup(json, setStatus);
            await this.mergeImportedDictionaryPreferences();
            this.dictionaryRefreshId++;
            await this.saveCurrentSettings(previousSettings);
            setStatus(importSettingsStatus(restoredValues, dictionarySummary, this.settings.interfaceLanguage));
        } catch (error) {
            this.dependencies.onSettingsPersistenceFailed?.(previousSettings);
            throw error;
        }
        this.dependencies.applyTheme();
        void this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.youtube.refresh();
        this.dependencies.clearSettingsPreview();
        this.open();
    }

    private async importReaderDictionaryBackup(json: unknown, setStatus: SettingsStatusSetter): Promise<ImportSummary | null> {
        const dictionaryExport = getReaderDictionaryExport(json);
        if (!readerDictionaryExportHasData(dictionaryExport)) return null;
        setStatus(uiText(this.settings.interfaceLanguage, 'importingBundledDictionaries'));
        const file = new File([JSON.stringify(dictionaryExport)], 'yomu-dictionaries-from-settings.json', { type: 'application/json' });
        const summary = await this.dependencies.dictionaries.importFile(file, message => setStatus(message));
        await this.persistDictionaryImport(summary);
        return summary;
    }

    private async mergeImportedDictionaryPreferences(): Promise<void> {
        const importedSummary = await this.dependencies.dictionaries.summary().catch(() => ({ dictionaries: [] }));
        const importedNames = importedSummary.dictionaries.map(item => item.title);
        const importedTypes = Object.fromEntries(importedSummary.dictionaries.map(item => [item.title, item.type]));
        const merged = mergeDictionaryPreferences(retireStaleDictionaryPreferences(this.settings.dictionaryPreferences, importedNames), importedNames, importedTypes);
        this.settings = captureActiveLanguageProfileDictionaries(this.settings, merged);
    }
}

function isDictionarySourceOrderAction(action: string): boolean {
    return action === 'dictionary-source-up' || action === 'dictionary-source-down';
}

function isAudioSourceEditorAction(action: string): boolean {
    return action === 'audio-source-add' || action === 'audio-source-remove' || action === 'audio-source-up' || action === 'audio-source-down';
}

function isLookupLinkEditorAction(action: string): boolean {
    return action === 'lookup-link-add' || action === 'lookup-link-remove' || action === 'lookup-link-up' || action === 'lookup-link-down';
}

function getReaderStorageExport(value: unknown): unknown {
    if (!value || typeof value !== 'object') return null;
    const record = value as { formatName?: string; storage?: unknown };
    return (record.formatName === 'yomu-reader-settings' || record.formatName === 'jpdb-popup-reader-settings')
        ? record.storage
        : null;
}

function publishSettingsChange(settings: Partial<ReaderSettings>, options: { preview?: boolean } = {}): void {
    publishPrivateSettingsChange({ preview: options.preview === true, settings });
}

function importSettingsStatus(restoredValues: number, dictionarySummary: ImportSummary | null, language: InterfaceLanguage): string {
    const details: string[] = [];
    if (restoredValues) {
        details.push(formatUiTemplate(uiText(language, 'restoredStoredChoices'), {
            count: restoredValues.toLocaleString(),
            plural: restoredValues === 1 ? '' : 's',
        }));
    }
    if (dictionarySummary) {
        details.push(formatUiTemplate(uiText(language, 'importedDictionaryRecordCount'), {
            count: dictionarySummary.entries.toLocaleString(),
            plural: dictionarySummary.entries === 1 ? '' : 's',
        }));
    }
    return details.length
        ? formatUiTemplate(uiText(language, 'settingsImportedWithDetails'), { details: details.join('; ') })
        : uiText(language, 'settingsImported');
}

function cloudSettingsSyncUnavailableStatus(language: InterfaceLanguage): string {
    return language === 'ja'
        ? 'このブラウザーではGoogle Drive設定同期を利用できません。'
        : 'Google Drive settings sync is unavailable in this browser.';
}

function cloudSettingsNotFoundStatus(language: InterfaceLanguage): string {
    return language === 'ja'
        ? 'Google Driveに保存されたYomu設定が見つかりません。'
        : 'No Yomu settings were found in Google Drive.';
}

function cloudSettingsSyncedStatus(syncedAt: string, language: InterfaceLanguage): string {
    const time = cloudSettingsSyncTime(syncedAt, language);
    return language === 'ja'
        ? `設定をGoogle Driveに同期しました（${time}）。`
        : `Settings synced to Google Drive (${time}).`;
}

function cloudSettingsRestoredStatus(syncedAt: string, language: InterfaceLanguage): string {
    const time = cloudSettingsSyncTime(syncedAt, language);
    return language === 'ja'
        ? `Google Drive設定を復元しました（${time}）。`
        : `Google Drive settings restored (${time}).`;
}

function cloudSettingsSyncTime(value: string, language: InterfaceLanguage): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(language === 'ja' ? 'ja-JP' : undefined);
}

function formatUiTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{([a-z]+)\}/gi, (_, key: string) => values[key] ?? '');
}

function importedYomitanSettings(json: unknown, current: ReaderSettings): ReaderSettings {
    const imported = parseYomitanSettingsExport(json, current.interfaceLanguage);
    return normalizeReaderSettings({
        ...current,
        ...imported.settings,
        shortcuts: {
            ...current.shortcuts,
            ...(imported.settings.shortcuts ?? {}),
        },
    });
}
