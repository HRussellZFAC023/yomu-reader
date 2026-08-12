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
import { uiText } from '../../reader/app/i18n';
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
import { adoptLearningTargetFromSettings } from '../../reader/languages/target-selection';
import { learningTargetRosterIdForTag } from '../../reader/languages/roster';
import { targetContentLocale, targetLanguageName } from '../../reader/languages/resolve';
import {
    gamingCaptureOcrProvider,
    gamingLookupCandidates,
    gamingOcrRequest,
    normalizeGamingOcrResponse,
    type GamingOcrResult,
} from '../shared';
import type { OcrOverlayFrame } from '../../reader/ocr/ocr-overlay-geometry';
import { captureShortcutLabel } from '../capture-shortcut';
import { gamingWindowParkingHint } from '../lifecycle';
import { activateWordWithPointer, GamepadOverlayController, gamingOcrWordTargets } from './gamepad-overlay';
import { removeLegacyGamingReaderSettingsCopy } from './legacy-reader-settings-cleanup';
import {
    captureSelectionFromViewport,
    layoutOverlayOcrLines,
    normalizeCaptureOcrBox,
    overlayNormalizedOcrLayerHtml,
    overlayOcrFrame,
    type NormalizedGamingOcrLine,
} from './ocr-lines';
import type { YomuGamingBridge, YomuGamingCaptureMode, YomuGamingCaptureSource, YomuGamingEnvironment, YomuGamingSelectionRect } from '../ipc';

declare global {
    interface Window {
        yomuGaming?: YomuGamingBridge;
    }
}

const APP_ICON_URL = './yomu-icon-512.png';

// The window shows exactly one surface at a time. Home says what the app is and what to
// press; Settings is a place you go. Stacking them was how the same message ended up on
// screen twice with six buttons for three actions.
type ShellView = 'home' | 'settings';

interface RequestedShellView {
    view: ShellView;
    settingsPanel?: string;
}

interface StoredShellView {
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
    errorAction?: 'screen-settings' | 'target-settings';
}

interface OverlayLineResult extends NormalizedGamingOcrLine {
    terms: string[];
}

interface PreparedGamingCapture {
    capture: YomuGamingCaptureSource;
    selection: YomuGamingSelectionRect | null;
}

const GAMING_SETTINGS_STORAGE_KEY = 'yomu-gaming-reader-settings-v1';
const GAMING_SETTINGS_SNAPSHOT_STORAGE_KEY = 'yomu-gaming-settings-snapshot-v1';
const GAMING_PENDING_VIEW_STORAGE_KEY = 'yomu-gaming-pending-view-v1';
const GAMING_PENDING_VIEW_MAX_AGE_MS = 15_000;
const PREVIOUS_OCR_ENDPOINT_STORAGE_KEY = 'yomu-gaming-ocr-endpoint';
const PREVIOUS_OCR_ENGINE_STORAGE_KEY = 'yomu-gaming-ocr-engine';
// Capture is what this app does, so its own shortcut is the first thing Settings shows.
// Media (audio sources, text-to-speech, proxy URL) is the deepest reader tab there is.
const DEFAULT_SETTINGS_PANEL = 'shortcuts';
const TARGET_SETTINGS_PANEL = 'appearance';
// What the hero says instead of naming a key that the system has not handed over.
const CAPTURE_SHORTCUT_SETUP_LINE = 'Pick a shortcut in Settings to read from any app.';
const CAPTURE_SHORTCUT_HELP = 'Focus the field and press the keys to read the screen.';
const DEFAULT_GAMING_OCR_PROVIDER: ReaderSettings['ocrProvider'] = 'google-lens';
const DEFAULT_GAMING_OCR_ENDPOINT = '';
const UNSUPPORTED_SETTINGS_ACTIONS = new Set([
    'factory-reset',
    'import-yomitan-settings',
    'export-reader-settings',
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
const appRoot = requireAppRoot();
const overlayCaptureMode = currentOverlayCaptureMode();
const isOverlay = location.hash.startsWith('#overlay');
let persistTimer: number | undefined;
let captureShortcutPersistToken = 0;

const shellState: SettingsShellState = {
    environment: null,
    settings: loadGamingSettings(),
    status: '',
    statusTone: 'idle',
    view: 'home',
    settingsPanel: DEFAULT_SETTINGS_PANEL,
};

if (!isOverlay) {
    bridge.onTargetChoiceRequired(() => {
        if (!shellState.settings.learningTargetChosen) showTargetSettings();
    });
    syncMainProcessTargetChoice(shellState.settings);
}

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
    renderShell();
    watchForRequestedView();
    shellState.environment = await bridge.getEnvironment();
    // The hero itself now carries whether the keyboard is in play, so a fresh launch
    // reports nothing extra: one screen, one message.
    updateCaptureShortcutCopy();
    updateSessionGuidance();
}

function renderShell(): void {
    applyDocumentTheme(shellState.settings);
    appRoot.innerHTML = `
        <main class="yomu-gaming-shell" data-yomu-gaming-ready="true" data-shell-view="${shellState.view}">
            ${renderGamingHome()}
            <form class="jpdb-reader-settings yomu-gaming-settings" data-jpdb-reader-root data-yomu-gaming-settings lang="${escapeHtml(languageAttribute(shellState.settings.interfaceLanguage))}">
                ${renderSettingsForm(shellState.settings, 'https://jpdb.io/settings', 'https://jiten.moe/settings')}
            </form>
        </main>
    `;
    const form = appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]');
    if (!form) return;
    localizeSettingsForm(form, shellState.settings.interfaceLanguage);
    applyGamingSettingsCopy(form);
    installGamingTargetChoice(form);
    installGamingSettingsHeader(form);
    installGamingCaptureShortcutSection(form);
    installNativeSettingsSyncSection(form);
    activateSettingsPanel(form, shellState.settingsPanel);
    scrollToInitialSettingsSection(form);
    installShortcutCapture(form);
    clearSettingsSaveStatus(form);
    syncOcrProviderFields(form);
    hideUnsupportedSettingsActions(form);
    bindCaptureShortcutInputs(appRoot);
    bindGamingHomeActions(form);
    bindSettingsForm(form);
    applyShellView();
    setShellStatus(shellState.status, shellState.statusTone);
}

// One hero: the name, the one sentence that says what this is, the one button that does
// it, and the shortcut for the same action shown once. Everything else is a quiet
// secondary row.
function renderGamingHome(): string {
    if (!shellState.settings.learningTargetChosen) return renderGamingTargetChoice();
    return `
        <section class="yomu-gaming-home" aria-label="Yomu Gaming" data-gaming-home>
            <div class="yomu-gaming-home-card">
                <img class="yomu-gaming-home-icon" src="${escapeHtml(APP_ICON_URL)}" alt="" aria-hidden="true">
                <p class="yomu-gaming-home-mark">Yomu Gaming</p>
                <h1>Read ${escapeHtml(targetLanguageName())} anywhere on your screen</h1>
                <p class="yomu-gaming-home-lede">Point at any word to see its reading and meaning.</p>
                <button class="jpdb-reader-btn add yomu-gaming-home-primary" type="button" data-action="instant-capture">Read my screen</button>
                <p class="yomu-gaming-home-shortcut" data-gaming-shortcut-line data-shortcut-ready="${captureShortcutReady()}">${captureShortcutLineHtml()}</p>
                <div class="yomu-gaming-shell-status" data-gaming-shell-status data-status-tone="${shellState.statusTone}" role="status" aria-live="polite" hidden></div>
                <div class="yomu-gaming-session-note" data-gaming-session-note hidden></div>
                <div class="yomu-gaming-home-secondary">
                    <button class="jpdb-reader-btn" type="button" data-action="area-capture">Read part of the screen</button>
                    <button class="jpdb-reader-btn" type="button" data-action="open-settings">Settings</button>
                </div>
            </div>
        </section>
    `;
}

function renderGamingTargetChoice(): string {
    const language = shellState.settings.interfaceLanguage;
    return `
        <section class="yomu-gaming-home" aria-label="Yomu Gaming" data-gaming-home data-target-choice-required="true" lang="${escapeHtml(languageAttribute(language))}">
            <div class="yomu-gaming-home-card">
                <img class="yomu-gaming-home-icon" src="${escapeHtml(APP_ICON_URL)}" alt="" aria-hidden="true">
                <p class="yomu-gaming-home-mark">Yomu Gaming</p>
                <h1 data-gaming-target-title>${escapeHtml(uiText(language, 'gamingChooseTargetTitle'))}</h1>
                <p class="yomu-gaming-home-lede" data-gaming-target-body>${escapeHtml(uiText(language, 'gamingChooseTargetBody'))}</p>
                <button class="jpdb-reader-btn add yomu-gaming-home-primary" type="button" data-action="choose-target">${escapeHtml(uiText(language, 'gamingChooseTargetAction'))}</button>
                <div class="yomu-gaming-shell-status" data-gaming-shell-status data-status-tone="${shellState.statusTone}" role="status" aria-live="polite" hidden></div>
                <div class="yomu-gaming-session-note" data-gaming-session-note hidden></div>
                <div class="yomu-gaming-home-secondary">
                    <button class="jpdb-reader-btn" type="button" data-action="open-settings">${escapeHtml(uiText(language, 'settings'))}</button>
                </div>
            </div>
        </section>
    `;
}

// One state, one sentence. The hero used to name a key unconditionally and let a second
// line quietly say the same key was unavailable, so the screen told you to press
// something that did nothing. Everything the keyboard has to say is decided here, from
// `hotkeyRegistered`, and rendered in one place.
function captureShortcutReady(): boolean {
    return shellState.environment ? shellState.environment.hotkeyRegistered : true;
}

function captureShortcutLineHtml(): string {
    if (!captureShortcutReady()) return escapeHtml(CAPTURE_SHORTCUT_SETUP_LINE);
    return `Or press <kbd data-hotkey>${escapeHtml(hotkeyLabel())}</kbd> any time, in any app.`;
}

// Success is a fact about the keyboard, so it is read off the environment the main
// process just handed back rather than assumed from "the call returned".
function captureShortcutSaveStatus(environment: YomuGamingEnvironment): { text: string; tone: SettingsShellState['statusTone'] } {
    if (environment.hotkeyError) return { text: environment.hotkeyError, tone: 'warning' };
    if (environment.hotkeyRegistered) return { text: `Capture shortcut saved: ${hotkeyLabel()}.`, tone: 'success' };
    return { text: 'Try another key to use the keyboard.', tone: 'warning' };
}

function applyShellView(): void {
    const shell = appRoot.querySelector<HTMLElement>('.yomu-gaming-shell');
    if (shell) shell.dataset.shellView = shellState.view;
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-home]').forEach(element => {
        element.hidden = shellState.view !== 'home';
    });
    appRoot.querySelectorAll<HTMLElement>('[data-yomu-gaming-settings]').forEach(element => {
        element.hidden = shellState.view !== 'settings';
    });
}

function showView(view: ShellView, settingsPanel?: string): void {
    shellState.view = view;
    if (view === 'settings' && settingsPanel) {
        shellState.settingsPanel = settingsPanel;
        const form = appRoot.querySelector<HTMLFormElement>('[data-yomu-gaming-settings]');
        if (form) activateSettingsPanel(form, settingsPanel);
    }
    applyShellView();
    appRoot.querySelector<HTMLElement>(shellViewFocusSelector(view, settingsPanel))?.focus();
}

function shellViewFocusSelector(view: ShellView, settingsPanel?: string): string {
    const selector: Record<ShellView, string> = {
        home: shellState.settings.learningTargetChosen
            ? '[data-action="instant-capture"]'
            : '[data-action="choose-target"]',
        settings: settingsPanel === TARGET_SETTINGS_PANEL
            ? 'select[name="targetLanguage"]'
            : '[data-action="close-settings"]',
    };
    return selector[view];
}

function showTargetSettings(): void {
    showView('settings', TARGET_SETTINGS_PANEL);
}

// The overlay lives in its own window, so its Settings button leaves the view it wants in
// shared storage rather than adding a push channel to the hardened preload. If the main
// window never wakes to read it, the request simply expires and Home stays put.
function requestView(view: ShellView, settingsPanel?: string): void {
    try {
        localStorage.setItem(GAMING_PENDING_VIEW_STORAGE_KEY, JSON.stringify({ view, settingsPanel, at: Date.now() }));
    } catch {
        // A locked storage context just means the app opens on Home.
    }
}

function watchForRequestedView(): void {
    const consume = () => {
        const requested = consumeRequestedView();
        if (requested) showView(requested.view, requested.settingsPanel);
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
    if (!isRecentRequest(stored.at)) return null;
    if (!isShellView(stored.view)) return null;
    return {
        view: stored.view,
        settingsPanel: typeof stored.settingsPanel === 'string' ? stored.settingsPanel : undefined,
    };
}

function isRecentRequest(at: unknown): at is number {
    if (typeof at !== 'number') return false;
    return Date.now() - at < GAMING_PENDING_VIEW_MAX_AGE_MS;
}

function isShellView(value: unknown): value is ShellView {
    return value === 'home' || value === 'settings';
}

// The main process detects the platform, display server, and whether this looks
// like a Steam Deck / gamescope session. Surface that instead of silently dropping
// it: a Deck-in-Game-Mode player needs to know the overlay is controller-driven,
// and a Wayland/gamescope user needs to know global capture may need a portal grant.
function updateSessionGuidance(): void {
    const note = sessionGuidanceText(shellState.environment);
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-session-note]').forEach(element => {
        element.textContent = note?.text ?? '';
        element.hidden = !note;
        if (note) element.dataset.sessionTone = note.tone;
    });
}

function sessionGuidanceText(environment: YomuGamingEnvironment | null): { text: string; tone: 'info' | 'warning' } | null {
    if (!environment) return null;
    const wayland = /wayland/i.test(environment.displayServer);
    const parts: string[] = [];
    let tone: 'info' | 'warning' = 'info';
    if (environment.isSteamDeckSession) {
        parts.push(wayland
            ? 'Steam Deck detected (Wayland/gamescope). Map the capture shortcut to a Deck button in Steam Input, then use the D-pad to move between words, A to look up, B to close. If capture is blank, allow screen sharing when the portal asks.'
            : 'Steam Deck detected. Map the capture shortcut to a Deck button in Steam Input; navigate the overlay with the D-pad (A looks up, B closes).');
        if (wayland) tone = 'warning';
    } else if (environment.platform === 'linux' && wayland) {
        parts.push('Running under Wayland. Global screen capture uses the desktop portal — allow screen sharing when prompted. A controller can also drive the overlay (D-pad + A/B).');
    }
    // Multi-monitor players need to know which screen answers the shortcut. Say it once,
    // and only when there is more than one.
    if (environment.displayCount > 1) {
        parts.push(`${environment.displayCount} displays detected. Yomu reads the screen your pointer is on.`);
    }
    return parts.length ? { text: parts.join(' '), tone } : null;
}

// Settings is a place you go, so it gets its own way back and its own status line —
// otherwise a save or a snapshot restore reported itself onto a surface you are not on.
function installGamingSettingsHeader(form: HTMLFormElement): void {
    const head = form.querySelector<HTMLElement>('.jpdb-reader-settings-head');
    if (!head || head.querySelector('[data-action="close-settings"]')) return;
    const back = document.createElement('button');
    back.className = 'jpdb-reader-btn yomu-gaming-settings-back';
    back.type = 'button';
    back.dataset.action = 'close-settings';
    back.textContent = 'Back';
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

// The shared Settings form has a compatibility profile so an old install can still be
// normalized, but that profile is not a first-run choice. Gaming adds the same empty,
// required state as the reader onboarding and only removes it after a real select change.
function installGamingTargetChoice(form: HTMLFormElement, language = shellState.settings.interfaceLanguage): void {
    const select = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]');
    if (!select) return;
    if (shellState.settings.learningTargetChosen) return;
    const placeholder = gamingTargetPlaceholder(select);
    placeholder.textContent = uiText(language, 'gamingChooseTargetAction');
    placeholder.selected = true;
    select.value = '';
    select.required = true;
    select.setAttribute('aria-required', 'true');
}

function gamingTargetPlaceholder(select: HTMLSelectElement): HTMLOptionElement {
    const existing = select.querySelector<HTMLOptionElement>('[data-gaming-target-placeholder]');
    if (existing) return existing;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.dataset.gamingTargetPlaceholder = 'true';
    select.prepend(placeholder);
    return placeholder;
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
        <div class="jpdb-reader-help" data-gaming-window-parking hidden></div>
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

function installNativeSettingsSyncSection(form: HTMLFormElement): void {
    const panel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup');
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
    panel.insertBefore(section, directChildAnchor(panel, actions) ?? panel.firstChild);
}

function directChildAnchor(parent: HTMLElement, descendant: HTMLElement | null): Element | null {
    if (!descendant) return null;
    return [...parent.children].find(child => child === descendant || child.contains(descendant)) ?? null;
}

function bindSettingsForm(form: HTMLFormElement): void {
    form.addEventListener('submit', event => {
        event.preventDefault();
        persistSettingsFromForm(form);
        setShellStatus('Settings saved.', 'success');
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
            showView('home');
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
    form.addEventListener('change', event => handleSettingsChange(form, event));
    form.addEventListener('input', event => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (target.matches('[data-settings-search]')) return;
        if (target.matches('[data-capture-shortcut-input]')) return;
        // A target select emits `input` immediately before `change`. Its change
        // handler persists and re-renders the shell, so a delayed write retaining
        // this detached form would be able to overwrite the fresh settings state.
        if (target.matches('select[name="targetLanguage"]')) return;
        scheduleSettingsPersist(form);
    });
}

function handleSettingsChange(form: HTMLFormElement, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-capture-shortcut-input]')) return;
    const targetSelect = target.closest<HTMLSelectElement>('select[name="targetLanguage"]');
    if (targetSelect) {
        void persistLearningTargetChoice(form, targetSelect);
        return;
    }
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

function bindGamingHomeActions(form: HTMLFormElement): void {
    appRoot.querySelector<HTMLElement>('[data-gaming-home]')
        ?.addEventListener('click', event => handleGamingHomeClick(form, event));
}

function handleGamingHomeClick(form: HTMLFormElement, event: MouseEvent): void {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (!action) return;
    event.preventDefault();
    const actions: Record<string, () => void> = {
        'choose-target': showTargetSettings,
        'instant-capture': () => startCaptureOverlay(form, 'instant'),
        'area-capture': () => startCaptureOverlay(form, 'area'),
        'open-settings': () => showView('settings', DEFAULT_SETTINGS_PANEL),
    };
    actions[action]?.();
}

async function persistLearningTargetChoice(form: HTMLFormElement, select: HTMLSelectElement): Promise<void> {
    if (!selectedLearningTarget(select)) return;
    const firstChoice = !shellState.settings.learningTargetChosen;
    shellState.settings = normalizeReaderSettings({
        ...readFormSettings(new FormData(form), shellState.settings),
        learningTargetChosen: true,
    });
    persistGamingSettings(shellState.settings);
    if (!await confirmMainProcessTargetChoice()) return;
    shellState.view = firstChoice ? 'home' : 'settings';
    setShellStatus('', 'idle');
    renderShell();
}

async function confirmMainProcessTargetChoice(): Promise<boolean> {
    try {
        await bridge.setLearningTargetChosen(true);
        return true;
    } catch (error) {
        setShellStatus(error instanceof Error ? error.message : 'Could not enable capture yet.', 'error');
        return false;
    }
}

function selectedLearningTarget(select: HTMLSelectElement): string | null {
    const selected = learningTargetRosterIdForTag(select.value);
    if (!selected) return null;
    if (select.selectedOptions[0]?.disabled) return null;
    return selected;
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

function startCaptureOverlay(form: HTMLFormElement, mode: YomuGamingCaptureMode): void {
    persistSettingsFromForm(form);
    if (!shellState.settings.learningTargetChosen) {
        setShellStatus(uiText(shellState.settings.interfaceLanguage, 'gamingTargetRequired'), 'warning');
        showTargetSettings();
        return;
    }
    setShellStatus(mode === 'instant' ? 'Reading your screen.' : 'Choose an area to read.', 'busy');
    void bridge.setLearningTargetChosen(true)
        .then(() => bridge.hideApp())
        .then(() => bridge.showOverlay(mode))
        .catch(error => setShellStatus(error instanceof Error ? error.message : 'Could not start capture.', 'error'));
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
        renderShell();
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
    localizeGamingTargetChoice(language);
    applyGamingSettingsCopy(form);
    installGamingTargetChoice(form, language);
    hideUnsupportedSettingsActions(form);
    syncOcrProviderFields(form);
}

function localizeGamingTargetChoice(language: InterfaceLanguage): void {
    const home = appRoot.querySelector<HTMLElement>('[data-gaming-home][data-target-choice-required="true"]');
    if (!home) return;
    home.lang = languageAttribute(language);
    home.querySelector<HTMLElement>('[data-gaming-target-title]')
        ?.replaceChildren(uiText(language, 'gamingChooseTargetTitle'));
    home.querySelector<HTMLElement>('[data-gaming-target-body]')
        ?.replaceChildren(uiText(language, 'gamingChooseTargetBody'));
    home.querySelector<HTMLElement>('[data-action="choose-target"]')
        ?.replaceChildren(uiText(language, 'gamingChooseTargetAction'));
    home.querySelector<HTMLElement>('[data-action="open-settings"]')
        ?.replaceChildren(uiText(language, 'settings'));
}

function applyGamingSettingsCopy(form: HTMLFormElement): void {
    form.querySelector<HTMLElement>('[data-popup-lookup-title]')?.replaceChildren('Game use');
    form.querySelector<HTMLElement>('[data-hover-lookup-title]')?.replaceChildren('Capture shortcut');
    replaceControlLabel(form, 'scanModifierKey', 'Scan modifier');
    replaceControlLabel(form, 'shortcuts.scanPage', 'Manual page scan shortcut');
    replaceControlLabel(form, 'shortcuts.scanImages', 'Read browser images now');
    replaceControlLabel(form, 'shortcuts.hoverLookup', 'Scan modifier key');
    const readerHelp = form.querySelector<HTMLElement>('#settings-help-reader');
    if (readerHelp) {
        readerHelp.textContent = 'Use Yomu in games without changing browser-reader habits.';
    }
    const ocrHelp = form.querySelector<HTMLElement>('#settings-help-ocr');
    if (ocrHelp) {
        ocrHelp.textContent = 'Yomu Gaming reads captures with Google Lens by default. Advanced local OCR is optional when you want an offline endpoint.';
    }
    const localHelp = form.querySelector<HTMLElement>('[data-local-ocr][data-help-key="ocrLocalHelp"]');
    if (localHelp) {
        localHelp.textContent = 'Advanced native path: connect a compatible local OCR service only when you want offline capture OCR.';
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
    appRoot.querySelectorAll<HTMLElement>('[data-settings-save-status]').forEach(element => {
        element.textContent = '';
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
    });
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-shell-status]').forEach(element => {
        element.textContent = status;
        element.dataset.statusTone = tone;
        // Nothing to report is its own good news: the hero stays a single clean message.
        element.hidden = !status;
    });
}

// Re-renders every surface that speaks about the shortcut from the current environment,
// so the hero and the settings field can never drift into telling different stories.
function updateCaptureShortcutCopy(): void {
    const ready = captureShortcutReady();
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-shortcut-line]').forEach(element => {
        element.dataset.shortcutReady = String(ready);
        element.innerHTML = captureShortcutLineHtml();
    });
    appRoot.querySelectorAll<HTMLInputElement>('[data-capture-shortcut-input]').forEach(element => {
        element.value = hotkeyLabel();
    });
    appRoot.querySelectorAll<HTMLElement>('[data-capture-shortcut-help]').forEach(element => {
        element.textContent = CAPTURE_SHORTCUT_HELP;
    });
    const parkingHint = windowParkingHintText();
    appRoot.querySelectorAll<HTMLElement>('[data-gaming-window-parking]').forEach(element => {
        element.textContent = parkingHint;
        element.hidden = !parkingHint;
    });
}

function hotkeyLabel(): string {
    // Same helper the tray uses, so the menu-bar item and the settings screen never
    // disagree about what the capture shortcut is called.
    return captureShortcutLabel(shellState.environment?.hotkey ?? '', shellState.environment?.platform ?? '');
}

// Where the app goes when its window closes. Written by the same module the tray is
// built from, so the menu-bar item and this line can never disagree.
function windowParkingHintText(): string {
    return gamingWindowParkingHint({
        hasTray: Boolean(shellState.environment?.trayActive),
        platform: shellState.environment?.platform ?? '',
    });
}


function currentOverlayCaptureMode(): YomuGamingCaptureMode {
    if (new URLSearchParams(location.search).get('captureMode') === 'area') return 'area';
    return location.hash === '#overlay-area' ? 'area' : 'instant';
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
    // The compatibility profile exists even on a fresh install, but it is not
    // learner intent. Only an explicitly chosen target may become runtime state.
    adoptChosenGamingTarget(settings);
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
    // Selection must take effect in this renderer before its next OCR request or
    // reader boot; waiting for another window or launch leaves the overlay inert.
    adoptChosenGamingTarget(settings);
    localStorage.setItem(GAMING_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    syncMainProcessTargetChoice(settings);
    if (settings.ocrProvider === 'local-service' && settings.ocrEndpointUrl.trim()) {
        localStorage.setItem(PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, settings.ocrEndpointUrl);
        localStorage.setItem(PREVIOUS_OCR_ENGINE_STORAGE_KEY, settings.ocrEngine);
    }
}

function adoptChosenGamingTarget(settings: ReaderSettings): void {
    if (settings.learningTargetChosen) adoptLearningTargetFromSettings(settings);
}

function syncMainProcessTargetChoice(settings: ReaderSettings): void {
    void bridge.setLearningTargetChosen(settings.learningTargetChosen).catch(() => {
        // The main-process gate stays closed on IPC failure, so capture still fails safe.
    });
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

    constructor(private root: HTMLElement, private gamingBridge: YomuGamingBridge, private captureMode: YomuGamingCaptureMode) {
        installOverlayEscapeHandler(() => this.gamingBridge.hideOverlay());
        this.gamepad.start();
        this.watchOcrLineLayout();
        // The overlay window is hidden and reused, not destroyed — without
        // this the gamepad rAF poller would keep running after dismissal.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.gamepad.stop();
            else this.gamepad.start();
        });
    }

    // The reader may render words either anchored in place (geometry OCR) or inside
    // the compact caption (text-only OCR). Both are valid gamepad targets.
    private gamepadWordTargets(): HTMLElement[] {
        return gamingOcrWordTargets(this.root);
    }

    // B mirrors Escape: close the reader popover if one is open, otherwise close the
    // whole overlay. The reader owns Escape for its own popover, so dispatch that first.
    private handleGamepadBack(): void {
        if (document.querySelector('.jpdb-reader-popover')) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return;
        }
        void this.gamingBridge.hideOverlay();
    }

    // "Settings" here must land on Settings, not on the app's home screen.
    private openSettings(): void {
        if (!this.settings.learningTargetChosen) {
            this.openTargetSettings();
            return;
        }
        requestView('settings');
        void this.gamingBridge.showApp().then(() => this.gamingBridge.hideOverlay());
    }

    private openTargetSettings(): void {
        requestView('settings', TARGET_SETTINGS_PANEL);
        void this.gamingBridge.showApp().then(() => this.gamingBridge.hideOverlay());
    }

    render(): void {
        const targetChoiceRequired = this.targetChoiceRequired();
        this.ensureTargetChoiceResult(targetChoiceRequired);
        this.root.innerHTML = this.overlayShellHtml(targetChoiceRequired);
        this.bind();
        layoutOverlayOcrLines(this.root, this.ocrFrame(), this.settings.ocrFontScale);
        this.gamepad.reconcileFocus();
        this.startOnce(targetChoiceRequired);
    }

    private targetChoiceRequired(): boolean {
        return !this.settings.learningTargetChosen;
    }

    private ensureTargetChoiceResult(targetChoiceRequired: boolean): void {
        if (!targetChoiceRequired || this.result) return;
        this.result = targetChoiceRequiredResult(this.settings.interfaceLanguage);
    }

    private overlayShellHtml(targetChoiceRequired: boolean): string {
        return `
            <main class="overlay-shell" data-yomu-gaming-ready="true" data-yomu-gaming-overlay-ready="true" data-overlay-mode="${this.overlayMode()}" data-capture-mode="${this.captureMode}" data-overlay-busy="${this.busy}">
                ${overlayBackdropHtml(this.capture)}
                ${overlayToolbarHtml(!targetChoiceRequired)}
                ${this.overlayStatusFragment()}
                ${this.overlayHintFragment(targetChoiceRequired)}
                ${this.overlaySelectionFragment()}
                ${this.overlayResultFragment()}
            </main>
        `;
    }

    private overlayStatusFragment(): string {
        return this.busy ? overlayStatusHtml(this.overlayInstruction()) : '';
    }

    private overlayHintFragment(targetChoiceRequired: boolean): string {
        if (targetChoiceRequired) return '';
        if (this.captureMode !== 'area') return '';
        return this.overlayMode() === 'idle' ? overlayHintHtml() : '';
    }

    private overlaySelectionFragment(): string {
        if (!this.selection) return '';
        if (this.result) return '';
        return overlaySelectionHtml(this.selection);
    }

    private overlayResultFragment(): string {
        if (!this.result) return '';
        return overlayResultHtml(this.result, this.selection, this.settings.interfaceLanguage);
    }

    private startOnce(targetChoiceRequired: boolean): void {
        if (this.started) return;
        this.started = true;
        if (targetChoiceRequired) return;
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
        if (this.blockForTargetChoice()) {
            this.render();
            return;
        }
        try {
            this.capture = await this.gamingBridge.getFrozenCapture();
        } catch (error) {
            this.result = captureErrorResult(error);
            this.render();
            return;
        }
        if (this.captureMode === 'instant') {
            await this.readCapture(null);
            return;
        }
        this.render();
    }

    private bind(): void {
        const shell = this.root.querySelector<HTMLElement>('.overlay-shell');
        shell?.addEventListener('pointerdown', event => {
            if (this.captureMode !== 'area' || this.busy) return;
            if ((event.target as HTMLElement).closest('button, a, .overlay-status, .overlay-result, .overlay-inline-layer, .overlay-toolbar')) return;
            this.start = { x: event.clientX, y: event.clientY };
            this.selection = null;
            this.result = null;
            shell.setPointerCapture(event.pointerId);
            this.root.querySelector('.overlay-hint')?.remove();
            this.updateLiveSelection(shell, { left: event.clientX, top: event.clientY, width: 0, height: 0 });
        });
        shell?.addEventListener('pointermove', event => {
            if (this.captureMode !== 'area' || !this.start) return;
            this.selection = normalizedViewportSelection(this.start, { x: event.clientX, y: event.clientY });
            this.updateLiveSelection(shell, this.selection);
        });
        shell?.addEventListener('pointerup', event => {
            if (this.captureMode !== 'area' || !this.start) return;
            this.selection = normalizedViewportSelection(this.start, { x: event.clientX, y: event.clientY });
            this.start = null;
            void this.readSelection();
        });
        this.root.querySelectorAll<HTMLButtonElement>('[data-action="overlay-done"]').forEach(button => button.addEventListener('click', () => {
            void this.gamingBridge.hideOverlay();
        }));
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-recapture"]')?.addEventListener('click', () => {
            void this.recapture();
        });
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-settings"]')?.addEventListener('click', () => {
            this.openSettings();
        });
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-choose-target"]')?.addEventListener('click', () => {
            this.openTargetSettings();
        });
        this.root.querySelector<HTMLButtonElement>('[data-action="overlay-open-screen-settings"]')?.addEventListener('click', () => {
            void this.gamingBridge.openScreenSettings();
        });
    }

    // Direct style mutation during the drag avoids rebuilding the whole overlay DOM
    // (and re-binding every listener) on every pointermove frame.
    private updateLiveSelection(shell: HTMLElement, rect: YomuGamingSelectionRect): void {
        let element = shell.querySelector<HTMLElement>('.overlay-selection');
        if (!element) {
            element = document.createElement('div');
            element.className = 'overlay-selection';
            shell.appendChild(element);
        }
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
    }

    private async recapture(): Promise<void> {
        this.settings = loadGamingSettings();
        if (this.blockForTargetChoice()) {
            this.render();
            return;
        }
        this.selection = null;
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
        if (this.captureMode === 'instant') {
            await this.readCapture(null);
            return;
        }
        this.render();
    }

    private overlayInstruction(): string {
        if (this.busy) return this.captureMode === 'instant' ? 'Reading screen' : 'Reading selection';
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

    private async readCapture(selection: YomuGamingSelectionRect | null): Promise<void> {
        const prepared = await this.prepareCaptureRead(selection);
        if (!prepared) return;
        this.beginCaptureRead();
        const result = await this.recognizeCapture(prepared);
        this.finishCaptureRead(result);
    }

    private async prepareCaptureRead(selection: YomuGamingSelectionRect | null): Promise<PreparedGamingCapture | null> {
        this.settings = loadGamingSettings();
        if (!this.captureSettingsReady()) return null;
        const capture = await this.captureForRead();
        if (!capture) return null;
        return { capture, selection: this.captureSelectionForRead(capture, selection) };
    }

    private captureSettingsReady(): boolean {
        if (this.blockForTargetChoice()) {
            this.render();
            return false;
        }
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

    private captureSelectionForRead(
        capture: YomuGamingCaptureSource,
        selection: YomuGamingSelectionRect | null,
    ): YomuGamingSelectionRect | null {
        // Resolve the drag against the frame the player selected, before either
        // rendering or awaiting can move the native window.
        return selection
            ? captureSelectionFromViewport(selection, capture.size, this.ocrFrame())
            : null;
    }

    private beginCaptureRead(): void {
        this.busy = true;
        this.result = null;
        this.render();
    }

    private async recognizeCapture(prepared: PreparedGamingCapture): Promise<OverlayResult> {
        try {
            const crop = await cropSelection(prepared.capture, prepared.selection);
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

    private blockForTargetChoice(): boolean {
        if (this.settings.learningTargetChosen) return false;
        this.busy = false;
        this.selection = null;
        this.result = targetChoiceRequiredResult(this.settings.interfaceLanguage);
        return true;
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
    if (!gaming.learningTargetChosen) return;
    overlayReaderBootInFlight = true;
    bootOverlayReader(overlayReaderSettings(gaming));
}

function overlayReaderSettings(gaming: ReaderSettings): ReaderSettings {
    // Over a game the cursor moves constantly, so default to click-to-read ("invisible
    // till clicked"). Hover lookup only turns on if the player set a hold-key modifier in
    // the gaming onboarding, in which case hover requires that key (never bare hover).
    const hoverModifier = gaming.shortcuts.hoverLookup.trim();
    return normalizeReaderSettings({
        ...gaming,
        ocrEnabled: false,
        ocrAutoScanImages: false,
        showFloatingButton: false,
        annotationsPaused: false,
        manualScanEnabled: false,
        lookupOnClick: true,
        lookupOnHover: Boolean(hoverModifier),
        corsProxyUrl: gaming.corsProxyUrl.trim(),
    });
}

function bootOverlayReader(settings: ReaderSettings): void {
    void Promise.resolve()
        .then(() => bootReaderAppWithStartupSettings(settings))
        .then(initialized => {
            overlayReaderBooted = initialized;
            if (!initialized) console.warn('Yomu Gaming could not start the inline reader.');
        })
        .catch(error => {
            overlayReaderBooted = false;
            console.warn('Yomu Gaming could not start the inline reader.', error);
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

export function gamingTargetChoiceError(
    settings: Pick<ReaderSettings, 'learningTargetChosen' | 'interfaceLanguage'>,
): string {
    return settings.learningTargetChosen ? '' : uiText(settings.interfaceLanguage, 'gamingTargetRequired');
}

function targetChoiceRequiredResult(language: InterfaceLanguage): OverlayResult {
    return {
        text: '',
        terms: [],
        error: uiText(language, 'gamingTargetRequired'),
        errorAction: 'target-settings',
    };
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

async function cropSelection(capture: YomuGamingCaptureSource, selection: YomuGamingSelectionRect | null): Promise<GamingCaptureCrop> {
    const image = await loadImage(capture.thumbnailDataUrl);
    if (selection && (selection.width <= 2 || selection.height <= 2)) {
        throw new Error('Drag over the captured picture.');
    }
    const sourceRect = selection ?? { left: 0, top: 0, width: image.naturalWidth, height: image.naturalHeight };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceRect.width));
    canvas.height = Math.max(1, Math.round(sourceRect.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, sourceRect.left, sourceRect.top, sourceRect.width, sourceRect.height, 0, 0, canvas.width, canvas.height);
    return {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        sourceRect,
        sourceSize: { width: image.naturalWidth, height: image.naturalHeight },
    };
}

function overlayBackdropHtml(capture: YomuGamingCaptureSource | null): string {
    if (!capture?.thumbnailDataUrl) return '';
    return `<img class="overlay-backdrop" src="${escapeHtml(capture.thumbnailDataUrl)}" alt="" aria-hidden="true" draggable="false">`;
}

function overlayToolbarHtml(captureReady = true): string {
    return `<div class="overlay-toolbar" role="toolbar" aria-label="Yomu Gaming overlay">
        <strong>よむ</strong>
        ${captureReady ? '<button type="button" data-action="overlay-recapture" title="Capture the screen again">Re-capture</button>' : ''}
        <button type="button" data-action="overlay-settings" title="Open Yomu Gaming settings">Settings</button>
        <button type="button" data-action="overlay-done" aria-label="Close overlay">Close</button>
    </div>`;
}

function overlayHintHtml(): string {
    return `<div class="overlay-hint" role="note">Drag a box over the text to read it.</div>`;
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

function overlayResultHtml(
    result: OverlayResult,
    selection: YomuGamingSelectionRect | null,
    language: InterfaceLanguage,
): string {
    if (result.lines?.length) return overlayInlineResultHtml(result);
    const style = overlayResultStyle(selection);
    if (result.error) {
        return `<section class="overlay-result" style="${style}" role="alert">
            <strong>${escapeHtml(result.error)}</strong>
            ${overlayErrorTextHtml(result.text)}
            ${overlayErrorActionsHtml(result.errorAction, language)}
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

function overlayErrorActionsHtml(action: OverlayResult['errorAction'], language: InterfaceLanguage): string {
    const primary = action === 'screen-settings'
        ? '<button type="button" class="overlay-action-primary" data-action="overlay-open-screen-settings">Open Screen Recording settings</button>'
        : action === 'target-settings'
            ? `<button type="button" class="overlay-action-primary" data-action="overlay-choose-target">${escapeHtml(uiText(language, 'gamingChooseTargetAction'))}</button>`
            : '<button type="button" data-action="overlay-settings">Settings</button>';
    const retry = action === 'target-settings'
        ? ''
        : '<button type="button" data-action="overlay-recapture">Try again</button>';
    return `<div class="overlay-actions">${primary}${retry}<button type="button" data-action="overlay-done">Close</button></div>`;
}

function overlayInlineResultHtml(result: OverlayResult): string {
    return overlayNormalizedOcrLayerHtml(result.lines ?? []);
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
            hotkeyError: 'Shortcuts work in the Yomu Gaming app.',
            screenAccess: 'unsupported',
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
        setLearningTargetChosen: async () => undefined,
        onTargetChoiceRequired: () => () => undefined,
    };
}
