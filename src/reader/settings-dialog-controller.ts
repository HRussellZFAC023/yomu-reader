import { AudioPlayer } from './audio';
import { AnkiConnectClient, canUseMobileAnkiHandoff, needsHostedAnkiConnectSetupHint } from './anki';
import { copyText } from './browser-ui';
import { createAudioPreviewCard } from './card-utils';
import { NEW_TAB_PAGE_URL, SETTINGS_CHANGE_EVENT, SETTINGS_TITLE } from './constants';
import { readerWordSurfaceText, setInnerHtml } from './dom';
import { JpdbClient } from './jpdb';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import { clearNewTabOfflineCache } from './new-tab-cache';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary } from './recommended-dictionaries';
import { installSettingsDrawerHandle } from './popover-shell';
import { mergeDictionaryPreferences, normalizeReaderSettings, saveSettings } from './settings';
import { exportManagedStoredValues, importStoredValues } from './storage';
import {
    activateSettingsPanel,
    applySettingsSearch,
    ankiStatusLineForSettings,
    getFormInterfaceLanguage,
    formatSettingsStatusLine,
    installSourceRowDrag,
    installShortcutCapture,
    localizeSettingsForm,
    readFormSettings,
    renderAnkiFieldMappingEditor,
    renderAnkiLibraryOptions,
    renderAnkiTemplatePreview,
    renderDeckControls,
    renderDictionarySourceRows,
    renderRecommendedDictionaries,
    renderSettingsForm,
    jpdbStatusLineForSettings,
    syncAudioSourceRow,
    syncBrowserTtsVoiceOptions,
    syncDisabledSettingsControlDescriptions,
    syncFontFamilyControls,
    syncJpdbMiningDependentSettings,
    syncReviewSettingsVisibility,
    syncStickyBottomSheetAvailability,
    syncSubtitlePreview,
    updateAudioSourceEditor,
    updateDictionaryLookupLinkEditor,
    updateSourceRowEditor,
} from './settings-form';
import { dateStamp, downloadBlob, getReaderDictionaryExport, getReaderSettingsExport, pickFile, readerDictionaryExportHasData, recommendedDictionaryFilename } from './settings-file-io';
import type { AnkiFieldMappingRole, InterfaceLanguage, ReaderSettings } from './types';
import { uiText } from './i18n';
import { YomitanDictionaryStore, parseYomitanSettingsExport, type ImportSummary } from './yomitan';

interface Refreshable {
    refresh: () => void;
}

interface SettingsDialogDependencies {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    jpdb: JpdbClient;
    dictionaries: YomitanDictionaryStore;
    anki: AnkiConnectClient;
    audio: AudioPlayer;
    subtitles: Refreshable;
    ocr: Refreshable;
    youtube: Refreshable;
    createBackdrop: () => HTMLElement;
    mountDialog: (backdrop: HTMLElement, form: HTMLFormElement) => void;
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
}

type SettingsStatusSetter = (message: string) => void;
type DictionarySummary = Awaited<ReturnType<YomitanDictionaryStore['summary']>>;

interface DictionaryStatusElements {
    status: HTMLElement | null;
    priorities: HTMLElement | null;
    recommended: HTMLElement | null;
}

type RecommendedDictionary = (typeof RECOMMENDED_JAPANESE_DICTIONARIES)[number];
type RecommendedDictionaryInstallState = 'queued' | 'installing';
type ModalSiblingState = Array<{ element: HTMLElement; ariaHidden: string | null; inert: boolean }>;

interface RecommendedDictionaryOperationState {
    state: RecommendedDictionaryInstallState;
    message: string;
}

const log = Logger.scope('SettingsDialog');
const JPDB_SETTINGS_URL = 'https://jpdb.io/settings';
const SETTINGS_FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function settingsStatusSetter(status: HTMLElement | null): SettingsStatusSetter {
    return message => {
        if (status) status.textContent = message;
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

function selectedSettingsPanel(control: HTMLElement | null | undefined): string {
    return control?.dataset.panel ?? 'jpdb';
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
    const message = errorMessage(error, uiText(language, 'actionFailed'));
    setStatus(message);
    return message;
}

function shouldReenableSettingsAction(action: string): boolean {
    return action === 'download-recommended-dictionary' || action === 'delete-yomitan-dictionary';
}

function dictionaryStatusElements(form: HTMLFormElement): DictionaryStatusElements {
    return {
        status: form.querySelector<HTMLElement>('[data-dictionary-status]'),
        priorities: form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities'),
        recommended: form.querySelector<HTMLElement>('[data-recommended-dictionaries]'),
    };
}

function renderDictionaryStatusElements(elements: DictionaryStatusElements, summary: DictionarySummary, settings: ReaderSettings): void {
    if (elements.status) elements.status.textContent = dictionaryStatusText(summary, settings.interfaceLanguage);
    if (elements.priorities) setInnerHtml(elements.priorities, renderDictionarySourceRows(settings));
    if (elements.recommended) setInnerHtml(elements.recommended, renderRecommendedDictionaries(summary.dictionaries));
}

function dictionaryStatusText(summary: DictionarySummary, language: InterfaceLanguage): string {
    return summary.dictionaries.length
        ? formatUiTemplate(uiText(language, 'dictionaryStatusSummary'), {
            dictionaries: summary.dictionaries.length.toLocaleString(),
            terms: summary.terms.toLocaleString(),
            kanji: summary.kanji.toLocaleString(),
            metadata: summary.termMeta.toLocaleString(),
        })
        : uiText(language, 'noLocalDictionariesImported');
}

function setDictionaryStatusError(status: HTMLElement | null, error: unknown, language: InterfaceLanguage): void {
    if (status) status.textContent = errorMessage(error, uiText(language, 'dictionaryStatusUnavailable'));
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
}

export class SettingsDialogController {
    private dictionaryOperationQueue: Promise<void> = Promise.resolve();
    private pendingDictionaryOperations = 0;
    private recommendedDictionaryOperations = new Map<string, RecommendedDictionaryOperationState>();
    private currentForm?: HTMLFormElement;
    private previouslyFocusedElement?: HTMLElement;
    private modalSiblingState?: ModalSiblingState;
    private saveRequestId = 0;
    private ankiConnectionProbeId = 0;

    constructor(private readonly dependencies: SettingsDialogDependencies) {}

    open(panel?: string): void {
        log.info('Opening settings', { panel: panel ?? 'default' });
        this.previouslyFocusedElement = document.activeElement instanceof HTMLElement
            && !document.activeElement.closest('.jpdb-reader-settings')
            ? document.activeElement
            : undefined;
        const form = this.createSettingsForm(panel);
        const backdrop = this.dependencies.createBackdrop();
        this.bindFormSubmit(form);
        this.bindSettingsSearch(form);
        this.bindSettingsTabs(form);
        this.bindLivePreview(form);
        this.bindEditorControls(form);
        this.currentForm = form;
        this.dependencies.mountDialog(backdrop, form);
        this.hideBackgroundForModal(backdrop);
        installSettingsDrawerHandle(form, uiText(this.settings.interfaceLanguage, 'resizeSettings'));
        this.dependencies.beginSettingsPreview(this.settings.accentColor, this.settings.interfaceLanguage, this.settings.theme);
        this.syncRecommendedDictionaryInstallControls(form);
        this.syncDictionaryOperationState(form);
        this.syncJpdbStatus(form);
        void this.refreshAnkiConnectionStatus(form);
        void this.refreshDictionaryStatus(form);
        void this.refreshDeckControls(form);
        this.refreshSettingsJapaneseParse(form);
    }

    refreshLanguage(language = this.settings.interfaceLanguage): void {
        const form = this.currentForm;
        if (!form?.isConnected) return;
        localizeSettingsForm(form, language);
        this.syncRecommendedDictionaryInstallControls(form);
        this.syncDictionaryOperationState(form);
        this.syncJpdbStatus(form);
        void this.refreshAnkiConnectionStatus(form);
        syncSubtitlePreview(form);
        this.refreshSettingsJapaneseParse(form);
    }

    private get settings(): ReaderSettings {
        return this.dependencies.getSettings();
    }

    private set settings(settings: ReaderSettings) {
        this.dependencies.setSettings(settings);
    }

    private createSettingsForm(panel?: string): HTMLFormElement {
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.setAttribute('role', 'dialog');
        form.setAttribute('aria-modal', 'true');
        form.setAttribute('aria-label', SETTINGS_TITLE);
        form.tabIndex = -1;
        setInnerHtml(form, renderSettingsForm(this.settings, JPDB_SETTINGS_URL));
        localizeSettingsForm(form, this.settings.interfaceLanguage);
        if (panel) activateSettingsPanel(form, panel);
        return form;
    }

    private bindFormSubmit(form: HTMLFormElement): void {
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (this.pendingDictionaryOperations > 0) {
                this.showDictionarySaveBlocked(form);
                return;
            }
            const previousInitialOpen = this.settings.dictionarySourcesInitiallyExpanded;
            this.settings = readFormSettings(new FormData(form), this.settings);
            configureLogger({ forceEnabled: this.settings.enableLogging });
            if (this.settings.dictionarySourcesInitiallyExpanded !== previousInitialOpen) {
                this.dependencies.clearDictionarySourceOpenOverrides();
            }
            const saveRequestId = ++this.saveRequestId;
            void saveSettings(this.settings).then(() => this.afterSettingsSaved(form, saveRequestId))
                .catch(error => {
                    log.error('Settings save failed', error);
                    this.dependencies.toast(errorMessage(error, uiText(this.settings.interfaceLanguage, 'settingsSaveFailed')));
                });
        });
        form.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dismissSettings());
        form.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            this.dismissSettings();
        });
        form.addEventListener('keydown', event => {
            if (event.key !== 'Tab' || event.isComposing) return;
            this.trapFocus(form, event);
        });
    }

    private dismissSettings(): void {
        const restoreTarget = this.previouslyFocusedElement;
        this.previouslyFocusedElement = undefined;
        this.restoreBackgroundFromModal();
        this.dependencies.dismiss();
        if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
    }

    private hideBackgroundForModal(backdrop: HTMLElement): void {
        this.restoreBackgroundFromModal();
        const dialogRoot = backdrop.isConnected ? backdrop : this.currentForm;
        const directRoot = dialogRoot?.parentElement === document.body ? dialogRoot : this.currentForm?.parentElement;
        if (!directRoot) return;
        this.modalSiblingState = Array.from(document.body.children)
            .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== directRoot && !element.contains(this.currentForm ?? null))
            .map(element => {
                const state = {
                    element,
                    ariaHidden: element.getAttribute('aria-hidden'),
                    inert: element.inert,
                };
                element.setAttribute('aria-hidden', 'true');
                element.inert = true;
                return state;
            });
    }

    private restoreBackgroundFromModal(): void {
        this.modalSiblingState?.forEach(({ element, ariaHidden, inert }) => {
            if (ariaHidden === null) element.removeAttribute('aria-hidden');
            else element.setAttribute('aria-hidden', ariaHidden);
            element.inert = inert;
        });
        this.modalSiblingState = undefined;
    }

    private trapFocus(form: HTMLFormElement, event: KeyboardEvent): void {
        const focusable = Array.from(form.querySelectorAll<HTMLElement>(SETTINGS_FOCUSABLE_SELECTOR))
            .filter(element => !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) {
            event.preventDefault();
            form.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === form)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    private bindSettingsSearch(form: HTMLFormElement): void {
        const input = form.querySelector<HTMLInputElement>('[data-settings-search]');
        input?.addEventListener('input', () => {
            applySettingsSearch(form, input.value);
            this.refreshSettingsJapaneseParse(form);
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
            activateSettingsPanel(form, tabs[nextIndex]?.dataset.panel ?? 'jpdb');
            this.refreshSettingsJapaneseParse(form);
        });
    }

    private async afterSettingsSaved(form: HTMLFormElement, saveRequestId: number): Promise<void> {
        log.info('Settings saved', loggingSettingsSummary(this.settings));
        this.dependencies.jpdb.clear();
        this.dependencies.applyTheme();
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.ocr.refresh();
        this.dependencies.youtube.refresh();
        if (this.currentForm !== form || !form.isConnected || this.saveRequestId !== saveRequestId) return;
        this.dependencies.clearSettingsPreview();
        this.dismissSettings();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.refreshNewTabIfCurrent();
        this.dependencies.toast(uiText(this.settings.interfaceLanguage, 'settingsSaved'));
    }

    private bindLivePreview(form: HTMLFormElement): void {
        const applyThemePreview = () => this.dependencies.applyTheme(readFormSettings(new FormData(form), this.settings));
        form.querySelector<HTMLInputElement>('input[name="accentColor"]')?.addEventListener('input', event => {
            this.dependencies.applyAccentColor((event.currentTarget as HTMLInputElement).value);
        });
        form.querySelectorAll<HTMLInputElement>('input[name^="wordColor"], input[name^="pitchColor"]').forEach(input => {
            input.addEventListener('input', () => this.dependencies.applyWordColors(readFormSettings(new FormData(form), this.settings)));
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
            publishThemeSettingsChange(next, { preview: true });
        });
        window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
            if (this.currentForm !== form || !form.isConnected) return;
            const theme = themeFromSettingsChangeEvent(event);
            if (!theme) return;
            const input = form.querySelector<HTMLInputElement>('[data-theme-value]');
            if (!input || input.value === theme) return;
            input.value = theme;
            this.settings.theme = theme;
            applyThemePreview();
            this.syncThemeSwitch(form);
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
    }

    private bindEditorControls(form: HTMLFormElement): void {
        syncBrowserTtsVoiceOptions(form);
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
        const apiKeyInput = form.querySelector<HTMLInputElement>('input[name="apiKey"]');
        apiKeyInput?.addEventListener('input', () => this.syncJpdbStatus(form));
        apiKeyInput?.addEventListener('change', () => void this.refreshDeckControls(form));
        form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')?.addEventListener('change', () => void this.refreshAnkiConnectionStatus(form));
        form.querySelector<HTMLInputElement>('input[name="ankiMobileHandoff"]')?.addEventListener('change', () => void this.refreshAnkiConnectionStatus(form));
        form.querySelector<HTMLInputElement>('input[name="ankiConnectUrl"]')?.addEventListener('change', () => void this.refreshAnkiConnectionStatus(form));
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
            void this.handleSettingsAction(form, action, control);
        });
        form.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (this.handleSettingsPreviewLookup(event)) event.preventDefault();
        });
    }

    private handleSettingsPreviewLookup(event: Event): boolean {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const word = target?.closest<HTMLElement>('[data-settings-preview-lookup], .jpdb-reader-settings .jpdb-reader-word');
        if (!word || !this.dependencies.lookupText) return false;
        const expression = word.dataset.settingsPreviewLookup?.trim() || readerWordSurfaceText(word).trim() || word.textContent?.trim() || '';
        if (!expression) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.dependencies.lookupText(expression, word.dataset.sentence || expression, word);
        return true;
    }

    private handleSettingsFormChange(form: HTMLFormElement, event: Event): void {
        const sourceSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
        if (sourceSelect) {
            syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
            syncBrowserTtsVoiceOptions(form);
        }
        const templateControl = (event.target as HTMLElement).closest<HTMLElement>('select[name="ankiTemplateMode"], input[name="ankiFrontReading"], input[name="ankiFrontSentence"], input[name="ankiFrontImage"]');
        if (templateControl) {
            const preview = form.querySelector<HTMLElement>('[data-anki-template-preview]');
            if (preview) setInnerHtml(preview, renderAnkiTemplatePreview(readFormSettings(new FormData(form), this.settings)));
        }
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

    private isReaderDisplayControl(target: EventTarget | null): boolean {
        const name = (target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
        return ['furiganaMode', 'theme', 'readerFontFamily', 'readerFontFamilyCustom', 'popupFontFamily', 'popupFontFamilyCustom', 'popupFontWeight'].includes(name);
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
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.value.trim() ?? this.settings.apiKey.trim();
        if (!apiKey) {
            setInnerHtml(container, renderDeckControls(this.settings, [], false, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            this.refreshSettingsJapaneseParse(form);
            return;
        }

        const originalKey = this.settings.apiKey;
        this.settings.apiKey = apiKey;
        try {
            const decks = await this.dependencies.jpdb.listDecks();
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), decks, true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
        } catch (error) {
            log.warn('Deck controls failed to load', error);
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), [], true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
        } finally {
            this.settings.apiKey = originalKey;
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            this.refreshSettingsJapaneseParse(form);
        }
    }

    private syncJpdbStatus(form: HTMLFormElement): void {
        const status = form.querySelector<HTMLElement>('[data-jpdb-status]');
        if (!status) return;
        const line = jpdbStatusLineForSettings(
            readFormSettings(new FormData(form), this.settings),
            getFormInterfaceLanguage(form, this.settings.interfaceLanguage),
        );
        status.dataset.statusTone = line.tone;
        status.textContent = formatSettingsStatusLine(line, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
    }

    private async refreshAnkiConnectionStatus(form: HTMLFormElement): Promise<void> {
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const formSettings = readFormSettings(new FormData(form), this.settings);
        const initialLine = ankiStatusLineForSettings(formSettings, language);
        const requestId = ++this.ankiConnectionProbeId;
        this.setAnkiStatus(form, initialLine.message, initialLine.tone);
        if (!formSettings.ankiEnabled) return;

        const previous = this.settings;
        this.settings = formSettings;
        try {
            const connected = await this.dependencies.anki.isConnected();
            if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
            if (connected) {
                this.setAnkiStatus(form, uiText(language, 'ankiConnectionReady'), 'success');
            } else if (canUseMobileAnkiHandoff(formSettings)) {
                this.setAnkiStatus(form, uiText(language, 'mobileAnkiReady'), 'pending');
            } else {
                this.setAnkiStatus(form, this.ankiUnreachableMessage(language), 'error');
            }
        } catch (error) {
            if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
            this.setAnkiStatus(form, this.ankiConnectionErrorMessage(error, language), 'error');
        } finally {
            this.settings = previous;
        }
    }

    private shouldApplyAnkiConnectionProbe(form: HTMLFormElement, requestId: number): boolean {
        return this.currentForm === form && form.isConnected && requestId === this.ankiConnectionProbeId;
    }

    private setAnkiStatus(form: HTMLFormElement, message: string, tone: 'pending' | 'success' | 'error'): void {
        const status = form.querySelector<HTMLElement>('[data-anki-status]');
        if (!status) return;
        status.textContent = formatSettingsStatusLine({ message, tone }, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        status.dataset.statusTone = tone;
    }

    private async refreshDictionaryStatus(form: HTMLFormElement): Promise<void> {
        const elements = dictionaryStatusElements(form);
        try {
            const summary = await this.dependencies.dictionaries.summary();
            await this.applyDictionaryStatus(form, elements, summary);
        } catch (error) {
            log.warn('Dictionary status unavailable', error);
            setDictionaryStatusError(elements.status, error, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        }
    }

    private async applyDictionaryStatus(form: HTMLFormElement, elements: DictionaryStatusElements, summary: DictionarySummary): Promise<void> {
        await this.mergeDictionaryPreferencesFromSummary(summary);
        await this.dependencies.refreshDictionaryStyles();
        renderDictionaryStatusElements(elements, summary, this.settings);
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        this.syncRecommendedDictionaryInstallControls(form);
        this.syncDictionaryOperationState(form);
        this.refreshSettingsJapaneseParse(form);
    }

    private refreshSettingsJapaneseParse(form: HTMLFormElement): void {
        void this.dependencies.parseSettingsJapanese?.(form);
    }

    private async mergeDictionaryPreferencesFromSummary(summary: DictionarySummary): Promise<void> {
        const names = summary.dictionaries.map(item => item.title);
        const types = Object.fromEntries(summary.dictionaries.map(item => [item.title, item.type]));
        const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names, types);
        if (merged.length === this.settings.dictionaryPreferences.length) return;
        this.settings.dictionaryPreferences = merged;
        await saveSettings(this.settings);
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

    private async handleSettingsAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-import-status]');
        const setStatus = settingsStatusSetter(status);

        try {
            await this.runSettingsAction(form, action, control, setStatus);
        } catch (error) {
            const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
            const message = handleSettingsActionError(action, control, setStatus, error, language);
            this.dependencies.toast(message);
        }
    }

    private async runSettingsAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const handled = this.handleSettingsEditorAction(form, action, control)
            || await this.handleSettingsAudioAction(form, action, control)
            || await this.handleSettingsDictionaryAction(form, action, control, setStatus)
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
        return false;
    }

    private async handleSettingsAudioAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<boolean> {
        if (action !== 'preview-audio') return false;

        const button = settingsActionButton(control);
        const previous = this.settings;
        const previewSettings = readFormSettings(new FormData(form), this.settings);
        focusPreviewAudioSource(form, button, previewSettings);
        this.settings = { ...previewSettings, audioEnabled: true, audioViaBlob: true };
        button?.setAttribute('disabled', 'true');
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        try {
            this.dependencies.toast(uiText(language, 'playingAudioPreview'));
            await this.dependencies.audio.play(createAudioPreviewCard(), { userGesture: true });
            log.info('Audio settings preview started');
        } catch (error) {
            log.warn('Audio settings preview failed', error);
            this.dependencies.toast(errorMessage(error, uiText(language, 'audioPreviewFailed')));
        } finally {
            this.settings = previous;
            button?.removeAttribute('disabled');
        }
        return true;
    }

    private async handleSettingsDictionaryAction(form: HTMLFormElement, action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'delete-yomitan-dictionary') {
            await this.deleteDictionaryFromSettings(form, control, setStatus);
            return true;
        }
        if (action === 'import-yomitan-dictionary') {
            await this.importDictionaryFromSettings(form, setStatus);
            return true;
        }
        if (action === 'download-recommended-dictionary') {
            await this.downloadRecommendedDictionaryFromSettings(form, control, setStatus);
            return true;
        }
        if (action === 'export-yomitan-dictionary') {
            const blob = await this.dependencies.dictionaries.exportJson();
            downloadBlob(blob, `yomu-dictionaries-${dateStamp()}.json`);
            setStatus(uiText(getFormInterfaceLanguage(form, this.settings.interfaceLanguage), 'dictionariesExported'));
            log.info('Dictionaries exported');
            return true;
        }
        return false;
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
            log.info('Settings exported');
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
        if (action !== 'test-anki' && action !== 'prepare-anki' && action !== 'scan-anki') return false;
        const ankiStatus = form.querySelector<HTMLElement>('[data-anki-status]');
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const button = settingsActionButton(control);
        const setAnkiStatus = (message: string, tone: 'pending' | 'success' | 'error') => {
            if (!ankiStatus) return;
            ankiStatus.textContent = message;
            ankiStatus.dataset.statusTone = tone;
        };
        const previous = this.settings;
        this.settings = readFormSettings(new FormData(form), this.settings);
        button?.setAttribute('disabled', 'true');
        const pendingKey = action === 'scan-anki' ? 'ankiScanning' : action === 'prepare-anki' ? 'ankiPreparing' : 'ankiTesting';
        setAnkiStatus(uiText(language, pendingKey), 'pending');
        try {
            const connected = await this.dependencies.anki.isConnected();
            if (!connected) {
                if (canUseMobileAnkiHandoff(this.settings)) {
                    setAnkiStatus(uiText(language, 'mobileAnkiReady'), 'pending');
                    return true;
                }
                throw new Error(this.ankiUnreachableMessage(language));
            }
            if (action === 'scan-anki') {
                const scan = await this.dependencies.anki.scanLibrary();
                this.applyAnkiScanToForm(form, scan);
                setAnkiStatus(this.ankiScanMessage(scan, language), 'success');
                log.info('Anki library scan succeeded', { decks: scan.deckNames.length, models: scan.models.length, suggestedModel: scan.suggestedModel?.modelName });
                return true;
            }
            if (action === 'test-anki') {
                setAnkiStatus(uiText(language, 'ankiConnectionReady'), 'success');
                log.info('Anki settings connection test succeeded', { url: this.settings.ankiConnectUrl });
                return true;
            }
            await this.dependencies.anki.ensureDeckAndModel();
            setAnkiStatus(this.ankiReadyMessage(language), 'success');
            log.info('Anki settings prepare succeeded', { deck: this.settings.ankiDeck, model: this.settings.ankiModel });
        } catch (error) {
            const message = this.ankiConnectionErrorMessage(error, language);
            log.warn('Anki settings test failed', error);
            setAnkiStatus(message, 'error');
            this.dependencies.toast(message);
        } finally {
            this.settings = previous;
            button?.removeAttribute('disabled');
        }
        return true;
    }

    private applyAnkiScanToForm(form: HTMLFormElement, scan: Awaited<ReturnType<AnkiConnectClient['scanLibrary']>>): void {
        this.applyAnkiFieldMappingsToForm(form, scan);
        const modelInput = namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiModel');
        const deckInput = namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiDeck');
        const nextModel = scan.suggestedModel?.modelName || modelInput?.value.trim() || '';
        let nextDeck = deckInput?.value.trim() || '';
        if (deckInput && scan.deckNames.length) {
            const currentDeck = deckInput.value.trim();
            if (!scan.deckNames.includes(currentDeck)
                && (scan.deckNames.length === 1 || !currentDeck || currentDeck === 'よむ' || currentDeck === 'Yomu')) {
                nextDeck = scan.deckNames[0] ?? currentDeck;
            }
        }
        this.applyAnkiScanControlsToForm(form, scan, { selectedDeck: nextDeck, selectedModel: nextModel });
        if (modelInput && nextModel) {
            modelInput.value = nextModel;
            modelInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (deckInput && nextDeck) {
            deckInput.value = nextDeck;
            deckInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.renderAnkiFieldMappingEditor(form);
    }

    private applyAnkiFieldMappingsToForm(form: HTMLFormElement, scan: Awaited<ReturnType<AnkiConnectClient['scanLibrary']>>): void {
        const input = namedSettingsControl<HTMLInputElement>(form, 'ankiFieldMappings');
        if (!input) return;
        const existing = readFormSettings(new FormData(form), this.settings).ankiFieldMappings;
        const next = { ...existing };
        for (const model of scan.models) {
            const mapping = Object.fromEntries(model.suggestions.flatMap(suggestion => {
                const fieldName = suggestion.fieldName?.trim();
                return fieldName ? [[suggestion.role, fieldName] as const] : [];
            }));
            if (Object.keys(mapping).length) next[model.modelName] = mapping;
        }
        input.value = JSON.stringify(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    private applyAnkiScanControlsToForm(
        form: HTMLFormElement,
        scan: Awaited<ReturnType<AnkiConnectClient['scanLibrary']>>,
        selected: { selectedDeck?: string; selectedModel?: string } = {},
    ): void {
        const deckOptions = form.querySelector<HTMLElement>('[data-anki-deck-options]');
        const currentDeck = selected.selectedDeck ?? namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiDeck')?.value.trim() ?? '';
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        if (deckOptions) setInnerHtml(deckOptions, renderAnkiLibraryOptions([currentDeck, ...scan.deckNames].filter(Boolean), currentDeck, language));
        const modelOptions = form.querySelector<HTMLElement>('[data-anki-model-options]');
        if (modelOptions) {
            const currentModel = selected.selectedModel ?? namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiModel')?.value.trim() ?? '';
            setInnerHtml(modelOptions, renderAnkiLibraryOptions([currentModel, ...scan.models.map(model => model.modelName)].filter(Boolean), currentModel, language));
        }
        const fieldsInput = form.querySelector<HTMLInputElement>('[data-anki-scan-fields]');
        if (fieldsInput) {
            fieldsInput.value = JSON.stringify(Object.fromEntries(scan.models.map(model => [model.modelName, model.fields])));
        }
        this.renderAnkiFieldMappingEditor(form);
    }

    private renderAnkiFieldMappingEditor(form: HTMLFormElement): void {
        const container = form.querySelector<HTMLElement>('[data-anki-field-mapping-editor]');
        if (!container) return;
        const settings = readFormSettings(new FormData(form), this.settings);
        const modelName = namedSettingsControl<HTMLInputElement | HTMLSelectElement>(form, 'ankiModel')?.value.trim() || settings.ankiModel;
        setInnerHtml(container, renderAnkiFieldMappingEditor(settings, modelName, this.ankiScanFieldsForModel(form, modelName), getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
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
        input.dispatchEvent(new Event('input', { bubbles: true }));
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

    private ankiScanMessage(scan: Awaited<ReturnType<AnkiConnectClient['scanLibrary']>>, language: InterfaceLanguage): string {
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
        const message = uiText(language, 'ankiUnreachable');
        if (!needsHostedAnkiConnectSetupHint(this.settings.ankiConnectUrl)) return message;
        return `${message} ${uiText(language, 'ankiHostedCorsHint')}`;
    }

    private ankiConnectionErrorMessage(error: unknown, language: InterfaceLanguage): string {
        return error instanceof Error ? error.message : uiText(language, 'ankiUnreachable');
    }

    private async handleSettingsSupportAction(action: string, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<boolean> {
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

    private async deleteDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionary = control?.dataset.dictionaryName;
        if (!dictionary) throw new Error('Dictionary not found.');
        if (!window.confirm(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRemoveConfirm'), { dictionary }))) return;
        control?.setAttribute('disabled', 'true');
        setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRemoving'), { dictionary }));
        await this.dependencies.dictionaries.deleteDictionary(dictionary);
        await clearNewTabOfflineCache().catch(() => undefined);
        this.settings.dictionaryPreferences = this.settings.dictionaryPreferences.filter(item => item.name !== dictionary);
        await saveSettings(this.settings);
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        await this.refreshDictionaryStatus(form);
        this.dependencies.refreshNewTabIfCurrent();
        setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryRemoved'), { dictionary }));
        log.info('Dictionary removed', { dictionary });
    }

    private async importDictionaryFromSettings(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'dictionary');
        if (!file) return;
        await this.enqueueDictionaryOperation(form, async () => {
            const summary = await this.dependencies.dictionaries.importFile(file, message => setStatus(message));
            await this.persistDictionaryImport(summary);
            setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, 'dictionaryImportComplete'), {
                records: summary.entries.toLocaleString(),
                sources: summary.dictionaries.length.toLocaleString(),
                plural: summary.dictionaries.length === 1 ? '' : 's',
            }));
            log.info('Dictionary file imported', summary);
            await this.refreshDictionaryStatus(form);
            this.dependencies.refreshNewTabIfCurrent();
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
                log.info('Downloading selected dictionary', { dictionary: dictionary.name });
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
                log.info('Selected dictionary downloaded', { dictionary: dictionary.name, entries: summary.entries });
            } finally {
                this.clearRecommendedDictionaryInstallState(form, dictionary.id);
            }
        });
    }

    private async persistDictionaryImport(summary: ImportSummary): Promise<void> {
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries, summary.dictionaryTypes ?? {});
        this.settings.localDictionariesEnabled = true;
        await saveSettings(this.settings);
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
    }

    private async downloadRecommendedDictionary(
        dictionary: RecommendedDictionary,
        control: HTMLElement | null | undefined,
        setStatus: SettingsStatusSetter,
    ): Promise<ImportSummary | null> {
        try {
            return await this.dependencies.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => setStatus(message));
        } catch (error) {
            return this.handleRecommendedDictionaryDownloadError(dictionary, control, setStatus, error);
        }
    }

    private handleRecommendedDictionaryDownloadError(
        dictionary: RecommendedDictionary,
        control: HTMLElement | null | undefined,
        setStatus: SettingsStatusSetter,
        error: unknown,
    ): null {
        const message = errorMessage(error, uiText(this.settings.interfaceLanguage, 'dictionaryDownloadFailed'));
        control?.removeAttribute('disabled');
        if (!this.shouldPromptManualDictionaryDownload(error, dictionary.downloadUrl)) throw error;
        const status = `${message} ${uiText(this.settings.interfaceLanguage, 'dictionaryManualDownloadHint')}`;
        setStatus(status);
        this.dependencies.toast(status);
        log.warn('Dictionary auto-download unavailable', { dictionary: dictionary.name, message });
        return null;
    }

    private shouldPromptManualDictionaryDownload(error: unknown, downloadUrl: string): boolean {
        const message = String((error as Error | undefined)?.message ?? '').toLowerCase();
        const manualDownloadHints = [
            'blocked in this browser',
            'cross-site',
            'request bridge',
            'request bridge is unavailable',
            'userscript bridge',
            'needs the yomu userscript',
            'needs yomu userscript',
            'need the yomu userscript',
            'needs the userscript',
            'user script request',
            'userscript request',
            'ブロック',
            'リクエストブリッジ',
            'ユーザースクリプト',
        ];
        return Boolean(downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))
            && manualDownloadHints.some(hint => message.includes(hint));
    }

    private async importReaderSettingsFromFile(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'settings');
        if (!file) return;
        const json = JSON.parse(await file.text()) as unknown;
        const readerSettings = getReaderSettingsExport(json);
        this.settings = readerSettings
            ? normalizeReaderSettings({ ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } })
            : importedYomitanSettings(json, this.settings);
        const restoredValues = await importStoredValues(getReaderStorageExport(json));
        const dictionarySummary = await this.importReaderDictionaryBackup(json, setStatus);
        await this.mergeImportedDictionaryPreferences();
        await saveSettings(this.settings);
        setStatus(importSettingsStatus(restoredValues, dictionarySummary, this.settings.interfaceLanguage));
        this.dependencies.applyTheme();
        void this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.youtube.refresh();
        this.dependencies.clearSettingsPreview();
        log.info('Settings imported', loggingSettingsSummary(this.settings));
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
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames, importedTypes);
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

function publishThemeSettingsChange(theme: ReaderSettings['theme'], options: { preview?: boolean } = {}): void {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { preview: options.preview === true, settings: { theme } } }));
}

function themeFromSettingsChangeEvent(event: Event): ReaderSettings['theme'] | undefined {
    const theme = (event as CustomEvent<{ settings?: { theme?: unknown } }>).detail?.settings?.theme;
    return theme === 'auto' || theme === 'dark' || theme === 'light' ? theme : undefined;
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
