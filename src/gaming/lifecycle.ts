// Yomu Gaming is a hotkey utility: the capture shortcut is the app, and a window is only
// ever a view onto it. This module owns the policies that keep that coherent — the
// overlay-only capture boundary, the tray item that stays reachable while every window is
// away, and what closing a window means. All stay free of `electron` imports so the rules
// can be unit-tested.

export const GAMING_OVERLAY_CAPTURE_REQUIRED = 'Screen capture is only available to the Yomu Gaming overlay.';

/**
 * The URL of a new overlay document for one capture.
 *
 * The overlay's renderer reads the frozen frame once per document, so every capture needs a
 * new document. loadURL() to the URL a window is already showing — the same capture mode
 * twice in a row, which is every press of the shortcut — is a same-document fragment
 * navigation, not a load: the overlay kept the session's first frame and its words on every
 * later press, and only its own Re-capture button read the screen again. A per-capture value
 * in the query makes each capture a real load.
 */
export function overlayDocumentUrl(base: URL, capture: number): string {
    const url = new URL(base.toString());
    url.searchParams.set('captureMode', 'instant');
    url.searchParams.set('capture', String(capture));
    url.hash = 'overlay-instant';
    return url.toString();
}

// One run at a time: a call made while the previous run is still going joins it instead of
// starting a second one. A capture hides and re-shows Yomu's windows and samples the
// display, so two overlapping presses (a double tap, a held key's auto-repeat) would race
// each other for the same windows and could freeze a frame with the overlay still on it.
export function singleFlight(run: () => Promise<void>): () => Promise<void> {
    let inFlight: Promise<void> | null = null;
    return () => {
        inFlight ??= run().finally(() => {
            inFlight = null;
        });
        return inFlight;
    };
}

export interface OverlayCaptureRequest<T> {
    senderId: number;
    overlayRendererId: number | null;
    capture(): Promise<T>;
}

// Frozen-frame IPC is deliberately narrower than the shared preload bridge: only the
// live overlay may read it. Keeping the callback behind that check means even a direct
// invoke cannot sample a display as a side effect of discovering that access should have
// been denied.
export async function runOverlayCapture<T>(request: OverlayCaptureRequest<T>): Promise<T> {
    if (request.overlayRendererId === null || request.senderId !== request.overlayRendererId) {
        throw new Error(GAMING_OVERLAY_CAPTURE_REQUIRED);
    }
    return request.capture();
}

export interface GamingTrayStatus {
    shortcutLabel: string;
    shortcutRegistered: boolean;
}

export interface GamingTrayActions {
    readScreen(): void;
    openSettings(): void;
    quit(): void;
}

export interface GamingTrayMenuItem {
    label?: string;
    type?: 'separator';
    click?: () => void;
}

export interface GamingTrayImage {
    isEmpty(): boolean;
    resize(options: { width: number; height: number }): GamingTrayImage;
}

export interface GamingTrayItem {
    setToolTip(tooltip: string): void;
    setContextMenu(menu: unknown): void;
    on(event: string, listener: () => void): void;
    destroy(): void;
}

export interface GamingTrayHost {
    platform: string;
    iconPath: string;
    createImage(iconPath: string): GamingTrayImage;
    createTray(image: GamingTrayImage): GamingTrayItem;
    buildMenu(template: GamingTrayMenuItem[]): unknown;
    reportError?(error: unknown): void;
}

export interface GamingTrayController {
    refresh(status: GamingTrayStatus): void;
    destroy(): void;
}

// Menu-bar scale: 16pt on macOS/Windows, 22px for the larger Linux status area.
const TRAY_ICON_SIZE_PX = 16;
const TRAY_ICON_SIZE_LINUX_PX = 22;

export type GamingWindowCloseIntent = 'close' | 'hide' | 'quit';

export interface GamingLifecycleState {
    quitting: boolean;
    hasTray: boolean;
    platform: string;
}

// The single decision that used to be split across `hide()`, `window-all-closed`, and
// nothing at all — so closing the settings window either quit the app (taking the global
// shortcut with it) or left a hidden overlay holding the process open with no way back.
export function windowCloseIntent(state: GamingLifecycleState): GamingWindowCloseIntent {
    // A quit is already under way; blocking this close would cancel it.
    if (state.quitting) return 'close';
    // There is a tray item (or, on macOS, a dock icon) to reopen from, so park the app.
    if (state.hasTray || state.platform === 'darwin') return 'hide';
    // Nothing left to reopen from: end the session cleanly rather than linger unreachable.
    return 'quit';
}

// Where Yomu goes when its window is closed. Shown in Settings so parking the window reads
// as a move the user can undo, and so the way back is named. Empty when there is no tray,
// because then closing the window ends the session instead.
export function gamingWindowParkingHint(state: Pick<GamingLifecycleState, 'hasTray' | 'platform'>): string {
    if (!state.hasTray) return '';
    return state.platform === 'darwin'
        ? 'Close this window and Yomu waits in the menu bar.'
        : 'Close this window and Yomu waits in the system tray.';
}

function gamingTrayCaptureLabel(status: GamingTrayStatus): string {
    return status.shortcutRegistered && status.shortcutLabel
        ? `Read screen (${status.shortcutLabel})`
        : 'Read screen';
}

export function gamingTrayTooltip(status: GamingTrayStatus): string {
    return status.shortcutRegistered && status.shortcutLabel
        ? `Yomu Gaming — ${status.shortcutLabel} reads the screen`
        : 'Yomu Gaming — pick a capture shortcut in Settings';
}

export function gamingTrayMenuTemplate(actions: GamingTrayActions, status: GamingTrayStatus): GamingTrayMenuItem[] {
    return [
        { label: gamingTrayCaptureLabel(status), click: () => actions.readScreen() },
        { label: 'Settings', click: () => actions.openSettings() },
        { type: 'separator' },
        { label: 'Quit Yomu Gaming', click: () => actions.quit() },
    ];
}

// Returns null when this desktop gives us no tray at all; callers must keep a window-based
// way out in that case rather than assume the tray is there.
export function createGamingTray(
    host: GamingTrayHost,
    actions: GamingTrayActions,
    status: GamingTrayStatus,
): GamingTrayController | null {
    let item: GamingTrayItem | null = null;
    try {
        const image = trayIconImage(host);
        if (!image) return null;
        const tray = host.createTray(image);
        item = tray;
        const controller: GamingTrayController = {
            refresh(next) {
                tray.setToolTip(gamingTrayTooltip(next));
                tray.setContextMenu(host.buildMenu(gamingTrayMenuTemplate(actions, next)));
            },
            destroy() {
                tray.destroy();
            },
        };
        controller.refresh(status);
        // macOS pops the context menu on a plain click already; elsewhere a click is the
        // quickest way back to the window.
        if (host.platform !== 'darwin') {
            tray.on('click', () => actions.openSettings());
            tray.on('double-click', () => actions.openSettings());
        }
        return controller;
    } catch (error) {
        host.reportError?.(error);
        try {
            item?.destroy();
        } catch {
            // The tray never came up; there is nothing to tear down.
        }
        return null;
    }
}

function trayIconImage(host: GamingTrayHost): GamingTrayImage | null {
    const image = host.createImage(host.iconPath);
    if (image.isEmpty()) return null;
    const size = host.platform === 'linux' ? TRAY_ICON_SIZE_LINUX_PX : TRAY_ICON_SIZE_PX;
    const resized = image.resize({ width: size, height: size });
    return resized.isEmpty() ? image : resized;
}
