/** Capture the uncovered desktop; never infer window ownership from OCR coordinates. */
export interface CaptureWindow {
    isDestroyed(): boolean;
    isVisible(): boolean;
    hide(): void;
    showInactive(): void;
}

export async function withHiddenCaptureWindows<T>(
    windows: readonly CaptureWindow[],
    settle: () => Promise<void>,
    capture: () => Promise<T>,
    keepHidden?: CaptureWindow | null,
): Promise<T> {
    const visible = windows.filter(window => !window.isDestroyed() && window.isVisible());
    for (const window of visible) window.hide();
    try {
        if (visible.length) await settle();
        return await capture();
    } finally {
        for (const window of visible) {
            if (!window.isDestroyed() && window !== keepHidden) window.showInactive();
        }
    }
}
