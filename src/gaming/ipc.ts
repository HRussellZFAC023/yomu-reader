export const YOMU_GAMING_CHANNELS = {
    getEnvironment: 'yomu-gaming:get-environment',
    listCaptureSources: 'yomu-gaming:list-capture-sources',
    captureSource: 'yomu-gaming:capture-source',
    capturePrimaryScreen: 'yomu-gaming:capture-primary-screen',
    requestOcr: 'yomu-gaming:request-ocr',
    showOverlay: 'yomu-gaming:show-overlay',
    hideOverlay: 'yomu-gaming:hide-overlay',
    completeOverlayCapture: 'yomu-gaming:complete-overlay-capture',
    overlayCaptureCompleted: 'yomu-gaming:overlay-capture-completed',
    showApp: 'yomu-gaming:show-app',
    hideApp: 'yomu-gaming:hide-app',
    openExternal: 'yomu-gaming:open-external',
    updateCaptureShortcut: 'yomu-gaming:update-capture-shortcut',
    syncSettingsSnapshot: 'yomu-gaming:sync-settings-snapshot',
    restoreSettingsSnapshot: 'yomu-gaming:restore-settings-snapshot',
} as const;

export interface YomuGamingEnvironment {
    platform: string;
    displayServer: string;
    desktop: string;
    isSteamDeckSession: boolean;
    isPackaged: boolean;
    hotkey: string;
    hotkeyRegistered: boolean;
    hotkeyError?: string;
}

export interface YomuGamingImageSize {
    width: number;
    height: number;
}

export interface YomuGamingSelectionRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface YomuGamingCaptureSource {
    id: string;
    name: string;
    kind: 'screen' | 'window' | 'unknown';
    displayId: string;
    thumbnailDataUrl: string;
    size: YomuGamingImageSize;
    selection?: YomuGamingSelectionRect;
}

export interface YomuGamingCaptureRequest {
    sourceId: string;
    width?: number;
    height?: number;
}

export interface YomuGamingOcrRequest {
    endpointUrl: string;
    imageDataUrl: string;
    width: number;
    height: number;
    engine: string;
    language: string;
}

export interface YomuGamingOcrResponse {
    ok: boolean;
    status: number;
    body: unknown;
    error?: string;
}

export type YomuGamingCaptureMode = 'instant' | 'area';

export interface YomuGamingSettingsSnapshot {
    version: 1;
    syncedAt: string;
    settings: unknown;
}

export interface YomuGamingSettingsSyncMetadata {
    syncedAt: string;
    storagePath: string;
}

export interface YomuGamingBridge {
    getEnvironment(): Promise<YomuGamingEnvironment>;
    listCaptureSources(): Promise<YomuGamingCaptureSource[]>;
    captureSource(request: YomuGamingCaptureRequest): Promise<YomuGamingCaptureSource>;
    capturePrimaryScreen(): Promise<YomuGamingCaptureSource>;
    requestOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse>;
    showOverlay(mode?: YomuGamingCaptureMode): Promise<void>;
    hideOverlay(): Promise<void>;
    completeOverlayCapture(capture: YomuGamingCaptureSource): Promise<void>;
    showApp(): Promise<void>;
    hideApp(): Promise<void>;
    openExternal(url: string): Promise<void>;
    updateCaptureShortcut(shortcut: string): Promise<YomuGamingEnvironment>;
    syncSettingsSnapshot(settings: unknown): Promise<YomuGamingSettingsSyncMetadata>;
    restoreSettingsSnapshot(): Promise<YomuGamingSettingsSnapshot | null>;
    onOverlayCaptureCompleted(callback: (capture: YomuGamingCaptureSource) => void): () => void;
}
