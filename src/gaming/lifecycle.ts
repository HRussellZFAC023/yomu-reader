// Yomu Gaming is a hotkey utility: the capture shortcut is the app, and a window is only
// ever a view onto it. This module owns the policies that keep that coherent — target
// readiness before capture, the tray item that stays reachable while every window is
// away, and what closing a window means. All stay free of `electron` imports so the rules
// can be unit-tested.

export interface TargetGatedCapture {
    learningTargetChosen: boolean;
    capture(): Promise<void>;
    chooseTarget(): Promise<void>;
}

export const GAMING_TARGET_CHOICE_REQUIRED = 'Choose the language you want to read before capturing your screen.';
export const GAMING_OVERLAY_CAPTURE_REQUIRED = 'Screen capture is only available to the Yomu Gaming overlay.';
export const GAMING_TARGET_CHOICE_SENDER_REQUIRED = 'Learning target choice is only accepted from the Yomu Gaming settings window.';

// The OS shortcut and tray can reach main before the renderer has a target. Keep the
// positive choice check in front of the callback that samples the display, not merely in
// the overlay that receives the already-sampled image.
export async function runTargetGatedCapture(request: TargetGatedCapture): Promise<'captured' | 'target-required'> {
    if (!request.learningTargetChosen) {
        await request.chooseTarget();
        return 'target-required';
    }
    await request.capture();
    return 'captured';
}

export interface OverlayCaptureRequest<T> {
    learningTargetChosen: boolean;
    senderId: number;
    overlayRendererId: number | null;
    capture(): Promise<T>;
}

// Frozen-frame IPC is deliberately narrower than the shared preload bridge: only the
// live overlay may read it, and only after main has received a positive target choice.
// Keeping the callback behind both checks means even a direct invoke cannot sample a
// display as a side effect of discovering that access should have been denied.
export async function runOverlayCapture<T>(request: OverlayCaptureRequest<T>): Promise<T> {
    if (!request.learningTargetChosen) throw new Error(GAMING_TARGET_CHOICE_REQUIRED);
    if (request.overlayRendererId === null || request.senderId !== request.overlayRendererId) {
        throw new Error(GAMING_OVERLAY_CAPTURE_REQUIRED);
    }
    return request.capture();
}

export interface LearningTargetChoiceUpdate {
    chosen: boolean;
    senderId: number;
    mainRendererId: number | null;
    apply(chosen: boolean): void;
}

// Both windows receive the same deliberately small preload bridge. Only the settings
// window reads the persisted target choice, so the overlay must never be able to grant
// itself capture access by invoking that shared setter.
export function applyMainRendererTargetChoice(request: LearningTargetChoiceUpdate): void {
    if (request.mainRendererId === null || request.senderId !== request.mainRendererId) {
        throw new Error(GAMING_TARGET_CHOICE_SENDER_REQUIRED);
    }
    request.apply(request.chosen);
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
