import { AudioPlayer } from './audio';
import { AnkiConnectClient } from './anki';
import { copyText } from './browser-ui';
import { createAudioPreviewCard } from './card-utils';
import { NEW_TAB_PAGE_URL, SETTINGS_TITLE, SUPPORT_LINKS } from './constants';
import { setInnerHtml } from './dom';
import { JpdbClient } from './jpdb';
import { Logger, loggingSettingsSummary } from './logger';
import { RECOMMENDED_JAPANESE_DICTIONARIES, STARTER_DICTIONARY_IDS, findRecommendedDictionary } from './recommended-dictionaries';
import { mergeDictionaryPreferences, saveSettings } from './settings';
import { exportStoredValues, importStoredValues } from './storage';
import {
    activateSettingsPanel,
    dateStamp,
    downloadBlob,
    getFormInterfaceLanguage,
    getReaderSettingsExport,
    installShortcutCapture,
    installSourceRowDrag,
    isRecommendedDictionaryInstalled,
    localizeSettingsForm,
    pickFile,
    readFormSettings,
    recommendedDictionaryFilename,
    renderAnkiTemplatePreview,
    renderDeckControls,
    renderDictionarySourceRows,
    renderRecommendedDictionaries,
    renderSettingsForm,
    syncAudioSourceRow,
    syncBrowserTtsVoiceOptions,
    syncReviewSettingsVisibility,
    syncSubtitlePreview,
    updateAudioSourceEditor,
    updateDictionaryLookupLinkEditor,
    updateSourceRowEditor,
} from './settings-form';
import type { InterfaceLanguage, ReaderSettings } from './types';
import { resolveUiLanguage, uiText } from './i18n';
import { YomitanDictionaryStore, parseYomitanSettingsExport } from './yomitan';

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
    jpdbExtensions: Refreshable;
    createBackdrop: () => HTMLElement;
    mountDialog: (backdrop: HTMLElement, form: HTMLFormElement) => void;
    dismiss: () => void;
    toast: (message: string) => void;
    applyTheme: () => void;
    applyAccentColor: (color: string) => void;
    applyWordColors: (settings?: ReaderSettings) => void;
    installFab: () => void;
    refreshDictionaryStyles: () => Promise<void>;
    scheduleDictionaryRescan: () => void;
    refreshNewTabIfCurrent: () => void;
    clearDictionarySourceOpenOverrides: () => void;
    beginSettingsPreview: (accent: string, language: InterfaceLanguage, theme: ReaderSettings['theme']) => void;
    clearSettingsPreview: () => void;
}

type SettingsStatusSetter = (message: string) => void;

const log = Logger.scope('SettingsDialog');
const JPDB_SETTINGS_URL = 'https://jpdb.io/settings';

export class SettingsDialogController {
    private starterDictionaryDownload?: Promise<boolean>;

    constructor(private readonly dependencies: SettingsDialogDependencies) {}

    open(panel?: string): void {
        log.info('Opening settings', { panel: panel ?? 'default' });
        const form = this.createSettingsForm(panel);
        const backdrop = this.dependencies.createBackdrop();
        this.bindFormSubmit(form);
        this.bindLivePreview(form);
        this.bindEditorControls(form);
        this.dependencies.mountDialog(backdrop, form);
        this.dependencies.beginSettingsPreview(this.settings.accentColor, this.settings.interfaceLanguage, this.settings.theme);
        void this.refreshDictionaryStatus(form);
        void this.refreshDeckControls(form);
    }

    async ensureStarterDictionaryInstalled(onProgress?: (message: string) => void, force = false): Promise<boolean> {
        if (this.starterDictionaryDownload) return this.starterDictionaryDownload;
        this.starterDictionaryDownload = this.downloadStarterDictionaries(onProgress, force)
            .finally(() => {
                this.starterDictionaryDownload = undefined;
            });
        return this.starterDictionaryDownload;
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
            const previousInitialOpen = this.settings.dictionarySourcesInitiallyExpanded;
            this.settings = readFormSettings(new FormData(form), this.settings);
            if (this.settings.dictionarySourcesInitiallyExpanded !== previousInitialOpen) {
                this.dependencies.clearDictionarySourceOpenOverrides();
            }
            void saveSettings(this.settings).then(() => this.afterSettingsSaved())
                .catch(error => {
                    log.error('Settings save failed', error);
                    this.dependencies.toast(error instanceof Error ? error.message : 'Settings save failed.');
                });
        });
        form.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dependencies.dismiss());
    }

    private async afterSettingsSaved(): Promise<void> {
        log.info('Settings saved', loggingSettingsSummary(this.settings));
        this.dependencies.jpdb.clear();
        this.dependencies.applyTheme();
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.ocr.refresh();
        this.dependencies.youtube.refresh();
        this.dependencies.jpdbExtensions.refresh();
        this.dependencies.clearSettingsPreview();
        this.dependencies.dismiss();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.refreshNewTabIfCurrent();
        this.dependencies.toast('Settings saved.');
    }

    private bindLivePreview(form: HTMLFormElement): void {
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
            this.dependencies.applyTheme();
            this.syncThemeSwitch(form);
        });
        syncSubtitlePreview(form);
        form.addEventListener('input', event => {
            if (this.isSubtitleControl(event.target)) syncSubtitlePreview(form);
        });
        form.addEventListener('change', event => {
            if (this.isSubtitleControl(event.target)) syncSubtitlePreview(form);
        });
        const syncImmersionTranslationReveal = () => {
            const translations = form.querySelector<HTMLInputElement>('input[name="immersionKitShowTranslation"]');
            const reveal = form.querySelector<HTMLInputElement>('input[name="immersionKitRevealTranslationOnClick"]');
            if (!translations || !reveal) return;
            reveal.disabled = !translations.checked;
            if (!translations.checked) reveal.checked = false;
        };
        form.querySelector<HTMLInputElement>('input[name="immersionKitShowTranslation"]')?.addEventListener('change', syncImmersionTranslationReveal);
        syncImmersionTranslationReveal();
        const syncJpdbRevealAudio = () => {
            const audioEnabled = form.querySelector<HTMLInputElement>('input[name="audioEnabled"]');
            const immersionEnabled = form.querySelector<HTMLInputElement>('input[name="immersionKitEnabled"]');
            const jpdbImmersionEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbImmersionKitEnabled"]');
            const immersionRevealAudio = form.querySelector<HTMLInputElement>('input[name="jpdbImmersionKitAutoPlayReviewAudio"]');
            const wordRevealAudio = form.querySelector<HTMLInputElement>('input[name="jpdbWordAudioAutoPlayReviewAudio"]');
            if (!immersionRevealAudio || !wordRevealAudio) return;

            const wordAvailable = audioEnabled?.checked ?? true;
            const immersionAvailable = (immersionEnabled?.checked ?? true) && (jpdbImmersionEnabled?.checked ?? true);
            if (!wordAvailable) wordRevealAudio.checked = false;
            wordRevealAudio.disabled = !wordAvailable;
            if (!immersionAvailable || wordRevealAudio.checked) immersionRevealAudio.checked = false;
            immersionRevealAudio.disabled = !immersionAvailable || wordRevealAudio.checked;
            if (immersionRevealAudio.checked) wordRevealAudio.checked = false;
        };
        [
            'audioEnabled',
            'immersionKitEnabled',
            'jpdbImmersionKitEnabled',
            'jpdbImmersionKitAutoPlayReviewAudio',
            'jpdbWordAudioAutoPlayReviewAudio',
        ].forEach(name => {
            form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.addEventListener('change', syncJpdbRevealAudio);
        });
        syncJpdbRevealAudio();
        form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (value !== 'auto' && value !== 'en' && value !== 'ja') return;
            this.settings.interfaceLanguage = value;
            localizeSettingsForm(form, value);
            syncSubtitlePreview(form);
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
        form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.addEventListener('change', () => void this.refreshDeckControls(form));
        form.addEventListener('change', event => this.handleSettingsFormChange(form, event));
        installShortcutCapture(form);
        installSourceRowDrag(form);
        form.addEventListener('click', event => {
            const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = control?.dataset.action;
            if (!action || action === 'cancel') return;
            event.preventDefault();
            event.stopPropagation();
            void this.handleSettingsAction(form, action, control);
        });
    }

    private handleSettingsFormChange(form: HTMLFormElement, event: Event): void {
        const sourceSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
        if (sourceSelect) {
            syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
            syncBrowserTtsVoiceOptions(form);
        }
        const templateSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name="ankiTemplateMode"]');
        if (!templateSelect) return;
        const preview = form.querySelector<HTMLElement>('[data-anki-template-preview]');
        if (preview) setInnerHtml(preview, renderAnkiTemplatePreview(readFormSettings(new FormData(form), this.settings)));
    }

    private syncThemeSwitch(form: HTMLFormElement): void {
        const input = form.querySelector<HTMLInputElement>('[data-theme-value]');
        const button = form.querySelector<HTMLButtonElement>('[data-theme-switch]');
        if (!button) return;
        const theme = this.effectiveTheme(input?.value as ReaderSettings['theme'] | undefined);
        const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        button.setAttribute('aria-checked', String(theme === 'light'));
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

    private async refreshDeckControls(form: HTMLFormElement): Promise<void> {
        const container = form.querySelector<HTMLElement>('[data-jpdb-decks]');
        if (!container) return;
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.value.trim() ?? this.settings.apiKey.trim();
        if (!apiKey) {
            log.debug('Deck controls rendered without API key');
            setInnerHtml(container, renderDeckControls(this.settings, [], false));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return;
        }

        const originalKey = this.settings.apiKey;
        this.settings.apiKey = apiKey;
        try {
            const decks = await this.dependencies.jpdb.listDecks();
            log.debug('Deck controls loaded', { decks: decks.length });
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), decks, true));
        } catch (error) {
            log.warn('Deck controls failed to load', error);
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), [], true));
        } finally {
            this.settings.apiKey = originalKey;
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        }
    }

    private async refreshDictionaryStatus(form: HTMLFormElement): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-dictionary-status]');
        const priorities = form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities');
        const recommended = form.querySelector<HTMLElement>('[data-recommended-dictionaries]');
        try {
            const summary = await this.dependencies.dictionaries.summary();
            log.debug('Dictionary status loaded', summary);
            const names = summary.dictionaries.map(item => item.title);
            const types = Object.fromEntries(summary.dictionaries.map(item => [item.title, item.type]));
            const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names, types);
            if (merged.length !== this.settings.dictionaryPreferences.length) {
                this.settings.dictionaryPreferences = merged;
                await saveSettings(this.settings);
            }
            await this.dependencies.refreshDictionaryStyles();
            if (status) {
                status.textContent = summary.dictionaries.length
                    ? `${summary.dictionaries.length} dictionaries, ${summary.terms.toLocaleString()} terms, ${summary.kanji.toLocaleString()} kanji, ${summary.termMeta.toLocaleString()} metadata rows.`
                    : 'No local dictionaries imported yet.';
            }
            if (priorities) setInnerHtml(priorities, renderDictionarySourceRows(this.settings));
            if (recommended) setInnerHtml(recommended, renderRecommendedDictionaries(summary.dictionaries));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        } catch (error) {
            log.warn('Dictionary status unavailable', error);
            if (status) status.textContent = error instanceof Error ? error.message : 'Dictionary status unavailable.';
        }
    }

    private async downloadStarterDictionaries(onProgress?: (message: string) => void, force = false): Promise<boolean> {
        const summary = await this.dependencies.dictionaries.summary();
        const missing = RECOMMENDED_JAPANESE_DICTIONARIES
            .filter(dictionary => STARTER_DICTIONARY_IDS.includes(dictionary.id))
            .filter(dictionary => !isRecommendedDictionaryInstalled(dictionary, summary.dictionaries));
        if (!missing.length || (!force && summary.terms > 0)) return false;

        let importedEntries = 0;
        for (const [index, dictionary] of missing.entries()) {
            onProgress?.(`Downloading ${dictionary.name} (${index + 1}/${missing.length})...`);
            log.info('Downloading starter dictionary', { dictionary: dictionary.name, index: index + 1, total: missing.length });
            const imported = await this.dependencies.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => onProgress?.(message));
            importedEntries += imported.entries;
            this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, imported.dictionaries, imported.dictionaryTypes ?? {});
            this.settings.localDictionariesEnabled = true;
            await saveSettings(this.settings);
            await this.dependencies.refreshDictionaryStyles();
            this.dependencies.scheduleDictionaryRescan();
        }
        onProgress?.(`Dictionary ready: ${importedEntries.toLocaleString()} records imported.`);
        log.info('Starter dictionaries downloaded', { dictionaries: missing.length, importedEntries });
        return true;
    }

    private async handleSettingsAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-import-status]');
        const setStatus: SettingsStatusSetter = message => {
            if (status) status.textContent = message;
        };

        try {
            if (this.handleSettingsEditorAction(form, action, control)) return;
            if (await this.handleSettingsAudioAction(form, action, control)) return;
            if (await this.handleSettingsDictionaryAction(form, action, control, setStatus)) return;
            if (await this.handleSettingsImportExportAction(form, action, setStatus)) return;
            if (await this.handleSettingsConnectionAction(form, action, control)) return;
            await this.handleSettingsSupportAction(action, setStatus);
        } catch (error) {
            log.warn('Settings action failed', { action }, error);
            if (action === 'download-recommended-dictionary' || action === 'delete-yomitan-dictionary') control?.removeAttribute('disabled');
            setStatus(error instanceof Error ? error.message : 'Import failed.');
        }
    }

    private handleSettingsEditorAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): boolean {
        if (action === 'settings-panel') {
            log.debug('Settings panel selected', { panel: control?.dataset.panel ?? 'basics' });
            activateSettingsPanel(form, control?.dataset.panel ?? 'basics');
            return true;
        }
        if (action === 'dictionary-source-up' || action === 'dictionary-source-down') {
            log.debug('Dictionary source order changed', { action });
            updateSourceRowEditor(form, action, control);
            return true;
        }
        if (action === 'audio-source-add' || action === 'audio-source-remove' || action === 'audio-source-up' || action === 'audio-source-down') {
            log.debug('Audio source editor changed', { action });
            updateAudioSourceEditor(form, action, control);
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            syncBrowserTtsVoiceOptions(form);
            return true;
        }
        if (action === 'lookup-link-add' || action === 'lookup-link-remove' || action === 'lookup-link-up' || action === 'lookup-link-down') {
            log.debug('Lookup link editor changed', { action });
            updateDictionaryLookupLinkEditor(form, action, control);
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return true;
        }
        return false;
    }

    private async handleSettingsAudioAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<boolean> {
        if (action !== 'preview-audio') return false;

        const button = control instanceof HTMLButtonElement ? control : control?.closest<HTMLButtonElement>('button');
        const previous = this.settings;
        const previewSettings = readFormSettings(new FormData(form), this.settings);
        const row = button?.closest<HTMLElement>('[data-audio-source-row]');
        if (row) {
            const rowIndex = Array.from(form.querySelectorAll('[data-audio-source-row]')).indexOf(row);
            const source = previewSettings.audioSources[rowIndex];
            if (source) {
                previewSettings.audioSources = [{ ...source, enabled: true }];
                previewSettings.audioEnableDefaultSources = false;
            }
        }
        this.settings = { ...previewSettings, audioEnabled: true, audioViaBlob: true };
        button?.setAttribute('disabled', 'true');
        try {
            this.dependencies.toast('Playing よむ...');
            await this.dependencies.audio.play(createAudioPreviewCard());
            log.info('Audio settings preview started');
        } catch (error) {
            log.warn('Audio settings preview failed', error);
            this.dependencies.toast(error instanceof Error ? error.message : 'Audio preview failed.');
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
            setStatus('Dictionaries exported.');
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
            downloadBlob(new Blob([JSON.stringify({
                formatName: 'yomu-reader-settings',
                formatVersion: 2,
                exportedAt: new Date().toISOString(),
                settings: this.settings,
                storage: await exportStoredValues([
                    'yomu-mining-context:',
                    'yomu-jpdb-review-examples-open',
                    'yomu-jpdb-source-open:',
                    'yomu-jpdb-uchisen-star:',
                    'yomu-jpdb-uchisen-index:',
                    'jpdb-reader-newtab-ui',
                    'jpdb-reader-transcript-panel-size',
                ]),
            }, null, 2)], { type: 'application/json' }), `yomu-settings-${dateStamp()}.json`);
            setStatus('Settings exported.');
            log.info('Settings exported');
            return true;
        }
        return false;
    }

    private async handleSettingsConnectionAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<boolean> {
        if (action !== 'test-anki') return false;
        const ankiStatus = form.querySelector<HTMLElement>('[data-anki-status]');
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const button = control instanceof HTMLButtonElement ? control : control?.closest<HTMLButtonElement>('button');
        const setAnkiStatus = (message: string, tone: 'pending' | 'success' | 'error') => {
            if (!ankiStatus) return;
            ankiStatus.textContent = message;
            ankiStatus.dataset.statusTone = tone;
        };
        const previous = this.settings;
        this.settings = readFormSettings(new FormData(form), this.settings);
        button?.setAttribute('disabled', 'true');
        setAnkiStatus(uiText(language, 'ankiTesting'), 'pending');
        try {
            const connected = await this.dependencies.anki.isConnected();
            if (!connected) throw new Error(uiText(language, 'ankiUnreachable'));
            await this.dependencies.anki.ensureDeckAndModel();
            const readyMessage = resolveUiLanguage(language) === 'ja'
                ? `接続できました。デッキ「${this.settings.ankiDeck}」とノートタイプ「${this.settings.ankiModel}」を準備しました。`
                : `Connected. Deck "${this.settings.ankiDeck}" and note type "${this.settings.ankiModel}" are ready.`;
            setAnkiStatus(readyMessage, 'success');
            log.info('Anki settings test succeeded', { deck: this.settings.ankiDeck, model: this.settings.ankiModel });
        } catch (error) {
            const message = error instanceof Error ? error.message : uiText(language, 'ankiUnreachable');
            log.warn('Anki settings test failed', error);
            setAnkiStatus(message, 'error');
            this.dependencies.toast(message);
        } finally {
            this.settings = previous;
            button?.removeAttribute('disabled');
        }
        return true;
    }

    private async handleSettingsSupportAction(action: string, setStatus: SettingsStatusSetter): Promise<boolean> {
        if (action === 'copy-discord') {
            await copyText(SUPPORT_LINKS.discordUsername);
            log.debug('Support Discord username copied');
            this.dependencies.toast(`Copied Discord username: ${SUPPORT_LINKS.discordUsername}`);
            return true;
        }
        if (action === 'copy-newtab-url') {
            await copyText(NEW_TAB_PAGE_URL);
            log.debug('New tab URL copied');
            this.dependencies.toast('New tab address copied.');
            return true;
        }
        setStatus('');
        return false;
    }

    private async deleteDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionary = control?.dataset.dictionaryName;
        if (!dictionary) throw new Error('Dictionary not found.');
        if (!window.confirm(`Remove "${dictionary}" and all of its imported entries?`)) return;
        control?.setAttribute('disabled', 'true');
        setStatus(`Removing ${dictionary}...`);
        await this.dependencies.dictionaries.deleteDictionary(dictionary);
        this.settings.dictionaryPreferences = this.settings.dictionaryPreferences.filter(item => item.name !== dictionary);
        await saveSettings(this.settings);
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        await this.refreshDictionaryStatus(form);
        setStatus(`Removed ${dictionary}.`);
        log.info('Dictionary removed', { dictionary });
    }

    private async importDictionaryFromSettings(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'dictionary');
        if (!file) return;
        const summary = await this.dependencies.dictionaries.importFile(file, message => setStatus(message));
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries, summary.dictionaryTypes ?? {});
        await saveSettings(this.settings);
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        setStatus(`Imported ${summary.entries.toLocaleString()} records from ${summary.dictionaries.length} dictionary source${summary.dictionaries.length === 1 ? '' : 's'}.`);
        log.info('Dictionary file imported', summary);
        await this.refreshDictionaryStatus(form);
    }

    private async downloadRecommendedDictionaryFromSettings(form: HTMLFormElement, control: HTMLElement | null | undefined, setStatus: SettingsStatusSetter): Promise<void> {
        const dictionaryId = control?.dataset.dictionaryId;
        const dictionary = dictionaryId ? findRecommendedDictionary(dictionaryId) : undefined;
        if (!dictionary) throw new Error('Recommended dictionary not found.');
        control?.setAttribute('disabled', 'true');
        setStatus(`${control?.dataset.installed === 'true' ? 'Updating' : 'Downloading'} ${dictionary.name}...`);
        log.info('Downloading selected dictionary', { dictionary: dictionary.name });
        const summary = await this.dependencies.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => setStatus(message));
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries, summary.dictionaryTypes ?? {});
        await saveSettings(this.settings);
        await this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        setStatus(`${dictionary.name}: ${summary.entries.toLocaleString()} records imported.`);
        await this.refreshDictionaryStatus(form);
        log.info('Selected dictionary downloaded', { dictionary: dictionary.name, entries: summary.entries });
    }

    private async importReaderSettingsFromFile(form: HTMLFormElement, setStatus: SettingsStatusSetter): Promise<void> {
        const file = await pickFile(form, 'settings');
        if (!file) return;
        const json = JSON.parse(await file.text()) as unknown;
        const readerSettings = getReaderSettingsExport(json);
        this.settings = readerSettings
            ? { ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } }
            : importedYomitanSettings(json, this.settings);
        const restoredValues = await importStoredValues(getReaderStorageExport(json));
        await this.mergeImportedDictionaryPreferences();
        await saveSettings(this.settings);
        setStatus(restoredValues ? `Settings imported. Restored ${restoredValues} stored choices.` : 'Settings imported.');
        this.dependencies.applyTheme();
        void this.dependencies.refreshDictionaryStyles();
        this.dependencies.scheduleDictionaryRescan();
        this.dependencies.installFab();
        this.dependencies.subtitles.refresh();
        this.dependencies.youtube.refresh();
        this.dependencies.jpdbExtensions.refresh();
        this.dependencies.clearSettingsPreview();
        log.info('Settings imported', loggingSettingsSummary(this.settings));
        this.open();
    }

    private async mergeImportedDictionaryPreferences(): Promise<void> {
        const importedSummary = await this.dependencies.dictionaries.summary().catch(() => ({ dictionaries: [] }));
        const importedNames = importedSummary.dictionaries.map(item => item.title);
        const importedTypes = Object.fromEntries(importedSummary.dictionaries.map(item => [item.title, item.type]));
        this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames, importedTypes);
    }
}

function getReaderStorageExport(value: unknown): unknown {
    if (!value || typeof value !== 'object') return null;
    const record = value as { formatName?: string; storage?: unknown };
    return (record.formatName === 'yomu-reader-settings' || record.formatName === 'jpdb-popup-reader-settings')
        ? record.storage
        : null;
}

function importedYomitanSettings(json: unknown, current: ReaderSettings): ReaderSettings {
    const imported = parseYomitanSettingsExport(json);
    return {
        ...current,
        ...imported.settings,
        shortcuts: {
            ...current.shortcuts,
            ...(imported.settings.shortcuts ?? {}),
        },
    };
}
