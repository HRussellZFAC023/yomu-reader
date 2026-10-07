import { dismissDesktopLookup } from './layer-key-events';
import { dispatchAuthorizedReaderControlClick } from '../../reader/ui/trusted-interaction';
import '../../reader/styles/base.css';
import '../../reader/styles/settings.css';
// The overlay's recognized lines are the reader's OCR overlay, so they are styled by
// the reader's own sheet — the same one that dresses .jpdb-ocr-line and the annotated
// words inside it on every page Yomu reads.
import '../../reader/styles/reader-words-ocr.css';
import './styles.css';
// The overlay bundles the real reader, which reaches companion-hosted
// implementations (local dictionaries, UI copy, settings dialog) through
// the ADR-0003 registry; populate it like the other self-contained builds.
import '../../reader/companions/register-build-companions';
import type { InterfaceLanguage, ReaderSettings } from '../../reader/app/types';
import { bootReaderAppWithStartupSettings } from '../../reader/app/boot';
import type { ReaderSettingsSurface } from '../../reader/app/startup';
import { uiText } from '../../reader/app/i18n';
import { escapeHtml } from '../../reader/dom/index';
import { DEFAULT_SETTINGS, formatShortcutEvent, normalizeReaderSettings } from '../../reader/settings';
import { pickFile, downloadBlob, dateStamp } from '../../reader/settings/file-io';
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
import { targetContentLocale } from '../../reader/languages/resolve';
import {
    gamingCaptureOcrProvider,
    gamingLookupCandidates,
    gamingOcrRequest,
    normalizeGamingOcrResponse,
    type GamingOcrResult,
} from '../shared';
import type { OcrOverlayFrame } from '../../reader/ocr/ocr-overlay-geometry';
import { captureShortcutLabel } from '../capture-shortcut';
import { activateWordWithPointer, GamepadOverlayController, gamingOcrWordTargets } from './gamepad-overlay';
import { removeLegacyGamingReaderSettingsCopy } from './legacy-reader-settings-cleanup';
import { installGamingHttpTransport } from './http-transport';
import { gamingSettingsFromBrowserExport, desktopSettingsExport, desktopCaptureShortcutFromExport } from './settings-import';
import {
    layoutOverlayOcrLines,
    suppressDesktopLinePaint,
    normalizeCaptureOcrBox,
    overlayNormalizedOcrLayerHtml,
    overlayOcrFrame,
    type NormalizedGamingOcrLine,
} from './ocr-lines';
import type { YomuGamingBridge, YomuGamingCaptureSource, YomuGamingEnvironment, YomuGamingSelectionRect } from '../ipc';

declare global {
    interface Window {
        yomuGaming?: YomuGamingBridge;
    }
}


// Settings is the only ordinary window; capture starts from the tray or shortcut.
type ShellView = 'settings';

interface RequestedShellView {
    requestId: string;
    view: ShellView;
    settingsPanel?: string;
}

interface StoredShellView {
    requestId?: unknown;
    view?: unknown;
    settingsPanel?: unknown;
    at?: unknown;
}

interface SettingsShellState {
    environment: YomuGamingEnvironment | null;
    settings: ReaderSettings;
    status: string;
    statusTone: 'idle' | 'busy' | 'success' | 'warning' | 'error';
    view: ShellView;
    settingsPanel: string;
}

interface OverlayResult {
    text: string;
    terms: string[];
    lines?: OverlayLineResult[];
    error?: string;
    errorAction?: 'screen-settings';
}

interface OverlayLineResult extends NormalizedGamingOcrLine {
    terms: string[];
}

interface PreparedGamingCapture {
    capture: YomuGamingCaptureSource;
}

const GAMING_SETTINGS_STORAGE_KEY = 'yomu-gaming-reader-settings-v1';
const GAMING_PENDING_VIEW_STORAGE_KEY = 'yomu-gaming-pending-view-v1';
const GAMING_PENDING_VIEW_ACK_STORAGE_KEY = 'yomu-gaming-pending-view-ack-v1';
const GAMING_PENDING_VIEW_MAX_AGE_MS = 15_000;
const GAMING_PENDING_VIEW_ACK_TIMEOUT_MS = 10_000;
const PREVIOUS_OCR_ENDPOINT_STORAGE_KEY = 'yomu-gaming-ocr-endpoint';
const PREVIOUS_OCR_ENGINE_STORAGE_KEY = 'yomu-gaming-ocr-engine';
// Capture is what this app does, so its own shortcut is the first thing Settings shows.
// Media (audio sources, text-to-speech, proxy URL) is the deepest reader tab there is.
const DEFAULT_SETTINGS_PANEL = 'shortcuts';
const CAPTURE_SHORTCUT_HELP = 'Focus the field and press the keys to read the screen.';
const DEFAULT_GAMING_OCR_PROVIDER: ReaderSettings['ocrProvider'] = 'google-lens';
const DEFAULT_GAMING_OCR_ENDPOINT = '';
const UNSUPPORTED_SETTINGS_ACTIONS = new Set([
    'factory-reset',
    'import-yomitan-dictionary',
    'export-yomitan-dictionary',
    'download-recommended-dictionary',
    'prepare-anki',
    'update-anki-model',
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

removeLegacyGamingReaderSettingsCopy();
const bridge = window.yomuGaming ?? browserFallbackBridge();
const gamingReaderSettingsSurface = createGamingReaderSettingsSurface(bridge);
const appRoot = requireAppRoot();
const isOverlay = location.hash.startsWith('#overlay');
let persistTimer: number | undefined;
let captureShortcutPersistToken = 0;

const shellState: SettingsShellState = {
    environment: null,
    settings: loadGamingSettings(),
    status: '',
    statusTone: 'idle',
    view: 'settings',
    settingsPanel: DEFAULT_SETTINGS_PANEL,
};

queueMicrotask(() => void boot());

async function boot(): Promise<void> {
    appRoot.dataset.yomuGamingReady = 'true';
    if (isOverlay) {
        // Before the reader boots: its Jiten/JPDB calls need the overlay's privileged route.
        installGamingHttpTransport(window);
        document.documentElement.classList.add('yomu-gaming-overlay-document');
        document.body.classList.add('yomu-gaming-overlay-document');
        new OverlayController(appRoot, bridge).render();
        return;
    }
    applyDocumentTheme(shellState.settings);
    renderShell();
    watchForRequestedView();
    shellState.environment = await bridge.getEnvironment();
    updateCaptureShortcutCopy();
}

function renderShell(): void {
    // Import replaces the form; its pending input event must not save the detached,
    // pre-import controls over the imported settings a moment later.
    if (persistTimer !== undefined) window.clearTimeout(persistTimer);
    persistTimer = undefined;
    applyDocumentTheme(shellState.settings);
    appRoot.innerHTML = `
        <main class="yomu-gaming-shell" data-yomu-gaming-ready="true" data-shell-view="${shellState.view}">
            <form class="jpdb-reader-settings yomu-gaming-settings" data-jpdb-reader-root data-yomu-gaming-settings lang="${escapeHtml(languageAttribute(shellState.settings.interfaceLanguage))}">
                ${renderSettingsForm(shellState.settings, 'https://jpdb.io/settings', 'https://jiten.moe/settings')}
            </form>
        </main>
    `;
    const form = appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]');
    if (!form) return;
    localizeSettingsForm(form, shellState.settings.interfaceLanguage);
    installGamingSettingsHeader(form);
    installGamingCaptureShortcutSection(form);
    activateSettingsPanel(form, shellState.settingsPanel);
    scrollToInitialSettingsSection(form);
    installShortcutCapture(form);
    clearSettingsSaveStatus(form);
    syncOcrProviderFields(form);
    hideUnsupportedSettingsActions(form);
    bindCaptureShortcutInputs(appRoot);
    bindSettingsForm(form);
    applyShellView();
    setShellStatus(shellState.status, shellState.statusTone);
}

// Success is a fact about the keyboard, so it is read off the environment the main
// process just handed back rather than assumed from "the call returned".
function captureShortcutSaveStatus(environment: YomuGamingEnvironment): { text: string; tone: SettingsShellState['statusTone'] } {
    if (environment.hotkeyError) return { text: environment.hotkeyError, tone: 'warning' };
    if (environment.hotkeyRegistered) return { text: `Capture shortcut saved: ${hotkeyLabel()}.`, tone: 'success' };
    return { text: 'Try another key to use the keyboard.', tone: 'warning' };
}

function applyShellView(): void {
    const form = appRoot.querySelector<HTMLElement>('[data-yomu-gaming-settings]');
    if (form) form.hidden = false;
}

function showView(_view: ShellView, settingsPanel?: string): void {
    if (settingsPanel) {
        shellState.settingsPanel = settingsPanel;
        const form = appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]');
        if (form) activateSettingsPanel(form, settingsPanel);
    }
    applyShellView();
}

// The overlay lives in its own window, so its Settings button leaves the view it wants in
// shared storage rather than adding a push channel to the hardened preload. If the main
// window never wakes to read it, the request simply expires.
interface RetainedShellViewRequest {
    requestId: string;
    serialized: string;
}

function requestView(view: ShellView, settingsPanel?: string): RetainedShellViewRequest | null {
    const requestId = crypto.randomUUID();
    const serialized = JSON.stringify({ requestId, view, settingsPanel, at: Date.now() });
    try {
        localStorage.setItem(GAMING_PENDING_VIEW_STORAGE_KEY, serialized);
        return { requestId, serialized };
    } catch {
        // A locked storage context leaves the current settings panel unchanged.
        return null;
    }
}

function cancelRequestedView(request: RetainedShellViewRequest): void {
    try {
        if (localStorage.getItem(GAMING_PENDING_VIEW_STORAGE_KEY) === request.serialized) {
            localStorage.removeItem(GAMING_PENDING_VIEW_STORAGE_KEY);
        }
        if (localStorage.getItem(GAMING_PENDING_VIEW_ACK_STORAGE_KEY) === request.requestId) {
            localStorage.removeItem(GAMING_PENDING_VIEW_ACK_STORAGE_KEY);
        }
    } catch {
        // The failed handoff cannot leave a request in storage we cannot read.
    }
}

async function waitForRequestedViewAcknowledgement(requestId: string): Promise<void> {
    const deadline = Date.now() + GAMING_PENDING_VIEW_ACK_TIMEOUT_MS;
    while (!takeRequestedViewAcknowledgement(requestId)) {
        if (Date.now() >= deadline) throw new Error('よむ Desktop Settings did not open.');
        await new Promise(resolve => window.setTimeout(resolve, 25));
    }
}

function takeRequestedViewAcknowledgement(requestId: string): boolean {
    try {
        if (localStorage.getItem(GAMING_PENDING_VIEW_ACK_STORAGE_KEY) !== requestId) return false;
        localStorage.removeItem(GAMING_PENDING_VIEW_ACK_STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function createGamingReaderSettingsSurface(
    gamingBridge: Pick<YomuGamingBridge, 'showApp' | 'hideOverlay'>,
): ReaderSettingsSurface {
    let opening: Promise<void> | undefined;
    return {
        open: settingsPanel => {
            opening ??= openGamingReaderSettings(gamingBridge, settingsPanel).finally(() => {
                opening = undefined;
            });
            return opening;
        },
    };
}

async function openGamingReaderSettings(
    gamingBridge: Pick<YomuGamingBridge, 'showApp' | 'hideOverlay'>,
    settingsPanel?: string,
): Promise<void> {
    const request = requestView('settings', settingsPanel ?? DEFAULT_SETTINGS_PANEL);
    if (!request) throw new Error('Could not request よむ Desktop Settings.');
    try {
        await gamingBridge.showApp();
        await waitForRequestedViewAcknowledgement(request.requestId);
        await gamingBridge.hideOverlay();
    } catch (error) {
        cancelRequestedView(request);
        throw error;
    }
}

function watchForRequestedView(): void {
    const consume = () => {
        const requested = consumeRequestedView();
        if (!requested) return;
        showView(requested.view, requested.settingsPanel);
        acknowledgeRequestedView(requested.requestId);
    };
    // `storage` reaches this window the moment the overlay writes, without waiting on the
    // compositor to hand focus over; focus and visibility stay as the catch-up path for
    // an embedder that keeps storage events to itself.
    window.addEventListener('storage', event => {
        if (event.key === null || event.key === GAMING_PENDING_VIEW_STORAGE_KEY) consume();
    });
    window.addEventListener('focus', consume);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) consume();
    });
    consume();
}

function acknowledgeRequestedView(requestId: string): void {
    try {
        localStorage.setItem(GAMING_PENDING_VIEW_ACK_STORAGE_KEY, requestId);
    } catch {
        // The overlay retains itself when it cannot observe acknowledgement.
    }
}

function consumeRequestedView(): RequestedShellView | null {
    return parseRequestedView(takeRequestedView());
}

function takeRequestedView(): string | null {
    try {
        const raw = localStorage.getItem(GAMING_PENDING_VIEW_STORAGE_KEY);
        localStorage.removeItem(GAMING_PENDING_VIEW_STORAGE_KEY);
        return raw;
    } catch {
        return null;
    }
}

function parseRequestedView(raw: string | null): RequestedShellView | null {
    if (!raw) return null;
    try {
        return normalizeRequestedView(JSON.parse(raw) as StoredShellView);
    } catch {
        return null;
    }
}

function normalizeRequestedView(stored: StoredShellView): RequestedShellView | null {
    const requestId = storedRequestId(stored.requestId);
    const view = recentShellView(stored);
    if (!requestId || !view) return null;
    return {
        requestId,
        view,
        settingsPanel: typeof stored.settingsPanel === 'string' ? stored.settingsPanel : undefined,
    };
}

function storedRequestId(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function recentShellView(stored: StoredShellView): ShellView | null {
    if (!isRecentRequest(stored.at)) return null;
    return isShellView(stored.view) ? stored.view : null;
}

function isRecentRequest(at: unknown): at is number {
    if (typeof at !== 'number') return false;
    return Date.now() - at < GAMING_PENDING_VIEW_MAX_AGE_MS;
}

function isShellView(value: unknown): value is ShellView {
    return value === 'settings';
}

// Settings is a place you go, so it gets its own way back and its own status line —
// otherwise a save reported itself onto a surface you are not on.
function installGamingSettingsHeader(form: HTMLFormElement): void {
    const head = form.querySelector<HTMLElement>('.jpdb-reader-settings-head');
    if (!head || head.querySelector('[data-action="close-settings"]')) return;
    const back = document.createElement('button');
    back.className = 'jpdb-reader-btn yomu-gaming-settings-back';
    back.type = 'button';
    back.dataset.action = 'close-settings';
    back.textContent = shellState.settings.interfaceLanguage === 'ja' ? '閉じる' : 'Close';
    head.insertBefore(back, head.querySelector('h2'));
    const status = document.createElement('div');
    status.className = 'yomu-gaming-shell-status';
    status.dataset.gamingShellStatus = 'true';
    status.dataset.statusTone = shellState.statusTone;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    head.appendChild(status);
}

function installGamingCaptureShortcutSection(form: HTMLFormElement): void {
    const panel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-shortcuts');
    if (!panel || panel.querySelector('[data-native-capture-shortcut]')) return;
    const section = document.createElement('div');
    section.className = 'jpdb-reader-settings-subsection yomu-gaming-native-shortcut';
    section.dataset.nativeCaptureShortcut = 'true';
    section.innerHTML = `
        <div class="jpdb-reader-local-title">Screen capture</div>
        <label>
            <span class="jpdb-reader-settings-label-text">Capture shortcut</span>
            <input data-capture-shortcut-input value="${escapeHtml(hotkeyLabel())}" aria-label="Capture shortcut" autocomplete="off" inputmode="none" spellcheck="false">
        </label>
        <div class="jpdb-reader-help" data-capture-shortcut-help>${escapeHtml(CAPTURE_SHORTCUT_HELP)}</div>
    `;
    const grid = panel.querySelector<HTMLElement>('.grid');
    panel.insertBefore(section, grid ?? panel.firstChild);
}

function clearSettingsSaveStatus(form: HTMLFormElement): void {
    form.querySelectorAll<HTMLElement>('[data-settings-save-status]').forEach(element => {
        element.textContent = '';
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
    });
}

function bindSettingsForm(form: HTMLFormElement): void {
    form.addEventListener('submit', event => {
        event.preventDefault();
        persistSettingsFromForm(form);
        setShellStatus(uiText(shellState.settings.interfaceLanguage, 'settingsSaved'), 'success');
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
        showSettingsPanel(form, nextTab?.dataset.panel ?? DEFAULT_SETTINGS_PANEL);
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
            showSettingsPanel(form, button.dataset.panel ?? DEFAULT_SETTINGS_PANEL);
            return;
        }
        if (action === 'cancel' || action === 'close-settings') {
            event.preventDefault();
            void bridge.hideApp();
            return;
        }
        if (action === 'copy-newtab-url') {
            event.preventDefault();
            void navigator.clipboard?.writeText('https://yomureader.com/study/').then(() => {
                setShellStatus('Study address copied.', 'success');
            }).catch(() => {
                setShellStatus('Could not copy from this shell.', 'warning');
            });
            return;
        }
        if (action === 'export-reader-settings') {
            event.preventDefault();
            persistSettingsFromForm(form);
            downloadBlob(new Blob([desktopSettingsExport(shellState.settings, shellState.environment?.hotkey)], { type: 'application/json' }), `yomu-desktop-settings-${dateStamp()}.json`);
            return;
        }
        if (action === 'import-reader-settings') {
            event.preventDefault();
            void importBrowserSettings(form, button);
            return;
        }
        if (EDITOR_ACTIONS.has(action)) {
            event.preventDefault();
            updateSettingsEditor(form, action, button);
            persistSettingsFromForm(form);
        }
    });
    form.addEventListener('change', event => handleSettingsChange(form, event));
    form.addEventListener('input', event => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (target.matches('[data-settings-search]')) return;
        if (target.matches('[data-capture-shortcut-input]')) return;
        scheduleSettingsPersist(form);
    });
}

function handleSettingsChange(form: HTMLFormElement, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-capture-shortcut-input]')) return;
    syncAudioSourceAfterChange(form, target);
    syncOcrProviderAfterChange(form, target);
    syncInterfaceLanguageAfterChange(form, target);
    syncThemeAfterChange(form, target);
    persistSettingsFromForm(form);
}

function syncAudioSourceAfterChange(form: HTMLFormElement, target: HTMLElement): void {
    const sourceSelect = target.closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
    if (!sourceSelect) return;
    syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
    syncBrowserTtsVoiceOptions(form);
}

function syncOcrProviderAfterChange(form: HTMLFormElement, target: HTMLElement): void {
    if (target.closest('[name="ocrProvider"]')) syncOcrProviderFields(form);
}

function syncInterfaceLanguageAfterChange(form: HTMLFormElement, target: HTMLElement): void {
    if (target.closest('[name="interfaceLanguage"]')) localizeAfterLanguageChange(form);
}

function syncThemeAfterChange(form: HTMLFormElement, target: HTMLElement): void {
    if (!target.closest('[name="theme"], [data-theme-value]')) return;
    applyDocumentTheme(readFormSettings(new FormData(form), shellState.settings));
}


function showSettingsPanel(form: HTMLFormElement, panel: string): void {
    shellState.settingsPanel = panel;
    activateSettingsPanel(form, panel);
}

function bindCaptureShortcutInputs(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(input => {
        input.addEventListener('keydown', event => {
            if (event.key === 'Tab') return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Backspace' || event.key === 'Delete') {
                syncCaptureShortcutInputValues(root, '');
                setShellStatus('Press a new capture shortcut.', 'warning');
                return;
            }
            const shortcut = formatShortcutEvent(event);
            if (!shortcut || isModifierOnlyShortcut(shortcut)) return;
            syncCaptureShortcutInputValues(root, shortcut);
            void persistCaptureShortcutFromInput(root, shortcut);
        });
        input.addEventListener('change', () => void persistCaptureShortcutFromInput(root, input.value));
        input.addEventListener('blur', () => {
            if (input.value.trim() && input.value.trim() !== hotkeyLabel()) {
                void persistCaptureShortcutFromInput(root, input.value);
            } else {
                syncCaptureShortcutInputValues(root, hotkeyLabel());
            }
        });
        input.addEventListener('paste', event => {
            event.preventDefault();
            const shortcut = event.clipboardData?.getData('text/plain') ?? '';
            syncCaptureShortcutInputValues(root, shortcut);
            void persistCaptureShortcutFromInput(root, shortcut);
        });
    });
}

async function persistCaptureShortcutFromInput(root: HTMLElement, shortcut: string): Promise<void> {
    const token = ++captureShortcutPersistToken;
    setCaptureShortcutControlsDisabled(root, true);
    setShellStatus(`Saving ${shortcut.trim() || 'capture shortcut'}.`, 'busy');
    try {
        const environment = await bridge.updateCaptureShortcut(shortcut);
        if (token !== captureShortcutPersistToken) return;
        shellState.environment = environment;
        syncCaptureShortcutInputValues(root, hotkeyLabel());
        updateCaptureShortcutCopy();
        const saved = captureShortcutSaveStatus(environment);
        setShellStatus(saved.text, saved.tone);
    } catch (error) {
        if (token !== captureShortcutPersistToken) return;
        syncCaptureShortcutInputValues(root, hotkeyLabel());
        setShellStatus(error instanceof Error ? error.message : 'Could not update capture shortcut.', 'error');
    } finally {
        if (token === captureShortcutPersistToken) setCaptureShortcutControlsDisabled(root, false);
    }
}

function setCaptureShortcutControlsDisabled(root: HTMLElement, disabled: boolean): void {
    root.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(input => {
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
    updateCaptureShortcutCopy();
}

// The browser's "Export settings" file, read into Gaming's own settings (settings-import.ts):
// how a Pass/Fail choice or a Jiten key made in the browser reaches the popup over a game.
async function importBrowserSettings(form: HTMLFormElement, button: HTMLButtonElement | null): Promise<void> {
    const file = await pickFile(form, 'settings');
    if (!file) return;
    button?.setAttribute('disabled', 'true');
    try {
        const serialized = await file.text();
        const imported = gamingSettingsFromBrowserExport(serialized, shellState.settings);
        if (!imported) {
            setShellStatus(uiText(shellState.settings.interfaceLanguage, 'settingsImportUnsupportedFormat'), 'error');
            return;
        }
        const captureShortcut = desktopCaptureShortcutFromExport(serialized);
        if (captureShortcut) {
            const environment = await bridge.updateCaptureShortcut(captureShortcut);
            if (!environment.hotkeyRegistered || environment.hotkeyError) {
                setShellStatus(environment.hotkeyError || 'Could not restore the capture shortcut.', 'error');
                return;
            }
            shellState.environment = environment;
        }
        shellState.settings = imported;
        persistGamingSettings(imported);
        setShellStatus(uiText(imported.interfaceLanguage, 'settingsImported'), 'success');
        renderShell();
    } catch {
        setShellStatus(uiText(shellState.settings.interfaceLanguage, 'settingsImportUnsupportedFormat'), 'error');
    } finally {
        if (button?.isConnected) button.removeAttribute('disabled');
    }
}

function scheduleSettingsPersist(form: HTMLFormElement): void {
    if (persistTimer !== undefined) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
        if (form.isConnected) persistSettingsFromForm(form);
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
    hideUnsupportedSettingsActions(form);
    syncOcrProviderFields(form);
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
    appRoot.querySelectorAll<HTMLElement>('[data-settings-save-status]').forEach(element => {
        element.textContent = '';
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
    });
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-shell-status]').forEach(element => {
        element.textContent = status;
        element.dataset.statusTone = tone;
        element.hidden = !status;
    });
}

// Reflect the registered native shortcut in Settings.
function updateCaptureShortcutCopy(): void {
    appRoot.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(element => {
        element.value = hotkeyLabel();
    });
    appRoot.querySelectorAll<HTMLElement>('[data-capture-shortcut-help]').forEach(element => {
        element.textContent = CAPTURE_SHORTCUT_HELP;
    });

}

function hotkeyLabel(): string {
    // Same helper the tray uses, so the menu-bar item and the settings screen never
    // disagree about what the capture shortcut is called.
    return captureShortcutLabel(shellState.environment?.hotkey ?? '', shellState.environment?.platform ?? '');
}

function scrollToInitialSettingsSection(form: HTMLFormElement): void {
    window.requestAnimationFrame(() => {
        const scroller = form.querySelector<HTMLElement>('.jpdb-reader-settings-scroll');
        // Element.scrollTo is absent in some embedders; the reset is cosmetic either way.
        if (typeof scroller?.scrollTo === 'function') scroller.scrollTo({ top: 0 });
    });
}

function loadGamingSettings(): ReaderSettings {
    const stored = parseStoredSettings() ?? {};
    const initial = {
        ...DEFAULT_SETTINGS,
        theme: 'light' as const,
        ocrEnabled: true,
        ocrProvider: DEFAULT_GAMING_OCR_PROVIDER,
        ...stored,
    };
    const settings = normalizeReaderSettings({
        ...initial,
        ocrEndpointUrl: gamingOcrSetting(initial.ocrProvider, stored.ocrEndpointUrl, PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, DEFAULT_SETTINGS.ocrEndpointUrl, DEFAULT_GAMING_OCR_ENDPOINT),
        ocrEngine: gamingOcrSetting(initial.ocrProvider, stored.ocrEngine, PREVIOUS_OCR_ENGINE_STORAGE_KEY, DEFAULT_SETTINGS.ocrEngine, DEFAULT_SETTINGS.ocrEngine),
    });
    return settings;
}

function gamingOcrSetting(
    provider: ReaderSettings['ocrProvider'],
    stored: string | undefined,
    previousStorageKey: string,
    fallback: string,
    nonLocalValue: string,
): string {
    if (provider !== 'local-service') return nonLocalValue;
    return [stored, localStorage.getItem(previousStorageKey), fallback]
        .find(value => typeof value === 'string' && value.length > 0) ?? fallback;
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
    if (settings.ocrProvider === 'local-service' && settings.ocrEndpointUrl.trim()) {
        localStorage.setItem(PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, settings.ocrEndpointUrl);
        localStorage.setItem(PREVIOUS_OCR_ENGINE_STORAGE_KEY, settings.ocrEngine);
    }
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

class OverlayController {
    private busy = false;
    private result: OverlayResult | null = null;
    private settings = loadGamingSettings();
    private capture: YomuGamingCaptureSource | null = null;
    private started = false;
    private ocrLayoutFrame = 0;
    // Controller navigation so the overlay is usable on a Steam Deck in Game Mode
    // (no keyboard/mouse). It drives the same OCR word DOM the pointer path uses.
    private readonly gamepad = new GamepadOverlayController({
        words: () => this.gamepadWordTargets(),
        activate: word => activateWordWithPointer(word),
        back: () => this.handleGamepadBack(),
        recapture: () => void this.recapture(),
        settings: () => this.openSettings(),
    });

    constructor(private root: HTMLElement, private gamingBridge: YomuGamingBridge) {
        installOverlayEscapeHandler(() => this.gamingBridge.hideOverlay());
        this.gamepad.start();
        this.watchOcrLineLayout();
        new MutationObserver(() => suppressDesktopLinePaint(this.root))
            .observe(this.root, { attributes: true, attributeFilter: ['style'], subtree: true });
        this.watchLayerInput();
        this.gamingBridge.onLayerShortcut?.(key => {
            if (key === 'Escape') {
                dismissDesktopLookup(document, () => this.gamingBridge.hideOverlay());
                return;
            }
            const button = this.gradeButtons().find(button => button.getAttribute('aria-keyshortcuts') === key);
            if (button) dispatchAuthorizedReaderControlClick(button);
        });
        // The overlay window is hidden and reused, not destroyed — without
        // this the gamepad rAF poller would keep running after dismissal.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.gamepad.stop();
            else this.gamepad.start();
        });
    }

    private gradeButtons(): HTMLButtonElement[] {
        return [...document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-popover button[data-action="grade"][aria-keyshortcuts]')]
            .filter(button => {
                const popup = button.closest<HTMLElement>('.jpdb-reader-popover');
                if (!popup || button.disabled || button.getBoundingClientRect().width <= 0) return false;
                const style = getComputedStyle(popup);
                return style.visibility !== 'hidden' && Number(style.opacity) > 0;
            });
    }

    private watchLayerInput(): void {
        if (!this.gamingBridge.setLayerRegions) return;
        let lastGradeKeys = '';
        const update = () => {
            const regions = [...document.querySelectorAll<HTMLElement>(
                '.jpdb-reader-word, .jpdb-reader-popover, .overlay-toolbar, .overlay-result, .jpdb-reader-settings-modal')]
                .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
                .map(({ left, top, width, height }) => ({ left, top, width, height }));
            void this.gamingBridge.setLayerRegions?.(regions);
            const gradeKeys = this.gradeButtons().map(button => button.getAttribute('aria-keyshortcuts') ?? '');
            const keySignature = JSON.stringify(gradeKeys);
            if (keySignature !== lastGradeKeys) {
                lastGradeKeys = keySignature;
                void this.gamingBridge.setLayerShortcuts?.(gradeKeys).then(registered => {
                    for (const button of this.gradeButtons()) {
                        if (registered.includes(button.getAttribute('aria-keyshortcuts') ?? '')) continue;
                        button.removeAttribute('aria-keyshortcuts');
                        button.removeAttribute('data-grade-key');
                    }
                }).catch(() => undefined);
            }
        };
        // Includes reader popups rendered outside the overlay root. Layout changes occur
        // after annotation, so sample settled geometry rather than a pre-paint mutation.
        const timer = window.setInterval(update, 100);
        window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
    }

    // The reader may render words either anchored in place (geometry OCR) or inside
    // the compact caption (text-only OCR). Both are valid gamepad targets.
    private gamepadWordTargets(): HTMLElement[] {
        return gamingOcrWordTargets(this.root);
    }

    // B mirrors Escape: close the reader popover if one is open, otherwise close the
    // whole overlay. The reader owns Escape for its own popover, so dispatch that first.
    private handleGamepadBack(): void {
        dismissDesktopLookup(document, () => this.gamingBridge.hideOverlay());
    }

    // Open the native Settings window from the layer.
    private openSettings(): void {
        void gamingReaderSettingsSurface.open().catch(error => {
            console.warn('よむ Desktop could not open Settings.', error);
        });
    }

    render(): void {
        this.root.innerHTML = this.overlayShellHtml();
        this.bind();
        layoutOverlayOcrLines(this.root, this.ocrFrame(), this.settings.ocrFontScale);
        this.gamepad.reconcileFocus();
        this.startOnce();
    }

    private overlayShellHtml(): string {
        return `
            <main class="overlay-shell" data-yomu-gaming-ready="true" data-yomu-gaming-overlay-ready="true" data-overlay-mode="${this.overlayMode()}" data-capture-mode="instant" data-overlay-busy="${this.busy}">
                ${overlayBackdropHtml(this.capture)}
                ${overlayToolbarHtml(true, this.settings.interfaceLanguage)}
                ${this.overlayStatusFragment()}
                ${this.overlayResultFragment()}
            </main>
        `;
    }

    private overlayStatusFragment(): string {
        return this.busy ? overlayStatusHtml(this.overlayInstruction()) : '';
    }

    private overlayResultFragment(): string {
        if (!this.result) return '';
        return overlayResultHtml(this.result);
    }

    private startOnce(): void {
        if (this.started) return;
        this.started = true;
        void this.begin();
    }

    // The reader re-typesets each line after it is painted — furigana and word chips
    // change how much room the text needs — so the frames are measured again once the
    // DOM settles, and again whenever the window resizes.
    private watchOcrLineLayout(): void {
        window.addEventListener('resize', () => this.scheduleOcrLineLayout());
        new MutationObserver(() => this.scheduleOcrLineLayout())
            .observe(this.root, { childList: true, subtree: true });
    }

    private scheduleOcrLineLayout(): void {
        window.cancelAnimationFrame(this.ocrLayoutFrame);
        this.ocrLayoutFrame = window.requestAnimationFrame(() => layoutOverlayOcrLines(this.root, this.ocrFrame(), this.settings.ocrFontScale));
    }

    // One rect for the whole surface: the frozen capture as it is painted right now. The
    // area crop is taken through it and every OCR line is measured and clamped against
    // it, so the picture, the crop and the recognized text cannot disagree — including
    // after the window is resized, when the picture re-letterboxes underneath them.
    private ocrFrame(): OcrOverlayFrame {
        return overlayOcrFrame(this.root, this.capture?.size ?? null);
    }

    private async begin(): Promise<void> {
        this.settings = loadGamingSettings();
        try {
            this.capture = await this.gamingBridge.getFrozenCapture();
        } catch (error) {
            this.result = captureErrorResult(error);
            this.render();
            return;
        }
        await this.readCapture();
    }

    private bind(): void {
        this.root.querySelectorAll<HTMLButtonElement>('[data-action="overlay-done"]').forEach(button => button.addEventListener('click', () => {
            void this.gamingBridge.hideOverlay();
        }));
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-recapture"]')?.addEventListener('click', () => {
            void this.recapture();
        });
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-settings"]')?.addEventListener('click', () => {
            this.openSettings();
        });
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-open-screen-settings"]')?.addEventListener('click', () => {
            void this.gamingBridge.openScreenSettings();
        });
    }

    private async recapture(): Promise<void> {
        this.settings = loadGamingSettings();
        this.result = null;
        this.busy = true;
        this.render();
        try {
            this.capture = await this.gamingBridge.recaptureFrozenFrame();
        } catch (error) {
            this.busy = false;
            this.result = captureErrorResult(error);
            this.render();
            return;
        }
        this.busy = false;
        await this.readCapture();
    }

    private overlayInstruction(): string {
        return 'Reading screen';
    }

    private overlayMode(): 'idle' | 'busy' | 'result' | 'error' {
        if (this.busy) return 'busy';
        if (this.result?.error) return 'error';
        if (this.result) return 'result';
        return 'idle';
    }

    private async readCapture(): Promise<void> {
        const prepared = await this.prepareCaptureRead();
        if (!prepared) return;
        this.beginCaptureRead();
        const result = await this.recognizeCapture(prepared);
        this.finishCaptureRead(result);
    }

    private async prepareCaptureRead(): Promise<PreparedGamingCapture | null> {
        this.settings = loadGamingSettings();
        if (!this.captureSettingsReady()) return null;
        const capture = await this.captureForRead();
        if (!capture) return null;
        return { capture };
    }

    private captureSettingsReady(): boolean {
        const setupError = gamingOcrSetupError(this.settings);
        if (!setupError) return true;
        this.result = { text: '', terms: [], error: setupError };
        this.render();
        return false;
    }

    private async captureForRead(): Promise<YomuGamingCaptureSource | null> {
        if (this.capture) return this.capture;
        try {
            this.capture = await this.gamingBridge.getFrozenCapture();
            return this.capture;
        } catch (error) {
            this.result = captureErrorResult(error);
            this.render();
            return null;
        }
    }

    private beginCaptureRead(): void {
        this.busy = true;
        this.result = null;
        this.render();
    }

    private async recognizeCapture(prepared: PreparedGamingCapture): Promise<OverlayResult> {
        try {
            const crop = fullCapture(prepared.capture);
            const response = await this.gamingBridge.requestOcr(gamingOcrRequest(this.settings, crop));
            if (!response.ok) {
                return captureErrorResult(new Error(response.error ?? 'OCR failed. Check the OCR provider in Settings.'));
            }
            const result = normalizeGamingOcrResponse(response.body, crop.width, crop.height);
            return overlayResultFromOcr(result, crop.sourceRect, crop.sourceSize);
        } catch (error) {
            return captureErrorResult(error);
        }
    }

    private finishCaptureRead(result: OverlayResult): void {
        this.result = result;
        this.busy = false;
        this.render();
        if (result.lines?.length || result.text) ensureOverlayReader();
    }
}

export function installOverlayEscapeHandler(hideOverlay: () => Promise<void>): () => void {
    const onKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        // Decide before the event reaches the reader's document listener. That
        // listener removes an open popover synchronously; checking later in the
        // bubble phase would then mistake the same Escape for a second press and
        // hide both the popover and the overlay.
        if (document.querySelector('.jpdb-reader-popover')) return;
        void hideOverlay();
    };
    window.addEventListener('keydown', onKeydown, { capture: true });
    return () => window.removeEventListener('keydown', onKeydown, { capture: true });
}

let overlayReaderBooted = false;
let overlayReaderBootInFlight = false;

// Boot the REAL Yomu reader AFTER the OCR text nodes are in the DOM, so its initial
// page scan picks them up (the scanner runs once on boot; collectScanTargets already
// sees these nodes). The reader then renders furigana + its native hover/click popover
// onto the OCR'd words — the same code path Yomu uses on every page. Booting once is
// enough: its mutation observer re-scans later captures.
function ensureOverlayReader(): void {
    if (overlayReaderBooted || overlayReaderBootInFlight) return;
    const gaming = loadGamingSettings();
    overlayReaderBootInFlight = true;
    bootOverlayReader(overlayReaderSettings(gaming));
}

function overlayReaderSettings(gaming: ReaderSettings): ReaderSettings {
    // The capture layer already limits lookup to recognized text: ordinary hover works
    // without borrowing a browser page-scanning modifier.
    return normalizeReaderSettings({
        ...gaming,
        ocrEnabled: false,
        ocrAutoScanImages: false,
        showFloatingButton: false,
        annotationsPaused: false,
        manualScanEnabled: false,
        lookupOnClick: true,
        lookupOnHover: true,
        shortcuts: { ...gaming.shortcuts, hoverLookup: '' },
        corsProxyUrl: gaming.corsProxyUrl.trim(),
    });
}

function bootOverlayReader(settings: ReaderSettings): void {
    void Promise.resolve()
        .then(() => bootReaderAppWithStartupSettings(settings, { settingsSurface: gamingReaderSettingsSurface }))
        .then(initialized => {
            overlayReaderBooted = initialized;
            if (!initialized) console.warn('よむ Desktop could not start the inline reader.');
        })
        .catch(error => {
            overlayReaderBooted = false;
            console.warn('よむ Desktop could not start the inline reader.', error);
        })
        .finally(() => {
            overlayReaderBootInFlight = false;
        });
}

function captureErrorResult(error: unknown): OverlayResult {
    const message = error instanceof Error ? error.message : 'Capture failed.';
    const needsScreenAccess = /screen recording|screen-capture permission/i.test(message);
    return { text: '', terms: [], error: message, errorAction: needsScreenAccess ? 'screen-settings' : undefined };
}

function gamingOcrSetupError(settings: ReaderSettings): string {
    if (!settings.ocrEnabled || settings.ocrProvider === 'off') return 'Turn on Image OCR in Settings.';
    if (!gamingCaptureOcrProvider(settings.ocrProvider)) return 'Choose Google Lens, Cloud Vision, or local OCR in Settings.';
    if (settings.ocrProvider !== 'local-service') return '';
    if (!settings.ocrEndpointUrl.trim()) return 'Add an advanced local OCR server URL in Settings.';
    return '';
}

function overlayResultFromOcr(
    result: GamingOcrResult | null,
    captureRegion: YomuGamingSelectionRect,
    captureSize: { width: number; height: number },
): OverlayResult {
    const text = result?.lines.map(line => line.text).join('\n') ?? '';
    const terms = gamingLookupCandidates(text);
    const lines = hasOcrGeometry(result)
        ? result.lines.filter(line => line.hasGeometry).map(line => ({
            text: line.text,
            terms: gamingLookupCandidates(line.text),
            box: normalizeCaptureOcrBox(line.box, result, captureRegion, captureSize),
            vertical: line.vertical,
            words: line.words?.map(word => ({ text: word.text,
                box: normalizeCaptureOcrBox(word.box, result, captureRegion, captureSize) })),
        })).filter(line => line.terms.length > 0)
        : [];
    return terms.length
        ? { text, terms, lines: lines.length ? lines : undefined }
        : { text, terms: [], error: text ? 'Try another part of the screen.' : 'Aim at some text and capture again.' };
}

function hasOcrGeometry(result: GamingOcrResult | null): result is GamingOcrResult {
    if (!result?.lines.length) return false;
    return result.lines.some(line => line.hasGeometry);
}

interface GamingCaptureCrop {
    dataUrl: string;
    width: number;
    height: number;
    sourceRect: YomuGamingSelectionRect;
    sourceSize: { width: number; height: number };
}

function fullCapture(capture: YomuGamingCaptureSource): GamingCaptureCrop {
    return { dataUrl: capture.thumbnailDataUrl, width: capture.size.width, height: capture.size.height,
        sourceRect: { left: 0, top: 0, width: capture.size.width, height: capture.size.height }, sourceSize: capture.size };
}

function overlayBackdropHtml(capture: YomuGamingCaptureSource | null): string {
    if (!capture?.thumbnailDataUrl) return '';
    return `<img class="overlay-backdrop" src="${escapeHtml(capture.thumbnailDataUrl)}" alt="" aria-hidden="true" draggable="false">`;
}

function overlayToolbarHtml(captureReady = true, language: InterfaceLanguage = 'en'): string {
    const ja = language === 'ja';
    return `<div class="overlay-toolbar" role="toolbar" aria-label="よむ Desktop">
        ${captureReady ? `<button type="button" data-action="overlay-recapture">${ja ? '再読み取り' : 'Read again'}</button>` : ''}
        <button type="button" data-action="overlay-settings">${ja ? '設定' : 'Settings'}</button>
        <button type="button" data-action="overlay-done" aria-label="${ja ? '閉じる' : 'Close overlay'}">${ja ? '閉じる' : 'Close'}</button>
    </div>`;
}

function overlayStatusHtml(label: string): string {
    return `<div class="overlay-status" role="status" aria-live="polite"><strong>よむ</strong><span>${escapeHtml(label)}</span></div>`;
}

function overlayResultHtml(result: OverlayResult): string {
    if (result.lines?.length) return overlayInlineResultHtml(result);
    const style = 'left:50%;bottom:42px;transform:translateX(-50%);max-width:min(720px,calc(100vw - 28px))';
    if (result.error) {
        return `<section class="overlay-result" style="${style}" role="alert">
            <strong>${escapeHtml(result.error)}</strong>
            ${overlayErrorTextHtml(result.text)}
            ${overlayErrorActionsHtml(result.errorAction)}
        </section>`;
    }
    // No per-line geometry (text-only OCR): show the recognized text as one scannable
    // node so the reader still adds furigana + the popover to it.
    return `<section class="overlay-result overlay-result-compact" style="${style}" role="status" aria-label="Recognized text">
        <p class="overlay-result-text" data-ocr-line lang="${escapeHtml(targetContentLocale())}">${escapeHtml(result.text)}</p>
    </section>`;
}

function overlayErrorTextHtml(text: string): string {
    if (!text) return '';
    return `<p lang="${escapeHtml(targetContentLocale())}">${escapeHtml(text)}</p>`;
}

function overlayErrorActionsHtml(action: OverlayResult['errorAction']): string {
    const primary = action === 'screen-settings'
        ? '<button type="button" class="overlay-action-primary" data-action="overlay-open-screen-settings">Open Screen Recording settings</button>'
        : '<button type="button" data-action="overlay-settings">Settings</button>';
    const retry = '<button type="button" data-action="overlay-recapture">Try again</button>';
    return `<div class="overlay-actions">${primary}${retry}<button type="button" data-action="overlay-done">Close</button></div>`;
}

function overlayInlineResultHtml(result: OverlayResult): string {
    return overlayNormalizedOcrLayerHtml(result.lines ?? []);
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
            displayCount: 1,
            hotkey: 'Ctrl+Shift+Y',
            hotkeyRegistered: false,
            trayActive: false,
            screenAccess: 'unsupported',
        }),
        getFrozenCapture: async () => {
            throw new Error('Electron capture unavailable');
        },
        recaptureFrozenFrame: async () => {
            throw new Error('Electron capture unavailable');
        },
        openScreenSettings: async () => undefined,
        requestOcr: async () => ({ ok: false, status: 0, body: null, error: 'Electron OCR bridge unavailable' }),
        showOverlay: async () => undefined,
        hideOverlay: async () => undefined,
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
            displayCount: 1,
            hotkey: shortcut,
            hotkeyRegistered: false,
            trayActive: false,
            hotkeyError: 'Shortcuts work in the よむ Desktop app.',
            screenAccess: 'unsupported',
        }),
    };
}
