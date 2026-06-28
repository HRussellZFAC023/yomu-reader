import '../../reader/styles/base.css';
import '../../reader/styles/settings.css';
import './styles.css';
import type { InterfaceLanguage, ReaderSettings } from '../../reader/app/types';
import { escapeHtml } from '../../reader/dom/index';
import { DEFAULT_SETTINGS, formatShortcutEvent, normalizeReaderSettings } from '../../reader/settings';
import {
    activateSettingsPanel,
    applySettingsSearch,
    getFormInterfaceLanguage,
    installShortcutCapture,
    localizeSettingsForm,
    readFormSettings,
    renderSettingsForm,
    syncAudioSourceRow,
    syncBrowserTtsVoiceOptions,
    syncDisabledSettingsControlDescriptions,
    updateAudioSourceEditor,
    updateDictionaryLookupLinkEditor,
} from '../../reader/settings/form';
import {
    gamingLookupCandidates,
    normalizeGamingOcrResponse,
    yomuStudySearchUrl,
    type GamingOcrResult,
} from '../shared';
import type { YomuGamingBridge, YomuGamingCaptureMode, YomuGamingCaptureSource, YomuGamingEnvironment, YomuGamingSelectionRect } from '../ipc';

declare global {
    interface Window {
        yomuGaming?: YomuGamingBridge;
    }
}

interface SettingsShellState {
    environment: YomuGamingEnvironment | null;
    settings: ReaderSettings;
    status: string;
    statusTone: 'idle' | 'busy' | 'success' | 'warning' | 'error';
}

interface OverlayResult {
    text: string;
    terms: string[];
    lines?: OverlayLineResult[];
    error?: string;
}

interface OverlayLineResult {
    text: string;
    terms: string[];
    box: YomuGamingSelectionRect;
    vertical: boolean;
}

const DEFAULT_OCR_ENDPOINT = 'http://127.0.0.1:7331/ocr';
const GAMING_SETTINGS_STORAGE_KEY = 'yomu-gaming-reader-settings-v1';
const GAMING_SETTINGS_SNAPSHOT_STORAGE_KEY = 'yomu-gaming-settings-snapshot-v1';
const GAMING_FIRST_RUN_SEEN_STORAGE_KEY = 'yomu-gaming-first-run-seen-v1';
const PREVIOUS_OCR_ENDPOINT_STORAGE_KEY = 'yomu-gaming-ocr-endpoint';
const PREVIOUS_OCR_ENGINE_STORAGE_KEY = 'yomu-gaming-ocr-engine';
const DEFAULT_SETTINGS_PANEL = 'media';
const UNSUPPORTED_SETTINGS_ACTIONS = new Set([
    'factory-reset',
    'import-yomitan-settings',
    'export-reader-settings',
    'import-yomitan-dictionary',
    'export-yomitan-dictionary',
    'download-recommended-dictionary',
    'prepare-anki',
    'test-anki',
    'preview-audio',
]);
const EDITOR_ACTIONS = new Set([
    'audio-source-add',
    'audio-source-remove',
    'audio-source-up',
    'audio-source-down',
    'lookup-link-add',
    'lookup-link-remove',
    'lookup-link-up',
    'lookup-link-down',
]);

const bridge = window.yomuGaming ?? browserFallbackBridge();
const appRoot = requireAppRoot();
const overlayCaptureMode = currentOverlayCaptureMode();
const isOverlay = location.hash.startsWith('#overlay');
let persistTimer: number | undefined;
let captureShortcutPersistToken = 0;

const shellState: SettingsShellState = {
    environment: null,
    settings: loadGamingSettings(),
    status: 'Use the shortcut in-game, or tap Capture area from here.',
    statusTone: 'idle',
};

queueMicrotask(() => void boot());

async function boot(): Promise<void> {
    appRoot.dataset.yomuGamingReady = 'true';
    if (isOverlay) {
        document.documentElement.classList.add('yomu-gaming-overlay-document');
        document.body.classList.add('yomu-gaming-overlay-document');
        new OverlaySelectionController(appRoot, bridge, overlayCaptureMode).render();
        return;
    }
    applyDocumentTheme(shellState.settings);
    renderSettingsShell();
    shellState.environment = await bridge.getEnvironment();
    updateHotkeyCopy();
    updateCaptureOnboardingStatus();
}

function renderSettingsShell(): void {
    applyDocumentTheme(shellState.settings);
    appRoot.innerHTML = `
        <main class="yomu-gaming-shell" data-yomu-gaming-ready="true">
            <form class="jpdb-reader-settings yomu-gaming-settings" data-jpdb-reader-root data-yomu-gaming-settings lang="${escapeHtml(languageAttribute(shellState.settings.interfaceLanguage))}">
                ${renderSettingsForm(shellState.settings, 'https://jpdb.io/settings', 'https://jiten.moe/settings')}
            </form>
        </main>
    `;
    const form = appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]');
    if (!form) return;
    localizeSettingsForm(form, shellState.settings.interfaceLanguage);
    applyGamingSettingsCopy(form);
    installGamingOnboarding(form);
    installGamingCaptureShortcutSection(form);
    installNativeSettingsSyncSection(form);
    activateSettingsPanel(form, DEFAULT_SETTINGS_PANEL);
    scrollToInitialSettingsSection(form);
    installShortcutCapture(form);
    syncGamingPageScanControls(form);
    installGamingCaptureAction(form);
    syncOcrProviderFields(form);
    hideUnsupportedSettingsActions(form);
    bindCaptureShortcutInputs(form);
    bindSettingsForm(form);
    setShellStatus(shellState.status, shellState.statusTone);
}

function installGamingOnboarding(form: HTMLFormElement): void {
    if (form.querySelector('[data-gaming-onboarding]')) return;
    const head = form.querySelector<HTMLElement>('.jpdb-reader-settings-head');
    if (!head) return;
    const section = document.createElement('section');
    section.className = 'yomu-gaming-onboarding';
    section.dataset.gamingOnboarding = 'true';
    section.dataset.yomuGamingFirstRun = 'true';
    if (hasSeenGamingFirstRun()) section.dataset.firstRunDismissed = 'true';
    section.innerHTML = `
        <div class="yomu-gaming-first-run-copy">
            <p class="yomu-gaming-kicker">Japanese anywhere on your PC</p>
            <h1>Read games with Yomu.</h1>
            <p>Press the shortcut for an instant screen read, or drag over Japanese game text and choose a lookup.</p>
        </div>
        <div class="yomu-gaming-first-run-controls">
            <label>
                <span>Capture shortcut</span>
                <input data-capture-shortcut-input value="${escapeHtml(hotkeyLabel())}" aria-label="Capture shortcut" autocomplete="off" inputmode="none" spellcheck="false">
            </label>
            <fieldset class="yomu-gaming-page-scan-setup" data-gaming-page-scan-setup>
                <legend>Page scanning</legend>
                <div class="yomu-gaming-segmented" role="radiogroup" aria-label="Page scan mode">
                    ${gamingPageScanModeOption('off', 'Off')}
                    ${gamingPageScanModeOption('auto', 'Auto')}
                    ${gamingPageScanModeOption('manual', 'Manual')}
                </div>
                <label data-gaming-manual-scan-shortcut ${gamingPageScanModeValue(shellState.settings) === 'manual' ? '' : 'hidden'}>
                    <span>Manual scan shortcut</span>
                    <input name="shortcuts.scanPage" data-shortcut-input value="${escapeHtml(shellState.settings.shortcuts.scanPage)}" placeholder="Press keys" aria-label="Manual scan shortcut" autocomplete="off" inputmode="none" spellcheck="false">
                </label>
                <label>
                    <span>Hover/capture hold key</span>
                    <input name="shortcuts.hoverLookup" data-shortcut-input value="${escapeHtml(shellState.settings.shortcuts.hoverLookup)}" placeholder="Blank means hover without a key" aria-label="Hover or capture hold key" autocomplete="off" inputmode="none" spellcheck="false">
                </label>
            </fieldset>
        </div>
        <div class="yomu-gaming-first-run-features" aria-label="Yomu reading surfaces">
            <div data-yomu-gaming-feature="Text"><strong>Text</strong><span>Hover or tap scanned Japanese.</span></div>
            <div data-yomu-gaming-feature="Images"><strong>Images</strong><span>Read image text through OCR.</span></div>
            <div data-yomu-gaming-feature="Video"><strong>Video</strong><span>Make subtitle words tappable.</span></div>
            <div data-yomu-gaming-feature="Control"><strong>Control</strong><span>Tune features, shortcuts, and color.</span></div>
            <div data-yomu-gaming-feature="Study"><strong>Study</strong><span>Review words and kanji in Yomu.</span></div>
            <div data-yomu-gaming-feature="Game"><strong>Game</strong><span>Capture screen text from PC games.</span></div>
        </div>
        <div class="yomu-gaming-onboarding-summary">
            <div><strong>Shortcut</strong><span data-gaming-onboarding-status>${escapeHtml(gamingOnboardingStatusText())}</span></div>
            <div><strong>Image OCR</strong><span data-gaming-ocr-mode>${escapeHtml(gamingOcrModeText())}</span></div>
            <div><strong>Page text</strong><span data-gaming-page-scan-mode>${escapeHtml(gamingPageScanModeText())}</span></div>
        </div>
        <div class="yomu-gaming-first-run-actions">
            <button class="jpdb-reader-btn add" type="button" data-action="test-capture-overlay">Test capture</button>
            <button class="jpdb-reader-btn" type="button" data-action="start-overlay">Capture area</button>
            <button class="jpdb-reader-btn" type="button" data-action="dismiss-gaming-first-run">Looks good</button>
        </div>
    `;
    head.insertAdjacentElement('afterend', section);
    section.addEventListener('change', event => {
        const target = event.target as HTMLElement;
        if (!target.closest('[name="gamingPageScanMode"]')) return;
        const mode = pageScanModeValue((target as HTMLInputElement).value);
        syncSharedPageScanModeFromGamingOnboarding(form, mode);
        syncGamingPageScanControls(section, mode);
        persistSettingsFromForm(form);
    });
    section.addEventListener('input', event => {
        const target = event.target as HTMLInputElement;
        if (target.name !== 'shortcuts.scanPage' && target.name !== 'shortcuts.hoverLookup') return;
        syncShortcutFromGamingOnboarding(form, target.name, target.value);
        persistSettingsFromForm(form);
    });
}

function gamingPageScanModeOption(value: 'off' | 'auto' | 'manual', label: string): string {
    const checked = gamingPageScanModeValue(shellState.settings) === value ? ' checked' : '';
    return `<label><input type="radio" name="gamingPageScanMode" value="${value}"${checked}><span>${label}</span></label>`;
}

function installGamingCaptureShortcutSection(form: HTMLFormElement): void {
    const panel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-shortcuts');
    if (!panel || panel.querySelector('[data-native-capture-shortcut]')) return;
    const section = document.createElement('div');
    section.className = 'jpdb-reader-settings-subsection yomu-gaming-native-shortcut';
    section.dataset.nativeCaptureShortcut = 'true';
    section.innerHTML = `
        <div class="jpdb-reader-local-title">Game capture</div>
        <label>
            <span class="jpdb-reader-settings-label-text">Capture shortcut</span>
            <input data-capture-shortcut-input value="${escapeHtml(hotkeyLabel())}" aria-label="Capture shortcut" autocomplete="off" inputmode="none" spellcheck="false">
        </label>
        <div class="jpdb-reader-help" data-capture-shortcut-help>${escapeHtml(captureShortcutHelpText())}</div>
    `;
    const grid = panel.querySelector<HTMLElement>('.grid');
    panel.insertBefore(section, grid ?? panel.firstChild);
}

function installGamingCaptureAction(form: HTMLFormElement): void {
    if (form.querySelector('.yomu-gaming-capture-button')) return;
    const footer = form.querySelector<HTMLElement>('.footer');
    if (!footer) return;
    const button = document.createElement('button');
    button.className = 'jpdb-reader-btn add yomu-gaming-capture-button';
    button.type = 'button';
    button.dataset.action = 'area-capture';
    button.setAttribute('aria-label', 'Capture a game screen area');
    button.innerHTML = '<span>Capture area</span>';
    footer.insertBefore(button, footer.querySelector('[data-action="cancel"]'));
}

function installNativeSettingsSyncSection(form: HTMLFormElement): void {
    const panel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-dictionaries');
    if (!panel || panel.querySelector('[data-native-settings-sync]')) return;
    const section = document.createElement('div');
    section.className = 'jpdb-reader-settings-subsection';
    section.dataset.nativeSettingsSync = 'true';
    section.innerHTML = `
        <div class="jpdb-reader-local-title">Native settings snapshot</div>
        <div class="jpdb-reader-help">Stores one Yomu settings snapshot in this app profile. Dictionaries stay local.</div>
        <div class="jpdb-reader-settings-actions jpdb-reader-settings-actions-single">
            <button class="jpdb-reader-btn" type="button" data-action="sync-cloud-settings">Save snapshot</button>
            <button class="jpdb-reader-btn" type="button" data-action="restore-cloud-settings">Restore snapshot</button>
        </div>
    `;
    const actions = panel.querySelector<HTMLElement>('.jpdb-reader-settings-actions');
    panel.insertBefore(section, actions);
}

function bindSettingsForm(form: HTMLFormElement): void {
    form.addEventListener('submit', event => {
        event.preventDefault();
        persistSettingsFromForm(form);
        setShellStatus('Settings saved. The overlay will use these values on the next capture.', 'success');
    });
    form.querySelector<HTMLInputElement>('[data-settings-search]')?.addEventListener('input', event => {
        applySettingsSearch(form, (event.target as HTMLInputElement).value);
    });
    form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs')?.addEventListener('keydown', event => {
        if (!(event.target instanceof HTMLButtonElement) || event.target.dataset.action !== 'settings-panel') return;
        const tabs = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]'));
        const currentIndex = tabs.indexOf(event.target);
        const nextIndex = nextSettingsTabIndex(event.key, currentIndex, tabs.length);
        if (nextIndex < 0) return;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        nextTab?.focus();
        activateSettingsPanel(form, nextTab?.dataset.panel ?? DEFAULT_SETTINGS_PANEL);
    });
    form.addEventListener('click', event => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
        if (anchor) {
            event.preventDefault();
            void bridge.openExternal(anchor.href).catch(() => {
                setShellStatus('That link is not available from the native shell yet.', 'warning');
            });
            return;
        }
        const themeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-switch]');
        if (themeButton) {
            event.preventDefault();
            toggleSettingsTheme(form);
            persistSettingsFromForm(form);
            return;
        }
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
        const action = button?.dataset.action;
        if (!action) return;
        if (action === 'settings-panel') {
            event.preventDefault();
            activateSettingsPanel(form, button.dataset.panel ?? DEFAULT_SETTINGS_PANEL);
            return;
        }
        if (action === 'cancel') {
            event.preventDefault();
            void bridge.hideApp();
            return;
        }
        if (action === 'copy-newtab-url') {
            event.preventDefault();
            void navigator.clipboard?.writeText('https://yomureader.com/newtab/index.html').then(() => {
                setShellStatus('Study address copied.', 'success');
            }).catch(() => {
                setShellStatus('Could not copy from this shell.', 'warning');
            });
            return;
        }
        if (action === 'instant-capture' || action === 'test-capture-overlay') {
            event.preventDefault();
            event.stopPropagation();
            startCaptureOverlay(form, 'instant');
            return;
        }
        if (action === 'area-capture' || action === 'start-overlay') {
            event.preventDefault();
            event.stopPropagation();
            startCaptureOverlay(form, 'area');
            return;
        }
        if (action === 'dismiss-gaming-first-run') {
            event.preventDefault();
            markGamingFirstRunSeen(form);
            setShellStatus('First-run tips hidden. Use Capture area or the shortcut whenever you need them.', 'success');
            return;
        }
        if (action === 'sync-cloud-settings' || action === 'restore-cloud-settings') {
            event.preventDefault();
            void handleNativeSettingsSyncAction(form, action, button);
            return;
        }
        if (EDITOR_ACTIONS.has(action)) {
            event.preventDefault();
            updateSettingsEditor(form, action, button);
            persistSettingsFromForm(form);
        }
    });
    form.addEventListener('change', event => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-capture-shortcut-input]')) return;
        const sourceSelect = target.closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
        if (sourceSelect) {
            syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
            syncBrowserTtsVoiceOptions(form);
        }
        if (target.closest('[name="ocrProvider"]')) syncOcrProviderFields(form);
        if (target.closest('[name="gamingPageScanMode"]')) syncSharedPageScanModeFromGamingOnboarding(form);
        if (target.closest('[name="interfaceLanguage"]')) localizeAfterLanguageChange(form);
        if (target.closest('[name="theme"], [data-theme-value]')) applyDocumentTheme(readFormSettings(new FormData(form), shellState.settings));
        persistSettingsFromForm(form);
    });
    form.addEventListener('input', event => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (target.matches('[data-settings-search]')) return;
        if (target.matches('[data-capture-shortcut-input]')) return;
        if (target.matches('[data-ocr-endpoint-input]')) {
            syncFirstRunOcrEndpoint(form, target.value);
            return;
        }
        scheduleSettingsPersist(form);
    });
}

function bindCaptureShortcutInputs(form: HTMLFormElement): void {
    form.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(input => {
        input.addEventListener('keydown', event => {
            if (event.key === 'Tab') return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Backspace' || event.key === 'Delete') {
                syncCaptureShortcutInputValues(form, '');
                setShellStatus('Press a new capture shortcut.', 'warning');
                return;
            }
            const shortcut = formatShortcutEvent(event);
            if (!shortcut || isModifierOnlyShortcut(shortcut)) return;
            syncCaptureShortcutInputValues(form, shortcut);
            void persistCaptureShortcutFromInput(form, shortcut);
        });
        input.addEventListener('change', () => void persistCaptureShortcutFromInput(form, input.value));
        input.addEventListener('blur', () => {
            if (input.value.trim() && input.value.trim() !== hotkeyLabel()) {
                void persistCaptureShortcutFromInput(form, input.value);
            } else {
                syncCaptureShortcutInputValues(form, hotkeyLabel());
            }
        });
        input.addEventListener('paste', event => {
            event.preventDefault();
            const shortcut = event.clipboardData?.getData('text/plain') ?? '';
            syncCaptureShortcutInputValues(form, shortcut);
            void persistCaptureShortcutFromInput(form, shortcut);
        });
    });
}

async function persistCaptureShortcutFromInput(form: HTMLFormElement, shortcut: string): Promise<void> {
    const token = ++captureShortcutPersistToken;
    setCaptureShortcutControlsDisabled(form, true);
    setShellStatus(`Saving ${shortcut.trim() || 'capture shortcut'}.`, 'busy');
    try {
        const environment = await bridge.updateCaptureShortcut(shortcut);
        if (token !== captureShortcutPersistToken) return;
        shellState.environment = environment;
        syncCaptureShortcutInputValues(form, hotkeyLabel());
        updateHotkeyCopy();
        updateCaptureOnboardingStatus();
        setShellStatus(`Capture shortcut saved: ${hotkeyLabel()}.`, 'success');
    } catch (error) {
        if (token !== captureShortcutPersistToken) return;
        syncCaptureShortcutInputValues(form, hotkeyLabel());
        setShellStatus(error instanceof Error ? error.message : 'Could not update capture shortcut.', 'error');
    } finally {
        if (token === captureShortcutPersistToken) setCaptureShortcutControlsDisabled(form, false);
    }
}

function setCaptureShortcutControlsDisabled(form: HTMLFormElement, disabled: boolean): void {
    form.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(input => {
        input.disabled = disabled;
    });
}

function syncCaptureShortcutInputValues(form: HTMLElement, value: string): void {
    form.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(input => {
        input.value = value;
    });
}

function isModifierOnlyShortcut(shortcut: string): boolean {
    return shortcut.split('+').every(part => ['Alt', 'Ctrl', 'Meta', 'Shift'].includes(part));
}

function startCaptureOverlay(form: HTMLFormElement, mode: YomuGamingCaptureMode): void {
    persistSettingsFromForm(form);
    setShellStatus(mode === 'instant' ? 'Capturing screen.' : 'Opening area capture.', 'busy');
    void bridge.hideApp().then(() => bridge.showOverlay(mode));
}

function updateSettingsEditor(form: HTMLFormElement, action: string, control: HTMLElement | null): void {
    if (action.startsWith('audio-source-')) {
        updateAudioSourceEditor(form, action, control);
        hideUnsupportedSettingsActions(form);
        return;
    }
    if (action.startsWith('lookup-link-')) {
        updateDictionaryLookupLinkEditor(form, action, control);
        hideUnsupportedSettingsActions(form);
    }
}

function hideUnsupportedSettingsActions(form: HTMLFormElement): void {
    UNSUPPORTED_SETTINGS_ACTIONS.forEach(action => {
        form.querySelectorAll<HTMLElement>(`[data-action="${action}"]`).forEach(element => {
            element.hidden = true;
            element.setAttribute('aria-hidden', 'true');
        });
    });
}

function persistSettingsFromForm(form: HTMLFormElement): void {
    shellState.settings = readFormSettings(new FormData(form), shellState.settings);
    persistGamingSettings(shellState.settings);
    applyDocumentTheme(shellState.settings);
    syncDisabledSettingsControlDescriptions(form, shellState.settings.interfaceLanguage);
    syncGamingPageScanControls(form);
    updateHotkeyCopy();
}

function syncSharedPageScanModeFromGamingOnboarding(form: HTMLFormElement, selectedMode?: 'off' | 'auto' | 'manual'): void {
    const mode = selectedMode ?? gamingPageScanModeFromForm(form);
    applyGamingPageScanModeToForm(form, mode);
    syncGamingPageScanControls(form, mode);
}

function syncGamingPageScanControls(root: ParentNode, mode = gamingPageScanModeValue(shellState.settings)): void {
    root.querySelectorAll<HTMLInputElement>('input[name="gamingPageScanMode"]').forEach(input => {
        input.checked = input.value === mode;
    });
    root.querySelectorAll<HTMLElement>('[data-gaming-manual-scan-shortcut]').forEach(node => {
        node.hidden = mode !== 'manual';
    });
}

function gamingPageScanModeFromForm(form: HTMLFormElement): 'off' | 'auto' | 'manual' {
    const selected = form.querySelector<HTMLInputElement>('input[name="gamingPageScanMode"]:checked')?.value;
    return pageScanModeValue(selected) ?? gamingPageScanModeValue(shellState.settings);
}

function pageScanModeValue(value: unknown): 'off' | 'auto' | 'manual' | undefined {
    return value === 'off' || value === 'auto' || value === 'manual' ? value : undefined;
}

function applyGamingPageScanModeToForm(form: HTMLFormElement, mode: 'off' | 'auto' | 'manual'): void {
    shellState.settings.annotationsPaused = mode === 'off';
    shellState.settings.manualScanEnabled = mode === 'manual';
    const pageScanMode = form.querySelector<HTMLSelectElement>('select[name="pageScanMode"]');
    if (pageScanMode) pageScanMode.value = mode;
    form.querySelectorAll<HTMLInputElement>('input[name="pageScanMode"]').forEach(input => {
        input.checked = input.value === mode;
    });
    const manualScan = form.querySelector<HTMLInputElement>('input[name="manualScanEnabled"]');
    if (manualScan) manualScan.checked = mode === 'manual';
}

function syncShortcutFromGamingOnboarding(form: HTMLFormElement, name: 'shortcuts.scanPage' | 'shortcuts.hoverLookup', value: string): void {
    form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach(input => {
        if (input.value !== value) input.value = value;
    });
}

function syncFirstRunOcrEndpoint(form: HTMLFormElement, value: string): void {
    const endpointInput = form.querySelector<HTMLInputElement>('input[name="ocrEndpointUrl"]');
    if (endpointInput) endpointInput.value = value;
    shellState.settings = {
        ...shellState.settings,
        ocrEndpointUrl: value,
    };
    persistGamingSettings(shellState.settings);
    scheduleSettingsPersist(form);
}

function markGamingFirstRunSeen(form: HTMLFormElement): void {
    localStorage.setItem(GAMING_FIRST_RUN_SEEN_STORAGE_KEY, 'true');
    form.querySelector<HTMLElement>('[data-yomu-gaming-first-run]')?.setAttribute('data-first-run-dismissed', 'true');
}

function hasSeenGamingFirstRun(): boolean {
    return localStorage.getItem(GAMING_FIRST_RUN_SEEN_STORAGE_KEY) === 'true';
}

async function handleNativeSettingsSyncAction(form: HTMLFormElement, action: 'sync-cloud-settings' | 'restore-cloud-settings', button: HTMLButtonElement | null): Promise<void> {
    button?.setAttribute('disabled', 'true');
    try {
        if (action === 'sync-cloud-settings') {
            persistSettingsFromForm(form);
            const metadata = await bridge.syncSettingsSnapshot(shellState.settings);
            setShellStatus(`Settings snapshot saved (${formatSnapshotTime(metadata.syncedAt)}).`, 'success');
            return;
        }
        const snapshot = await bridge.restoreSettingsSnapshot();
        if (!snapshot) {
            setShellStatus('No native settings snapshot has been saved yet.', 'warning');
            return;
        }
        shellState.settings = normalizeReaderSettings({
            ...shellState.settings,
            ...snapshotSettingsObject(snapshot.settings),
        });
        persistGamingSettings(shellState.settings);
        setShellStatus(`Settings snapshot restored (${formatSnapshotTime(snapshot.syncedAt)}).`, 'success');
        renderSettingsShell();
    } catch (error) {
        setShellStatus(error instanceof Error ? error.message : 'Settings snapshot failed.', 'error');
    } finally {
        if (button?.isConnected) button.removeAttribute('disabled');
    }
}

function scheduleSettingsPersist(form: HTMLFormElement): void {
    if (persistTimer !== undefined) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
        persistSettingsFromForm(form);
        persistTimer = undefined;
    }, 180);
}

function syncOcrProviderFields(form: HTMLFormElement): void {
    const provider = form.querySelector<HTMLSelectElement>('[name="ocrProvider"]')?.value ?? shellState.settings.ocrProvider;
    form.querySelectorAll<HTMLElement>('[data-local-ocr]').forEach(element => {
        element.hidden = provider !== 'local-service';
    });
    form.querySelectorAll<HTMLElement>('[data-cloud-ocr]').forEach(element => {
        element.hidden = provider !== 'cloud-vision';
    });
}

function localizeAfterLanguageChange(form: HTMLFormElement): void {
    const language = getFormInterfaceLanguage(form, shellState.settings.interfaceLanguage);
    form.lang = languageAttribute(language);
    localizeSettingsForm(form, language);
    applyGamingSettingsCopy(form);
    hideUnsupportedSettingsActions(form);
    syncOcrProviderFields(form);
    syncGamingPageScanControls(form);
}

function applyGamingSettingsCopy(form: HTMLFormElement): void {
    form.querySelector<HTMLElement>('[data-popup-lookup-title]')?.replaceChildren('Game use');
    form.querySelector<HTMLElement>('[data-hover-lookup-title]')?.replaceChildren('Capture shortcut');
    replaceControlLabel(form, 'scanModifierKey', 'Scan modifier');
    replaceControlLabel(form, 'shortcuts.scanPage', 'Manual page scan shortcut');
    replaceControlLabel(form, 'shortcuts.scanImages', 'Read browser images now');
    replaceControlLabel(form, 'shortcuts.hoverLookup', 'Capture shortcut hold key');
    const readerHelp = form.querySelector<HTMLElement>('#settings-help-reader');
    if (readerHelp) {
        readerHelp.textContent = 'Use Yomu in games without changing browser-reader habits.';
    }
    const ocrHelp = form.querySelector<HTMLElement>('#settings-help-ocr');
    if (ocrHelp) {
        ocrHelp.textContent = 'Game capture currently sends the selected crop to a local OCR server. Browser OCR choices still apply to the userscript surfaces.';
    }
    const localHelp = form.querySelector<HTMLElement>('[data-local-ocr][data-help-key="ocrLocalHelp"]');
    if (localHelp) {
        localHelp.textContent = 'Run MangaOCR, PaddleOCR, Apple Vision, or a compatible local HTTP OCR service, then paste its /ocr URL here.';
    }
}

function replaceControlLabel(form: HTMLFormElement, name: string, label: string): void {
    form.querySelector<HTMLElement>(`[name="${name}"]`)
        ?.closest('label')
        ?.querySelector<HTMLElement>('.jpdb-reader-settings-label-text')
        ?.replaceChildren(label);
}

function toggleSettingsTheme(form: HTMLFormElement): void {
    const input = form.querySelector<HTMLInputElement>('[data-theme-value]');
    if (!input) return;
    input.value = input.value === 'dark' ? 'light' : 'dark';
    applyDocumentTheme(readFormSettings(new FormData(form), shellState.settings));
    const button = form.querySelector<HTMLButtonElement>('[data-theme-switch]');
    if (button) {
        const dark = input.value === 'dark';
        button.setAttribute('aria-checked', String(dark));
        button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
        button.setAttribute('aria-label', button.title);
    }
}

function nextSettingsTabIndex(key: string, currentIndex: number, length: number): number {
    if (currentIndex < 0 || length < 1) return -1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length;
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    return -1;
}

function setShellStatus(status: string, tone: SettingsShellState['statusTone'] = 'idle'): void {
    shellState.status = status;
    shellState.statusTone = tone;
    const element = appRoot.querySelector<HTMLElement>('[data-settings-save-status]');
    if (!element) return;
    element.textContent = status;
    element.dataset.statusTone = tone;
    element.hidden = false;
}

function updateHotkeyCopy(): void {
    appRoot.querySelectorAll<HTMLElement>('[data-hotkey]').forEach(element => {
        element.textContent = hotkeyLabel();
    });
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-onboarding-status]').forEach(element => {
        element.textContent = gamingOnboardingStatusText();
    });
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-ocr-mode]').forEach(element => {
        element.textContent = gamingOcrModeText();
    });
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-page-scan-mode]').forEach(element => {
        element.textContent = gamingPageScanModeText();
    });
    appRoot.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(element => {
        element.value = hotkeyLabel();
    });
    appRoot.querySelectorAll<HTMLElement>('[data-capture-shortcut-help]').forEach(element => {
        element.textContent = captureShortcutHelpText();
    });
    appRoot.querySelectorAll<HTMLInputElement>('[data-ocr-endpoint-input]').forEach(element => {
        if (element.value !== shellState.settings.ocrEndpointUrl) element.value = shellState.settings.ocrEndpointUrl;
    });
}

function updateCaptureOnboardingStatus(): void {
    const label = hotkeyLabel();
    if (shellState.environment?.hotkeyError) {
        setShellStatus(shellState.environment.hotkeyError, 'error');
        return;
    }
    if (shellState.environment?.hotkeyRegistered) {
        setShellStatus(`Ready. Press ${label} for instant capture, or use Capture area.`, 'idle');
        return;
    }
    setShellStatus(`Capture area is ready. ${label} was not registered in this session.`, 'warning');
}

function hotkeyLabel(): string {
    const hotkey = shellState.environment?.hotkey || 'Ctrl+Shift+Y';
    return hotkey
        .replace('CommandOrControl', shellState.environment?.platform === 'darwin' ? 'Cmd' : 'Ctrl')
        .replace(/\bControl\b/g, 'Ctrl')
        .replace(/\bCommand\b/g, 'Cmd')
        .replace(/\bOption\b/g, 'Alt')
        .replace(/\bSuper\b/g, 'Meta');
}

function gamingOnboardingStatusText(): string {
    const label = hotkeyLabel();
    if (shellState.environment?.hotkeyError) return shellState.environment.hotkeyError;
    return shellState.environment?.hotkeyRegistered
        ? `${label}: read screen.`
        : `${label} is unavailable here; Test capture still works.`;
}

function captureShortcutHelpText(): string {
    return shellState.environment?.hotkeyError
        ? shellState.environment.hotkeyError
        : 'Focus the field and press the keys to use for instant game capture.';
}

function gamingOcrModeText(): string {
    if (!shellState.settings.ocrEnabled) return 'Image OCR off. Capture on demand.';
    return shellState.settings.ocrAutoScanImages
        ? 'Auto for images. Capture on demand.'
        : 'Tap or hover. Capture on demand.';
}

function gamingPageScanModeText(): string {
    if (shellState.settings.annotationsPaused) return 'Page text scanning off.';
    return shellState.settings.manualScanEnabled
        ? `Manual page scan: ${shellState.settings.shortcuts.scanPage || 'no shortcut set'}.`
        : 'Auto page text scanning.';
}

function gamingPageScanModeValue(settings: ReaderSettings): 'off' | 'auto' | 'manual' {
    if (settings.annotationsPaused) return 'off';
    return settings.manualScanEnabled ? 'manual' : 'auto';
}

function currentOverlayCaptureMode(): YomuGamingCaptureMode {
    if (new URLSearchParams(location.search).get('captureMode') === 'area') return 'area';
    return location.hash === '#overlay-area' ? 'area' : 'instant';
}

function scrollToInitialSettingsSection(form: HTMLFormElement): void {
    window.requestAnimationFrame(() => {
        form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-ocr')?.scrollIntoView({ block: 'start' });
    });
}

function loadGamingSettings(): ReaderSettings {
    const stored = parseStoredSettings();
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        ...stored,
        theme: stored?.theme ?? 'light',
        ocrEnabled: stored?.ocrEnabled ?? true,
        ocrProvider: stored?.ocrProvider ?? 'local-service',
        ocrEndpointUrl: stored?.ocrEndpointUrl
            || localStorage.getItem(PREVIOUS_OCR_ENDPOINT_STORAGE_KEY)
            || DEFAULT_OCR_ENDPOINT,
        ocrEngine: stored?.ocrEngine
            || localStorage.getItem(PREVIOUS_OCR_ENGINE_STORAGE_KEY)
            || DEFAULT_SETTINGS.ocrEngine,
        ocrLanguage: stored?.ocrLanguage ?? DEFAULT_SETTINGS.ocrLanguage,
    });
}

function parseStoredSettings(): Partial<ReaderSettings> | null {
    const raw = localStorage.getItem(GAMING_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Partial<ReaderSettings> : null;
    } catch {
        return null;
    }
}

function persistGamingSettings(settings: ReaderSettings): void {
    localStorage.setItem(GAMING_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, settings.ocrEndpointUrl);
    localStorage.setItem(PREVIOUS_OCR_ENGINE_STORAGE_KEY, settings.ocrEngine);
}

function snapshotSettingsObject(value: unknown): Partial<ReaderSettings> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<ReaderSettings> : {};
}

function formatSnapshotTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function languageAttribute(language: InterfaceLanguage): string {
    return language === 'ja' ? 'ja' : 'en';
}

function applyDocumentTheme(settings: ReaderSettings): void {
    const dark = settings.theme === 'dark';
    document.documentElement.classList.toggle('jpdb-reader-theme-dark', dark);
    document.documentElement.classList.toggle('jpdb-reader-theme-light', !dark);
    document.body.classList.toggle('jpdb-reader-theme-dark', dark);
    document.body.classList.toggle('jpdb-reader-theme-light', !dark);
}

class OverlaySelectionController {
    private start: { x: number; y: number } | null = null;
    private selection: YomuGamingSelectionRect | null = null;
    private busy = false;
    private result: OverlayResult | null = null;
    private settings = loadGamingSettings();
    private instantStarted = false;

    constructor(private root: HTMLElement, private gamingBridge: YomuGamingBridge, private captureMode: YomuGamingCaptureMode) {
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') void this.gamingBridge.hideOverlay();
        });
    }

    render(): void {
        const mode = this.overlayMode();
        this.root.innerHTML = `
            <main class="overlay-shell" data-yomu-gaming-ready="true" data-yomu-gaming-overlay-ready="true" data-overlay-mode="${mode}" data-capture-mode="${this.captureMode}" data-overlay-busy="${this.busy}">
                ${this.busy ? overlayStatusHtml(this.overlayInstruction()) : ''}
                ${this.selection && !this.result ? overlaySelectionHtml(this.selection) : ''}
                ${this.result ? overlayResultHtml(this.result, this.selection) : ''}
            </main>
        `;
        this.bind();
        if (this.captureMode === 'instant' && !this.instantStarted) {
            this.instantStarted = true;
            void this.readFullScreen();
        }
    }

    private bind(): void {
        const shell = this.root.querySelector<HTMLElement>('.overlay-shell');
        shell?.addEventListener('pointerdown', event => {
            if (this.captureMode !== 'area') return;
            if ((event.target as HTMLElement).closest('button, a, .overlay-status, .overlay-result, .overlay-inline-layer')) return;
            this.start = { x: event.clientX, y: event.clientY };
            this.selection = null;
            this.result = null;
            shell.setPointerCapture(event.pointerId);
        });
        shell?.addEventListener('pointermove', event => {
            if (this.captureMode !== 'area') return;
            if (!this.start) return;
            this.selection = normalizedViewportSelection(this.start, { x: event.clientX, y: event.clientY });
            this.render();
        });
        shell?.addEventListener('pointerup', event => {
            if (this.captureMode !== 'area') return;
            if (!this.start) return;
            this.selection = normalizedViewportSelection(this.start, { x: event.clientX, y: event.clientY });
            this.start = null;
            void this.readSelection();
        });
        this.root.querySelectorAll<HTMLButtonElement>('[data-action="overlay-done"]').forEach(button => button.addEventListener('click', () => {
            void this.gamingBridge.hideOverlay();
        }));
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-settings"]')?.addEventListener('click', () => {
            void this.gamingBridge.showApp().then(() => this.gamingBridge.hideOverlay());
        });
        this.root.querySelectorAll<HTMLButtonElement>('[data-action="open-yomu"]').forEach(button => {
            button.addEventListener('click', () => {
                const term = button.dataset.term ?? '';
                if (!term) return;
                void this.gamingBridge.openExternal(yomuStudySearchUrl(term)).finally(() => this.gamingBridge.hideOverlay());
            });
        });
    }

    private overlayInstruction(): string {
        if (this.busy) return 'Reading';
        if (this.result?.error) return 'Needs settings';
        if (this.result) return 'Lookup ready';
        return this.captureMode === 'instant' ? 'Reading screen' : 'Drag to read';
    }

    private overlayMode(): 'idle' | 'selecting' | 'busy' | 'result' | 'error' {
        if (this.busy) return 'busy';
        if (this.result?.error) return 'error';
        if (this.result) return 'result';
        if (this.selection) return 'selecting';
        return 'idle';
    }

    private async readSelection(): Promise<void> {
        if (!this.selection || this.selection.width < 8 || this.selection.height < 8) {
            this.selection = null;
            this.result = null;
            this.render();
            return;
        }
        await this.readCapture(this.selection);
    }

    private async readFullScreen(): Promise<void> {
        await this.readCapture(null);
    }

    private async readCapture(selection: YomuGamingSelectionRect | null): Promise<void> {
        this.settings = loadGamingSettings();
        const setupError = gamingOcrSetupError(this.settings);
        if (setupError) {
            this.result = { text: '', terms: [], error: setupError };
            this.render();
            return;
        }
        this.busy = true;
        this.result = null;
        this.render();
        try {
            const capture = await this.gamingBridge.capturePrimaryScreen();
            const crop = await cropSelection(capture, selection ? scaleViewportSelection(selection, capture.size) : null);
            const response = await this.gamingBridge.requestOcr({
                endpointUrl: this.settings.ocrEndpointUrl,
                imageDataUrl: crop.dataUrl,
                width: crop.width,
                height: crop.height,
                engine: this.settings.ocrEngine,
                language: this.settings.ocrLanguage,
            });
            if (!response.ok) {
                this.result = {
                    text: '',
                    terms: [],
                    error: response.error ?? 'OCR failed. Check the local OCR server in Settings.',
                };
                return;
            }
            const result = normalizeGamingOcrResponse(response.body, crop.width, crop.height);
            this.result = overlayResultFromOcr(result, selection);
        } catch (error) {
            this.result = {
                text: '',
                terms: [],
                error: error instanceof Error ? error.message : 'Capture failed.',
            };
        } finally {
            this.busy = false;
            this.render();
        }
    }
}

function gamingOcrSetupError(settings: ReaderSettings): string {
    if (settings.ocrProvider !== 'local-service') return 'Game overlay currently needs Local OCR server in Settings.';
    if (!settings.ocrEndpointUrl.trim()) return 'Add a local OCR server URL in Settings.';
    return '';
}

function overlayResultFromOcr(result: GamingOcrResult | null, viewportSelection: YomuGamingSelectionRect | null): OverlayResult {
    const text = result?.lines.map(line => line.text).join('\n') ?? '';
    const terms = gamingLookupCandidates(text);
    const target = viewportSelection ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const lines = hasOcrGeometry(result)
        ? result.lines.filter(line => line.hasGeometry).map(line => ({
            text: line.text,
            terms: gamingLookupCandidates(line.text),
            box: ocrBoxToViewport(line.box, result, target),
            vertical: line.vertical,
        })).filter(line => line.terms.length > 0)
        : [];
    return terms.length
        ? { text, terms, lines: lines.length ? lines : undefined }
        : { text, terms: [], error: text ? 'No Japanese lookup candidates found.' : 'No Japanese text found.' };
}

function hasOcrGeometry(result: GamingOcrResult | null): result is GamingOcrResult {
    if (!result?.lines.length) return false;
    return result.lines.some(line => line.hasGeometry);
}

function ocrBoxToViewport(box: YomuGamingSelectionRect, result: GamingOcrResult, target: YomuGamingSelectionRect): YomuGamingSelectionRect {
    const scaleX = target.width / Math.max(1, result.width);
    const scaleY = target.height / Math.max(1, result.height);
    return clampViewportBox({
        left: target.left + box.left * scaleX,
        top: target.top + box.top * scaleY,
        width: box.width * scaleX,
        height: box.height * scaleY,
    });
}

function clampViewportBox(box: YomuGamingSelectionRect): YomuGamingSelectionRect {
    const left = Math.max(6, Math.min(window.innerWidth - 28, box.left));
    const top = Math.max(6, Math.min(window.innerHeight - 28, box.top));
    const width = Math.max(36, Math.min(window.innerWidth - left - 6, box.width));
    const height = Math.max(24, Math.min(window.innerHeight - top - 6, box.height));
    return { left, top, width, height };
}

async function cropSelection(capture: YomuGamingCaptureSource, selection: YomuGamingSelectionRect | null): Promise<{ dataUrl: string; width: number; height: number }> {
    const image = await loadImage(capture.thumbnailDataUrl);
    const sourceRect = selection && selection.width > 2 && selection.height > 2
        ? selection
        : { left: 0, top: 0, width: image.naturalWidth, height: image.naturalHeight };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceRect.width));
    canvas.height = Math.max(1, Math.round(sourceRect.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, sourceRect.left, sourceRect.top, sourceRect.width, sourceRect.height, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

function overlaySelectionHtml(selection: YomuGamingSelectionRect): string {
    const style = [
        `left:${selection.left}px`,
        `top:${selection.top}px`,
        `width:${selection.width}px`,
        `height:${selection.height}px`,
    ].join(';');
    return `<div class="overlay-selection" style="${style}"></div>`;
}

function overlayStatusHtml(label: string): string {
    return `<div class="overlay-status" role="status" aria-live="polite"><strong>よむ</strong><span>${escapeHtml(label)}</span></div>`;
}

function overlayResultHtml(result: OverlayResult, selection: YomuGamingSelectionRect | null): string {
    if (result.lines?.length) return overlayInlineResultHtml(result);
    const style = overlayResultStyle(selection);
    if (result.error) {
        return `<section class="overlay-result" style="${style}" role="status">
            <strong>${escapeHtml(result.error)}</strong>
            ${result.text ? `<p lang="ja">${escapeHtml(result.text)}</p>` : ''}
            <div class="overlay-actions">
                <button type="button" data-action="overlay-settings">Settings</button>
                <button type="button" data-action="overlay-done">Close</button>
            </div>
        </section>`;
    }
    const [primary, ...rest] = result.terms;
    return `<section class="overlay-result overlay-result-compact" style="${style}" role="status" aria-label="Recognized text">
        ${result.text && result.text !== primary ? `<div class="overlay-caption" lang="ja">${escapeHtml(result.text)}</div>` : ''}
        <div class="overlay-term-pills overlay-term-pills-primary">
            <button class="overlay-primary-term" type="button" data-action="open-yomu" data-term="${escapeHtml(primary)}" lang="ja">${escapeHtml(primary)}</button>
            ${rest.slice(0, 6).map(term =>
                `<button type="button" data-action="open-yomu" data-term="${escapeHtml(term)}" lang="ja">${escapeHtml(term)}</button>`).join('')}
            <button type="button" data-action="overlay-done">Done</button>
        </div>
    </section>`;
}

function overlayInlineResultHtml(result: OverlayResult): string {
    return `<section class="overlay-inline-layer" data-overlay-inline role="group" aria-label="Recognized text">
        <div class="overlay-inline-toolbar">
            <strong>よむ</strong>
            <button type="button" data-action="overlay-done" aria-label="Close overlay">Close</button>
        </div>
        ${result.lines?.map(line => overlayInlineLineHtml(line)).join('') ?? ''}
    </section>`;
}

function overlayInlineLineHtml(line: OverlayLineResult): string {
    const [primary, ...rest] = line.terms;
    return `<div class="overlay-inline-line" data-ocr-line data-vertical="${line.vertical}" style="${inlineLineStyle(line.box)}">
        <button class="overlay-inline-text" type="button" data-action="open-yomu" data-term="${escapeHtml(primary)}" lang="ja">${escapeHtml(line.text)}</button>
        ${rest.length ? `<div class="overlay-inline-terms">${rest.slice(0, 4).map(term =>
            `<button type="button" data-action="open-yomu" data-term="${escapeHtml(term)}" lang="ja">${escapeHtml(term)}</button>`).join('')}</div>` : ''}
    </div>`;
}

function inlineLineStyle(box: YomuGamingSelectionRect): string {
    return [
        `left:${Math.round(box.left)}px`,
        `top:${Math.round(box.top)}px`,
        `max-width:${Math.round(Math.max(80, box.width))}px`,
        `min-height:${Math.round(Math.max(24, box.height))}px`,
    ].join(';');
}

function overlayResultStyle(selection: YomuGamingSelectionRect | null): string {
    if (!selection) return 'left:50%;bottom:42px;transform:translateX(-50%);max-width:min(720px,calc(100vw - 28px))';
    const width = Math.min(540, Math.max(280, selection.width));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, selection.left));
    const below = selection.top + selection.height + 12;
    const top = below + 118 < window.innerHeight ? below : Math.max(12, selection.top - 128);
    return `left:${left}px;top:${top}px;width:${width}px`;
}

function normalizedViewportSelection(start: { x: number; y: number }, end: { x: number; y: number }): YomuGamingSelectionRect {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    return {
        left,
        top,
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function scaleViewportSelection(selection: YomuGamingSelectionRect, size: { width: number; height: number }): YomuGamingSelectionRect {
    const scaleX = size.width / Math.max(1, window.innerWidth);
    const scaleY = size.height / Math.max(1, window.innerHeight);
    return {
        left: selection.left * scaleX,
        top: selection.top * scaleY,
        width: selection.width * scaleX,
        height: selection.height * scaleY,
    };
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not load capture'));
        image.src = src;
    });
}

function requireAppRoot(): HTMLElement {
    const root = document.querySelector<HTMLElement>('#app');
    if (!root) throw new Error('Missing app root');
    return root;
}

function browserFallbackBridge(): YomuGamingBridge {
    return {
        getEnvironment: async () => ({
            platform: 'browser',
            displayServer: 'browser',
            desktop: 'browser',
            isSteamDeckSession: false,
            isPackaged: false,
            hotkey: 'Ctrl+Shift+Y',
            hotkeyRegistered: false,
        }),
        listCaptureSources: async () => [],
        captureSource: async () => {
            throw new Error('Electron capture unavailable');
        },
        capturePrimaryScreen: async () => {
            throw new Error('Electron capture unavailable');
        },
        requestOcr: async () => ({ ok: false, status: 0, body: null, error: 'Electron OCR bridge unavailable' }),
        showOverlay: async () => undefined,
        hideOverlay: async () => undefined,
        completeOverlayCapture: async () => undefined,
        showApp: async () => undefined,
        hideApp: async () => undefined,
        openExternal: async (url: string) => {
            window.open(url, '_blank', 'noopener,noreferrer');
        },
        updateCaptureShortcut: async (shortcut: string) => ({
            platform: 'browser',
            displayServer: 'browser',
            desktop: 'browser',
            isSteamDeckSession: false,
            isPackaged: false,
            hotkey: shortcut,
            hotkeyRegistered: false,
            hotkeyError: 'Desktop shortcuts are only available in the Electron app.',
        }),
        syncSettingsSnapshot: async (settings: unknown) => {
            const syncedAt = new Date().toISOString();
            localStorage.setItem(GAMING_SETTINGS_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 1, syncedAt, settings }));
            return { syncedAt, storagePath: 'browser-localStorage' };
        },
        restoreSettingsSnapshot: async () => {
            const raw = localStorage.getItem(GAMING_SETTINGS_SNAPSHOT_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as { version: 1; syncedAt: string; settings: unknown } : null;
        },
        onOverlayCaptureCompleted: () => () => undefined,
    };
}
